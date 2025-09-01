
import React from "react";
import { cn } from "../../lib/cn";
export default function Input({ className="", ...props }){
  return <input {...props} className={cn("h-10 px-3 rounded-xl border w-full text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]", className)} style={{borderColor:"var(--border)", background:"#fff"}}/>;
}
