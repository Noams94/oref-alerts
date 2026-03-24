"use client";

import { useState, useCallback, useEffect } from "react";
import StatsCards from "@/components/StatsCards";
import AlertTable from "@/components/AlertTable";
import AlertMap from "@/components/AlertMap";
import FilterPanel from "@/components/FilterPanel";
import LivePoller from "@/components/LivePoller";

export default function Home() {
  const [filterQuery, setFilterQuery] = useState("");
  const [mapExpanded, setMapExpanded] = useState(false);

  const handleFilterChange = useCallback((q: string) => {
    setFilterQuery(q);
  }, []);

  // Close expanded map with Escape key
  useEffect(() => {
    if (!mapExpanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMapExpanded(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapExpanded]);

  // Prevent body scroll when map is expanded
  useEffect(() => {
    document.body.style.overflow = mapExpanded ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mapExpanded]);

  const exportUrl = `/api/export${filterQuery ? `?${filterQuery}` : ""}`;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--accent-blue)]/20 flex items-center justify-center text-lg">
            🛡️
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">
              פיקוד העורף — ניטור התרעות
            </h1>
            <p className="text-xs text-gray-400">נתונים חיים · מתרענן כל 15 שניות</p>
          </div>
        </div>
      </header>

      {/* Stats */}
      <StatsCards filters={filterQuery} />

      {/* Live status bar */}
      <LivePoller />

      {/* Filters */}
      <FilterPanel onFilterChange={handleFilterChange} />

      {/* Excel export */}
      <a
        href={exportUrl}
        className="block w-full text-center py-3 rounded-lg bg-gradient-to-l from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-900/30"
      >
        ⬇️ ייצוא קובץ Excel (לפי פילטר)
      </a>

      {/* Content grid: Map + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent alerts table */}
        <div className={mapExpanded ? "hidden" : "order-2 lg:order-1"}>
          <AlertTable filters={filterQuery} />
        </div>

        {/* Map — expandable */}
        <div
          className={
            mapExpanded
              ? "fixed inset-0 z-50 bg-[var(--background)]"
              : "order-1 lg:order-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] overflow-hidden"
          }
        >
          <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
            <h2 className="text-sm font-semibold">🗺️ מפת התרעות לפי יישוב</h2>
            <button
              onClick={() => setMapExpanded((prev) => !prev)}
              className="px-3 py-1 rounded text-xs border border-[var(--card-border)] hover:bg-white/10 transition-colors"
              title={mapExpanded ? "מזער מפה (Esc)" : "הגדל מפה"}
            >
              {mapExpanded ? "✕ מזער" : "⛶ הגדל"}
            </button>
          </div>
          <div className={mapExpanded ? "p-2 h-[calc(100vh-52px)]" : "p-2 h-[450px]"}>
            <AlertMap filters={filterQuery} key={mapExpanded ? "expanded" : "normal"} />
          </div>
        </div>
      </div>

      {/* Fullscreen map overlay backdrop */}
      {mapExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setMapExpanded(false)}
        />
      )}

      {/* Footer */}
      <footer className="pt-4 pb-6 border-t border-[var(--card-border)] text-center text-xs text-gray-500 space-y-1">
        <p>
          ד״ר נועם קשת ·{" "}
          <a href="https://noamkeshet.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline">
            noamkeshet.com
          </a>{" "}
          ·{" "}
          <a href="mailto:keshet.noam@gmail.com" className="text-[var(--accent-blue)] hover:underline">
            keshet.noam@gmail.com
          </a>
        </p>
      </footer>
    </div>
  );
}
