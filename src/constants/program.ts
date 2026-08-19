export const PROGRAM_TYPES = ["TALK", "READING", "GATHERING"] as const;

export const GATHERING_CATEGORIES = [
  "CASUAL",
  "WORKSHOP",
  "FIELD_TRIP",
  "EXHIBITION",
  "STUDY",
  "DINING",
  "OTHER",
] as const;

export const PROGRAM_STATUSES = [
  "DRAFT",
  "OPEN",
  "CLOSED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const APPROVAL_STATUSES = [
  "NOT_REQUIRED",
  "DRAFT",
  "PENDING",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
] as const;

export const DERIVED_PROGRAM_STATUSES = [
  "HAPPENING",
  "RECORD_REQUIRED",
  "FULL",
  "RECRUITING",
] as const;

export const PARTICIPATION_STATUSES = [
  "APPLIED",
  "CONFIRMED",
  "WAITLIST",
  "CANCELLED",
] as const;

export const PAYMENT_STATUSES = [
  "NOT_REQUIRED",
  "PENDING",
  "PAID",
] as const;

export const GATHERING_COST_TYPES = [
  "FREE",
  "INDIVIDUAL_PURCHASE",
  "HOST_COLLECT",
] as const;

export const USER_STATUSES = ["PENDING", "MEMBER", "ADMIN"] as const;
export const MESSAGE_TYPES = ["NOTICE", "QUESTION", "CHAT"] as const;
export const TALK_ORIGINS = ["OMNIVORE", "EXTERNAL"] as const;
export const TALK_REGISTRATION_TYPES = ["NONE", "EXTERNAL", "OMNIVORE"] as const;
export const MEDIA_TONE_PRESETS = [
  "OA_NEUTRAL",
  "MONOCHROME",
  "ORIGINAL",
] as const;
export const PROGRAM_TABS = ["INFO", "TALK", "PEOPLE", "RECORD"] as const;
export const CALENDAR_SCOPES = ["ALL", "MINE"] as const;
export const PAGE_CONTENT_KEYS = [
  "home",
  "programs",
  "talk",
  "reading",
  "gathering",
  "members",
  "about",
] as const;

export const PROGRAM_TYPE_LABELS = {
  TALK: "TALK",
  READING: "READING",
  GATHERING: "GATHERING",
} as const;

export const GATHERING_CATEGORY_LABELS = {
  CASUAL: "CASUAL",
  WORKSHOP: "WORKSHOP",
  FIELD_TRIP: "FIELD TRIP",
  EXHIBITION: "EXHIBITION",
  STUDY: "STUDY",
  DINING: "DINING",
  OTHER: "OTHER",
} as const;
