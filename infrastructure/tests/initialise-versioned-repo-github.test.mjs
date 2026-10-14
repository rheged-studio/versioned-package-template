// Unit tests for the initialise-versioned-repo skill's GitHub-settings logic
// (R-946 / R-944). A fake runner records the `gh` argv and returns canned API
// responses, so we assert both the idempotent "already present → no mutation"
// path and the "absent → correct gh api call" path without touching a real repo.
//
// A deploy target applies THREE rulesets and NOTHING else: the GO/NO GO
// required-check ruleset (with the road-runner-bot bypass — R-944), the Trunk
// changelog bypass, and the changelog write-back path guard. There is no
// npm-release environment and no in-repo Release workflow to enable.

import {
  applyGithubSettings,
  ensureChangelogPathGuard,
  ensureGoNoGoRuleset,
  ensureTrunkChangelogBypass,
  findRepoTrunkRuleset,
  goNoGoRulesetPayload,
  PATH_GUARD_RULESET_NAME,
  pathGuardRulesetPayload,
  ROADRUNNER_APP_ID,
  RULESET_NAME,
  TRUNK_RULESET_NAME,
  trunkRulesetPayload,
} from "../../.claude/skills/initialise-versioned-repo/scripts/lib/github-settings.mjs";
import { describe, expect, it } from "vitest";

/**
 * Build a fake `run` that returns queued responses by matching a substring of the
 * joined argv, and records every call. `{ status, stdout }` shape mirrors spawnSync.
 */
function fakeRun(responder) {
  const calls = [];
  function run(args) {
    calls.push(args);
    return responder(args.join(" ")) ?? { status: 0, stdout: "" };
  }

  return { calls, run };
}

const SLUG = "rheged-studio/portcullis";

/**
 * A full GO/NO GO ruleset body carrying the road-runner-bot bypass.
 */
function goNoGoFull(id, extraActors = []) {
  return JSON.stringify({
    bypass_actors: [
      {
        actor_id: ROADRUNNER_APP_ID,
        actor_type: "Integration",
        bypass_mode: "always",
      },
      ...extraActors,
    ],
    conditions: { ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] } },
    enforcement: "active",
    id,
    name: RULESET_NAME,
    rules: goNoGoRulesetPayload().rules,
    target: "branch",
  });
}

describe("goNoGoRulesetPayload", () => {
  it("pins the GO/NO GO check to the GitHub Actions integration", () => {
    const check =
      goNoGoRulesetPayload().rules[0].parameters.required_status_checks[0];
    expect(check).toEqual({ context: "GO/NO GO", integration_id: 15368 });
    expect(goNoGoRulesetPayload().conditions.ref_name.include).toEqual([
      "~DEFAULT_BRANCH",
    ]);
  });

  it("carries the road-runner-bot bypass (R-944)", () => {
    // changelog-enrich pushes changelog/** to main as road-runner-bot and must
    // clear the required check (same estate-wide bypass as npm templates — R-1019).
    expect(goNoGoRulesetPayload().bypass_actors).toEqual([
      {
        actor_id: ROADRUNNER_APP_ID,
        actor_type: "Integration",
        bypass_mode: "always",
      },
    ]);
  });
});

