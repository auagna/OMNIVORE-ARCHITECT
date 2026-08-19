import { describe, expect, it } from "vitest";

import {
  canAccessProgramTalk,
  canWriteProgramMessage,
} from "@/lib/permissions";
import type { Participation, Program, User } from "@/types";

function user(id: string, status: User["status"] = "MEMBER"): User {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    imageUrl: null,
    occupation: null,
    bio: null,
    interests: [],
    status,
    createdAt: "2026-01-01T00:00:00+09:00",
  };
}

const gathering = {
  id: "program-g028",
  code: "OA / G028",
  type: "GATHERING",
  title: "리움 전시 같이 보기",
  description: "리움미술관 전시를 함께 봅니다.",
  hostId: "member-host",
  startAt: "2026-08-22T14:00:00+09:00",
  endAt: "2026-08-22T17:00:00+09:00",
  location: "리움미술관",
  mapUrl: null,
  capacity: 8,
  status: "OPEN",
  coverImageId: null,
  createdAt: "2026-08-01T10:00:00+09:00",
  updatedAt: "2026-08-01T10:00:00+09:00",
  detail: {
    programId: "program-g028",
    category: "EXHIBITION",
    meetingPoint: "1층 로비",
    recruitmentDeadline: null,
    waitlistEnabled: true,
    cost: {
      type: "INDIVIDUAL_PURCHASE",
      estimatedPrice: 18_000,
      purchaseUrl: null,
      purchaseNote: null,
    },
    bringItems: null,
    notice: null,
  },
} as Program;

function participation(
  userId: string,
  status: Participation["status"],
): Participation {
  return {
    id: `participation-${userId}`,
    programId: gathering.id,
    userId,
    status,
    paymentStatus: "NOT_REQUIRED",
    joinedAt: "2026-08-08T12:00:00+09:00",
  };
}

describe("Program TALK authorization", () => {
  it("denies a normal Member who has not joined", () => {
    expect(
      canAccessProgramTalk({
        user: user("member-normal"),
        program: gathering,
        participation: null,
      }),
    ).toBe(false);
  });

  it.each(["APPLIED", "WAITLIST"] as const)(
    "denies a %s participant",
    (status) => {
      const currentUser = user(`member-${status.toLowerCase()}`);

      expect(
        canAccessProgramTalk({
          user: currentUser,
          program: gathering,
          participation: participation(currentUser.id, status),
        }),
      ).toBe(false);
    },
  );

  it("keeps TALK readable but read-only after participation is cancelled", () => {
    const currentUser = user("member-cancelled");
    const context = {
      user: currentUser,
      program: gathering,
      participation: participation(currentUser.id, "CANCELLED"),
    };

    expect(canAccessProgramTalk(context)).toBe(true);
    expect(canWriteProgramMessage(context, "CHAT")).toBe(false);
    expect(canWriteProgramMessage(context, "QUESTION")).toBe(false);
  });

  it("allows a confirmed participant to read and write CHAT or QUESTION", () => {
    const currentUser = user("member-confirmed");
    const context = {
      user: currentUser,
      program: gathering,
      participation: participation(currentUser.id, "CONFIRMED"),
    };

    expect(canAccessProgramTalk(context)).toBe(true);
    expect(canWriteProgramMessage(context, "CHAT")).toBe(true);
    expect(canWriteProgramMessage(context, "QUESTION")).toBe(true);
  });

  it("allows the Host to access TALK and write NOTICE without a Participation", () => {
    const context = {
      user: user("member-host"),
      program: gathering,
      participation: null,
    };

    expect(canAccessProgramTalk(context)).toBe(true);
    expect(canWriteProgramMessage(context, "NOTICE")).toBe(true);
  });

  it("does not allow a normal confirmed participant to write NOTICE", () => {
    const currentUser = user("member-confirmed");
    const context = {
      user: currentUser,
      program: gathering,
      participation: participation(currentUser.id, "CONFIRMED"),
    };

    expect(canWriteProgramMessage(context, "NOTICE")).toBe(false);
  });

  it("allows an Admin to access every Program TALK and write NOTICE", () => {
    const context = {
      user: user("member-admin", "ADMIN"),
      program: gathering,
      participation: null,
    };

    expect(canAccessProgramTalk(context)).toBe(true);
    expect(canWriteProgramMessage(context, "NOTICE")).toBe(true);
  });

  it("denies a pending user even if a stale confirmed Participation exists", () => {
    const currentUser = user("member-pending", "PENDING");
    const context = {
      user: currentUser,
      program: gathering,
      participation: participation(currentUser.id, "CONFIRMED"),
    };

    expect(canAccessProgramTalk(context)).toBe(false);
    expect(canWriteProgramMessage(context, "CHAT")).toBe(false);
  });
});
