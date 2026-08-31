import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { RepositoryError } from "@/lib/repositories/contracts";
import { SupabaseOARepository } from "@/lib/supabase-repository";
import type {
  AdminMemberRegistrationRow,
  Database,
  ProgramMessageRow,
  ProgramRow,
  ReadingDetailRow,
  RecordMaterialRow,
  RecordRow,
} from "@/types/database";

const hostId = "00000000-0000-4000-8000-000000000001";
const memberId = "00000000-0000-4000-8000-000000000002";
const programId = "00000000-0000-4000-8000-000000000003";
const createdAt = "2026-08-20T00:00:00.000Z";

const draftProgram: ProgramRow = {
  id: programId,
  code: "R031",
  type: "READING",
  title: "건축 없는 건축",
  description: "읽고 이야기합니다.",
  host_id: hostId,
  start_at: "2026-09-01T10:00:00.000Z",
  end_at: null,
  location: "OA ROOM",
  map_url: null,
  capacity: 10,
  status: "DRAFT",
  cover_image_id: null,
  created_at: createdAt,
  updated_at: createdAt,
};

const readingDetail: ReadingDetailRow = {
  program_id: programId,
  detail_type: "READING",
  resource_title: "Architecture Without Architecture",
};

const pendingMember: AdminMemberRegistrationRow = {
  id: memberId,
  name: "김OA",
  email: "member@example.com",
  image_media_id: null,
  occupation: "Architect",
  bio: null,
  interests: ["READING"],
  status: "PENDING",
  created_at: createdAt,
  updated_at: createdAt,
  participating_seasons: ["3기"],
};

const message: ProgramMessageRow = {
  id: "message-1",
  program_id: programId,
  author_id: hostId,
  type: "NOTICE",
  content: "장소를 확인해 주세요.",
  parent_id: null,
  is_pinned: true,
  is_hidden: false,
  created_at: createdAt,
  edited_at: null,
};

const record: RecordRow = {
  id: "record-1",
  program_id: programId,
  author_id: hostId,
  what: "함께 읽었다.",
  found: null,
  created_at: createdAt,
  updated_at: createdAt,
};

const material: RecordMaterialRow = {
  id: "material-1",
  record_id: record.id,
  type: "LINK",
  media_id: null,
  url: "https://example.com/record",
  label: null,
  position: 0,
  created_at: createdAt,
};

function createAdminClient(options: { isAdmin?: boolean } = {}) {
  const rows: Record<string, readonly unknown[]> = {
    programs: [draftProgram],
    gathering_details: [],
    talk_details: [],
    reading_details: [readingDetail],
    gathering_payment_instructions: [],
    users: [
      {
        id: hostId,
        name: "최OA",
        image_media_id: null,
        occupation: "Architect",
        bio: null,
        interests: ["READING"],
      },
    ],
    participations: [],
    program_messages: [message],
    records: [record],
    record_materials: [material],
  };

  const from = vi.fn((table: string) => {
    const result = () => ({ data: [...(rows[table] ?? [])], error: null });
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      in: () => builder,
      order: () => Promise.resolve(result()),
      then: (
        onFulfilled: (value: ReturnType<typeof result>) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result()).then(onFulfilled, onRejected),
    });
    return builder;
  });

  const rpc = vi.fn(
    async (name: string): Promise<{ data: unknown; error: null }> => {
      if (name === "is_oa_admin") {
        return { data: options.isAdmin ?? true, error: null };
      }
      if (name === "list_admin_member_registrations") {
        return { data: [pendingMember], error: null };
      }
      if (name === "approve_pending_member") {
        return {
          data: [{ ...pendingMember, status: "MEMBER" }],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  );

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: hostId } },
        error: null,
      }),
    },
    from,
    rpc,
  } as unknown as SupabaseClient<Database>;

  return { client, from, rpc };
}

describe("Supabase Admin repository", () => {
  it("returns DRAFT Programs from a batched Admin model without public N+1 RPCs", async () => {
    const mock = createAdminClient();
    const repository = new SupabaseOARepository(mock.client);

    const programs = await repository.listAdminPrograms(hostId, createdAt);

    expect(programs).toHaveLength(1);
    expect(programs[0]?.program.status).toBe("DRAFT");
    expect(programs[0]?.host?.name).toBe("최OA");
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["is_oa_admin"]);
    expect(mock.from.mock.calls.filter(([table]) => table === "users")).toHaveLength(1);
    expect(
      mock.from.mock.calls.filter(([table]) => table === "participations"),
    ).toHaveLength(1);
  });

  it("reads all Admin conversation and Record rows after an explicit Admin check", async () => {
    const mock = createAdminClient();
    const repository = new SupabaseOARepository(mock.client);

    await expect(repository.listAdminMessages(hostId)).resolves.toMatchObject([
      { id: message.id, programId },
    ]);
    await expect(repository.listAdminRecords(hostId)).resolves.toMatchObject([
      { id: record.id, linkUrl: material.url },
    ]);
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual([
      "is_oa_admin",
      "is_oa_admin",
    ]);
  });

  it("maps registration RPCs and invalidates after an atomic approval", async () => {
    const mock = createAdminClient();
    const repository = new SupabaseOARepository(mock.client);

    await expect(repository.listAdminMemberRegistrations(hostId)).resolves.toEqual([
      {
        user: expect.objectContaining({ id: memberId, status: "PENDING" }),
        participatingSeasons: ["3기"],
      },
    ]);
    await expect(
      repository.approvePendingMember(memberId, hostId, createdAt),
    ).resolves.toMatchObject({
      user: { id: memberId, status: "MEMBER" },
      participatingSeasons: ["3기"],
    });
    expect(repository.getSnapshot().revision).toBe(1);
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual([
      "is_oa_admin",
      "list_admin_member_registrations",
      "is_oa_admin",
      "approve_pending_member",
    ]);
  });

  it("fails closed before an Admin data operation when the role check is false", async () => {
    const mock = createAdminClient({ isAdmin: false });
    const repository = new SupabaseOARepository(mock.client);

    await expect(repository.listAdminMessages(hostId)).rejects.toBeInstanceOf(
      RepositoryError,
    );
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["is_oa_admin"]);
  });
});
