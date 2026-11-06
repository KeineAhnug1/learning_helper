import AppKit
import SwiftUI
import HelperCore

@MainActor final class AppModel: ObservableObject {
    let settings = SettingsStore()
    let captureService = CaptureService()
    private let browserSourceReader = BrowserSourceReader()
    private let client = HyperspaceClient()
    private var gate = AnalysisGate()
    private var work: Task<Void, Never>?
    private var lastInput: AnalysisInput?
    private var lastConfiguration: APIConfiguration?
    @Published private(set) var phase = "Bereit"
    @Published private(set) var busy = false
    @Published private(set) var answer: AnalysisAnswer?
    @Published private(set) var capture: CapturedImage?
    @Published private(set) var sourceDocument: SourceDocument?
    @Published private(set) var activeMode: InputMode = .photo
    @Published private(set) var error: String?
    @Published private(set) var detail = ""
    @Published private(set) var testReport = ""
    var showResult: (() -> Void)?
    var showDetails: (() -> Void)?
    var showSettings: (() -> Void)?
    var hideWindows: (() -> Void)?
    var changed: (() -> Void)?
    var lastApplicationPID: pid_t?
    var canRetry: Bool { !busy && error != nil && lastInput != nil && lastConfiguration != nil }

    func analyze(inputMode: InputMode? = nil, mode: CaptureMode? = nil, previewOnly: Bool = false) {
        guard !busy else { showResult?(); return }
        let front = NSWorkspace.shared.frontmostApplication
        let pid = front?.processIdentifier == ProcessInfo.processInfo.processIdentifier ? lastApplicationPID : front?.processIdentifier
        let browserID = pid.flatMap { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier }
        let selectedMode: InputMode = previewOnly ? .photo : (inputMode ?? settings.inputMode)
        let captureMode = mode ?? settings.captureMode, display = settings.displayID
        guard let id = begin(selectedMode == .photo ? "Foto wird aufgenommen …" : "Quelltext wird gelesen …") else { return }
        activeMode = selectedMode
        hideWindows?()
        showResult?()
        let config: APIConfiguration?
        do {
            if !previewOnly && !settings.saved { throw HelperError("Bitte zuerst die Verbindung in den Einstellungen speichern.") }
            config = previewOnly ? nil : try settings.configuration()
        } catch { failed(error, id: id); return }
        work = Task { [weak self] in
            guard let self else { return }
            do {
                if selectedMode == .source {
                    guard let browserID, BrowserScripts.supports(browserID) else {
                        throw HelperError("Bitte einen Tab in Chrome, Safari, Edge oder Brave fokussieren und erneut klicken.")
                    }
                    let source = try await browserSourceReader.read(bundleID: browserID)
                    try Task.checkCancellation()
                    guard gate.accepts(id), let config else { return }
                    sourceDocument = source
                    let input = AnalysisInput.source(source)
                    lastInput = input; lastConfiguration = config
                    try await send(input, config: config, id: id)
                    return
                }
                // Let our windows leave the compositor before capturing.
                try await Task.sleep(nanoseconds: 200_000_000)
                let image = try await captureService.capture(mode: captureMode, displayID: display, applicationPID: pid)
                try Task.checkCancellation()
                guard gate.accepts(id) else { return }
                capture = image
                showResult?()
                guard let config else {
                    phase = "Lokale Aufnahmevorschau"
                    detail = "Dieses Bild wurde nicht gesendet."
                    finish(id); showDetails?(); return
                }
                phase = "Bild wird vorbereitet …"
                let data = try await Task.detached(priority: .userInitiated) {
                    try ImagePreprocessor.png(image.image, maxBytes: config.maxImageBytes)
                }.value
                try Task.checkCancellation()
                guard gate.accepts(id) else { return }
                let input = AnalysisInput.photo(data)
                lastInput = input; lastConfiguration = config
                try await send(input, config: config, id: id)
            } catch { failed(error, id: id) }
        }
    }
    func retry() {
        guard canRetry, let input = lastInput, let config = lastConfiguration,
              let id = gate.begin() else { return }
        busy = true; error = nil; answer = nil; phase = "Wird analysiert …"; changed?(); showResult?()
        work = Task { [weak self] in
            guard let self else { return }
            do { try await send(input, config: config, id: id) }
            catch { failed(error, id: id) }
        }
    }
    private func send(_ input: AnalysisInput, config: APIConfiguration, id: UUID) async throws {
        phase = "Wird analysiert …"
        detail = "\(config.model) · Abbrechen ist jederzeit möglich"
        let response = try await client.analyze(input: input, configuration: config)
        try Task.checkCancellation()
        guard gate.accepts(id) else { return }
        if [.no_question, .unreadable].contains(response.answer.status) {
            throw HelperError(input.mode == .source ? SourceDocument.missingQuestion : "Im Foto wurde keine lesbare Frage gefunden. Bitte die vollständige Frage aufnehmen.")
        }
        answer = response.answer
        phase = "Analyse abgeschlossen"
        detail = "\(config.model) · \(String(format: "%.1f", response.seconds)) s · Modellvorschlag"
        finish(id)
    }
    func testConnection(configuration: APIConfiguration, fullCorpus: Bool = false) {
        guard let id = begin(fullCorpus ? "Bildkorpus wird geprüft …" : "Verbindung wird geprüft …") else { showResult?(); return }
        showResult?()
        work = Task { [weak self] in
            guard let self else { return }
            do {
                let models = try await client.models(configuration: configuration)
                guard gate.accepts(id) else { return }
                guard models.contains(configuration.model) else { throw HelperError("Das konfigurierte Modell fehlt in der Modellliste. Bitte ein verfügbares Modell wählen.") }
                testReport = "Modellliste und Authentifizierung: erfolgreich.\n"
                let fixtures = try FixtureSpec.load()
                let selected = fullCorpus ? Array(fixtures.enumerated()) : Array(fixtures.prefix(2).enumerated())
                let repetitions = fullCorpus ? 2 : 1
                var failures = 0
                for run in 1...repetitions {
                    for (index, fixture) in selected {
                        try Task.checkCancellation()
                        guard gate.accepts(id) else { return }
                        phase = "Bild \(index + 1)/\(selected.count) · Durchlauf \(run)/\(repetitions)"
                        let image = try FixtureRenderer.render(fixture)
                        let data = try ImagePreprocessor.png(image, maxBytes: configuration.maxImageBytes)
                        let response = try await client.analyze(image: data, configuration: configuration)
                        try Task.checkCancellation()
                        guard gate.accepts(id) else { return }
                        let matches = fixture.matches(response.answer)
                        if !matches { failures += 1 }
                        testReport += "\(fixture.id): \(matches ? "bestanden" : "abweichende Antwort") (\(String(format: "%.1f", response.seconds)) s)\n"
                    }
                }
                phase = failures == 0 ? "Bildtest bestanden" : "Bildtest mit Abweichungen"
                detail = "\(configuration.model) · \(configuration.outputMode.label) · \(selected.count * repetitions) künstliche Bilder, \(failures) Abweichungen. Kein Nachweis für alle Lernplattformen."
                finish(id)
            } catch { failed(error, id: id) }
        }
    }
    private func begin(_ text: String) -> UUID? {
        guard let id = gate.begin() else { return nil }
        answer = nil; error = nil; capture = nil; sourceDocument = nil; lastInput = nil; lastConfiguration = nil
        detail = ""; testReport = ""; phase = text; busy = true; changed?()
        return id
    }
    private func failed(_ failure: Error, id: UUID) {
        guard gate.accepts(id) else { return }
        if failure is CancellationError { cancel(); return }
        error = failure.localizedDescription; phase = "Analyse angehalten"; detail = ""
        finish(id); showResult?()
    }
    private func finish(_ id: UUID) {
        guard gate.finish(id) else { return }
        busy = false; work = nil; changed?()
    }
    func cancel() {
        gate.cancel(); work?.cancel(); work = nil; captureService.cancel()
        busy = false; phase = "Abgebrochen"; detail = ""; error = nil; answer = nil
        lastInput = nil; lastConfiguration = nil; capture = nil; sourceDocument = nil; changed?()
    }
    func discard() { cancel(); phase = "Bereit"; testReport = "" }
}
