"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

function ActionIcon({ name }: { name: "back" | "top" | "refresh" }) {
  if (name === "back") return <path d="m14.5 18-6-6 6-6M9 12h11" />;
  if (name === "top") return <path d="m6 11 6-6 6 6M12 5v14" />;
  return <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 1-2-5l3 5" /></>;
}

export function MobileQuickActions() {
  const pathname = usePathname();
  const router = useRouter();
  const routeStack = useRef<string[]>([]);
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (pathname === "/login") {
      routeStack.current = [];
      return;
    }
    if (routeStack.current.at(-1) !== pathname) routeStack.current.push(pathname);
  }, [pathname]);

  if (pathname === "/login") return null;

  const canGoBack = pathname !== "/" || routeStack.current.length > 1;
  const hasTabs = ["/", "/personal", "/negocio", "/pedidos", "/configuracion"].includes(pathname);
  const fallback = pathname.startsWith("/pedidos/") ? "/pedidos" : "/#inicio";

  function goBack() {
    const stack = routeStack.current;
    if (stack.length > 1) {
      stack.pop();
      router.replace(stack.at(-1) ?? "/");
      return;
    }

    const referrer = document.referrer;
    if (referrer) {
      const previous = new URL(referrer);
      if (previous.origin === window.location.origin && previous.pathname !== pathname) {
        router.replace(`${previous.pathname}${previous.search}${previous.hash}`);
        return;
      }
    }
    router.replace(fallback);
  }

  return (
    <nav className="mobile-quick-nav" data-has-tabs={hasTabs} data-can-go-back={canGoBack} aria-label="Acciones de navegación">
      {canGoBack && <button type="button" onClick={goBack} aria-label="Volver a la sección anterior" title="Volver">
        <svg viewBox="0 0 24 24" aria-hidden="true"><ActionIcon name="back" /></svg><span>Volver</span>
      </button>}
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Subir al inicio de la página" title="Subir arriba">
        <svg viewBox="0 0 24 24" aria-hidden="true"><ActionIcon name="top" /></svg><span>Arriba</span>
      </button>
      <button type="button" onClick={() => startRefresh(() => router.refresh())} disabled={isRefreshing} aria-label="Actualizar datos" title="Actualizar">
        <svg className={isRefreshing ? "is-spinning" : ""} viewBox="0 0 24 24" aria-hidden="true"><ActionIcon name="refresh" /></svg><span>{isRefreshing ? "Actualizando…" : "Actualizar"}</span>
      </button>
    </nav>
  );
}
