"use client";

import { useEffect, useRef, useState } from "react";
export default function LivePoller() {
  const [status, setStatus] = useState<"idle" | "polling" | "error">("idle");
  const [lastLivePoll, setLastLivePoll] = useState<string>("—");
  const [lastHistorySync, setLastHistorySync] = useState<string>("—");
  const [historyStatus, setHistoryStatus] = useState<string>("");
  const [liveCount, setLiveCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      setStatus("polling");
      try {
        const res = await fetch("/api/live");

        if (!res.ok) {
          setStatus("error");
          setErrorCount((prev) => prev + 1);
          return;
        }

        const data = await res.json();

        // New format: { live: [...], history: { fetched, inserted, error? } }
        const alerts = Array.isArray(data?.live) ? data.live : (Array.isArray(data) ? data : []);
        const history = data?.history;

        if (alerts.length > 0) {
          setLiveCount(alerts.length);
          await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(alerts),
          });
        } else {
          setLiveCount(0);
        }

        // Update history sync status
        if (history) {
          if (history.error) {
            setHistoryStatus(`שגיאה: ${history.error}`);
          } else {
            const now = new Date().toLocaleTimeString("he-IL");
            setLastHistorySync(now);
            setHistoryStatus(
              history.inserted > 0
                ? `+${history.inserted} חדשות`
                : `${history.fetched} בדיקה, הכל קיים`
            );
          }
        }

        setStatus("idle");
        setLastLivePoll(new Date().toLocaleTimeString("he-IL"));
        setErrorCount(0);
      } catch {
        setStatus("error");
        setErrorCount((prev) => prev + 1);
      }
    }

    poll();
    intervalRef.current = setInterval(poll, 15_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-4">
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
              ? "מעדכן..."
              : status === "error"
                ? "שגיאת חיבור"
                : "איסוף נתונים חיים"}
          </span>
        </div>

        {liveCount > 0 && (
          <span className="text-[var(--accent-red)] font-bold animate-pulse">
            🚨 {liveCount} התרעות פעילות!
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-gray-400">
        <span>
          <span className="text-gray-500">עדכון (live):</span>{" "}
          <span className="text-white font-mono">{lastLivePoll}</span>
        </span>
        <span>
          <span className="text-gray-500">עדכון (היסטוריה):</span>{" "}
          <span className="text-white font-mono">{lastHistorySync}</span>
          {historyStatus && (
            <span className={`mr-1 ${historyStatus.startsWith("שגיאה") ? "text-red-400" : "text-green-400"}`}>
              {" "}({historyStatus})
            </span>
          )}
        </span>
        <span>
          <span className="text-gray-500">שגיאות:</span>{" "}
          <span className={`font-mono ${errorCount > 0 ? "text-red-400" : "text-white"}`}>
            {errorCount}
          </span>
        </span>
      </div>
    </div>
  );
}
