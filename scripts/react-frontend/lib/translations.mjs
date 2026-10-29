// The logic of `npm run check:translations` (scripts/check-translations.mjs), kept free of file
// access so src/test/check-translations.test.js can cover every rule with small fixtures.
//
// Rules, all fatal:
//
// 1. Parity: every locale holds exactly the keys of the reference locale (en): missing and extra keys
//    are listed per file. A value must be a string (no arrays, numbers or null leaves).
// 2. Values: no empty (or whitespace-only) value; German is Swiss Standard German, so no "ß".
// 3. Placeholders, per key, the same in every language: the interpolation variables (`{{name}}`,
//    `{{date, datetime}}` counts as `date`) and the nested keys (`$t(other.key)`). One exception: a
//    language whose plural category "one" means exactly 1 (de, it, en - not fr, where it covers 0 and
//    1 too) may leave `{{count}}` out of a `_one`/`_two` form ("Jede Minute" for "Every 1 minute").
//    A nested `$t(...)` key must exist.
// 4. Plurals: in every language, an i18next plural family (`x_one`, `x_other`, ...) has both `_one`
//    and `_other`.
// 5. Usage: every key the app names statically exists in the reference locale (static `t()` keys,
//    `i18nKey`, `*LabelKey`-style props, and dynamic template keys checked as patterns - see
//    `collectKeyUsages`).
// 6. Unused: every key of the reference locale is used: named statically, written as any string
//    literal in src (a key held in a lookup map or a constant still counts), matched by a template
//    with static text, nested in another value with `$t()`, built by an open template from a prefix
//    and a tail written in src (see `checkUsage`), or allow-listed (keys the API sends).
import { parseModule, visit } from "./ast.mjs";

export const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];
const PLURAL_KEY = new RegExp(`^(.+)_(${PLURAL_SUFFIXES.join("|")})$`);

// The props, object properties and default parameters whose string value is a translation key:
// `i18nKey` (react-i18next's <Trans>) and the app's label convention (`labelKey`, `titleKey`,
// `backLabelKey`, `placeholderKey`, `emptyMessageKey`, ...).
export const KEY_PROP =
  /^(?:i18nKey|[a-z][A-Za-z]*?(?:[Ll]abel|[Tt]itle|[Mm]essage|[Pp]laceholder|[Dd]escription|[Ss]ubtitle|[Hh]int|[Tt]ext)Key|(?:label|title|message|placeholder|description|subtitle|hint|text)Key)$/;

/** Flattens a locale object into [dotted key, leaf value] pairs. */
export const flattenLocale = (value, prefix = "") =>
  Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child) ? flattenLocale(child, next) : [[next, child]];
  });

/** Interpolation variable names of a value, sorted (`{{date, datetime}}` -> `date`). */
export const interpolationVariables = (value) =>
  [...value.matchAll(/\{\{-?\s*([^},\s]+)[^}]*\}\}/g)].map((match) => match[1]).sort((a, b) => a.localeCompare(b));

/** Keys nested with `$t(key)` / `$t(key, { ... })`, sorted. */
export const nestedKeys = (value) => [...value.matchAll(/\$t\(\s*([^,)\s]+)/g)].map((match) => match[1]).sort((a, b) => a.localeCompare(b));

/** True when the language's plural category "one" holds exactly the number 1 (Intl.PluralRules). */
export const oneMeansExactlyOne = (language) => {
  const rules = new Intl.PluralRules(language);
  const ones = [0, 1, 2, 3, 11, 21, 101, 0.5, 1.5].filter((count) => rules.select(count) === "one");
  return ones.length === 1 && ones[0] === 1;
};

const sameList = (left, right) => left.length === right.length && left.every((item, index) => item === right[index]);
const describeList = (list) => (list.length ? list.join(", ") : "none");

const valueProblem = (language, key, value) => {
  if (typeof value !== "string") return `${language}: ${key} is not a string`;
  if (!value.trim()) return `${language}: ${key} is empty`;
  if (language === "de" && value.includes("ß")) return `de: ${key} uses "ß" (Swiss Standard German writes "ss")`;
  return null;
};

// Rules 1 and 2: same keys as the reference, every value a non-empty string, no "ß" in German.
const checkKeysAndValues = (entries, referenceLanguage, reference) =>
  [...entries].flatMap(([language, values]) => {
    const missing = [...reference.keys()].filter((key) => !values.has(key));
    const extra = [...values.keys()].filter((key) => !reference.has(key));
    return [
      missing.length ? `${language}: missing keys (in ${referenceLanguage}): ${missing.join(", ")}` : null,
      extra.length ? `${language}: extra keys (not in ${referenceLanguage}): ${extra.join(", ")}` : null,
      ...[...values].map(([key, value]) => valueProblem(language, key, value)),
    ].filter(Boolean);
  });

