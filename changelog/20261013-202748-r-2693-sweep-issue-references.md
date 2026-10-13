---
title: Sweep Linear issue references to R and C keys
release_note:
created_at: "2026-10-13T20:27:48Z"
merged_at:
branch: r-2693-versioned-package-template-sweep-issue-references
pr:
commit:
author: rob@rheged.studio
co_authors: []
category: chore
breaking: false
issues:
  - R-2693
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Changed

- Rewrite 322 old `A-n` Linear issue references across 54 files to their `R-n` keys, using the committed `linear-migrate` mapping. The sweep touches docs, workflow comments, config comments and changelog bodies.
- Leave changelog file names, `branch:` lines and the vendored `.claude/skills/**` and `.agents/skills/**` verbatim, as the tool does by design.
- The sweep raised no flags and found no unmapped IDs.
