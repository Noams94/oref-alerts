// ─── Types & Constants ─────────────────────────────────────────────────────

export interface Alert {
  id: number;
  alert_dt: string;
  city: string;
  title: string;
  category: number;
  cat_desc: string;
  source: string;
  origin: string;
}

export interface MapPoint {
  city: string;
  lat: number;
  lon: number;
  total: number;
  top_title: string;
}

export interface Stats {
  total: number;
  cities: number;
  newest: string;
  oldest: string;
  new_today: number;
}

export const CAT_NAMES: Record<number, string> = {
  1: "ירי רקטות וטילים",
  2: "חדירת כלי טיס עוין",
  3: "רעידת אדמה",
  4: "חשש לצונאמי",
  5: "אירוע חומרים מסוכנים",
  6: "התרעה ביטחונית",
  7: "גל חום",
  8: "תרגיל",
  13: "ביטול / חזרה לשגרה",
  14: "הנחיות פיקוד העורף",
  15: "חדירת כלי טיס",
  101: "ירי רקטות",
};

export const CAT_COLORS: Record<number, string> = {
  1: "#FF4444",
  2: "#FF8800",
  3: "#AA44FF",
  4: "#4488FF",
  5: "#FF44AA",
  6: "#FF6600",
  13: "#44BB44",
  14: "#FFCC00",
  15: "#FF8844",
  101: "#FF4444",
};

export const DEFAULT_COLOR = "#AAAAAA";

// Title → color mapping (used by the map)
export function colorForTitle(title: string): string {
  for (const [cat, name] of Object.entries(CAT_NAMES)) {
    if (name === title) return CAT_COLORS[Number(cat)] ?? DEFAULT_COLOR;
  }
  return DEFAULT_COLOR;
}

// ─── API URLs ──────────────────────────────────────────────────────────────

export const OREF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: "https://www.oref.org.il/",
  "X-Requested-With": "XMLHttpRequest",
  Accept: "application/json",
};

export const HISTORY_URL =
  "https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1";
export const LIVE_URL =
  "https://www.oref.org.il/warningMessages/alert/Alerts.json";
export const CSV_SOURCE_URL =
  "https://raw.githubusercontent.com/yuval-harpaz/alarms/master/data/alarms.csv";
export const COORD_CSV_URL =
  "https://raw.githubusercontent.com/yuval-harpaz/alarms/master/data/coord.csv";

// ─── Timezone ──────────────────────────────────────────────────────────────

/**
 * Find the last Friday of a given month/year (Israel DST starts last Friday of March)
 */
function lastFridayOf(year: number, month: number): number {
  // Start from last day of month, walk backwards to Friday (day 5)
  const d = new Date(Date.UTC(year, month + 1, 0)); // last day of month
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 2) % 7; // days back to Friday (5)
  return d.getUTCDate() - diff;
}

/**
 * Find the last Sunday of a given month/year (Israel DST ends last Sunday of October)
 */
function lastSundayOf(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month + 1, 0));
  const day = d.getUTCDay();
  return d.getUTCDate() - day;
}

/**
 * Check if a UTC date falls in Israel DST.
 * Israel DST: last Friday of March at 02:00 → last Sunday of October at 02:00
 */
function isIsraelDST(d: Date): boolean {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed

  // April(3) through September(9) — always DST
  if (month >= 3 && month <= 8) return true;
  // November(10) through February(1) — never DST
  if (month >= 10 || month <= 1) return false;

  // March (2): DST starts on last Friday at 02:00 local (00:00 UTC)
  if (month === 2) {
    const lastFri = lastFridayOf(year, 2);
    const dstStart = new Date(Date.UTC(year, 2, lastFri, 0, 0, 0)); // 02:00 IST = 00:00 UTC
    return d >= dstStart;
  }

  // October (9): DST ends on last Sunday at 02:00 local (23:00 UTC previous day, since still +3)
  if (month === 9) {
    const lastSun = lastSundayOf(year, 9);
    const dstEnd = new Date(Date.UTC(year, 9, lastSun - 1, 23, 0, 0)); // 02:00 IST(+3) = 23:00 UTC prev day
    return d < dstEnd;
  }

  return false;
}

/**
 * OREF API returns timestamps in Israel local time (no timezone info).
 * This function appends the Israel timezone offset so PostgreSQL stores them correctly.
 * e.g. "2026-03-24 20:51:00" → "2026-03-24T20:51:00+02:00"
 */
export function toIsraelISO(dt: string): string {
  // If already has timezone info, return as-is
  if (dt.includes("+") || dt.includes("Z") || dt.match(/\d{2}:\d{2}:\d{2}[+-]/)) {
    return dt;
  }
  try {
    const d = new Date(dt.replace(" ", "T") + "Z"); // parse as UTC temporarily
    const offset = isIsraelDST(d) ? "+03:00" : "+02:00";
    return dt.replace(" ", "T") + offset;
  } catch {
    return dt;
  }
}

// ─── Origin translations ──────────────────────────────────────────────────

export const ORIGIN_HEBREW: Record<string, string> = {
  Gaza: "עזה",
  Lebanon: "לבנון",
  Iran: "אירן",
  Yemen: "תימן",
  Syria: "סוריה",
  Iraq: "עיראק",
  Israel: "ישראל",
  FA: "התרעת שווא",
};

export function originToHebrew(origin: string): string {
  return ORIGIN_HEBREW[origin] ?? origin;
}

// ─── Hash for dedup ────────────────────────────────────────────────────────

export function alertHash(dt: string, city: string, title: string): string {
  return `${dt}|${city}|${title}`;
}
