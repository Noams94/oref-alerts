"use client";

import { useEffect, useState, useMemo } from "react";
import L from "leaflet";
import type { MapPoint } from "@/lib/oref";
import { colorForTitle, CAT_NAMES, CAT_COLORS, DEFAULT_COLOR } from "@/lib/oref";

import "leaflet/dist/leaflet.css";

const LEGEND_ITEMS = Object.entries(CAT_NAMES)
  .filter(([cat]) => CAT_COLORS[Number(cat)])
  .map(([cat, name]) => ({
    name,
    color: CAT_COLORS[Number(cat)] ?? DEFAULT_COLOR,
  }))
  // Deduplicate by name
  .filter((item, idx, arr) => arr.findIndex((x) => x.name === item.name) === idx);

export default function AlertMapInner({ filters }: { filters: string }) {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    fetch(`/api/alerts?mode=map&${filters}`)
      .then((r) => r.json())
      .then((data) => setPoints(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [filters]);

  // Compute which titles actually appear in data
  const activeTitles = useMemo(() => {
    const titles = new Set<string>();
    for (const p of points) titles.add(p.top_title);
    return titles;
  }, [points]);

  useEffect(() => {
    if (mapReady) return;

    const container = document.getElementById("alert-map");
    if (!container) return;

    const map = L.map(container).setView([31.5, 34.8], 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    (window as unknown as Record<string, unknown>).__orefMap = map;
    setMapReady(true);

    return () => {
      map.remove();
      delete (window as unknown as Record<string, unknown>).__orefMap;
      setMapReady(false);
    };
  }, []);

  // Update markers when points change
  useEffect(() => {
    const map = (window as unknown as Record<string, unknown>).__orefMap as L.Map | undefined;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    for (const p of points) {
      const color = colorForTitle(p.top_title);
      const radius = Math.min(Math.max(Math.log2(p.total + 1) * 3, 4), 20);

      L.circleMarker([p.lat, p.lon], {
        radius,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.6,
      })
        .addTo(map)
        .bindPopup(
          `<div dir="rtl" style="text-align:right">
            <strong>${p.city}</strong><br/>
            ${p.total.toLocaleString("he-IL")} התרעות<br/>
            <span style="color:${color}">${p.top_title}</span>
          </div>`
        );
    }
  }, [points, mapReady]);

  // Filter legend to only show titles present in data
  const visibleLegend = LEGEND_ITEMS.filter(
    (item) => activeTitles.has(item.name)
  );

  return (
    <div className="relative w-full h-full">
      <div
        id="alert-map"
        className="w-full h-full min-h-[400px] rounded-lg"
        style={{ background: "#1a1a2e" }}
      />
      {/* Legend */}
      {visibleLegend.length > 0 && (
        <div className="absolute bottom-3 right-3 z-[1000] bg-[var(--card)]/90 backdrop-blur-sm border border-[var(--card-border)] rounded-lg px-3 py-2 space-y-1">
          {visibleLegend.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-[11px]">
              <span>{item.name}</span>
              <span
                className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
