---
name: triage-pr
description: >-
  Drive a pull request from draft with failing CI to merge-ready. While the PR
  is a draft, inspect and fix in-scope CI failures (lint, manifest-lint, build,
  tests) using the gh CLI and GitHub Actions logs — never
  weakening CI config to greenwash, and never editing lint config or adding an
  ignore directive unprompted (those are gated for the developer's sign-off and
  reported, not applied). After the PR is marked ready-for-review,
  wait for AI reviewers, verify each finding, then apply dispositions per
  `humanEnvelope`: when `true`, halt for a human envelope; when `false`, post
  the plan as a PR comment and act without Yes/No. `--auto-apply` forces the
  unattended path for one run. Use when asked to triage a PR, fix failing CI or red checks on a PR, address or
  respond to PR review comments, action Claude or CodeRabbit review feedback, get a
  PR green, or take a draft PR to merge-ready. Handles base-branch drift and
  in-scope merge conflicts; escalates ambiguous ones.
license: MIT
compatibility: >-
  Requires the `gh` CLI (authenticated — `gh auth status` must pass) and `git`.
  The bundled review-thread fetcher needs Node.js >=22 (ES modules).
  Designed for repositories whose AI review runs only on
  ready-for-review PRs (draft-gated), so Phase A and Phase B do not overlap.
metadata:
  version: 0.17.2
  author: Rob Easthope
allowed-tools: AskUserQuestion, Read, Edit, Write, Glob, Grep, Bash(gh:*), Bash(git:*), Bash(node:*), Bash(pnpm:*), Bash(npx:*), mcp__linear-server__save_issue, mcp__linear-server__get_issue, mcp__linear-server__list_issue_statuses, mcp__linear-server__list_projects, mcp__linear-server__list_milestones, mcp__linear-server__list_issue_labels, mcp__linear-server__save_milestone
---

# triage-pr

Take a pull request from **draft + failing CI** to **merge-ready**, in two
phases, choosing the phase from the PR's draft state:

- **Phase A — while the PR is a draft:** inspect failing checks, pull GitHub
  Actions logs, and fix failures **in PR scope only**. Loop until CI is green or
  report blockers. Phase A runs unattended — no human gate except hard blockers.
- **Phase B — after the PR is ready-for-review:** wait for configured reviewers,
  **verify-then-propose** dispositions (Step 9), then follow
  [`references/phase-b-envelope.md`](references/phase-b-envelope.md) or
  [`references/phase-b-unattended.md`](references/phase-b-unattended.md) per
  `humanEnvelope` / `--auto-apply`. Bounded by `maxReviewRounds`.

Since send-it 0.8.0, `/send-it` **opens or updates** the pull request and then
**invokes this skill as its final step** (Step 11, A-1151): it waits for at least
one check to register, then hands off here — forwarding `--dry-run`, `--ci-only`,
`--no-promote`, and `--auto-apply` verbatim. A default `/send-it` run is incomplete
until that hand-off (A-1645). A send-it chain that reaches Phase B halts on **this**
skill's human envelope only when `humanEnvelope` is `true`; when `false`, it ends on
Step 13's report (A-2014). Running `/triage-pr`
directly stays fully supported for mid-flight re-entry when send-it already opened
the PR, or when send-it was deliberately skipped — it is not the normal end of a
send-it run.

The draft→ready
flip is governed by a single control — `promoteOnGreen` in [`config.json`](config.json)
— and **an enabled config _is_ the authorisation** for it: when `promoteOnGreen` is
`true` (the default), human authorisation for the flip is **already acquired via the
repo config**, so after a cleanly-green Phase A the skill flips the PR to ready and
continues into Phase B without stopping to seek a separate sign-off (the ready-flip is
the gate that turns AI review on; see Step 6). The flip stays **guarded** — gated on
proven-green CI, **no unresolved human review threads**, and no unresolved base drift.
Set `promoteOnGreen: false` (or pass `--no-promote`) to opt out and stop at green; an
explicit user prompt — or the `--promote` / `--no-promote` flags — overrides the config
for that run. Merge to `main` is never automated; that stays a human action. See
[`references/review-discipline.md`](references/review-discipline.md) for the full
review-reception and verification rules folded into Phase B.

## Configuration

The knobs live in [`config.json`](config.json) beside this file. Read it at the
start of a run and use its values throughout. Edit your copied `config.json` to
match the consuming repo's review bots and (optionally) its Linear workspace.

The first ten govern the **CI + review** loop:

