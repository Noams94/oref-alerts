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

const CONCURRENCY = 20;

async function fetchAndIngestHistory(): Promise<{ fetched: number; inserted: number; error?: string }> {
  try {
    const res = await fetch(HISTORY_URL, {
      headers: OREF_HEADERS,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return { fetched: 0, inserted: 0, error: `HTTP ${res.status}` };
    }

    const historyData: OrefHistoryItem[] = await res.json();
    if (!Array.isArray(historyData) || historyData.length === 0) {
      return { fetched: 0, inserted: 0, error: "empty response" };
    }

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

    return { fetched: tasks.length, inserted };
  } catch (e) {
    return { fetched: 0, inserted: 0, error: String(e) };
  }
}

export async function GET() {
  try {
    // Fetch live alerts + history in parallel
    const [liveRes, historyResult] = await Promise.all([
      fetch(LIVE_URL, {
        headers: OREF_HEADERS,
        signal: AbortSignal.timeout(5_000),
      }).catch(() => null),
      fetchAndIngestHistory(),
    ]);

    let liveAlerts: unknown[] = [];
    if (liveRes?.ok) {
      const text = await liveRes.text();
      const cleaned = text.replace(/^\ufeff/, "").trim();
      if (cleaned && cleaned !== "[]") {
        try {
          liveAlerts = JSON.parse(cleaned);
          if (!Array.isArray(liveAlerts)) liveAlerts = [];
        } catch { liveAlerts = []; }
      }
    }

    return NextResponse.json({
      live: liveAlerts,
      history: historyResult,
    });
  } catch {
    return NextResponse.json({ live: [], history: { fetched: 0, inserted: 0, error: "request failed" } });
  }
}
