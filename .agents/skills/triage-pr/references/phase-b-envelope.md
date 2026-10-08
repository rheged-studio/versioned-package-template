# triage-pr — Phase B envelope path (`humanEnvelope: true`)

When `humanEnvelope` is `true`, run READ → UNDERSTAND → VERIFY → EVALUATE for every
finding (see [`review-discipline.md`](review-discipline.md)), produce a disposition
plan, then **halt** for one same-session batch **Yes / No / Other** approval
(**default yes**) before IMPLEMENT, Linear create, or resolving replies.

`deferNonBlocking` applies on this path. `--auto-apply` forces the unattended path
for one run — see [`phase-b-unattended.md`](phase-b-unattended.md). Legacy CLI aliases
`defer` / `defer-pending` still work.

## After Step 9 — mark pending follow-ups

As soon as the plan includes any per-thread `follow-up`, **immediately** mark those
threads with the non-resolving `follow-up-pending` decision so a restart or
overlapping run does not re-emit them as fresh findings while the human decides. Do
**not** resolve them yet — Step 11 finalises after approval.

```bash
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision follow-up-pending --bots "<config.reviewBots joined by commas>"
```

Then continue to **Step 10** (this file).

## Step 10 — human envelope (same-session gate)

Present the disposition plan as **one batch** and ask **once** (**default yes** —
plans are generally accurate). Nothing is applied until the human answers.

### 1. Detail block (chat message, above the gate)

Use **Option A — grouped by disposition**. Omit empty disposition sections.
Full cards for `accept` / `follow-up` / `gated`. Routine `decline` / `outdated`
items go in one compressed list unless the reason is non-obvious (then promote
to a full card). Include a GitHub **thread permalink** on every item when the
fetcher (or comment) provides `url`.

```markdown
## Disposition details

### [accept] Null guard in src/api.ts:42
- **Source:** CodeRabbit · [thread](https://github.com/org/repo/pull/12#discussion_r1)
- **Finding:** Optional `user` used without a check before `.id`.
- **Verify:** Real, in-scope, high-impact (would throw on anonymous).
- **Fix:** Early return when `!user`.

### [follow-up] Extract retry helper
- **Source:** Claude · [thread](…)
- **Finding:** Duplicated fetch-retry in three callers.
- **Verify:** Real but non-blocking for this PR.
- **Linear:** "Add retry backoff to fetch layer" → file under Triage PR upgrades

### [gated] eslint.config.mjs rule change
- **Source:** … · [thread](…)
- **Finding:** …
- **Verify:** …
- **Why gated:** Would edit lint config; prefer shared package change unless signed off.

### [decline] / [outdated]
1. CodeRabbit · `README.md:14` — pinning wording already correct · [thread](…)
2. Claude · exact-pinned astro — YAGNI for this PR · [thread](…)
```

### 2. Compact plan + structured Yes / No / Other

Keep a short numbered plan (for Other overrides by number) plus any bot-wait
footer. Prefer a structured question tool when available — **at most one** such
call per turn. Do **not** dump the full detail block into the question prompt.

**Compact plan shape** (also used in the prose fallback):

```text
Phase B disposition plan (nothing applied yet):
  1. [accept] Fix null guard in src/api.ts:42 — …
  2. [decline] Suggested rewrite is YAGNI — …
  3. [follow-up] Extract retry helper — draft: "Add retry backoff to fetch layer"
     → file under Triage PR upgrades (inherited from A-1541)
  4. [gated] Would need `eslint.config.mjs` rule change — your call; prefer a
     change to @rheged-studio/eslint-config
  Bots still outstanding at wait end: coderabbitai (if any)
```

**Cursor — `AskQuestion` when available:**

- Prompt: apply this Phase B disposition plan? (default yes; nothing applied yet).
- Options: **Yes** | **No** | **Other (type overrides)**.

**Claude Code — `AskUserQuestion` when available** (listed in `allowed-tools`):

- `header`: `Apply plan` (≤12 chars).
- `question`: apply this Phase B disposition plan? (default yes; nothing applied yet).
- Options: **Yes (Recommended)** (apply as proposed) | **No** (apply nothing).
- Rely on Claude Code’s automatic **Other** free-text path for typed overrides;
  if a host build does not append Other, list an explicit third **Other** option.

