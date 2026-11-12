import { lineStats, type } from '../shared/elements.js';
// ╨Р╤В╨░╨║╤Г╤О╤Й╨░╤П ╨┐╨░╤А╨░ ╨▒╤М╤С╤В, ╨╖╨░╤Й╨╕╤В╨╜╨░╤П ╨┐╨╛╨│╨╗╨╛╤Й╨░╨╡╤В ╤Г╨┤╨░╤А. ╨Т╤Б╨╡ ╨╗╨╕╨╜╨╕╨╕ ╨╛╨┤╨╜╨╛╨▓╤А╨╡╨╝╨╡╨╜╨╜╤Л.
export const OUTER_HP = 12;
export const INNER_HP = 18;
export const NEXUS_HP = 80;
export const MAX_ROUNDS = 45;
export const SHIELD_BY_BREACHES = [0, 40, 70, 100];

export const newState = () => ({
  nexus: NEXUS_HP,
  outer: [OUTER_HP, OUTER_HP, OUTER_HP],
  inner: [INNER_HP, INNER_HP, INNER_HP],
  burn: [0, 0, 0],
});

export const breaches = (p) => p.inner.filter((v) => v <= 0).length;
export const shieldPct = (p) => SHIELD_BY_BREACHES[breaches(p)];
export const isOpen = (p, l) => p.outer[l] <= 0 && p.inner[l] <= 0;

// ╨Ш╨╖╨╗╨╕╤И╨╡╨║ ╤Г╤А╨╛╨╜╨░ ╨╜╨░╨╝╨╡╤А╨╡╨╜╨╜╨╛ ╨Э╨Х ╨┐╨╡╤А╨╡╨╜╨╛╤Б╨╕╤В╤Б╤П ╨╜╨░ ╤Б╨╗╨╡╨┤╤Г╤О╤Й╤Г╤О ╤Ж╨╡╨╗╤М.
export function damage(p, l, amount, nexusPct = shieldPct(p)) {
  const remain = amount;
  if (remain <= 0) return;
  if (p.outer[l] > 0) { p.outer[l] = Math.max(0, p.outer[l] - remain); return; }
  if (p.inner[l] > 0) { p.inner[l] = Math.max(0, p.inner[l] - remain); return; }
  p.nexus = Math.max(0, p.nexus - Math.round((remain * nexusPct) / 100));
}

export function damageStage(p, l) {
  return p.outer[l] > 0 ? 'outer' : p.inner[l] > 0 ? 'inner' : 'nexus';
}

export function recordDamage(before, after, l) {
  if (before.outer[l] > 0) return Math.max(0, before.outer[l] - after.outer[l]);
  if (before.inner[l] > 0) return Math.max(0, before.inner[l] - after.inner[l]);
  return Math.max(0, before.nexus - after.nexus);
}

// ╨Т╤Б╨╡ ╤Е╨░╤А╨░╨║╤В╨╡╤А╨╕╤Б╤В╨╕╨║╨╕ ╨▓╤Л╤З╨╕╤Б╨╗╤П╤О╤В╤Б╤П ╨┤╨╛ ╨╕╨╖╨╝╨╡╨╜╨╡╨╜╨╕╤П HP; ╨╛╨▒╨╡ ╤Б╤В╨╛╤А╨╛╨╜╤Л ╨▒╤М╤О╤В ╨┤╨░╨╢╨╡ ╨┐╤А╨╕ ╤Б╨╝╨╡╤А╤В╨╕.
export function resolveRound(state, turnA, turnB) {
  const find = (turn, lane) => turn.placements.find(p => p.lane === lane);
  const events = [], report = [];
  // ╨Я╤А╨╛╤А╤Л╨▓╤Л ╤Н╤В╨╛╨│╨╛ ╤А╨░╤Г╨╜╨┤╨░ ╨▓╨╗╨╕╤П╤О╤В ╨╜╨░ ╨Э╨╡╨║╤Б╤Г╤Б ╤В╨╛╨╗╤М╨║╨╛ ╤Б╨╛ ╤Б╨╗╨╡╨┤╤Г╤О╤Й╨╡╨│╨╛ ╤А╨░╤Г╨╜╨┤╨░.
  const nexusPct = { a: shieldPct(state.a), b: shieldPct(state.b) };
  state.a.burn = [0, 0, 0]; state.b.burn = [0, 0, 0]; // ╤Б╤В╨░╤А╨╛╨╡ ╨┐╨╛╨╗╨╡ ╨╜╨╡╨░╨║╤В╨╕╨▓╨╜╨╛
  const lanes = [0, 1, 2].map(l => {
    const pa = find(turnA, l), pb = find(turnB, l);
    return { pa, pb, a: lineStats(pa), b: lineStats(pb) };
  });
  for (let l = 0; l < 3; l++) {
    const { pa, pb, a, b } = lanes[l];
    const entry = (own, opp, ownCards, oppCards, target, side) => {
      const info = { a: own.attack, d: opp.defense,
        baseA: own.baseAttack, baseD: opp.baseDefense,
        hit: Math.max(0, own.attack - opp.defense), burn: 0, match: '',
        at: type(ownCards.attack), dt: type(oppCards.defense),
        pairs: own.pairs, opponentPairs: opp.pairs };
      const before = structuredClone(target), stage = damageStage(target, l);
      damage(target, l, info.hit, nexusPct[side]);
      const dealt = recordDamage(before, target, l);
      events.push({ side, l, stage, amount: dealt, element: info.at,
        elements: [own.pairs[0].element] });
      return { info, attack: ownCards.attack, defense: oppCards.defense,
        ownPairs: [ownCards.attack, ownCards.defense],
        opponentPairs: [oppCards.attack, oppCards.defense],
        dealt, stage, fortified: false, burn: 0 };
    };
    report.push({ round: state.round, lane: l,
      a: entry(a, b, pa, pb, state.b, 'b'),
      b: entry(b, a, pb, pa, state.a, 'a') });
  }
  state.round += 1;
  const aDead = state.a.nexus <= 0, bDead = state.b.nexus <= 0;
  const finished = aDead || bDead || state.round - 1 >= MAX_ROUNDS;
  const winner = !finished ? null : aDead && bDead ? 'draw' : bDead ? 'a' : aDead ? 'b'
    : state.a.nexus > state.b.nexus ? 'a' : state.a.nexus < state.b.nexus ? 'b' : 'draw';
  return { events, report, finished, winner };
}
