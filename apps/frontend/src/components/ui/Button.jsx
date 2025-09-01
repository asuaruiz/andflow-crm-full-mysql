
import React from "react";
import { cn } from "../../lib/cn";
export default function Button({ variant="primary", className="", children, ...props }){
  const styles={ primary:{background:"var(--color-primary)", color:"var(--color-on-primary)"}, secondary:{background:"var(--color-secondary)", color:"var(--color-on-secondary)"}, ghost:{background:"transparent", color:"inherit", border:"1px solid var(--border)"} };
  const style=styles[variant]||styles.primary;
  return <button {...props} className={cn("px-4 h-10 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all active:scale-[0.98]", className)} style={style}>{children}</button>;
}
