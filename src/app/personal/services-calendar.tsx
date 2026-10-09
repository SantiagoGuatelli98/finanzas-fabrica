"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { payService, saveService } from "./service-actions";
import { monthDueDate, serviceMonth, shiftMonth, type ScheduledService, type ServiceOccurrence, type ServiceTemplate } from "@/lib/service-calendar";

type NamedItem = { id: string; name: string };
type Editor = { id: string; dueOn: string; service: ScheduledService | null };
type SharedFormProps = { methods: string[]; today: string; currency: string; onSaved: (date?: string) => void };

function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { dateStyle: "long" }) {
  return new Intl.DateTimeFormat("es-AR", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
function money(amount: Decimal.Value, currency: string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount));
}
function CalendarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4m8-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1" /></svg>;
}

function ServiceEditor({ editor, categories, methods, preferredMethod, onSaved }: { editor: Editor; categories: NamedItem[]; methods: string[]; preferredMethod: string; onSaved: (date?: string) => void }) {
  const [state, action, pending] = useActionState(saveService, {});
  const [repeat, setRepeat] = useState(editor.service?.repeatMonthly ?? true);
  const [active, setActive] = useState(editor.service?.active ?? true);
  const [name, setName] = useState(editor.service?.name ?? "");
  const [amount, setAmount] = useState(editor.service?.amount ?? "");
  const [dueOn, setDueOn] = useState(editor.dueOn);
  const [category, setCategory] = useState(categories.find((item) => item.id === editor.service?.categoryId)?.name ?? "Servicios");
  const [method, setMethod] = useState(preferredMethod);
  useEffect(() => { if (state.saved) onSaved(state.dueOn); }, [state.saved, state.dueOn, onSaved]);
  return <form action={action} className="service-editor-form">
    <input type="hidden" name="id" value={editor.id} />
    <input type="hidden" name="mode" value={editor.service ? "edit" : "new"} />
    <input type="hidden" name="editPeriod" value={editor.service?.period ?? ""} />
    <input type="hidden" name="repeatMonthly" value={String(repeat)} />
    <input type="hidden" name="active" value={String(active)} />
    <label>Servicio<input name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Luz, internet, alquiler" maxLength={120} required autoFocus /></label>
    <div className="service-form-columns">
      <label>Monto a pagar<input name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" required /></label>
      <label>Vencimiento<input name="dueOn" type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} required /></label>
    </div>
    <label className="service-check"><input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} /><span><strong>Repetir cada mes</strong><small>{repeat ? "El monto y el día quedan como referencia. Podés ajustarlos cuando llegue cada factura." : "Se agenda solo para esta fecha."}</small></span></label>
    <details className="service-extra-fields"><summary>Categoría y medio de pago habitual</summary><div className="service-form-columns">
      <label>Categoría<input name="category" list="service-category-options" value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80} /><datalist id="service-category-options">{categories.map((category) => <option value={category.name} key={category.id} />)}</datalist></label>
      <label>Medio de pago<select name="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value)}>
        <option value="">Elegir al pagar</option>{methods.map((method) => <option value={method} key={method}>{method}</option>)}
      </select></label>
    </div></details>
    {editor.service && <label className="service-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Servicio activo</strong><small>Desmarcalo para pausar sus próximos vencimientos.</small></span></label>}
    {state.error && <p className="service-form-error" role="alert">{state.error}</p>}
    <button className="primary-button" type="submit" disabled={pending}>{pending ? "Guardando…" : editor.service ? "Guardar cambios" : "Agendar servicio"}<span aria-hidden="true">→</span></button>
  </form>;
}

