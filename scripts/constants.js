export const ID = "zft-round-initiative";
export const VERSION = "13.0.0-dev.6";
export const SCHEMA = 1;
export const LOG = `[ZFT] Round Initiative v${VERSION}`;
export const copy = value => JSON.parse(JSON.stringify(value));
export const setting = key => game.settings.get(ID, key);
export const activeGM = () => Boolean(game.user?.isGM && game.user?.isActiveGM);
export const reportError = error => {
  console.error(`${LOG} | Action failed`, error);
  ui.notifications.error(error?.message ?? "Round Initiative failed. See [ZFT] console diagnostics.");
};
