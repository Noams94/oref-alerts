import { NextRequest, NextResponse } from "next/server";
import { getAlerts } from "@/lib/db";
import * as XLSX from "xlsx";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters = {
    date_from: params.get("date_from") ?? undefined,
    date_to: params.get("date_to") ?? undefined,
    city: params.get("city") ?? undefined,
    types: params.get("types")?.split(",").filter(Boolean),
    origins: params.get("origins")?.split(",").filter(Boolean),
  };

  try {
    const rows = await getAlerts(filters, 100000);

    const data = rows.map((r) => ({
      "תאריך ושעה": r.alert_dt,
      "יישוב": r.city,
      "סוג התרעה": r.title,
      "קטגוריה": r.cat_desc,
      "מקור": r.source,
      "מוצא": r.origin,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Set RTL
    ws["!Dir"] = "rtl";

    // Auto-width columns
    const colWidths = Object.keys(data[0] ?? {}).map((key) => ({
      wch: Math.max(key.length, 15),
    }));
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "התרעות");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="oref-alerts.xlsx"`,
      },
    });
  } catch (e) {
    console.error("Export error:", e);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
