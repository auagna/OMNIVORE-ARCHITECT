export function isDesignLabEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === "development";
}
