#!/usr/bin/env node
/* eslint-disable no-console */
// migrations released to production are immutable (migrations.lock.json).
//   node scripts/check-migrations-lock.js            locked files unchanged and present (every commit)
//   node scripts/check-migrations-lock.js --release  + every migration file is locked (production release)
//   node scripts/check-migrations-lock.js --write    write the current hash of every migration (npm run migrations:lock)
// The logic lives in src/checks/migrations-lock.js (covered by Jest).

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildMigrationsLock, checkMigrationsLock, parseMigrationsLock } from "../src/checks/migrations-lock.js";
import { formatCheckReport } from "../src/checks/check-report.js";

const MIGRATIONS_DIR = "src/database/migrations";
const LOCK_FILE = "migrations.lock.json";
const args = new Set(process.argv.slice(2));

const names = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".js"));
const files = await Promise.all(
  names.map(async (file) => ({ file, source: await readFile(join(MIGRATIONS_DIR, file)) }))
);

if (args.has("--write")) {
  const lock = buildMigrationsLock(files);
  await writeFile(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`✓ ${LOCK_FILE} written (${Object.keys(lock).length} migrations locked) - commit it with the release`);
} else {
  const { lock, problems: parseProblems } = parseMigrationsLock(await readFile(LOCK_FILE, "utf8"));
  const release = args.has("--release");
  const problems = lock ? [...parseProblems, ...checkMigrationsLock({ lock, files, release })] : parseProblems;
  const locked = lock ? Object.keys(lock).length : 0;
  const report = formatCheckReport({
    title: release ? "Migrations lock (production release)" : "Migrations lock",
    problems,
    okSummary: release
      ? `migrations lock ok for production (all ${files.length} migrations locked)`
      : `migrations lock ok (${locked} locked in production, ${files.length - locked} not yet released)`,
  });
  console[report.ok ? "log" : "error"](report.output);
  process.exitCode = report.ok ? 0 : 1;
}
