import { notFound } from "next/navigation";
import { EmptyState, ErrorState, LoadingState, LockedState } from "@/components/feedback";
import { OAMiniLogo } from "@/components/oa-mini-logo";
import { DERIVED_PROGRAM_STATUSES, PROGRAM_STATUSES } from "@/constants";
import { ProgramDetailHero } from "@/features/programs/components/program-detail-hero";
import { ProgramEditorialList } from "@/features/programs/views/program-editorial-link";
import { DesignLabControlSpecimens } from "@/features/design-lab/components/design-lab-control-specimens";
import { DesignLabConversation } from "@/features/design-lab/components/design-lab-conversation";
import { isDesignLabEnabled } from "@/features/design-lab/design-lab-access";
import { designLabProgramSnapshots } from "@/features/design-lab/fixtures";

const colorTokens = [
  ["BG", "--oa-bg"],
  ["SURFACE", "--oa-surface"],
  ["LINE", "--oa-line"],
  ["MUTED", "--oa-muted"],
  ["SECONDARY", "--oa-secondary"],
  ["TEXT", "--oa-text"],
] as const;

export default function DesignLabPage() {
  if (!isDesignLabEnabled(process.env.NODE_ENV)) notFound();

  return (
    <>
      <a className="oa-skip-link" href="#design-lab-content">SKIP TO CONTENT</a>
      <main className="oa-design-lab" id="design-lab-content">
        <header className="oa-design-lab-hero">
          <div className="oa-design-lab-identity">
            <OAMiniLogo aria-hidden="true" />
            <p>OA / INTERNAL</p>
          </div>
          <p className="oa-overline">DESIGN LAB / DEVELOPMENT ONLY</p>
          <h1>실제 화면의<br />기준을 한곳에서.</h1>
          <p className="oa-design-lab-intro">
            운영 화면과 같은 토큰과 컴포넌트를 사용합니다. 브라우저 viewport를
            375, 390, 430px 또는 desktop으로 바꿔 실제 반응형 결과를 확인하세요.
          </p>
          <dl className="oa-design-lab-facts">
            <div><dt>THEME</dt><dd>INK / DARK</dd></div>
            <div><dt>GUTTER</dt><dd>20 → 36 → 48</dd></div>
            <div><dt>RHYTHM</dt><dd>12 / 20 / 48 / 56 / 64</dd></div>
          </dl>
        </header>

        <nav className="oa-design-lab-index" aria-label="Design Lab sections">
          <a href="#foundation">FOUNDATION</a>
          <a href="#program">PROGRAM</a>
          <a href="#talk">TALK</a>
          <a href="#states">STATES</a>
          <a href="#stress">STRESS</a>
        </nav>

        <section className="oa-design-lab-section" id="foundation" aria-labelledby="foundation-title">
          <div className="oa-section-heading">
            <h2 id="foundation-title">01 / FOUNDATION</h2>
            <span className="oa-label">PRODUCTION TOKENS</span>
          </div>

          <div className="oa-design-lab-block">
            <p className="oa-overline">TYPOGRAPHY / MIXED SCRIPT</p>
            <div className="oa-design-lab-type-scale">
              <div><span>DISPLAY</span><p className="oa-page-title">OMNIVORE<br />ARCHITECT</p></div>
              <div><span>DETAIL</span><p className="oa-page-title oa-page-title--detail">건축 이후의 AI와 인간</p></div>
              <div><span>TITLE</span><p className="oa-item-title">리움 전시 같이 보기</p></div>
              <div><span>BODY</span><p className="oa-design-lab-body">Program의 일정, 참여, 운영 대화와 기록이 자연스럽게 이어지는 읽기 폭을 확인합니다.</p></div>
              <div><span>LABEL / META</span><p className="oa-label">GATHERING / WORKSHOP · 22 AUG 2026</p></div>
            </div>
          </div>

          <div className="oa-design-lab-block">
            <p className="oa-overline">COLOR / SEMANTIC TOKENS</p>
            <ul className="oa-design-lab-colors">
              {colorTokens.map(([label, token]) => (
                <li key={token}>
                  <span aria-hidden="true" style={{ background: `var(${token})` }} />
                  <code>{label}</code>
                  <code>{token}</code>
                </li>
              ))}
            </ul>
          </div>

          <div className="oa-design-lab-grid oa-design-lab-block">
            <div>
              <p className="oa-overline">BUTTONS / 44PX MINIMUM</p>
              <DesignLabControlSpecimens />
            </div>
            <div>
              <p className="oa-overline">FIELD / LABEL + HELP</p>
              <div className="oa-field">
                <label htmlFor="design-lab-title">TITLE</label>
                <input
                  id="design-lab-title"
                  defaultValue="리움 전시 같이 보기"
                  aria-describedby="design-lab-title-help"
                />
                <p className="oa-field-help" id="design-lab-title-help">실제 form spacing과 focus 상태를 확인합니다.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="oa-design-lab-section" id="program" aria-labelledby="program-title">
          <div className="oa-section-heading">
            <h2 id="program-title">02 / PROGRAM</h2>
            <span className="oa-label">PRODUCTION PATTERN</span>
          </div>

          <div className="oa-design-lab-block">
            <p className="oa-overline">EDITORIAL LIST / LIVE COMPONENT</p>
            <ProgramEditorialList programs={designLabProgramSnapshots} headingLevel="h3" />
          </div>

          <div className="oa-design-lab-block oa-design-lab-detail">
            <p className="oa-overline">DETAIL HERO / LIVE COMPONENT</p>
            <ProgramDetailHero
              snapshot={designLabProgramSnapshots[0]}
              participationStatus="CONFIRMED"
              headingLevel="h3"
            />
          </div>

          <div className="oa-design-lab-block">
            <p className="oa-overline">STATUS VOCABULARY</p>
            <div className="oa-design-lab-status-groups">
              <div>
                <h3 className="oa-label">STORED</h3>
                <ul className="oa-design-lab-statuses">
                  {PROGRAM_STATUSES.map((status) => <li className="oa-status" key={status}>{status}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="oa-label">DISPLAY ONLY</h3>
                <ul className="oa-design-lab-statuses">
                  {DERIVED_PROGRAM_STATUSES.map((status) => (
                    <li className="oa-status" key={status}>{status.replaceAll("_", " ")}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="oa-design-lab-section" id="talk" aria-labelledby="talk-title">
          <div className="oa-section-heading">
            <h2 id="talk-title">03 / TALK</h2>
            <span className="oa-label">MESSAGE → CONTEXT → REACTION</span>
          </div>
          <div className="oa-design-lab-block">
            <p className="oa-overline">NOTICE / QUESTION / REPLY / CHAT</p>
            <DesignLabConversation />
          </div>
          <div className="oa-design-lab-block">
            <LockedState
              title="PARTICIPANTS ONLY"
              description={"이 대화방은 참가자와 운영진만\n이용할 수 있습니다."}
              action={<a className="oa-label" href="#program">JOIN GATHERING →</a>}
              headingLevel="h3"
            />
          </div>
        </section>

        <section className="oa-design-lab-section" id="states" aria-labelledby="states-title">
          <div className="oa-section-heading">
            <h2 id="states-title">04 / SYSTEM STATES</h2>
            <span className="oa-label">TEXT + STRUCTURE</span>
          </div>
          <div className="oa-design-lab-state-grid">
            <div><p className="oa-overline">LOADING</p><LoadingState rows={2} /></div>
            <div><p className="oa-overline">EMPTY</p><EmptyState description="아직 표시할 Program이 없습니다." /></div>
            <div><p className="oa-overline">ERROR</p><ErrorState announce={false} description="정보를 불러오지 못했습니다. 다시 시도해 주세요." headingLevel="h3" /></div>
            <div className="oa-design-lab-success" role="status">
              <p className="oa-overline">SUCCESS</p>
              <p>Gathering이 게시되었습니다.</p>
            </div>
          </div>
        </section>

        <section className="oa-design-lab-section" id="stress" aria-labelledby="stress-title">
          <div className="oa-section-heading">
            <h2 id="stress-title">05 / STRESS CASES</h2>
            <span className="oa-label">NO SILENT CLIPPING</span>
          </div>
          <div className="oa-design-lab-stress">
            <div><p className="oa-overline">LONG KOREAN TITLE</p><h3>도시의 경계에서 사라지는 것들과 다시 시작되는 건축적 관계를 함께 관찰하는 모임</h3></div>
            <div><p className="oa-overline">LONG AFFILIATION</p><p>도시건축연구소 지속가능한 재료와 순환형 공간 시스템 연구그룹</p></div>
            <div><p className="oa-overline">UNBROKEN STRING</p><code>https://omnivore-architect.example/program/design-lab-gathering-exhibition?tab=talk&amp;message=very-long-message-identifier</code></div>
          </div>
        </section>

        <footer className="oa-design-lab-footer">
          <OAMiniLogo aria-hidden="true" />
          <p>EDIT CODE → SAVE → HMR → VERIFY AT REAL VIEWPORT</p>
        </footer>
      </main>
    </>
  );
}
