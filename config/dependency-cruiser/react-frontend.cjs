// Layer rules of the architecture standard (standards/architecture.md, section 4) for a React SPA
// with the layer folders under src/app/. Adapt the folder names at the top, keep the rules.
// Run: npx depcruise src --config .dependency-cruiser.cjs (npm run check:architecture).
const APP = "^src/app/";
const layer = (name) => `${APP}${name}/`;

module.exports = {
  forbidden: [
    {
      name: "ARCH-F1-pages-are-leaves",
      comment:
        "Only the router imports pages. A page never imports another page; what two pages share moves to components/, hooks/ or util/.",
      severity: "error",
      from: { path: `${APP}(?!routes/)`, pathNot: `${APP}pages/` },
      to: { path: layer("pages") },
    },
    {
      name: "ARCH-F2-no-cross-area-page-import",
      comment: "A page area never imports from another area: move the shared piece to components/, hooks/ or util/.",
      severity: "error",
      from: { path: `${APP}pages/([^/]+)/` },
      to: { path: `${APP}pages/`, pathNot: [`${APP}pages/$1/`, String.raw`${APP}pages/[^/]+\.jsx?$`] },
    },
    {
      name: "ARCH-F3-server-calls-only-in-store-api",
      comment: "Only store/api (and the fetch wrapper in util/) talk to the server: no fetch or axios in a component, page or hook.",
      severity: "error",
      from: { path: [layer("components"), layer("pages"), layer("hooks"), layer("layout")] },
      to: { path: "node_modules/(axios|ky|ofetch)/" },
    },
    {
      name: "ARCH-F4-ui-primitives-have-no-domain",
      comment:
        "components/ui and components/forms are the design-system primitives: they never fetch data (store) and never import a page, the layout or a product component.",
      severity: "error",
      from: { path: `${APP}components/(ui|forms)/` },
      to: { path: [layer("store"), layer("pages"), layer("layout"), `${APP}components/(?!ui/|forms/)`] },
    },
    {
      name: "ARCH-F5-store-has-no-ui",
      comment: "store/ (API slices, reducers) never imports components, pages, layout or hooks.",
      severity: "error",
      from: { path: layer("store") },
      to: { path: [layer("components"), layer("pages"), layer("layout"), layer("hooks")] },
    },
    {
      name: "ARCH-F6-util-has-no-ui",
      comment: "util/ holds plain functions: no React component, page, layout or store.",
      severity: "error",
      from: { path: layer("util") },
      to: { path: [layer("components"), layer("pages"), layer("layout"), layer("store"), layer("hooks")] },
    },
    {
      name: "ARCH-F7-no-circular",
      comment: "No import cycle.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: String.raw`(node_modules|\.test\.jsx?$)` },
    tsPreCompilationDeps: false,
    // Resolves the "@/..." alias. Use the same alias as the bundler (vite.config.js).
    enhancedResolveOptions: { extensions: [".js", ".jsx", ".mjs", ".json"] },
    webpackConfig: { fileName: ".dependency-cruiser.aliases.cjs" },
  },
};
