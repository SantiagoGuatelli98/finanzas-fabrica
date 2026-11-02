import Decimal from "decimal.js";
import Link from "next/link";

type MonthValues = {
  personalIncome: string;
  personalExpenses: string;
  businessCollected: string;
  businessExpenses: string;
  businessSold: string;
};

type MonthPoint = MonthValues & { month: string; label: string };

const series = [
  { key: "personalIncome", label: "Ingreso personal", short: "Personal · ingresos", color: "#287659", tone: "income" },
  { key: "personalExpenses", label: "Gasto personal", short: "Personal · gastos", color: "#c39a63", tone: "personal-expense" },
  { key: "businessCollected", label: "Cobrado en el negocio", short: "Fábrica · cobros", color: "#c11330", tone: "business-income" },
  { key: "businessSold", label: "Vendido en pedidos", short: "Fábrica · ventas", color: "#718092", tone: "business-sales" },
  { key: "businessExpenses", label: "Gastos del negocio", short: "Fábrica · gastos", color: "#766c65", tone: "business-expense" },
] as const;

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
}

function compact(value: number, currency: string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function changeText(currentValue: string, previousValue: string) {
  const current = new Decimal(currentValue);
  const previous = new Decimal(previousValue);
  if (previous.isZero()) return current.isZero() ? "Sin movimientos" : "Sin base el mes anterior";
  const difference = current.minus(previous);
  if (difference.isZero()) return "Igual al mes anterior";
  const percent = difference.abs().div(previous.abs()).times(100).toDecimalPlaces(0).toNumber();
  return `${difference.gt(0) ? "↑" : "↓"} ${percent}% vs. mes anterior`;
}

function monthTitle(month: string) {
  const date = new Date(`${month}-01T12:00:00-03:00`);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(date);
}

function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 7);
}

function ComparisonCard({ item, current, previous, currency, previousLabel }: {
  item: typeof series[number]; current: string; previous: string; currency: string; previousLabel: string;
}) {
  const rising = new Decimal(current).gt(previous);
  const falling = new Decimal(current).lt(previous);
  const isIncome = item.tone === "income" || item.tone === "business-income" || item.tone === "business-sales";
  const favorable = isIncome ? rising : falling;
  const unfavorable = isIncome ? falling : rising;
  return <article className={`analytics-stat ${item.tone}`}>
    <span className="analytics-stat-label"><i />{item.label}</span>
    <strong>{money(current, currency)}</strong>
    <div className="analytics-stat-foot"><span>{previousLabel}: {money(previous, currency)}</span><span className={favorable ? "change-positive" : unfavorable ? "change-negative" : "change-neutral"}>{changeText(current, previous)}</span></div>
  </article>;
}

function MonthlyChart({ points, currency }: { points: MonthPoint[]; currency: string }) {
  const width = 640;
  const height = 250;
  const left = 65;
  const right = 17;
  const top = 20;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...points.flatMap((point) => series.map(({ key }) => Number(point[key]))));
  const roundedMax = Math.pow(10, Math.ceil(Math.log10(maxValue)) - 1) * Math.ceil(maxValue / Math.pow(10, Math.ceil(Math.log10(maxValue)) - 1));
  const step = roundedMax / 4;
  const band = plotWidth / points.length;
  const barWidth = Math.min(13, band / 8);
  const gap = Math.min(5, band / 14);
  const groupWidth = barWidth * series.length + gap * (series.length - 1);

  return <div className="monthly-chart-scroll" role="region" aria-label="Gráfico mensual; desplazá horizontalmente para recorrerlo" tabIndex={0}>
    <svg className="monthly-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="monthly-chart-title monthly-chart-description">
      <title id="monthly-chart-title">Ingresos y gastos durante los últimos seis meses</title>
      <desc id="monthly-chart-description">Compara ingresos y gastos personales con cobros y gastos del negocio. Cada grupo de barras representa un mes.</desc>
      {[0, 1, 2, 3, 4].map((tick) => {
        const y = top + plotHeight - tick * plotHeight / 4;
        return <g key={tick}><line x1={left} x2={width - right} y1={y} y2={y} className="monthly-chart-gridline" /><text x={left - 9} y={y + 4} textAnchor="end" className="monthly-chart-axis">{compact(step * tick, currency)}</text></g>;
      })}
      {points.map((point, monthIndex) => {
        const center = left + monthIndex * band + band / 2;
        return <g key={point.month}>
          {series.map((item, seriesIndex) => {
            const value = Number(point[item.key]);
            const barHeight = value === 0 ? 0 : Math.max(2, value / roundedMax * plotHeight);
            const x = center - groupWidth / 2 + seriesIndex * (barWidth + gap);
            const y = top + plotHeight - barHeight;
            return <g key={item.key}><title>{`${point.label}: ${item.label}, ${money(value, currency)}`}</title><rect x={x} y={y} width={barWidth} height={barHeight} rx={3} fill={item.color} /></g>;
          })}
          <text x={center} y={height - 14} textAnchor="middle" className="monthly-chart-month">{point.label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

export function MonthlyAnalytics({ month, currentMonth, currency, points, previousTotals }: {
  month: string;
  currentMonth: string;
  currency: string;
  points: MonthPoint[];
  previousTotals: MonthValues;
}) {
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const isCurrentMonth = month >= currentMonth;
  const previousLabel = monthTitle(previous);
  const totals = points.find((point) => point.month === month) ?? previousTotals;
  const compactPrevious = new Intl.DateTimeFormat("es-AR", { month: "short" }).format(new Date(`${previous}-01T12:00:00-03:00`));

  return <section className="monthly-analytics" id="analiticas" aria-labelledby="analytics-heading">
    <div className="analytics-heading-row">
      <div><div className="eyebrow">Análisis mes a mes</div><h2 id="analytics-heading">Tu mes, en perspectiva.</h2><p>Ingresos, gastos y cobros para entender cómo viene tu plata.</p></div>
      <nav className="analytics-month-nav" aria-label="Elegir mes">
        <Link href={`/?mes=${previous}#analiticas`} aria-label={`Ver ${previousLabel}`} title={`Ver ${previousLabel}`}>‹</Link>
        <strong>{monthTitle(month)}</strong>
        {isCurrentMonth ? <span className="month-nav-disabled" aria-hidden="true">›</span> : <Link href={`/?mes=${next}#analiticas`} aria-label={`Ver ${monthTitle(next)}`} title={`Ver ${monthTitle(next)}`}>›</Link>}
        {month !== currentMonth && <Link className="month-nav-current" href="/#analiticas">Este mes</Link>}
      </nav>
    </div>

    <div className="analytics-comparison-grid">
      {series.map((item) => <ComparisonCard key={item.key} item={item} current={totals[item.key]} previous={previousTotals[item.key]} previousLabel={compactPrevious} currency={currency} />)}
    </div>

    <div className="analytics-chart-panel">
      <div className="analytics-chart-heading"><div><strong>El movimiento de los últimos 6 meses</strong><span>Comparación en la misma escala</span></div><span className="analytics-period-stamp">{month.slice(0, 4)}</span></div>
      <MonthlyChart points={points} currency={currency} />
      <div className="monthly-chart-legend">{series.map((item) => <span key={item.key}><i style={{ backgroundColor: item.color }} />{item.short}</span>)}</div>
    </div>
  </section>;
}
