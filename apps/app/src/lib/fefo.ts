export interface FefoBatch {
  id: string;
  quantity: number;
}

export interface FefoAllocation {
  batchId: string;
  quantity: number;
}

/**
 * Takes `quantity` from `batches` in the order given, which the caller sorts
 * first-expired, first-out. Returns null if the batches can't cover it.
 */
export function allocateFefo(
  batches: FefoBatch[],
  quantity: number,
): FefoAllocation[] | null {
  const allocations: FefoAllocation[] = [];
  let remaining = quantity;

  for (const batch of batches) {
    if (remaining === 0) {
      break;
    }
    const taken = Math.min(remaining, batch.quantity);
    allocations.push({ batchId: batch.id, quantity: taken });
    remaining -= taken;
  }

  return remaining === 0 ? allocations : null;
}
