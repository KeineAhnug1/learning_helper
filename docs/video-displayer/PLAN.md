# Umsetzungsplan: Video Displayer

Stand: 6. November 2026. Die erste Erweiterung ist implementiert und lokal gebaut. Dieser Plan dokumentiert die vereinbarte Zielsetzung. Der aktuelle [Implementierungsstand](IMPLEMENTIERUNG.md) benennt die umgesetzte Variante, Tests und Einschränkungen. Die Tests der angemeldeten Player stehen noch aus.

## 1. Ziel und Bedienung

Der Nutzer fügt einen LinkedIn-Learning- oder Pluralsight-Link ein. Die Erweiterung ermittelt den vollständigen Kurs, verteilt dessen Videos effizient auf bis zu acht Ansichten und öffnet dafür bis zu vier Chrome-Fenster mit jeweils zwei nativen Split-View-Tabs. Die Videos laufen automatisch bis zum Ende des jeweils zugewiesenen Abschnitts weiter.

Die Zahlenfolge 1, 3, 5, …, 15 beschreibt ausschließlich ein mögliches Beispiel für 16 ungefähr gleich lange Videos. Maßgeblich sind die tatsächlichen Laufzeiten, die Kursreihenfolge und die verfügbare Parallelität.

Vorgesehener Ablauf in der Oberfläche:

1. **Kurslink einfügen:** Kurs- und Lektionslinks werden akzeptiert.
2. **Kurs erfassen:** Im Chrome-Profil des Nutzers den Kurs öffnen, bei Bedarf Login abwarten, Titel, vollständige Videoliste und Laufzeiten ermitteln.
3. **Verteilung anzeigen:** Anzahl der Ansichten, Startvideo und Abschnitt pro Ansicht sowie geschätzte Gesamtdauer anzeigen. Vorgabe sind acht Ansichten, begrenzt durch die Videoanzahl.
4. **Starten:** Fenster erstellen, Player vorbereiten und gemeinsam starten. Die Vorschau startet noch keine Videos.
5. **Verfolgen:** Fortschritt, Pause/Fortsetzen, Stoppen und die hörbare Ansicht zentral bedienen.
6. **Ergebnis anzeigen:** Abgespielte Videos, offene Probleme und den tatsächlich beobachteten Plattformfortschritt zusammenfassen.

Ein eingefügter Link auf eine späte Lektion startet die Planung für den ganzen Kurs. Das gilt insbesondere für den angegebenen LinkedIn-Link auf „Next steps“.

## 2. Grundlage und bereits geprüfte Punkte

Die vollständigen Quellen, Videolisten und Grenzen der bisherigen Prüfung stehen in den [Testfindungen](TESTFINDUNGEN.md).

| Punkt | Ergebnis vom 6. November 2026 | Konsequenz |
| --- | --- | --- |
| LinkedIn-Testkurs | Öffentlich 14 Videos mit insgesamt 52:38 Minuten ermittelt | Konkrete Testdaten für Laufzeitverteilung und Lektionslink-Erkennung vorhanden |
| Pluralsight-Testkurs | App-Link liefert eine JavaScript-Hülle; öffentlicher Katalog enthält acht Videos mit insgesamt 31:36 Minuten | Testdaten vorhanden; tatsächliche Clip-IDs und Navigation im angemeldeten Player ermitteln |
| Lokales Chrome | Version 157.0.8103.38 aus der installierten App gelesen | Erfüllt die dokumentierte Mindestversion für die Split-View-API |
| Native Split Views | Chrome dokumentiert `tabs.createSplit()` und `tabs.create({ splitWithTabId })` ab Version 155 | Chrome-Erweiterung kann das gewünschte Fensterlayout direkt ansteuern |
| Parallele Wiedergabe und Abschluss | Noch kein Test im angemeldeten Browser erfolgt | Frühes Arbeitspaket; Voraussetzung für eine belastbare Unterstützungszusage |

## 3. Technische Entscheidung

