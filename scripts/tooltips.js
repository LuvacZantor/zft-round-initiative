let tooltip, currentTarget;

export function hideTooltip() {
  if (tooltip) tooltip.hidden = true;
  currentTarget?.removeAttribute("aria-describedby");
  currentTarget = null;
}

function showTooltip(element) {
  const text = element.dataset.zftRiTip;
  if (!text) return;
  hideTooltip();
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "zft-ri-tooltip";
    tooltip.setAttribute("role", "tooltip");
    document.body.append(tooltip);
  }
  tooltip.textContent = text;
  tooltip.hidden = false;
  currentTarget = element;
  element.setAttribute("aria-describedby", tooltip.id);
  const bounds = element.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - tip.width - 8))}px`;
  const below = bounds.bottom + 8;
  tooltip.style.top = `${Math.max(8, below + tip.height < innerHeight ? below : bounds.top - tip.height - 8)}px`;
}

// Disabled native buttons are not focusable; their wrapper supplies a keyboard
// focus target and the disabled reason without allowing the action to execute.
export function bindTooltips(root) {
  const controller = new AbortController();
  for (const element of root.querySelectorAll("[data-zft-ri-tip]")) {
    element.addEventListener("pointerenter", () => showTooltip(element), { signal: controller.signal });
    element.addEventListener("pointerleave", () => hideTooltip(), { signal: controller.signal });
    element.addEventListener("focusin", () => showTooltip(element), { signal: controller.signal });
    element.addEventListener("focusout", () => hideTooltip(), { signal: controller.signal });
  }
  root.addEventListener("keydown", event => { if (event.key === "Escape") hideTooltip(); }, { signal: controller.signal });
  return () => { controller.abort(); hideTooltip(); };
}
