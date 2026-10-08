#!/usr/bin/env node
// Unresolved-review-feedback fetcher for the triage-pr skill.
//
// Fetches a pull request's review feedback via `gh api graphql` and prints
// minimal JSON, so Phase B can triage findings without pulling whole comment
// payloads into context. Two shapes of feedback are surfaced separately because
// they live in different GitHub objects:
//
//   - unresolvedThreads : inline review threads with `isResolved == false`,
//                         raised by a configured review bot. Each is trimmed to
//                         { threadId, path, line, isOutdated, author, url, comments }.
//                         `url` is the first review-comment permalink when present.
//   - deferredThreads   : the same, for bot threads already carrying our
//                         non-resolving defer marker (recorded at SKILL.md Step 8
//                         but not yet ticketed/resolved at Step 10). Bucketed apart
//                         so they are NOT re-emitted as fresh findings on the next
//                         pass, and so a fresh invocation can rediscover the pending
//                         defers it holds no in-memory record of.
//   - otherBotThreads   : the same, for threads raised by a GitHub bot account that
//                         is NOT in the review-bot list (e.g. a linter or Sentry
//                         app). Dispositioned like review findings but never
//                         blocking — kept out of humanThreads so they cannot stop
//                         promotion or the unattended path.
//   - humanThreads      : the same, for threads raised by a human — surfaced so a
//                         human isn't silently dropped, but the skill does not
//                         auto-action them.
//   - aiSummaryComments : the headline summary a review bot posts about the whole
//                         PR, drawn from two surfaces — issue-level comments (the
//                         sticky `track_progress` / `use_sticky_comment` summary
//                         CodeRabbit/Claude edit in place) AND review-submission
//                         bodies for bots that post a headline review there).
//                         Neither is a review thread, so neither has `isResolved`
//                         and the reviewThreads query never returns them.
//   - botStatus         : per configured bot, whether it has reviewed the CURRENT
//                         head since the PR was marked ready (SKILL.md Step 7):
//                         `reported`, `pending`, `skipped` (won't report), or
//                         `missing`. A bot mapped in `--bot-checks` settles on its
//                         status/check for the head commit; an unmapped bot falls
//                         back to review/comment activity after the ready flip on
//                         the current head (sticky comments, and the finished
//                         "**Claude finished @…'s task**" claude-code-action
//                         tracking comment, count when edited in place via
//                         `updatedAt`). A draft-time walkthrough or a
//                         "Review skipped: draft pull request" status never counts.
//   - botsReported / botsSkipped / botsMissing : botStatus grouped by state
//                         (`botsMissing` covers both `pending` and `missing`).
//   - activityFingerprint : changes whenever the head, the open bot threads, or a
//                         bot summary (including an in-place edit) changes — the
//                         idle-window signal for Step 7.
//
// The network layer (gh) is kept separate from the pure transform so the
// transform is unit-tested by `--self-test` with no network access.
//
// This script is READ-ONLY — it only fetches and prints — so it has no
// `--dry-run` flag (there is nothing to preview; running it changes nothing).
// The write side lives in `respond-threads.mjs`, which is where `--dry-run`
// belongs.
//
// Usage:
//   node review-threads.mjs <pr-number-or-url>                 # minimal JSON to stdout
//   node review-threads.mjs <pr> --bots "a[bot],b[bot]"        # override review-bot logins
//   node review-threads.mjs <pr> --repo owner/name             # set repo explicitly
//   node review-threads.mjs <pr> --bot-checks '{"coderabbitai":"CodeRabbit"}'  # bot → status/check name
//   node review-threads.mjs <pr> --bot-checks '{"coderabbitai":{"name":"CodeRabbit","producer":"coderabbitai"}}'  # optional producer pin
//   node review-threads.mjs <pr> --include-resolved            # keep resolved threads too
//   node review-threads.mjs --self-test                        # run built-in fixtures

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

// Common AI review-bot logins. GitHub's GraphQL API returns bot logins WITHOUT
// the `[bot]` suffix (e.g. `claude`, `coderabbitai`), whereas the REST API and
// many docs show the suffixed form (`claude[bot]`). `botMatches` normalises both
// sides, so a consumer's config can use either form.
const DEFAULT_BOTS = ["claude", "coderabbitai"];

// Non-resolving follow-up-pending markers written by respond-threads.mjs at SKILL.md
// Step 8. A bot thread bearing either in any comment is a pending follow-up, not a
// fresh finding, so buildResult buckets it into `deferredThreads`. Keep these
// strings in sync with respond-threads.mjs (FOLLOW_UP_PENDING_MARKERS there).
const FOLLOW_UP_PENDING_MARKERS = [
  "<!-- triage-pr:follow-up-pending -->",
  "<!-- triage-pr:defer-pending -->",
];

// ---- pure transform (no network) ----------------------------------------

/**
 * Strip a trailing `[bot]` suffix so a login compares equal in either form.
 */
function normaliseBot(login) {
  return String(login ?? "").replace(/\[bot\]$/, "");
}

/**
 * Build a suffix-insensitive predicate matching a login against the bot list.
 */
function makeBotMatcher(bots) {
  const set = new Set(bots.map(normaliseBot));
  return (login) => set.has(normaliseBot(login));
}

/**
 * Reduce raw GraphQL comment nodes to the minimal `{ author, body }` (no urls —
 * the thread-level `url` carries the permalink).
 */
function trimComments(commentNodes) {
  return (commentNodes ?? []).map((commentNode) => ({
    author: commentNode.author?.login ?? "unknown",
    body: commentNode.body ?? "",
  }));
}

/**
 * First non-empty comment `url` from a raw thread's comment nodes.
 * @param {{comments?: {nodes?: Array<{url?: string|null}>}}|undefined} node
 * @returns {string|null}
 */
function firstCommentUrl(node) {
  for (const commentNode of node?.comments?.nodes ?? []) {
    if (commentNode?.url) {
      return commentNode.url;
    }
  }

  return null;
}

/**
 * Reduce a raw review-thread node to its minimal shape for the report.
 */
function shapeThread(node) {
  const comments = trimComments(node.comments?.nodes);
  return {
    author: comments[0]?.author ?? "unknown",
    comments,
    isOutdated: Boolean(node.isOutdated),
    line: node.line ?? node.originalLine ?? null,
    path: node.path ?? null,
    threadId: node.id,
    url: firstCommentUrl(node),
  };
}

// Markers that identify a review bot's **sticky summary** comment (the headline
// review, posted/edited in place via `track_progress` / `use_sticky_comment` or a
// walkthrough) as opposed to chatter — "I'll review", command acknowledgements,
// "resolved" replies. Matched case-insensitively against the comment body.
const STICKY_MARKERS = [
  /use_sticky_comment/i,
  /track_progress/i,
  /\bwalkthrough\b/i,
  /auto-generated comment/i,
  /\bsummary by\b/i,
];

