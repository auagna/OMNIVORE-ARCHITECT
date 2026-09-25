const configuredTestNow = process.env.NEXT_PUBLIC_OA_TEST_NOW;

/**
 * Returns the real clock unless the Playwright server provides a deterministic
 * timestamp. The public override is intentionally unset in normal builds.
 */
export function currentDate(): Date {
  if (!configuredTestNow) return new Date();
  const configuredDate = new Date(configuredTestNow);
  return Number.isNaN(configuredDate.getTime()) ? new Date() : configuredDate;
}

export function currentTimestamp(): string {
  return currentDate().toISOString();
}
