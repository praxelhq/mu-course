import { notFound } from "next/navigation";
import { DataRaceProjector, type ProjectorState } from "@/app/projector/data-race/projector-client";

export default function DataRaceProjectorFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  const names = ["Aarav Sharma", "Meera Iyer", "Kabir Singh", "Ananya Rao", "Rohan Mehta", "Ishita Jain", "Arjun Nair", "Sara Khan", "Vihaan Gupta", "Diya Patel"];
  const state: ProjectorState = {
    serverNow: new Date().toISOString(),
    sectionCode: "A",
    phase: "leaderboard",
    currentPosition: 4,
    totalQuestions: 10,
    responseCount: 49,
    participantCount: 56,
    question: null,
    leaderboard: names.map((name, index) => ({
      rank: index + 1,
      movement: index === 0 ? 2 : index === 1 ? -1 : index % 3 === 0 ? 1 : 0,
      name,
      correct: 4 - Math.floor(index / 4),
      accuracy: Math.max(50, 100 - index * 5),
      avgSeconds: Number((8.4 + index * 1.2).toFixed(1)),
      streak: Math.max(0, 4 - Math.floor(index / 3)),
      totalPoints: 4130 - index * 175,
    })),
  };
  return <DataRaceProjector sectionCode="A" initialState={state} poll={false} />;
}
