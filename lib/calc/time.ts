// Asia/Kolkata date helpers. Pure: `today` is passed in, never Date.now().
// Invariant: dates in Asia/Kolkata. No server-local or UTC date arithmetic.

export const MS_PER_DAY = 86_400_000

const KOLKATA = "Asia/Kolkata"

/**
 * Current calendar date in Asia/Kolkata as YYYY-MM-DD.
 * `today` is the reference instant; callers pass it (no Date.now inside).
 */
export function kolkataDate(today: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today)
}

/**
 * ISO week number (1-53) for a date, in Asia/Kolkata.
 */
export function kolkataISOWeek(today: Date): number {
  // Build a Kolkata-local midnight Date for the ISO-week calculation
  const localStr = kolkataDate(today)
  const [y, m, d] = localStr.split("-").map(Number)
  const tmp = new Date(Date.UTC(y, m - 1, d))
  tmp.setUTCDate(tmp.getUTCDate() + 3 - ((tmp.getUTCDay() + 6) % 7))
  const week1 = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4))
  return (
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / MS_PER_DAY -
        ((week1.getUTCDay() + 6) % 7) +
        3) /
        7
    )
  )
}

/**
 * Monday (YYYY-MM-DD) of the ISO week containing `today` in Asia/Kolkata.
 * Uses pure UTC calendar arithmetic so server timezone never affects the result.
 */
export function kolkataSaleWeek(today: Date): string {
  const localStr = kolkataDate(today)
  const [y, m, d] = localStr.split("-").map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  const dayFromMonday = (utc.getUTCDay() + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - dayFromMonday)
  return utc.toISOString().slice(0, 10)
}
