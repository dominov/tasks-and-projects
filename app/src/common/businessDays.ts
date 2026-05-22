/**
 * Business-day calendar utilities shared by the main and renderer processes.
 *
 * A "free day" is any date (in YYYY-MM-DD form) that should be treated as
 * non-working. The caller supplies the set so this module stays pure: the main
 * process composes it from `colombia-holidays.json` plus the rows of the
 * `custom_free_days` table; the renderer can use the same logic when it needs
 * to visualise the calendar.
 */

/** Returns true when `date` is Monday-Friday and not in `freeDays`. */
export function isWorkingDay(date: Date, freeDays?: ReadonlySet<string>): boolean {
  const dayOfWeek = date.getDay()

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false
  }

  if (freeDays && freeDays.has(toIsoDate(date))) {
    return false
  }

  return true
}

/**
 * Advance `startDate` by `days` *business* days. The starting date itself is
 * never consumed: the returned date is always strictly after `startDate` when
 * `days > 0`. Non-positive `days` returns a copy of `startDate` unchanged.
 *
 * The algorithm walks the calendar one day at a time and only decrements the
 * counter when it lands on a working day, which keeps weekends and free days
 * from absorbing iterations.
 */
export function addBusinessDays(startDate: Date, days: number, freeDays?: ReadonlySet<string>): Date {
  const result = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())

  if (!Number.isFinite(days) || days <= 0) {
    return result
  }

  let remaining = Math.floor(days)

  while (remaining > 0) {
    result.setDate(result.getDate() + 1)

    if (isWorkingDay(result, freeDays)) {
      remaining -= 1
    }
  }

  return result
}

/**
 * Count working days inside the inclusive interval [start, end]. Returns 0
 * when `start` is after `end`.
 */
export function getBusinessDaysDistance(start: Date, end: Date, freeDays?: ReadonlySet<string>): number {
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const stop = new Date(end.getFullYear(), end.getMonth(), end.getDate())

  if (cursor > stop) {
    return 0
  }

  let count = 0

  while (cursor <= stop) {
    if (isWorkingDay(cursor, freeDays)) {
      count += 1
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return count
}

/** Convert a Date into a YYYY-MM-DD string in local time. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Parse a YYYY-MM-DD string into a local-time Date (midnight). */
export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}
