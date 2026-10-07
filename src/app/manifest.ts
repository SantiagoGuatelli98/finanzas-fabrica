import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Caja",
    short_name: "Mi Caja",
    description: "Finanzas personales y de la fábrica, en un solo lugar.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f2",
    theme_color: "#b71936",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
