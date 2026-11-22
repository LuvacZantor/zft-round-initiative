import test from "node:test";
import assert from "node:assert/strict";
import { RoundTransitions } from "../scripts/transitions.js";
import { announce, showNotice, hideNotice } from "../scripts/presentation.js";
import { ID } from "../scripts/constants.js";
import { RoundService } from "../scripts/service.js";
import { HistoryStore } from "../scripts/store.js";
import { setup, fakeCombat } from "./helpers.js";

function environment(round = 1, settings = {}) {
  const env = setup(fakeCombat({ round }), settings);
  let nonce = 0;
  globalThis.foundry = { utils: { randomID: () => `notice-${++nonce}` } };
  const observer = new RoundTransitions(announce);
  observer.seed(game.combats);
  return { ...env, observer };
}

test("native 1 -> 2 announces Round 1 complete and prepares Round 2 without changing initiative or pointer", async () => {
  const { combat, observer } = environment();
  combat.turn = 2;
  const initiatives = combat.combatants.map(c => c.initiative);
  const current = combat.combatant.id;
  combat.round = 2;
  assert.equal(await observer.observe(combat, { round: 2 }), true);
  const notice = combat.getFlag(ID, "notice");
  assert.equal(notice.title, "Round 1 Complete");
  assert.match(notice.message, /Prepare for Round 2/);
  assert.equal(notice.round, 2);
  assert.equal(combat.getFlag(ID, "transitionRound"), 2);
  assert.deepEqual(combat.combatants.map(c => c.initiative), initiatives);
  assert.equal(combat.combatant.id, current);
  assert.equal(combat.round, 2);
  assert.equal(combat.writes.length, 1);
  assert(Object.keys(combat.writes[0].changes).every(k => k.startsWith(`flags.${ID}.`)));
  assert.equal(game.journal.length, 0);
});

test("initial start prepares Round 1 without claiming that Round 0 completed", async () => {
  const { combat, observer } = environment(0);
  combat.round = 1;
  await observer.observe(combat, { round: 1 });
  assert.equal(combat.getFlag(ID, "notice").title, "Prepare for Round 1");
  assert(!JSON.stringify(combat.getFlag(ID, "notice")).includes("Round 0"));
});

test("seed, non-round updates, duplicate round events and reconnect seeding produce no replay", async () => {
  const { combat, observer } = environment(2);
  assert.equal(combat.writes.length, 0);
  await observer.observe(combat, { turn: 1 });
  await observer.observe(combat, { round: 2 });
  assert.equal(combat.writes.length, 0);
  combat.round = 3;
  await observer.observe(combat, { round: 3 });
  await observer.observe(combat, { round: 3 });
  const reconnected = new RoundTransitions(announce);
  reconnected.seed(game.combats);
  await reconnected.observe(combat, { round: 3 });
  assert.equal(combat.writes.length, 1);
});

test("backward changes and manual forward jumps do not fabricate completed rounds", async () => {
  const { combat, observer } = environment(3);
  combat.round = 1;
  await observer.observe(combat, { round: 1 });
  combat.round = 4;
  await observer.observe(combat, { round: 4 });
  assert.equal(combat.writes.length, 0);
  combat.round = 5;
  await observer.observe(combat, { round: 5 });
  assert.equal(combat.getFlag(ID, "notice").title, "Round 4 Complete");
});

test("only the active GM publishes, while other clients still track round changes", async () => {
  const { combat, observer } = environment();
  game.user.isActiveGM = false;
  combat.round = 2;
  await observer.observe(combat, { round: 2 });
  assert.equal(combat.writes.length, 0);
  assert.equal(observer.rounds.get(combat.id), 2);
  game.user.isActiveGM = true;
  await observer.observe(combat, { round: 2 }); // Handoff must not replay it.
  assert.equal(combat.writes.length, 0);
  combat.round = 3;
  await observer.observe(combat, { round: 3 });
  assert.equal(combat.getFlag(ID, "notice").title, "Round 2 Complete");
});

test("persisted marker prevents a second observer/GM from repeating the same transition", async () => {
  const { combat, observer } = environment();
  const peer = new RoundTransitions(announce);
  peer.seed(game.combats);
  combat.round = 2;
  await Promise.all([observer.observe(combat, { round: 2 }), peer.observe(combat, { round: 2 })]);
  assert.equal(combat.writes.length, 1);
});

