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
 * OREF API returns timestamps in Israel local time (no timezone info).
 * This function appends the Israel timezone offset so PostgreSQL stores them correctly.
 * e.g. "2026-03-24 20:51:00" → "2026-03-24T20:51:00+03:00"
 */
export function toIsraelISO(dt: string): string {
  // If already has timezone info, return as-is
  if (dt.includes("+") || dt.includes("Z") || dt.match(/\d{2}:\d{2}:\d{2}[+-]/)) {
    return dt;
  }
  // Israel is UTC+2 in winter, UTC+3 in summer (DST)
  // Check if date falls in DST (last Friday of March to last Sunday of October)
  try {
    const d = new Date(dt.replace(" ", "T") + "Z"); // parse as UTC temporarily
    const month = d.getUTCMonth(); // 0-indexed
    // Rough DST check: April-October = +3, November-March = +2
    // (Israel DST starts last Friday of March, ends last Sunday of October)
    const isDST = month >= 3 && month <= 9; // April(3) through October(9)
    const offset = isDST ? "+03:00" : "+02:00";
    return dt.replace(" ", "T") + offset;
  } catch {
    return dt;
  }
}

// ─── Hash for dedup ────────────────────────────────────────────────────────

export function alertHash(dt: string, city: string, title: string): string {
  return `${dt}|${city}|${title}`;
}
