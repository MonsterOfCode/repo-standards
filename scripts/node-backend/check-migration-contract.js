#!/usr/bin/env node
/* eslint-disable no-console */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import migrationConfig from "../src/config/migrate-mongo.config.js";

const MIGRATIONS_DIR = "src/database/migrations";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (migrationConfig.useFileHash !== true) {
  fail("migrate-mongo useFileHash must be true so edited idempotent migrations can be re-applied.");
}

const migrationFiles = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".js")).sort();
const errors = [];

// Every migration file is read and imported concurrently, then checked in filename order.
const migrations = await Promise.all(
  migrationFiles.map(async (file) => {
    const path = join(MIGRATIONS_DIR, file);
    const [source, migration] = await Promise.all([readFile(path, "utf8"), import(`../${path}`)]);
    return { file, path, source, migration };
  })
);

for (const { file, path, source, migration } of migrations) {
  if (!/^[a-z0-9-]+-\d{14}\.js$/.test(file)) {
    errors.push(`${path}: filename must end with a 14-digit timestamp`);
  }

  if (typeof migration.up !== "function" || typeof migration.down !== "function") {
    errors.push(`${path}: must export async up(db) and down(db) functions`);
  }

  if (!source.includes("export const up = async (db)") || !source.includes("export const down = async (db)")) {
    errors.push(`${path}: must use explicit migrate-mongo ESM function signatures`);
  }

  if (source.includes('"#/') || source.includes("'#/") || source.includes("getDb()")) {
    errors.push(`${path}: migrations must be self-contained and use the db argument only`);
  }
}

if (errors.length > 0) {
  const list = errors.map((error) => `  - ${error}`).join("\n");
  fail(`Migration contract failed:\n\n${list}`);
}

console.log("Migration contract passed");
