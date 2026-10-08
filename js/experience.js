(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const ui = globalThis.MonopolyUI;
    const toyTokens = ['🚗','🐶','🚢','🎩','🐱','✈️'];
    const decorate = (root) => root.querySelectorAll('.token-picker button, .tok, .fly-token').forEach((el) => {
      const index = toyTokens.indexOf(el.textContent.trim());
      if (index < 0) return;
      el.classList.add('toy-token');
      el.style.setProperty('--toy-x', [0,50,100][index % 3] + '%');
      el.style.setProperty('--toy-y', index < 3 ? '0%' : '100%');
    });
    decorate(document);
    new MutationObserver(() => decorate(document)).observe(document.querySelector('#app') || document.body, {childList:true,subtree:true});
    document.querySelector('#preview-voice').onclick = () => ui.narrator.say(['ev_welcome'], 'ברוכים הבאים!', { interrupt: true });
    document.querySelector('#repeat-voice').onclick = () => ui.narrator.repeat();
    // State is announced to keyboard and screen-reader users as well as visually.
    for (const group of document.querySelectorAll('.opponent-picker, .token-picker')) {
      group.setAttribute('role', 'group');
      const sync = () => group.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.classList.contains('selected')));
        if (b.title) b.setAttribute('aria-label', b.title);
      });
      group.addEventListener('click', sync); sync();
    }
    for (const b of document.querySelectorAll('.icon-btn')) if (b.title) b.setAttribute('aria-label', b.title);
    for (const b of document.querySelectorAll('#opponent-picker button')) b.setAttribute('aria-label', `${b.dataset.n} יריבי מחשב`);
    // Keep keyboard focus inside the active dialog without dismissing payments.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const dialog = document.querySelector('#dialog-root:not(.hidden) .dialog');
      if (!dialog) return;
      const items = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select, a[href], [tabindex="0"]')].filter((x) => x.getClientRects().length);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
  });
})();
