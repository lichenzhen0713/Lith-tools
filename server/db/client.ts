import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

export type SqlValue = string | number | bigint | null | Uint8Array;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const instance = new DatabaseSync(config.dbPath);
  instance.exec('PRAGMA journal_mode = WAL');
  instance.exec('PRAGMA foreign_keys = ON');
  instance.exec('PRAGMA busy_timeout = 5000');
  instance.exec('PRAGMA synchronous = NORMAL');
  db = instance;
  return instance;
}

export function all<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(
  sql: string,
  ...params: SqlValue[]
): { changes: number; lastInsertRowid: number } {
  const result = getDb().prepare(sql).run(...params);
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}

export function pluck<T extends SqlValue = SqlValue>(sql: string, ...params: SqlValue[]): T | undefined {
  const row = get<Record<string, SqlValue>>(sql, ...params);
  if (!row) return undefined;
  const values = Object.values(row);
  return values[0] as T;
}

export function count(sql: string, ...params: SqlValue[]): number {
  const value = pluck<number>(sql, ...params);
  return Number(value ?? 0);
}

let depth = 0;

/** Run a function inside a transaction (supports nesting through SAVEPOINTs). */
export function transaction<T>(fn: () => T): T {
  const database = getDb();
  const savepoint = `sp_${depth}`;
  if (depth === 0) database.exec('BEGIN IMMEDIATE');
  else database.exec(`SAVEPOINT ${savepoint}`);
  depth += 1;
  try {
    const result = fn();
    depth -= 1;
    if (depth === 0) database.exec('COMMIT');
    else database.exec(`RELEASE ${savepoint}`);
    return result;
  } catch (error) {
    depth -= 1;
    if (depth === 0) database.exec('ROLLBACK');
    else database.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    throw error;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(minutes: number, from = new Date()): string {
  return new Date(from.getTime() + minutes * 60_000).toISOString();
}

export function addDays(days: number, from = new Date()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
