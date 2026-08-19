import { describe, expect, it } from "vitest";
import type { Appointment } from "@elite/contracts";
import {
  getAppointmentStatusClass,
  getTodayRoleFocus,
} from "./today-workspace.js";

const statuses: readonly Appointment["status"][] = [
  "scheduled",
  "arrived",
  "in-consultation",
  "completed",
  "cancelled",
  "no-show",
  "rescheduled",
];

describe("Today workspace feature policies", () => {
  it("maps appointment lifecycle states to semantic status classes", () => {
    expect(statuses.map(getAppointmentStatusClass)).toEqual([
      "info",
      "warn",
      "info",
      "ok",
      "error",
      "info",
      "info",
    ]);
  });

  it("provides distinct English focus guidance for every supported role", () => {
    const roles = ["admin", "doctor", "nurse", "receptionist"] as const;
    const focus = roles.map((role) => getTodayRoleFocus(role, "en-EG"));

    expect(new Set(focus).size).toBe(roles.length);
    expect(focus[0]).toContain("clinic’s status");
    expect(focus[1]).toContain("patient context");
    expect(focus[2]).toContain("rooming");
    expect(focus[3]).toContain("Check in");
  });

  it("keeps Arabic focus guidance available for every supported role", () => {
    const roles = ["admin", "doctor", "nurse", "receptionist"] as const;
    const focus = roles.map((role) => getTodayRoleFocus(role, "ar-EG"));

    expect(focus.every((value) => value.length > 0)).toBe(true);
    expect(focus[0]).toContain("العيادة");
    expect(focus[1]).toContain("المريض");
    expect(focus[2]).toContain("الغرفة");
    expect(focus[3]).toContain("المريض التالي");
  });
});
