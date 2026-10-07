// Pakistan Standard Time, UTC+5, no DST. Date.getTimezoneOffset() convention
// (ahead of UTC => negative), same sign as everywhere else in this codebase.
const PKT_OFFSET_MINUTES = -300;

/**
 * The lead-entry team works a fixed overnight shift — 9pm to 6am Pakistan
 * time — regardless of what timezone whoever's looking at the dashboard
 * happens to be in. "Today" for their lead count means that shift: the one
 * currently in progress if it's between 9pm and 6am PKT, or the one that
 * just finished if it's daytime and tonight's hasn't started yet. Returns
 * a half-open [start, end) window in UTC instants.
 */
export function currentShiftWindow() {
  const nowMs = Date.now();
  const nowPkt = new Date(nowMs - PKT_OFFSET_MINUTES * 60_000);
  const y = nowPkt.getUTCFullYear();
  const m = nowPkt.getUTCMonth();
  const d = nowPkt.getUTCDate();

  const todayNinePm = new Date(Date.UTC(y, m, d, 21, 0, 0, 0) + PKT_OFFSET_MINUTES * 60_000);

  if (nowMs < todayNinePm.getTime()) {
    // Before tonight's shift starts — report last night's (9pm yesterday
    // through 6am today), which is still the most recent completed one.
    return {
      start: new Date(Date.UTC(y, m, d - 1, 21, 0, 0, 0) + PKT_OFFSET_MINUTES * 60_000),
      end: new Date(Date.UTC(y, m, d, 6, 0, 0, 0) + PKT_OFFSET_MINUTES * 60_000),
    };
  }
  // 9pm or later — tonight's shift is underway.
  return {
    start: todayNinePm,
    end: new Date(Date.UTC(y, m, d + 1, 6, 0, 0, 0) + PKT_OFFSET_MINUTES * 60_000),
  };
}
