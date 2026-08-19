import { OAMiniLogo } from "@/components/oa-mini-logo";

export default function Loading() {
  return (
    <main className="oa-system-page" aria-live="polite" aria-busy="true">
      <OAMiniLogo className="h-3 w-6" />
      <p className="oa-kicker">OA / LOADING</p>
      <p>프로그램을 불러오는 중입니다.</p>
    </main>
  );
}
