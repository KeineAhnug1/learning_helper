# Video Displayer: Implementierungsstand

Stand: 6. November 2026 · Version 0.1.9.

Version 0.1.9 korrigiert die zu weit gefasste Prüfung eingeklappter Kursbereiche. Bisher reichte ein beliebiges aria-expanded="false" innerhalb eines nav-/aside-Elements aus, um die gesamte Kurserfassung zu sperren; Sichtbarkeit und Bezug zum Kurs wurden nicht geprüft. Das automatische Aufklappen verwendete ebenfalls diese breite Auswahl. Beide Funktionen verwenden nun dieselbe Auswahl sichtbarer Kursabschnitt-Schaltflächen. Die Zuordnung erfolgt über die erkannten Kurslisten, Modulmerkmale, aria-controls und benachbarte Videolisten. Allgemeine Menüs, ausgeblendete Ansichten und kontrollierte Textdetails werden ausgeschlossen. Echte geschlossene Module, auch mit erst beim Öffnen angelegter Liste, bleiben berücksichtigt.

Die Steuerseite zeigt den Zustand der letzten Erfassung. Manuelles Aufklappen einer Plattformseite aktualisiert die gespeicherten Warnungen nicht von selbst; nach der Korrektur müssen Erweiterung und Kursseiten neu geladen und der Kurs erneut erfasst werden. Der direkte Start aller Player aus 0.1.8 bleibt erhalten.

Version 0.1.8 setzt den ausdrücklich gewünschten direkten Erststart um: Nach dem Anlegen der Fenster und Split Views navigiert die Erweiterung alle Player unmittelbar auf ihre zugewiesenen Ziele. Der Erststart durchläuft weder die Warteschlange noch die Begrenzung pro Fenster oder eine gespeicherte Ladepause. Alle Ansichten werden als ladend zugewiesen und erhalten den Startzeitpunkt vor der Navigation. Bereite Pluralsight-Player dürfen weiterhin bereits abspielen, während andere noch laden.

Die Warteschlange bleibt für Folgeclips und Wiederholungen erhalten. HTTP-429-Diagnose, Retry-After und begrenzte automatische Wiederholungen bleiben aktiv. Ein ausdrücklich neu gestarteter Lauf öffnet alle Player sofort; gespeicherte Wartezeiten wirken erst bei dessen nachfolgenden Ladevorgängen. Die bisherigen Tests für den gestaffelten Erststart wurden durch Prüfungen für acht direkte Videoziele in vier Split-View-Fenstern ersetzt, einschließlich gespeicherter Wartezeiten und reduzierter Parallelität.

Version 0.1.7 berücksichtigt die Fensterzuordnung beim Laden. Der Nutzer bestätigte für 0.1.6, dass von den ersten vier Ansichten jeweils eine pro Fenster abspielte und die zweite HTTP 429 erhielt. Der bisherige Scheduler startete tatsächlich zuerst beide Tabs der ersten zwei Fenster. Die neue Auswahl lässt höchstens einen Player pro Fenster gleichzeitig laden und bevorzugt bei freier Kapazität zuerst Fenster, die noch keine Ansicht geladen haben. Die zweite Ansicht darf nach der Bereitmeldung der ersten ohne festen Zeitabstand laden. Die Wiedergabe beider Ansichten bleibt parallel möglich.

Zusätzlich wird eine Mehrfachreduzierung innerhalb derselben Ladepause vermieden: Mehrere 429 derselben Ladewelle halbieren die Parallelität gemeinsam nur einmal. Vorher konnten zwei Ablehnungen den Wert unmittelbar von vier über zwei auf eins reduzieren. Serverwartezeiten bleiben erhalten. Das Protokoll ergänzt Fenster-ID sowie Anzahl der dort ladenden und laufenden Ansichten zum Antwortzeitpunkt. Das beobachtete Fehlermuster passt zu einer Wechselwirkung innerhalb eines Fensters, belegt aber noch keine serverseitige Quote pro Chrome-Fenster. Der neue Ablauf ist automatisiert geprüft und muss am angemeldeten Player bestätigt werden.

Version 0.1.6 korrigiert den zu langsamen Start aus 0.1.5. Die Ursache lag in der Erweiterung: LOAD_GAP erzwang nach jeder Playernavigation 15 Sekunden Wartezeit; zusätzlich sperrte jeder noch ladende Player sämtliche übrigen Ansichten. Ohne Fehler ergab sich dadurch bereits eine Mindestzeit von 105 Sekunden bis zur achten Navigation. Diese pauschale Einschränkung war durch den vorliegenden 429-Log nicht begründet.

