import { getClientRuntime } from "../runtime";
import type { OARepository } from "./contracts";

/** @deprecated Prefer getClientRuntime() so data and auth switch together. */
export function getClientRepository(): OARepository {
  return getClientRuntime().repository;
}
