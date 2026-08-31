import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseOARepository } from "@/lib/supabase-repository";
import type { Database } from "@/types/database";

type RealtimeCallback = (payload?: unknown) => void;

interface MockChannel {
  channel: RealtimeChannel;
  handlers: Map<string, RealtimeCallback>;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

function handlerKey(event: string, filter: Record<string, string>): string {
  return `${event}:${filter.event}`;
}

function createRealtimeClient() {
  const channels: MockChannel[] = [];
  const setAuth = vi.fn(async () => undefined);
  const channelFactory = vi.fn(() => {
    const handlers = new Map<string, RealtimeCallback>();
    const channel = {} as RealtimeChannel;
    const on = vi.fn(
      (
        event: string,
        filter: Record<string, string>,
        callback: RealtimeCallback,
      ) => {
        handlers.set(handlerKey(event, filter), callback);
        return channel;
      },
    );
    const subscribe = vi.fn(() => channel);
    Object.assign(channel, { on, subscribe });
    channels.push({ channel, handlers, on, subscribe });
    return channel;
  });
  const removeChannel = vi.fn(async () => "ok" as const);
  const client = {
    channel: channelFactory,
    realtime: { setAuth },
    removeChannel,
  } as unknown as SupabaseClient<Database>;

  return {
    client,
    channels,
    channelFactory,
    removeChannel,
    setAuth,
    emit: (
      channelIndex: number,
      event: "postgres_changes" | "broadcast",
      change: "INSERT" | "UPDATE" | "DELETE",
      payload?: unknown,
    ) => channels[channelIndex]?.handlers.get(`${event}:${change}`)?.(payload),
  };
}

async function finishRealtimeSetup(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("Supabase Program TALK Realtime lifecycle", () => {
  it("authenticates a private channel and routes message and reaction changes", async () => {
    const realtime = createRealtimeClient();
    const repository = new SupabaseOARepository(realtime.client);
    const onReactionChange = vi.fn();

    const stop = repository.watchProgramMessages(
      "program-g028",
      onReactionChange,
    );
    await finishRealtimeSetup();

    expect(realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(realtime.channelFactory).toHaveBeenCalledWith(
      "oa-program-talk:program-g028",
      { config: { private: true } },
    );
    expect(realtime.channels[0]?.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "program_messages",
        filter: "program_id=eq.program-g028",
      },
      expect.any(Function),
    );
    for (const event of ["INSERT", "UPDATE", "DELETE"] as const) {
      expect(realtime.channels[0]?.on).toHaveBeenCalledWith(
        "broadcast",
        { event },
        expect.any(Function),
      );
    }
    expect(realtime.channels[0]?.subscribe).toHaveBeenCalledTimes(1);

    realtime.emit(0, "postgres_changes", "INSERT", {
      new: { id: "message-new" },
    });
    expect(repository.getSnapshot().revision).toBe(1);

    realtime.emit(0, "broadcast", "INSERT", {
      payload: { record: { message_id: "message-inserted" } },
    });
    realtime.emit(0, "broadcast", "UPDATE", {
      record: { message_id: "message-updated" },
    });
    realtime.emit(0, "broadcast", "DELETE", {
      payload: { old_record: { message_id: "message-deleted" } },
    });
    expect(onReactionChange.mock.calls).toEqual([
      ["message-inserted"],
      ["message-updated"],
      ["message-deleted"],
    ]);
    expect(repository.getSnapshot().revision).toBe(1);

    stop();
    expect(realtime.removeChannel).toHaveBeenCalledWith(
      realtime.channels[0]?.channel,
    );
  });

  it("reference-counts watchers, cleans listeners, and creates a fresh channel after remount", async () => {
    const realtime = createRealtimeClient();
    const repository = new SupabaseOARepository(realtime.client);
    const firstReactionListener = vi.fn();

    const stopFirst = repository.watchProgramMessages(
      "program-g028",
      firstReactionListener,
    );
    const stopSecond = repository.watchProgramMessages("program-g028");
    await finishRealtimeSetup();

    expect(realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(realtime.channelFactory).toHaveBeenCalledTimes(1);

    stopFirst();
    realtime.emit(0, "broadcast", "INSERT", {
      record: { message_id: "message-after-first-stop" },
    });
    expect(firstReactionListener).not.toHaveBeenCalled();
    expect(realtime.removeChannel).not.toHaveBeenCalled();

    stopSecond();
    stopSecond();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
    expect(realtime.removeChannel).toHaveBeenCalledWith(
      realtime.channels[0]?.channel,
    );

    const remountedReactionListener = vi.fn();
    const stopAfterRemount = repository.watchProgramMessages(
      "program-g028",
      remountedReactionListener,
    );
    await finishRealtimeSetup();

    expect(realtime.setAuth).toHaveBeenCalledTimes(2);
    expect(realtime.channelFactory).toHaveBeenCalledTimes(2);
    expect(realtime.channelFactory).toHaveBeenLastCalledWith(
      "oa-program-talk:program-g028",
      { config: { private: true } },
    );
    realtime.emit(1, "broadcast", "UPDATE", {
      payload: { record: { message_id: "message-after-remount" } },
    });
    expect(remountedReactionListener).toHaveBeenCalledWith(
      "message-after-remount",
    );

    stopAfterRemount();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(2);
    expect(realtime.removeChannel).toHaveBeenLastCalledWith(
      realtime.channels[1]?.channel,
    );
  });
});