Der feste Abstand entfällt. Zunächst dürfen vier Player gleichzeitig laden; jede Bereit- oder Fehlermeldung gibt den zugehörigen Ladeplatz sofort frei. Bereits bereite Pluralsight-Player werden auch dann zum Abspielen freigegeben, wenn andere noch laden. Alle acht Ansichten können weiterhin gleichzeitig abspielen. Nur ein tatsächlich beobachteter 429 löst eine gemeinsame Ladepause aus und halbiert die aktuelle Parallelität bis auf mindestens einen Ladeplatz. Nach mehreren erfolgreichen Ladevorgängen steigt sie schrittweise wieder bis auf vier. Retry-After, die begrenzten Wiederholungen und die persistierte Wartezeit bleiben erhalten. Vier Ladeplätze sind eine clientseitige Startvorgabe, keine ermittelte serverseitige Quote.

Das Laufprotokoll speichert nun bis zu 100 beobachtete Antworten des Video-Endpunkts mit Zeitpunkt, Ansicht, erwartetem Video, tatsächlichem Clip, HTTP-Status und Anzahl gerade ladender Ansichten. Nur ausgewählte Retry-After-/RateLimit-Header werden übernommen. Zugangsdaten, Cookies und Antwortinhalte werden nicht erfasst. Die konkrete Serverantwort des früheren 429 war beim Nutzer nicht mehr verfügbar; dessen exakte Quote oder Auslösebedingung lässt sich deshalb rückwirkend nicht bestimmen. Die neue Diagnoseaufzeichnung ermöglicht die weitere Eingrenzung, falls der Fehler erneut auftritt.

Version 0.1.5 reagiert auf den anschließend vom Nutzer gelieferten HTTP-429-Fehler am Endpunkt /video/delivery/api/v1/clips/56bf7072-557b-4509-8d4d-089b7120114c/versions/570f545b-f6ab-4e9a-b14e-8293ba75c7ea. Die zugleich gemeldeten CORS-Fehler von bam.nr-data.net gehören zur Telemetrie. Damit ist eine serverseitige Begrenzung der Videoanfragen belegt; die genaue Quote und ob gleichzeitige Streams zusätzlich begrenzt werden, sind unbekannt.

Pluralsight-Navigationen werden nun persistent eingereiht: ein ladender Player zur Zeit, mindestens 15 Sekunden Abstand zwischen Freigaben. Die Fenster erscheinen sofort mit einer Warteseite; bereite Videos starten nach und nach. Folgeclips und manuelle Wiederholungen nutzen dieselbe Warteschlange. Ein ladender Player gibt den Platz nach Bereitschaft, Fehler oder 45 Sekunden ohne Meldung frei. Die regelmäßige Prüfung kann einen Timeout später erkennen.

Ein lesender webRequest-Listener für den Pluralsight-Video-Endpunkt erkennt 429 und berücksichtigt Retry-After in Sekunden oder als HTTP-Datum. Neue Ladevorgänge aller Ansichten pausieren; pro Clip gibt es höchstens zwei automatische Wiederholungen mit mindestens 60 und 120 Sekunden Wartezeit. Bereits laufende andere Videos werden weiter abgespielt. Wartezeiten überleben Worker-Neustarts und das Stoppen eines Laufs. Globale oder einzelne Pause, Stoppen und Kursentfernung verhindern eine unerwünschte spätere Freigabe. Ein Browser-Neustart verwirft wartende Tab-Zuweisungen und bleibt wie bisher pausiert. Lokale Timer sorgen für zeitnahe Freigaben, Chrome-Alarme übernehmen nach einer Worker-Unterbrechung. Verspätete Alarme geben weiterhin nur eine Ansicht frei.

Diese Behandlung reduziert die von der Erweiterung verursachten Lastspitzen und respektiert bekannte Wartezeiten. Sie verändert keine Plattformanfragen, Zugangsdaten, Abschlusskennzeichnungen oder CORS-Einstellungen. Acht parallele Streams sind damit nicht live garantiert. Statuscodes ohne Bezug zum zugewiesenen Video, alte Dokumente, fremde Tabs und Telemetrieantworten werden nicht als Anlass zum Neuladen verwendet.

