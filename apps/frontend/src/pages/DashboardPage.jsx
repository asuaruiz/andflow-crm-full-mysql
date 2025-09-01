
import React from "react";
import Card from "../components/ui/Card";
import Select from "../components/ui/Select";
import Stat from "../components/ui/Stat";

export default function DashboardPage(){
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Resumen diario</h3>
          <Select className="w-44"><option>Hoy</option><option>Últimos 7 días</option><option>Mes en curso</option></Select>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat title="Venta" value="$ 0" />
          <Stat title="Notas" value="0" />
          <Stat title="Clientes únicos" value="0" />
        </div>
      </Card>
      <Card>
        <h3 className="font-semibold mb-3">Alertas</h3>
        <ul className="text-sm space-y-2 text-[var(--muted)]"><li>No hay alertas por ahora.</li></ul>
      </Card>
    </div>
  );
}
