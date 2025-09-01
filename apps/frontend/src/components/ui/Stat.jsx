
import React from "react";
export default function Stat({ title, value }){
  return (<div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
    <div className="text-xs text-[var(--muted)]">{title}</div>
    <div className="text-2xl font-semibold mt-1">{value}</div>
  </div>);
}
