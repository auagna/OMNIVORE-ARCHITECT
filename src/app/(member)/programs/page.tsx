"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { ProgramEditorialList } from "@/features/programs/views/program-editorial-link";
import { QueryEmpty, QueryError, QueryLoading } from "@/features/programs/views/query-state";
import type { OARepository } from "@/lib/repositories";
import type { GatheringCategory, PageContentKey, ProgramType } from "@/types";

const TYPE_FILTERS: Array<{ label: string; value: ProgramType | null }> = [
  { label: "ALL", value: null },
  { label: "TALK", value: "TALK" },
  { label: "READING", value: "READING" },
  { label: "GATHERING", value: "GATHERING" },
];

const CATEGORY_FILTERS: Array<{ label: string; value: GatheringCategory | null }> = [
  { label: "ALL", value: null },
  { label: "WORKSHOP", value: "WORKSHOP" },
  { label: "FIELD TRIP", value: "FIELD_TRIP" },
  { label: "EXHIBITION", value: "EXHIBITION" },
  { label: "STUDY", value: "STUDY" },
  { label: "DINING", value: "DINING" },
  { label: "CASUAL", value: "CASUAL" },
  { label: "OTHER", value: "OTHER" },
];

function isProgramType(value: string | null): value is ProgramType {
  return TYPE_FILTERS.some((item) => item.value === value);
}

function isGatheringCategory(value: string | null): value is GatheringCategory {
  return CATEGORY_FILTERS.some((item) => item.value === value);
}

export default function ProgramsPage() {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const categoryParam = searchParams.get("category");
  const selectedType = isProgramType(typeParam) ? typeParam : null;
  const selectedCategory = isGatheringCategory(categoryParam) ? categoryParam : null;
  const contentKey: PageContentKey = selectedType ? selectedType.toLowerCase() as PageContentKey : "programs";

  const query = useCallback(
    async (repository: OARepository) => {
      const [programs, content] = await Promise.all([
        repository.listPrograms(
        selectedType
          ? {
              type: selectedType,
              ...(selectedType === "GATHERING" && selectedCategory
                ? { category: selectedCategory }
                : {}),
            }
          : undefined,
        new Date().toISOString(),
        ),
        repository.getPageContent(contentKey),
      ]);
      return { programs, content };
    },
    [selectedType, selectedCategory, contentKey],
  );
  const { data, loading, error, reload } = useRepositoryQuery(query, [selectedType, selectedCategory, contentKey]);
  const systemLabel = selectedType ?? "PROGRAM";
  const displayTitle = data?.content?.title ?? (selectedType ?? "PROGRAMS");

  return (
    <main className="oa-page">
      <header className="oa-page-head">
        <p className="oa-overline">OA / {systemLabel}</p>
        <h1 className="oa-page-title oa-page-title--system">{displayTitle}</h1>
        {data?.content?.headline ? <p className="oa-page-headline">{data.content.headline}</p> : null}
        {data?.content?.description ? <p className="oa-page-description">{data.content.description}</p> : null}
      </header>

      <nav className="oa-filter-nav" aria-label="Program type filters">
        {TYPE_FILTERS.map((filter) => {
          const href = filter.value ? `/programs?type=${filter.value}` : "/programs";
          return (
            <Link
              href={href}
              key={filter.label}
              aria-current={selectedType === filter.value ? "page" : undefined}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {selectedType === "GATHERING" ? (
        <nav className="oa-filter-nav oa-filter-nav--secondary" aria-label="Gathering category filters">
          {CATEGORY_FILTERS.map((filter) => {
            const href = filter.value
              ? `/programs?type=GATHERING&category=${filter.value}`
              : "/programs?type=GATHERING";
            return (
              <Link
                href={href}
                key={filter.label}
                aria-current={selectedCategory === filter.value ? "page" : undefined}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <section className="oa-section" aria-live="polite">
        {loading ? <QueryLoading /> : null}
        {error ? <QueryError message={error.message} onRetry={reload} /> : null}
        {data?.programs.length ? <ProgramEditorialList programs={data.programs} /> : null}
        {data && data.programs.length === 0 ? (
          <QueryEmpty title={data.content?.emptyState ?? "프로그램이 없습니다."} description="선택한 조건에 해당하는 프로그램이 아직 없습니다." />
        ) : null}
      </section>
    </main>
  );
}
