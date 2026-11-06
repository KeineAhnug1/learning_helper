# Video Displayer: erste Prüfergebnisse

Prüfdatum: 6. November 2026. Zugehöriger [Umsetzungsplan](PLAN.md).

Geprüft wurden öffentliche HTTP-Antworten, öffentlich sichtbare Kursverzeichnisse, die Chrome-Dokumentation und die lokal installierte Chrome-Version. Die Verteilung wurde mit den ermittelten Laufzeiten berechnet. **Es wurden keine Videos im angemeldeten Browser abgespielt und keine Kursabschlüsse verifiziert.**

## 1. LinkedIn Learning

Testlink: [Introduction to Agentic AI Governance – Next steps](https://www.linkedin.com/learning/introduction-to-agentic-ai-governance/next-steps?autoSkip=true&leis=OCN&resume=false&u=57692769).

- Der Abruf lieferte HTTP 200 und eine öffentlich lesbare Lektionsseite.
- Die Seite gehört zum Kurs „Introduction to Agentic AI Governance“ und zeigt die Schlusslektion „Next steps“.
- Das HTML enthält ein Kursverzeichnis mit 14 Videoeinträgen, Laufzeiten und Lektionslinks.
- Die Seite fordert zur Anmeldung auf und kennzeichnet zahlreiche Lektionen als gesperrt. Die sichtbare Liste belegt daher die Kursstruktur, nicht den Zugriff auf alle Videos.
- Die Kursanzeige nennt gerundet 52 Minuten. Die einzelnen sichtbaren Laufzeiten ergeben 52:38 Minuten.

| Nr. | Video | Dauer |
| --- | --- | --- |
| 1 | Time to govern intelligence | 0:46 |
| 2 | The evolving risks of AI | 4:21 |
| 3 | An overview of the governance landscape | 3:40 |
| 4 | The challenges of governing AI | 3:38 |
| 5 | What is agentic AI? | 4:32 |
| 6 | Understanding the agency of AI | 4:21 |
| 7 | The urgency behind agentic AI governance | 3:54 |
| 8 | Transparency | 4:43 |
| 9 | AI safety alignment | 4:31 |
| 10 | Accountability | 4:11 |
| 11 | Best practices for documenting governance in agentic AI | 4:15 |
| 12 | Dimensions of agentic AI governance | 4:19 |
| 13 | The road ahead | 4:21 |
| 14 | Next steps | 1:06 |

Die Daten samt öffentlich verlinkten Lektionszielen sind als [JSON-Fixture](fixtures/linkedin-agentic-ai-governance.json) gespeichert. Die beobachteten Klassen `toc-item`, `table-of-contents__item-title` und `table-of-contents__item-duration` stammen aus der öffentlichen Seite. Ihre Gültigkeit im angemeldeten Player ist noch zu prüfen.

## 2. Pluralsight

Testlink: [Big Data Explained im Player](https://app.pluralsight.com/library/courses/big-data-explained). Ergänzend geprüft: [öffentliche Kursseite](https://www.pluralsight.com/courses/big-data-explained).

- Der angegebene App-Link lieferte HTTP 200 mit dem Titel „Pluralsight Skills Player“.
- Das Dokument enthält eine JavaScript-App-Hülle; eine vollständige Clip-Liste war daraus nicht ablesbar. Der Player wurde bei diesem HTTP-Abruf nicht ausgeführt.
- Die öffentliche Kursseite lieferte ebenfalls HTTP 200 und enthält drei Module mit insgesamt acht Videoeinträgen.
- Der Katalog nennt Alexander Tushinsky als Autor, den 9. Januar 2026 als Aktualisierungsdatum und gerundet 31 Minuten Gesamtdauer. Die Einzellaufzeiten ergeben 31:36 Minuten.
- Die Videoeinträge führen im öffentlichen HTML zu Zugangshinweisen. Funktionierende Clip-IDs und direkte Player-Ziele wurden damit nicht ermittelt.

| Nr. | Modul | Video | Dauer |
| --- | --- | --- | --- |
| 1 | What Is Big Data? | What Is Big Data? | 2:22 |
| 2 | What Is Big Data? | What Big Data Is Not | 4:48 |
| 3 | What Is Big Data? | Big Data Framework | 4:30 |
| 4 | Getting Big Data to Work | Getting Big Data to Work | 5:18 |
| 5 | Getting Big Data to Work | Big Data and Cloud Computing | 5:09 |
| 6 | Why We Need Big Data | Why We Need Big Data | 4:02 |
| 7 | Why We Need Big Data | Big Data and Decision Making | 3:02 |
| 8 | Why We Need Big Data | Wrap Up | 2:25 |

Die Titel und Laufzeiten sind als [JSON-Fixture](fixtures/pluralsight-big-data-explained.json) gespeichert. Unbekannte Lektionsziele sind dort ausdrücklich `null`. Die öffentlich beobachteten Klassen `clip-title` und `clip-duration` sind keine bereits bestätigten Selektoren für die App.

## 3. Chrome und Erweiterungsarchitektur

Die Datei `/Applications/Google Chrome.app/Contents/Info.plist` meldete lokal Chrome **157.0.8103.38**. Ein Laufzeittest der Erweiterungs-API erfolgte noch nicht.

Die am Prüftag abgerufene [Chrome-Tabs-Dokumentation](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-createSplit) beschreibt:

- `tabs.createSplit([tabIdA, tabIdB])` ab Chrome 155 zum Verbinden zweier Tabs.
- Zwei benachbarte Tabs mit gleichem Fenster-, Pin- und Gruppenstatus als Voraussetzung; beide dürfen noch nicht geteilt sein.
- `tabs.create({ splitWithTabId })` ab Chrome 155 als alternative Erzeugung eines zweiten Tabs im Split View.
- `Tab.splitViewId` zur Identifikation der gemeinsamen Ansicht.
- `tabs.unsplit()` ab Chrome 155 zum Auflösen eines Split Views.

Die [Windows-Dokumentation](https://developer.chrome.com/docs/extensions/reference/api/windows) ist die Grundlage für Fenstererzeugung und Positionierung. Das tatsächlich erreichbare 2×2-Layout hängt unter anderem von Bildschirmfläche und Mindestfenstermaßen ab.

Die Dokumentation zum [Service-Worker-Lebenszyklus](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) beschreibt unter anderem die mögliche Beendigung nach 30 Sekunden Inaktivität und empfiehlt persistierten Zustand. Deshalb sieht der Plan dauerhafte Zuweisungen und einen Abgleich mit vorhandenen Player-Tabs nach einem Worker-Neustart vor.

## 4. Geprüfte Referenzrechnung

Aus den extrahierten Laufzeiten wurden mit einem temporären Python-Skript acht zusammenhängende Abschnitte berechnet. Ein unabhängiger Vergleich über alle möglichen Schnittkombinationen bestätigte die minimale längste Abschnittsdauer:

| Kurs | Videos | Gesamtlaufzeit | Minimale längste Abschnittsdauer | Geprüfte Schnittkombinationen |
| --- | --- | --- | --- | --- |
| LinkedIn: Introduction to Agentic AI Governance | 14 | 52:38 | 8:42 | 1.716 |
| Pluralsight: Big Data Explained | 8 | 31:36 | 5:18 | 1 |

Zusätzlich wurde geprüft, dass alle Videoindizes genau einmal und in Reihenfolge zugewiesen sind. Ein synthetisches Beispiel mit 16 gleich langen Videos ergab acht Paare und damit die ursprünglich genannte Zahlenfolge als möglichen Spezialfall.

Die JSON-Fixtures speichern die berechneten Abschnitte mit. Sie sind datierte Testgrundlagen; die Erweiterung muss später die aktuellen Kursdaten lesen. Diese Rechnung belegt die Verteilung, aber keine reale Beschleunigung, Playerkompatibilität oder Anerkennung des Kursfortschritts.

## 5. Noch offene Live-Prüfungen

| Prüfung | LinkedIn | Pluralsight |
| --- | --- | --- |
| Vollständige Kursnavigation im angemeldeten Profil | Offen | Offen |
| Stabile Video-IDs und gezieltes Öffnen | Öffentliche Lektionslinks vorhanden; Playerprüfung offen | Offen |
| Native Split View in einer geladenen Erweiterung | Offen | Offen |
| Zwei gleichzeitig laufende Videos | Offen | Offen |
| Automatischer Wechsel innerhalb eines Abschnitts | Offen | Offen; zusätzlich mit nur zwei Ansichten testen |
| Stopp am Abschnittsende ohne Weiterlaufen | Offen | Offen |
| Acht Player in vier Fenstern, auch ohne Fokus | Offen | Offen |
| Plattformfortschritt nach paralleler Wiedergabe | Offen | Offen |

Diese Prüfungen benötigen die Implementierung einer kleinen Browser-Erweiterung und die angemeldeten Player. Der öffentliche HTTP-Abruf konnte sie nicht abdecken.
