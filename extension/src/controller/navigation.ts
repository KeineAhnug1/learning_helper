import type { Assignment } from '../shared/types';
import { pluralsightPlayer } from '../shared/urls';
export interface NavigationIntent {
  runId: string;
  epoch: number;
  slot: number;
  videoId: string;
  sourcePage: string;
  createdAt: number;
}
export function playerAfterAssignedClick(
  intent: NavigationIntent | undefined,
  assignment: Assignment,
  page: string,
  now = Date.now(),
): string | null {
  if (
    !intent ||
    assignment.ref.platform !== 'pluralsight' ||
    assignment.video.target.kind !== 'item' ||
    intent.runId !== assignment.runId ||
    intent.epoch !== assignment.epoch ||
    intent.slot !== assignment.slot ||
    intent.videoId !== assignment.video.id ||
    !Number.isFinite(intent.createdAt) ||
    now - intent.createdAt < 0 ||
    now - intent.createdAt > 60000
  )
    return null;
  const route = pluralsightPlayer(page);
  if (
    !route ||
    (assignment.ref.pluralsightCourseId && route.courseId !== assignment.ref.pluralsightCourseId)
  )
    return null;
  try {
    const source = new URL(intent.sourcePage),
      expected = new URL(assignment.ref.url);
    if (
      source.origin !== 'https://app.pluralsight.com' ||
      source.origin !== expected.origin ||
      source.pathname !== expected.pathname ||
      source.pathname === new URL(page).pathname
    )
      return null;
  } catch {
    return null;
  }
  return route.url;
}