function ServicePayment({ service, methods, preferredMethod, today, currency, onSaved }: SharedFormProps & { service: ScheduledService; preferredMethod: string }) {
  const [state, action, pending] = useActionState(payService, {});
  const [amount, setAmount] = useState(service.amount);
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState(preferredMethod || methods[0] || "Efectivo");
  useEffect(() => { if (state.saved) onSaved(); }, [state.saved, onSaved]);
  return <form action={action} className="service-editor-form">
    <input type="hidden" name="id" value={service.id} /><input type="hidden" name="period" value={service.period} />
    <div className="service-payment-summary"><span>Vencimiento {dateLabel(service.dueOn, { day: "numeric", month: "long" })}</span><strong>{money(service.amount, currency)}</strong></div>
    <label>Importe pagado<input name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required autoFocus /></label>
    <div className="service-form-columns"><label>Fecha del pago<input name="paidOn" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} required /></label><label>Medio de pago<select name="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value)} required>{methods.map((method) => <option value={method} key={method}>{method}</option>)}</select></label></div>
    <p className="service-form-note">Al confirmar, este importe se registra como gasto personal y el vencimiento queda pagado.</p>
    {state.error && <p className="service-form-error" role="alert">{state.error}</p>}
    <button className="primary-button" type="submit" disabled={pending}>{pending ? "Registrando…" : "Confirmar pago"}<span aria-hidden="true">✓</span></button>
  </form>;
}

function ServiceAgenda({ rows, today, currency, onEdit, onPay }: { rows: ScheduledService[]; today: string; currency: string; onEdit: (service: ScheduledService) => void; onPay: (service: ScheduledService) => void }) {
    return <div className="service-agenda">{rows.map((service) => <article className={`service-agenda-row ${service.status === "paid" ? "is-paid" : ""}`} key={`${service.id}-${service.period}`}>
      <div className="service-date-stamp"><strong>{Number(service.dueOn.slice(8))}</strong><span>{dateLabel(service.dueOn, { month: "short" })}</span></div>
      <div className="service-agenda-name"><strong>{service.name}</strong><span>{service.status === "paid" ? `Pagado${service.paidOn ? ` el ${dateLabel(service.paidOn, { day: "numeric", month: "short" })}` : ""}` : service.dueOn < today ? "Vencido · pendiente" : service.dueOn === today ? "Vence hoy" : "Pendiente"}<i>·</i>{service.repeatMonthly ? "Mensual" : "Una vez"}</span></div>
      <strong className="service-agenda-amount">{money(service.amount, currency)}</strong>
      {service.status === "pending" ? <div className="service-row-actions"><button type="button" className="service-edit-button" onClick={() => onEdit(service)} aria-label={`Editar ${service.name}`}>Editar</button><button type="button" className="small-button" onClick={() => onPay(service)} aria-label={`Registrar pago de ${service.name}`}>Pagar</button></div> : <div className="service-row-actions">{service.repeatMonthly && service.active && <button type="button" className="service-edit-button" onClick={() => onEdit(service)}>Editar próximo</button>}<span className="service-paid-label">✓ Pagado</span></div>}
    </article>)}</div>;
  }

