import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { hasClerkKeys } from "@/lib/auth";

// Clerk resolves session state here; authorization remains colocated with every
// protected page and API so route matching can never become the security boundary.
const clerkProxy = clerkMiddleware();

export default function proxy(request: NextRequest, event: unknown) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost ?? request.headers.get("host")?.split(":")[0] ?? request.nextUrl.hostname;
  if (requestHost === "www.vibesclone.com") {
    const canonical = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, "https://vibesclone.com");
    return NextResponse.redirect(canonical, 308);
  }
  if (!hasClerkKeys()) return NextResponse.next();
  // @ts-expect-error Next proxy event is structurally compatible with Clerk middleware.
  return clerkProxy(request, event);
}

export const config = { matcher: ["/((?!_next|.*\\.(?:ico|png|svg|jpg|jpeg|webp|css|js|map|txt|woff2?)$).*)", "/(api|trpc)(.*)"] };
