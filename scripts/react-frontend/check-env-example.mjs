// `npm run check:env-example`: .env.example lists every VITE_* variable the code reads (src/ and
// vite.config.js), and every variable it lists is read (scripts/lib/env-example.mjs). Fatal (exit 1).
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { checkEnvExample, collectEnvReads, parseEnvExample } from "./lib/env-example.mjs";

// VITE_* variables read on purpose without being in .env.example (reason each). None today.
const NOT_DOCUMENTED = [];
// Variables in .env.example read outside src/ and vite.config.js (reason each). None today.
const NOT_READ = [];

const TEST_PATH = /(\.test\.(jsx?|mjs)$)|([\\/]src[\\/]test[\\/])/;
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(jsx?|mjs)$/.test(entry.name) && !TEST_PATH.test(path) ? [path] : [];
  });

const files = [...walk(resolve("src")), resolve("vite.config.js")].map((path) => ({
  file: relative(process.cwd(), path),
  reads: collectEnvReads(readFileSync(path, "utf8")),
}));
const documented = parseEnvExample(readFileSync(resolve(".env.example"), "utf8"));
const errors = checkEnvExample({ documented, files, notDocumented: NOT_DOCUMENTED, notRead: NOT_READ });

if (errors.length) {
  console.error(`check:env-example found ${errors.length} problem(s):\n\n${errors.join("\n")}`);
  process.exit(1);
}

console.log(`.env.example OK: ${documented.length} variables, each read by the code, and every VITE_* variable the code reads is listed.`);
