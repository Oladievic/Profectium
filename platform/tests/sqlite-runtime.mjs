/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["lib/server/sqlite.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { SQLiteDatabase } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const temporary = await mkdtemp(path.join(os.tmpdir(), "profectium-sqlite-"));
let database;

try {
  const file = path.join(temporary, "data", "test.sqlite");
  database = new SQLiteDatabase(file, path.resolve("drizzle"));
  const initialMigrationCount = await database.prepare("SELECT count(*) AS count FROM profectium_migrations").first("count");
  assert.ok(initialMigrationCount >= 4);
  await database.exec("CREATE TABLE adapter_test(id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE, data TEXT)");
  const statement = database.prepare("INSERT INTO adapter_test(value,data) VALUES(?,?)");
  const first = await statement.bind("first", JSON.stringify({ score: 42 })).run();
  assert.equal(first.meta.changes, 1);
  assert.equal(first.meta.last_row_id, 1);
  assert.equal(await database.prepare("SELECT json_extract(data,'$.score') AS score FROM adapter_test WHERE id=?").bind(1).first("score"), 42);
  assert.equal(await database.prepare("SELECT * FROM adapter_test WHERE id=?").bind(999).first(), null);
  assert.equal((await database.prepare("SELECT * FROM adapter_test").all()).meta.changes, 0);
  await assert.rejects(database.prepare("SELECT value FROM adapter_test").first("missing"), /D1_COLUMN_NOTFOUND/);

  const returned = await database.prepare("INSERT INTO adapter_test(value) VALUES(?) RETURNING id,value").bind("returning").all();
  assert.equal(returned.meta.changes, 1);
  assert.equal(returned.results[0].value, "returning");
  assert.deepEqual(await database.prepare("SELECT id,value FROM adapter_test WHERE id=999").raw({ columnNames: true }), [["id", "value"]]);
  assert.deepEqual(await database.prepare("SELECT 3 AS duplicate,4 AS duplicate").raw(), [[3, 4]]);

  await assert.rejects(database.batch([
    statement.bind("rolled-back", "{}"),
    statement.bind("first", "{}"),
  ]), /UNIQUE/);
  assert.equal(await database.prepare("SELECT id FROM adapter_test WHERE value='rolled-back'").first(), null);
  const batches = await Promise.all(Array.from({ length: 20 }, (_, index) => database.batch([
    statement.bind("concurrent-" + index, "{}"),
    database.prepare("SELECT count(*) AS count FROM adapter_test"),
  ])));
  assert.equal(batches.length, 20);
  assert.equal(await database.prepare("SELECT count(*) AS count FROM adapter_test").first("count"), 22);
  database.close();
  database = new SQLiteDatabase(file, path.resolve("drizzle"));
  assert.equal(await database.prepare("SELECT count(*) AS count FROM adapter_test").first("count"), 22);
  assert.equal(await database.prepare("SELECT count(*) AS count FROM profectium_migrations").first("count"), initialMigrationCount);
  database.close();
  database = null;

  const migrations = path.join(temporary, "broken-migrations");
  await mkdir(migrations);
  await writeFile(path.join(migrations, "0000.sql"), "CREATE TABLE first_table(id INTEGER);");
  await writeFile(path.join(migrations, "0001.sql"), "INVALID SQL;");
  const brokenFile = path.join(temporary, "broken.sqlite");
  assert.throws(() => new SQLiteDatabase(brokenFile, migrations), /syntax/);
  await writeFile(path.join(migrations, "0001.sql"), "CREATE TABLE second_table(id INTEGER);");
  database = new SQLiteDatabase(brokenFile, migrations);
  assert.equal(await database.prepare("SELECT count(*) AS count FROM profectium_migrations").first("count"), 2);
  console.log("PASS SQLite runtime: migrations, persistence, JSON, D1 result contract, raw columns, returning, rollback, concurrent batches.");
} finally {
  database?.close();
  await rm(temporary, { recursive: true, force: true });
}
