// The logic of `npm run check:css` (scripts/check-css.mjs), kept free of file access so
// src/test/check-css.test.js can cover every rule with small fixtures.
//
// Rules, all fatal:
//
// 1. Prefix: every CSS class this app defines - a class in a selector of our .css files, or a
//    Tailwind v4 `@utility <name>` - starts with the app prefix (`app-`), so our classes never
//    collide with Tailwind's, a library's or a future utility, and are easy to find. Exempt, each
//    explicitly listed by the caller: classes that are not ours but appear in our selectors (Tailwind's
//    `dark` variant class, a library's own classes such as Leaflet's `leaflet-*`), and `@utility`
//    blocks that deliberately override a Tailwind built-in utility (`h-screen`), which the caller
//    proves is a real built-in.
// 2. Used: every class we define is used by the app (outside tests).
// 3. Defined: every prefixed class the code (app, unit tests, e2e) uses is defined.
//
// Class usages are read from the places a class name is written: `className`/`class` and
// `*ClassName` props and object properties, variables named `*className`/`*classes`, the arguments of
// cn()/clsx()/cx()/twMerge() (strings, both branches of `?:`, `&&`/`||`, arrays, clsx object keys),
// cva() base classes and variant values, `classList.*()`, `toHaveClass()`, and CSS selectors given to
// querySelector()/querySelectorAll()/closest()/matches()/locator(); plus `@apply` inside our CSS.
// Template literals count by their static text; a token glued to a `${}` is dynamic and skipped.
// Tailwind utility classes (flex, px-4, ...) are framework classes and are not checked.
import { parseModule, visit } from "./ast.mjs";

// --- CSS ---------------------------------------------------------------------------------------------

const CLASS_IN_SELECTOR = /\.(-?[A-Za-z_][\w-]*)/g;

/** The class names in a CSS selector (`.a .b:hover > .c` -> a, b, c); attribute values are ignored. */
export const selectorClassNames = (selector) =>
  [...selector.replaceAll(/\[[^\]]*\]/g, "[]").matchAll(CLASS_IN_SELECTOR)].map((match) => match[1]);

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/**
 * What one CSS file defines and applies.
 * @returns {{ selectorClasses: {name: string, line: number}[], utilities: {name: string, line: number}[],
 *   applied: {name: string, line: number}[] }}
 */
export const parseCssClasses = (css) => {
  // Blank out comments and strings, keeping offsets (and so line numbers) intact.
  const text = css.replaceAll(/\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (match) => match.replaceAll(/[^\n]/g, " "));
  const result = { selectorClasses: [], utilities: [], applied: [] };
  for (const match of text.matchAll(/@apply\s+([^;}]+)/g)) {
    const line = lineAt(text, match.index);
    classTokens(match[1]).forEach((name) => result.applied.push({ name, line }));
  }
  // A prelude is the text between the previous `{`, `}` or `;` and a `{`.
  for (const match of text.matchAll(/([^{};]*)\{/g)) {
    const prelude = match[1].trim();
    const line = lineAt(text, match.index + match[1].length - match[1].trimStart().length);
    if (prelude.startsWith("@utility")) {
      result.utilities.push({ name: prelude.slice("@utility".length).trim(), line });
    } else if (!prelude.startsWith("@")) {
      selectorClassNames(prelude).forEach((name) => result.selectorClasses.push({ name, line }));
    }
  }
  return result;
};

// --- Class strings --------------------------------------------------------------------------------

/**
 * The class names of a class string, without Tailwind variants (`sm:`, `dark:hover:`, `[&>p]:`) or
 * the important marker (`!x`, `x!`).
 */
export function classTokens(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      let depth = 0;
      let start = 0;
      for (const [index, char] of [...token].entries()) {
        if (char === "[") depth++;
        else if (char === "]") depth--;
        else if (char === ":" && depth === 0) start = index + 1;
      }
      return token.slice(start).replace(/^!/, "").replace(/!$/, "");
    })
    .filter(Boolean);
}

/**
 * Class tokens of a template literal's static text. A token glued to a `${}` (`app-tone--${tone}`)
 * is dynamic: it comes back as a pattern (`app-tone--*`), which must match a defined class.
 */
const HOLE = "\u0000";
const templateTokens = (quasis) =>
  classTokens(quasis.join(HOLE))
    .filter((token) => token.replaceAll(HOLE, ""))
    .map((token) => token.replaceAll(new RegExp(`${HOLE}+`, "g"), "*"));

const CLASS_FUNCTIONS = new Set(["cn", "clsx", "cx", "twMerge", "classNames"]);
const SELECTOR_METHODS = new Set(["querySelector", "querySelectorAll", "closest", "matches", "locator"]);
const CLASS_LIST_METHODS = new Set(["add", "remove", "toggle", "contains", "replace"]);
const CLASS_NAME = /^(?:class|className|[A-Za-z]+ClassName)$/;
const CLASS_VARIABLE = /(?:className|classes)$/i;

