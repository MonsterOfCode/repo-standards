// Shared AST helpers of the check scripts (scripts/lib/*.mjs). Parsed with espree, the parser
// ESLint itself uses (installed with eslint, no extra dependency).
import { parse } from "espree";

/** Parses a JS/JSX module (with line numbers). */
export const parseModule = (source) =>
  parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, loc: true });

/** Walks an espree AST depth first, calling `onNode` for every node. */
export const visit = (node, onNode) => {
  if (!node || typeof node.type !== "string") return;
  onNode(node);
  for (const [field, child] of Object.entries(node)) {
    if (field === "parent" || !child || typeof child !== "object") continue;
    if (Array.isArray(child)) child.forEach((item) => visit(item, onNode));
    else visit(child, onNode);
  }
};
