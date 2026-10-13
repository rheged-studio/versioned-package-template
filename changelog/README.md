# Changelog

One Markdown file per change, capturing what changed and why. Entries are written by the `/send-it` slash command at PR-creation time; the post-merge fields are filled in-repo by the `changelog-enrich` workflow after merge.

This is the curated, per-change, machine-readable record — and, since the move to release-please (which runs with `skip-changelog`, R-371), the **only** changelog in the repo: there is no root `CHANGELOG.md`. This repository is a **versioned, non-npm deploy target**: it publishes no npm or GitHub package — the release-orchestrator runs release-please to open the release PR and cuts the git **tag + GitHub Release**, sourcing its release notes from the release-please PR body. The `version` field is retained for octavo-schema parity but stays blank on this deploy target — it is never stamped (see the lifecycle below).

## File naming

```text
changelog/YYYYMMDD-HHMMSS-<slug>.md
```

- Timestamp is UTC and matches `created_at` in the frontmatter.
- Slug: lowercase, non-alphanumerics replaced with `-`, repeats collapsed, ~60-char cap on a word boundary.

## Frontmatter schema

```yaml
---
title: "Concise summary of the change"
release_note: "One-sentence user-facing summary" # optional; string or null
version: # semver (X.Y.Z); left blank on this deploy target — never stamped (see below)
created_at: "2026-05-23T14:55:37Z" # set once; never overwritten
merged_at: # filled post-merge by changelog-enrich
branch: "asw-123-feature-slug" # stable lookup key for post-merge enrichment
pr: # filled post-merge by changelog-enrich
commit: # 7-char merge SHA; filled post-merge by changelog-enrich
merge_strategy: # squash | merge | rebase; filled post-merge by changelog-enrich
author: "you@example.com"
co_authors: []
category: feature # feature | fix | chore | docs | refactor | perf
breaking: false
issues: ["R-123"] # Linear issue IDs
stats: # filled post-merge by changelog-enrich
  files_changed: # integer
  loc_added: # integer
  loc_removed: # integer
---
```

### Relationship to octavo's schema

This repository is the same archetype as `octavo` — a single, repo-level-versioned deploy target, not a monorepo — so the schema tracks octavo's closely, with one simplification:

- **`affected_packages` removed.** There is only one component, so entries carry no per-package affected list.

`version` is the schema slot for the repo-level release an entry shipped in (`X.Y.Z`, no leading `v`). On this **deploy target it is left blank** — the in-repo enrich path (`mode: enrich`) does not stamp it, and there is no `finalise` step (that is the npm-target path). The release-of-record lives in `package.json` / `.release-please-manifest.json` / the `v<version>` git tag; the orchestrator sources its GitHub-Release notes from the release-please PR body, not from a version-stamped entry. The field is retained for octavo-schema parity but stays inert here.

### Required fields

`title`, `created_at`, `category`, `breaking`.

Everything else is validated _by type when present_ but not required. This lets two kinds of entry both validate:

- **Backfilled historical entries**, which have no `branch` / `author` / `stats`.
- **In-flight entries**, which have no `merged_at` / `pr` / `commit` / `stats` until they are enriched. (`version` is never filled on this deploy target — see the note above.)

`/send-it` is the guarantee that new entries get `branch` / `author` / `co_authors`; validation is the safety net, not the sole guard.

> **Note on timestamps:** wrap ISO 8601 timestamps in quotes (`"2026-05-23T14:55:37Z"`). Unquoted timestamps are auto-parsed by YAML into Date objects, which round-trip with millisecond noise on enrichment. Quoting keeps them as exact strings.

### Categories

| Category   | When to use                                     |
| ---------- | ----------------------------------------------- |
| `feature`  | New user-facing capability                      |
| `fix`      | Bug fix                                         |
| `chore`    | Tooling, build, dependency bumps                |
| `docs`     | Documentation-only change                       |
| `refactor` | Internal restructuring with no behaviour change |
| `perf`     | Performance improvement                         |

If `breaking: true`, the body MUST contain a `## Breaking` section first, describing the change and the migration path.

## Body structure

```markdown
## Breaking <!-- only when breaking: true -->

- Description and migration steps

## Added

- Description

## Changed

- ...

## Fixed

- ...
```

Only include `Added` / `Changed` / `Fixed` headings that have entries.

## Lifecycle

Two stages — post-merge enrichment runs in-repo via `reusable-changelog-enrich.yml`
on every push to `main` (R-944; following R-796 / R-821):

1. **Create or update an entry (PR-time):** run `/send-it` from a feature branch. It writes the entry with the PR-time fields (`title`, `release_note`, `created_at`, `branch`, `author`, `co_authors`, `category`, `breaking`, `issues`) and empty placeholders for the rest. The entry merges to `main` with the feature PR and waits.
2. **Post-merge (in-repo):** the `changelog-enrich.yml` workflow (`mode: enrich`) resolves the just-merged PR and fills `merged_at`/`commit`/`pr`/`stats` via `changelog-core enrich`. Write-back pushes only `changelog/**` as `road-runner-bot[bot]` (ADR 0004). `mode: enrich` is the deploy-target mode: it fills only `merged_at`/`commit`/`pr`/`stats` and does **not** stamp `version` (contrast the npm targets' `mode: finalise`, which reads the just-bumped `package.json` version). No later step stamps it either, so on this deploy target `version` stays blank; the release-orchestrator cuts the tag + Release and sources the notes from the release-please PR body, not from these entries.

**CI validation:** the `lint` reusable caller runs `pnpm validate:changelog` (`pnpm exec changelog-core validate`) on every PR. Malformed entries fail the check. Run it locally with:

```bash
pnpm validate:changelog
```
