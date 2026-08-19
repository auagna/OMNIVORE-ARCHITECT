import { GatheringCreateForm } from "@/features/gathering/components";

export const metadata = { title: "Propose Gathering" };

export default function ProposeGatheringPage() {
  return (
    <main className="oa-page oa-page--narrow">
      <header className="oa-page-head oa-page-head--compact">
        <p className="oa-overline">OA / PROPOSE GATHERING</p>
        <h1 className="oa-page-title">PROPOSE A<br />GATHERING</h1>
      </header>
      <GatheringCreateForm />
    </main>
  );
}
