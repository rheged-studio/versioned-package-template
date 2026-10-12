// Unit tests for the initialise-versioned-repo skill's in-repo file-edit logic
// (A-946). The skill scripts are zero-dep .mjs (they travel into every spawned
// repo), so their tests are .mjs too and import the pure cores directly — no fs,
// no gh — asserting the transforms and, crucially, their idempotent no-op paths.

import { planChangelogReset } from "../../.claude/skills/initialise-versioned-repo/scripts/lib/changelog-reset.mjs";
import { planGlossaryAdapt } from "../../.claude/skills/initialise-versioned-repo/scripts/lib/glossary.mjs";
import { reseedManifest } from "../../.claude/skills/initialise-versioned-repo/scripts/lib/manifest.mjs";
import {
  applyIdentity,
  isPlaceholderName,
} from "../../.claude/skills/initialise-versioned-repo/scripts/lib/package-identity.mjs";
import { reconcileRepoConfigText } from "../../.claude/skills/initialise-versioned-repo/scripts/lib/repo-config.mjs";
import { deriveIdentity } from "../../.claude/skills/initialise-versioned-repo/scripts/lib/repo-facts.mjs";
import { planSkillConfigIgnoreStrip } from "../../.claude/skills/initialise-versioned-repo/scripts/lib/skill-config-gitignore.mjs";
import { describe, expect, it } from "vitest";

describe("planChangelogReset", () => {
  it("deletes every dated .md entry but keeps README.md", () => {
    const plan = planChangelogReset([
      "README.md",
      "20260701-155554-a-437-thing.md",
      "20260703-095959-a-649-other.md",
    ]);
    expect(plan).toEqual([
      "20260701-155554-a-437-thing.md",
      "20260703-095959-a-649-other.md",
    ]);
  });

  it("is a no-op when only README.md remains (idempotent)", () => {
    expect(planChangelogReset(["README.md"])).toEqual([]);
  });

  it("leaves non-markdown files untouched", () => {
    expect(planChangelogReset(["README.md", ".gitkeep", "notes.txt"])).toEqual(
      [],
    );
  });
});

describe("reseedManifest", () => {
  it("re-seeds the root entry to the package version", () => {
    const result = reseedManifest('{\n  ".": "0.0.0"\n}\n', "1.2.0");
    expect(result).not.toBeNull();
    expect(JSON.parse(result.text)["."]).toBe("1.2.0");
    expect(result.from).toBe("0.0.0");
  });

  it("returns null when already equal (idempotent no-op)", () => {
    expect(reseedManifest('{\n  ".": "1.2.0"\n}\n', "1.2.0")).toBeNull();
  });

  it("preserves other path entries in a monorepo manifest", () => {
    const result = reseedManifest(
      '{\n  ".": "0.0.0",\n  "packages/x": "3.0.0"\n}\n',
      "1.0.0",
    );
    const data = JSON.parse(result.text);
    expect(data["."]).toBe("1.0.0");
    expect(data["packages/x"]).toBe("3.0.0");
  });

  it("preserves indentation and trailing newline (byte-stable formatting)", () => {
    const result = reseedManifest('{\n    ".": "0.0.0"\n}\n', "2.0.0");
    expect(result.text).toBe('{\n    ".": "2.0.0"\n}\n');
  });
});

