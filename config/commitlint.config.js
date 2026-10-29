// Commit message format of the commit-checks standard, checked by the commit-msg hook and in CI:
//
//   type(scope)?: (#<issue> )?subject        e.g. "fix(billing): #42 round the VAT per line"
//
// type: one of COMMIT_TYPES; scope: optional, lowercase kebab-case; "#123 ": the issue the commit
// belongs to, right after ": ", whenever one exists; subject: not empty, no trailing period; the whole
// header at most 100 characters. Body and footers are free (e.g. "Closes #42", "Co-Authored-By: ...").
// Self-contained: copy this file to the project root and `npm i -D @commitlint/cli`.
const COMMIT_TYPES = ["feat", "fix", "refactor", "perf", "test", "docs", "build", "ci", "chore", "style", "revert"];
const MAX_LENGTH = 100;
const HEADER = /^(?<type>[^(:!\s]+)(?:\((?<scope>[^)]*)\))?: (?:#(?<issue>\d+) )?(?<subject>.*)$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXAMPLE = "e.g. `fix(billing): #42 round the VAT per line` or `docs: describe the release`";

export const checkCommitHeader = (header) => {
  const value = String(header ?? "");
  if (value.length > MAX_LENGTH) return [`header is ${value.length} characters, at most ${MAX_LENGTH}`];
  const match = HEADER.exec(value);
  if (!match) return [`header must be "type(scope)?: (#issue )?subject" - ${EXAMPLE}`];
  const { type, scope, issue, subject } = match.groups;
  const problems = [];
  if (!COMMIT_TYPES.includes(type)) problems.push(`type "${type}" must be one of ${COMMIT_TYPES.join(", ")}`);
  if (scope !== undefined && !KEBAB.test(scope)) problems.push(`scope "${scope}" must be lowercase kebab-case`);
  if (subject.trim() === "" || subject !== subject.trim()) {
    problems.push(issue ? "subject must follow the issue reference" : "subject must not be empty or start/end with spaces");
  } else if (subject.startsWith("#")) problems.push('the issue reference is "#123 " followed by the subject');
  if (subject.endsWith(".")) problems.push("subject must not end with a period");
  return problems;
};

const headerFormatRule = (parsed) => {
  const problems = checkCommitHeader(parsed.header);
  return [problems.length === 0, problems.join("; ")];
};

export default {
  plugins: [{ rules: { "header-format": headerFormatRule } }],
  rules: { "header-format": [2, "always"] },
};
