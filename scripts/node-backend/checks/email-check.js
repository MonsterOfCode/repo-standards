// every email of src/emails/email-catalogue.js, built in every supported language with sample
// values, has a subject, an html and a text part, none of them showing an unresolved {{placeholder}},
// "undefined", "null", "NaN" or "[object Object]"; and every translation key the email used exists in
// every locale (an i18next fallback to English would otherwise hide a missing translation).

const BUILDER_NAME = /^build\w*Email$/;
// "{{" only: a stylesheet legitimately closes nested blocks with "}}".
const LEAKED_VALUE = /\{\{|\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/;
const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];

// modules: { "src/emails/x.js": exports } - an exported build*Email missing from the catalogue.
export const findUnlistedBuilders = ({ modules, catalogue }) => {
  const listed = new Set(catalogue.map(({ builder }) => builder));
  return Object.entries(modules).flatMap(([file, exports]) =>
    Object.entries(exports)
      .filter(([name, value]) => BUILDER_NAME.test(name) && typeof value === "function" && !listed.has(value))
      .map(([name]) => `${file}: ${name} is not in EMAIL_CATALOGUE (src/emails/email-catalogue.js)`)
  );
};

export const checkRenderedMessage = (message) =>
  ["subject", "html", "text"].flatMap((part) => {
    const value = message?.[part];
    if (typeof value !== "string" || value.trim() === "") return [`${part} is empty`];
    const leak = LEAKED_VALUE.exec(value);
    return leak
      ? [`${part} contains "${leak[0]}" (…${value.slice(Math.max(0, leak.index - 40), leak.index + 20)}…)`]
      : [];
  });

const valueAt = (tree, key) =>
  key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), tree);

// A key resolves to a string, or (i18next plurals, called with `count`) to its plural forms.
export const keyExistsInLocale = (tree, key) =>
  typeof valueAt(tree, key) === "string" ||
  PLURAL_SUFFIXES.some((suffix) => typeof valueAt(tree, `${key}_${suffix}`) === "string");

// Runs fn while recording every key translated through i18n.getFixedT (what translatorFor uses).
export const recordTranslationKeys = (i18n, fn) => {
  const original = i18n.getFixedT;
  const keys = new Set();
  i18n.getFixedT = (...args) => {
    const t = original.apply(i18n, args);
    return (key, options) => {
      for (const one of [key].flat()) keys.add(one);
      return t(key, options);
    };
  };
  try {
    return { result: fn(), keys };
  } finally {
    i18n.getFixedT = original;
  }
};

const describeError = (err) => (err instanceof Error ? err.message : String(err));

// One catalogue entry in one language: [problems], plus the translation keys it used.
const checkEntryInLanguage = ({ entry, language, i18n, context }) => {
  const name = entry.builder.name;
  const { result: problems, keys } = recordTranslationKeys(i18n, () => {
    let samples;
    try {
      samples = entry.samples(context(language));
    } catch (err) {
      return [`${name} [${language}]: the samples failed to build (${describeError(err)})`];
    }
    if (samples.length === 0) return [`${name}: the catalogue has no sample`];
    return samples.flatMap((sample, index) => {
      const label = `${name} [${language}] sample ${index + 1}`;
      try {
        return checkRenderedMessage(entry.builder({ ...sample, language })).map((problem) => `${label}: ${problem}`);
      } catch (err) {
        return [`${label}: threw ${describeError(err)}`];
      }
    });
  });
  return { problems, keys };
};

const missingKeys = ({ usedKeys, locales }) =>
  [...usedKeys].flatMap(([key, builderName]) =>
    Object.entries(locales)
      .filter(([, tree]) => !keyExistsInLocale(tree, key))
      .map(([language]) => `${builderName}: key ${key} is missing in ${language}`)
  );

// context(language) -> what the samples need ({ language, unsubscribe(category), renderNotification }).
export const checkEmailCatalogue = ({ catalogue, modules, locales, i18n, context }) => {
  const problems = findUnlistedBuilders({ modules, catalogue });
  const usedKeys = new Map();
  for (const entry of catalogue) {
    for (const language of Object.keys(locales)) {
      const result = checkEntryInLanguage({ entry, language, i18n, context });
      problems.push(...result.problems);
      for (const key of result.keys) if (!usedKeys.has(key)) usedKeys.set(key, entry.builder.name);
    }
  }
  return [...problems, ...missingKeys({ usedKeys, locales })];
};
