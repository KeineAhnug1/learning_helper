import AppKit

@MainActor enum ApplicationMenu {
    static func install(on application: NSApplication) {
        let menu = NSMenu()
        let appMenu = NSMenu(title: "Learning Helper")
        appMenu.addItem(withTitle: "Learning Helper beenden", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let appItem = NSMenuItem()
        appItem.submenu = appMenu
        menu.addItem(appItem)

        let editMenu = NSMenu(title: "Bearbeiten")
        editMenu.addItem(withTitle: "Widerrufen", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Wiederholen", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Ausschneiden", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Kopieren", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Einfügen", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Alles auswählen", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        // Nil targets route commands to the focused field editor, including SecureField.
        let editItem = NSMenuItem(title: "Bearbeiten", action: nil, keyEquivalent: "")
        editItem.submenu = editMenu
        menu.addItem(editItem)
        application.mainMenu = menu
    }
}
