# Reference configuration

- `commitlint.config.js`: the commit message format of the commit checks standard; self-contained, copy to the project root, `npm i -D @commitlint/cli`.
- `gitleaks.toml`: extends gitleaks' default rules; the allow-lists are examples (test fixtures, docs that name secrets without values) - adapt them, never allow-list a real secret.
- `husky/node-backend/`, `husky/react-frontend/`: the `pre-commit`, `commit-msg` and `pre-push` hooks (`npm i -D husky`, `"prepare": "husky"`).
