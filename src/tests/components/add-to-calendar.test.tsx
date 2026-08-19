import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddToCalendar } from "@/features/programs/components/add-to-calendar";
import { createMockRepositoryState, MOCK_PROGRAM_IDS } from "@/lib/repositories";
import type { Program } from "@/types";

function program(): Program {
  const result = createMockRepositoryState().programs.find(
    (candidate) => candidate.id === MOCK_PROGRAM_IDS.exhibition,
  );
  if (!result) throw new Error("Missing Calendar fixture");
  return result;
}

const originalCreateObjectUrl = URL.createObjectURL;

afterEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: originalCreateObjectUrl,
    writable: true,
  });
});

describe("AddToCalendar", () => {
  it("shows a recoverable error when an ICS download cannot be created", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("브라우저가 파일 생성을 차단했습니다.");
      }),
      writable: true,
    });
    const user = userEvent.setup();

    render(<AddToCalendar program={program()} />);
    await user.click(screen.getByText("ADD TO CALENDAR", { exact: true }));
    await user.click(screen.getByRole("button", { name: /DOWNLOAD \.ICS/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("CALENDAR EXPORT FAILED");
    expect(screen.getByRole("alert")).toHaveTextContent("브라우저가 파일 생성을 차단했습니다.");
    expect(screen.getByRole("button", { name: /RETRY/i })).toBeVisible();
  });
});
