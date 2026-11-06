export type Platform = 'linkedin' | 'pluralsight';
export type Completion = 'complete' | 'open' | 'unknown';
export interface CourseRef {
  platform: Platform;
  slug: string;
  url: string;
  sourceUrl: string;
  pluralsightCourseId?: string;
}
export interface Video {
  id: string;
  title: string;
  module: string;
  duration: number | null;
  target: { kind: 'url'; url: string } | { kind: 'item'; key: string };
  completion: Completion;
}
export interface Course {
  ref: CourseRef;
  title: string;
  videos: Video[];
  complete: boolean;
  issues: string[];
  scannedAt: number;
}
export interface Segment {
  slot: number;
  videoIds: string[];
  seconds: number;
}
export interface Plan {
  segments: Segment[];
  estimated: boolean;
  seconds: number | null;
  totalSeconds: number | null;
}
export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
export type LaneStatus =
  'queued' | 'loading' | 'ready' | 'playing' | 'paused' | 'waiting' | 'error' | 'done';
export interface Lane {
  slot: number;
  videoIds: string[];
  index: number;
  epoch: number;
  tabId?: number;
  windowId?: number;
  docKey?: string;
  sequence: number;
  status: LaneStatus;
  message?: string;
  position: number;
  updatedAt: number;
  diagnostics?: PlayerDiagnostics;
  loadAfter?: number;
  loadStartedAt?: number;
  documentId?: string;
  deliveryRetries?: number;
  rateLimitedEpoch?: number;
  pausedByUser?: boolean;
}
export interface Run {
  id: string;
  course: Course;
  lanes: Lane[];
  status: 'starting' | 'running' | 'paused' | 'stopped' | 'complete';
  completed: string[];
  progress: Record<string, Completion>;
  audibleSlot: number | null;
  createdAt: number;
  error?: string;
  bounds: Bounds;
  deliveryLog?: DeliveryResponse[];
}
export interface DeliveryResponse {
  at: number;
  slot: number;
  videoId: string;
  clipId: string;
  status: number;
  matchesAssignment: boolean | null;
  loading: number;
  windowId?: number;
  loadingInWindow?: number;
  playingInWindow?: number;
  headers: Record<string, string>;
}
export interface Scan {
  tabId: number;
  ref: CourseRef;
  status: 'loading' | 'ready' | 'error';
  course?: Course;
  error?: string;
}
export interface AppState {
  scan?: Scan;
  run?: Run;
  pluralsightLoadAfter?: number;
  pluralsightLoadLimit?: number;
  pluralsightLoadSuccesses?: number;
}
export interface Assignment {
  runId: string;
  epoch: number;
  slot: number;
  video: Video;
  ref: CourseRef;
  paused: boolean;
  blocked: boolean;
  muted: boolean;
  deferredUntil?: number;
  message?: string;
}
export type Task =
  { mode: 'idle' } | { mode: 'scan'; ref: CourseRef } | { mode: 'run'; assignment: Assignment };
export type PlayerEvent = {
  type: 'PLAYER';
  runId: string;
  epoch: number;
  docKey: string;
  sequence: number;
  videoId: string;
  status: LaneStatus;
  position: number;
  completion?: Completion;
  error?: string;
  ended?: { duration: number; ranges: [number, number][] };
  diagnostics?: PlayerDiagnostics;
};
export interface PlayerDiagnostics {
  page: string;
  expectedVideo: string;
  selectedVideo: string | null;
  mediaElements: number;
  mediaError: number | null;
}
export type Request =
  | { type: 'STATE' }
  | { type: 'SCAN'; url: string }
  | { type: 'RESCAN' }
  | { type: 'REMOVE_COURSE'; platform: Platform; slug: string }
  | { type: 'START'; count: number; bounds: Bounds }
  | { type: 'CONTROL'; action: 'pause' | 'resume' | 'stop' | 'retry'; slot?: number }
  | { type: 'AUDIO'; slot: number | null }
  | { type: 'FOCUS'; tabId: number }
  | { type: 'HELLO'; docKey: string; resume?: { runId: string; slot: number } }
  | {
      type: 'BIND_PLAYER';
      runId: string;
      epoch: number;
      docKey: string;
      videoId: string;
      url: string;
    }
  | { type: 'COURSE'; course: Course }
  | { type: 'SCAN_ERROR'; error: string }
  | PlayerEvent;
export type Reply<T = AppState> = { ok: true; value: T } | { ok: false; error: string };
export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
export function time(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'unbekannt';
  const n = Math.max(0, Math.round(seconds));
  return n >= 3600
    ? `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
    : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
