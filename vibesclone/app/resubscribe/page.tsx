import type { Metadata } from "next";
import { PublicHeader } from "@/components/public-shell";
import { ReactivateForm } from "@/components/reactivate-form";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm digest subscription", robots: { index: false, follow: false } };

export default async function ResubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }): Promise<React.ReactNode> {
  const token = (await searchParams).token;
  const subscriber = token ? await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token }, select: { id: true } }).catch(() => null) : null;
  return <main><PublicHeader /><ReactivateForm token={token ?? ""} valid={Boolean(subscriber)} /></main>;
}