Version 0.1.4 ergänzt die Erkennung des vom Nutzer gelieferten ILX-Playerpfads mit drei UUIDs für Kurs, Modul und Clip. Direkte Clip-Links in der Kursnavigation liefern die Zuordnung zwischen Kursname und Kurs-UUID. Bei Button-Zielen wird der gezielte Klick kurzzeitig im Tab gespeichert und die anschließende Playeradresse an den aktuellen Auftrag gebunden; dies funktioniert auch über einen vollständigen Dokumentwechsel. Eine bereits markierte Schaltfläche allein bestätigt auf ILX noch keinen Player. Veraltete Aufträge, andere bekannte Kurs-UUIDs und doppelte Clip-Zuordnungen werden abgelehnt.

Die Startbarriere gibt bereite Ansichten frei, sobald die übrigen Ansichten bereit sind oder einen Fehler beziehungsweise Lade-Timeout melden. Die sichtbare Pluralsight-Meldung „there has been an issue loading your video“ wird getrennt von einer fehlenden Videozuordnung angezeigt. Das lokale Protokoll enthält bei Playerproblemen den Seitenpfad, erwartete und erkannte Video-ID, Anzahl der Medien und Medienfehlercode. Beim Update müssen der alte Lauf gestoppt, Erweiterung und Kursseiten neu geladen und der Kurs erneut erfasst werden.

Der Nutzertest bestätigt das Öffnen der vier geteilten Fenster. Er zeigte anschließend die fehlgeschlagene Videozuordnung der Version 0.1.3 und zusätzlich einen Ladefehler der Plattform. Der konkrete Playerlink ist als Regressionstest hinterlegt; Ursache und Behebung des zusätzlichen Plattform-Ladefehlers sowie ein vollständiger Live-Durchlauf bleiben unbestätigt.

Version 0.1.3 ergänzt „Kurs entfernen“ für erfasste, fehlgeschlagene und laufende Kurse. Die Aktion löscht nur den Eintrag mit der gewählten Plattform und Kurskennung, beendet dessen eigene Tabs und verhindert, dass verspätete Player- oder Erfassungsmeldungen den Eintrag wiederherstellen. Andere Kurse bleiben erhalten. Die Löschung wird in der geöffneten Chrome-Erweiterung ausgelöst; ein direkter Zugriff auf den Browser-Speicher war in der Entwicklungssitzung weiterhin nicht verfügbar.

Version 0.1.2 grenzt die Ladeprüfung auf sichtbare Ladeflags der erkannten Videoliste und ihrer Kurscontainer ein. Ladeflags am Seitenrumpf, in anderen Seitenteilen oder in ausgeblendeten Elementen blockieren eine stabile Videoliste nicht mehr. Dieselbe Prüfung gilt für die Erfassungsschleife und die Startfreigabe. Außerdem werden benachbarte Titel- und Zeitangaben beim Auslesen getrennt, sodass etwa „What Big Data Is Not4m“ als „What Big Data Is Not“ erscheint. Regressionstests prüfen die Freigabe, weiterhin gesperrte aktive Listen-Ladevorgänge und die Titelbereinigung.

Version 0.1.1 ergänzt die Erkennung neuer Pluralsight-Kurslinks im Format /ilx/video-courses/KURS/course-overview. Der vom Nutzer gemeldete Link zu Big Data Explained wird akzeptiert und bleibt beim Öffnen auf der ILX-Kursübersicht. Regressionstests prüfen die Linkerkennung und das Navigationsziel; der angemeldete ILX-Player bleibt Teil der offenen Live-Abnahme.

Die Chrome-Erweiterung ist implementiert, lokal baubar und als entpacktes Paket nutzbar. Die automatische Verifikation verwendet echte öffentliche Kursmetadaten sowie simulierte DOM-, Medien- und Chrome-APIs. Ein erfolgreicher Lauf in den angemeldeten Lernplattformen ist noch offen.

## Umgesetzt

