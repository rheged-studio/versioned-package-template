---
title: Catch up agent-skills shared bundles to HEAD
release_note: ""
version:
created_at: "2026-08-05T13:47:54Z"
merged_at: "2026-08-05T14:05:00Z"
branch: a-1273-catch-up-agent-skills-versioned-package-template
pr: 31
commit: 6c16386
author: rob@acmeskunkworks.io
co_authors: []
category: chore
breaking: false
issues:
  - R-1273
affected_packages:
  - infrastructure
stats:
  files_changed: 100
  loc_added: 3628
  loc_removed: 1209
---

## Changed

**Re-vendor shared agent-skills to source `main` ([R-1273](https://linear.app/rheged-studio/issue/R-1273))**

- Wipe + re-copy shared skill bundles on `.claude` and `.agents` from `acme-skunkworks/agent-skills`
- Restore per-skill `config.json` (R-706) and reconcile via `initialise-skills`
- Land `triage-pr` human-envelope / review-wait / `deferNonBlocking` and `send-it.triage` where those skills are installed
- Preserve repo-local skills; keep Linear identity `Rheged Studio` / `rheged-studio`
