import { type NextRequest, NextResponse } from "next/server";

/**
 * Cobro de renovaciones vencidas. Invocado una vez por día desde el cron de
 * Vercel (`vercel.json`).
 *
 * **Hoy no cobra nada, a propósito.** La migración a ePayco dejó este paso sin
 * implementación posible todavía, y fingir lo contrario sería peor que el vacío.
 *
 * Por qué: ePayco no expone forma de cobrar de nuevo sin un TOKEN DE TARJETA, y
 * ese token se crea mandando el número, el vencimiento y el CVC
 * (`POST /token/card`). Implementarlo así le agregaría a Ventex una superficie
 * PCI que hoy no existe, y esa es una decisión de negocio que no toma este
 * archivo.
 *
 * Consecuencia coherente en el resto del sistema: como ninguna orden de ePayco
 * guarda un token reusable, `sync_billing_schedule` deja `billing_recurring` en
 * false para todas. O sea que esta ruta no tiene a quién cobrarle aunque
 * quisiera: el no-op no está escondiendo cobros pendientes.
 *
 * La autorización se mantiene INTACTA mientras tanto. `Authorization: Bearer
 * <CRON_SECRET>`, siempre. Vercel inyecta ese header sólo cuando `CRON_SECRET`
 * existe como variable de entorno. Una versión anterior aceptaba cualquier
 * request que trajera el header `x-vercel-cron`, que es falsificable: bastaba
 * mandarlo para disparar cobros reales. No lo reintroduzcas, ni siquiera ahora
 * que la ruta no cobra — el día que vuelva a cobrar, el agujero ya estaría puesto.
 */

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Se responde 200 para que el cron no acumule fallos diarios, pero queda
  // registrado en los logs: un no-op silencioso es como se olvida un pendiente.
  console.warn(
    "[billing] cron de renovaciones: no-op. ePayco no expone cobro recurrente sin tokenizar tarjetas.",
  );

  return NextResponse.json({
    charged: 0,
    failed: 0,
    skipped: true,
    reason: "La renovación automática está pendiente de definición con ePayco.",
  });
}
