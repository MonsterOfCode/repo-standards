// `npm run check:css`: the CSS class rules of scripts/lib/css-classes.mjs - every class we define
// (our .css selectors and Tailwind `@utility` blocks) starts with the app prefix and is used by the app, and
// every "app-" class the code or the tests use is defined. Fatal (exit 1).
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { compile } from "tailwindcss";
import { checkCssClasses, collectClassUsages, isTailwindBuiltIn, parseCssClasses } from "./lib/css-classes.mjs";

// The application's own CSS class prefix: set it per project ("domi-", "acme-", ...).
const PREFIX = process.env.CSS_CLASS_PREFIX ?? "app-";

// Classes that appear in our selectors but are not ours, so they keep their own names.
const FOREIGN_CLASSES = [
  // Tailwind's dark-mode class on <html> (`@custom-variant dark`, set by config/colorMode.js).
  "dark",
];
// Leaflet's own markup (components/maps/LocationMap.jsx), restyled inside the app's map wrapper class.
const FOREIGN_CLASS_PATTERN = /^leaflet-/;

// Unprefixed `@utility` blocks that deliberately replace a Tailwind built-in utility of the same name
// (the check proves each one is a real built-in). Anything else needs the prefix.
const TAILWIND_OVERRIDES = [
  // "the viewport minus the demo banner" for every full-height layout.
  "h-screen",
  "min-h-screen",
];

const walk = (directory, accept) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path, accept);
    return accept(path) ? [path] : [];
  });

const TEST_PATH = /(\.test\.(jsx?|mjs)$)|([\\/]src[\\/]test[\\/])/;
const SOURCE = /\.(jsx?|mjs)$/;
const read = (path) => readFileSync(path, "utf8");
const usagesOf = (paths) => paths.map((path) => ({ file: relative(process.cwd(), path), usages: collectClassUsages(read(path)) }));

const cssFiles = walk(resolve("src"), (path) => path.endsWith(".css")).map((path) => ({
  file: relative(process.cwd(), path),
  css: parseCssClasses(read(path)),
}));
const sources = walk(resolve("src"), (path) => SOURCE.test(path));
const appFiles = usagesOf(sources.filter((path) => !TEST_PATH.test(path)));
const testFiles = usagesOf([...sources.filter((path) => TEST_PATH.test(path)), ...walk(resolve("tests"), (path) => SOURCE.test(path))]);

const proofs = await Promise.all(TAILWIND_OVERRIDES.map((name) => isTailwindBuiltIn(compile, name)));
const builtIns = new Set(TAILWIND_OVERRIDES.filter((_, index) => proofs[index]));

const errors = checkCssClasses({
  cssFiles,
  appFiles,
  testFiles,
  prefix: PREFIX,
  foreignClasses: FOREIGN_CLASSES,
  foreignClassPattern: FOREIGN_CLASS_PATTERN,
  tailwindOverrides: TAILWIND_OVERRIDES,
  isTailwindUtility: (name) => builtIns.has(name),
});

if (errors.length) {
  console.error(`check:css found ${errors.length} problem(s):\n\n${errors.join("\n")}`);
  process.exit(1);
}

const definedCount = cssFiles.reduce((count, { css }) => count + css.utilities.length + css.selectorClasses.length, 0);
console.log(`CSS classes OK: ${cssFiles.length} CSS file(s), ${definedCount} class definitions, every "${PREFIX}" class defined and used.`);
