import test from "node:test";
import assert from "node:assert/strict";
import { bindTooltips, hideTooltip } from "../scripts/tooltips.js";

class Element extends EventTarget {
  constructor() { super(); this.attributes = {}; this.dataset = {}; this.style = {}; this.hidden = false; this.children = []; }
  setAttribute(k, v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; }
  append(child) { this.children.push(child); }
  getBoundingClientRect() { return { left: 700, top: 530, bottom: 560, width: 260, height: 80 }; }
  querySelectorAll() { return this.children; }
}

test("tooltip works on pointer and keyboard focus, describes disabled actions, and cleans up", () => {
  const body = new Element();
  globalThis.document = { body, createElement: () => new Element() };
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
  const root = new Element();
  const disabledWrapper = new Element();
  disabledWrapper.dataset.zftRiTip = "Restore Current Round. Unavailable: No starting snapshot.";
  root.children.push(disabledWrapper);
  const release = bindTooltips(root);
  disabledWrapper.dispatchEvent(new Event("focusin"));
  const tip = body.children[0];
  assert.equal(tip.textContent, disabledWrapper.dataset.zftRiTip);
  assert.equal(tip.hidden, false);
  assert.equal(tip.attributes.role, "tooltip");
  assert.equal(disabledWrapper.attributes["aria-describedby"], "zft-ri-tooltip");
  assert(Number.parseInt(tip.style.left) + 260 <= 792);
  assert(Number.parseInt(tip.style.top) + 80 < 600);
  root.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  assert.equal(tip.hidden, true);
  disabledWrapper.dispatchEvent(new Event("pointerenter"));
  assert.equal(tip.hidden, false);
  disabledWrapper.dispatchEvent(new Event("pointerleave"));
  assert.equal(tip.hidden, true);
  release();
  disabledWrapper.dispatchEvent(new Event("focusin"));
  assert.equal(tip.hidden, true);
  hideTooltip();
});
