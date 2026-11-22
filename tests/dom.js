// Narrow DOM fixture for tracker injection/event tests, not a layout renderer.
import { setMaxListeners } from "node:events";
setMaxListeners(0);

class Node extends EventTarget {
  constructor() { super(); this.childNodes = []; }
  get children() { return this.childNodes.filter(c => c instanceof Element); }
  get isConnected() { return this.connectedRoot || this.parentElement?.isConnected || false; }
  append(...nodes) { for (const node of nodes) { node.remove(); this.childNodes.push(node); node.parentElement = this; } }
  prepend(node) { node.remove(); this.childNodes.unshift(node); node.parentElement = this; }
  remove() {
    if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter(e => e !== this);
    this.parentElement = null;
  }
  replaceChildren(...nodes) { for (const child of [...this.childNodes]) child.remove(); this.append(...nodes); }
  get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
  set textContent(value) { this.replaceChildren(); if (String(value)) this.append(new Text(String(value))); }
  dispatchEvent(event) {
    const result = super.dispatchEvent(event);
    if (event.bubbles && !event.cancelBubble) this.parentElement?.dispatchEvent(event);
    return result;
  }
}
class Text extends Node {
  constructor(text) { super(); this.text = text; }
  get textContent() { return this.text; }
}

export class Element extends Node {
  constructor(tag = "div") {
    super(); this.tagName = tag.toUpperCase(); this.dataset = {}; this.attributes = {};
    this.style = {}; this.className = ""; this.hidden = false;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const parts = new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled = force ?? !parts.has(name);
        if (enabled) parts.add(name); else parts.delete(name);
        this.className = [...parts].join(" "); return enabled;
      }
    };
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  removeAttribute(key) { delete this.attributes[key]; }
  getAttribute(key) { return this.attributes[key]; }
  matches(selector) {
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    if (selector.startsWith("[")) {
      const [key, value] = selector.slice(1, -1).split("=");
      const v = key.startsWith("data-") ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.getAttribute(key);
      return value === undefined ? v !== undefined : v === value.replaceAll('"', "").replaceAll("'", "");
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
  querySelectorAll(selectors) {
    const alternatives = selectors.split(",").map(s => s.trim());
    const descendants = this.children.flatMap(c => [c, ...c.querySelectorAll("*")]);
    return descendants.filter(c => alternatives.some(s => s === "*" || c.matches(s)));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  insertAdjacentElement(where, node) {
    const parent = this.parentElement; node.remove();
    const offset = where === "afterend" ? 1 : where === "beforebegin" ? 0 : null;
    if (offset === null) throw new Error("Unsupported fixture insertion.");
    parent.childNodes.splice(parent.childNodes.indexOf(this) + offset, 0, node); node.parentElement = parent;
  }
  focus() {
    if (document.activeElement !== this) document.activeElement?.dispatchEvent(new Event("blur"));
    document.activeElement = this; this.dispatchEvent(new Event("focusin", { bubbles: true }));
  }
  blur() { this.dispatchEvent(new Event("blur")); if (document.activeElement === this) document.activeElement = null; }
  select() { this.selected = true; }
  getBoundingClientRect() { return { left: 20, top: 20, bottom: 40, width: 260, height: 50 }; }
}

export function dom() {
  globalThis.HTMLElement = Element;
  const body = new Element("body"); body.connectedRoot = true;
  globalThis.document = { body, createElement: tag => new Element(tag), activeElement: null };
  globalThis.innerWidth = 1000; globalThis.innerHeight = 800;
  return body;
}

export function trackerFixture(combat, { popout = false, nativeControls = true, footer = true, timer = true, header = true, list = true } = {}) {
  const root = new Element("section");
  if (header) {
    const head = new Element("header"); head.className = "combat-tracker-header";
    head.setAttribute("data-application-part", "header"); head.textContent = "Round and settings"; root.append(head);
  }
  let listNode = root;
  if (list) {
    listNode = new Element("ol"); listNode.className = "directory-list";
    listNode.setAttribute("data-application-part", "tracker"); root.append(listNode);
  }
  for (const combatant of combat?.combatants ?? []) {
    const row = new Element("li"); row.dataset.combatantId = combatant.id;
    const controls = new Element("div"); controls.className = "combatant-controls";
    const target = new Element("a"); target.className = "native-target"; controls.append(target);
    const initiative = new Element("div"); initiative.className = "token-initiative";
    if (combatant.initiative == null) { const die = new Element("a"); die.className = "native-roll"; initiative.append(die); }
    else initiative.textContent = combatant.initiative.toFixed(2);
    row.append(controls, initiative); listNode.append(row);
  }
  if (footer) {
    const node = new Element("footer");
    if (nativeControls) { const native = new Element("nav"); native.className = "combat-controls"; node.append(native); }
    if (timer) { const timing = new Element("div"); timing.className = "zft-turn-time-controls"; node.append(timing); }
    root.append(node);
  }
  document.body.append(root);
  const app = { viewed: combat, isPopout: popout, bringToFront() { this.focused = true; } };
  return { root, app };
}
