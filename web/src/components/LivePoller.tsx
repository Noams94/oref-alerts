"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fetch OREF history via the /oref-proxy/history rewrite (browser → Vercel
 * Israeli edge → OREF). Then relay the data to /api/relay for DB storage.
 * This bypasses OREF's geo-restriction because the browser is in Israel.
 */
async function relayOrefHistory(): Promise<{ relayed: number; inserted: number } | null> {
  try {
    const res = await fetch("/oref-proxy/history", {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) return null;

    const text = await res.text();
    if (!text || text.length < 3) return null;

    const items = JSON.parse(text);
    if (!Array.isArray(items) || items.length === 0) return null;

    // Send to our relay API
    const relayRes = await fetch("/api/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });
    if (!relayRes.ok) return null;
    return relayRes.json();
  } catch {
    return null;
  }
}

export default function LivePoller() {
  const [status, setStatus] = useState<"idle" | "polling" | "error">("idle");
  const [lastSync, setLastSync] = useState<string>("—");
  const [syncInfo, setSyncInfo] = useState<string>("");
  const [errorCount, setErrorCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      setStatus("polling");
      try {
        // 1. Try real-time relay from OREF via browser (Israeli IP)
        const relay = await relayOrefHistory();

        // 2. Also sync from CSV as a fallback
        const res = await fetch("/api/live");
        const csvData = res.ok ? await res.json() : null;

        const totalInserted = (relay?.inserted ?? 0) + (csvData?.inserted ?? 0);
        const now = new Date().toLocaleTimeString("he-IL");
        setLastSync(now);

        if (relay && relay.inserted > 0) {
          setSyncInfo(`+${totalInserted} התרעות חדשות (OREF ישיר)`);
        } else if (csvData?.inserted > 0) {
          setSyncInfo(`+${csvData.inserted} התרעות חדשות`);
        } else {
          const checked = (relay?.relayed ?? 0) + (csvData?.fetched ?? 0);
          setSyncInfo(`${checked} נבדקו, הכל עדכני`);
        }

        setStatus("idle");
        setErrorCount(0);
      } catch {
        setStatus("error");
        setErrorCount((prev) => prev + 1);
      }
    }

    poll();
    // Poll every 2 minutes — OREF relay is near real-time
    intervalRef.current = setInterval(poll, 2 * 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              status === "polling"
                ? "bg-yellow-400 animate-pulse"
                : status === "error"
                  ? "bg-red-400"
                  : "bg-green-400"
            }`}
          />
          <span className="font-medium">
            {status === "polling"
              ? "מסנכרן..."
              : status === "error"
                ? "שגיאת חיבור"
                : "מעודכן"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-gray-400">
        <span>
          <span className="text-gray-500">סנכרון אחרון:</span>{" "}
          <span className="text-white font-mono">{lastSync}</span>
        </span>
        {syncInfo && (
          <span className={syncInfo.startsWith("שגיאה") ? "text-red-400" : "text-green-400"}>
            {syncInfo}
          </span>
        )}
        {errorCount > 0 && (
          <span>
            <span className="text-gray-500">שגיאות:</span>{" "}
            <span className="font-mono text-red-400">{errorCount}</span>
          </span>
        )}
      </div>
    </div>
  );
}