// claude-code-action's tracking comment once the run has **finished**. The action
// posts the comment early ("Claude Code is working…") and edits it in place; only
// the final edit opens with this header, e.g.
//   **Claude finished @octocat's task in 5m 9s** —— [View job](…)
// It carries none of the STICKY_MARKERS, so without this a clean Claude review (no
// PR review, no threads) never settles an unmapped `claude` (A-2453). Anchored to
// the start of the body so a finished body that quotes "Claude is working" further
// down still counts, while an in-progress or errored comment never does.
const CLAUDE_FINISHED_SUMMARY = /^\s*\*\*Claude finished @[^\s*]+?['’]s task\b/;

/**
 * Whether a body is worth considering as a headline summary. Rejects blank bodies
 * (e.g. an approval review with no text).
 * @param {string} body
 * @returns {boolean}
 */
function isSummaryCandidate(body) {
  return String(body ?? "").trim().length > 0;
}

/**
 * Whether a comment body carries a sticky-summary marker.
 * @param {string} body
 * @returns {boolean}
 */
export function hasStickyMarker(body) {
  return STICKY_MARKERS.some((marker) => marker.test(body ?? ""));
}

/**
 * Whether a comment body is a finished review summary: a sticky-marker summary,
 * or claude-code-action's tracking comment in its finished form. An in-progress
 * acknowledgement ("Claude Code is working…") is neither.
 * @param {string} body
 * @returns {boolean}
 */
export function isFinishedSummary(body) {
  return (
    hasStickyMarker(body) || CLAUDE_FINISHED_SUMMARY.test(String(body ?? ""))
  );
}

/**
 * Pick at most one summary comment per review bot. Filtering candidates by `isBot`
 * alone surfaces *every* bot comment — walkthrough chatter, command
 * acknowledgements — as "the headline review", inflating Phase B context. Instead,
 * keep each bot's **latest marker-bearing** candidate, falling back to its **first**
 * candidate when none carries a sticky marker. A finished claude-code-action
 * tracking comment counts as marker-bearing here (`isFinishedSummary`), so the
 * latest finished run's summary wins over an earlier run's. Input order is GitHub's chronological
 * order, so "latest marker-bearing" means a fresh summary always supersedes an older
 * one: an initial "reviewing…" ack (no marker) is upgraded to the real summary, and a
 * re-review's new summary replaces the previous one. That re-review case matters for
 * bots that submit a **fresh** review body per commit rather than editing one issue
 * comment in place — without preferring the latest marker-bearing body, a stale
 * headline would stick. A later *non*-marker candidate never downgrades a real summary.
 *
 * Candidates come from two surfaces, concatenated by the caller as
 * `[...issueComments, ...reviewBodies]` — issue comments seen first, review bodies
 * second. A bot whose headline lives only on a review submission surfaces via its
 * review body. For a bot that posts a marker on **both** surfaces (e.g. CodeRabbit —
 * a sticky issue comment and a walkthrough review body), the review body wins because
 * it is concatenated later and "latest marker wins". That is deliberate and harmless:
 * the two surfaces carry equivalent summary content, and only one summary per bot is
 * surfaced either way. Blank bodies are dropped by `isSummaryCandidate`.
 * @param {Array<{author?: {login?: string}, body?: string, id?: string, url?: string}>} commentNodes
 * @param {(login: string|undefined) => boolean} isBot
 */
export function selectSummaryComments(commentNodes, isBot) {
  /** @type {Map<string, {author: string, body: string, commentId: string, url: string|null}>} */
  const byAuthor = new Map();
  for (const node of commentNodes ?? []) {
    const login = node.author?.login;
    if (!isBot(login) || !isSummaryCandidate(node.body)) {
      continue;
    }

    const shaped = {
      author: login ?? "unknown",
      body: node.body ?? "",
      commentId: node.id,
      url: node.url ?? null,
    };
    const existing = byAuthor.get(shaped.author);
    if (!existing || isFinishedSummary(shaped.body)) {
      // First candidate for this bot, or a later marker-bearing one — the latter is
      // the freshest real summary, so it supersedes whatever was stored (an earlier
      // ack, or an earlier marker-bearing summary from a prior review round). A later
      // candidate WITHOUT a marker is left to fall through, never displacing a stored
      // summary with chatter.
      byAuthor.set(shaped.author, shaped);
    }
  }

  return [...byAuthor.values()];
}

/**
 * True when any of a thread's comments carries a follow-up-pending marker (new or legacy).
 */
function isFollowUpPending(thread) {
  return thread.comments.some((comment) => {
    const body = String(comment.body ?? "");
    return FOLLOW_UP_PENDING_MARKERS.some((marker) => body.includes(marker));
  });
}

/**
 * Whether a raw GraphQL author is a GitHub bot account. GraphQL reports the actor
 * type as `__typename: "Bot"`; the `[bot]` suffix covers REST-shaped fixtures.
 * @param {{__typename?: string, login?: string}|null|undefined} author
 * @returns {boolean}
 */
function isBotAccount(author) {
  return (
    author?.__typename === "Bot" || /\[bot\]$/.test(String(author?.login ?? ""))
  );
}

// ---- settle (Step 7): has each bot reviewed the current head since ready? ----

// CheckRun conclusions / StatusContext states that mean the bot finished and
// reported. Every other terminal value (cancelled, skipped, neutral, timed out,
// error, failure of the review job itself …) means "won't report" — the bot is
// settled as `skipped`, never left `missing`.
const REPORTED_CONCLUSIONS = new Set(["SUCCESS"]);
const PENDING_STATUS_STATES = new Set(["EXPECTED", "PENDING"]);
// CodeRabbit marks a skipped review with a SUCCESS status whose description says
// so (e.g. "Review skipped: draft pull request"). Post-ready, that is "won't report".
const SKIPPED_DESCRIPTION = /review skipped/i;

/**
 * Epoch milliseconds for an ISO timestamp, or null when absent / unparsable.
 * @param {string|null|undefined} value
 * @returns {number|null}
 */
function toMs(value) {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * True when `timestamp` is at or after `threshold`. With no threshold (no ready
 * or head timing known) any activity counts; with a threshold, an undated node
 * never counts — staying `missing` is the safe failure.
 * @param {string|null|undefined} timestamp
 * @param {number|null} threshold
 */
function isAfter(timestamp, threshold) {
  if (threshold === null) {
    return true;
  }

  const ms = toMs(timestamp);
  return ms !== null && ms >= threshold;
}

/**
 * Whether a raw status-check rollup node is the configured check for a bot.
 * Matches a StatusContext `context`, a CheckRun `name`, a CheckRun whose name is
 * `<key> / <job>`, or `<workflow name> / <check name>` — all case-insensitive.
 * @param {object} node
 * @param {string} key
 */
function contextMatches(node, key) {
  const wanted = key.trim().toLowerCase();
  if (node.__typename === "StatusContext") {
    return String(node.context ?? "").toLowerCase() === wanted;
  }

  const name = String(node.name ?? "").toLowerCase();
  const workflow = String(
    node.checkSuite?.workflowRun?.workflow?.name ?? "",
  ).toLowerCase();
  return (
    name === wanted ||
    name.startsWith(`${wanted} / `) ||
    (workflow !== "" && `${workflow} / ${name}` === wanted)
  );
}

/**
 * GitHub login or app slug for who posted a rollup node (when GraphQL selected it).
 * @param {object} node
 * @returns {string|null}
 */
function producerIdentity(node) {
  if (node.__typename === "StatusContext") {
    return node.creator?.login ?? null;
  }

  if (node.__typename === "CheckRun") {
    return node.checkSuite?.app?.slug ?? null;
  }

  return null;
}

/**
 * @param {string|null|undefined} identity
 */
function normaliseProducer(identity) {
  return String(identity ?? "")
    .toLowerCase()
    .replace(/\[bot\]$/, "");
}

/**
 * When `expectedProducer` is set, the rollup node must carry a matching producer.
 * @param {object} node
 * @param {string|undefined} expectedProducer
 */
function producerMatches(node, expectedProducer) {
  if (!expectedProducer) {
    return true;
  }

  const identity = producerIdentity(node);
  if (!identity) {
    return false;
  }

  return normaliseProducer(identity) === normaliseProducer(expectedProducer);
}

/**
 * Normalise a bot-check mapping value (string or `{ name, producer? }`).
 * @param {string|{ name: string, producer?: string }} spec
 * @returns {{ name: string, producer?: string }}
 */
function normaliseCheckSpec(spec) {
  if (typeof spec === "string") {
    const name = spec.trim();
    if (!name) {
      throw new Error("check name must be a non-empty string");
    }

    return { name };
  }

  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error(
      "check spec must be a string or { name, producer? } object",
    );
  }

  const extra = Object.keys(spec).filter(
    (key) => key !== "name" && key !== "producer",
  );
  if (extra.length > 0) {
    throw new Error(`check spec has unexpected keys: ${extra.join(", ")}`);
  }

  if (typeof spec.name !== "string" || !spec.name.trim()) {
    throw new Error("check spec name must be a non-empty string");
  }

  if (
    spec.producer !== undefined &&
    (typeof spec.producer !== "string" || !spec.producer.trim())
  ) {
    throw new Error("check spec producer must be a non-empty string");
  }

  return {
    name: spec.name.trim(),
    ...(spec.producer ? { producer: spec.producer.trim() } : {}),
  };
}

/**
 * Latest activity time of a rollup node (ms), used to order and date-filter it.
 * A freshly queued CheckRun has neither `startedAt` nor `completedAt`; date it
 * from its check suite's `createdAt` so a queued rerun still outranks an earlier
 * cancelled run — but only when the suite itself post-dates the threshold, so an
 * undated run from the draft period never counts.
 * @param {object} node
 * @returns {number|null}
 */
function contextTime(node) {
  if (node.__typename === "StatusContext") {
    return toMs(node.createdAt);
  }

  const times = [toMs(node.startedAt), toMs(node.completedAt)].filter(
    (ms) => ms !== null,
  );
  return times.length > 0
    ? Math.max(...times)
    : toMs(node.checkSuite?.createdAt);
}

/**
 * Settle state of a bot mapped to a status/check. Only rollup entries that
 * post-date the threshold count, so a draft-time "Review skipped" success or a
 * skipped draft run never reads as reported. The rollup is the head commit's, so
 * a fresh push resets this naturally.
 * @param {string|{ name: string, producer?: string }} checkSpec
 * @param {object[]} checkContexts
 * @param {number|null} threshold
 * @returns {{state: string, evidence: string}}
 */
function settleFromCheck(checkSpec, checkContexts, threshold) {
  const { name: checkKey, producer } = normaliseCheckSpec(checkSpec);
  const byName = (checkContexts ?? [])
    .filter((node) => contextMatches(node, checkKey))
    .filter((node) => {
      if (threshold === null) {
        return true;
      }

      const time = contextTime(node);
      return time !== null && time >= threshold;
    });
  const candidates = byName
    .filter((node) => producerMatches(node, producer))
    .toSorted((a, b) => (contextTime(b) ?? 0) - (contextTime(a) ?? 0));
  const latest = candidates[0];
  if (!latest) {
    if (producer && byName.some((node) => !producerMatches(node, producer))) {
      return {
        evidence: `"${checkKey}" status or check posted by an unexpected producer (expected "${producer}")`,
        state: "missing",
      };
    }

    return {
      evidence: `no "${checkKey}" status or check since ready on the head commit`,
      state: "missing",
    };
  }

  if (latest.__typename === "StatusContext") {
    const statusLabel = `${latest.context} ${latest.state}${latest.description ? ` (${latest.description})` : ""}`;
    if (PENDING_STATUS_STATES.has(latest.state)) {
      return { evidence: statusLabel, state: "pending" };
    }

    if (
      REPORTED_CONCLUSIONS.has(latest.state) &&
      !SKIPPED_DESCRIPTION.test(String(latest.description ?? ""))
    ) {
      return { evidence: statusLabel, state: "reported" };
    }

    return { evidence: statusLabel, state: "skipped" };
  }

  const label = `${latest.name} ${latest.conclusion ?? latest.status}`;
  if (latest.status !== "COMPLETED") {
    return { evidence: label, state: "pending" };
  }

  return {
    evidence: label,
    state: REPORTED_CONCLUSIONS.has(latest.conclusion) ? "reported" : "skipped",
  };
}

/**
 * Settle state of an unmapped bot from its own activity after the threshold:
 * a review submitted on the head commit, a review-thread comment, or a
 * finished summary comment — a sticky-marker summary or claude-code-action's
 * "**Claude finished @…'s task**" tracking comment — created **or edited in
 * place** (`updatedAt`). A bare ack ("Claude Code is working…") never counts.
 * @returns {{state: string, evidence: string}}
 */
function settleFromActivity({
  bot,
  commentNodes,
  headRefOid,
  reviewNodes,
  threadNodes,
  threshold,
}) {
  function byBot(author) {
    return normaliseBot(author?.login) === bot;
  }

  for (const node of commentNodes ?? []) {
    if (
      byBot(node.author) &&
      isFinishedSummary(node.body) &&
      isAfter(node.updatedAt ?? node.createdAt, threshold)
    ) {
      return { evidence: `summary comment ${node.id}`, state: "reported" };
    }
  }

  for (const node of reviewNodes ?? []) {
    const onHead =
      !headRefOid || !node.commit?.oid || node.commit.oid === headRefOid;
    if (
      byBot(node.author) &&
      onHead &&
      isAfter(node.submittedAt ?? node.createdAt, threshold)
    ) {
      return { evidence: `review ${node.id}`, state: "reported" };
    }
  }

  for (const node of threadNodes ?? []) {
    for (const comment of node.comments?.nodes ?? []) {
      if (byBot(comment.author) && isAfter(comment.createdAt, threshold)) {
        return { evidence: `thread ${node.id}`, state: "reported" };
      }
    }
  }

  return {
    evidence: "no review activity since ready on the head commit",
    state: "missing",
  };
}

/**
 * Per-bot settle state for SKILL.md Step 7 (pure). The threshold is the later of
 * the ready flip and the head commit, so activity from the draft period or from a
 * superseded head never counts.
 * @param {object} input
 * @param {string[]} input.bots configured review bots
 * @param {Record<string, string|{ name: string, producer?: string }>} [input.botChecks] bot → status/check name or `{ name, producer? }`
 * @param {object[]} [input.checkContexts] head-commit statusCheckRollup nodes
 * @param {string|null} [input.readyAt] last ready-for-review time
 * @param {string|null} [input.headCommittedAt] head commit date
 * @param {string|null} [input.headRefOid] head commit oid
 * @param {boolean} [input.isDraft] a draft has had no review to settle on yet
 * @param {object[]} [input.commentNodes] issue comments on the PR
 * @param {object[]} [input.reviewNodes] review submissions on the PR
 * @param {object[]} [input.threadNodes] review threads on the PR
 * @returns {Array<{bot: string, state: string, via: string, evidence: string}>}
 */
export function settleBots({
  botChecks = {},
  bots,
  checkContexts = [],
  commentNodes = [],
  headCommittedAt = null,
  headRefOid = null,
  isDraft = false,
  readyAt = null,
  reviewNodes = [],
  threadNodes = [],
}) {
  const checksByBot = new Map(
    Object.entries(botChecks ?? {}).map(([bot, check]) => [
      normaliseBot(bot),
      check,
    ]),
  );

  if (isDraft) {
    // AI review is gated on ready-for-review, so nothing posted while the PR is
    // a draft can settle it.
    return (bots ?? DEFAULT_BOTS).map(normaliseBot).map((bot) => ({
      bot,
      evidence: "PR is still a draft",
      state: "missing",
      via: checksByBot.has(bot) ? "check" : "activity",
    }));
  }

  const times = [toMs(readyAt), toMs(headCommittedAt)].filter(
    (ms) => ms !== null,
  );
  const threshold = times.length > 0 ? Math.max(...times) : null;

  return (bots ?? DEFAULT_BOTS).map(normaliseBot).map((bot) => {
    const checkSpec = checksByBot.get(bot);
    if (checkSpec) {
      return {
        bot,
        via: "check",
        ...settleFromCheck(checkSpec, checkContexts, threshold),
      };
    }

    return {
      bot,
      via: "activity",
      ...settleFromActivity({
        bot,
        commentNodes,
        headRefOid,
        reviewNodes,
        threadNodes,
        threshold,
      }),
    };
  });
}

/**
 * Short stable hash of everything whose change counts as "new activity" for the
 * Step 7 idle window: the head, the open bot threads, and each bot summary's id
 * and last edit time (so a sticky comment edited in place registers).
 */
function fingerprint({ headRefOid, summaryNodes, threads }) {
  const parts = [
    `head:${headRefOid ?? ""}`,
    `threads:${threads
      .map((thread) => `${thread.threadId}#${thread.comments.length}`)
      .toSorted()
      .join(",")}`,
    `summaries:${summaryNodes
      .map((node) => `${node.id}@${node.updatedAt ?? node.createdAt ?? ""}`)
      .toSorted()
      .join(",")}`,
  ];
  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Build the minimal result from raw GraphQL nodes. Splitting bot threads from
 * human threads honours the skill's "AI bots only" contract while still
 * surfacing human threads for the report. A bot thread already bearing our
 * non-resolving defer marker is bucketed apart into `deferredThreads` so it is not
 * re-emitted as a fresh finding (and stays rediscoverable by a later invocation).
 * Threads from bot accounts outside `bots` go to `otherBotThreads`, never to
 * `humanThreads`, so they cannot block promotion or the unattended path.
 */
export function buildResult({
  botChecks = {},
  bots,
  checkContexts = [],
  commentNodes,
  headCommittedAt = null,
  headRefOid = null,
  includeResolved = false,
  isDraft,
  number,
  readyAt = null,
  reviewNodes = [],
  threadNodes,
}) {
  const isBot = makeBotMatcher(bots ?? DEFAULT_BOTS);
  const unresolvedThreads = [];
  const deferredThreads = [];
  const otherBotThreads = [];
  const humanThreads = [];

  for (const node of threadNodes ?? []) {
    if (!includeResolved && node.isResolved) {
      continue;
    }

    const thread = shapeThread(node);
    if (isBot(thread.author)) {
      if (isFollowUpPending(thread)) {
        deferredThreads.push(thread);
      } else {
        unresolvedThreads.push(thread);
      }
    } else if (isBotAccount(node.comments?.nodes?.[0]?.author)) {
      otherBotThreads.push(thread);
    } else {
      humanThreads.push(thread);
    }
  }

  // Issue comments first so issue-comment bots keep their existing summary; review
  // bodies follow so a review-only bot surfaces.
  const aiSummaryComments = selectSummaryComments(
    [...(commentNodes ?? []), ...(reviewNodes ?? [])],
    isBot,
  );

  // Settle helpers for the Phase B hybrid wait (SKILL.md Step 7): has each bot
  // reviewed the current head since the ready flip?
  const botStatus = settleBots({
    botChecks,
    bots: bots ?? DEFAULT_BOTS,
    checkContexts,
    commentNodes,
    headCommittedAt,
    headRefOid,
    isDraft: Boolean(isDraft),
    readyAt,
    reviewNodes,
    threadNodes,
  });
  function byState(...states) {
    return botStatus
      .filter((status) => states.includes(status.state))
      .map((status) => status.bot);
  }

  const summaryIds = new Set(
    aiSummaryComments.map((comment) => comment.commentId),
  );

  return {
    activityFingerprint: fingerprint({
      headRefOid,
      summaryNodes: [...(commentNodes ?? []), ...(reviewNodes ?? [])].filter(
        (node) => summaryIds.has(node.id),
      ),
      threads: [...unresolvedThreads, ...deferredThreads, ...otherBotThreads],
    }),
    aiSummaryComments,
    botsMissing: byState("missing", "pending"),
    botsReported: byState("reported"),
    botsSkipped: byState("skipped"),
    botStatus,
    deferredThreads,
    headRefOid,
    humanThreads,
    isDraft: Boolean(isDraft),
    otherBotThreads,
    pr: number,
    readyAt,
    unresolvedThreads,
  };
}

// ---- argument parsing ----------------------------------------------------

/**
 * Parse a `--bot-checks` value: a JSON object mapping bot login → status/check
 * name string or `{ name, producer? }` (e.g. `{"coderabbitai":"CodeRabbit"}`).
 * Throws on anything else.
 * @param {string} value
 * @returns {Record<string, { name: string, producer?: string }>}
 */
export function parseBotChecks(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("--bot-checks must be a JSON object of bot → check name");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--bot-checks must be a JSON object of bot → check name");
  }

  const result = {};
  for (const [bot, check] of Object.entries(parsed)) {
    if (!bot.trim()) {
      throw new Error(
        `--bot-checks entry for "${bot}" must use a non-empty bot login`,
      );
    }

    try {
      result[bot] = normaliseCheckSpec(check);
    } catch (error) {
      throw new Error(
        `--bot-checks entry for "${bot}" must map to a non-empty check name or { name, producer? }: ${error.message}`,
      );
    }
  }

  return result;
}

/**
 * Parse argv into `{ pr, bots, botChecks, repo, includeResolved }`; throws on a flag missing its value, an unknown `--flag`, or a malformed `--repo` / `--bot-checks`.
 */
export function parseArgs(argv) {
  const options = {
    botChecks: {},
    bots: DEFAULT_BOTS,
    includeResolved: false,
    pr: null,
    repo: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--include-resolved") {
      options.includeResolved = true;
    } else if (argument === "--bot-checks") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) {
        throw new Error("--bot-checks requires a JSON object value");
      }

      options.botChecks = parseBotChecks(value);
    } else if (argument === "--bots") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) {
        throw new Error("--bots requires a comma-separated list of bot logins");
      }

      options.bots = value
        .split(",")
        .map((source) => source.trim())
        .filter(Boolean);
      if (options.bots.length === 0) {
        throw new Error("--bots requires at least one non-empty bot login");
      }
    } else if (argument === "--repo") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) {
        throw new Error("--repo requires an owner/name value");
      }

      if (!/^[^/\s]+\/[^/\s]+$/.test(value)) {
        throw new Error("--repo must be exactly owner/name");
      }

      options.repo = value;
    } else if (!argument.startsWith("--") && options.pr === null) {
      options.pr = argument;
    } else if (argument.startsWith("--")) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      throw new Error(`unexpected argument: ${argument}`);
    }
  }

  return options;
}

/**
 * Accept a bare number or a full PR URL; return `{ number, repo }`.
 */
export function resolvePr(prArgument, repoArgument) {
  if (prArgument === null) {
    throw new Error("no PR number or URL given");
  }

  const urlMatch = String(prArgument).match(
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
  );
  if (urlMatch) {
    return {
      number: Number(urlMatch[3]),
      repo: `${urlMatch[1]}/${urlMatch[2]}`,
    };
  }

  const number = Number(prArgument);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`not a PR number or URL: ${prArgument}`);
  }

  return { number, repo: repoArgument };
}

// ---- network layer (gh) --------------------------------------------------

/**
 * Run a `gh` command and return stdout; 30s timeout so a stalled call can't hang.
 */
function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000, // don't hang forever if a gh call stalls
  });
}

/**
 * Run a GraphQL query via `gh api graphql`, typing each variable as -f/-F.
 */
function ghGraphQL(query, variables) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      args.push("-F", `${key}=${value}`);
    } else {
      args.push("-f", `${key}=${value}`);
    }
  }

  return JSON.parse(gh(args));
}

/**
 * Return the current repository as `owner/name`.
 */
function detectRepo() {
  return gh([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "-q",
    ".nameWithOwner",
  ]).trim();
}

const THREADS_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      isDraft
      reviewThreads(first:100, after:$cursor){
        pageInfo{ hasNextPage endCursor }
        nodes{
          id isResolved isOutdated path line originalLine
          comments(first:100){ nodes{ author{ __typename login } body url createdAt } }
        }
      }
    }
  }
}`;

const COMMENTS_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      comments(first:100, after:$cursor){
        pageInfo{ hasNextPage endCursor }
        nodes{ id author{ __typename login } body url createdAt updatedAt }
      }
    }
  }
}`;

// Review submissions carry the headline summary for bots that post one as a review
// rather than an issue comment. `state` is selected for context but not acted on.
const REVIEWS_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviews(first:100, after:$cursor){
        pageInfo{ hasNextPage endCursor }
        nodes{ id author{ __typename login } body state url submittedAt commit{ oid } }
      }
    }
  }
}`;

