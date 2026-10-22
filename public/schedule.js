// The local research automation changes cadence at midnight US Central on Nov 1.
export const HOURLY_START = Date.parse('2026-11-01T00:00:00-05:00');
export function scanTiming(last, now = Date.now()) {
  const hourly = now >= HOURLY_START;
  const intervalHours = hourly ? 1 : 3;
  const previous = last ? Date.parse(last.scheduledFor || last.at) : NaN;
  if (!Number.isFinite(previous)) return { intervalHours, nextAt: null };
  // Before the change, never count past the changeover. After it, the first
  // hourly check is expected no later than an hour after the changeover.
  const nextAt = hourly
    ? Math.max(previous, HOURLY_START) + 3600000
    : Math.min(previous + 3 * 3600000, HOURLY_START);
  return { intervalHours, nextAt };
}
