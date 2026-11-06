import Foundation

public struct FixtureSpec: Codable, Sendable {
    public struct ExpectedQuestion: Codable, Sendable {
        public let kind: QuestionKind
        public let status: AnswerStatus
        public let selections: [String]
        public let textAnswers: [String]
    }
    public let id: String
    public let body: String
    public let dark: Bool
    public let fontSize: Int
    public let status: ResultStatus
    public let questions: [ExpectedQuestion]
    public static func load() throws -> [FixtureSpec] {
        guard let url = Bundle.module.url(forResource: "fixtures", withExtension: "json") else {
            throw HelperError("Die künstlichen Fragebilder fehlen im App-Bundle.")
        }
        return try JSONDecoder().decode([FixtureSpec].self, from: Data(contentsOf: url))
    }
    public func matches(_ answer: AnalysisAnswer) -> Bool {
        func normalize(_ value: String) -> String {
            value.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ").trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        }
        guard answer.status == status, answer.questions.count == questions.count else { return false }
        return zip(questions, answer.orderedQuestions).allSatisfy { expected, actual in
            expected.kind == actual.kind && expected.status == actual.status &&
            Set(expected.selections.map(normalize)) == Set(actual.selectedOptions.map { normalize($0.text) }) &&
            expected.textAnswers.map(normalize) == actual.textAnswers.map { normalize($0.answer) }
        }
    }
}
