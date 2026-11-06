import Foundation

public enum InputMode: String, Codable, CaseIterable, Sendable {
    case photo, source
    public var label: String { self == .photo ? "Foto" : "Quelltext" }
}

public struct SourceQuestion: Codable, Sendable {
    public let id: String
    public let order: Int
    public let questionText: String
    public let kind: QuestionKind
    public let requiredSelectionCount: Int?
    public let options: [AnswerOption]
}

public struct SourceDocument: Codable, Sendable {
    public let url: String
    public let title: String
    public let questions: [SourceQuestion]
    public let error: String?

    public static let missingQuestion = "Im Quelltext wurde keine vollständig auslesbare Frage gefunden. Öffne die Fragen im Browser oder wähle den Modus Foto."

    public func validate() throws {
        if let error = error?.nonEmpty { throw HelperError(error) }
        guard let url = URL(string: url), ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
              url.host != nil, url.user == nil, url.password == nil else {
            throw HelperError("Dieser Browser-Tab ist keine unterstützte Webseite.")
        }
        guard !questions.isEmpty else { throw HelperError(Self.missingQuestion) }
        guard questions.count <= 30, Set(questions.map(\.id)).count == questions.count,
              questions.map(\.order) == Array(1...questions.count) else {
            throw HelperError("Die Fragen im Quelltext sind nicht eindeutig zugeordnet.")
        }
        for question in questions {
            guard question.questionText.nonEmpty != nil, question.id.nonEmpty != nil,
                  [.single_choice, .multiple_choice].contains(question.kind),
                  (2...100).contains(question.options.count),
                  question.options.map(\.position) == Array(1...question.options.count),
                  Set(question.options.map(\.id)).count == question.options.count,
                  question.options.allSatisfy({ $0.id.nonEmpty != nil && $0.text.nonEmpty != nil }) else {
                throw HelperError("Frage \(question.order) oder ihre Antwortoptionen sind im Quelltext nicht vollständig lesbar. Bitte Foto verwenden.")
            }
            if let count = question.requiredSelectionCount {
                guard count > 0, count <= question.options.count,
                      question.kind != .single_choice || count == 1 else {
                    throw HelperError("Die Auswahlvorgabe im Quelltext ist widersprüchlich.")
                }
            }
        }
        guard try JSONEncoder().encode(self).count <= 100_000 else {
            throw HelperError("Der Fragenbereich ist zu groß. Bitte eine einzelne Quizseite öffnen.")
        }
    }

    /// An index is only useful when it still refers to the actual option on the page.
    public func validate(answer: AnalysisAnswer) throws {
        guard ![.no_question, .unreadable].contains(answer.status), !answer.questions.isEmpty else {
            throw HelperError(Self.missingQuestion)
        }
        guard answer.questions.count == questions.count else {
            throw HelperError("Die Antwort deckt nicht alle Fragen aus dem Quelltext ab. Bitte erneut versuchen.")
        }
        for (source, result) in zip(questions, answer.orderedQuestions) {
            guard source.id == result.id, source.order == result.order,
                  source.questionText == result.questionText, source.kind == result.kind,
                  source.requiredSelectionCount == result.requiredSelectionCount,
                  source.options.count == result.options.count else {
                throw HelperError("Die Modellantwort passt nicht zu den Fragen des Browser-Tabs.")
            }
            for (option, returned) in zip(source.options, result.options.sorted(by: { $0.position < $1.position })) {
                guard option.id == returned.id, option.position == returned.position, option.text == returned.text else {
                    throw HelperError("Die Antwortindizes passen nicht zu den Optionen im Browser-Tab.")
                }
            }
        }
    }
}

public enum AnalysisInput: Sendable {
    case photo(Data)
    case source(SourceDocument)
    public var mode: InputMode {
        switch self { case .photo: return .photo; case .source: return .source }
    }
}

public enum BrowserScripts {
    public static func extractor() throws -> String {
        guard let url = Bundle.module.url(forResource: "extract-questions", withExtension: "js") else {
            throw HelperError("Die Browser-Anbindung fehlt im App-Bundle. Bitte neu bauen.")
        }
        return try String(contentsOf: url, encoding: .utf8)
    }
    public static let chromiumBundleIDs = ["com.google.Chrome", "com.google.Chrome.beta", "com.google.Chrome.canary", "com.microsoft.edgemac", "com.brave.Browser"]
    public static func supports(_ bundleID: String) -> Bool {
        chromiumBundleIDs.contains(bundleID) || bundleID == "com.apple.Safari"
    }
    public static func source(bundleID: String, javascript: String) throws -> String {
        guard supports(bundleID) else { throw HelperError("Quelltext unterstützt Chrome, Safari, Edge und Brave. Bitte einen dieser Browser fokussieren oder Foto wählen.") }
        let escaped = javascript.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\r", with: "\\r").replacingOccurrences(of: "\n", with: "\\n")
        let tab = bundleID == "com.apple.Safari" ? "current tab" : "active tab"
        let identity = bundleID == "com.apple.Safari" ? "index" : "id"
        let execute = bundleID == "com.apple.Safari" ? "do JavaScript \"\(escaped)\" in chosenTab" : "execute chosenTab javascript \"\(escaped)\""
        return """
        with timeout of 15 seconds
            if application id "\(bundleID)" is not running then error "Der Browser wurde geschlossen."
            tell application id "\(bundleID)"
                if (count of windows) is 0 then error "Kein Browserfenster geöffnet."
                set chosenWindow to front window
                set chosenWindowID to id of chosenWindow
                set chosenTab to \(tab) of chosenWindow
                set chosenTabID to \(identity) of chosenTab
                set chosenURL to URL of chosenTab
                set sourceJSON to \(execute)
                if id of front window is not chosenWindowID then error "Browserfenster während der Erfassung gewechselt."
                if \(identity) of \(tab) of front window is not chosenTabID then error "Browser-Tab während der Erfassung gewechselt."
                if URL of \(tab) of front window is not chosenURL then error "Browser-Tab während der Erfassung gewechselt."
                return sourceJSON
            end tell
        end timeout
        """
    }
}
