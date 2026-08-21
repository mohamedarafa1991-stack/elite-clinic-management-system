import type { Appointment, Patient } from "@elite/contracts";

import type {
  DoctorDirectoryEntry,
  Schedule,
  ScheduleException,
} from "@elite/contracts";

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

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface TodayDoctorAvailability {
  doctor: DoctorDirectoryEntry;
  windows: readonly string[];
}

export function getDoctorsScheduledToday(
  doctors: readonly DoctorDirectoryEntry[],
  schedules: readonly Schedule[],
  exceptions: readonly ScheduleException[],
  referenceDate: Date = new Date(),
): TodayDoctorAvailability[] {
  const dayOfWeek = referenceDate.getDay();
  const dateKey = localDateKey(referenceDate);
  const dateExceptions = exceptions.filter(
    (exception) => exception.exceptionDate === dateKey,
  );

  return doctors
    .flatMap((doctor) => {
      const schedulesForDay = schedules.filter(
        (schedule) =>
          schedule.doctorId === doctor.id && schedule.dayOfWeek === dayOfWeek,
      );
      const doctorExceptions = dateExceptions.filter(
        (exception) =>
          exception.doctorId === doctor.id ||
          (!exception.doctorId && !exception.departmentId),
      );
      const closed = doctorExceptions.some(
        (exception) => exception.kind === "closed",
      );
      const openOverride = doctorExceptions.some(
        (exception) => exception.kind === "open",
      );
      if (closed || (schedulesForDay.length === 0 && !openOverride)) {
        return [];
      }
      return [
        {
          doctor,
          windows:
            schedulesForDay.length > 0
              ? schedulesForDay.map(
                  (schedule) => `${schedule.startTime}–${schedule.endTime}`,
                )
              : ["Open override"],
        },
      ];
    })
    .sort((left, right) =>
      left.doctor.displayNameEn.localeCompare(right.doctor.displayNameEn),
    );
}
