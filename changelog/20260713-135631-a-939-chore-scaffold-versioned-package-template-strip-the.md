---
title: "Scaffold versioned-package-template and strip the npm-publish leg"
release_note: null
version:
created_at: "2026-07-13T13:56:31Z"
merged_at:
branch: "a-939-chore-scaffold-versioned-package-template-strip-the-npm"
pr:
commit:
merge_strategy:
author: "hello@robeasthope.com"
co_authors: []
category: chore
breaking: false
issues: ["R-939"]
stats:
  files_changed:
  loc_added:
  loc_removed:
---

## Changed

- Cut the repo generated from `npm-package-template` down to the content-only,
  non-npm baseline that the versioned deploy-target archetype is built on.
- Removed the npm-publish surface: both publish reference scripts
  (`publish-via-raw-npm.sh`, `publish-to-github-packages.sh`) and their bats
  tests, the `.env.example` `NPM_TOKEN` break-glass, and the
  `validate-payload.yml` workflow (this template is not a skills push-fan-out
  consumer).
- Removed the buildable TypeScript skeleton: `src/`, the tsconfig trio
  (`tsconfig.json` / `tsconfig.tools.json` / `tsconfig.eslint.json`), and the
  npm-publish `package.json` fields (`files`, `exports`, `main`, `module`,
  `types`, `publishConfig`); `package.json` is now `private` and stays purely as
  the version-of-record plus dev-tooling manifest.
- Re-scoped `eslint.config.ts` off `src` to `infrastructure/**`, and set `ci.yml`
  to the build-less, publish-less shape: the `build-test` caller runs with
  `build: false` / `typecheck: false`, and the `lint` caller with `eslint: false`
  (the markdown / yaml / actionlint / changelog lanes carry the gate in a
  content-only repo).
- Reset `changelog/` to just its `README.md`, dropping the template's own dated
  entries that "Use this template" drags across (the changelog-poisoning fix).
