import { ANALYZE_QUEUE, GENERATE_QUEUE, getBoss } from "@/lib/queue";
import { analyzeProject, generateProjectPrompts } from "./jobs";

async function main(): Promise<void> {
  const boss = await getBoss();
  const concurrency = Math.max(1, Math.min(12, Number(process.env.JOB_CONCURRENCY ?? "4")));
  await boss.work(ANALYZE_QUEUE, { localConcurrency: concurrency }, async ([job]) => analyzeProject(job.data as { projectId: string; runId: string }));
  await boss.work(GENERATE_QUEUE, { localConcurrency: concurrency }, async ([job]) => generateProjectPrompts(job.data as { projectId: string; runId: string }));
  console.log(`[worker] ready with concurrency ${concurrency}`);
}

main().catch((error) => {
  console.error("[worker] fatal", error instanceof Error ? error.message : error);
  process.exit(1);
});
