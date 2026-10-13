---
title: Bump @acme-skunkworks configs and fix markdownlint 3 fallout
release_note: ""
version:
created_at: "2026-08-07T15:13:23Z"
merged_at: "2026-08-11T13:03:55Z"
branch: a-1349-versioned-package-template-bump-acme-skunkworks-and-fix-lint-fallout
pr: 35
commit: 87c178a
author: rob@acmeskunkworks.io
co_authors: []
category: chore
breaking: false
issues:
  - R-1349
stats:
  files_changed: 6
  loc_added: 69
  loc_removed: 30
---

## Changed

**Bump shared @acme-skunkworks tooling and clear markdownlint 3.x fallout ([R-1349](https://linear.app/rheged-studio/issue/R-1349))**

- Raise `changelog-core`, `commitlint-config`, `eslint-config`, and `markdownlint-config` to the published latest ranges
- Ignore vendored skill bundles and fan-out `AGENTS.md` under markdownlint-cli2 so 3.x rules do not fail on upstream docs
- Fix first-party MD040 / MD044 findings in `infrastructure/README.md` and `CLAUDE.md`
