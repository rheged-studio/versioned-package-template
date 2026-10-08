# pr

Write or update a pull request body in the estate's shape: a **Summary** visual,
a full **Changes** list grouped by intent, honest before/after **Evidence**,
**Merge Danger** (door, blast radius, and the release note), and **Related
Issues**. A marked `<!-- pr:keep -->` region carries hand-added material, such as
screenshots, across every regeneration of the body.

The agent picks the skill up whenever it writes a PR body. [`send-it`](../send-it)
follows it in Step 9, passing in its release note and the linked issue IDs.

## Install

From any consumer repo:

```bash
npx skills add https://github.com/rheged-studio/agent-skills --skill pr --agent claude-code --agent cursor --copy
```

`--copy` writes real files so the bundle is portable. Don't use `-g` / `--global`
— the install should live in the consumer repo. The estate catalogue
(`rheged-skills-setup --install`) installs it alongside `send-it`.

This bundle replaces Matt Pocock's `pr` skill, which shares the name: installing
both into the same `.claude/skills/pr/` would collide, so the catalogue lists only
this one.

## Requirements

- `git`, to read the branch's commits and diff.
- `gh` (authenticated), to read the current body and publish the new one.
- **No npm dependencies, no build step, and no `config.json`** — this is a
  model-driven skill; [`SKILL.md`](SKILL.md) is the source of truth.
- Optional: a root `GLOSSARY.md`, whose terms the body uses when present.

## Credits

Built on Matt Pocock's [`pr`](https://github.com/mattpocock/skills/tree/main/skills/engineering/pr)
skill (MIT) — its Summary visuals, Evidence tiers, and Merge Danger section — and,
through it, Dex Horthy's [`show-me`](https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md)
(Humanlayer). The Changes list, release note, Related Issues, and keep region come
from `send-it`'s earlier template. Matt Pocock's MIT licence notice ships beside
this file as [`LICENSE-mattpocock-skills`](LICENSE-mattpocock-skills).
