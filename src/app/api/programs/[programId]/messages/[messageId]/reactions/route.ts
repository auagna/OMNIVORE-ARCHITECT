import { NextResponse, type NextRequest } from "next/server";
import { isMessageReactionEmoji } from "@/features/conversation/constants/message-reactions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

interface ToggleReactionBody {
  emoji?: unknown;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ programId: string; messageId: string }> },
) {
  let body: ToggleReactionBody;
  try {
    body = (await request.json()) as ToggleReactionBody;
  } catch {
    return errorResponse("요청 형식이 올바르지 않습니다.", 400);
  }
  if (!isMessageReactionEmoji(body.emoji)) {
    return errorResponse("허용되지 않은 반응입니다.", 422);
  }

  const { programId, messageId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return errorResponse("로그인이 필요합니다.", 401);
  }

  // RLS hides inaccessible messages; the path Program must also match so a
  // client cannot use a valid Message id under another Program URL.
  const message = await supabase
    .from("program_messages")
    .select("id, program_id, is_hidden")
    .eq("id", messageId)
    .eq("program_id", programId)
    .maybeSingle();
  if (message.error) {
    return errorResponse("메시지를 확인하지 못했습니다.", 500);
  }
  if (!message.data || message.data.is_hidden) {
    return errorResponse("메시지를 찾을 수 없습니다.", 404);
  }

  const toggled = await supabase.rpc("toggle_message_reaction", {
    p_message_id: messageId,
    p_emoji: body.emoji,
  });
  if (toggled.error) {
    const forbidden =
      toggled.error.code === "42501" || toggled.error.message.includes("FORBIDDEN");
    const invalid =
      toggled.error.code === "22023" ||
      toggled.error.message.includes("INVALID_REACTION_EMOJI");
    return errorResponse(
      forbidden
        ? "이 Program TALK에 반응을 남길 권한이 없습니다."
        : invalid
          ? "허용되지 않은 반응입니다."
          : "반응을 저장하지 못했습니다. 다시 시도해 주세요.",
      forbidden ? 403 : invalid ? 422 : 500,
    );
  }

  if (toggled.data.length === 0) {
    return NextResponse.json({ reaction: null });
  }

  const refreshed = await supabase.rpc("list_program_message_reactions", {
    p_program_id: programId,
    p_message_ids: [messageId],
  });
  if (refreshed.error) {
    return errorResponse("저장된 반응을 다시 확인하지 못했습니다.", 500);
  }
  const reaction = refreshed.data.find(
    (row) => row.user_id === auth.data.user.id,
  );
  if (!reaction) {
    return errorResponse("저장된 반응을 찾지 못했습니다.", 500);
  }
  return NextResponse.json({ reaction });
}
