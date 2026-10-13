# triage-pr — review discipline

The Phase B triage in [`../SKILL.md`](../SKILL.md) compresses two well-worn
review-handling disciplines into a short step list. The full rules live here, so
the body stays lean and an agent can load this on demand. They are adapted from
the community `receiving-code-review` and `verification-before-completion` skills
(obra/superpowers).

**Phase B path** (after verify-then-propose in Step 9): load
[`phase-b-envelope.md`](phase-b-envelope.md) when `humanEnvelope` is `true`, or
[`phase-b-unattended.md`](phase-b-unattended.md) when `humanEnvelope` is `false` or
`--auto-apply`. **Follow-up capture** (Linear routing and mint): load
[`follow-up-routing.md`](follow-up-routing.md) when the plan includes follow-ups and
`linearTeamName` is set.

## Receiving review feedback — the six steps

Run every AI finding through these in order — including threads from bot accounts
outside `reviewBots` (`otherBotThreads`). Those are dispositioned the same way
(accept, decline, follow-up, or outdated) so nothing is lost, but they are
informational: they never block promotion or the run. The point is **technical rigour, not
performative agreement**: a review bot is frequently wrong, partially right, or
missing context, and applying its suggestion blind is how a green PR ships a
regression.

1. **READ.** Absorb the whole finding — the comment body _and_ the cited file and
   line — before reacting. Don't start editing on the strength of the summary.
2. **UNDERSTAND.** Restate the claim in your own words. If you can't, the finding
   is unclear; treat that as a signal to verify harder, not to guess.
3. **VERIFY.** Check the suggestion against the **actual codebase**. Open the
   cited lines. Confirm the problem is real, reproduces, and isn't already handled
   elsewhere. Never trust the bot's framing of the code — read the code.
4. **EVALUATE.** Decide whether the change is correct _for this project_: in
   scope, compatible with the stack, and not a YAGNI or architecture violation.
   When it is valid and in-scope **and** `deferNonBlocking` is `true`, also
   classify **impact** (see **When to fix now vs follow-up** below) — propose accept
   only if high-impact; otherwise propose follow-up even though it is in scope. When
   `deferNonBlocking` is `false` (envelope path only), every valid in-scope finding
   is proposed as accept.
5. **RESPOND** — only **after** the human envelope approves (`humanEnvelope: true`),
   or immediately after the plan comment on the unattended path (`humanEnvelope: false`
   / `--auto-apply`). Symmetrically, every actioned thread ends replied-to **and**
   resolved:
   - _Decline_ → reply with the technical reasoning, then resolve.
   - _Accept_ → reply referencing the fixing commit (`Addressed in <sha>.`), then
     resolve — but only once that fix is proven (and, on a ready PR, CI-green; see
     **Resolve timing** below). When `replyOnAccept` is `false`, resolve without
     the reply.
   - _Outdated_ → first **verify** the cited code is really gone, not just moved or
     renamed (search for it). If the concern still applies to the code as it is now,
     treat it as a normal finding. Only when it is genuinely gone, reply with one line
     saying so (`--decision outdated`, optional `--reason`), then resolve.
   - _Follow-up_ (valid but **out of scope** for this PR, **or** — when
     `deferNonBlocking` is on — **in-scope but not high-impact**) → mark
     `follow-up-pending` as soon as the finding is classified (envelope: when the
     plan is presented; unattended: on classify). Linear create + final follow-up
     reply happen after Step 10 approval on the envelope path, or in Step 11
     with no Linear-only gate on the unattended path.

   The reply is the durable, per-finding audit trail reviewers and humans skimming
   the PR rely on; a silently-resolved accept loses it.

6. **IMPLEMENT.** Apply accepted findings **one at a time**, verifying each before
   the next — only after envelope approval on the `humanEnvelope: true` path, or
   immediately after the plan comment on the unattended path. Batching changes
   hides which one broke something.

## No sycophancy

