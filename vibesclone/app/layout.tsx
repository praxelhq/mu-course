import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Clarity } from "@/components/analytics/clarity";
import { hasClerkKeys } from "@/lib/auth";
import "./globals.css";

export const dynamic = "force-dynamic";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  applicationName: "VibesClone",
  title: { default: "VibesClone — Copy the product logic. Build your version.", template: "%s · VibesClone" },
  description: "Turn any public product into a verified product understanding and an ordered prompt sequence for your build tool.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://vibesclone.com"),
  keywords: ["product analysis", "vibe coding", "AI build prompts", "Lovable prompts", "Replit Agent prompts", "Claude Code prompts", "product teardown"],
  authors: [{ name: "VibesClone", url: "https://vibesclone.com" }],
  creator: "VibesClone",
  publisher: "VibesClone",
  category: "technology",
  alternates: { canonical: "/" },
  icons: { icon: [{ url: "/icon", type: "image/png" }], apple: [{ url: "/apple-icon", type: "image/png" }] },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: { title: "VibesClone — Copy the product logic. Build your version.", description: "Analyze any public product, verify the AI's understanding, and get a build-ready prompt sequence for your niche.", url: "/", siteName: "VibesClone", locale: "en_US", type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "VibesClone turns a product URL into a verified build sequence" }] },
  twitter: { card: "summary_large_image", title: "VibesClone — Copy the product logic. Build your version.", description: "Turn any public product into a verified understanding and an ordered prompt sequence.", images: ["/twitter-image"] },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const body = <html lang="en"><body className={`${sans.variable} ${mono.variable}`}>{children}<Clarity /></body></html>;
  if (!hasClerkKeys()) return body;
  const { ClerkProvider } = await import("@clerk/nextjs");
  return <ClerkProvider>{body}</ClerkProvider>;
}
