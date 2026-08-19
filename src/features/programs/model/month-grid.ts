import type { ProgramType } from "@/types";

export interface MonthGridDay {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

function dateKey(year: number, monthIndex: number, day: number): string {
  const value = new Date(Date.UTC(year, monthIndex, day));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function buildMonthGrid(month: string, today: string): MonthGridDay[] {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();

  return Array.from({ length: 42 }, (_, index) => {
    const date = dateKey(year, monthIndex, index - firstWeekday + 1);
    const parsedDay = Number(date.slice(-2));
    return {
      date,
      day: parsedDay,
      inCurrentMonth: date.startsWith(`${month}-`),
      isToday: date === today,
    };
  });
}

export function normalizeCalendarDate(month: string, value: string | null, today: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value.startsWith(`${month}-`)) return value;
  return today.startsWith(`${month}-`) ? today : `${month}-01`;
}

export function programTypeMark(type: ProgramType): "T" | "R" | "G" {
  if (type === "TALK") return "T";
  if (type === "READING") return "R";
  return "G";
}
