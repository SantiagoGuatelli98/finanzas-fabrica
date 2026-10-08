import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import Decimal from "decimal.js";
import { getOrderDocument } from "@/lib/orders";
import { formatUnitLabel } from "@/lib/order-format";
import { updateOrderStage } from "../../actions";
import { OrderDocumentActions } from "./order-document-actions";

function money(value: string | Decimal, currency = "ARS") { return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)); }
function dateLabel(value: string) { return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${value}T12:00:00-03:00`)); }

async function DocumentContent({ id }: { id: string }) {
  await connection();
  const data = await getOrderDocument(id);
  if ("missing" in data && data.missing) notFound();
  const ready = data.configured && !("error" in data) && !("missing" in data);
  if (!ready) return <main className="document-shell"><p>No se pudo cargar este pedido.</p></main>;
  const currency = data.settings?.currency ?? "ARS";
  const number = `PED-${String(data.order.orderNumber).padStart(6, "0")}`;
  const message = `Hola ${data.client?.name ?? data.order.clientName}, te paso el presupuesto ${number}.\n\nTotal: ${money(data.order.total, currency)}`;
  return <div className="document-shell">
    <div className="document-toolbar no-print"><a className="back-link" href="/pedidos">← Volver a pedidos</a><OrderDocumentActions orderNumber={number} message={message} /></div>
    {data.order.stage === "created" && <form action={updateOrderStage} className="mark-sent no-print"><input type="hidden" name="orderId" value={data.order.id} /><input type="hidden" name="stage" value="sent" /><span>Compartir no marca el pedido como enviado.</span><button className="secondary-button" type="submit">Marcar como enviado</button></form>}
    <article className="order-document" id="order-document">
      <header className="doc-header"><div>{data.settings?.businessLogoUrl && <img src={data.settings.businessLogoUrl} alt="" className="doc-logo" />}<div><h1>{data.settings?.businessName || "Nombre del negocio"}</h1>{data.settings?.businessAddress && <p>{data.settings.businessAddress}</p>}{data.settings?.businessPhone && <p>{data.settings.businessPhone}</p>}</div></div><div className="doc-number"><span>PEDIDO</span><strong>{number}</strong></div></header>
      <div className="doc-rule" />
      <div className="doc-meta"><div><span>CLIENTE</span><strong>{data.client?.name ?? data.order.clientName}</strong>{data.client?.phone && <small>{data.client.phone}</small>}{data.client?.address && <small>{data.client.address}</small>}</div><div><span>FECHA</span><strong>{dateLabel(data.order.createdOn)}</strong>{data.order.deliveryOn && <><span className="delivery-label">ENTREGA</span><strong>{dateLabel(data.order.deliveryOn)}</strong></>}</div></div>
      <table className="doc-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td>{item.productName}</td><td>{new Decimal(item.quantity).toString()}<small className="doc-unit-label">Unidad de venta: {formatUnitLabel(item.unit, item.quantity)}</small></td><td>{money(item.unitPrice, currency)}</td><td>{money(item.subtotal, currency)}</td></tr>)}</tbody></table>
      <div className="doc-total-area"><div><span>Subtotal</span><strong>{money(data.order.subtotal, currency)}</strong></div>{new Decimal(data.order.discount).isPositive() && <div><span>Descuento</span><strong>− {money(data.order.discount, currency)}</strong></div>}<div className="doc-grand-total"><span>Total</span><strong>{money(data.order.total, currency)}</strong></div></div>
      {data.order.notes && <div className="doc-notes"><span>OBSERVACIONES</span><p>{data.order.notes}</p></div>}
      <footer className="doc-footer">{data.settings?.businessPhone ? `Consultas: ${data.settings.businessPhone}` : data.settings?.businessName || "Gracias por tu compra"}</footer>
    </article>
  </div>;
}

export default function OrderDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="document-shell">Cargando documento…</main>}><DocumentContentWrapper params={params} /></Suspense>;
}

async function DocumentContentWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentContent id={id} />;
}
