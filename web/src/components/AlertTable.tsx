"use client";

import { useEffect, useState } from "react";
import type { Alert } from "@/lib/oref";
import { colorForTitle } from "@/lib/oref";

function formatDate(dt: string): string {
  try {
    return new Date(dt).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

export default function AlertTable({ filters }: { filters: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/alerts?mode=recent&${filters}`)
      .then((r) => r.json())
      .then((data) => {
        setAlerts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
      });
  }, [filters]);

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--card-border)]">
        <h2 className="text-sm font-semibold">התרעות אחרונות</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-gray-400">
              <th className="px-4 py-2 text-right">זמן</th>
              <th className="px-4 py-2 text-right">יישוב</th>
              <th className="px-4 py-2 text-right">סוג</th>
              <th className="px-4 py-2 text-right">מקור</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-[var(--card-border)]">
                  <td colSpan={4} className="px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : alerts.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  אין התרעות
                </td>
              </tr>
            ) : (
              alerts.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[var(--card-border)] hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-2 font-[family-name:var(--font-geist-mono)] text-xs whitespace-nowrap">
                    {formatDate(a.alert_dt)}
                  </td>
                  <td className="px-4 py-2 font-medium">{a.city}</td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full ml-2"
                      style={{ backgroundColor: colorForTitle(a.title) }}
                    />
                    {a.title}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {a.origin}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
