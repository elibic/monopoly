/* חיבור הכול יחד: מסך פתיחה, לולאת תורות, קלט השחקן והפעלת המחשב. */
(function () {
  'use strict';

  const D = globalThis.MONOPOLY_DATA;
  const UI = globalThis.MonopolyUI;
  const AI = globalThis.MonopolyAI;
  const { Game } = globalThis.MonopolyEngine;

  const $ = (sel) => document.querySelector(sel);

  const AI_NAMES = ['רובי הבוט', 'ביפ-בופ', 'צ\'יפי'];

  let game = null;
  const humanIdx = 0;
  let aiTimer = null;
  let tradeOfferedThisRound = false;
  let aiRoundStartSeq = null; // מיקום היומן כשתור המחשב/ים התחיל — לסיכום
  let summaryPending = false;  // ממתינים לאישור השחקן על סיכום תור המחשב
  let wealthHistory = [];      // מדגם שווי-נטו של כל השחקנים לאורך המשחק (לגרף הסיכום)

  function sampleWealth() {
    if (!game) return;
    wealthHistory.push(game.players.map((p) => game.netWorth(p.idx)));
    if (wealthHistory.length > 200) wealthHistory.shift(); // תקרה בטיחותית
  }

  /* ---------- שמירה אוטומטית (עד איפוס ידני) ---------- */

  const SAVE_KEY = 'monopoly-beta-save';

  function saveGame() {
    if (!game || game.phase === 'gameover') return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.toJSON())); } catch (e) { /* אחסון מלא/חסום */ }
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* התעלמות */ }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return null;
      return data;
    } catch (e) { return null; }
  }

  /* ---------- מסך פתיחה ---------- */

  let chosenToken = D.TOKENS[0];
  let chosenGender = 'm';
  const AUC_KEY = 'monopoly-beta-auctions';
  let chosenAuctions = true;
  try { chosenAuctions = localStorage.getItem(AUC_KEY) !== 'off'; } catch (e) { /* */ }
  const POT_KEY = 'monopoly-beta-pot';
  let chosenPot = true;
  try { chosenPot = localStorage.getItem(POT_KEY) !== 'off'; } catch (e) { /* */ }
  const DIFF_KEY = 'monopoly-beta-difficulty';
  let chosenDifficulty = 'easy'; // ברירת מחדל ידידותית לילדים
  try { chosenDifficulty = localStorage.getItem(DIFF_KEY) || 'easy'; } catch (e) { /* */ }

  function initSetup() {
    // הקמע בפתיחה ובמרכז הלוח
    const setupMascot = $('#setup-mascot');
    if (setupMascot) setupMascot.innerHTML = UI.SVG.mascot;
    const centerMascot = $('#center-mascot');
    if (centerMascot) centerMascot.innerHTML = UI.SVG.mascot;

    $('#gender-picker').querySelectorAll('.opt-btn').forEach((b) => {
      b.onclick = () => {
        $('#gender-picker').querySelectorAll('.opt-btn').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        chosenGender = b.dataset.g;
      };
    });
    const picker = $('#token-picker');
    D.TOKENS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'token-btn' + (i === 0 ? ' selected' : '');
      b.textContent = t.emoji;
      b.title = t.name;
      b.onclick = () => {
        picker.querySelectorAll('.token-btn').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        chosenToken = t;
      };
      picker.appendChild(b);
    });

    $('#opponent-picker').querySelectorAll('.opt-btn').forEach((b) => {
      b.onclick = () => {
        $('#opponent-picker').querySelectorAll('.opt-btn').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
      };
    });

    // בורר רמת קושי — משקף את הבחירה השמורה
    const diffPicker = $('#difficulty-picker');
    if (diffPicker) diffPicker.querySelectorAll('.opt-btn').forEach((b) => {
      b.classList.toggle('selected', b.dataset.diff === chosenDifficulty);
      b.onclick = () => {
        diffPicker.querySelectorAll('.opt-btn').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        chosenDifficulty = b.dataset.diff;
        try { localStorage.setItem(DIFF_KEY, chosenDifficulty); } catch (e) { /* */ }
      };
    });

    // בורר קצב — משקף את הבחירה השמורה
    const speedPicker = $('#speed-picker');
    speedPicker.querySelectorAll('.opt-btn').forEach((b) => {
      b.classList.toggle('selected', b.dataset.speed === UI.getSpeed());
      b.onclick = () => {
        speedPicker.querySelectorAll('.opt-btn').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        UI.setSpeed(b.dataset.speed);
      };
    });

    // בורר מכירות פומביות — משקף את הבחירה השמורה
    const aucPicker = $('#auction-picker');
    aucPicker.querySelectorAll('.opt-btn').forEach((b) => {
      b.classList.toggle('selected', (b.dataset.auc === 'on') === chosenAuctions);
      b.onclick = () => {
        aucPicker.querySelectorAll('.opt-btn').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        chosenAuctions = b.dataset.auc === 'on';
        try { localStorage.setItem(AUC_KEY, chosenAuctions ? 'on' : 'off'); } catch (e) { /* */ }
      };
    });

    // בורר קופה בחניה חופשית
    const potPicker = $('#pot-picker');
    potPicker.querySelectorAll('.opt-btn').forEach((b) => {
      b.classList.toggle('selected', (b.dataset.pot === 'on') === chosenPot);
      b.onclick = () => {
        potPicker.querySelectorAll('.opt-btn').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        chosenPot = b.dataset.pot === 'on';
        try { localStorage.setItem(POT_KEY, chosenPot ? 'on' : 'off'); } catch (e) { /* */ }
      };
    });

    $('#start-btn').onclick = startGame;
    $('#download-btn').onclick = showDownloadDialog;
    const albumBtn = $('#album-btn');
    if (albumBtn) albumBtn.onclick = () => UI.showStickerAlbum();
    if ('speechSynthesis' in window) speechSynthesis.getVoices(); // טעינה מוקדמת של קולות
  }

  // הורדת המשחק — שתי אפשרויות: לשחק אופליין, או פרויקט מלא למתכנת
  function showDownloadDialog() {
    const repo = 'https://github.com/elibic/monopoly';
    const playZip = `${repo}/archive/refs/heads/gh-pages.zip`;         // המשחק הרץ (שטוח)
    const devZip = `${repo}/archive/refs/heads/claude/monopoly-hebrew-dhr54d.zip`; // מקור מלא
    const d = UI.openDialog(`
      <h2>הורדת המשחק 💻</h2>
      <div class="dl-section">
        <b>🎮 כדי לשחק בלי אינטרנט</b>
        <a class="big-btn green dl-link" href="${playZip}" download>⬇️ הורדת המשחק (ZIP)</a>
        <ol class="dl-steps">
          <li>מחלצים את ה-ZIP (לחיצה ימנית ← "חלץ הכול").</li>
          <li>לחיצה כפולה על <b>index.html</b> — והמשחק רץ, גם בלי רשת! 🎉</li>
        </ol>
      </div>
      <div class="dl-section dl-dev">
        <b>👨‍💻 כדי שמתכנת ישפר את המשחק</b>
        <p class="d-sub">זהו הפרויקט <b>המלא</b> — כל הקוד, הבדיקות, הכלים ואוטומציית
        הבנייה. הכי נוח לשלוח למתכנת את הקישור לפרויקט ב-GitHub:</p>
        <a class="dl-repo" href="${repo}" target="_blank" rel="noopener">${repo}</a>
        <a class="big-btn blue dl-link" href="${devZip}" download>⬇️ הורדת הפרויקט המלא (ZIP)</a>
      </div>
      <div class="d-actions"><button class="big-btn" id="dl-close">סגירה</button></div>`);
    d.querySelector('#dl-close').onclick = () => UI.closeDialog();
  }

  function startGame() {
    const name = $('#player-name').value.trim() || 'אלוף/ה';
    const nAI = Number($('#opponent-picker .selected').dataset.n);
    const aiTokens = D.TOKENS.filter((t) => t.id !== chosenToken.id);

    const spec = [{ name, token: chosenToken.emoji, isAI: false, gender: chosenGender }];
    for (let i = 0; i < nAI; i++) {
      spec.push({ name: AI_NAMES[i], token: aiTokens[i].emoji, isAI: true, gender: 'm' });
    }

    game = new Game(spec, { auctions: chosenAuctions, pot: chosenPot, difficulty: chosenDifficulty });
    aiRoundStartSeq = null;
    summaryPending = false;
    wealthHistory = [];
    $('#setup-screen').classList.add('hidden');
    $('#game-screen').classList.remove('hidden');
    UI.music.resumeIfOn(); // הפעלת מוזיקת רקע (אחרי לחיצת המשתמש)
    UI.narrator.say(['ev_welcome'], `שָׁלוֹם ${name}! בְּהַצְלָחָה בַּמִּשְׂחָק!`);
    tick();
  }

  // שחזור משחק שמור מהביקור הקודם
  function resumeGame(data) {
    game = Game.restore(data);
    aiRoundStartSeq = null;
    summaryPending = false;
    $('#setup-screen').classList.add('hidden');
    $('#game-screen').classList.remove('hidden');
    UI.primeFromRestore(game);
    UI.music.resumeIfOn(); // הפעלת מוזיקת רקע (אחרי לחיצת המשתמש)
    UI.toast('👋 ממשיכים מאיפה שהפסקנו!');
    tick();
  }

  function offerResume(data) {
    const who = data.playersSpec.map((p) => `${p.token} ${p.name}`).join(' · ');
    const d = UI.openDialog(`
      <h2>יש משחק שמור! 💾</h2>
      <p class="d-sub">${who}</p>
      <p class="d-sub">רוצים להמשיך מאיפה שהפסקתם, או להתחיל מחדש?</p>
      <div class="d-actions">
        <button class="big-btn green" id="d-resume">▶️ ממשיכים לשחק</button>
        <button class="big-btn" id="d-new">🆕 משחק חדש</button>
      </div>`);
    d.querySelector('#d-resume').onclick = () => { UI.closeDialog(); resumeGame(data); };
    d.querySelector('#d-new').onclick = () => { UI.closeDialog(); clearSave(); };
  }

  /* ---------- לולאת המשחק ---------- */

  function currentActor() {
    if (game.phase === 'auction') return game.auctionTurn();
    if (game.phase === 'debt') return game.debt.debtor;
    return game.turn;
  }

  function isAI(idx) { return game.players[idx].isAI; }

  // tick אסינכרוני: הרינדור כולל אנימציות (דילוגי כלים, קלף מתהפך).
  // דגל busy מונע ריצות חופפות; קריאה בזמן ריצה נרשמת לריצה נוספת בסוף.
  let ticking = false;
  let tickQueued = false;

  async function tick() {
    if (!game) return;
    if (ticking) { tickQueued = true; return; }
    ticking = true;
    do {
      tickQueued = false;
      await UI.render(game);
      updateButtons();
      saveGame(); // שמירה אוטומטית אחרי כל שינוי מצב

      if (game.phase === 'gameover') {
        clearSave();
        sampleWealth(); // מדגם אחרון — מצב הסיום
        UI.showWin(game, () => location.reload(), { humanIdx, history: wealthHistory });
        break;
      }

      // המכירה הסתיימה אך דיאלוג המכירה עדיין פתוח — סוגרים אותו כדי שלא ייתקע
      if (game.phase !== 'auction') UI.closeAuctionDialog();

      if (game.phase === 'auction') {
        UI.renderAuction(game, humanIdx, onHumanBid, onHumanPassAuction);
      } else if (game.phase === 'buy' && !isAI(game.turn)) {
        UI.showBuyDialog(game, () => { game.buy(); tick(); }, () => { game.declineBuy(); tick(); });
      } else if (game.phase === 'debt' && !isAI(game.debt.debtor)) {
        showHumanDebt();
      } else if (game.phase === 'roll' && !isAI(game.turn) && game.current().inJail) {
        UI.showJailDialog(game, {
          onPay: () => { game.payJailFine(); tick(); },
          onCard: () => { game.useJailCard(); tick(); },
          onRoll: () => { doRoll(); },
        });
      }

      const actor = currentActor();
      if (isAI(actor)) {
        // תחילת סבב מחשב — מסמנים את מיקום היומן כדי לסכם אותו בהמשך
        if (aiRoundStartSeq === null) aiRoundStartSeq = game._logSeq;
        scheduleAi();
      } else if (actor === humanIdx && aiRoundStartSeq !== null && !summaryPending
                 && game.phase === 'roll' && !game.current().inJail) {
        // חזרנו לתור השחקן — מציגים סיכום מה שהמחשב עשה, ואז השחקן מטיל
        const entries = game.log.filter((e) => e.id > aiRoundStartSeq);
        aiRoundStartSeq = null;
        summaryPending = true;
        updateButtons(); // חוסם את כפתור ההטלה כל עוד הסיכום פתוח
        const bots = game.players.filter((p) => p.isAI && !p.bankrupt);
        const botLabel = bots.length === 1 ? bots[0].name : 'הבוטים';
        const shown = UI.showTurnSummary(entries, () => { summaryPending = false; updateButtons(); }, botLabel);
        if (!shown) { summaryPending = false; updateButtons(); }
      }
    } while (tickQueued);
    ticking = false;
  }

  function updateButtons() {
    const humanTurn = game.turn === humanIdx && !game.players[humanIdx].bankrupt && !summaryPending;
    const free = !['auction', 'debt', 'gameover'].includes(game.phase);
    $('#roll-btn').disabled = !(humanTurn && game.phase === 'roll' && !game.current().inJail);
    $('#end-turn-btn').disabled = !(humanTurn && game.phase === 'end');
    $('#manage-btn').disabled = !(humanTurn && free && ['roll', 'end'].includes(game.phase));
    $('#trade-btn').disabled = !(humanTurn && free && ['roll', 'end'].includes(game.phase));
  }

  // הטלת קוביות עם אנימציית תלת-ממד — לאדם ולמחשב
  async function doRoll() {
    $('#roll-btn').disabled = true;
    sampleWealth(); // מדגם שווי-נטו לפני ההטלה — לגרף בסיכום המשחק
    game.rollDice();
    await UI.animateDice(game.dice[0], game.dice[1]);
    tick();
  }

  /* ---------- פעולות השחקן האנושי ---------- */

  function onHumanBid(amount) {
    UI.closeDialog(); // סוגרים תמיד — גם דיאלוג ישן ותקוע נסגר בלחיצה
    // הגנה: אם המצב כבר עבר את שלב המכירה, רק מרעננים בלי לפעול
    if (game && game.phase === 'auction' && game.auctionTurn() === humanIdx) {
      try { game.placeBid(humanIdx, amount); } catch (e) { UI.toast(e.message); }
    }
    tick();
  }

  function onHumanPassAuction() {
    UI.closeDialog(); // סוגרים תמיד — גם דיאלוג ישן ותקוע נסגר בלחיצה
    if (game && game.phase === 'auction' && game.auctionTurn() === humanIdx) {
      try { game.passAuction(humanIdx); } catch (e) { UI.toast(e.message); }
    }
    tick();
  }

  function showHumanDebt() {
    UI.showDebtDialog(game, humanIdx, {
      onAction: async (act, pos) => {
        try {
          if (act === 'mortgage') game.mortgage(pos);
          if (act === 'sellHouse') game.sellHouse(pos);
        } catch (e) { UI.toast(e.message); }
        await UI.render(game);
        showHumanDebt(); // רענון הדיאלוג עם המצב החדש
      },
      onSettle: () => { try { game.settleDebt(); } catch (e) { UI.toast(e.message); } tick(); },
      onBankrupt: () => { game.declareBankruptcy(); tick(); },
    });
  }

  function showManage() {
    UI.showManageDialog(game, humanIdx, {
      onAction: async (act, pos) => {
        try {
          if (act === 'build') game.buildHouse(pos);
          if (act === 'sellHouse') game.sellHouse(pos);
          if (act === 'mortgage') game.mortgage(pos);
          if (act === 'unmortgage') game.unmortgage(pos);
        } catch (e) { UI.toast(e.message); }
        await UI.render(game);
        showManage(); // רענון
      },
      onClose: () => tick(),
    });
  }

  function chooseTradePartner() {
    const ais = game.players.filter((p) => p.isAI && !p.bankrupt);
    if (!ais.length) return;
    if (ais.length === 1) return showTrade(ais[0].idx);
    const d = UI.openDialog(`
      <h2>עם מי עושים עסקה? 🤝</h2>
      <div class="d-actions">
        ${ais.map((p) => `<button class="big-btn blue" data-idx="${p.idx}">${p.token} ${p.name}</button>`).join('')}
      </div>`);
    d.querySelectorAll('button[data-idx]').forEach((b) => {
      b.onclick = () => { UI.closeDialog(); showTrade(Number(b.dataset.idx)); };
    });
  }

  function showTrade(aiIdx) {
    UI.showTradeDialog(game, humanIdx, aiIdx, {
      onSubmit: ({ give, get, moneyGive, moneyGet }) => {
        if (!give.length && !get.length) { UI.toast('לא נבחרו נכסים 🤔'); tick(); return; }
        // הערכת העסקה מנקודת המבט של המחשב
        const ok = AI.evaluateTrade(game, aiIdx, {
          propsGive: get, propsGet: give, moneyGive: moneyGet, moneyGet: moneyGive,
        });
        if (ok) {
          try {
            game.executeTrade(humanIdx, aiIdx, { propsA: give, propsB: get, moneyA: moneyGive, moneyB: moneyGet });
            UI.toast(`🎉 ${game.players[aiIdx].name} הסכים לעסקה!`);
            UI.speak('עשינו עסק!');
          } catch (e) { UI.toast(e.message); }
        } else {
          UI.toast(`${game.players[aiIdx].name} מסרב לעסקה 🙅`);
          UI.speak('לא משתלם לי, מצטער!');
        }
        tick();
      },
      onClose: () => tick(),
    });
  }

  /* ---------- תור המחשב ---------- */

  function scheduleAi() {
    if (aiTimer) return;
    aiTimer = setTimeout(() => { aiTimer = null; aiStep(); }, UI.aiDelay());
  }

  async function aiStep() {
    if (!game) return;
    if (game.phase === 'gameover') { tick(); return; }
    const idx = currentActor();
    if (!isAI(idx)) { tick(); return; }
    const g = game;

    try {
      if (g.phase === 'auction') {
        const dec = AI.decideAuction(g, idx);
        if (dec === 'pass' || dec === null) g.passAuction(idx);
        else g.placeBid(idx, dec);
      } else if (g.phase === 'buy') {
        if (AI.decideBuy(g, idx)) g.buy();
        else g.declineBuy();
      } else if (g.phase === 'debt') {
        AI.handleDebt(g, idx);
      } else if (g.phase === 'roll') {
        const p = g.players[idx];
        if (p.inJail) {
          const strat = AI.jailStrategy(g, idx);
          if (strat === 'card') { g.useJailCard(); tick(); return; }
          if (strat === 'pay') { g.payJailFine(); tick(); return; }
        }
        await doRoll();
        return; // doRoll כבר קורא ל-tick
      } else if (g.phase === 'end') {
        AI.manageAssets(g, idx);
        // הצעת עסקה לאדם — לכל היותר פעם בסבב, ורק אם האדם עדיין במשחק
        if (!tradeOfferedThisRound && !g.players[humanIdx].bankrupt) {
          const offer = AI.proposeTrade(g, idx, humanIdx);
          if (offer) {
            tradeOfferedThisRound = true;
            await UI.render(game);
            UI.showAiTradeOffer(g, idx, offer.pos, offer.offer, {
              onAccept: () => {
                try {
                  g.executeTrade(humanIdx, idx, { propsA: [offer.pos], moneyB: offer.offer });
                } catch (e) { UI.toast(e.message); }
                g.endTurn(); tick();
              },
              onDecline: () => { g.endTurn(); tick(); },
            });
            return; // מחכים לתשובת האדם
          }
        }
        g.endTurn();
        if (g.turn === humanIdx) tradeOfferedThisRound = false;
      }
    } catch (e) {
      // הגנה: תקלה בתור המחשב לא תתקע את המשחק
      console.error('AI error:', e);
      try {
        if (g.phase === 'end') g.endTurn();
        else if (g.phase === 'buy') g.declineBuy();
        else if (g.phase === 'auction') g.passAuction(idx);
        else if (g.phase === 'debt') g.declareBankruptcy();
      } catch (e2) { console.error(e2); }
    }
    tick();
  }

  /* ---------- כפתורים קבועים ---------- */

  function initGameButtons() {
    $('#roll-btn').onclick = () => { if (!$('#roll-btn').disabled) doRoll(); };
    $('#end-turn-btn').onclick = () => {
      if ($('#end-turn-btn').disabled) return;
      game.endTurn();
      tick();
    };
    $('#manage-btn').onclick = () => { if (!$('#manage-btn').disabled) showManage(); };
    $('#trade-btn').onclick = () => { if (!$('#trade-btn').disabled) chooseTradePartner(); };
    $('#sound-btn').onclick = () => UI.setSound(!UI.isSoundOn());
    const musicBtn = $('#music-btn');
    if (musicBtn) {
      musicBtn.classList.toggle('active', UI.music.isOn());
      musicBtn.textContent = UI.music.isOn() ? '🎵' : '🔇';
      musicBtn.title = UI.music.isOn() ? 'מוזיקת רקע: פועלת' : 'מוזיקת רקע: כבויה';
      musicBtn.onclick = () => {
        const on = UI.music.toggle();
        musicBtn.classList.toggle('active', on);
        musicBtn.textContent = on ? '🎵' : '🔇';
        musicBtn.title = on ? 'מוזיקת רקע: פועלת' : 'מוזיקת רקע: כבויה';
        UI.toast(on ? '🎵 מוזיקה פועלת' : '🔇 מוזיקה כבויה');
      };
    }
    $('#speed-btn').onclick = () => {
      const order = ['slow', 'normal', 'fast'];
      const next = order[(order.indexOf(UI.getSpeed()) + 1) % order.length];
      UI.setSpeed(next);
      UI.toast(`קצב: ${next === 'slow' ? '🐢 רגוע' : next === 'fast' ? '🐇 מהיר' : '🚶 רגיל'}`);
    };
    $('#restart-btn').onclick = () => {
      if (confirm('לאפס את המשחק? המשחק השמור יימחק ונתחיל מחדש.')) {
        game = null; // מונע מ-beforeunload לשמור שוב אחרי המחיקה
        clearSave();
        location.reload();
      }
    };
    window.addEventListener('beforeunload', saveGame);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSetup();
    UI.buildBoard();
    initGameButtons();
    UI.setSpeed(UI.getSpeed()); // מסנכרן את אייקון כפתור הקצב עם הבחירה השמורה
    UI.narrator.init(); // טעינת רשימת קליפי הקריינות (אם קיימים)
    const saved = loadSave();
    if (saved) offerResume(saved);
  });
})();
