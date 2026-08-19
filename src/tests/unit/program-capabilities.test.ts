import { describe, expect, it } from "vitest";

import { getProgramCapabilities } from "@/features/programs/domain";
import type {
  Participation,
  Program,
  ProgramApproval,
  ProgramRecord,
  User,
} from "@/types";

const now = "2026-08-08T12:00:00+09:00";

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
    createdAt: now,
  };
}

const gathering = {
  id: "program-capabilities",
  code: "OA / G101",
  type: "GATHERING",
  title: "Capability test",
  description: "Program domain rules",
  hostId: "member-host",
  startAt: "2026-08-22T14:00:00+09:00",
  endAt: "2026-08-22T17:00:00+09:00",
  location: "리움미술관",
  mapUrl: null,
  capacity: 8,
  status: "OPEN",
  coverImageId: null,
  createdAt: now,
  updatedAt: now,
  detail: {
    programId: "program-capabilities",
    category: "WORKSHOP",
    meetingPoint: "1층 로비",
    recruitmentDeadline: null,
    waitlistEnabled: true,
    cost: { type: "FREE" },
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
    joinedAt: now,
  };
}

function approval(
  status: ProgramApproval["status"] = "APPROVED",
): ProgramApproval {
  return {
    id: "approval-capabilities",
    programId: gathering.id,
    requesterId: "member-host",
    reviewerId: status === "APPROVED" ? "member-admin" : null,
    status,
    requestedAt: now,
    reviewedAt: status === "APPROVED" ? now : null,
    reviewComment: null,
  };
}

function capabilities(options: {
  currentUser: User | null;
  program?: Program;
  participation?: Participation | null;
  approval?: ProgramApproval | null;
  record?: ProgramRecord | null;
}) {
  return getProgramCapabilities({
    user: options.currentUser,
    program: options.program ?? gathering,
    participation: options.participation ?? null,
    approval: options.approval === undefined ? approval() : options.approval,
    record: options.record ?? null,
    participantCounts: { confirmed: 6 },
    now,
  });
}

