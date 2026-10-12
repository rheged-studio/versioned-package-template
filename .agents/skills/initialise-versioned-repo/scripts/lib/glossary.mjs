// Adapt the inherited GLOSSARY.md to the spawned repo (A-2448, parent A-2430).
//
// The template ships a root GLOSSARY.md with two machine-readable regions:
//
//   <!-- init:context --> … <!-- /init:context -->            the title + blurb
//   <!-- init:template-only --> … <!-- /init:template-only --> terms that only
//                                                              make sense in the
//                                                              template itself
//
// In a spawned repo the context block becomes the repo's own `# <repo>` header
// plus its description, and the template-only block is dropped. Everything
// outside the markers (the inherited terms) is left byte-for-byte alone. Like
// `repo-config.mjs`, `planGlossaryAdapt` is a pure string transform; the markers
// are consumed, so a second pass is a no-op. `adaptGlossary` is the thin fs
// wrapper. This file is deliberately repo-agnostic: it reads only `repo` and
// `description` from the shared `deriveIdentity` result.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONTEXT_BLOCK = /<!-- init:context -->[\s\S]*?<!-- \/init:context -->/;
const TEMPLATE_ONLY_BLOCK =
  /\n*<!-- init:template-only -->[\s\S]*?<!-- \/init:template-only -->\n*/;

/**
 * Rewrite the context block and strip the template-only block. Returns the new
 * text and whether anything changed (false when no markers remain → idempotent).
 * @param {string} text
 * @param {{ repo: string, description?: string }} identity
 * @returns {{ text: string, changed: boolean }}
 */
export function planGlossaryAdapt(text, identity) {
  let out = text;

  if (CONTEXT_BLOCK.test(out)) {
    const description =
      identity.description?.trim() ||
      `Describe what ${identity.repo} is and why it exists.`;
    // A replacer *function*, so `$&` or `$1` in a description stay literal.
    out = out.replace(
      CONTEXT_BLOCK,
      () => `# ${identity.repo}\n\n${description}`,
    );
  }

  if (TEMPLATE_ONLY_BLOCK.test(out)) {
    // Collapse the removed block and its surrounding blank lines to one blank line.
    out = out.replace(TEMPLATE_ONLY_BLOCK, "\n\n");
  }

  if (out === text) {
    return { changed: false, text };
  }

  // Keep the input's trailing-newline convention exactly.
  out = out.replace(/\n+$/, "");
  if (text.endsWith("\n")) {
    out += "\n";
  }

  return { changed: true, text: out };
}

/**
 * fs wrapper: read `<root>/GLOSSARY.md`, adapt it, and (when `write`) persist.
 * @param {string} root
 * @param {{ repo: string, description?: string }} identity
 * @param {boolean} [write]
 * @returns {{ status: "absent" | "clean" | "would-adapt" | "adapted" }}
 */
export function adaptGlossary(root, identity, write = false) {
  const path = join(root, "GLOSSARY.md");
  if (!existsSync(path)) {
    return { status: "absent" };
  }

  const { changed, text } = planGlossaryAdapt(
    readFileSync(path, "utf8"),
    identity,
  );
  if (!changed) {
    return { status: "clean" };
  }

  if (write) {
    writeFileSync(path, text);
    return { status: "adapted" };
  }

  return { status: "would-adapt" };
}
