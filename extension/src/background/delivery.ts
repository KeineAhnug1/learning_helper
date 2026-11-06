import type { AppState, Lane } from '../shared/types';

export const MAX_PARALLEL_LOADS = 4;
export const LOAD_TIMEOUT = 45000;
export const MAX_DELIVERY_RETRIES = 2;

export function parallelLoads(state: AppState): number {
  const limit = state.pluralsightLoadLimit;
  return Number.isInteger(limit) && limit! >= 1 && limit! <= MAX_PARALLEL_LOADS
    ? limit!
    : MAX_PARALLEL_LOADS;
}

export function loadedSuccessfully(state: AppState): void {
  const limit = parallelLoads(state);
  if (limit === MAX_PARALLEL_LOADS) return;
  const successes = (state.pluralsightLoadSuccesses ?? 0) + 1;
  state.pluralsightLoadSuccesses = successes;
  if (successes >= limit * 2) {
    state.pluralsightLoadLimit = limit + 1;
    state.pluralsightLoadSuccesses = 0;
  }
}

export function diagnosticHeaders(
  headers: { name: string; value?: string }[] = [],
): Record<string, string> {
  const allowed = new Set([
    'retry-after',
    'ratelimit',
    'ratelimit-policy',
    'ratelimit-limit',
    'ratelimit-remaining',
    'ratelimit-reset',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-rate-limit-limit',
    'x-rate-limit-remaining',
    'x-rate-limit-reset',
  ]);
  return Object.fromEntries(
    headers
      .filter((h) => allowed.has(h.name.toLowerCase()) && h.value !== undefined)
      .map((h) => [h.name.toLowerCase(), h.value!.slice(0, 256)]),
  );
}

export function deliveryClip(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://app.pluralsight.com') return null;
    return (
      parsed.pathname
        .match(/^\/video\/delivery\/api\/v1\/clips\/([a-f0-9-]+)\/versions\/[^/]+\/?$/i)?.[1]
        .toLowerCase() ?? null
    );
  } catch {
    return null;
  }
}

export function retryAfter(value: string | undefined, now: number): number {
  if (!value?.trim()) return now;
  const input = value.trim();
  if (/^\d+$/.test(input)) {
    const time = now + Number(input) * 1000;
    return Number.isSafeInteger(time) ? time : now;
  }
  const time = Date.parse(input);
  return Number.isFinite(time) ? Math.max(now, time) : now;
}

export function deferLoad(lane: Lane, after: number, message: string): void {
  lane.epoch++;
  lane.sequence = 0;
  lane.docKey = undefined;
  lane.loadAfter = after;
  lane.position = 0;
  if (lane.status !== 'paused') lane.status = 'queued';
  lane.message = message;
}

export function deferRateLimit(
  state: AppState,
  lane: Lane,
  header: string | undefined,
  now = Date.now(),
): void {
  const backoffActive = (state.pluralsightLoadAfter ?? 0) > now;
  const attempt = (lane.deliveryRetries ?? 0) + 1;
  const after = Math.max(
    state.pluralsightLoadAfter ?? 0,
    retryAfter(header, now),
    now + 60000 * 2 ** Math.min(attempt - 1, MAX_DELIVERY_RETRIES - 1),
  );
  state.pluralsightLoadAfter = after;
  // Several rejected tabs in the same wave are one signal to reduce concurrency.
  if (!backoffActive)
    state.pluralsightLoadLimit = Math.max(1, Math.floor(parallelLoads(state) / 2));
  state.pluralsightLoadSuccesses = 0;
  lane.rateLimitedEpoch = lane.epoch;
  if (attempt > MAX_DELIVERY_RETRIES) {
    lane.status = 'error';
    lane.message =
      'Pluralsight begrenzt weiterhin die Videoanfragen (HTTP 429). Zwei automatische Wiederholungen sind ausgeschöpft. Später mit weniger Ansichten neu starten.';
    return;
  }
  lane.deliveryRetries = attempt;
  deferLoad(
    lane,
    after,
    'Pluralsight begrenzt Videoanfragen (HTTP 429). Wiederholung ' +
      attempt +
      '/' +
      MAX_DELIVERY_RETRIES +
      ' frühestens um ' +
      new Date(after).toLocaleTimeString('de-DE') +
      '.',
  );
}
