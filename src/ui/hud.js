// The readout in the corner: how old the world is, what time it is on the face
// we're looking at, and who lives there.

import { phaseFromLit } from '../core/clock.js';

export function createHud({ state, counts }) {
  const dayEl = document.querySelector('[data-hud="day"]');
  const phaseEl = document.querySelector('[data-hud="phase"]');
  const lifeEl = document.querySelector('[data-hud="life"]');

  dayEl.textContent = `Day ${state.day}`;
  lifeEl.textContent = `${counts.wanderers} wanderers · ${counts.flora} trees`;

  let lastPhase = '';

  return {
    update(sunDirection, viewDirection) {
      const phase = phaseFromLit(sunDirection.dot(viewDirection));
      if (phase !== lastPhase) {
        phaseEl.textContent = phase;
        lastPhase = phase;
      }
    },
  };
}
