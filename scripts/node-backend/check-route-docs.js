#!/usr/bin/env node
/* eslint-disable no-console */
// routes <-> apiDocs per router of src/routers/api-v1-router.js (both directions), and the
// aggregated OpenAPI document (operationId + success response everywhere). The logic lives in
// src/checks/route-docs-check.js, shared with the Jest suite (route-docs-check.test.js).

// The routers import the config, which validates the environment on import: load the Jest suite's
// fixed, non-secret environment (never the developer's .env).
import "../src/test/setup-env.js";
import { readFile } from "node:fs/promises";
import { checkOpenApiSpec, checkRouteDocs, loadRouterMounts } from "../src/checks/route-docs-check.js";
import { buildOpenApiSpec } from "../src/docs/openapi.js";
import { formatCheckReport } from "../src/checks/check-report.js";

const mounts = await loadRouterMounts(await readFile("src/routers/api-v1-router.js", "utf8"));
const spec = buildOpenApiSpec();
const operations = Object.values(spec.paths).reduce((count, pathItem) => count + Object.keys(pathItem).length, 0);
const report = formatCheckReport({
  title: "Route docs",
  problems: [...checkRouteDocs({ mounts }), ...checkOpenApiSpec(spec)],
  okSummary: `route docs ok (${mounts.length} routers, ${operations} documented operations)`,
});
console[report.ok ? "log" : "error"](report.output);
process.exitCode = report.ok ? 0 : 1;
