import type { ReactNode } from "react";
import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDashboardData } from "@/lib/dashboard";
import { logout } from "@/app/login/actions";
import { createManualBusinessIncome } from "@/app/negocio/actions";
import { CrestPhoto } from "@/components/crest-photo";

function money(value: string | undefined, currency = "ARS") {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function GlobeMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="M40 7c-17 0-28 12-28 28 0 17 12 27 28 33 16-6 28-16 28-33C68 19 57 7 40 7Z" stroke="currentColor" strokeWidth="2.5" />
      <path d="M26 25v22m28-22v22M26 36h28" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M32 64l3 8h10l3-8M35 72h10" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" /></>,
    person: <><circle cx="12" cy="8" r="3.2" /><path d="M5 21v-1.4a7 7 0 0 1 14 0V21" /></>,
    business: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    orders: <><path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M8 12h8M8 16h6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V4a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    trend: <><path d="M3 17 9 11l4 4 8-9" /><path d="M15 6h6v6" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 8h15a3 3 0 0 1 3 3v1h-5a2 2 0 0 0 0 4h5" /><path d="M17 14h.01" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Sidebar() {
  const nav = [
    ["Inicio", "#inicio", "home"],
    ["Personal", "/personal", "person"],
    ["Negocio", "/negocio", "business"],
    ["Pedidos", "/pedidos", "orders"],
    ["Configuración", "/configuracion", "settings"],
  ];
  return (
    <aside className="sidebar">
      <a className="brand" href="#inicio">
        <span className="brand-mark"><GlobeMark /></span>
        <span><span className="brand-name">Mi Caja</span><span className="brand-caption">Santiago · Huracán</span></span>
      </a>
      <div className="nav-label">Espacio de trabajo</div>
      <nav className="nav-list" aria-label="Navegación principal">
        {nav.map(([label, href, icon], index) => <a className={`nav-link ${index === 0 ? "active" : ""}`} href={href} key={label}>
          <span className="nav-icon"><Icon name={icon} /></span>{label}
        </a>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="club-note"><CrestPhoto className="sidebar-crest" /><span>El Globo en tu día a día.<br />Parque Patricios, siempre.</span></div>
        <form action={logout} className="logout-form"><button type="submit">Cerrar sesión <span aria-hidden="true">↗</span></button></form>
      </div>
    </aside>
  );
}

function MobileNav() {
  const nav = [["Inicio", "#inicio", "home"], ["Personal", "/personal", "person"], ["Negocio", "/negocio", "business"], ["Pedidos", "/pedidos", "orders"], ["Más", "/configuracion", "settings"]];
  return <nav className="mobile-nav" aria-label="Navegación móvil">{nav.map(([label, href, icon]) => <a href={href} key={label}><Icon name={icon} /><span>{label}</span></a>)}</nav>;
}

function Metric({ title, value, foot, kind = "" }: { title: string; value: string; foot: string; kind?: string }) {
  return <article className={`metric-card ${kind}`}><div className="metric-top"><span>{title}</span><i className="metric-mark" /></div><div className="metric-number">{value}</div><div className="metric-foot">{foot}</div></article>;
}

function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function DashboardContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const [data, params] = await Promise.all([getDashboardData(), searchParams]);
  const today = new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const month = data.configured && !("error" in data)
    ? data.monthLabel.charAt(0).toUpperCase() + data.monthLabel.slice(1)
    : new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const isConnected = data.configured && !("error" in data);
  const currency = isConnected ? data.currency : "ARS";

  return (
    <div className="app" id="inicio">
      <Sidebar />
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb"><strong>Mi espacio</strong><span> / </span>Resumen</div>
          <a className="mobile-brand" href="#inicio"><span className="brand-mark"><GlobeMark /></span>Mi Caja</a>
          <div className="top-meta"><span className="top-today">{today}</span><span className="month-pill">{month}</span><form action={logout} className="top-logout"><button type="submit" aria-label="Cerrar sesión">Salir</button></form><span className="avatar" aria-label="Espacio personal">S</span></div>
        </header>
        <div className="content">
          <div className="page-head">
            <div><div className="eyebrow">Tu resumen financiero</div><h1>Buen día, Santiago.</h1><div className="page-subtitle">Lo importante de tu plata y tu fábrica, de un vistazo.</div></div>
            <div className="page-head-aside"><CrestPhoto className="page-crest" /><div className="date-chip"><Icon name="calendar" /> {today}</div></div>
          </div>

          {!isConnected && <div className="connection-alert" role="status"><span>◌</span><div><strong>{"error" in data ? "No pudimos leer la base de datos" : "Falta conectar Neon"}</strong>{"error" in data ? "Revisá DATABASE_URL y que la migración esté aplicada. No mostramos datos de ejemplo." : <>Copiá <code>.env.example</code> a <code>.env.local</code>, agregá tu cadena de conexión y aplicá las migraciones. La app no usa datos de muestra.</>}</div></div>}

          <nav className="quick-actions" aria-label="Acciones rápidas">
            <a href="/personal?tipo=gasto#nuevo-movimiento"><span>−</span> Gasto personal</a>
            <a href="/personal?tipo=ingreso#nuevo-movimiento"><span>＋</span> Ingreso personal</a>
            <a href="/personal#deudas"><span>↘</span> Pago de deuda</a>
            <a href="/pedidos#nuevo-pedido"><span>＋</span> Nuevo pedido</a>
            <a href="/pedidos#cuentas-por-cobrar"><span>↗</span> Registrar cobro</a>
            <a href="/negocio#nuevo-gasto"><span>−</span> Gasto del negocio</a>
            <details className="quick-cash">
              <summary><span>$</span> Cobro rápido</summary>
              <form action={createManualBusinessIncome} className="quick-cash-form">
                <input type="hidden" name="id" value={randomUUID()} />
                <input type="hidden" name="returnTo" value="/" />
                <input type="hidden" name="category" value="Venta rápida" />
                <strong>Cobro directo a caja</strong>
                <p>No hace falta registrar al cliente ni crear un pedido.</p>
                <label>Monto<input name="amount" inputMode="decimal" placeholder="0,00" required /></label>
                <label>Qué vendiste<input name="description" placeholder="Ej. 3 docenas de tubos" maxLength={240} required /></label>
                <label>Fecha<input name="occurredOn" type="date" defaultValue={todayLocal()} required /></label>
                <label>Cómo cobraste<input name="paymentMethod" placeholder="Efectivo, transferencia…" maxLength={80} /></label>
                <input type="hidden" name="note" value="" />
                <button className="primary-button" type="submit" disabled={!isConnected}>Guardar cobro <span>→</span></button>
              </form>
            </details>
          </nav>
          {params.ingreso === "guardado" && <div className="notice success" role="status">Cobro rápido registrado y sumado a la caja del negocio.</div>}

          <section className="overview-grid" aria-label="Resumen del negocio">
            <article className="cash-card">
              <div className="cash-label">Dinero disponible · negocio</div>
              <div className="cash-number">{money(isConnected ? data.businessCash : undefined, currency)}</div>
              <div className="cash-caption">Saldo calculado con los movimientos registrados</div>
              <GlobeMark className="cash-globe" />
              <div className="cash-footer"><span>En caja del negocio</span><strong>{isConnected ? "Según movimientos guardados" : "Esperando conexión"}</strong></div>
            </article>
            <article className="sold-card">
              <div className="card-heading"><div className="card-title">COBRADO ESTE MES</div><span className="card-icon"><Icon name="trend" /></span></div>
              <div className="sold-main"><span className="sold-number">{money(isConnected ? data.businessCollected : undefined, currency)}</span></div>
              <div className="sold-breakdown"><div><div className="micro-label">Vendido este mes</div><div className="micro-value">{money(isConnected ? data.businessSold : undefined, currency)}</div></div><div><div className="micro-label">Pendiente de cobro</div><div className="micro-value">{money(isConnected ? data.receivable : undefined, currency)}</div></div></div>
            </article>
          </section>

          <section id="personal">
            <div className="section-title-row"><h2 className="section-title">Tu plata personal</h2><span className="section-subtitle">Ingresos y gastos del mes</span></div>
            <div className="personal-grid">
              <Metric title="Ingresos" value={money(isConnected ? data.personalIncome : undefined, currency)} foot="Registrados este mes" kind="income" />
              <Metric title="Gastos" value={money(isConnected ? data.personalExpenses : undefined, currency)} foot="Registrados este mes" kind="expense" />
              <Metric title="Balance del mes" value={money(isConnected ? data.personalBalance : undefined, currency)} foot="Ingresos menos gastos" />
              <Metric title="Deuda pendiente" value={money(isConnected ? data.outstandingDebt : undefined, currency)} foot="Saldo de deudas activas" kind="debt" />
              <Metric title="Pagado de deuda" value={money(isConnected ? data.debtPaidMonth : undefined, currency)} foot="Durante este mes" kind="income" />
              <Metric title="Deuda cancelada" value={isConnected ? `${data.debtCancellationPercent}%` : "—"} foot="Progreso total" />
              <Metric title="Fondo de emergencia" value={money(isConnected ? data.emergencyFund : undefined, currency)} foot={isConnected ? `Objetivo ${money(data.emergencyFundTarget, currency)}` : "Saldo registrado"} />
            </div>
            {isConnected && <p className="empty-inline">Los totales aparecerán acá a medida que registres movimientos.</p>}
          </section>

          <section id="negocio">
            <div className="section-title-row"><h2 className="section-title">La fábrica</h2><span className="section-subtitle">Separado de tus finanzas personales</span></div>
            <div className="business-strip">
              <div className="business-item"><span className="business-label">Cobrado este mes</span><strong className="business-value">{money(isConnected ? data.businessCollected : undefined, currency)}</strong></div>
              <div className="business-item"><span className="business-label">Gastos del mes</span><strong className="business-value">{money(isConnected ? data.businessExpenses : undefined, currency)}</strong></div>
              <div className="business-item"><span className="business-label">Pendiente de cobro</span><strong className="business-value pending">{money(isConnected ? data.receivable : undefined, currency)}</strong></div>
              <div className="business-item"><span className="business-label">Deuda a proveedores</span><strong className="business-value pending">{money(isConnected ? data.supplierDebtTotal : undefined, currency)}</strong></div>
              <div className="business-item"><span className="business-label">Caja disponible</span><strong className="business-value">{money(isConnected ? data.businessCash : undefined, currency)}</strong></div>
            </div>
          </section>

          <section id="pedidos">
            <div className="section-title-row"><h2 className="section-title">Pedidos y cobros</h2><span className="section-subtitle">Vendido no significa cobrado</span></div>
            <div className="orders-row">
              <article className="info-card"><div><div className="info-label">Pedidos en curso</div><div className="info-value">{isConnected ? data.pendingOrders : "—"}</div></div><div className="info-detail">{isConnected ? `De ${data.orderCount} pedidos no cancelados` : "Se actualiza al conectar Neon"}</div></article>
              <article className="info-card"><div><div className="info-label">Entregados sin cobrar</div><div className="info-value">{money(isConnected ? data.deliveredReceivable : undefined, currency)}</div></div><div className="info-detail">Saldo pendiente<br />de pedidos entregados</div></article>
              <article className="info-card"><div><div className="info-label">Por cobrar a clientes</div><div className="info-value">{money(isConnected ? data.receivable : undefined, currency)}</div></div><div className="info-detail">Solo los cobros reales<br />aumentan la caja</div></article>
            </div>
          </section>

          <section id="configuracion">
            <div className="section-title-row"><h2 className="section-title">Configuración</h2><span className="section-subtitle">Tu espacio, a tu manera</span></div>
            <div className="info-card"><div><div className="info-label">Estado de persistencia</div><div className="info-value">{isConnected ? "Neon conectado" : "Pendiente de conectar Neon"}</div></div><div className="info-detail">Los datos financieros se guardan<br />en PostgreSQL, no en el navegador.</div></div>
          </section>
          <footer className="footer">Mi Caja · Finanzas personales y fábrica · {currency}</footer>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}

function DashboardFallback() {
  return <div className="app" id="inicio"><Sidebar /><main className="main"><header className="topbar"><span>Mi espacio / Resumen</span></header><div className="content"><div className="page-head"><div><div className="eyebrow">Tu resumen financiero</div><h1>Buen día, Santiago.</h1><div className="page-subtitle">Cargando tus datos guardados…</div></div></div></div></main><MobileNav /></div>;
}

export default function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<DashboardFallback />}><DashboardContent searchParams={searchParams} /></Suspense>;
}