describe("ensureGoNoGoRuleset", () => {
  it("is present when the ruleset exists with the road-runner-bot bypass", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { id: 10, name: RULESET_NAME, source_type: "Repository" },
          ]),
        };
      }

      if (cmd.endsWith("rulesets/10")) {
        return { status: 0, stdout: goNoGoFull(10) };
      }

      return null;
    });
    const result = ensureGoNoGoRuleset(SLUG, { run, write: true });
    expect(result.status).toBe("present");
    expect(calls.some((call) => call.includes("PUT"))).toBe(false);
    expect(calls.some((call) => call.includes("POST"))).toBe(false);
  });

  it("would-update on dry-run when the ruleset exists without the bypass", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { id: 10, name: RULESET_NAME, source_type: "Repository" },
          ]),
        };
      }

      if (cmd.endsWith("rulesets/10")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            bypass_actors: [],
            conditions: {
              ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] },
            },
            enforcement: "active",
            id: 10,
            name: RULESET_NAME,
            rules: goNoGoRulesetPayload().rules,
            target: "branch",
          }),
        };
      }

      return null;
    });
    const result = ensureGoNoGoRuleset(SLUG, { run, write: false });
    expect(result.status).toBe("would-update");
    expect(calls.some((call) => call.includes("PUT"))).toBe(false);
  });

  it("PUTs the merged bypass when the ruleset exists without it (write)", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { id: 10, name: RULESET_NAME, source_type: "Repository" },
          ]),
        };
      }

      if (cmd.endsWith("rulesets/10") && !cmd.includes("PUT")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            bypass_actors: [
              {
                actor_id: 5,
                actor_type: "RepositoryRole",
                bypass_mode: "always",
              },
            ],
            conditions: {
              ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] },
            },
            enforcement: "active",
            id: 10,
            name: RULESET_NAME,
            rules: goNoGoRulesetPayload().rules,
            target: "branch",
          }),
        };
      }

      return { status: 0, stdout: "" };
    });
    const result = ensureGoNoGoRuleset(SLUG, { run, write: true });
    expect(result.status).toBe("updated");
    const put = calls.find((call) => call.includes("PUT"));
    expect(put).toContain("repos/rheged-studio/portcullis/rulesets/10");
    expect(put).toContain("--input");
  });

  it("would-create on dry-run when absent", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return { status: 0, stdout: "[]" };
      }

      return null;
    });
    const result = ensureGoNoGoRuleset(SLUG, { run, write: false });
    expect(result.status).toBe("would-create");
    expect(calls.some((call) => call.includes("POST"))).toBe(false);
  });

  it("POSTs the pinned ruleset payload when absent (write)", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return { status: 0, stdout: "[]" };
      }

      return { status: 0, stdout: "" };
    });
    const result = ensureGoNoGoRuleset(SLUG, { run, write: true });
    expect(result.status).toBe("created");
    const post = calls.find((call) => call.includes("POST"));
    expect(post).toContain("repos/rheged-studio/portcullis/rulesets");
    expect(post).toContain("--input");
  });
});

describe("findRepoTrunkRuleset", () => {
  it("prefers repo-sourced Trunk over org Protect main trunk", () => {
    const found = findRepoTrunkRuleset([
      {
        id: 1,
        name: "Protect main trunk",
        source_type: "Organization",
      },
      { id: 2, name: "Trunk", source_type: "Repository" },
    ]);
    expect(found).toEqual({
      id: 2,
      name: "Trunk",
      source_type: "Repository",
    });
  });

  it("falls back to repo-sourced Protect main trunk", () => {
    const found = findRepoTrunkRuleset([
      {
        id: 1,
        name: "Protect main trunk",
        source_type: "Organization",
      },
      {
        id: 3,
        name: "Protect main trunk",
        source_type: "Repository",
      },
    ]);
    expect(found.id).toBe(3);
  });

  it("returns null when only org rulesets exist", () => {
    expect(
      findRepoTrunkRuleset([
        {
          id: 1,
          name: "Protect main trunk",
          source_type: "Organization",
        },
      ]),
    ).toBeNull();
  });
});

