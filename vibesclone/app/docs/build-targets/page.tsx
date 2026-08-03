import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content/layout";

export const metadata: Metadata = { title: "Choosing a build target", description: "How to pick among Lovable, Replit, Base44, and Claude Code, and what platform adapters preserve.", alternates: { canonical: "/docs/build-targets" } };

export default function BuildTargetsPage(): React.ReactNode {
  return <ContentPage eyebrow="DOCS · BUILD TARGETS" title="Choosing a build target" lede="A Build Sequence is generated for one of four tools. The approved product behavior is identical across all of them — the choice is about how you like to build.">
    <section><h2>What an adapter preserves</h2><p>Platform adapters keep the same approved product behavior across every target: the same features, flows, and checks from your approved Build Understanding. What changes is terminology and instruction style — each prompt speaks the target tool&apos;s language, references its conventions, and phrases completion checks in terms of what that tool shows you. Switching targets changes how you build, never what you build.</p></section>
    <section><h2>Lovable</h2><p>The fastest route to visual full-stack scaffolding. Lovable turns prompts into a working interface and backend quickly, which makes it a strong default when you want to see your product early and iterate on what you can see. Pick it when speed to a visible, clickable product matters most.</p></section>
    <section><h2>Replit</h2><p>An in-browser development environment with an agent, good for iteration and hosting in one place. You can inspect and edit what the agent produces without leaving the browser, and deploy from the same workspace. Pick it when you want a tight loop between prompting, adjusting code, and shipping.</p></section>
    <section><h2>Base44</h2><p>An app platform with a built-in backend, so data, auth, and hosting concerns are handled by the platform rather than assembled by prompts. Pick it when you want to describe application behavior and let the platform carry the infrastructure.</p></section>
    <section><h2>Claude Code</h2><p>Terminal-first and the most control of the four — best for developers. Prompts become instructions to an agent working in a real codebase you own, with your own dependencies, tests, and deployment. Pick it when you can read code and want the finished product to be a repository, not a platform artifact.</p></section>
    <section><h2>Deciding, and changing your mind</h2><p>If you are unsure: non-developers who want something visible fast should start with Lovable, developers should start with Claude Code, and Replit and Base44 sit between depending on whether you want an editable environment or a managed backend. You choose the target before generation, as part of the flow in <Link href="/docs/getting-started">Getting started</Link>; the sequence itself is explained in <Link href="/docs/build-sequences">Build Sequences</Link>. Ready to choose? Do it in the <Link href="/workspace">workspace</Link>.</p></section>
  </ContentPage>;
}
