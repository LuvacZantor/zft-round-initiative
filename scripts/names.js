const COMBAT_LOG = "zft-combat-log";
export const COMBAT_NAMES_KEY = `${COMBAT_LOG}.combatNames`;
const clean = value => typeof value === "string" ? value.trim() : "";

// Read-only, optional contract verified against Combat Log develop 457825c.
// Resolve on every render so an old cached fallback cannot mask a later name.
export function encounterName(combatId, nativeName = null, storedName = null) {
  if (game.modules?.get(COMBAT_LOG)?.active) {
    try {
      const names = game.settings.get(COMBAT_LOG, "combatNames");
      const name = Object.hasOwn(names ?? {}, combatId) ? clean(names[combatId]?.name) : "";
      if (name) return name;
    } catch { /* Optional module may not have registered its settings yet. */ }
  }
  return clean(nativeName) || clean(storedName) || `Combat ${String(combatId).slice(0, 6)}`;
}

export function isEncounterNameSetting(document) {
  return document?.key === COMBAT_NAMES_KEY;
}
