
import React from "react";
import Card from "../../components/ui/Card";
export default function AlertasPage(){
  return (<Card><h3 className="font-semibold mb-2">Alertas</h3><ul className="text-sm text-[var(--muted)] list-disc pl-5"><li>Stock bajo</li><li>Productos sin ventas</li><li>Próximo a vencer</li></ul></Card>);
}
