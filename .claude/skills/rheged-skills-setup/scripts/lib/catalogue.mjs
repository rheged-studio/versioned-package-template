// Estate skill catalogue — parse, resolve install sets, and build skills.sh argv (A-1904).
// Pure functions only; fleet-update and rheged-skills-setup import this module.

export const DEFAULT_CATALOGUE_URL =
  "https://raw.githubusercontent.com/rheged-studio/agent-skills/main/infrastructure/skill-catalogue.json";

export const RHEGED_AGENT_SKILLS_PACKAGE = "@rheged-studio/agent-skills";

/**
 * Bundles retired by rename; wipe on consumers but never re-install (A-1904).
 */
export const LEGACY_BUNDLE_NAMES = ["initialise-skills"];

/**
 * Command shims to remove alongside legacy bundles.
 */
export const LEGACY_COMMAND_SHIM_NAMES = ["initialise-skills"];

/**
 * @param {string | object} json
 * @returns {{ version: number, sources: Array<{ id: string, url: string, skills: string[], skipWhenSourceRepo?: boolean }> }}
 */
export function parseCatalogue(json) {
  let catalogue = json;
  if (typeof json === "string") {
    try {
      catalogue = JSON.parse(json);
    } catch (error) {
      throw new Error(`could not parse skill catalogue JSON: ${error.message}`);
    }
  }

  if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) {
    throw new Error("skill catalogue must be a JSON object");
  }

  if (catalogue.version !== 1) {
    throw new Error(
      `skill catalogue version must be 1 (got ${JSON.stringify(catalogue.version)})`,
    );
  }

  if (!Array.isArray(catalogue.sources) || catalogue.sources.length === 0) {
    throw new Error("skill catalogue 'sources' must be a non-empty array");
  }

  const seenSkills = new Set();
  /** @type {Array<{ id: string, url: string, skills: string[], skipWhenSourceRepo?: boolean }>} */
  const sources = [];
  for (const entry of catalogue.sources) {
    if (!entry || typeof entry !== "object") {
      throw new Error("each catalogue source must be an object");
    }

    if (typeof entry.id !== "string" || !entry.id.trim()) {
      throw new Error("each catalogue source needs a non-empty 'id'");
    }

    if (typeof entry.url !== "string" || !entry.url.trim()) {
      throw new Error(`catalogue source '${entry.id}' needs a non-empty 'url'`);
    }

    if (!isStringArray(entry.skills) || entry.skills.length === 0) {
      throw new Error(
        `catalogue source '${entry.id}' 'skills' must be a non-empty string array`,
      );
    }

    for (const skill of entry.skills) {
      if (seenSkills.has(skill)) {
        throw new Error(
          `duplicate skill name '${skill}' across catalogue sources`,
        );
      }

      seenSkills.add(skill);
    }

    if (
      entry.skipWhenSourceRepo !== undefined &&
      typeof entry.skipWhenSourceRepo !== "boolean"
    ) {
      throw new Error(
        `catalogue source '${entry.id}' skipWhenSourceRepo must be boolean`,
      );
    }

    sources.push({
      id: entry.id.trim(),
      skills: [...entry.skills],
      skipWhenSourceRepo: entry.skipWhenSourceRepo === true,
      url: entry.url.trim(),
    });
  }

  return { sources, version: 1 };
}

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * @param {{ sources: Array<{ id: string }> }} catalogue
 * @param {string} sourceId
 * @returns {{ id: string, url: string, skills: string[], skipWhenSourceRepo?: boolean }}
 */
export function getSourceById(catalogue, sourceId) {
  const source = catalogue.sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error(`catalogue has no source with id '${sourceId}'`);
  }

  return source;
}

/**
 * Rheged ship-set skill names (first source with id 'rheged', else first source).
 * @param {{ sources: Array<{ id: string, skills: string[] }> }} catalogue
 * @returns {string[]}
 */
export function rhegedSkillNames(catalogue) {
  const rheged = catalogue.sources.find((entry) => entry.id === "rheged");
  return rheged ? [...rheged.skills] : [...catalogue.sources[0].skills];
}

/**
 * @param {{ sources: Array<{ id: string, skills: string[] }> }} catalogue
 * @returns {string[]}
 */
export function mattSkillNames(catalogue) {
  const matt = catalogue.sources.find((entry) => entry.id === "matt-pocock");
  return matt ? [...matt.skills] : [];
}

/**
 * Union of all catalogue skill names.
 * @param {{ sources: Array<{ skills: string[] }> }} catalogue
 * @returns {string[]}
 */
