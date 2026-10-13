---
title: Drop per-repo road-runner-bot install from the onboarding docs and skill
release_note: Onboarding a spawned repo no longer includes a per-repo road-runner-bot install step — the bot is now installed org-wide, so the repo inherits it.
version:
created_at: "2026-07-16T14:35:19Z"
merged_at: "2026-07-16T14:42:37Z"
branch: docs-roadrunner-bot-org-wide
pr: 17
commit: 7f4214d
merge_strategy:
author: hello@robeasthope.com
co_authors: []
category: docs
breaking: false
issues: []
affected_packages: []
stats:
  files_changed: 11
  loc_added: 96
  loc_removed: 53
  commits:
---

## Changed

- road-runner-bot (the release-orchestrator App) is now installed **org-wide**
  across the config-estate repos with `contents: write` + `pull-requests: write`, so
  a repo spawned from this template inherits it — the same treatment [R-945](https://linear.app/rheged-studio/issue/R-945) gave the
  org-wide `ROADRUNNER_*` secrets. Removed the now-stale "install road-runner-bot"
  per-repo onboarding step and reframed it as org-wide inheritance in:
  - `README.md` — the setup checklist, the release-orchestrator onboarding block
    (now a single step: register the repo in the orchestrator matrix as
    `kind: deploy`), and the org-level bootstrap item.
  - `CLAUDE.md` — the verify-and-report list and the org-wide provisioning note.
  - The `initialise-versioned-repo` skill — dropped the install entry from
    `MANUAL_REMINDERS`, the SKILL.md "reported, not automated" list, the process
    step, and the safety note, plus the skill README and a stale header comment.
    Applied in lockstep to both the `.claude/skills/` copy and the `.agents/skills/`
    Cursor mirror.
- The ruleset **bypass-actor** references (GO/NO GO, Trunk, changelog write-back
  path guard) are deliberately untouched: they configure a ruleset around the
  already-installed bot, they do not install it. Registering the repo in the
  orchestrator matrix remains a manual onboarding step.
