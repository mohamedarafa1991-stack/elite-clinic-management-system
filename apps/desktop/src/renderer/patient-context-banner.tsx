import type { Patient } from "@elite/contracts";
import type { ReactElement, ReactNode } from "react";
import {
  getPatientContextModel,
  type WorkspaceLocale,
} from "./workspace-model.js";

export interface PatientContextLabels {
  context: string;
  patientId: string;
  phone: string;
  age: string;
  status: string;
  clear: string;
  notRecorded: string;
}

export interface PatientContextBannerProps {
  patient: Patient;
  locale: WorkspaceLocale;
  labels: PatientContextLabels;
  statusLabel: string;
  onClear: () => void;
}

function BidiValue({
  children,
  direction = "auto",
}: {
  children: ReactNode;
  direction?: "auto" | "ltr" | "rtl";
}): ReactElement {
  return <span dir={direction}>{children}</span>;
}

export function PatientContextBanner({
  patient,
  locale,
  labels,
  statusLabel,
  onClear,
}: PatientContextBannerProps): ReactElement {
  const context = getPatientContextModel(patient, locale);

  return (
    <section
      className="patient-context-banner"
      aria-labelledby="patient-context-title"
      aria-live="polite"
    >
      <div className="patient-context-identity">
        <span className="patient-context-avatar" aria-hidden="true">
          {context.primaryName.trim().slice(0, 1).toUpperCase() || "P"}
        </span>
        <div>
          <p className="eyebrow">{labels.context}</p>
          <h3 id="patient-context-title">
            <BidiValue>{context.primaryName}</BidiValue>
          </h3>
          {context.secondaryName ? (
            <p className="patient-context-secondary">
              <BidiValue>{context.secondaryName}</BidiValue>
            </p>
          ) : null}
        </div>
      </div>
      <dl className="patient-context-facts">
        <div>
          <dt>{labels.patientId}</dt>
          <dd>
            <BidiValue direction="ltr">{patient.patientId}</BidiValue>
          </dd>
        </div>
        <div>
          <dt>{labels.phone}</dt>
          <dd>
            <BidiValue direction="ltr">{patient.phone}</BidiValue>
          </dd>
        </div>
        <div>
          <dt>{labels.age}</dt>
          <dd>
            {context.age === null
              ? labels.notRecorded
              : new Intl.NumberFormat(locale).format(context.age)}
          </dd>
        </div>
        <div>
          <dt>{labels.status}</dt>
          <dd>
            <span className={`status ${context.statusClass}`}>
              {statusLabel}
            </span>
          </dd>
        </div>
      </dl>
      <button className="button ghost small" type="button" onClick={onClear}>
        {labels.clear}
      </button>
    </section>
  );
}
