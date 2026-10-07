import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    throw new Error("Falta DATABASE_URL para aplicar las migraciones de producción.");
  }
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["run", "db:migrate"], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
