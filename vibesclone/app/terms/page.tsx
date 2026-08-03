import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";

export const metadata: Metadata = { title: "Terms of Service", description: "Terms governing use of VibesClone.", alternates: { canonical: "/terms" } };

export default function TermsPage(): React.ReactNode {
  return <main className="legal-page"><header className="legal-header"><Brand /><Link href="/"><ArrowLeft size={14} /> Back to VibesClone</Link></header><article className="legal-document"><span>LEGAL · EFFECTIVE 31 JULY 2026</span><h1>Terms of Service</h1><p>These terms govern your access to and use of VibesClone.</p>
    <section><h2>The service</h2><p>VibesClone analyzes public product information and your instructions, lets you verify an adapted product definition, and generates ordered prompts for third-party build tools. Outputs are assistive materials, not a guarantee that a product will be complete, correct, secure, lawful, or commercially successful.</p></section>
    <section><h2>Your responsibility</h2><p>You must have the right to submit each URL and use the resulting material. Do not use VibesClone to copy another party&apos;s branding, protected expression, private data, credentials, or proprietary content. You are responsible for reviewing generated prompts, generated code, licenses, security, accessibility, and legal compliance before release.</p></section>
    <section><h2>Accounts and acceptable use</h2><p>Keep account access secure and provide accurate information. You may not probe or disrupt the service, bypass limits or entitlements, automate abusive volume, submit malicious instructions, infringe rights, or use the service for unlawful, deceptive, or harmful activity. We may suspend access that threatens users or the service.</p></section>
    <section><h2>Project licenses and payments</h2><p>Free access includes the product experience described at purchase time. A paid or promotional project license unlocks the specified prompt set for one project unless a pack states otherwise. Payments, taxes, receipts, and eligible refunds are handled through our payment provider and the terms shown at checkout. Promotional codes may be limited by account, project, quantity, or expiry and have no cash value.</p></section>
    <section><h2>Ownership</h2><p>You retain rights in the material you submit and, as between you and VibesClone, may use your generated output subject to applicable law and third-party rights. VibesClone retains its software, brand, interface, templates, and service know-how. You grant us the limited rights needed to process your inputs and operate the service.</p></section>
    <section><h2>Availability and disclaimers</h2><p>The service is provided on an “as is” and “as available” basis to the extent permitted by law. Providers and models may change, outputs may contain errors, and service interruptions may occur. We disclaim implied warranties where the law permits.</p></section>
    <section><h2>Liability</h2><p>To the maximum extent permitted by law, VibesClone will not be liable for indirect, incidental, special, consequential, or lost-profit damages. Our aggregate liability relating to the service will not exceed the amount you paid to VibesClone for the affected project during the twelve months before the claim.</p></section>
    <section><h2>Contact and changes</h2><p>Questions about these terms can be sent to <a href="mailto:sales@vibesclone.com">sales@vibesclone.com</a>. We may update these terms as the service evolves; continued use after the published effective date means you accept the revised terms.</p></section>
  </article></main>;
}
