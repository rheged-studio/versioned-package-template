// Detector registry keyed by config-KEY NAME, not by skill (A-409).
//
// One detector per config key serves every skill that uses it — `baseBranch`
// covers changelog + send-it + preflight; `issueKeys` covers changelog +
// cleanup-repo + linear-sync + triage-pr. A key in a skill's config.example.json with NO
// entry here is reported as `needs-manual-input`; the merge then leaves it for
// the user (or a Linear MCP fact) to supply.
//
// Each detector returns `{ value }` when it can determine the key, or `null`
// when it cannot (→ needs-manual-input). Detectors read host-repo state via the
// shared context; results are memoised so a key shared by several skills is only
// computed once.

import { detectBaseBranch, detectIssueKeys } from "./git.mjs";
import { detectPackageRoots } from "./workspace.mjs";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Fixed defaults that don't depend on the host repo.
 */
const SHIPPABLE_MANIFEST_KEYS = ["name", "version", "files", "publishConfig"];
const REVIEW_BOTS = ["claude", "coderabbitai"];
const MAX_CI_ROUNDS = 5;
const REVIEW_IDLE_MINUTES = 10;
const MAX_REVIEW_ROUNDS = 2;
const REVIEW_WAIT_MAX_MINUTES = 20;
// The estate Claude review reusable workflow (rheged-studio/shared-workflows).
// A repo calling it gets a `<caller job id> / claude-review` check run on every
// reviewed head, posted by GitHub Actions (A-2453).
// Only the estate's own shared-workflows repo counts — a same-named reusable
// workflow elsewhere need not post a `claude-review` check. The pre-rename
// `acme-skunkworks` owner still resolves via GitHub's redirect, and some callers
// have not been re-pointed yet.
const CLAUDE_REVIEW_REUSABLE =
  /^\s*uses:\s*["']?(?:rheged-studio|acme-skunkworks)\/shared-workflows\/\.github\/workflows\/reusable-claude-code-review\.ya?ml@/;
const CLAUDE_REVIEW_PRODUCER = "github-actions";

/**
 * Detect the published surface from the root package.json `files` field (the
 * paths npm would ship), else fall back to detected workspace roots, else [].
 * @param {string} repoRoot
 * @param {string[]} packageRoots
 * @returns {string[]}
 */
function detectShippablePaths(repoRoot, packageRoots) {
  const pkgFile = join(repoRoot, "package.json");
  if (existsSync(pkgFile)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
      if (Array.isArray(pkg.files) && pkg.files.length > 0) {
        // Preserve explicit manifest entries verbatim — `files` lists what npm
        // ships, which can be individual files (README.md) or globs
        // (dist/**/*.js), not just directories. Appending "/" would mangle them.
        return pkg.files.filter((file) => typeof file === "string");
      }
    } catch {
      // fall through
    }
  }

  // Only the directory-based fallback gets a synthesised trailing slash.
  return packageRoots.map((root) => (root.endsWith("/") ? root : `${root}/`));
}

/**
 * Whether the repo ships multiple independently-versioned skill bundles under a
 * top-level dir (the signal that `bundleVersioning` is relevant). Looks for a
 * directory containing at least one subdir with a SKILL.md.
 * @param {string} repoRoot
 * @returns {string | null} the bundle root dir, or null
 */
function detectBundleRoot(repoRoot) {
  for (const candidate of ["skills", "packages"]) {
    const directory = join(repoRoot, candidate);
    if (!existsSync(directory)) {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    const hasBundle = entries.some(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(directory, entry.name, "SKILL.md")),
    );
    if (hasBundle) {
      return candidate;
    }
  }

  return null;
}

/**
 * Find the job id of the estate Claude review caller — the job in
 * `.github/workflows/*.yml|yaml` whose `uses:` is shared-workflows'
 * `reusable-claude-code-review.yml`. The caller job id is the leading segment of
 * the check-run name GitHub posts (`<job id> / claude-review`), so it is what
 * triage-pr's `reviewBotChecks` must name. A line scan rather than a YAML parse:
 * the bundle is zero-dependency, and a caller is a plain two-level `jobs:` entry.
 * @param {string} repoRoot
 * @returns {string | null} the caller job id, or null when no caller exists
 */
