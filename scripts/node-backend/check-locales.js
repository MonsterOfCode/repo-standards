#!/usr/bin/env node
/* eslint-disable no-console */
// backend translations in lockstep (keys, interpolation variables, no empty value, no "ß").
// The logic lives in src/checks/locale-check.js (covered by Jest).

import en from "../src/locales/en.js";
import fr from "../src/locales/fr.js";
import de from "../src/locales/de.js";
import it from "../src/locales/it.js";
import { checkLocales, flattenLocale } from "../src/checks/locale-check.js";
import { formatCheckReport } from "../src/checks/check-report.js";

const report = formatCheckReport({
  title: "Locales",
  problems: checkLocales({ locales: { en, fr, de, it } }),
  okSummary: `locales ok (${flattenLocale(en).size} keys x 4 languages)`,
});
console[report.ok ? "log" : "error"](report.output);
process.exitCode = report.ok ? 0 : 1;
