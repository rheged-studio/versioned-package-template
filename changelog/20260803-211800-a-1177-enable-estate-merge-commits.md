---
title: Enable merge commits in initialise Trunk payload and re-vendor send-it
release_note: ""
created_at: "2026-08-03T21:18:00Z"
merged_at: "2026-08-03T21:03:41Z"
branch: a-1177-enable-estate-merge-commits-keep-squash-allowed-for-release
pr: 27
commit: 6536d58
author: rob@acmeskunkworks.io
co_authors: []
category: chore
breaking: false
issues:
  - R-1177
stats:
  files_changed: 17
  loc_added: 280
  loc_removed: 166
  commits:
---

## Changed

**Estate merge-commit cutover ([R-1177](https://linear.app/rheged-studio/issue/R-1177))**

- `initialise-versioned-repo` Trunk payload — `allowed_merge_methods: ["merge","squash"]`; SKILL prose drops squash-only convention
- Re-vendor `send-it` **0.7.0** + refresh `AGENTS.md` (fan-outs paused, R-809)
