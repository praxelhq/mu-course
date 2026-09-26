import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Clarity } from "@/components/analytics/clarity";
import { hasClerkKeys } from "@/lib/auth";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  applicationName: "VibesClone",
  title: { default: "VibesClone — Build what’s already earning.", template: "%s · VibesClone" },
  description: "Find indie products with verified revenue, see the buildable core, and get an ordered prompt sequence to ship your own version for a different niche.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://vibesclone.com"),
  keywords: ["verified revenue", "micro SaaS ideas", "TrustMRR", "build vs buy", "product analysis", "vibe coding", "AI build prompts", "app clone blueprint", "SaaS alternative", "Lovable prompts", "Replit Agent prompts", "Claude Code prompts", "product teardown"],
  authors: [{ name: "VibesClone", url: "https://vibesclone.com" }],
  creator: "VibesClone",
  publisher: "VibesClone",
  category: "technology",
  alternates: { canonical: "/" },
  icons: { icon: [{ url: "/icon", type: "image/png" }], apple: [{ url: "/apple-icon", type: "image/png" }] },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: { title: "VibesClone — Build what’s already earning.", description: "Pick a product that already earns, find its buildable core, and get a build-ready prompt sequence for your niche.", url: "/", siteName: "VibesClone", locale: "en_US", type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "VibesClone turns a product URL into a verified build sequence" }] },
  twitter: { card: "summary_large_image", title: "VibesClone — Build what’s already earning.", description: "Verified-revenue products, their buildable core, and the prompts to ship your version.", images: ["/twitter-image"] },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const body = <html lang="en"><body className={`${sans.variable} ${mono.variable} ${grotesk.variable}`}>{children}<Clarity /></body></html>;
  if (!hasClerkKeys()) return body;
  const { ClerkProvider } = await import("@clerk/nextjs");
  return <ClerkProvider>{body}</ClerkProvider>;
}