Die erste Version wird eine **lokal ladbare Chrome-Erweiterung mit Manifest V3 und TypeScript**. Vite bündelt die Erweiterungsseiten und Content Scripts; Vitest prüft die plattformunabhängige Planungs- und Zustandslogik. Ein Backend ist für diesen Ablauf nicht erforderlich. Die spätere macOS-Menüleisten-App kann unabhängig entstehen.

Die Erweiterung verwendet das Profil, in dem sie installiert wurde, und öffnet dort die normalen Lernseiten. Die bestehenden Anmeldungen bleiben beim Browser.

### Komponenten

| Komponente | Verantwortung |
| --- | --- |
| Steuerseite | Linkeingabe, Verteilungsvorschau, Start/Pause/Stop und Status |
| Hintergrund-Service-Worker | Fenster und Tabs verwalten, Befehle koordinieren, Laufzustand speichern |
| Kursplaner | Geordnete Videos anhand ihrer Dauer auf Ansichten verteilen |
| Gemeinsamer Player-Controller | Wiedergabe beobachten, Übergänge koordinieren und Abschnittsgrenzen einhalten |
| LinkedIn-Adapter | Kurs und Lektion erkennen, Kursnavigation lesen, LinkedIn-Player bedienen |
| Pluralsight-Adapter | Kurs und Clip erkennen, Modulnavigation lesen, Pluralsight-Player bedienen |
| Lokaler Zustand | Lauf-ID, Zuweisungen, letzter bestätigter Zustand und erkannte Fehler |

Geplante Komponentenstruktur; die konkrete Implementierung liegt in ../../extension:

```text
extension/
  manifest.json
  src/
    background/      # Laufkoordination und Fensterverwaltung
    controller/      # Playerzustände und automatische Übergänge
    adapters/        # linkedin.ts, pluralsight.ts
    planner/         # Laufzeitverteilung
    shared/          # Datentypen und Nachrichten
    ui/              # Steuerseite und Einstellungen
  tests/            # Planer, Zustände und Adapter-Fixtures
docs/video-displayer/
  PLAN.md
  TESTFINDUNGEN.md
  fixtures/         # Bereits erfasste öffentliche Kursdaten
```

Im Manifest ist Chrome 155 als Mindestversion vorgesehen. Benötigt werden `storage`, die gezielten Host-Berechtigungen für die beiden Plattformen und gegebenenfalls `scripting` für die bestätigte Adaptertechnik. Weitere Player-Origins werden erst ergänzt, wenn die Untersuchung des angemeldeten Players sie tatsächlich zeigt. Die Bildschirm-Arbeitsfläche kann die Steuerseite zunächst über `screen.avail*` bestimmen.

### Native Fensteraufteilung

1. Pro Paar von Ansichten ein normales Chrome-Fenster erzeugen.
2. Zwei benachbarte, ungepinnte Tabs desselben Fensters öffnen.
3. Mit `chrome.tabs.createSplit([leftTabId, rightTabId])` verbinden; die Tabs müssen denselben Gruppenstatus haben und dürfen noch keinem Split View angehören.
4. Die vier Fenster in einem 2×2-Raster auf der verfügbaren Bildschirmfläche anordnen.
5. Zurückgelieferte Fenstermaße und `splitViewId` prüfen; macOS kann Mindestmaße vorgeben.

Bei einer ungeraden Anzahl von Ansichten bleibt das letzte Fenster ungeteilt. Bei kleinen Bildschirmen wird eine passende Zahl von Ansichten angeboten. Kann das gewünschte Layout nicht angelegt werden, erscheint ein konkreter Fehler mit der Option, weniger Ansichten zu verwenden.

Damit laufen die originalen Kursseiten als eigenständige Tabs in den geteilten Fenstern. Das Layout benötigt keine Einbettung der Lernseiten in eigene Iframes.

## 4. Erfassung des vollständigen Kurses

Jeder Adapter liefert denselben normalisierten Kursdatensatz:

