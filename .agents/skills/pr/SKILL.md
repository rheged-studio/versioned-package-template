---
name: pr
description: Use when writing or updating a PR body.
license: MIT
compatibility: >-
  Reads the branch with `git`; reads and publishes the PR body with `gh`
  (authenticated), via a temporary body file. No bundled script, no npm
  dependency, no config.
metadata:
  version: 0.1.0
  author: Rob Easthope
  credits:
    - skill: pr
      author: Matt Pocock
      url: "https://github.com/mattpocock/skills/tree/main/skills/engineering/pr"
      licence: MIT
    - skill: show-me
      author: Dex Horthy
      organisation: Humanlayer
      url: "https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md"
allowed-tools: Read, Write, Bash(git:*), Bash(gh:*)
---

# pr

Write the PR body in this template, in this order:

```markdown
## Summary

<the smallest visual that makes the point>

<one or two lines of prose>

## Changes

- **<intent>**
  - <one bullet per commit, roughly>

## Evidence

- **Before:** <failing run / output / screenshot>
  **After:** <passing run / output / screenshot>

<!-- pr:keep -->
<!-- /pr:keep -->

## Merge Danger

**Door:** <one-way or two-way>

**Blast Radius:** <one word>

<optional: what could break, and for whom>

**Release:** <release note>

## Related Issues

- <ISSUE-ID>
```

Skip preambles and keep prose brief. When a `GLOSSARY.md` exists at the repo
root, use its terms for the domain; carry on without one when it is absent.

## Inputs

Read the branch first: `git log --no-merges origin/<base>..HEAD` and
`git diff origin/<base>...HEAD`, where `<base>` is the PR's base branch: the value
the caller passes, else `gh pr view --json baseRefName -q .baseRefName` for an
existing PR, else `main`. The body describes every commit on the branch, not only
the latest.

A caller such as `send-it` may supply these values; use them verbatim when given:

- **Base** — the branch the PR targets (stacked PRs use a non-`main` base).

- **Release note** — the `**Release:**` line (e.g. `no release (docs-only)`, or
  `feat → minor` plus a publish-surface cross-check).
- **Related issues** — the issue identifiers for `## Related Issues`.
- **Evidence** — what the caller actually ran (tests, the lint preflight), for
  `## Evidence`.

Standalone, derive them yourself. The Release line follows the highest-bumping
Conventional Commit type on the branch: `feat` → minor, `fix`/`perf`/`revert` →
patch, `!` or `BREAKING CHANGE:` → major, anything else →
`no release (<type>-only)`. Related issues are the tracker identifiers (such as
`A-123`) found in the branch name and commit messages.

## Sections

### Summary

The **shape** of the change: one visual, then one or two lines saying why.
Summary never lists items — that is the job of Changes.

Pick the smallest view that makes the key point clear:

- Logic or an algorithm → pseudocode:

  ```text
  on(save)
    if content is unchanged
      return cached result
    write new content
    return fresh result
  ```

- Runtime control flow → a call tree:

  ```text
  submitForm
    createSession
      persistPrompt
      launchAgent
    navigateToSession
  ```

- UI structure → a component tree, with the state and module boundaries that
  matter:

  ```text
  <SessionPage> (apps/example/src/routes/session.tsx)
    useSessionEvents()
    <SessionToolbar>
      <RunSkillButton> (packages/ui)
  ```

- File responsibility or a broad refactor → a shallow file tree:

  ```text
  src/
  ├── commands/       # parses user actions
  ├── sessions/       # owns session state
  └── transport/      # sends API requests
  ```

- Component interaction, control flow, or data flow → Mermaid:

  ```mermaid
  sequenceDiagram
      participant User
      participant UI
      participant Daemon
      User->>UI: choose command
      UI->>Daemon: send expanded prompt
      Daemon-->>UI: stream result
  ```

- What changes inside a shape that already exists → a `diff` sketch, matched to
  the topic (component tree, file layout, call tree, or control flow):

  ```diff
   src/
   ├── commands/
  +│   └── show-me.ts       # expands the slash command
   ├── sessions/
  -└── transport.ts
  +└── transport/
  +    ├── client.ts
  +    └── stream.ts
  ```

- The whole block → when most of it is new, when omitted context would hide
  ownership or order, or when the reader needs a copyable target shape:

  ```ts
  function expandSkill(command: string): string {
    const skillName = command.slice(1);
    return `use the ${skillName} skill`;
  }
  ```

Keep only the calls, files, props, states, and boundaries the reader needs. One
visual is usual; two is the ceiling.

### Changes

The **inventory**: every change on the branch, grouped by intent (a feature, a
fix, a refactor, docs, tests), roughly one bullet per commit. Changes never
redraws the visual — no trees, diagrams, or code blocks here. Done when every
commit on the branch is accounted for by a bullet.

Worked example — the visual sits in Summary, the list in Changes, and neither
repeats the other:

````markdown
## Summary

```diff
 on(save)
+  if content is unchanged
+    return cached result
   write content
```

Saves now skip the write when nothing changed.

## Changes

- **Save cache**
  - Hash document content on load and after each write
  - Return the cached result from `save` when the hash matches
- **Tests**
  - Cover the unchanged-save path in `save.test.ts`
- **Docs**
  - Describe the cache in the editor README
````

### Evidence

Concrete proof the change works, as a before and after.

- Screenshots are S-tier — when the change is visual and the environment can
  capture them.
- Execution is A-tier — test results or console output. Show the exact test that
  now passes and failed before, in pseudocode if it is long.

Evidence is only what was actually run in this session or reported by the
caller: local tests, the lint preflight, a manual check. CI has usually not run
when the body is written, so CI results appear only once you have seen them.
When nothing was run, write `Not run locally.` and name what would prove it.

### The keep region

`<!-- pr:keep -->` … `<!-- /pr:keep -->` holds hand-added material — screenshots,
recordings, reviewer notes. Everything between the markers belongs to humans and
is carried across verbatim whenever the body is regenerated.

On **update**:

1. Read the current body: `gh pr view <number> --json body -q .body`.
2. Copy each keep region — markers included — byte for byte.
3. Write the new body, and put the copied regions where the empty region sits in
   the template, in their original order.
4. Save the body to a file and publish it with `--body-file`, so the shell never
   interpolates a carried region's backticks or `$(...)`.

An opening marker with no closing one keeps everything from it to the end of the
body, then gains a closing marker. A body without markers has nothing to carry;
the new body gets an empty region. On **create**, emit the empty region.

### Merge Danger

- **Door** — two-way when the change is cheap to roll back; one-way when it
  involves destructive actions, published artefacts, data migrations, or other
  hard-to-reverse decisions.
- **Blast Radius** — one word for the scope of possible impact (`local`,
  `consumers`, `estate`, `none`), then, optionally, the ramifications: layout
  shift, breakage for consumers, mobile responsiveness, and so on. Consider all
  of them.
- **Release** — always present: the release note from Inputs.

### Related Issues

One bullet per issue identifier. Drop the whole section when there are none.
