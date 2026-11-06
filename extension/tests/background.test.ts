import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course, PlayerEvent } from '../src/shared/types';
import { parseCourse } from '../src/shared/urls';
import { courseId, clipId, playerUrl, otherPlayerUrl, overviewUrl } from './fixtures/pluralsight';

let messageListener: any,
  startupListener: any,
  removedListener: any,
  alarmListener: any,
  headersListener: any;
let storage: Record<string, any>, tabs: Map<number, any>, nextId: number, api: any;
const extensionOrigin = 'chrome-extension://test/';
const ui = { url: extensionOrigin + 'index.html' };
const rpc = (message: unknown, sender = ui): Promise<any> =>
  new Promise((resolve) => messageListener(message, sender, resolve));
const player = (tabId: number) => ({
  url: tabs.get(tabId)?.url ?? 'https://www.linkedin.com/learning/course/clip-0',
  tab: { id: tabId, windowId: 1 },
  frameId: 0,
});
const course: Course = {
  ref: {
    platform: 'linkedin',
    slug: 'course',
    url: 'https://www.linkedin.com/learning/course',
    sourceUrl: 'https://www.linkedin.com/learning/course',
  },
  title: 'Course',
  complete: true,
  issues: [],
  scannedAt: 0,
  videos: [0, 1].map((i) => ({
    id: 'course/clip-' + i,
    title: 'Clip ' + i,
    module: '',
    duration: 10,
    target: { kind: 'url', url: 'https://www.linkedin.com/learning/course/clip-' + i },
    completion: 'unknown',
  })),
};
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.resetModules();
  storage = {};
  tabs = new Map();
  nextId = 10;
  const addTab = (props: any) => {
    const tab = { id: nextId++, windowId: props.windowId ?? 1, url: props.url };
    tabs.set(tab.id, tab);
    return structuredClone(tab);
  };
  api = {
    runtime: {
      id: 'test',
      getURL: (p: string) => extensionOrigin + p,
      onMessage: {
        addListener: (fn: any) => {
          messageListener = fn;
        },
      },
      onStartup: {
        addListener: (fn: any) => {
          startupListener = fn;
        },
      },
    },
    action: { onClicked: { addListener: vi.fn() } },
    storage: {
      local: {
        get: vi.fn(async (k: string) => ({ [k]: structuredClone(storage[k]) })),
        set: vi.fn(async (o: any) => {
          Object.assign(storage, structuredClone(o));
        }),
      },
    },
    tabs: {
      create: vi.fn(async (p: any) => addTab(p)),
      query: vi.fn(async (p: any) => [...tabs.values()].filter((t) => t.windowId === p.windowId)),
      get: vi.fn(async (id: number) => {
        if (!tabs.has(id)) throw new Error('No tab');
        return structuredClone(tabs.get(id));
      }),
      update: vi.fn(async (id: number, p: any) => {
        if (!tabs.has(id)) throw new Error('No tab');
        Object.assign(tabs.get(id), p);
        return structuredClone(tabs.get(id));
      }),
      remove: vi.fn(async (id: number) => {
        tabs.delete(id);
        removedListener?.(id);
      }),
      createSplit: vi.fn(async (ids: number[]) => {
        ids.forEach((id) => (tabs.get(id).splitViewId = 123));
        return 123;
      }),
      sendMessage: vi.fn(async () => ({ ok: true })),
      onRemoved: {
        addListener: (fn: any) => {
          removedListener = fn;
        },
      },
      onUpdated: { addListener: vi.fn() },
    },
    windows: {
      create: vi.fn(async (p: any) => {
        const id = nextId++;
        return { ...p, id, tabs: [addTab({ url: p.url, windowId: id })] };
      }),
      update: vi.fn(async (id: number, p: any) => ({ id, ...p })),
      remove: vi.fn(async () => {}),
    },
    alarms: {
      create: vi.fn(async () => {}),
      clear: vi.fn(async () => true),
      onAlarm: {
        addListener: (fn: any) => {
          alarmListener = fn;
        },
      },
    },
    webRequest: {
      onHeadersReceived: {
        addListener: (fn: any) => {
          headersListener = fn;
        },
      },
    },
  };
  vi.stubGlobal('chrome', api);
  await import('../src/background/index');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function prepare(count = 2, input = course) {
  let response = await rpc({ type: 'SCAN', url: input.ref.url });
  expect(response.ok).toBe(true);
  response = await rpc({ type: 'COURSE', course: input }, player(response.value.scan.tabId));
  expect(response.ok).toBe(true);
  response = await rpc({
    type: 'START',
    count,
    bounds: { left: 0, top: 0, width: 1800, height: 1100 },
  });
  expect(response.ok).toBe(true);
  return response.value.run;
}
function event(run: any, lane: any, docKey: string, sequence: number, ended = false): PlayerEvent {
  return {
    type: 'PLAYER',
    runId: run.id,
    epoch: lane.epoch,
    docKey,
    sequence,
    videoId: lane.videoIds[lane.index],
    status: 'ready',
    position: ended ? 10 : 0,
    ...(ended ? { ended: { duration: 10, ranges: [[0, 10]] as [number, number][] } } : {}),
  };
}
const ilxCourse = (count = 2): Course => ({
  ...structuredClone(course),
  ref: { ...parseCourse(overviewUrl), pluralsightCourseId: courseId },
  videos: Array.from({ length: count }, (_, i) => ({
    ...course.videos[i % 2],
    id: 'ilx-' + i,
    target: {
      kind: 'url',
      url:
        [playerUrl, otherPlayerUrl][i] ??
        playerUrl.slice(0, playerUrl.lastIndexOf('/') + 1) +
          '00000000-0000-0000-0000-' +
          String(i + 1).padStart(12, '0'),
    },
  })),
});
const deliveryUrl =
  'https://app.pluralsight.com/video/delivery/api/v1/clips/' +
  clipId +
  '/versions/570f545b-f6ab-4e9a-b14e-8293ba75c7ea';
