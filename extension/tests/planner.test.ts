import { describe, expect, it } from 'vitest';
import { planCourse } from '../src/planner/partition';
import type { Video } from '../src/shared/types';
import linkedin from '../../docs/video-displayer/fixtures/linkedin-agentic-ai-governance.json';
import pluralsight from '../../docs/video-displayer/fixtures/pluralsight-big-data-explained.json';
const videos = (durations: (number | null)[]): Video[] =>
  durations.map((duration, i) => ({
    id: String(i),
    title: 'Video ' + i,
    module: '',
    duration,
    target: { kind: 'item', key: String(i) },
    completion: 'unknown',
  }));
function brute(d: number[], k: number): number {
  if (k === 1) return d.reduce((a, b) => a + b, 0);
  let best = Infinity;
  for (let i = 1; i <= d.length - k + 1; i++)
    best = Math.min(
      best,
      Math.max(
        d.slice(0, i).reduce((a, b) => a + b, 0),
        brute(d.slice(i), k - 1),
      ),
    );
  return best;
}
describe('Laufzeitverteilung', () => {
  for (const fixture of [linkedin, pluralsight])
    it('reproduziert die öffentlichen Daten: ' + fixture.title, () => {
      const result = planCourse(videos(fixture.videos.map((v) => v.durationSeconds)), 8);
      expect(result.seconds).toBe(fixture.referenceSchedule.makespanSeconds);
      expect(result.totalSeconds).toBe(fixture.totalDurationSeconds);
      expect(result.segments.map((s) => s.videoIds.map(Number))).toEqual(
        fixture.referenceSchedule.segments.map((s) =>
          Array.from({ length: s.lastVideo - s.firstVideo + 1 }, (_, i) => s.firstVideo + i - 1),
        ),
      );
    });
  for (const n of [0, 1, 7, 8, 9, 14, 16, 17, 150])
    it('ordnet ' + n + ' Videos lückenlos zu', () => {
      const input = videos(Array.from({ length: n }, (_, i) => ((i * 97) % 400) + 10)),
        result = planCourse(input, 8);
      expect(result.segments.flatMap((s) => s.videoIds)).toEqual(input.map((v) => v.id));
      expect(result.segments.length).toBe(Math.min(n, 8));
      expect(result.segments.every((s) => s.videoIds.length > 0)).toBe(true);
    });
  it('ist für kleine Listen unabhängig gegen vollständige Suche geprüft', () => {
    for (let n = 1; n <= 9; n++)
      for (let k = 1; k <= Math.min(8, n); k++) {
        const d = Array.from({ length: n }, (_, i) => ((i * 37 + n * 11) % 137) + 1);
        expect(planCourse(videos(d), k).seconds).toBe(brute(d, k));
      }
  });
  it('kodiert keine Zweierpaare für 16 Videos', () => {
    const result = planCourse(videos([1000, ...Array(15).fill(1)]), 8);
    expect(result.segments[0].videoIds).toEqual(['0']);
    expect(result.seconds).toBe(1000);
  });
  it('kennzeichnet geschätzte Laufzeiten', () => {
    expect(planCourse(videos([40, null, 80]), 2)).toMatchObject({
      estimated: true,
      seconds: null,
      totalSeconds: null,
    });
    const unknown = planCourse(videos([null, null, null, null]), 2);
    expect(unknown.segments.map((s) => s.videoIds.length)).toEqual([2, 2]);
  });
  it('weist ungültige Ansichtenzahlen und doppelte IDs zurück', () => {
    for (const count of [0, 9, 1.5, NaN]) expect(() => planCourse(videos([1, 2]), count)).toThrow();
    const v = videos([1])[0];
    expect(() => planCourse([v, v], 2)).toThrow('Doppelte');
  });
});
