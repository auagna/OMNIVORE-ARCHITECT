import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseOARepository } from "@/lib/supabase-repository";
import type { Database } from "@/types/database";

function createRealtimeClient() {
  let onInsert: (() => void) | null = null;
  const channel = {} as RealtimeChannel;
  const on = vi.fn(
    (
      _event: string,
      _filter: Record<string, string>,
      callback: () => void,
    ) => {
      onInsert = callback;
      return channel;
    },
  );
  const subscribe = vi.fn(() => channel);
  Object.assign(channel, { on, subscribe });

  const channelFactory = vi.fn(() => channel);
  const removeChannel = vi.fn(async () => "ok" as const);
  const client = {
    channel: channelFactory,
    removeChannel,
  } as unknown as SupabaseClient<Database>;

  return {
    client,
    channel,
    channelFactory,
    on,
    removeChannel,
    emitInsert: () => onInsert?.(),
  };
}

describe("Supabase Program TALK Realtime lifecycle", () => {
  it("uses one filtered INSERT channel and removes it after the final watcher", () => {
    const realtime = createRealtimeClient();
    const repository = new SupabaseOARepository(realtime.client);

    const stopFirst = repository.watchProgramMessages("program-g028");
    const stopSecond = repository.watchProgramMessages("program-g028");

    expect(realtime.channelFactory).toHaveBeenCalledTimes(1);
    expect(realtime.channelFactory).toHaveBeenCalledWith(
      "oa-program-talk:program-g028",
    );
    expect(realtime.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "program_messages",
        filter: "program_id=eq.program-g028",
      },
      expect.any(Function),
    );

    realtime.emitInsert();
    expect(repository.getSnapshot().revision).toBe(1);

    stopFirst();
    expect(realtime.removeChannel).not.toHaveBeenCalled();

    stopSecond();
    stopSecond();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
    expect(realtime.removeChannel).toHaveBeenCalledWith(realtime.channel);

    const stopAfterRemount = repository.watchProgramMessages("program-g028");
    expect(realtime.channelFactory).toHaveBeenCalledTimes(2);
    stopAfterRemount();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(2);
  });
});
