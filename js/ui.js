/* שכבת התצוגה: לוח, כרטיסי אשראי, דיאלוגים, אנימציות, קול והקראה. */
(function () {
  'use strict';

  const D = globalThis.MONOPOLY_DATA;
  const { BOARD, GROUPS } = D;

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const money = (n) => `${n.toLocaleString('he-IL')} ₪`;
  const PLAYER_COLORS = ['#E0393E', '#3D8FD1', '#2FA671', '#8E44AD', '#E67E22', '#16A085'];

  const SQ_EMOJI = {
    go: '🏁', jail: '👮', parking: '🅿️', gotojail: '🚔',
    chance: '❓', chest: '🎁', tax: '💸', rail: '🚂', utility: '💡',
  };

  /* ---------- קול ---------- */

  let soundOn = true;
  let audioCtx = null;

  function ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }

  function tone(freq, dur, delay = 0, type = 'sine', vol = 0.12) {
    const c = ctx();
    if (!c || !soundOn) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + delay);
    o.stop(c.currentTime + delay + dur);
  }

  const sounds = {
    dice() { for (let i = 0; i < 5; i++) tone(260 + Math.random() * 260, .05, i * .09, 'square', .07); },
    tick() { tone(640, .045, 0, 'square', .06); },
    money() { tone(880, .1); tone(1175, .12, .09); },
    pay() { tone(392, .12); tone(294, .16, .1); },
    buy() { tone(523, .1); tone(659, .1, .09); tone(784, .18, .18); },
    jail() { tone(220, .25, 0, 'sawtooth', .09); tone(180, .35, .2, 'sawtooth', .09); },
    card() { tone(700, .08); tone(940, .1, .08); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .22, i * .15, 'triangle', .15)); },
  };

  function speak(text) {
    if (!soundOn || !('speechSynthesis' in window)) return;
    const clean = text.replace(/["״]/g, '').replace(/ש"ח/g, 'שקלים');
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'he-IL';
    u.rate = 1.05;
    const voice = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith('he'));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }

  const SPOKEN_KINDS = new Set(['turn', 'buy', 'rent', 'card', 'jail', 'win', 'debt', 'offer', 'bankrupt', 'money', 'tax']);

  /* ---------- בניית הלוח ---------- */

  function gridArea(pos) {
    // בדף RTL עמודה 1 מוצגת בימין — "דרך צלחה" בפינה הימנית-תחתונה, נגד כיוון השעון.
    if (pos <= 10) return { row: 11, col: pos + 1 };
    if (pos <= 19) return { row: 11 - (pos - 10), col: 11 };
    if (pos <= 30) return { row: 1, col: 11 - (pos - 20) };
    return { row: pos - 29, col: 1 };
  }

  function buildBoard() {
    const board = $('#board');
    for (const sq of BOARD) {
      const { row, col } = gridArea(sq.pos);
      const div = el('div', 'square');
      div.id = `sq-${sq.pos}`;
      div.style.gridArea = `${row} / ${col}`;
      const corner = [0, 10, 20, 30].includes(sq.pos);
      if (corner) div.classList.add('corner');

      if (sq.type === 'street') {
        const band = el('div', 'band');
        band.style.background = GROUPS[sq.group].color;
        div.appendChild(band);
        div.appendChild(el('div', 'sq-name', sq.name));
        div.appendChild(el('div', 'sq-price', money(sq.price)));
      } else {
        div.appendChild(el('div', 'sq-emoji', SQ_EMOJI[sq.type] || ''));
        div.appendChild(el('div', 'sq-name', sq.name));
        if (sq.price) div.appendChild(el('div', 'sq-price', money(sq.price)));
        if (sq.amount) div.appendChild(el('div', 'sq-price', money(sq.amount)));
      }
      div.appendChild(el('div', 'owner-flag'));
      div.appendChild(el('div', 'sq-houses'));
      div.appendChild(el('div', 'sq-tokens'));
      div.title = sq.name;
      board.appendChild(div);
    }
    buildDice();
  }

  /* ---------- קוביות תלת-ממד ---------- */

  // פריסת נקודות לכל ערך (רשת 3×3, אינדקסים 1-9)
  const PIP_LAYOUT = {
    1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
  };
  // איזה ערך יושב על כל פאה, והסיבוב שמביא אותו קדימה
  const FACE_TRANSFORMS = [
    { value: 1, css: 'rotateY(0deg) translateZ(var(--hz))' },
    { value: 2, css: 'rotateY(180deg) translateZ(var(--hz))' },
    { value: 3, css: 'rotateY(90deg) translateZ(var(--hz))' },
    { value: 4, css: 'rotateY(-90deg) translateZ(var(--hz))' },
    { value: 5, css: 'rotateX(90deg) translateZ(var(--hz))' },
    { value: 6, css: 'rotateX(-90deg) translateZ(var(--hz))' },
  ];
  const VALUE_ROTATION = {
    1: [0, 0], 2: [0, 180], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [90, 0],
  };

  function buildDice() {
    for (const id of ['die1', 'die2']) {
      const die = document.getElementById(id);
      die.innerHTML = '';
      const size = die.parentElement.offsetWidth || 60;
      die.style.setProperty('--hz', `${size / 2}px`);
      for (const f of FACE_TRANSFORMS) {
        const face = el('div', 'face');
        face.style.transform = f.css;
        for (let cell = 1; cell <= 9; cell++) {
          const pip = el('span');
          if (PIP_LAYOUT[f.value].includes(cell)) {
            pip.className = 'pip' + (f.value === 1 ? ' red' : '');
            pip.style.gridArea = `${Math.ceil(cell / 3)} / ${((cell - 1) % 3) + 1}`;
          }
          if (pip.className) face.appendChild(pip);
        }
        die.appendChild(face);
      }
    }
  }

  let diceSpins = 0;

  function setDieFace(id, value, extraSpin = false) {
    const die = document.getElementById(id);
    const [rx, ry] = VALUE_ROTATION[value];
    const spin = extraSpin ? 360 * (2 + (diceSpins % 2)) : 0;
    die.style.transform = `rotateX(${rx - 16 + spin}deg) rotateY(${ry + 22 + spin}deg)`;
  }

  async function animateDice(v1, v2) {
    diceSpins++;
    // עדכון עומק הקובייה לפי הגודל בפועל (המסך היה מוסתר בזמן הבנייה)
    for (const id of ['die1', 'die2']) {
      const die = document.getElementById(id);
      const size = die.parentElement.offsetWidth;
      if (size) die.style.setProperty('--hz', `${size / 2}px`);
    }
    sounds.dice();
    if (reducedMotion()) { setDieFace('die1', v1); setDieFace('die2', v2); return; }
    setDieFace('die1', v1, true);
    setDieFace('die2', v2, true);
    await wait(1080);
  }

  /* ---------- אנימציית תנועת כלי ---------- */

  function squareCenter(pos) {
    const board = $('#board');
    const sq = document.getElementById(`sq-${pos}`);
    const b = board.getBoundingClientRect();
    const s = sq.getBoundingClientRect();
    return { x: s.left - b.left + s.width / 2, y: s.top - b.top + s.height * 0.62 };
  }

  async function animateTokenMove(g, playerIdx, from, to) {
    const p = g.players[playerIdx];
    if (reducedMotion() || document.hidden) return;

    // מסלול: קדימה עד 12 צעדים, אחורה עד 3, אחרת "טיסה" ישירה (כלא)
    const fwd = (to - from + 40) % 40;
    const back = (from - to + 40) % 40;
    let path = [];
    if (fwd > 0 && fwd <= 12) for (let i = 1; i <= fwd; i++) path.push((from + i) % 40);
    else if (back > 0 && back <= 3) for (let i = 1; i <= back; i++) path.push((from - i + 40) % 40);
    else path = [to];

    // מסתירים את הכלי הסטטי במשבצת הישנה
    const oldSq = document.querySelector(`#sq-${from} .sq-tokens`);
    if (oldSq) {
      for (const t of oldSq.children) if (t.textContent === p.token) t.style.visibility = 'hidden';
    }

    const layer = $('#token-layer');
    const fly = el('span', 'fly-token', p.token);
    const start = squareCenter(from);
    fly.style.left = `${start.x}px`;
    fly.style.top = `${start.y}px`;
    layer.appendChild(fly);
    await wait(30);

    const stepMs = path.length > 8 ? 120 : 150;
    for (const pos of path) {
      const c = squareCenter(pos);
      fly.classList.remove('hop');
      void fly.offsetWidth;
      fly.classList.add('hop');
      fly.style.left = `${c.x}px`;
      fly.style.top = `${c.y}px`;
      sounds.tick();
      await wait(stepMs);
    }
    await wait(90);
    fly.remove();
  }

  /* ---------- קלף מתהפך ---------- */

  async function showCardFlip(deck, text) {
    const root = $('#card-root');
    root.classList.remove('hidden');
    const isChance = deck === 'chance';
    root.innerHTML = `
      <div class="flip-card ${isChance ? 'chance' : 'chest'}">
        <div class="flip-face flip-back">${isChance ? '❓' : '🎁'}</div>
        <div class="flip-face flip-front">
          <div class="gc-title">${isChance ? '✨ הפתעה ✨' : '🎁 תיבת המזל 🎁'}</div>
          <div class="gc-text">${text}</div>
        </div>
      </div>`;
    sounds.card();
    await wait(reducedMotion() ? 600 : 2800);
    root.classList.add('hidden');
    root.innerHTML = '';
  }

  /* ---------- קונפטי ---------- */

  function confettiBurst(durationMs = 4500) {
    if (reducedMotion()) return;
    const canvas = $('#confetti');
    const c = canvas.getContext('2d');
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    const colors = ['#E0393E', '#F5B940', '#2FA671', '#3D8FD1', '#8E44AD', '#FFFFFF'];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      w: 6 + Math.random() * 7,
      h: 8 + Math.random() * 10,
      vy: 2 + Math.random() * 3.2,
      vx: -1.4 + Math.random() * 2.8,
      rot: Math.random() * Math.PI,
      vr: -0.12 + Math.random() * 0.24,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function frame(t) {
      c.clearRect(0, 0, canvas.width, canvas.height);
      for (const pt of parts) {
        pt.x += pt.vx; pt.y += pt.vy; pt.rot += pt.vr;
        c.save();
        c.translate(pt.x, pt.y);
        c.rotate(pt.rot);
        c.fillStyle = pt.color;
        c.fillRect(-pt.w / 2, -pt.h / 2, pt.w, pt.h);
        c.restore();
      }
      if (t - t0 < durationMs) requestAnimationFrame(frame);
      else c.clearRect(0, 0, canvas.width, canvas.height);
    })(t0);
  }

  /* ---------- רינדור מצב ---------- */

  let prevMoney = [];
  let lastLogId = 0;
  let lastPositions = [];

  function animateBalance(elBalance, from, to) {
    if (from === to || reducedMotion()) { elBalance.textContent = money(to); return; }
    const t0 = performance.now();
    const dur = 650;
    (function frame(t) {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      elBalance.textContent = money(Math.round(from + (to - from) * eased));
      if (k < 1) requestAnimationFrame(frame);
    })(t0);
  }

  async function render(g) {
    // 1. אנימציות תנועה (לפני עדכון המשבצות — הכלי הסטטי עדיין במקום הישן)
    const moves = [];
    g.players.forEach((p, i) => {
      if (lastPositions[i] !== undefined && lastPositions[i] !== p.pos && !p.bankrupt) {
        moves.push({ i, from: lastPositions[i], to: p.pos });
      }
    });
    for (const m of moves) await animateTokenMove(g, m.i, m.from, m.to);
    lastPositions = g.players.map((p) => p.pos);

    // 2. משבצות
    for (const sq of BOARD) {
      const div = $(`#sq-${sq.pos}`);
      const ownerIdx = g.owner[sq.pos];
      div.classList.toggle('mortgaged', !!g.mortgaged[sq.pos]);
      div.classList.toggle('owned', ownerIdx !== null);
      const flag = div.querySelector('.owner-flag');
      flag.style.borderColor = ownerIdx !== null
        ? `${PLAYER_COLORS[ownerIdx]} transparent transparent transparent`
        : '';

      const housesEl = div.querySelector('.sq-houses');
      const h = g.houses[sq.pos];
      housesEl.textContent = h === 5 ? '🏨' : '🏠'.repeat(h);

      const toks = div.querySelector('.sq-tokens');
      toks.innerHTML = '';
      for (const p of g.players) {
        if (!p.bankrupt && p.pos === sq.pos) toks.appendChild(el('span', 'tok', p.token));
      }
    }

    // 3. קוביות (מצב סופי, בלי אנימציה — האנימציה רצה ב-animateDice)
    if (g.dice[0]) { setDieFace('die1', g.dice[0]); setDieFace('die2', g.dice[1]); }

    // 4. באנר תור
    const cur = g.current();
    $('#turn-banner').textContent =
      g.phase === 'gameover'
        ? `🏆 ${g.players[g.winner].name} ניצח/ה!`
        : `התור של ${cur.token} ${cur.name}`;

    // 5. כרטיסי אשראי
    const panel = $('#cards-panel');
    panel.innerHTML = '';
    g.players.forEach((p, i) => {
      const card = el('div', 'credit-card');
      card.style.background = `linear-gradient(135deg, ${PLAYER_COLORS[i]}, ${PLAYER_COLORS[i]}bb 55%, #22242C)`;
      if (i === g.turn && g.phase !== 'gameover') card.classList.add('active');
      if (p.bankrupt) card.classList.add('bankrupt');
      const props = g.playerProps(i).length;
      card.innerHTML = `
        <div class="cc-top"><span>${p.token} ${p.name}</span><span class="cc-chip">💳</span></div>
        <div class="cc-balance"></div>
        <div class="cc-sub"><span>חשבון בנק מונופול</span><span>🏠 ${props} נכסים</span></div>`;
      const balEl = card.querySelector('.cc-balance');
      if (p.bankrupt) balEl.textContent = 'פשט/ה רגל';
      else animateBalance(balEl, prevMoney[i] !== undefined ? prevMoney[i] : p.money, p.money);
      if (prevMoney[i] !== undefined && prevMoney[i] !== p.money && !p.bankrupt) {
        const diff = p.money - prevMoney[i];
        const f = el('div', `cc-float ${diff > 0 ? 'gain' : 'loss'}`,
          `${diff > 0 ? '+' : ''}${diff.toLocaleString('he-IL')} ₪`);
        card.appendChild(f);
        setTimeout(() => f.remove(), 1500);
      }
      panel.appendChild(card);
    });
    prevMoney = g.players.map((p) => p.money);

    // 6. יומן: צלילים, הקראה, קלפים מתהפכים
    const logEl = $('#log');
    const newEntries = g.log.filter((entry) => entry.id > lastLogId);
    lastLogId = g._logSeq;
    for (const entry of newEntries) {
      logEl.prepend(el('div', `entry kind-${entry.kind}`, entry.text));
      if (entry.kind === 'buy') sounds.buy();
      if (entry.kind === 'rent' || entry.kind === 'tax') sounds.pay();
      if (entry.kind === 'money') sounds.money();
      if (entry.kind === 'jail' || entry.kind === 'bankrupt') sounds.jail();
      if (SPOKEN_KINDS.has(entry.kind)) speak(entry.text);
      if (entry.kind === 'card' && entry.deck) await showCardFlip(entry.deck, entry.cardText);
    }

    // 7. הבהוב המשבצת הנוכחית
    const sqDiv = $(`#sq-${cur.pos}`);
    if (sqDiv) { sqDiv.classList.remove('flash'); void sqDiv.offsetWidth; sqDiv.classList.add('flash'); }
  }

  /* ---------- דיאלוגים ---------- */

  function openDialog(html) {
    const root = $('#dialog-root');
    root.innerHTML = '';
    const d = el('div', 'dialog', html);
    root.appendChild(d);
    root.classList.remove('hidden');
    return d;
  }

  function closeDialog() {
    $('#dialog-root').classList.add('hidden');
    $('#dialog-root').innerHTML = '';
  }

  function deedHTML(g, pos) {
    const sq = BOARD[pos];
    if (sq.type === 'street') {
      const grp = GROUPS[sq.group];
      return `
        <div class="deed">
          <div class="deed-band" style="background:${grp.color}">${sq.name}<br><small>${grp.name}</small></div>
          <div class="deed-body"><table>
            <tr><td>שכר דירה</td><td>${money(sq.rent[0])}</td></tr>
            <tr><td>עם בית אחד</td><td>${money(sq.rent[1])}</td></tr>
            <tr><td>עם 2 בתים</td><td>${money(sq.rent[2])}</td></tr>
            <tr><td>עם 3 בתים</td><td>${money(sq.rent[3])}</td></tr>
            <tr><td>עם 4 בתים</td><td>${money(sq.rent[4])}</td></tr>
            <tr><td>עם מלון 🏨</td><td>${money(sq.rent[5])}</td></tr>
            <tr><td>מחיר בית</td><td>${money(grp.houseCost)}</td></tr>
            <tr><td>משכנתא</td><td>${money(sq.price / 2)}</td></tr>
          </table></div>
        </div>`;
    }
    const desc = sq.type === 'rail'
      ? `שכר דירה: 25 / 50 / 100 / 200 ₪<br>לפי מספר הרכבות שבבעלותך`
      : `שכר דירה: הקוביות ×4<br>עם שתי החברות: הקוביות ×10`;
    return `
      <div class="deed">
        <div class="deed-band" style="background:#546E7A">${SQ_EMOJI[sq.type]} ${sq.name}</div>
        <div class="deed-body">${desc}<br>משכנתא: ${money(sq.price / 2)}</div>
      </div>`;
  }

  function showBuyDialog(g, onBuy, onDecline) {
    const pos = g.pendingBuy;
    const sq = BOARD[pos];
    const p = g.current();
    const canAfford = p.money >= sq.price;
    const d = openDialog(`
      <h2>רוצה לקנות? 🛍️</h2>
      ${deedHTML(g, pos)}
      <p class="d-sub" style="margin-top:14px">מחיר: <b>${money(sq.price)}</b> · בחשבון שלך: <b>${money(p.money)}</b></p>
      ${canAfford ? '<p class="d-sub">💡 כדאי לקנות נכסים — הם מכניסים כסף!</p>' : '<p class="d-sub">😕 אין מספיק כסף בחשבון...</p>'}
      <div class="d-actions">
        <button class="big-btn green" id="d-buy" ${canAfford ? '' : 'disabled'}>💳 קונים!</button>
        <button class="big-btn" id="d-skip">🙅 לא הפעם</button>
      </div>`);
    d.querySelector('#d-buy').onclick = () => { closeDialog(); onBuy(); };
    d.querySelector('#d-skip').onclick = () => { closeDialog(); onDecline(); };
  }

  function renderAuction(g, humanIdx, onBid, onPass) {
    const a = g.auction;
    const isMyTurn = g.auctionTurn() === humanIdx && !g.players[humanIdx].bankrupt;
    const high = a.highBidder !== null ? g.players[a.highBidder] : null;
    const minBid = a.currentBid === 0 ? 10 : a.currentBid + 10;
    const myMoney = g.players[humanIdx] ? g.players[humanIdx].money : 0;
    const iAmHigh = a.highBidder === humanIdx;
    const d = openDialog(`
      <h2>מכירה פומבית! 🔨</h2>
      ${deedHTML(g, a.pos)}
      <p class="d-sub" style="margin-top:14px">
        הצעה נוכחית: <b>${a.currentBid ? money(a.currentBid) : 'אין עדיין'}</b>
        ${high ? ` (של ${high.token} ${high.name})` : ''}
      </p>
      ${isMyTurn ? `
        <p class="d-sub">${iAmHigh ? 'ההצעה שלך מובילה! ⭐' : 'תורך להציע!'}</p>
        <div class="d-actions">
          <button class="big-btn green" id="d-bid10" ${myMoney >= minBid ? '' : 'disabled'}>הצעה: ${money(minBid)}</button>
          <button class="big-btn blue" id="d-bid50" ${myMoney >= a.currentBid + 50 ? '' : 'disabled'}>הצעה: ${money(a.currentBid + 50)}</button>
          <button class="big-btn" id="d-pass" ${iAmHigh ? 'disabled' : ''}>פורש 🏳️</button>
        </div>`
        : `<p class="d-sub">⏳ המחשב חושב...</p>`}
    `);
    if (isMyTurn) {
      d.querySelector('#d-bid10').onclick = () => onBid(minBid);
      d.querySelector('#d-bid50').onclick = () => onBid(a.currentBid + 50);
      d.querySelector('#d-pass').onclick = () => onPass();
    }
  }

  function showJailDialog(g, { onPay, onCard, onRoll }) {
    const p = g.current();
    const d = openDialog(`
      <h2>אתה בכלא! 👮</h2>
      <p class="d-sub">איך יוצאים? (ניסיון ${p.jailRolls + 1} מתוך 3)</p>
      <div class="d-actions">
        <button class="big-btn blue" id="d-roll">🎲 מנסים דאבל</button>
        <button class="big-btn green" id="d-pay" ${p.money >= 50 ? '' : 'disabled'}>💳 משלמים 50 ₪</button>
        ${p.jailCards.length ? '<button class="big-btn" id="d-card">🎫 כרטיס יציאה חינם</button>' : ''}
      </div>`);
    d.querySelector('#d-roll').onclick = () => { closeDialog(); onRoll(); };
    d.querySelector('#d-pay').onclick = () => { closeDialog(); onPay(); };
    const cardBtn = d.querySelector('#d-card');
    if (cardBtn) cardBtn.onclick = () => { closeDialog(); onCard(); };
  }

  function showDebtDialog(g, humanIdx, { onAction, onSettle, onBankrupt }) {
    const debt = g.debt;
    const p = g.players[humanIdx];
    const canPay = p.money >= debt.amount;
    const canRaise = g.canAffordDebt();
    const creditor = debt.creditor !== null ? g.players[debt.creditor].name : 'הבנק';

    const rows = [];
    for (const pos of g.playerProps(humanIdx)) {
      const sq = BOARD[pos];
      const grp = sq.group ? GROUPS[sq.group] : null;
      const actions = [];
      if (g.canSellHouseOn(humanIdx, pos)) {
        actions.push(`<button data-act="sellHouse" data-pos="${pos}">מכירת בית +${money(grp.houseCost / 2)}</button>`);
      }
      if (g.canMortgage(humanIdx, pos)) {
        actions.push(`<button data-act="mortgage" data-pos="${pos}">משכנתא +${money(sq.price / 2)}</button>`);
      }
      if (!actions.length) continue;
      rows.push(`<div class="asset-row">
        <span class="a-band" style="background:${grp ? grp.color : '#546E7A'}"></span>
        <span class="a-name">${sq.name}${g.houses[pos] ? ' ' + (g.houses[pos] === 5 ? '🏨' : '🏠'.repeat(g.houses[pos])) : ''}</span>
        ${actions.join('')}
      </div>`);
    }

    const d = openDialog(`
      <h2>צריך לשלם! 💸</h2>
      <p class="debt-need">חוב של ${money(debt.amount)} ל${creditor}</p>
      <p class="d-sub">בחשבון שלך: <b>${money(p.money)}</b></p>
      ${canPay ? '' : (rows.length ? '<p class="d-sub">אפשר למכור בתים או לקחת משכנתא:</p>' : '')}
      <div class="asset-list">${rows.join('')}</div>
      <div class="d-actions">
        <button class="big-btn green" id="d-settle" ${canPay ? '' : 'disabled'}>💳 משלמים את החוב</button>
        ${canRaise ? '' : '<button class="big-btn" id="d-bankrupt">😢 פשיטת רגל</button>'}
      </div>`);
    d.querySelectorAll('button[data-act]').forEach((b) => {
      b.onclick = () => onAction(b.dataset.act, Number(b.dataset.pos));
    });
    d.querySelector('#d-settle').onclick = () => { closeDialog(); onSettle(); };
    const bk = d.querySelector('#d-bankrupt');
    if (bk) bk.onclick = () => {
      if (confirm('בטוח? פשיטת רגל מוציאה אותך מהמשחק!')) { closeDialog(); onBankrupt(); }
    };
  }

  function showManageDialog(g, humanIdx, { onAction, onClose }) {
    const props = g.playerProps(humanIdx);
    const p = g.players[humanIdx];
    const rows = props.map((pos) => {
      const sq = BOARD[pos];
      const grp = sq.group ? GROUPS[sq.group] : null;
      const actions = [];
      if (g.canBuildOn(humanIdx, pos)) actions.push(`<button data-act="build" data-pos="${pos}">🏠 בנייה ‎-${money(grp.houseCost)}</button>`);
      if (g.canSellHouseOn(humanIdx, pos)) actions.push(`<button data-act="sellHouse" data-pos="${pos}">מכירת בית +${money(grp.houseCost / 2)}</button>`);
      if (g.canMortgage(humanIdx, pos)) actions.push(`<button data-act="mortgage" data-pos="${pos}">משכנתא +${money(sq.price / 2)}</button>`);
      if (g.mortgaged[pos]) {
        const cost = Math.round((sq.price / 2) * 1.1);
        actions.push(`<button data-act="unmortgage" data-pos="${pos}" ${p.money >= cost ? '' : 'disabled'}>פדיון ‎-${money(cost)}</button>`);
      }
      return `<div class="asset-row">
        <span class="a-band" style="background:${grp ? grp.color : '#546E7A'}"></span>
        <span class="a-name">${sq.name}${g.mortgaged[pos] ? ' 🔒' : ''}${g.houses[pos] ? ' ' + (g.houses[pos] === 5 ? '🏨' : '🏠'.repeat(g.houses[pos])) : ''}</span>
        ${actions.join('') || '<small>—</small>'}
      </div>`;
    });
    const d = openDialog(`
      <h2>העסקים שלי 🏠</h2>
      <p class="d-sub">בחשבון: <b>${money(p.money)}</b> · בתים במלאי הבנק: ${g.housesLeft} · מלונות: ${g.hotelsLeft}</p>
      <div class="asset-list">${rows.join('') || '<p class="d-sub">עוד אין לך נכסים — קנה כשנוחתים על משבצת פנויה!</p>'}</div>
      <div class="d-actions"><button class="big-btn blue" id="d-close">סגירה</button></div>`);
    d.querySelectorAll('button[data-act]').forEach((b) => {
      b.onclick = () => onAction(b.dataset.act, Number(b.dataset.pos));
    });
    d.querySelector('#d-close').onclick = () => { closeDialog(); if (onClose) onClose(); };
  }

  function showTradeDialog(g, humanIdx, aiIdx, { onSubmit, onClose }) {
    const mkRows = (idx, side) => g.playerProps(idx)
      .filter((pos) => g.canTradeProp(idx, pos))
      .map((pos) => {
        const sq = BOARD[pos];
        const grp = sq.group ? GROUPS[sq.group] : null;
        return `<div class="asset-row selectable" data-side="${side}" data-pos="${pos}">
          <span class="a-band" style="background:${grp ? grp.color : '#546E7A'}"></span>
          <span class="a-name">${sq.name}${g.mortgaged[pos] ? ' 🔒' : ''}</span>
          <span>${money(sq.price)}</span>
        </div>`;
      }).join('');

    const ai = g.players[aiIdx];
    const d = openDialog(`
      <h2>הצעת עסקה 🤝</h2>
      <p class="d-sub">מסמנים נכסים להחלפה עם ${ai.token} ${ai.name}, ואפשר להוסיף כסף:</p>
      <div style="display:flex; gap:14px; text-align:right">
        <div style="flex:1"><b>אני נותן/ת:</b><div class="asset-list">${mkRows(humanIdx, 'give') || '<small>אין נכסים סחירים</small>'}</div>
          <label style="font-size:14px">💳 כסף שלי: <input type="number" id="t-mgive" min="0" step="10" value="0"></label>
        </div>
        <div style="flex:1"><b>אני מקבל/ת:</b><div class="asset-list">${mkRows(aiIdx, 'get') || '<small>אין נכסים סחירים</small>'}</div>
          <label style="font-size:14px">💳 כסף שלו: <input type="number" id="t-mget" min="0" step="10" value="0"></label>
        </div>
      </div>
      <div class="d-actions">
        <button class="big-btn green" id="d-offer">📨 שולחים הצעה</button>
        <button class="big-btn" id="d-cancel">ביטול</button>
      </div>`);
    d.querySelectorAll('.selectable').forEach((row) => {
      row.onclick = () => row.classList.toggle('selected');
    });
    d.querySelector('#d-offer').onclick = () => {
      const give = [...d.querySelectorAll('.selected[data-side="give"]')].map((r) => Number(r.dataset.pos));
      const get = [...d.querySelectorAll('.selected[data-side="get"]')].map((r) => Number(r.dataset.pos));
      const moneyGive = Number(d.querySelector('#t-mgive').value) || 0;
      const moneyGet = Number(d.querySelector('#t-mget').value) || 0;
      closeDialog();
      onSubmit({ give, get, moneyGive, moneyGet });
    };
    d.querySelector('#d-cancel').onclick = () => { closeDialog(); if (onClose) onClose(); };
  }

  function showAiTradeOffer(g, aiIdx, pos, offer, { onAccept, onDecline }) {
    const sq = BOARD[pos];
    const ai = g.players[aiIdx];
    const d = openDialog(`
      <h2>${ai.token} ${ai.name} מציע עסקה!</h2>
      ${deedHTML(g, pos)}
      <p class="d-sub" style="margin-top:14px">${ai.name} רוצה לקנות ממך את <b>"${sq.name}"</b><br>
      תמורת <b style="font-size:23px">${money(offer)}</b> (המחיר בלוח: ${money(sq.price)})</p>
      <div class="d-actions">
        <button class="big-btn green" id="d-acc">✅ מסכימים!</button>
        <button class="big-btn" id="d-dec">❌ לא מוכרים</button>
      </div>`);
    d.querySelector('#d-acc').onclick = () => { closeDialog(); onAccept(); };
    d.querySelector('#d-dec').onclick = () => { closeDialog(); onDecline(); };
  }

  function showWin(g, onRestart) {
    const w = g.players[g.winner];
    sounds.win();
    confettiBurst(6000);
    const d = openDialog(`
      <div class="win-burst">🏆</div>
      <h2>${w.token} ${w.name} ניצח/ה במשחק!</h2>
      <p class="d-sub">כל הכבוד! ${w.name} נשאר/ה אחרון/ה במשחק עם ${money(w.money)} בחשבון.</p>
      <div class="d-actions"><button class="big-btn green" id="d-again">🎲 משחק חדש</button></div>`);
    d.querySelector('#d-again').onclick = onRestart;
  }

  function toast(text) {
    const t = el('div', 'toast', text);
    $('#toast-root').appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }

  // אתחול התצוגה אחרי שחזור משחק שמור: היומן נטען בלי צלילים והקראות
  function primeFromRestore(g) {
    const logEl = $('#log');
    logEl.innerHTML = '';
    for (const entry of g.log) logEl.prepend(el('div', `entry kind-${entry.kind}`, entry.text));
    lastLogId = g._logSeq;
    lastPositions = g.players.map((p) => p.pos);
    prevMoney = g.players.map((p) => p.money);
  }

  function setSound(on) {
    soundOn = on;
    if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
    $('#sound-btn').textContent = on ? '🔊' : '🔇';
  }

  function isSoundOn() { return soundOn; }

  globalThis.MonopolyUI = {
    buildBoard, render, animateDice, openDialog, closeDialog,
    showBuyDialog, renderAuction, showJailDialog, showDebtDialog,
    showManageDialog, showTradeDialog, showAiTradeOffer, showWin,
    toast, speak, setSound, isSoundOn, sounds, confettiBurst, primeFromRestore,
  };
})();
