import { PgBoss } from "pg-boss";

export const ANALYZE_QUEUE = "vibesclone.analyze";
export const GENERATE_QUEUE = "vibesclone.generate";
let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  starting ??= (async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const instance = new PgBoss(process.env.DATABASE_URL);
    instance.on("error", (error) => console.error("[queue]", error instanceof Error ? error.message : "unknown error"));
    await instance.start();
    await instance.createQueue(ANALYZE_QUEUE, { retryLimit: 2, retryDelay: 15, retryBackoff: true });
    await instance.createQueue(GENERATE_QUEUE, { retryLimit: 2, retryDelay: 15, retryBackoff: true });
    boss = instance;
    return instance;
  })();
  try {
    return await starting;
  } catch (error) {
    starting = null;
    throw error;
  }
}

export async function enqueueAnalysis(projectId: string, runId: string): Promise<string> {
  const id = await (await getBoss()).send(ANALYZE_QUEUE, { projectId, runId }, { singletonKey: runId });
  if (!id) throw new Error("Could not enqueue analysis.");
  return id;
}

export async function enqueueGeneration(projectId: string, runId: string): Promise<string> {
  const id = await (await getBoss()).send(GENERATE_QUEUE, { projectId, runId }, { singletonKey: runId });
  if (!id) throw new Error("Could not enqueue generation.");
  return id;
}
