"use client";

import { useState, useEffect, useRef } from "react";

interface FilterState {
  date_from: string;
  date_to: string;
  city: string;
  types: string[];
  origins: string[];
}

interface TypeOption {
  title: string;
  category: number;
  total: number;
}

interface OriginOption {
  origin: string;
  total: number;
}

interface CityOption {
  city: string;
  total: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

const TIME_PRESETS = [
  { label: "היום", from: today, to: today },
  { label: "אתמול", from: () => daysAgo(1), to: () => daysAgo(1) },
  { label: "3 ימים אחרונים", from: () => daysAgo(3), to: today },
  { label: "שבוע אחרון", from: () => daysAgo(7), to: today },
  { label: "הכל", from: () => "", to: () => "" },
];

const OPERATION_PRESETS = [
  { label: "🐻 עם כלביא", from: "2025-06-13", to: "2025-06-25", emoji: "🐻" },
  { label: "🦁 שאגת הארי", from: "2026-02-28", to: "", emoji: "🦁" },
];

export default function FilterPanel({
  onFilterChange,
}: {
  onFilterChange: (q: string) => void;
}) {
  const [filters, setFilters] = useState<FilterState>({
    date_from: "",
    date_to: "",
    city: "",
    types: [],
    origins: [],
  });
  const [typeOptions, setTypeOptions] = useState<TypeOption[]>([]);
  const [originOptions, setOriginOptions] = useState<OriginOption[]>([]);
  const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
  const [cityQuery, setCityQuery] = useState("");
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("הכל");
  const cityInputRef = useRef<HTMLInputElement>(null);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/alerts?mode=types")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) ? setTypeOptions(data) : null)
      .catch(console.error);
    fetch("/api/alerts?mode=origins")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) ? setOriginOptions(data) : null)
      .catch(console.error);
    fetch("/api/alerts?mode=cities")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) ? setCityOptions(data) : null)
      .catch(console.error);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        cityDropdownRef.current &&
        !cityDropdownRef.current.contains(e.target as Node) &&
        cityInputRef.current &&
        !cityInputRef.current.contains(e.target as Node)
      ) {
        setShowCityDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCities = cityQuery.length > 0
    ? cityOptions.filter((c) => c.city.includes(cityQuery)).slice(0, 20)
    : cityOptions.slice(0, 20);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);
    if (filters.city) params.set("city", filters.city);
    if (filters.types.length) params.set("types", filters.types.join(","));
    if (filters.origins.length) params.set("origins", filters.origins.join(","));
    onFilterChange(params.toString());
  }, [filters, onFilterChange]);

  function applyTimePreset(preset: (typeof TIME_PRESETS)[number]) {
    setActivePreset(preset.label);
    setFilters((prev) => ({
      ...prev,
      date_from: preset.from(),
      date_to: preset.to(),
    }));
  }

  function applyOperation(op: (typeof OPERATION_PRESETS)[number]) {
    setActivePreset(op.label);
    setFilters((prev) => ({
      ...prev,
      date_from: op.from,
      date_to: op.to,
    }));
  }

  function toggleType(title: string) {
    setActivePreset("");
    setFilters((prev) => ({
      ...prev,
      types: prev.types.includes(title)
        ? prev.types.filter((t) => t !== title)
        : [...prev.types, title],
    }));
  }

  function toggleOrigin(origin: string) {
    setActivePreset("");
    setFilters((prev) => ({
      ...prev,
      origins: prev.origins.includes(origin)
        ? prev.origins.filter((o) => o !== origin)
        : [...prev.origins, origin],
    }));
  }

  function clearFilters() {
    setActivePreset("הכל");
    setCityQuery("");
    setFilters({ date_from: "", date_to: "", city: "", types: [], origins: [] });
  }

  const hasActiveFilters =
    filters.date_from || filters.date_to || filters.city || filters.types.length > 0 || filters.origins.length > 0;

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>🔍 סינון נתונים</span>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] text-[10px]">
              פילטר פעיל
            </span>
          )}
        </div>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-[var(--card-border)]">
          {/* Time presets */}
          <div className="pt-3">
            <label className="text-xs text-gray-400 mb-2 block">מתאריך</label>
            <div className="flex gap-2 flex-wrap">
              {TIME_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyTimePreset(p)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activePreset === p.label
                      ? "bg-[var(--accent-blue)] border-[var(--accent-blue)] text-white"
                      : "border-[var(--card-border)] hover:bg-white/10"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              {/* Operation presets */}
              {OPERATION_PRESETS.map((op) => (
                <button
                  key={op.label}
                  onClick={() => applyOperation(op)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activePreset === op.label
                      ? "bg-amber-700 border-amber-600 text-white"
                      : "border-amber-800/50 text-amber-400 hover:bg-amber-900/30"
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range + city in one row */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">מתאריך</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => {
                  setActivePreset("");
                  setFilters((prev) => ({ ...prev, date_from: e.target.value }));
                }}
                className="w-full rounded border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">עד תאריך</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => {
                  setActivePreset("");
                  setFilters((prev) => ({ ...prev, date_to: e.target.value }));
                }}
                className="w-full rounded border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm"
              />
            </div>
            <div className="md:col-span-2 relative">
              <label className="text-xs text-gray-400 mb-1 block">יישוב</label>
              <input
                ref={cityInputRef}
                type="text"
                placeholder="חפש שם יישוב..."
                value={cityQuery || filters.city}
                onChange={(e) => {
                  const val = e.target.value;
                  setCityQuery(val);
                  setShowCityDropdown(true);
                  setFilters((prev) => ({ ...prev, city: val }));
                }}
                onFocus={() => setShowCityDropdown(true)}
                className="w-full rounded border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm"
                autoComplete="off"
              />
              {showCityDropdown && filteredCities.length > 0 && (
                <div
                  ref={cityDropdownRef}
                  className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded border border-[var(--card-border)] bg-[var(--card)] shadow-lg"
                >
                  {filteredCities.map((c) => (
                    <button
                      key={c.city}
                      onClick={() => {
                        setCityQuery(c.city);
                        setFilters((prev) => ({ ...prev, city: c.city }));
                        setShowCityDropdown(false);
                      }}
                      className="w-full text-right px-3 py-1.5 text-xs flex justify-between items-center border-b border-[var(--card-border)]/50 hover:bg-white/10 transition-colors last:border-b-0"
                    >
                      <span className="text-gray-500 font-mono text-[10px]">
                        ({Number(c.total).toLocaleString("he-IL")})
                      </span>
                      <span>{c.city}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={clearFilters}
              className="px-4 py-1.5 rounded text-xs border border-[var(--card-border)] hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            >
              ✕ נקה הכל
            </button>
          </div>

          {/* Types & Origins side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Alert types */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">סוגי התרעות</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, types: [] }))}
                    className="px-2 py-0.5 rounded text-[10px] border border-[var(--card-border)] hover:bg-white/10"
                  >
                    ✕ נקה
                  </button>
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, types: typeOptions.map((t) => t.title) }))}
                    className="px-2 py-0.5 rounded text-[10px] border border-[var(--card-border)] hover:bg-white/10"
                  >
                    ✓ הכל
                  </button>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto rounded border border-[var(--card-border)] bg-[var(--background)]/50">
                {typeOptions.map((t) => (
                  <button
                    key={t.title}
                    onClick={() => toggleType(t.title)}
                    className={`w-full text-right px-3 py-1.5 text-xs flex justify-between items-center border-b border-[var(--card-border)]/50 transition-colors last:border-b-0 ${
                      filters.types.includes(t.title)
                        ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <span className="text-gray-500 font-mono text-[10px]">
                      ({t.total.toLocaleString("he-IL")})
                    </span>
                    <span>{t.title}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-gray-500">
                Ctrl+לחיצה לבחירה מרובה · ללא בחירה = כל הסוגים
              </div>
            </div>

            {/* Origins */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">מקור — מדינה / ארגון מתקיף</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, origins: [] }))}
                    className="px-2 py-0.5 rounded text-[10px] border border-[var(--card-border)] hover:bg-white/10"
                  >
                    ✕ נקה
                  </button>
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, origins: originOptions.map((o) => o.origin) }))}
                    className="px-2 py-0.5 rounded text-[10px] border border-[var(--card-border)] hover:bg-white/10"
                  >
                    ✓ הכל
                  </button>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto rounded border border-[var(--card-border)] bg-[var(--background)]/50">
                {originOptions.map((o) => (
                  <button
                    key={o.origin}
                    onClick={() => toggleOrigin(o.origin)}
                    className={`w-full text-right px-3 py-1.5 text-xs flex justify-between items-center border-b border-[var(--card-border)]/50 transition-colors last:border-b-0 ${
                      filters.origins.includes(o.origin)
                        ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <span className="text-gray-500 font-mono text-[10px]">
                      ({o.total.toLocaleString("he-IL")})
                    </span>
                    <span>{o.origin}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-gray-500">
                ללא בחירה = כל המקורות
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
