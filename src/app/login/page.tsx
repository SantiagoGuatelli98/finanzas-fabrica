import { Suspense } from "react";
import { connection } from "next/server";
import { authConfigured } from "@/lib/auth-token";
import { login } from "./actions";
import { CrestPhoto } from "@/components/crest-photo";

async function LoginContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const params = await searchParams;
  const configured = authConfigured();
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  return <main className="login-page">
    <div className="login-shell">
      <section className="login-identity" aria-label="Mi Caja">
        <div className="login-identity-top"><CrestPhoto className="login-brand-crest" /><span>MI CAJA <b>·</b> SANTIAGO</span></div>
        <div className="login-identity-copy"><div className="login-kicker">PERSONAL + FÁBRICA</div><h1>Tu día,<br /> <em>en orden.</em></h1><p>Ingresos, gastos y pedidos en un solo lugar. Simple de abrir, rápido de usar.</p></div>
        <div className="login-identity-foot"><span>♦ PARQUE PATRICIOS</span><span>ROJO Y BLANCO, TODOS LOS DÍAS</span></div>
      </section>
      <section className="login-panel">
        <div className="login-panel-inner"><CrestPhoto className="login-crest" /><span className="login-overline">Acceso personal</span><h2>Bienvenido, Santiago.</h2><p className="login-intro">Entrá para ver tus números y registrar movimientos.</p>
          {params.error && <p className="login-error" role="alert">Correo o contraseña incorrectos.</p>}
          {!configured && <p className="login-error" role="alert">Falta configurar el acceso en el servidor.</p>}
          <form action={login} className="login-form">
            <input type="hidden" name="next" value={next} />
            <label>Correo electrónico<input name="email" type="email" autoComplete="username" autoCapitalize="off" spellCheck={false} placeholder="tu correo" required /></label>
            <label>Contraseña<input name="password" type="password" autoComplete="current-password" placeholder="Tu contraseña" required /></label>
            <label className="remember-row"><input type="checkbox" name="remember" defaultChecked /><span>Recordarme en este dispositivo por 30 días</span></label>
            <button type="submit" disabled={!configured}>Entrar a Mi Caja <span aria-hidden="true">→</span></button>
          </form>
          <p className="login-help">También podés guardar la contraseña en tu navegador.</p>
        </div>
      </section>
    </div>
  </main>;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<main className="login-page" />}><LoginContent searchParams={searchParams} /></Suspense>;
}
