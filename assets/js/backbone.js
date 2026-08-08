/* The backbone map.
 *
 * Renders the operating design from data/backbone.json. The levels are the
 * page's vocabulary, so they are rendered from the same source that marks the
 * operations — a legend that can drift from what it labels is worse than none.
 */

import { el } from './render.js';

const TONE = { autonomous: 'auto', loop: 'loop', human: 'human' };

function renderLevels(levels) {
  return levels.map((lv) =>
    el('div', { class: 'level' }, [
      el('span', { class: `badge badge--${TONE[lv.id]}`, text: lv.label }),
      el('p', { text: lv.definition }),
    ])
  );
}

function renderStages(stages, levels) {
  const labelOf = Object.fromEntries(levels.map((l) => [l.id, l.label]));

  return stages.map((stage, i) =>
    el('div', { class: 'bstage' }, [
      el('div', { class: 'bstage__head' }, [
        el('span', { class: 'bstage__index', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'bstage__label', text: stage.label }),
      ]),
      ...stage.operations.map((op) =>
        el(
          'div',
          {
            class: 'bop',
            'data-emphasis': op.emphasis ? 'true' : null,
            'data-worked': op.worked ? 'true' : null,
          },
          [
            // Badge first in source order so it forms a readable column down
            // the left. The autonomy marker is the claim the page invites you
            // to disagree with; it should not be a half-screen from its text.
            el('div', { class: 'bop__badge' }, [
              el('span', { class: `badge badge--${TONE[op.level]}`, text: labelOf[op.level] }),
            ]),
            el('div', { class: 'bop__body' }, [
              el('p', { class: 'bop__label' }, [
                op.label,
                // The map claims one node is built. Saying which one is the
                // difference between a diagram and a demonstration.
                op.worked
                  ? el('a', { class: 'bop__worked', href: 'program/' }, ['Built →'])
                  : null,
              ]),
              el('p', { class: 'bop__does', text: op.does }),
              el('p', { class: 'bop__why', text: op.why }),
            ]),
          ]
        )
      ),
    ])
  );
}

async function init() {
  const status = document.getElementById('boot-status');
  try {
    const data = await fetch('data/backbone.json').then((r) => {
      if (!r.ok) throw new Error(`backbone.json: ${r.status}`);
      return r.json();
    });

    const levelsOut = document.getElementById('levels-out');
    if (levelsOut) levelsOut.replaceChildren(...renderLevels(data.levels));

    const out = document.getElementById('backbone-out');
    if (out) out.replaceChildren(...renderStages(data.stages, data.levels));

    const counts = data.stages
      .flatMap((s) => s.operations)
      .reduce((acc, op) => ({ ...acc, [op.level]: (acc[op.level] || 0) + 1 }), {});

    if (out) {
      out.append(
        el('p', { class: 'small muted', style: 'margin-top:1rem' }, [
          `${counts.autonomous || 0} operations run autonomously, `,
          `${counts.loop || 0} keep a human in the loop, `,
          `${counts.human || 0} stay human. `,
          'The middle column is where most of the value is, and it is the column vendors tend to skip past.',
        ])
      );
    }
  } catch (err) {
    console.error(err);
    if (status) {
      status.textContent = `Could not load the operating design: ${err.message}. If you opened this file directly, serve it over a local server instead.`;
    }
  }
}

init();
