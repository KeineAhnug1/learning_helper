import { fullyPlayed } from '../controller/coverage';
import type { Lane, PlayerEvent, Run } from '../shared/types';
export function acceptEvent(run: Run, tabId: number, event: PlayerEvent): Lane | null {
  if (!['running', 'paused', 'starting'].includes(run.status) || run.id !== event.runId)
    return null;
  const lane = run.lanes.find((l) => l.tabId === tabId);
  if (
    !lane ||
    lane.loadAfter !== undefined ||
    lane.rateLimitedEpoch === lane.epoch ||
    lane.status === 'done' ||
    lane.epoch !== event.epoch ||
    lane.docKey !== event.docKey ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence <= lane.sequence ||
    lane.videoIds[lane.index] !== event.videoId
  )
    return null;
  return lane;
}
export function applyEvent(
  run: Run,
  lane: Lane,
  event: PlayerEvent,
): 'updated' | 'advance' | 'done' {
  lane.sequence = event.sequence;
  lane.updatedAt = Date.now();
  lane.position = Math.max(0, event.position);
  lane.status = event.status;
  lane.message = event.error;
  if (event.diagnostics) lane.diagnostics = event.diagnostics;
  if (event.completion) run.progress[event.videoId] = event.completion;
  if (!event.ended) return 'updated';
  if (!fullyPlayed(event.ended.duration, event.ended.ranges)) {
    lane.status = 'waiting';
    lane.message =
      'Das Video wurde nicht vollständig abgespielt. Mit „Neu starten“ ab Beginn wiederholen.';
    return 'updated';
  }
  if (!run.completed.includes(event.videoId)) run.completed.push(event.videoId);
  lane.index++;
  lane.epoch++;
  lane.sequence = 0;
  lane.docKey = undefined;
  lane.position = 0;
  lane.deliveryRetries = 0;
  lane.rateLimitedEpoch = undefined;
  lane.loadStartedAt = undefined;
  if (lane.index === lane.videoIds.length) {
    lane.status = 'done';
    if (run.lanes.every((l) => l.status === 'done')) run.status = 'complete';
    return 'done';
  }
  lane.status = 'loading';
  return 'advance';
}
export function releaseStartBarrier(run?: Run): boolean {
  if (
    !run ||
    run.status !== 'starting' ||
    !run.lanes.some((lane) => lane.status === 'ready') ||
    (run.course.ref.platform !== 'pluralsight' &&
      run.lanes.some((lane) => lane.status === 'loading'))
  )
    return false;
  run.status = 'running';
  return true;
}
