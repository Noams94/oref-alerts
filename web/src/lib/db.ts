import { neon } from "@neondatabase/serverless";

function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

// ─── Schema Migration ──────────────────────────────────────────────────────

export async function ensureSchema() {
  const sql = getSQL();
  await sql`
    CREATE TABLE IF NOT EXISTS alerts (
      id         SERIAL PRIMARY KEY,
      alert_dt   TIMESTAMPTZ NOT NULL,
      city       TEXT NOT NULL,
      title      TEXT NOT NULL,
      category   INTEGER NOT NULL DEFAULT 0,
      cat_desc   TEXT DEFAULT '',
      source     TEXT DEFAULT 'history',
      origin     TEXT DEFAULT '',
      hash       TEXT NOT NULL
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_hash ON alerts(hash)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_alerts_dt ON alerts(alert_dt DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_alerts_city ON alerts(city)`;
  await sql`
    CREATE TABLE IF NOT EXISTS city_coords (
      city   TEXT PRIMARY KEY,
      lat    DOUBLE PRECISION,
      lon    DOUBLE PRECISION,
      source TEXT DEFAULT 'csv'
    )
  `;
}

// ─── Queries ───────────────────────────────────────────────────────────────

export interface AlertFilters {
  date_from?: string;
  date_to?: string;
  city?: string;
  types?: string[];
  origins?: string[];
}

// Since neon() only supports tagged templates, we use simple queries
// with broad filters handled in JS when needed.

export async function getAlerts(filters: AlertFilters, limit = 100) {
  const sql = getSQL();
  const df = filters.date_from ? filters.date_from + "T00:00:00Z" : "1970-01-01T00:00:00Z";
  const dt = filters.date_to ? filters.date_to + "T23:59:59Z" : "2099-12-31T23:59:59Z";
  const city = filters.city ? `%${filters.city}%` : "%";
  const types = filters.types?.length ? filters.types : null;
  const origins = filters.origins?.length ? filters.origins : null;

  const rows = await sql`
    SELECT id, alert_dt, city, title, category, cat_desc, source, origin
    FROM alerts
    WHERE alert_dt >= ${df}
      AND alert_dt <= ${dt}
      AND city ILIKE ${city}
      AND (${types}::text[] IS NULL OR title = ANY(${types}))
      AND (${origins}::text[] IS NULL OR origin = ANY(${origins}))
    ORDER BY alert_dt DESC
    LIMIT ${limit}
  `;

  return rows;
}

