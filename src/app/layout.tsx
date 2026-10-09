import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import "./globals.css";
import { MobileQuickActions } from "@/components/mobile-quick-actions";

export const metadata: Metadata = {
  title: "Mi Caja — Personal y fábrica",
  description: "Una mirada clara a tus finanzas personales y a la caja del negocio.",
  applicationName: "Mi Caja",
  icons: { icon: { url: "/icon.svg", type: "image/svg+xml" }, apple: "/huracan-embroidered.jpg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#b71936",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}<Suspense fallback={null}><MobileQuickActions /></Suspense></body>
    </html>
  );
}
