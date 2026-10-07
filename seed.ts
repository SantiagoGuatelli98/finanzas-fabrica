import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./src/lib/db/schema";

dotenv.config({ path: ".env.local" });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no está configurada en .env.local o .env.");

const db = drizzle(neon(connectionString), { schema });

await db.insert(schema.appSettings).values({ id: 1, businessName: "", currency: "ARS" }).onConflictDoNothing();

await db.insert(schema.products).values([
  { name: "Tapas comunes", unit: "docena", price: "0.00", description: "" },
  { name: "Tapas rotiseras", unit: "docena", price: "0.00", description: "" },
  { name: "Pascualinas", unit: "unidad", price: "0.00", description: "" },
]).onConflictDoNothing();

await db.insert(schema.categories).values([
  ...["Alimentos", "Comidas afuera", "Servicios", "Impuestos", "Vivienda", "Transporte", "Combustible", "Salud", "Tarjetas de crédito", "Entretenimiento", "Compras", "Mascotas", "Otros"].map((name) => ({ scope: "personal" as const, name })),
  ...["Materia prima", "Proveedores", "Servicios", "Impuestos", "Mantenimiento", "Combustible", "Logística", "Otros"].map((name) => ({ scope: "business" as const, name })),
]).onConflictDoNothing();

console.info("Listas iniciales creadas si no existían. Los precios de productos quedaron en 0 hasta cargarlos en Negocio.");
