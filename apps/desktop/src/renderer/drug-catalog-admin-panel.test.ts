import { describe, expect, it } from "vitest";
import type { DrugCatalogSnapshot } from "@elite/contracts";
import {
  getDrugCatalogSnapshotActions,
  snapshotStatusClass,
} from "./drug-catalog-admin-panel.js";

function snapshot(
  id: string,
  status: DrugCatalogSnapshot["status"],
  previousSnapshotId?: string,
): DrugCatalogSnapshot {
  return {
    id,
    sourceKind: "local-json",
    sourceUrl: "file:///selected/catalog.json",
    sourceCommit: "commit-001",
    sourceFile: "data/eg_drugs.json",
    sourceVersion: "June 2026",
    licenseAcknowledged: true,
    contentSha256: "a".repeat(64),
    status,
    totalRecords: 1,
    validRecords: 1,
    invalidRecords: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdByUserId: "admin-user-1",
    ...(previousSnapshotId ? { previousSnapshotId } : {}),
  };
}

describe("DrugCatalogAdminPanel policies", () => {
  it("assigns visual status classes for every snapshot lifecycle state", () => {
    expect(snapshotStatusClass("staged")).toBe("warn");
    expect(snapshotStatusClass("active")).toBe("ok");
    expect(snapshotStatusClass("superseded")).toBe("muted");
    expect(snapshotStatusClass("rejected")).toBe("muted");
  });

  it("allows promotion and rejection only for staged snapshots", () => {
    expect(
      getDrugCatalogSnapshotActions(snapshot("staged", "staged"), []),
    ).toEqual({ canPromote: true, canReject: true, canRollback: false });
    expect(
      getDrugCatalogSnapshotActions(snapshot("active", "active"), []),
    ).toEqual({ canPromote: false, canReject: false, canRollback: false });
  });

  it("allows rollback only to the previous snapshot of the active catalog", () => {
    const previous = snapshot("previous", "superseded");
    const active = snapshot("active", "active", "previous");
    expect(getDrugCatalogSnapshotActions(previous, [previous, active])).toEqual(
      {
        canPromote: false,
        canReject: false,
        canRollback: true,
      },
    );
    expect(
      getDrugCatalogSnapshotActions(snapshot("other", "superseded"), [
        previous,
        active,
      ]),
    ).toEqual({ canPromote: false, canReject: false, canRollback: false });
  });
});
