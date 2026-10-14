---
title: "Adopt the deploy-target release model (release-please node, no publish)"
release_note: "The template now uses the versioned deploy-target release model — release-please cuts git tags and GitHub Releases with no npm/package publish."
version:
created_at: "2026-07-13T14:21:20Z"
merged_at:
branch: "a-942-feat-deploy-target-release-workflow-release-please-node-no"
pr:
commit:
merge_strategy:
author: "hello@robeasthope.com"
co_authors: []
category: feature
breaking: false
issues: ["R-942"]
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Changed

- Replaced the npm publish workflow with the versioned **deploy-target** release
  model modelled on `octavo` / `shared-workflows` ([R-942](https://linear.app/rheged-studio/issue/R-942)). This archetype
  publishes no npm or GitHub package — it cuts versioned git tags + GitHub
  Releases only.

## Removed

- Deleted `.github/workflows/pkg-release.yml`. Deploy targets have **no** in-repo
  release/publish workflow: the release-orchestrator opens the release PR and
  cuts the git tag + GitHub Release directly. With no publish leg there is no
  `npm-release` environment and no OIDC, so the [R-326](https://linear.app/rheged-studio/issue/R-326) cross-boundary hardening
  drops away entirely — there is no mintable publish credential to fence.
- Dropped the now-dead `act:release:dry` package.json script (it drove the
  deleted `pkg-release.yml`), and de-referenced `pkg-release.yml` in the
  `dependabot.yml` grouping comment.

## Added

- `release-please-config.json` now carries the mandatory
  `group-pull-request-title-pattern`
  (`chore${scope}: release${component} ${version}`, [R-677](https://linear.app/rheged-studio/issue/R-677)) so a combined
  deploy-target release PR carries the version and actually cuts a tag, plus
  `bump-minor-pre-major` for the pre-1.0 template. `release-type: node`,
  `include-v-in-tag`, and `skip-changelog` are unchanged (the dated `changelog/`
  directory remains the only changelog).