test("automatic and global announcement settings suppress only presentation", async () => {
  const { combat, observer, settings } = environment(1, { autoRoundNotices: false });
  combat.round = 2;
  await observer.observe(combat, { round: 2 });
  assert.equal(combat.writes.length, 0);
  assert.equal(await announce(combat, "Roll", "Roll now", { kind: "roll", round: 2 }), true);
  settings.announcements = false;
  combat.round = 3;
  await observer.observe(combat, { round: 3 });
  assert.equal(combat.getFlag(ID, "notice").round, 2);
});

test("queued publishers stop if the combat is deleted, the round changes again, or GM authority is lost", async () => {
  const { combat, observer } = environment();
  combat.round = 2;
  const pending = observer.observe(combat, { round: 2 });
  game.combats.length = 0;
  await pending;
  assert.equal(combat.writes.length, 0);
  game.combats.push(combat);
  const stale = announce(combat, "Prepare", "Stale", { kind: "transition", round: 2 });
  combat.round = 3;
  await stale;
  assert.equal(combat.writes.length, 0);
  const lostAuthority = announce(combat, "Prepare", "Stale", { kind: "transition", round: 3 });
  game.user.isActiveGM = false;
  await lostAuthority;
  assert.equal(combat.writes.length, 0);
});

test("a late automatic notice cannot replace an already-requested manual roll prompt", async () => {
  const { combat, observer } = environment();
  combat.round = 2;
  const roll = announce(combat, "Round 2: Roll Initiative", "Roll now", { kind: "roll", round: 2 });
  const automatic = observer.observe(combat, { round: 2 });
  await Promise.all([roll, automatic]);
  assert.equal(combat.getFlag(ID, "notice").kind, "roll");
  assert.equal(combat.writes.length, 0); // Manual notice uses setFlag.
});

test("preparation then manual roll is ordered, with monotonic notice timestamps", async () => {
  const { combat, observer } = environment();
  combat.round = 2;
  const prepare = observer.observe(combat, { round: 2 });
  const roll = announce(combat, "Round 2: Roll Initiative", "Roll now", { kind: "roll", round: 2 });
  await Promise.all([prepare, roll]);
  const automatic = combat.writes[0].changes[`flags.${ID}.notice`];
  assert.equal(combat.getFlag(ID, "notice").kind, "roll");
  assert(combat.getFlag(ID, "notice").at > automatic.at);
});

test("automatic notices default to eight seconds while manual preferences remain independent", async () => {
  const { combat, observer, settings } = environment();
  combat.round = 2;
  await observer.observe(combat, { round: 2 });
  assert.equal(combat.getFlag(ID, "notice").duration, 8);
  await announce(combat, "Roll", "Roll now", { kind: "roll", round: 2 });
  assert.equal(combat.getFlag(ID, "notice").duration, 4);
  settings.noticeDuration = 9;
  settings.transitionNoticeDuration = 11;
  combat.round = 3;
  await observer.observe(combat, { round: 3 });
  assert.equal(combat.getFlag(ID, "notice").duration, 11);
  await announce(combat, "Begins", "Ready", { kind: "begin", round: 3 });
  assert.equal(combat.getFlag(ID, "notice").duration, 9);
  assert.equal(settings.noticeDuration, 9);
  assert.equal(settings.transitionNoticeDuration, 11);
});

test("starting initiative collection before native Start Combat prevents a stale first-round preparation banner", async () => {
  const { combat, observer } = environment(0);
  await announce(combat, "Round 1: Roll Initiative", "Roll now", { kind: "roll", round: 1 });
  combat.round = 1;
  await observer.observe(combat, { round: 1 });
  assert.equal(combat.getFlag(ID, "notice").kind, "roll");
  assert.equal(combat.writes.length, 0);
});

test("transition leaves previously saved current-round history intact", async () => {
  const { combat, observer } = environment();
  const store = new HistoryStore();
  await new RoundService(store, { confirm: async () => true }).begin();
  const protectedRounds = structuredClone(store.read(combat).rounds);
  combat.round = 2;
  await observer.observe(combat, { round: 2 });
  assert.deepEqual(store.read(combat).rounds, protectedRounds);
  assert.equal(store.read(combat).rounds[2], undefined);
});

