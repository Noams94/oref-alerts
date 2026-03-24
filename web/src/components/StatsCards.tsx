"use client";

import { useEffect, useState } from "react";
import type { Stats } from "@/lib/oref";

function formatDate(dt: string): string {
  if (!dt || dt === "—") return "—";
  try {
    return new Date(dt).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

export default function StatsCards({ filters }: { filters: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`/api/alerts?mode=stats&${filters}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.total === "number") setStats(data);
      })
      .catch(console.error);
  }, [filters]);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 animate-pulse h-20"
          />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "סה״כ התרעות",
      value: stats.total.toLocaleString("he-IL"),
      color: "border-[var(--accent-red)]",
      textColor: "text-[var(--accent-red)]",
    },
    {
      label: "יישובים",
      value: stats.cities.toLocaleString("he-IL"),
      color: "border-[var(--accent-blue)]",
      textColor: "text-[var(--accent-blue)]",
    },
    {
      label: "חדשות היום",
      value: stats.new_today.toLocaleString("he-IL"),
      color: "border-[var(--accent-yellow)]",
      textColor: "text-[var(--accent-yellow)]",
    },
    {
      label: "התרעה אחרונה",
      value: formatDate(stats.newest),
      color: "border-[var(--accent-green)]",
      textColor: "text-[var(--accent-green)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border-r-4 ${card.color} border border-[var(--card-border)] bg-[var(--card)] p-4`}
        >
          <div className="text-xs text-gray-400 mb-1">{card.label}</div>
          <div className={`text-lg font-bold ${card.textColor} font-[family-name:var(--font-geist-mono)]`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