export function ServicesCalendar({ services, occurrences, categories, paymentMethods, today, currency, enabled }: { services: ServiceTemplate[]; occurrences: ServiceOccurrence[]; categories: NamedItem[]; paymentMethods: NamedItem[]; today: string; currency: string; enabled: boolean }) {
  const router = useRouter();
  const [period, setPeriod] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [payment, setPayment] = useState<ScheduledService | null>(null);
  const [notice, setNotice] = useState("");
  const calendarDialog = useRef<HTMLDialogElement>(null);
  const editorDialog = useRef<HTMLDialogElement>(null);
  const paymentDialog = useRef<HTMLDialogElement>(null);
  const backToCalendar = useRef(false);
  const methods = Array.from(new Set(["Efectivo", "Transferencia", "Mercado Pago", "Débito", "Crédito", ...paymentMethods.map((method) => method.name)]));
  const entries = useMemo(() => serviceMonth(services, occurrences, period), [services, occurrences, period]);
  const pending = entries.filter((item) => item.status === "pending");
  const pendingAmount = pending.reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const paidAmount = entries.filter((item) => item.status === "paid").reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const [year, month] = period.split("-").map(Number);
  const monthLength = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const dayEntries = entries.filter((entry) => entry.dueOn === selectedDay);
  const paused = services.filter((service) => !service.active);

  useEffect(() => { if (editor) editorDialog.current?.showModal(); }, [editor]);
  useEffect(() => { if (payment) paymentDialog.current?.showModal(); }, [payment]);

  const saved = useCallback((date?: string) => {
    editorDialog.current?.close(); paymentDialog.current?.close();
    setEditor(null); setPayment(null); setNotice("Agenda actualizada.");
    if (date) { setPeriod(date.slice(0, 7)); setSelectedDay(date); }
    router.refresh();
    if (backToCalendar.current) calendarDialog.current?.showModal();
  }, [router]);

  function moveMonth(offset: number) {
    const next = shiftMonth(period, offset);
    setPeriod(next); setSelectedDay(`${next}-01`);
  }
  function goToToday() { setPeriod(today.slice(0, 7)); setSelectedDay(today); }
  function openEditor(service: ScheduledService | null, date = selectedDay) {
    if (service?.status === "paid") {
      const serviceId = service.id;
      const template = services.find((item) => item.id === serviceId);
      if (!template?.active || !template.repeatMonthly) return;
      let nextPeriod = shiftMonth(service.period, 1);
      if (template.startsOn && nextPeriod < template.startsOn.slice(0, 7)) nextPeriod = template.startsOn.slice(0, 7);
      while (occurrences.some((item) => item.recurringExpenseId === template.id && item.period === nextPeriod && item.status !== "pending")) nextPeriod = shiftMonth(nextPeriod, 1);
      service = serviceMonth([template], occurrences, nextPeriod)[0];
      setPeriod(nextPeriod); setSelectedDay(service.dueOn);
    }
    backToCalendar.current = Boolean(calendarDialog.current?.open);
    calendarDialog.current?.close();
    setEditor({ id: service?.id ?? crypto.randomUUID(), dueOn: service?.dueOn ?? date, service });
  }
  function openPayment(service: ScheduledService) {
    backToCalendar.current = Boolean(calendarDialog.current?.open);
    calendarDialog.current?.close(); setPayment(service);
  }
  return <section className="panel services-panel" id="recurrentes" aria-labelledby="services-title">
    <div className="services-panel-heading"><div><span className="eyebrow">Tu agenda personal</span><h2 id="services-title">Servicios y vencimientos</h2><p>Tené a mano qué pagar, cuánto y cuándo.</p></div><div className="services-head-actions"><button type="button" className="service-calendar-button" onClick={() => calendarDialog.current?.showModal()}><CalendarIcon />Ver calendario</button><button type="button" className="primary-button" onClick={() => openEditor(null, period === today.slice(0, 7) ? today : `${period}-01`)} disabled={!enabled}>＋ Agendar servicio</button></div></div>
    <div className="services-month-toolbar"><div className="service-month-switch"><button type="button" aria-label="Mes anterior" onClick={() => moveMonth(-1)}>‹</button><strong>{dateLabel(`${period}-01`, { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Mes siguiente" onClick={() => moveMonth(1)}>›</button></div><button type="button" className="service-today-button" onClick={goToToday}>Este mes</button></div>
    <div className="services-month-summary"><div><span>Por pagar este mes</span><strong>{money(pendingAmount, currency)}</strong><small>{pending.length} {pending.length === 1 ? "vencimiento pendiente" : "vencimientos pendientes"}</small></div><div><span>Ya pagado</span><strong>{money(paidAmount, currency)}</strong></div></div>
    {notice && <p className="service-notice" role="status">{notice}</p>}
    {entries.length ? <ServiceAgenda rows={entries} today={today} currency={currency} onEdit={openEditor} onPay={openPayment} /> : <div className="services-empty"><span className="services-empty-icon"><CalendarIcon /></span><strong>Un mes más fácil de organizar.</strong><p>Agendá tus servicios con monto y vencimiento. Los vas a ver acá y en el calendario.</p><button type="button" onClick={() => openEditor(null, period === today.slice(0, 7) ? today : `${period}-01`)} disabled={!enabled}>Agendar el primero →</button></div>}
    {paused.length > 0 && <details className="paused-services"><summary>Servicios pausados ({paused.length})</summary>{paused.map((service) => {
      const editPeriod = occurrences.some((item) => item.recurringExpenseId === service.id && item.period === period && item.status === "paid") ? shiftMonth(period, 1) : period;
      return <div key={service.id}><span>{service.name}</span><button type="button" className="service-edit-button" onClick={() => openEditor({ ...service, period: editPeriod, dueOn: monthDueDate(editPeriod, service.dueDay), status: "pending", paidOn: null })}>Editar y reactivar</button></div>;
    })}</details>}

    <dialog className="service-dialog calendar-dialog" ref={calendarDialog} aria-labelledby="service-calendar-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="service-dialog-inner"><header className="service-dialog-header"><div><span className="eyebrow">Vista del mes</span><h2 id="service-calendar-title">Calendario de pagos</h2></div><button type="button" className="dialog-close" aria-label="Cerrar calendario" onClick={() => calendarDialog.current?.close()}>×</button></header>
        <div className="services-month-toolbar"><div className="service-month-switch"><button type="button" aria-label="Mes anterior" onClick={() => moveMonth(-1)}>‹</button><strong>{dateLabel(`${period}-01`, { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Mes siguiente" onClick={() => moveMonth(1)}>›</button></div><button type="button" className="service-today-button" onClick={goToToday}>Hoy</button></div>
        <div className="service-calendar-weekdays" aria-hidden="true">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="service-calendar-grid" aria-label={`Vencimientos de ${dateLabel(`${period}-01`, { month: "long" })}`}>
          {Array.from({ length: firstWeekday }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}
          {Array.from({ length: monthLength }, (_, index) => {
            const date = `${period}-${String(index + 1).padStart(2, "0")}`;
            const bills = entries.filter((entry) => entry.dueOn === date);
            const unpaid = bills.filter((bill) => bill.status === "pending");
            return <button type="button" className={`calendar-day ${today === date ? "is-today" : ""} ${selectedDay === date ? "is-selected" : ""}`} key={date} onClick={() => setSelectedDay(date)} aria-pressed={selectedDay === date} aria-label={`${dateLabel(date)}, ${bills.length} ${bills.length === 1 ? "servicio" : "servicios"}${unpaid.length ? `, ${unpaid.length} pendientes` : ""}`}><span>{index + 1}</span>{bills.length > 0 && <span className={`calendar-bill-mark ${unpaid.length ? "pending" : "paid"}`}>{bills.length}<span className="calendar-bill-word"> {bills.length === 1 ? "pago" : "pagos"}</span></span>}</button>;
          })}
        </div>
        <div className="calendar-legend"><span><i />Pendiente</span><span><i className="paid" />Pagado</span><small>Elegí un día para ver sus servicios.</small></div>
        <div className="calendar-day-heading"><h3>{dateLabel(selectedDay, { weekday: "long", day: "numeric", month: "long" })}</h3><button type="button" onClick={() => openEditor(null)} disabled={!enabled}>＋ Agendar</button></div>
        {dayEntries.length ? <ServiceAgenda rows={dayEntries} today={today} currency={currency} onEdit={openEditor} onPay={openPayment} /> : <p className="calendar-day-empty">Sin vencimientos para este día.</p>}
      </div>
    </dialog>

    <dialog className="service-dialog editor-dialog" ref={editorDialog} aria-labelledby="service-editor-title" onClose={() => setEditor(null)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="service-dialog-inner"><header className="service-dialog-header"><div><span className="eyebrow">Monto y fecha, a mano</span><h2 id="service-editor-title">{editor?.service ? "Editar servicio" : "Agendar servicio"}</h2></div><button type="button" className="dialog-close" aria-label="Cerrar formulario" onClick={() => editorDialog.current?.close()}>×</button></header>{editor && <ServiceEditor key={`${editor.id}-${editor.dueOn}`} editor={editor} categories={categories} methods={methods} preferredMethod={paymentMethods.find((method) => method.id === editor.service?.paymentMethodId)?.name ?? ""} onSaved={saved} />}</div>
    </dialog>
    <dialog className="service-dialog editor-dialog" ref={paymentDialog} aria-labelledby="service-payment-title" onClose={() => setPayment(null)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="service-dialog-inner"><header className="service-dialog-header"><div><span className="eyebrow">Registrar gasto personal</span><h2 id="service-payment-title">{payment?.name ?? "Pagar servicio"}</h2></div><button type="button" className="dialog-close" aria-label="Cerrar pago" onClick={() => paymentDialog.current?.close()}>×</button></header>{payment && <ServicePayment key={`${payment.id}-${payment.period}`} service={payment} methods={methods} preferredMethod={paymentMethods.find((method) => method.id === payment.paymentMethodId)?.name ?? ""} today={today} currency={currency} onSaved={saved} />}</div>
    </dialog>
  </section>;
}
