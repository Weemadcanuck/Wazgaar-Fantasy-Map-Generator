import type { ReliefIcon } from "@/generators/relief-generator";

/** The existing optional relief line distinguishes not-yet-generated data from an intentionally empty array. */
export function serializeReliefData(relief: ReliefIcon[] | undefined): string {
  return relief === undefined ? "" : JSON.stringify(relief);
}

export function restoreReliefData(target: { relief?: ReliefIcon[] }, serialized?: string): void {
  if (serialized) target.relief = JSON.parse(serialized);
  else delete target.relief;
}