- Plattform, stabile Kurskennung, Titel und Einstiegspunkt.
- Geordnete Videoeinträge mit stabiler Kennung, Titel, Modulzuordnung, Navigationsziel und Dauer.
- Kennzeichnung, ob eine Dauer gelesen oder geschätzt wurde.
- Erkannte Nichtvideo-Einträge, Zugangsprobleme und gegebenenfalls sichtbarer Abschlussstatus.
- Erfassungsstatus `vollständig`, `unvollständig` oder `Login erforderlich`.

**LinkedIn:** Den Kurs-Slug und gegebenenfalls Lektions-Slug aus dem Link lesen. Den institutionellen Kontext wie `u=57692769` beim Einstieg erhalten. `autoSkip` und `resume` des Eingabelinks dürfen die geplante Auswahl nicht unbemerkt verändern: Vor jeder Wiedergabe muss der Adapter die tatsächlich geladene Lektion bestätigen. Lektionsziele werden aus der Kursnavigation übernommen.

**Pluralsight:** Den Kurs-Slug `big-data-explained` erkennen. Erst im geladenen, angemeldeten Player bestimmen, welche Clip-IDs oder URLs die Navigation verwendet. Die öffentliche Katalogseite liefert Referenzdaten, aber keinen Nachweis für funktionierende direkte Clip-Aufrufe.

Bei eingeklappten oder nachgeladenen Modulen wird die Kursnavigation vollständig erschlossen. Doppelte Titel werden anhand stabiler IDs unterschieden. Fehlen Einträge oder sind IDs mehrdeutig, bleibt Start deaktiviert und der Grund wird angezeigt. Fehlende Laufzeiten allein verhindern die Planung nicht.

Quiz, Übung oder Dokument werden als eigener Inhaltstyp erfasst. Ihr Auftreten darf weder die Videoanzahl verfälschen noch versehentlich als Videoabschluss gelten. Ob ein Übergang daran vorbei zu einem zugewiesenen Video möglich ist, muss der Adapter feststellen; andernfalls wartet die betreffende Ansicht auf einen Eingriff.

## 5. Verteilung nach Laufzeit

### Zielgröße

Für `N` Videos und die gewünschte Zahl `K` von Ansichten gilt bei einem nicht leeren Kurs:

```text
K = min(gewünschte Ansichten, 8, N)

Abschnittsdauer = Summe der Videolaufzeiten dieses Abschnitts
Geschätzte Gesamtdauer = längste Abschnittsdauer
Ziel: diese längste Abschnittsdauer minimieren
```

Die erste Version plant mit normaler Wiedergabegeschwindigkeit. Bekannte Lade- und Übergangszeiten können später in die Schätzung eingehen. Eine rechnerische Dauer ist kein Versprechen für die reale Laufzeit oder den Plattformabschluss.

### Verfahren für die erste Version

Die geordnete Videoliste wird in `K` nicht leere, zusammenhängende Abschnitte zerlegt. Ein dynamisches Programm berechnet die optimale Verteilung unter genau dieser Bedingung:

```text
P[i] = Summe der Laufzeiten der ersten i Videos
D[k, i] = kleinste mögliche längste Abschnittsdauer
          bei i Videos auf k Abschnitten

D[0, 0] = 0; unmögliche Zustände = unendlich
D[k, i] = min über j von k-1 bis i-1:
          max(D[k-1, j], P[i] - P[j])
```

Die gespeicherten Schnittstellen ergeben Start- und Endvideo jeder Ansicht. Aufwand: `O(K × N²)` Zeit und `O(K × N)` Speicher. Für übliche Kursgrößen ist das ausreichend; für sehr große Listen kann später eine Binärsuche mit Greedy-Prüfung eingesetzt werden. Bei gleich guten Lösungen sorgt ein fester Tie-Breaker für reproduzierbare Ergebnisse.

Zusammenhängende Abschnitte nutzen die Kursreihenfolge und ermöglichen automatische Übergänge. Das Verfahren ist optimal für zusammenhängende Abschnitte, nicht für beliebig umsortierte Videos. Eine spätere Variante kann eine globale Warteschlange mit Zuweisung an frei werdende Ansichten gegen diese Lösung vergleichen. Dabei müssen zusätzliche Navigation und Ladezeiten berücksichtigt werden.

