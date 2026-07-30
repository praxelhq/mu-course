import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOutCalls = vi.hoisted(
  () => [] as Array<{ redirectUrl?: string; sessionId?: string }>,
);

vi.mock("@clerk/nextjs", () => ({
  SignOutButton: (props: {
    redirectUrl?: string;
    sessionId?: string;
    children: ReactNode;
  }) => {
    const { children, ...options } = props;
    signOutCalls.push(options);
    return createElement("span", null, children);
  },
}));

import { AccountSignOutButton } from "../components/account-sign-out-button";

describe("AccountSignOutButton", () => {
  beforeEach(() => {
    signOutCalls.length = 0;
  });

  it("uses Clerk's all-session sign-out and returns to the sign-in page", () => {
    const html = renderToStaticMarkup(
      createElement(AccountSignOutButton, { label: "Use another account" }),
    );

    expect(signOutCalls).toEqual([{ redirectUrl: "/sign-in" }]);
    expect(html).toContain("Use another account");
  });
});
