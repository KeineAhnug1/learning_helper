import Foundation

public enum OutputMode: String, Codable, CaseIterable, Sendable {
    case strict, jsonText
    public var label: String { self == .strict ? "Striktes JSON-Schema" : "JSON-Text (lokal geprüft)" }
}
public struct APIConfiguration: Sendable {
    public let baseURL: URL
    public let model: String
    public let token: String
    public let outputMode: OutputMode
    public let timeout: TimeInterval
    public let maxImageBytes: Int
    public init(baseURL: String, model: String, token: String, outputMode: OutputMode = .strict,
                timeout: TimeInterval = 60, maxImageBytes: Int = 12 * 1024 * 1024) throws {
        guard let url = URL(string: baseURL.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = url.host?.lowercased(), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil,
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host)) else {
            throw HelperError("Bitte eine HTTPS-Proxy-Adresse eingeben; HTTP ist nur für localhost erlaubt.")
        }
        guard let model = model.nonEmpty else { throw HelperError("Bitte ein bildfähiges Modell eintragen.") }
        guard timeout >= 5 && timeout <= 300, maxImageBytes > 0 && maxImageBytes <= 50 * 1024 * 1024 else {
            throw HelperError("Ungültiges Zeit- oder Bildgrößenlimit.")
        }
        guard !token.contains("\n") && !token.contains("\r") else { throw HelperError("Der Zugangsschlüssel enthält einen Zeilenumbruch.") }
        self.baseURL = url
        self.model = model
        self.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        self.outputMode = outputMode
        self.timeout = timeout
        self.maxImageBytes = maxImageBytes
    }
    public var endpoint: URL { baseURL.appendingPathComponent("responses") }
}

/// IDs make stale completions harmless even when a transport ignores cancellation.
public struct AnalysisGate: Sendable {
    public private(set) var current: UUID?
    public init() {}
    public mutating func begin() -> UUID? {
        guard current == nil else { return nil }
        let id = UUID(); current = id; return id
    }
    public func accepts(_ id: UUID) -> Bool { current == id }
    @discardableResult public mutating func finish(_ id: UUID) -> Bool {
        guard accepts(id) else { return false }; current = nil; return true
    }
    public mutating func cancel() { current = nil }
}