Fehlende Dauern werden zunächst mit dem Median der bekannten Videolängen geschätzt. Wenn alle fehlen, erhält jedes Video dasselbe Gewicht. Die Vorschau kennzeichnet diese Verteilung als geschätzt und zeigt keine belastbare Zeitprognose an. Nach dem Start bleiben Zuweisungen stabil; neue Dauerinformationen verbessern zunächst nur die Restzeitprognose.

### Berechnete Beispiele mit den Testkursen

| Fenster | LinkedIn links | LinkedIn rechts | Pluralsight links | Pluralsight rechts |
| --- | --- | --- | --- | --- |
| 1 | Videos 1–2 · 5:07 | Videos 3–4 · 7:18 | Video 1 · 2:22 | Video 2 · 4:48 |
| 2 | Video 5 · 4:32 | Videos 6–7 · 8:15 | Video 3 · 4:30 | Video 4 · 5:18 |
| 3 | Video 8 · 4:43 | Videos 9–10 · 8:42 | Video 5 · 5:09 | Video 6 · 4:02 |
| 4 | Videos 11–12 · 8:34 | Videos 13–14 · 5:27 | Video 7 · 3:02 | Video 8 · 2:25 |

Für LinkedIn ergeben sich hier die Startvideos **1, 3, 5, 6, 8, 9, 11 und 13**. Bei Pluralsight mit acht Videos startet jede Ansicht genau ein Video. Die Berechnung verwendet öffentliche Laufzeiten bei 1× ohne Ladezeiten.

Die Referenzrechnung wurde für LinkedIn gegen alle 1.716 möglichen Aufteilungen auf acht zusammenhängende Abschnitte geprüft. Das Minimum beträgt 8:42 Minuten; bei Pluralsight sind es 5:18 Minuten.

## 6. Automatisches Abspielen und Abschnittsgrenzen

Der Adapter muss zuerst bestätigen, welches Video geladen ist. Anschließend setzt der Controller die vorgesehene Audioausgabe und startet die Wiedergabe. Ein `play()`-Aufruf kann trotz geöffnetem Fenster abgewiesen werden; dann zeigt die Ansicht einen konkreten Startbedarf an. Eine automatische Wiedergabe wird erst zugesagt, wenn das im echten Player funktioniert.

Zwei Übergangsarten werden im Machbarkeitstest gegeneinander geprüft:

| Übergangsart | Einsatzbedingung |
| --- | --- |
| Natives Plattform-Autoplay | Folgevideo und Abschnittsende lassen sich zuverlässig kontrollieren |
| Von der Erweiterung gesteuerter Wechsel | Natives Autoplay lässt sich deaktivieren; die Erweiterung öffnet nach dem echten Videoende das nächste zugewiesene Video über die normale Player-Navigation |

Beide Varianten erfüllen das automatische Weiterlaufen. Für die erste Plattform wird die zuverlässig kontrollierbare Variante umgesetzt. Ein `ended`-Listener allein beweist noch nicht, dass das Plattform-Autoplay rechtzeitig gestoppt werden kann. Diese Reihenfolge und mögliche Rennen sind ausdrücklich zu testen.

Falls die Autoplay-Einstellung profilweit gilt, wird sie einmal für den ganzen Lauf verwaltet und am Ende passend wiederhergestellt. Einzelne Ansichten dürfen sich dabei nicht gegenseitig umkonfigurieren.

Der Controller beobachtet mindestens geladene Video-ID, Wiedergabe/Pause, aktuelle Position, Dauer, Pufferprobleme, Fehler und echtes Ende. Zeitablauf oder eine Navigation allein gelten nicht als Abschluss.

- Innerhalb des Abschnitts: nächstes zugewiesenes Video laden oder den nativen Wechsel bestätigen.
- Am Abschnittsende: weitere Wiedergabe beenden und die Ansicht als fertig markieren.
- Unerwartetes Video: sofort pausieren und die Zuordnung prüfen.
- Quiz, Login oder Fehlerseite: betroffene Ansicht auf „Eingriff erforderlich“ setzen.
- Manueller Tabwechsel oder Schließen einer Ansicht: in der Steuerseite anzeigen und verbleibende Arbeit erhalten.

