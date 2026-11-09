// Классические цифры урона над повреждённой целью (v1.5): подъём и растворение,
// без отдельного экрана столкновения и без полётов через поле.
const timers = [];

export function clearFloats() {
  timers.forEach(clearTimeout);
  timers.length = 0;
  document.querySelectorAll('.damage-float').forEach((el) => el.remove());
}

// events: [{side:'a'|'b', l, stage:'outer'|'inner'|'nexus', amount, burn}] — side = КТО ПОЛУЧИЛ.
// mySeat — seat текущего игрока: его башни получают урон, когда side === его seat.
export function showRoundDamage(events, mySeat) {
  clearFloats();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    events.forEach((e) => {
      const laneEl = document.querySelectorAll('#lanes .lane')[e.l];
      if (!laneEl) return;
      const mineHit = (e.side === 'a' && mySeat === 1) || (e.side === 'b' && mySeat === 2);
      let target;
      if (e.stage === 'nexus') {
        target = document.querySelectorAll(mineHit ? '#myBaseTargets .base-lane' : '#botBaseTargets .base-lane')[e.l];
      } else {
        const towers = laneEl.querySelectorAll(mineHit ? '.side:not(.enemy) .tower' : '.side.enemy .tower');
        // свои башни в DOM: внутренняя, потом внешняя; чужие: внешняя, потом внутренняя
        const idx = mineHit ? (e.stage === 'outer' ? 1 : 0) : (e.stage === 'outer' ? 0 : 1);
        target = towers[idx];
      }
      if (!target) return;
      const r = target.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'damage-float ' + (e.burn ? 'burn-hit' : mineHit ? 'player-hit' : 'enemy-hit') + (e.amount === 0 ? ' blocked-hit' : '');
      el.textContent = e.amount > 0 ? (e.burn ? '🔥 −' : '−') + e.amount : '🛡 0';
      el.style.left = (r.left + r.width / 2) + 'px';
      el.style.top = Math.max(35, r.top + 8 - (e.burn ? 15 : 0)) + 'px';
      timers.push(setTimeout(() => {
        document.body.appendChild(el);
        timers.push(setTimeout(() => el.remove(), 1650));
      }, e.burn ? 0 : 180));
    });
  }));
}
