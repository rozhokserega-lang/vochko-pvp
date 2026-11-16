// Core v2 is private authoritative state. Public board fields expose only combat facts.
export const XP_CORE_VERSION = 2;
export const CORE_UPGRADES = [
  { level: 1, xp: 20, icon: 'hp', text: '+5 HP Нексуса' },
  { level: 2, xp: 40, icon: 'attack', text: '+1 к урону атакующих пар' },
  { level: 3, xp: 60, icon: 'shield', text: '+3 к щиту Нексуса' },
  { level: 4, xp: 80, icon: 'attack', text: 'Ещё +1 к урону атакующих пар' },
  { level: 5, xp: 100, icon: 'hp', text: 'Ещё +10 HP Нексуса' },
];
export const isXpCore = rules => !!rules?.nexusCoreEnabled && rules.coreVersion === XP_CORE_VERSION;
export const coreLevel = xp => Math.min(5, Math.floor(Math.max(0, Number(xp) || 0) / 20));
export function coreProgress(board) {
  const xp = Math.min(100, Math.max(0, Math.floor(Number(board?.coreProgress?.xp) || 0)));
  return { xp, level: coreLevel(xp) };
}
export function coreBonuses(board) {
  const { level } = coreProgress(board);
  return { hp: (level >= 1 ? 5 : 0) + (level >= 5 ? 10 : 0), attack: (level >= 2 ? 1 : 0) + (level >= 4 ? 1 : 0), shield: level >= 3 ? 3 : 0 };
}
export function cardXp(card) {
  const rank = card?.rank ?? card?.r;
  const n = ({ J: 11, Q: 12, K: 13, A: 14 })[rank] ?? Number(rank);
  if (!Number.isInteger(n) || n < 2 || n > 14) throw new Error('Invalid Core card rank');
  return n;
}
export const nexusMaxHp = board => Math.max(80 + coreBonuses(board).hp, Number(board?.nexusMaxHp) || 80);
export const nexusShield = board => Math.max(coreBonuses(board).shield, Number(board?.nexusShield) || 0);
export function addCoreXp(board, amount) {
  const previousMax = nexusMaxHp(board);
  board.coreProgress = { xp: Math.min(100, coreProgress(board).xp + Math.max(0, Math.floor(Number(amount) || 0))) };
  board.coreProgress.level = coreLevel(board.coreProgress.xp);
  board.nexusMaxHp = nexusMaxHp(board);
  board.nexusShield = coreBonuses(board).shield;
  if (board.nexus > 0) board.nexus = Math.min(board.nexusMaxHp, board.nexus + board.nexusMaxHp - previousMax);
  return coreProgress(board);
}
export function absorbCoreCard(board, card, round) {
  if (!Number.isInteger(round) || round < 1) throw new Error('Invalid Core round');
  if (board.coreAppliedRound > round) throw new Error('Stale Core round');
  if (board.coreAppliedRound === round) return coreProgress(board);
  const progress = addCoreXp(board, cardXp(card));
  board.coreAppliedRound = round;
  return progress;
}
export function publicBoard(board) {
  const { coreProgress: _progress, coreAppliedRound: _round, ...visible } = board;
  return visible;
}
