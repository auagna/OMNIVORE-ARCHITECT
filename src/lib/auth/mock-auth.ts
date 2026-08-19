import {
  MOCK_AUTH_STORAGE_KEY,
  MOCK_CURRENT_USER_ID,
} from "../../constants";
import type { MockAuthIdentity, MockAuthSessionRepository } from "./types";

export const MOCK_AUTH_USER_IDS: Record<MockAuthIdentity, string> = {
  MEMBER: MOCK_CURRENT_USER_ID,
  ADMIN: "user-admin",
};

export class BrowserMockAuthRepository implements MockAuthSessionRepository {
  private currentUserId: string | null;
  private readonly listeners = new Set<(userId: string | null) => void>();

  constructor(
    private readonly storageKey = MOCK_AUTH_STORAGE_KEY,
    private readonly defaultUserId: string = MOCK_CURRENT_USER_ID,
  ) {
    this.currentUserId = this.read() ?? defaultUserId;
  }

  async getCurrentUserId(): Promise<string | null> {
    return this.currentUserId;
  }

  subscribe(listener: (userId: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setCurrentUserId(userId: string): Promise<void> {
    this.currentUserId = userId;
    this.persist();
    this.emit();
  }

  async setMockIdentity(identity: MockAuthIdentity): Promise<void> {
    await this.setCurrentUserId(MOCK_AUTH_USER_IDS[identity]);
  }

  async signOut(): Promise<void> {
    this.currentUserId = null;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch {
        // Keep the in-memory session when browser storage is unavailable.
      }
    }
    this.emit();
  }

  async reset(): Promise<void> {
    this.currentUserId = this.defaultUserId;
    this.persist();
    this.emit();
  }

  private read(): string | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  private persist(): void {
    if (typeof window === "undefined" || this.currentUserId === null) return;
    try {
      window.localStorage.setItem(this.storageKey, this.currentUserId);
    } catch {
      // The in-memory session remains usable when browser storage is unavailable.
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.currentUserId);
  }
}

export const mockAuthRepository = new BrowserMockAuthRepository();
