import AppKit
import HelperCore

actor BrowserSourceReader {
    func read(bundleID: String) throws -> SourceDocument {
        try Task.checkCancellation()
        let code = try BrowserScripts.source(bundleID: bundleID, javascript: BrowserScripts.extractor())
        guard let script = NSAppleScript(source: code) else { throw HelperError("Die Browser-Anbindung konnte nicht gestartet werden.") }
        var scriptError: NSDictionary?
        let result = script.executeAndReturnError(&scriptError)
        try Task.checkCancellation()
        if let error = scriptError {
            let number = error[NSAppleScript.errorNumber] as? Int ?? 0
            if number == -1743 || number == -10004 {
                throw HelperError("Browser-Zugriff nicht erlaubt. In den Helper-Einstellungen unter „Quelltext einmalig einrichten“ findest du die Anleitung und einen Button zu den Automation-Einstellungen.")
            }
            if number == -1712 { throw HelperError("Der Browser antwortet nicht rechtzeitig. Eine Webseite öffnen und erneut versuchen.") }
            // Browser errors may embed page content. Show a fixed actionable message instead.
            throw HelperError("Der fokussierte Tab konnte nicht gelesen werden. Bitte in den Helper-Einstellungen die Schritte unter „Quelltext einmalig einrichten“ prüfen und dann erneut klicken. (\(number))")
        }
        guard let text = result.stringValue, let data = text.data(using: .utf8), data.count <= 150_000 else {
            throw HelperError("Der Browser hat keinen lesbaren Quelltext geliefert.")
        }
        let source: SourceDocument
        do { source = try JSONDecoder().decode(SourceDocument.self, from: data) }
        catch { throw HelperError("Der Quelltext konnte nicht als Fragenbereich gelesen werden. Bitte Foto verwenden.") }
        try source.validate()
        return source
    }
}
