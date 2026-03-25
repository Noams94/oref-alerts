import { NextRequest, NextResponse } from "next/server";
import { upsertAlert, ensureSchema } from "@/lib/db";
import { alertHash, CAT_NAMES, toIsraelISO } from "@/lib/oref";

export const dynamic = "force-dynamic";

/**
 * Receive OREF history alerts relayed from the browser (which fetches
 * via the /oref-proxy/history rewrite from an Israeli IP).
 */

const CONCURRENCY = 20;

interface OrefHistoryItem {
  data: string; // city name
  date: string; // "25.03.2026"
  time: string; // "23:14:49"
  alertDate: string; // "2026-03-25T23:15:00"
  category: number;
  category_desc: string;
  matrix_id: number;
  rid: number;
}

export async function POST(req: NextRequest) {
  try {
    const items: OrefHistoryItem[] = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ inserted: 0, error: "empty" });
    }

    // Cap at 500 to prevent abuse
    const capped = items.slice(0, 500);

    await ensureSchema();
    let inserted = 0;

    type Row = {
      alert_dt: string;
      city: string;
      title: string;
      category: number;
      cat_desc: string;
      source: string;
      origin: string;
      hash: string;
    };

    const rows: Row[] = [];

    for (const item of capped) {
      const city = item.data?.trim();
      // Use alertDate (ISO format) if available, otherwise construct from date+time
      const rawDt = item.alertDate || `${item.date} ${item.time}`;
      if (!city || !rawDt) continue;

      const cat = item.category ?? 0;
      const title = CAT_NAMES[cat] ?? item.category_desc ?? "";

      // alertDate from OREF is Israel local time without timezone
      const dt = toIsraelISO(rawDt);

      rows.push({
        alert_dt: dt,
        city,
        title,
        category: cat,
        cat_desc: CAT_NAMES[cat] ?? item.category_desc ?? title,
        source: "oref-relay",
        origin: "",
        hash: alertHash(rawDt, city, title),
      });
    }

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map((r) => upsertAlert(r)));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) inserted++;
      }
    }

    return NextResponse.json({ relayed: rows.length, inserted });
  } catch (e) {
    return NextResponse.json({ inserted: 0, error: String(e) }, { status: 500 });
  }
}
