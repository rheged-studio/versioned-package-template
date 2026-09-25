// Catalogue install path (A-1904): vendor estate skills via skills.sh, restore configs, optional reconcile.

import {
  buildSkillsAddArgsForSource,
  DEFAULT_CATALOGUE_URL,
  LEGACY_COMMAND_SHIM_NAMES,
  mattSkillNames,
  parseCatalogue,
  resolveInstallSkills,
  resolveInstallSources,
  resolveWipeTargetsWithLegacy,
  RHEGED_AGENT_SKILLS_PACKAGE,
  rhegedSourceUrl,
} from "./lib/catalogue.mjs";
import { parseClobberedConfigs } from "./lib/git.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const CONSUMER_SKILL_DIRS = [
  ".claude/skills",
  ".agents/skills",
  ".cursor/skills",
];

const DEFAULT_AGENTS = ["claude-code", "cursor"];

/**
 * @param {Record<string, string | undefined>} [baseEnvironment]
 * @returns {Record<string, string | undefined>}
 */
export function skillsAddEnvironment(baseEnvironment = process.env) {
  return { ...baseEnvironment, CLAUDECODE: "1" };
}

/**
 * @param {string} repoRoot
 * @returns {boolean}
 */
export function isAgentSkillsSourceRepo(repoRoot) {
  const packagePath = join(repoRoot, "package.json");
  if (!existsSync(packagePath)) {
    return false;
  }

  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    return pkg?.name === RHEGED_AGENT_SKILLS_PACKAGE;
  } catch {
    return false;
  }
}

/**
 * @param {string} repoRoot
 * @param {string | undefined} catalogueOverride
 * @returns {Promise<string>}
 */
export async function loadCatalogueText(repoRoot, catalogueOverride) {
  if (catalogueOverride) {
    if (/^https?:\/\//i.test(catalogueOverride)) {
      const catalogueResponse = await fetch(catalogueOverride);
      if (!catalogueResponse.ok) {
        throw new Error(
          `could not fetch catalogue from ${catalogueOverride}: HTTP ${catalogueResponse.status}`,
        );
      }

      return await catalogueResponse.text();
    }

    const path = resolve(repoRoot, catalogueOverride);
    if (!existsSync(path)) {
      throw new Error(`catalogue file not found: ${path}`);
    }

    return readFileSync(path, "utf8");
  }

  const local = join(repoRoot, "infrastructure", "skill-catalogue.json");
  if (existsSync(local)) {
    return readFileSync(local, "utf8");
  }

  const response = await fetch(DEFAULT_CATALOGUE_URL);
  if (!response.ok) {
    throw new Error(
      `could not fetch default catalogue: HTTP ${response.status}`,
    );
  }

  return await response.text();
}

function run(command, args, cwd, environment) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: environment ?? process.env,
  });
  if (result.status !== 0) {
    const detail =
      result.stderr?.trim() ||
      result.stdout?.trim() ||
      `${command} exited ${result.status}`;
    throw new Error(detail);
  }

  return result.stdout ?? "";
}

function restoreAllClobberedConfigs(repoRoot) {
  const diff = run(
    "git",
    ["diff", "HEAD", "--name-only", "--diff-filter=DM"],
    repoRoot,
  );
  const clobbered = parseClobberedConfigs(diff);
  if (clobbered.length === 0) {
    return [];
  }

  run("git", ["checkout", "HEAD", "--", ...clobbered], repoRoot);
  return clobbered;
}

function runSkillsAdd(repoRoot, args) {
  console.log(`rheged-skills-setup: skills ${args.join(" ")}`);
  run("npx", ["skills", ...args], repoRoot, skillsAddEnvironment());
}

function wipeBeforeInstall(repoRoot, installSkills) {
  const targets = resolveWipeTargetsWithLegacy(
    CONSUMER_SKILL_DIRS,
    installSkills,
  );
  const removed = [];
  for (const relativePath of targets) {
    const absolute = join(repoRoot, relativePath);
    if (existsSync(absolute)) {
      rmSync(absolute, { force: true, recursive: true });
      removed.push(relativePath);
    }
  }

  // Consumers lose the old vendored bundle shim; agent-skills dogfood keeps the
  // tracked redirect at .claude/commands/initialise-skills.md (A-1904).
  if (!isAgentSkillsSourceRepo(repoRoot)) {
    for (const shim of LEGACY_COMMAND_SHIM_NAMES) {
      const commandPath = join(repoRoot, ".claude", "commands", `${shim}.md`);
      if (existsSync(commandPath)) {
        rmSync(commandPath, { force: true });
        removed.push(relative(repoRoot, commandPath));
      }
    }
  }

  if (removed.length > 0) {
    console.log(
      `rheged-skills-setup: wiped ${removed.length} bundle/shim path(s) before install.`,
    );
  }
}

function relative(repoRoot, absolute) {
  return absolute.startsWith(repoRoot)
    ? absolute.slice(repoRoot.length + 1)
    : absolute;
}

/**
 * @param {string} repoRoot
 * @param {string[]} mattSkills
 * @returns {string[]}
 */
export function findMissingMattBundles(repoRoot, mattSkills) {
  const missing = [];
  for (const skill of mattSkills) {
    let found = false;
    for (const mirror of CONSUMER_SKILL_DIRS) {
      const skillMd = join(repoRoot, mirror, skill, "SKILL.md");
      if (existsSync(skillMd)) {
        found = true;
        break;
      }
    }

    if (!found) {
      missing.push(skill);
    }
  }

  return missing;
}

/**
 * @param {{ repoRoot: string, agents?: string[], cataloguePath?: string, profile?: object, dryRun?: boolean }} options
 * @returns {Promise<{ catalogue: object, installSkills: string[], lockSource: string }>}
 */
export async function runCatalogueInstall(options) {
  const repoRoot = resolve(options.repoRoot);
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    throw new Error(`repo root is not a directory: ${repoRoot}`);
  }

  const text = await loadCatalogueText(repoRoot, options.cataloguePath);
  const catalogue = parseCatalogue(text);
  const profile = options.profile ?? { repoType: "single" };
  const agents = options.agents ?? DEFAULT_AGENTS;
  const installSkills = resolveInstallSkills(profile, catalogue);
  const sources = resolveInstallSources(catalogue, {
    isAgentSkillsSourceRepo: isAgentSkillsSourceRepo(repoRoot),
    profile,
  });

  if (options.dryRun) {
    console.log(
      `rheged-skills-setup: would install ${installSkills.length} skill(s) from ${sources.length} source(s).`,
    );
    for (const source of sources) {
      console.log(
        `  ${source.id}: ${source.skills.length} skill(s) from ${source.url}`,
      );
    }

    return {
      catalogue,
      installSkills,
      lockSource: rhegedSourceUrl(catalogue),
    };
  }

  wipeBeforeInstall(repoRoot, installSkills);
  for (const source of sources) {
    runSkillsAdd(
      repoRoot,
      buildSkillsAddArgsForSource(source.url, source.skills, agents),
    );
  }

  const restored = restoreAllClobberedConfigs(repoRoot);
  console.log(
    `rheged-skills-setup: restored ${restored.length} config.json from HEAD (A-706).`,
  );

  const missingMatt = findMissingMattBundles(
    repoRoot,
    mattSkillNames(catalogue),
  );
  if (missingMatt.length > 0) {
    throw new Error(
      `Matt pack install incomplete — missing bundles: ${missingMatt.join(", ")}`,
    );
  }

  return {
    catalogue,
    installSkills,
    lockSource: rhegedSourceUrl(catalogue),
  };
}
