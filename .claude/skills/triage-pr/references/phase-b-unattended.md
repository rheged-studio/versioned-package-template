# triage-pr — Phase B unattended path (`humanEnvelope: false`)

When `humanEnvelope` is `false` (or `--auto-apply`), run READ → UNDERSTAND → VERIFY →
EVALUATE for every finding (see [`review-discipline.md`](review-discipline.md)), then
**post the full disposition plan** as a single PR comment (upsert via
`respond-threads.mjs plan` — marker `<!-- triage-pr:disposition-plan -->`) and **act**
without a Yes/No gate or a second prompt before Linear creates.

`deferNonBlocking` does **not** apply on this path — always use the impact rubric in
[`review-discipline.md`](review-discipline.md#when-to-fix-now-vs-follow-up).

## After Step 9 — post plan and branch

1. Upsert the full disposition plan on the PR (chat detail + numbered plan):

   ```bash
   node scripts/respond-threads.mjs plan --pr <pr> --body @/tmp/disposition-plan.md
   ```

   Use the same Option A grouped markdown as the envelope path
   ([`phase-b-envelope.md`](phase-b-envelope.md) Step 10 detail block). Under
   `--dry-run`, print the body only — do not call `plan`.

2. If `humanThreads` is non-empty → **stop** after the plan is posted. Apply
   nothing (no commits, no Linear creates, no bot thread resolves). Leave human
   threads untouched. Item 4 does **not** apply — there is no critical-finding
   exception when humans have open threads.

3. Otherwise → Step 11 immediately (no Step 10), subject to Item 4.

4. **Stops without merge-ready** (only when Item 2 did not apply): in-scope
   critical/blocking finding that would be its own PR (or size test unclear) —
   post plan, apply other dispositions, file **Urgent** Linear (`priority: 1`),
   stop; do not revert pushed commits. Critical lint/format/workflow finding that
   would need a gated surface — same stop (agent still never edits those files /
   workflows).

5. Ordinary / Urgent follow-ups: create in Step 11 with the body template in
   [`follow-up-routing.md`](follow-up-routing.md#unattended-follow-up-issue-body).

## Slow bots

If max wait expires with bots still missing, **do not** run the Proceed / Wait / Abort
micro-gate. Continue with whoever has reported; name missing bots in the Step 13 report.

## Step 11 — apply after plan is posted

After the plan is posted, apply dispositions immediately: accepts, declines, outdated
resolves, and Linear follow-ups (no envelope approval).

- Mark `follow-up-pending` on threads when classifying a follow-up, then create issues
  (see [`follow-up-routing.md`](follow-up-routing.md)) and post final follow-up replies.
- **Accept** → IMPLEMENT, prove locally, commit/push, re-watch CI (Step 6), then
  reply+resolve once that fix's CI round is green.
- **Decline** / **outdated** → reply+resolve immediately. Outdated handling is in
  [`review-discipline.md`](review-discipline.md#receiving-review-feedback--the-six-steps).
- **Gated (lint surface)** — never auto-applied: file as a Linear follow-up (Urgent when
  critical/blocking; resolve destination per [`follow-up-routing.md`](follow-up-routing.md)),
  then resolve the thread with the `follow-up` reply once the issue exists — or, when
  capture is disabled or fails closed, leave the thread unresolved and report it in Step 13.

```bash
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision follow-up-pending --bots "<config.reviewBots joined by commas>"
node scripts/respond-threads.mjs thread --thread <PRRT_id> --decision follow-up --reference <issue-id> --bots "<config.reviewBots joined by commas>"
```

For `otherBotThreads`, append that thread's author to `--bots`.

If only `deferredThreads` remain, finish Linear capture and summary ack in Step 11 — no
Linear-only batch prompt.

## Step 12 — re-plan

After pushes, re-fetch and re-verify; **update the same plan comment** and continue
under the same rules until CI is terminal or `maxReviewRounds` exhausts. No re-envelope.
Upsert an updated plan comment and continue through Step 11.
