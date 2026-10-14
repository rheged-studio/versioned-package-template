---
title: Document dual merge policy for feature vs release PRs
release_note:
version:
created_at: "2026-08-03T18:27:18Z"
merged_at: "2026-08-03T20:02:58Z"
branch: a-1176-update-send-it-derive-bump-claudemd-adr-for-merge-commits
pr: 26
commit: b0d7c51
author: rob@acmeskunkworks.io
co_authors: []
category: docs
breaking: false
issues:
  - R-1176
stats:
  files_changed: 4
  loc_added: 54
  loc_removed: 16
  commits:
---

## Changed

- Document the dual merge policy in `CLAUDE.md`, `README.md`, and `ci.yml`
  comments: feature PRs land as merge commits (release-please ranks Conventional
  Commits on `main`, [R-824](https://linear.app/rheged-studio/issue/R-824)); release and fan-out PRs stay squash; Conventional
  PR titles remain required but are no longer the sole post-merge bump signal;
  commitlint / validate-commits remain the per-commit gate.
