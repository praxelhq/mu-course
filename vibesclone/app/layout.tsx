import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Clarity } from "@/components/analytics/clarity";
import { hasClerkKeys } from "@/lib/auth";
import "./globals.css";

export const dynamic = "force-dynamic";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "VibesClone — Copy the product logic. Build your version.",
  description: "Turn any public product into a verified product understanding and an ordered prompt sequence for your build tool.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://vibesclone.com"),
  alternates: { canonical: "/" },
  openGraph: { title: "VibesClone — Copy the product logic. Build your version.", description: "Analyze any public product, verify the AI's understanding, and get a build-ready prompt sequence for your niche.", url: "/", siteName: "VibesClone", type: "website" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const body = <html lang="en"><body className={`${sans.variable} ${mono.variable}`}>{children}<Clarity /></body></html>;
  if (!hasClerkKeys()) return body;
  const { ClerkProvider } = await import("@clerk/nextjs");
  return <ClerkProvider>{body}</ClerkProvider>;
}
