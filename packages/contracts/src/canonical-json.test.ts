import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.js";

type CanonicalVector = {
  id: string;
  purpose: string;
  input: unknown;
  canonical: string;
  sha256: string;
};

type CanonicalVectorFile = {
  canonicalJsonVersion: number;
  vectors: CanonicalVector[];
};

function loadVectors(): CanonicalVectorFile {
  const path = resolve(
    process.cwd(),
    "../../test-vectors/canonical-json-vectors.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as CanonicalVectorFile;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("canonical JSON v1", () => {
  it("matches every shared TypeScript/Kotlin vector exactly", () => {
    const fixture = loadVectors();
    expect(fixture.canonicalJsonVersion).toBe(1);

    for (const vector of fixture.vectors) {
      const encoded = canonicalJson(vector.input);
      expect(encoded, vector.id).toBe(vector.canonical);
      expect(sha256(encoded), vector.id).toBe(vector.sha256);
    }
  });

  it("omits undefined object properties but rejects undefined array values", () => {
    expect(canonicalJson({ keep: "value", omit: undefined })).toBe(
      '{"keep":"value"}',
    );
    expect(() => canonicalJson([undefined])).toThrow(
      "ELITE_CANONICAL_JSON_UNDEFINED",
    );
  });

  it("rejects non-finite, fractional, and unsafe numeric values", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(
      "ELITE_CANONICAL_JSON_NUMBER",
    );
    expect(() => canonicalJson(1.5)).toThrow("ELITE_CANONICAL_JSON_NUMBER");
    expect(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "ELITE_CANONICAL_JSON_NUMBER",
    );
  });
});
