---
name: linear-sync
description: >-
  Transition the Linear issues linked to the current branch through their
  workflow states (In Progress / In Review / Done) — extract the branch's
  leading issue ID, resolve live state IDs against each issue's own team, and
  apply the transition idempotently. Use when starting work on an issue, when a
  PR opens or updates, during branch cleanup, or whenever a branch's Linear
  issues need their state synced. Multi-team aware: a repo may carry issues from
  several teams, so states are resolved per issue's team by name (not key — keys
  go stale on rename), cached per team. Reads the issue-ID prefixes and fallback
  team name from config.json, and skips any issue already at or past the target
  state.
license: MIT
compatibility: >-
  Requires the Linear MCP server (the `mcp__linear-server__*` tools). The branch
  read needs the `git` CLI. If the Linear MCP server is unavailable the skill
  cannot run — it has no non-MCP fallback.
metadata:
  version: 0.4.0
  author: Rob Easthope
allowed-tools: Read, Bash(git:*), mcp__linear-server__get_issue, mcp__linear-server__save_issue, mcp__linear-server__list_issue_statuses
---

# `linear-sync`

Move the Linear issues linked to the current branch through their workflow
states. This skill is the single source of truth for **how** issues are
transitioned: extracting the issue ID from a branch name, resolving the live
state IDs for each issue's team, and the per-state transition rules. Callers decide **when** and **whether**
to fire it; the mechanics live here once so the rules don't drift across the
ship flow, branch cleanup, and the start-of-work transition.

## Configuration

Two knobs live in [`config.json`](config.json) beside this file. Read it at the
start of a run and use its values throughout. Edit your copied `config.json` to
match the consuming repo:

| Key              | Meaning                                                                                                                                                                                                                                        | Default           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `linearTeamName` | **Fallback** Linear team **name**, used only when an issue's `get_issue` result carries no team. States are otherwise resolved against each issue's own team. Use the name, not the key — the key is renamed over time but the name is stable. | `"Rheged Studio"` |
| `issueKeys`      | Team-key prefixes that may lead a branch name — every team whose issues this repo carries, plus any legacy keys still on open branches (e.g. `["R", "A"]`). The branch issue-ID regex is built from these.                                     | `["R", "A"]`      |

A neutral [`config.example.json`](config.example.json) ships alongside it as a
template — copy it over `config.json` and fill in your values, or edit
`config.json` directly.

## Usage modes

`--dry-run` is passed through `$ARGUMENTS` (the agent reads it), matching the
`--dry-run` "preview, change nothing" convention used across the other skills.

**Normal** — extract the branch's issue ID, resolve its team's state IDs, apply
the transition, and report what moved:

```bash
linear-sync
```

**Dry run** — resolve state IDs and each issue's current state, report the
intended transition (or skip reason) per issue, and exit **without any
`save_issue` call**:

```bash
linear-sync --dry-run
```

Under `--dry-run` the resolve + read steps still run (they are read-only), so the
preview is accurate; only the `save_issue` write in the transition step is
skipped. End the report with `DRY RUN — no issues were changed.`

## Extracting the issue ID from the branch

A branch is named `<id>-<slug>`, so its issue is the **leading** token only.
Mirror the canonical, tested `buildBranchIssueRe` / `extractBranchIssueId` in
the repo-root [`lib/issue-keys.mjs`](../../lib/issue-keys.mjs) (this skill has
no scripts, so it mirrors the helper rather than vendoring it — ADR-0004):

1. **Escape regex metacharacters** in each key (a configured key such as `C++`
   would otherwise throw or silently widen the match).
2. **Group the alternation.** Wrap the keys in `(?:…)` whenever there is more than
   one, so the `-\d+` binds to the whole alternation: `^(?:R|A)-\d+\b`. The naive
   join `^R|A-\d+\b` is **wrong** — it parses as `^R` _or_ `A-\d+\b`. A single
   key needs no wrapper: `^R-\d+\b`.
3. **Anchor at the start** (`^`) and match **once** (no `g` flag). A slug token
   such as the `-c-2-` in `r-40-add-c-2-support` must never resolve to an issue —
   in a repo configured with `["C", "R", "A"]` it would otherwise transition an
   unrelated Cadogan issue.
4. **Guard the empty case.** With no configured keys, match nothing — never build
   an empty alternation.

Match against the **upper-cased** branch name — branches like `r-7-as-acquired`
carry the key in lower case, and a flow such as `--issue=R-7` produces upper-case
branch names like `R-7-as-acquired`. So `c-12-fix-r-3-thing` → `C-12`,
`a-2651-2-agent-skills` → `A-2651`, `A-123/demo` → `A-123`, and
`feature/r-1-x` → no issue. Keeping legacy keys in `issueKeys` means leftover
branches from before a team-key rename are still recognised. A bogus or
malformed ID simply errors on lookup and is skipped with a warning — no
separate validation pass.

When a caller already has an `issues` list to hand (e.g. a changelog step emits
one), use that instead of re-extracting.

## Resolving the target state (per issue's team)

A repo can carry issues from **several Linear teams** — e.g. `c-` (Cadogan),
`r-` (Rheged) and legacy `a-` branches in one repo, where an `a-` ID may belong
to either team. Workflow state IDs are per-team, so never resolve them once for
a configured team. For each issue (mirroring `planTransitions` in the repo-root
[`lib/linear-states.mjs`](../../lib/linear-states.mjs)):

