import AppKit
import SwiftUI
import Security
import HelperCore

enum CaptureMode: String, CaseIterable, Codable {
    case window, display, region
    var label: String {
        switch self {
        case .window: return "Aktives Lernfenster"
        case .display: return "Gewählter Bildschirm"
        case .region: return "Bereich auswählen"
        }
    }
}

@MainActor final class SettingsStore: ObservableObject {
    @Published var baseURL: String
    @Published var model: String
    @Published var outputMode: OutputMode
    @Published var inputMode: InputMode
    @Published var captureMode: CaptureMode
    @Published var displayID: UInt32
    @Published var shortcutEnabled: Bool
    @Published var timeout: Double
    @Published var maxImageMB: Int
    @Published var saved = false
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        baseURL = defaults.string(forKey: "proxyBaseURL") ?? "http://localhost:6655/openai/v1"
        model = defaults.string(forKey: "model") ?? ""
        outputMode = OutputMode(rawValue: defaults.string(forKey: "outputMode") ?? "") ?? .strict
        inputMode = InputMode(rawValue: defaults.string(forKey: "inputMode") ?? "") ?? .photo
        captureMode = CaptureMode(rawValue: defaults.string(forKey: "captureMode") ?? "") ?? .window
        displayID = UInt32(defaults.integer(forKey: "displayID"))
        shortcutEnabled = defaults.bool(forKey: "shortcutEnabled")
        timeout = defaults.object(forKey: "timeout") as? Double ?? 60
        maxImageMB = defaults.object(forKey: "maxImageMB") as? Int ?? 12
        saved = defaults.bool(forKey: "configured")
    }
    var keychainAccount: String { baseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/")) }
    func configuration(token: String? = nil) throws -> APIConfiguration {
        try APIConfiguration(baseURL: baseURL, model: model, token: token ?? KeychainStore.read(account: keychainAccount),
                             outputMode: outputMode, timeout: timeout, maxImageBytes: maxImageMB * 1024 * 1024)
    }
    func save(token: String) throws {
        _ = try configuration(token: token)
        try KeychainStore.save(token, account: keychainAccount)
        defaults.set(baseURL, forKey: "proxyBaseURL")
        defaults.set(model, forKey: "model")
        defaults.set(outputMode.rawValue, forKey: "outputMode")
        defaults.set(inputMode.rawValue, forKey: "inputMode")
        defaults.set(captureMode.rawValue, forKey: "captureMode")
        defaults.set(displayID, forKey: "displayID")
        defaults.set(shortcutEnabled, forKey: "shortcutEnabled")
        defaults.set(timeout, forKey: "timeout")
        defaults.set(maxImageMB, forKey: "maxImageMB")
        defaults.set(true, forKey: "configured")
        saved = true
    }
    func setMode(_ mode: CaptureMode) {
        captureMode = mode; defaults.set(mode.rawValue, forKey: "captureMode")
    }
    func setInputMode(_ mode: InputMode) {
        inputMode = mode; defaults.set(mode.rawValue, forKey: "inputMode")
    }
}

enum KeychainStore {
    private static let service = "de.learning-helper.questions.proxy"
    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
    static func read(account: String) throws -> String {
        var query = query(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return "" }
        guard status == errSecSuccess, let data = item as? Data, let text = String(data: data, encoding: .utf8) else {
            throw HelperError("Der Zugangsschlüssel konnte nicht aus dem Schlüsselbund gelesen werden (\(status)).")
        }
        return text
    }
    static func save(_ token: String, account: String) throws {
        let query = query(account)
        if token.isEmpty {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw HelperError("Der Schlüssel konnte nicht gelöscht werden (\(status)).") }
            return
        }
        let attributes: [String: Any] = [kSecValueData as String: Data(token.utf8)]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query.merging(attributes) { _, new in new }
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw HelperError("Der Schlüssel konnte nicht gespeichert werden (\(status)).") }
    }
}
