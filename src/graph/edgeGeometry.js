export const SELF_LOOP_OFFSET = 140;

/** Default quadratic-curve control point for forward, back, and self-loop edges. */
export function initialControlPoint(sourceX, sourceY, targetX, targetY, selfLoop = false) {
  const bendsBack = selfLoop || targetY < sourceY;
  return {
    x: (sourceX + targetX) / 2 + (bendsBack ? SELF_LOOP_OFFSET : 0),
    y: (sourceY + targetY) / 2,
  };
}
