import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { deliverPaidOrders, registerOrderPayment, scheduleOrderDelivery, updateOrderStage } from "./actions";
import { SubmitButton } from "./submit-button";
import { OrderComposer } from "./order-composer";
import { BulkOrderPaymentForm } from "./bulk-order-payment-form";
import { DeleteOrderForm } from "./delete-order-form";
import { NewOrderForm } from "./new-order-form";
import { getOrdersData } from "@/lib/orders";
import { canChangeOrderStage } from "@/lib/order-workflow";
import { formatUnitLabel } from "@/lib/order-format";
import { WorkspaceFrame } from "@/components/workspace-navigation";

function money(value: Decimal.Value, currency = "ARS") { return new Intl.NumberFormat("es-AR", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value)); }
function todayLocal() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function dateLabel(value: string) { return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${value}T12:00:00-03:00`)); }
const stageLabels: Record<string, string> = { created: "Creado", sent: "Enviado", confirmed: "Confirmado", delivered: "Entregado", cancelled: "Cancelado" };
const defaultPaymentMethods = ["Efectivo", "Transferencia", "Mercado Pago", "Débito", "Crédito"];

async function OrdersContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const [data, params] = await Promise.all([getOrdersData(), searchParams]);
  const ready = data.configured && !("error" in data);
  const currency = ready ? data.currency : "ARS";
  const query = typeof params.q === "string" ? params.q.trim().toLocaleLowerCase("es-AR") : "";
  const stageFilter = typeof params.etapa === "string" ? params.etapa : "";
  const paymentFilter = typeof params.cobro === "string" ? params.cobro : "";
  const availablePaymentMethods = Array.from(new Set([
    ...defaultPaymentMethods,
    ...(ready ? data.paymentMethods.map((method) => method.name) : []),
  ]));
  const orders = ready ? data.orders.filter((order) => {
    const lines = data.items.filter((item) => item.orderId === order.id);
    const received = data.payments.filter((payment) => payment.orderId === order.id).reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
    const outstanding = Decimal.max(0, new Decimal(order.total).minus(received));
    const orderLabel = `PED-${String(order.orderNumber).padStart(6, "0")}`;
    const searchText = [order.clientName, String(order.orderNumber), orderLabel, order.notes ?? "", ...lines.map((item) => item.productName)].join(" ").toLocaleLowerCase("es-AR");
    const matchesPayment = paymentFilter === "con-saldo" ? order.stage !== "cancelled" && outstanding.gt(0) : paymentFilter === "cancelado" ? order.stage === "cancelled" : paymentFilter === "cobrado" || paymentFilter === "pagado" ? order.stage !== "cancelled" && outstanding.isZero() : paymentFilter === "parcial" ? order.stage !== "cancelled" && received.gt(0) && outstanding.gt(0) : paymentFilter === "pendiente" ? order.stage !== "cancelled" && received.isZero() : true;
    return (!query || searchText.includes(query)) && (!stageFilter || (stageFilter === "sin-entregar" ? !["delivered", "cancelled"].includes(order.stage) : order.stage === stageFilter)) && matchesPayment;
  }) : [];
  const hasFilters = Boolean(query || stageFilter || paymentFilter);
  const quickReceipts = ready ? data.quickReceipts.filter((receipt) => !query || [receipt.description, receipt.category, receipt.paymentMethod, receipt.occurredOn].some((value) => value?.toLocaleLowerCase("es-AR").includes(query))) : [];
  const bulkPaidCount = typeof params.cantidad === "string" ? Number.parseInt(params.cantidad, 10) : 0;
  const message = params.error === "con-cobros" ? "Este pedido ya tiene cobros. No se borró para conservar esos movimientos; podés cancelarlo." : params.borrado ? "Pedido borrado." : params.error === "pago-multiple" ? "No se pudo guardar el cobro conjunto. Actualizá la lista y revisá que los pedidos sigan pendientes." : params.error ? "No se pudo completar la operación. Revisá los datos y volvé a intentar." : params.creado === "cobrado" ? "Pedido cobrado y marcado como entregado. El total ya está registrado en caja." : params.creado ? "Pedido guardado pendiente. Todavía no aumentó la caja." : params.pago === "multiple" ? `Cobro registrado para ${bulkPaidCount} pedidos. Quedaron entregados y cada cobro está asociado a su pedido.` : params.pago ? "Cobro guardado. Si completaste el total, el pedido ya quedó entregado." : params.estado ? "Estado del pedido actualizado." : "";
  const paidOpenOrders = ready ? data.orders.filter((order) => {
    if (["delivered", "cancelled"].includes(order.stage)) return false;
    const paid = data.payments.filter((payment) => payment.orderId === order.id).reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
    return paid.gt(0) && paid.gte(order.total);
  }).slice(0, 100) : [];
  const today = todayLocal();
  const activeOrders = ready ? data.orders.filter((order) => order.stage !== "cancelled") : [];
  const pendingDelivery = activeOrders.filter((order) => order.stage !== "delivered").length;
  const totalReceivable = activeOrders.reduce((sum, order) => {
    const paid = ready ? data.payments.filter((payment) => payment.orderId === order.id).reduce((amount, payment) => amount.plus(payment.amount), new Decimal(0)) : new Decimal(0);
    return sum.plus(Decimal.max(0, new Decimal(order.total).minus(paid)));
  }, new Decimal(0));
  return <div className="module-page orders-page">
    <header className="module-head"><Link className="back-link" href="/#inicio">← Volver al resumen</Link><div className="eyebrow">Ventas y cobranzas</div><h1>Pedidos.</h1><p>Pedidos, entregas y cobros. Todo a mano para seguir con tu día.</p></header>
    {!ready && <div className="connection-alert"><span>◌</span><div><strong>{"error" in data ? "No se pudo leer Neon" : "Conectá Neon para empezar"}</strong> El catálogo y los pedidos se guardan en PostgreSQL.</div></div>}
    {message && <div className={`notice ${params.error ? "error" : "success"}`} role="status">{message}</div>}
    {params.entrega === "guardada" && !params.error && <div className="notice success" role="status">Fecha de entrega guardada. Inicio muestra las entregas de esta semana y la próxima.</div>}
    {ready && <nav className="orders-overview" aria-label="Resumen de pedidos">
      <a href="/pedidos#cuentas-por-cobrar"><span>Pedidos activos</span><strong>{activeOrders.length}</strong><small>Ver todos →</small></a>
      <a href="/pedidos?cobro=con-saldo#cuentas-por-cobrar"><span>Por cobrar</span><strong>{money(totalReceivable, currency)}</strong><small>Saldo total · incluye pagos parciales</small></a>
      <a href="/pedidos?etapa=sin-entregar#cuentas-por-cobrar"><span>Sin entregar</span><strong>{pendingDelivery}</strong><small>Creado, enviado o confirmado</small></a>
    </nav>}
    <OrderComposer>
      <p className="section-help">Elegí cliente y productos. Si cobrás el total ahora, también queda entregado.</p>
      {ready ? <NewOrderForm products={data.products} clients={data.clients} paymentMethods={availablePaymentMethods} requestKey={randomUUID()} today={today} /> : <p className="empty-state">Configurá la conexión con Neon para guardar pedidos.</p>}
    </OrderComposer>
    <section className="panel order-list-panel" id="cuentas-por-cobrar">
      <div className="panel-heading"><div><span className="eyebrow">Historial y cuentas por cobrar</span><h2>Pedidos guardados</h2></div><span className="panel-count">{ready ? orders.length : 0}</span></div>
      <p className="section-help">Al cobrar el total, el pedido queda entregado automáticamente. Si entregás antes de cobrar, usá «Marcar entregado».</p>
      {paidOpenOrders.length > 0 && <form action={deliverPaidOrders} className="paid-delivery-cleanup"><input type="hidden" name="orderIds" value={JSON.stringify(paidOpenOrders.map((order) => order.id))} /><p><strong>{paidOpenOrders.length} {paidOpenOrders.length === 1 ? "pedido ya está cobrado" : "pedidos ya están cobrados"}</strong><span>Podés cerrar sus entregas juntas. No se registra ningún cobro nuevo.</span></p><SubmitButton>Marcar cobrados como entregados</SubmitButton></form>}
      <form className="order-filters" method="get" action="/pedidos">
        <label className="order-search">Buscar<input type="search" name="q" defaultValue={typeof params.q === "string" ? params.q : ""} placeholder="Cliente, producto o número" /></label>
        <label>Etapa<select name="etapa" defaultValue={stageFilter}><option value="">Todas</option><option value="sin-entregar">Sin entregar</option>{Object.entries(stageLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label>Cobro<select name="cobro" defaultValue={paymentFilter}><option value="">Todos</option><option value="con-saldo">Con saldo pendiente</option><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="cobrado">Cobrado</option><option value="cancelado">Cancelado</option></select></label>
        <button className="secondary-button" type="submit">Filtrar</button>
        {hasFilters && <a className="clear-order-filters" href="/pedidos#cuentas-por-cobrar">Limpiar</a>}
      </form>
      {ready && hasFilters && <p className="filter-count">Mostrando {orders.length} de {data.orders.length} pedidos</p>}
      {ready && <BulkOrderPaymentForm paymentMethods={availablePaymentMethods} today={today} currency={currency} />}
      {!ready || !data.orders.length ? <p className="empty-state">Todavía no hay pedidos. Cuando guardes uno, aparece acá.</p> : !orders.length ? <p className="empty-state">No encontré pedidos con esos filtros. Probá otra búsqueda o limpiá los filtros.</p> : <div className="order-list">{orders.map((order) => {
        const lines = data.items.filter((item) => item.orderId === order.id);
        const received = data.payments.filter((payment) => payment.orderId === order.id).reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
        const outstanding = Decimal.max(0, new Decimal(order.total).minus(received));
        const otherStages = (["sent", "confirmed", "cancelled"] as const).filter((stage) => canChangeOrderStage(order.stage, stage));
        const payStatus = order.stage === "cancelled" ? "Cancelado" : outstanding.isZero() ? "Cobrado" : received.isZero() ? "Pendiente" : "Parcial";
        return <article className={`order-card ${order.stage === "cancelled" ? "is-cancelled" : outstanding.isZero() ? "is-paid" : "has-balance"}`} key={order.id} id={`pedido-${order.id}`}>
          {order.stage !== "cancelled" && outstanding.gt(0) && <label className="bulk-order-select"><input type="checkbox" data-bulk-order value={order.id} data-outstanding={outstanding.toFixed(2)} /><span>Seleccionar</span></label>}
          <div className="order-card-top"><div><span className="order-number">PED-{String(order.orderNumber).padStart(6, "0")}</span><span className="order-date">{dateLabel(order.createdOn)}</span></div><span className={`stage-badge stage-${order.stage}`}>{stageLabels[order.stage]}</span></div>
          <div className="order-client"><strong>{order.clientName}</strong><span className={`payment-badge payment-${payStatus.toLowerCase()}`}>{payStatus}</span></div>
          {order.deliveryOn && <p className="order-delivery-date">Entrega: <time dateTime={order.deliveryOn}>{dateLabel(order.deliveryOn)}</time></p>}
          <details className="order-products"><summary>{`${lines.length} ${lines.length === 1 ? "producto" : "productos"} · Ver detalle`}</summary><div className="order-card-lines">{lines.map((item) => <div key={item.id}><span><strong>{item.productName}</strong><small><b>Cantidad:</b> {new Decimal(item.quantity).toString()} <i>·</i> <b>Unidad de venta:</b> {formatUnitLabel(item.unit, item.quantity)}</small></span><span>{money(item.subtotal, currency)}</span></div>)}</div></details>
          <div className="order-card-totals"><div><span>Total vendido</span><strong>{money(order.total, currency)}</strong></div><div><span>Cobrado</span><strong>{money(received, currency)}</strong></div><div><span>Saldo pendiente</span><strong className={outstanding.gt(0) ? "pending-amount" : "amount-in"}>{money(outstanding, currency)}</strong></div></div>
          <div className="order-card-actions">
            <a className="order-document-link" href={`/pedidos/${order.id}/documento`}>Documento y compartir</a>
            {order.stage !== "cancelled" && order.stage !== "delivered" && <details className="order-schedule-details"><summary>{order.deliveryOn ? "Cambiar entrega" : "Agendar entrega"}</summary><form action={scheduleOrderDelivery} className="order-schedule-form"><input type="hidden" name="orderId" value={order.id} /><label>Fecha de entrega<input name="deliveryOn" type="date" defaultValue={order.deliveryOn ?? ""} /><small className="field-help">Dejala vacía para quitar la fecha.</small></label><button className="secondary-button" type="submit">Guardar fecha</button></form></details>}
            {order.stage !== "delivered" && order.stage !== "cancelled" && <form action={updateOrderStage}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="stage" value="delivered" /><SubmitButton className="secondary-button deliver-order-button">✓ Marcar entregado</SubmitButton></form>}
            {order.stage !== "cancelled" && outstanding.gt(0) && <details className="payment-details"><summary>Registrar cobro</summary><form action={registerOrderPayment} className="payment-form"><input type="hidden" name="paymentId" value={randomUUID()} /><input type="hidden" name="orderId" value={order.id} /><label>Importe recibido<input name="amount" inputMode="decimal" defaultValue={outstanding.toFixed(2)} required /></label><label>Fecha<input name="receivedOn" type="date" defaultValue={today} required /></label><label>Medio de pago<select name="paymentMethod" defaultValue={availablePaymentMethods[0]} required>{availablePaymentMethods.map((method) => <option value={method} key={method}>{method}</option>)}</select></label><label>Nota<input name="note" placeholder="Opcional" maxLength={500} /></label><p className="payment-auto-help">Al completar el saldo, también queda entregado. Un pago parcial no cambia la entrega.</p><SubmitButton className="primary-button">Guardar cobro →</SubmitButton></form></details>}
            {otherStages.length > 0 && <details className="order-schedule-details"><summary>Otro estado</summary><form action={updateOrderStage} className="order-schedule-form"><input type="hidden" name="orderId" value={order.id} /><label>Estado<select name="stage" defaultValue="" required><option value="" disabled>Elegí un estado</option>{otherStages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label><SubmitButton>Aplicar estado</SubmitButton></form></details>}
            {received.isZero() && <DeleteOrderForm orderId={order.id} />}
          </div>
        </article>;
      })}</div>}
    </section>
    <section className="panel order-list-panel quick-receipts-panel" id="cobros-rapidos">
      <div className="panel-heading"><div><span className="eyebrow">Ingresos fuera de pedidos</span><h2>Cobros rápidos</h2></div><span className="panel-count">{ready ? quickReceipts.length : 0}</span></div>
      <p className="section-help">Acá quedan los cobros que anotaste directo desde Inicio, sin asociarlos a un cliente ni crear un pedido.</p>
      {!ready ? <p className="empty-state">Conectá Neon para ver el historial de cobros rápidos.</p> : !quickReceipts.length ? <p className="empty-state">Todavía no hay cobros rápidos{query ? " que coincidan con la búsqueda." : ". Podés registrarlos desde el acceso rápido de Inicio."}</p> : <div className="quick-receipt-list">{quickReceipts.map((receipt) => <article className="quick-receipt-card" key={receipt.id}>
        <div className="quick-receipt-main"><strong>{receipt.description || "Cobro rápido"}</strong><span>{receipt.category || "Ingreso"}{receipt.paymentMethod ? ` · ${receipt.paymentMethod}` : ""}</span></div>
        <time dateTime={receipt.occurredOn}>{dateLabel(receipt.occurredOn)}</time>
        <strong className="quick-receipt-amount">{money(receipt.amount, currency)}</strong>
      </article>)}</div>}
    </section>
  </div>;
}

export default function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WorkspaceFrame active="orders"><Suspense fallback={<div className="module-page">Cargando pedidos…</div>}><OrdersContent searchParams={searchParams} /></Suspense></WorkspaceFrame>;
}
