#!/usr/bin/env node
/**
 * Lint-surface detection (A-1203). Finds the branch's changes to lint / format /
 * static-analysis config files and the ignore / disable directives it adds — the
 * surfaces `references/lint-surfaces.md` makes a developer decision. Reported in
 * the preflight summary, never blocking: preflight can't tell whether the agent
 * or the developer made the change, so it surfaces it for the developer to
 * confirm.
 */
import { spawnSync } from "node:child_process";

/**
 * Lint / format config files, matched against the repo-relative path. Mirrors
 * the config list in `references/lint-surfaces.md`.
 */
const CONFIG_PATTERNS = [
  /(^|\/)eslint\.config\.[cm]?[jt]s$/,
  /(^|\/)\.eslintrc(\.[a-z]+)?$/,
  /(^|\/)\.eslintignore$/,
  /(^|\/)eslint-suppressions\.json$/,
  /(^|\/)\.markdownlint[\w.-]*$/,
  /(^|\/)\.yamllint(\.ya?ml)?$/,
  /(^|\/)\.prettierrc[\w.]*$/,
  /(^|\/)\.prettierignore$/,
  /(^|\/)prettier\.config\.[cm]?[jt]s$/,
  /(^|\/)\.shellcheckrc$/,
  /^\.github\/actionlint\.ya?ml$/,
];

const SCRIPT_FILE = /\.([cm]?[jt]sx?|vue|svelte|astro)$/;
const MARKDOWN_FILE = /\.mdx?$/;
const YAML_FILE = /\.ya?ml$/;
const SHELL_FILE = /(\.(sh|bash|zsh)|(^|\/)\.husky\/[\w-]+)$/;

