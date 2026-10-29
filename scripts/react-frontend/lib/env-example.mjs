// The logic of `npm run check:env-example` (scripts/check-env-example.mjs), kept free of file access
// so src/test/check-env-example.test.js can cover it with fixtures.
//
// `.env.example` documents every build-time variable the app reads, and only those:
// - every `VITE_*` variable read in the code (`import.meta.env.VITE_X`, `env.VITE_X` on an env object
//   passed around, `process.env.VITE_X` in vite.config.js, `env["VITE_X"]`) is in .env.example;
// - every variable in .env.example is read somewhere (any name: a non-VITE_ entry must be read too).
// An explicit allow-list (with a reason each) covers a variable that is read but intentionally not
// documented, or documented but read outside the scanned files.
import { parseModule, visit } from "./ast.mjs";

const VARIABLE = /^VITE_[A-Z0-9_]+$/;

const propertyKey = (node) => {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") return node.property.value;
  return null;
};

/**
 * Environment variables one module reads: every member access `<anything>.NAME` / `<anything>["NAME"]`
 * whose name is a VITE_* variable, plus `process.env.NAME` of any name.
 * @returns {{name: string, line: number}[]}
 */
const isProcessEnv = (object) =>
  object.type === "MemberExpression" && !object.computed && object.object.name === "process" && object.property.name === "env";

export const collectEnvReads = (source) => {
  const reads = [];
  visit(parseModule(source), (node) => {
    const name = node.type === "MemberExpression" ? propertyKey(node) : null;
    if (name && (VARIABLE.test(name) || isProcessEnv(node.object))) reads.push({ name, line: node.loc.start.line });
  });
  return reads;
};

/** The variable names of a dotenv file (`NAME=value` lines; comments and `export ` prefixes allowed). */
export const parseEnvExample = (text) =>
  text
    .split("\n")
    .map((line) => /^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=/.exec(line)?.[1])
    .filter(Boolean);

/**
 * @param {object} input
 * @param {string[]} input.documented  variable names of .env.example
 * @param {{file: string, reads: {name: string, line: number}[]}[]} input.files
 * @param {string[]} [input.notDocumented]  VITE_* variables read on purpose without being in .env.example
 * @param {string[]} [input.notRead]  variables in .env.example read outside the scanned files
 * @returns {string[]} one message per problem
 */
export const checkEnvExample = ({ documented, files, notDocumented = [], notRead = [] }) => {
  const documentedSet = new Set(documented);
  const read = new Map();
  for (const { file, reads } of files) {
    for (const { name, line } of reads) read.set(name, read.get(name) ?? `${file}:${line}`);
  }
  const duplicates = new Set(documented.filter((name, index) => documented.indexOf(name) !== index));
  return [
    ...[...duplicates].map((name) => `.env.example lists ${name} more than once`),
    ...[...read]
      .filter(([name]) => VARIABLE.test(name) && !documentedSet.has(name) && !notDocumented.includes(name))
      .map(([name, where]) => `${where} reads ${name}, which .env.example does not list`),
    ...[...documentedSet]
      .filter((name) => !read.has(name) && !notRead.includes(name))
      .map((name) => `.env.example lists ${name}, which nothing reads`),
    ...notDocumented
      .filter((name) => !read.has(name))
      .map((name) => `allow-listed ${name} (read without .env.example) is not read any more: remove it`),
    ...notRead
      .filter((name) => !documentedSet.has(name))
      .map((name) => `allow-listed ${name} (in .env.example, read elsewhere) is not in .env.example any more: remove it`),
  ];
};
