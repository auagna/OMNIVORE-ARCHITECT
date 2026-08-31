import type { ProgramCapabilities } from "@/features/programs/domain";
import type { ProgramMessage } from "@/types";

/** Hard-deleted messages no longer exist; soft-hidden messages stay immutable. */
export function canReactToProgramMessage(
  capabilities: Pick<ProgramCapabilities, "canReactToMessage">,
  message: ProgramMessage,
): boolean {
  return (
    capabilities.canReactToMessage &&
    !message.isHidden &&
    message.content.trim().length > 0
  );
}
