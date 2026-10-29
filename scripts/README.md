# Reference scripts

Working implementations of the [commit checks](../standards/commit-checks.md), taken from one of our
projects (a Node/Express/MongoDB API and a React/Vite/Tailwind SPA, ESM). Copy what applies and
adapt the paths at the top of each file; keep the rules.

| Folder            | Files                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `node-backend/`   | `check-locales.js`, `check-emails.js`, `check-migrations-lock.js`, `check-migration-contract.js`, `check-route-docs.js`, `check-env-example.js` (thin CLIs) and `checks/*.js` (the tested logic; `check-report.js` formats the output). The commit message rule is `../config/commitlint.config.js` |
| `react-frontend/` | `check-translations.mjs`, `check-css.mjs`, `check-env-example.mjs` (thin CLIs) and `lib/*.mjs` (the tested logic; `ast.mjs` parses JS/JSX with espree) |

Project-specific parts to adapt:

- **Backend:**
  - the locale files and the reference locale;
  - the email catalogue module and how an email is built;
  - the migrations folder and config;
  - the router that mounts the API and the OpenAPI builder;
  - the config module that exports the list of environment variables (`ENV_VARIABLE_NAMES`);
  - the test-environment setup the scripts load instead of a developer's `.env`.
- **Frontend:**
  - the locales folder;
  - the keys only the API sends (allow-list);
  - the CSS class prefix (`CSS_CLASS_PREFIX`);
  - third-party class prefixes and framework overrides (allow-lists).

Write tests for the copied logic (fixtures for every rule) so it counts in the 100% coverage gate.
