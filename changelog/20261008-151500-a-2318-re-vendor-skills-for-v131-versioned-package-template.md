---
title: Re-vendor agent skills for mattpocock/skills v1.3.1
release_note: ""
version:
created_at: "2026-10-08T15:15:00Z"
merged_at:
branch: a-2318-re-vendor-skills-for-v131-versioned-package-template
pr:
commit:
author: rob@rheged.studio
co_authors: []
category: chore
breaking: false
issues:
  - A-2318
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Changed

**Roll shared agent bundles to current catalogue ([A-2318](https://linear.app/rheged-studio/issue/A-2318), parent [A-2299](https://linear.app/rheged-studio/issue/A-2299))**

- Re-vendor Rheged and Matt skills on `.claude` and `.agents` mirrors via `fleet-update.mjs`
- Drop upstream-removed `resolving-merge-conflicts`; add `implement-spec`, `pr` and `retro`
- Align `triage-pr` config with estate defaults (`humanEnvelope: false`, `followUpLabel: follow-up`)
- Retain repo-local `initialise-versioned-repo` skill (not part of the shared catalogue)
