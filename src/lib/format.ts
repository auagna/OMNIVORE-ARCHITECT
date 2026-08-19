import type { Program } from "@/types";

const TIME_ZONE = "Asia/Seoul";

export function formatProgramKind(program: Program): string {
  if (program.type !== "GATHERING") return program.type;
  return `GATHERING / ${program.detail.category.replaceAll("_", " ")}`;
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: TIME_ZONE,
  })
    .format(new Date(value))
    .toUpperCase();
}

export function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  })
    .format(new Date(value))
    .replaceAll(",", "")
    .toUpperCase();
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

export function formatTimeRange(startAt: string, endAt: string | null): string {
  const start = formatTime(startAt);
  return endAt ? `${start}—${formatTime(endAt)}` : start;
}

export function formatMoney(value: number | null): string {
  if (value === null) return "PRICE TO CONFIRM";
  return `${new Intl.NumberFormat("ko-KR").format(value)} KRW`;
}

export function formatCost(program: Program): string {
  if (program.type !== "GATHERING") return "—";
  const { cost } = program.detail;
  if (cost.type === "FREE") return "FREE";
  if (cost.type === "INDIVIDUAL_PURCHASE") {
    return cost.estimatedPrice === null
      ? "INDIVIDUAL PURCHASE"
      : `INDIVIDUAL PURCHASE · ${formatMoney(cost.estimatedPrice)}`;
  }
  return formatMoney(cost.participationFee);
}

export function toInputDate(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function getMonthRange(month: string): { from: string; to: string } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const from = new Date(Date.UTC(year, monthIndex, 1, -9));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1, -9));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function shiftMonth(month: string, amount: number): string {
  const [yearText, monthText] = month.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date());
}
