import { drizzle } from "drizzle-orm/neon-serverless";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

export const databaseReady = Boolean(connectionString);
if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws;
const pool = connectionString ? new Pool({ connectionString }) : null;
export const db = pool ? drizzle(pool, { schema }) : null;
