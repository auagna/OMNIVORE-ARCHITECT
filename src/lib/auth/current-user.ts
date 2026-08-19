import type { User } from "../../types";
import type { UserRepository } from "../repositories";
import { mockRepository } from "../repositories";
import { mockAuthRepository } from "./mock-auth";
import type { AuthSessionRepository } from "./types";
import { AuthError } from "./types";

export async function getCurrentUser(
  auth: AuthSessionRepository = mockAuthRepository,
  users: UserRepository = mockRepository,
): Promise<User | null> {
  const userId = await auth.getCurrentUserId();
  return userId === null ? null : users.getUserById(userId);
}

export async function requireCurrentUser(
  auth: AuthSessionRepository = mockAuthRepository,
  users: UserRepository = mockRepository,
): Promise<User> {
  const userId = await auth.getCurrentUserId();
  if (userId === null) {
    throw new AuthError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }
  const user = await users.getUserById(userId);
  if (user === null) {
    throw new AuthError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
  }
  return user;
}
