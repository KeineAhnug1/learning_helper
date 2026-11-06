import { describe, expect, it } from 'vitest';
import { fullyPlayed } from '../src/controller/coverage';
import { acceptEvent, applyEvent } from '../src/background/state';
import type { PlayerEvent, Run } from '../src/shared/types';
const run = (): Run => ({
  id: 'r',
  course: {
    ref: {
      platform: 'linkedin',
      slug: 'c',
      url: 'https://www.linkedin.com/learning/c',
      sourceUrl: '',
    },
    title: 'Course',
    videos: [],
    complete: true,
    issues: [],
    scannedAt: 0,
  },
  lanes: [
    {
      slot: 0,
      videoIds: ['a', 'b'],
      index: 0,
      epoch: 3,
      tabId: 42,
      docKey: 'doc',
      sequence: 2,
      status: 'playing',
      position: 0,
      updatedAt: 0,
    },
  ],
  status: 'running',
  completed: [],
  progress: {},
  audibleSlot: null,
  createdAt: 0,
  bounds: { left: 0, top: 0, width: 1600, height: 1000 },
});
const event = (): PlayerEvent => ({
  type: 'PLAYER',
  runId: 'r',
  epoch: 3,
  docKey: 'doc',
  sequence: 3,
  videoId: 'a',
  status: 'ready',
  position: 10,
  ended: { duration: 10, ranges: [[0, 10]] },
});
describe('Wiedergabenachweis', () => {
  it('akzeptiert durchgehende und überlappende abgespielte Bereiche', () => {
    expect(
      fullyPlayed(10, [
        [0, 4],
        [4, 10],
      ]),
    ).toBe(true);
    expect(
      fullyPlayed(10, [
        [0, 7],
        [4, 10],
      ]),
    ).toBe(true);
  });
  it('weist Sprünge, Endposition ohne Wiedergabe und ungültige Werte zurück', () => {
    for (const ranges of [
      [],
      [[9, 10]],
      [
        [0, 3],
        [5, 10],
      ],
      [[0, 9]],
      [[NaN, 10]],
      [[0, Infinity]],
      [[0, 20]],
    ] as [number, number][][])
      expect(fullyPlayed(10, ranges)).toBe(false);
    expect(fullyPlayed(Infinity, [[0, 10]])).toBe(false);
  });
});
describe('Zuweisungen und Ereignisse', () => {
  it('verwirft fremde, veraltete und doppelte Meldungen', () => {
    const r = run();
    expect(acceptEvent(r, 99, event())).toBeNull();
    for (const diff of [
      { epoch: 2 },
      { runId: 'other' },
      { docKey: 'old' },
      { sequence: 2 },
      { sequence: NaN },
      { videoId: 'b' },
    ])
      expect(acceptEvent(r, 42, { ...event(), ...diff })).toBeNull();
    r.status = 'stopped';
    expect(acceptEvent(r, 42, event())).toBeNull();
  });
  it('schaltet genau einmal weiter und invalidiert alte Player-Ereignisse', () => {
    const r = run(),
      e = event(),
      lane = acceptEvent(r, 42, e)!;
    expect(applyEvent(r, lane, e)).toBe('advance');
    expect(r.completed).toEqual(['a']);
    expect(lane.epoch).toBe(4);
    expect(acceptEvent(r, 42, e)).toBeNull();
    expect(r.progress.a).toBeUndefined();
  });
  it('stoppt am Abschnittsende', () => {
    const r = run();
    r.lanes[0].videoIds = ['a'];
    expect(applyEvent(r, r.lanes[0], event())).toBe('done');
    expect(r.status).toBe('complete');
  });
  it('zählt unvollständige Wiedergabe nicht und erhält den Auftrag', () => {
    const r = run(),
      e = event();
    e.ended!.ranges = [[7, 10]];
    applyEvent(r, r.lanes[0], e);
    expect(r.completed).toEqual([]);
    expect(r.lanes[0].index).toBe(0);
    expect(r.lanes[0].status).toBe('waiting');
  });
});
