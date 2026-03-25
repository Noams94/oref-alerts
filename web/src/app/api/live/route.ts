import { NextResponse } from "next/server";
import { CSV_SOURCE_URL, alertHash, CAT_NAMES, toIsraelISO } from "@/lib/oref";
import { upsertAlert, ensureSchema } from "@/lib/db";

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

const CONCURRENCY = 20;
// Only process the last N rows for quick sync
const QUICK_TAIL = 5000;

async function quickSyncCSV(): Promise<{ fetched: number; inserted: number; error?: string }> {
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

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map((row) => upsertAlert(row)));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) inserted++;
      }
    }

    return { fetched: rows.length, inserted };
  } catch (e) {
    return { fetched: 0, inserted: 0, error: String(e) };
  }
}

export async function GET() {
  try {
    const syncResult = await quickSyncCSV();
    return NextResponse.json(syncResult);
  } catch {
    return NextResponse.json({ fetched: 0, inserted: 0, error: "sync failed" });
  }
}
