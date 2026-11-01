// Layer rules of the architecture standard (standards/architecture.md, section 3) for a
// Node API with the layer folders under src/. Adapt the folder names at the top, keep the rules.
// Run: npx depcruise src --config .dependency-cruiser.cjs (npm run check:architecture).
const SRC = "^src/";
const layer = (name) => `${SRC}${name}/`;
// The composition roots: the files that wire the app together. List yours, explicitly; keep it short.
const COMPOSITION_ROOTS = [
  // The app entry and the Express app builder (mount the routers, start the job scheduler).
  `${SRC}(create-app|application|app)\\.js$`,
  // The root router that mounts every API router.
  `${SRC}routers/api-v1-router\\.js$`,
  // The OpenAPI aggregator (reads every router's docs).
  `${SRC}docs/openapi\\.js$`,
  // The tests.
  layer("test"),
];

module.exports = {
  forbidden: [
    {
      name: "ARCH-B1-no-upward-import",
      comment:
        "Only the composition roots listed above import routers and jobs; nothing imports a test.",
      severity: "error",
      from: { pathNot: COMPOSITION_ROOTS },
      // A router module is a file named *-router.js; a helper next to the routers (shared filters, the
      // OpenAPI parameters of a list) may be imported by the routers that share it.
      to: { path: [`${SRC}routers/.+-router\\.js$`, layer("jobs"), layer("test")] },
    },
    {
      name: "ARCH-B2-routers-no-database",
      comment: "A router validates, authorizes, calls a service and shapes the response; it never queries the database.",
      severity: "error",
      from: { path: layer("routers") },
      to: { path: [layer("database"), layer("adapters")] },
    },
    {
      name: "ARCH-B3-domain-is-pure",
      comment: "Domain rules are pure functions: no database, service, adapter, router, job or email.",
      severity: "error",
      from: { path: layer("domain") },
      to: { path: [layer("database"), layer("services"), layer("adapters"), layer("routers"), layer("jobs"), layer("emails")] },
    },
    {
      name: "ARCH-B4-models-below-services",
      comment: "Models describe a collection; they never call services, policies, routers or jobs.",
      severity: "error",
      from: { path: layer("models") },
      to: { path: [layer("services"), layer("policies"), layer("routers"), layer("jobs"), layer("adapters")] },
    },
    {
      name: "ARCH-B5-util-has-no-domain",
      comment: "util/ holds generic helpers with no product knowledge: it imports only util, config and errors.",
      severity: "error",
      from: { path: layer("util") },
      to: { path: [layer("services"), layer("models"), layer("policies"), layer("domain"), layer("routers"), layer("jobs"), layer("adapters"), layer("database")] },
    },
    {
      name: "ARCH-B6-config-is-the-only-env-reader",
      comment: "config/ imports nothing from the product layers.",
      severity: "error",
      from: { path: layer("config") },
      to: { path: [layer("services"), layer("models"), layer("policies"), layer("routers"), layer("jobs"), layer("adapters"), layer("database")] },
    },
    {
      name: "ARCH-B7-no-circular",
      comment: "No import cycle.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "node_modules" },
    // Resolves "#/x.js" through package.json "imports" and ESM "exports".
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
