/** Slightly amplify ordinary wheel/trackpad panning without changing pinch zoom. */
export const WHEEL_PAN_SENSITIVITY = 1.35;

export function wheelUnit(event: WheelEvent, pageSize: number): number {
  if (event.deltaMode === 1) return 16;
  if (event.deltaMode === 2) return Math.max(1, pageSize);
  return 1;
}
