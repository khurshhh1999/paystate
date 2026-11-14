// Ticket times, always shown in the practice's time zone. Pure functions over fixed ISO
// strings, so they give the same text on the server and in the browser.

const ZONE = "America/Chicago";

const central = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// A calendar day with no time zone attached. Formatted through UTC so it never shifts.
const calendarDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

function parts(fmt: Intl.DateTimeFormat, date: Date) {
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** "Thu Nov 12, 8:12 am" in Central time. */
export function formatCentral(iso: string): string {
  const p = parts(central, new Date(iso));
  return `${p.weekday} ${p.month} ${p.day}, ${p.hour}:${p.minute} ${(p.dayPeriod ?? "").toLowerCase()}`;
}

/**
 * Handoffs are answered by 5pm Central on the next business day. A ticket that arrives
 * Friday, Saturday or Sunday is due Monday. Holidays are not counted.
 * Returns the due day as a UTC-midnight Date standing for that calendar day.
 */
export function replyDueDay(createdIso: string): Date {
  const p = parts(central, new Date(createdIso));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = new Date(Date.UTC(Number(p.year), months.indexOf(p.month), Number(p.day)));
  // 0 Sun ... 6 Sat. Days to add to reach the next business day.
  const step = [1, 1, 1, 1, 1, 3, 2][day.getUTCDay()];
  day.setUTCDate(day.getUTCDate() + step);
  return day;
}

/** "Fri Nov 13, 5:00 pm" */
export function formatReplyDue(createdIso: string): string {
  const p = parts(calendarDay, replyDueDay(createdIso));
  return `${p.weekday} ${p.month} ${p.day}, 5:00 pm`;
}
