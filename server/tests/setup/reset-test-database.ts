// Stage 19.1: runs ONCE before the whole suite (first step of `npm test`).
// Rebuilds the empty test database from the project's migrations, so every
// run starts from exactly the schema production would have -- and never
// from real data.
import "./preload";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { assertSafeTestDatabaseName, databaseNameOf, redactSecrets } from "./test-database";

const SERVER_DIR = path.resolve(__dirname, "../..");

async function resetTestDatabase(): Promise<void> {
  // preload.ts has already pointed DATABASE_URL at the test database; the
  // lock is checked again here because this is the step that DROPS it.
  const testUrl = process.env.DATABASE_URL!;
  const name = databaseNameOf(testUrl);
  assertSafeTestDatabaseName(name);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    // `name` passed the ^[a-z0-9_]+_test$ lock, so quoting it is safe.
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const migrate = spawnSync(
    process.execPath,
    [path.join(SERVER_DIR, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { cwd: SERVER_DIR, env: process.env, encoding: "utf8" }
  );
  if (migrate.status !== 0) {
    const output = redactSecrets(`${migrate.stdout ?? ""}${migrate.stderr ?? ""}`, testUrl);
    throw new Error(`prisma migrate deploy failed on the test database:\n${output}`);
  }
  console.log(`Test database "${name}" rebuilt from migrations.`);
}

resetTestDatabase().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(message, process.env.DATABASE_URL ?? "postgres://x@localhost/x"));
  process.exit(1);
});
