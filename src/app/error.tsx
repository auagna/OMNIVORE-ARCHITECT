"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="oa-system-page">
      <p className="oa-kicker">ERROR</p>
      <h1>잠시 문제가<br />발생했습니다.</h1>
      <p>요청을 완료하지 못했습니다. 입력 내용은 유지한 채 다시 시도할 수 있습니다.</p>
      <button className="oa-text-link" type="button" onClick={reset}>다시 시도 →</button>
    </main>
  );
}
