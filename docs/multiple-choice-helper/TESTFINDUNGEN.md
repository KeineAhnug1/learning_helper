# Multiple Choice Helper: Implementierung und Prüfergebnisse

Stand: 6. November 2026. Zugehöriger [Plan](PLAN.md), [Startanleitung](../../macos/README.md).

## Implementierter Umfang

- Native Swift-/SwiftUI-App mit Menüleistensymbol; Linksklick analysiert, Rechtsklick öffnet das Menü.
- Gegenseitig ausschließende Eingaben **Foto** und **Quelltext**, als Standard gespeichert. Linksklick startet direkt die gewählte Eingabe; während einer laufenden Analyse wird keine zweite Anfrage gesendet.
- Kleines Popup unter dem Symbol mit Ladeanzeige, danach nur `Frage 1: 2/3` usw. **Mehr Infos** öffnet die ausführlichen Antworten. Schließen behält das Ergebnis; Verwerfen, nächste Analyse und Beenden entfernen es.
- Quelltext aus dem geladenen aktiven Tab von Chrome/Safari/Edge/Brave per Apple Events. Fragen und Optionen werden lokal extrahiert; fehlende/unvollständige Fragen, nicht zugängliche Frames und widersprüchliche Modellzuordnungen sind Fehler. Kein automatischer Foto-Fallback.
- Fensteraufnahme über ScreenCaptureKit, Bildschirmwahl und Bereichsauswahl mit Escape-Abbruch. Eigene Fenster werden vor der Aufnahme ausgeblendet beziehungsweise aus der Bildschirmaufnahme ausgeschlossen.
- Einstellungen für Proxy, Modell, Ausgabeformat, Zeitlimit, Bildlimit und optionalen Kurzbefehl ⌃⌥⌘L. Zugangsdaten werden über Security.framework im eigenen Schlüsselbund-Eintrag verwaltet.
- Responses-Client mit getrennten PNG- und Textanfragen, striktem JSON-Schema oder bewusst wählbarem JSON-Text. Beide Eingaben verwenden dieselbe lokale Struktur- und Auswahlprüfung; Quelltext wird zusätzlich gegen die gelesenen Fragen und Optionen geprüft.
- Ergebnisanzeige für Single Choice, Multiple Choice, Freitext im Foto und mehrere Fragen; Kopieren, Bildvorschau, Fehleranzeige, Abbrechen und erneuter Versuch mit derselben Eingabe.
- Ein aktiver Auftrag mit ID-Zuordnung; verspätete Antworten können eine neuere Analyse nicht überschreiben. Keine automatischen Wiederholungen fehlgeschlagener Bildanfragen.
- Eingebauter Verbindungstest mit zwei künstlichen Bildern und vollständiger Korpus mit 24 Bildern in zwei Durchläufen.
- Buildskript für ein lokales App-Bundle und Anleitung zur Einrichtung.

## Automatisiert geprüft

Umgebung: macOS 27.2, Apple Silicon, Swift 6.4.2 aus den Command Line Tools. Deployment-Ziel macOS 14; ein Lauf auf macOS 14 wurde nicht getestet.

`CLANG_MODULE_CACHE_PATH=/tmp/learning-helper-clang macos/scripts/test.sh`: **27 Swift-Tests und 13 DOM-Tests bestanden**, drei Swift-Testing-Suites plus Node-Testlauf.

| Bereich | Nachweis |
| --- | --- |
| Auswahlregeln | Single Choice genau eine Option; Multiple Choice mit exakter Anzahl; unbekannte und doppelte IDs abgewiesen |
| Unsicherheit | Fehlender Kontext erlaubt keine endgültige Antwort; Unsicherheit bleibt beim Kopieren erkennbar |
| Antwortformat | Pflichtfelder einschließlich nullable Feldern, zusätzliche Felder, Typen und Duplikate geprüft |
| Freitext | Mehrere Lücken bleiben zugeordnet; doppelte Feld-IDs werden abgewiesen |
| Responses-Auswertung | Tatsächliche Message-/Content-Struktur gelesen; incomplete, refusal und fehlende Textausgabe werden behandelt |
| Anfrage | Bild-Data-URL, Authentifizierung, Modell, Schema-Modus, Größenlimit und `store: false` geprüft |
| Transport | Asynchroner URLSession-Aufruf über URLProtocol-Testantwort; HTTP 401 und Abbruch einer verzögerten Antwort geprüft |
| Auftrag | Doppelte Auslöser, Abbruch und verspäteter Abschluss mit fremder Auftrags-ID geprüft |
| Ausschnitt | Retina-Skalierung, negative Auswahlkoordinaten, Begrenzung und zu kleine Auswahl geprüft |
| Korpus | 24 eindeutige Fälle einschließlich dunklem Design, mehreren Fragen und unlesbarem Inhalt vorhanden |
| Quelltext-Anfrage | Nur Text, keine Bilddaten; fehlende Fragen und unvollständige Optionen vor Anfrageaufbau abgewiesen |
| Quelltext-Antwort | Erfundene/fehlende Fragen, veränderte Texte und umnummerierte Optionen abgewiesen |
| Kurzformat | Ausschließlich Fragennummer und 1-basierte Optionspositionen; Unsicherheit und fehlender Kontext gekennzeichnet |
| DOM-Auslesung | SAP-DOM mit drei Fragen, jeweils vier Optionen und Auswahlvorgaben 1/1/3; Reihenfolge erhalten und DOM unverändert |
| DOM-Fehler | Keine oder unvollständige Fragen, leere Optionen, gemischte Typen, Ladezustand, unzugängliche Frames und Größenlimits |
| DOM-Inhalte | Versteckte Fragen/Feedback und Script-Metadaten ausgeschlossen; ARIA und explizite Labels, Checkbox-Namen sowie Reihenfolge in gleichursprünglichen Frames geprüft |

