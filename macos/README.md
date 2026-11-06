# Multiple Choice Helper für macOS

Eine native Menüleisten-App für Lernfragen. Ein Klick sendet je nach gespeichertem Standard entweder ein **Foto** oder die aus dem **Quelltext des fokussierten Browser-Tabs** gelesenen Fragen an den Hyperspace Proxy. Direkt unter dem Symbol erscheinen zuerst die Ladeanzeige und anschließend die Antwortindizes.

## Bauen und starten

Benötigt werden macOS ab 14 und eine Swift-6-Toolchain mit macOS-SDK. Auf diesem Rechner sind die Command Line Tools ausreichend; externe Swift-Pakete werden nicht heruntergeladen. Die DOM-Tests verwenden Node.js ab 22.12 und die vorhandenen Testabhängigkeiten der Erweiterung: einmal im Projektstamm `npm --prefix extension ci` ausführen. Die App selbst benötigt kein Node.js.

~~~sh
cd macos
./scripts/test.sh
./scripts/build-app.sh
open "build/Learning Helper.app"
~~~

Der Build erzeugt ein lokal ad hoc signiertes App-Bundle unter `macos/build/Learning Helper.app` und prüft dessen Signatur und Ressourcen. Gebaut wird für die Architektur des aktuellen Rechners. Die App ist nicht notarisiert. Für einen anderen Mac dort bauen oder eine gesondert signierte Auslieferung erstellen.

Starte das Bundle von einem festen Ort. Du kannst es vor dem ersten Einrichten nach `~/Applications` kopieren. Ein geänderter Pfad oder eine neue Signatur kann dazu führen, dass macOS Berechtigungen erneut bestätigt haben möchte. Die Skripte legen Compiler-Caches im Projekt ab. `test.sh` bindet bei Bedarf die mit den Command Line Tools gelieferten Swift-Testing-Makros ein; XCTest ist nicht erforderlich.

## Einrichten

1. Beim ersten Start öffnen sich die Einstellungen. Später erreichst du sie per Rechtsklick auf das Sprechblasen-Symbol in der Menüleiste.
2. Proxy-Basisadresse einschließlich API-Pfad eintragen. `http://localhost:6655/openai/v1` ist der vorbelegte lokale Ausgangswert. HTTP wird nur für Loopback-Ziele akzeptiert, sonst HTTPS.
3. Deinen Hyperspace-Zugangsschlüssel im Feld **Zugangsschlüssel** eintragen. Der Helper übernimmt keine Schlüssel anderer Apps. **Speichern** legt den Schlüssel im macOS-Schlüsselbund ab, getrennt nach Proxy-Adresse. Ein leeres Schlüsselfeld beim Speichern entfernt den Schlüssel dieser Adresse.
4. **Modelle laden** verwenden und ein Modell auswählen. Für **Foto** muss es Bilder unterstützen; **Quelltext** sendet nur Text. Die Modellliste allein beweist noch keine Bildunterstützung.
5. **Verbindung und Bildanalyse testen** sendet zwei künstliche Fragebilder und prüft deren erwartete Antworten. Falls der Proxy das strikte JSON-Schema nicht unterstützt, bewusst **JSON-Text (lokal geprüft)** auswählen und den Test wiederholen.
6. Unter **Standardmodus** genau eine Eingabe wählen. Für **Foto** die Bildschirmaufnahme erlauben; **Lokale Aufnahmevorschau** sendet kein Bild. Für **Quelltext** den Browserzugriff wie unten beschrieben einrichten.
7. Einstellungen speichern, Lernfragen im Browser öffnen und auf das Menüleistensymbol klicken. Nach einem Neubau die laufende App beenden und das neue Bundle starten.

HTTP 401/403 weist auf fehlenden Zugang oder Berechtigung hin. Bei 404 API-Pfad und Modell prüfen; daraus allein lässt sich kein genereller Proxy-Ausfall ableiten.

## Quelltext einrichten

Für Chrome gehst du so vor:

