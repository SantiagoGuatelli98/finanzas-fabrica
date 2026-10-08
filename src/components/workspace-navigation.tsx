import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { CrestPhoto } from "@/components/crest-photo";

export type WorkspaceSection = "home" | "personal" | "business" | "orders" | "settings";

const sections: { label: string; href: string; icon: WorkspaceSection }[] = [
  { label: "Inicio", href: "/", icon: "home" },
  { label: "Personal", href: "/personal", icon: "personal" },
  { label: "Negocio", href: "/negocio", icon: "business" },
  { label: "Pedidos", href: "/pedidos", icon: "orders" },
  { label: "Configuración", href: "/configuracion", icon: "settings" },
];

export function GlobeMark({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden="true">
    <path d="M40 7c-17 0-28 12-28 28 0 17 12 27 28 33 16-6 28-16 28-33C68 19 57 7 40 7Z" stroke="currentColor" strokeWidth="2.5" />
    <path d="M26 25v22m28-22v22M26 36h28" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M32 64l3 8h10l3-8M35 72h10" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
  </svg>;
}

export function Icon({ name }: { name: WorkspaceSection | "calendar" | "trend" | "wallet" }) {
  const paths: Record<string, ReactNode> = {
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />,
    personal: <><circle cx="12" cy="8" r="3.2" /><path d="M5 21v-1.4a7 7 0 0 1 14 0V21" /></>,
    business: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    orders: <><path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M8 12h8M8 16h6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0 1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V4a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    trend: <><path d="M3 17 9 11l4 4 8-9" /><path d="M15 6h6v6" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 8h15a3 3 0 0 1 3 3v1h-5a2 2 0 0 0 0 4h5" /><path d="M17 14h.01" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function Sidebar({ active }: { active: WorkspaceSection }) {
  return <aside className="sidebar">
    <a className="brand" href="/">
      <span className="brand-mark"><GlobeMark /></span>
      <span><span className="brand-name">Mi Caja</span><span className="brand-caption">Santiago · Huracán</span></span>
    </a>
    <div className="nav-label">Espacio de trabajo</div>
    <nav className="nav-list" aria-label="Navegación principal">
      {sections.map((section) => <a className={`nav-link ${active === section.icon ? "active" : ""}`} href={section.href} key={section.href} aria-current={active === section.icon ? "page" : undefined}>
        <span className="nav-icon"><Icon name={section.icon} /></span>{section.label}
      </a>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="club-note"><CrestPhoto className="sidebar-crest" /><span>El Globo en tu día a día.<br />Parque Patricios, siempre.</span></div>
      <form action={logout} className="logout-form"><button type="submit">Cerrar sesión <span aria-hidden="true">↗</span></button></form>
    </div>
  </aside>;
}

export function MobileNav({ active }: { active: WorkspaceSection }) {
  return <nav className="mobile-nav" aria-label="Navegación móvil">
    {sections.map((section) => <a className={active === section.icon ? "active" : ""} href={section.href} key={section.href} aria-current={active === section.icon ? "page" : undefined}>
      <Icon name={section.icon} /><span>{section.icon === "settings" ? "Más" : section.label}</span>
    </a>)}
  </nav>;
}

export function WorkspaceFrame({ active, children }: { active: WorkspaceSection; children: ReactNode }) {
  return <div className="app workspace-frame"><Sidebar active={active} /><main className="main section-main">{children}</main><MobileNav active={active} /></div>;
}
