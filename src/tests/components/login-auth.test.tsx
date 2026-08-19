import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/(auth)/login/page";

const push = vi.fn();
const useAppState = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/app-state/app-state-provider", () => ({
  useAppState: () => useAppState(),
}));

const SEASON_ID = "11111111-1111-4111-8111-111111111111";

describe("LoginPage", () => {
  beforeEach(() => {
    push.mockReset();
    useAppState.mockReset();
  });

  it("retains the two mock identity controls", () => {
    useAppState.mockReturnValue({ mode: "mock", signInMock: vi.fn() });
    render(<LoginPage />);

    expect(screen.getByRole("button", { name: "CONTINUE AS MEMBER →" })).toBeVisible();
    expect(screen.getByRole("button", { name: "CONTINUE AS ADMIN →" })).toBeVisible();
  });

  it("focuses and describes the first invalid production signup field", async () => {
    const user = userEvent.setup();
    useAppState.mockReturnValue({
      mode: "supabase",
      listAuthSeasons: vi.fn().mockResolvedValue([
        { id: SEASON_ID, name: "3기", isCurrent: true },
      ]),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    });
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "JOIN" }));
    await screen.findByRole("checkbox", { name: /3기/ });
    await user.click(screen.getByRole("button", { name: "JOIN →" }));

    const name = screen.getByRole("textbox", { name: "이름" });
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("오류 · 이름을 입력해 주세요.")).toHaveAttribute("id", "name-error");
  });

  it("submits all selected seasons and keeps email-confirmation guidance on screen", async () => {
    const user = userEvent.setup();
    const signUp = vi.fn().mockResolvedValue({
      status: "EMAIL_CONFIRMATION_REQUIRED",
      userId: "new-user",
    });
    useAppState.mockReturnValue({
      mode: "supabase",
      listAuthSeasons: vi.fn().mockResolvedValue([
        { id: SEASON_ID, name: "3기", isCurrent: true },
      ]),
      signInWithPassword: vi.fn(),
      signUp,
    });
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "JOIN" }));
    await user.type(screen.getByRole("textbox", { name: "이름" }), "김유진");
    await user.type(screen.getByRole("textbox", { name: "이메일" }), "new@oa.test");
    await user.type(screen.getByLabelText("비밀번호"), "secret");
    await user.click(await screen.findByRole("checkbox", { name: /3기/ }));
    await user.click(screen.getByRole("button", { name: "JOIN →" }));

    expect(signUp).toHaveBeenCalledWith({
      name: "김유진",
      email: "new@oa.test",
      password: "secret",
      seasonIds: [SEASON_ID],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("이메일의 확인 링크");
    expect(push).not.toHaveBeenCalled();
  });

  it("routes an immediately signed-in registration to the pending approval state", async () => {
    const user = userEvent.setup();
    useAppState.mockReturnValue({
      mode: "supabase",
      listAuthSeasons: vi.fn().mockResolvedValue([
        { id: SEASON_ID, name: "3기", isCurrent: true },
      ]),
      signInWithPassword: vi.fn(),
      signUp: vi.fn().mockResolvedValue({
        status: "SIGNED_IN",
        userId: "new-user",
      }),
    });
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "JOIN" }));
    await user.type(screen.getByRole("textbox", { name: "이름" }), "김유진");
    await user.type(screen.getByRole("textbox", { name: "이메일" }), "new@oa.test");
    await user.type(screen.getByLabelText("비밀번호"), "secret");
    await user.click(await screen.findByRole("checkbox", { name: /3기/ }));
    await user.click(screen.getByRole("button", { name: "JOIN →" }));

    expect(push).toHaveBeenCalledWith("/my?registered=1");
  });
});
