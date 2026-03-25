/**
 * Cloudflare Worker — OREF history proxy.
 *
 * The browser (in Israel) calls this worker directly.
 * Because the browser is in Israel, Cloudflare routes to the Israeli PoP,
 * so the outbound fetch to OREF comes from an Israeli IP.
 */

const OREF_HISTORY =
  "https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1";

const ALLOWED_ORIGINS = [
  "https://oref-alerts-six.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const res = await fetch(OREF_HISTORY, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Referer: "https://www.oref.org.il/",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json",
        },
      });

      const body = await res.text();

      return new Response(body, {
        status: res.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-cache, no-store",
          ...corsHeaders(origin),
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      });
    }
  },
};
