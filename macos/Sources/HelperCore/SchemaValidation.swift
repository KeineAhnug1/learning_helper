import Foundation
import CoreFoundation

enum SchemaValidation {
    /// Enforce the same supported schema in JSON-text mode, including required nullable keys.
    static func validate(_ value: Any, schema: [String: Any], depth: Int = 0) throws {
        guard depth < 20 else { throw HelperError("Ungültige Modellantwort: zu stark verschachtelt.") }
        let types = (schema["type"] as? [String]) ?? [schema["type"] as? String ?? ""]
        let actual: String
        if value is NSNull { actual = "null" }
        else if value is String { actual = "string" }
        else if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() { actual = "boolean" }
            else if number.doubleValue.isFinite && number.doubleValue.rounded() == number.doubleValue { actual = "integer" }
            else { actual = "number" }
        } else if value is [String: Any] { actual = "object" }
        else if value is [Any] { actual = "array" }
        else { actual = "unsupported" }
        guard types.contains(actual) else { throw HelperError("Ungültige Modellantwort: falscher Feldtyp.") }
        if let values = schema["enum"] as? [Any], !(values as NSArray).contains(value) {
            throw HelperError("Ungültige Modellantwort: unbekannter Feldwert.")
        }
        if let object = value as? [String: Any], actual == "object" {
            let properties = schema["properties"] as? [String: [String: Any]] ?? [:]
            let required = schema["required"] as? [String] ?? []
            guard required.allSatisfy({ object.keys.contains($0) }), object.keys.allSatisfy({ properties[$0] != nil }) else {
                throw HelperError("Ungültige Modellantwort: fehlende oder unerwartete Felder.")
            }
            for (key, child) in object { try validate(child, schema: properties[key]!, depth: depth + 1) }
        }
        if let array = value as? [Any], actual == "array", let items = schema["items"] as? [String: Any] {
            guard array.count <= 200 else { throw HelperError("Ungültige Modellantwort: zu viele Einträge.") }
            for child in array { try validate(child, schema: items, depth: depth + 1) }
        }
    }
}
