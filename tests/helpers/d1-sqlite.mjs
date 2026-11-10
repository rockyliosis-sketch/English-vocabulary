import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = path.resolve(__dirname, '../../migrations/0001_init.sql');

class BoundD1Statement {
  constructor(sqlite, sql, params = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new BoundD1Statement(this.sqlite, this.sql, params);
  }

  async first(colName) {
    const stmt = this.sqlite.prepare(this.sql);
    const raw = stmt.get(...this.params) ?? null;
    if (!raw) return null;
    const row = { ...raw };
    return colName ? row[colName] : row;
  }

  async all() {
    const stmt = this.sqlite.prepare(this.sql);
    const rows = stmt.all(...this.params).map((r) => ({ ...r }));
    return {
      success: true,
      results: rows
    };
  }

  async run() {
    const stmt = this.sqlite.prepare(this.sql);
    const info = stmt.run(...this.params);
    return {
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: info.lastInsertRowid
      }
    };
  }
}

export class LocalD1Database {
  constructor(filename = ':memory:') {
    this.sqlite = new DatabaseSync(filename);
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  exec(sql) {
    this.sqlite.exec(sql);
  }

  prepare(sql) {
    return new BoundD1Statement(this.sqlite, sql);
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      this.sqlite.exec('COMMIT;');
      return results;
    } catch (err) {
      this.sqlite.exec('ROLLBACK;');
      throw err;
    }
  }
}

export function createTestD1WithMigration() {
  const db = new LocalD1Database(':memory:');
  const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  db.exec(migrationSql);
  return db;
}
