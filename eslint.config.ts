import { base, typescript } from "@rheged-studio/eslint-config";
import { defineConfig } from "eslint/config";

/**
 * Self-lint config for the template, dogfooding the published Acme preset:
 * the `base` stack plus the TypeScript-file overrides.
 *
 * This is a content-only, non-npm baseline (R-939): there is no first-party
 * `src/` TypeScript to build or type-check, so the old src-spanning
 * `tsconfig.eslint.json` project pin is gone with the tsconfig trio. ESLint's
 * only lint surface here is the `infrastructure/` `.mjs` tooling; the two `.ts`
 * config files are excluded (`eslint.config.ts` by the preset's global ignores,
 * `vitest.config.ts` below) so the base preset's type-aware rules never look for
 * a tsconfig that no longer exists.
 *
 * Authored in TypeScript (loaded by jiti) and wrapped in `defineConfig` so the
 * whole config array is type-checked against the preset's shipped types.
 */
export default defineConfig([
  // The vendored agent-skill bundles are mirrored into `.claude/skills/` (already
  // ignored by the preset) and `.agents/skills/` (for Cursor). Neither mirror is
  // part of this repo's lint surface — the bundles are external, zero-dep `.mjs`
  // that own their linting upstream, and CI's directory-scoped lint never touches
  // them. Ignore `.agents/**` too, so the two mirrors are treated symmetrically and
  // a newly-added bundle's Node globals don't trip the change-gated preflight.
  // `vitest.config.ts` is the only remaining first-party `.ts`; excluding it keeps
  // the lint surface `.mjs`-only, so no type-aware project resolution is needed.
  { ignores: [".agents/**", "vitest.config.ts"] },
  ...base,
  typescript,
  // infrastructure/ holds the workflow shell's CLI tooling (not published code):
  // it legitimately imports devDependencies, so import/no-extraneous-dependencies
  // allows them. Complexity is off for the branchy ensure-* reference scripts.
  // Scoped narrowly to this directory.
  {
    files: ["infrastructure/**/*.{ts,mjs}"],
    rules: {
      complexity: "off",
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
]);
