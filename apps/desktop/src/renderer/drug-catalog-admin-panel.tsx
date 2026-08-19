import {
  useEffect,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react";
import type {
  DrugCatalogEntry,
  DrugCatalogImportInput,
  DrugCatalogRemoteImportInput,
  DrugCatalogSnapshot,
  DrugCatalogSnapshotTransitionInput,
} from "@elite/contracts";

const DEFAULT_REMOTE_URL =
  "https://raw.githubusercontent.com/mahmoudfalous/eg-drugs/e19709c/data/eg_drugs.json";
const DEFAULT_COMMIT = "e19709c";
const DEFAULT_VERSION = "June 2026";

function displayDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export function snapshotStatusClass(
  status: DrugCatalogSnapshot["status"],
): string {
  if (status === "active") return "ok";
  if (status === "staged") return "warn";
  return "muted";
}

export interface DrugCatalogSnapshotActions {
  canPromote: boolean;
  canReject: boolean;
  canRollback: boolean;
}

export function getDrugCatalogSnapshotActions(
  selectedSnapshot: DrugCatalogSnapshot | undefined,
  snapshots: readonly DrugCatalogSnapshot[],
): DrugCatalogSnapshotActions {
  return {
    canPromote: selectedSnapshot?.status === "staged",
    canReject: selectedSnapshot?.status === "staged",
    canRollback:
      selectedSnapshot?.status === "superseded" &&
      snapshots.some(
        (snapshot) =>
          snapshot.status === "active" &&
          snapshot.previousSnapshotId === selectedSnapshot.id,
      ),
  };
}

export function DrugCatalogAdminPanel({
  token,
  canManage,
}: {
  token: string;
  canManage: boolean;
}): ReactElement | null {
  const [snapshots, setSnapshots] = useState<readonly DrugCatalogSnapshot[]>(
    [],
  );
  const [entries, setEntries] = useState<readonly DrugCatalogEntry[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [remoteUrl, setRemoteUrl] = useState(DEFAULT_REMOTE_URL);
  const [sourceCommit, setSourceCommit] = useState(DEFAULT_COMMIT);
  const [sourceVersion, setSourceVersion] = useState(DEFAULT_VERSION);
  const [licenseAcknowledged, setLicenseAcknowledged] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = async (preferredSnapshotId?: string): Promise<void> => {
    setError(null);
    try {
      const nextSnapshots = await window.elite.drugCatalog.listSnapshots(token);
      setSnapshots(nextSnapshots);
      const nextId =
        preferredSnapshotId ?? selectedSnapshotId ?? nextSnapshots[0]?.id ?? "";
      setSelectedSnapshotId(nextId);
      setEntries(
        nextId ? await window.elite.drugCatalog.listEntries(token, nextId) : [],
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load drug catalog snapshots",
      );
    }
  };

  useEffect(() => {
    if (canManage) void refresh();
  }, [token, canManage]);

  const selectSnapshot = async (snapshotId: string): Promise<void> => {
    setSelectedSnapshotId(snapshotId);
    setError(null);
    try {
      setEntries(await window.elite.drugCatalog.listEntries(token, snapshotId));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load catalog snapshot entries",
      );
    }
  };

  const stageRemote = async (): Promise<void> => {
    if (!licenseAcknowledged) {
      setError(
        "Confirm the source license and non-commercial-use review first.",
      );
      return;
    }
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: DrugCatalogRemoteImportInput = {
        sourceKind: "remote-json",
        sourceUrl: remoteUrl,
        sourceCommit,
        sourceFile: "data/eg_drugs.json",
        sourceVersion,
        licenseAcknowledged: true,
      };
      const snapshot = await window.elite.drugCatalog.fetchAndStageRemote(
        token,
        input,
      );
      setNotice(
        `Snapshot staged: ${snapshot.validRecords} valid and ${snapshot.invalidRecords} invalid records.`,
      );
      await refresh(snapshot.id);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to stage remote catalog",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const stageLocal = async (): Promise<void> => {
    if (!selectedFile) {
      setError(
        "Choose the downloaded JSON file before staging an offline snapshot.",
      );
      return;
    }
    if (!licenseAcknowledged) {
      setError(
        "Confirm the source license and non-commercial-use review first.",
      );
      return;
    }
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const content = await selectedFile.text();
      const input: DrugCatalogImportInput = {
        sourceKind: "local-json",
        sourceUrl: `file:///selected/${encodeURIComponent(selectedFile.name)}`,
        sourceCommit,
        sourceFile: "data/eg_drugs.json",
        sourceVersion,
        licenseAcknowledged: true,
        content,
      };
      const snapshot = await window.elite.drugCatalog.stageImport(token, input);
      setNotice(
        `Offline snapshot staged: ${snapshot.validRecords} valid and ${snapshot.invalidRecords} invalid records.`,
      );
      await refresh(snapshot.id);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to stage local catalog",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const transition = async (
    action: "promote" | "reject" | "rollback",
  ): Promise<void> => {
    if (!selectedSnapshotId || transitionReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: DrugCatalogSnapshotTransitionInput = {
        snapshotId: selectedSnapshotId,
        reason: transitionReason,
      };
      const snapshot =
        action === "promote"
          ? await window.elite.drugCatalog.promoteSnapshot(token, input)
          : action === "reject"
            ? await window.elite.drugCatalog.rejectSnapshot(token, input)
            : await window.elite.drugCatalog.rollbackSnapshot(token, input);
      setTransitionReason("");
      setNotice(`Catalog snapshot is now ${snapshot.status}.`);
      await refresh(snapshot.id);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to change catalog snapshot state",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setSelectedFileName(file?.name ?? "");
  };

  if (!canManage) return null;

  const selectedSnapshot = snapshots.find(
    (snapshot) => snapshot.id === selectedSnapshotId,
  );
  const { canPromote, canReject, canRollback } = getDrugCatalogSnapshotActions(
    selectedSnapshot,
    snapshots,
  );

  return (
    <section className="form-section" aria-labelledby="drug-catalog-title">
      <div className="related-person-heading">
        <div>
          <p className="eyebrow">Approved source · Admin review</p>
          <h3 id="drug-catalog-title">Egyptian drug catalog snapshots</h3>
        </div>
        <span className="status warn">Staged only</span>
      </div>
      <p className="form-help">
        Imports never change the active catalog until an Admin promotes a
        validated snapshot. Keep the source commit and license decision recorded
        for every update.
      </p>
      {error ? <p className="status danger">{error}</p> : null}
      {notice ? <p className="status ok">{notice}</p> : null}
      <div className="form-grid">
        <label>
          Approved JSON source URL
          <input
            value={remoteUrl}
            onChange={(event) => setRemoteUrl(event.target.value)}
          />
        </label>
        <label>
          Source commit
          <input
            value={sourceCommit}
            onChange={(event) => setSourceCommit(event.target.value)}
          />
        </label>
        <label>
          Dataset version
          <input
            value={sourceVersion}
            onChange={(event) => setSourceVersion(event.target.value)}
          />
        </label>
        <label>
          Offline JSON / USB file
          <input
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
          />
          <small>{selectedFileName || "No file selected"}</small>
        </label>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={licenseAcknowledged}
          onChange={(event) => setLicenseAcknowledged(event.target.checked)}
        />
        I reviewed the source attribution and confirmed that the clinic’s use is
        permitted.
      </label>
      <div className="button-row">
        <button
          className="button secondary"
          type="button"
          disabled={isBusy}
          onClick={() => void stageRemote()}
        >
          Fetch and stage approved source
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={isBusy || !selectedFile}
          onClick={() => void stageLocal()}
        >
          Stage offline file
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={isBusy}
          onClick={() => void refresh()}
        >
          Refresh snapshots
        </button>
      </div>
      <div className="patient-list" aria-live="polite">
        {snapshots.map((snapshot) => (
          <button
            className="patient-row"
            type="button"
            key={snapshot.id}
            onClick={() => void selectSnapshot(snapshot.id)}
          >
            <span>
              <strong>
                {snapshot.sourceVersion} · {snapshot.sourceCommit}
              </strong>
              <small>
                {snapshot.validRecords} valid · {snapshot.invalidRecords}{" "}
                invalid · created {displayDate(snapshot.createdAt)}
              </small>
            </span>
            <span className={`status ${snapshotStatusClass(snapshot.status)}`}>
              {snapshot.status}
            </span>
          </button>
        ))}
        {snapshots.length === 0 ? (
          <p className="muted">No catalog snapshots staged yet.</p>
        ) : null}
      </div>
      {selectedSnapshot ? (
        <div className="form-section">
          <h4>Selected snapshot review</h4>
          <p className="form-help">
            SHA-256: <code>{selectedSnapshot.contentSha256}</code>
          </p>
          <p className="form-help">
            Source: {selectedSnapshot.sourceUrl} · status{" "}
            {selectedSnapshot.status}
          </p>
          <div className="patient-list">
            {entries.slice(0, 30).map((entry) => (
              <div className="patient-row" key={entry.id}>
                <span>
                  <strong>{entry.nameEn}</strong>
                  <small>
                    {entry.nameAr ?? "Arabic name unavailable"} ·{" "}
                    {entry.activeIngredients}
                  </small>
                  {entry.validationErrors.length > 0 ? (
                    <small className="status danger">
                      {entry.validationErrors.join("; ")}
                    </small>
                  ) : null}
                </span>
                <span
                  className={`status ${entry.validationStatus === "valid" ? "ok" : "danger"}`}
                >
                  {entry.validationStatus}
                </span>
              </div>
            ))}
          </div>
          <label>
            Required transition reason
            <input
              value={transitionReason}
              minLength={3}
              onChange={(event) => setTransitionReason(event.target.value)}
            />
          </label>
          <div className="button-row">
            {canPromote ? (
              <button
                className="button primary"
                type="button"
                disabled={
                  isBusy ||
                  transitionReason.trim().length < 3 ||
                  selectedSnapshot.validRecords === 0
                }
                onClick={() => void transition("promote")}
              >
                Promote to active
              </button>
            ) : null}
            {canReject ? (
              <button
                className="button danger"
                type="button"
                disabled={isBusy || transitionReason.trim().length < 3}
                onClick={() => void transition("reject")}
              >
                Reject snapshot
              </button>
            ) : null}
            {canRollback ? (
              <button
                className="button danger"
                type="button"
                disabled={isBusy || transitionReason.trim().length < 3}
                onClick={() => void transition("rollback")}
              >
                Roll back to this snapshot
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
