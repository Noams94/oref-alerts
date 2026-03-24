import { NextRequest, NextResponse } from "next/server";
import { insertAlert } from "@/lib/db";
import { alertHash, CAT_NAMES, toIsraelISO } from "@/lib/oref";

interface OrefAlert {
  rid?: number;
  alertDate?: string;
  data?: string;
  title?: string;
  category?: number;
  category_desc?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const alerts: OrefAlert[] = Array.isArray(body) ? body : [body];

    let inserted = 0;
    for (const a of alerts) {
      const dt = a.alertDate ?? "";
      const city = a.data ?? "";
      const title = a.title ?? a.category_desc ?? "";
      const category = a.category ?? 0;
      const catDesc = a.category_desc ?? CAT_NAMES[category] ?? "";

      if (!dt || !city) continue;

      const hash = alertHash(dt, city, title);
      const ok = await insertAlert({
        alert_dt: toIsraelISO(dt),
        city,
        title,
        category,
        cat_desc: catDesc,
        source: "live",
        hash,
      });
      if (ok) inserted++;
    }

    return NextResponse.json({ inserted, total: alerts.length });
  } catch (e) {
    console.error("Ingest error:", e);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
