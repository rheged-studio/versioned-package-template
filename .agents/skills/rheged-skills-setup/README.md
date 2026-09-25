# rheged-skills-setup

Rheged skills setup — install the estate catalogue and reconcile per-skill `config.json`
from detected repo facts.

```bash
npx skills add https://github.com/rheged-studio/agent-skills \
  --skill rheged-skills-setup --agent claude-code --agent cursor --copy
```

**Estate install (Rheged + Matt Pocock packs):**

```bash
node skills/rheged-skills-setup/scripts/initialise.mjs --install --write
```

**Reconcile only:**

```bash
node skills/rheged-skills-setup/scripts/initialise.mjs --dry-run
echo '{"facts":{"linearTeamName":"…","linearWorkspaceSlug":"…","issueKeys":["A"]}}' \
  | node skills/rheged-skills-setup/scripts/initialise.mjs --write
```

See [`SKILL.md`](SKILL.md) for the full orchestration flow.
