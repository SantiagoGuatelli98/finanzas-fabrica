"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { createOrder } from "./actions";

type Product = { id: string; name: string; unit: string; price: string };
type Client = { id: string; name: string; phone: string | null };
type Line = { key: number; productId: string; quantity: string; unitPrice: string };

function money(value: Decimal) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(Number(value.toFixed(2)));
}

export function NewOrderForm({ products, clients, requestKey, today }: { products: Product[]; clients: Client[]; requestKey: string; today: string }) {
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", quantity: "1", unitPrice: "0" }]);
  const [discount, setDiscount] = useState("0");
  const nextKey = useMemo(() => Math.max(...lines.map((line) => line.key), 0) + 1, [lines]);
  const validLines = lines.filter((line) => line.productId && Number(line.quantity) > 0);
  const subtotal = validLines.reduce((sum, line) => {
    try { return sum.plus(new Decimal(line.quantity).times(line.unitPrice || "0")); } catch { return sum; }
  }, new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  let discountAmount = new Decimal(0);
  try { discountAmount = new Decimal(discount || "0"); } catch { /* Preview stays at zero until valid. */ }
  const total = Decimal.max(0, subtotal.minus(discountAmount));

  function updateLine(key: number, changes: Partial<Line>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line));
  }

  return <form action={createOrder} className="order-form">
    <input type="hidden" name="requestKey" value={requestKey} />
    <input type="hidden" name="itemsJson" value={JSON.stringify(validLines.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })))} />
    <div className="form-grid">
      <label>Cliente<select name="clientId" defaultValue="" required><option value="" disabled>Elegí un cliente</option>{clients.filter((client) => client.name).map((client) => <option value={client.id} key={client.id}>{client.name}{client.phone ? ` · ${client.phone}` : ""}</option>)}</select></label>
      <label>Fecha del pedido<input name="createdOn" type="date" defaultValue={today} required /></label>
      <label>Fecha de entrega<input name="deliveryOn" type="date" /></label>
      <label>Descuento opcional<input name="discount" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /><small className="field-help">Se resta del total del pedido.</small></label>
    </div>

    <div className="order-lines-head"><div><span className="eyebrow">Detalle</span><h3>Productos del pedido</h3></div><span className="line-count">{validLines.length} {validLines.length === 1 ? "producto" : "productos"}</span></div>
    <div className="order-line-labels"><span>Producto</span><span>Cantidad</span><span>Precio unitario</span><span>Subtotal</span><span /></div>
    <div className="order-lines">{lines.map((line) => {
      const selectedProduct = products.find((product) => product.id === line.productId);
      const lineSubtotal = (() => { try { return new Decimal(line.quantity || "0").times(line.unitPrice || "0").toDecimalPlaces(2, Decimal.ROUND_HALF_UP); } catch { return new Decimal(0); } })();
      return <div className="order-line" key={line.key}>
        <label><span className="line-mobile-label">Producto</span><select value={line.productId} onChange={(event) => {
          const product = products.find((entry) => entry.id === event.target.value);
          updateLine(line.key, { productId: event.target.value, unitPrice: product?.price ?? "0" });
        }}><option value="">Elegí un producto</option>{products.filter((product) => product.id === line.productId || !lines.some((other) => other.productId === product.id)).map((product) => <option value={product.id} key={product.id}>{product.name} · {product.unit}</option>)}</select></label>
        <label><span className="line-mobile-label">Cantidad {selectedProduct ? `(${selectedProduct.unit})` : ""}</span><input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></label>
        <label><span className="line-mobile-label">Precio unitario</span><input inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} /></label>
        <div className="line-subtotal"><span className="line-mobile-label">Subtotal</span>{money(lineSubtotal)}</div>
        <button type="button" className="remove-line" aria-label="Quitar producto" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}>×</button>
      </div>;
    })}</div>
    <button type="button" className="add-line" disabled={lines.length >= 30 || products.length === 0} onClick={() => setLines((current) => [...current, { key: nextKey, productId: "", quantity: "1", unitPrice: "0" }])}>＋ Agregar otro producto</button>
    <label className="order-notes">Observaciones<textarea name="notes" rows={2} placeholder="Aclaraciones para este pedido" maxLength={500} /></label>
    <div className="order-total-box"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Descuento</span><strong>− {money(discountAmount)}</strong></div><div className="grand-total"><span>Total del pedido</span><strong>{money(total)}</strong></div></div>
    <button className="primary-button" type="submit" disabled={!clients.length || !products.length || !validLines.length}>Guardar pedido <span>→</span></button>
    {(!clients.length || !products.length) && <p className="form-hint">{!clients.length && !products.length ? "Agregá al menos un cliente y un producto en Negocio para crear pedidos." : !clients.length ? "Agregá un cliente en Negocio para crear pedidos." : "Agregá un producto en Negocio para crear pedidos."}</p>}
  </form>;
}
