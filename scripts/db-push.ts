// Applies supabase/migrations/*.sql in order, tracking applied files in a
// migrations table. Connects with the database password from .env.local.
// Tries the direct host first, then the regional session poolers.
import { Client } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const PROJECT_REF = "okfemqdtvpuzngwscpvt";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("SUPABASE_DB_PASSWORD missing from .env.local");
  process.exit(1);
}

const REGIONS = [
  "ap-south-1",
  "ap-southeast-1",
  "me-central-1",
  "eu-central-1",
  "us-east-1",
  "eu-west-1",
  "eu-west-2",
  "us-west-1",
  "ap-northeast-1",
  "ap-southeast-2",
];

type Candidate = { label: string; host: string; port: number; user: string };

const candidates: Candidate[] = [
  { label: "direct", host: `db.${PROJECT_REF}.supabase.co`, port: 5432, user: "postgres" },
  ...REGIONS.map((r) => ({
    label: `pooler ${r}`,
    host: `aws-0-${r}.pooler.supabase.com`,
    port: 5432,
    user: `postgres.${PROJECT_REF}`,
  })),
  ...REGIONS.map((r) => ({
    label: `pooler-1 ${r}`,
    host: `aws-1-${r}.pooler.supabase.com`,
    port: 5432,
    user: `postgres.${PROJECT_REF}`,
  })),
];

async function connect(): Promise<Client> {
  for (const c of candidates) {
    const client = new Client({
      host: c.host,
      port: c.port,
      user: c.user,
      password: PASSWORD,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      console.log(`Connected via ${c.label} (${c.host})`);
      return client;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${c.label}: ${msg.slice(0, 90)}`);
      try {
        await client.end();
      } catch {
        // already closed
      }
    }
  }
  throw new Error("Could not connect to the database by any route");
}

async function main() {
  const client = await connect();
  try {
    await client.query(`
      create table if not exists _app_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    const applied = new Set(
      (await client.query("select name from _app_migrations")).rows.map((r) => r.name)
    );
    const dir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip    ${file}`);
        continue;
      }
      const sql = readFileSync(join(dir, file), "utf8");
      console.log(`apply   ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _app_migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
    console.log("Done.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
