import { connection } from "next/server";
import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { registerOrderPayment, updateOrderStage } from "./actions";
import { DeleteOrderForm } from "./delete-order-form";
import { NewOrderForm } from "./new-order-form";
import { getOrdersData } from "@/lib/orders";
import { formatUnitLabel } from "@/lib/order-format";

function money(value: Decimal.Value, currency = "ARS") { return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)); }
function todayLocal() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function dateLabel(value: string) { return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${value}T12:00:00-03:00`)); }
const stageLabels: Record<string, string> = { created: "Creado", sent: "Enviado", confirmed: "Confirmado", delivered: "Entregado", cancelled: "Cancelado" };
const stageNext: Record<string, string | null> = { created: "sent", sent: "confirmed", confirmed: "delivered", delivered: null, cancelled: null };
const defaultPaymentMethods = ["Efectivo", "Transferencia", "Mercado Pago", "Débito", "Crédito"];

async function OrdersContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const [data, params] = await Promise.all([getOrdersData(), searchParams]);
  const ready = data.configured && !("error" in data);
  const currency = ready ? data.currency : "ARS";
  const query = typeof params.q === "string" ? params.q.trim().toLocaleLowerCase("es-AR") : "";
  const stageFilter = typeof params.etapa === "string" ? params.etapa : "";
  const paymentFilter = typeof params.cobro === "string" ? params.cobro : "";
  const availablePaymentMethods = ready && data.paymentMethods.length ? data.paymentMethods.map((method) => method.name) : defaultPaymentMethods;
  const orders = ready ? data.orders.filter((order) => {
    const lines = data.items.filter((item) => item.orderId === order.id);
    const received = data.payments.filter((payment) => payment.orderId === order.id).reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
    const outstanding = Decimal.max(0, new Decimal(order.total).minus(received));
    const orderLabel = `PED-${String(order.orderNumber).padStart(6, "0")}`;
    const searchText = [order.clientName, String(order.orderNumber), orderLabel, order.notes ?? "", ...lines.map((item) => item.productName)].join(" ").toLocaleLowerCase("es-AR");
    const matchesPayment = paymentFilter === "cancelado" ? order.stage === "cancelled" : paymentFilter === "cobrado" || paymentFilter === "pagado" ? order.stage !== "cancelled" && outstanding.isZero() : paymentFilter === "parcial" ? order.stage !== "cancelled" && received.isPositive() && outstanding.isPositive() : paymentFilter === "pendiente" ? order.stage !== "cancelled" && received.isZero() : true;
    return (!query || searchText.includes(query)) && (!stageFilter || order.stage === stageFilter) && matchesPayment;
  }) : [];
  const hasFilters = Boolean(query || stageFilter || paymentFilter);
  const message = params.error === "con-cobros" ? "Este pedido ya tiene cobros. No se borró para conservar esos movimientos; podés cancelarlo." : params.borrado ? "Pedido borrado." : params.error ? "No se pudo completar la operación. Revisá los datos y volvé a intentar." : params.creado ? "Pedido guardado. Todavía no es un ingreso ni aumentó la caja." : params.pago ? "Cobro guardado; la caja solo aumentó por el importe recibido." : params.estado ? "Estado del pedido actualizado." : "";
  const today = todayLocal();
  return <div className="module-page orders-page">
    <header className="module-head"><a className="back-link" href="/#inicio">← Volver al resumen</a><div className="eyebrow">Ventas y cobranzas</div><h1>Pedidos.</h1><p>Vendido no significa cobrado. Un pedido solo suma a caja cuando registrás un pago real.</p></header>
    {!ready && <div className="connection-alert"><span>◌</span><div><strong>{"error" in data ? "No se pudo leer Neon" : "Conectá Neon para empezar"}</strong> El catálogo y los pedidos se guardan en PostgreSQL.</div></div>}
    {message && <div className={`notice ${params.error ? "error" : "success"}`} role="status">{message}</div>}
    <section className="panel new-order-panel" id="nuevo-pedido">
      <div className="panel-heading"><div><span className="eyebrow">Pedido nuevo</span><h2>Crear pedido</h2></div><span className="panel-index">01</span></div>
      <p className="section-help">Elegí cliente y productos. Guardar un pedido muestra lo vendido y lo que falta cobrar; la caja aumenta cuando registrás un cobro.</p>
      {ready ? <NewOrderForm products={data.products} clients={data.clients} requestKey={randomUUID()} today={today} /> : <p className="empty-state">Configurá la conexión con Neon para guardar pedidos.</p>}
    </section>
    <section className="panel order-list-panel" id="cuentas-por-cobrar">
      <div className="panel-heading"><div><span className="eyebrow">Historial y cuentas por cobrar</span><h2>Pedidos guardados</h2></div><span className="panel-count">{ready ? orders.length : 0}</span></div>
      <p className="section-help">La etapa cuenta cómo va el trabajo: creado → enviado → confirmado → entregado. «Registrar cobro» se usa cada vez que el cliente te paga, aunque sea una parte.</p>
      <form className="order-filters" method="get" action="/pedidos">
        <label className="order-search">Buscar<input type="search" name="q" defaultValue={typeof params.q === "string" ? params.q : ""} placeholder="Cliente, producto o número" /></label>
        <label>Etapa<select name="etapa" defaultValue={stageFilter}><option value="">Todas</option>{Object.entries(stageLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label>Cobro<select name="cobro" defaultValue={paymentFilter}><option value="">Todos</option><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="cobrado">Cobrado</option><option value="cancelado">Cancelado</option></select></label>
        <button className="secondary-button" type="submit">Filtrar</button>
        {hasFilters && <a className="clear-order-filters" href="/pedidos#cuentas-por-cobrar">Limpiar</a>}
      </form>
      {ready && hasFilters && <p className="filter-count">Mostrando {orders.length} de {data.orders.length} pedidos</p>}
      {!ready || !data.orders.length ? <p className="empty-state">Todavía no hay pedidos. Cuando guardes uno, aparece acá.</p> : !orders.length ? <p className="empty-state">No encontré pedidos con esos filtros. Probá otra búsqueda o limpiá los filtros.</p> : <div className="order-list">{orders.map((order) => {
        const lines = data.items.filter((item) => item.orderId === order.id);
        const received = data.payments.filter((payment) => payment.orderId === order.id).reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
        const outstanding = Decimal.max(0, new Decimal(order.total).minus(received));
        const payStatus = order.stage === "cancelled" ? "Cancelado" : outstanding.isZero() ? "Cobrado" : received.isZero() ? "Pendiente" : "Parcial";
        const next = stageNext[order.stage];
        return <article className="order-card" key={order.id}>
          <div className="order-card-top"><div><span className="order-number">PED-{String(order.orderNumber).padStart(6, "0")}</span><span className="order-date">{dateLabel(order.createdOn)}</span></div><span className={`stage-badge stage-${order.stage}`}>{stageLabels[order.stage]}</span></div>
          <div className="order-client"><strong>{order.clientName}</strong><span>{payStatus}</span></div>
          <div className="order-card-lines">{lines.map((item) => <div key={item.id}><span><strong>{item.productName}</strong><small><b>Cantidad:</b> {new Decimal(item.quantity).toString()} <i>·</i> <b>Unidad de venta:</b> {formatUnitLabel(item.unit, item.quantity)}</small></span><span>{money(item.subtotal, currency)}</span></div>)}</div>
          <div className="order-card-totals"><div><span>Total vendido</span><strong>{money(order.total, currency)}</strong></div><div><span>Cobrado</span><strong>{money(received, currency)}</strong></div><div><span>Saldo pendiente</span><strong className={outstanding.isPositive() ? "pending-amount" : "amount-in"}>{money(outstanding, currency)}</strong></div></div>
          <div className="order-card-actions">
            <a className="order-document-link" href={`/pedidos/${order.id}/documento`}>Documento y compartir</a>
            {next && <form action={updateOrderStage}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="stage" value={next} /><button className="secondary-button" type="submit">Marcar {stageLabels[next].toLowerCase()}</button></form>}
            {order.stage !== "cancelled" && outstanding.isPositive() && <details className="payment-details"><summary>Registrar cobro</summary><form action={registerOrderPayment} className="payment-form"><input type="hidden" name="paymentId" value={randomUUID()} /><input type="hidden" name="orderId" value={order.id} /><label>Importe recibido<input name="amount" inputMode="decimal" defaultValue={outstanding.toFixed(2)} required /></label><label>Fecha<input name="receivedOn" type="date" defaultValue={today} required /></label><label>Medio de pago<select name="paymentMethod" defaultValue={availablePaymentMethods[0]} required>{availablePaymentMethods.map((method) => <option value={method} key={method}>{method}</option>)}</select></label><label>Nota<input name="note" placeholder="Opcional" maxLength={500} /></label><button className="primary-button" type="submit">Guardar cobro <span>→</span></button></form></details>}
            {received.isZero() && <DeleteOrderForm orderId={order.id} />}
          </div>
        </article>;
      })}</div>}
    </section>
  </div>;
}

export default function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<main className="module-page">Cargando pedidos…</main>}><OrdersContent searchParams={searchParams} /></Suspense>;
}
