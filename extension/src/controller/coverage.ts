// An ended event alone does not establish that the entire video was played.
export function fullyPlayed(duration: number, ranges: [number, number][]): boolean {
  if (!Number.isFinite(duration) || duration <= 0 || !ranges.length) return false;
  const tolerance = Math.min(0.5, duration * 0.01);
  let end = 0;
  for (const [start, stop] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(stop) ||
      start < 0 ||
      stop < start ||
      stop > duration + tolerance ||
      start > end + tolerance
    )
      return false;
    end = Math.max(end, stop);
  }
  return end >= duration - tolerance;
}
