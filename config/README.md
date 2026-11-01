# Reference configuration

- `commitlint.config.js`: the commit message format of the commit checks standard; self-contained, copy to the project root, `npm i -D @commitlint/cli`.
- `gitleaks.toml`: extends gitleaks' default rules; the allow-lists are examples (test fixtures, docs that name secrets without values) - adapt them, never allow-list a real secret.
- `husky/node-backend/`, `husky/react-frontend/`: the `pre-commit`, `commit-msg` and `pre-push` hooks (`npm i -D husky`, `"prepare": "husky"`).
- `dependency-cruiser/node-backend.cjs`, `dependency-cruiser/react-frontend.cjs`: the layer rules of the architecture standard (ARCH-B1–B7, ARCH-F1–F7); copy to the project root as `.dependency-cruiser.cjs`, `npm i -D dependency-cruiser`, `"check:architecture": "depcruise src --config .dependency-cruiser.cjs"`. The frontend one reads the bundler's `@/` alias from `react-frontend.aliases.cjs`, copied as `.dependency-cruiser.aliases.cjs`.
