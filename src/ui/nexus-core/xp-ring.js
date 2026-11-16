// Five 20-XP sectors, clockwise from the top divider. Keep the fill inside
// the dark track and leave the PNG's gold dividers uncovered.
export function xpRingSegments(xp) {
  const value = Math.min(100, Math.max(0, Number(xp) || 0));
  const point = degrees => {
    const radians = degrees * Math.PI / 180;
    return `${(100 + 79 * Math.cos(radians)).toFixed(4)} ${(100 + 79 * Math.sin(radians)).toFixed(4)}`;
  };
  return Array.from({length: 5}, (_, index) => ({
    fraction: Math.min(1, Math.max(0, (value - index * 20) / 20)),
    path: `M ${point(-86 + index * 72)} A 79 79 0 0 1 ${point(-22 + index * 72)}`,
  }));
}
