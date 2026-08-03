import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content/layout";
import { docEntry } from "@/lib/content";

const entry = docEntry("licenses-and-pricing");

export const metadata: Metadata = { title: entry.title, description: entry.description, alternates: { canonical: `/docs/${entry.slug}` } };

export default function LicensesAndPricingPage(): React.ReactNode {
  return <ContentPage eyebrow="DOCS · LICENSES AND PRICING" title="Licenses and pricing" lede="The boundary is simple: understanding the product is free, building the whole product takes a license. One license covers one project.">
    <section><h2>What is free</h2><p>For every project: the public-page analysis, the editable Build Understanding, approval, and the complete base prompt (order 0) of the Build Sequence. This is not a trial or a sample — the base prompt is the full first step of the sequence, and you can run it in your build target without paying anything. See <Link href="/docs/build-sequences">Build Sequences</Link> for what the base prompt covers.</p></section>
    <section><h2>What a license unlocks</h2><p>The ordered follow-up prompts. They are generated together with the base prompt at the same quality, but their contents are withheld server-side until that specific project consumes a license credit. This is a server rule, not a client one — nothing in the browser or in a return URL can grant access. A credit is redeemed per project: once redeemed, that project&apos;s full sequence is unlocked, including regenerations after a scope change.</p></section>
    <section><h2>Credit packs</h2><p>Three packs, one-time purchases: $29 for one project, $69 for three project credits ($23 per project), and $179 for ten project credits ($17.90 per project). Unused credits stay on your account until you redeem them on a project — they do not expire on a clock.</p></section>
    <section><h2>Student code</h2><p>A configured student discount code grants a 100% discount, and it applies only to the one-project product. Each customer can receive at most one student credit. The larger packs are not eligible for the code.</p></section>
    <section><h2>Refunds and disputes</h2><p>A full refund or a payment dispute revokes every project license created by that purchase — the follow-up prompts for those projects lock again. Partial refunds preserve access while the operator reviews the case. If something went wrong with a purchase, ask before disputing; a dispute always revokes.</p></section>
    <section><h2>Buying and redeeming</h2><p>Checkout and credit redemption both happen in the <Link href="/workspace">workspace</Link>: approve a project, see its base prompt, and unlock the rest when you are ready. New here? Start with <Link href="/docs/getting-started">Getting started</Link>.</p></section>
  </ContentPage>;
}