describe("ProgramCapabilities", () => {
  it("denies TALK to a normal Member and a Waitlist participant", () => {
    const normal = user("member-normal");
    const waitlist = user("member-waitlist");

    expect(capabilities({ currentUser: normal }).canAccessTalk).toBe(false);
    expect(
      capabilities({
        currentUser: waitlist,
        participation: participation(waitlist.id, "WAITLIST"),
      }).canAccessTalk,
    ).toBe(false);
  });

  it("allows a confirmed participant to read and write TALK", () => {
    const currentUser = user("member-confirmed");
    const result = capabilities({
      currentUser,
      participation: participation(currentUser.id, "CONFIRMED"),
    });

    expect(result.canAccessTalk).toBe(true);
    expect(result.canWriteChat).toBe(true);
    expect(result.canWriteQuestion).toBe(true);
    expect(result.canWriteNotice).toBe(false);
  });

  it("shows HOST_COLLECT instructions only to a confirmed participant or manager", () => {
    const hostCollect = {
      ...gathering,
      detail: {
        ...gathering.detail,
        cost: {
          type: "HOST_COLLECT",
          participationFee: 25_000,
          feeIncludes: null,
          paymentInfo: "OA BANK 000-000",
          paymentDeadline: null,
          cancellationPolicy: null,
        },
      },
    } as Program;
    const currentUser = user("member-confirmed");

    expect(
      capabilities({
        currentUser,
        program: hostCollect,
        participation: participation(currentUser.id, "CONFIRMED"),
      }).canViewPaymentInstructions,
    ).toBe(true);
    expect(
      capabilities({ currentUser: user("member-normal"), program: hostCollect })
        .canViewPaymentInstructions,
    ).toBe(false);
    expect(
      capabilities({ currentUser: user("member-host"), program: hostCollect })
        .canViewPaymentInstructions,
    ).toBe(true);
  });

  it("allows the Host to access TALK and write NOTICE", () => {
    const result = capabilities({ currentUser: user("member-host") });

    expect(result.canAccessTalk).toBe(true);
    expect(result.canWriteNotice).toBe(true);
  });

  it("keeps a cancelled participant's TALK readable but removes every write flag", () => {
    const currentUser = user("member-cancelled");
    const result = capabilities({
      currentUser,
      participation: participation(currentUser.id, "CANCELLED"),
    });

    expect(result.canAccessTalk).toBe(true);
    expect(result.canWriteChat).toBe(false);
    expect(result.canWriteQuestion).toBe(false);
    expect(result.canWriteNotice).toBe(false);
  });

  it("makes a cancelled Program TALK read-only for confirmed participants and Host", () => {
    const cancelledProgram = { ...gathering, status: "CANCELLED" } as Program;
    const confirmedUser = user("member-confirmed");
    const participantResult = capabilities({
      currentUser: confirmedUser,
      program: cancelledProgram,
      participation: participation(confirmedUser.id, "CONFIRMED"),
    });
    const hostResult = capabilities({
      currentUser: user("member-host"),
      program: cancelledProgram,
    });

    expect(participantResult.canAccessTalk).toBe(true);
    expect(participantResult.canWriteChat).toBe(false);
    expect(hostResult.canAccessTalk).toBe(true);
    expect(hostResult.canWriteNotice).toBe(false);
  });

  it("keeps completed Program TALK available with existing write permissions", () => {
    const completedProgram = { ...gathering, status: "COMPLETED" } as Program;
    const currentUser = user("member-confirmed");
    const result = capabilities({
      currentUser,
      program: completedProgram,
      participation: participation(currentUser.id, "CONFIRMED"),
    });

    expect(result.canAccessTalk).toBe(true);
    expect(result.canWriteChat).toBe(true);
    expect(result.canWriteQuestion).toBe(true);
  });

  it("does not let a stale Participation expose a Draft Program TALK", () => {
    const draftProgram = { ...gathering, status: "DRAFT" } as Program;
    const currentUser = user("member-stale");
    const result = capabilities({
      currentUser,
      program: draftProgram,
      participation: participation(currentUser.id, "CONFIRMED"),
      approval: approval("PENDING"),
    });

    expect(result.canView).toBe(false);
    expect(result.canAccessTalk).toBe(false);
    expect(result.canWriteChat).toBe(false);
  });

  it("allows only an Admin to review a pending approval", () => {
    const pendingApproval = approval("PENDING");

    const adminCapabilities = capabilities({
      currentUser: user("member-admin", "ADMIN"),
      approval: pendingApproval,
    });

    expect(adminCapabilities.canReviewApproval).toBe(true);
    expect(adminCapabilities.canJoin).toBe(false);
    expect(
      capabilities({ currentUser: user("member-host"), approval: pendingApproval })
        .canReviewApproval,
    ).toBe(false);
  });

  it("exposes published-program operation capabilities without raw UI status checks", () => {
    const host = user("member-host");
    const open = capabilities({ currentUser: host });
    const closed = capabilities({
      currentUser: host,
      program: { ...gathering, status: "CLOSED" } as Program,
    });
    const pending = capabilities({
      currentUser: host,
      approval: approval("PENDING"),
    });

    expect(open.canCloseRecruitment).toBe(true);
    expect(open.canCancelProgram).toBe(true);
    expect(closed.canCloseRecruitment).toBe(false);
    expect(closed.canCancelProgram).toBe(true);
    expect(pending.canCloseRecruitment).toBe(false);
    expect(pending.canCancelProgram).toBe(false);
  });

  it("keeps published Program INFO public while protecting Draft proposals", () => {
    expect(capabilities({ currentUser: null }).canView).toBe(true);
    expect(
      capabilities({
        currentUser: null,
        program: { ...gathering, status: "DRAFT" } as Program,
        approval: approval("PENDING"),
      }).canView,
    ).toBe(false);
  });

  it("allows a proposal owner to resubmit and denies another Member edit access", () => {
    const draftProgram = { ...gathering, status: "DRAFT" } as Program;
    const changesRequested = approval("CHANGES_REQUESTED");

    expect(
      capabilities({
        currentUser: user("member-host"),
        program: draftProgram,
        approval: changesRequested,
      }).canSubmitForApproval,
    ).toBe(true);
    expect(
      capabilities({
        currentUser: user("member-other"),
        program: draftProgram,
        approval: changesRequested,
      }).canEditProgram,
    ).toBe(false);
  });
});
