import Testing
import Foundation
@testable import HelperCore

struct SourceTests {
    let helpers = HelperCoreTests()
    func source(question: [String: Any]? = nil) throws -> SourceDocument {
        let q = question ?? helpers.question()
        let keys = ["id", "order", "questionText", "kind", "requiredSelectionCount", "options"]
        let sourceQuestion = q.filter { keys.contains($0.key) }
        return try JSONDecoder().decode(SourceDocument.self, from: JSONSerialization.data(withJSONObject: [
            "url": "https://learning.sap.com/test", "title": "Quiz", "questions": [sourceQuestion], "error": NSNull()
        ]))
    }
    @Test func sourceRequestHasOnlyTextAndPreservesOptions() throws {
        let config = try APIConfiguration(baseURL: "http://localhost:6655/openai/v1", model: "test", token: "")
        let request = try HyperspaceClient().request(input: .source(source()), configuration: config)
        let payload = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        let content = (payload["input"] as! [[String: Any]])[0]["content"] as! [[String: Any]]
        #expect(content.count == 1)
        #expect(content[0]["type"] as? String == "input_text")
        let decoded = try JSONDecoder().decode(SourceDocument.self, from: Data((content[0]["text"] as! String).utf8))
        #expect(decoded.questions[0].options.map(\.position) == [1,2,3])
    }
    @Test func absentQuestionFailsBeforeRequest() throws {
        let empty = try JSONDecoder().decode(SourceDocument.self, from: Data(#"{"url":"https://example.com","title":"Empty","questions":[],"error":null}"#.utf8))
        let config = try APIConfiguration(baseURL: "https://example.com", model: "test", token: "")
        #expect(throws: (any Error).self) { try HyperspaceClient().request(input: .source(empty), configuration: config) }
    }
    @Test func sourceRejectsIncompleteOptionsAndBrowserErrors() throws {
        var q = helpers.question(); q["options"] = []
        #expect(throws: (any Error).self) { try source(question: q).validate() }
        let error = try JSONDecoder().decode(SourceDocument.self, from: Data(#"{"url":"https://example.com","title":"Error","questions":[],"error":"Frage nicht zugänglich"}"#.utf8))
        #expect(throws: (any Error).self) { try error.validate() }
    }
    @Test func sourceRejectsInventedOrMissingQuestionsAndRenumbering() throws {
        let document = try source()
        let valid = try helpers.decode(helpers.question())
        try document.validate(answer: valid)
        var changed = helpers.question(); changed["questionText"] = "Invented question"
        #expect(throws: (any Error).self) { try document.validate(answer: helpers.decode(changed)) }
        changed = helpers.question(); var options = changed["options"] as! [[String: Any]]
        options.swapAt(0, 1); options[0]["position"] = 1; options[1]["position"] = 2; changed["options"] = options
        #expect(throws: (any Error).self) { try document.validate(answer: helpers.decode(changed)) }
        let empty = try HyperspaceClient.decode(helpers.envelope(helpers.result([], status: "no_question", issues: ["Keine Frage"])))
        #expect(throws: (any Error).self) { try document.validate(answer: empty) }
    }
    @Test func compactResultsContainOnlyQuestionNumberAndOptionPositions() throws {
        let answer = try helpers.decode(helpers.question())
        #expect(answer.questions[0].compactLine == "Frage 1: 2/3")
        let single = try helpers.decode(helpers.question(kind: "single_choice", selected: ["b"]))
        #expect(single.questions[0].compactLine == "Frage 1: 2")
        let uncertain = try helpers.decode(helpers.question(status: "uncertain"), status: "partial")
        #expect(uncertain.questions[0].compactLine == "Frage 1: Unsicher")
        let missing = try helpers.decode(helpers.question(selected: [], status: "needs_more_context"), status: "partial")
        #expect(missing.questions[0].compactLine == "Frage 1: Nicht beantwortbar")
    }
    @Test func browserScriptsUseTheChosenBrowserAndCheckTabIdentity() throws {
        let chrome = try BrowserScripts.source(bundleID: "com.google.Chrome", javascript: "JSON.stringify({x: \"quote\\line\"})")
        #expect(chrome.contains("execute chosenTab javascript"))
        #expect(chrome.contains("id of active tab of front window is not chosenTabID"))
        let safari = try BrowserScripts.source(bundleID: "com.apple.Safari", javascript: "document.title")
        #expect(safari.contains("do JavaScript"))
        #expect(safari.contains("index of current tab of front window is not chosenTabID"))
        #expect(throws: (any Error).self) { try BrowserScripts.source(bundleID: "arbitrary.app", javascript: "") }
    }
}