test("a failed automatic broadcast does not block a later manual request", async () => {
  const { combat, observer } = environment();
  combat.round = 2;
  combat.update = async () => { throw new Error("broadcast failed"); };
  const automatic = observer.observe(combat, { round: 2 });
  const manual = announce(combat, "Round 2: Roll Initiative", "Roll now", { kind: "roll", round: 2 });
  await assert.rejects(automatic, /broadcast failed/);
  await manual;
  assert.equal(combat.getFlag(ID, "notice").kind, "roll");
});

test("rapid native round changes publish only preparation for the latest round", async () => {
  const { combat, observer } = environment();
  combat.round = 2;
  const old = observer.observe(combat, { round: 2 });
  combat.round = 3;
  const latest = observer.observe(combat, { round: 3 });
  await Promise.all([old, latest]);
  assert.equal(combat.writes.length, 1);
  assert.equal(combat.getFlag(ID, "notice").title, "Round 2 Complete");
  assert.equal(combat.getFlag(ID, "notice").round, 3);
});

test("deprecated End Round API warns without clearing, rolling, announcing or changing phase", async () => {
  const { combat } = environment();
  const store = new HistoryStore();
  let noticeCount = 0, warning;
  const svc = new RoundService(store, { confirm: async () => true, announce: async () => { noticeCount++; } });
  ui.notifications.warn = message => { warning = message; };
  assert.equal(await svc.endRound(), false);
  assert.match(warning, /retired/);
  assert.equal(combat.writes.length, 0);
  assert.equal(game.journal.length, 0);
  assert.equal(noticeCount, 0);
});

class Element {
  constructor() { this.children = []; this.hidden = false; }
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
}

test("eight-second preparation stays visible until its timer or a newer manual prompt replaces it immediately", async () => {
  const { combat, observer } = environment();
  combat.id = "long-banner-combat";
  observer.seed(game.combats);
  const body = new Element();
  globalThis.document = { body, createElement: () => new Element(), getElementById: id => body.children.find(e => e.id === id) };
  const originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout, originalNow = Date.now;
  const scheduled = [], cleared = [];
  try {
    Date.now = () => 100000;
    globalThis.setTimeout = (callback, duration) => { const timer = { callback, duration }; scheduled.push(timer); return timer; };
    globalThis.clearTimeout = handle => { cleared.push(handle); };
    combat.round = 2;
    await observer.observe(combat, { round: 2 });
    showNotice(combat, "gm");
    assert.equal(scheduled.at(-1).duration, 8000);
    assert.equal(body.children[0].hidden, false);
    await announce(combat, "Round 2: Roll Initiative", "Roll now", { kind: "roll", round: 2 });
    showNotice(combat, "gm");
    assert.equal(body.children[0].children[0].textContent, "Round 2: Roll Initiative");
    assert.equal(scheduled.at(-1).duration, 4001);
    assert(cleared.includes(scheduled[0]));
    scheduled.at(-1).callback();
    assert.equal(body.children[0].hidden, true);
    hideNotice();
  } finally {
    globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear; Date.now = originalNow;
  }
});

test("transition notices do not replay on reload; stale notices cannot replace newer ones on clients", () => {
  const { combat } = environment(2);
  const body = new Element();
  globalThis.document = { body, createElement: () => new Element(), getElementById: id => body.children.find(e => e.id === id) };
  const set = value => { (combat.flags[ID] ??= {}).notice = value; };
  const now = Date.now();
  set({ id: "auto-reload", kind: "transition", round: 2, senderId: "gm", at: now, duration: 4, title: "Prepare", message: "Old" });
  showNotice(combat);
  assert.equal(body.children.length, 0);
  set({ id: "manual-new", kind: "roll", round: 2, senderId: "gm", at: now + 2, duration: 4, title: "Roll now", message: "New" });
  showNotice(combat, "gm");
  assert.equal(body.children[0].children[0].textContent, "Roll now");
  set({ id: "auto-delayed", kind: "transition", round: 2, senderId: "gm", at: now + 1, duration: 4, title: "Prepare", message: "Delayed" });
  showNotice(combat, "gm");
  assert.equal(body.children[0].children[0].textContent, "Roll now");
  hideNotice();
});
