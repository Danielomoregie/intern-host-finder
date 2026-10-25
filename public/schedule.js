// Daniel requested 30-minute research immediately on October 24 (US Central).
// Use the saved automation update time for the first estimated check.
export const CADENCE_START = 1792896442456;
export function scanTiming(last) {
  const intervalMinutes = 30;
  const previous = last ? Date.parse(last.scheduledFor || last.at) : NaN;
  if (!Number.isFinite(previous)) return { intervalMinutes, nextAt: null };
  const nextAt = Math.max(previous, CADENCE_START) + intervalMinutes * 60000;
  return { intervalMinutes, nextAt };
}
