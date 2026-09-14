import type { SpineView } from "@/lib/shipyard/view-models";
import { CheckpointCard } from "./checkpoint-card";
import { NoCheckpoints } from "./empty-states";

// The vertical of six, in fixed order. The hairline connecting them is drawn
// by the gutter of each card, so the rail itself is just a list.

export function CheckpointRail({ spine }: { spine: SpineView }) {
  if (spine.checkpoints.length === 0) return <NoCheckpoints />;
  return (
    <div className="sy-rail">
      {spine.checkpoints.map((c) => (
        <CheckpointCard key={c.id} checkpoint={c} spine={spine} />
      ))}
    </div>
  );
}
