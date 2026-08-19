"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { ErrorState, LoadingState, LockedState } from "@/components/feedback";
import {
  EMPTY_GATHERING_FORM,
  gatheringProgramToForm,
  validateGatheringForm,
  type GatheringFormValues,
} from "@/features/gathering/model";
import { getProgramCapabilities } from "@/features/programs/domain";
import { formatLongDate, formatMoney } from "@/lib/format";

const STEPS = ["WHAT", "WHEN & WHERE", "PEOPLE", "COST", "DETAILS", "PREVIEW"] as const;

const CATEGORIES = [
  ["CASUAL", "CASUAL"],
  ["WORKSHOP", "WORKSHOP"],
  ["FIELD_TRIP", "FIELD TRIP"],
  ["EXHIBITION", "EXHIBITION"],
  ["STUDY", "STUDY"],
  ["DINING", "DINING"],
  ["OTHER", "OTHER"],
] as const;

type FieldErrors = Partial<Record<keyof GatheringFormValues, string>>;

function Field({
  id,
  label,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  children: React.ReactNode;
}) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ");
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })
    : children;
  return (
    <div className="oa-field">
      <label htmlFor={id}>{label}</label>
      {control}
      {help ? <p className="oa-field-help" id={helpId}>{help}</p> : null}
      {error ? <p className="oa-field-error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}

function required(value: string, message: string) {
  return value.trim() ? null : message;
}

function stepForField(field: string): number {
  if (["title", "category"].includes(field)) return 0;
  if (["date", "startTime", "endTime", "place", "meetingPoint", "mapUrl"].includes(field)) return 1;
  if (["capacity", "recruitmentDeadline", "waitlistEnabled"].includes(field)) return 2;
  if (["costType", "estimatedPrice", "purchaseUrl", "purchaseNote", "participationFee", "feeIncludes", "paymentInfo", "paymentDeadline", "cancellationPolicy"].includes(field)) return 3;
  return 4;
}

function formatPreviewPrice(value: string): string {
  const amount = Number(value.replaceAll(",", ""));
  return value.trim() && Number.isFinite(amount) ? formatMoney(amount) : "—";
}

function validateStep(step: number, values: GatheringFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    const title = required(values.title, "제목을 입력해 주세요.");
    if (title) errors.title = title;
    if (!values.category) errors.category = "카테고리를 선택해 주세요.";
  }
  if (step === 1) {
    const date = required(values.date, "날짜를 선택해 주세요.");
    const startTime = required(values.startTime, "시작 시간을 선택해 주세요.");
    const place = required(values.place, "장소를 입력해 주세요.");
    if (date) errors.date = date;
    if (startTime) errors.startTime = startTime;
    if (place) errors.place = place;
    if (values.startTime && values.endTime && values.endTime <= values.startTime) {
      errors.endTime = "종료 시간은 시작 시간보다 늦어야 합니다.";
    }
    for (const key of ["mapUrl"] as const) {
      if (values[key]) {
        try { new URL(values[key]); } catch { errors[key] = "올바른 URL을 입력해 주세요."; }
      }
    }
  }
  if (step === 2) {
    const capacity = Number(values.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) errors.capacity = "1명 이상의 정원을 입력해 주세요.";
  }
  if (step === 3) {
    if (values.costType === "INDIVIDUAL_PURCHASE") {
      if (values.estimatedPrice && Number(values.estimatedPrice.replaceAll(",", "")) < 0) {
        errors.estimatedPrice = "0 이상의 예상 가격을 입력해 주세요.";
      }
      if (values.purchaseUrl) {
        try { new URL(values.purchaseUrl); } catch { errors.purchaseUrl = "올바른 구매 URL을 입력해 주세요."; }
      }
    }
    if (values.costType === "HOST_COLLECT") {
      if (!(Number(values.participationFee.replaceAll(",", "")) > 0)) errors.participationFee = "참가비를 입력해 주세요.";
      const payment = required(values.paymentInfo, "입금 정보를 입력해 주세요.");
      if (payment) errors.paymentInfo = payment;
    }
  }
  if (step === 4) {
    const description = required(values.description, "설명을 입력해 주세요.");
    if (description) errors.description = description;
  }
  return errors;
}

function FormSectionTitle({ number, title }: { number: number; title: string }) {
  return <legend><span>{String(number + 1).padStart(2, "0")}</span><strong>{title}</strong></legend>;
}

function Preview({ values, hostName }: { values: GatheringFormValues; hostName: string }) {
  const people = String(values.capacity || 0).padStart(2, "0");
  const date = values.date ? formatLongDate(`${values.date}T12:00:00+09:00`) : "—";
  const cost = values.costType === "FREE"
    ? "FREE"
    : values.costType === "INDIVIDUAL_PURCHASE"
      ? `INDIVIDUAL PURCHASE${values.estimatedPrice ? ` · ${formatPreviewPrice(values.estimatedPrice)}` : ""}`
      : `${formatPreviewPrice(values.participationFee)} · HOST COLLECT`;
  return (
    <div className="oa-preview" aria-live="polite">
      <p className="oa-overline">06 / PREVIEW</p>
      <div className="oa-preview-frame">
        <div className="oa-row-between">
          <span className="oa-overline">GATHERING / {values.category.replaceAll("_", " ")}</span>
          <span className="oa-overline">OA / PROPOSAL</span>
        </div>
        <h2>{values.title}</h2>
        <dl className="oa-info-grid">
          <div className="oa-info-row"><dt>WHEN</dt><dd>{date}<br />{values.startTime}{values.endTime ? `—${values.endTime}` : ""}</dd></div>
          <div className="oa-info-row"><dt>WHERE</dt><dd>{values.place}</dd></div>
          {values.meetingPoint ? <div className="oa-info-row"><dt>MEET</dt><dd>{values.meetingPoint}</dd></div> : null}
          <div className="oa-info-row"><dt>PEOPLE</dt><dd>00 / {people}</dd></div>
          <div className="oa-info-row"><dt>COST</dt><dd>{cost}</dd></div>
          <div className="oa-info-row"><dt>HOST</dt><dd>{hostName}</dd></div>
        </dl>
        <div className="oa-description"><p className="oa-overline">DESCRIPTION</p><p>{values.description}</p></div>
      </div>
    </div>
  );
}

export function GatheringCreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { repository, currentUserId, sessionLoading } = useAppState();
  const editProgramId = searchParams.get("edit");
  const proposalQuery = useCallback(
    async (repo: typeof repository) => {
      if (!currentUserId) return { host: null, snapshot: null, approval: null };
      const [host, snapshot, approval, revision] = await Promise.all([
        repo.getUserById(currentUserId),
        editProgramId
          ? repo.getProgramSnapshotById(editProgramId, new Date().toISOString(), currentUserId)
          : Promise.resolve(null),
        editProgramId
          ? repo.getProgramApproval(editProgramId, currentUserId)
          : Promise.resolve(null),
        editProgramId
          ? repo.getGatheringRevision(editProgramId, currentUserId)
          : Promise.resolve(null),
      ]);
      return {
        host,
        snapshot: snapshot && revision
          ? { ...snapshot, program: revision.proposedProgram }
          : snapshot,
        approval,
      };
    },
    [currentUserId, editProgramId],
  );
  const {
    data: proposalData,
    error: proposalError,
    loading: proposalLoading,
    reload: reloadProposal,
  } = useRepositoryQuery(proposalQuery, [currentUserId, editProgramId]);
  const proposalProgram = proposalData?.snapshot?.program;
  const capabilities = proposalProgram && proposalData?.host
    ? getProgramCapabilities({
        user: proposalData.host,
        program: proposalProgram,
        participation: null,
        approval: proposalData.approval,
        record: proposalData.snapshot?.record ?? null,
        participantCounts: proposalData.snapshot?.participantCounts ?? { confirmed: 0 },
      })
    : null;
  const initialValues = useMemo(
    () => proposalProgram?.type === "GATHERING"
      ? gatheringProgramToForm(proposalProgram)
      : EMPTY_GATHERING_FORM,
    [proposalProgram],
  );
  const draftKey = editProgramId ?? "new";
  const [draft, setDraft] = useState<{ key: string; values: GatheringFormValues } | null>(null);
  const values = draft?.key === draftKey ? draft.values : initialValues;
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const progress = useMemo(() => STEPS.map((label, index) => ({ label, active: index <= step })), [step]);

  function update<K extends keyof GatheringFormValues>(key: K, value: GatheringFormValues[K]) {
    setDraft((current) => {
      const currentValues = current?.key === draftKey ? current.values : initialValues;
      return { key: draftKey, values: { ...currentValues, [key]: value } };
    });
    setErrors((current) => ({ ...current, [key]: undefined }));
    if (previewed) setPreviewed(false);
  }

  function goTo(next: number, field?: keyof GatheringFormValues) {
    setStep(next);
    requestAnimationFrame(() => {
      const fieldControl = field ? document.getElementById(field) : null;
      (fieldControl ?? headingRef.current)?.focus();
    });
  }

  function next() {
    const stepErrors = validateStep(step, values);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      const firstInvalidField = Object.keys(stepErrors)[0] as keyof GatheringFormValues;
      requestAnimationFrame(() => document.getElementById(firstInvalidField)?.focus());
      return;
    }
    if (step === 4) {
      const validation = validateGatheringForm(values);
      if (!validation.success) {
        const mapped: FieldErrors = {};
        for (const issue of validation.issues) {
          if (issue.field in EMPTY_GATHERING_FORM) {
            mapped[issue.field as keyof GatheringFormValues] = issue.message;
          }
        }
        setErrors(mapped);
        const firstStep = validation.issues.reduce(
          (lowest, issue) => Math.min(lowest, stepForField(issue.field)),
          4,
        );
        const firstInvalidField = Object.keys(mapped).find(
          (field) => stepForField(field) === firstStep,
        ) as keyof GatheringFormValues | undefined;
        goTo(firstStep, firstInvalidField);
        return;
      }
      setPreviewed(true);
    }
    goTo(Math.min(step + 1, 5));
  }

  async function publishOrSave() {
    if (!previewed || submitting || !currentUserId) return;
    const validation = validateGatheringForm(values);
    if (!validation.success) {
      setSubmitError("입력 내용을 다시 확인해 주세요.");
      setPreviewed(false);
      goTo(0);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (!editProgramId) {
        const proposal = await repository.submitGatheringForApproval(
          validation.data,
          currentUserId,
          new Date().toISOString(),
        );
        router.push(`/my?proposal=${proposal.approval.programId}&status=pending`);
        return;
      }

      if (capabilities?.canSubmitForApproval) {
        const proposal = await repository.resubmitGatheringForApproval(
          editProgramId,
          validation.data,
          currentUserId,
          new Date().toISOString(),
        );
        router.push(`/my?proposal=${proposal.approval.programId}&status=pending`);
        return;
      }

      await repository.updateGathering(
        editProgramId,
        validation.data,
        currentUserId,
        new Date().toISOString(),
      );
      const approval = await repository.getProgramApproval(editProgramId, currentUserId);
      if (approval?.status === "PENDING") {
        router.push(`/my?proposal=${editProgramId}&status=pending`);
      } else {
        router.push(`/my/hosting/${editProgramId}?updated=1`);
      }
    } catch (reason) {
      setSubmitError(reason instanceof Error ? reason.message : "Gathering 제안을 제출하지 못했습니다.");
      setSubmitting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 5) next();
  }

  if (!sessionLoading && !currentUserId) {
    return (
      <LockedState
        title="LOGIN REQUIRED"
        description="Gathering은 승인된 Member만 제안할 수 있습니다."
        action={<Link className="oa-label" href="/login">LOGIN →</Link>}
      />
    );
  }

  if (editProgramId && proposalLoading && !proposalError) {
    return <LoadingState label="수정할 Proposal을 불러오는 중입니다." />;
  }

  if (editProgramId && proposalError) {
    return <ErrorState description={proposalError.message} onRetry={reloadProposal} />;
  }

  if (editProgramId && !proposalData?.snapshot) {
    return (
      <ErrorState
        title="PROPOSAL NOT FOUND"
        description="수정할 Proposal을 찾을 수 없습니다."
        action={<Link className="oa-label" href="/my">BACK TO MY →</Link>}
      />
    );
  }

  if (editProgramId && capabilities && !capabilities.canEditProgram) {
    return (
      <LockedState
        title={proposalData?.approval?.status === "PENDING" ? "REVIEW IN PROGRESS" : "EDIT LOCKED"}
        description={proposalData?.approval?.status === "PENDING"
          ? "운영진 검토가 끝난 뒤 다시 수정할 수 있습니다."
          : "현재 상태에서는 이 Gathering을 수정할 수 없습니다."}
        action={<Link className="oa-label" href="/my">BACK TO MY →</Link>}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      {proposalData?.approval?.status === "CHANGES_REQUESTED" ? (
        <div className="oa-flash" role="status">
          <strong>NEEDS REVISION</strong>
          <br />
          {proposalData.approval.reviewComment ?? "운영진 요청을 반영한 뒤 다시 제출해 주세요."}
        </div>
      ) : null}
      {editProgramId && ["APPROVED", "NOT_REQUIRED"].includes(proposalData?.approval?.status ?? "") ? (
        <div className="oa-flash" role="note">
          <strong>EDIT POLICY</strong>
          <br />
          일정·장소·핵심 비용 변경은 재승인되며, 운영 정보 변경은 바로 반영됩니다.
        </div>
      ) : null}
      <ol className="oa-form-progress" aria-label={`Step ${step + 1} of 6`}>
        {progress.map((item, index) => (
          <li key={item.label} data-active={item.active} aria-current={index === step ? "step" : undefined}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <span className="oa-visually-hidden">{item.label}</span>
          </li>
        ))}
      </ol>

      <h2 ref={headingRef} className="oa-visually-hidden" tabIndex={-1}>
        Step {step + 1}: {STEPS[step]}
      </h2>

      {step === 0 ? (
        <fieldset className="oa-form-section">
          <FormSectionTitle number={0} title="WHAT" />
          <div className="oa-field-stack">
            <Field id="title" label="TITLE" error={errors.title}>
              <input id="title" name="title" value={values.title} onChange={(e) => update("title", e.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "title-error" : undefined} autoFocus required />
            </Field>
            <Field id="category" label="CATEGORY" error={errors.category}>
              <select id="category" name="category" value={values.category} onChange={(e) => update("category", e.target.value as GatheringFormValues["category"])} required>
                <option value="" disabled>SELECT CATEGORY</option>
                {CATEGORIES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </Field>
          </div>
        </fieldset>
      ) : null}

      {step === 1 ? (
        <fieldset className="oa-form-section">
          <FormSectionTitle number={1} title="WHEN & WHERE" />
          <div className="oa-field-stack">
            <Field id="date" label="DATE" error={errors.date}><input id="date" type="date" value={values.date} onChange={(e) => update("date", e.target.value)} aria-invalid={Boolean(errors.date)} required /></Field>
            <div className="oa-field-grid">
              <Field id="startTime" label="START TIME" error={errors.startTime}><input id="startTime" type="time" value={values.startTime} onChange={(e) => update("startTime", e.target.value)} required /></Field>
              <Field id="endTime" label="END TIME" error={errors.endTime} help="OPTIONAL"><input id="endTime" type="time" value={values.endTime} onChange={(e) => update("endTime", e.target.value)} /></Field>
            </div>
            <Field id="place" label="PLACE" error={errors.place}><input id="place" value={values.place} onChange={(e) => update("place", e.target.value)} required /></Field>
            <Field id="meetingPoint" label="MEETING POINT" help="실제 장소와 집결 지점을 분리해 입력합니다."><input id="meetingPoint" value={values.meetingPoint} onChange={(e) => update("meetingPoint", e.target.value)} placeholder="예: 1층 로비" /></Field>
            <Field id="mapUrl" label="MAP LINK" error={errors.mapUrl} help="OPTIONAL"><input id="mapUrl" type="url" value={values.mapUrl} onChange={(e) => update("mapUrl", e.target.value)} /></Field>
          </div>
        </fieldset>
      ) : null}

      {step === 2 ? (
        <fieldset className="oa-form-section">
          <FormSectionTitle number={2} title="PEOPLE" />
          <div className="oa-field-stack">
            <Field id="capacity" label="CAPACITY" error={errors.capacity}><input id="capacity" type="number" min="1" step="1" inputMode="numeric" value={values.capacity} onChange={(e) => update("capacity", e.target.value)} required /></Field>
            <Field id="recruitmentDeadline" label="REGISTRATION DEADLINE" error={errors.recruitmentDeadline} help="OPTIONAL"><input id="recruitmentDeadline" type="datetime-local" value={values.recruitmentDeadline} onChange={(e) => update("recruitmentDeadline", e.target.value)} /></Field>
            <label className="oa-choice">
              <input type="checkbox" checked={values.waitlistEnabled} onChange={(e) => update("waitlistEnabled", e.target.checked)} />
              <span>WAITLIST</span><small>{values.waitlistEnabled ? "ON" : "OFF"}</small>
            </label>
          </div>
        </fieldset>
      ) : null}

      {step === 3 ? (
        <fieldset className="oa-form-section">
          <FormSectionTitle number={3} title="COST" />
          <fieldset className="oa-fieldset">
            <legend>COST</legend>
            <div className="oa-choice-grid">
              {(["FREE", "INDIVIDUAL_PURCHASE", "HOST_COLLECT"] as const).map((costType) => (
                <label className="oa-choice" key={costType}>
                  <input type="radio" name="costType" value={costType} checked={values.costType === costType} onChange={() => update("costType", costType)} />
                  <span>{costType.replaceAll("_", " ")}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {values.costType === "INDIVIDUAL_PURCHASE" ? (
            <div className="oa-field-stack oa-section">
              <Field id="estimatedPrice" label="ESTIMATED PRICE" error={errors.estimatedPrice} help="OPTIONAL / KRW"><input id="estimatedPrice" inputMode="numeric" value={values.estimatedPrice} onChange={(e) => update("estimatedPrice", e.target.value)} /></Field>
              <Field id="purchaseUrl" label="PURCHASE URL" error={errors.purchaseUrl} help="OPTIONAL"><input id="purchaseUrl" type="url" value={values.purchaseUrl} onChange={(e) => update("purchaseUrl", e.target.value)} /></Field>
              <Field id="purchaseNote" label="PURCHASE NOTE" help="OPTIONAL"><textarea id="purchaseNote" value={values.purchaseNote} onChange={(e) => update("purchaseNote", e.target.value)} /></Field>
            </div>
          ) : null}

          {values.costType === "HOST_COLLECT" ? (
            <div className="oa-field-stack oa-section">
              <Field id="participationFee" label="PARTICIPATION FEE" error={errors.participationFee} help="KRW"><input id="participationFee" inputMode="numeric" value={values.participationFee} onChange={(e) => update("participationFee", e.target.value)} required /></Field>
              <Field id="feeIncludes" label="FEE INCLUDES" help="OPTIONAL"><input id="feeIncludes" value={values.feeIncludes} onChange={(e) => update("feeIncludes", e.target.value)} /></Field>
              <Field id="paymentInfo" label="PAYMENT INFO" error={errors.paymentInfo}><textarea id="paymentInfo" value={values.paymentInfo} onChange={(e) => update("paymentInfo", e.target.value)} required /></Field>
              <Field id="paymentDeadline" label="PAYMENT DEADLINE" error={errors.paymentDeadline} help="OPTIONAL"><input id="paymentDeadline" type="datetime-local" value={values.paymentDeadline} onChange={(e) => update("paymentDeadline", e.target.value)} /></Field>
              <Field id="cancellationPolicy" label="CANCELLATION POLICY" help="OPTIONAL"><textarea id="cancellationPolicy" value={values.cancellationPolicy} onChange={(e) => update("cancellationPolicy", e.target.value)} /></Field>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {step === 4 ? (
        <fieldset className="oa-form-section">
          <FormSectionTitle number={4} title="DETAILS" />
          <div className="oa-field-stack">
            <Field id="description" label="DESCRIPTION" error={errors.description}><textarea id="description" value={values.description} onChange={(e) => update("description", e.target.value)} required /></Field>
            <Field id="bringItems" label="BRING ITEMS" help="OPTIONAL"><textarea id="bringItems" value={values.bringItems} onChange={(e) => update("bringItems", e.target.value)} /></Field>
            <Field id="notice" label="NOTICE" help="OPTIONAL"><textarea id="notice" value={values.notice} onChange={(e) => update("notice", e.target.value)} /></Field>
          </div>
        </fieldset>
      ) : null}

      {step === 5 ? <Preview values={values} hostName={proposalData?.host?.name ?? "CURRENT MEMBER"} /> : null}

      {submitError ? <p className="oa-flash" role="alert">{submitError}</p> : null}
      <div className={`oa-form-actions ${step === 0 ? "oa-form-actions--single" : ""}`}>
        {step > 0 ? <button className="oa-secondary-button" type="button" onClick={() => goTo(step - 1)}>{step === 5 ? "EDIT" : "BACK"}</button> : null}
        {step < 5 ? <button className="oa-primary-button" type="submit">{step === 4 ? "PREVIEW" : "NEXT"}</button> : null}
        {step === 5 ? (
          <button
            className="oa-primary-button"
            type="button"
            onClick={() => void publishOrSave()}
            disabled={!previewed || submitting || sessionLoading || !currentUserId}
          >
            {submitting
              ? "SAVING…"
              : !editProgramId
                ? "SUBMIT FOR APPROVAL →"
                : capabilities?.canSubmitForApproval
                  ? proposalData?.approval?.status === "CHANGES_REQUESTED"
                    ? "RESUBMIT FOR APPROVAL →"
                    : "SUBMIT FOR APPROVAL →"
                  : "SAVE CHANGES →"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
