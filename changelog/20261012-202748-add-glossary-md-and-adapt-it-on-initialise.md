---
title: Add GLOSSARY.md and adapt it on initialise
release_note: The template now ships a GLOSSARY.md, and initialise-versioned-repo rewrites its header and strips the template-only terms in a spawned repo.
created_at: "2026-10-12T20:27:48Z"
merged_at: "2026-10-12T20:55:04Z"
branch: a-2448-write-glossarymd-versioned-package-template
pr: 53
commit: a07b2e8
author: rob@rheged.studio
co_authors: []
category: feature
breaking: false
issues:
  - R-2448
stats:
  files_changed: 19
  loc_added: 547
  loc_removed: 31
---

## Added

- Add a root `GLOSSARY.md` pinning the release-shell, changelog and template-only vocabulary, with `init:context` and `init:template-only` markers.
- Add `scripts/lib/glossary.mjs` to `initialise-versioned-repo`: it rewrites the context header from the repo's facts, strips the template-only block, and is a no-op once the markers are gone.
- Add a "Review GLOSSARY.md as best you can" agent step, a manual reminder and a root `README.md` checklist line.
- Cover the transform and the fs wrapper with vitest suites.

## Changed

- Bump the `initialise-versioned-repo` skill to 0.2.0 in both skill mirrors and `.claude/skills.lock`.
