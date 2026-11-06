import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import type { Assignment, Course, PlayerEvent, Task } from '../src/shared/types';
import { parseCourse, pluralsightPlayer } from '../src/shared/urls';
import type { NavigationIntent } from '../src/controller/navigation';
import { courseId, clipId, playerUrl, overviewUrl } from './fixtures/pluralsight';
let bundle: string,
  doms: JSDOM[] = [];
beforeAll(async () => {
  const output: any = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.resolve('src/controller/content.ts'),
        name: 'DisplayerTest',
        formats: ['iife'],
      },
    },
  });
  bundle = (Array.isArray(output) ? output[0] : output).output.find(
    (o: any) => o.type === 'chunk',
  ).code;
});
afterEach(() => {
  doms.forEach((d) => {
    d.window.dispatchEvent(new d.window.Event('pagehide'));
    d.window.close();
  });
  doms = [];
});
function harness(
  options: {
    paused?: boolean;
    rejectPlay?: boolean;
    ordinary?: boolean;
    scan?: boolean;
    url?: string;
    html?: string;
    assignment?: Assignment;
    navigation?: NavigationIntent;
  } = {},
) {
  const url = options.url ?? 'https://www.linkedin.com/learning/course/clip';
  const dom = new JSDOM(
    options.html ??
      '<body><nav><li aria-current="true"><a href="' +
        url +
        '"><span class="item-title">Clip</span><time>0:10</time></a></li></nav><video></video></body>',
    { url, runScripts: 'dangerously', pretendToBeVisual: true },
  );
  doms.push(dom);
  const win = dom.window as any;
  win.CSS = { escape: (s: string) => s };
  if (options.navigation)
    win.sessionStorage.setItem('__learning_helper_navigation', JSON.stringify(options.navigation));
  let listener: any,
    paused = true,
    position = 0,
    ended = false;
  const media = win.document.querySelector('video');
  Object.defineProperties(media, {
    duration: { get: () => 10 },
    readyState: { get: () => 4 },
    paused: { get: () => paused },
    ended: { get: () => ended },
    currentTime: {
      get: () => position,
      set: (v: number) => {
        position = v;
      },
    },
    played: { get: () => ({ length: 1, start: () => 0, end: () => 10 }) },
  });
  const pause = vi.fn(() => {
    if (!paused) {
      paused = true;
      media.dispatchEvent(new win.Event('pause'));
    }
  });
  let rejected = options.rejectPlay ?? false;
  const play = vi.fn(async () => {
    if (rejected) throw new win.DOMException('Needs gesture', 'NotAllowedError');
    paused = false;
    media.dispatchEvent(new win.Event('play'));
  });
  media.play = play;
  media.pause = pause;
  const events: PlayerEvent[] = [];
  const courses: Course[] = [];
  const a: Assignment = options.assignment ?? {
    runId: 'run',
    epoch: 1,
    slot: 0,
    video: {
      id: 'course/clip',
      title: 'Clip',
      module: '',
      duration: 10,
      target: { kind: 'url', url },
      completion: 'unknown',
    },
    ref: {
      platform: 'linkedin',
      slug: 'course',
      url: 'https://www.linkedin.com/learning/course',
      sourceUrl: url,
    },
    paused: options.paused ?? false,
    blocked: false,
    muted: true,
  };
  win.chrome = {
    runtime: {
      sendMessage: vi.fn(async (m: any) => {
        if (m.type === 'HELLO')
          return {
            ok: true,
            value: options.ordinary
              ? { mode: 'idle' }
              : options.scan
                ? { mode: 'scan', ref: a.ref }
                : { mode: 'run', assignment: structuredClone(a) },
          };
        if (m.type === 'PLAYER') {
          events.push(m);
          if (['waiting', 'error'].includes(m.status)) a.blocked = true;
          if (['playing', 'ready'].includes(m.status)) a.blocked = false;
        }
        if (m.type === 'BIND_PLAYER') {
          a.ref.pluralsightCourseId = pluralsightPlayer(m.url)!.courseId;
          a.video.target = { kind: 'url', url: m.url };
          return { ok: true, value: { mode: 'run', assignment: structuredClone(a) } };
        }
        if (m.type === 'COURSE') courses.push(m.course);
        return { ok: true, value: {} };
      }),
      onMessage: {
        addListener: (fn: any) => {
          listener = fn;
        },
      },
    },
  };
  win.eval(bundle);
  return {
    dom,
    media,
    play,
    pause,
    events,
    courses,
    a,
    wake: () => listener({ type: 'WAKE' }, {}, () => {}),
    allowGesture: () => {
      rejected = false;
    },
    paused: () => paused,
    end: () => {
      ended = true;
      position = 10;
      paused = true;
      media.dispatchEvent(new win.Event('ended'));
    },
  };
}
describe('Gebündelter Controller in einer simulierten Playerseite', () => {
  const ilxAssignment = (): Assignment => ({
    runId: 'ilx-run',
    epoch: 0,
    slot: 0,
    ref: { ...parseCourse(overviewUrl), pluralsightCourseId: courseId },
    video: {
      id: 'big-data-explained/' + clipId,
      title: 'Clip',
      module: '',
      duration: 10,
      completion: 'unknown',
      target: { kind: 'url', url: playerUrl },
    },
    paused: false,
    blocked: false,
    muted: true,
  });
  it('startet während einer geplanten Ladepause keine Medien und zeigt die Ursache', async () => {
    const a = ilxAssignment();
    a.deferredUntil = Date.now() + 60000;
    a.message = 'Pluralsight begrenzt Videoanfragen (HTTP 429). Wiederholung folgt.';
    const h = harness({ url: playerUrl, html: '<video></video>', assignment: a });
    await vi.waitFor(() => expect(h.dom.window.document.body.textContent).toContain('HTTP 429'));
    expect(h.play).not.toHaveBeenCalled();
    expect(h.events).toHaveLength(0);
    delete h.a.deferredUntil;
    h.wake();
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled());
  });
  it('spielt den konkreten ILX-Player ohne ausgewählten Eintrag in der Navigation ab', async () => {
    const h = harness({
      url: playerUrl,
      html: '<h1>Big Data Explained</h1><video></video>',
      assignment: ilxAssignment(),
    });
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled());
    expect(h.events.some((e) => e.status === 'playing')).toBe(true);
  });
  it('ordnet das Ergebnis eines gezielten Button-Klicks zu und startet danach den Player', async () => {
    const a = ilxAssignment();
    a.video.id = 'big-data-explained/item/::Clip';
    a.video.target = { kind: 'item', key: '::Clip' };
    const h = harness({
      url: overviewUrl,
      html: '<aside><ul><li><button id="clip">Clip 00:10</button></li></ul></aside><video></video>',
      assignment: a,
    });
    h.dom.window.document.querySelector('#clip')!.addEventListener('click', () => {
      h.dom.window.history.replaceState({}, '', playerUrl);
      h.dom.window.document.querySelector('aside')!.remove();
    });
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled(), { timeout: 3000 });
    expect(h.a.video.id).toBe('big-data-explained/item/::Clip');
    expect(h.a.video.target).toEqual({ kind: 'url', url: playerUrl });
  });
  it('erhält den Klickauftrag bei einer vollständigen Navigation in ein neues Dokument', async () => {
    const a = ilxAssignment();
    a.video.id = 'item-id';
    a.video.target = { kind: 'item', key: 'Clip' };
    const h = harness({
      url: playerUrl,
      html: '<video></video>',
      assignment: a,
      navigation: {
        runId: a.runId,
        epoch: a.epoch,
        slot: a.slot,
        videoId: a.video.id,
        sourcePage: overviewUrl,
        createdAt: Date.now(),
      },
    });
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled(), { timeout: 3000 });
    expect(h.a.video.target).toEqual({ kind: 'url', url: playerUrl });
  });
  it('bindet auch einen bereits markierten Button ohne zuvor bekannte Kurs-UUID', async () => {
    const a = ilxAssignment();
    delete a.ref.pluralsightCourseId;
    a.video.id = 'big-data-explained/item/::Clip';
    a.video.target = { kind: 'item', key: '::Clip' };
    const h = harness({
      url: overviewUrl,
      html: '<aside><ul><li aria-current="true"><button id="clip">Clip 00:10</button></li></ul></aside><video></video>',
      assignment: a,
    });
    const clicked = vi.fn(() => h.dom.window.history.replaceState({}, '', playerUrl));
    h.dom.window.document.querySelector('#clip')!.addEventListener('click', clicked);
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled(), { timeout: 3000 });
    expect(clicked).toHaveBeenCalledOnce();
    expect(h.a.ref.pluralsightCourseId).toBe(courseId);
    expect(h.a.video.target).toEqual({ kind: 'url', url: playerUrl });
  });
  it('meldet einen Pluralsight-Ladefehler ausdrücklich und startet nach dessen Behebung', async () => {
    const h = harness({
      url: playerUrl,
      html: "<p id='error'>We're sorry, there has been an issue loading your video.</p><video></video>",
      assignment: ilxAssignment(),
    });
    await vi.waitFor(() =>
      expect(
        h.events.some((e) => e.status === 'error' && e.error?.includes('Pluralsight konnte')),
      ).toBe(true),
    );
    expect(h.play).not.toHaveBeenCalled();
    h.dom.window.document.querySelector('#error')!.remove();
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled(), { timeout: 3000 });
  });
  it('beendet die Erfassung einer stabilen Liste trotz fremdem Ladeindikator', async () => {
    const h = harness({ scan: true });
    const unrelated = h.dom.window.document.createElement('section');
    unrelated.setAttribute('aria-busy', 'true');
    h.dom.window.document.body.append(unrelated);
    await vi.waitFor(() => expect(h.courses).toHaveLength(1), { timeout: 4000 });
    expect(h.courses[0].complete).toBe(true);
  });
  it('startet nur das bestätigte Video und meldet dessen abgespielte Bereiche', async () => {
    const h = harness();
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled(), { timeout: 2500 });
    expect(h.media.muted).toBe(true);
    h.end();
    await vi.waitFor(() => expect(h.events.some((e) => e.ended?.duration === 10)).toBe(true));
    expect(h.events.find((e) => e.ended)?.ended?.ranges).toEqual([[0, 10]]);
    await h.media.play();
    expect(h.paused()).toBe(true); // Native autoplay after the assigned end is stopped.
  });
  it('hält am gemeinsamen Startsignal und reagiert auf Pause', async () => {
    const h = harness({ paused: true });
    await vi.waitFor(() => expect(h.events.some((e) => e.status === 'ready')).toBe(true));
    expect(h.play).not.toHaveBeenCalled();
    h.a.paused = false;
    h.wake();
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled());
    h.a.paused = true;
    h.wake();
    await vi.waitFor(() => expect(h.paused()).toBe(true));
  });
  it('ignoriert ein End-Ereignis, solange der Player noch nicht am Ende ist', async () => {
    const h = harness();
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled());
    h.media.dispatchEvent(new h.dom.window.Event('ended'));
    expect(h.events.some((e) => e.ended)).toBe(false);
  });
  it('stoppt ein unerwartetes Folgevideo', async () => {
    const h = harness();
    await vi.waitFor(() => expect(h.play).toHaveBeenCalled());
    h.dom.window.history.replaceState({}, '', '/learning/course/unassigned');
    await h.media.play();
    expect(h.paused()).toBe(true);
  });
  it('zeigt eine Startschaltfläche nach einer Autoplay-Ablehnung', async () => {
    const h = harness({ rejectPlay: true });
    await vi.waitFor(() => expect(h.events.some((e) => e.status === 'waiting')).toBe(true));
    h.wake();
    await vi.waitFor(() =>
      expect(h.dom.window.document.querySelector<HTMLButtonElement>('section button')?.hidden).toBe(
        false,
      ),
    );
    h.allowGesture();
    h.dom.window.document.querySelector<HTMLButtonElement>('section button')!.click();
    await vi.waitFor(() => expect(h.events.some((e) => e.status === 'playing')).toBe(true));
  });
  it('verändert gewöhnliche Tabs ohne Auftrag nicht', async () => {
    const h = harness({ ordinary: true });
    await new Promise((r) => setTimeout(r, 30));
    await h.media.play();
    expect(h.paused()).toBe(false);
    expect(h.dom.window.document.querySelector('section')).toBeNull();
  });
});
