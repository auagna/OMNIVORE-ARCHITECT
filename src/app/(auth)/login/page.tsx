"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAppState } from "@/features/app-state/app-state-provider";
import type { AuthSeasonOption, MockAuthIdentity } from "@/lib/auth";

type AuthView = "LOGIN" | "SIGN_UP";
type FieldName = "name" | "email" | "password" | "seasons";
type FieldErrors = Partial<Record<FieldName, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authErrorMessage(reason: unknown, view: AuthView): string {
  const message = reason instanceof Error ? reason.message.toLowerCase() : "";
  if (message.includes("invalid login credentials")) return "이메일 또는 비밀번호를 확인해 주세요.";
  if (message.includes("email not confirmed")) return "이메일 확인을 마친 뒤 로그인해 주세요.";
  if (message.includes("already registered")) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (message.includes("season")) return "기수 정보가 유효하지 않습니다. 새로고침 후 다시 선택해 주세요.";
  if (message.includes("rate limit")) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  return view === "LOGIN"
    ? "로그인을 완료하지 못했습니다. 입력 내용을 확인해 주세요."
    : "가입을 완료하지 못했습니다. 입력 내용을 확인해 주세요.";
}

function MockLogin() {
  const router = useRouter();
  const { signInMock } = useAppState();
  const [pendingIdentity, setPendingIdentity] = useState<MockAuthIdentity | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  async function login(identity: MockAuthIdentity) {
    if (pendingIdentity) return;
    setPendingIdentity(identity);
    setLoginError(null);
    try {
      await signInMock(identity);
      router.push(identity === "ADMIN" ? "/admin" : "/");
    } catch (reason) {
      setLoginError(reason instanceof Error ? reason.message : "로그인 상태를 전환하지 못했습니다.");
      setPendingIdentity(null);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[760px] content-center px-5 py-16">
      <p className="mb-5 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)]">OA / MOCK AUTH</p>
      <h1 className="m-0 max-w-[10ch] text-[clamp(3.2rem,13vw,6.5rem)] font-semibold leading-[0.88] tracking-[-0.055em]">
        OMNIVORE<br />ARCHITECT
      </h1>
      <p className="mb-8 mt-10 max-w-[34rem] leading-relaxed text-[var(--oa-secondary)]">
        개발 환경에서는 MEMBER와 ADMIN의 업무 흐름을 재현하는 mock session을 사용합니다.
      </p>
      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Mock identity">
        <button className="oa-pressable min-h-14 border border-[var(--oa-ink)] bg-[var(--oa-ink)] px-5 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-paper)] disabled:opacity-50" type="button" disabled={pendingIdentity !== null} onClick={() => void login("MEMBER")}>
          {pendingIdentity === "MEMBER" ? "CONTINUE / ENTERING…" : "CONTINUE AS MEMBER →"}
        </button>
        <button className="oa-pressable min-h-14 border border-[var(--oa-line)] bg-transparent px-5 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] disabled:opacity-50" type="button" disabled={pendingIdentity !== null} onClick={() => void login("ADMIN")}>
          {pendingIdentity === "ADMIN" ? "CONTINUE / ENTERING…" : "CONTINUE AS ADMIN →"}
        </button>
      </div>
      {loginError ? <p className="mt-4 text-sm leading-relaxed" role="alert">{loginError}</p> : null}
    </main>
  );
}

function ProductionAuth() {
  const router = useRouter();
  const { listAuthSeasons, signInWithPassword, signUp } = useAppState();
  const [view, setView] = useState<AuthView>("LOGIN");
  const [seasons, setSeasons] = useState<AuthSeasonOption[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const firstSeasonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void listAuthSeasons()
      .then((result) => {
        if (!alive) return;
        setSeasons(result);
        setSeasonsError(result.length === 0 ? "현재 선택할 수 있는 기수가 없습니다." : null);
      })
      .catch(() => {
        if (alive) setSeasonsError("기수 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      })
      .finally(() => {
        if (alive) setSeasonsLoading(false);
      });
    return () => { alive = false; };
  }, [listAuthSeasons]);

  function selectView(nextView: AuthView) {
    if (pending || nextView === view) return;
    setView(nextView);
    setErrors({});
    setFormError("");
    setStatusMessage("");
  }

  function clearError(field: FieldName) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function focusFirstError(nextErrors: FieldErrors) {
    if (nextErrors.name) nameRef.current?.focus();
    else if (nextErrors.email) emailRef.current?.focus();
    else if (nextErrors.password) passwordRef.current?.focus();
    else if (nextErrors.seasons) firstSeasonRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    const password = String(values.get("password") ?? "");
    const seasonIds = values.getAll("seasonIds").map(String);
    const nextErrors: FieldErrors = {};

    if (view === "SIGN_UP" && !name) nextErrors.name = "이름을 입력해 주세요.";
    if (!email) nextErrors.email = "이메일을 입력해 주세요.";
    else if (!EMAIL_PATTERN.test(email)) nextErrors.email = "올바른 이메일 형식으로 입력해 주세요.";
    if (!password) nextErrors.password = "비밀번호를 입력해 주세요.";
    if (view === "SIGN_UP" && seasonIds.length === 0) nextErrors.seasons = seasonsError ?? "참여 기수를 하나 이상 선택해 주세요.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError("");
      setStatusMessage("");
      focusFirstError(nextErrors);
      return;
    }

    setPending(true);
    setErrors({});
    setFormError("");
    setStatusMessage(view === "LOGIN" ? "로그인하고 있습니다." : "가입 정보를 제출하고 있습니다.");
    try {
      if (view === "LOGIN") {
        await signInWithPassword({ email, password });
        setStatusMessage("로그인했습니다. 홈으로 이동합니다.");
        router.push("/");
        return;
      }
      const result = await signUp({ name, email, password, seasonIds });
      if (result.status === "EMAIL_CONFIRMATION_REQUIRED") {
        setStatusMessage("가입 신청을 받았습니다. 이메일의 확인 링크를 연 뒤 로그인해 주세요.");
        form.reset();
        setPending(false);
        return;
      }
      setStatusMessage("가입 신청을 완료했습니다. 승인 대기 상태로 이동합니다.");
      router.push("/my?registered=1");
    } catch (reason) {
      setStatusMessage("");
      setFormError(authErrorMessage(reason, view));
      setPending(false);
    }
  }

  const inputClass = "min-h-14 w-full border border-[var(--oa-line)] bg-[var(--oa-surface)] px-4 text-base placeholder:text-[var(--oa-muted)]";
  const errorClass = "mt-2 text-sm leading-relaxed";

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[760px] content-center px-5 py-12 sm:py-16">
      <p className="mb-5 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)]">OA / AUTH</p>
      <h1 className="m-0 max-w-[10ch] text-[clamp(3rem,12vw,6.25rem)] font-semibold leading-[0.88] tracking-[-0.05em]">OMNIVORE<br />ARCHITECT</h1>
      <div className="mt-10 grid grid-cols-2 border-y border-[var(--oa-line)]" role="group" aria-label="인증 방식">
        <button type="button" className="min-h-12 border-r border-[var(--oa-line)] px-4 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] disabled:opacity-50" aria-pressed={view === "LOGIN"} disabled={pending} onClick={() => selectView("LOGIN")}>LOGIN</button>
        <button type="button" className="min-h-12 px-4 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] disabled:opacity-50" aria-pressed={view === "SIGN_UP"} disabled={pending} onClick={() => selectView("SIGN_UP")}>JOIN</button>
      </div>

      <form className="mt-8 grid gap-6" noValidate onSubmit={(event) => void submit(event)}>
        <p id="required-note" className="m-0 text-sm leading-relaxed text-[var(--oa-secondary)]">모든 항목은 필수입니다.</p>
        {view === "SIGN_UP" ? (
          <div>
            <label className="mb-2 block text-sm font-bold" htmlFor="auth-name">이름</label>
            <input ref={nameRef} className={inputClass} id="auth-name" name="name" type="text" autoComplete="name" maxLength={100} required aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "name-error" : "required-note"} onChange={() => clearError("name")} />
            {errors.name ? <p className={errorClass} id="name-error">오류 · {errors.name}</p> : null}
          </div>
        ) : null}
        <div>
          <label className="mb-2 block text-sm font-bold" htmlFor="auth-email">이메일</label>
          <input ref={emailRef} className={inputClass} id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} required aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? "email-error" : "required-note"} onChange={() => clearError("email")} />
          {errors.email ? <p className={errorClass} id="email-error">오류 · {errors.email}</p> : null}
        </div>
        <div>
          <label className="mb-2 block text-sm font-bold" htmlFor="auth-password">비밀번호</label>
          <input ref={passwordRef} className={inputClass} id="auth-password" name="password" type="password" autoComplete={view === "LOGIN" ? "current-password" : "new-password"} required aria-invalid={errors.password ? true : undefined} aria-describedby={errors.password ? "password-error" : "required-note"} onChange={() => clearError("password")} />
          {errors.password ? <p className={errorClass} id="password-error">오류 · {errors.password}</p> : null}
        </div>
        {view === "SIGN_UP" ? (
          <fieldset className="m-0 border-0 p-0" aria-describedby={errors.seasons ? "season-error" : "season-help"}>
            <legend className="mb-2 text-sm font-bold">참여 기수</legend>
            <p id="season-help" className="mb-3 mt-0 text-sm leading-relaxed text-[var(--oa-secondary)]">참여한 기수를 모두 선택해 주세요.</p>
            <div className="border-y border-[var(--oa-line)]">
              {seasonsLoading ? <p className="my-0 min-h-12 py-3 text-sm text-[var(--oa-secondary)]">기수를 불러오고 있습니다.</p> : null}
              {!seasonsLoading && seasonsError ? <p className="my-0 min-h-12 py-3 text-sm leading-relaxed">{seasonsError}</p> : null}
              {seasons.map((season, index) => (
                <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-[var(--oa-line)] py-2 last:border-b-0" key={season.id}>
                  <input ref={index === 0 ? firstSeasonRef : undefined} className="h-5 w-5 shrink-0 accent-[var(--oa-ink)]" name="seasonIds" type="checkbox" value={season.id} aria-invalid={errors.seasons ? true : undefined} aria-describedby={errors.seasons ? "season-error" : "season-help"} onChange={() => clearError("seasons")} />
                  <span className="text-sm font-bold">{season.name}{season.isCurrent ? " / CURRENT" : ""}</span>
                </label>
              ))}
            </div>
            {errors.seasons ? <p className={errorClass} id="season-error">오류 · {errors.seasons}</p> : null}
          </fieldset>
        ) : null}
        <button className="oa-pressable min-h-14 border border-[var(--oa-ink)] bg-[var(--oa-ink)] px-5 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-paper)] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={pending} aria-busy={pending}>
          {view === "LOGIN" ? pending ? "LOGIN / PROCESSING…" : "LOGIN →" : pending ? "JOIN / PROCESSING…" : "JOIN →"}
        </button>
        <p className="m-0 min-h-6 text-sm leading-relaxed" role="status" aria-live="polite">{statusMessage}</p>
        {formError ? <p className="m-0 text-sm leading-relaxed" role="alert">오류 · {formError}</p> : null}
      </form>
    </main>
  );
}

export default function LoginPage() {
  const { mode } = useAppState();
  return mode === "mock" ? <MockLogin /> : <ProductionAuth />;
}
