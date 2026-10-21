"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function OrderComposer({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const openFromLink = () => {
      if (window.location.hash === "#nuevo-pedido" && panel.current) panel.current.open = true;
    };
    openFromLink();
    window.addEventListener("hashchange", openFromLink);
    return () => window.removeEventListener("hashchange", openFromLink);
  }, []);

  return <details ref={panel} className="panel new-order-panel" id="nuevo-pedido">
    <summary className="order-composer-heading"><span><span className="eyebrow">Venta nueva</span><strong>Crear pedido</strong></span><span className="composer-toggle" aria-hidden="true">＋</span></summary>
    <div className="order-composer-body">{children}</div>
  </details>;
}
