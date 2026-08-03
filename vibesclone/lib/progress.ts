export type OrderedStep = { order: number };

// Persisted orders can reference steps the current view does not render (for
// example follow-ups after a license was revoked); every derivation filters to
// the rendered steps so stale orders never distort the UI.
export function completedIndexes(steps: OrderedStep[], completedOrders: number[]): Set<number> {
  const persisted = new Set(completedOrders);
  const indexes = new Set<number>();
  steps.forEach((step, index) => {
    if (persisted.has(step.order)) indexes.add(index);
  });
  return indexes;
}

export function firstIncompleteIndex(steps: OrderedStep[], completedOrders: number[]): number {
  const done = completedIndexes(steps, completedOrders);
  const index = steps.findIndex((_, i) => !done.has(i));
  return index === -1 ? 0 : index;
}

export function nextIncompleteIndex(steps: OrderedStep[], completedOrders: number[], current: number): number | null {
  const done = completedIndexes(steps, completedOrders);
  for (let index = current + 1; index < steps.length; index += 1) {
    if (!done.has(index)) return index;
  }
  return null;
}
