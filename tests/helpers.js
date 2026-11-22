import { ID } from "../scripts/constants.js";

export class Collection extends Array {
  get size() { return this.length; }
  get(id) { return this.find(row => row.id === id); }
}

export function fakeCombat({ round = 1, id = "combat-a" } = {}) {
  const actor = owners => ({ testUserPermission: user => owners.includes(user.id) });
  const combat = {
    id, name: "Test Encounter", round, turn: 0, scene: { id: "scene-a" }, flags: {}, writes: [],
    combatants: new Collection(
      { id: "a", name: "Merrick", initiative: 21, actor: actor(["player"]), defeated: false },
      { id: "b", name: "Goblin", initiative: 16, actor: actor([]), defeated: false },
      { id: "c", name: "Goblin", initiative: 8, actor: actor([]), defeated: false },
      { id: "d", name: "Ally", initiative: 4, actor: actor(["offline"]), defeated: false }
    ),
    get turns() { return [...this.combatants].sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity) || a.id.localeCompare(b.id)); },
    get combatant() { return this.turns[this.turn]; },
    async update(changes) {
      this.writes.push({ kind: "combat", changes });
      for (const [key, value] of Object.entries(changes)) {
        if (key.startsWith("flags.")) {
          const [, namespace, field] = key.split(".");
          (this.flags[namespace] ??= {})[field] = structuredClone(value);
        } else this[key] = value;
      }
      return this;
    },
    async updateEmbeddedDocuments(type, updates) {
      this.writes.push({ kind: type, updates });
      for (const u of updates) Object.assign(this.combatants.get(u._id), { initiative: u.initiative });
      if (this.failEmbedded) { this.failEmbedded = false; throw new Error("embedded update failed"); }
      return updates;
    },
    async setInitiative(id, initiative) {
      // Public V13 contract stub, not Foundry's actual lifecycle implementation.
      const current = this.combatant?.id;
      this.writes.push({ kind: "setInitiative", id, initiative });
      this.combatants.get(id).initiative = initiative;
      if (current) this.turn = this.turns.findIndex(c => c.id === current);
    },
    async rollInitiative(ids, options) {
      this.writes.push({ kind: "roll", ids, options });
      const current = this.combatant?.id;
      ids.forEach((id, i) => { this.combatants.get(id).initiative = 10 + i; });
      if (options.updateTurn) this.turn = this.turns.findIndex(c => c.id === current);
      return this;
    },
    getFlag(namespace, key) { return this.flags[namespace]?.[key]; },
    async setFlag(namespace, key, value) { (this.flags[namespace] ??= {})[key] = structuredClone(value); }
  };
  return combat;
}

export function setup(combat = fakeCombat(), overrides = {}) {
  const settings = { includeDefeated: true, rollUnowned: true, announcements: true, autoRoundNotices: true, showNotices: true, noticeDuration: 4, transitionNoticeDuration: 8, ...overrides };
  globalThis.game = {
    user: { id: "gm", isGM: true, isActiveGM: true },
    users: new Collection({ id: "gm", isGM: true, active: true }, { id: "player", isGM: false, active: true }, { id: "offline", isGM: false, active: false }),
    combats: new Collection(combat), combat, journal: new Collection(),
    settings: { get: (id, key) => settings[key], set: async (id, key, value) => { settings[key] = structuredClone(value); return value; } }
  };
  game.combats.viewed = combat;
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.JournalEntry = {
    async create(data) {
      const journal = { id: `journal-${game.journal.length}`, ...structuredClone(data),
        getFlag(namespace, key) { return this.flags[namespace]?.[key]; },
        async setFlag(namespace, key, value) { this.flags[namespace][key] = structuredClone(value); },
        testUserPermission(user, _permission) { return user.isGM || (this.ownership[user.id] ?? this.ownership.default ?? 0) >= 1; }
      };
      game.journal.push(journal);
      return journal;
    }
  };
  return { combat, settings, ID };
}
