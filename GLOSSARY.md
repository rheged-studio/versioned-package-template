<!-- init:context -->

# versioned-package-template

A GitHub template for versioned, non-npm deploy targets: a content-only repo with the full release-please, tag and GitHub Release story plus the shared CI and dated-changelog shell. It exists so a new deploy target starts with the estate's release machinery already wired.

<!-- /init:context -->

## Language

### Release shell

**Deploy target**:
A repo that is versioned and released but publishes no npm or GitHub package; its output is a git tag and a GitHub Release.
_Avoid_: Package, library, npm package

**Version-of-record**:
The `version` in `package.json`, mirrored in `.release-please-manifest.json`, which is the repo's only statement of what release it is on. It is bumped by release-please and nothing else.
_Avoid_: Package version, build version

**Release PR**:
The `chore(main): release <version>` pull request that release-please opens on the `release-please--branches--main` branch. Merging it moves the version-of-record and triggers the tag.
_Avoid_: Version PR, bump PR

**Clacks**:
The estate's release orchestrator (`rheged-studio/clacks`, registered with `kind: deploy`). It opens and squash-merges the release PR, then cuts the git tag and GitHub Release from the release-please PR body.
_Avoid_: Orchestrator, release bot

**road-runner-bot**:
The org-wide GitHub App identity that Clacks and the in-repo enrich job act as. It is the only actor allowed to bypass the required-check and trunk rulesets.
_Avoid_: The bot, Roadrunner

**GO/NO GO**:
The single aggregator check-run that ends `ci.yml` and is the required check on `main`. It passes only when every real CI job succeeded or was skipped, and Clacks waits on it before merging a release PR.
_Avoid_: Build & Lint, CI gate, status check

### Changelog

**Dated changelog**:
The `changelog/` directory, the repo's only changelog, holding one dated Markdown file per PR. There is no root `CHANGELOG.md`.
_Avoid_: CHANGELOG.md, release notes

**Changelog entry**:
One file in the dated changelog, named `<YYYYMMDD-HHMMSS>-<slug>.md`, written at PR time by `/send-it`. A non-release entry simply stays version-less.
_Avoid_: Changeset, release note

**Enrich**:
The post-merge step, run by `changelog-enrich.yml` in `mode: enrich`, that fills a changelog entry's `merged_at`, `commit`, `pr` and `stats`. On a deploy target it never stamps `version`, so that field stays blank.
_Avoid_: Finalise, stamp

**Path guard**:
The `Changelog write-back path guard` push ruleset that stops non-bot direct pushes to workflow, tooling and manifest paths, so the enrich push can only touch `changelog/**`.
_Avoid_: Write-back guard, push protection

<!-- init:template-only -->

### Template

**Spawn**:
To create a new repo from this template with GitHub's "Use this template". A spawn copies the file tree but not rulesets, repo settings or org wiring.
_Avoid_: Fork, clone, generate

**Spawned repo**:
A repo created by spawning this template, before and after it has been initialised.
_Avoid_: Child repo, derived repo

**initialise-versioned-repo**:
The repo-local, one-shot skill that takes a spawned repo to a release-ready state: file resets, skills pull, skill configs and rulesets. It is dry-run first and a second run is a no-op.
_Avoid_: Scaffolder, setup script, init script

**Placeholder identity**:
The template's own name, `@rheged-studio/versioned-package-template`, as it appears in `package.json` and repo config. While it is present the repo counts as not yet renamed.
_Avoid_: Default name, template name

**Bootstrap skill bundle**:
A shared skill copied into the template tree only so `initialise-versioned-repo` can run straight after a spawn. The spawned repo replaces it with a pull from `agent-skills`.
_Avoid_: Vendored skills, frozen skills

**Changelog poisoning**:
The failure where the template's own dated entries survive into a spawned repo and the enrich step sweeps them into its first release notes. Resetting `changelog/` to its README prevents it.
_Avoid_: Stale changelog, changelog leakage

<!-- /init:template-only -->