export function detectClaudeReviewCallerJob(repoRoot) {
  const directory = join(repoRoot, ".github", "workflows");
  let entries;
  try {
    entries = readdirSync(directory).toSorted();
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!/\.ya?ml$/.test(entry)) {
      continue;
    }

    let text;
    try {
      text = readFileSync(join(directory, entry), "utf8");
    } catch {
      continue;
    }

    let inJobs = false;
    let jobIndent = null;
    let jobId = null;
    // Indentation of the current job's direct fields (`uses:`, `secrets:` …).
    // A `uses:` line any deeper — inside a `run: |` block, say — is not the
    // job's own call, so it never matches.
    let fieldIndent = null;
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*(#|$)/.test(line)) {
        continue;
      }

      const indent = line.length - line.trimStart().length;
      if (indent === 0) {
        inJobs = /^jobs:\s*(#.*)?$/.test(line);
        jobIndent = null;
        jobId = null;
        fieldIndent = null;
        continue;
      }

      if (!inJobs) {
        continue;
      }

      jobIndent ??= indent;
      const key = /^\s*["']?([\w-]+)["']?:\s*(#.*)?$/.exec(line);
      if (indent === jobIndent && key) {
        jobId = key[1];
        fieldIndent = null;
        continue;
      }

      if (!jobId || indent <= jobIndent) {
        continue;
      }

      fieldIndent ??= indent;
      if (indent === fieldIndent && CLAUDE_REVIEW_REUSABLE.test(line)) {
        return jobId;
      }
    }
  }

  return null;
}

/**
 * Build a memoised `detect(key)` for a host repo.
 * @param {object} params
 * @param {string} params.repoRoot host repo root the detectors scan
 * @param {{ linearTeamName?: string, linearWorkspaceSlug?: string, issueKeys?: string[], followUpProject?: string }} [params.linearFacts]
 *   facts the script cannot derive from git/fs (supplied by Claude via the Linear MCP)
 * @returns {{ detect: (key: string) => ({ value: unknown } | null), has: (key: string) => boolean }}
 */