| Bereich | Verhalten |
| --- | --- |
| Linkerkennung | Kurs- und Lektionslinks; LinkedIn-Organisationskontext bleibt erhalten; der Einstieg über Next steps erfasst den ganzen Kurs |
| Kurserfassung | Plattformspezifische Link- und Button-Erkennung, Laufzeiten, Modulzuordnung, Login-Hinweise, Öffnen eingeklappter Bereiche und Zurückweisung erkennbar unvollständiger Listen |
| Verteilung | Optimale zusammenhängende Abschnitte nach Laufzeit; 1 bis 8 Ansichten; Schätzungen bei fehlenden Dauern; keine Sonderregel für 16 Videos |
| Fenster | Native Split Views, Bildschirmraster, Prüfung von Split-IDs und Fenstermaßen; Aufräumen eigener Fenster bei Fehlern |
| Player | Gemeinsame Startfreigabe, Stummschaltung, automatischer Wechsel innerhalb des Abschnitts, lokale Abschlussseite am Ende |
| Steuerung | Gemeinsame und einzelne Pause, Fortsetzen, Wiederholung ab Beginn, Tonwahl, Fokus und Stoppen |
| Abschluss | Videoende plus abgespielte Bereiche; Plattformstatus separat und mit unbekanntem Status, wenn kein eindeutiges Signal vorhanden ist |
| Wiederaufnahme | Persistierter Laufzustand, serialisierte Nachrichtenverarbeitung, Ablehnung veralteter Ereignisse, Neuabgleich nach Worker-Neustart, pausierte Wiederherstellung nach Browser-Neustart |
| Auslieferung | Vite-Build, npm-Lockfile, ZIP-Paket, Bedienungsanleitung und exportierbares Laufprotokoll |

## Konkrete Playerstrategie

Die erste Version verwendet einen durch die Erweiterung gesteuerten Wechsel. Der Controller pausiert ungewollte Wiedergabe in der Capture-Phase, bestätigt Video-ID und abgespielte Bereiche und lässt den Hintergrundprozess anschließend das nächste zugewiesene Ziel öffnen. Für Button-Navigation wird das erkannte Kurselement verwendet.

Die globalen Autoplay-Einstellungen des Accounts werden nicht umgestellt. Damit entfällt eine profilweite Änderung, die mehrere Ansichten gegenseitig beeinflussen könnte. Ob die Capture-Phase bei den echten Playern alle Übergänge zuverlässig abdeckt, gehört weiterhin zur Live-Abnahme. Die Browser-Simulation prüft dieses Verhalten an kontrollierten Medienereignissen.

Bei einem vollständigen Abschnitt wird eine eigene Abschlussseite geöffnet. Bei einem Fehler bleibt die Zuweisung erhalten. Ein gescheiterter Autoplay-Start sperrt weitere automatische Startversuche lokal, bis ein manueller Start oder eine Wiederholung erfolgt.

## Verifikation

Abschließender Prüflauf am 6. November 2026:

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript | Ohne Fehler |
| Vitest | 95 Tests in neun Dateien bestanden |
| Produktionsbuild | Erfolgreich |
| Paket | ZIP erstellt; Inhalt stimmt mit dem dist-Ordner überein |
| Manifest und Dokumentation | Referenzierte lokale Dateien vorhanden |
| npm ci --dry-run | Lockfile-Konsistenz erfolgreich geprüft |

Die Testfälle decken folgende Bereiche ab:

- Die beiden öffentlichen Kursdatensätze: LinkedIn mit 14 Videos und 52:38 Minuten sowie Pluralsight mit acht Videos und 31:36 Minuten.
- Die Referenzwerte von 8:42 beziehungsweise 5:18 Minuten für den längsten Abschnitt bei acht Ansichten.
- Vollständige Suche als unabhängige Referenz für kleine Kurslisten, ungerade Größen, ungleiche und fehlende Laufzeiten sowie doppelte IDs.
- Institutionelle LinkedIn-Links, Pluralsight-Clip-Links und die Ablehnung fremder Ziele.
- Der konkrete ILX-Playerpfad, Kurs-UUID aus der Navigation, Button-Zuordnung mit und ohne vorher bekannte Kurs-UUID, Dokumentwechsel und sichtbare Plattform-Ladefehler.
- Direkter Erststart aller acht Player unabhängig von gespeicherter Wartezeit und reduziertem Ladelimit; progressive Wiedergabe, adaptive Parallelität bei späteren Ladevorgängen, Retry-After als Sekunden/Datum, zwei begrenzte Wiederholungen, gemeinsame Ladepause für Wiederholungen, verspätete Meldungen, Worker-Neustart, Pause/Stoppen sowie Folgeclips. Zeitabhängige Abläufe werden mit einer kontrollierten Testuhr geprüft, ohne echte Videoanfragen zu senden.
- Persistierte HTTP-Diagnose nach Worker-Neustart und Beschränkung der aufgezeichneten Header auf Begrenzungsangaben.
- Begrenzung pro Fenster bei späteren Wiederholungen, nur eine Reduzierung bei mehreren 429 derselben Ladepause und Fensterkontext im Protokoll.
- DOM-Erfassung einschließlich Login, mehrdeutiger Titel, Quiz-Einträge und erkennbar virtualisierter Listen.
- Eingeklappte Kursabschnitte: allgemeine Menüs, ausgeblendete Varianten und Textdetails lösen keinen Fehlalarm aus; tatsächliche geschlossene Module mit vorhandener oder erst später angelegter Liste werden erkannt und geöffnet.
- Startbarriere einschließlich Fehlern und Lade-Timeouts einzelner Ansichten, Abschnittsgrenzen, doppelte/veraltete Meldungen, Worker-Neustart und wiederverwendete Tab-IDs nach einem Browser-Neustart.
- Gebündelte Playersteuerung in JSDOM mit simulierten Medien: Start, Pause, abgespielte Bereiche, unzugewiesene Folgevideos, Autoplay-Ablehnung und unveränderte gewöhnliche Tabs.
- Gebündelte Steuerseite in JSDOM: Verteilungsvorschau, gewählte Ansichtenzahl, gesperrte unvollständige Kurse und sichere Textdarstellung von Kursinhalten.

Die TypeScript-Prüfung, Tests und der Produktionsbuild sind über die Befehle in der [Erweiterungsanleitung](../../extension/README.md) ausführbar. Das npm-Lockfile wurde zusätzlich mit einem Installations-Dry-Run geprüft. Der erstmalige Download aller Abhängigkeiten aus der Registry wurde in dieser Sitzung nicht getestet; zum lokalen Build wurden vorhandene Paketinstallationen verwendet.

## Grenzen der aktuellen Umgebung

Die erneuten HTTPS-Abrufe scheiterten in der Implementierungssitzung mit Could not resolve host. Die aus der Planung vorhandenen öffentlichen Kursdaten bleiben deshalb die Datenbasis.

Der Start eines isolierten Chromium-Prozesses wurde von der System-Sandbox blockiert: MachPortRendezvousServer meldete Permission denied. Auch der Zugriff auf das normale Chrome über Apple Events war nicht verfügbar. Deshalb wurden weder eine Browser-Erweiterung in einem echten Profil geladen noch angemeldete Videos abgespielt oder aktuelle Plattformabschlüsse geprüft. JSDOM rendert außerdem keine Browseroberfläche; eine visuelle Abnahme ist noch offen.

## Verbleibende Live-Abnahme

1. Die gebaute Erweiterung in das angemeldete Chrome-Profil laden.
2. Den [LinkedIn-Testlink](https://www.linkedin.com/learning/introduction-to-agentic-ai-governance/next-steps?autoSkip=true&leis=OCN&resume=false&u=57692769) und den [Pluralsight-Testlink](https://app.pluralsight.com/library/courses/big-data-explained) erfassen. Die vollständige Videoliste mit der Plattform vergleichen.
3. Bei beiden Kursen mit zwei Ansichten beginnen. Damit auch bei Pluralsight automatische Übergänge geprüft werden, genügt dort ein Lauf mit acht Ansichten allein nicht.
4. Native Split Views, ersten Playerstart, Videoidentität, automatischen Wechsel und Abschnittsende beobachten.
5. Mit vier Fenstern und acht Ansichten wiederholen und den Fokus auf andere Fenster wechseln.
6. Pause/Fortsetzen, Neu starten, Stoppen und Wiederherstellung nach einem Browser-Neustart erproben.
7. Kursübersicht neu laden, Plattformstatus erneut lesen und mit dem Zustand vor dem Lauf vergleichen. Vorher bereits abgeschlossene Videos belegen keine neue Fortschrittserfassung.
8. Das lokale Protokoll speichern und die Unterstützung je Plattform dokumentieren.

Wenn eine aktuelle Plattform andere DOM-Strukturen oder einen nicht zugänglichen Player verwendet, muss die entsprechende Erkennung anhand dieser Live-Beobachtung angepasst werden. Vollständig virtualisierte Listen und automatische Ersatzansichten sind ebenfalls noch offene Erweiterungen.
