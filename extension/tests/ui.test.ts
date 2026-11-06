import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import type { AppState, Request } from '../src/shared/types';
import fixture from '../../docs/video-displayer/fixtures/linkedin-agentic-ai-governance.json';
let bundle: string,
  doms: JSDOM[] = [];
beforeAll(async () => {
  const output: any = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: path.resolve('src/ui/main.ts'), name: 'UITest', formats: ['iife'] },
    },
  });
  bundle = (Array.isArray(output) ? output[0] : output).output.find(
    (o: any) => o.type === 'chunk',
  ).code;
});
afterEach(() => {
  doms.forEach((d) => d.window.close());
  doms = [];
});
function setup() {
  const state: AppState = {
    scan: {
      tabId: 12,
      status: 'ready',
      ref: {
        platform: 'linkedin',
        slug: 'introduction-to-agentic-ai-governance',
        url: fixture.sourceUrl,
        sourceUrl: fixture.sourceUrl,
      },
      course: {
        title: fixture.title,
        ref: {
          platform: 'linkedin',
          slug: 'introduction-to-agentic-ai-governance',
          url: fixture.sourceUrl,
          sourceUrl: fixture.sourceUrl,
        },
        complete: true,
        issues: [],
        scannedAt: 0,
        videos: fixture.videos.map((v) => ({
          id: String(v.index),
          title: v.title,
          module: '',
          duration: v.durationSeconds,
          target: { kind: 'url', url: v.publicLessonUrl },
          completion: 'unknown',
        })),
      },
    },
  };
  const dom = new JSDOM('<div id="app"></div>', {
    url: 'https://extension.example/index.html',
    runScripts: 'dangerously',
  });
  doms.push(dom);
  const win = dom.window as any;
  const requests: Request[] = [];
  let listener: any;
  win.chrome = {
    runtime: {
      sendMessage: async (request: Request) => {
        requests.push(request);
        if (
          request.type === 'REMOVE_COURSE' &&
          request.platform === state.scan?.ref.platform &&
          request.slug === state.scan.ref.slug
        )
          delete state.scan;
        return { ok: true, value: structuredClone(state) };
      },
    },
    storage: {
      onChanged: {
        addListener: (fn: any) => {
          listener = fn;
        },
      },
    },
  };
  win.eval(bundle);
  return {
    state,
    document: win.document as Document,
    requests,
    update: () => listener({ videoDisplayerState: { newValue: state } }, 'local'),
  };
}
describe('Gebündelte Steuerseite', () => {
  it('entfernt den angezeigten Kurs über seine konkrete Kennung', async () => {
    const h = setup();
    await vi.waitFor(() =>
      expect(h.document.querySelector('[data-action="remove-course"]')).not.toBeNull(),
    );
    h.document.querySelector<HTMLButtonElement>('[data-action="remove-course"]')!.click();
    await vi.waitFor(() =>
      expect(h.requests).toContainEqual({
        type: 'REMOVE_COURSE',
        platform: 'linkedin',
        slug: 'introduction-to-agentic-ai-governance',
      }),
    );
    await vi.waitFor(() => expect(h.document.querySelector('#course .empty')).not.toBeNull());
  });
  it('zeigt die echte Verteilung und sendet die gewählte Ansichtenzahl', async () => {
    const h = setup();
    await vi.waitFor(() => expect(h.document.querySelectorAll('.plan-lane').length).toBe(8));
    expect(h.document.querySelector('#course')!.textContent).toContain('8:42');
    const count = h.document.querySelector<HTMLSelectElement>('#count')!;
    count.value = '2';
    count.dispatchEvent(new count.ownerDocument.defaultView!.Event('change'));
    expect(h.document.querySelectorAll('.plan-lane').length).toBe(2);
    h.document.querySelector<HTMLButtonElement>('[data-action="start"]')!.click();
    await vi.waitFor(() =>
      expect(h.requests.some((r) => r.type === 'START' && r.count === 2)).toBe(true),
    );
  });
  it('sperrt einen unvollständigen Kurs und escaped Kursinhalte', async () => {
    const h = setup();
    await vi.waitFor(() =>
      expect(h.document.querySelector('[data-action="start"]')).not.toBeNull(),
    );
    h.state.scan!.course!.complete = false;
    h.state.scan!.course!.issues = ['Login erforderlich'];
    h.state.scan!.course!.title = '<img src=x onerror="alert(1)">';
    h.update();
    await vi.waitFor(() =>
      expect(h.document.querySelector<HTMLButtonElement>('[data-action="start"]')?.disabled).toBe(
        true,
      ),
    );
    expect(h.document.querySelector('#course img')).toBeNull();
    expect(h.document.querySelector('#course')!.textContent).toContain('<img');
  });
});