const videoNavigations = () =>
  api.tabs.update.mock.calls.filter(
    ([, p]: any[]) =>
      p.url?.startsWith('https://app.pluralsight.com/ilx/video-courses/') &&
      !p.url.endsWith('course-overview'),
  );
async function limit(lane: any, header?: string, extra = {}) {
  headersListener({
    tabId: lane.tabId,
    url: deliveryUrl,
    statusCode: 429,
    timeStamp: Date.now(),
    responseHeaders: header ? [{ name: 'Retry-After', value: header }] : [],
    ...extra,
  });
  return (await rpc({ type: 'STATE' })).value;
}
describe('Pluralsight-Anfragen begrenzen', () => {
  it('öffnet alle acht Player sofort, auch mit gespeichertem Ladelimit und Wartezeit', async () => {
    const now = Date.now();
    storage.videoDisplayerState = { pluralsightLoadLimit: 1, pluralsightLoadAfter: now + 180000 };
    const run = await prepare(8, ilxCourse(8));
    expect(videoNavigations().map(([id]: any[]) => id)).toEqual(run.lanes.map((l: any) => l.tabId));
    expect(api.windows.create).toHaveBeenCalledTimes(4);
    expect(api.tabs.createSplit).toHaveBeenCalledTimes(4);
    expect(run.lanes.every((l: any) => l.status === 'loading' && l.loadAfter === undefined)).toBe(
      true,
    );
    expect(Date.now()).toBe(now);
    await rpc({ type: 'HELLO', docKey: 'doc0' }, player(run.lanes[0].tabId));
    await rpc(event(run, run.lanes[0], 'doc0', 1), player(run.lanes[0].tabId));
    expect(
      (await rpc({ type: 'HELLO', docKey: 'doc0' }, player(run.lanes[0].tabId))).value.assignment
        .paused,
    ).toBe(false);
    expect(videoNavigations()).toHaveLength(8);
  });
  it('reduziert die Parallelität bei mehreren 429 derselben Ladewelle nur einmal', async () => {
    const run = await prepare(8, ilxCourse(8));
    await limit(run.lanes[0]);
    const nextClip = run.course.videos[2].target.url.split('/').at(-1);
    const state = await limit(run.lanes[2], undefined, {
      url: deliveryUrl.replace(clipId, nextClip),
    });
    expect(state.pluralsightLoadLimit).toBe(2);
    expect(state.run.lanes[0].deliveryRetries).toBe(1);
    expect(state.run.lanes[2].deliveryRetries).toBe(1);
  });
  it('protokolliert einen zweiten Player zusammen mit dem bereits laufenden Geschwister', async () => {
    const run = await prepare(2, ilxCourse());
    const first = run.lanes[0],
      second = run.lanes[1];
    expect(videoNavigations()).toHaveLength(2);
    await rpc({ type: 'HELLO', docKey: 'doc0' }, player(first.tabId));
    await rpc(event(run, first, 'doc0', 1), player(first.tabId));
    await rpc({ ...event(run, first, 'doc0', 2), status: 'playing' }, player(first.tabId));
    expect(videoNavigations()).toHaveLength(2);
    const secondClip = otherPlayerUrl.split('/').at(-1)!;
    const state = await limit(second, undefined, { url: deliveryUrl.replace(clipId, secondClip) });
    expect(state.run.deliveryLog.at(-1)).toMatchObject({
      windowId: first.windowId,
      loadingInWindow: 1,
      playingInWindow: 1,
      status: 429,
    });
    expect(state.run.lanes[0].status).toBe('playing');
    expect(state.run.lanes[1].status).toBe('queued');
  });
  it('erhält Serverstatus und Begrenzungsheader auch nach einem Worker-Neustart', async () => {
    const run = await prepare(1, ilxCourse()),
      lane = run.lanes[0];
    await limit(lane, undefined, {
      responseHeaders: [
        { name: 'Retry-After', value: '90' },
        { name: 'X-RateLimit-Limit', value: '4' },
        { name: 'Set-Cookie', value: 'private' },
      ],
    });
    vi.clearAllTimers();
    vi.resetModules();
    await import('../src/background/index');
    const log = (await rpc({ type: 'STATE' })).value.run.deliveryLog;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      slot: 0,
      status: 429,
      clipId,
      matchesAssignment: true,
      loading: 1,
      windowId: lane.windowId,
      loadingInWindow: 1,
      playingInWindow: 0,
      headers: { 'retry-after': '90', 'x-ratelimit-limit': '4' },
    });
    expect(JSON.stringify(log)).not.toContain('private');
  });
  it('behält die Begrenzung pro Fenster für spätere Wiederholungen bei', async () => {
    const run = await prepare(8, ilxCourse(8));
    for (const lane of run.lanes) {
      await rpc({ type: 'HELLO', docKey: 'doc' + lane.slot }, player(lane.tabId));
      await rpc(event(run, lane, 'doc' + lane.slot, 1), player(lane.tabId));
    }
    await rpc({ type: 'CONTROL', action: 'retry' });
    expect(videoNavigations()).toHaveLength(12);
    const state = (await rpc({ type: 'STATE' })).value;
    expect(state.run.lanes.map((l: any) => l.status)).toEqual([
      'loading',
      'queued',
      'loading',
      'queued',
      'loading',
      'queued',
      'loading',
      'queued',
    ]);
    const first = state.run.lanes[0];
    await rpc({ type: 'HELLO', docKey: 'retry0' }, player(first.tabId));
    await rpc(event(state.run, first, 'retry0', 1), player(first.tabId));
    expect(videoNavigations()).toHaveLength(13);
  });
  it('beachtet Retry-After für alle Ansichten und ignoriert verspätete DOM-Meldungen', async () => {
    const run = await prepare(8, ilxCourse(8)),
      lane = run.lanes[0];
    await rpc({ type: 'HELLO', docKey: 'doc0' }, player(lane.tabId));
    const now = Date.now();
    const state = await limit(lane, '180');
    expect(state.pluralsightLoadAfter).toBe(now + 180000);
    expect(state.pluralsightLoadLimit).toBe(2);
    expect(state.run.lanes[0]).toMatchObject({ status: 'queued', deliveryRetries: 1 });
    await rpc(
      { ...event(run, lane, 'doc0', 1), status: 'error', error: 'DOM load error' },
      player(lane.tabId),
    );
    expect((await rpc({ type: 'STATE' })).value.run.lanes[0].message).toContain('HTTP 429');
    await rpc({ type: 'CONTROL', action: 'retry', slot: 0 });
    await vi.advanceTimersByTimeAsync(179999);
    expect(videoNavigations()).toHaveLength(8);
    await vi.advanceTimersByTimeAsync(1);
    expect(videoNavigations()).toHaveLength(9); // Only the failed player is retried.
  });
  it('wiederholt einen Clip höchstens zweimal mit 60 und 120 Sekunden Wartezeit', async () => {
    const run = await prepare(1, ilxCourse()),
      lane = run.lanes[0];
    await limit(lane);
    await vi.advanceTimersByTimeAsync(59999);
    expect(videoNavigations()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(videoNavigations()).toHaveLength(2);
    await limit(lane);
    await vi.advanceTimersByTimeAsync(119999);
    expect(videoNavigations()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(videoNavigations()).toHaveLength(3);
    const state = await limit(lane);
    expect(state.run.lanes[0]).toMatchObject({ status: 'error', deliveryRetries: 2 });
    expect(state.run.lanes[0].message).toContain('ausgeschöpft');
    await vi.advanceTimersByTimeAsync(600000);
    expect(videoNavigations()).toHaveLength(3);
  });
  it('ignoriert Telemetrie, andere Clips, fremde Tabs und alte Dokumente', async () => {
    const run = await prepare(1, ilxCourse()),
      lane = run.lanes[0];
    await rpc({ type: 'HELLO', docKey: 'doc0' }, { ...player(lane.tabId), documentId: 'current' });
    for (const extra of [
      { url: 'https://bam.nr-data.net/1/example' },
      { statusCode: 200 },
      { tabId: 999 },
      { url: deliveryUrl.replace(clipId, 'ffffffff-ffff-ffff-ffff-ffffffffffff') },
      { documentId: 'old' },
      { timeStamp: Date.now() - 1000 },
    ])
      await limit(lane, undefined, extra);
    expect((await rpc({ type: 'STATE' })).value.run.lanes[0].deliveryRetries).toBeUndefined();
    expect(videoNavigations()).toHaveLength(1);
  });
  it('erhält die Ladepause nach Worker-Neustart und nach Stoppen eines Laufs', async () => {
    const run = await prepare(1, ilxCourse());
    const state = await limit(run.lanes[0], '180');
    vi.clearAllTimers();
    vi.resetModules();
    await import('../src/background/index');
    alarmListener({ name: 'load-players' });
    await rpc({ type: 'STATE' });
    await vi.advanceTimersByTimeAsync(179999);
    expect(videoNavigations()).toHaveLength(1);
    await rpc({ type: 'CONTROL', action: 'stop' });
    await vi.advanceTimersByTimeAsync(600000);
    expect(videoNavigations()).toHaveLength(1);
    expect((await rpc({ type: 'STATE' })).value.pluralsightLoadAfter).toBe(
      state.pluralsightLoadAfter,
    );
  });
  it('führt eine wartende Wiederholung während globaler oder einzelner Pause nicht aus', async () => {
    const run = await prepare(2, ilxCourse());
    for (const lane of run.lanes) {
      await rpc({ type: 'HELLO', docKey: 'doc' + lane.slot }, player(lane.tabId));
      await rpc(event(run, lane, 'doc' + lane.slot, 1), player(lane.tabId));
    }
    storage.videoDisplayerState.pluralsightLoadAfter = Date.now() + 60000;
    await rpc({ type: 'CONTROL', action: 'retry', slot: 1 });
    await rpc({ type: 'CONTROL', action: 'pause', slot: 1 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(videoNavigations()).toHaveLength(2);
    await rpc({ type: 'CONTROL', action: 'pause' });
    await rpc({ type: 'CONTROL', action: 'resume', slot: 1 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(videoNavigations()).toHaveLength(2);
    await rpc({ type: 'CONTROL', action: 'resume' });
    expect(videoNavigations()).toHaveLength(3);
  });
  it('behält eine einzelne Pause bei, wenn der Player erst danach bereit meldet', async () => {
    const run = await prepare(1, ilxCourse()),
      lane = run.lanes[0];
    await rpc({ type: 'HELLO', docKey: 'doc0' }, player(lane.tabId));
    await rpc({ type: 'CONTROL', action: 'pause', slot: 0 });
    await rpc(event(run, lane, 'doc0', 1), player(lane.tabId));
    expect(
      (await rpc({ type: 'HELLO', docKey: 'doc0' }, player(lane.tabId))).value.assignment.paused,
    ).toBe(true);
    await rpc({ type: 'CONTROL', action: 'resume', slot: 0 });
    expect(
      (await rpc({ type: 'HELLO', docKey: 'doc0' }, player(lane.tabId))).value.assignment.paused,
    ).toBe(false);
  });
  it('öffnet einen neuen Lauf sofort und berücksichtigt die Wartezeit bei dessen Wiederholung', async () => {
    const run = await prepare(1, ilxCourse());
    await limit(run.lanes[0]);
    await rpc({ type: 'CONTROL', action: 'stop' });
    await rpc({ type: 'START', count: 1, bounds: { left: 0, top: 0, width: 1800, height: 1100 } });
    expect(videoNavigations()).toHaveLength(2);
    await rpc({ type: 'CONTROL', action: 'retry', slot: 0 });
    await vi.advanceTimersByTimeAsync(59999);
    expect(videoNavigations()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(videoNavigations()).toHaveLength(3);
  });
  it('leitet auch Folgeclips über die Warteschlange', async () => {
    const run = await prepare(1, ilxCourse()),
      lane = run.lanes[0];
    await rpc({ type: 'HELLO', docKey: 'doc0' }, player(lane.tabId));
    await rpc(event(run, lane, 'doc0', 1), player(lane.tabId));
    storage.videoDisplayerState.pluralsightLoadAfter = Date.now() + 60000;
    await rpc(event(run, lane, 'doc0', 2, true), player(lane.tabId));
    expect(videoNavigations()).toHaveLength(1);
    expect((await rpc({ type: 'STATE' })).value.run.lanes[0].status).toBe('queued');
    await vi.advanceTimersByTimeAsync(59999);
    expect(videoNavigations()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(videoNavigations()).toHaveLength(2);
    expect(videoNavigations()[1][1].url).toBe(otherPlayerUrl);
  });
});
describe('Koordination mit simulierten Chrome-APIs', () => {
  it('startet bereite Ansichten, obwohl ein anderer Player einen Fehler meldet', async () => {
    const run = await prepare();
    for (const lane of run.lanes)
      await rpc({ type: 'HELLO', docKey: 'doc' + lane.slot }, player(lane.tabId));
    await rpc(event(run, run.lanes[0], 'doc0', 1), player(run.lanes[0].tabId));
    await rpc(
      {
        ...event(run, run.lanes[1], 'doc1', 1),
        status: 'error',
        error: 'Pluralsight konnte das Video nicht laden.',
      },
      player(run.lanes[1].tabId),
    );
    expect((await rpc({ type: 'STATE' })).value.run.status).toBe('running');
    expect(
      (await rpc({ type: 'HELLO', docKey: 'doc0' }, player(run.lanes[0].tabId))).value.assignment
        .paused,
    ).toBe(false);
    expect(
      (await rpc({ type: 'HELLO', docKey: 'doc1' }, player(run.lanes[1].tabId))).value.assignment
        .blocked,
    ).toBe(true);
  });
  it('löst die Startbarriere auch beim Timeout eines nicht antwortenden Players', async () => {
    const run = await prepare();
    await rpc({ type: 'HELLO', docKey: 'doc0' }, player(run.lanes[0].tabId));
    await rpc(event(run, run.lanes[0], 'doc0', 1), player(run.lanes[0].tabId));
    storage.videoDisplayerState.run.lanes[1].updatedAt = Date.now() - 60000;
    alarmListener({ name: 'check-players' });
    const state = (await rpc({ type: 'STATE' })).value;
    expect(state.run.status).toBe('running');
    expect(state.run.lanes[1].status).toBe('waiting');
  });
  it('speichert eine kontrollierte ILX-Zuordnung ohne die interne Video-ID zu ändern', async () => {
    const input: Course = {
      ...course,
      ref: parseCourse(overviewUrl),
      videos: [0, 1].map((i) => ({
        ...course.videos[i],
        id: 'item-' + i,
        target: { kind: 'item', key: 'Clip ' + i },
      })),
    };
    const run = await prepare(2, input),
      lane = run.lanes[0];
    await rpc({ type: 'HELLO', docKey: 'doc0' }, player(lane.tabId));
    tabs.get(lane.tabId).url = playerUrl;
    const result = await rpc(
      {
        type: 'BIND_PLAYER',
        runId: run.id,
        epoch: lane.epoch,
        docKey: 'doc0',
        videoId: 'item-0',
        url: playerUrl,
      },
      player(lane.tabId),
    );
    expect(result.ok).toBe(true);
    expect(result.value.assignment.video.id).toBe('item-0');
    expect(result.value.assignment.video.target).toEqual({ kind: 'url', url: playerUrl });
    expect(result.value.assignment.ref.pluralsightCourseId).toBe(courseId);
    const other = run.lanes[1];
    await rpc(event(run, lane, 'doc0', 1), player(lane.tabId));
    await vi.advanceTimersByTimeAsync(15000);
    await rpc({ type: 'HELLO', docKey: 'doc1' }, player(other.tabId));
    expect(
      (
        await rpc(
          {
            type: 'BIND_PLAYER',
            runId: run.id,
            epoch: other.epoch,
            docKey: 'doc1',
            videoId: 'item-1',
            url: playerUrl,
          },
          player(other.tabId),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await rpc(
          {
            type: 'BIND_PLAYER',
            runId: run.id,
            epoch: other.epoch + 1,
            docKey: 'doc1',
            videoId: 'item-1',
            url: otherPlayerUrl,
          },
          player(other.tabId),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await rpc(
          {
            type: 'BIND_PLAYER',
            runId: run.id,
            epoch: other.epoch,
            docKey: 'doc1',
            videoId: 'item-1',
            url: otherPlayerUrl,
          },
          player(other.tabId),
        )
      ).ok,
    ).toBe(true);
  });
  it('entfernt den gewählten Kurs samt eigenen Tabs und weist verspätete Erfassung zurück', async () => {
    const run = await prepare();
    const scanId = storage.videoDisplayerState.scan.tabId;
    const result = await rpc({
      type: 'REMOVE_COURSE',
      platform: course.ref.platform,
      slug: course.ref.slug,
    });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({});
    for (const id of [scanId, ...run.lanes.map((l: any) => l.tabId)])
      expect(api.tabs.remove).toHaveBeenCalledWith(id);
    expect((await rpc({ type: 'COURSE', course }, player(scanId))).ok).toBe(false);
    expect((await rpc({ type: 'STATE' })).value).toEqual({});
  });
  it('erhält einen anderen Kurs und dessen Wiedergabe beim Entfernen des Erfassungseintrags', async () => {
    const run = await prepare();
    storage.videoDisplayerState.scan.ref = {
      platform: 'pluralsight',
      slug: 'big-data-explained',
      url: 'https://app.pluralsight.com/ilx/video-courses/big-data-explained/course-overview',
    };
    const result = await rpc({
      type: 'REMOVE_COURSE',
      platform: 'pluralsight',
      slug: 'big-data-explained',
    });
    expect(result.ok).toBe(true);
    expect(result.value.scan).toBeUndefined();
    expect(result.value.run.id).toBe(run.id);
    for (const lane of run.lanes) expect(api.tabs.remove).not.toHaveBeenCalledWith(lane.tabId);
  });
  it('erlaubt keine Löschung durch Webseiten oder für eine andere Kurskennung', async () => {
    await prepare();
    expect((await rpc({ type: 'REMOVE_COURSE', platform: 'pluralsight', slug: 'other' })).ok).toBe(
      false,
    );
    expect(
      (
        await rpc(
          { type: 'REMOVE_COURSE', platform: course.ref.platform, slug: course.ref.slug },
          player(99),
        )
      ).ok,
    ).toBe(false);
    expect((await rpc({ type: 'STATE' })).value.run).toBeDefined();
  });
  it('öffnet zur Erfassung den neuen ILX-Kurs statt auf den alten Pfad zurückzuwechseln', async () => {
    const url = 'https://app.pluralsight.com/ilx/video-courses/big-data-explained/course-overview';
    const result = await rpc({ type: 'SCAN', url });
    expect(result.ok).toBe(true);
    expect(result.value.scan.ref.slug).toBe('big-data-explained');
    expect(tabs.get(result.value.scan.tabId).url).toBe(url);
  });
  it('verteilt 14 Videos auf genau vier Fenster und acht Tabs', async () => {
    const large = structuredClone(course);
    large.videos = Array.from({ length: 14 }, (_, i) => ({
      ...course.videos[0],
      id: 'course/clip-' + i,
      title: 'Clip ' + i,
      duration: 30 + i * 17,
      target: { kind: 'url', url: course.ref.url + '/clip-' + i },
    }));
    const scan = await rpc({ type: 'SCAN', url: course.ref.url });
    await rpc({ type: 'COURSE', course: large }, player(scan.value.scan.tabId));
    const result = await rpc({
      type: 'START',
      count: 8,
      bounds: { left: 0, top: 0, width: 1800, height: 1100 },
    });
    expect(result.ok).toBe(true);
    expect(api.windows.create).toHaveBeenCalledTimes(4);
    expect(api.tabs.createSplit).toHaveBeenCalledTimes(4);
    expect(new Set(result.value.run.lanes.map((l: any) => l.tabId)).size).toBe(8);
    expect(result.value.run.lanes.flatMap((l: any) => l.videoIds)).toEqual(
      large.videos.map((v) => v.id),
    );
  });
  it('erstellt native Split Views und startet erst nach allen Bereit-Meldungen', async () => {
    const run = await prepare();
    expect(api.tabs.createSplit).toHaveBeenCalledOnce();
    expect(run.status).toBe('starting');
    for (const lane of run.lanes) {
      const doc = 'doc' + lane.slot;
      const hello = await rpc({ type: 'HELLO', docKey: doc }, player(lane.tabId));
      expect(hello.value.assignment.paused).toBe(true);
      await rpc(event(run, lane, doc, 1), player(lane.tabId));
    }
    expect((await rpc({ type: 'STATE' })).value.run.status).toBe('running');
  });
  it('schaltet nur innerhalb des Abschnitts weiter und entfernt danach den Player', async () => {
    const run = await prepare(1),
      lane = run.lanes[0];
    await rpc({ type: 'HELLO', docKey: 'doc1' }, player(lane.tabId));
    await rpc(event(run, lane, 'doc1', 1), player(lane.tabId));
    let response = await rpc(event(run, lane, 'doc1', 2, true), player(lane.tabId));
    expect(response.value.run.completed).toEqual(['course/clip-0']);
    expect(tabs.get(lane.tabId).url).toContain('clip-1');
    const next = response.value.run,
      nextLane = next.lanes[0];
    await rpc({ type: 'HELLO', docKey: 'doc2' }, player(lane.tabId));
    response = await rpc(event(next, nextLane, 'doc2', 1, true), player(lane.tabId));
    expect(response.value.run.status).toBe('complete');
    expect(tabs.get(lane.tabId).url).toBe(extensionOrigin + 'finished.html');
  });
  it('überlebt einen Worker-Neustart ohne verlorene oder doppelte Zuweisungen', async () => {
    const run = await prepare(),
      lane = run.lanes[0];
    await rpc({ type: 'HELLO', docKey: 'same-document' }, player(lane.tabId));
    await rpc(event(run, lane, 'same-document', 1), player(lane.tabId));
    vi.resetModules();
    await import('../src/background/index');
    const state = (await rpc({ type: 'STATE' })).value;
    expect(state.run.id).toBe(run.id);
    expect(state.run.lanes[0].sequence).toBe(1);
    await rpc(event(run, lane, 'same-document', 1, true), player(lane.tabId));
    expect((await rpc({ type: 'STATE' })).value.run.completed).toEqual([]);
  });
  it('verwirft beim Browser-Neustart alte Tab-IDs und bindet wiederhergestellte Ansichten über Laufmarker', async () => {
    const run = await prepare(),
      oldIds = run.lanes.map((l: any) => l.tabId);
    startupListener();
    let state = (await rpc({ type: 'STATE' })).value;
    expect(state.run.status).toBe('paused');
    expect(state.scan).toBeUndefined();
    expect(state.run.lanes.every((l: any) => l.tabId === undefined)).toBe(true);
    tabs.set(500, {
      id: 500,
      windowId: 100,
      url: course.videos[0].target.kind === 'url' ? course.videos[0].target.url : '',
    });
    const hello = await rpc(
      { type: 'HELLO', docKey: 'restored', resume: { runId: run.id, slot: 0 } },
      player(500),
    );
    expect(hello.value.mode).toBe('run');
    await rpc({ type: 'CONTROL', action: 'stop' });
    expect(api.tabs.remove).toHaveBeenCalledWith(500);
    for (const id of oldIds) expect(api.tabs.remove).not.toHaveBeenCalledWith(id);
  });
  it('räumt bei fehlgeschlagenem Split nur selbst erstellte Fenster auf', async () => {
    const scan = await rpc({ type: 'SCAN', url: course.ref.url });
    await rpc({ type: 'COURSE', course }, player(scan.value.scan.tabId));
    api.tabs.createSplit.mockRejectedValueOnce(new Error('Split unavailable'));
    const result = await rpc({
      type: 'START',
      count: 2,
      bounds: { left: 0, top: 0, width: 1800, height: 1100 },
    });
    expect(result.ok).toBe(false);
    expect(api.windows.remove).toHaveBeenCalledOnce();
    expect((await rpc({ type: 'STATE' })).value.run.status).toBe('stopped');
  });
  it('verwirft auch Tab-IDs eines bereits abgeschlossenen Laufs beim Browser-Neustart', async () => {
    const run = await prepare();
    storage.videoDisplayerState.run.status = 'complete';
    startupListener();
    const state = (await rpc({ type: 'STATE' })).value;
    expect(state.run.status).toBe('complete');
    expect(state.run.lanes.every((l: any) => l.tabId === undefined)).toBe(true);
    expect((await rpc({ type: 'FOCUS', tabId: run.lanes[0].tabId })).ok).toBe(false);
  });
  it('verweigert Start aus Webseiten und unvollständiger Erfassung', async () => {
    expect((await rpc({ type: 'START', count: 2 }, player(50))).ok).toBe(false);
    expect((await rpc({ type: 'START', count: 2 }, ui)).ok).toBe(false);
  });
  it('stoppt alle eigenen Player und erhält den Erfassungstab', async () => {
    const run = await prepare();
    const scanId = (await rpc({ type: 'STATE' })).value.scan.tabId;
    await rpc({ type: 'CONTROL', action: 'stop' });
    for (const lane of run.lanes) expect(api.tabs.remove).toHaveBeenCalledWith(lane.tabId);
    expect(tabs.has(scanId)).toBe(true);
  });
});
