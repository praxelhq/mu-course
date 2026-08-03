import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content/layout";
import { docEntry } from "@/lib/content";

const entry = docEntry("build-sequences");

export const metadata: Metadata = { title: entry.title, description: entry.description, alternates: { canonical: `/docs/${entry.slug}` } };

export default function BuildSequencesPage(): React.ReactNode {
  return <ContentPage eyebrow="DOCS · BUILD SEQUENCES" title="Build Sequences" lede="The product's core output: one base prompt plus an ordered set of follow-up prompts, each with a purpose, completion checks, and a lineage back to the approved understanding.">
    <section><h2>Why not one mega-prompt</h2><p>A single prompt that describes an entire product asks a build tool to make hundreds of decisions at once. The tool fills gaps with defaults, features interfere with each other, and when the output is wrong there is no way to tell which part of the prompt caused it. Ordered prompts fix this by construction: each step carries a bounded amount of intent, lands on a working state, and gives you a checkpoint before the next step builds on it.</p></section>
    <section><h2>The base prompt (order 0)</h2><p>Every Build Sequence starts with one complete base prompt at order 0. It establishes the product foundation — the core structure and the first working slice — phrased in the vocabulary of your chosen build target. The base prompt is free for every approved project, complete on its own, and never truncated.</p></section>
    <section><h2>Ordered follow-ups</h2><p>After the base prompt come 2 to 12 follow-up prompts in a fixed order. Each one assumes the state the previous prompts produced and extends it — the order is not decorative, it is the dependency structure of your build. Every follow-up states its purpose, so you always know why a step exists before you paste it. Follow-ups are generated with the base prompt but stay withheld server-side until the project holds a license; <Link href="/docs/licenses-and-pricing">Licenses and pricing</Link> has the exact boundary.</p></section>
    <section><h2>Completion checks</h2><p>Each prompt includes checks you can perform before advancing: concrete observations about what should now exist or work. Run them. Advancing past a failed check compounds the failure into every later step, while catching it immediately keeps the fix small. The checks are what make the sequence a sequence rather than a pile of prompts.</p></section>
    <section><h2>Feature lineage</h2><p>Every prompt maps to named features in the approved Build Understanding — the retain, modify, and add classifications you signed off on. That lineage runs in both directions: for any prompt you can see which approved features it implements, and for any approved feature you can see which step builds it. Nothing in the sequence is unaccounted for, and nothing approved is silently dropped. This is why approval is immutable — see <Link href="/docs/build-understanding">The Build Understanding</Link>.</p></section>
    <section><h2>Working with a sequence</h2><p>In the <Link href="/workspace">workspace</Link> you can copy each prompt, copy the whole sequence, export it as a text file, mark steps complete as you go, and share a private link to the sequence. If your scope changes after approval, the sequence regenerates from a newly approved understanding rather than drifting. To choose the tool you will run it in, read <Link href="/docs/build-targets">Choosing a build target</Link>.</p></section>
  </ContentPage>;
}
