// a migration is immutable once it has run in PRODUCTION. migrations.lock.json maps each
// migration released to production (file name) to the sha256 of its content. Before production a
// migration still declares its collection's final state and may change freely; once
// locked, a change needs a new migration.
import { createHash } from "node:crypto";

export const hashMigrationSource = (source) => createHash("sha256").update(source).digest("hex");

// files: [{ file, source }] -> { file: sha256 } sorted by file name (stable diffs).
export const buildMigrationsLock = (files) =>
  Object.fromEntries(
    files
      .map(({ file, source }) => [file, hashMigrationSource(source)])
      .sort(([left], [right]) => left.localeCompare(right))
  );

export const parseMigrationsLock = (text) => {
  let lock;
  try {
    lock = JSON.parse(text);
  } catch (err) {
    return { lock: null, problems: [`migrations.lock.json is not valid JSON (${err.message})`] };
  }
  const isMap = lock !== null && typeof lock === "object" && !Array.isArray(lock);
  const invalid = isMap
    ? Object.entries(lock).filter(([, hash]) => typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash))
    : [];
  if (!isMap) return { lock: null, problems: ["migrations.lock.json must be an object { fileName: sha256 }"] };
  return { lock, problems: invalid.map(([file]) => `migrations.lock.json: ${file} has no valid sha256`) };
};

// `release: true` (the production release gate): the lock must also hold EVERY migration file with
// its current hash - run `npm run migrations:lock` and commit the lock before releasing to production.
export const checkMigrationsLock = ({ lock, files, release = false }) => {
  const current = buildMigrationsLock(files);
  const problems = [];
  for (const [file, hash] of Object.entries(lock)) {
    if (!Object.hasOwn(current, file)) {
      problems.push(`${file} is in production (migrations.lock.json) but was deleted or renamed`);
    } else if (current[file] !== hash) {
      problems.push(`${file} is in production (migrations.lock.json) but was modified - add a new migration instead`);
    }
  }
  if (release) {
    for (const file of Object.keys(current)) {
      if (!Object.hasOwn(lock, file)) {
        problems.push(`${file} is not in migrations.lock.json - run \`npm run migrations:lock\` and commit the lock`);
      }
    }
  }
  return problems;
};