describe("ensureTrunkChangelogBypass", () => {
  it("is present when Trunk already has the road-runner-bot bypass", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { id: 99, name: TRUNK_RULESET_NAME, source_type: "Repository" },
          ]),
        };
      }

      if (cmd.endsWith("rulesets/99")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            bypass_actors: [
              {
                actor_id: ROADRUNNER_APP_ID,
                actor_type: "Integration",
                bypass_mode: "always",
              },
            ],
            conditions: {
              ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] },
            },
            enforcement: "active",
            id: 99,
            name: "Trunk",
            rules: [{ type: "deletion" }],
            target: "branch",
          }),
        };
      }

      return null;
    });
    const result = ensureTrunkChangelogBypass(SLUG, { run, write: true });
    expect(result.status).toBe("present");
    expect(calls.some((call) => call.includes("PUT"))).toBe(false);
  });

  it("would-update on dry-run when Trunk exists without the bypass", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { id: 99, name: TRUNK_RULESET_NAME, source_type: "Repository" },
          ]),
        };
      }

      if (cmd.endsWith("rulesets/99")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            bypass_actors: [],
            conditions: {
              ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] },
            },
            enforcement: "active",
            id: 99,
            name: "Trunk",
            rules: [{ type: "deletion" }],
            target: "branch",
          }),
        };
      }

      return null;
    });
    const result = ensureTrunkChangelogBypass(SLUG, { run, write: false });
    expect(result.status).toBe("would-update");
    expect(calls.some((call) => call.includes("PUT"))).toBe(false);
  });

  it("PUTs merged bypass_actors when Trunk exists without the bypass (write)", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { id: 99, name: TRUNK_RULESET_NAME, source_type: "Repository" },
          ]),
        };
      }

      if (cmd.endsWith("rulesets/99") && !cmd.includes("PUT")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            bypass_actors: [
              {
                actor_id: 5,
                actor_type: "RepositoryRole",
                bypass_mode: "always",
              },
            ],
            conditions: {
              ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] },
            },
            enforcement: "active",
            id: 99,
            name: "Trunk",
            rules: [{ type: "deletion" }],
            target: "branch",
          }),
        };
      }

      return { status: 0, stdout: "" };
    });
    const result = ensureTrunkChangelogBypass(SLUG, { run, write: true });
    expect(result.status).toBe("updated");
    const put = calls.find((call) => call.includes("PUT"));
    expect(put).toContain("repos/rheged-studio/portcullis/rulesets/99");
    expect(put).toContain("--input");
  });

  it("would-create on dry-run when no repo Trunk exists", () => {
    const { run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return {
          status: 0,
          stdout: JSON.stringify([
            {
              id: 1,
              name: "Protect main trunk",
              source_type: "Organization",
            },
          ]),
        };
      }

      return null;
    });
    const result = ensureTrunkChangelogBypass(SLUG, { run, write: false });
    expect(result.status).toBe("would-create");
  });

  it("POSTs a new Trunk ruleset when absent (write)", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets") && !cmd.includes("POST")) {
        return { status: 0, stdout: "[]" };
      }

      return { status: 0, stdout: "" };
    });
    const result = ensureTrunkChangelogBypass(SLUG, { run, write: true });
    expect(result.status).toBe("created");
    const post = calls.find((call) => call.includes("POST"));
    expect(post).toContain("repos/rheged-studio/portcullis/rulesets");
    expect(trunkRulesetPayload().bypass_actors[0].actor_id).toBe(
      ROADRUNNER_APP_ID,
    );
    expect(trunkRulesetPayload().name).toBe("Trunk");
  });
});

