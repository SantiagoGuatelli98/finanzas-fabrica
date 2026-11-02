import { connection } from "next/server";
import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import Link from "next/link";
import { createBusinessExpense, createClient, createManualBusinessIncome, createProduct, createSupplier, createSupplierDebt, registerSupplierPayment, updateClient, updateProduct, withdrawBusinessFunds } from "./actions";
import { getBusinessSetup } from "@/lib/business";
import { WorkspaceFrame } from "@/components/workspace-navigation";

function money(value: Decimal.Value | string, currency = "ARS") { return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)); }
function todayLocal() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function dateLabel(value: string) { return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${value}T12:00:00-03:00`)); }

async function BusinessContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const [data, params] = await Promise.all([getBusinessSetup(), searchParams]);
  const ready = data.configured && !("error" in data);
  const currency = ready ? data.currency : "ARS";
  const status = params.error ? "No se pudo guardar. Revisá los campos y la conexión." : params.producto ? "Producto actualizado." : params.cliente ? "Cliente actualizado." : params.proveedor ? "Proveedor registrado." : params.gasto ? "Gasto del negocio registrado y descontado de caja." : params.deuda ? "Deuda con proveedor registrada." : params["pago-proveedor"] ? "Pago al proveedor registrado y descontado de caja." : params.retiro ? "Retiro vinculado: salida del negocio e ingreso personal, sin doble contabilización." : params.ingreso ? "Ingreso manual registrado en caja." : "";
  const today = todayLocal();
  const supplierPaid = new Map<string, Decimal>();
  const supplierPaymentsByDebt = new Map<string, { id: string; debtId: string; amount: string; paidOn: string; note: string | null; paymentMethod: string | null }[]>();
  if (ready) for (const payment of data.supplierPayments) {
    supplierPaid.set(payment.debtId, (supplierPaid.get(payment.debtId) ?? new Decimal(0)).plus(payment.amount));
    supplierPaymentsByDebt.set(payment.debtId, [...(supplierPaymentsByDebt.get(payment.debtId) ?? []), payment]);
  }
  const historyQuery = typeof params.boleta === "string" ? params.boleta.trim().toLocaleLowerCase("es-AR") : "";
  const supplierHistory = ready ? [
    ...data.supplierBills.map((bill) => ({
      id: `paid-${bill.id}`, supplier: bill.supplierName, date: bill.occurredOn, concept: bill.description,
      total: bill.amount, paid: bill.amount, balance: "0", status: "Pagada", kind: "paid" as const,
      payments: [{ id: bill.id, date: bill.occurredOn, amount: bill.amount, method: bill.paymentMethod, note: bill.notes }],
    })),
    ...data.debts.map((debt) => {
      const payments = supplierPaymentsByDebt.get(debt.id) ?? [];
      const paid = supplierPaid.get(debt.id) ?? new Decimal(0);
      const balance = Decimal.max(0, new Decimal(debt.originalAmount).minus(paid));
      return {
        id: `debt-${debt.id}`, supplier: data.suppliers.find((supplier) => supplier.id === debt.supplierId)?.name ?? "Proveedor",
        date: debt.openedOn, concept: debt.concept, total: debt.originalAmount, paid: paid.toFixed(2), balance: balance.toFixed(2),
        status: balance.isZero() ? "Pagada" : paid.gt(0) ? "Parcial" : "Pendiente", kind: "debt" as const,
        payments: payments.map((payment) => ({ id: payment.id, date: payment.paidOn, amount: payment.amount, method: payment.paymentMethod, note: payment.note })),
      };
    }),
  ].filter((entry) => !historyQuery || [entry.supplier, entry.concept, entry.date, ...entry.payments.map((payment) => `${payment.date} ${payment.method ?? ""} ${payment.note ?? ""}`)].join(" ").toLocaleLowerCase("es-AR").includes(historyQuery))
    .sort((a, b) => b.date.localeCompare(a.date)) : [];
  return <div className="module-page">
    <header className="module-head"><Link className="back-link" href="/#inicio">← Volver al resumen</Link><div className="eyebrow">Operación del negocio</div><h1>La fábrica.</h1><p>Productos, clientes y proveedores. Editá los datos desde acá cuando cambien.</p></header>
    {!ready && <div className="connection-alert"><span>◌</span><div><strong>{"error" in data ? "No se pudo leer Neon" : "Conectá Neon para empezar"}</strong> Los cambios se guardan en PostgreSQL.</div></div>}
    {status && <div className={`notice ${params.error ? "error" : "success"}`} role="status">{status}</div>}

    <section className="business-columns">
      <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Catálogo editable</span><h2>Productos</h2></div><span className="panel-count">{ready ? data.products.length : 0}</span></div>
        <p className="section-help">Guardá lo que vendés. «Unidad» es cómo lo contás (unidad, docena o kilo); el precio se propone al armar un pedido y lo podés cambiar ahí.</p>
        <form action={createProduct} className="form-grid compact-form">
          <label>Nombre<input name="name" placeholder="Nombre del producto" maxLength={120} required /></label><label>Unidad<input name="unit" placeholder="docena, unidad, kg…" maxLength={40} required /></label>
          <label>Precio actual<input name="price" inputMode="decimal" placeholder="0,00" required /></label><label>Descripción<input name="description" placeholder="Opcional" maxLength={500} /></label>
          <button className="primary-button" type="submit" disabled={!ready}>Agregar producto <span>→</span></button>
        </form>
        {!ready || data.products.length === 0 ? <p className="empty-state">Todavía no hay productos. Agregalos acá; el catálogo queda editable.</p> : <details className="catalog-disclosure"><summary>Ver y editar {data.products.length} productos</summary><div className="editable-list">{data.products.map((product) => <form action={updateProduct} className={`editable-row ${product.active ? "" : "inactive-row"}`} key={product.id}>
          <input type="hidden" name="id" value={product.id} />
          <label><span>Producto</span><input name="name" defaultValue={product.name} maxLength={120} required /></label>
          <label><span>Unidad</span><input name="unit" defaultValue={product.unit} maxLength={40} required /></label>
          <label><span>Precio</span><input name="price" defaultValue={product.price} inputMode="decimal" required /></label>
          <label><span>Estado</span><select name="active" defaultValue={String(product.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>
          <label className="editable-description"><span>Descripción</span><input name="description" defaultValue={product.description ?? ""} maxLength={500} /></label>
          <button type="submit" className="small-button" disabled={!ready}>Guardar</button>
        </form>)}</div></details>}
      </div>

      <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Sin CRM complejo</span><h2>Clientes</h2></div><span className="panel-count">{ready ? data.clients.length : 0}</span></div>
        <p className="section-help">Personas o negocios a quienes vendés. Después los elegís al crear un pedido.</p>
        <form action={createClient} className="form-grid compact-form">
          <label>Nombre<input name="name" placeholder="Nombre del cliente" maxLength={120} required /></label><label>WhatsApp<input name="phone" placeholder="Teléfono" maxLength={80} /></label>
          <label className="form-wide">Dirección<input name="address" placeholder="Opcional" maxLength={240} /></label>
          <label className="form-wide">Nota<textarea name="notes" rows={2} placeholder="Opcional" maxLength={500} /></label>
          <button className="primary-button" type="submit" disabled={!ready}>Agregar cliente <span>→</span></button>
        </form>
        {!ready || data.clients.length === 0 ? <p className="empty-state">Todavía no hay clientes guardados.</p> : <details className="catalog-disclosure"><summary>Ver y editar {data.clients.length} clientes</summary><div className="editable-list">{data.clients.map((client) => <form action={updateClient} className={`editable-row client-edit ${client.active ? "" : "inactive-row"}`} key={client.id}>
          <input type="hidden" name="id" value={client.id} />
          <label><span>Nombre</span><input name="name" defaultValue={client.name} maxLength={120} required /></label>
          <label><span>WhatsApp</span><input name="phone" defaultValue={client.phone ?? ""} maxLength={80} /></label>
          <label><span>Dirección</span><input name="address" defaultValue={client.address ?? ""} maxLength={240} /></label>
          <label><span>Estado</span><select name="active" defaultValue={String(client.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>
          <label className="editable-description"><span>Nota</span><input name="notes" defaultValue={client.notes ?? ""} maxLength={500} /></label>
          <button type="submit" className="small-button" disabled={!ready}>Guardar</button>
        </form>)}</div></details>}
      </div>
    </section>

    <section className="panel supplier-panel"><div className="panel-heading"><div><span className="eyebrow">Compras y deuda del negocio</span><h2>Proveedores</h2></div><span className="panel-count">{ready ? data.suppliers.length : 0}</span></div>
      <p className="section-help">Son quienes te venden insumos o servicios. Los podés asociar a un gasto o a una deuda.</p>
      <form action={createSupplier} className="supplier-form">
        <label>Proveedor<input name="name" placeholder="Nombre" maxLength={120} required /></label><label>Teléfono<input name="phone" placeholder="Opcional" maxLength={80} /></label><label>Descripción<input name="description" placeholder="Opcional" maxLength={240} /></label><label>Nota<input name="notes" placeholder="Opcional" maxLength={500} /></label><button className="secondary-button" type="submit" disabled={!ready}>Agregar proveedor</button>
      </form>
      {!ready || data.suppliers.length === 0 ? <p className="empty-state">Todavía no hay proveedores.</p> : <div className="supplier-chips">{data.suppliers.map((supplier) => <div className="supplier-chip" key={supplier.id}><strong>{supplier.name}</strong>{supplier.phone && <span>{supplier.phone}</span>}</div>)}</div>}
      {ready && <a className="supplier-history-jump" href="#historial-boletas">Ver boletas y pagos registrados ↓</a>}
    </section>

    <section className="panel manual-income-panel"><div className="panel-heading"><div><span className="eyebrow">Caso excepcional</span><h2>Registrar ingreso manual</h2></div><span className="panel-index">05</span></div>
      <p className="section-help">Usalo para plata que entró al negocio fuera de un pedido. Categoría = motivo (por ejemplo, «Otro ingreso»); medio de pago = cómo la recibiste. Los cobros de pedidos se registran desde Pedidos.</p>
      <form action={createManualBusinessIncome} className="manual-income-form"><input type="hidden" name="id" value={randomUUID()} /><label>Monto<input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label>Fecha<input name="occurredOn" type="date" defaultValue={today} required /></label><label>Categoría<input name="category" list="business-categories" placeholder="Categoría editable" required maxLength={80} /></label><label>Medio de pago<input name="paymentMethod" placeholder="Opcional" maxLength={80} /></label><label>Descripción<input name="description" placeholder="Origen del ingreso" required maxLength={240} /></label><label>Nota<input name="note" placeholder="Opcional" maxLength={500} /></label><button className="primary-button" type="submit" disabled={!ready}>Registrar ingreso <span>→</span></button></form>
    </section>

    <section className="panel transfer-panel"><div className="panel-heading"><div><span className="eyebrow">Transferencia entre tus cajas</span><h2>Retirar para uso personal</h2></div><span className="panel-index">04</span></div>
      <p className="transfer-explainer">Este movimiento baja la caja del negocio y aparece como ingreso personal vinculado. No se registra como gasto operativo.</p>
      <form action={withdrawBusinessFunds} className="supplier-form transfer-form">
        <input type="hidden" name="id" value={randomUUID()} />
        <label>Monto<input name="amount" inputMode="decimal" placeholder="0,00" required /></label>
        <label>Fecha<input name="occurredOn" type="date" defaultValue={today} required /></label>
        <label>Categoría personal<input name="personalCategory" placeholder="Categoría editable" maxLength={80} required /></label>
        <label>Medio de pago<input name="paymentMethod" placeholder="Opcional" maxLength={80} /></label>
        <label>Nota<input name="note" placeholder="Opcional" maxLength={500} /></label>
        <button className="primary-button" type="submit" disabled={!ready}>Registrar retiro <span>→</span></button>
      </form>
    </section>

    <section className="business-columns expense-columns">
      <div className="panel" id="nuevo-gasto"><div className="panel-heading"><div><span className="eyebrow">Salida real de caja</span><h2>Registrar gasto</h2></div><span className="panel-index">02</span></div>
        <p className="section-help">Usalo si ya pagaste. Esto baja la caja del negocio. Si todavía debés el dinero, cargalo en «Deudas y pagos».</p>
        <form action={createBusinessExpense} className="form-grid">
          <input type="hidden" name="id" value={randomUUID()} />
          <label>Monto<input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label>Fecha<input name="occurredOn" type="date" defaultValue={today} required /></label>
          <label>Categoría<input name="category" list="business-categories" placeholder="Ej. Insumos" maxLength={80} required /><datalist id="business-categories">{ready && data.categories.map((category) => <option key={category.id} value={category.name} />)}</datalist><small className="field-help">Para qué fue el gasto. Podés escribir una nueva.</small></label>
          <label>Proveedor<select name="supplierId" defaultValue=""><option value="">Sin proveedor</option>{ready && data.suppliers.filter((supplier) => supplier.active).map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>
          <label>Medio de pago<input name="paymentMethod" placeholder="Efectivo, transferencia…" maxLength={80} required /><small className="field-help">Cómo salió la plata.</small></label><label>Descripción<input name="description" placeholder="¿Qué se pagó?" maxLength={240} required /></label>
          <label className="form-wide">Nota<textarea name="notes" rows={2} placeholder="Opcional" maxLength={500} /></label>
          <button className="primary-button" type="submit" disabled={!ready}>Guardar gasto <span>→</span></button>
        </form>
        <div className="recent-expenses">{!ready || data.expenses.length === 0 ? <p className="empty-state">No hay gastos registrados todavía.</p> : data.expenses.slice(0, 8).map((expense) => <div className="recent-expense" key={expense.id}><span><strong>{expense.description}</strong><small>{expense.occurredOn} · {expense.cashMovementId ? "Pagado" : "Compra a cuenta"}</small></span><b>{money(expense.amount, currency)}</b></div>)}</div>
      </div>

      <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Saldo por proveedor</span><h2>Deudas y pagos</h2></div><span className="panel-index">03</span></div>
        <p className="section-help">Cargá lo que le debés a un proveedor. Eso registra el gasto, pero la caja baja solo cuando anotás un pago.</p>
        <form action={createSupplierDebt} className="form-grid compact-form">
          <input type="hidden" name="id" value={randomUUID()} />
          <label>Proveedor<select name="supplierId" defaultValue="" required><option value="" disabled>Elegí proveedor</option>{ready && data.suppliers.filter((supplier) => supplier.active).map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>
          <label>Concepto<input name="concept" placeholder="Qué quedó pendiente" maxLength={240} required /></label>
          <label>Monto original<input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label>Fecha<input name="openedOn" type="date" defaultValue={today} required /></label>
          <label>Categoría del gasto<input name="category" list="business-categories" placeholder="Categoría editable" maxLength={80} required /></label>
          <label>Nota<input name="notes" placeholder="Opcional" maxLength={500} /></label>
          <button className="secondary-button" type="submit" disabled={!ready || !data.suppliers.some((supplier) => supplier.active)}>Registrar deuda</button>
        </form>
        {!ready || data.debts.length === 0 ? <p className="empty-state">Las compras a cuenta aparecerán acá para conservar sus pagos parciales.</p> : <div className="supplier-debt-list">{data.debts.map((debt) => {
          const supplier = data.suppliers.find((row) => row.id === debt.supplierId);
          const paid = supplierPaid.get(debt.id) ?? new Decimal(0);
          const balance = Decimal.max(0, new Decimal(debt.originalAmount).minus(paid));
          return <article className="supplier-debt-row" key={debt.id}><div className="supplier-debt-title"><strong>{supplier?.name ?? "Proveedor"}</strong><span>{debt.concept}</span></div><div className="supplier-debt-amount"><small>Debe</small><b>{money(balance, currency)}</b></div>
            {balance.gt(0) ? <form action={registerSupplierPayment} className="payment-inline supplier-payment-form"><input type="hidden" name="id" value={randomUUID()} /><input type="hidden" name="debtId" value={debt.id} /><label><span className="sr-only">Monto de pago</span><input name="amount" inputMode="decimal" placeholder="Pago" required /></label><label><span className="sr-only">Fecha de pago</span><input name="paidOn" type="date" defaultValue={today} required /></label><label><span className="sr-only">Medio de pago</span><input name="paymentMethod" placeholder="Medio de pago" required /></label><button className="small-button" type="submit" disabled={!ready}>Registrar pago</button></form> : <span className="paid-badge">Pagada</span>}
          </article>;
        })}</div>}
      </div>
    </section>
    <section className="panel supplier-history-panel" id="historial-boletas">
      <div className="panel-heading"><div><span className="eyebrow">Registro de compras</span><h2>Boletas y pagos</h2></div><span className="panel-count">{ready ? supplierHistory.length : 0}</span></div>
      <p className="section-help">Revisá boletas pagadas y deudas a cuenta, con el detalle de cada pago. Las deudas iniciales siguen separadas de las boletas que fuiste cargando.</p>
      <form className="supplier-history-search" method="get" action="/negocio#historial-boletas">
        <label>Buscar proveedor, concepto, fecha o medio<input type="search" name="boleta" defaultValue={typeof params.boleta === "string" ? params.boleta : ""} placeholder="Ej. harina, Luis, octubre…" /></label>
        <button className="secondary-button" type="submit">Buscar</button>
        {historyQuery && <a href="/negocio#historial-boletas">Limpiar</a>}
      </form>
      {!ready ? <p className="empty-state">Conectá Neon para consultar las boletas y pagos guardados.</p> : !supplierHistory.length ? <p className="empty-state">{historyQuery ? "No encontré boletas o pagos con esa búsqueda." : "Todavía no hay boletas asociadas a proveedores. Las compras pagadas aparecen al registrarlas como gasto con proveedor; las que quedan pendientes, en Deudas y pagos."}</p> : <div className="supplier-history-list">{supplierHistory.map((entry) => <article className="supplier-history-card" key={entry.id}>
        <div className="supplier-history-top"><div><strong>{entry.supplier}</strong><span>{dateLabel(entry.date)} · {entry.concept}</span></div><span className={`supplier-history-status ${entry.status === "Pagada" ? "is-paid" : entry.status === "Parcial" ? "is-partial" : "is-pending"}`}>{entry.status}</span></div>
        <div className="supplier-history-totals"><div><span>Importe original</span><strong>{money(entry.total, currency)}</strong></div><div><span>Pagado</span><strong>{money(entry.paid, currency)}</strong></div><div><span>Saldo</span><strong className={Number(entry.balance) > 0 ? "pending-amount" : "amount-in"}>{money(entry.balance, currency)}</strong></div></div>
        {entry.payments.length > 0 && <div className="supplier-history-payments"><strong>{entry.kind === "paid" ? "Pago registrado" : "Historial de pagos"}</strong>{entry.payments.map((payment) => <div key={payment.id}><span>{dateLabel(payment.date)}{payment.method ? ` · ${payment.method}` : ""}{payment.note ? ` · ${payment.note}` : ""}</span><b>{money(payment.amount, currency)}</b></div>)}</div>}
      </article>)}</div>}
      <p className="supplier-history-note">Si anotás ahora una boleta que pagaste antes, cargá su fecha real como gasto pagado. La salida se suma al registro de caja y corrige el saldo actual.</p>
    </section>
    <p className="module-footnote">Los registros financieros históricos se conservan. Los productos y clientes que ya se usaron se pueden desactivar para que no aparezcan en nuevas operaciones.</p>
  </div>;
}

export default function BusinessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WorkspaceFrame active="business"><Suspense fallback={<div className="personal-page">Cargando configuración del negocio…</div>}><BusinessContent searchParams={searchParams} /></Suspense></WorkspaceFrame>;
}
