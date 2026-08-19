import type { Appointment, Patient } from "@elite/contracts";

export type WorkspaceLocale = "en-EG" | "ar-EG";

export interface PatientContextModel {
  primaryName: string;
  secondaryName: string | undefined;
  age: number | null;
  statusClass: "ok" | "warn";
}

export interface TodayAppointmentMetrics {
  waitingCount: number;
  completedCount: number;
  nextAppointment: Appointment | undefined;
}

export function getPatientAge(
  dob: string | undefined,
  referenceDate: Date = new Date(),
): number | null {
  if (!dob) return null;
  const birthDate = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    referenceDate.getMonth() < birthDate.getMonth() ||
    (referenceDate.getMonth() === birthDate.getMonth() &&
      referenceDate.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function getPatientContextModel(
  patient: Patient,
  locale: WorkspaceLocale,
  referenceDate: Date = new Date(),
): PatientContextModel {
  const prefersArabic = locale === "ar-EG" && Boolean(patient.nameAr?.trim());
  return {
    primaryName: prefersArabic ? patient.nameAr! : patient.nameEn,
    secondaryName: prefersArabic ? patient.nameEn : patient.nameAr,
    age: getPatientAge(patient.dob, referenceDate),
    statusClass: patient.status === "active" ? "ok" : "warn",
  };
}

export function sortAppointmentsByStart(
  appointments: readonly Appointment[],
): Appointment[] {
  return [...appointments].sort(
    (left, right) =>
      new Date(left.scheduledStart).getTime() -
      new Date(right.scheduledStart).getTime(),
  );
}

export function getTodayAppointmentMetrics(
  appointments: readonly Appointment[],
  referenceDate: Date = new Date(),
): TodayAppointmentMetrics {
  const sortedAppointments = sortAppointmentsByStart(appointments);
  const waitingCount = sortedAppointments.filter(
    (appointment) => appointment.status === "arrived",
  ).length;
  const completedCount = sortedAppointments.filter(
    (appointment) => appointment.status === "completed",
  ).length;
  const referenceTime = referenceDate.getTime();
  const nextAppointment = sortedAppointments.find(
    (appointment) =>
      appointment.status !== "completed" &&
      appointment.status !== "cancelled" &&
      new Date(appointment.scheduledStart).getTime() >= referenceTime,
  );

  return { waitingCount, completedCount, nextAppointment };
}