describe("deriveIdentity + applyIdentity", () => {
  const view = {
    defaultBranchRef: { name: "main" },
    description: "A real package",
    name: "portcullis",
    owner: { login: "rheged-studio" },
  };

  it("derives name, scope and URLs from the repo view", () => {
    const id = deriveIdentity(view);
    expect(id.name).toBe("@rheged-studio/portcullis");
    expect(id.scope).toBe("@rheged-studio");
    expect(id.homepage).toBe(
      "https://github.com/rheged-studio/portcullis#readme",
    );
    expect(id.bugsUrl).toBe(
      "https://github.com/rheged-studio/portcullis/issues",
    );
    expect(id.repositoryUrl).toBe(
      "https://github.com/rheged-studio/portcullis.git",
    );
    expect(id.defaultBranch).toBe("main");
  });

  it("falls back to @owner when a scoped override name has no slash", () => {
    // A malformed override like "@foo" must not slice to "@fo" and silently write
    // a broken npmScope downstream.
    expect(deriveIdentity(view, { name: "@foo" }).scope).toBe("@rheged-studio");
  });

  it("honours operator overrides for name/description/keywords", () => {
    const id = deriveIdentity(view, {
      description: "Custom",
      keywords: ["a"],
      name: "@rheged-studio/renamed",
    });
    expect(id.name).toBe("@rheged-studio/renamed");
    expect(id.description).toBe("Custom");
    expect(id.keywords).toEqual(["a"]);
  });

  it("rewrites the package identity block", () => {
    const pkg = {
      bugs: {
        url: "https://github.com/rheged-studio/versioned-package-template/issues",
      },
      description: "Template repository",
      keywords: ["template"],
      name: "@rheged-studio/versioned-package-template",
      repository: {
        type: "git",
        url: "https://github.com/rheged-studio/versioned-package-template.git",
      },
      version: "0.0.0",
    };
    const { changed, data } = applyIdentity(
      pkg,
      deriveIdentity(view, { keywords: ["css"] }),
    );
    expect(changed).toBe(true);
    expect(data.name).toBe("@rheged-studio/portcullis");
    expect(data.keywords).toEqual(["css"]);
    expect(data.repository.url).toBe(
      "https://github.com/rheged-studio/portcullis.git",
    );
    expect(data.version).toBe("0.0.0"); // untouched — identity only
  });

  it("leaves keywords alone when none are supplied", () => {
    const pkg = {
      keywords: ["template"],
      name: "@rheged-studio/versioned-package-template",
    };
    const { data } = applyIdentity(pkg, deriveIdentity(view));
    expect(data.keywords).toEqual(["template"]);
  });

  it("recognises the placeholder name as the not-yet-renamed signal", () => {
    expect(isPlaceholderName("@rheged-studio/versioned-package-template")).toBe(
      true,
    );
    expect(isPlaceholderName("@rheged-studio/portcullis")).toBe(false);
  });
});

describe("reconcileRepoConfigText", () => {
  // A deploy target's repo-config carries only defaultBranch + the constant
  // nodeVersionFile — there is no npmScope key to reconcile.
  const yaml = [
    "# a comment",
    "defaultBranch: main",
    "nodeVersionFile: .nvmrc",
    "",
  ].join("\n");

  it("is a no-op for a same-branch repo (idempotent)", () => {
    const { changes, text } = reconcileRepoConfigText(yaml, {
      defaultBranch: "main",
    });
    expect(changes).toEqual({});
    expect(text).toBe(yaml);
  });

  it("rewrites a changed default branch, preserving comments and other keys", () => {
    const { changes, text } = reconcileRepoConfigText(yaml, {
      defaultBranch: "trunk",
    });
    expect(changes.defaultBranch).toEqual({ from: "main", to: "trunk" });
    expect(text).toContain("# a comment");
    expect(text).toContain("defaultBranch: trunk");
    expect(text).toContain("nodeVersionFile: .nvmrc");
  });

  it("ignores a stray npmScope fact (deploy targets do not reconcile it)", () => {
    const { changes, text } = reconcileRepoConfigText(yaml, {
      npmScope: "@acme-other",
    });
    expect(changes).toEqual({});
    expect(text).toBe(yaml);
  });

  it("writes a value containing $-substitution sequences literally", () => {
    // `String.replace(re, string)` would interpret `$&` as the whole match; the
    // replacer-function form must keep it literal.
    const { text } = reconcileRepoConfigText(yaml, { defaultBranch: "a$&b" });
    expect(text).toContain("defaultBranch: a$&b");
  });
});

