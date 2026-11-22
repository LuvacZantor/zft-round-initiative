import { ID, SCHEMA, activeGM, copy } from "./constants.js";
import { encounterName } from "./names.js";

// History is deliberately kept in GM-only world JournalEntries, not public
// Combat flags or chat messages. Records survive combat deletion and refresh.
export class HistoryStore {
  journals() {
    if (!game.user?.isGM) throw new Error("Only a GM can view initiative history.");
    return Array.from(game.journal ?? []).filter(j => j.getFlag(ID, "record")?.schema === SCHEMA);
  }

  assertPrivate(journal) {
    if (game.users.some(u => !u.isGM && journal.testUserPermission(u, "LIMITED"))) {
      throw new Error("The initiative history journal is shared with players. Remove player access before using it.");
    }
  }

  find(combatId) {
    const matches = this.journals().filter(j => j.getFlag(ID, "record").combatId === combatId);
    if (matches.length > 1) throw new Error("Multiple history journals match this combat. Resolve the duplicate before continuing.");
    if (matches[0]) this.assertPrivate(matches[0]);
    return matches[0] ?? null;
  }

  read(combat) {
    const journal = this.find(combat.id);
    const record = journal ? copy(journal.getFlag(ID, "record")) : {
      schema: SCHEMA, combatId: combat.id,
      sceneId: combat.scene?.id ?? null, createdAt: Date.now(), rounds: {}, state: { phase: "idle" }
    };
    record.name = encounterName(combat.id, combat.name, record.name);
    return record;
  }

  async write(combat, record) {
    if (!activeGM()) throw new Error("Only the active GM can change round initiative.");
    if (record.schema !== SCHEMA || record.combatId !== combat.id) throw new Error("Invalid initiative history record.");
    let journal = this.find(combat.id);
    if (!journal) {
      const ownership = { default: 0 };
      for (const user of game.users) if (!user.isGM) ownership[user.id] = 0;
      journal = await JournalEntry.create({ name: `Round Initiative: ${record.name}`, ownership,
        pages: [], flags: { [ID]: { record: copy(record) } } });
    } else {
      // Recheck that no caller changes an existing protected baseline.
      const previous = journal.getFlag(ID, "record");
      for (const [round, snapshot] of Object.entries(previous.rounds ?? {})) {
        if (JSON.stringify(record.rounds?.[round]) !== JSON.stringify(snapshot)) {
          throw new Error(`Protected Round ${round} cannot be overwritten.`);
        }
      }
      await journal.setFlag(ID, "record", copy(record));
    }
    return journal;
  }

  all() {
    return this.journals().map(j => {
      this.assertPrivate(j);
      const record = copy(j.getFlag(ID, "record"));
      record.name = encounterName(record.combatId, game.combats?.get(record.combatId)?.name, record.name);
      return { journalId: j.id, ...record };
    }).sort((a, b) => b.createdAt - a.createdAt);
  }
}
