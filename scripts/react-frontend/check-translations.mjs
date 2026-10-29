// `npm run check:translations`: the locale rules of scripts/lib/translations.mjs (parity, empty
// values, "ß", per-key interpolation variables and $t() nesting, plural families) and the usage
// rules (every key the app names exists in en.json, every key of en.json is used). Fatal (exit 1).
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { checkLocales, checkUsage, collectKeyUsages } from "./lib/translations.mjs";

const LANGUAGES = ["en", "de", "fr", "it"];
const LOCALES_DIR = resolve("src/app/locales");
const SOURCE_DIR = resolve("src");
const SOURCE_FILE = /\.(jsx?|mjs)$/;
// Tests assert on keys of their own and on mocked `t`s: they neither prove a key is used nor need it.
const TEST_PATH = /(\.test\.(jsx?|mjs)$)|([\\/]src[\\/]test[\\/])/;

// Keys the app never names itself because the backend sends them, kept on purpose. An entry ending in
// "." covers every key under it.
const API_KEYS = [
  // zodParse sends `validation.*` i18n keys as 422 detail messages.
  "validation.",
  // The public request route's own 422 detail messages (requests-router.js PUBLIC_REQUEST_MESSAGES).
  "publicRequest.errors.",
  // List filter options: the API's `meta.filterOptions[field].options[].labelKey` (mapFilterOptions).
  "adminAuditLogs.statusClasses.",
  "adminLocations.filters.",
  "invoices.needsAttention.",
  "invoices.overdue.",
  "subscriptions.renewal.",
  "adminTags.filters.active",
  "adminTags.filters.inactive",
  "adminTags.filters.mapped",
  "adminTags.filters.unmapped",
  "adminTags.filters.heldByEveryone",
  "adminTags.filters.notHeldByEveryone",
];

const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_FILE.test(entry.name) && !TEST_PATH.test(path) ? [path] : [];
  });

const locales = new Map(LANGUAGES.map((language) => [language, JSON.parse(readFileSync(join(LOCALES_DIR, `${language}.json`), "utf8"))]));
const files = sourceFiles(SOURCE_DIR).map((file) => ({
  file: relative(process.cwd(), file),
  usages: collectKeyUsages(readFileSync(file, "utf8")),
}));
const usage = checkUsage(locales.get("en"), files, { allowUnused: API_KEYS });
const errors = [...checkLocales(locales), ...usage.errors];

if (errors.length) {
  console.error(`check:translations found ${errors.length} problem(s):\n\n${errors.join("\n")}`);
  process.exit(1);
}

console.log(
  `Translations OK: ${LANGUAGES.join("/")} hold the same keys, variables, nesting and plural forms; ${usage.stats.static} static key uses and ${usage.stats.patterns} dynamic keys found, no unused key.`
);
