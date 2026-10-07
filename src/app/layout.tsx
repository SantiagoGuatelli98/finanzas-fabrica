import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mi Caja — Personal y fábrica",
  description: "Una mirada clara a tus finanzas personales y a la caja del negocio.",
  applicationName: "Mi Caja",
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
      <body>{children}</body>
    </html>
  );
}
