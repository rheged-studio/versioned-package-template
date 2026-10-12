---
title: Point initialise-versioned-repo at rheged-skills-setup
release_note: Spawned repos now wrap rheged-skills-setup after Use this template, instead of the deleted initialise-skills bundle.
created_at: "2026-10-12T19:24:57Z"
merged_at: "2026-10-12T19:37:29Z"
branch: a-2586-fix-point-initialise-versioned-repo-at-rheged-skills-setup
pr: 52
commit: f4ef7f6
author: rob@rheged.studio
co_authors: []
category: fix
breaking: false
issues:
  - A-2586
stats:
  files_changed: 18
  loc_added: 69
  loc_removed: 45
---

## Fixed

- Point the repo-local `initialise-versioned-repo` wrap (Process step 5, docs, and comments) at `rheged-skills-setup`; the `initialise-skills` bundle no longer exists.
- Add `pr` to `SHARED_SKILLS` so scaffold refreshes the catalogue skill already vendored in the seed.
- Drop leftover `resolving-merge-conflicts` from `skills-lock.json`.
- Bump the scaffolder to 0.1.2 in both skill mirrors.
