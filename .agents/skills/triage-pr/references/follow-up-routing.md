# triage-pr — follow-up capture and routing

Turning a **follow-up** disposition into a tracked Linear issue. Loaded when the
disposition plan includes any `follow-up` — or, on the unattended path, any
`[gated]` review finding that becomes a follow-up there — and capture is enabled
(`linearTeamName` set).

Under `humanEnvelope: true`, capture is part of the same envelope approval (not a
second prompt). Under unattended (`humanEnvelope: false` / `--auto-apply`), create
follow-ups in Step 11 after the plan is posted — no second prompt. Capture is
**opt-in**: when `linearTeamName` is empty, it is disabled (no Linear MCP calls);
skip silently when the Linear MCP server is unavailable.

## Configuration keys

| Key | Meaning | Default |
| --- | --- | --- |
| `linearTeamName` | Linear team **name** (not the key — the key is renamed over time, the name is stable) the follow-up issues are created under. Empty disables capture entirely. | `""` |
| `issueKeys` | Team-key prefixes that may appear in branch names, used to recognise issue ids the same way `linear-sync` does. Mirrors the established `issueKeys` convention. | `[]` |
| `followUpLabel` | Label applied to every created follow-up (provenance: this came from a review disposition). **Required when `linearTeamName` is set** — empty or unresolved must refuse create (never mint without the label). Do not also apply the repo's agent-ready triage label. Rheged estate value: `follow-up`. | `"follow-up"` |
| `followUpProject` | Linear project (name, id, or slug) used as the **catch-all** when a follow-up cannot inherit a live project from the PR's Linear issue. **Required when `linearTeamName` is set** — empty or unresolved must refuse create (never file with no project). Rheged estate value: `Follow-up issues`. | `""` |
| `followUpState` | Optional initial workflow state (type, name, or id — e.g. `Backlog`) for created issues. Empty = the team's default state. | `"Backlog"` |

## Step 9 — read-only destination resolve

Before mint, each follow-up item in the plan needs a `→ file under …` line.

When the plan includes any `follow-up` — or, on the unattended path, any `[gated]`
item — and capture is enabled (`linearTeamName` set), run the **destination cascade
below read-only** — before Step 10 on the envelope path, and before mint on the
unattended path. Use only `get_issue`, `list_projects`, `list_milestones`, and
`list_issue_labels`; do **not** call `save_milestone` or `save_issue` in this step.

Reuse that destination on mint in Step 11; do not re-decide it then.

If routing fail-closes (empty or unresolved catch-all, or empty or unresolved
`followUpLabel`), keep the item as a follow-up candidate but say on the plan line
that capture will decline / `Follow-up not tracked`. On the catch-all, when the repo
milestone does not yet exist, still show
`file under <catch-all> / <repo> (no live parent project)` on the plan line — Step 11
creates the milestone on mint. Skip this resolve when capture is disabled
(`linearTeamName` empty). Under `--dry-run`, this resolve stays read-only too (no
Linear writes).

## Step 11 — mint and destination cascade

Linear create details (team by **name**, state by **type**, links, the required
**label**, **project**, and **milestone** when the cascade has one) — resolve via
`list_issue_statuses` / `list_projects` / `list_milestones` / `list_issue_labels` and
fail loudly on typos.

**Fail closed on project and label.** When capture is enabled (`linearTeamName`
set), every minted issue **must** have a resolved `project` and the configured
`followUpLabel`. Never omit `project`. Never omit the label, and do not also
apply the repo's agent-ready triage label. Never call `save_issue` if routing or the
label fails.

Mint after Step 10 approval on the envelope path; after the plan comment on the
unattended path, with no Linear-only gate.

1. **Require `followUpLabel`.** Resolve the configured name with
   `list_issue_labels` (exact name). If `followUpLabel` is empty or the label
   does not exist → **do not** call `save_issue`. Abort capture loudly (tell
   the human to set `followUpLabel` in `config.json` and to create that label),
   and fall back to decline / `Follow-up not tracked` for each follow-up
   candidate. On success, pass that label on every `save_issue` create. Rheged
   estate value: `follow-up`.
2. **Resolve the parent id.** Extract issue ids using the same `issueKeys`
   regex as `linear-sync` (`lib/issue-keys.mjs` / `buildIssueRe`: `\bA-\d+\b`
   for a single key; grouped alternation when there are several). Skip lookup
   if there are no configured keys. Match in this order — **stop at the first
   source that yields a match**:
   1. the **upper-cased** branch name — if it has at least one match, the
      **first** match is the primary parent (later matches on the branch, and
      every match on the PR title, are ignored);
   2. else the PR title — if it has at least one match, the **first** match is
      the parent;
   3. else there is **no** parent id.
   When a parent id was resolved, `get_issue` on that id and set `relatedTo` to
   that id on every `save_issue` create, including the catch-all. **Do not**
   nest as a sub-issue (`parentId`). When there is no parent id, omit
   `relatedTo`.
3. **Live project, then milestone.** Only when step 2 resolved a parent. If it
   has a `project`, resolve that project with `list_projects` and inspect its
   status **type**. Types `completed` and `canceled` are **not live** — treat
   as no inherit and go to step 4, even if the issue still has a milestone. On
   a live project:
   - If `projectMilestone` is set, `list_milestones` on that project. An exact
     name match (a completed milestone still counts) → pass both `project` and
     `milestone` on `save_issue`. Do **not** attach the repo milestone.
     Plan line:
     `file under <project> / <milestone> (inherited from A-NNNN)`.
   - If there is no milestone, or it is not in the list → pass `project` only.
     Do **not** invent a milestone, and do **not** attach the repo milestone.
     Plan line: `file under <project> (inherited from A-NNNN)`.
4. **Otherwise fall back to `followUpProject` (the catch-all).** Typical
   reasons: no parent id, parent has no project, or the parent project is
   completed/canceled. If `followUpProject` is empty → **do not** call
   `save_issue`. Abort capture loudly (tell the human to set `followUpProject`
   in `config.json`), and fall back to decline / `Follow-up not tracked` for
   each follow-up candidate. If set → resolve it with `list_projects` (name,
   id, or slug). On a miss → **do not** call `save_issue`; fail loudly with the
   unresolved value (same decline fallback).
5. **On the catch-all, bucket by repo milestone.** GitHub repo **short name**
   from `gh repo view --json name --jq .name` (not the worktree directory).
   In Step 9, `list_milestones` only — never `save_milestone`. If a milestone
   with that exact name exists, use it on mint. If not, still show the plan
   line below; **on mint in this step** `save_milestone` to create it
   (`project` + `name`), then use the created milestone. Pass both `project`
   and `milestone` on `save_issue`. Plan line:
   `file under <catch-all> / <repo> (no live parent project)`. Still `relatedTo`
   the parent when step 2 resolved one.
6. On a successful inherit **or** fallback, always pass the resolved `project`
   and the resolved `followUpLabel` on every `save_issue` create. Never omit
   `project`. Never omit the label.

## Unattended follow-up issue body

On the unattended path (`humanEnvelope: false` / `--auto-apply`), follow-up issue
bodies must include: a falsifiable claim; what this agent verified; why it was
deferred; a labelled leaning (not an instruction); permalinks and the SHA; a
non-binding note of what was considered; an instruction to re-verify and to
decline if the claim is wrong, already done, or out of scope. No prescribed patch.
Urgent uses `priority: 1`; ordinary issues use `followUpState` (default Backlog)
with no priority bump.
