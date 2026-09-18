// SQLite via node:sqlite (Node ≥ 23.4, no native build). One file, WAL, tiny schema.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const file = process.env.DB_PATH || path.join(__dirname, 'data', 'lyceum.sqlite');
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS entitlements (token_id TEXT PRIMARY KEY, platform TEXT, product TEXT, course_hash TEXT, device TEXT, tx TEXT UNIQUE, created_at TEXT);
  CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, token_id TEXT, model TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, cost REAL, ms INTEGER, at TEXT);
  CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, body TEXT, model TEXT, at TEXT);
  CREATE TABLE IF NOT EXISTS certificates (code TEXT PRIMARY KEY, no TEXT, hash TEXT, name TEXT, student_id TEXT, course_code TEXT, title TEXT, letter TEXT, pct REAL, credits INTEGER, issued_at TEXT, registered_at TEXT);
  CREATE TABLE IF NOT EXISTS ratelimit (key TEXT PRIMARY KEY, n INTEGER, window_start INTEGER);
`);
module.exports = db;
