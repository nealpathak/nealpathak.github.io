// The title card. Deliberately quiet: a name, a line, and one thing to press.

import { hasSave, deleteSave } from '../core/save.js';

export class TitleScreen {
  constructor(root, engine, game) {
    this.engine = engine;
    this.game = game;

    const el = document.createElement('div');
    el.className = 'title';
    el.dataset.interactive = '';
    el.innerHTML = `
      <div class="title__inner">
        <p class="title__eyebrow">The sun did not set. It fell.</p>
        <h1 class="title__name">EMBERWAKE</h1>
        <p class="title__blurb">
          A third-person action RPG that runs in a browser tab. Stamina you can run
          out of, attacks you commit to, and spirits worth binding to your covenant.
        </p>
        <div class="title__actions">
          <button class="btn btn--primary" data-act="begin">Begin</button>
          <button class="btn" data-act="continue" hidden>Continue</button>
        </div>
        <div class="title__controls">
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>move</span></div>
          <div><kbd>Space</kbd><span>tap to roll · hold to sprint</span></div>
          <div><kbd>LMB</kbd><span>light</span> <kbd>Shift</kbd>+<kbd>LMB</kbd><span>heavy</span></div>
          <div><kbd>RMB</kbd><span>guard</span> <kbd>F</kbd><span>parry</span></div>
          <div><kbd>Q</kbd><span>lock on</span> <kbd>R</kbd><span>heal</span> <kbd>E</kbd><span>interact</span></div>
        </div>
        <p class="title__hint">Click to capture the pointer. <kbd>Esc</kbd> releases it.</p>
      </div>`;
    root.appendChild(el);
    this.el = el;

    this.continueBtn = el.querySelector('[data-act="continue"]');
    if (hasSave()) this.continueBtn.hidden = false;

    el.querySelector('[data-act="begin"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasSave()) deleteSave();
      this.begin();
    });
    this.continueBtn.addEventListener('click', (e) => { e.stopPropagation(); this.begin(); });
  }

  begin() { this.game.start(); }
  hide() { this.el.classList.add('title--hidden'); }
  show() { this.el.classList.remove('title--hidden'); }
  update() { /* reserved for the drifting-ember backdrop */ }
}
