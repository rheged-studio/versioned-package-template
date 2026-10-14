---
title: Float changelog-enrich shared-workflows pin to @v1
release_note: ""
version:
created_at: "2026-08-07T14:44:50Z"
merged_at: "2026-08-11T13:04:30Z"
branch: a-1365-versioned-package-template-float-shared-workflows-sha-pins
pr: 34
commit: b51ba98
merge_strategy:
author: rob@acmeskunkworks.io
co_authors: []
category: chore
breaking: false
issues:
  - R-1365
stats:
  files_changed: 2
  loc_added: 31
  loc_removed: 1
  commits:
---

## Changed

- Float `.github/workflows/changelog-enrich.yml` reusable caller from the [R-821](https://linear.app/rheged-studio/issue/R-821)
  merge SHA pin to `acme-skunkworks/shared-workflows/.github/workflows/reusable-changelog-enrich.yml@v1`
  ([R-1365](https://linear.app/rheged-studio/issue/R-1365)), matching the
  `octavo` / `shared-workflows` exemplars now that `@v1` includes the enrich
  workflow.
