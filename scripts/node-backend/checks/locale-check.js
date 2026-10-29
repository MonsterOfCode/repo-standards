// the backend's translations (src/locales/{en,fr,de,it}.js) stay in lockstep. English is the
// reference: every locale has exactly its keys, every key uses the same interpolation variables in
// every language, no value is empty, and the German is Swiss Standard German (never "ß").

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// { a: { b: "x" } } -> Map { "a.b" => "x" }. A non-string leaf (a number, an array) is kept as is so
// the check can report it.
export const flattenLocale = (tree, prefix = "", entries = new Map()) => {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) flattenLocale(value, path, entries);
    else entries.set(path, value);
  }
  return entries;
};

// The i18next placeholders of one string: `{{name}}` (also `{{- name}}` and `{{name, format}}`) and
// nested translations `$t(key)`, as a sorted list of tokens.
export const interpolationTokens = (value) => {
  const text = String(value);
  const variables = [...text.matchAll(/\{\{-?\s*([^},\s]+)[^}]*\}\}/g)].map((match) => `{{${match[1]}}}`);
  const nestings = [...text.matchAll(/\$t\(\s*([^,)\s]+)[^)]*\)/g)].map((match) => `$t(${match[1]})`);
  return [...new Set([...variables, ...nestings])].sort((left, right) => left.localeCompare(right));
};

const describeTokens = (tokens) => (tokens.length === 0 ? "none" : tokens.join(", "));

const checkValue = ({ language, key, value }) => {
  if (typeof value !== "string") return [`${language}: ${key} is a ${Array.isArray(value) ? "list" : typeof value}`];
  if (value.trim() === "") return [`${language}: ${key} is empty`];
  if (language === "de" && value.includes("ß")) return [`de: ${key} uses "ß" (Swiss Standard German writes "ss")`];
  return [];
};

// One locale against the reference: missing keys, extra keys and interpolation differences.
const compareWithReference = ({ language, entries, referenceEntries, reference }) => [
  ...[...referenceEntries.keys()].filter((key) => !entries.has(key)).map((key) => `${language}: missing key ${key}`),
  ...[...entries].flatMap(([key, value]) => {
    if (!referenceEntries.has(key)) return [`${language}: extra key ${key} (not in ${reference})`];
    const expected = interpolationTokens(referenceEntries.get(key));
    const actual = interpolationTokens(value);
    return expected.join("|") === actual.join("|")
      ? []
      : [`${language}: ${key} uses ${describeTokens(actual)} but ${reference} uses ${describeTokens(expected)}`];
  }),
];

export const checkLocales = ({ locales, reference = "en" }) => {
  const flattened = Object.entries(locales).map(([language, tree]) => [language, flattenLocale(tree)]);
  const referenceEntries = new Map(flattened).get(reference);
  return flattened.flatMap(([language, entries]) => [
    ...[...entries].flatMap(([key, value]) => checkValue({ language, key, value })),
    ...(language === reference ? [] : compareWithReference({ language, entries, referenceEntries, reference })),
  ]);
};
