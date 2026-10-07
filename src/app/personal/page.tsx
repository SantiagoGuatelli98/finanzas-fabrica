import { connection } from "next/server";
import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { addRecurringOccurrence, adjustEmergencyFund, createPersonalDebt, createPersonalTransaction, createRecurringExpense, markRecurringExpensePaid, registerDebtPayment, updateRecurringExpense } from "./actions";
import { getPersonalData } from "@/lib/personal";

function money(value: Decimal.Value | null, currency = "ARS") {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function currentMonth() {
  return todayLocal().slice(0, 7);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${value}T12:00:00-03:00`));
}

async function PersonalContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const [data, params] = await Promise.all([getPersonalData(), searchParams]);
  const configured = data.configured && !("error" in data);
  const currency = configured ? data.currency : "ARS";
  const today = todayLocal();
  const monthlyIncome = configured ? new Decimal(data.monthlyIncome) : new Decimal(0);
  const monthlyExpenses = configured ? new Decimal(data.monthlyExpenses) : new Decimal(0);
  const paidByDebt = new Map<string, Decimal>();
  const activeDebtIds = new Set(configured ? data.debts.map((debt) => debt.id) : []);
  if (configured) for (const payment of data.debtPayments) if (activeDebtIds.has(payment.debtId)) paidByDebt.set(payment.debtId, (paidByDebt.get(payment.debtId) ?? new Decimal(0)).plus(payment.amount));
  const originalDebt = configured ? data.debts.reduce((sum, debt) => sum.plus(debt.originalAmount), new Decimal(0)) : new Decimal(0);
  const paidDebt = configured ? [...paidByDebt.values()].reduce((sum, amount) => sum.plus(amount), new Decimal(0)) : new Decimal(0);
  const balanceDebt = Decimal.max(0, originalDebt.minus(paidDebt));
  const emergencyBalance = configured ? data.emergencyFundEntries.reduce((sum, entry) => sum.plus(entry.direction === "add" ? entry.amount : new Decimal(entry.amount).negated()), new Decimal(0)) : new Decimal(0);
  const emergencyTarget = configured ? new Decimal(data.emergencyFundTarget) : new Decimal(0);
  const emergencyProgress = emergencyTarget.isPositive() ? Decimal.min(100, emergencyBalance.div(emergencyTarget).times(100)).toNumber() : 0;
  const targetDate = configured ? data.debtTargetDate : null;
  const daysUntilTarget = targetDate ? Math.ceil((new Date(`${targetDate}T12:00:00-03:00`).getTime() - new Date(`${today}T12:00:00-03:00`).getTime()) / 86_400_000) : null;
  const monthlyDebtGoal = daysUntilTarget === null || daysUntilTarget < 0 ? null : balanceDebt.times(30.4375).div(Decimal.max(1, daysUntilTarget)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const weeklyDebtGoal = daysUntilTarget === null || daysUntilTarget < 0 ? null : balanceDebt.times(7).div(Decimal.max(1, daysUntilTarget)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const statusMessage = params.guardado ? "Movimiento registrado." : params.deuda ? "Deuda registrada." : params.pago ? "Pago de deuda registrado." : params.fondo ? "Fondo de emergencia actualizado." : params.recurrente ? "Gasto recurrente actualizado. Los pendientes solo se marcan pagados cuando lo confirmás." : params.pendiente ? "Pendiente mensual creado." : params.error ? "No se pudo guardar. Revisá los campos y el saldo pendiente." : "";

  const movementType = params.tipo === "ingreso" ? "income" : "expense";
  return (
    <div className="personal-page">
      <header className="module-head"><a className="back-link" href="/#inicio">← Volver al resumen</a><div className="eyebrow">Finanzas personales</div><h1>Tu plata, clara.</h1><p>Registrá lo que entra y sale. Cada movimiento queda guardado con su fecha e historial.</p></header>
      {!configured && <div className="connection-alert"><span>◌</span><div><strong>{"error" in data ? "No se pudo leer Neon" : "Conectá Neon para empezar"}</strong>{"error" in data ? "Revisá la conexión y aplicá las migraciones." : <>Completá <code>DATABASE_URL</code> en <code>.env.local</code> y ejecutá la migración.</>}</div></div>}
      {statusMessage && <div className={`notice ${params.error ? "error" : "success"}`} role="status">{statusMessage}</div>}

      <section className="personal-summary">
        <article><span>Ingresos del mes</span><strong>{money(configured ? monthlyIncome : null, currency)}</strong></article>
        <article><span>Gastos del mes</span><strong>{money(configured ? monthlyExpenses : null, currency)}</strong></article>
        <article><span>Deuda pendiente</span><strong>{money(configured ? balanceDebt : null, currency)}</strong></article>
        <article><span>Pagado de deuda</span><strong>{money(configured ? paidDebt : null, currency)}</strong></article>
      </section>

      <div className="personal-columns">
        <section className="panel" id="nuevo-movimiento" aria-labelledby="movement-title">
          <div className="panel-heading"><div><span className="eyebrow">Anotá en segundos</span><h2 id="movement-title">Nuevo movimiento</h2></div><span className="panel-index">01</span></div>
          <p className="section-help">Anotá acá la plata que entró o salió de tu bolsillo. Los movimientos del negocio van en «Negocio».</p>
          <form action={createPersonalTransaction} className="form-grid">
            <label>Tipo<select name="type" defaultValue={movementType} required><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
            <label>Monto<input name="amount" inputMode="decimal" placeholder="0,00" autoComplete="off" required /></label>
            <label>Fecha<input name="occurredOn" type="date" defaultValue={today} required /></label>
            <label>Categoría<input name="category" list="personal-categories" placeholder="Ej. Alimentos" maxLength={80} required /><datalist id="personal-categories">{configured && data.categories.map((category) => <option key={category.id} value={category.name} />)}</datalist><small className="field-help">Para qué fue. Podés escribir una nueva.</small></label>
            <label>Origen<input name="source" placeholder="Ej. sueldo, retiro del negocio" maxLength={120} /><small className="field-help">De dónde vino, si es un ingreso. Opcional.</small></label>
            <label>Medio de pago<input name="paymentMethod" list="payment-methods" placeholder="Ej. efectivo, Visa" maxLength={80} /><datalist id="payment-methods">{configured && data.paymentMethods.map((method) => <option key={method.id} value={method.name} />)}</datalist><small className="field-help">Cómo cobraste o pagaste. Opcional.</small></label>
            <label className="form-wide">Descripción<input name="description" placeholder="¿Qué fue?" maxLength={500} /></label>
            <label className="form-wide">Nota opcional<textarea name="notes" rows={2} placeholder="Un detalle para recordar" maxLength={500} /></label>
            <button className="primary-button" type="submit" disabled={!configured}>Guardar movimiento <span>→</span></button>
          </form>
        </section>

        <section className="panel debt-panel" id="deudas" aria-labelledby="debt-title">
          <div className="panel-heading"><div><span className="eyebrow">Prioridad personal</span><h2 id="debt-title">Deudas</h2></div><span className="panel-index">02</span></div>
          <p className="section-help">Cargar una deuda muestra cuánto debés. La plata sale de tus gastos recién cuando registrás un pago.</p>
          <div className="debt-total"><span>Falta pagar</span><strong>{money(configured ? balanceDebt : null, currency)}</strong></div>
          <div className="debt-progress"><span style={{ width: `${originalDebt.isZero() ? 0 : Decimal.min(100, paidDebt.div(originalDebt).times(100)).toNumber()}%` }} /></div>
          <div className="debt-progress-copy">{originalDebt.isZero() ? "Agregá una deuda para empezar a seguir el progreso." : `${paidDebt.div(originalDebt).times(100).toDecimalPlaces(0).toFixed()}% cancelado · ${money(paidDebt, currency)} de ${money(originalDebt, currency)}`}</div>
          {targetDate && daysUntilTarget !== null ? <div className="debt-plan"><span>{daysUntilTarget >= 0 ? `Objetivo ${dateLabel(targetDate)} · ${daysUntilTarget} días restantes` : `Objetivo vencido · falta ${money(balanceDebt, currency)}`}</span>{daysUntilTarget >= 0 && <><strong>{money(monthlyDebtGoal, currency)} por mes</strong><strong>{money(weeklyDebtGoal, currency)} por semana</strong></>}</div> : <a className="debt-plan-link" href="/configuracion">Definí tu fecha objetivo en Configuración →</a>}
          <form action={createPersonalDebt} className="form-grid compact-form">
            <label>Nombre de la deuda<input name="name" placeholder="Ej. Préstamo" maxLength={120} required /></label>
            <label>Acreedor<input name="creditor" placeholder="Persona o entidad" maxLength={120} /></label>
            <label>Monto original<input name="originalAmount" inputMode="decimal" placeholder="0,00" required /></label>
            <label>Fecha<input name="openedOn" type="date" defaultValue={today} required /></label>
            <label className="form-wide">Nota<textarea name="notes" rows={2} placeholder="Opcional" maxLength={500} /></label>
            <button className="secondary-button" type="submit" disabled={!configured}>Agregar deuda</button>
          </form>
        </section>
      </div>

      <section className="panel debt-list-panel">
        <div className="panel-heading"><div><span className="eyebrow">Saldo y pagos parciales</span><h2>Tu lista de deudas</h2></div><span className="panel-count">{configured ? data.debts.length : 0}</span></div>
        {!configured || data.debts.length === 0 ? <p className="empty-state">Todavía no hay deudas registradas.</p> : <div className="debt-list">{data.debts.map((debt) => {
          const paid = paidByDebt.get(debt.id) ?? new Decimal(0);
          const remaining = Decimal.max(0, new Decimal(debt.originalAmount).minus(paid));
          return <article className="debt-row" key={debt.id}>
            <div className="debt-row-main"><strong>{debt.name}</strong><span>{debt.creditor || "Acreedor sin especificar"} · Inicial {money(debt.originalAmount, currency)}</span></div>
            <div className="debt-row-balance"><span>Saldo</span><strong>{money(remaining, currency)}</strong><small>{money(paid, currency)} pagados</small></div>
            {!remaining.isZero() && <form action={registerDebtPayment} className="payment-inline"><input type="hidden" name="debtId" value={debt.id} /><label><span className="sr-only">Monto del pago de {debt.name}</span><input name="amount" inputMode="decimal" placeholder="Pago" required /></label><label><span className="sr-only">Fecha del pago</span><input name="paidOn" type="date" defaultValue={today} required /></label><label><span className="sr-only">Categoría de {debt.name}</span><input name="category" list="personal-categories" placeholder="Categoría" required /></label><button className="small-button" type="submit" disabled={!configured}>Registrar pago</button></form>}
            {remaining.isZero() && <span className="paid-badge">Pagada</span>}
          </article>;
        })}</div>}
      </section>

      <section className="panel emergency-panel" id="fondo-emergencia">
        <div className="panel-heading"><div><span className="eyebrow">Ahorro disponible</span><h2>Fondo de emergencia</h2></div><span className="panel-index">03</span></div>
        <p className="section-help">Llevá el control de lo que separaste para imprevistos. Este registro no crea automáticamente un ingreso o gasto personal.</p>
        <div className="emergency-stats"><div><span>Saldo actual</span><strong>{money(configured ? emergencyBalance : null, currency)}</strong></div><div><span>Objetivo</span><strong>{money(configured ? emergencyTarget : null, currency)}</strong></div><div><span>Progreso</span><strong>{configured && emergencyTarget.isPositive() ? `${emergencyProgress.toFixed(0)}%` : "—"}</strong></div></div>
        <div className="debt-progress emergency-progress"><span style={{ width: `${emergencyProgress}%` }} /></div>
        {!emergencyTarget.isPositive() && <p className="form-hint">Configurá un objetivo en Configuración para ver el progreso.</p>}
        <form action={adjustEmergencyFund} className="fund-form"><label>Movimiento<select name="direction" defaultValue="add"><option value="add">Agregar al fondo</option><option value="remove">Retirar del fondo</option></select></label><label>Monto<input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label>Fecha<input name="occurredOn" type="date" defaultValue={today} required /></label><label>Nota<input name="note" placeholder="Opcional" maxLength={500} /></label><button className="secondary-button" type="submit" disabled={!configured}>Guardar movimiento</button></form>
      </section>

      <section className="panel recurring-panel" id="recurrentes">
        <div className="panel-heading"><div><span className="eyebrow">Servicios, cuotas y tarjetas</span><h2>Gastos recurrentes</h2></div><span className="panel-index">04</span></div>
        <p className="transfer-explainer">Cada mes empieza como pendiente. La fecha de vencimiento nunca lo marca como pagado automáticamente.</p>
        <form action={createRecurringExpense} className="recurring-create-form">
          <input type="hidden" name="id" value={randomUUID()} />
          <label>Nombre<input name="name" placeholder="Ej. Internet, Visa" maxLength={120} required /></label>
          <label>Monto del período<input name="amount" inputMode="decimal" placeholder="0,00" required /></label>
          <label>Categoría<input name="category" list="personal-categories" placeholder="Categoría editable" maxLength={80} required /></label>
          <label>Medio de pago<input name="paymentMethod" list="payment-methods" placeholder="Opcional" maxLength={80} /></label>
          <label>Día de vencimiento<input name="dueDay" type="number" min="1" max="31" placeholder="Día" required /></label>
          <button className="secondary-button" type="submit" disabled={!configured}>Agregar gasto</button>
        </form>
        {!configured || data.recurringExpenses.length === 0 ? <p className="empty-state">Todavía no configuraste gastos recurrentes.</p> : <div className="recurring-list">{data.recurringExpenses.map((template) => {
          const occurrence = data.recurringOccurrences.find((item) => item.recurringExpenseId === template.id && item.period === currentMonth());
          return <article className="recurring-row" key={template.id}>
            <div className="recurring-name"><strong>{template.name}</strong><span>{template.dueDay} de cada mes · {data.categories.find((item) => item.id === template.categoryId)?.name ?? "Sin categoría"}</span></div>
            <details className="recurring-edit"><summary>Ajustar gasto recurrente</summary><form action={updateRecurringExpense} className="recurring-update-form"><input type="hidden" name="id" value={template.id} /><label>Nombre<input name="name" defaultValue={template.name} maxLength={120} required /></label><label>Monto<input name="amount" inputMode="decimal" defaultValue={template.amount} required /></label><label>Categoría<input name="category" list="personal-categories" defaultValue={data.categories.find((item) => item.id === template.categoryId)?.name ?? ""} required /></label><label>Medio de pago<input name="paymentMethod" defaultValue={data.paymentMethods.find((item) => item.id === template.paymentMethodId)?.name ?? ""} /></label><label>Día<input name="dueDay" type="number" min="1" max="31" defaultValue={template.dueDay} required /></label><label>Estado<select name="active" defaultValue={String(template.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label><button className="small-button" type="submit">Guardar ajustes</button></form></details>
            <strong className="recurring-amount">{money(occurrence?.amount ?? template.amount, currency)}</strong>
            {!template.active ? <span className="paid-badge">Inactivo</span> : !occurrence ? <form action={addRecurringOccurrence}><input type="hidden" name="recurringExpenseId" value={template.id} /><button className="small-button" type="submit">Crear pendiente del mes</button></form> : occurrence.status === "pending" ? <form action={markRecurringExpensePaid} className="recurring-pay-form"><input type="hidden" name="occurrenceId" value={occurrence.id} /><label><span className="sr-only">Monto pagado de {template.name}</span><input name="amount" inputMode="decimal" defaultValue={occurrence.amount} required /></label><label><span className="sr-only">Fecha de pago</span><input name="paidOn" type="date" defaultValue={today} required /></label><button className="small-button" type="submit">Marcar pagado</button></form> : <span className={`recurrence-status ${occurrence.status}`}>{occurrence.status === "paid" ? `Pagado · ${occurrence.paidOn ?? ""}` : "Omitido"}</span>}
          </article>;
        })}</div>}
      </section>

      <section className="panel transactions-panel">
        <div className="panel-heading"><div><span className="eyebrow">Últimos 30 registros</span><h2>Movimientos personales</h2></div><span className="panel-count">{configured ? data.transactions.length : 0}</span></div>
        {!configured || data.transactions.length === 0 ? <p className="empty-state">Tus ingresos y gastos van a aparecer acá cuando empieces a registrarlos.</p> : <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Categoría</th><th>Origen / medio</th><th>Monto</th></tr></thead><tbody>{data.transactions.map((row) => {
          const category = configured ? data.categories.find((item) => item.id === row.categoryId)?.name : "";
          const method = configured ? data.paymentMethods.find((item) => item.id === row.paymentMethodId)?.name : "";
          return <tr key={row.id}><td>{dateLabel(row.occurredOn)}</td><td>{row.description || (row.type === "income" ? "Ingreso" : "Gasto")}</td><td>{category || "—"}</td><td>{[row.source, method].filter(Boolean).join(" · ") || "—"}</td><td className={row.type === "income" ? "amount-in" : "amount-out"}>{row.type === "income" ? "+" : "−"}{money(row.amount, currency)}</td></tr>;
        })}</tbody></table></div>}
      </section>
    </div>
  );
}

export default function PersonalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<main className="personal-page"><p className="page-subtitle">Cargando tus finanzas…</p></main>}><PersonalContent searchParams={searchParams} /></Suspense>;
}

