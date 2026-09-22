import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  options: {} as Record<string, unknown>,
  handler: undefined as undefined | ((auth: unknown, req: NextRequest) => Promise<unknown>),
}));
vi.mock("next/font/google", () => ({
  Fraunces: () => ({ variable: "fraunces" }),
  Geist: () => ({ variable: "geist" }),
  Geist_Mono: () => ({ variable: "mono" }),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children, ...options }: { children: ReactNode }) => {
    clerk.options = options;
    return children;
  },
}));
vi.mock("@clerk/nextjs/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@clerk/nextjs/server")>(),
  clerkMiddleware: (handler: typeof clerk.handler) => {
    clerk.handler = handler;
    return handler;
  },
}));

import RootLayout from "@/app/layout";
import "@/proxy";

afterEach(() => vi.unstubAllEnvs());

describe("Same-origin Clerk pages", () => {
  it("keeps sign-in, sign-up and OAuth transfers on LMS pages instead of the Account Portal", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
    renderToStaticMarkup(createElement(RootLayout, null, "fixture"));
    expect(clerk.options).toMatchObject({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });
  });

  it.each(["/sign-up", "/sign-up/sso-callback", "/sign-up/verify-email-address"])(
    "lets signed-out visitors finish signup at %s before roster checks",
    async (path) => {
      const auth = vi.fn(async () => ({ userId: null, redirectToSignIn: () => "redirected" }));
      expect(await clerk.handler!(auth, new NextRequest(`https://lms.praxel.in${path}`))).toBeUndefined();
      expect(auth).not.toHaveBeenCalled();
    },
  );

  it("still protects regular LMS pages", async () => {
    const auth = vi.fn(async () => ({ userId: null, redirectToSignIn: () => "redirected" }));
    expect(await clerk.handler!(auth, new NextRequest("https://lms.praxel.in/sessions"))).toBe("redirected");
  });
});
