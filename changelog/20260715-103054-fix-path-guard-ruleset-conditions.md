---
title: Send non-null conditions on the path-guard push ruleset
release_note: The initialise-versioned-repo skill now creates the "Changelog write-back path guard" ruleset successfully instead of failing with an HTTP 422.
version:
created_at: "2026-07-15T10:30:54Z"
merged_at: "2026-07-15T10:44:13Z"
branch: fix-path-guard-ruleset-conditions
pr: 13
commit: deec3ff
merge_strategy:
author: hello@robeasthope.com
co_authors: []
category: fix
breaking: false
issues:
  - R-930
stats:
  files_changed: 4
  loc_added: 45
  loc_removed: 3
---

## Fixed

- `pathGuardRulesetPayload()` built the **`Changelog write-back path guard`** push
  ruleset with `conditions: null`, which GitHub's repository-ruleset API rejects
  with HTTP 422 (`Invalid property /conditions: data cannot be null`). The third
  ruleset therefore never got created in a spawned repo — the skill reported the
  op as an error and the write-back path guard was silently missing. A repo-level
  push ruleset requires a `conditions` object; send `conditions: {}` so the
  file-path restriction applies to all pushes. The `.agents/` mirror is updated in
  lockstep (byte-parity guard) and the unit test that codified the old `null` now
  asserts `{}`. Surfaced while initialising the first spawned deploy target,
  csc-minutes ([R-930](https://linear.app/rheged-studio/issue/R-930)).