1. Call `mcp__linear-server__get_issue` and read the issue's **team name** (and
   its current state — see [Transition rules](#transition-rules)). Fall back to
   `linearTeamName` only when the result carries no team; with neither, skip the
   issue and say why.
2. Call `mcp__linear-server__list_issue_statuses` with `team: <that team name>`
   to fetch its live workflow states — **once per team per run**: cache the
   result and reuse it for every later issue in the same team. Each state carries
   a stable `type` (`triage` / `backlog` / `unstarted` / `started` / `completed`
   / `canceled`), a display `name`, an `id`, and a `position`.
3. Resolve the target among **that team's** states (`resolveTargetState`).

**Resolve the target by `type`, not by display name.** Display names are
customisable — a team may rename `In Progress` → `Doing` or `In Review` →
`Code Review` — so matching the literal name silently fails to find the state.
Map each transition to a concrete state:

- **In Progress** → the `started` state named "In Progress" (case-insensitive);
  else the **earliest** `started` by `position`.
- **In Review** → the `started` state whose name matches "In Review" / "Review";
  else, when there are ≥2 `started` states, the **latest** `started` by `position`;
  else the In Progress state.
- **Done** → the `completed` state named "Done"; else the **earliest** `completed`
  by `position`.

`started` covers both In Progress and In Review, so the name match (then `position`)
is what separates them; a team with a single `started` state resolves both targets
to it. Use the resolved `id` in the `save_issue` call. If a team has no state of
the target's type, skip its issues and say so.

**Resolve teams by _name_, not key.** Use the team name `get_issue` returns (or
`linearTeamName`). A team's key can be renamed over its lifetime (e.g. CAT → WTF
→ AKW → ASW → A → R), so a hardcoded key goes stale; the name does not move.

## Transition rules

For each issue, use the `get_issue` result from the previous step to read its
current state (use its `type`, not its display name). Decide using the **progression order** of
state types:

```text
triage < backlog < unstarted < started < completed
```

`canceled` (which also covers a `Duplicate` state) is terminal and sits outside the
line. Within `started`, order by `position`, so In Progress precedes In Review. All
transitions are **idempotent**: apply only when the current state is **earlier** in
the progression than the resolved target; **skip** silently when the issue is
already **at or past** it, or when its current type is `completed` or `canceled`
(terminal states are never advanced automatically).

- **In Progress** (fired when starting work on an issue) — apply from `triage` /
  `backlog` / `unstarted`; skip from any `started`, `completed`, or `canceled`.
- **In Review** (fired on PR open/update inside a ship flow) — apply from `triage` /
  `backlog` / `unstarted`, or from a `started` state **earlier** by `position` than
  the resolved In Review (e.g. In Progress); skip once at or past In Review, or
  `completed` / `canceled`.
- **Done** (fired on branch cleanup) — apply from `triage` / `backlog` /
  `unstarted` / `started`; skip from `completed` / `canceled`.

Apply a transition with `mcp__linear-server__save_issue` using the **resolved state
`id`** — it is unambiguous across renames. The display-name form
`state: "<target>"` works only when the consumer kept Linear's default state names.

**Under `--dry-run`, skip this `save_issue` call.** Still read each issue's
current state with `get_issue` and decide whether it _would_ transition, but
report the intended move with the issue's team (e.g.
`R-7 (Rheged Studio): Todo → In Progress (would apply)` /
`C-9 (Cadogan): Code Review (would skip — already at/past target)`) instead of
writing it.

> `Canceled` is the Linear API's own US spelling — keep it as-is when referenced
> in code or config.

## Caller responsibilities (when / whether to fire)

The skill owns the mechanics; each caller owns the policy:

- **Start of work** — transition to `In Progress` when work begins on an issue
  (unless already In Progress or further along). Run automatically; no prompt.
- **Ship flow** (PR open/update) — transition linked issues to `In Review`
  automatically after the PR is created or updated. No prompt.
- **Branch cleanup** — transition orphaned issues to `Done` only **after explicit
  confirmation, default no**. Linear's GitHub integration normally handles the
  `Done` transition on PR merge, so this prompt exists only for the rare case
  where the integration didn't fire (e.g. the issue ID was added after merge).

## Standalone vs inside a caller

- **Standalone** — extract the branch's issue ID, resolve the target state for
  its team, apply the transition, and report which issues moved and which were
  skipped. The
  default target is **In Progress** (the start-of-work transition that has no
  other home).
- **Inside a caller** — the caller supplies the target (and often the `issues`
  list) and decides whether to prompt; the mechanics above are unchanged.

## Implementation

No supporting scripts — the skill drives the Linear MCP tools directly
(`get_issue`, `list_issue_statuses`, `save_issue`). The rules it follows are
pinned by tests against the repo-root reference helpers
[`lib/issue-keys.mjs`](../../lib/issue-keys.mjs) (branch issue-ID extraction)
and [`lib/linear-states.mjs`](../../lib/linear-states.mjs) (per-team state
resolution and the forward-only transition rule). The only repo-specific inputs
are the issue-ID prefixes and the fallback team name, both read from
`config.json`.
