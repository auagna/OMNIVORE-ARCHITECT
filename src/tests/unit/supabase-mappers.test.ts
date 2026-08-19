import { describe, expect, it } from "vitest";

import {
  DatabaseMappingError,
  mapHostParticipantReadRow,
  mapPageContentRow,
  mapProgramRecordSnapshot,
  mapProgramRow,
} from "@/lib/supabase-mappers";
import type {
  GatheringDetailRow,
  HostParticipantReadRow,
  ProgramRow,
  RecordMaterialRow,
  RecordRow,
} from "@/types/database";

const programRow: ProgramRow = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "G028",
  type: "GATHERING",
  title: "리움 전시 같이 보기",
  description: "전시를 함께 봅니다.",
  host_id: "00000000-0000-4000-8000-000000000002",
  start_at: "2026-08-22T05:00:00.000Z",
  end_at: "2026-08-22T08:00:00.000Z",
  location: "리움미술관",
  map_url: null,
  capacity: 8,
  status: "OPEN",
  cover_image_id: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const gatheringDetail: GatheringDetailRow = {
  program_id: programRow.id,
  detail_type: "GATHERING",
  category: "WORKSHOP",
  meeting_point: "1층 로비",
  recruitment_deadline: null,
  waitlist_enabled: true,
  cost_type: "HOST_COLLECT",
  estimated_price: null,
  purchase_url: null,
  purchase_note: null,
  participation_fee: 25000,
  fee_includes: null,
  payment_deadline: null,
  cancellation_policy: null,
  bring_items: null,
  notice: null,
};

describe("Supabase row mappers", () => {
  it("keeps restricted payment instructions out of a public Program read", () => {
    const program = mapProgramRow(programRow, {
      kind: "GATHERING",
      detail: gatheringDetail,
    });

    expect(program.type).toBe("GATHERING");
    if (program.type !== "GATHERING" || program.detail.cost.type !== "HOST_COLLECT") {
      throw new Error("Expected HOST_COLLECT Gathering");
    }
    expect(program.detail.cost.paymentInfo).toBeNull();
  });

  it("maps authorized payment instructions and rejects a cross-Program row", () => {
    const program = mapProgramRow(programRow, {
      kind: "GATHERING",
      detail: gatheringDetail,
      paymentInstruction: {
        program_id: programRow.id,
        payment_info: "AUTHORIZED INSTRUCTION",
        updated_at: programRow.updated_at,
      },
    });
    if (program.type !== "GATHERING" || program.detail.cost.type !== "HOST_COLLECT") {
      throw new Error("Expected HOST_COLLECT Gathering");
    }
    expect(program.detail.cost.paymentInfo).toBe("AUTHORIZED INSTRUCTION");

    expect(() =>
      mapProgramRow(programRow, {
        kind: "GATHERING",
        detail: gatheringDetail,
        paymentInstruction: {
          program_id: "00000000-0000-4000-8000-000000000099",
          payment_info: "WRONG PROGRAM",
          updated_at: programRow.updated_at,
        },
      }),
    ).toThrow(DatabaseMappingError);
  });

  it("derives legacy Record fields from ordered canonical materials", () => {
    const record: RecordRow = {
      id: "record-1",
      program_id: programRow.id,
      author_id: programRow.host_id,
      what: "전시를 함께 봤다.",
      found: "공간의 속도를 발견했다.",
      created_at: programRow.created_at,
      updated_at: programRow.updated_at,
    };
    const materials: RecordMaterialRow[] = [
      {
        id: "link-1",
        record_id: record.id,
        type: "LINK",
        media_id: null,
        url: "https://example.com/record",
        label: null,
        position: 2,
        created_at: record.created_at,
      },
      {
        id: "photo-1",
        record_id: record.id,
        type: "PHOTO",
        media_id: "media-1",
        url: null,
        label: null,
        position: 1,
        created_at: record.created_at,
      },
    ];

    const snapshot = mapProgramRecordSnapshot(record, materials);
    expect(snapshot.record.summary).toBe(record.what);
    expect(snapshot.record.photoMediaId).toBe("media-1");
    expect(snapshot.record.linkUrl).toBe("https://example.com/record");
    expect(snapshot.materials.map((material) => material.id)).toEqual([
      "photo-1",
      "link-1",
    ]);
  });

  it("rejects an unknown PageContent key at the runtime boundary", () => {
    expect(() =>
      mapPageContentRow({
        id: "page-1",
        key: "UNKNOWN",
        title: "Unknown",
        headline: "Unknown",
        description: "Unknown",
        empty_state: "Unknown",
        updated_at: programRow.updated_at,
        updated_by: null,
      }),
    ).toThrow(DatabaseMappingError);
  });

  it("maps Host operations without rebuilding a private User profile", () => {
    const row: HostParticipantReadRow = {
      participation_id: "participation-1",
      participation_status: "CONFIRMED",
      payment_status: "PENDING",
      joined_at: programRow.created_at,
      id: "member-1",
      name: "김OA",
      image_media_id: null,
      occupation: "Architect",
      bio: null,
      interests: ["EXHIBITION"],
    };

    const result = mapHostParticipantReadRow(row, programRow.id);
    expect(result.participation.programId).toBe(programRow.id);
    expect(result.participation.paymentStatus).toBe("PENDING");
    expect(result.user.name).toBe("김OA");
    expect("email" in result.user).toBe(false);
    expect("status" in result.user).toBe(false);
  });
});