const calleeName = (callee) => {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) return callee.property.name;
  return null;
};
const isClassListCall = (callee) =>
  callee.type === "MemberExpression" &&
  !callee.computed &&
  CLASS_LIST_METHODS.has(callee.property.name) &&
  callee.object.type === "MemberExpression" &&
  !callee.object.computed &&
  callee.object.property.name === "classList";
const keyName = (key) => key?.name ?? (typeof key?.value === "string" ? key.value : null);

// The children of a class-string expression that hold class strings themselves.
const CLASS_EXPRESSION_CHILDREN = {
  TemplateLiteral: (node) => node.expressions,
  ConditionalExpression: (node) => [node.consequent, node.alternate],
  LogicalExpression: (node) => [node.left, node.right],
  JSXExpressionContainer: (node) => [node.expression],
  ArrayExpression: (node) => node.elements,
};

const OBJECT_KEYS = { objectKeys: true, objectValues: false };
const OBJECT_VALUES = { objectKeys: false, objectValues: true };

/**
 * Reads a class-string expression: strings, templates, `?:`, `&&`/`||`, arrays and objects - their
 * keys for clsx-style `{ "app-x": on }`, their values for cva variants. A nested cn()/clsx() call is
 * read by the visitor itself.
 */
const readClassExpression = (node, options, add) => {
  if (!node) return;
  if (node.type === "Literal" && typeof node.value === "string") add(classTokens(node.value), node);
  else if (node.type === "TemplateLiteral") add(templateTokens(node.quasis.map((quasi) => quasi.value.cooked)), node);
  else if (node.type === "ObjectExpression") readObjectClasses(node, options, add);
  (CLASS_EXPRESSION_CHILDREN[node.type]?.(node) ?? []).forEach((child) => readClassExpression(child, options, add));
};

function readObjectClasses(node, options, add) {
  for (const property of node.properties.filter(({ type }) => type === "Property")) {
    const name = property.computed ? null : keyName(property.key);
    if (options.objectKeys && name) add(classTokens(name), property.key);
    if (options.objectValues) readClassExpression(property.value, options, add);
  }
}

const isClassAssignment = (node) => node.left.type === "MemberExpression" && CLASS_NAME.test(keyName(node.left.property) ?? "");

// The class-string expressions of one call: cn()/clsx()/..., cva(), classList.*(), toHaveClass().
const callClassExpressions = (node) => {
  const name = calleeName(node.callee);
  const isPlainCall = node.callee.type === "Identifier";
  if (isPlainCall && CLASS_FUNCTIONS.has(name)) return node.arguments.map((argument) => [argument, OBJECT_KEYS]);
  if (isPlainCall && name === "cva") {
    const variants = node.arguments[1]?.properties?.find((property) => keyName(property.key) === "variants")?.value;
    return [
      [node.arguments[0], OBJECT_KEYS],
      [variants, OBJECT_VALUES],
    ];
  }
  if (isClassListCall(node.callee) || name === "toHaveClass") return node.arguments.map((argument) => [argument, OBJECT_KEYS]);
  return [];
};

// The class-string expressions one AST node holds, as [expression, options] pairs.
const classExpressions = (node) => {
  switch (node.type) {
    case "JSXAttribute":
      return CLASS_NAME.test(node.name.name) ? [[node.value, OBJECT_KEYS]] : [];
    case "Property":
      return !node.computed && CLASS_NAME.test(keyName(node.key) ?? "") ? [[node.value, OBJECT_KEYS]] : [];
    case "VariableDeclarator":
      return CLASS_VARIABLE.test(node.id.name ?? "") ? [[node.init, OBJECT_KEYS]] : [];
    case "AssignmentExpression":
      return isClassAssignment(node) ? [[node.right, OBJECT_KEYS]] : [];
    case "CallExpression":
      return callClassExpressions(node);
    default:
      return [];
  }
};

// The CSS selector string given to querySelector()/closest()/locator()/..., if any.
const selectorText = (node) => {
  if (node.type !== "CallExpression" || !SELECTOR_METHODS.has(calleeName(node.callee))) return null;
  const [argument] = node.arguments;
  if (argument?.type === "Literal" && typeof argument.value === "string") return argument.value;
  if (argument?.type === "TemplateLiteral") return argument.quasis.map((quasi) => quasi.value.cooked).join(" ");
  return null;
};

/**
 * The class names one JS/JSX source file uses (see the header for where they are read).
 * @returns {{name: string, line: number}[]}
 */
export const collectClassUsages = (source) => {
  const usages = [];
  const add = (names, node) => names.forEach((name) => usages.push({ name, line: node.loc.start.line }));
  visit(parseModule(source), (node) => {
    classExpressions(node).forEach(([expression, options]) => readClassExpression(expression, options, add));
    const selector = selectorText(node);
    if (selector !== null) add(selectorClassNames(selector), node);
  });
  return usages;
};

