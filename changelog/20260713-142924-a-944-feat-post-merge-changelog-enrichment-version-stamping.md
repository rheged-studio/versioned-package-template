---
title: Add in-repo post-merge changelog enrichment
release_note: Merged changelog entries are now enriched in-repo on every push to main — no dependency on the release-orchestrator's changelog cron.
version:
created_at: "2026-07-13T14:29:24Z"
merged_at: "2026-07-13T14:34:23Z"
branch: a-944-feat-post-merge-changelog-enrichment-version-stamping
pr: 7
commit: 7446c0e
merge_strategy:
author: hello@robeasthope.com
co_authors: []
category: feature
breaking: false
issues:
  - R-944
stats:
  files_changed: 2
  loc_added: 79
  loc_removed: 0
---

## Added

- Added a standalone `.github/workflows/changelog-enrich.yml` (on push to `main`,
  `mode: enrich`) calling shared-workflows' `reusable-changelog-enrich.yml`,
  modelled on the `octavo` / `shared-workflows` deploy-target exemplars ([R-944](https://linear.app/rheged-studio/issue/R-944)).
  It fills the post-merge changelog metadata — `merged_at`, `commit`, `pr`,
  `stats` — in-repo, writing back `changelog/**` as `road-runner-bot[bot]` via an
  App token (`secrets: inherit`; the repo's `Trunk` ruleset already lists
  road-runner-bot as an `always` bypass actor, so the path-scoped push is
  accepted — ADR 0004 / [R-794](https://linear.app/rheged-studio/issue/R-794)).

## Changed

- This replaces the enrich job that previously lived inside the now-deleted
  `pkg-release.yml` ([R-942](https://linear.app/rheged-studio/issue/R-942)), and needs no release-orchestrator cron — the central
  `enrich-changelogs.yml` was retired in [R-801](https://linear.app/rheged-studio/issue/R-801) when the estate moved enrichment
  in-repo. `mode: enrich` is the deploy-target mode: it does not stamp `version`
  into entries (the orchestrator owns the release cut), matching the canonical
  exemplars.
