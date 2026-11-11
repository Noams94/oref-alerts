import { NextResponse } from "next/server";
import { CSV_SOURCE_URL, alertHash, CAT_NAMES, toIsraelISO } from "@/lib/oref";
import { upsertAlertsBatch, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Parse a CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Batch size for unnest-based bulk upserts (one DB round trip per chunk)
const BATCH_SIZE = 200;
// Only process the last N rows for quick sync
const QUICK_TAIL = 1000;
// Server-side throttle: reuse the last sync result for this long.
// The instance serves repeat calls (every open tab polls) without
// re-downloading the CSV or touching the DB.
const SYNC_THROTTLE_MS = 5 * 60 * 1000;

type SyncResult = { fetched: number; inserted: number; error?: string };

let lastSyncAt = 0;
let lastResult: SyncResult | null = null;
let inFlight: Promise<SyncResult> | null = null;

async function quickSyncCSV(): Promise<SyncResult> {
  try {
    const csvRes = await fetch(CSV_SOURCE_URL, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!csvRes.ok) {
      return { fetched: 0, inserted: 0, error: `CSV HTTP ${csvRes.status}` };
    }

    const csvText = await csvRes.text();
    const lines = csvText.trim().split("\n");
    const header = parseCSVLine(lines[0]);

    const cols: Record<string, number> = {};
    header.forEach((h, i) => (cols[h.trim()] = i));

    // Only process the tail of the CSV (most recent rows)
    const startIdx = Math.max(1, lines.length - QUICK_TAIL);

    await ensureSchema();
    let inserted = 0;
    let skipped = 0;

    type ParsedRow = {
      alert_dt: string;
      city: string;
      title: string;
      category: number;
      cat_desc: string;
      source: string;
      origin: string;
      hash: string;
    };

    const rows: ParsedRow[] = [];

    for (let i = startIdx; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      const city = parts[cols["cities"]] ?? "";
      const dt = parts[cols["time"]] ?? "";
      const cat = parseInt(parts[cols["threat"]] ?? "0", 10) || 0;
      const title = parts[cols["description"]] ?? CAT_NAMES[cat] ?? "";
      const origin = parts[cols["origin"]] ?? "";

      if (!city || !dt) {
        skipped++;
        continue;
      }

      rows.push({
        alert_dt: toIsraelISO(dt),
        city,
        title,
        category: cat,
        cat_desc: CAT_NAMES[cat] ?? title,
        source: "csv",
        origin,
        hash: alertHash(dt, city, title),
      });
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      inserted += await upsertAlertsBatch(rows.slice(i, i + BATCH_SIZE));
    }

    return { fetched: rows.length, inserted };
  } catch (e) {
    return { fetched: 0, inserted: 0, error: String(e) };
  }
}

export async function GET() {
  // Serve the cached result if the last sync is fresh enough
  if (lastResult && Date.now() - lastSyncAt < SYNC_THROTTLE_MS) {
    return NextResponse.json({ ...lastResult, throttled: true });
  }

  // De-duplicate concurrent calls (multiple open tabs) onto one sync
  if (!inFlight) {
    inFlight = quickSyncCSV()
      .then((result) => {
        lastSyncAt = Date.now();
        lastResult = result;
        inFlight = null;
        return result;
      })
      .catch(() => {
        inFlight = null;
        return { fetched: 0, inserted: 0, error: "sync failed" };
      });
  }

  const syncResult = await inFlight;
  return NextResponse.json(syncResult);
}
