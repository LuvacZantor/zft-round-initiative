import { activeGM } from "./constants.js";

// Seed at ready and update on EVERY client, including non-active GMs. Only the
// active GM may publish. Nothing is replayed simply because a client reloads.
export class RoundTransitions {
  constructor(publish) { this.publish = publish; this.rounds = new Map(); }
  remember(combat) {
    if (Number.isInteger(combat?.round)) this.rounds.set(combat.id, combat.round);
  }
  seed(combats) { for (const combat of combats ?? []) this.remember(combat); }
  forget(combat) { this.rounds.delete(combat.id); }

  async observe(combat, changes) {
    if (!Object.hasOwn(changes, "round")) return false;
    const previous = this.rounds.get(combat.id);
    this.remember(combat);
    const round = combat.round;
    // Do not invent a completion notice for reloads, rewinds or manual jumps.
    if (!Number.isInteger(previous) || previous < 0 || round !== previous + 1 || round < 1 || !activeGM()) return false;
    const title = previous === 0 ? "Prepare for Round 1" : `Round ${previous} Complete`;
    return this.publish(combat, title, `Prepare for Round ${round}. Waiting for the GM to request initiative.`,
      { kind: "transition", round, previousRound: previous });
  }
}
