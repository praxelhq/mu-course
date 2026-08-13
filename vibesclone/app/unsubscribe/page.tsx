import type { Metadata } from "next";
import { PublicHeader } from "@/components/public-shell";
import { UnsubscribeForm } from "@/components/unsubscribe-form";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }): Promise<React.ReactNode> {
  const token = (await searchParams).token;
  const subscriber = token ? await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token }, select: { id: true } }).catch(() => null) : null;
  return <main><PublicHeader /><UnsubscribeForm token={token ?? ""} valid={Boolean(subscriber)} /></main>;
}
