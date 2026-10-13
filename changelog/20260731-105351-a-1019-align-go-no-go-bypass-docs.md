---
title: Align GO/NO GO bypass docs with npm template parity (R-1019)
release_note:
version:
created_at: "2026-07-31T10:53:51Z"
merged_at: "2026-07-31T11:22:18Z"
branch: a-1019-harden-parent-package-templates-so-the-release-bootstrap
pr: 24
commit: 0fe3a31
author: rob@acmeskunkworks.io
co_authors: []
category: docs
breaking: false
issues:
  - R-1019
stats:
  files_changed: 6
  loc_added: 41
  loc_removed: 13
---

## Changed

- Dropped stale "npm-package template has no bot bypass" wording from README /
  CLAUDE.md / init-skill comments. Deploy targets already provision road-runner-bot
  on GO/NO GO (R-944); npm packages now need the same enricher bypass
  ([R-1019](https://linear.app/rheged-studio/issue/R-1019)) — documented as
  estate-wide rather than deploy-target-only.
