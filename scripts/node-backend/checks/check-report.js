// the shared output of every commit check (scripts/check-*.js). A check is a pure function that
// returns a list of problems; the script prints them and exits 1, or prints one "✓ ... ok" line.

export const formatCheckReport = ({ title, problems, okSummary }) =>
  problems.length === 0
    ? { ok: true, output: `✓ ${okSummary}` }
    : {
        ok: false,
        output: [`✗ ${title}: ${problems.length} problem(s)`, ...problems.map((problem) => `  - ${problem}`)].join(
          "\n"
        ),
      };
