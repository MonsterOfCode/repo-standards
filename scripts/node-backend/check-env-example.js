#!/usr/bin/env node
/* eslint-disable no-console */
// .env.example <-> the config schema, both directions; the deploy env examples name only known
// variables. The logic lives in src/checks/env-example-check.js (covered by Jest).

// The config validates the environment when it is imported: load the Jest suite's fixed, non-secret
// environment (never the developer's .env).
import "../src/test/setup-env.js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ENV_VARIABLE_NAMES } from "../src/config/config.js";
import { checkDeployEnvExamples, checkEnvExample, parseEnvExampleNames } from "../src/checks/env-example-check.js";
import { formatCheckReport } from "../src/checks/check-report.js";

const DEPLOY_EXAMPLES_DIR = "deploy/env/examples";
const deployFiles = (await readdir(DEPLOY_EXAMPLES_DIR))
  .filter((file) => /^app\..+\.env\.example$/.test(file))
  .sort((left, right) => left.localeCompare(right));
const [exampleText, ...deployTexts] = await Promise.all([
  readFile(".env.example", "utf8"),
  ...deployFiles.map((file) => readFile(join(DEPLOY_EXAMPLES_DIR, file), "utf8")),
]);

const problems = [
  ...checkEnvExample({ schemaNames: ENV_VARIABLE_NAMES, exampleNames: parseEnvExampleNames(exampleText) }),
  ...checkDeployEnvExamples({
    schemaNames: ENV_VARIABLE_NAMES,
    files: deployFiles.map((file, index) => ({
      file: join(DEPLOY_EXAMPLES_DIR, file),
      names: parseEnvExampleNames(deployTexts[index]),
    })),
  }),
];
const report = formatCheckReport({
  title: "Env examples",
  problems,
  okSummary: `env examples ok (${ENV_VARIABLE_NAMES.length} config variables, ${deployFiles.length} deploy examples)`,
});
console[report.ok ? "log" : "error"](report.output);
process.exitCode = report.ok ? 0 : 1;
