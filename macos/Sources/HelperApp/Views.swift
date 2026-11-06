import AppKit
import SwiftUI
import HelperCore

// Select the property wrapper explicitly; macOS 27 also exports a State macro.
private typealias ViewState<Value> = SwiftUI.State<Value>

private let accent = Color(red: 0.13, green: 0.43, blue: 0.35)

struct ResultView: View {
    @ObservedObject var model: AppModel
    @ViewState private var showImage = false
    @ViewState private var copied = false
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "checkmark.bubble.fill").font(.system(size: 29)).foregroundStyle(accent)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Learning Helper").font(.headline)
                    Text(model.phase).font(.title3.weight(.semibold))
                }
                Spacer()
                if model.busy { ProgressView().controlSize(.small); Button("Abbrechen") { model.cancel() } }
                Button { model.showSettings?() } label: { Image(systemName: "gearshape") }.help("Einstellungen")
            }.padding(22)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if !model.detail.isEmpty { Text(model.detail).font(.callout).foregroundStyle(.secondary) }
                    if let error = model.error {
                        Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).textSelection(.enabled)
                        if model.activeMode == .photo && !CaptureService.hasPermission {
                            Button("Bildschirmaufnahme einrichten") { model.showSettings?() }
                        }
                    }
                    if let answer = model.answer {
                        if answer.status == .no_question { Text("Keine Lernfrage erkannt.").font(.title3) }
                        if answer.status == .unreadable { Text("Die Aufnahme ist nicht lesbar.").font(.title3) }
                        ForEach(Array(answer.issues.enumerated()), id: \.offset) { _, issue in Text(issue).foregroundStyle(.orange) }
                        ForEach(answer.orderedQuestions) { question in QuestionCard(question: question) }
                        if !answer.copyText(explanation: false).isEmpty {
                            Button(copied ? "Kopiert" : "Alle Antworten kopieren") {
                                copy(answer.copyText(explanation: false)); copied = true
                            }
                        }
                    }
                    if !model.testReport.isEmpty {
                        Text(model.testReport).font(.system(.callout, design: .monospaced)).textSelection(.enabled)
                        Button("Testprotokoll kopieren") { copy(model.detail + "\n" + model.testReport) }
                    }
                    if let capture = model.capture {
                        DisclosureGroup("Aufnahme ansehen · \(capture.label)", isExpanded: $showImage) {
                            Image(nsImage: NSImage(cgImage: capture.image, size: .zero)).resizable().scaledToFit()
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            Text(capture.capturedAt.formatted(date: .omitted, time: .standard)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if let source = model.sourceDocument {
                        Text("Quelltext · \(source.title)").font(.callout).foregroundStyle(.secondary)
                        Text(source.url).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                    }
                    if model.answer == nil && model.capture == nil && model.error == nil && !model.busy && model.testReport.isEmpty {
                        ContentUnavailableView("Eine Frage im Blick", systemImage: "viewfinder", description: Text("Lernfenster öffnen und auf das Symbol in der Menüleiste klicken."))
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(22)
            }
            Divider()
            HStack {
                Button("Neue Analyse") { copied = false; showImage = false; model.analyze() }.disabled(model.busy)
                    .buttonStyle(.borderedProminent).tint(accent)
                if model.canRetry { Button("Dieselbe Eingabe erneut versuchen") { model.retry() } }
                Spacer()
                Button("Verwerfen") { model.discard() }
            }.padding(18)
        }.frame(minWidth: 540, minHeight: 440)
    }
}

private struct QuestionCard: View {
    let question: QuestionAnswer
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(question.title).font(.headline)
                Spacer()
                Text(question.kind.label).font(.caption).padding(.horizontal, 9).padding(.vertical, 4).background(accent.opacity(0.1), in: Capsule())
            }
            Text(question.questionText).font(.body.weight(.medium)).textSelection(.enabled)
            if let count = question.requiredSelectionCount { Text("\(count) Antwort(en) gefragt").font(.caption).foregroundStyle(.secondary) }
            if question.status == .uncertain { Label("Unsicherer Vorschlag", systemImage: "questionmark.circle").foregroundStyle(.orange) }
            if question.status == .needs_more_context { Label("Weitere Informationen nötig", systemImage: "viewfinder").foregroundStyle(.orange) }
            ForEach(question.selectedOptions) { option in
                HStack(alignment: .top) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(accent)
                    Text("\(option.label) · \(option.text)").textSelection(.enabled)
                }
            }
            ForEach(question.textAnswers) { field in
                VStack(alignment: .leading, spacing: 4) {
                    Text(field.fieldLabel).font(.caption).foregroundStyle(.secondary)
                    Text(field.answer).textSelection(.enabled)
                }
            }
            if !question.explanation.isEmpty { Text(question.explanation).foregroundStyle(.secondary).textSelection(.enabled) }
            ForEach(Array(question.issues.enumerated()), id: \.offset) { _, issue in Text(issue).foregroundStyle(.orange) }
            if !question.answerText.isEmpty {
                HStack {
                    Button("Antwort kopieren") { copy(question.copyText(explanation: false)) }
                    Button("Mit Begründung") { copy(question.copyText(explanation: true)) }
                }.controlSize(.small)
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(accent.opacity(0.15)))
    }
}

