import Foundation

public enum ResultStatus: String, Codable, Sendable { case ok, partial, no_question, unreadable }
public enum QuestionKind: String, Codable, Sendable {
    case single_choice, multiple_choice, free_text, unknown
    public var label: String {
        switch self {
        case .single_choice: return "Einfachauswahl"
        case .multiple_choice: return "Mehrfachauswahl"
        case .free_text: return "Freitext"
        case .unknown: return "Auswahlart unklar"
        }
    }
}
public enum AnswerStatus: String, Codable, Sendable { case answerable, uncertain, needs_more_context }

public struct AnswerOption: Codable, Identifiable, Sendable {
    public let id: String
    public let visibleLabel: String?
    public let position: Int
    public let text: String
    public let isSelected: Bool?
    public var label: String { visibleLabel?.nonEmpty ?? "Option \(position)" }
}
public struct TextAnswer: Codable, Identifiable, Sendable {
    public let fieldId: String
    public let fieldLabel: String
    public let answer: String
    public var id: String { fieldId }
}
public struct QuestionAnswer: Codable, Identifiable, Sendable {
    public let id: String
    public let order: Int
    public let visibleLabel: String?
    public let questionText: String
    public let language: String
    public let kind: QuestionKind
    public let requiredSelectionCount: Int?
    public let options: [AnswerOption]
    public let selectedOptionIds: [String]
    public let textAnswers: [TextAnswer]
    public let explanation: String
    public let status: AnswerStatus
    public let issues: [String]

    public var title: String { visibleLabel?.nonEmpty ?? "Frage \(order)" }
    public var selectedOptions: [AnswerOption] {
        options.filter { selectedOptionIds.contains($0.id) }.sorted { $0.position < $1.position }
    }
    public var compactLine: String {
        let value: String
        if status == .needs_more_context { value = "Nicht beantwortbar" }
        else if status == .uncertain { value = "Unsicher" }
        else if kind == .free_text { value = "Mehr Infos" }
        else { value = selectedOptions.map { String($0.position) }.joined(separator: "/") }
        return "Frage \(order): \(value)"
    }
    public var answerText: String {
        guard status != .needs_more_context else { return "" }
        let lines = selectedOptions.map { "\($0.label) · \($0.text)" }
            + textAnswers.map { "\($0.fieldLabel): \($0.answer)" }
        return lines.joined(separator: "\n")
    }
    public func copyText(explanation includeExplanation: Bool) -> String {
        guard !answerText.isEmpty else { return "" }
        var parts = ["\(title): \(questionText)"]
        if status == .uncertain { parts.append("Unsicherer Vorschlag") }
        parts.append(answerText)
        if includeExplanation && !explanation.isEmpty { parts.append(explanation) }
        if status == .uncertain { parts.append(contentsOf: issues) }
        return parts.joined(separator: "\n\n")
    }
}
public struct AnalysisAnswer: Codable, Sendable {
    public let schemaVersion: Int
    public let status: ResultStatus
    public let questions: [QuestionAnswer]
    public let issues: [String]
    public var orderedQuestions: [QuestionAnswer] { questions.sorted { $0.order < $1.order } }
    public func copyText(explanation: Bool) -> String {
        orderedQuestions.map { $0.copyText(explanation: explanation) }
            .filter { !$0.isEmpty }.joined(separator: "\n\n—\n\n")
    }
}

public struct HelperError: LocalizedError, Equatable, Sendable {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { message }
}
extension String {
    public var nonEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

public enum AnswerValidator {
    public static func validate(_ answer: AnalysisAnswer) throws {
        func require(_ condition: Bool, _ reason: String) throws {
            if !condition { throw HelperError("Ungültige Modellantwort: \(reason)") }
        }
        try require(answer.schemaVersion == 1, "unbekannte Schemaversion.")
        try require(answer.questions.count <= 30, "zu viele Fragen in einer Aufnahme.")
        try require(Set(answer.questions.map(\.id)).count == answer.questions.count, "doppelte Fragenkennung.")
        try require(Set(answer.questions.map(\.order)).count == answer.questions.count, "mehrdeutige Reihenfolge.")
        if [.no_question, .unreadable].contains(answer.status) {
            try require(answer.questions.isEmpty && !answer.issues.isEmpty, "Hinweis zur Aufnahme fehlt.")
            return
        }
        try require(!answer.questions.isEmpty, "keine Fragen enthalten.")
        for q in answer.questions {
            try require(q.id.nonEmpty != nil && q.order > 0, "Fragenkennung fehlt.")
            try require(q.questionText.nonEmpty != nil, "Fragetext fehlt.")
            try require(q.options.count <= 100, "zu viele Optionen.")
            let ids = q.options.map(\.id)
            try require(Set(ids).count == ids.count, "doppelte Option.")
            try require(Set(q.options.map(\.position)).count == q.options.count, "doppelte Optionsposition.")
            try require(q.options.allSatisfy { $0.id.nonEmpty != nil && $0.position > 0 && $0.text.nonEmpty != nil }, "leere Option.")
            try require(Set(q.selectedOptionIds).count == q.selectedOptionIds.count, "doppelte Auswahl.")
            try require(q.selectedOptionIds.allSatisfy { ids.contains($0) }, "unbekannte Option ausgewählt.")
            try require(Set(q.textAnswers.map(\.fieldId)).count == q.textAnswers.count, "mehrdeutige Lücken.")
            try require(q.textAnswers.allSatisfy { $0.fieldId.nonEmpty != nil && $0.fieldLabel.nonEmpty != nil && $0.answer.nonEmpty != nil }, "Feldzuordnung fehlt.")
            if let count = q.requiredSelectionCount { try require(count > 0, "ungültige Antwortanzahl.") }
            if q.status != .answerable { try require(!q.issues.isEmpty, "Begründung der Unsicherheit fehlt.") }
            if q.status == .needs_more_context {
                try require(q.selectedOptionIds.isEmpty && q.textAnswers.isEmpty, "Auswahl trotz fehlender Informationen.")
                continue
            }
            try require(q.explanation.nonEmpty != nil, "Begründung fehlt.")
            switch q.kind {
            case .single_choice:
                try require(q.selectedOptionIds.count == 1 && q.textAnswers.isEmpty, "Einfachauswahl benötigt eine Antwort.")
                try require(q.requiredSelectionCount == nil || q.requiredSelectionCount == 1, "widersprüchliche Auswahlart.")
            case .multiple_choice:
                try require(!q.selectedOptionIds.isEmpty && q.textAnswers.isEmpty, "Mehrfachauswahl enthält keine Optionen.")
                if let count = q.requiredSelectionCount { try require(q.selectedOptionIds.count == count, "vorgegebene Antwortanzahl nicht erfüllt.") }
            case .free_text:
                try require(q.selectedOptionIds.isEmpty && !q.textAnswers.isEmpty && q.requiredSelectionCount == nil, "Freitext nicht zugeordnet.")
            case .unknown:
                throw HelperError("Ungültige Modellantwort: Auswahlart unklar; bitte Frage vollständig aufnehmen.")
            }
        }
        if answer.status == .ok {
            try require(answer.questions.allSatisfy { $0.status == .answerable }, "Gesamtstatus passt nicht zu den Fragen.")
        }
    }
}