Das Testskript ergänzt bei den hier installierten Command Line Tools den Suchpfad für TestingMacros. Die SwiftUI-Ansichten verwenden ausdrücklich den State-Property-Wrapper, da das aktuelle SDK zusätzlich ein gleichnamiges Makro anbietet, dessen Plugin lokal nicht enthalten ist.

## SAP-Beispiel und Browser-Anbindung

Das öffentlich geladene HTML von [Describing the generative AI hub](https://learning.sap.com/courses/discovering-sap-s-generative-ai-hub/describing-the-generative-ai-hub) enthält drei Fragen. Ein auf das Quizformular beschränkter Ausschnitt ohne Seitenscripts oder versteckte Antwortmetadaten liegt unter `macos/Tests/BrowserSourceTests/fixtures/sap-three-questions.html`. Die Tests lesen dieses DOM mit demselben JavaScript wie die App aus. Das ist ein Extraktionsnachweis, keine Live-Prüfung der Browser-Automation oder der fachlichen Modellantworten.

Die AppleScript-Befehle wurden gegen die lokal installierten Chrome-/Safari-Scripting-Dictionaries geprüft. Die generierten Scripts einschließlich des vollständigen JavaScripts ließen sich in einem separaten Prüfprogramm für beide Browser kompilieren, wenn die App über ihren absoluten Pfad adressiert wurde. Die normale Auflösung über die Bundle-ID scheitert in dieser Ausführungsumgebung am nicht verfügbaren App-Registrierungsdienst (`-1728`); die App verwendet weiterhin die portable Bundle-ID. Keine Browser-Seiteninhalte wurden über Apple Events ausgelesen und keine Browser-Einstellungen verändert. Edge/Brave verwenden die Chromium-Anbindung, wurden aber nicht separat live geprüft.

## Build und Bilder

- Debug-Build erfolgreich; das Programm verlinkt nur Systembibliotheken, keine separat zu installierende HelperCore-Bibliothek.
- Alle 24 künstlichen Bilder über das gebaute Programm als PNG erzeugt. Das Bild mit zwei Fragen wurde visuell auf korrekte Ausrichtung, Lesbarkeit und vollständige Optionslisten geprüft.
- Shell-Syntax der Build-/Testskripte und Info.plist geprüft.
- Release-Build erfolgreich. Das Bundle liegt unter `macos/build/Learning Helper.app`; `codesign --verify --deep --strict` bestand. Der Selbsttest aus dem Bundle fand das Schema und erzeugte alle 24 künstlichen Fragebilder.
- Nach der Foto-/Quelltext-Erweiterung erneut erfolgreich gebaut und mit `codesign --verify --strict` geprüft. Der Bundle-Selbsttest lädt jetzt zusätzlich das Extraktions-JavaScript; Schema und alle 24 Fragebilder bleiben verfügbar.
- Der lokale Release-Build verwendet keine separaten Debug-Symbole. Die dSYM-Erzeugung des neuen Swift-Buildsystems scheiterte in der eingeschränkten Umgebung; die normale Programmausführung und die Debug-Tests benötigen diese Dateien nicht.

## Grenze des grafischen Starttests

Das Öffnen des Bundles über `open` scheiterte hier mit LaunchServices `-10827`. Die ausführbare Datei ist vorhanden, als arm64-Mach-O erkannt und erfolgreich signaturgeprüft. Der direkte Start innerhalb des App-Bundles wurde bei `NSApplication.shared` während `_RegisterApplication` abgebrochen, bevor der App-Delegate läuft.

Die read-only Registrierungsprüfung mit `lsregister -lint` liefert sowohl für den Helper als auch für die vorinstallierte Calculator-App `-10822`. Laut lokalem Apple-SDK ist dies `kLSServerCommunicationErr`: Der Registrierungsdienst ist nicht erreichbar. Ein minimales AppKit-Programm ohne Bundle konnte initialisieren. Auch der Helper als direkt gestartetes Programm aus dem Buildverzeichnis lief weiter, meldete jedoch nicht verfügbare macOS-XPC-Dienste; dieser Testprozess wurde anschließend beendet.

Damit ist der grafische Bundle-Start im normalen Nutzerkontext noch nicht bestätigt. Das fertige Bundle soll dort über Finder oder ein normales Terminal geöffnet werden. Es wurden keine Systemberechtigungen oder Registrierungsdaten verändert.

## Hyperspace: tatsächlich beobachtet

Ein aktueller Aufruf von `http://localhost:6655/openai/v1/models` **ohne Zugangsschlüssel** lieferte HTTP 401. Der lokale HTTP-Dienst antwortet und verlangt Authentifizierung. Das belegt keine erfolgreiche Modell- oder Bildanfrage.

Für diesen Helper wurden keine Zugangsdaten aus anderen Apps übernommen. Es wurde keine echte Bildschirmaufnahme an den Proxy gesendet. Der eingebaute Bildtest und der vollständige Modellkorpus sind implementiert, wurden aber mangels konfiguriertem Schlüssel/Modell nicht live ausgeführt.

## Noch offene praktische Prüfungen

Die Quelltext-Einrichtung ist nach dem Nutzerhinweis auf den fehlenden Automation-Eintrag als drei Schritte dargestellt: Browser-Menü freigeben, ersten Zugriff auslösen und bei bereits verweigertem Zugriff den macOS-Schalter aktivieren. Ein Button öffnet die Automation-Einstellungen. Ein ausklappbarer Hinweis erklärt den erst nach einem Zugriffsversuch angelegten Eintrag und die mögliche Zuordnung zu VS Code/Terminal beim Start über diese Programme. Für die deutsche Chrome-Version 157 wurde der Menüname **Darstellung → Entwickler → JavaScript von Apple Events erlauben** anhand der installierten Sprachressourcen geprüft. Die Systemeinstellungen wurden dabei nicht verändert.

Nach Nutzerbericht zu fehlendem Copy/Paste wurde das bisher fehlende App-Hauptmenü ergänzt. „Bearbeiten“ enthält jetzt die macOS-Standardaktionen für Ausschneiden, Kopieren, Einfügen, Alles auswählen sowie Undo/Redo. Ohne festes Ziel werden sie an das aktive Textfeld weitergereicht.

Der Release-Build, die Signaturprüfung und der Bundle-Selbsttest bestanden nach dieser Korrektur. Ein separater AppKit-Prozess prüfte die Weiterleitung von ⌘A und ⌘V über das tatsächliche Menü an einen Texteditor mit simuliertem aktivem Fenster und synthetischem Paste-Handler. Dabei wurde die Systemzwischenablage nicht verwendet. Ein realer Tastaturtest im Nutzerfenster bleibt von dieser Prüfung zu unterscheiden; die laufende App muss zum Laden der Korrektur neu gestartet werden.

| Prüfung | Status |
| --- | --- |
| Grafischer Start des App-Bundles im normalen Nutzerkontext | Offen; App-Registrierung in der Ausführungsumgebung nicht erreichbar |
| Schlüssel im App-Dialog speichern und nach Neustart lesen | Offen |
| Authentifizierte Bildroute und Schema-Unterstützung des gewählten Modells | Offen; zuerst den eingebauten Zwei-Bilder-Test ausführen |
| 24 Bilder zweimal gegen das tatsächlich konfigurierte Modell | Offen; automatisierte lokale Tests enthalten keine Modellanfragen |
| Bildschirmberechtigung erteilen, entziehen und nach App-Update erneut prüfen | Offen |
| Richtige reale Fensteraufnahme bei mehreren Browserfenstern | Offen |
| Reale Bildschirm-/Bereichsaufnahme mit mehreren Monitoren | Offen |
| Optionaler globaler Kurzbefehl im Nutzerprofil | Offen |
| Menüleisten-Popup: Position, Laden, Ergebnis und Mehr Infos | Implementiert und gebaut; Desktop-Test im Nutzerkontext offen |
| Browser-Automation, JavaScript-Freigabe und Fokus bei mehreren Tabs/Fenstern | Offen; Scripting-Dictionaries und Script-Kompilierung geprüft |
| Standardmodus nach Neustart | Speicherung implementiert; Desktop-Test offen |
| Echte Quelltext-Anfrage an das konfigurierte Modell | Offen; nur lokaler Anfrageaufbau und Antwortprüfung getestet |
| LinkedIn Learning, Pluralsight und die drei genannten SAP-Lernangebote | Jeweils offen; keine Live-Unterstützung zugesagt |

Nächster praktischer Ablauf: App neu starten, Schlüssel und Modell konfigurieren, Foto oder Quelltext als Standard wählen und dessen Berechtigung freigeben. Danach Lernseite fokussieren, das Symbol anklicken und Kurzansicht/Mehr Infos prüfen. Für Foto vorab den Zwei-Bilder-Test und die lokale Aufnahmevorschau verwenden.
