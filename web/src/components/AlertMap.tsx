"use client";

import dynamic from "next/dynamic";

const AlertMapInner = dynamic(() => import("./AlertMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full min-h-[400px] rounded-lg bg-[var(--card)] animate-pulse flex items-center justify-center text-gray-500">
      טוען מפה...
    </div>
  ),
});

export default function AlertMap({ filters }: { filters: string }) {
  return <AlertMapInner filters={filters} />;
}