// Directive syntax per file type, so prose that merely *mentions* a directive
// (a doc listing `eslint-disable`, say) is not flagged. Each entry is
// [directive name, file-type test, pattern over the added line's text].
const DIRECTIVES = [
  [
    "eslint-disable",
    (file) => SCRIPT_FILE.test(file),
    /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b/,
  ],
  [
    "prettier-ignore",
    (file) => SCRIPT_FILE.test(file),
    /(?:\/\/|\/\*)\s*prettier-ignore\b/,
  ],
  [
    "markdownlint-disable",
    (file) => MARKDOWN_FILE.test(file),
    /^\s*<!--\s*markdownlint-disable(?:-next-line|-line|-file)?\b/,
  ],
  [
    "prettier-ignore",
    (file) => MARKDOWN_FILE.test(file),
    /^\s*<!--\s*prettier-ignore(?:-start)?\b/,
  ],
  [
    "yamllint disable",
    (file) => YAML_FILE.test(file),
    /#\s*yamllint\s+disable(?:-line|-file)?\b/,
  ],
  ["prettier-ignore", (file) => YAML_FILE.test(file), /#\s*prettier-ignore\b/],
  [
    "shellcheck disable",
    (file) => SHELL_FILE.test(file),
    /#\s*shellcheck\s+disable=/,
  ],
];

/**
 * Whether a repo-relative path is a lint / format config file.
 * @param {string} path
 * @returns {boolean}
 */
export function isLintConfigPath(path) {
  const normalised = String(path).replace(/^\.\//, "");
  return CONFIG_PATTERNS.some((pattern) => pattern.test(normalised));
}

/**
 * The ignore / disable directive an added line introduces in `file`, or null.
 * @param {string} file
 * @param {string} text
 * @returns {string | null}
 */
export function findIgnoreDirective(file, text) {
  for (const [name, appliesTo, pattern] of DIRECTIVES) {
    if (appliesTo(file) && pattern.test(text)) {
      return name;
    }
  }

  return null;
}

/**
 * Parse `git diff -U0` output into the lines each file adds, with their
 * new-file line numbers. Pure.
 * @param {string} diffText
 * @returns {Map<string, Array<{ line: number, text: string }>>}
 */
export function parseAddedLines(diffText) {
  /** @type {Map<string, Array<{ line: number, text: string }>>} */
  const byFile = new Map();
  let file = null;
  let inHunk = false;
  let next = 0;
  for (const raw of String(diffText).split("\n")) {
    // A new file section: its `---` / `+++` headers come before any hunk, so a
    // content line that happens to start with `+++` is never read as a header.
    if (raw.startsWith("diff --git ")) {
      file = null;
      inHunk = false;
      continue;
    }

    if (raw.startsWith("@@")) {
      const plus = /\+(\d+)/.exec(raw);
      next = plus ? Number(plus[1]) : 0;
      inHunk = true;
      continue;
    }

    if (!inHunk) {
      if (raw.startsWith("+++ ")) {
        const path = raw.slice(4);
        file = path === "/dev/null" ? null : path.replace(/^b\//, "");
      }

      continue;
    }

    if (file && raw.startsWith("+")) {
      if (!byFile.has(file)) {
        byFile.set(file, []);
      }

      byFile.get(file).push({ line: next, text: raw.slice(1) });
      next += 1;
    }
  }

  return byFile;
}

/**
 * Assemble the lint-surface report from the branch's changed files and the
 * lines it adds. Pure.
 * @param {string[]} changedFiles
 * @param {Map<string, Array<{ line: number, text: string }>>} addedLines
 * @returns {{ count: number, configFiles: string[], directives: Array<{ file: string, line: number, directive: string, text: string }> }}
 */
export function buildLintSurface(changedFiles, addedLines) {
  const configFiles = changedFiles.filter((file) => isLintConfigPath(file));
  const directives = [];
  for (const [file, lines] of addedLines) {
    if (isLintConfigPath(file)) {
      continue;
    }

    for (const { line, text } of lines) {
      const directive = findIgnoreDirective(file, text);
      if (directive) {
        directives.push({ directive, file, line, text: text.trim() });
      }
    }
  }

  return {
    configFiles,
    count: configFiles.length + directives.length,
    directives,
  };
}

// Paths per `git diff` call, so a branch touching thousands of files never hits
// the argument-length limit.
const DIFF_CHUNK = 100;

/**
 * The changed files an ignore / disable directive could appear in: a file type
 * with a directive pattern, and not itself lint config (reported whole).
 * Diffing only these keeps an unrelated large change — a lockfile, generated
 * data — out of the scan.
 * @param {string[]} changedFiles
 * @returns {string[]}
 */
export function directiveCandidates(changedFiles) {
  return changedFiles.filter(
    (file) =>
      !isLintConfigPath(file) &&
      DIRECTIVES.some(([, appliesTo]) => appliesTo(file)),
  );
}

/**
 * Detect the branch's lint-surface changes against `mergeBase`. Never throws:
 * the report is informational, so a failed directive scan must not fail the
 * lint gate. It comes back with `error` set (and the config files, which need
 * no diff) instead of reading as "no lint surfaces".
 * @param {string} mergeBase
 * @param {string[]} changedFiles
 * @param {string} [cwd]
 */
export function detectLintSurface(
  mergeBase,
  changedFiles,
  cwd = process.cwd(),
) {
  const candidates = directiveCandidates(changedFiles);
  /** @type {Map<string, Array<{ line: number, text: string }>>} */
  const addedLines = new Map();
  for (let index = 0; index < candidates.length; index += DIFF_CHUNK) {
    const chunk = candidates.slice(index, index + DIFF_CHUNK);
    const result = spawnSync(
      "git",
      ["diff", `${mergeBase}...HEAD`, "-U0", "--no-color", "--", ...chunk],
      { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (result.error || result.status !== 0) {
      const detail =
        result.error?.message ||
        result.stderr?.trim() ||
        "unknown git diff error";
      return {
        ...buildLintSurface(changedFiles, new Map()),
        error: `directive scan skipped — git diff failed: ${detail}`,
      };
    }

    for (const [file, lines] of parseAddedLines(result.stdout)) {
      addedLines.set(file, lines);
    }
  }

  return buildLintSurface(changedFiles, addedLines);
}

export const EMPTY_LINT_SURFACE = Object.freeze({
  configFiles: [],
  count: 0,
  directives: [],
});
