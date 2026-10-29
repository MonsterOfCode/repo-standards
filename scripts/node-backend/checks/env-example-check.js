// .env.example documents every variable the configuration reads (src/config/config.js EnvSchema),
// and lists nothing it does not read; the deploy env examples only name variables something reads.

// Variables that are not in the config schema on purpose: each is read somewhere else.
export const ENV_EXAMPLE_ALLOW_LIST = Object.freeze({
  ENV_CONFIG: "src/config/dotenv.js: which env file to load (read before the config is parsed)",
  APP_CLIENT_SESSION_TRANSPORT: "create-app-clients migration: session transport of the seeded app client",
  MONGODB_AUTHORIZATION_ENABLED: "src/config/migrate-mongo.config.js and deploy/env/docker-compose.yml",
  MONGODB_USERNAME: "src/config/migrate-mongo.config.js: the migration user's credentials",
  MONGODB_PASSWORD: "src/config/migrate-mongo.config.js: the migration user's credentials",
  BACKUP_DIR: "scripts/backup-mongo.js and scripts/restore-mongo.js",
  BACKUP_RETENTION_DAYS: "scripts/backup-mongo.js",
  BACKUP_UPLOAD_COMMAND: "scripts/backup-mongo.js",
  FRONTEND_PORT: "scripts/frontend-dev-server.js",
  MAILPIT_API: "src/scripts/mailpit-smoke.js (npm run test:mailpit)",
});

// The variable names an env file mentions: `NAME=` lines, also commented out (`# NAME=`), which is
// how .env.example documents an optional variable and its default.
export const parseEnvExampleNames = (text) =>
  new Set(
    text
      .split(/\r?\n/)
      .map((line) => /^\s*(?:#\s*)?(?:export\s+)?([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
      .filter(Boolean)
  );

const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right));

export const checkEnvExample = ({ schemaNames, exampleNames, allowList = ENV_EXAMPLE_ALLOW_LIST }) => {
  const schema = new Set(schemaNames);
  const problems = [];
  for (const name of sorted(schema)) {
    if (!exampleNames.has(name)) problems.push(`.env.example: missing ${name} (read by src/config/config.js)`);
  }
  for (const name of sorted(exampleNames)) {
    if (!schema.has(name) && !Object.hasOwn(allowList, name)) {
      problems.push(`.env.example: ${name} is not read by the config (remove it, or allow-list where it is read)`);
    }
  }
  return problems;
};

// files: [{ file, names }] - every name must be read by the config or allow-listed.
export const checkDeployEnvExamples = ({ schemaNames, files, allowList = ENV_EXAMPLE_ALLOW_LIST }) => {
  const known = new Set([...schemaNames, ...Object.keys(allowList)]);
  return files.flatMap(({ file, names }) =>
    sorted(names)
      .filter((name) => !known.has(name))
      .map((name) => `${file}: ${name} is not read by the config`)
  );
};
