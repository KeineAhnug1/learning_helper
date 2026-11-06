import {
  clean,
  completion,
  entries,
  expandNavigation,
  navigateItem,
  readCourse,
  courseIsLoading,
  selectedVideo,
  assignedVideoMatches,
  playerLoadError,
} from '../adapters/dom';
import { playerAfterAssignedClick, type NavigationIntent } from './navigation';
import { errorText } from '../shared/types';
import type { Assignment, LaneStatus, PlayerEvent, Reply, Request, Task } from '../shared/types';

const docKey = crypto.randomUUID();
let task: Task = { mode: 'idle' },
  managed = false,
  allow = false,
  busy = false,
  scanning = false,
  disposed = false;
let observer: MutationObserver | undefined, timer: ReturnType<typeof setInterval> | undefined;
let current: HTMLVideoElement | null = null,
  prepared = '',
  finishing = '',
  sequence = 0,
  since = Date.now();
let clickedItem = '',
  statusText = 'Player wird vorbereitet …',
  lastReport = '',
  lastSent = 0;
let panel: HTMLElement | null = null,
  panelText: HTMLElement | null = null,
  startButton: HTMLButtonElement | null = null;
let resume: { runId: string; slot: number } | undefined;
let navigation: NavigationIntent | undefined,
  binding = '';
