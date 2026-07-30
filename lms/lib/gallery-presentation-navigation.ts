export function stepPresentationIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return ((current + delta) % count + count) % count;
}

export type PresentationSelection = {
  submissionId: string | null;
  index: number;
};

/**
 * Preserve the selected submission across live gallery refreshes. If it was
 * removed, prefer the nearest surviving neighbour from the prior ordering
 * (the following item wins a tie), then fall back to the first new item.
 */
export function reconcilePresentationSelection(
  selectedSubmissionId: string | null,
  previousSubmissionIds: readonly string[],
  nextSubmissionIds: readonly string[],
): PresentationSelection {
  if (nextSubmissionIds.length === 0) {
    return { submissionId: null, index: -1 };
  }

  if (selectedSubmissionId) {
    const retainedIndex = nextSubmissionIds.indexOf(selectedSubmissionId);
    if (retainedIndex !== -1) {
      return { submissionId: selectedSubmissionId, index: retainedIndex };
    }

    const previousIndex = previousSubmissionIds.indexOf(selectedSubmissionId);
    if (previousIndex !== -1) {
      for (let distance = 1; distance < previousSubmissionIds.length; distance += 1) {
        const followingId = previousSubmissionIds[previousIndex + distance];
        const precedingId = previousSubmissionIds[previousIndex - distance];
        const nearestId = [followingId, precedingId].find(
          (candidate): candidate is string =>
            typeof candidate === "string" && nextSubmissionIds.includes(candidate),
        );
        if (nearestId) {
          return { submissionId: nearestId, index: nextSubmissionIds.indexOf(nearestId) };
        }
      }
    }
  }

  return { submissionId: nextSubmissionIds[0], index: 0 };
}
