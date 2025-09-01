
import React from "react";
import { cn } from "../../lib/cn";
export default function Select({ className="", children, ...props }){
  return <select {...props} className={cn("h-10 px-3 rounded-xl border w-full text-sm bg-white", className)} style={{borderColor:"var(--border)"}}>{children}</select>;
}