@MainActor func copy(_ text: String) {
    guard !text.isEmpty else { return }
    NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string)
}

struct SettingsView: View {
    @ObservedObject var settings: SettingsStore
    @ObservedObject var model: AppModel
    var didSave: () -> Void
    @ViewState private var token = ""
    @ViewState private var message = ""
    @ViewState private var models: [String] = []
    @ViewState private var loadingModels = false
    @ViewState private var modelTask: Task<Void, Never>?
    @ViewState private var permission = CaptureService.hasPermission
    @ViewState private var screens = NSScreen.screens
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 7) {
                Text("Deine Lernfragen. Ein Klick.").font(.title2.bold())
                Text("Ein Klick sendet je nach Standardmodus ein Foto oder die Fragen aus dem fokussierten Browser-Tab. Das Ergebnis erscheint direkt unter dem Menüleistensymbol.")
                    .font(.callout).foregroundStyle(.secondary)
            }.padding(22)
            Form {
                Section("Standardmodus") {
                    Picker("Eingabe beim Klick", selection: $settings.inputMode) {
                        ForEach(InputMode.allCases, id: \.self) { Text($0.label).tag($0) }
                    }.pickerStyle(.segmented)
                }
                if settings.inputMode == .source {
                    Section("Quelltext einmalig einrichten") {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("1. JavaScript im Browser erlauben").font(.callout.weight(.semibold))
                            Text("Chrome öffnen. Ganz oben in der macOS-Menüleiste: Darstellung → Entwickler → JavaScript von Apple Events erlauben. Den Menüpunkt anhaken.")
                                .font(.callout)
                            Text("Gemeint ist die Menüleiste am oberen Bildschirmrand; der Punkt steht nicht in den Chrome-Einstellungen.")
                                .font(.caption).foregroundStyle(.secondary)
                            DisclosureGroup("Safari, Edge oder Brave") {
                                Text("Safari: Entwickler → JavaScript von Apple Events erlauben. Fehlt das Entwickler-Menü, unter Safari → Einstellungen → Erweitert die Funktionen für Webentwickler einschalten.\n\nEdge/Brave: im Menü Darstellung bzw. Ansicht → Entwickler nach JavaScript von Apple Events erlauben suchen. Englisch: View → Developer → Allow JavaScript from Apple Events.")
                                    .font(.callout).padding(.top, 4)
                            }
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            Text("2. Den ersten Browserzugriff auslösen").font(.callout.weight(.semibold))
                            Text("Unten Speichern klicken. Dann die Lernseite im Browser nach vorn holen und auf das Learning-Helper-Symbol in der Menüleiste klicken. Die macOS-Nachfrage zum Steuern des Browsers bestätigen.")
                                .font(.callout)
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            Text("3. Falls du den Zugriff abgelehnt hast").font(.callout.weight(.semibold))
                            Text("Systemeinstellungen → Datenschutz & Sicherheit → Automation öffnen. Learning Helper aufklappen und den Schalter für deinen Browser einschalten. Danach die Lernseite nach vorn holen und erneut auf das Helper-Symbol klicken.")
                                .font(.callout)
                            Button("Automation-Einstellungen öffnen") {
                                if !NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")!) {
                                    message = "Bitte Systemeinstellungen → Datenschutz & Sicherheit → Automation manuell öffnen."
                                }
                            }
                            DisclosureGroup("Learning Helper fehlt in der Liste?") {
                                Text("macOS legt den Eintrag erst nach einem Zugriffsversuch an. Du kannst ihn dort nicht manuell hinzufügen. Führe zuerst Schritt 2 aus.\n\nStarte Learning Helper.app per Doppelklick im Finder. Beim Start aus VS Code oder Terminal kann macOS den Browserzugriff stattdessen diesem Programm zuordnen.")
                                    .font(.callout).padding(.top, 4)
                            }
                        }
                        Text("Ohne vollständig lesbare Frage erscheint eine Fehlermeldung. Ein Foto wird nur gesendet, wenn du Foto als Eingabe wählst.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("Verbindung") {
                    TextField("Proxy-Basisadresse", text: $settings.baseURL)
                        .onChange(of: settings.baseURL) { _, _ in
                            token = ""; models = []; message = "Adresse geändert. Schlüssel dieser Verbindung neu laden oder eintragen."
                        }
                    TextField(settings.inputMode == .photo ? "Bildfähiges Modell" : "Modell", text: $settings.model)
                    SecureField("Zugangsschlüssel", text: $token)
                    HStack {
                        Button("Gespeicherten Schlüssel laden") { loadToken() }
                        Button(loadingModels ? "Lädt …" : "Modelle laden") { loadModels() }.disabled(loadingModels)
                    }
                    if !models.isEmpty {
                        Picker("Verfügbare Modelle", selection: $settings.model) {
                            if !models.contains(settings.model) { Text(settings.model.isEmpty ? "Bitte wählen" : settings.model).tag(settings.model) }
                            ForEach(models, id: \.self) { Text($0).tag($0) }
                        }
                    }
                    Picker("Antwortformat", selection: $settings.outputMode) {
                        ForEach(OutputMode.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Stepper("Zeitlimit: \(Int(settings.timeout)) Sekunden", value: $settings.timeout, in: 15...300, step: 15)
                    Stepper("Bildlimit: \(settings.maxImageMB) MB", value: $settings.maxImageMB, in: 1...40)
                }
                if settings.inputMode == .photo { Section("Foto") {
                    Picker("Standard", selection: $settings.captureMode) {
                        ForEach(CaptureMode.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Picker("Bildschirm für Bildschirm-/Bereichsmodus", selection: $settings.displayID) {
                        Text("Bildschirm am Mauszeiger").tag(UInt32(0))
                        ForEach(screens, id: \.self) { screen in
                            if let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value {
                                Text(screen.localizedName).tag(id)
                            }
                        }
                    }
                    HStack {
                        Label(permission ? "Bildschirmaufnahme freigegeben" : "Bildschirmaufnahme benötigt Freigabe", systemImage: permission ? "checkmark.circle" : "viewfinder")
                        Spacer()
                        Button("Erlauben") { CaptureService.requestPermission(); permission = CaptureService.hasPermission }
                        Button("Systemeinstellungen") { CaptureService.openPermissionSettings() }
                    }
                    Button("Lokale Aufnahmevorschau") { model.analyze(previewOnly: true) }.disabled(model.busy)
                } }
                Section("Bedienung") {
                    Toggle("Kurzbefehl ⌃⌥⌘L aktivieren", isOn: $settings.shortcutEnabled)
                }
                Section("Prüfen") {
                    Text("Der Bildtest sendet zwei künstliche Fragen. Der vollständige Korpus sendet 24 Bilder zweimal und kann mehrere Minuten dauern.")
                        .font(.caption).foregroundStyle(.secondary)
                    HStack {
                        Button("Verbindung und Bildanalyse testen") { test(full: false) }.disabled(model.busy)
                        Button("24 Bilder · 2 Durchläufe") { test(full: true) }.disabled(model.busy)
                    }
                }
            }.formStyle(.grouped)
            if !message.isEmpty { Text(message).font(.callout).foregroundStyle(.secondary).padding(.horizontal, 22).padding(.top, 8).textSelection(.enabled) }
            HStack {
                Text("Rechtsklick auf das Menüleistensymbol öffnet diese Einstellungen.").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Speichern") {
                    do { try settings.save(token: token); message = "Gespeichert. Öffne eine Lernfrage und klicke auf das Menüleistensymbol."; didSave() }
                    catch { message = error.localizedDescription }
                }.buttonStyle(.borderedProminent).tint(accent)
            }.padding(20)
        }.frame(width: 700, height: 760)
            .onAppear { loadToken(); permission = CaptureService.hasPermission; screens = NSScreen.screens }
            .onDisappear { modelTask?.cancel(); token = "" }
    }
    private func loadToken() {
        do { token = try KeychainStore.read(account: settings.keychainAccount) }
        catch { message = error.localizedDescription }
    }
    private func loadModels() {
        do {
            let config = try APIConfiguration(baseURL: settings.baseURL, model: settings.model.nonEmpty ?? "model-list", token: token)
            loadingModels = true; message = ""
            modelTask = Task { @MainActor in
                defer { loadingModels = false }
                do {
                    let found = try await HyperspaceClient().models(configuration: config)
                    try Task.checkCancellation(); models = found
                    message = "\(models.count) Modelle geladen. Bildunterstützung anschließend testen."
                } catch is CancellationError {} catch { message = error.localizedDescription }
            }
        } catch { message = error.localizedDescription }
    }
    private func test(full: Bool) {
        do { let config = try settings.configuration(token: token); model.testConnection(configuration: config, fullCorpus: full) }
        catch { message = error.localizedDescription }
    }
}
