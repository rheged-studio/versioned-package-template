---
title: Stop GO/NO GO false-reds and CodeRabbit PR-description edits
release_note: ""
version:
created_at: "2026-08-04T09:34:02Z"
merged_at: "2026-08-04T10:03:05Z"
branch: a-1195-gono-go-concurrency-skipped-allowlist-coderabbit
pr: 28
commit: e1d7068
author: rob@acmeskunkworks.io
co_authors: []
category: chore
breaking: false
issues:
  - R-1195
stats:
  files_changed: 4
  loc_added: 67
  loc_removed: 9
---

## Changed

**GO/NO GO gate hardening and CodeRabbit walkthrough summary ([R-1195](https://linear.app/rheged-studio/issue/R-1195))**

- `ci.yml` / `validate-pr-title.yml` — `cancel-in-progress: false` so a superseded run cannot mint a false-red `GO/NO GO` ([R-1100](https://linear.app/rheged-studio/issue/R-1100))
- `ci.yml` GO/NO GO verdict — branch-conditional `skipped` allowlist (release-please only); `cancelled` stays out of the allowlist ([R-1103](https://linear.app/rheged-studio/issue/R-1103))
- `.coderabbit.yaml` — `high_level_summary_in_walkthrough: true` so the summary lands in a comment instead of editing the PR description and re-firing CI ([R-1102](https://linear.app/rheged-studio/issue/R-1102))
