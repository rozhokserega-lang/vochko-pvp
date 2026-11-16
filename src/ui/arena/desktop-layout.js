// Full-viewport world geometry. Sprites keep a uniform scale instead of being
// stretched with the viewport; bases follow the three lanes in the world art.
export const DESKTOP_WORLD = { width: 1672, height: 941, lanes: [.327, .52, .717], badges: [.25, .45, .64] };
export function desktopWorldMetrics(width, height) {
  const scale = Math.max(width / DESKTOP_WORLD.width, height / DESKTOP_WORLD.height);
  // Extreme aspect ratios expand the environment rather than clipping a lane.
  if(width/height>2||width/height<1.5)return {width,height,scale,worldWidth:width,worldHeight:height,x:0,y:0};
  return { width, height, scale, worldWidth: DESKTOP_WORLD.width * scale, worldHeight: DESKTOP_WORLD.height * scale,
    x: (width - DESKTOP_WORLD.width * scale) / 2, y: (height - DESKTOP_WORLD.height * scale) / 2 };
}
export function desktopObjectFrame(box, metrics, { lane, nexus = false } = {}) {
  const spriteScale = metrics.worldHeight * (nexus ? .43 / 473 : .17 / 208);
  const width = box.w * spriteScale, height = box.h * spriteScale;
  const anchor=box.anchorX??.5;
  const foundation=box.cx-(.5-anchor)*box.w;
  const cx = Math.max(width / 2 + 10, Math.min(metrics.width - width / 2 - 10, metrics.x + foundation / 1600 * metrics.worldWidth + (.5-anchor)*width));
  const bottom = metrics.y + metrics.worldHeight * (nexus ? .57 : DESKTOP_WORLD.lanes[lane]);
  return { left: cx - width / 2, top: bottom - height, width, height, bottom };
}
export const desktopLaneY = (lane, metrics) => metrics.y + DESKTOP_WORLD.badges[lane] * metrics.worldHeight;
