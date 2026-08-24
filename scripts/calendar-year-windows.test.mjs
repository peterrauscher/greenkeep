import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarYearWindows } from "../src/lib/github.ts";

test("calendarYearWindows keeps a same-year range intact", () => {
  assert.deepEqual(calendarYearWindows("2025-12-01", "2025-12-31"), [
    { from: "2025-12-01", to: "2025-12-31" },
  ]);
});

test("calendarYearWindows splits a cross-year range at New Year", () => {
  assert.deepEqual(calendarYearWindows("2025-08-24", "2026-08-23"), [
    { from: "2025-08-24", to: "2025-12-31" },
    { from: "2026-01-01", to: "2026-08-23" },
  ]);
});

test("calendarYearWindows includes every boundary across multiple years", () => {
  assert.deepEqual(calendarYearWindows("2024-12-31", "2026-01-01"), [
    { from: "2024-12-31", to: "2024-12-31" },
    { from: "2025-01-01", to: "2025-12-31" },
    { from: "2026-01-01", to: "2026-01-01" },
  ]);
});