describe("ensureChangelogPathGuard", () => {
  it("is present when a same-named push ruleset exists (no mutation)", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return {
          status: 0,
          stdout: JSON.stringify([
            {
              id: 20,
              name: PATH_GUARD_RULESET_NAME,
              source_type: "Repository",
            },
          ]),
        };
      }

      return null;
    });
    const result = ensureChangelogPathGuard(SLUG, { run, write: true });
    expect(result.status).toBe("present");
    expect(calls.some((call) => call.includes("POST"))).toBe(false);
  });

  it("would-create on dry-run when absent", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return { status: 0, stdout: "[]" };
      }

      return null;
    });
    const result = ensureChangelogPathGuard(SLUG, { run, write: false });
    expect(result.status).toBe("would-create");
    expect(calls.some((call) => call.includes("POST"))).toBe(false);
  });

  it("POSTs the path-guard payload when absent (write)", () => {
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return { status: 0, stdout: "[]" };
      }

      return { status: 0, stdout: "" };
    });
    const result = ensureChangelogPathGuard(SLUG, { run, write: true });
    expect(result.status).toBe("created");
    const post = calls.find((call) => call.includes("POST"));
    expect(post).toContain("repos/rheged-studio/portcullis/rulesets");
    expect(post).toContain("--input");
  });

  it("payload is a push ruleset restricting the release-shell paths", () => {
    const payload = pathGuardRulesetPayload();
    expect(payload.name).toBe(PATH_GUARD_RULESET_NAME);
    expect(payload.target).toBe("push");
    // Repo-level push rulesets require a non-null conditions object — GitHub
    // rejects `conditions: null` with HTTP 422 (R-930).
    expect(payload.conditions).toEqual({});
    expect(payload.enforcement).toBe("active");
    expect(payload.rules[0].type).toBe("file_path_restriction");
    expect(payload.rules[0].parameters.restricted_file_paths).toContain(
      ".github/**/*",
    );
    expect(payload.rules[0].parameters.restricted_file_paths).toContain(
      ".release-please-manifest.json",
    );
    // Repo write-roles (2/4/5) + road-runner-bot bypass the guard.
    const actorIds = payload.bypass_actors.map((actor) => actor.actor_id);
    expect(actorIds).toEqual([2, 4, 5, ROADRUNNER_APP_ID]);
    expect(
      payload.bypass_actors.every((actor) => actor.bypass_mode === "always"),
    ).toBe(true);
  });
});

describe("applyGithubSettings", () => {
  it("runs the three ops in order: ruleset, trunk-bypass, path-guard", () => {
    const { run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { id: 10, name: RULESET_NAME, source_type: "Repository" },
            { id: 99, name: TRUNK_RULESET_NAME, source_type: "Repository" },
            {
              id: 20,
              name: PATH_GUARD_RULESET_NAME,
              source_type: "Repository",
            },
          ]),
        };
      }

      if (cmd.endsWith("rulesets/10")) {
        return { status: 0, stdout: goNoGoFull(10) };
      }

      if (cmd.endsWith("rulesets/99")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            bypass_actors: [
              {
                actor_id: ROADRUNNER_APP_ID,
                actor_type: "Integration",
                bypass_mode: "always",
              },
            ],
            id: 99,
            name: "Trunk",
          }),
        };
      }

      return null;
    });
    const results = applyGithubSettings(SLUG, { run, write: false });
    expect(results.map((entry) => entry.op)).toEqual([
      "ruleset",
      "trunk-bypass",
      "path-guard",
    ]);
    expect(results.every((entry) => entry.status === "present")).toBe(true);
  });

  it("reports each op's own state in a fresh spawn (dry-run)", () => {
    // Nothing configured yet — all three rulesets absent.
    const { run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return { status: 0, stdout: "[]" };
      }

      return null;
    });
    const results = applyGithubSettings(SLUG, { run, write: false });
    expect(results.map((entry) => [entry.op, entry.status])).toEqual([
      ["ruleset", "would-create"],
      ["trunk-bypass", "would-create"],
      ["path-guard", "would-create"],
    ]);
  });

  it("never touches an npm-release environment or a Release workflow", () => {
    // A deploy target publishes nothing — those npm-package-template ops are gone.
    const { calls, run } = fakeRun((cmd) => {
      if (cmd.endsWith("rulesets")) {
        return { status: 0, stdout: "[]" };
      }

      return { status: 0, stdout: "" };
    });
    applyGithubSettings(SLUG, { run, write: true });
    const joined = calls.map((call) => call.join(" "));
    expect(
      joined.some((entry) => entry.includes("environments/npm-release")),
    ).toBe(false);
    expect(joined.some((entry) => entry.includes("/enable"))).toBe(false);
    expect(
      joined.some((entry) => entry.includes("workflows/pkg-release.yml")),
    ).toBe(false);
  });
});
