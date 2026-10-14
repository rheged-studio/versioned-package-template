---
title: Sweep @acme-skunkworks identifiers to @rheged-studio (R-1414)
release_note: ""
created_at: "2026-08-21T10:47:32Z"
merged_at: "2026-08-21T12:01:46Z"
branch: a-1414-sweep-rheged-studio-identifiers
pr: 41
commit: de36217
author: rob.studio
co_authors: []
category: chore
breaking: false
issues:
  - R-1414
stats:
  files_changed: 58
  loc_added: 1400
  loc_removed: 1328
  commits:
---

## Changed

**Sweep remaining @acme-skunkworks identifiers to @rheged-studio ([R-1414](https://linear.app/rheged-studio/issue/R-1414))**

- Migrate npm dependency keys, config extends, skill package names, and docs to `@rheged-studio/*`
- Refresh lockfile to resolve published bootstrap packages on npm
- Second-pass brand prose sweep where R-1220 missed