// Rule 3 for one key: the same variables and nesting in every language as in the reference.
const checkPlaceholders = (key, referenceValue, entries, referenceLanguage, referenceBases) => {
  const plural = PLURAL_KEY.exec(key);
  const countOptional = Boolean(plural) && ["zero", "one", "two"].includes(plural[2]);
  const expectedVariables = interpolationVariables(referenceValue);
  const expectedNested = nestedKeys(referenceValue);
  const errors = expectedNested
    .filter((nested) => !referenceBases.has(nested))
    .map((nested) => `${key}: nests $t(${nested}), which does not exist`);
  for (const [language, values] of entries) {
    const value = values.get(key);
    if (language === referenceLanguage || typeof value !== "string") continue;
    const dropCount = countOptional && oneMeansExactlyOne(language);
    const comparable = (list) => (dropCount ? list.filter((name) => name !== "count") : list);
    const variables = interpolationVariables(value);
    if (!sameList(comparable(variables), comparable(expectedVariables))) {
      errors.push(
        `${language}: ${key} has variables {{${describeList(variables)}}}, ${referenceLanguage} has {{${describeList(expectedVariables)}}}`
      );
    }
    const nested = nestedKeys(value);
    if (!sameList(nested, expectedNested)) {
      errors.push(`${language}: ${key} nests $t(${describeList(nested)}), ${referenceLanguage} nests $t(${describeList(expectedNested)})`);
    }
  }
  return errors;
};

// Rule 4: every plural family of every language has `_one` and `_other`.
const checkPluralFamilies = (entries) =>
  [...entries].flatMap(([language, values]) => {
    const families = Map.groupBy([...values.keys()].map((key) => PLURAL_KEY.exec(key)).filter(Boolean), (plural) => plural[1]);
    return [...families].flatMap(([base, plurals]) => {
      const forms = new Set(plurals.map((plural) => plural[2]));
      const absent = ["one", "other"].filter((form) => !forms.has(form)).map((form) => `${base}_${form}`);
      return absent.length ? [`${language}: plural ${base} has no ${absent.join(" and ")}`] : [];
    });
  });

/**
 * Checks the locales against each other.
 * @param {Map<string, object>} locales language -> parsed locale JSON; the first entry is the reference.
 * @returns {string[]} one message per problem
 */
export const checkLocales = (locales) => {
  const entries = new Map([...locales].map(([language, json]) => [language, new Map(flattenLocale(json))]));
  const [referenceLanguage, reference] = [...entries][0];
  const referenceBases = new Set([...reference.keys()].flatMap((key) => [key, PLURAL_KEY.exec(key)?.[1] ?? key]));
  const placeholderErrors = [...reference]
    .filter(([, value]) => typeof value === "string")
    .flatMap(([key, value]) => checkPlaceholders(key, value, entries, referenceLanguage, referenceBases));
  return [...checkKeysAndValues(entries, referenceLanguage, reference), ...placeholderErrors, ...checkPluralFamilies(entries)];
};

// --- Usage -----------------------------------------------------------------------------------------

const propertyName = (key) => key?.name ?? (typeof key?.value === "string" ? key.value : null);
const isTranslateCall = ({ callee }) =>
  (callee.type === "Identifier" && callee.name === "t") ||
  (callee.type === "MemberExpression" && !callee.computed && callee.property.name === "t");

/**
 * The translation keys one source file names.
 * @returns {{ keys: {key: string, line: number}[], patterns: {quasis: string[], line: number}[],
 *   literals: string[], templates: string[][] }} `keys` are static keys in a key position (see
 *   KEY_PROP), `patterns` the static parts of template keys with `${}` in a key position; `literals`
 *   and `templates` are every plain string and every template of the file, for the unused check.
 */
export const collectKeyUsages = (source) => {
  const usages = { keys: [], patterns: [], literals: [], templates: [] };
  const addKey = (node) => {
    if (!node) return;
    if (node.type === "Literal" && typeof node.value === "string") {
      usages.keys.push({ key: node.value, line: node.loc.start.line });
    } else if (node.type === "TemplateLiteral") {
      const quasis = node.quasis.map((quasi) => quasi.value.cooked);
      if (node.expressions.length === 0) usages.keys.push({ key: quasis[0], line: node.loc.start.line });
      else usages.patterns.push({ quasis, line: node.loc.start.line });
    } else if (node.type === "ConditionalExpression") {
      addKey(node.consequent);
      addKey(node.alternate);
    } else if (node.type === "LogicalExpression") {
      addKey(node.left);
      addKey(node.right);
    } else if (node.type === "JSXExpressionContainer") {
      addKey(node.expression);
    }
  };
  visit(parseModule(source), (node) => {
    if (node.type === "Literal" && typeof node.value === "string") usages.literals.push(node.value);
    else if (node.type === "TemplateLiteral" && node.expressions.length === 0) usages.literals.push(node.quasis[0].value.cooked);
    else if (node.type === "TemplateLiteral") usages.templates.push(node.quasis.map((quasi) => quasi.value.cooked));
    if (node.type === "CallExpression" && isTranslateCall(node)) addKey(node.arguments[0]);
    else if (node.type === "JSXAttribute" && KEY_PROP.test(node.name.name)) addKey(node.value);
    else if (node.type === "Property" && KEY_PROP.test(propertyName(node.key) ?? "")) addKey(node.value);
    else if (node.type === "AssignmentPattern" && KEY_PROP.test(node.left.name ?? "")) addKey(node.right);
  });
  return usages;
};

