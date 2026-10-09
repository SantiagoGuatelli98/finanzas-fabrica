import Link from "next/link";
import { upcomingOrders, type ScheduledOrder } from "@/lib/order-schedule";

export function UpcomingOrders({ orders, today, currency }: { orders: ScheduledOrder[]; today: string; currency: string }) {
  const { scheduled, nextWeek } = upcomingOrders(orders, today);
  return (
    <section className="upcoming-orders" aria-labelledby="upcoming-orders-title">
      <div className="upcoming-heading">
        <div><h2 id="upcoming-orders-title">Próximos pedidos</h2><p>Entregas de esta semana y la próxima</p></div>
        <Link className="upcoming-add" href="/pedidos#nuevo-pedido">＋ Agendar pedido</Link>
      </div>
      {scheduled.length ? (
        <ul className="upcoming-list">
          {scheduled.slice(0, 4).map((order) => {
            const date = new Date(`${order.deliveryOn}T12:00:00Z`);
            const label = `PED-${String(order.orderNumber).padStart(6, "0")}`;
            return <li key={order.id}>
              <Link className="upcoming-order" href={`/pedidos?q=${label}#pedido-${order.id}`}>
                <time className={`upcoming-date${order.deliveryOn === today ? " is-today" : ""}`} dateTime={order.deliveryOn}>
                  <strong>{date.getUTCDate()}</strong><span>{new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" }).format(date)}</span>
                </time>
                <div className="upcoming-client"><strong>{order.clientName}</strong><span>{order.deliveryOn === today ? "Hoy" : new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: "UTC" }).format(date)} · {order.deliveryOn < nextWeek ? "Esta semana" : "Próxima semana"}</span></div>
                <div className="upcoming-amount"><strong>{new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(order.total))}</strong><span>{label}</span></div>
                <span className="upcoming-arrow" aria-hidden="true">→</span>
              </Link>
            </li>;
          })}
        </ul>
      ) : <p className="upcoming-empty">Sin entregas agendadas para estas semanas. Elegí una fecha de entrega al guardar el pedido.</p>}
      <div className="upcoming-footer"><span>{scheduled.length > 4 ? `Mostrando 4 de ${scheduled.length} entregas` : "El total del pedido no implica que esté cobrado."}</span><Link href="/pedidos#cuentas-por-cobrar">Ver pedidos →</Link></div>
    </section>
  );
}
