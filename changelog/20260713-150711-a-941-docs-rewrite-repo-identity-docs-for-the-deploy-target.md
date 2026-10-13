---
title: Rewrite repo identity and docs for the deploy-target archetype
release_note:
version:
created_at: "2026-07-13T15:07:11Z"
merged_at: "2026-07-13T15:33:57Z"
branch: a-941-docs-rewrite-repo-identity-docs-for-the-deploy-target
pr: 9
commit: dfc6d98
merge_strategy:
author: hello@robeasthope.com
co_authors: []
category: docs
breaking: false
issues:
  - R-941
stats:
  files_changed: 6
  loc_added: 380
  loc_removed: 349
---

## Changed

- Pointed the template's identity and docs at the versioned, non-npm
  **deploy-target** archetype instead of the npm-package one ([R-941](https://linear.app/rheged-studio/issue/R-941)).
- `infrastructure/repo-config.yaml`: dropped `npmScope` / `npmRegistryUrl` /
  `githubPackagesRegistryUrl`; kept only `defaultBranch` + `nodeVersionFile`.
  Because the estate's `reusable-load-repo-config.yml@v1` hard-requires those npm
  keys, `ci.yml` no longer uses it: the `config` job is removed and each job
  reads its Node version from `.nvmrc` directly (the reusable callers' default),
  matching the `octavo` / `shared-workflows` deploy targets. `repo-config.yaml`
  stays as a declarative record maintained by the init skill.
- `package.json`: renamed to `@acme-skunkworks/versioned-package-template` and
  pointed `homepage` / `bugs` / `repository` at the `versioned-package-template`
  repo.
- `README.md` + `CLAUDE.md`: reframed as the fourth archetype (release-please →
  git tags + GitHub Releases, no publish); replaced the Release workflow section
  with the deploy-target model (the orchestrator cuts the tag + Release; there is
  no in-repo release/publish workflow); documented the in-repo
  `changelog-enrich.yml` (`mode: enrich`) leg; and referenced the
  `initialise-versioned-repo` skill ([R-946](https://linear.app/rheged-studio/issue/R-946)).

## Removed

- Deleted the npm-specific documentation: the npm-OIDC Trusted Publishing,
  `npm-release` environment, "Enable the Release workflow", "Bootstrap publish",
  and "Manual publish" sections, plus the `pkg-release.yml` / `act:release:dry`
  references throughout.

## Fixed

- Corrected the `GO/NO GO` required-check ruleset guidance to require the
  **road-runner-bot bypass** ([R-944](https://linear.app/rheged-studio/issue/R-944)): the in-repo `changelog-enrich.yml` pushes
  `changelog/**` directly to `main` as `road-runner-bot[bot]`, which the required
  check would otherwise reject. Human PRs still have to satisfy `GO/NO GO`.