export function allCatalogueSkillNames(catalogue) {
  return catalogue.sources.flatMap((entry) => entry.skills);
}

/**
 * Effective Rheged install list for fleet profiles (no-changelog drops changelog).
 * @param {{ repoType?: string, skills?: string[] }} profile
 * @param {{ sources: Array<{ skills: string[] }> }} catalogue
 * @returns {string[]}
 */
export function resolveRhegedSkills(profile, catalogue) {
  const canonical = rhegedSkillNames(catalogue);
  if (Array.isArray(profile.skills)) {
    return profile.skills;
  }

  if (profile.repoType === "no-changelog") {
    return canonical.filter((skill) => skill !== "changelog");
  }

  return canonical;
}

/**
 * Full install set (Rheged resolved list + Matt names), deduped in catalogue order.
 * @param {{ repoType?: string, skills?: string[] }} profile
 * @param {{ sources: Array<{ skills: string[] }> }} catalogue
 * @returns {string[]}
 */
export function resolveInstallSkills(profile, catalogue) {
  const rheged = resolveRhegedSkills(profile, catalogue);
  const matt = mattSkillNames(catalogue);
  const combined = [...rheged];
  for (const name of matt) {
    if (!combined.includes(name)) {
      combined.push(name);
    }
  }

  return combined;
}

/**
 * Sources to run `skills add` for, honouring skipWhenSourceRepo on the agent-skills checkout.
 * @param {{ sources: Array<{ id: string, url: string, skills: string[], skipWhenSourceRepo?: boolean }> }} catalogue
 * @param {{ isAgentSkillsSourceRepo?: boolean, profile?: { repoType?: string, skills?: string[] } }} options
 * @returns {Array<{ id: string, url: string, skills: string[] }>}
 */
export function resolveInstallSources(catalogue, options = {}) {
  const { isAgentSkillsSourceRepo = false, profile = {} } = options;
  const rheged = resolveRhegedSkills(profile, catalogue);
  const matt = mattSkillNames(catalogue);

  return catalogue.sources
    .filter((source) => {
      if (source.skipWhenSourceRepo && isAgentSkillsSourceRepo) {
        return false;
      }

      return true;
    })
    .map((source) => {
      if (source.id === "rheged") {
        return { id: source.id, skills: rheged, url: source.url };
      }

      if (source.id === "matt-pocock") {
        return { id: source.id, skills: matt, url: source.url };
      }

      return { id: source.id, skills: [...source.skills], url: source.url };
    })
    .filter((source) => source.skills.length > 0);
}

/**
 * Primary Rheged URL for lock provenance.
 * @param {{ sources: Array<{ id: string, url: string }> }} catalogue
 * @returns {string}
 */
export function rhegedSourceUrl(catalogue) {
  const rheged = catalogue.sources.find((entry) => entry.id === "rheged");
  return rheged?.url ?? catalogue.sources[0].url;
}

/**
 * `npx skills` argv tail for one source: `add <url> [--skill X]… [--agent Y]… --copy`.
 * @param {string} url
 * @param {string[]} skills
 * @param {string[]} agents
 * @returns {string[]}
 */
export function buildSkillsAddArgsForSource(url, skills, agents) {
  const skillFlags = skills.flatMap((skill) => ["--skill", skill]);
  const agentFlags = agents.flatMap((agent) => ["--agent", agent]);
  return ["add", url, ...skillFlags, ...agentFlags, "--copy"];
}

/**
 * Wipe targets for install set + legacy retired bundles (A-1904).
 * @param {string[]} mirrors
 * @param {string[]} installSkills
 * @param {string[]} [legacyNames]
 * @returns {string[]}
 */
export function resolveWipeTargetsWithLegacy(
  mirrors,
  installSkills,
  legacyNames = LEGACY_BUNDLE_NAMES,
) {
  const names = [...new Set([...installSkills, ...legacyNames])];
  return mirrors.flatMap((mirror) =>
    names.map((skill) => `${mirror}/${skill}`.replaceAll("\\", "/")),
  );
}

/**
 * Validate catalogue against a local agent-skills checkout (Rheged skills only).
 * @param {{ sources: Array<{ id: string, skills: string[] }> }} catalogue
 * @param {(skill: string) => boolean} rhegedSkillExists
 * @returns {string[]}
 */
export function findMissingRhegedSourceSkills(catalogue, rhegedSkillExists) {
  return rhegedSkillNames(catalogue).filter(
    (skill) => !rhegedSkillExists(skill),
  );
}
