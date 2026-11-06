import AppKit
import ScreenCaptureKit
import ImageIO
import UniformTypeIdentifiers
import HelperCore

struct CapturedImage: @unchecked Sendable {
    let image: CGImage
    let label: String
    let capturedAt: Date
}

@MainActor final class CaptureService {
    private var regionPicker: RegionPicker?
    static var hasPermission: Bool { CGPreflightScreenCaptureAccess() }
    static func requestPermission() { _ = CGRequestScreenCaptureAccess() }
    static func openPermissionSettings() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)
    }
    func cancel() { regionPicker?.cancel() }

    func capture(mode: CaptureMode, displayID: UInt32, applicationPID: pid_t?) async throws -> CapturedImage {
        guard Self.hasPermission else {
            throw HelperError("Bildschirmaufnahme ist noch nicht freigegeben. In den Einstellungen erlauben und die App bei Bedarf neu starten.")
        }
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        try Task.checkCancellation()
        let ownPID = ProcessInfo.processInfo.processIdentifier
        let config = SCStreamConfiguration()
        config.showsCursor = false
        config.captureResolution = .best
        let filter: SCContentFilter
        let label: String
        var screenFrame: CGRect?
        if mode == .window {
            let candidates = content.windows.filter {
                $0.owningApplication?.processID != ownPID && $0.windowLayer == 0 && $0.frame.width >= 100 && $0.frame.height >= 100
                && $0.owningApplication?.processID == applicationPID
            }
            guard !candidates.isEmpty else { throw HelperError("Kein Lernfenster gefunden. Bitte Browser öffnen.") }
            let window: SCWindow
            if let pid = applicationPID,
               let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
               let active = list.first(where: { entry in
                   (entry[kCGWindowOwnerPID as String] as? Int) == Int(pid) &&
                   (entry[kCGWindowLayer as String] as? Int) == 0 &&
                   candidates.contains(where: { window in (entry[kCGWindowNumber as String] as? UInt32) == window.windowID })
               }), let number = active[kCGWindowNumber as String] as? UInt32,
               let selected = candidates.first(where: { $0.windowID == number }) { window = selected }
            else if candidates.count == 1 && candidates[0].owningApplication?.processID == applicationPID { window = candidates[0] }
            else { throw HelperError("Das fokussierte Fenster konnte nicht eindeutig ermittelt werden. Bitte das Lernfenster nach vorn holen und erneut klicken.") }
            filter = SCContentFilter(desktopIndependentWindow: window)
            label = [window.owningApplication?.applicationName, window.title].compactMap { $0?.nonEmpty }.joined(separator: " · ")
        } else {
            let screen = try chooseScreen(displayID: displayID)
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber,
                  let display = content.displays.first(where: { $0.displayID == number.uint32Value }) else {
                throw HelperError("Der gewählte Bildschirm ist nicht verfügbar. Bitte in den Einstellungen neu wählen.")
            }
            filter = SCContentFilter(display: display, excludingApplications: content.applications.filter { $0.processID == ownPID }, exceptingWindows: [])
            label = screen.localizedName
            screenFrame = screen.frame
        }
        let scale = CGFloat(filter.pointPixelScale)
        config.width = max(1, Int((filter.contentRect.width * scale).rounded()))
        config.height = max(1, Int((filter.contentRect.height * scale).rounded()))
        guard config.width <= 16000, config.height <= 16000, config.width * config.height <= 80_000_000 else {
            throw HelperError("Die Aufnahmefläche ist zu groß. Bitte ein einzelnes Fenster auswählen.")
        }
        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        try Task.checkCancellation()
        if mode == .region, let frame = screenFrame {
            let picker = RegionPicker(); regionPicker = picker
            defer { regionPicker = nil }
            let cropped = try await picker.select(image: image, frame: frame)
            try Task.checkCancellation()
            return CapturedImage(image: cropped, label: label + " · Ausschnitt", capturedAt: Date())
        }
        return CapturedImage(image: image, label: label, capturedAt: Date())
    }
    private func chooseScreen(displayID: UInt32) throws -> NSScreen {
        if displayID != 0 {
            guard let screen = NSScreen.screens.first(where: {
                ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == displayID
            }) else { throw HelperError("Der gespeicherte Bildschirm wurde getrennt. Bitte neu wählen.") }
            return screen
        }
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(NSEvent.mouseLocation) }) ?? NSScreen.main else {
            throw HelperError("Kein Bildschirm gefunden.")
        }
        return screen
    }
}

