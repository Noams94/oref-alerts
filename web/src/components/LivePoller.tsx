"use client";

import { useEffect, useRef, useState } from "react";
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
        // /api/live now syncs last 5000 rows from GitHub CSV (accessible from Vercel)
        const res = await fetch("/api/live");
        if (!res.ok) {
          setStatus("error");
          setErrorCount((prev) => prev + 1);
          return;
        }

        const data = await res.json();

        if (data.error) {
          setSyncInfo(`שגיאה: ${data.error}`);
        } else {
          const now = new Date().toLocaleTimeString("he-IL");
          setLastSync(now);
          setSyncInfo(
            data.inserted > 0
              ? `+${data.inserted} התרעות חדשות`
              : `${data.fetched} נבדקו, הכל עדכני`
          );
        }

        setStatus("idle");
        setErrorCount(0);
      } catch {
        setStatus("error");
        setErrorCount((prev) => prev + 1);
      }
    }

    poll();
    // Sync every 5 minutes (CSV updates roughly every hour)
    intervalRef.current = setInterval(poll, 5 * 60 * 1000);

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
