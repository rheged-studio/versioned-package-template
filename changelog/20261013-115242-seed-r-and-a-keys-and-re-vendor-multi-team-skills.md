---
title: Seed R and A keys and re-vendor the multi-team skills
release_note:
created_at: "2026-10-13T11:52:42Z"
merged_at:
branch: a-2654-5-templates-seed-r-and-a-keys-in-versioned-and-npm-package
pr:
commit:
author: rob@rheged.studio
co_authors: []
category: chore
breaking: false
issues:
  - A-2654
  - A-2776
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Changed

- Re-vendor the shared skills from agent-skills v1.13.0 into `.claude/skills/` and `.agents/skills/` via `rheged-skills-setup --install`. Linear-sync 0.4.0 resolves each issue's own team. Versions: changelog 0.10.0, cleanup-repo 0.5.0, commit 0.3.0, Linear-sync 0.4.0, preflight 0.5.0, rheged-skills-setup 0.15.2, send-it 0.12.1, triage-pr 0.19.0. The Matt Pocock packs are refreshed too.
- Seed `issueKeys: ["R", "A"]` in every config copy (changelog, cleanup-repo, Linear-sync and triage-pr in both mirrors, plus the root `config.json`), so a repo spawned from the template resolves `r-…` branches after the key flip and legacy `a-…` ones.
- Bump the `@rheged-studio/changelog-core` devDependency to `^1.2.0`, which re-syncs its issue-key handling with agent-skills.
- Map the CodeRabbit review check alongside `claude-review` in triage-pr's `reviewBotChecks`.
- Say in `CLAUDE.md` that the template seeds both R and A as the Linear issue keys.
- The repo-local `initialise-versioned-repo` scaffolder is untouched.