| Key | Meaning | Default |
| --- | --- | --- |
| `reviewBots` | GitHub login names whose comments and threads are treated as first-class AI review feedback. Matched against `author.login`; the `[bot]` suffix is normalised, so `claude` and `claude[bot]` both match (the GraphQL API returns the bare form). Edit to match your install — review-bot logins vary per repo. `github-actions` is deliberately excluded by default: it posts CI status and release-PR comments, not code review, so Phase B would otherwise action them as findings; add it only if your install genuinely posts review-type comments via the Actions bot. | `["claude", "coderabbitai"]` |
| `reviewBotChecks` | Map from a `reviewBots` login to the commit status or check run that bot posts for each review — a string check name (e.g. `{"coderabbitai": "CodeRabbit"}`) or `{ "name": "…", "producer": "…" }` to pin the poster. `name` keys match a status `context`, a check-run name, a check-run name's leading `<key> / …` segment, or `<workflow> / <check>`. When `producer` is set, the status `creator.login` or check suite `app.slug` must match too (case-insensitive; `[bot]` suffix normalised). A mapped bot settles (Step 7) only when that status or check is **terminal on the current head commit and post-dates the ready flip** — a draft-time "Review skipped" success never counts, and a cancelled or skipped run means "won't report" rather than "missing". Unmapped bots fall back to review or comment activity after the ready flip on the current head. `rheged-skills-setup` maps `claude` to `{ "name": "claude-review", "producer": "github-actions" }` (the caller job id) when the repo calls the estate `reusable-claude-code-review.yml`. | `{}` |
| `maxCiRounds` | Maximum **Phase A** re-watch iterations before stopping and reporting blockers. Bounds the draft-time fix-and-watch loop so it can't spin forever. Phase B does not spend it. | `5` |
| `maxReviewRounds` | Maximum **Phase B** re-review rounds: each return from Step 12 to Step 7 after an apply push (a re-plan when unattended, a re-envelope when `humanEnvelope` is `true`), including the CI re-watch for that push. When exhausted, stop and report the outstanding findings as blockers. | `2` |
| `replyOnAccept` | Whether an **accepted** finding gets a factual thread reply referencing the fixing commit before the thread is resolved (the audit trail). `false` resolves accepted threads silently for maintainers who dislike bot-reply noise — declines always reply with reasoning regardless. | `true` |
| `promoteOnGreen` | The single control for the draft→ready flip. When `true`, after Phase A finishes with **every** required check genuinely green on a **draft** PR, run `gh pr ready <pr>` to flip it to ready-for-review (the gate that turns AI review on), then continue into Phase B — instead of stopping at green. **Default-on**, and an enabled config _is_ the human authorisation for the flip: proceed on proven green without seeking a separate sign-off. Set `false` (or pass `--no-promote`) to opt out and stop at green. Promotion is suppressed unless the green is _proven_ (Step 6's watched rollup, never "no failures yet"), there are **no unresolved human review threads**, and `mergeStateStatus` shows no unresolved base drift (`BEHIND` / `DIRTY`). An explicit user prompt — or `--promote` / `--no-promote` — overrides this per run; `--ci-only` and `--dry-run` never promote. | `true` |
| `deferNonBlocking` | When `true` (the default), a valid **in-scope** finding is proposed as **accept** only if it is **high-impact** under the impact rubric in [`references/review-discipline.md`](references/review-discipline.md#when-to-fix-now-vs-follow-up); otherwise it is proposed as **follow-up** (same path as out-of-scope). Set `false` to restore scope-only behaviour on the envelope path (every valid in-scope finding is proposed as accept; only out-of-scope findings become follow-ups). The unattended path always applies the rubric. | `true` |
| `humanEnvelope` | When `false` (the default), load [`references/phase-b-unattended.md`](references/phase-b-unattended.md); when `true`, load [`references/phase-b-envelope.md`](references/phase-b-envelope.md). `deferNonBlocking` applies only on the envelope path. `--auto-apply` forces unattended for one run. Legacy CLI aliases `defer` / `defer-pending` still work. An explicit user prompt overrides the config per run. | `false` |
| `reviewIdleMinutes` | Hybrid review-settle idle window: after at least one configured bot has reported on the current head (and no mapped bot's check is still pending), treat reviews as settled when the fetcher's `activityFingerprint` has not changed for this many minutes. | `10` |
| `reviewWaitMaxMinutes` | Hard cap on the hybrid wait after the ready flip (or Phase B entry on an already-ready PR). If bots are still missing when this expires, run the **slow-bot micro-gate** (proceed / wait longer / abort) before the disposition envelope. | `20` |

**Follow-up capture** (Linear) keys and routing live in
[`references/follow-up-routing.md`](references/follow-up-routing.md).

Only the configured `reviewBots` are actioned in Phase B. Human review comments
are surfaced in the final report but never auto-actioned, replied to, or
resolved — leave those for the human.

## Usage modes

**Auto** — detect the current branch's PR and its phase, then run:

```bash
triage-pr
```

**Explicit PR** — operate on a specific PR by number or URL:

```bash
triage-pr 123
```

**CI only** — run Phase A and stop, even if the PR is ready:

```bash
triage-pr --ci-only
```

**Dry run** — report failing checks and unresolved findings and propose fixes,
but change nothing (no commits, no pushes, no thread replies):

```bash
triage-pr --dry-run
```

**Promote on green** — flip the draft to ready once Phase A is cleanly green (then
continue into Phase B). Promotion is already the default (`promoteOnGreen: true`);
`--promote` forces it for this run when the config sets `promoteOnGreen: false`, and
`--no-promote` forces a stop at green:

```bash
triage-pr --promote
```

**Auto-apply Phase B** — force the unattended path for this run (plan comment +
act; no Yes/No; no Linear-only prompt). Overrides `humanEnvelope: true`:

```bash
triage-pr --auto-apply
```

## Waiting on long operations

Phase A's CI watch and Phase B's review wait routinely run for 10–30 minutes.
Wait in a way the host can sustain, and stay quiet while doing it:

- **Claude Code.** A foreground command is capped at 10 minutes and a bare
  `sleep` is blocked, so never chain foreground sleeps or rely on one long
  foreground `--watch`. Run the wait as a **background command**
  (`run_in_background`): the harness re-invokes you when it exits. For the CI
  watch, background `gh pr checks <pr> --watch --required`. For the Step 7 poll,
  background one bounded shell loop that re-runs the fetcher every 60 seconds and
  exits when the settle rule holds or the max wait expires (or use the Monitor
  tool with an until-loop on the same condition). Re-read the result when you are
  re-invoked; do not poll with repeated short foreground calls.
- **Cursor.** Run each wait as **one bounded shell command** that finishes inside
  the terminal timeout (for example `timeout 540 gh pr checks <pr> --watch
  --required`, or a loop of at most ~9 minutes), then re-issue it until the
  condition holds or the budget runs out.
- **Either host.** No interim "still waiting" messages; a wait that ends without
  its condition (timeout, budget) is reported at the next natural stopping point.

## Process

### Step 1 — Locate the PR and detect the phase

```bash
gh pr view <pr> --json number,isDraft,state,headRefName,baseRefName,mergeable,mergeStateStatus,statusCheckRollup
```

- Resolve the PR from the argument, or from the current branch when none is
  given. If `gh pr view` finds no PR, stop and tell the user to open one with
  `/send-it` first.
- `isDraft == true` → **Phase A**. When CI is green, promotion (`promoteOnGreen`,
  default on) flips the cleanly-green draft to ready at Step 6 and the run continues
  into Phase B. With promotion disabled (`--no-promote` / `promoteOnGreen: false`),
  report and stop instead — AI review has not run yet, and the skill leaves the flip
  to the human.
- `isDraft == false` → **Phase A** (confirm/clear CI), then **Phase B**.
- Record `baseRefName` for the drift checks and `mergeStateStatus` for conflict
  detection.

### Step 2 — Phase A: inspect failing checks

```bash
gh api repos/<owner>/<repo>/rules/branches/<base> \
  --jq '.[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
gh pr checks <pr> --required
```

**Green means required checks only.** The merge gate is the base branch's required
status checks, so CI is judged on those alone. Read the **required contexts** from
the branch rules (first command above; repeat for legacy branch protection with
`gh api repos/<owner>/<repo>/branches/<base>/protection/required_status_checks --jq
'.contexts[]'` if the rules list none). CI is **green** only when **every** required
context is present on the head commit **and** terminal-successful (success, or
skipped). `gh pr checks <pr> --required` (exit `0` passed, `8` pending, `1` failed)
is a quick view, but it only sees required checks that have **already registered**:
a gating job (e.g. a "Detect Changes" step) can still be about to create the rest,
and "no required checks reported" straight after a push means the same thing. So a
required context that is **missing** from the rollup is **pending**, never green.

Non-required checks — a shadow CI lane (e.g. a Buildkite mirror), an AI-review
workflow such as a cancelled `claude-review`, any other advisory status — are
**informational**: list a red one in the Step 13 report, but never fix it, never
let it block promotion, and never spend a `maxCiRounds` round on it. Only when the
repo genuinely has no required checks (both lookups empty) fall back to the full
rollup minus the `reviewBotChecks` contexts, and say so in the report.

For each failed **required** Actions check, resolve its run ID from the check's `detailsUrl`
(in `statusCheckRollup`) and read the failing step's logs:

```bash
gh run view <run-id> --log-failed
```

Capture the **actual failing command and error lines**, not just the check name.
You are diagnosing a root cause, not pattern-matching a label.

### Step 3 — Phase A: classify each failure (in-scope vs upstream vs gated)

```bash
git fetch origin <base>
git diff --name-only origin/<base>...HEAD   # files this PR actually touches
```

- **In-scope** — the failure names files in this PR's diff, or is a lint / test /
  build failure reproducible on the branch head. Fix it (Step 4) — **unless** its
  only remedy would change lint / format / static-analysis config or add an ignore
  or disable directive, in which case **Lint-surface gated** (below) takes
  precedence, regardless of how clearly the failure belongs to this PR.
- **Upstream / base drift** — the job also fails on `origin/<base>` independent of
  this diff, **or** `mergeStateStatus == BEHIND`, **or** the error names files the
  PR never touched. Remedy is to rebase/merge the base (Step 5), **not** to edit
  the failing code.
- **Lint-surface gated** — the only remedy available is a change to lint / format /
  static-analysis **config**, or a new **ignore / disable directive**. That is a
  **developer decision**, so it is not in-scope and you do not make it. Record a
  **gated item** — the file, the change you would have made, why no code fix was
  available, and the preferred alternative (fix the offending code, or raise the rule
  change in the shared config package) — then carry on with the rest of the round and
  report it at the next natural stopping point (Step 6 / Step 13). The full surface
  list is in
  [`references/review-discipline.md`](references/review-discipline.md#lint-surfaces-are-a-developer-decision).
- A failure that can only be "fixed" by weakening a gate is never in-scope — that is
  the hard ban in **Important rules**; the gated bucket above is its human-decided
  grey zone.

### Step 4 — Phase A: fix in-scope failures, one at a time

- Apply the smallest fix that addresses the **root cause** within the PR's scope.
- **Fix the code, never the lint surface.** For a lint / format / static-analysis
  failure the preference order is: (1) fix the offending **code**; (2) if the rule
  itself is genuinely wrong, the remedy is a change to the **shared config package**
  (`@rheged-studio/eslint-config`, `@rheged-studio/markdownlint-config`, …),
  proposed to the developer — not landed here; (3) a local config override or an
  ignore / disable directive only with the developer's sign-off. You never take (2)
  or (3) on your own initiative — classify it as gated (Step 3) and keep going.
  _Carve-out:_ when the PR's own diff already contains a developer-authored lint
  config or ignore change, you may repair a genuine error in it (e.g. a syntax or
  schema error breaking the lint job), but never loosen a rule or widen an ignore.
- Re-run the **specific** failing command locally and read its exit code before
  claiming it fixed (e.g. `pnpm lint`,
  `npx --yes skills-ref@0.1.5 validate ./skills/<name>`, the failing test). Pin the
  version so the local check matches CI exactly and can't be rug-pulled. Evidence
  before claims — never assert a fix on "should" or "probably".
- Commit with a Conventional Commit subject, then push. One fix → one
  verification → next fix.

### Step 5 — Phase A: handle base-branch drift

Only when Step 3 classified the failure as upstream/behind:

```bash
git fetch origin <base>
git merge origin/<base>      # or rebase, per the repo's convention
```

- Clean merge → push and re-watch (Step 6).
- Conflict → go to **Merge conflicts** below.

### Step 6 — Phase A: re-watch CI until green or budget exhausted

```bash
gh pr checks <pr> --watch --required
```

Run the watch with the host pattern in
[Waiting on long operations](#waiting-on-long-operations) — it can outlast a
foreground command limit.

- After each push, watch the **required** checks to completion. Still red → loop
  back to Step 2 — **unless** every remaining red check is a Step 3 **gated** item, which
  ends Phase A immediately (see the gated-exit rule below).
- **No early "done".** Do not tell the user the run is complete, green, or ready
  for attention until `gh pr checks --watch --required` (or an equivalent fresh required-check
  rollup) has **exited** and every required check is **terminal** (success or
  failure). Non-required checks still running or red do not hold this up. Queued,
  pending, or in-progress checks are non-terminal — "no failures yet", an empty
  rollup, or mixed pending+pass is **not** proven green and **not** a completion
  signal (same discipline as the promotion gate below, applied to every end-of-run
  claim). **Re-check after the watch exits:** a second workflow run on the same head
  (a re-push, or an `edited` / `ready_for_review` event) can cancel the first, and
  `--watch` may exit `0` in the gap between them, or before a gating job has created
  the remaining required checks. Re-apply the Step 2 test — every required context
  present and successful on the head — before calling it green; a
  required check that shows as failed because its run was **cancelled** and
  superseded is not a failure — wait for the superseding run.
- **Stay quiet while watching.** Prefer a silent wait / background watch over
  interim "still waiting" pings that interrupt other work. Surface the human only
  at a **natural stopping point**: the **human envelope** (Step 10 — actionable
  dispositions to approve), the Step 13 report (when the loop converged), a
  documented Phase-A early stop in this step (promotion disabled / promotion gate
  failed / gated lint-surface items outstanding / `--ci-only` / `--dry-run`), the
  slow-bot micro-gate (Step 7), or a hard blocker / `maxCiRounds` or `maxReviewRounds` exhaustion that
  needs a decision. The envelope _is_ actionable — do not treat A-1178's "don't
  pull attention" rule as a reason to skip it.
- **Gated lint-surface items end the loop.** When every remaining red check is a
  Step 3 **gated** item, stop **immediately** — do not spend `maxCiRounds` re-watching
  a failure you have decided not to fix. Report each gated item (file, the change you
  would have made, the preferred alternative) as a Phase-A early stop and hand the
  decision to the developer. CI is not green, so the promotion gate below cannot pass
  either; name the gated items as the specific reason it wasn't promoted.
- **Bound the loop** by `maxCiRounds`. When exhausted, stop and report the
  remaining failures as blockers rather than looping forever.
- Green **and ready** → continue to Phase B.
- Green **and draft**, promotion **disabled** (`--no-promote` / `promoteOnGreen: false`)
  → report green and **stop**.
- Green **and draft**, promotion **enabled** (default, or `--promote`) → run
  the **promotion gate** before flipping. All three must hold:
  1. **Proven green** — the green is _this step's_ watched required-check green
     (the Step 2 test: every required context present and successful on the head;
     not pending / "no failures yet");
     apply the same exit-code discipline Phase A already enforces, never greenwash
     to reach the flip. A red **non-required** check does not fail this gate.
  2. **No unresolved human threads** — run
     `node scripts/review-threads.mjs <pr> --bots "<config.reviewBots joined by commas>"`
     and require `humanThreads` empty. (On a draft, `unresolvedThreads` is empty
     anyway — AI review hasn't run — so this gate is specifically about humans who
     reviewed the draft.)
  3. **No unresolved base drift** — re-fetch `mergeStateStatus` **fresh** right before
     the flip (`gh pr view <pr> --json mergeStateStatus`), not the Step 1 snapshot: an
     intervening Phase A push can have changed it. Require it not `BEHIND` / `DIRTY`
     (Phase A's Step 5 resolves in-scope drift; if it persists, do **not** promote —
     report it as a blocker).

  All three pass → `gh pr ready <pr>`, report the flip, then **continue to Phase B**
  (Step 7). The ready-flip and Phase B's pushes re-fire CI + AI review; Phase A stays
  bounded by `maxCiRounds` and Phase B by `maxReviewRounds`. Any gate fails → **do not flip**; report green
  plus the specific reason it wasn't promoted, and stop. Under `--dry-run`, report
  that it _would_ promote (or why not) and flip nothing. Under `--ci-only`, never
  promote — stop at green regardless of the knob.

### Step 7 — Phase B: hybrid wait for AI reviewers

Stay in the same session. After the ready flip (or when entering Phase B on an
already-ready PR), poll the fetcher until reviews settle — or until the hard cap
forces the slow-bot micro-gate. Resolve the skill directory as in Step 8.

```bash
node scripts/review-threads.mjs <pr> --bots "<config.reviewBots joined by commas>" --bot-checks '<config.reviewBotChecks as JSON>'
```

Every settle field is scoped to the **current head commit** (`headRefOid`) and to
activity **after the ready flip** (`readyAt`). Nothing posted while the PR was a
draft counts — CodeRabbit's draft-time walkthrough and its "Review skipped: draft
pull request" status in particular — and nothing posted against a superseded head
counts either.

- `botStatus` — one entry per configured bot: `state` is `reported`, `pending`,
  `skipped`, or `missing`, with `via` (`check` or `activity`) and `evidence`.
  - A bot mapped in `reviewBotChecks` (`via: check`) is `reported` when its status
    or check run is terminal-success on the head commit and post-dates the ready
    flip; `pending` while that run is queued or in progress; `skipped` when it
    ended cancelled, skipped, neutral, failed, or with a "Review skipped"
    description (it **won't report** — never wait on it); `missing` when no such
    run exists yet.
  - An unmapped bot (`via: activity`) is `reported` when, after the ready flip and
    the head commit, it submitted a review on the head, commented on a review
    thread, or created **or edited in place** a finished summary — a sticky-marker
    summary, or claude-code-action's tracking comment once it reads
    "**Claude finished @…'s task**" (a clean Claude review leaves nothing else).
    A bare ack — a comment with neither a sticky marker nor that finished header,
    such as "Claude Code is working…" — does **not** count.
- `botsReported` / `botsSkipped` / `botsMissing` — `botStatus` grouped by state;
  `botsMissing` covers both `pending` and `missing`.
- `activityFingerprint` — changes whenever the head, the open bot threads, or a
  bot summary (including an in-place edit) changes.

**Settled when any of:**

1. **All settled** — `botsMissing` is empty (every `reviewBots` entry is
   `reported` or `skipped`), **or**
2. **Idle** — at least one bot is `reported`, no **mapped** bot is `pending` (a
   pending check means its review is still running), and `activityFingerprint`
   has not changed for `reviewIdleMinutes`, **or**
3. **Max wait** — `reviewWaitMaxMinutes` since Phase B wait started.

Poll quietly (e.g. every 60s) using the host pattern in
[Waiting on long operations](#waiting-on-long-operations); do **not** ping the
human while waiting unless the slow-bot gate fires. Name `skipped` bots in the
Step 13 report so a cancelled review is visible, not silent.

**Slow-bot micro-gate** — only when `humanEnvelope` is `true` **and** max wait
expires with `botsMissing` non-empty. When unattended (`humanEnvelope: false` /
`--auto-apply`), **skip** this gate: proceed to Step 8 with findings so far and
name missing bots in Step 13. Under the envelope path, list arrived vs outstanding
bots and ask **once** in this session using the same dual-host structured-question
pattern as Step 10:

1. Put the timeout context in the chat message (reported vs outstanding bots).
2. Prefer a structured question tool when available:
   - **Cursor `AskQuestion`:** options **Proceed** / **Wait** / **Abort**.
   - **Claude Code `AskUserQuestion`:** `header` e.g. `Review wait` (≤12 chars);
     options **Proceed** / **Wait** / **Abort** (descriptions: continue with
     findings so far / extend the wait / stop without an envelope).
3. **Fallback** (neither tool): prose

```text
Review wait timed out after <N> minutes.
  Reported: claude
  Still outstanding: coderabbitai
Proceed with what we have / wait longer / abort? [proceed|wait|abort]
```

- **Proceed** → continue to Step 8 with the findings so far (note missing bots in
  the envelope report).
- **Wait** → reset the max-wait clock (or extend by another `reviewWaitMaxMinutes`)
  and return to the poll loop.
- **Abort** → stop; leave threads untouched; no disposition envelope.

Do **not** open the disposition envelope until this gate is answered (or reviews
settled via headlines/idle).

### Step 8 — Phase B: fetch unresolved review feedback

Run the bundled fetcher (path **relative to this skill's own directory**):

```bash
node scripts/review-threads.mjs <pr> --bots "<config.reviewBots joined by commas>"
```

This fetcher is **read-only**. The write side is `respond-threads.mjs` (Step 11).

It prints minimal JSON including:

- `unresolvedThreads` — inline review threads (`isResolved == false`) raised by a
  configured `reviewBot`, trimmed to `{threadId, path, line, isOutdated, author,
  url, comments}`. `url` is the first review-comment permalink when GitHub
  provides one (use it in the Step 10 detail block). This is the actionable set.
- `deferredThreads` — bot threads already carrying our **non-resolving follow-up-pending
  marker** (from a prior pass). Do not re-triage these in Step 9; include them in
  the envelope's follow-up set when rediscovering pending capture.
- `otherBotThreads` — unresolved threads raised by a GitHub **bot account that is
  not in `reviewBots`** (a linter, a monitoring app). Verify and disposition them
  in Step 9 like review-bot findings (accept / decline / follow-up / outdated) so
  nothing is lost, but they are **informational**: they never block promotion,
  never trigger the unattended human-thread stop, and never hold up Step 13.
- `humanThreads` — unresolved threads raised by a **human**. Surface in the
  report; do not auto-action.
- `aiSummaryComments` — headline summary per review bot (sticky issue comment
  and/or review-submission body). At most **one per bot**.
- `botStatus`, `botsReported` / `botsSkipped` / `botsMissing`,
  `activityFingerprint`, `headRefOid`, `readyAt` — settle helpers (Step 7).

Resolved threads are filtered out. Empty `unresolvedThreads`, empty
`otherBotThreads`, no AI summary, **and** no `deferredThreads` → report "no
actionable AI review feedback" and skip to Step 13. If only `deferredThreads` remain under `humanEnvelope: true`, fold them into
the envelope plan; under unattended (`humanEnvelope: false` / `--auto-apply`), go to
Step 11 Linear capture — no Linear-only prompt.

### Step 9 — Phase B: verify-then-propose dispositions

Apply READ → UNDERSTAND → VERIFY → EVALUATE for every actionable finding —
`unresolvedThreads`, summary items, **and** `otherBotThreads` (full rules in
[`references/review-discipline.md`](references/review-discipline.md)). Mark
`otherBotThreads` items as informational in the plan; their dispositions are
applied like any other, but an unresolved one never blocks the run.
**Do not** IMPLEMENT, create Linear issues, or resolve threads yet — build a
numbered **disposition plan** only:

For each finding record:

- source bot + path:line (or issue-level summary item)
- thread / comment **permalink** when available (`url` on the shaped thread, or
  the issue-comment / review URL for summary items) — omit rather than invent a
  broken link
- short finding paraphrase (1–3 sentences — enough to decide without opening GitHub)
- verification sketch (real? in-scope? high-impact?)
- proposed disposition: `accept` | `decline` | `follow-up` | `outdated` | `gated`
- for `accept`: concrete fix sketch
- for `decline`: technical reasoning
- for `follow-up`: draft Linear title + rationale, **and** the destination line
  (`→ file under …`) from the routing step below
- for `outdated`: per [`references/review-discipline.md`](references/review-discipline.md#receiving-review-feedback--the-six-steps) (verify gone, not moved)
- for `gated`: surface touched + preferred alternative — classify **before** impact;
  full lint-surface rules in
  [`references/review-discipline.md`](references/review-discipline.md#lint-surfaces-are-a-developer-decision)

Classify impact with the rubric in
[`references/review-discipline.md`](references/review-discipline.md#when-to-fix-now-vs-follow-up)
(on the envelope path, `deferNonBlocking: false` proposes every valid in-scope finding
as accept).

When the plan includes follow-ups (or unattended `[gated]` items), resolve destinations
read-only per
[`references/follow-up-routing.md`](references/follow-up-routing.md#step-9--read-only-destination-resolve).

**Branch on `humanEnvelope`:**

- `true` → follow [`references/phase-b-envelope.md`](references/phase-b-envelope.md)
  (Step 10 gate, then Step 11 apply).
- `false` / `--auto-apply` → follow
  [`references/phase-b-unattended.md`](references/phase-b-unattended.md) (post plan,
  then Step 11 apply).

### Step 10 — Phase B: human envelope

When `humanEnvelope` is `true`, run Step 10 in
[`references/phase-b-envelope.md`](references/phase-b-envelope.md). When `false` or
`--auto-apply`, skip — unattended flow starts in Step 9 above.

### Step 11 — Phase B: apply dispositions

Execute the approved plan (envelope) or the posted plan (unattended) per
[`references/phase-b-envelope.md`](references/phase-b-envelope.md) or
[`references/phase-b-unattended.md`](references/phase-b-unattended.md). Mint Linear
follow-ups per [`references/follow-up-routing.md`](references/follow-up-routing.md).

```bash
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision accept --sha <sha> --bots "<config.reviewBots joined by commas>"
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision decline --reason "<technical reasoning>" --bots "<config.reviewBots joined by commas>"
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision follow-up-pending --bots "<config.reviewBots joined by commas>"
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision follow-up --reference <issue-id> --bots "<config.reviewBots joined by commas>"
```

`respond-threads.mjs` only acts on threads whose author is in `--bots`. For an
`otherBotThreads` item, append that thread's author (`--bots "<config.reviewBots>,<thread author>"`).

### Step 12 — Phase B: issue-level ack + re-envelope

Acknowledge headline summary findings with one consolidated comment once the
approved plan has been applied:

```bash
node scripts/respond-threads.mjs summary --pr <pr> --findings '[{"title":"…","status":"accepted","reference":"<sha>"}]'
```

Then re-fetch (Step 8). **Any push in Phase B moves the head** — record the new
`headRefOid`, reset the Step 7 wait clocks, and return to **Step 7** before deciding
there are no new findings. If new bot findings appear, continue Step 7 → Step 9 and
follow the path file's Step 12 section (re-envelope or re-plan). Bound by
`maxReviewRounds`. If CI is terminal green, bots have settled on the current head,
and there are no new bot findings, continue to Step 13.

### Step 13 — Report

This is the completion alert for a full run. Emit it only after every required
check is **terminal**, or after a hard blocker / budget exhaustion / envelope
decline / abort — never while checks are still pending. Phase-A early stops
report at their Step 6 exit instead.

Summarise:

- Checks fixed, each with the failing command it addressed.
- Envelope outcome (approved / declined) or unattended plan posted; any slow-bot
  decisions (envelope path only) or missing bots named (unattended); bots that
  settled as `skipped` (cancelled or skipped review run) named with their evidence.
- Dispositions of `otherBotThreads` (non-review bots), listed apart as
  informational.
- Findings accepted and fixed (with the resolving commit).
- Findings declined, each with the technical reasoning given.
- **Gated lint-surface items** awaiting the developer's decision — each with the
  file, the change that would have been made, why no code fix was available, and the
  preferred alternative (fix the code, or raise it in the shared config package).
  Nothing on this list was applied.
- Follow-up issues created (each with its Linear id/URL, the `follow-up`
  label, and its destination — inherited project and milestone, inherited
  project only, or catch-all project plus repo milestone), or follow-up
  candidates that were not tracked.
- Issue-level findings acknowledged in the consolidated comment.
- Base merges/rebases performed.
- Remaining blockers (if `maxCiRounds` or `maxReviewRounds` was exhausted).
- Final CI state, with **fresh** evidence for the Step 2 test — each required
  context and its terminal state on the head commit — then any red
  **non-required** checks listed apart as informational.
- Any **human** review comments, surfaced for the human to handle.
- The PR's draft/ready state: when promotion fired, report the flip (draft → ready)
  and that Phase B then ran; otherwise a reminder that the state is unchanged —
  and, if promotion was enabled but a gate blocked it, the specific reason.

## Merge conflicts

- Resolve **only** when the resolution is unambiguous and within the PR's scope
  (e.g. both sides touched disjoint hunks, or this branch's intent clearly
  supersedes).
- **Abort and ask the human** when intent is ambiguous: both sides changed the
  same logical thing, the conflict reaches files outside the PR's scope, or
  resolving needs a product decision. Run `git merge --abort` and report the
  conflicting files.
- Never resolve a conflict by deleting the other side's work just to make it
  compile.

## Important rules

- **Never greenwash.** Never edit `.github/workflows/*`, disable or loosen a lint
  rule, delete or skip a test, or relax a CI threshold to make a check pass. Fix
  the code, or report the failure as a blocker.
- **Lint surfaces are a developer decision.** Classify as **gated** (Step 3 / Step 9);
  never apply without explicit envelope sign-off. Full policy and surface list:
  [`references/review-discipline.md`](references/review-discipline.md#lint-surfaces-are-a-developer-decision).
- **In-scope only.** Fix what this PR's diff is responsible for; don't fix
  unrelated repo problems.
- **Validate before implementing.** Never apply a review suggestion without first
  verifying it against the codebase.
- **AI bots only.** Action the configured `reviewBots`, plus `otherBotThreads`
  as informational, non-blocking findings; surface human comments but leave them
  for the human.
- **No sycophancy.** Decline with technical reasoning, not flattery.
- **Evidence before claims.** Never say CI is green or a fix works without freshly
  running the proving command and reading its exit code. CI green means
  every required context is present and successful on the head (Step 2). Never claim the run is
  complete, done, or ready for attention while any required check is still
  non-terminal (queued / pending / in progress) — "no failures yet" is not green
  and not done.   Alert the human only at a natural stopping point: the **human envelope** (Step 10,
  when `humanEnvelope` is `true`), Step 13, a documented Step 6 Phase-A early stop
  (promotion disabled / gate failed / gated lint-surface items outstanding /
  `--ci-only` / `--dry-run`), the slow-bot micro-gate, or a hard blocker / budget
  exhaustion — never with interim "still waiting" pings mid-watch.
- **Two Phase B paths.** Load
  [`references/phase-b-envelope.md`](references/phase-b-envelope.md) or
  [`references/phase-b-unattended.md`](references/phase-b-unattended.md); do not apply
  dispositions outside those files.
- **Draft → ready is guarded, and on by default.** `promoteOnGreen` is the single
  control for the flip, and an enabled config _is_ the authorisation: with it on (the
  default) the skill flips the PR — **only** after a _proven_-green Phase A, with **no
  unresolved human threads** and no unresolved base drift — then continues into Phase B,
  without seeking a separate human sign-off for the flip. Set `promoteOnGreen: false` / pass
  `--no-promote` to stop at green; an explicit user prompt or `--promote` /
  `--no-promote` overrides the config per run. Never greenwash to reach the flip;
  `--ci-only` never promotes. Merge stays a human action.
- **Bounded loops.** Stop after `maxCiRounds` (Phase A) or `maxReviewRounds`
  (Phase B) and escalate.

## Error handling

- `gh auth status` fails → stop and tell the user to run `gh auth login`.
- No PR for the branch → stop with "open one with `/send-it` first".
- `gh run view --log-failed` unavailable (logs expired or run purged) → report
  the failing check by name without guessing its cause; do not fabricate a fix.
- The review-thread fetcher exits non-zero (rate limit, permissions, GraphQL
  error) → report it and fall back to `gh pr view <pr> --json reviews,comments`.
  Never treat "couldn't fetch" as "no findings".
- Outdated thread → follow
  [`references/review-discipline.md`](references/review-discipline.md#receiving-review-feedback--the-six-steps)
  (`--decision outdated`).
- `respond-threads.mjs` exits non-zero (reply or resolve mutation fails on
  permissions) → fall back to a manual `gh api graphql` reply with the reasoning
  rather than aborting; the marker convention still applies so a later run skips it.
- The consolidated `summary` upsert can't find prior comments (REST page cap, ~100)
  → it posts a fresh comment; harmless, just avoid hand-deleting the marker so the
  next run can find and edit it.

## Arguments

$ARGUMENTS
