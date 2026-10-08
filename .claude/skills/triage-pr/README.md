# triage-pr

Take a pull request from **draft + failing CI** to **merge-ready**: fix in-scope
CI failures while the PR is a draft, then — by default — promote the cleanly-green
draft to ready (`promoteOnGreen`), wait for AI reviewers, verify-then-propose
dispositions, and apply Phase B per `humanEnvelope` (unattended by default). Set
`humanEnvelope: true` to halt for a human envelope before applying; `--auto-apply`
forces unattended for one run. Opt out of promotion with `--no-promote` (or
`promoteOnGreen: false`); merge to the trunk stays with a human.

When `/send-it` chains into this skill (A-1151), the run completes only when
triage-pr reaches a terminal outcome — see [`SKILL.md`](SKILL.md).

## Install

From any consumer repo:

```bash
npx skills add https://github.com/rheged-studio/agent-skills --skill triage-pr --agent claude-code --agent cursor --copy
```

`--copy` writes real files so the bundle is portable. Don't use `-g` / `--global`
— the install should live in the consumer repo.

## Configure

This skill ships only [`config.example.json`](config.example.json), a template —
the per-skill `config.json` is generated on install, not vendored. Run the
`rheged-skills-setup` skill to generate `config.json`, or copy the example to
`config.json`, then edit it in your installed copy. Keys and defaults are documented
in [`SKILL.md`](SKILL.md) and [`references/follow-up-routing.md`](references/follow-up-routing.md).

## Requirements

- `gh` CLI, authenticated (`gh auth status` must pass) — used for checks, logs,
  review threads, and thread resolution.
- `git`.
- Node.js >=22 (ES-module support), for the bundled review-thread fetcher.

## What it does

Two phases, chosen from the PR's draft state:

1. **Phase A — while the PR is a draft.** Inspect failing checks with `gh`, pull
   the failing GitHub Actions logs, and fix failures **in PR scope only** — never
   weakening CI config to greenwash. Gated lint-surface failures are reported, never
   applied. Loop until CI is green or report blockers.
2. **Phase B — after the PR is ready-for-review.** Wait for configured
   `reviewBots`, verify-then-propose dispositions, then follow
   [`references/phase-b-envelope.md`](references/phase-b-envelope.md) or
   [`references/phase-b-unattended.md`](references/phase-b-unattended.md).

Shared review rules (impact rubric, lint surfaces, verify-before-implement) live in
[`references/review-discipline.md`](references/review-discipline.md). Linear follow-up
routing lives in [`references/follow-up-routing.md`](references/follow-up-routing.md).

**By default the skill promotes a cleanly-green draft to ready** and continues into
Phase B. Merge to `main` stays a human action.
