import Testing
import Foundation
@testable import HelperCore

struct HelperCoreTests {
    func question(kind: String = "multiple_choice", selected: [String] = ["b", "c"], status: String = "answerable") -> [String: Any] {
        ["id": "q1", "order": 1, "visibleLabel": NSNull(), "questionText": "Welche Zahlen sind Primzahlen?",
         "language": "de", "kind": kind, "requiredSelectionCount": kind == "multiple_choice" ? 2 : NSNull(),
         "options": [
            ["id": "a", "visibleLabel": "A", "position": 1, "text": "4", "isSelected": true],
            ["id": "b", "visibleLabel": "B", "position": 2, "text": "2", "isSelected": false],
            ["id": "c", "visibleLabel": NSNull(), "position": 3, "text": "3", "isSelected": false]
         ], "selectedOptionIds": selected, "textAnswers": [], "explanation": "2 und 3 sind Primzahlen.",
         "status": status, "issues": status == "answerable" ? [] : ["Die Frage ist nicht eindeutig."]]
    }
    func result(_ questions: [[String: Any]], status: String = "ok", issues: [String] = []) -> [String: Any] {
        ["schemaVersion": 1, "status": status, "questions": questions, "issues": issues]
    }
    func envelope(_ answer: [String: Any], status: String = "completed") throws -> Data {
        let text = String(decoding: try JSONSerialization.data(withJSONObject: answer), as: UTF8.self)
        return try JSONSerialization.data(withJSONObject: ["status": status, "output": [
            ["type": "reasoning", "summary": []],
            ["type": "message", "content": [["type": "output_text", "text": text]]]
        ]])
    }
    func decode(_ question: [String: Any], status: String = "ok") throws -> AnalysisAnswer {
        try HyperspaceClient.decode(envelope(result([question], status: status)))
    }
    @Test func testMultipleChoiceAndCopyUseVisibleTexts() throws {
        let answer = try decode(question())
        #expect((answer.questions[0].selectedOptions.map(\.text)) == (["2", "3"]))
        let copied = answer.copyText(explanation: true)
        #expect(copied.contains("B · 2")); #expect(copied.contains("Option 3 · 3"))
        #expect(!(copied.contains("A · 4"))); #expect(copied.contains("Primzahlen."))
    }
    @Test func testSingleChoiceRejectsZeroOrMultipleSelections() throws {
        for selections in [[], ["b", "c"]] { #expect(throws: (any Error).self) { try decode(question(kind: "single_choice", selected: selections)) } }
        #expect(throws: Never.self) { try decode(question(kind: "single_choice", selected: ["b"])) }
    }
    @Test func testRejectsUnknownDuplicateAndWrongCountSelections() {
        for selected in [["b", "missing"], ["b", "b"], ["b"]] { #expect(throws: (any Error).self) { try decode(question(selected: selected)) } }
    }
    @Test func testMissingContextCannotSupplyAnswers() throws {
        #expect(throws: (any Error).self) { try decode(question(status: "needs_more_context"), status: "partial") }
        let answer = try decode(question(selected: [], status: "needs_more_context"), status: "partial")
        #expect((answer.copyText(explanation: false)) == (""))
    }
    @Test func testUncertaintySurvivesCopy() throws {
        let answer = try decode(question(status: "uncertain"), status: "partial")
        #expect(answer.copyText(explanation: false).contains("Unsicherer Vorschlag"))
        #expect(throws: (any Error).self) { try decode(question(status: "uncertain")) }
    }
    @Test func testUnknownTypeCannotClaimAnswerable() {
        #expect(throws: (any Error).self) { try decode(question(kind: "unknown")) }
    }
    @Test func testRequiresAllSchemaFieldsEvenNullableAndRejectsExtra() {
        var q = question(); q.removeValue(forKey: "visibleLabel")
        #expect(throws: (any Error).self) { try decode(q) }
        q = question(); q["toolCall"] = "submit"
        #expect(throws: (any Error).self) { try decode(q) }
        q = question(); q["order"] = true
        #expect(throws: (any Error).self) { try decode(q) }
    }
    @Test func testRejectsDuplicateQuestionsAndPositions() throws {
        #expect(throws: (any Error).self) { try HyperspaceClient.decode(envelope(result([question(), question()]))) }
        var q = question(); var options = q["options"] as! [[String: Any]]
        options[1]["position"] = 1; q["options"] = options
        #expect(throws: (any Error).self) { try decode(q) }
    }
    @Test func testFreeTextKeepsEachGapAssigned() throws {
        var q = question(kind: "free_text", selected: [])
        q["textAnswers"] = [["fieldId": "first", "fieldLabel": "Lücke 1", "answer": "5"], ["fieldId": "second", "fieldLabel": "Lücke 2", "answer": "8"]]
        let answer = try decode(q)
        #expect(answer.copyText(explanation: false).contains("Lücke 2: 8"))
        q["textAnswers"] = [["fieldId": "first", "fieldLabel": "Lücke 1", "answer": "5"], ["fieldId": "first", "fieldLabel": "Lücke 2", "answer": "8"]]
        #expect(throws: (any Error).self) { try decode(q) }
    }
    @Test func testNoQuestionAndUnreadableRequireExplanations() throws {
        for status in ["no_question", "unreadable"] {
            #expect(throws: Never.self) { try HyperspaceClient.decode(envelope(result([], status: status, issues: ["Keine lesbare Frage."])) ) }
            #expect(throws: (any Error).self) { try HyperspaceClient.decode(envelope(result([], status: status))) }
        }
    }
    @Test func testIncompleteRefusalAndSDKConvenienceFieldAreNotSuccess() throws {
        #expect(throws: (any Error).self) { try HyperspaceClient.decode(envelope(result([question()]), status: "incomplete")) }
        let refusal = try JSONSerialization.data(withJSONObject: ["status": "completed", "output": [["type": "message", "content": [["type": "refusal", "refusal": "no"]]]]])
        #expect(throws: (any Error).self) { try HyperspaceClient.decode(refusal) }
        #expect(throws: (any Error).self) { try HyperspaceClient.decode(Data(#"{"status":"completed","output_text":"not a REST output"}"#.utf8)) }
    }
    @Test func testConfigurationRestrictsCredentialsAndNonlocalHTTP() throws {
        for url in ["http://example.com/v1", "https://user:pass@example.com", "https://example.com/v1?key=secret", "file:///tmp"] {
            #expect(throws: (any Error).self) { try APIConfiguration(baseURL: url, model: "vision", token: "") }
        }
        let c = try APIConfiguration(baseURL: "http://localhost:6655/openai/v1/", model: "vision", token: "test")
        #expect((c.endpoint.absoluteString) == ("http://localhost:6655/openai/v1/responses"))
        #expect(throws: (any Error).self) { try APIConfiguration(baseURL: "https://example.com", model: "", token: "") }
    }
    @Test func testRequestCarriesImageAndStrictSchemaWithoutTools() throws {
        let c = try APIConfiguration(baseURL: "https://example.com/v1", model: "vision", token: "test")
        let image = Data([137,80,78,71,13,10,26,10,0])
        let request = try HyperspaceClient().request(image: image, configuration: c)
        #expect((request.value(forHTTPHeaderField: "Authorization")) == ("Bearer test"))
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        #expect((body["store"] as? Bool) == (false)); #expect((body["tools"]) == nil)
        #expect((body["text"]) != nil)
        let input = body["input"] as! [[String: Any]], content = input[0]["content"] as! [[String: Any]]
        #expect((content[1]["image_url"] as? String) == ("data:image/png;base64," + image.base64EncodedString()))
        let fallback = try APIConfiguration(baseURL: "https://example.com/v1", model: "vision", token: "", outputMode: .jsonText)
        let fallbackRequest = try HyperspaceClient().request(image: image, configuration: fallback)
        let fallbackBody = try JSONSerialization.jsonObject(with: fallbackRequest.httpBody!) as! [String: Any]
        #expect((fallbackBody["text"]) == nil); #expect((fallbackRequest.value(forHTTPHeaderField: "Authorization")) == nil)
    }
    @Test func testImageSizeAndFormatRejectedBeforeSending() throws {
        let c = try APIConfiguration(baseURL: "http://localhost", model: "vision", token: "", maxImageBytes: 8)
        #expect(throws: (any Error).self) { try HyperspaceClient().request(image: Data(), configuration: c) }
        #expect(throws: (any Error).self) { try HyperspaceClient().request(image: Data(repeating: 0, count: 9), configuration: c) }
    }
    @Test func testHTTPFailuresAreActionableAndDoNotExposeBody() {
        for code in [400,401,403,404,413,422,429,500,302] { #expect(throws: (any Error).self) { try HyperspaceClient.checkHTTP(code) } }
        #expect(throws: Never.self) { try HyperspaceClient.checkHTTP(200) }
    }
    @Test func testCropUsesRetinaScaleAndClampsToDisplay() throws {
        let rect = try ImageGeometry.cropRect(selection: CGRect(x: 10, y: 20, width: 100, height: 80), viewSize: CGSize(width: 500, height: 400), pixelSize: CGSize(width: 1000, height: 800))
        #expect((rect) == (CGRect(x: 20, y: 40, width: 200, height: 160)))
        let clipped = try ImageGeometry.cropRect(selection: CGRect(x: -10, y: -20, width: 100, height: 100), viewSize: CGSize(width: 500, height: 400), pixelSize: CGSize(width: 1000, height: 800))
        #expect((clipped) == (CGRect(x: 0, y: 0, width: 180, height: 160)))
        #expect(throws: (any Error).self) { try ImageGeometry.cropRect(selection: CGRect(x: 0, y: 0, width: 1, height: 1), viewSize: CGSize(width: 500, height: 400), pixelSize: CGSize(width: 1000, height: 800)) }
    }
    @Test func testDuplicateTriggersAndLateCompletions() {
        var gate = AnalysisGate(); let old = gate.begin()!
        let duplicate = gate.begin(); #expect(duplicate == nil); gate.cancel()
        let new = gate.begin()!
        #expect(!(gate.accepts(old))); let oldFinished = gate.finish(old); #expect(!oldFinished); #expect(gate.accepts(new))
        let newFinished = gate.finish(new); #expect(newFinished); #expect((gate.current) == nil)
    }
    @Test func testCorpusContains24UniqueFixturesAndNegativeCases() throws {
        let fixtures = try FixtureSpec.load()
        #expect((fixtures.count) == (24)); #expect((Set(fixtures.map(\.id)).count) == (24))
        #expect(fixtures.contains { $0.status == .unreadable })
        #expect(fixtures.contains { $0.questions.count > 1 })
        #expect(fixtures.contains { $0.dark })
    }
}

private final class StubProtocol: URLProtocol, @unchecked Sendable {
    static var response: (Int, Data) = (200, Data())
    static var delay: TimeInterval = 0
    static var captured: URLRequest?
    private let lock = NSLock()
    private var stopped = false
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.captured = request
        let (status, data) = Self.response
        DispatchQueue.global().asyncAfter(deadline: .now() + Self.delay) { [self] in
            lock.lock(); defer { lock.unlock() }
            guard !stopped else { return }
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() { lock.lock(); stopped = true; lock.unlock() }
}
@Suite(.serialized) struct TransportTests {
    func client() -> HyperspaceClient {
        let c = URLSessionConfiguration.ephemeral; c.protocolClasses = [StubProtocol.self]
        return HyperspaceClient(session: URLSession(configuration: c))
    }
    init() { StubProtocol.delay = 0; StubProtocol.captured = nil }
    @Test func testActualAsyncTransportDecodesEnvelope() async throws {
        let helpers = HelperCoreTests()
        StubProtocol.response = (200, try helpers.envelope(helpers.result([helpers.question()])))
        let config = try APIConfiguration(baseURL: "https://example.test/v1", model: "vision", token: "synthetic")
        let response = try await client().analyze(image: Data([137,80,78,71,13,10,26,10]), configuration: config)
        #expect((response.answer.questions.count) == (1))
        #expect((StubProtocol.captured?.url?.path) == ("/v1/responses"))
    }
    @Test func testTransportRejectsUnauthorizedWithoutRetry() async throws {
        StubProtocol.response = (401, Data("private server details".utf8))
        let config = try APIConfiguration(baseURL: "https://example.test", model: "vision", token: "")
        do { _ = try await client().analyze(image: Data([137,80,78,71,13,10,26,10]), configuration: config); Issue.record("should fail") }
        catch { #expect(error.localizedDescription.contains("Zugang")); #expect(!(error.localizedDescription.contains("private server"))) }
    }
    @Test func testCancellationInterruptsActiveNetworkRequest() async throws {
        StubProtocol.delay = 2; StubProtocol.response = (200, Data())
        let config = try APIConfiguration(baseURL: "https://example.test", model: "vision", token: "")
        let client = client()
        let task = Task { try await client.analyze(image: Data([137,80,78,71,13,10,26,10]), configuration: config) }
        try await Task.sleep(nanoseconds: 50_000_000); task.cancel()
        do { _ = try await task.value; Issue.record("cancel expected") } catch { #expect(error is CancellationError) }
    }
}