Ein Adapter gilt erst als geeignet, wenn er unbeabsichtigtes Weiterlaufen über eine Abschnittsgrenze zuverlässig verhindern kann.

## 7. Zustand, Wiederaufnahme und Abschluss

Jeder Lauf besitzt eine eigene ID. Ein Video ist genau einer aktiven Ansicht zugewiesen. Nachrichten enthalten Lauf-ID, Ansichts-ID, Video-ID und Ereignisnummer; wiederholte oder veraltete Meldungen werden erkannt.

Der Zustand einer Ansicht durchläuft typischerweise:

```text
geplant → lädt → bereit → läuft → wechselt → läuft → Abschnitt beendet
                         ↕
                       pausiert

Jeder aktive Zustand kann in „Fehler“ oder „Eingriff erforderlich“ wechseln.
```

Manifest-V3-Service-Worker können nach Inaktivität beendet werden. Deshalb lebt die Beobachtung beim jeweiligen Player; Zuweisungen und bestätigte Übergänge werden lokal gespeichert. Nach einem Worker-Neustart werden die bestehenden Tabs abgeglichen. Ein abgelaufener Timer allein darf keine Doppelzuweisung auslösen. Vor einer Neuvergabe muss der bisherige Player nachweislich gestoppt oder geschlossen sein.

Nach einem Browser-Neustart wird eine Wiederaufnahme angeboten. Video-ID und Position werden zuerst geprüft. Gibt es für ein unterbrochenes Video keine belastbaren Informationen zur bereits abgespielten Strecke, beginnt es erneut; verlorene Zustände dürfen keine Videos überspringen.

Die Oberfläche führt getrennte Werte:

- **Wiedergabe:** geplant, läuft, unterbrochen oder vollständig abgespielt.
- **Plattform:** offen, als abgeschlossen beobachtet oder unbekannt.

Ein Abschluss aus dem Player wird gegen den sichtbaren Plattformstatus geprüft, gegebenenfalls nach einem erneuten Laden der Kursübersicht. Ein bestandener Test oder ein vollständig abgeschlossener Kurs wird daraus nicht automatisch abgeleitet.

## 8. Arbeitspakete und Reihenfolge

| Paket | Konkrete Arbeit | Prüfkriterium |
| --- | --- | --- |
| A · Machbarkeit im Profil | Kleine Erweiterung laden; native Split View anlegen; beide Kurse und ihre Player im angemeldeten Browser untersuchen | Kursdaten vollständig; zwei echte Player mit Übergang; Verhalten des Plattformfortschritts dokumentiert |
| B · Planer und Datentypen | Normalisiertes Kursmodell, Laufzeitpartitionierung und Verteilungsvorschau implementieren | Vollständige, überschneidungsfreie Zuweisung für kleine, ungerade und große Kurse; bekannte Referenzwerte erreicht |
| C · LinkedIn durchgängig | LinkedIn-Adapter, Start aus Lektionslink, Controller und acht Ansichten verbinden | Der echte 14-Video-Kurs läuft einschließlich mindestens eines automatischen Übergangs und aller Abschnittsenden durch |
| D · Pluralsight durchgängig | Tatsächliche Clip-Navigation und Player-Ereignisse anbinden | Der echte Acht-Video-Kurs läuft auf acht Ansichten; zusätzlich mit zwei Ansichten testen, damit mehrere Übergänge stattfinden |
| E · Unterbrechungen | Pause/Stop, Tabverlust, Login-Verlust, Worker-Neustart und Wiederaufnahme behandeln | Keine verlorenen Zuweisungen; keine doppelte aktive Wiedergabe durch Wiederanlauf |
| F · Lokale Auslieferung | Erweiterung bauen, Ladeanleitung und nachvollziehbares Testprotokoll ergänzen | Lokal ladbares Paket; Unterstützung und verbleibende Einschränkungen je Plattform dokumentiert |

