// Детерминированные сиды партий турнира со сменой сторон.
// Пара игр (swap=false/true) использует РАЗНЫЕ потоки случайности:
// умножение на 2 даёт каждой партии собственный непересекающийся сид.
export function gameSeed(baseSeed, gameIndex) {
  return (baseSeed + Math.floor(gameIndex / 2) * 1000) * 2 + (gameIndex % 2 === 1 ? 1 : 0);
}