Do **not** open a reply with praise — "You're absolutely right!", "Great point!",
"Excellent feedback!". Actions speak: the code change itself shows the finding was
heard. Acknowledge by describing what changed ("Fixed — `line` now falls back to
`originalLine` for outdated threads") or simply implement without commentary.

## When to decline

Push back — with technical reasoning, not defensiveness — when the suggestion:

- breaks existing functionality;
- is made without the full context (the bot couldn't see a constraint you can);
- violates YAGNI (adds an unused capability "just in case");
- conflicts with the codebase's technical stack or conventions; or
- contradicts a deliberate architectural decision.

A declined finding still gets a reply explaining _why_, then the thread is
resolved so it doesn't re-surface.

## When to fix now vs follow-up

This is the **one** impact rubric for both Phase B paths. After a finding clears
EVALUATE (correct, not YAGNI/architecture), choose **accept** vs **follow-up** for
the disposition plan. Classify impact yourself — do **not** trust bot severity labels
such as CodeRabbit ⚠️/🧹 severity labels.

A finding is **high-impact** when **any** of these hold:

- it **blocks later work** on this PR or stacked work;
- it is **critical or high severity** (correctness, security, data loss); or
- a **doc** would mislead the next agent or developer (contradicts the code, names a
  removed command, or points at the wrong file).

Impact follows **what the change does**, not where it lives: a finding in agent-skill,
CI, or release files is not high-impact just because of its path. (Lint and format
config files are a separate matter — they are **gated** by the protected-file rule
below, whatever their impact.)

Then decide:

- **Out of scope** → follow-up.
- **In scope and high-impact** → accept and fix now, **if it fits this PR** (the size
  test: would it be its own pull request?). If it would be its own PR, or the size
  test is unclear, it is a follow-up instead — marked **Urgent** (`priority: 1`) when
  critical/blocking; on the unattended path that also triggers the SKILL.md Step 9
  stop.
- **In scope, not high-impact** → follow-up. Upgrades, refactors, nits, and merely
  unclear docs wait, so the PR can land the high-impact work without churn.

`deferNonBlocking: false` (envelope path only) restores the legacy scope-only
behaviour: every valid in-scope finding is proposed as accept. The unattended path
always applies the rubric above.

## Lint surfaces are a developer decision

Changing how a linter is configured — or telling it to look away — is a **developer
decision**, never the agent's. The full rule is shared with `preflight` and `commit`
and lives in [`lint-surfaces.md`](lint-surfaces.md): the surfaces covered (config
files, ignore / disable directives, bulk-suppression files, CI lint-step knobs), the
preference order (fix the code → propose the change in the shared config package →
local override or ignore only with sign-off), the four points to report, and the
carve-out for repairing what the developer already wrote. Here it sits beside
**Never greenwash** as the pair: weakening a gate purely to make a check pass is a
hard ban; anything else that touches a lint surface is classified **gated** (Step 3
in Phase A, Step 9 in Phase B).

### Where triage-pr reports it

Report at the natural stopping points only (Phase A's Step 6 early stop, the Step 10
envelope as a `[gated]` plan item, or the Step 13 report) — never as a mid-loop prompt.

For a gated **review finding** on the unattended path (`humanEnvelope: false` /
`--auto-apply`) there is no envelope to sign it off: file the four points as a
Linear follow-up (Urgent when critical/blocking) and, once it is created, resolve the
thread with the `follow-up` reply. When Linear capture is disabled or fails closed,
leave the thread unresolved and report it as an outstanding gated item. It is still
never applied.

## Symmetric reply + resolve — recorded decisions (A-410)

The reception above is symmetric on purpose. These are the decisions that settled
how it is implemented, recorded so the SKILL.md steps have something to point at.

### Canonical resolve mechanism

Resolve a thread with GitHub's GraphQL **`resolveReviewThread`** mutation
(`PRRT_`-prefixed thread ids). It is the _only_ per-thread programmatic resolve —
there is no REST equivalent — and it is idempotent, so calling it on an
already-resolved thread is safe. We **always pair it with a reply**: the reply is
the acknowledgement reviewers (CodeRabbit included) and humans read; resolving
alone is the silent-resolve this discipline exists to prevent.

We deliberately do **not** use the bulk **`@coderabbitai resolve`** command. It
marks _every_ CodeRabbit comment resolved at once, which would sweep up declined or
not-yet-handled findings and defeat the per-finding discipline. CodeRabbit's own
docs are silent on whether a GraphQL-resolve updates its internal state; pairing
the resolve with an explicit reply is the robust path either way.

### Resolve timing vs CI

For an **accepted** finding, resolve only **after** the fixing commit is pushed
_and_ its proving command passes — and, on a ready PR, after that fix's CI round is
green. Resolving optimistically on push risks leaving a thread resolved when the
fix later regresses in CI. Declines and outdated threads carry no code, so they
resolve immediately.

### Idempotency + convergence

Every reply/comment we author carries a hidden HTML-comment marker
(`<!-- triage-pr:thread-ack -->` on thread replies,
`<!-- triage-pr:summary-ack -->` on the consolidated issue-level comment). Because
each fix push re-triggers review, the marker is what makes the loop terminate: on
the next pass, a thread already bearing our marker is **skipped**, and the
consolidated comment is **edited in place** rather than re-posted. Under
`humanEnvelope`, new findings after apply trigger another full envelope (not
silent auto-apply). A run converges when CI is green and every bot thread is
handled (resolved-by-us, declined+resolved, human-and-left-alone, or filed as
follow-up with a ticket) with no accepted fix still awaiting CI-green — Phase A
bounded by `maxCiRounds`, Phase B by `maxReviewRounds`.

### Issue-level comments — respond vs noise

Claude's review and CodeRabbit's sticky summary arrive as issue-level comments with
no resolvable per-finding thread. Acknowledge them with **one consolidated comment**
mapping each finding → accepted (`<sha>`) / declined (`<reason>`) / out-of-scope
(`<ticket>`), not a reply under every checklist sub-point — per-sub-point replies are
noise. One acknowledgement per finding, in one upserted comment.

### Verifiability

The reply/resolve **planning and formatting** (symmetry, `replyOnAccept`, the
idempotency marker, the consolidated table, upsert detection) lives in pure
functions in `scripts/respond-threads.mjs`, covered by its `--self-test` and the
root `tests/skills/triage-pr/` vitest suite. The `gh` mutations themselves are thin
wrappers, exercised only against real PRs — never unit-tested by spamming one.

## Evidence before claims

Before asserting that CI is green, a check passes, or a fix works:

1. Identify the command that **proves** the claim.
2. Run it freshly and completely — not from memory of a previous run.
3. Read the full output **and** the exit code.
4. Only then state the result, citing the evidence.

Banned until you have run the proving command: "should", "probably", "seems to",
and premature satisfaction ("Done!", "Perfect!", "All green!"). Any wording that
implies success without fresh verification breaks this rule.

Proving commands by claim:

| Claim          | Proof                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint clean     | the lint command's output showing zero errors                                                                                                                                                                                |
| Tests pass     | the test command's output showing zero failures                                                                                                                                                                              |
| Build succeeds | the build command exiting `0`                                                                                                                                                                                                |
| Manifest valid | `npx --yes skills-ref@0.1.5 validate ./skills/<name>` exiting `0`                                                                                                                                                            |
| CI green       | every required context from the base branch's rules present and successful on the head commit (`gh pr checks <pr> --required` is the quick view; a missing required check is pending; non-required checks are informational) |
| Bug fixed      | the original failing symptom now passing                                                                                                                                                                                     |