A bestimmt die Playerstrategie. B kann mit den bereits erfassten Daten unabhängig vorbereitet werden. C und D bauen auf A und B auf; anschließend folgen E und F. Falls LinkedIn im Machbarkeitstest schlechter zugänglich ist, kann D vor C umgesetzt werden.

## 9. Testplan

### Automatisierte Tests

| Bereich | Wichtige Fälle |
| --- | --- |
| Kursplaner | 0, 1, 7, 8, 9, 14, 16, 17 und viele Videos; unterschiedliche und fehlende Laufzeiten; weniger als acht Ansichten |
| Planereigenschaften | Jede Video-ID genau einmal; geordnete, nicht leere Abschnitte; keine Lücken; Minimax-Ergebnis gegen vollständige Suche für kleine Listen |
| URL-Erkennung | Beide angegebenen Links; Lektionslink ergibt ganzen Kurs; institutioneller Kontext bleibt beim Einstieg erhalten |
| Erfassung | Eingeklappte und nachgeladene Module; doppelte Titel; Quiz zwischen Videos; unvollständige Kursliste |
| Übergänge | Ende eines Einzelvideos und eines Mehrvideoabschnitts; SPA-Navigation; doppeltes oder verspätetes Ereignis; unerwartetes Folgevideo |
| Wiederaufnahme | Worker-Neustart; Tab geschlossen; Pause beim Übergang; veraltete Meldungen eines früheren Laufs |

Player-Tests verwenden lokale, kontrollierbare Medienseiten und später bereinigte DOM-Fixtures der tatsächlich beobachteten Plattformen. Sie ersetzen nicht die Live-Prüfung.

### Tests mit den angegebenen Kursen

1. Mit einem Player Basisverhalten, Startposition, echten Videoabschluss und Plattformstatus dokumentieren.
2. Mit zwei Ansichten im Split View automatische Übergänge, Audio und Abschlussmeldungen prüfen.
3. Mit vier Fenstern und acht Ansichten alle Zuweisungen, reale Start- und Endzeiten sowie Fehler erfassen.
4. Den Fokus auf ein anderes Fenster wechseln und beobachten, ob alle Ansichten weiterlaufen.
5. Pause/Fortsetzen und Stoppen während Wiedergabe und Übergang ausführen.
6. Kursübersicht erneut laden und den Fortschritt mit dem Zustand vor dem Lauf vergleichen. Bereits abgeschlossene Videos sind kein Nachweis einer neuen Fortschrittserfassung.

Für Pluralsight ist der zusätzliche Zwei-Ansichten-Lauf zwingend: Acht Videos auf acht Ansichten testen keinen Übergang zum nächsten Video. Für LinkedIn ist zusätzlich nachzuweisen, dass der Einstieg über „Next steps“ trotzdem alle 14 Videos erfasst.

Das Protokoll hält Chrome-Version, Adapterversion, Ansichtenzahl, anfänglichen Plattformstatus, Übergänge, Laufzeiten und Abschlussstatus fest. Erst damit lässt sich je Plattform sagen, ob acht parallele Videos zuverlässig funktionieren und angerechnet werden.

## 10. Abnahme der ersten Version

- Beide Testlinks funktionieren als Einstieg und erfassen den vollständigen Kurs.
- Die erste Version verteilt nach Laufzeit; die 16er-Zahlenfolge ist nirgends als Regel hinterlegt.
- Vier native Split Views ergeben acht steuerbare Video-Ansichten, sofern mindestens acht Videos vorhanden sind.
- Jedes zugewiesene Video wird vollständig abgespielt; notwendige Wiederholungen nach Unterbrechungen werden ausgewiesen.
- Automatische Übergänge bleiben innerhalb der Zuweisung; fertige Ansichten stoppen.
- Fehlgeschlagene Playerstarts, unvollständige Kurslisten und unbekannter Plattformfortschritt werden sichtbar.
- Pause/Stop und Wiederaufnahme funktionieren ohne doppelte aktive Zuweisungen.
- Reale Unterstützung wird getrennt für LinkedIn Learning und Pluralsight anhand des Live-Protokolls angegeben.