describe("planSkillConfigIgnoreStrip", () => {
  it("strips the template-seed skill-config patterns and comment block", () => {
    const raw = [
      "node_modules/",
      "",
      "# Template-seed only (A-812): keep resolved skill config.json out of the tree",
      '# copied by "Use this template". initialise-versioned-repo strips these lines in a',
      "# spawned consumer so initialise-skills can write trackable configs that the",
      "# consumer commits (agent-skills consumer contract). Do not copy this ignore into",
      "# a hand-rolled consumer — resolved config.json belongs in git there.",
      ".claude/skills/*/config.json",
      ".agents/skills/*/config.json",
      "",
    ].join("\n");
    const plan = planSkillConfigIgnoreStrip(raw);
    expect(plan.changed).toBe(true);
    expect(plan.text).toBe("node_modules/\n");
    expect(plan.removed).toEqual(
      expect.arrayContaining([
        ".claude/skills/*/config.json",
        ".agents/skills/*/config.json",
      ]),
    );
  });

  it("is a no-op when the patterns are already absent (idempotent)", () => {
    const raw = "node_modules/\ndist/\n";
    const plan = planSkillConfigIgnoreStrip(raw);
    expect(plan.changed).toBe(false);
    expect(plan.text).toBe(raw);
    expect(plan.removed).toEqual([]);
  });

  it("strips the legacy A-640 comment wording too", () => {
    const raw = [
      "# Per-skill agent-skills config.json is generated by the initialise-skills skill,",
      "# not committed (agent-skills v1.1.0 generated-config model, A-640).",
      ".claude/skills/*/config.json",
      ".agents/skills/*/config.json",
      "",
    ].join("\n");
    const plan = planSkillConfigIgnoreStrip(raw);
    expect(plan.changed).toBe(true);
    expect(plan.text.trim()).toBe("");
  });

  it("strips bare patterns with no preceding comment", () => {
    const raw =
      "node_modules/\n.claude/skills/*/config.json\n.agents/skills/*/config.json\n";
    const plan = planSkillConfigIgnoreStrip(raw);
    expect(plan.changed).toBe(true);
    expect(plan.text).toBe("node_modules/\n");
    expect(plan.removed).toEqual(
      expect.arrayContaining([
        ".claude/skills/*/config.json",
        ".agents/skills/*/config.json",
      ]),
    );
  });

  it("does not rewrite a file that only has consecutive blank lines", () => {
    const raw = "node_modules/\n\n\ndist/\n";
    const plan = planSkillConfigIgnoreStrip(raw);
    expect(plan.changed).toBe(false);
    expect(plan.text).toBe(raw);
    expect(plan.removed).toEqual([]);
  });
});

describe("glossary", () => {
  const identity = { description: "An example spawned repo.", repo: "example" };
  const template = [
    "<!-- init:context -->",
    "",
    "# versioned-package-template",
    "",
    "A template.",
    "",
    "<!-- /init:context -->",
    "",
    "## Language",
    "",
    "**Kept**:",
    "Inherited term.",
    "",
    "<!-- init:template-only -->",
    "",
    "**Spawn**:",
    "Template-only term.",
    "",
    "<!-- /init:template-only -->",
    "",
    "**Also kept**:",
    "Another inherited term.",
    "",
  ].join("\n");

  it("rewrites the context block with the repo name and description", () => {
    const result = planGlossaryAdapt(template, identity);
    expect(result.changed).toBe(true);
    expect(
      result.text.startsWith(
        "# example\n\nAn example spawned repo.\n\n## Language",
      ),
    ).toBe(true);
    expect(result.text).not.toContain("versioned-package-template");
    expect(result.text).not.toContain("init:context");
  });

  it("falls back to a prompt line when the description is empty", () => {
    const result = planGlossaryAdapt(template, {
      description: "",
      repo: "example",
    });
    expect(result.text).toContain(
      "# example\n\nDescribe what example is and why it exists.",
    );
  });

  it("removes the template-only block and collapses the blank lines", () => {
    const { text } = planGlossaryAdapt(template, identity);
    expect(text).not.toContain("Spawn");
    expect(text).not.toContain("init:template-only");
    expect(text).toContain("Inherited term.\n\n**Also kept**:");
    expect(text).not.toMatch(/\n{3,}/);
  });

  it("is a no-op on a second pass (idempotent)", () => {
    const first = planGlossaryAdapt(template, identity);
    const second = planGlossaryAdapt(first.text, identity);
    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it("returns text without markers unchanged", () => {
    const plain = "# Mine\n\nA description.\n\n## Language\n";
    expect(planGlossaryAdapt(plain, identity)).toEqual({
      changed: false,
      text: plain,
    });
  });

  it("preserves the trailing newline, or its absence", () => {
    const body = "<!-- init:template-only -->\nx\n<!-- /init:template-only -->";
    const kept = "**Kept**:\nA term.";
    expect(planGlossaryAdapt(`${kept}\n\n${body}\n`, identity).text).toBe(
      `${kept}\n`,
    );
    expect(planGlossaryAdapt(`${kept}\n\n${body}`, identity).text).toBe(kept);
  });

  it("leaves `$` sequences in the description literal", () => {
    const result = planGlossaryAdapt(template, {
      description: "Costs $& and $1.",
      repo: "example",
    });
    expect(result.text).toContain("Costs $& and $1.");
  });
});
