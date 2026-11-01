// The bundler's import aliases, in the format dependency-cruiser reads (a webpack-style
// "resolve.alias"). Copy next to .dependency-cruiser.cjs as .dependency-cruiser.aliases.cjs.
const path = require("node:path");

module.exports = {
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    extensions: [".js", ".jsx", ".mjs", ".json"],
  },
};
