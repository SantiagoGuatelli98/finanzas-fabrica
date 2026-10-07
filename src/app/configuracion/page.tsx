import { connection } from "next/server";
import { Suspense } from "react";
import { createCategory, createPaymentMethod, saveSettings, updateCategory, updatePaymentMethod } from "./actions";
import { getConfigurationData } from "@/lib/settings";

async function SettingsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const [data, params] = await Promise.all([getConfigurationData(), searchParams]);
  const ready = data.configured && !("error" in data);
  const message = params.error ? "No se pudo guardar. Revisá los datos y la conexión." : params.guardado ? "Configuración guardada." : params.categoria ? "Categoría actualizada." : params.medio ? "Medio de pago guardado." : "";
  const settings = ready ? data.settings : null;
  return <div className="module-page settings-page">
    <header className="module-head"><a className="back-link" href="/#inicio">← Volver al resumen</a><div className="eyebrow">Tu espacio</div><h1>Configuración.</h1><p>Los datos del negocio y las listas se pueden cambiar desde acá. El historial mantiene su referencia original.</p></header>
    {!ready && <div className="connection-alert"><span>◌</span><div><strong>{"error" in data ? "No se pudo leer Neon" : "Conectá Neon para empezar"}</strong> La configuración se guarda en PostgreSQL.</div></div>}
    {message && <div className={`notice ${params.error ? "error" : "success"}`} role="status">{message}</div>}
    <section className="panel settings-main-panel"><div className="panel-heading"><div><span className="eyebrow">Identidad y objetivos</span><h2>Datos del espacio</h2></div><span className="panel-index">01</span></div>
      <form action={saveSettings} className="form-grid settings-form">
        <label>Nombre del negocio<input name="businessName" defaultValue={settings?.businessName ?? ""} placeholder="Como querés que aparezca en el pedido" maxLength={160} /></label>
        <label>Teléfono comercial<input name="businessPhone" defaultValue={settings?.businessPhone ?? ""} placeholder="Teléfono o WhatsApp" maxLength={80} /></label>
        <label className="form-wide">Dirección comercial<input name="businessAddress" defaultValue={settings?.businessAddress ?? ""} placeholder="Opcional" maxLength={240} /></label>
        <label className="form-wide">URL del logo<input name="businessLogoUrl" type="url" defaultValue={settings?.businessLogoUrl ?? ""} placeholder="https://…" maxLength={500} /></label>
        <label>Moneda<select name="currency" defaultValue={settings?.currency ?? "ARS"}><option value="ARS">ARS — Peso argentino</option><option value="USD">USD — Dólar estadounidense</option><option value="EUR">EUR — Euro</option></select></label>
        <label>Fecha objetivo para cancelar deudas<input name="debtTargetDate" type="date" defaultValue={settings?.debtTargetDate ?? ""} /></label>
        <label className="form-wide">Objetivo del fondo de emergencia<input name="emergencyFundTarget" inputMode="decimal" defaultValue={settings?.emergencyFundTarget ?? "0"} placeholder="0,00" /></label>
        <button className="primary-button" type="submit" disabled={!ready}>Guardar configuración <span>→</span></button>
      </form>
      <p className="module-footnote">El logo se carga desde una URL pública. No cargues imágenes privadas ni enlaces con tokens de acceso.</p>
    </section>

    <section className="settings-lists">
      {(["personal", "business"] as const).map((scope) => <div className="panel" key={scope}><div className="panel-heading"><div><span className="eyebrow">Lista editable</span><h2>{scope === "personal" ? "Categorías personales" : "Categorías del negocio"}</h2></div><span className="panel-count">{ready ? data.categories.filter((item) => item.scope === scope).length : 0}</span></div>
        <form action={createCategory} className="add-list-form"><input type="hidden" name="scope" value={scope} /><label><span className="sr-only">Nueva categoría</span><input name="name" placeholder="Nombre de la categoría" maxLength={80} required /></label><button className="small-button" type="submit" disabled={!ready}>Agregar</button></form>
        {!ready || !data.categories.some((item) => item.scope === scope) ? <p className="empty-state">No hay categorías todavía. Podés crear las tuyas.</p> : <div className="simple-edit-list">{data.categories.filter((item) => item.scope === scope).map((category) => <form action={updateCategory} className="simple-edit-row" key={category.id}><input type="hidden" name="id" value={category.id} /><input name="name" aria-label={`Nombre de la categoría ${category.name}`} defaultValue={category.name} maxLength={80} required /><select name="active" aria-label={`Estado de ${category.name}`} defaultValue={String(category.active)}><option value="true">Activa</option><option value="false">Inactiva</option></select><button type="submit" className="save-list-button" disabled={!ready}>Guardar</button></form>)}</div>}
      </div>)}
    </section>

    <section className="panel payment-methods-panel"><div className="panel-heading"><div><span className="eyebrow">Para movimientos y cobranzas</span><h2>Medios de pago</h2></div><span className="panel-count">{ready ? data.paymentMethods.length : 0}</span></div>
      <form action={createPaymentMethod} className="add-list-form"><label><span className="sr-only">Nuevo medio de pago</span><input name="name" placeholder="Ej. Efectivo, transferencia, Visa" maxLength={80} required /></label><button className="small-button" type="submit" disabled={!ready}>Agregar</button></form>
      {!ready || data.paymentMethods.length === 0 ? <p className="empty-state">No hay medios de pago todavía.</p> : <div className="simple-edit-list">{data.paymentMethods.map((method) => <form action={updatePaymentMethod} className="simple-edit-row" key={method.id}><input type="hidden" name="id" value={method.id} /><input name="name" aria-label={`Nombre del medio ${method.name}`} defaultValue={method.name} maxLength={80} required /><select name="active" aria-label={`Estado de ${method.name}`} defaultValue={String(method.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select><button type="submit" className="save-list-button" disabled={!ready}>Guardar</button></form>)}</div>}
    </section>
    <p className="module-footnote">No hay borrado físico de listas que ya se usaron en movimientos. Al desactivarlas, dejan de aparecer para operaciones nuevas y permanecen en el historial.</p>
  </div>;
}

export default function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<main className="module-page">Cargando configuración…</main>}><SettingsContent searchParams={searchParams} /></Suspense>;
}
