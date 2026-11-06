import { describe, expect, it } from 'vitest';
import {
  retryAfter,
  deliveryClip,
  diagnosticHeaders,
  loadedSuccessfully,
  parallelLoads,
} from '../src/background/delivery';
import type { AppState } from '../src/shared/types';
describe('Retry-After und Video-Endpunkt', () => {
  it('erhöht eine reduzierte Parallelität erst nach mehreren erfolgreichen Ladevorgängen', () => {
    const state: AppState = { pluralsightLoadLimit: 1 };
    loadedSuccessfully(state);
    expect(parallelLoads(state)).toBe(1);
    loadedSuccessfully(state);
    expect(parallelLoads(state)).toBe(2);
    for (let i = 0; i < 4; i++) loadedSuccessfully(state);
    expect(parallelLoads(state)).toBe(3);
    for (let i = 0; i < 10; i++) loadedSuccessfully(state);
    expect(parallelLoads(state)).toBe(4);
  });
  it('protokolliert nur ausgewählte Begrenzungsheader, keine Cookies oder Zugangsdaten', () => {
    expect(
      diagnosticHeaders([
        { name: 'Retry-After', value: '10' },
        { name: 'X-RateLimit-Remaining', value: '0' },
        { name: 'Set-Cookie', value: 'private' },
        { name: 'Authorization', value: 'private' },
        { name: 'x-session-token', value: 'private' },
      ]),
    ).toEqual({ 'retry-after': '10', 'x-ratelimit-remaining': '0' });
  });
  it('liest Sekunden und HTTP-Datum ohne den Serverzeitpunkt zu verkürzen', () => {
    const now = Date.UTC(2026, 10, 6, 18, 20, 0);
    expect(retryAfter('180', now)).toBe(now + 180000);
    expect(retryAfter('Fri, 06 Nov 2026 18:25:00 GMT', now)).toBe(now + 300000);
    for (const value of [undefined, '', 'invalid', '0', 'Fri, 06 Nov 2026 18:00:00 GMT'])
      expect(retryAfter(value, now)).toBe(now);
  });
  it('erkennt den Video-Endpunkt aus dem Konsolenlog, nicht den Telemetriedienst', () => {
    const clip = '56bf7072-557b-4509-8d4d-089b7120114c';
    expect(
      deliveryClip(
        'https://app.pluralsight.com/video/delivery/api/v1/clips/' +
          clip +
          '/versions/570f545b-f6ab-4e9a-b14e-8293ba75c7ea',
      ),
    ).toBe(clip);
    expect(deliveryClip('https://bam.nr-data.net/1/2700af8a3c')).toBeNull();
  });
});
