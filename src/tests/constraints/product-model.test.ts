import { readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(process.cwd());
const sourceRoot = resolve(projectRoot, "src");
const productionExtensions = new Set([".ts", ".tsx"]);

function collectProductionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "tests") {
        return [];
      }

      return collectProductionFiles(entryPath);
    }

    return productionExtensions.has(extname(entry.name)) ? [entryPath] : [];
  });
}

function quotedValuesInArray(source: string, identifier: string): string[] {
  const declaration = source.match(
    new RegExp(`${identifier}\\s*=\\s*\\[([\\s\\S]*?)\\]`),
  );

  expect(
    declaration,
    `${identifier} must be exported as a readonly array so UI, validation, and the future DB adapter share one vocabulary.`,
  ).not.toBeNull();

  return [...(declaration?.[1] ?? "").matchAll(/["']([A-Z_]+)["']/g)].map(
    ([, value]) => value,
  );
}

describe("product model constraints", () => {
  const productionFiles = collectProductionFiles(sourceRoot);
  const source = productionFiles.map((file) => readFileSync(file, "utf8")).join("\n");

  it("keeps the top-level Program types exact", () => {
    expect(quotedValuesInArray(source, "PROGRAM_TYPES")).toEqual([
      "TALK",
      "READING",
      "GATHERING",
    ]);
  });

  it("models WORKSHOP only as a Gathering category", () => {
    expect(quotedValuesInArray(source, "GATHERING_CATEGORIES")).toEqual([
      "CASUAL",
      "WORKSHOP",
      "FIELD_TRIP",
      "EXHIBITION",
      "STUDY",
      "DINING",
      "OTHER",
    ]);

    const independentWorkshopFiles = productionFiles
      .map((file) => relative(sourceRoot, file).replaceAll("\\", "/"))
      .filter((file) => /(^|\/)features\/workshop(\/|\.|$)/i.test(file));

    expect(independentWorkshopFiles).toEqual([]);
  });

  it("does not introduce Collective in production source", () => {
    const offenders = productionFiles
      .filter((file) => /\bcollectives?\b/i.test(readFileSync(file, "utf8")))
      .map((file) => relative(projectRoot, file).replaceAll("\\", "/"));

    expect(offenders).toEqual([]);
  });
});