const escapeRegExp = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
// A plural base also matches, so `items.${unit}` finds items.day when only items.day_one exists.
const pluralTail = `(?:_(?:${PLURAL_SUFFIXES.join("|")}))?`;
const patternRegExp = (quasis) => new RegExp(`^${quasis.map(escapeRegExp).join(".+")}${pluralTail}$`);
const pluralBase = (key) => PLURAL_KEY.exec(key)?.[1] ?? key;
// A template whose static text is only separators (`${prefix}.${key}`) could build any key.
const isOpenTemplate = (quasis) => !quasis.join("").replaceAll(/[._]/g, "");
const KEY_TAIL = /^[A-Za-z0-9_.]+$/;

/**
 * Checks the keys used by the source files against the reference locale.
 * @param {object} referenceLocale the parsed reference locale (en.json)
 * @param {{file: string, usages: ReturnType<typeof collectKeyUsages>}[]} files
 * @param {{ allowUnused?: string[] }} options keys the app never names itself but must keep (the API
 *   sends them); an entry ending in "." covers every key under it. Each entry must match a key.
 *
 * A key counts as used when it (or its plural base) is named in a key position or as any string
 * literal, matches a template with static text, is nested with `$t()`, or - in a file with an open
 * template such as `${prefix}.${key}` - splits into a prefix written anywhere in src and a tail
 * written in that file (`"providerTeam.members"` + `"empty"`).
 */
export const checkUsage = (referenceLocale, files, { allowUnused = [] } = {}) => {
  const entries = flattenLocale(referenceLocale);
  const keys = [...new Set(entries.map(([key]) => key))];
  const byBase = Map.groupBy(keys, pluralBase);
  const used = new Set();
  const markUsed = (key) => byBase.get(key)?.forEach((candidate) => used.add(candidate));
  const markMatching = (test) => keys.filter(test).forEach((key) => used.add(key));
  const errors = [];
  const stats = { static: 0, patterns: 0 };
  const tails = new Set();

  for (const { file, usages } of files) {
    stats.static += usages.keys.length;
    stats.patterns += usages.patterns.length;
    errors.push(...missingKeys(file, usages, byBase, keys));
    usages.keys.forEach(({ key }) => markUsed(key));
    usages.literals.forEach(markUsed);
    const templates = [...usages.patterns.map(({ quasis }) => quasis), ...usages.templates];
    for (const quasis of templates.filter((template) => !isOpenTemplate(template))) {
      const pattern = patternRegExp(quasis);
      markMatching((key) => pattern.test(key));
    }
    if (templates.some(isOpenTemplate)) usages.literals.filter((literal) => KEY_TAIL.test(literal)).forEach((tail) => tails.add(tail));
  }
  // An open template joins a prefix and a tail held in variables: a key counts when it splits into
  // a prefix written somewhere in src ("providerTeam.members") and a tail written in a file with
  // such a template ("empty").
  const allLiterals = new Set(files.flatMap(({ usages }) => usages.literals));
  markMatching((key) => {
    const segments = pluralBase(key).split(".");
    const splitsAt = (index) => allLiterals.has(segments.slice(0, index).join(".")) && tails.has(segments.slice(index).join("."));
    return segments.some((_, index) => index > 0 && splitsAt(index));
  });
  entries.filter(([, value]) => typeof value === "string").forEach(([, value]) => nestedKeys(value).forEach(markUsed));

  for (const entry of allowUnused) {
    const covered = keys.filter((key) => (entry.endsWith(".") ? key.startsWith(entry) : key === entry));
    if (covered.length) covered.forEach((key) => used.add(key));
    else errors.push(`allow-listed key "${entry}" matches no key any more: remove it from the allow-list`);
  }
  const unused = keys.filter((key) => !used.has(key));
  if (unused.length)
    errors.push(`Keys in the reference locale that nothing uses (delete them from every locale):\n  ${unused.join("\n  ")}`);

  return { errors, stats, unused };
};

// Rule 5 for one file: static keys that do not exist, dynamic keys that match none.
const missingKeys = (file, usages, byBase, keys) => [
  ...usages.keys
    .filter(({ key }) => !byBase.has(key))
    .map(({ key, line }) => `${file}:${line} uses the key "${key}", which is not in the reference locale`),
  ...usages.patterns
    .filter(({ quasis }) => {
      const pattern = patternRegExp(quasis);
      return !keys.some((key) => pattern.test(key));
    })
    .map(({ quasis, line }) => {
      const shown = quasis.join("${…}");
      return `${file}:${line} builds the key \`${shown}\`, which matches no key`;
    }),
];
