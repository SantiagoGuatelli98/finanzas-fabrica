"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SubmitButton } from "./submit-button";
import { registerMultipleOrderPayments } from "./actions";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function BulkOrderPaymentForm({ paymentMethods, today, currency }: { paymentMethods: string[]; today: string; currency: string }) {
  const idsField = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState({ ids: [] as string[], amount: 0 });

  useEffect(() => {
    const update = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && !target.matches("[data-bulk-order]")) return;
      const checked = Array.from(document.querySelectorAll<HTMLInputElement>("[data-bulk-order]:checked"));
      setSelection({
        ids: checked.map((input) => input.value),
        amount: checked.reduce((sum, input) => sum + Number(input.dataset.outstanding ?? 0), 0),
      });
    };
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);

  function prepareSubmit(event: FormEvent<HTMLFormElement>) {
    const checked = Array.from(document.querySelectorAll<HTMLInputElement>("[data-bulk-order]:checked"));
    if (!checked.length || !idsField.current) {
      event.preventDefault();
      return;
    }
    idsField.current.value = JSON.stringify(checked.map((input) => input.value));
  }

  if (!selection.ids.length) return <p className="bulk-payment-hint">Marcá los pedidos que te pagaron juntos. Se cobra el saldo completo de cada uno y quedan entregados.</p>;

  return <form action={registerMultipleOrderPayments} className="bulk-payment-bar" onSubmit={prepareSubmit}>
    <input ref={idsField} type="hidden" name="orderIds" />
    <div className="bulk-payment-summary"><strong>{selection.ids.length} {selection.ids.length === 1 ? "pedido seleccionado" : "pedidos seleccionados"}</strong><span>Total a registrar: {formatMoney(selection.amount, currency)}</span></div>
    <label>Fecha<input type="date" name="receivedOn" defaultValue={today} required /></label>
    <label>Medio de pago<select name="paymentMethod" defaultValue={paymentMethods[0]} required>{paymentMethods.map((method) => <option value={method} key={method}>{method}</option>)}</select></label>
    <label className="bulk-payment-note">Nota<input name="note" placeholder="Opcional" maxLength={500} /></label>
    <SubmitButton className="primary-button">Cobrar y entregar →</SubmitButton>
  </form>;
}
