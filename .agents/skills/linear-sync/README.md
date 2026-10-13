# `linear-sync`

Transition the Linear issues linked to the current branch through their workflow
states (In Progress / In Review / Done) — reading the branch's leading issue ID,
resolving state IDs against each issue's own team (by **name**), and applying the
transition idempotently. One repo can carry issues from several teams.

## Install

From any consumer repo:

```bash
npx skills add https://github.com/rheged-studio/agent-skills --skill linear-sync --agent claude-code --agent cursor --copy
```

`--copy` writes real files so the bundle is portable. Don't use `-g` / `--global`
— the install should live in the consumer repo.

## Configure

This skill ships only [`config.example.json`](config.example.json), a neutral
template — the per-skill `config.json` is generated on install, not vendored, so
you never inherit another repo's values. Run the `rheged-skills-setup` skill to
generate `config.json` from the example with your repo's facts, or copy it to
`config.json` and fill it in by hand. Set `issueKeys` to every team key (plus any
legacy key) your branches start with, or branch issue-IDs won't match, and set
`linearTeamName` as the fallback team.

| Key              | Meaning                                                                                                                                                                                                    | Default           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `linearTeamName` | **Fallback** Linear team **name**, used only when an issue carries no team; states are otherwise resolved against each issue's own team. Stable across team-key renames — always resolve by name, not key. | `"Rheged Studio"` |
| `issueKeys`      | Team-key prefixes that may lead a branch name; the anchored issue-ID regex is built from these.                                                                                                            | `["R", "A"]`      |

## Requirements

- The Linear MCP server (the `mcp__linear-server__*` tools). The skill drives it
  directly and has no non-MCP fallback — if it is unavailable, the skill cannot run.
- The `git` CLI, to read the current branch name.

## What it does

Extracts the branch's **leading** issue ID (from `issueKeys`; slug tokens such as
`-c-2-` never match), reads the issue with `get_issue`, resolves the target
state's live ID for **that issue's team** (cached per team), and applies the
target transition idempotently — skipping any issue already at or past it. The
default standalone target is **In Progress** (the start-of-work transition).

See [`SKILL.md`](SKILL.md) for the full transition-rules table, the
team-name-not-key gotcha, and the caller-responsibility (when/whether to fire)
boundaries.
