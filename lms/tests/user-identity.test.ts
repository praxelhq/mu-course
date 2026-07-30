import { describe, expect, it, vi } from "vitest";
import {
  findUserByEmailIdentity,
  linkClerkIdentity,
} from "../lib/auth/user-identity";

const user = {
  id: "student_1",
  email: "personal@example.com",
  role: "student" as const,
  sectionId: "section_f",
  teamId: null,
};

describe("user identities", () => {
  it("prefers a canonical email before looking up an alias", async () => {
    const aliasLookup = vi.fn();
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      userEmailAlias: { findUnique: aliasLookup },
    } as never;

    await expect(findUserByEmailIdentity(db, " PERSONAL@EXAMPLE.COM ")).resolves.toEqual(user);
    expect(aliasLookup).not.toHaveBeenCalled();
  });

  it("resolves an institution alias to the same canonical user", async () => {
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      userEmailAlias: { findUnique: vi.fn().mockResolvedValue({ user }) },
    } as never;

    await expect(findUserByEmailIdentity(db, "student@mastersunion.org")).resolves.toEqual(user);
  });

  it("uses the legacy primary Clerk id before the relation lookup", async () => {
    const identityLookup = vi.fn();
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      userClerkIdentity: { findUnique: identityLookup },
    } as never;

    const { findUserByClerkIdentity } = await import("../lib/auth/user-identity");
    await expect(findUserByClerkIdentity(db, "clerk_personal")).resolves.toEqual(user);
    expect(identityLookup).not.toHaveBeenCalled();
  });

  it("falls back to a secondary Clerk identity", async () => {
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      userClerkIdentity: { findUnique: vi.fn().mockResolvedValue({ user }) },
    } as never;

    const { findUserByClerkIdentity } = await import("../lib/auth/user-identity");
    await expect(findUserByClerkIdentity(db, "clerk_company")).resolves.toEqual(user);
  });

  it("persists a second Clerk account without replacing the first", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      userClerkIdentity: {
        createMany,
        findUnique: vi.fn().mockResolvedValue({ userId: "student_1" }),
      },
      user: { updateMany, update },
    };
    const db = { $transaction: (fn: (client: typeof tx) => Promise<void>) => fn(tx) } as never;

    await linkClerkIdentity(db, "student_1", "clerk_company");

    expect(createMany).toHaveBeenCalledWith({
      data: [{ userId: "student_1", clerkUserId: "clerk_company" }],
      skipDuplicates: true,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "student_1", clerkUserId: null },
      data: { clerkUserId: "clerk_company" },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "student_1" },
      data: { flaggedForDeletion: false },
    });
  });

  it("refuses to move a Clerk identity between LMS users", async () => {
    const tx = {
      userClerkIdentity: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ userId: "another_student" }),
      },
      user: { updateMany: vi.fn(), update: vi.fn() },
    };
    const db = { $transaction: (fn: (client: typeof tx) => Promise<void>) => fn(tx) } as never;

    await expect(linkClerkIdentity(db, "student_1", "clerk_taken")).rejects.toThrow(
      "already linked",
    );
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });
});
