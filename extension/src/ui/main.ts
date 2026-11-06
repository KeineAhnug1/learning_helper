import './style.css';
import { planCourse } from '../planner/partition';
import { errorText, time } from '../shared/types';
import type { AppState, Reply, Request, Run } from '../shared/types';

const root = document.querySelector<HTMLElement>('#app')!;
root.innerHTML =
  '<header class="header"><a class="brand" href="index.html"><span class="brand-mark">lh</span>Learning Helper</a><span class="pill">Chrome · Video Displayer</span></header><main><section class="intro"><div><span class="eyebrow">DEIN KURS. MEHRERE ANSICHTEN.</span><h1>Alles im Blick.<br><em>Einmal starten.</em></h1><p>Verteile deinen Videokurs nach Laufzeit auf bis zu acht Ansichten. Gemeinsam steuern, automatisch weiterschalten.</p></div><div class="window-art" aria-hidden="true"><div><i></i><i></i></div><div><i></i><i></i></div><div><i></i><i></i></div><div><i></i><i></i></div></div></section><section class="card setup"><form id="course-form"><label for="course-url">Welchen Kurs möchtest du öffnen?</label><div class="input-row"><input id="course-url" type="url" placeholder="LinkedIn-Learning- oder Pluralsight-Kurslink" required autocomplete="off"><button type="submit" id="scan-button">Kurs erfassen <span>↗</span></button></div></form><div class="settings"><label for="count">Parallele Ansichten <select id="count"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option><option>7</option><option selected>8</option></select></label><span>Bestehende Anmeldung im Chrome-Profil · Start mit stummer Wiedergabe</span></div></section><div id="notice" class="notice" role="status" hidden></div><section id="course"></section><section id="run"></section><footer>Lokale Erweiterung · Plattformabschluss und Wiedergabe werden getrennt angezeigt.</footer></main>';
const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
let state: AppState = {},
  busy = false,
  lastState = '',
  lastCourseRender = '';
const escape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const labels: Record<string, string> = {
  starting: 'Player werden vorbereitet',
  running: 'Wiedergabe läuft',
  paused: 'Pausiert',
  stopped: 'Gestoppt',
  complete: 'Wiedergabe beendet',
  loading: 'Lädt',
  queued: 'Wartet auf Laden',
  ready: 'Bereit',
  playing: 'Läuft',
  waiting: 'Eingriff erforderlich',
  error: 'Fehler',
  done: 'Abschnitt beendet',
};
const active = (run?: Run): boolean =>
  Boolean(run && !['stopped', 'complete'].includes(run.status));
