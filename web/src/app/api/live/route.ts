import { NextResponse } from "next/server";
import { LIVE_URL, HISTORY_URL, OREF_HEADERS, alertHash, CAT_NAMES, toIsraelISO } from "@/lib/oref";
import { insertAlert, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

interface OrefHistoryItem {
  alertDate?: string;
  data?: string;
  title?: string;
  category?: number;
  category_desc?: string;
}

// Throttle history sync to once per 5 minutes
let lastHistorySync = 0;
const HISTORY_INTERVAL_MS = 5 * 60 * 1000;
const CONCURRENCY = 20;

async function syncHistory() {
  const now = Date.now();
  if (now - lastHistorySync < HISTORY_INTERVAL_MS) return 0;
  lastHistorySync = now;

  try {
    const res = await fetch(HISTORY_URL, {
      headers: OREF_HEADERS,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return 0;

    const historyData: OrefHistoryItem[] = await res.json();
    if (!Array.isArray(historyData) || historyData.length === 0) return 0;

    await ensureSchema();
    let inserted = 0;

    const tasks = historyData
      .filter((a) => a.alertDate && a.data)
      .map((a) => ({
        alert_dt: toIsraelISO(a.alertDate!),
        city: a.data!,
        title: a.title ?? a.category_desc ?? CAT_NAMES[a.category ?? 0] ?? "התרעה",
        category: a.category ?? 0,
        cat_desc: a.category_desc ?? CAT_NAMES[a.category ?? 0] ?? "",
        source: "live",
        origin: "",
        hash: alertHash(a.alertDate!, a.data!, a.title ?? a.category_desc ?? ""),
      }));

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const chunk = tasks.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map((row) => insertAlert(row)));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) inserted++;
      }
    }

    if (inserted > 0) console.log(`History sync: ingested ${inserted} new alerts`);
    return inserted;
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    // Quick live alerts fetch
    const liveRes = await fetch(LIVE_URL, {
      headers: OREF_HEADERS,
      signal: AbortSignal.timeout(5_000),
    });

    let liveAlerts: unknown[] = [];
    if (liveRes.ok) {
      const text = await liveRes.text();
      const cleaned = text.replace(/^\ufeff/, "").trim();
      if (cleaned && cleaned !== "[]") {
        try {
          liveAlerts = JSON.parse(cleaned);
          if (!Array.isArray(liveAlerts)) liveAlerts = [];
        } catch { liveAlerts = []; }
      }
    }

    // Fire-and-forget history sync (throttled to every 5 min)
    syncHistory().catch(() => {});

    return NextResponse.json(liveAlerts);
  } catch {
    return NextResponse.json([]);
  }
}