// Settle inputs for Step 7: the head commit, when the PR was last marked ready,
// and the head commit's status-check rollup (paged — busy repos exceed 100).
const STATE_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      isDraft createdAt headRefOid
      timelineItems(itemTypes:[READY_FOR_REVIEW_EVENT], last:1){
        nodes{ ... on ReadyForReviewEvent{ createdAt } }
      }
      commits(last:1){
        nodes{
          commit{
            oid committedDate
            statusCheckRollup{
              contexts(first:100, after:$cursor){
                pageInfo{ hasNextPage endCursor }
                nodes{
                  __typename
                  ... on CheckRun{ name status conclusion startedAt completedAt checkSuite{ createdAt app { slug } workflowRun{ workflow{ name } } } }
                  ... on StatusContext{ context state description createdAt creator { login } }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

/**
 * Page through a PR sub-connection, collecting every node. Also returns
 * `isDraft`, which is meaningful only for queries that select it (the threads
 * query) and `undefined` otherwise — callers read it from the threads call alone.
 */
function fetchAll(query, owner, name, number, pick) {
  const nodes = [];
  let cursor = null;
  let isDraft;
  do {
    const data = ghGraphQL(query, { cursor, name, number, owner });
    const pr = data.data.repository.pullRequest;
    if (pr.isDraft !== undefined) {
      isDraft = pr.isDraft;
    }

    const conn = pick(pr);
    nodes.push(...conn.nodes);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);

  return { isDraft, nodes };
}

/**
 * Fetch a PR's review threads, issue comments, reviews and settle state from GitHub.
 */
function fetchFromGitHub(number, repo) {
  const nameWithOwner = repo ?? detectRepo();
  const parts = nameWithOwner.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`could not resolve repo: ${nameWithOwner}`);
  }

  const [owner, name] = parts;
  const threads = fetchAll(
    THREADS_QUERY,
    owner,
    name,
    number,
    (pr) => pr.reviewThreads,
  );
  const comments = fetchAll(
    COMMENTS_QUERY,
    owner,
    name,
    number,
    (pr) => pr.comments,
  );
  const reviews = fetchAll(
    REVIEWS_QUERY,
    owner,
    name,
    number,
    (pr) => pr.reviews,
  );
  return {
    commentNodes: comments.nodes,
    isDraft: threads.isDraft,
    reviewNodes: reviews.nodes,
    threadNodes: threads.nodes,
    ...fetchState(owner, name, number),
  };
}

/**
 * Fetch the settle inputs: head oid and commit date, the last ready-for-review
 * time (the PR's creation time when it was never a draft), and every node of
 * the head commit's status-check rollup.
 */
function fetchState(owner, name, number) {
  const checkContexts = [];
  let cursor = null;
  let state;
  do {
    const pr = ghGraphQL(STATE_QUERY, { cursor, name, number, owner }).data
      .repository.pullRequest;
    const commit = pr.commits.nodes[0]?.commit;
    state ??= {
      headCommittedAt: commit?.committedDate ?? null,
      headRefOid: pr.headRefOid,
      readyAt: pr.isDraft
        ? null
        : (pr.timelineItems.nodes[0]?.createdAt ?? pr.createdAt),
    };
    const contexts = commit?.statusCheckRollup?.contexts;
    checkContexts.push(...(contexts?.nodes ?? []));
    cursor = contexts?.pageInfo.hasNextPage
      ? contexts.pageInfo.endCursor
      : null;
  } while (cursor);

  return { checkContexts, ...state };
}

// ---- self-test -----------------------------------------------------------

/**
 * Map an array of shaped threads to their `threadId`s (self-test helper).
 */
function ids(array) {
  return array.map((thread) => thread.threadId);
}

/**
 * Run the built-in fixtures (no network) and exit non-zero on any failure.
 */
function settleBotStateFromResult(settleOut, bot) {
  return settleOut.botStatus.find((status) => status.bot === bot)?.state;
}

/**
 * Self-test fixture: a claude-code-action tracking comment by `claude`.
 */
function claudeComment(body, createdAt, updatedAt, id = "IC_claude_tracking") {
  return {
    author: { __typename: "Bot", login: "claude" },
    body,
    createdAt,
    id,
    updatedAt,
  };
}

function selfTest() {
  // GraphQL returns bot logins WITHOUT the `[bot]` suffix (e.g. `claude`,
  // `coderabbitai`), so the fixtures use the bare form.
  const threadNodes = [
    {
      comments: {
        nodes: [
          {
            author: { login: "coderabbitai" },
            body: "nit: typo",
            url: "https://github.com/acme/repo/pull/1#discussion_r99",
          },
        ],
      },
      id: "T_bot_unresolved",
      isOutdated: false,
      isResolved: false,
      line: 42,
      path: "skills/x/SKILL.md",
    },
    {
      comments: { nodes: [{ author: { login: "claude" }, body: "done" }] },
      id: "T_bot_resolved",
      isOutdated: false,
      isResolved: true,
      line: 1,
      path: "a.ts",
    },
    {
      comments: { nodes: [{ author: { login: "claude" }, body: "moved" }] },
      id: "T_bot_outdated",
      isOutdated: true,
      isResolved: false,
      line: null,
      originalLine: 9,
      path: "b.ts",
    },
    {
      comments: {
        nodes: [{ author: { login: "alice" }, body: "please rename" }],
      },
      id: "T_human",
      isOutdated: false,
      isResolved: false,
      line: 3,
      path: "c.ts",
    },
    // A bot thread with a pending follow-up (Step 8): legacy marker still buckets.
    {
      comments: {
        nodes: [
          { author: { login: "coderabbitai" }, body: "extract this helper" },
          {
            author: { login: "RobEasthope" },
            body: `Noted for follow-up.\n\n${FOLLOW_UP_PENDING_MARKERS[1]}`,
          },
        ],
      },
      id: "T_bot_deferred",
      isOutdated: false,
      isResolved: false,
      line: 12,
      path: "e.ts",
    },
    // Same bucket with the new follow-up-pending marker.
    {
      comments: {
        nodes: [
          { author: { login: "claude" }, body: "consider refactoring" },
          {
            author: { login: "RobEasthope" },
            body: `Noted for follow-up.\n\n${FOLLOW_UP_PENDING_MARKERS[0]}`,
          },
        ],
      },
      id: "T_bot_follow_up_pending",
      isOutdated: false,
      isResolved: false,
      line: 4,
      path: "f.ts",
    },
  ];
  const commentNodes = [
    {
      author: { login: "coderabbitai" },
      body: "## Review summary",
      id: "IC_summary",
      url: "https://github.com/acme/repo/pull/1#issuecomment-1",
    },
    // Later chatter from the same bot — a command acknowledgement, not a summary.
    {
      author: { login: "coderabbitai" },
      body: "@coderabbitai resolved",
      id: "IC_chatter",
    },
    // A bot whose first comment is an ack and whose real summary (with a sticky
    // marker) lands later — the marker comment should win.
    {
      author: { login: "claude" },
      body: "On it — reviewing now.",
      id: "IC_ack",
    },
    {
      author: { login: "claude" },
      body: "<!-- use_sticky_comment -->\n## Walkthrough\n…",
      id: "IC_sticky",
    },
    { author: { login: "bob" }, body: "lgtm", id: "IC_human" },
  ];
  // Review submissions: some bots post their headline summary here (not as an issue
  // comment). Two marker-bearing bodies model a re-review — the NEWER one must win.
  const reviewNodes = [
    {
      author: { login: "claude" },
      body: "<!-- use_sticky_comment -->\nEarlier review found 3 potential issues.",
      id: "REV_claude_stale",
      state: "COMMENTED",
    },
    {
      author: { login: "claude" },
      body: "<!-- use_sticky_comment -->\nReview found 2 potential issues.",
      id: "REV_claude_summary",
      state: "COMMENTED",
    },
    // A human's approval with no body — must not become a "summary".
    { author: { login: "alice" }, body: "", id: "REV_human_blank" },
  ];
  const bots = ["claude", "coderabbitai"];

  const result = buildResult({
    bots,
    commentNodes,
    isDraft: false,
    number: 7,
    reviewNodes,
    threadNodes,
  });
  const withResolved = buildResult({
    bots,
    commentNodes,
    includeResolved: true,
    isDraft: false,
    number: 7,
    reviewNodes,
    threadNodes,
  });

  const cases = [
    {
      name: "unresolved bot thread is included",
      ok: ids(result.unresolvedThreads).includes("T_bot_unresolved"),
    },
    {
      name: "resolved bot thread is excluded by default",
      ok: !ids(result.unresolvedThreads).includes("T_bot_resolved"),
    },
    {
      name: "--include-resolved keeps the resolved bot thread",
      ok: ids(withResolved.unresolvedThreads).includes("T_bot_resolved"),
    },
    {
      name: "outdated flag and originalLine fallback are preserved",
      ok:
        result.unresolvedThreads.find(
          (thread) => thread.threadId === "T_bot_outdated",
        )?.isOutdated === true &&
        result.unresolvedThreads.find(
          (thread) => thread.threadId === "T_bot_outdated",
        )?.line === 9,
    },
    {
      name: "human thread goes to humanThreads, not unresolvedThreads",
      ok:
        ids(result.humanThreads).includes("T_human") &&
        !ids(result.unresolvedThreads).includes("T_human"),
    },
    {
      name: "follow-up-pending bot thread (legacy marker) is bucketed into deferredThreads",
      ok:
        ids(result.deferredThreads).includes("T_bot_deferred") &&
        !ids(result.unresolvedThreads).includes("T_bot_deferred"),
    },
    {
      name: "follow-up-pending bot thread (new marker) is bucketed into deferredThreads",
      ok:
        ids(result.deferredThreads).includes("T_bot_follow_up_pending") &&
        !ids(result.unresolvedThreads).includes("T_bot_follow_up_pending"),
    },
    {
      name: "a plain unresolved bot thread stays out of deferredThreads",
      ok: !ids(result.deferredThreads).includes("T_bot_unresolved"),
    },
    {
      name: "comments are trimmed to author + body only",
      ok: result.unresolvedThreads.every((thread) =>
        thread.comments.every(
          (comment) =>
            Object.keys(comment).toSorted().join(",") === "author,body",
        ),
      ),
    },
    {
      name: "thread url is lifted from the first comment permalink",
      ok:
        result.unresolvedThreads.find(
          (thread) => thread.threadId === "T_bot_unresolved",
        )?.url === "https://github.com/acme/repo/pull/1#discussion_r99",
    },
    {
      name: "thread without comment url has null url",
      ok:
        result.unresolvedThreads.find(
          (thread) => thread.threadId === "T_bot_outdated",
        )?.url === null,
    },
    {
      name: "ai summary comment carries url when present",
      ok:
        result.aiSummaryComments.find(
          (comment) => comment.commentId === "IC_summary",
        )?.url === "https://github.com/acme/repo/pull/1#issuecomment-1",
    },
    {
      name: "thread author is taken from the first comment",
      ok:
        result.unresolvedThreads.find(
          (thread) => thread.threadId === "T_bot_unresolved",
        )?.author === "coderabbitai",
    },
    {
      name: "sticky AI summary comment is picked up",
      ok: result.aiSummaryComments.some(
        (comment) => comment.commentId === "IC_summary",
      ),
    },
    {
      name: "botsReported counts sticky headlines and/or threads; botsMissing the rest",
      ok:
        result.botsReported.includes("coderabbitai") &&
        result.botsReported.includes("claude") &&
        result.botsMissing.length === 0,
    },
    {
      name: "human issue comment is not treated as an AI summary",
      ok: !result.aiSummaryComments.some(
        (comment) => comment.commentId === "IC_human",
      ),
    },
    {
      name: "later bot chatter is dropped — one summary per bot",
      ok:
        !result.aiSummaryComments.some(
          (comment) => comment.commentId === "IC_chatter",
        ) &&
        result.aiSummaryComments.filter(
          (comment) => comment.author === "coderabbitai",
        ).length === 1,
    },
    {
      name: "a marker-bearing comment wins over an earlier acknowledgement",
      ok:
        result.aiSummaryComments.some(
          (comment) =>
            comment.commentId === "IC_sticky" ||
            comment.commentId === "REV_claude_summary",
        ) &&
        !result.aiSummaryComments.some(
          (comment) => comment.commentId === "IC_ack",
        ),
    },
    {
      name: "a bot's review-submission summary is surfaced",
      ok: result.aiSummaryComments.some(
        (comment) => comment.commentId === "REV_claude_summary",
      ),
    },
    {
      name: "a blank review body is never a summary",
      ok: !result.aiSummaryComments.some(
        (comment) => comment.commentId === "REV_human_blank",
      ),
    },
    {
      name: "a re-review's newer review summary supersedes an earlier one (same marker)",
      ok:
        result.aiSummaryComments.some(
          (comment) => comment.commentId === "REV_claude_summary",
        ) &&
        !result.aiSummaryComments.some(
          (comment) => comment.commentId === "REV_claude_stale",
        ),
    },
  ];

  // A config entry written with the `[bot]` suffix must still match the bare
  // login GraphQL returns (and vice versa).
  const normalised = buildResult({
    bots: ["claude[bot]"],
    commentNodes: [],
    isDraft: false,
    number: 7,
    threadNodes: [
      {
        comments: { nodes: [{ author: { login: "claude" }, body: "x" }] },
        id: "T_norm",
        isOutdated: false,
        isResolved: false,
        line: 1,
        path: "d.ts",
      },
    ],
  });
  cases.push({
    name: "config '[bot]' suffix matches a bare GraphQL login",
    ok: ids(normalised.unresolvedThreads).includes("T_norm"),
  });

  // ---- settle on the current head since ready (A-2300) ----
  // Timeline modelled on guyhepner/tempest#2896: CodeRabbit posts its walkthrough
  // and a "Review skipped: draft pull request" status while the PR is a draft,
  // then reviews only after the ready flip.
  const HEAD = "head-oid";
  const READY = "2026-10-06T11:27:00Z";
  const COMMITTED = "2026-10-06T11:16:20Z";
  const settleBase = {
    bots: ["claude", "coderabbitai"],
    commentNodes: [
      {
        author: { __typename: "Bot", login: "coderabbitai" },
        body: "<!-- This is an auto-generated comment: summarize by coderabbit.ai -->\n## Walkthrough",
        createdAt: "2026-10-06T11:16:37Z",
        id: "IC_draft_walkthrough",
        updatedAt: "2026-10-06T11:16:37Z",
      },
    ],
    headCommittedAt: COMMITTED,
    headRefOid: HEAD,
    isDraft: false,
    number: 2896,
    readyAt: READY,
    reviewNodes: [],
    threadNodes: [],
  };
  const draftOnly = buildResult({
    ...settleBase,
    botChecks: { coderabbitai: "CodeRabbit" },
    checkContexts: [
      {
        __typename: "StatusContext",
        context: "CodeRabbit",
        createdAt: "2026-10-06T11:16:38Z",
        description: "Review skipped: draft pull request",
        state: "SUCCESS",
      },
    ],
  });
  cases.push({
    name: "settle: a draft-time 'Review skipped' status does not count as reported",
    ok:
      settleBotStateFromResult(draftOnly, "coderabbitai") === "missing" &&
      draftOnly.botsMissing.includes("coderabbitai"),
  });

  const stillDraft = buildResult({
    ...settleBase,
    botChecks: { coderabbitai: "CodeRabbit" },
    checkContexts: [
      {
        __typename: "StatusContext",
        context: "CodeRabbit",
        createdAt: "2026-10-06T11:16:38Z",
        description: "Review skipped: draft pull request",
        state: "SUCCESS",
      },
    ],
    isDraft: true,
    readyAt: null,
  });
  cases.push({
    name: "settle: on a draft every bot is missing, never skipped or reported",
    ok: stillDraft.botStatus.every((status) => status.state === "missing"),
  });

  const unmappedDraft = buildResult(settleBase);
  cases.push({
    name: "settle: a draft-time walkthrough summary does not count (unmapped bot)",
    ok: settleBotStateFromResult(unmappedDraft, "coderabbitai") === "missing",
  });
  cases.push({
    name: "settle: a bot with no activity at all is missing",
    ok:
      settleBotStateFromResult(unmappedDraft, "claude") === "missing" &&
      unmappedDraft.botsReported.length === 0,
  });

  const editedInPlace = buildResult({
    ...settleBase,
    commentNodes: [
      {
        ...settleBase.commentNodes[0],
        updatedAt: "2026-10-06T11:34:29Z",
      },
    ],
  });
  cases.push({
    name: "settle: a sticky summary edited in place after ready counts (updatedAt)",
    ok: settleBotStateFromResult(editedInPlace, "coderabbitai") === "reported",
  });

  // ---- claude-code-action finished summary on an unmapped claude (A-2453) ----
  // The tracking comment is created as an in-progress ack, then edited in place
  // to the finished summary. On a clean review it is Claude's only activity.
  const CLAUDE_WORKING =
    'Claude Code is working… <img src="https://github.com/user-attachments/assets/spinner" width="14px" height="14px" />\n\nI\'ll analyze this and get back to you.';
  const CLAUDE_FINISHED =
    "**Claude finished @octocat's task in 5m 9s** —— [View job](https://github.com/acme/repo/actions/runs/1)\n\n---\n### Claude is working on this\n\n- [x] Gather context\n\nNo issues found.";

  const claudeFinished = buildResult({
    ...settleBase,
    commentNodes: [
      claudeComment(
        CLAUDE_FINISHED,
        "2026-10-06T11:27:10Z",
        "2026-10-06T11:32:19Z",
      ),
    ],
  });
  cases.push({
    name: "settle: an unmapped claude with only a finished 'No issues found' summary after ready is reported",
    ok:
      settleBotStateFromResult(claudeFinished, "claude") === "reported" &&
      claudeFinished.botsReported.includes("claude"),
  });

  const claudeWorking = buildResult({
    ...settleBase,
    commentNodes: [
      claudeComment(
        CLAUDE_WORKING,
        "2026-10-06T11:27:10Z",
        "2026-10-06T11:27:10Z",
      ),
    ],
  });
  cases.push({
    name: "settle: an in-progress 'Claude Code is working…' comment alone stays missing",
    ok: settleBotStateFromResult(claudeWorking, "claude") === "missing",
  });

  const claudeStaleHead = buildResult({
    ...settleBase,
    commentNodes: [
      claudeComment(
        CLAUDE_FINISHED,
        "2026-10-06T11:27:10Z",
        "2026-10-06T11:32:19Z",
      ),
    ],
    headCommittedAt: "2026-10-06T11:40:00Z",
  });
  const claudeBeforeReady = buildResult({
    ...settleBase,
    commentNodes: [
      claudeComment(
        CLAUDE_FINISHED,
        "2026-10-06T11:10:00Z",
        "2026-10-06T11:15:00Z",
      ),
    ],
  });
  cases.push({
    name: "settle: a finished claude summary before the ready flip or on a superseded head does not count",
    ok:
      settleBotStateFromResult(claudeStaleHead, "claude") === "missing" &&
      settleBotStateFromResult(claudeBeforeReady, "claude") === "missing",
  });

  const claudeErrored = buildResult({
    ...settleBase,
    commentNodes: [
      claudeComment(
        "**Claude encountered an error after 1m 2s** —— [View job](https://github.com/acme/repo/actions/runs/1)",
        "2026-10-06T11:27:10Z",
        "2026-10-06T11:28:12Z",
      ),
    ],
  });
  cases.push({
    name: "settle: an errored claude tracking comment does not count as reported",
    ok: settleBotStateFromResult(claudeErrored, "claude") === "missing",
  });

  const claudeTwoRuns = buildResult({
    ...settleBase,
    commentNodes: [
      claudeComment(
        CLAUDE_FINISHED,
        "2026-10-06T11:00:00Z",
        "2026-10-06T11:05:00Z",
        "IC_claude_old",
      ),
      claudeComment(
        CLAUDE_FINISHED,
        "2026-10-06T11:27:10Z",
        "2026-10-06T11:32:19Z",
        "IC_claude_new",
      ),
    ],
  });
  cases.push({
    name: "summary: the latest finished claude tracking comment is the surfaced summary",
    ok:
      claudeTwoRuns.aiSummaryComments.find(
        (comment) => comment.author === "claude",
      )?.commentId === "IC_claude_new",
  });

  const reviewed = buildResult({
    ...settleBase,
    botChecks: { coderabbitai: "CodeRabbit" },
    checkContexts: [
      {
        __typename: "StatusContext",
        context: "CodeRabbit",
        createdAt: "2026-10-06T11:34:37Z",
        description: "Review completed",
        state: "SUCCESS",
      },
    ],
  });
  cases.push({
    name: "settle: a post-ready terminal status on the head reports the mapped bot",
    ok:
      settleBotStateFromResult(reviewed, "coderabbitai") === "reported" &&
      reviewed.botStatus.find((status) => status.bot === "coderabbitai")
        ?.via === "check",
  });

  const pendingCheck = buildResult({
    ...settleBase,
    botChecks: { coderabbitai: "CodeRabbit" },
    checkContexts: [
      {
        __typename: "StatusContext",
        context: "CodeRabbit",
        createdAt: "2026-10-06T11:27:06Z",
        state: "PENDING",
      },
    ],
  });
  cases.push({
    name: "settle: a pending mapped check is pending and still counted in botsMissing",
    ok:
      settleBotStateFromResult(pendingCheck, "coderabbitai") === "pending" &&
      pendingCheck.botsMissing.includes("coderabbitai"),
  });

  const cancelledCheck = buildResult({
    ...settleBase,
    botChecks: { claude: "claude-review" },
    checkContexts: [
      {
        __typename: "CheckRun",
        checkSuite: {
          workflowRun: { workflow: { name: "Claude Code Review" } },
        },
        completedAt: "2026-10-06T11:16:33Z",
        conclusion: "SKIPPED",
        name: "claude-review / claude-review",
        startedAt: "2026-10-06T11:16:40Z",
        status: "COMPLETED",
      },
      {
        __typename: "CheckRun",
        checkSuite: {
          workflowRun: { workflow: { name: "Claude Code Review" } },
        },
        completedAt: "2026-10-06T11:29:07Z",
        conclusion: "CANCELLED",
        name: "claude-review / claude-review",
        startedAt: "2026-10-06T11:27:06Z",
        status: "COMPLETED",
      },
    ],
  });
  cases.push({
    name: "settle: a post-ready cancelled check means skipped (won't report), not missing",
    ok:
      settleBotStateFromResult(cancelledCheck, "claude") === "skipped" &&
      cancelledCheck.botsSkipped.includes("claude") &&
      !cancelledCheck.botsMissing.includes("claude"),
  });

  const queuedRerun = buildResult({
    ...settleBase,
    botChecks: { claude: "claude-review" },
    checkContexts: [
      {
        __typename: "CheckRun",
        completedAt: "2026-10-06T11:28:00Z",
        conclusion: "CANCELLED",
        name: "claude-review / claude-review",
        startedAt: "2026-10-06T11:27:06Z",
        status: "COMPLETED",
      },
      {
        __typename: "CheckRun",
        checkSuite: { createdAt: "2026-10-06T11:28:05Z" },
        completedAt: null,
        conclusion: null,
        name: "claude-review / claude-review",
        startedAt: null,
        status: "QUEUED",
      },
    ],
  });
  cases.push({
    name: "settle: an undated queued rerun outranks an earlier cancelled run (suite createdAt)",
    ok: settleBotStateFromResult(queuedRerun, "claude") === "pending",
  });

  const queuedFromDraft = buildResult({
    ...settleBase,
    botChecks: { claude: "claude-review" },
    checkContexts: [
      {
        __typename: "CheckRun",
        checkSuite: { createdAt: "2026-10-06T11:16:30Z" },
        completedAt: null,
        conclusion: null,
        name: "claude-review / claude-review",
        startedAt: null,
        status: "QUEUED",
      },
    ],
  });
  cases.push({
    name: "settle: an undated queued run whose suite predates ready does not count",
    ok: settleBotStateFromResult(queuedFromDraft, "claude") === "missing",
  });

  const claudeSucceeded = buildResult({
    ...settleBase,
    botChecks: { claude: "claude-review / claude-review" },
    checkContexts: [
      {
        __typename: "CheckRun",
        completedAt: "2026-10-06T11:29:07Z",
        conclusion: "SUCCESS",
        name: "claude-review / claude-review",
        startedAt: "2026-10-06T11:27:06Z",
        status: "COMPLETED",
      },
    ],
  });
  cases.push({
    name: "settle: a full 'workflow / job' check name matches the CheckRun",
    ok: settleBotStateFromResult(claudeSucceeded, "claude") === "reported",
  });

  const wrongProducerStatus = buildResult({
    ...settleBase,
    botChecks: {
      coderabbitai: { name: "CodeRabbit", producer: "coderabbitai" },
    },
    checkContexts: [
      {
        __typename: "StatusContext",
        context: "CodeRabbit",
        createdAt: "2026-10-06T11:34:37Z",
        creator: { login: "spoof-bot" },
        description: "Review completed",
        state: "SUCCESS",
      },
    ],
  });
  cases.push({
    name: "settle: a same-named status from the wrong producer does not count",
    ok:
      settleBotStateFromResult(wrongProducerStatus, "coderabbitai") ===
        "missing" &&
      wrongProducerStatus.botStatus
        .find((status) => status.bot === "coderabbitai")
        ?.evidence.includes("unexpected producer"),
  });

  const matchingProducerStatus = buildResult({
    ...settleBase,
    botChecks: {
      coderabbitai: { name: "CodeRabbit", producer: "coderabbitai" },
    },
    checkContexts: [
      {
        __typename: "StatusContext",
        context: "CodeRabbit",
        createdAt: "2026-10-06T11:34:37Z",
        creator: { login: "coderabbitai[bot]" },
        description: "Review completed",
        state: "SUCCESS",
      },
    ],
  });
  cases.push({
    name: "settle: a same-named status from the expected creator reports",
    ok:
      settleBotStateFromResult(matchingProducerStatus, "coderabbitai") ===
      "reported",
  });

  const uppercaseProducerConfig = buildResult({
    ...settleBase,
    botChecks: {
      coderabbitai: { name: "CodeRabbit", producer: "CODERABBITAI[BOT]" },
    },
    checkContexts: [
      {
        __typename: "StatusContext",
        context: "CodeRabbit",
        createdAt: "2026-10-06T11:34:37Z",
        creator: { login: "coderabbitai" },
        description: "Review completed",
        state: "SUCCESS",
      },
    ],
  });
  cases.push({
    name: "settle: producer config normalises [bot] suffix case-insensitively",
    ok:
      settleBotStateFromResult(uppercaseProducerConfig, "coderabbitai") ===
      "reported",
  });

  const wrongProducerCheckRun = buildResult({
    ...settleBase,
    botChecks: {
      claude: { name: "claude-review", producer: "github-actions" },
    },
    checkContexts: [
      {
        __typename: "CheckRun",
        checkSuite: { app: { slug: "other-app" } },
        completedAt: "2026-10-06T11:29:07Z",
        conclusion: "SUCCESS",
        name: "claude-review / claude-review",
        startedAt: "2026-10-06T11:27:06Z",
        status: "COMPLETED",
      },
    ],
  });
  cases.push({
    name: "settle: a same-named check run from the wrong app slug does not count",
    ok: settleBotStateFromResult(wrongProducerCheckRun, "claude") === "missing",
  });

  const stringOnlyWrongCreator = buildResult({
    ...settleBase,
    botChecks: { coderabbitai: "CodeRabbit" },
    checkContexts: [
      {
        __typename: "StatusContext",
        context: "CodeRabbit",
        createdAt: "2026-10-06T11:34:37Z",
        creator: { login: "spoof-bot" },
        description: "Review completed",
        state: "SUCCESS",
      },
    ],
  });
  cases.push({
    name: "settle: a string-only mapping ignores producer (backward compatible)",
    ok:
      settleBotStateFromResult(stringOnlyWrongCreator, "coderabbitai") ===
      "reported",
  });

  // A push after review: the old review and the old thread comment predate the
  // new head commit, so the bot must re-review before it counts again.
  const staleHead = buildResult({
    ...settleBase,
    headCommittedAt: "2026-10-06T12:00:00Z",
    headRefOid: "new-head-oid",
    reviewNodes: [
      {
        author: { __typename: "Bot", login: "claude" },
        body: "Looks fine",
        commit: { oid: HEAD },
        id: "REV_old_head",
        submittedAt: "2026-10-06T12:05:00Z",
      },
    ],
    threadNodes: [
      {
        comments: {
          nodes: [
            {
              author: { __typename: "Bot", login: "coderabbitai" },
              body: "old finding",
              createdAt: "2026-10-06T11:34:29Z",
            },
          ],
        },
        id: "T_old",
        isOutdated: false,
        isResolved: false,
        line: 1,
        path: "AGENTS.md",
      },
    ],
  });
  cases.push({
    name: "settle: activity on a superseded head commit does not count",
    ok:
      settleBotStateFromResult(staleHead, "claude") === "missing" &&
      settleBotStateFromResult(staleHead, "coderabbitai") === "missing",
  });
  cases.push({
    name: "settle: the activity fingerprint changes with the head",
    ok:
      staleHead.activityFingerprint !== unmappedDraft.activityFingerprint &&
      editedInPlace.activityFingerprint !== unmappedDraft.activityFingerprint,
  });

  const otherBot = buildResult({
    ...settleBase,
    threadNodes: [
      {
        comments: {
          nodes: [
            {
              author: { __typename: "Bot", login: "sentry" },
              body: "Possible null dereference",
              createdAt: "2026-10-06T11:40:00Z",
            },
          ],
        },
        id: "T_other_bot",
        isOutdated: false,
        isResolved: false,
        line: 5,
        path: "g.ts",
      },
    ],
  });
  cases.push({
    name: "a thread from a bot outside reviewBots goes to otherBotThreads, not humanThreads",
    ok:
      ids(otherBot.otherBotThreads).includes("T_other_bot") &&
      !ids(otherBot.humanThreads).includes("T_other_bot") &&
      !ids(otherBot.unresolvedThreads).includes("T_other_bot"),
  });

  cases.push({
    name: "parseArgs reads --bot-checks as a JSON map",
    ok:
      parseArgs(["1", "--bot-checks", '{"coderabbitai":"CodeRabbit"}'])
        .botChecks.coderabbitai.name === "CodeRabbit",
  });
  cases.push({
    name: "parseArgs reads --bot-checks object form with producer",
    ok:
      parseArgs([
        "1",
        "--bot-checks",
        '{"coderabbitai":{"name":"CodeRabbit","producer":"coderabbitai"}}',
      ]).botChecks.coderabbitai.producer === "coderabbitai",
  });
  cases.push({
    name: "parseArgs rejects malformed --bot-checks",
    ok: [
      "not json",
      "[]",
      '{"claude":""}',
      '{"claude":{"producer":"x"}}',
    ].every((value) => {
      try {
        parseArgs(["1", "--bot-checks", value]);
        return false;
      } catch {
        return true;
      }
    }),
  });

  // argument + PR-resolution parsing
  const parsed = parseArgs([
    "123",
    "--bots",
    "x[bot], y[bot]",
    "--include-resolved",
  ]);
  cases.push({
    name: "parseArgs reads pr, bots (trimmed), and --include-resolved",
    ok:
      parsed.pr === "123" &&
      parsed.includeResolved === true &&
      parsed.bots.join(",") === "x[bot],y[bot]",
  });
  const fromUrl = resolvePr("https://github.com/acme/widgets/pull/88", null);
  cases.push({
    name: "resolvePr parses owner/repo/number from a PR URL",
    ok: fromUrl.number === 88 && fromUrl.repo === "acme/widgets",
  });
  const fromNumber = resolvePr("12", "acme/widgets");
  cases.push({
    name: "resolvePr accepts a bare number with --repo",
    ok: fromNumber.number === 12 && fromNumber.repo === "acme/widgets",
  });
  cases.push({
    name: "resolvePr throws on a non-number, non-URL string",
    ok: (() => {
      try {
        resolvePr("abc", null);
        return false;
      } catch {
        return true;
      }
    })(),
  });
  cases.push({
    name: "parseArgs throws when --bots has no value",
    ok: (() => {
      try {
        parseArgs(["123", "--bots"]);
        return false;
      } catch {
        return true;
      }
    })(),
  });
  cases.push({
    name: "parseArgs throws when --repo has no value",
    ok: (() => {
      try {
        parseArgs(["123", "--repo"]);
        return false;
      } catch {
        return true;
      }
    })(),
  });
  cases.push({
    name: "parseArgs throws on an unknown --flag",
    ok: (() => {
      try {
        parseArgs(["123", "--nope"]);
        return false;
      } catch {
        return true;
      }
    })(),
  });
  cases.push({
    name: "parseArgs throws on a malformed --repo (extra segments)",
    ok: (() => {
      try {
        parseArgs(["123", "--repo", "acme/widgets/extra"]);
        return false;
      } catch {
        return true;
      }
    })(),
  });
  cases.push({
    name: "parseArgs throws on an extra positional argument",
    ok: (() => {
      try {
        parseArgs(["123", "456"]);
        return false;
      } catch {
        return true;
      }
    })(),
  });

  let failed = 0;
  for (const { name, ok } of cases) {
    if (ok) {
      console.log(`  ok    ${name}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${name}`);
    }
  }

  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

// ---- main ----------------------------------------------------------------

const USAGE = `review-threads — fetch a PR's unresolved review feedback as minimal JSON (read-only)

Usage:
  node review-threads.mjs <pr-number-or-url>           Print minimal JSON to stdout
  node review-threads.mjs <pr> --bots "a[bot],b[bot]"  Override review-bot logins
  node review-threads.mjs <pr> --repo owner/name       Set the repo explicitly
  node review-threads.mjs <pr> --bot-checks '<json>'   Map bot → status/check name for settle
  node review-threads.mjs <pr> --include-resolved      Keep resolved threads too
  node review-threads.mjs --self-test                  Run the built-in offline fixtures
  node review-threads.mjs --help                       Show this message (alias: -h)`;

/**
 * CLI entry: parse args, fetch from GitHub, and print the minimal JSON.
 */
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  if (argv.includes("--self-test")) {
    selfTest();
    return;
  }

  let options;
  let pr;
  try {
    options = parseArgs(argv);
    pr = resolvePr(options.pr, options.repo);
  } catch (error) {
    console.error(`review-threads: ${error.message}`);
    process.exit(2);
  }

  try {
    const fetched = fetchFromGitHub(pr.number, pr.repo);
    const result = buildResult({
      ...fetched,
      botChecks: options.botChecks,
      bots: options.bots,
      includeResolved: options.includeResolved,
      number: pr.number,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    // Non-zero exit so the skill can tell "couldn't fetch" from "no findings".
    console.error(
      `review-threads: failed to fetch from GitHub — ${error.message}`,
    );
    process.exit(1);
  }
}

// Detect "run directly as a CLI" vs "imported as a module". A raw
// `import.meta.url === file://${argv[1]}` string compare breaks two ways:
// `import.meta.url` percent-encodes characters such as spaces, and the ESM
// loader symlink-resolves it whereas `process.argv[1]` is left untouched (e.g.
// macOS /var → /private/var, pnpm's symlinked store). Normalise both sides
// through realpath before comparing.
function isCliEntry() {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return realpathSync(import.meta.filename) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  main();
}