**Fallback** (neither `AskQuestion` nor `AskUserQuestion`):

```text
Apply this plan? [Y/n]
  (optional overrides: "yes except decline #1, follow-up #2 as …")
```

The same contract applies to the slow-bot micro-gate (Proceed / Wait / Abort) in
[`../SKILL.md`](../SKILL.md) Step 7, to Step 12 **re-envelopes**, and when `/send-it`
chains into triage. Fleet rollout of this Questions pattern to other skills: A-1655.

### 3. Interpret the answer

Keep the session open — this gate **is** the actionable interrupt.
Proposed follow-up threads should already carry the `follow-up-pending` marker from
Step 9 (durable, still open).

- **Yes** (default / Recommended / empty Enter on `[Y/n]`) → apply the plan in
  Step 11.
- **No** / Skip / dismiss-as-cancel → apply **nothing**: no commits, no Linear
  creates, no replies or resolves. Threads already marked `follow-up-pending` stay
  open with their marks, so a later run rediscovers them as `deferredThreads`. Stop;
  no Step 13 "all done" claim beyond "envelope declined; nothing applied".
- **Other** / typed overrides → interpret freeform changes (`yes except decline
  #1, follow-up #2 as …`). If unclear, **one** clarifying turn — still no apply
  until resolved.
- Under `--dry-run`, print the detail block + plan that _would_ be proposed and
  create nothing (do not call the question tools).

**No** / Skip applies nothing. **Other** accepts freeform overrides (`yes except
decline #1…`); one clarify turn if ambiguous.

The same envelope covers findings from **later** AI re-reviews on this PR
(Step 12 re-envelope) — one gate for all dispositions, including new Linear
follow-ups, using this same Questions contract (including when `/send-it` chained
into this run).

## Step 11 — apply after approval

Execute the approved plan one finding at a time:

- **Accept** → IMPLEMENT, prove locally, commit/push, re-watch CI (Step 6), then
  reply+resolve via `respond-threads.mjs` only once that fix's CI round is green.
- **Decline** / **outdated** → reply+resolve immediately (no code). Outdated handling
  is defined in [`review-discipline.md`](review-discipline.md#receiving-review-feedback--the-six-steps).
- **Follow-up** → thread should already be `follow-up-pending` from Step 9; on
  approval create the Linear issue when capture is enabled (see
  [`follow-up-routing.md`](follow-up-routing.md)), then final `follow-up`
  reply+resolve; when capture is disabled or the human excluded a follow-up,
  fall back to decline (`Follow-up not tracked`).
- **Gated (lint surface)** → apply **only** when the developer explicitly approved
  that item in the envelope. Their sign-off turns it into an accept: IMPLEMENT the
  signed-off config or ignore change, prove locally, commit/push, re-watch CI (Step 6),
  then reply+resolve once that fix's CI round is green — with `--decision accept`,
  referencing the fixing commit. `gated` is a **plan label only**; `respond-threads.mjs`
  has no such decision. **Except `.github/workflows/*`** — approval never authorises a
  workflow edit. Without sign-off, leave the thread untouched and carry the item into
  Step 13. If it only becomes clear **mid-apply** that an approved accept needs a
  lint-config edit or an ignore directive, stop that item, apply nothing, and
  re-present it as `[gated]` in the Step 12 re-envelope.

Shared thread commands (also in [`../SKILL.md`](../SKILL.md) Step 11):

```bash
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision accept --sha <sha> --bots "<config.reviewBots joined by commas>"
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision decline --reason "<technical reasoning>" --bots "<config.reviewBots joined by commas>"
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision follow-up --reference <issue-id> --bots "<config.reviewBots joined by commas>"
```

For `otherBotThreads`, append that thread's author to `--bots`.

## Step 12 — re-envelope

After the approved plan has been applied and issue-level summary ack is posted,
re-fetch (Step 8). If **new** unresolved bot findings appear after an apply push,
continue Step 7 → Step 9 → **this envelope again** (same Option A detail +
structured Yes/No/Other contract, including any new Linear candidates). Bound by
`maxReviewRounds`.
