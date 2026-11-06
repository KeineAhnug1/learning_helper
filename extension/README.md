# Video Displayer

Chrome-Erweiterung zum Verteilen eines LinkedIn-Learning- oder Pluralsight-Videokurses auf bis zu acht Ansichten in vier nativen Split-View-Fenstern.

**Version 0.1.9:** lokal gebaut und automatisiert getestet. Die Erkennung verwendet plattformspezifische DOM-Regeln; ein vollständiger Durchlauf auf den angemeldeten Plattformen ist noch nicht bestätigt. Eine nicht erkannte Kursnavigation oder ein nicht zugänglicher Player wird als Problem angezeigt. Der Screenshot-Assistent ist nicht Bestandteil dieser Erweiterung.

## In Chrome laden

Voraussetzung: Chrome ab Version 155. Verwende das Chrome-Profil, in dem du bei den Lernplattformen angemeldet bist.

Ab Version 0.1.1 werden auch die neuen Pluralsight-Links wie [Big Data Explained in ILX](https://app.pluralsight.com/ilx/video-courses/big-data-explained/course-overview) akzeptiert. Die bisherigen Links unter /library/courses/ bleiben unterstützt.

Version 0.1.4 erkennt die ILX-Playerpfade mit Kurs-, Modul- und Clip-UUID. Bei Kursbuttons wird die nach dem gezielten Klick geladene Playeradresse dem zugewiesenen Video zugeordnet. Sichtbare Pluralsight-Ladefehler erscheinen separat; bereite Ansichten werden nach einem Fehler oder Lade-Timeout anderer Ansichten freigegeben.

Version 0.1.9 öffnet beim Start alle gewählten Player direkt in den angelegten Split Views. Bei acht Ansichten werden beide Seiten aller vier Fenster sofort auf ihre Videoziele navigiert. Der Erststart verwendet keine Warteschlange, keinen Zeitabstand und kein Limit pro Fenster. Gespeicherte Ladepausen und reduzierte Parallelitätswerte halten einen ausdrücklich neu gestarteten Lauf nicht zurück.

Für spätere Ladevorgänge und Wiederholungen bleibt die Warteschlange aktiv. Bei HTTP 429 am Pluralsight-Video-Endpunkt pausieren diese Ladeversuche gemeinsam und die Erweiterung reduziert die Zahl gleichzeitig ladender Player. Ein betroffenes Video wird höchstens zweimal automatisch erneut geladen, frühestens nach 60 beziehungsweise 120 Sekunden; ein längeres Retry-After des Servers hat Vorrang. Mehrere 429 während derselben Ladepause reduzieren die Parallelität nur einmal. Nach mehreren erfolgreichen Ladevorgängen steigt sie schrittweise wieder auf bis zu vier. Laufende andere Videos bleiben davon unberührt. Gespeicherte Wartezeiten bleiben für Wiederholungen erhalten; der Erststart eines neuen Laufs wartet darauf nicht.

Der lesende webRequest-Listener für den Video-Endpunkt speichert die letzten 100 beobachteten Antworten im Laufprotokoll: Zeitpunkt, Ansicht, Fenster-ID, Clip, HTTP-Status, Anzahl ladender und laufender Ansichten im selben Fenster sowie ausgewählte Retry-After-/RateLimit-Header. Cookies, Authorization-Header und Antwortinhalte werden nicht gespeichert. Dadurch gehen die Diagnosedaten nicht beim Schließen der DevTools verloren.

1. Öffne chrome://extensions.
2. Aktiviere oben rechts den **Entwicklermodus**.
3. Klicke **Entpackte Erweiterung laden** und wähle den Ordner **extension/dist** aus diesem Projekt.
4. Pinne **Learning Helper · Video Displayer** über das Erweiterungsmenü an die Chrome-Symbolleiste.
5. Klicke auf das Erweiterungssymbol, um die Steuerseite zu öffnen.

Alternativ kannst du das lokal erzeugte [ZIP-Paket](releases/video-displayer-0.1.9.zip) entpacken und den entpackten Ordner laden. Node.js wird nur zum erneuten Bauen benötigt.

Nach Änderungen am Build auf der Chrome-Erweiterungsseite **Neu laden** wählen und bereits geöffnete Kursseiten neu laden, damit sie die neue Playersteuerung erhalten.

Beim Update auf 0.1.4 zuerst den alten Lauf über **Stoppen & Player schließen** beenden. Nach dem Neuladen der Erweiterung auch die Steuerseite und den Erfassungstab neu laden und den Kurs **Erneut erfassen**, damit die Videoziele mit der neuen Erkennung gelesen werden.

Beim Update ab Version 0.1.4 auf 0.1.9 genügt es, den alten Lauf zu stoppen, die Erweiterung und die Steuerseite neu zu laden und den Kurs erneut zu starten. Eine erneute Kurserfassung ist dafür nicht erforderlich. Wurde kurz zuvor HTTP 429 beobachtet, vor dem ersten Versuch eine Pause einlegen und zunächst zwei Ansichten verwenden.

## Einen Kurs starten

Version 0.1.9 prüft eingeklappte Bereiche anhand sichtbarer Kursabschnitt-Schaltflächen und ihrer zugehörigen Videolisten. Allgemeine Navigationsmenüs, ausgeblendete Kursansichten und Textdetails werden dabei nicht als geschlossene Module gewertet oder automatisch angeklickt. Die Warnungen stammen aus der letzten Kurserfassung: Nach manuellem Aufklappen **Erneut erfassen** wählen. Beim Update zusätzlich zuerst die Erweiterung, Steuerseite und Kursseite neu laden.

1. Füge einen vollständigen Kurs- oder Lektionslink ein und klicke **Kurs erfassen**. Bei einem Lektionslink wird der gesamte Kurs erfasst.
2. Die Erweiterung öffnet einen eigenen Kurstab und pausiert dort die Wiedergabe während der Erfassung. Melde dich bei Bedarf an und öffne die Kursnavigation. Über **Erneut erfassen** liest du die Seite neu ein.
3. Prüfe Titel, Videoanzahl und die Liste unter **Alle Videos und zugewiesene Ansichten**. Erkannte unvollständige oder mehrdeutige Listen verhindern den Start.
4. Wähle 1 bis 8 Ansichten. Die Vorschau verteilt nach Laufzeiten; unbekannte Dauern werden für die Verteilung geschätzt.
5. Klicke **In … Ansichten starten**. Alle Player werden direkt geöffnet. Bei Pluralsight werden bereite Ansichten sofort freigegeben. Bei LinkedIn wartet der gemeinsame Start, bis keine Ansicht mehr lädt. Fehler oder Lade-Timeouts anderer Ansichten halten bereite Player nicht dauerhaft auf.
6. Falls Chrome den automatischen Start ablehnt, erscheint im betroffenen Player ein Button **Wiedergabe starten**. Klicke diesen, nachdem der gemeinsame Lauf freigegeben wurde.

Für den ersten Plattformtest sind zwei Ansichten sinnvoll. Danach können vier Fenster mit acht Ansichten geprüft werden. Die gewünschte Fensteranordnung benötigt genügend Bildschirmfläche; Chrome-Mindestmaße werden geprüft.

## Während der Wiedergabe

- **Kurs entfernen:** entfernt diesen Kurs samt Erfassung und zugehörigem Lauf aus dem Displayer und schließt dessen eigene Tabs. Die Aktion ist auch bei einer fehlgeschlagenen Erfassung verfügbar und betrifft nur die gewählte Plattform und Kurskennung.
- **Alle pausieren / Fortsetzen:** steuert den gemeinsamen Lauf.
- **Pause / Fortsetzen** in einer Ansicht: steuert diesen Player einzeln.
- **Neu starten:** wiederholt das aktuelle Video dieser Ansicht ab Beginn.
- **Ton hier:** aktiviert den Ton einer Ansicht; der Start erfolgt stumm.
- **Öffnen:** holt die jeweilige Ansicht in den Vordergrund.
- **Stoppen & Player schließen:** beendet den Lauf und schließt dessen Player-Tabs. Der Erfassungstab bleibt geöffnet.
- **Plattformstatus neu lesen:** liest die aktuell sichtbaren Abschlusskennzeichnungen aus dem Erfassungstab erneut. Lade dort gegebenenfalls zuerst die Kursübersicht neu.
- **Protokoll speichern:** lädt ein lokales JSON-Protokoll mit Zuweisungen, Fehlern, Laufstatus und beobachtetem Plattformstatus herunter. Bei Playerproblemen enthält es außerdem Seitenpfad, erwartete und erkannte Video-ID sowie Medienfehlercode. Beobachtete Antworten des Pluralsight-Video-Endpunkts und ihre Begrenzungsheader bleiben ebenfalls im Protokoll erhalten.

Der Controller wechselt nach einem bestätigten Videoende zum nächsten zugewiesenen Video. Am Abschnittsende ersetzt eine lokale Abschlussseite den Player. Unerwartete Wiedergabe wird über einen Listener in der Capture-Phase pausiert. Die globalen Autoplay-Einstellungen der Plattform werden dabei nicht geändert.

**Vollständig abgespielt** setzt ein Videoende und zusammenhängende abgespielte Bereiche voraus. Ein Sprung ans Ende reicht nicht. **Von der Plattform abgeschlossen** wird separat angezeigt und kann auch schon vor dem Lauf gegolten haben. Ein Kurs kann zusätzliche Aufgaben enthalten, die für seinen Abschluss erforderlich sind.

## Unterbrechungen

Ein beendeter Erweiterungs-Service-Worker verliert die gespeicherten Zuweisungen nicht. Beim nächsten Ereignis liest er sie erneut ein.

Nach einem Browser-Neustart wird der Lauf pausiert. Wiederhergestellte Player können sich über einen lokalen Laufmarker aus ihrem Session-Speicher erneut zuordnen. Alte Tab-IDs werden verworfen, damit fremde Tabs nicht betroffen sind. Falls ein Profil den Session-Speicher oder die Wiederherstellung nicht erhält, muss der Lauf neu gestartet werden. Unterbrochene Videos werden über **Neu starten** ab Beginn wiederholt.

Wurde eine Ansicht geschlossen, zeigt die Steuerseite den Verlust an. In dieser ersten Version wird dafür kein automatischer Ersatzplayer geöffnet; stoppe den Lauf und starte den Kurs erneut.

## Lokal entwickeln und bauen

Voraussetzungen: Node.js ab 22.12, npm und für einen erstmaligen Abhängigkeitsdownload Zugang zur npm-Registry.

~~~sh
cd extension
npm ci
npm run typecheck
npm test
npm run build
~~~

Der Build liegt anschließend in dist. Zum Erzeugen des ZIP-Pakets:

~~~sh
npm run package
~~~

Der Paketbefehl verwendet das auf macOS vorhandene zip-Programm. Die Laufzeit der Erweiterung benötigt weder einen lokalen Webserver noch zusätzliche Dienste.

## Bekannte Grenzen dieser Version

- Der HTTP-429-Fehler am Pluralsight-Video-Endpunkt ist durch den Konsolenlog des Nutzers belegt. Die genaue serverseitige Quote ist unbekannt. Die automatische Anpassung garantiert nicht, dass acht parallele Streams akzeptiert werden. Bleibt die Begrenzung bestehen, später mit weniger Ansichten starten. CORS-Fehler von bam.nr-data.net betreffen die Telemetrie und lösen keine automatischen Wiederholungen aus.
- Die Begrenzung steuert von der Erweiterung ausgelöste Playernavigationen. Eigene Hintergrundanfragen und Wiederholungen der Plattform werden nicht verändert. Chrome kann geplante Weckzeiten verzögern; dadurch wird die Wartezeit länger, niemals absichtlich verkürzt.
- Vollständige Durchläufe auf LinkedIn und Pluralsight sind noch nicht live bestätigt. Die öffentlichen Kursdaten und simulierten Playerseiten ersetzen diese Prüfung nicht.
- Player in fremden Iframes, nicht zugängliche Videodaten und unbekannte Navigationsstrukturen können einen Start verhindern.
- Eingeklappte Module werden geöffnet. Ein generischer Collector für vollständig virtualisierte oder ausschließlich durch Scrollen geladene Kurslisten ist noch nicht implementiert. Erkennbare Abweichungen zwischen gemeldeter und gelesener Anzahl verhindern den Start.
- Ein einzelner Bildschirm und ein aktiver Kurslauf werden unterstützt. Nach dem Verlust einer Ansicht gibt es noch keine dynamische Neuverteilung.
- Die Erweiterung verteilt zusammenhängende Kursabschnitte. Eine globale Warteschlange mit beliebiger Videoreihenfolge ist eine mögliche spätere Erweiterung.

Die [Prüfergebnisse und offenen Live-Tests](../docs/video-displayer/IMPLEMENTIERUNG.md) dokumentieren die Grenze der bisherigen Verifikation.
