export const COMPACT_WIDTH = 284;
export const EXPANDED_WIDTH = 470;
const coordinate = value => typeof value === "number" && Number.isFinite(value) ? value : null;

export function normalizePreferences(value = {}) {
  if (!value || typeof value !== "object") value = {};
  return { compact: value.compact !== false, left: coordinate(value.left), top: coordinate(value.top),
    expandedWidth: Math.max(360, Math.min(900, coordinate(value.expandedWidth) ?? EXPANDED_WIDTH)) };
}

export function clampPosition(position, viewport) {
  const margin = 8;
  const width = Math.min(position.width, Math.max(0, viewport.width - margin * 2));
  const height = Number.isFinite(position.height) ? position.height : 120;
  const maxLeft = Math.max(0, viewport.width - width - margin);
  const maxTop = Math.max(0, viewport.height - Math.min(height, viewport.height) - margin);
  return { width, left: Math.max(0, Math.min(position.left ?? margin, maxLeft)),
    top: Math.max(0, Math.min(position.top ?? margin, maxTop)) };
}
