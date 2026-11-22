import { ID, activeGM, setting } from "./constants.js";

let timer;
const seen = new Set();
const lastShown = new Map();
const writes = new Map();

export async function announce(combat, title, message, { kind = "info", round = Math.max(1, combat.round), previousRound = null } = {}) {
  // Per-combat serialization ensures an automatic preparation notice cannot
  // arrive after the newer manual Roll Initiative notice from this GM.
  const previousWrite = writes.get(combat.id) ?? Promise.resolve();
  const write = previousWrite.catch(() => {}).then(async () => {
    if (!activeGM() || !setting("announcements") || game.combats?.get(combat.id) !== combat || Math.max(1, combat.round) !== round) return false;
    const previous = combat.getFlag(ID, "notice");
    if (kind === "transition") {
      if (!setting("autoRoundNotices") || (combat.getFlag(ID, "transitionRound") ?? 0) >= round) return false;
      if (previous?.round === round && previous.kind && previous.kind !== "transition") return false;
    }
  // Native document replication supplies the same notice to connected clients.
  // Public presentation flags contain no initiative values or hidden NPC names.
    const notice = { id: foundry.utils.randomID(), senderId: game.user.id, kind, round, previousRound,
      at: Math.max(Date.now(), (previous?.at ?? 0) + 1),
      duration: Math.max(2, Math.min(12, Number(setting(kind === "transition" ? "transitionNoticeDuration" : "noticeDuration")) || (kind === "transition" ? 8 : 4))),
      title, message };
    if (kind === "transition") {
      // Publish the deduplication marker and notice in ONE native update.
      await combat.update({ [`flags.${ID}.transitionRound`]: round, [`flags.${ID}.notice`]: notice });
    } else await combat.setFlag(ID, "notice", notice);
    return true;
  });
  writes.set(combat.id, write);
  try { return await write; }
  finally { if (writes.get(combat.id) === write) writes.delete(combat.id); }
}

export function showNotice(combat, userId = null) {
  if (!setting("showNotices")) return;
  const notice = combat?.getFlag(ID, "notice");
  if (!notice || seen.has(notice.id) || !game.users.get(notice.senderId)?.isGM) return;
  // A persisted transition banner must not replay on ready/reload.
  if (userId === null && notice.kind === "transition") return;
  if (userId && !game.users.get(userId)?.isGM) return;
  if (notice.round !== undefined && notice.round !== Math.max(1, combat.round)) return;
  if (notice.at <= (lastShown.get(combat.id) ?? 0)) return;
  // Match native tracker selection. Reconnecting clients ignore expired notices.
  const viewed = ui.combat?.viewed ?? game.combats?.viewed ?? game.combat;
  if (viewed?.id !== combat.id) return;
  const duration = Math.max(2, Math.min(12, Number(notice.duration) || 4));
  const remaining = notice.at + duration * 1000 - Date.now();
  if (remaining <= 0 || notice.at > Date.now() + 3000) return;
  seen.add(notice.id);
  lastShown.set(combat.id, notice.at);
  if (seen.size > 100) seen.delete(seen.values().next().value);
  let root = document.getElementById("zft-ri-notice");
  if (!root) {
    root = document.createElement("section");
    root.id = "zft-ri-notice";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    document.body.append(root);
  }
  root.replaceChildren();
  const title = document.createElement("div");
  title.className = "zft-ri-notice-title";
  title.textContent = String(notice.title).slice(0, 120);
  const message = document.createElement("div");
  message.className = "zft-ri-notice-message";
  message.textContent = String(notice.message).slice(0, 240);
  root.append(title, message);
  root.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { root.hidden = true; }, remaining);
}

export function hideNotice() {
  clearTimeout(timer);
  const root = document.getElementById("zft-ri-notice");
  if (root) root.hidden = true;
}