export async function getStats(filters: AlertFilters) {
  const sql = getSQL();
  const df = filters.date_from ? filters.date_from + "T00:00:00Z" : "1970-01-01T00:00:00Z";
  const dt = filters.date_to ? filters.date_to + "T23:59:59Z" : "2099-12-31T23:59:59Z";
  const city = filters.city ? `%${filters.city}%` : "%";
  const types = filters.types?.length ? filters.types : null;
  const origins = filters.origins?.length ? filters.origins : null;

  const rows = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT city) as cities,
      MAX(alert_dt) as newest,
      MIN(alert_dt) as oldest
    FROM alerts
    WHERE alert_dt >= ${df}
      AND alert_dt <= ${dt}
      AND city ILIKE ${city}
      AND (${types}::text[] IS NULL OR title = ANY(${types}))
      AND (${origins}::text[] IS NULL OR origin = ANY(${origins}))
  `;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayRows = await sql`
    SELECT COUNT(*) as cnt FROM alerts WHERE alert_dt >= ${todayStart.toISOString()}
  `;

  return {
    total: Number(rows[0]?.total ?? 0),
    cities: Number(rows[0]?.cities ?? 0),
    newest: (rows[0]?.newest as string) ?? "—",
    oldest: (rows[0]?.oldest as string) ?? "—",
    new_today: Number(todayRows[0]?.cnt ?? 0),
  };
}

export async function getMapData(filters: AlertFilters) {
  const sql = getSQL();
  const df = filters.date_from ? filters.date_from + "T00:00:00Z" : "1970-01-01T00:00:00Z";
  const dt = filters.date_to ? filters.date_to + "T23:59:59Z" : "2099-12-31T23:59:59Z";
  const city = filters.city ? `%${filters.city}%` : "%";
  const types = filters.types?.length ? filters.types : null;
  const origins = filters.origins?.length ? filters.origins : null;

  const rows = await sql`
    SELECT a.city, c.lat, c.lon, a.title, COUNT(*) as n
    FROM alerts a
    JOIN city_coords c ON a.city = c.city
    WHERE c.lat IS NOT NULL AND c.lon IS NOT NULL
      AND a.alert_dt >= ${df}
      AND a.alert_dt <= ${dt}
      AND a.city ILIKE ${city}
      AND (${types}::text[] IS NULL OR a.title = ANY(${types}))
      AND (${origins}::text[] IS NULL OR a.origin = ANY(${origins}))
    GROUP BY a.city, c.lat, c.lon, a.title
  `;

  const filtered = rows;

  // Group by city → pick top title
  const cities: Record<
    string,
    { city: string; lat: number; lon: number; total: number; titles: Record<string, number> }
  > = {};

  for (const r of filtered) {
    const cityName = r.city as string;
    if (!cities[cityName]) {
      cities[cityName] = {
        city: cityName,
        lat: r.lat as number,
        lon: r.lon as number,
        total: 0,
        titles: {},
      };
    }
    cities[cityName].total += Number(r.n);
    cities[cityName].titles[r.title as string] =
      (cities[cityName].titles[r.title as string] ?? 0) + Number(r.n);
  }

  return Object.values(cities).map((d) => {
    const topTitle = Object.entries(d.titles).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    return { city: d.city, lat: d.lat, lon: d.lon, total: d.total, top_title: topTitle };
  });
}

export async function getDistinctCities() {
  const sql = getSQL();
  return sql`
    SELECT city, COUNT(*) as total
    FROM alerts
    GROUP BY city ORDER BY total DESC
  `;
}

export async function getDistinctTypes() {
  const sql = getSQL();
  return sql`
    SELECT title, MIN(category) as category, COUNT(*) as total
    FROM alerts
    WHERE length(title) > 3
      AND title !~ '^[0-9]+$'
    GROUP BY title ORDER BY total DESC
  `;
}

const VALID_ORIGINS = ['Gaza', 'Lebanon', 'Iran', 'Yemen', 'Syria', 'Iraq', 'Israel', 'FA'];

export async function getDistinctOrigins() {
  const sql = getSQL();
  const rows = await sql`
    SELECT origin, COUNT(*) as total FROM alerts
    WHERE origin != '' GROUP BY origin ORDER BY total DESC
  `;
  return rows.filter((r) => VALID_ORIGINS.includes(r.origin as string));
}

export async function insertAlert(alert: {
  alert_dt: string;
  city: string;
  title: string;
  category: number;
  cat_desc: string;
  source: string;
  origin?: string;
  hash: string;
}) {
  const sql = getSQL();
  try {
    await sql`
      INSERT INTO alerts (alert_dt, city, title, category, cat_desc, source, origin, hash)
      VALUES (${alert.alert_dt}, ${alert.city}, ${alert.title}, ${alert.category},
              ${alert.cat_desc}, ${alert.source}, ${alert.origin ?? ""}, ${alert.hash})
      ON CONFLICT (hash) DO NOTHING
    `;
    return true;
  } catch {
    return false;
  }
}

export type AlertRow = {
  alert_dt: string;
  city: string;
  title: string;
  category: number;
  cat_desc: string;
  source: string;
  origin: string;
  hash: string;
};

/** Batch insert up to ~200 rows at a time using unnest arrays */
export async function insertAlertsBatch(rows: AlertRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const sql = getSQL();
  try {
    const result = await sql`
      INSERT INTO alerts (alert_dt, city, title, category, cat_desc, source, origin, hash)
      SELECT * FROM unnest(
        ${rows.map((r) => r.alert_dt)}::timestamptz[],
        ${rows.map((r) => r.city)}::text[],
        ${rows.map((r) => r.title)}::text[],
        ${rows.map((r) => r.category)}::integer[],
        ${rows.map((r) => r.cat_desc)}::text[],
        ${rows.map((r) => r.source)}::text[],
        ${rows.map((r) => r.origin)}::text[],
        ${rows.map((r) => r.hash)}::text[]
      )
      ON CONFLICT (hash) DO NOTHING
    `;
    return result.length ?? rows.length;
  } catch (e) {
    console.error("Batch insert error:", e);
    return 0;
  }
}

export async function insertCoords(
  coords: Array<{ city: string; lat: number; lon: number }>
) {
  const sql = getSQL();
  for (const c of coords) {
    await sql`
      INSERT INTO city_coords (city, lat, lon, source)
      VALUES (${c.city}, ${c.lat}, ${c.lon}, 'csv')
      ON CONFLICT (city) DO UPDATE SET lat = ${c.lat}, lon = ${c.lon}
    `;
  }
}