try {
  navigation =
    JSON.parse(sessionStorage.getItem('__learning_helper_navigation') ?? 'null') ?? undefined;
} catch {
  /* Optional restoration marker. */
}
function saveNavigation(value?: NavigationIntent): void {
  navigation = value;
  try {
    if (value) sessionStorage.setItem('__learning_helper_navigation', JSON.stringify(value));
    else sessionStorage.removeItem('__learning_helper_navigation');
  } catch {
    /* Same-document navigation still works. */
  }
}
async function bindNavigation(a: Assignment, url: string): Promise<void> {
  const key = identity(a);
  const intent = navigation;
  binding = key;
  let resolved = false;
  try {
    const next = await send<Task>({
      type: 'BIND_PLAYER',
      runId: a.runId,
      epoch: a.epoch,
      docKey,
      videoId: a.video.id,
      url,
    });
    const active = assignment();
    if (
      !disposed &&
      active &&
      identity(active) === key &&
      next.mode === 'run' &&
      identity(next.assignment) === key
    ) {
      task = next;
      resolved = true;
    }
  } catch (error) {
    const active = assignment();
    if (!disposed && active && identity(active) === key) report('waiting', errorText(error));
  } finally {
    if (navigation === intent) saveNavigation();
    if (binding === key) binding = '';
  }
  if (resolved) {
    prepare();
    updatePanel();
  }
}
try {
  const value = JSON.parse(sessionStorage.getItem('__learning_helper_run') ?? 'null');
  if (typeof value?.runId === 'string' && Number.isInteger(value.slot)) resume = value;
} catch {
  /* Some profiles disable session storage. */
}
const bound = new WeakSet<HTMLVideoElement>();
const assignment = (): Assignment | null => (task.mode === 'run' ? task.assignment : null);
const identity = (a: Assignment): string => a.runId + ':' + a.slot + ':' + a.epoch;
async function send<T>(request: Request): Promise<T> {
  const reply = await chrome.runtime.sendMessage<Reply<T>>(request);
  if (!reply?.ok) throw new Error(reply?.error ?? 'Keine Verbindung zur Erweiterung.');
  return reply.value;
}
function halt(): void {
  allow = false;
  for (const media of document.querySelectorAll('video')) media.pause();
}
function report(status: LaneStatus, error?: string, ended?: PlayerEvent['ended']): void {
  if (disposed) return;
  const a = assignment();
  if (!a) return;
  // Stop locally before the worker acknowledges a pause/error. DOM changes must not retry play.
  if (status === 'waiting' || status === 'error') a.blocked = true;
  if (status === 'paused') a.paused = true;
  if (status === 'playing') a.blocked = false;
  const signature = identity(a) + ':' + status + ':' + (error ?? '');
  if (!ended && signature === lastReport && Date.now() - lastSent < 5000) return;
  lastReport = signature;
  lastSent = Date.now();
  const row = entries(document, a.ref).find((e) => e.video.id === a.video.id)?.row;
  const message: PlayerEvent = {
    type: 'PLAYER',
    runId: a.runId,
    epoch: a.epoch,
    docKey,
    sequence: ++sequence,
    videoId: a.video.id,
    status,
    position: current?.currentTime ?? 0,
    completion: row ? completion(row) : 'unknown',
    error,
    ended,
    diagnostics: ['waiting', 'error'].includes(status)
      ? {
          page: location.origin + location.pathname,
          expectedVideo: a.video.id,
          selectedVideo: selectedVideo(document, a.ref, location.href),
          mediaElements: document.querySelectorAll('video').length,
          mediaError: current?.error?.code ?? null,
        }
      : undefined,
  };
  void send(message).catch(() => {
    halt();
    statusText = 'Verbindung unterbrochen. Steuerseite öffnen und dieses Video neu starten.';
    updatePanel();
  });
}
function updatePanel(): void {
  if (!managed || !document.body) return;
  if (!panel) {
    panel = document.createElement('section');
    panel.setAttribute('aria-label', 'Video Displayer');
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      zIndex: '2147483647',
      maxWidth: '310px',
      padding: '12px 16px',
      background: '#162e29',
      color: '#fff',
      borderRadius: '12px',
      font: '13px/1.5 system-ui',
      boxShadow: '0 4px 24px #0003',
    });
    const label = document.createElement('strong');
    label.textContent = 'Learning Helper · Video Displayer';
    panel.append(label);
    panelText = document.createElement('div');
    panel.append(panelText);
    startButton = document.createElement('button');
    startButton.textContent = 'Wiedergabe starten';
    Object.assign(startButton.style, {
      marginTop: '8px',
      padding: '6px 10px',
      border: '0',
      borderRadius: '6px',
      cursor: 'pointer',
    });
    startButton.addEventListener('click', () => {
      const a = assignment();
      if (a && !a.paused && current && prepared === identity(a)) void play(true);
    });
    panel.append(startButton);
    document.body.append(panel);
  }
  panelText!.textContent =
    task.mode === 'scan' ? 'Kurserfassung · Wiedergabe pausiert' : statusText;
  const a = assignment();
  startButton!.hidden = !(a && a.blocked && !a.paused && current && prepared === identity(a));
}
async function play(userGesture = false): Promise<void> {
  const a = assignment(),
    media = current;
  if (
    !a ||
    !media ||
    a.paused ||
    (a.blocked && !userGesture) ||
    finishing === identity(a) ||
    prepared !== identity(a)
  )
    return;
  if (!assignedVideoMatches(document, a.ref, a.video, location.href)) {
    halt();
    return;
  }
  const key = identity(a);
  allow = true;
  media.muted = a.muted;
  media.playbackRate = 1;
  try {
    await media.play();
    const now = assignment();
    if (!now || identity(now) !== key || now.paused) {
      halt();
      return;
    }
    statusText = 'Ansicht ' + (a.slot + 1) + ' · ' + a.video.title;
    report('playing');
  } catch (error) {
    const now = assignment();
    if (disposed || !now || identity(now) !== key || now.paused) return;
    halt();
    statusText = 'Chrome hat den Start angehalten. Hier auf „Wiedergabe starten“ klicken.';
    report(
      'waiting',
      error instanceof DOMException && error.name === 'NotAllowedError'
        ? statusText
        : errorText(error),
    );
  }
  updatePanel();
}
function bind(media: HTMLVideoElement): void {
  if (bound.has(media)) return;
  bound.add(media);
  media.addEventListener(
    'ended',
    () => {
      const a = assignment();
      if (
        !a ||
        !media.ended ||
        current !== media ||
        prepared !== identity(a) ||
        finishing === identity(a)
      )
        return;
      halt();
      finishing = identity(a);
      statusText = 'Video beendet · nächster Schritt wird bestätigt …';
      const ranges: [number, number][] = [];
      for (let i = 0; i < media.played.length; i++)
        ranges.push([media.played.start(i), media.played.end(i)]);
      report('ready', undefined, { duration: media.duration, ranges });
      updatePanel();
    },
    true,
  );
  media.addEventListener('loadstart', () => {
    if (current === media) {
      allow = false;
      prepared = '';
    }
  });
  media.addEventListener('emptied', () => {
    if (current === media) {
      allow = false;
      prepared = '';
    }
  });
  media.addEventListener('error', () => {
    if (current === media) {
      halt();
      statusText = 'Der Player meldet einen Medienfehler.';
      report('error', statusText);
      updatePanel();
    }
  });
  media.addEventListener('waiting', () => {
    if (current === media && allow) {
      statusText = 'Video puffert …';
      updatePanel();
    }
  });
  media.addEventListener('pause', () => {
    if (current === media && allow && !media.ended) {
      allow = false;
      statusText = 'Im Player pausiert. Über die Steuerseite fortsetzen.';
      report('paused');
      updatePanel();
    }
  });
}
// Capture phase stops unsolicited native autoplay, including a video outside this lane.
document.addEventListener(
  'play',
  (event) => {
    if (!managed || !(event.target instanceof HTMLVideoElement)) return;
    const a = assignment();
    if (
      !allow ||
      !a ||
      event.target !== current ||
      !assignedVideoMatches(document, a.ref, a.video, location.href)
    )
      event.target.pause();
  },
  true,
);
function prepare(): void {
  if (disposed) return;
  const a = assignment();
  if (!a) return;
  const key = identity(a);
  if (finishing === key) return;
  if (a.deferredUntil !== undefined || (a.blocked && a.message?.includes('HTTP 429'))) {
    halt();
    statusText = a.message ?? 'Wartet auf einen freien Ladeplatz.';
    return;
  }
  const problem = a.ref.platform === 'pluralsight' ? playerLoadError(document) : null;
  if (problem) {
    halt();
    statusText = problem;
    report('error', problem);
    return;
  }
  if (a.paused || a.blocked) {
    halt();
    statusText = a.blocked
      ? 'Eingriff erforderlich · Hinweise in der Steuerseite prüfen.'
      : 'Bereit · Wiedergabe pausiert';
  }
  if (!assignedVideoMatches(document, a.ref, a.video, location.href)) {
    halt();
    if (binding === key) return;
    const destination = playerAfterAssignedClick(navigation, a, location.href);
    if (destination) {
      void bindNavigation(a, destination);
      return;
    }
    expandNavigation(document, a.ref);
    if (
      a.video.target.kind === 'item' &&
      clickedItem !== key &&
      navigateItem(document, a.ref, a.video, () => {
        if (a.ref.platform === 'pluralsight')
          saveNavigation({
            runId: a.runId,
            epoch: a.epoch,
            slot: a.slot,
            videoId: a.video.id,
            sourcePage: location.href,
            createdAt: Date.now(),
          });
      })
    )
      clickedItem = key;
    if (Date.now() - since > 25000) {
      statusText = 'Das geladene Video konnte nicht eindeutig bestätigt werden.';
      report('waiting', statusText);
    }
    return;
  }
  const videos = Array.from(document.querySelectorAll('video')).filter(
    (v) => v.readyState >= 1 && Number.isFinite(v.duration) && v.duration > 0,
  );
  if (videos.length !== 1) {
    if (Date.now() - since > 25000) {
      statusText =
        videos.length > 1
          ? 'Mehrere Player gefunden. Das aktive Video ist nicht eindeutig.'
          : 'Kein zugänglicher Player gefunden. Anmeldung und Videofreigabe prüfen.';
      report('waiting', statusText);
    }
    return;
  }
  const media = videos[0];
  if (media.error) {
    halt();
    statusText =
      'Der Player meldet einen Medienfehler. Dieses Video über „Neu starten“ erneut laden.';
    report('error', statusText);
    return;
  }
  bind(media);
  if (current !== media) {
    halt();
    current = media;
    prepared = '';
  }
  if (prepared !== key) {
    halt();
    media.muted = a.muted;
    media.playbackRate = 1;
    if (media.currentTime > 0.05) {
      media.currentTime = 0;
      return;
    }
    prepared = key;
    statusText = 'Ansicht ' + (a.slot + 1) + ' bereit';
    report('ready');
  }
  media.muted = a.muted;
  if (!a.paused && !a.blocked && media.paused) void play();
  else if (!media.paused) report('playing');
}
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
async function scan(): Promise<void> {
  if (scanning || task.mode !== 'scan') return;
  scanning = true;
  const ref = task.ref;
  try {
    let fingerprint = '',
      stable = 0;
    for (let i = 0; i < 24; i++) {
      halt();
      expandNavigation(document, ref);
      await wait(400);
      if (disposed) return;
      const course = readCourse(document, ref),
        next = course.videos.map((v) => v.id + ':' + v.duration).join('|');
      stable = next === fingerprint ? stable + 1 : 0;
      fingerprint = next;
      if (course.videos.length && stable >= 3 && !courseIsLoading(document, ref)) break;
    }
    await send({ type: 'COURSE', course: readCourse(document, ref) });
  } catch (error) {
    await send({ type: 'SCAN_ERROR', error: errorText(error) }).catch(() => {});
  } finally {
    scanning = false;
    updatePanel();
  }
}
async function sync(): Promise<void> {
  if (busy || disposed) return;
  busy = true;
  try {
    const previous = assignment(),
      next = await send<Task>({ type: 'HELLO', docKey, resume });
    if (disposed) return;
    if (next.mode !== 'idle') managed = true;
    task = next;
    const a = assignment();
    if (a) {
      resume = { runId: a.runId, slot: a.slot };
      try {
        sessionStorage.setItem('__learning_helper_run', JSON.stringify(resume));
      } catch {
        /* Live playback works without restoration. */
      }
    }
    if (a && (!previous || identity(a) !== identity(previous))) {
      halt();
      current = null;
      prepared = '';
      finishing = '';
      sequence = 0;
      clickedItem = '';
      since = Date.now();
      lastReport = '';
    }
    if (task.mode === 'run') prepare();
    else if (managed) halt();
    updatePanel();
  } catch {
    if (managed) {
      halt();
      statusText = 'Verbindung zur Erweiterung unterbrochen.';
      updatePanel();
    }
  } finally {
    busy = false;
  }
}
chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  const type = (message as { type?: string })?.type;
  if (type === 'WAKE') {
    void sync();
    respond({ ok: true });
  }
  if (type === 'RESCAN') {
    void scan();
    respond({ ok: true });
  }
});
async function init(): Promise<void> {
  await sync();
  // Restored documents and onStartup can arrive in either order.
  for (let attempt = 0; resume && !managed && !disposed && attempt < 3; attempt++) {
    await wait(500);
    await sync();
  }
  if (!managed) return; // Leave ordinary tabs alone.
  if (document.readyState === 'loading')
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
    );
  if (task.mode === 'scan') void scan();
  observer = new MutationObserver(() => {
    if (managed && task.mode === 'run') prepare();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
  timer = setInterval(() => {
    void sync();
  }, 1500);
}
window.addEventListener(
  'pagehide',
  () => {
    if (managed) halt();
    disposed = true;
    managed = false;
    observer?.disconnect();
    if (timer) clearInterval(timer);
  },
  { once: true },
);
void init();
// An intervening user action invalidates a pending automatic navigation assignment.
document.addEventListener(
  'pointerdown',
  (event) => {
    if (event.isTrusted && navigation) saveNavigation();
  },
  true,
);
