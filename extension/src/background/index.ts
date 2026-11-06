import { planCourse } from '../planner/partition';
import { errorText } from '../shared/types';
import type {
  AppState,
  Assignment,
  Bounds,
  Course,
  Lane,
  Request,
  Run,
  Task,
} from '../shared/types';
import { parseCourse, targetUrl, pluralsightPlayer } from '../shared/urls';
import { acceptEvent, applyEvent, releaseStartBarrier } from './state';
import {
  LOAD_TIMEOUT,
  deferLoad,
  deferRateLimit,
  deliveryClip,
  parallelLoads,
  loadedSuccessfully,
  diagnosticHeaders,
} from './delivery';

const key = 'videoDisplayerState';
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}
const read = async (): Promise<AppState> => (await chrome.storage.local.get(key))[key] ?? {};
const save = async (state: AppState): Promise<void> => chrome.storage.local.set({ [key]: state });
const uiSender = (sender: ChromeSender): boolean =>
  Boolean(
    sender.url?.startsWith(chrome.runtime.getURL('index.html')) &&
    !sender.tab?.url?.startsWith('https:'),
  );
const activeRun = (run?: Run): run is Run =>
  Boolean(run && !['stopped', 'complete'].includes(run.status));
let loadTimer: ReturnType<typeof setTimeout> | undefined;
async function armLoads(when?: number): Promise<void> {
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = undefined;
  if (when === undefined) {
    await chrome.alarms.clear('load-players');
    return;
  }
  // Alarms restore the persisted queue if Chrome suspends the service worker.
  await chrome.alarms.create('load-players', { when });
  loadTimer = setTimeout(
    () => {
      loadTimer = undefined;
      void serial(async () => runLoads(await read()));
    },
    Math.min(2147483647, Math.max(1, when - Date.now())),
  );
}
async function runLoads(state: AppState): Promise<void> {
  const run = state.run;
  if (!activeRun(run)) {
    await armLoads();
    return;
  }
  const now = Date.now();
  for (const lane of run.lanes) {
    if (lane.status === 'loading' && now - lane.updatedAt >= LOAD_TIMEOUT) {
      lane.status = 'waiting';
      lane.message =
        'Player meldet sich nicht. Ansicht öffnen, Anmeldung prüfen und das Video neu starten.';
    }
  }
  const begin = releaseStartBarrier(run);
  if (run.course.ref.platform !== 'pluralsight' || run.status === 'paused') {
    await save(state);
    await armLoads();
    if (begin) void wake(run);
    return;
  }
  const startedWindows = new Set(
    run.lanes.filter((l) => l.loadStartedAt !== undefined || l.index > 0).map((l) => l.windowId),
  );
  const queued = run.lanes
    .filter(
      (l) =>
        l.loadAfter !== undefined &&
        l.tabId !== undefined &&
        l.status === 'queued' &&
        !l.pausedByUser,
    )
    .sort(
      (a, b) =>
        a.loadAfter! - b.loadAfter! ||
        Number(startedWindows.has(a.windowId)) - Number(startedWindows.has(b.windowId)) ||
        a.slot - b.slot,
    );
  const limit = parallelLoads(state);
  let loading = run.lanes.filter((l) => l.status === 'loading');
  const windowBusy = (lane: Lane) => loading.some((l) => l.windowId === lane.windowId);
  while (queued.length && loading.length < limit) {
    // A waiting sibling must not prevent another window from using a free load slot.
    const index = queued.findIndex(
      (l) => !windowBusy(l) && Math.max(state.pluralsightLoadAfter ?? 0, l.loadAfter!) <= now,
    );
    if (index < 0) break;
    const lane = queued.splice(index, 1)[0];
    lane.loadAfter = undefined;
    lane.status = 'loading';
    lane.message = undefined;
    lane.updatedAt = now;
    lane.loadStartedAt = now;
    lane.documentId = undefined;
    await save(state); // Persist before navigating so document_start sees the released task.
    try {
      await chrome.tabs.update(lane.tabId!, {
        url: targetUrl(
          run.course.videos.find((v) => v.id === lane.videoIds[lane.index])!,
          run.course.ref,
        ),
        muted: run.audibleSlot !== lane.slot,
        autoDiscardable: false,
      });
    } catch (error) {
      lane.status = 'error';
      lane.message = errorText(error);
    }
    loading = run.lanes.filter((l) => l.status === 'loading');
  }
  // Wake only when a queued lane may become eligible. Readiness/error events wake
  // sooner; a busy sibling otherwise owns its slot until the loading timeout.
  const next = queued.length
    ? Math.min(
        ...queued.map((lane) => {
          const blockers =
            loading.length >= limit ? loading : loading.filter((l) => l.windowId === lane.windowId);
          const freeAfter = blockers.length
            ? Math.min(...blockers.map((l) => l.updatedAt + LOAD_TIMEOUT))
            : 0;
          return Math.max(state.pluralsightLoadAfter ?? 0, lane.loadAfter!, freeAfter);
        }),
      )
    : undefined;
  await save(state);
  await armLoads(next);
  if (begin) void wake(run);
}
async function wake(run?: Run): Promise<void> {
  if (!run) return;
  await Promise.allSettled(
    run.lanes
      .filter((l) => l.tabId !== undefined && l.status !== 'done')
      .map((l) => chrome.tabs.sendMessage(l.tabId!, { type: 'WAKE' })),
  );
}
function validateCourse(course: Course): void {
  if (!course || !Array.isArray(course.videos) || course.videos.length > 2000)
    throw new Error('Ungültige oder zu große Kursliste.');
  const normalized = parseCourse(course.ref.url);
  if (normalized.slug !== course.ref.slug || normalized.platform !== course.ref.platform)
    throw new Error('Kurskennung stimmt nicht mit dem Link überein.');
  for (const video of course.videos) {
    if (
      !video.id ||
      !video.title ||
      !video.target ||
      (video.duration !== null && (!Number.isFinite(video.duration) || video.duration <= 0))
    )
      throw new Error('Ungültiger Videoeintrag. Bitte Kurs neu erfassen.');
    targetUrl(video, course.ref);
  }
  if (new Set(course.videos.map((v) => v.id)).size !== course.videos.length)
    throw new Error('Doppelte Video-IDs.');
}
function layout(bounds: Bounds, windows: number): Bounds[] {
  if (
    ![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width < 500 ||
    bounds.height < 360
  )
    throw new Error('Keine geeignete Bildschirmfläche erkannt.');
  const cols = windows > 1 ? 2 : 1,
    rows = Math.ceil(windows / cols),
    gap = 12;
  const width = Math.floor((bounds.width - gap * (cols - 1)) / cols),
    height = Math.floor((bounds.height - gap * (rows - 1)) / rows);
  if (width < 500 || height < 360)
    throw new Error(
      'Für dieses Layout ist der Bildschirm zu klein. Bitte weniger Ansichten wählen.',
    );
  return Array.from({ length: windows }, (_, i) => ({
    left: Math.round(bounds.left + (i % cols) * (width + gap)),
    top: Math.round(bounds.top + Math.floor(i / cols) * (height + gap)),
    width,
    height,
  }));
}
async function start(state: AppState, count: number, bounds: Bounds): Promise<AppState> {
  if (activeRun(state.run)) throw new Error('Den laufenden Kurs zuerst stoppen.');
  const course = state.scan?.course;
  if (!course?.complete || !course.videos.length)
    throw new Error('Zuerst einen vollständigen Kurs erfassen.');
  validateCourse(course);
  const plan = planCourse(course.videos, count);
  if (plan.segments.length > 1 && typeof chrome.tabs.createSplit !== 'function')
    throw new Error(
      'Native Split Views sind hier nicht verfügbar. Chrome 155 oder neuer verwenden.',
    );
  const positions = layout(bounds, Math.ceil(plan.segments.length / 2));
  const run: Run = {
    id: crypto.randomUUID(),
    course,
    lanes: plan.segments.map((s) => ({
      ...s,
      index: 0,
      epoch: 0,
      sequence: 0,
      status: 'loading',
      position: 0,
      updatedAt: Date.now(),
    })),
    status: 'starting',
    completed: [],
    progress: Object.fromEntries(course.videos.map((v) => [v.id, v.completion])),
    audibleSlot: null,
    createdAt: Date.now(),
    bounds,
  };
  state.run = run;
  await save(state);
  const created: number[] = [];
  try {
    for (let i = 0; i < positions.length; i++) {
      const win = await chrome.windows.create({
        url: chrome.runtime.getURL('waiting.html'),
        type: 'normal',
        focused: false,
        ...positions[i],
      });
      if (win.id === undefined) throw new Error('Chrome hat keine Fenster-ID zurückgegeben.');
      created.push(win.id);
      const left = win.tabs?.[0] ?? (await chrome.tabs.query({ windowId: win.id }))[0];
      if (left?.id === undefined) throw new Error('Der erste Tab konnte nicht erstellt werden.');
      const first = run.lanes[i * 2];
      first.tabId = left.id;
      first.windowId = win.id;
      const second = run.lanes[i * 2 + 1];
      if (second) {
        const right = await chrome.tabs.create({
          windowId: win.id,
          url: chrome.runtime.getURL('waiting.html'),
          active: false,
        });
        if (right.id === undefined) throw new Error('Der zweite Tab konnte nicht erstellt werden.');
        second.tabId = right.id;
        second.windowId = win.id;
        const split = await chrome.tabs.createSplit!([left.id, right.id]);
        const pair = await Promise.all([chrome.tabs.get(left.id), chrome.tabs.get(right.id)]);
        if (pair.some((t) => t.splitViewId !== split))
          throw new Error('Die geteilte Ansicht wurde von Chrome nicht bestätigt.');
      }
      const actual = await chrome.windows.update(win.id, positions[i]);
      if (
        (actual.width ?? positions[i].width) > positions[i].width + 8 ||
        (actual.height ?? positions[i].height) > positions[i].height + 8
      )
        throw new Error(
          'Die Chrome-Mindestmaße passen nicht in das gewählte Raster. Bitte weniger Ansichten wählen.',
        );
      await save(state); // Bind tabs before navigating: document_start can now obtain its task.
    }
    // Initial launch opens every assigned player directly. Queue limits and
    // recorded cooldowns apply to subsequent loads and retries only.
    for (const lane of run.lanes) {
      lane.updatedAt = Date.now();
      lane.loadStartedAt = lane.updatedAt;
    }
    await save(state);
    for (const lane of run.lanes) {
      const video = course.videos.find((v) => v.id === lane.videoIds[0])!;
      await chrome.tabs.update(lane.tabId!, {
        url: targetUrl(video, course.ref),
        muted: true,
        autoDiscardable: false,
      });
    }
    await save(state);
    return state;
  } catch (error) {
    run.status = 'stopped';
    run.error = errorText(error);
    await save(state);
    await armLoads();
    await Promise.allSettled(created.map((id) => chrome.windows.remove(id)));
    throw error;
  }
}
function task(state: AppState, tabId: number, docKey: string): Task {
  if (state.scan?.tabId === tabId) return { mode: 'scan', ref: state.scan.ref };
  const run = state.run;
  if (!activeRun(run)) return { mode: 'idle' };
  const lane = run.lanes.find((l) => l.tabId === tabId && l.status !== 'done');
  if (!lane) return { mode: 'idle' };
  if (lane.docKey !== docKey) {
    lane.docKey = docKey;
    lane.sequence = 0;
  }
  const video = run.course.videos.find((v) => v.id === lane.videoIds[lane.index])!;
  const assignment: Assignment = {
    runId: run.id,
    epoch: lane.epoch,
    slot: lane.slot,
    ref: run.course.ref,
    video,
    paused:
      run.status !== 'running' ||
      lane.status === 'paused' ||
      Boolean(lane.pausedByUser) ||
      lane.loadAfter !== undefined,
    blocked: ['waiting', 'error'].includes(lane.status) || lane.loadAfter !== undefined,
    muted: run.audibleSlot !== lane.slot,
    deferredUntil:
      lane.loadAfter !== undefined
        ? Math.max(lane.loadAfter, state.pluralsightLoadAfter ?? 0)
        : undefined,
    message: lane.message,
  };
  return { mode: 'run', assignment };
}
async function retry(state: AppState, lane: Lane): Promise<void> {
  const run = state.run!;
  if (lane.status === 'done') return;
  if (lane.tabId === undefined)
    throw new Error('Diese Ansicht wurde geschlossen. Lauf stoppen und den Kurs neu starten.');
  await chrome.tabs.get(lane.tabId); // Never replace an unconfirmed old player with a second one.
  if (run.course.ref.platform === 'pluralsight') {
    if (lane.loadAfter === undefined)
      deferLoad(
        lane,
        Math.max(Date.now(), state.pluralsightLoadAfter ?? 0),
        'Wartet auf erneutes Laden nach der Ladepause.',
      );
    await save(state);
    return;
  }
  lane.epoch++;
  lane.sequence = 0;
  lane.docKey = undefined;
  lane.position = 0;
  lane.status = 'loading';
  lane.message = undefined;
  lane.updatedAt = Date.now();
  await save(state);
  await chrome.tabs.update(lane.tabId, {
    url: targetUrl(
      run.course.videos.find((v) => v.id === lane.videoIds[lane.index])!,
      run.course.ref,
    ),
  });
}
async function handle(request: Request, sender: ChromeSender): Promise<unknown> {
  if (!request || typeof request.type !== 'string') throw new Error('Ungültige Nachricht.');
  const contentTypes = ['HELLO', 'COURSE', 'SCAN_ERROR', 'PLAYER', 'BIND_PLAYER'];
  if (!contentTypes.includes(request.type) && !uiSender(sender))
    throw new Error('Diese Aktion ist nur über die Steuerseite verfügbar.');
  if (contentTypes.includes(request.type) && (sender.tab?.id === undefined || sender.frameId !== 0))
    throw new Error('Unbekannter Player-Absender.');
  const state = await read();
  switch (request.type) {
    case 'STATE':
      return state;
    case 'REMOVE_COURSE': {
      const matches = (ref?: { platform: string; slug: string }) =>
        ref?.platform === request.platform && ref.slug === request.slug;
      const removeScan = matches(state.scan?.ref);
      const removeRun = matches(state.run?.course.ref);
      if (!removeScan && !removeRun) throw new Error('Dieser Kurs ist nicht mehr gespeichert.');
      const tabIds = new Set<number>();
      if (removeScan && state.scan) {
        tabIds.add(state.scan.tabId);
        delete state.scan;
      }
      if (removeRun && state.run) {
        for (const lane of state.run.lanes) if (lane.tabId !== undefined) tabIds.add(lane.tabId);
        delete state.run;
      }
      // Invalidate assignments before closing tabs so late player events cannot restore them.
      await save(state);
      if (removeRun) await armLoads();
      await Promise.allSettled([...tabIds].map((id) => chrome.tabs.remove(id)));
      return state;
    }
    case 'SCAN': {
      if (activeRun(state.run)) throw new Error('Den laufenden Kurs zuerst stoppen.');
      const ref = parseCourse(request.url);
      const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
      if (tab.id === undefined) throw new Error('Das Kursfenster konnte nicht geöffnet werden.');
      const previous = state.scan?.tabId;
      state.scan = { tabId: tab.id, ref, status: 'loading' };
      await save(state);
      await chrome.tabs.update(tab.id, { url: ref.url });
      if (previous !== undefined) await chrome.tabs.remove(previous).catch(() => {});
      return state;
    }
    case 'RESCAN': {
      if (!state.scan) throw new Error('Zuerst einen Kurslink eingeben.');
      state.scan.status = 'loading';
      state.scan.error = undefined;
      await save(state);
      await chrome.tabs.sendMessage(state.scan.tabId, { type: 'RESCAN' }).catch(() => {
        throw new Error('Kursseite öffnen und die Anmeldung abschließen. Danach erneut erfassen.');
      });
      return state;
    }
    case 'HELLO': {
      if (typeof request.docKey !== 'string') throw new Error('Ungültige Dokumentkennung.');
      // Browser restarts may recycle tab IDs. Rebind only a tab carrying this run's marker.
      const resume = request.resume,
        run = state.run;
      if (resume && activeRun(run) && resume.runId === run.id) {
        const lane = run.lanes.find(
          (l) => l.slot === resume.slot && l.tabId === undefined && l.status !== 'done',
        );
        const origin = new URL(run.course.ref.url).origin;
        if (lane && sender.url?.startsWith(origin + '/')) {
          lane.tabId = sender.tab!.id;
          lane.windowId = sender.tab!.windowId;
        }
      }
      const result = task(state, sender.tab!.id!, request.docKey);
      const activeLane = state.run?.lanes.find((l) => l.tabId === sender.tab!.id);
      if (activeLane && sender.documentId) activeLane.documentId = sender.documentId;
      await save(state);
      return result;
    }
    case 'COURSE': {
      if (!state.scan || state.scan.tabId !== sender.tab!.id)
        throw new Error('Veraltete Kurserfassung.');
      validateCourse(request.course);
      if (
        request.course.ref.slug !== state.scan.ref.slug ||
        request.course.ref.platform !== state.scan.ref.platform
      )
        throw new Error('Der erkannte Kurs passt nicht zur Anfrage.');
      state.scan.course = request.course;
      state.scan.status = 'ready';
      state.scan.error = undefined;
      if (
        state.run?.course.ref.slug === request.course.ref.slug &&
        state.run.course.ref.platform === request.course.ref.platform
      )
        for (const v of request.course.videos) state.run.progress[v.id] = v.completion;
      await save(state);
      return state;
    }
    case 'SCAN_ERROR': {
      if (state.scan && state.scan.tabId === sender.tab!.id) {
        state.scan.status = 'error';
        state.scan.error = request.error;
        await save(state);
      }
      return state;
    }
    case 'START':
      return start(state, request.count, request.bounds);
    case 'BIND_PLAYER': {
      const run = state.run;
      const lane = run?.lanes.find((l) => l.tabId === sender.tab!.id);
      const route = pluralsightPlayer(request.url);
      if (
        !activeRun(run) ||
        run.id !== request.runId ||
        !lane ||
        lane.loadAfter !== undefined ||
        lane.epoch !== request.epoch ||
        lane.docKey !== request.docKey ||
        lane.videoIds[lane.index] !== request.videoId ||
        run.course.ref.platform !== 'pluralsight' ||
        !route ||
        !sender.url?.startsWith('https://app.pluralsight.com/')
      )
        throw new Error('Die Player-Zuordnung passt nicht zum aktiven Auftrag.');
      if (
        run.course.ref.pluralsightCourseId &&
        run.course.ref.pluralsightCourseId !== route.courseId
      )
        throw new Error('Der Player gehört zu einem anderen Kurs.');
      const video = run.course.videos.find((v) => v.id === request.videoId)!;
      if (
        video.target.kind === 'url' &&
        pluralsightPlayer(video.target.url)?.clipId !== route.clipId
      )
        throw new Error('Das zugewiesene Videoziel hat sich geändert.');
      if (
        run.course.videos.some(
          (v) =>
            v.id !== video.id &&
            v.target.kind === 'url' &&
            pluralsightPlayer(v.target.url)?.clipId === route.clipId,
        )
      )
        throw new Error('Dieses Video ist bereits einer anderen Ansicht zugeordnet.');
      run.course.ref.pluralsightCourseId = route.courseId;
      video.target = { kind: 'url', url: route.url };
      await save(state);
      return task(state, sender.tab!.id!, request.docKey);
    }
    case 'PLAYER': {
      const run = state.run;
      if (!run) return state;
      const lane = acceptEvent(run, sender.tab!.id!, request);
      if (!lane) return state;
      if (
        run.course.ref.platform === 'pluralsight' &&
        lane.status === 'loading' &&
        request.status === 'ready' &&
        !request.ended
      )
        loadedSuccessfully(state);
      const result = applyEvent(run, lane, request);
      const begin = releaseStartBarrier(run);
      await save(state);
      if (result === 'done')
        await chrome.tabs
          .update(lane.tabId!, { url: chrome.runtime.getURL('finished.html') })
          .catch(() => {});
      if (result === 'advance') {
        if (run.course.ref.platform === 'pluralsight') {
          lane.loadAfter = Date.now();
          lane.status = 'queued';
          lane.message = 'Das nächste Video wird vorbereitet.';
        } else
          try {
            await chrome.tabs.update(lane.tabId!, {
              url: targetUrl(
                run.course.videos.find((v) => v.id === lane.videoIds[lane.index])!,
                run.course.ref,
              ),
            });
          } catch (error) {
            lane.status = 'error';
            lane.message = errorText(error);
            await save(state);
          }
      }
      await runLoads(state);
      if (begin) void wake(run);
      return state;
    }
    case 'CONTROL': {
      const run = state.run;
      if (!activeRun(run)) throw new Error('Kein aktiver Lauf.');
      const lanes =
        request.slot === undefined ? run.lanes : run.lanes.filter((l) => l.slot === request.slot);
      if (request.action === 'stop') {
        run.status = 'stopped';
        await save(state);
        await armLoads();
        // Closing only our player tabs also stops playback when a content script is unresponsive.
        await Promise.allSettled(
          run.lanes.flatMap((l) => (l.tabId === undefined ? [] : [chrome.tabs.remove(l.tabId)])),
        );
        return state;
      }
      if (request.action === 'retry') {
        for (const lane of lanes) await retry(state, lane);
        await runLoads(state);
        return state;
      }
      if (request.slot === undefined) {
        run.status = request.action === 'pause' ? 'paused' : 'running';
        run.error = undefined;
      }
      for (const lane of lanes) {
        if (request.slot !== undefined || request.action === 'resume')
          lane.pausedByUser = request.action === 'pause';
        if (lane.loadAfter !== undefined) {
          if (request.slot !== undefined || request.action === 'resume')
            lane.status = request.action === 'pause' ? 'paused' : 'queued';
        } else if (lane.status !== 'done' && !['error', 'waiting', 'loading'].includes(lane.status))
          lane.status = request.action === 'pause' ? 'paused' : 'ready';
      }
      await save(state);
      await runLoads(state);
      await wake(run);
      return state;
    }
    case 'AUDIO': {
      const run = state.run;
      if (!activeRun(run)) throw new Error('Kein aktiver Lauf.');
      if (request.slot !== null && !run.lanes.some((l) => l.slot === request.slot))
        throw new Error('Unbekannte Ansicht.');
      run.audibleSlot = request.slot;
      await save(state);
      await Promise.allSettled(
        run.lanes
          .filter((l) => l.tabId !== undefined)
          .map((l) => chrome.tabs.update(l.tabId!, { muted: l.slot !== request.slot })),
      );
      await wake(run);
      return state;
    }
    case 'FOCUS': {
      if (
        request.tabId !== state.scan?.tabId &&
        !state.run?.lanes.some((l) => l.tabId === request.tabId)
      )
        throw new Error('Dieser Tab gehört nicht zum Displayer.');
      const tab = await chrome.tabs.update(request.tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return state;
    }
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  void serial(() => handle(message as Request, sender)).then(
    (value) => respond({ ok: true, value }),
    (error) => respond({ ok: false, error: errorText(error) }),
  );
  return true;
});
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('index.html'), active: true });
});
chrome.tabs.onRemoved.addListener((id) => {
  void serial(async () => {
    const state = await read();
    let changed = false;
    if (state.scan?.tabId === id) {
      state.scan.status = 'error';
      state.scan.error = 'Das Kursfenster wurde geschlossen. Den Link erneut erfassen.';
      changed = true;
    }
    if (activeRun(state.run))
      for (const lane of state.run.lanes)
        if (lane.tabId === id && lane.status !== 'done') {
          lane.tabId = undefined;
          lane.loadAfter = undefined;
          lane.status = 'error';
          lane.message = 'Ansicht geschlossen. Lauf stoppen und neu starten.';
          changed = true;
        }
    const begin = releaseStartBarrier(state.run);
    if (changed || begin) await save(state);
    if (changed) await runLoads(state);
    if (begin) await wake(state.run);
  });
});
chrome.runtime.onStartup.addListener(() => {
  void serial(async () => {
    const state = await read();
    await armLoads();
    state.scan = undefined;
    for (const lane of state.run?.lanes ?? []) {
      lane.tabId = undefined;
      lane.windowId = undefined;
      lane.docKey = undefined;
      lane.loadAfter = undefined;
    }
    if (!activeRun(state.run)) {
      await save(state);
      return;
    }
    state.run.status = 'paused';
    state.run.error =
      'Browser neu gestartet. Vor dem Fortsetzen werden die gespeicherten Player geprüft.';
    for (const lane of state.run.lanes) {
      lane.tabId = undefined;
      lane.windowId = undefined;
      lane.docKey = undefined;
      lane.epoch++;
      lane.sequence = 0;
      if (lane.status !== 'done') {
        lane.status = 'waiting';
        lane.message =
          'Playerfenster wiederherstellen und mit „Neu starten“ dieses Video ab Beginn wiederholen.';
      }
    }
    await save(state);
  });
});
void chrome.alarms.create('check-players', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!['check-players', 'load-players'].includes(alarm.name)) return;
  void serial(async () => {
    const state = await read();
    await runLoads(state);
  });
});
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const clip = deliveryClip(details.url);
    if (!clip || details.tabId < 0) return;
    void serial(async () => {
      const state = await read(),
        run = state.run;
      if (!activeRun(run) || run.course.ref.platform !== 'pluralsight') return;
      const lane = run.lanes.find((l) => l.tabId === details.tabId && l.status !== 'done');
      if (
        !lane ||
        lane.loadAfter !== undefined ||
        (lane.loadStartedAt !== undefined && details.timeStamp < lane.loadStartedAt) ||
        (details.documentId && lane.documentId && details.documentId !== lane.documentId)
      )
        return;
      const video = run.course.videos.find((v) => v.id === lane.videoIds[lane.index]);
      const expectedClip =
        video?.target.kind === 'url' ? pluralsightPlayer(video.target.url)?.clipId : undefined;
      const headers = diagnosticHeaders(details.responseHeaders);
      run.deliveryLog = [
        ...(run.deliveryLog ?? []),
        {
          at: details.timeStamp,
          slot: lane.slot,
          videoId: video!.id,
          clipId: clip,
          status: details.statusCode,
          matchesAssignment: expectedClip ? expectedClip === clip : null,
          loading: run.lanes.filter((l) => l.status === 'loading').length,
          windowId: lane.windowId,
          loadingInWindow: run.lanes.filter(
            (l) => l.windowId === lane.windowId && l.status === 'loading',
          ).length,
          playingInWindow: run.lanes.filter(
            (l) => l.windowId === lane.windowId && l.status === 'playing',
          ).length,
          headers,
        },
      ].slice(-100);
      await save(state);
      if (details.statusCode !== 429 || lane.rateLimitedEpoch === lane.epoch) return;
      if (expectedClip && expectedClip !== clip) return;
      const header = details.responseHeaders?.find(
        (h) => h.name.toLowerCase() === 'retry-after',
      )?.value;
      deferRateLimit(state, lane, header);
      await runLoads(state);
      void wake(run);
    });
  },
  { urls: ['https://app.pluralsight.com/video/delivery/api/v1/clips/*'] },
  ['responseHeaders'],
);
