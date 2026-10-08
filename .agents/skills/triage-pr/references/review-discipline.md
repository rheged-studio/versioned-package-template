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
decision**, never the agent's. It sits beside **Never greenwash** as the pair:
weakening a gate purely to make a check pass is a **hard ban**; anything else that
touches a lint surface is the **human-gated grey zone**. A plausible, narrowly scoped
tweak is exactly the case this covers: it may well be right, but it is not yours to
land.

Two reasons it stays with the human:

- **The shared-config model.** Estate lint rules live in packages
  (`@rheged-studio/eslint-config`, `@rheged-studio/markdownlint-config`, …). A
  per-repo override is usually the wrong place for a rule change — it forks the
  estate's lint behaviour one repo at a time.
- **Cumulative surface degradation.** Every ignore line and every loosened local rule
  permanently weakens the check for that file or path. CI goes green; the underlying
  problem stays. One at a time it always looks reasonable; the sum does not.

### Surfaces covered

**Lint / format / static-analysis config:**

- `eslint.config.*`, `.eslintrc*`
- `.markdownlint*` (`.markdownlint.jsonc`, `.markdownlint-cli2.*`)
- `.yamllint*`
- `.prettierrc*`, `.prettierignore`
- `.shellcheckrc`
- actionlint config (`.github/actionlint.yaml`)
- repo **extends** of shared config packages (swapping, narrowing, or overriding what
  the shared config sets)
- CI lint-step knobs that change rule severity (`--max-warnings`, `continue-on-error`
  on a lint step, a severity flag on the linter invocation)

> **The workflow ban is not relaxed by this gate.** Those CI lint-step knobs live in
> `.github/workflows/*`, which **Never greenwash** forbids the agent from editing
> **at all**. Listing them here means such a failure is _reported_ to the developer
> like any other gated item — it does **not** open a sign-off path for the agent to
> edit a workflow. Where the two rules overlap, the stricter one wins: the agent
> never touches it, and the developer makes the change themselves.

**Ignore / disable directives** — inline, block, or file-level:

- `eslint-disable`, `eslint-disable-next-line`, `eslint-disable-line`
- `markdownlint-disable` / `markdownlint-disable-next-line`
- `# yamllint disable` / `disable-line`
- `prettier-ignore`
- `shellcheck disable=`
- per-linter file-level ignore lists (`ignores:` / `ignorePatterns` entries,
  `.eslintignore`, `.prettierignore`, `.markdownlintignore`)
- ESLint bulk-suppression files — `eslint-suppressions.json`, or whatever file
  `--suppressions-location` points at. Adding or widening a suppression there is an
  ignore by another name; pruning entries the code no longer needs (ESLint's
  `--prune-suppressions`) is part of fixing the code, not a gated change

### Preference order

1. **Fix the offending code.** Nearly always available, and it's the only option that
   leaves the lint surface intact.
2. **Propose the rule change upstream** in the shared config package, for the
   developer to take forward. Report it — do not open it yourself as part of this run.
3. **Local override or ignore** — only with the developer's explicit sign-off, and
   only after 1 and 2 have been ruled out.

### What to report

A gated item is reported, never applied. Give the developer enough to decide without
re-deriving your analysis:

- the **file** (and rule) the change would touch;
- the **change you would have made** — the exact config edit or ignore directive;
- **why the code fix wasn't available** — this is the part that justifies the gate;
- the **preferred alternative** — the code fix you'd write, or the shared-config change
  you'd propose.

Report at the natural stopping points only (Phase A's Step 6 early stop, the Step 10
envelope as a `[gated]` plan item, or the Step 13 report) — never as a mid-loop prompt.

For a gated **review finding** on the unattended path (`humanEnvelope: false` /
`--auto-apply`) there is no envelope to sign it off: file the four points above as a
Linear follow-up (Urgent when critical/blocking) and, once it is created, resolve the
thread with the `follow-up` reply. When Linear capture is disabled or fails closed,
leave the thread unresolved and report it as an outstanding gated item. It is still
never applied.

### Carve-out — repairing what the developer already wrote

The gate targets the agent **introducing** a lint-surface change. When the PR's own
diff already contains a developer-authored lint config or ignore change, you may
repair a genuine error in it — a syntax or schema error breaking the lint job, a
malformed rule id, a misspelt glob that matches nothing. What you may **never** do,
under this carve-out or any other, is loosen a rule or widen an ignore beyond what the
developer wrote.

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

| Claim | Proof |
| --- | --- |
| Lint clean | the lint command's output showing zero errors |
| Tests pass | the test command's output showing zero failures |
| Build succeeds | the build command exiting `0` |
| Manifest valid | `npx --yes skills-ref@0.1.5 validate ./skills/<name>` exiting `0` |
| CI green | every required context from the base branch's rules present and successful on the head commit (`gh pr checks <pr> --required` is the quick view; a missing required check is pending; non-required checks are informational) |
| Bug fixed | the original failing symptom now passing |
