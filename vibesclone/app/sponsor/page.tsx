import type { Metadata } from "next";
import { ArrowRight, BarChart3, Bot, CreditCard, Database, Server } from "lucide-react";
import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { SponsorForm } from "@/components/sponsor-form";

export const metadata: Metadata = { title: "Partner with VibesClone", description: "Join the founding partner list for future placements reaching builders actively scoping and shipping software.", alternates: { canonical: "/sponsor" } };

export default function SponsorPage(): React.ReactNode {
  return <main><PublicHeader /><section className="sponsor-hero"><div><span>FOUNDING PARTNER LIST</span><h1>Reach builders while they are choosing the stack.</h1><p>VibesClone helps people move from product research to an approved build sequence. That creates a useful future placement moment for the tools that help them ship—not a generic banner audience.</p><div className="sponsor-fit"><span><Bot /> AI and build tools</span><span><Server /> Hosting and infrastructure</span><span><Database /> Data and APIs</span><span><CreditCard /> Payments and growth</span></div></div><aside><strong>No inventory theatre.</strong><p>We are measuring audience demand before selling fixed placements. Join the list now; we’ll share real traffic and format details when the evidence supports a useful partnership.</p><Link href="/stats">See live product stats <ArrowRight size={15} /></Link></aside></section><section className="sponsor-content"><div><span>THE STANDARD</span><h2>A partner should improve the build.</h2><div className="partner-principles"><article><BarChart3 /><h3>Measured</h3><p>Traffic, clicks, and conversions will be reported from recorded events—never projected as guaranteed outcomes.</p></article><article><Bot /><h3>Relevant</h3><p>Placements must help someone analyze, build, launch, or operate the product they are already working on.</p></article><article><Server /><h3>Limited</h3><p>If placements open, inventory will stay scarce enough to be noticed and reviewed by the team.</p></article></div></div><SponsorForm /></section><PublicFooter /></main>;
}
