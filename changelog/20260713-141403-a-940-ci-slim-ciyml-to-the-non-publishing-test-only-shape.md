---
title: "Slim ci.yml to the non-publishing, test-only shape"
release_note: null
version:
created_at: "2026-07-13T14:14:03Z"
merged_at:
branch: "a-940-ci-slim-ciyml-to-the-non-publishing-test-only-shape"
pr:
commit:
merge_strategy:
author: "hello@robeasthope.com"
co_authors: []
category: chore
breaking: false
issues: ["R-940"]
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Changed

- Finalised `ci.yml` for the content-only, non-publishing deploy-target shape.
  The `build-test` caller already ran test-only (`build: false` /
  `typecheck: false` — Vitest, ShellCheck and bats only) and the
  `validate-payload` job was already gone, both from the [R-939](https://linear.app/rheged-studio/issue/R-939) strip.
- Re-scoped the `lint` caller's ESLint lane off the removed `src/` onto the
  repo's first-party infrastructure code: it now runs
  `eslint infrastructure/tests` (was `eslint: false`), gating the repo-local
  init-skill `.mjs` test suites in CI. Scoped to `infrastructure/tests` rather
  than the whole `infrastructure/` tree to avoid the shared eslint-config's YAML
  rules double-linting `repo-config.yaml` (owned by the yaml lane) and the
  all-shell `infrastructure/scripts` directory (ESLint errors when every file
  under a passed directory is ignored).
- Kept the estate-canonical gate topology intact: `config`, the `lint` /
  `build-test` reusable callers, the inline `changelog-completeness` gate, the
  `GO/NO GO` aggregator, and the separate `validate-pr-title.yml` caller.
