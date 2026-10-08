"use client";

import { deleteUnpaidOrder } from "./actions";

export function DeleteOrderForm({ orderId }: { orderId: string }) {
  return <form action={deleteUnpaidOrder} onSubmit={(event) => {
    if (!window.confirm("¿Borrar este pedido? No se puede recuperar. Los pedidos con cobros no se pueden borrar.")) event.preventDefault();
  }}>
    <input type="hidden" name="orderId" value={orderId} />
    <button className="delete-order-button" type="submit">Borrar pedido</button>
  </form>;
}
