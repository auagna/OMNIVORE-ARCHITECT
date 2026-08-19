import Link from "next/link";

export default function NotFound() {
  return (
    <main className="oa-system-page">
      <p className="oa-kicker">404 / NOT FOUND</p>
      <h1>페이지를<br />찾을 수 없습니다.</h1>
      <Link className="oa-text-link" href="/">HOME →</Link>
    </main>
  );
}
