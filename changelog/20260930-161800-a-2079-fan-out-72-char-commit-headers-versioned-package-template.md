---
title: Vendor send-it 0.9.1 and commit 0.2.0
release_note: ""
version:
created_at: "2026-09-30T16:18:00Z"
merged_at: "2026-09-30T16:16:28Z"
branch: a-2079-fan-out-72-char-commit-headers-versioned-package-template
pr: 50
commit: a83e172
author: rob@rheged.studio
co_authors: []
category: chore
breaking: false
issues:
  - A-2079
stats:
  loc_added: 124
  loc_removed: 26
  files_changed: 14
---

## Changed

**Re-vendor `send-it` and `commit` from agent-skills `main` ([A-2079](https://linear.app/rheged-studio/issue/A-2079))**

- Bump `send-it` 0.8.2 → 0.9.1 (72-character conventional commit header guidance)
- Bump `commit` 0.1.3 → 0.2.0 on `.claude` and `.agents` mirrors; refresh `skills-lock.json` hashes
- Restore per-skill `config.json` from trunk after `skills add --copy`
