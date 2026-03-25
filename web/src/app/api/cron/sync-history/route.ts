import { NextRequest, NextResponse } from "next/server";
import { insertAlert, insertCoords, ensureSchema } from "@/lib/db";
import { alertHash, CAT_NAMES, CSV_SOURCE_URL, COORD_CSV_URL, toIsraelISO } from "@/lib/oref";

export const maxDuration = 300; // 5 minutes for large CSV import

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

// Run N inserts concurrently for speed
const CONCURRENCY = 50;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await ensureSchema();

    // 1. Sync coordinates CSV
    const coordRes = await fetch(COORD_CSV_URL);
    if (coordRes.ok) {
      const coordText = await coordRes.text();
      const coordLines = coordText.trim().split("\n");
      const coordHeader = coordLines[0].split(",");
      const cityIdx = coordHeader.indexOf("loc");
      const latIdx = coordHeader.indexOf("lat");
      const lonIdx = coordHeader.indexOf("long");

      if (cityIdx >= 0 && latIdx >= 0 && lonIdx >= 0) {
        const coords = coordLines
          .slice(1)
          .map((line) => {
            const cols = line.split(",");
            return {
              city: cols[cityIdx]?.trim() ?? "",
              lat: parseFloat(cols[latIdx]),
              lon: parseFloat(cols[lonIdx]),
            };
          })
          .filter((c) => c.city && !isNaN(c.lat) && !isNaN(c.lon));

        await insertCoords(coords);
        console.log(`Synced ${coords.length} coordinates`);
      }
    }

    // 2. Sync alerts CSV
    const csvRes = await fetch(CSV_SOURCE_URL);
    if (!csvRes.ok) {
      return NextResponse.json(
        { error: "failed to fetch CSV" },
        { status: 502 }
      );
    }

    const csvText = await csvRes.text();
    const lines = csvText.trim().split("\n");
    const header = parseCSVLine(lines[0]);

    const cols: Record<string, number> = {};
    header.forEach((h, i) => (cols[h.trim()] = i));

    console.log("CSV columns:", JSON.stringify(cols));

    // Parse all rows first
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
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
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

    console.log(`Parsed ${rows.length} valid rows, ${skipped} skipped`);

    // Insert concurrently in chunks
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((row) => insertAlert(row))
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) inserted++;
        else errors++;
      }

      if (i % 10000 < CONCURRENCY) {
        console.log(`Progress: ${i}/${rows.length} (inserted: ${inserted})`);
      }
    }

    console.log(`Sync done: inserted=${inserted} errors=${errors}`);

    return NextResponse.json({
      inserted,
      skipped,
      errors,
      total_lines: lines.length - 1,
      valid_rows: rows.length,
    });
  } catch (e) {
    console.error("Sync error:", e);
    return NextResponse.json({ error: "sync failed", detail: String(e) }, { status: 500 });
  }
}
