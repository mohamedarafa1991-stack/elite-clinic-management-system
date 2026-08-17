export type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue | undefined };

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

/**
 * Canonical JSON v1 used by the Hub/Android synchronization protocol.
 *
 * Object keys are sorted lexicographically by UTF-16 code unit, arrays retain
 * their order, object properties with an undefined value are omitted, and
 * numbers are restricted to safe integers so Android and JavaScript serialize
 * the same numeric value without floating-point normalization differences.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return JSON.stringify(assertCanonicalJsonSafeInteger(value));
  }
  if (value === undefined) {
    throw new Error("ELITE_CANONICAL_JSON_UNDEFINED: undefined is not a value");
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(
    `ELITE_CANONICAL_JSON_TYPE: unsupported value type ${typeof value}`,
  );
}

export function assertCanonicalJsonSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_SAFE_INTEGER) {
    throw new Error(
      "ELITE_CANONICAL_JSON_NUMBER: only finite safe integers are supported",
    );
  }
  return value;
}
