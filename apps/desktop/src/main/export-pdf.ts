import PDFDocument from "pdfkit";
import type { PatientExportPayload } from "@elite/contracts";

export function renderPatientExportPdf(
  payload: PatientExportPayload,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margin: 48,
      compress: false,
      info: {
        Title: "Elite Clinic Patient Record Export",
        Author: "Elite Clinic Management System",
      },
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    document
      .fontSize(18)
      .text("Elite Clinic Management System", { align: "center" });
    document
      .moveDown(0.4)
      .fontSize(14)
      .text("Patient Record Export", { align: "center" });
    document
      .moveDown()
      .fontSize(9)
      .fillColor("#555")
      .text(`Redaction policy: ${payload.redactionPolicy}`);
    document.text(`Projection snapshot: ${payload.snapshotId}`);
    document.text(`Snapshot payload hash: ${payload.snapshotPayloadHash}`);
    document
      .moveDown()
      .fillColor("#000")
      .fontSize(11)
      .text("Patient identity", { underline: true });
    document.fontSize(10).text(`Patient ID: ${payload.identity.patientId}`);
    if (payload.identity.nameEn)
      document.text(`Name: ${payload.identity.nameEn}`);
    if (payload.identity.nameAr)
      document.text(`Arabic name: ${payload.identity.nameAr}`);
    if (payload.identity.dob)
      document.text(`Date of birth: ${payload.identity.dob}`);
    if (payload.identity.sex) document.text(`Sex: ${payload.identity.sex}`);
    if (payload.identity.phone)
      document.text(`Phone: ${payload.identity.phone}`);
    if (payload.identity.nationalId)
      document.text(`National ID: ${payload.identity.nationalId}`);

    document
      .moveDown()
      .fontSize(11)
      .text("Effective encounter", { underline: true });
    const encounter = payload.effectiveEncounter;
    document.fontSize(10).text(`Encounter date: ${encounter.encounterAt}`);
    document.text(`Effective version: ${encounter.effectiveVersion}`);
    document.text(`Applied amendments: ${encounter.appliedAmendmentCount}`);
    for (const [label, value] of [
      ["Subjective", encounter.subjective],
      ["Objective", encounter.objective],
      ["Assessment", encounter.assessment],
      ["Plan", encounter.plan],
      ["Follow-up", encounter.followUp],
    ] as const) {
      if (value) document.moveDown(0.3).fontSize(10).text(`${label}: ${value}`);
    }

    if (payload.medicalHistory.length > 0) {
      document
        .moveDown()
        .fontSize(11)
        .text("Medical history", { underline: true });
      document.fontSize(10);
      for (const entry of payload.medicalHistory) {
        document.text(
          `${String(entry["category"] ?? "Other")}: ${String(entry["title"] ?? "")}`,
        );
        if (entry["details"]) document.text(String(entry["details"]));
      }
    }
    document
      .moveDown()
      .fontSize(8)
      .fillColor("#555")
      .text(
        "This file is a signed export package. Verify the detached manifest signature and payload hash before relying on its contents.",
      );
    document.end();
  });
}
