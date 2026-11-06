import AppKit
import SwiftUI
import Carbon
import HelperCore

@main struct HelperMain {
    @MainActor static func main() {
        if CommandLine.arguments.contains("--self-test") {
            do {
                _ = try AnalysisContract.schema()
                _ = try BrowserScripts.extractor()
                let fixtures = try FixtureSpec.load()
                for fixture in fixtures { _ = try ImagePreprocessor.png(FixtureRenderer.render(fixture), maxBytes: 12 * 1024 * 1024) }
                print("Bundle OK: Antwortschema und \(fixtures.count) künstliche Fragebilder verfügbar.")
                return
            } catch { fputs("Bundle-Test fehlgeschlagen: \(error.localizedDescription)\n", stderr); exit(1) }
        }
        if let flag = CommandLine.arguments.firstIndex(of: "--export-fixtures"), CommandLine.arguments.count > flag + 1 {
            do {
                let directory = URL(fileURLWithPath: CommandLine.arguments[flag + 1], isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                for fixture in try FixtureSpec.load() {
                    try ImagePreprocessor.png(FixtureRenderer.render(fixture), maxBytes: 12 * 1024 * 1024)
                        .write(to: directory.appendingPathComponent(fixture.id + ".png"))
                }
                print("Künstliche Fragebilder exportiert."); return
            } catch { fputs("Export fehlgeschlagen: \(error.localizedDescription)\n", stderr); exit(1) }
        }
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let delegate = AppDelegate()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    private let model = AppModel()
    private var statusItem: NSStatusItem!
    private var resultWindow: NSWindow?
    private var settingsWindow: NSWindow?
    private let popover = NSPopover()
    private var workspaceObserver: NSObjectProtocol?
    private let shortcut = GlobalShortcut()

    func applicationDidFinishLaunching(_ notification: Notification) {
        ApplicationMenu.install(on: NSApp)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "checkmark.bubble", accessibilityDescription: "Learning Helper: Frage analysieren")
        statusItem.button?.toolTip = "Learning Helper · Klick: analysieren · Rechtsklick: Menü"
        statusItem.button?.target = self; statusItem.button?.action = #selector(clicked)
        statusItem.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        model.lastApplicationPID = NSWorkspace.shared.frontmostApplication?.processIdentifier
        workspaceObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] notification in
            guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.processIdentifier != ProcessInfo.processInfo.processIdentifier else { return }
            MainActor.assumeIsolated { self?.model.lastApplicationPID = app.processIdentifier }
        }
        popover.behavior = .transient
        popover.animates = false
        popover.contentSize = NSSize(width: 340, height: 270)
        popover.contentViewController = NSHostingController(rootView: CompactResultView(model: model))
        model.showResult = { [weak self] in self?.openPopover() }
        model.showDetails = { [weak self] in self?.openResult() }
        model.showSettings = { [weak self] in self?.openSettings() }
        model.hideWindows = { [weak self] in self?.resultWindow?.orderOut(nil); self?.settingsWindow?.orderOut(nil) }
        model.changed = { [weak self] in
            guard let self else { return }
            statusItem.button?.image = NSImage(systemSymbolName: model.busy ? "ellipsis.bubble" : "checkmark.bubble", accessibilityDescription: model.busy ? "Analyse läuft" : "Frage analysieren")
        }
        configureShortcut()
        if !model.settings.saved { openSettings() }
    }
    @objc private func clicked() {
        if NSApp.currentEvent?.type == .rightMouseUp { showMenu() }
        else { model.analyze() }
    }
    private func showMenu() {
        let menu = NSMenu()
        func item(_ title: String, _ action: Selector, tag: Int = 0) {
            let value = NSMenuItem(title: title, action: action, keyEquivalent: ""); value.target = self; value.tag = tag; menu.addItem(value)
        }
        item("Frage analysieren", #selector(analyze))
        item("Standard: Foto", #selector(photoDefault))
        menu.items.last?.state = model.settings.inputMode == .photo ? .on : .off
        item("Standard: Quelltext", #selector(sourceDefault))
        menu.items.last?.state = model.settings.inputMode == .source ? .on : .off
        item("Einmal Bereich auswählen", #selector(region))
        item("Ergebnis öffnen", #selector(result))
        if model.busy { item("Analyse abbrechen", #selector(cancel)) }
        menu.addItem(.separator())
        item("Einstellungen …", #selector(settings))
        item("Beenden", #selector(quit))
        statusItem.menu = menu; statusItem.button?.performClick(nil); statusItem.menu = nil
    }
    @objc private func analyze() { model.analyze() }
    @objc private func region() { model.analyze(inputMode: .photo, mode: .region) }
    @objc private func photoDefault() { model.settings.setInputMode(.photo) }
    @objc private func sourceDefault() { model.settings.setInputMode(.source) }
    @objc private func result() { openPopover() }
    @objc private func settings() { openSettings() }
    @objc private func cancel() { model.cancel() }
    @objc private func quit() { NSApp.terminate(nil) }
    private func openPopover() {
        guard let button = statusItem.button else { return }
        if !popover.isShown { popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY) }
    }
    private func openResult() {
        popover.performClose(nil)
        if resultWindow == nil {
            let window = makeWindow(title: "Learning Helper · Antworten", size: CGSize(width: 620, height: 680))
            window.contentView = NSHostingView(rootView: ResultView(model: model))
            resultWindow = window
        }
        NSApp.activate(ignoringOtherApps: true); resultWindow?.makeKeyAndOrderFront(nil)
    }
    private func openSettings() {
        popover.performClose(nil)
        if settingsWindow == nil {
            let window = makeWindow(title: "Learning Helper · Einstellungen", size: CGSize(width: 700, height: 760))
            window.styleMask.remove(.resizable)
            window.contentView = NSHostingView(rootView: SettingsView(settings: model.settings, model: model, didSave: { [weak self] in self?.configureShortcut() }))
            settingsWindow = window
        }
        NSApp.activate(ignoringOtherApps: true); settingsWindow?.makeKeyAndOrderFront(nil)
    }
    private func makeWindow(title: String, size: CGSize) -> NSWindow {
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: size), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = title; window.isReleasedWhenClosed = false; window.center()
        return window
    }
    func applicationWillTerminate(_ notification: Notification) {
        model.discard(); shortcut.unregister()
        if let workspaceObserver { NSWorkspace.shared.notificationCenter.removeObserver(workspaceObserver) }
    }
    private func configureShortcut() {
        shortcut.unregister()
        guard model.settings.shortcutEnabled else { return }
        do { try shortcut.register { [weak self] in self?.model.analyze() } }
        catch {
            let alert = NSAlert(); alert.messageText = "Kurzbefehl nicht verfügbar"; alert.informativeText = error.localizedDescription
            alert.runModal()
        }
    }
}

@MainActor private final class GlobalShortcut {
    private var reference: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private var action: (() -> Void)?
    func register(action: @escaping () -> Void) throws {
        self.action = action
        var event = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let status = InstallEventHandler(GetApplicationEventTarget(), { _, _, data in
            guard let data else { return OSStatus(eventNotHandledErr) }
            let owner = Unmanaged<GlobalShortcut>.fromOpaque(data).takeUnretainedValue()
            MainActor.assumeIsolated { owner.action?() }
            return noErr
        }, 1, &event, Unmanaged.passUnretained(self).toOpaque(), &handler)
        guard status == noErr else { throw HelperError("Die Tastenkombination konnte nicht registriert werden.") }
        let id = EventHotKeyID(signature: 0x4C484C50, id: 1)
        let keyStatus = RegisterEventHotKey(UInt32(kVK_ANSI_L), UInt32(controlKey | optionKey | cmdKey), id, GetApplicationEventTarget(), 0, &reference)
        guard keyStatus == noErr else { unregister(); throw HelperError("⌃⌥⌘L ist möglicherweise bereits belegt. Der Menüleistenklick bleibt verfügbar.") }
    }
    func unregister() {
        if let reference { UnregisterEventHotKey(reference) }
        if let handler { RemoveEventHandler(handler) }
        reference = nil; handler = nil; action = nil
    }
}
