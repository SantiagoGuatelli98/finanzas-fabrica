import Decimal from "decimal.js";

export function formatUnitLabel(unit: string, quantity: Decimal.Value = 1) {
  const trimmed = unit.trim();
  const normalized = trimmed.toLocaleLowerCase("es-AR");
  const amount = new Decimal(quantity);
  if (/^\d+\s/.test(trimmed)) return trimmed;
  const aliases: Record<string, string> = {
    doc: "docena", "doc.": "docena", docena: "docena", docenas: "docena",
    unid: "unidad", ud: "unidad", uds: "unidad", unidad: "unidad", unidades: "unidad",
  };
  const singular = aliases[normalized] ?? trimmed;
  if (["kg", "g", "gr", "ml", "l", "cm", "m", "%"].includes(normalized)) return trimmed;
  if (amount.equals(1)) {
    if (aliases[normalized]) return singular;
    if (normalized.endsWith("es")) return trimmed.slice(0, -2);
    if (normalized.endsWith("s")) return trimmed.slice(0, -1);
    return singular;
  }
  if (aliases[normalized]) return `${singular}s`;
  if (normalized.endsWith("s")) return trimmed;
  if (normalized.endsWith("z")) return `${trimmed.slice(0, -1)}ces`;
  return `${trimmed}s`;
}
