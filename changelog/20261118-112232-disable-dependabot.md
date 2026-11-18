---
title: Remove Dependabot configuration
release_note:
created_at: "2026-11-18T11:22:32Z"
merged_at: "2026-11-18T11:53:16Z"
branch: disable-dependabot
pr: 62
commit: 697c4db
author: rob@rheged.studio
co_authors: []
category: chore
breaking: false
issues: []
stats:
  loc_added: 20
  loc_removed: 36
  files_changed: 2
version:
---

## Changed

- Deleted `.github/dependabot.yml`. Dependabot is being switched off across the estate, so this template, and any repo spawned from it from now on, no longer ships a Dependabot configuration.