const wildcard = (name) =>
  new RegExp(
    `^${name
      .split("*")
      .map((part) => part.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
      .join(".+")}$`
  );

// --- Rules ------------------------------------------------------------------------------------------

/**
 * Checks what our CSS defines against what the code uses.
 * @param {object} input
 * @param {{file: string, css: ReturnType<typeof parseCssClasses>}[]} input.cssFiles
 * @param {{file: string, usages: {name: string, line: number}[]}[]} input.appFiles  app code (proves "used")
 * @param {{file: string, usages: {name: string, line: number}[]}[]} [input.testFiles]  tests (checked for "defined" only)
 * @param {string} input.prefix  e.g. "app-"
 * @param {Set<string>|string[]} [input.foreignClasses]  classes in our selectors that are not ours (e.g. "dark")
 * @param {RegExp} [input.foreignClassPattern]  library classes in our selectors (e.g. /^leaflet-/)
 * @param {Set<string>|string[]} [input.tailwindOverrides]  unprefixed `@utility` names that override a Tailwind built-in
 * @param {(name: string) => boolean} [input.isTailwindUtility]  proves an override is a Tailwind built-in
 * @returns {string[]} one message per problem
 */
export const checkCssClasses = ({
  cssFiles,
  appFiles,
  testFiles = [],
  prefix,
  foreignClasses = [],
  foreignClassPattern = /$^/,
  tailwindOverrides = [],
  isTailwindUtility = () => false,
}) => {
  const { defined, errors } = collectDefinitions(cssFiles, {
    prefix,
    foreignClasses,
    foreignClassPattern,
    tailwindOverrides,
    isTailwindUtility,
  });
  const used = new Set();
  const applied = cssFiles.map(({ file, css }) => ({ file, usages: css.applied }));
  errors.push(
    ...undefinedClasses([...appFiles, ...applied], prefix, defined, used),
    ...undefinedClasses(testFiles, prefix, defined, new Set())
  );
  for (const [name, where] of defined) {
    if (!used.has(name)) errors.push(`${where} defines the class "${name}", which the app never uses`);
  }
  return errors;
};

// Rule 1: our classes and utilities by name -> where they are defined, and the unprefixed ones.
const collectDefinitions = (cssFiles, { prefix, foreignClasses, foreignClassPattern, tailwindOverrides, isTailwindUtility }) => {
  const foreign = new Set(foreignClasses);
  const overrides = new Set(tailwindOverrides);
  const defined = new Map();
  const errors = [];
  const define = (name, where) => defined.set(name, defined.get(name) ?? where);
  for (const { file, css } of cssFiles) {
    for (const { name, line } of css.selectorClasses) {
      if (name.startsWith(prefix)) define(name, `${file}:${line}`);
      else if (!foreign.has(name) && !foreignClassPattern.test(name)) {
        errors.push(
          `${file}:${line} defines the class ".${name}": our classes start with "${prefix}". ` +
            `If ".${name}" belongs to a third-party library (e.g. "recharts-wrapper", "leaflet-popup"), do not ` +
            `rename it: add the library's prefix to FOREIGN_CLASS_PREFIXES in scripts/check-css.mjs, with a comment.`
        );
      }
    }
    for (const { name, line } of css.utilities) {
      if (name.startsWith(prefix)) define(name, `${file}:${line}`);
      else if (!overrides.has(name)) errors.push(`${file}:${line} defines "@utility ${name}": our utilities start with "${prefix}"`);
      else if (!isTailwindUtility(name)) {
        errors.push(`${file}:${line} "@utility ${name}" is allow-listed as a Tailwind override, but Tailwind has no "${name}" utility`);
      }
    }
  }
  return { defined, errors };
};

// Rules 2 and 3: marks the defined classes `files` use, and reports the prefixed ones nobody defines.
const undefinedClasses = (files, prefix, defined, used) =>
  files.flatMap(({ file, usages }) =>
    usages
      .filter(({ name }) => name.startsWith(prefix))
      .flatMap(({ name, line }) => {
        const pattern = name.includes("*") ? wildcard(name) : null;
        const matches = pattern
          ? [...defined.keys()].filter((candidate) => pattern.test(candidate))
          : [name].filter((candidate) => defined.has(candidate));
        matches.forEach((match) => used.add(match));
        return matches.length ? [] : [`${file}:${line} uses the class "${name}", which no CSS file defines`];
      })
  );

/**
 * Whether plain Tailwind (no project CSS) generates a utility of exactly this name - the proof that an
 * unprefixed `@utility` really overrides a built-in. `compile` is tailwindcss' own `compile`.
 */
export const isTailwindBuiltIn = async (compile, name) => {
  const compiler = await compile("@tailwind utilities;");
  return compiler
    .build([name])
    .split("\n")
    .some((line) => line.trim() === `.${name} {`);
};
