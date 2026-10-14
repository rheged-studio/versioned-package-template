// Unit tests for the initialise-versioned-repo skill's GLOSSARY.md fs wrapper
// (R-2448). The pure transform is covered in the `-files` suite; these exercise
// the four statuses against a throwaway temp dir.

import { adaptGlossary } from "../../.claude/skills/initialise-versioned-repo/scripts/lib/glossary.mjs";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const identity = { description: "An example.", repo: "example" };
const SOURCE =
  "<!-- init:context -->\n# tpl\n\nTemplate.\n<!-- /init:context -->\n\n## Language\n\n<!-- init:template-only -->\n**Spawn**:\nx\n<!-- /init:template-only -->\n";

describe("adaptGlossary", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "glossary-"));
  });
  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  it("reports absent when there is no GLOSSARY.md", () => {
    expect(adaptGlossary(root, identity, true)).toEqual({ status: "absent" });
    expect(existsSync(join(root, "GLOSSARY.md"))).toBe(false);
  });

  it("reports would-adapt on a dry run and writes nothing", () => {
    writeFileSync(join(root, "GLOSSARY.md"), SOURCE);
    expect(adaptGlossary(root, identity, false)).toEqual({
      status: "would-adapt",
    });
    expect(readFileSync(join(root, "GLOSSARY.md"), "utf8")).toBe(SOURCE);
  });

  it("adapts on write, then reports clean on the next run", () => {
    writeFileSync(join(root, "GLOSSARY.md"), SOURCE);
    expect(adaptGlossary(root, identity, true)).toEqual({ status: "adapted" });
    const written = readFileSync(join(root, "GLOSSARY.md"), "utf8");
    expect(written).toBe("# example\n\nAn example.\n\n## Language\n");
    expect(adaptGlossary(root, identity, true)).toEqual({ status: "clean" });
  });
});