enum ImagePreprocessor {
    static func png(_ image: CGImage, maxBytes: Int) throws -> Data {
        let data = NSMutableData()
        guard let target = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
            throw HelperError("Das Bild konnte nicht vorbereitet werden.")
        }
        CGImageDestinationAddImage(target, image, nil)
        guard CGImageDestinationFinalize(target), data.length > 0, data.length <= maxBytes else {
            throw HelperError("Die Aufnahme überschreitet das Bildlimit. Bitte einen kleineren Bereich wählen.")
        }
        return data as Data
    }
}

@MainActor private final class RegionPicker {
    private var panel: NSPanel?
    private var continuation: CheckedContinuation<CGImage, Error>?
    func select(image: CGImage, frame: CGRect) async throws -> CGImage {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let panel = SelectionPanel(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
            panel.level = .screenSaver
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            panel.isReleasedWhenClosed = false
            let view = SelectionView(frame: CGRect(origin: .zero, size: frame.size), image: image)
            view.finish = { [weak self] rect in
                guard let rect else { self?.cancel(); return }
                do {
                    let crop = try ImageGeometry.cropRect(selection: rect, viewSize: frame.size,
                                                         pixelSize: CGSize(width: image.width, height: image.height))
                    guard let result = image.cropping(to: crop) else { throw HelperError("Ausschnitt nicht verfügbar.") }
                    self?.finish(.success(result))
                } catch { self?.finish(.failure(error)) }
            }
            panel.contentView = view
            self.panel = panel
            NSApp.activate(ignoringOtherApps: true)
            panel.makeKeyAndOrderFront(nil); panel.makeFirstResponder(view)
        }
    }
    func cancel() { finish(.failure(CancellationError())) }
    private func finish(_ result: Result<CGImage, Error>) {
        let pending = continuation; continuation = nil
        panel?.orderOut(nil); panel?.close(); panel = nil
        pending?.resume(with: result)
    }
}
private final class SelectionPanel: NSPanel { override var canBecomeKey: Bool { true } }
@MainActor private final class SelectionView: NSView {
    let image: CGImage
    var finish: ((CGRect?) -> Void)?
    var start: NSPoint?
    var selection: CGRect?
    override var acceptsFirstResponder: Bool { true }
    override var isFlipped: Bool { true }
    init(frame: CGRect, image: CGImage) { self.image = image; super.init(frame: frame) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }
    override func draw(_ dirtyRect: NSRect) {
        NSImage(cgImage: image, size: bounds.size).draw(in: bounds, from: .zero, operation: .copy, fraction: 1, respectFlipped: true, hints: nil)
        NSColor.black.withAlphaComponent(0.38).setFill(); bounds.fill()
        if let selection {
            NSGraphicsContext.saveGraphicsState()
            NSBezierPath(rect: selection).addClip()
            NSImage(cgImage: image, size: bounds.size).draw(in: bounds, from: .zero, operation: .copy, fraction: 1, respectFlipped: true, hints: nil)
            NSGraphicsContext.restoreGraphicsState()
            NSColor.systemMint.setStroke(); let path = NSBezierPath(rect: selection); path.lineWidth = 2; path.stroke()
        }
        let message = "Bereich mit der vollständigen Frage aufziehen · Esc zum Abbrechen"
        (message as NSString).draw(at: NSPoint(x: 28, y: 28), withAttributes: [.font: NSFont.systemFont(ofSize: 19, weight: .semibold), .foregroundColor: NSColor.white, .backgroundColor: NSColor.black])
    }
    override func mouseDown(with event: NSEvent) { start = convert(event.locationInWindow, from: nil) }
    override func mouseDragged(with event: NSEvent) {
        guard let start else { return }
        let end = convert(event.locationInWindow, from: nil)
        selection = CGRect(x: min(start.x, end.x), y: min(start.y, end.y), width: abs(end.x-start.x), height: abs(end.y-start.y))
        needsDisplay = true
    }
    override func mouseUp(with event: NSEvent) { mouseDragged(with: event); finish?(selection) }
    override func keyDown(with event: NSEvent) { if event.keyCode == 53 { finish?(nil) } }
}
