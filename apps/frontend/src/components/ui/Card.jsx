
import React from "react";
import { cn } from "../../lib/cn";
export default function Card({ className="", children }){
  return <div className={cn("rounded-2xl shadow-sm border p-5", className)} style={{background:"var(--color-card)", color:"var(--color-on-card)", borderColor:"var(--border)"}}>{children}</div>;
}
