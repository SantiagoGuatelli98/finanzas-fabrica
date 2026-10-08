import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDashboardData } from "@/lib/dashboard";
import { logout } from "@/app/login/actions";
import { createManualBusinessIncome } from "@/app/negocio/actions";
import { CrestPhoto } from "@/components/crest-photo";
import { GlobeMark, Icon, MobileNav, Sidebar } from "@/components/workspace-navigation";

function money(value: string | undefined, currency = "ARS") {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
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
      <Sidebar active="home" />
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
      <MobileNav active="home" />
    </div>
  );
}

function DashboardFallback() {
  return <div className="app" id="inicio"><Sidebar active="home" /><main className="main"><header className="topbar"><span>Mi espacio / Resumen</span></header><div className="content"><div className="page-head"><div><div className="eyebrow">Tu resumen financiero</div><h1>Buen día, Santiago.</h1><div className="page-subtitle">Cargando tus datos guardados…</div></div></div></div></main><MobileNav active="home" /></div>;
}

export default function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<DashboardFallback />}><DashboardContent searchParams={searchParams} /></Suspense>;
}
