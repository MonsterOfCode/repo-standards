// every route a router of src/routers/api-v1-router.js serves is documented in that router's
// `apiDocs` (method + OpenAPI path), every documented route exists, and the aggregated OpenAPI
// document builds with an operationId and a success response for every operation. Shared by
// `npm run check:route-docs` and the Jest suite (route-docs-check.test.js).

// Routers mounted without an `apiDocs` export on purpose.
export const UNDOCUMENTED_ROUTERS = Object.freeze({
  // Serves the OpenAPI document itself (and the opt-in Swagger UI) - an operational surface.
  docsRouter: "serves /openapi.json and /docs",
  // test-only hooks, mounted only when E2E_TEST_HOOKS_ENABLED (never in production).
  e2eTestHooksRouter: "test-only E2E hooks",
});

// `router.use("/prefix", nameRouter)` lines and the `import nameRouter from "#/..."` they refer to.
// A mount whose router is not a default import of a `#/routers/...` module is reported (module null).
export const parseRouterMounts = (source) => {
  const imports = new Map(
    [...source.matchAll(/^import\s+(\w+)\s+from\s+"(#\/routers\/[^"]+)";$/gm)].map((match) => [match[1], match[2]])
  );
  return [...source.matchAll(/router\.use\(\s*"([^"]*)"\s*,\s*(\w+)\s*\)/g)].map((match) => ({
    prefix: match[1],
    name: match[2],
    module: imports.get(match[2]) ?? null,
  }));
};

// The Express route template a mounted route answers ("/requests" + "/:requestId"), without a
// trailing slash ("/requests" + "/" -> "/requests").
export const joinRoutePath = (prefix, routePath) =>
  `${prefix}/${routePath}`.replaceAll(/\/+/g, "/").replace(/(.)\/$/, "$1");

// Express ":param" -> OpenAPI "{param}".
export const toOpenApiPath = (prefix, routePath) => joinRoutePath(prefix, routePath).replaceAll(/:(\w+)/g, "{$1}");

const routeKey = ({ method, path }) => `${method.toUpperCase()} ${path}`;

// The method + path of every route a router declares (router.get/post/...), in declaration order.
export const listRouterRoutes = (router, prefix) =>
  router.stack
    .filter((layer) => layer.route)
    .flatMap(({ route }) => {
      // A route may list several paths (router.get(["/", ""], ...)); a RegExp path cannot be checked.
      const paths = [route.path].flat();
      if (!paths.every((path) => typeof path === "string")) {
        return [{ method: "?", path: `${prefix} ${String(route.path)} (only string paths can be checked)` }];
      }
      const methods = Object.keys(route.methods).filter((method) => method !== "_all");
      return methods.flatMap((method) =>
        paths.map((path) => ({ method: method.toUpperCase(), path: toOpenApiPath(prefix, path) }))
      );
    });

// Imports every router mounted by the API router source (`#/` module specifiers).
export const loadRouterMounts = async (source, importModule = (specifier) => import(specifier)) =>
  Promise.all(
    parseRouterMounts(source).map(async ({ name, prefix, module }) => {
      if (!module) return { name, prefix, router: null, apiDocs: undefined };
      const exports = await importModule(module);
      return { name, prefix, router: exports.default, apiDocs: exports.apiDocs };
    })
  );

// One mounted router: its routes against its apiDocs, both directions; `documentedBy` collects the
// documented routes of every router so one documented twice is reported.
const checkMount = ({ name, prefix, router, apiDocs }, { undocumentedRouters, documentedBy }) => {
  if (!router) return [`${name} (${prefix}) is not a default import of a #/routers/ module - cannot be checked`];
  if (!apiDocs) return Object.hasOwn(undocumentedRouters, name) ? [] : [`${name} (${prefix}) exports no apiDocs`];
  const served = new Set(listRouterRoutes(router, prefix).map(routeKey));
  const documented = new Set(apiDocs.map(routeKey));
  const duplicates = [...documented]
    .filter((key) => documentedBy.has(key))
    .map((key) => `${name}: apiDocs ${key} is also documented by ${documentedBy.get(key)}`);
  for (const key of documented) if (!documentedBy.has(key)) documentedBy.set(key, name);
  return [
    ...duplicates,
    ...[...served].filter((key) => !documented.has(key)).map((key) => `${name}: ${key} has no apiDocs entry`),
    ...[...documented].filter((key) => !served.has(key)).map((key) => `${name}: apiDocs ${key} has no route`),
  ];
};

// mounts: [{ name, prefix, router, apiDocs }] (apiDocs undefined when the module exports none).
export const checkRouteDocs = ({ mounts, undocumentedRouters = UNDOCUMENTED_ROUTERS }) => {
  const documentedBy = new Map();
  return mounts.flatMap((mount) => checkMount(mount, { undocumentedRouters, documentedBy }));
};

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

const checkOperation = ({ label, method, operation, seen }) => {
  const problems = [];
  if (!HTTP_METHODS.has(method)) problems.push(`OpenAPI ${label}: unknown method`);
  const { operationId } = operation;
  if (!operationId) problems.push(`OpenAPI ${label}: no operationId`);
  else if (seen.has(operationId)) {
    problems.push(`OpenAPI ${label}: operationId ${operationId} also used by ${seen.get(operationId)}`);
  } else seen.set(operationId, label);
  if (!Object.keys(operation.responses ?? {}).some((status) => /^[23]\d\d$/.test(status))) {
    problems.push(`OpenAPI ${label}: no success (2xx/3xx) response documented`);
  }
  return problems;
};

// The aggregated document: every operation has an operationId (unique) and a 2xx/3xx response.
export const checkOpenApiSpec = (spec) => {
  const seen = new Map();
  const problems = Object.entries(spec.paths ?? {}).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).flatMap(([method, operation]) =>
      checkOperation({ label: `${method.toUpperCase()} ${path}`, method, operation, seen })
    )
  );
  if (seen.size === 0) problems.push("OpenAPI document has no operation");
  return problems;
};
