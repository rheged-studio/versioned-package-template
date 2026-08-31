---
title: Vendor agent-skills skills (triage-pr 0.13.0)
release_note: ""
version:
created_at: "2026-08-31T12:08:56Z"
merged_at:
branch: a-1595-vendor-agent-skills-versioned-package-template
pr:
commit:
author: "rob@rheged.studio"
co_authors: []
category: chore
breaking: false
issues:
  - A-1595
affected_packages:
  - infrastructure
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Changed

**Roll shared agent-skills bundles to `main` ([A-1595](https://linear.app/rheged-studio/issue/A-1595))**

- Re-vendor canonical skill set on `.claude` and `.agents` mirrors via `fleet-update.mjs`
- Restore per-skill `config.json` ([A-706](https://linear.app/rheged-studio/issue/A-706)) and set `followUpProject` to `Follow-up issues`
- Bump `triage-pr` 0.11.0 → 0.13.0 (inherit-then-fallback routing, follow-up language)