1. **Chrome öffnen.** Ganz oben am Bildschirm in der macOS-Menüleiste **Darstellung → Entwickler → JavaScript von Apple Events erlauben** anhaken. Dieser Punkt steht nicht in den Chrome-Einstellungen. Der Menüname „Darstellung“ ist anhand der deutschen Sprachressourcen des lokal installierten Chrome 157 geprüft.
2. **Im Helper Quelltext wählen und Speichern klicken.** Dann die Lernseite in Chrome nach vorn holen und auf das Learning-Helper-Symbol in der Menüleiste klicken. Die macOS-Nachfrage zum Steuern von Google Chrome bestätigen.
3. **Falls der Zugriff bereits abgelehnt wurde:** Im Helper auf **Automation-Einstellungen öffnen** klicken. Unter **Systemeinstellungen → Datenschutz & Sicherheit → Automation** den Eintrag **Learning Helper** aufklappen und **Google Chrome** einschalten. Danach erneut die Lernseite fokussieren und das Helper-Symbol anklicken.

**Learning Helper fehlt in der Liste?** macOS legt den Eintrag erst nach dem ersten Zugriffsversuch aus Schritt 2 an; manuell hinzufügen lässt er sich dort nicht. Starte `Learning Helper.app` per Doppelklick im Finder. Beim Start aus VS Code oder Terminal kann macOS den Browserzugriff diesem Programm zuordnen. Ein Schalter **Visual Studio Code → Google Chrome** ist deshalb keine separat erteilte Freigabe für die eigenständig gestartete Helper-App.

**Andere Browser:** Safari verwendet **Entwickler → JavaScript von Apple Events erlauben**. Fehlt dieses Menü, unter **Safari → Einstellungen → Erweitert** die Funktionen für Webentwickler einschalten. Edge und Brave verwenden das Menü **Darstellung** bzw. **Ansicht → Entwickler**. Englisch: **View → Developer → Allow JavaScript from Apple Events**. Bezeichnungen können je nach Browser und Version abweichen. Die Anbindung unterstützt außerdem Chrome Beta/Canary. Bildschirmaufnahme ist für Quelltext nicht erforderlich.

Die App liest den bereits geladenen Inhalt des aktiven Tabs im fokussierten Browser. Sie lädt die URL nicht erneut; der vorhandene Login und dynamisch geladene Fragen bleiben maßgeblich. Gesendet werden Fragetexte, Antwortoptionen in Seitenreihenfolge, Auswahlvorgaben sowie Seitentitel und URL ohne Query/Fragment. Scripts, unsichtbares Feedback und Formular-Eingabewerte gehören nicht zur Anfrage. Auch Fragen weiter unten auf derselben geladenen Seite können erkannt werden.

Unterstützt werden erkennbare Radio-/Checkbox-Fragen und entsprechende ARIA-Bedienelemente. Fehlende Fragen, unvollständige erkannte Fragen, unlesbare Optionen und nicht zugängliche eingebettete Seitenbereiche führen zu einem Fehler vor der Modellanfrage. **Es gibt keinen automatischen Wechsel zu Foto.** Für Freitextaufgaben, Bilder, nicht zugängliche Frames oder abweichende Quiz-Widgets ausdrücklich Foto wählen. Das Modell darf keine Fragen ergänzen oder Optionen umnummerieren; abweichende Antworten werden verworfen.

## Bedienen

| Aktion | Ergebnis |
| --- | --- |
| Linksklick auf das Menüleistensymbol | Sofort Foto oder Browser-Quelltext gemäß Standard analysieren |
| Rechtsklick | Standard Foto/Quelltext direkt speichern, Analyse, einmalige Bereichsauswahl, Ergebnis, Einstellungen und Beenden |
| Optional ⌃⌥⌘L | Dieselbe Analyseaktion ohne Klick; in den Einstellungen einschalten |
| Aktives Lernfenster | Vorderstes passendes Fenster des zuletzt aktiven Programms automatisch aufnehmen |
| Gewählter Bildschirm | Eingestellten Bildschirm beziehungsweise Bildschirm am Mauszeiger aufnehmen |
| Bereich auswählen | Rechteck auf einer eingefrorenen lokalen Aufnahme aufziehen; Escape bricht ab |
| Mehr Infos | Fragetexte, vollständige Antworten, Begründungen und Kopierfunktion öffnen |
| Neue Analyse | Aktuelle Eingabe gemäß Standard erneut erfassen und analysieren |
| Dieselbe Eingabe erneut versuchen | Nach einem Modell-/Verbindungsfehler dieselbe Eingabe mit der ursprünglichen Verbindung senden |
| Verwerfen | Analyse abbrechen und Eingabe/Antwort aus dem App-Zustand entfernen |
| Popup oder Detailfenster schließen | Ergebnis behalten; per Rechtsklick → Ergebnis öffnen erneut ansehen |

