#!/usr/bin/env node
/* eslint-disable no-console */
// builds every email of src/emails/email-catalogue.js in every language with sample values and
// checks subject/html/text and the translation keys used. The logic lives in src/checks/email-check.js
// (covered by Jest).

// The email builders import the config, which validates the environment on import: load the Jest
// suite's fixed, non-secret environment (never the developer's .env; EMAIL_SIMULATE_MODE on).
import "../src/test/setup-env.js";
import en from "../src/locales/en.js";
import fr from "../src/locales/fr.js";
import de from "../src/locales/de.js";
import it from "../src/locales/it.js";
import i18n from "../src/config/i18n.js";
import { EMAIL_BUILDER_MODULES, EMAIL_CATALOGUE } from "../src/emails/email-catalogue.js";
import { renderNotificationContent } from "../src/domain/notification-content.js";
import { unsubscribeFooterFor } from "../src/services/email-service.js";
import { checkEmailCatalogue } from "../src/checks/email-check.js";
import { formatCheckReport } from "../src/checks/check-report.js";

const locales = { en, fr, de, it };
const problems = checkEmailCatalogue({
  catalogue: EMAIL_CATALOGUE,
  modules: EMAIL_BUILDER_MODULES,
  locales,
  i18n,
  context: (language) => ({
    language,
    unsubscribe: (category) => unsubscribeFooterFor({ to: "someone@example.ch", category, language }),
    renderNotification: (notification) => renderNotificationContent({ ...notification, language }),
  }),
});
const report = formatCheckReport({
  title: "Emails",
  problems,
  okSummary: `emails ok (${EMAIL_CATALOGUE.length} builders x ${Object.keys(locales).length} languages)`,
});
console[report.ok ? "log" : "error"](report.output);
process.exitCode = report.ok ? 0 : 1;
