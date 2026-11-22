import { SCHEMA, copy } from "./constants.js";

export function initiativeValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("An initiative value is invalid.");
  return n;
}

export function rowsFromCombat(combat) {
  return Array.from(combat.turns ?? []).map((c, order) => ({
    id: c.id, name: c.name ?? "Combatant", initiative: initiativeValue(c.initiative),
    defeated: Boolean(c.defeated), order, tokenId: c.tokenId ?? null
  }));
}

export function highest(rows, includeDefeated = true) {
  // Preserve the original macro's tracker-order tie behavior.
  return rows.filter(r => r.initiative !== null && (includeDefeated || !r.defeated))
    .reduce((best, row) => !best || row.initiative > best.initiative ? row : best, null);
}

export function createSnapshot(combat, { now = Date.now(), userId = null } = {}) {
  if (!Number.isInteger(combat.round) || combat.round < 1) throw new Error("Start or advance the round using Foundry's controls first.");
  const rows = rowsFromCombat(combat);
  if (!rows.length) throw new Error("This combat has no combatants.");
  return { schema: SCHEMA, combatId: combat.id, round: combat.round, capturedAt: now,
    capturedBy: userId, currentCombatantId: combat.combatant?.id ?? null, rows };
}

export function lockSnapshot(record, snapshot) {
  if (record.combatId !== snapshot.combatId) throw new Error("Snapshot belongs to a different combat.");
  if (record.rounds?.[snapshot.round]) throw new Error(`Round ${snapshot.round} already has a protected snapshot. Use Restore Current Round.`);
  const next = copy(record);
  next.rounds ??= {};
  next.rounds[snapshot.round] = copy(snapshot);
  return next;
}

export function restorePlan(snapshot, combat) {
  if (snapshot?.schema !== SCHEMA || snapshot.combatId !== combat.id || snapshot.round !== combat.round) {
    throw new Error("There is no matching protected snapshot for the current combat and round.");
  }
  const existing = new Set(Array.from(combat.combatants ?? []).map(c => c.id));
  const saved = new Set();
  const updates = [], missing = [];
  for (const row of snapshot.rows) {
    if (!row.id || saved.has(row.id)) throw new Error("The saved snapshot contains invalid combatant IDs.");
    saved.add(row.id);
    if (existing.has(row.id)) updates.push({ _id: row.id, initiative: initiativeValue(row.initiative) });
    else missing.push(row.name);
  }
  if (!updates.length) throw new Error("None of the saved combatants remain in this combat.");
  return { updates, missing, added: [...existing].filter(id => !saved.has(id)) };
}

export function fingerprint(combat) {
  return JSON.stringify({ id: combat.id, round: combat.round,
    active: combat.combatant?.id ?? null, rows: rowsFromCombat(combat) });
}

export function sameInitiative(snapshot, combat) {
  const a = snapshot.rows.map(r => [r.id, r.initiative]).sort();
  const b = rowsFromCombat(combat).map(r => [r.id, r.initiative]).sort();
  return JSON.stringify(a) === JSON.stringify(b);
}
