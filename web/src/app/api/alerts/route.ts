import { NextRequest, NextResponse } from "next/server";
import { getAlerts, getStats, getMapData, getDistinctTypes, getDistinctOrigins, getDistinctCities } from "@/lib/db";

function parseFilters(params: URLSearchParams) {
  return {
    date_from: params.get("date_from") ?? undefined,
    date_to: params.get("date_to") ?? undefined,
    city: params.get("city") ?? undefined,
    types: params.get("types")?.split(",").filter(Boolean),
    origins: params.get("origins")?.split(",").filter(Boolean),
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("mode") ?? "recent";
  const filters = parseFilters(params);

  try {
    switch (mode) {
      case "stats":
        return NextResponse.json(await getStats(filters));

      case "recent":
        return NextResponse.json(await getAlerts(filters, 10));

      case "all":
        return NextResponse.json(await getAlerts(filters, 10000));

      case "map":
        return NextResponse.json(await getMapData(filters));

      case "types":
        return NextResponse.json(await getDistinctTypes());

      case "origins":
        return NextResponse.json(await getDistinctOrigins());

      case "cities":
        return NextResponse.json(await getDistinctCities());

      default:
        return NextResponse.json({ error: "unknown mode" }, { status: 400 });
    }
  } catch (e) {
    console.error("API error:", e);
    return NextResponse.json(
      { error: "internal error" },
      { status: 500 }
    );
  }
}