function notice(message: string): void {
  el('notice').textContent = message;
  el('notice').hidden = !message;
}
async function request<T = AppState>(message: Request): Promise<T> {
  const reply = await chrome.runtime.sendMessage<Reply<T>>(message);
  if (!reply?.ok) throw new Error(reply?.error ?? 'Keine Antwort von der Erweiterung.');
  return reply.value;
}
async function perform(message: Request): Promise<void> {
  if (busy) return;
  busy = true;
  notice('');
  render();
  try {
    state = await request(message);
  } catch (error) {
    notice(errorText(error));
  } finally {
    busy = false;
    render();
  }
}
function render(): void {
  el<HTMLButtonElement>('scan-button').disabled = busy || active(state.run);
  const scan = state.scan,
    course = scan?.course,
    count = Number(el<HTMLSelectElement>('count').value);
  const host = el('course');
  const courseRender = JSON.stringify([scan, count, busy, active(state.run)]);
  if (courseRender !== lastCourseRender) {
    lastCourseRender = courseRender;
    if (!scan) {
      host.innerHTML =
        '<div class="empty"><span>01 / KURS WÄHLEN</span><p>Füge einen Kurslink ein. Auch der Link zu einer einzelnen Lektion erfasst den ganzen Kurs.</p></div>';
    } else if (!course) {
      host.innerHTML =
        '<section class="card"><div class="section-head"><h2>' +
        (scan.status === 'error' ? 'Kurserfassung angehalten' : 'Kurs wird erfasst …') +
        '</h2><button class="secondary" data-action="focus-scan">Kursfenster öffnen</button></div><p>' +
        escape(
          scan.error ?? 'Bitte im geöffneten Fenster anmelden. Nach der Anmeldung erneut erfassen.',
        ) +
        '</p><div class="section-actions"><button class="secondary" data-action="rescan">Erneut erfassen</button><button class="danger" data-action="remove-course">Kurs entfernen</button></div></section>';
    } else {
      let plan;
      try {
        plan = planCourse(course.videos, count);
      } catch (error) {
        notice(errorText(error));
        return;
      }
      const cards = plan.segments
        .map(
          (s) =>
            '<article class="plan-lane"><span>ANSICHT ' +
            (s.slot + 1) +
            '</span><strong>' +
            escape(course.videos.find((v) => v.id === s.videoIds[0])?.title) +
            '</strong><div>' +
            s.videoIds.length +
            ' Video' +
            (s.videoIds.length === 1 ? '' : 's') +
            ' <b>' +
            (plan.estimated ? 'geschätzt' : time(s.seconds)) +
            '</b></div></article>',
        )
        .join('');
      host.innerHTML =
        '<section class="card"><div class="section-head"><div><span class="eyebrow">' +
        (course.ref.platform === 'linkedin' ? 'LINKEDIN LEARNING' : 'PLURALSIGHT') +
        '</span><h2>' +
        escape(course.title) +
        '</h2></div><button class="secondary" data-action="focus-scan">Kurs öffnen ↗</button></div><div class="metrics"><div><strong>' +
        course.videos.length +
        '</strong><span>Videos</span></div><div><strong>' +
        time(plan.totalSeconds) +
        '</strong><span>Gesamtlaufzeit</span></div><div><strong>' +
        Math.ceil(plan.segments.length / 2) +
        '</strong><span>Chrome-Fenster</span></div><div><strong>' +
        time(plan.seconds) +
        '</strong><span>Berechnete Wiedergabezeit*</span></div></div>' +
        (!course.complete
          ? '<div class="warning">' +
            course.issues.map((i) => '<p>' + escape(i) + '</p>').join('') +
            '</div>'
          : '') +
        (scan.error ? '<p class="warning">' + escape(scan.error) + '</p>' : '') +
        '<div class="lane-grid">' +
        cards +
        '</div><div class="section-actions"><button data-action="start" ' +
        (!course.complete || busy || active(state.run) || !course.videos.length ? 'disabled' : '') +
        '>In ' +
        plan.segments.length +
        ' Ansichten starten →</button><button class="secondary" data-action="rescan" ' +
        (busy ? 'disabled' : '') +
        '>Erneut erfassen</button><button class="danger" data-action="remove-course">Kurs entfernen</button></div><p class="hint">* Bei normaler Geschwindigkeit, ohne Ladezeiten. ' +
        (plan.estimated ? 'Fehlende Laufzeiten werden für die Verteilung geschätzt. ' : '') +
        'Die tatsächliche Wiedergabe hängt vom jeweiligen Player ab.</p><details><summary>Alle Videos und zugewiesene Ansichten</summary><div class="table-wrap"><table><thead><tr><th>Video</th><th>Dauer</th><th>Ansicht</th></tr></thead><tbody>' +
        course.videos
          .map(
            (v, i) =>
              '<tr><td>' +
              (i + 1) +
              '. ' +
              escape(v.title) +
              '</td><td>' +
              time(v.duration) +
              '</td><td>' +
              ((plan.segments.find((s) => s.videoIds.includes(v.id))?.slot ?? 0) + 1) +
              '</td></tr>',
          )
          .join('') +
        '</tbody></table></div></details></section>';
    }
  }
  const run = state.run,
    runHost = el('run');
  if (!run) {
    runHost.innerHTML = '';
    return;
  }
  const confirmed = Object.values(run.progress).filter((x) => x === 'complete').length;
  runHost.innerHTML =
    '<section class="card live"><div class="section-head"><div><span class="eyebrow">WIEDERGABE</span><h2>' +
    labels[run.status] +
    '</h2></div><button class="secondary" data-action="export">Protokoll speichern ↓</button></div><div class="progress-track"><div style="width:' +
    (100 * run.completed.length) / run.course.videos.length +
    '%"></div></div><div class="progress-caption"><strong>' +
    run.completed.length +
    ' / ' +
    run.course.videos.length +
    ' vollständig abgespielt</strong><span>' +
    confirmed +
    ' von der Plattform als abgeschlossen erkannt</span></div>' +
    (run.error ? '<p class="warning">' + escape(run.error) + '</p>' : '') +
    '<div class="section-actions">' +
    (active(run)
      ? '<button class="secondary" data-action="pause">Alle pausieren</button><button data-action="resume">Fortsetzen</button><button class="danger" data-action="stop">Stoppen & Player schließen</button>'
      : '') +
    '<button class="secondary" data-action="rescan">Plattformstatus neu lesen</button><button class="danger" data-action="remove-run">Kurs entfernen</button></div><div class="lane-grid">' +
    run.lanes
      .map((l) => {
        const paused = l.status === 'paused' || l.pausedByUser;
        const v = run.course.videos.find(
          (v) => v.id === l.videoIds[Math.min(l.index, l.videoIds.length - 1)],
        );
        return (
          '<article class="plan-lane live-lane"><div class="lane-top"><span>ANSICHT ' +
          (l.slot + 1) +
          '</span><span class="status ' +
          l.status +
          '">' +
          labels[paused ? 'paused' : l.status] +
          '</span></div><strong>' +
          escape(v?.title) +
          '</strong><p>' +
          time(l.position) +
          ' · ' +
          Math.min(l.index + 1, l.videoIds.length) +
          ' / ' +
          l.videoIds.length +
          ' Videos</p>' +
          (l.message ? '<p class="lane-message">' + escape(l.message) + '</p>' : '') +
          '<div class="lane-actions">' +
          (l.tabId !== undefined
            ? '<button class="text-button" data-action="focus" data-slot="' +
              l.slot +
              '">Öffnen</button>'
            : '') +
          (active(run) && l.status !== 'done'
            ? '<button class="text-button" data-action="' +
              (paused ? 'resume' : 'pause') +
              '" data-slot="' +
              l.slot +
              '">' +
              (paused ? 'Fortsetzen' : 'Pause') +
              '</button><button class="text-button" data-action="retry" data-slot="' +
              l.slot +
              '">Neu starten</button><button class="text-button" data-action="audio" data-slot="' +
              l.slot +
              '">' +
              (run.audibleSlot === l.slot ? 'Stummschalten' : 'Ton hier') +
              '</button>'
            : '') +
          '</div></article>'
        );
      })
      .join('') +
    '</div></section>';
}
el('course-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void perform({ type: 'SCAN', url: el<HTMLInputElement>('course-url').value });
});
el('count').addEventListener('change', render);
root.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action,
    slot = button.dataset.slot === undefined ? undefined : Number(button.dataset.slot);
  if (action === 'start') {
    void perform({
      type: 'START',
      count: Number(el<HTMLSelectElement>('count').value),
      bounds: {
        left: screen.availLeft,
        top: screen.availTop,
        width: screen.availWidth,
        height: screen.availHeight,
      },
    });
  }
  if (action === 'rescan') void perform({ type: 'RESCAN' });
  if (action === 'remove-course' || action === 'remove-run') {
    const ref = action === 'remove-course' ? state.scan?.ref : state.run?.course.ref;
    if (ref) void perform({ type: 'REMOVE_COURSE', platform: ref.platform, slug: ref.slug });
  }
  if (action === 'focus-scan' && state.scan)
    void perform({ type: 'FOCUS', tabId: state.scan.tabId });
  if (action === 'focus') {
    const tabId = state.run?.lanes.find((l) => l.slot === slot)?.tabId;
    if (tabId !== undefined) void perform({ type: 'FOCUS', tabId });
  }
  if (['pause', 'resume', 'stop', 'retry'].includes(action ?? ''))
    void perform({
      type: 'CONTROL',
      action: action as 'pause' | 'resume' | 'stop' | 'retry',
      slot,
    });
  if (action === 'audio')
    void perform({ type: 'AUDIO', slot: state.run?.audibleSlot === slot ? null : slot! });
  if (action === 'export') {
    const report = {
      exportedAt: new Date().toISOString(),
      extensionVersion: '0.1.9',
      browser: navigator.userAgent,
      deliveryControl: {
        reducedLoadLimit: state.pluralsightLoadLimit,
        cooldownUntil: state.pluralsightLoadAfter,
      },
      run: state.run,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'video-displayer-protokoll.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
async function refresh(): Promise<void> {
  try {
    const next = await request({ type: 'STATE' });
    const signature = JSON.stringify(next);
    if (signature !== lastState) {
      state = next;
      lastState = signature;
      render();
    }
  } catch (error) {
    notice(errorText(error));
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.videoDisplayerState) void refresh();
});
render();
void refresh();
