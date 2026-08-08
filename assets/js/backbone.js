/* The backbone map.
 *
 * Six stages left to right, fourteen operations, each carrying its autonomy
 * level. Detail is collapsed by default: the marker is the claim, and the
 * reasoning is there for anyone who wants to argue with it rather than in
 * everybody's way.
 *
 * The hero figures are computed by actually running the ingest and
 * reconciliation stages. A landing page quoting hardcoded counts for a demo
 * about traceability would be a poor start.
 */

import { el, fmt } from './render.js';
import { synthesize } from './generate.js';
import { reconcile } from './reconcile.js';

const TONE = { autonomous: 'auto', loop: 'loop', human: 'human' };

function renderLevels(levels, counts) {
  return levels.map((lv) =>
    el('div', { class: `level level--${TONE[lv.id]}` }, [
      el('div', { class: 'level__head' }, [
        el('span', { class: 'level__count', text: String(counts[lv.id] || 0) }),
        el('span', { class: `badge badge--${TONE[lv.id]}`, text: lv.label }),
      ]),
      el('p', { text: lv.definition }),
    ])
  );
}

function renderFlow(stages, levels) {
  const labelOf = Object.fromEntries(levels.map((l) => [l.id, l.label]));

  return el(
    'div',
    { class: 'flow' },
    stages.map((stage, i) =>
      el('section', { class: 'flowstage', 'aria-label': stage.label }, [
        el('h3', { class: 'flowstage__head' }, [
          el('span', { class: 'flowstage__num', text: String(i + 1).padStart(2, '0') }),
          stage.label,
        ]),
        ...stage.operations.map((op) =>
          el(
            'details',
            {
              class: `flowop flowop--${TONE[op.level]}`,
              'data-worked': op.worked ? 'true' : null,
            },
            [
              el('summary', { class: 'flowop__summary' }, [
                el('span', { class: 'flowop__label', text: op.label }),
                el('span', { class: 'flowop__meta' }, [
                  el('span', { class: `badge badge--${TONE[op.level]}`, text: labelOf[op.level] }),
                  op.worked ? el('span', { class: 'flowop__built', text: 'Built' }) : null,
                ]),
              ]),
              el('div', { class: 'flowop__body' }, [
                el('p', { class: 'flowop__does', text: op.does }),
                el('p', { class: 'flowop__why', text: op.why }),
                op.worked
                  ? el('p', {}, [el('a', { href: 'program/', text: 'Open this step →' })])
                  : null,
              ]),
            ]
          )
        ),
      ])
    )
  );
}

async function init() {
  const status = document.getElementById('boot-status');
  try {
    const [map, program] = await Promise.all([
      fetch('data/backbone.json').then((r) => {
        if (!r.ok) throw new Error(`backbone.json: ${r.status}`);
        return r.json();
      }),
      fetch('data/program-001.json').then((r) => {
        if (!r.ok) throw new Error(`program-001.json: ${r.status}`);
        return r.json();
      }),
    ]);

    const ops = map.stages.flatMap((s) => s.operations);
    const counts = ops.reduce((a, op) => ({ ...a, [op.level]: (a[op.level] || 0) + 1 }), {});

    const levelsOut = document.getElementById('levels-out');
    if (levelsOut) levelsOut.replaceChildren(...renderLevels(map.levels, counts));

    const out = document.getElementById('backbone-out');
    if (out) out.replaceChildren(renderFlow(map.stages, map.levels));

    // Hero figures, from a real run rather than from memory.
    const recon = reconcile(synthesize(program));
    const set = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };
    set('proof-sections', `${program.memo.sections.length} sections`);
    set('proof-rows', `${fmt.int(recon.summary.rawRows)} rows, 2 systems`);
    set('proof-exceptions', fmt.int(recon.summary.exceptionCount));
    set('proof-held', `${fmt.int(recon.summary.heldNotApplied)}, not applied`);
  } catch (err) {
    console.error(err);
    if (status) {
      status.textContent = `Could not load the map: ${err.message}. If you opened this file directly, serve it over a local server instead.`;
    }
  }
}

init();
