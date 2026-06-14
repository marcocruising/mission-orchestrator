#!/usr/bin/env node
import "./load-env.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase/migrations");
const seedPath = join(root, "supabase/seed.sql");

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const password = process.env.DB_PASSWORD;
  const url = process.env.SUPABASE_URL;
  if (!password || !url) return null;

  const ref = new URL(url).hostname.split(".")[0];
  const host = process.env.DB_HOST ?? `db.${ref}.supabase.co`;
  return `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/postgres`;
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error(
    "Set DATABASE_URL (recommended) or DB_PASSWORD in .env\n" +
      "Get URI from Supabase Dashboard → Project Settings → Database → Connection string"
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected to Postgres");

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}...`);
    await client.query(sql);
  }

  console.log("Applying seed.sql...");
  await client.query(readFileSync(seedPath, "utf8"));

  console.log("Done — schema + seed applied.");
} catch (err) {
  console.error("Setup failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
