import type { Plan, Video } from '../shared/types';
export function planCourse(videos: Video[], requested: number): Plan {
  if (!Number.isInteger(requested) || requested < 1 || requested > 8)
    throw new Error('Bitte 1 bis 8 Ansichten wählen.');
  if (new Set(videos.map((v) => v.id)).size !== videos.length)
    throw new Error('Doppelte Video-IDs: Kurs bitte neu erfassen.');
  if (!videos.length) return { segments: [], estimated: false, seconds: null, totalSeconds: null };
  const known = videos
    .flatMap((v) =>
      v.duration !== null && Number.isFinite(v.duration) && v.duration > 0 ? [v.duration] : [],
    )
    .sort((a, b) => a - b);
  const median = known.length
    ? (known[Math.floor((known.length - 1) / 2)] + known[Math.floor(known.length / 2)]) / 2
    : 1;
  const weights = videos.map((v) =>
    v.duration !== null && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : median,
  );
  const estimated = known.length !== videos.length;
  const n = weights.length,
    k = Math.min(n, requested);
  const prefix = [0];
  for (const d of weights) prefix.push(prefix.at(-1)! + d);
  const dp = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(Infinity));
  const cuts = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(0));
  dp[0][0] = 0;
  for (let lanes = 1; lanes <= k; lanes++)
    for (let i = lanes; i <= n; i++)
      for (let j = lanes - 1; j < i; j++) {
        const cost = Math.max(dp[lanes - 1][j], prefix[i] - prefix[j]);
        if (cost < dp[lanes][i]) {
          dp[lanes][i] = cost;
          cuts[lanes][i] = j;
        }
      }
  const segments = [];
  let end = n;
  for (let lane = k; lane > 0; lane--) {
    const start = cuts[lane][end];
    segments.unshift({
      slot: lane - 1,
      videoIds: videos.slice(start, end).map((v) => v.id),
      seconds: prefix[end] - prefix[start],
    });
    end = start;
  }
  return {
    segments,
    estimated,
    seconds: estimated ? null : dp[k][n],
    totalSeconds: estimated ? null : prefix[n],
  };
}