export function createDetectors({ linearFacts = {}, repoRoot }) {
  const cache = new Map();

  const registry = {
    // Monorepo gate for changelog's `affected_packages` field. True only when a
    // real workspace config was detected (the same signal `packageRoots` reads),
    // so single-package repos get `false` and their entries stay clean. Always
    // emits a value (`false` is a real signal, not "couldn't detect").
    affectedPackages: () => ({ value: detect("packageRoots") !== null }),
    baseBranch: () => ({ value: detectBaseBranch(repoRoot) }),
    bundleVersioning: () => {
      const root = detectBundleRoot(repoRoot);
      return root
        ? { value: { manifest: "package.json", root, skillFile: "SKILL.md" } }
        : null;
    },
    // send-it's changelog step is enabled when the repo actually has a changelog
    // flow of its own — a `changelog/` directory at the repo root. Keying off the
    // companion `changelog` skill merely being *vendored* misfires: a repo that
    // over-installed the skill but keeps no changelog of its own (e.g.
    // release-orchestrator, which runs *other* repos' `changelog:finalise`) was
    // wrongly flipped `true` and would then try to author entries with nowhere to
    // live (A-570). A repo with no `changelog/` dir gets `false` so send-it skips
    // authoring entirely.
    //
    // Like `changelogDir` / `fallbackPackage`, this always emits a value (never
    // `null`): `false` is a real detected signal, not "couldn't detect", so the
    // merge writes it. Contrast `bundleVersioning`, which returns `null` when
    // disabled so the key is left untouched.
    changelog: () => ({
      // A directory specifically — a plain file named `changelog` must not enable
      // the flow. throwIfNoEntry:false returns undefined when absent.
      value:
        statSync(join(repoRoot, "changelog"), {
          throwIfNoEntry: false,
        })?.isDirectory() ?? false,
    }),
    // changelogDir / fallbackPackage are structural conventions with sound
    // generic defaults (mirroring the changelog bundle's own DEFAULTS) — emit
    // them confidently rather than flagging for manual input.
    changelogDir: () => ({ value: "changelog" }),
    // No repo signal; emit triage-pr's default-on impact gate (never null) so it isn't flagged needs-manual-input — a later edit reads as drift and is kept.
    deferNonBlocking: () => ({ value: true }),
    fallbackPackage: () => ({ value: "infrastructure" }),
    // triage-pr follow-up capture: estate default label matches config.example.json
    // so a configured "follow-up" is not wiped when it equals the example (A-2054).
    followUpLabel: () => ({ value: "follow-up" }),
    followUpProject: () => {
      const fromFacts = linearFacts.followUpProject;
      if (typeof fromFacts === "string" && fromFacts.trim()) {
        return { value: fromFacts.trim() };
      }

      if (linearFacts.linearTeamName) {
        return null;
      }

      return { value: "" };
    },
    followUpState: () => ({ value: "Backlog" }),
    // No repo signal; emit triage-pr's unattended default (never null) so it isn't
    // flagged needs-manual-input — a later edit reads as drift and is kept.
    humanEnvelope: () => ({ value: false }),
    issueKeys: () => {
      const fromFacts = linearFacts.issueKeys;
      if (Array.isArray(fromFacts) && fromFacts.length > 0) {
        return { value: fromFacts };
      }

      const keys = detectIssueKeys(repoRoot);
      return keys.length > 0 ? { value: keys } : null;
    },
    linearTeamName: () =>
      linearFacts.linearTeamName ? { value: linearFacts.linearTeamName } : null,
    linearWorkspaceSlug: () =>
      linearFacts.linearWorkspaceSlug
        ? { value: linearFacts.linearWorkspaceSlug }
        : null,
    // cleanup-repo's merge-detection trunk: the same branch the rest of the
    // tooling treats as the base, so a master/develop repo cleans up correctly.
    mainBranch: () => ({ value: detect("baseBranch").value }),
    maxCiRounds: () => ({ value: MAX_CI_ROUNDS }),
    maxReviewRounds: () => ({ value: MAX_REVIEW_ROUNDS }),
    // Declared workspace roots → value; no manifest and none of the default
    // candidates on disk → null ("couldn't detect"), so the merge keeps the
    // existing value / flags needs-manual-input rather than writing a guess.
    packageRoots: () => {
      const roots = detectPackageRoots(repoRoot);
      return roots.length > 0 ? { value: roots } : null;
    },
    // No repo signal; emit triage-pr's default-on promotion default (never null) so it isn't flagged needs-manual-input — a later edit reads as drift and is kept.
    promoteOnGreen: () => ({ value: true }),
    // Protect the detected default branch, not a hard-coded "main", so a
    // master/develop repo gets a consistent result.
    protectedBranches: () => ({ value: [detect("baseBranch").value] }),
    // No repo signal; emit triage-pr's own default (never null) so it isn't flagged needs-manual-input — a later edit reads as drift and is kept.
    replyOnAccept: () => ({ value: true }),
    // Map `claude` to the estate Claude review check when the repo calls the
    // shared reusable workflow, so a clean review (no PR review, no threads)
    // still settles on the terminal check rather than waiting out the review cap
    // (A-2453). Pinned to the GitHub Actions producer (A-2328). No caller → `{}`
    // (never null), and a later edit reads as drift and is kept.
    reviewBotChecks: () => {
      const job = detectClaudeReviewCallerJob(repoRoot);
      return {
        value: job
          ? { claude: { name: job, producer: CLAUDE_REVIEW_PRODUCER } }
          : {},
      };
    },
    reviewBots: () => ({ value: [...REVIEW_BOTS] }),
    // Hybrid review-settle knobs (A-1179) — structural defaults, never null.
    reviewIdleMinutes: () => ({ value: REVIEW_IDLE_MINUTES }),
    reviewWaitMaxMinutes: () => ({ value: REVIEW_WAIT_MAX_MINUTES }),
    shippableManifestKeys: () => ({ value: [...SHIPPABLE_MANIFEST_KEYS] }),
    // Reuse the memoised packageRoots detection rather than re-reading
    // pnpm-workspace.yaml a second time.
    shippablePaths: () => ({
      value: detectShippablePaths(
        repoRoot,
        detect("packageRoots")?.value ?? [],
      ),
    }),
    // No repo signal; emit send-it's default-on triage chain (never null) so it isn't
    // flagged needs-manual-input. Deliberately not keyed off `triage-pr` being
    // vendored: send-it's Step 11 already soft-skips with a warning when the sibling
    // is absent, so a fixed `true` can't misfire the way `changelog` did (A-570). A
    // later edit to `false` reads as drift and is kept.
    triage: () => ({ value: true }),
    // preflight self-detects its workspace map at runtime; never write it.
    workspaces: () => null,
  };

  function detect(key) {
    if (cache.has(key)) {
      return cache.get(key);
    }

    const detector = registry[key];
    const result = detector ? detector() : null;
    cache.set(key, result);
    return result;
  }

  return { detect, has: (key) => key in registry };
}