Das Popup öffnet sich sofort mit einer Ladeanzeige. Die eigene App wird aus der Bildschirmaufnahme ausgeschlossen. Bei mehrdeutigem Fensterziel erscheint ein Fehler. Ein erneuter Klick während einer Analyse öffnet deren Status, ohne eine zweite Anfrage zu senden.

Die Kurzansicht enthält ausschließlich die Fragennummer und die richtigen Antwortpositionen, beispielsweise **Frage 1: 2** und **Frage 2: 1/3**. Position 1 ist die erste Option auf der Seite beziehungsweise im Foto. Unsicherheit erscheint als „Unsicher“, fehlender Kontext als „Nicht beantwortbar“. Freitextantworten stehen unter „Mehr Infos“. Dort werden auch Frage, Antworttexte und Begründung angezeigt; unsichere Vorschläge bleiben beim Kopieren gekennzeichnet.

Die App klickt keine Antworten an und sendet keine Kursformulare ab. Foto benötigt Bildschirmaufnahme, Quelltext benötigt Browser-Automation. Accessibility wird nicht verwendet.

## Daten und Verbindung

Aktuelle Eingabe und Ergebnis bleiben bis zum Verwerfen, zur nächsten Analyse oder zum Beenden im Speicher. Es gibt keine automatische Speicherung als Dateien oder in einer Historie. Kopieren schreibt nach Nutzeraktion in die Zwischenablage. Einstellungen liegen in `UserDefaults`, Schlüssel im macOS-Schlüsselbund.

Anfragen verwenden das Responses-Protokoll, je nach Eingabe PNG als Base64-Data-URL oder ausgelesene Fragen als JSON-Text, `store: false` und keinen persistenten HTTP-Cache. Umleitungen werden nicht verfolgt. Fehlgeschlagene Analysen werden nicht automatisch wiederholt; das Modell wird nicht automatisch gewechselt. Die Aufbewahrung beim Proxy und Modellanbieter hängt von deren Konfiguration ab.

Standardlimits: 12 MB pro PNG, 60 Sekunden pro Analyse. Quelltext ist auf 30 Fragen, 100 Optionen pro Frage und höchstens 100 KB begrenzt; die Browser-Automation hat ein Zeitlimit von 15 Sekunden. Große Aufnahmen werden nicht stillschweigend verkleinert; ein kleinerer Ausschnitt erhält die Lesbarkeit. Abbrechen unterbindet die lokale Weiterverarbeitung, kann aber bereits beim Anbieter gestartete Verarbeitung nicht sicher rückgängig machen.

## Tests

`./scripts/test.sh` prüft Antwortschema, Auswahlregeln, kompakte Antwortindizes, getrennte Bild-/Textanfragen, Quelltext-Zuordnung, Kopiertexte, Ausschnittkoordinaten, Ereigniszuordnung, HTTP-Transport und Netzwerkabbruch ohne Zugangsdaten. DOM-Tests prüfen außerdem einen bereinigten HTML-Ausschnitt der SAP-Beispielseite mit drei Fragen sowie fehlende/unvollständige Fragen, versteckte Inhalte, ARIA-Controls und Frames. Diese Tests führen keine Browser-Automation und keine Modellanfragen aus.

In den Einstellungen prüft **24 Bilder · 2 Durchläufe** den vollständigen künstlichen Korpus mit dem konfigurierten Modell. Dabei entstehen 48 Bildanfragen; Fortschritt und Abbruch stehen im Ergebnisfenster zur Verfügung. Die Auswertung unterscheidet exakte Antworten von teilweise passenden Auswahlen. Das Protokoll lässt sich kopieren.

Die Bilder lassen sich auch separat erzeugen:

~~~sh
"build/Learning Helper.app/Contents/MacOS/LearningHelper" --export-fixtures /tmp/learning-helper-fixtures
~~~

Aktuelle Ergebnisse und offene Prüfungen stehen in [TESTFINDUNGEN.md](../docs/multiple-choice-helper/TESTFINDUNGEN.md). Ein erfolgreicher Build oder künstlicher Test ersetzt keine Prüfung der Bildschirmaufnahme und einer angemeldeten Lernplattform.
