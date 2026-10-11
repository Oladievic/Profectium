/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

function input(value: unknown): SQLInputValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("Unsupported SQLite parameter; use a string, number, binary value or null.");
}

/** The D1 contract is retained so the same API handlers run on Workers and Node. */
class SQLiteStatement implements D1PreparedStatement {
  constructor(
    readonly database: SQLiteDatabase,
    readonly sql: string,
    readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): SQLiteStatement {
    return new SQLiteStatement(this.database, this.sql, values.map(input));
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.database.connection.prepare(this.sql).get(...this.values);
    if (!row) return null;
    if (column !== undefined) {
      if (!Object.hasOwn(row, column)) throw new Error("D1_COLUMN_NOTFOUND: " + column);
      return row[column] as T;
    }
    return row as T;
  }

  execute<T = Record<string, unknown>>(): D1Result<T> {
    const started = performance.now();
    const statement = this.database.connection.prepare(this.sql);
    const hasColumns = statement.columns().length > 0;
    const before = hasColumns ? Number(this.database.connection.prepare("SELECT total_changes() AS total").get()!.total) : 0;
    const rows = hasColumns ? statement.all(...this.values) : [];
    const changed = hasColumns ? null : statement.run(...this.values);
    const changes = hasColumns
      ? Number(this.database.connection.prepare("SELECT total_changes() AS total").get()!.total) - before
      : Number(changed?.changes ?? 0);
    return {
      success: true,
      results: rows as T[],
      meta: {
        changes,
        last_row_id: Number(changed?.lastInsertRowid ?? (changes ? this.database.connection.prepare("SELECT last_insert_rowid() AS id").get()!.id : 0)),
        changed_db: changes > 0,
        duration: performance.now() - started,
        rows_read: rows.length,
        rows_written: changes,
        size_after: 0,
      },
    };
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  async raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    const statement = this.database.connection.prepare(this.sql);
    const columns = statement.columns().map((column) => column.name);
    statement.setReturnArrays(true);
    const rows = statement.all(...this.values) as T[];
    return options?.columnNames ? [columns, ...rows] : rows;
  }
}

export class SQLiteDatabase implements D1Database {
  readonly connection: DatabaseSync;

  constructor(filename: string, migrationsDirectory?: string) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
    this.connection = new DatabaseSync(filename);
    this.connection.exec("PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
    if (migrationsDirectory) this.migrate(migrationsDirectory);
  }

  private migrate(directory: string) {
    // An immediate transaction also serializes startup across Passenger processes.
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      this.connection.exec("CREATE TABLE IF NOT EXISTS profectium_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
      const applied = new Set(this.connection.prepare("SELECT name FROM profectium_migrations").all().map((row) => row.name));
      for (const name of readdirSync(directory).filter((name) => /^\d.*\.sql$/.test(name)).sort()) {
        if (applied.has(name)) continue;
        this.connection.exec(readFileSync(path.join(directory, name), "utf8"));
        this.connection.prepare("INSERT INTO profectium_migrations(name,applied_at) VALUES(?,?)").run(name, new Date().toISOString());
      }
      this.connection.exec("COMMIT");
    } catch (error) {
      this.connection.exec("ROLLBACK");
      this.connection.close();
      throw error;
    }
  }

  prepare(sql: string): SQLiteStatement {
    return new SQLiteStatement(this, sql);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    // Do not await inside this transaction: unrelated requests must not interleave.
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof SQLiteStatement) || statement.database !== this)
          throw new TypeError("All batch statements must belong to this SQLite database.");
        return statement.execute<T>();
      });
      this.connection.exec("COMMIT");
      return results;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql: string): Promise<D1ExecResult> {
    const started = performance.now();
    this.connection.exec(sql);
    return { count: 1, duration: performance.now() - started };
  }

  withSession(): D1DatabaseSession {
    // One local SQLite database is already strongly consistent; there are no replicas.
    return { prepare: this.prepare.bind(this), batch: this.batch.bind(this), getBookmark: () => null };
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error("D1 dump is not supported. Back up the SQLite database with the SQLite backup API.");
  }

  close() {
    this.connection.close();
  }
}

const databases = globalThis as typeof globalThis & { __profectiumSQLite?: Map<string, SQLiteDatabase> };

export function nativeDatabase(): SQLiteDatabase {
  const directory = path.resolve(process.env.PROFECTIUM_DATA_DIR || path.join(process.cwd(), "data"));
  const filename = path.join(directory, "profectium.sqlite");
  const cache = databases.__profectiumSQLite ??= new Map();
  let database = cache.get(filename);
  if (!database) {
    database = new SQLiteDatabase(filename, path.resolve(process.env.PROFECTIUM_MIGRATIONS_DIR || path.join(process.cwd(), "drizzle")));
    cache.set(filename, database);
  }
  return database;
}
