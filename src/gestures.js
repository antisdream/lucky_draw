// Normalized coordinates keep the same gesture rules across screen sizes.
export function dartLayout(w, h) {
  return { x: w / 2, y: h * .35, radius: Math.min(w * .34, h * .29), launchX: w / 2, launchY: h * .88 };
}
export function evaluateThrow(start, end, w, h) {
  const board = dartLayout(w, h), dx = end.x - start.x, dy = end.y - start.y;
  const x = end.x + dx * .12, y = end.y + dy * .12;
  const upward = dy <= -Math.max(24, h * .09);
  return { x, y, hit: upward && Math.hypot(x - board.x, y - board.y) <= board.radius,
    valid: upward, fromX: start.x, fromY: start.y, width:w, height:h };
}
export function tailSlot(x, width) {
  return Math.max(0, Math.min(4, Math.floor((x / width - .1) / .16)));
}
export function pullAccepted(start, end, height) {
  return end.y - start.y >= Math.max(30, height * .13);
}
