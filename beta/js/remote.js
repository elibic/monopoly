/* משחק מרחוק (שלב ב') — שני ילדים אמיתיים, עם וידאו ומיקרופון.
 *
 * ארכיטקטורה:
 *  - WebRTC עמית-לעמית (P2P) עם איתות ידני בהעתק-הדבק (בלי שרת, מתאים ל-GitHub Pages).
 *  - ערוץ נתונים (DataChannel) לסנכרון מצב המשחק; המארח הוא המקור הסמכותי:
 *      המארח מריץ את המנוע ומשדר את המצב; האורח שולח פעולות והמארח מחיל אותן.
 *  - שידור וידאו/אודיו דו-כיווני דרך אותה חיבוריות.
 *
 * מבודד לחלוטין מהמשחק נגד המחשב — נכנס אליו רק מכפתור ייעודי במסך הפתיחה,
 * ואינו נוגע ב-main.js של משחק היחיד.
 */
(function () {
  'use strict';

  const D = globalThis.MONOPOLY_DATA;
  const UI = globalThis.MonopolyUI;
  const { Game } = globalThis.MonopolyEngine;
  const $ = (s) => document.querySelector(s);

  // ICE ציבורי בלבד (STUN). ללא TURN — עובד ברוב הרשתות הביתיות;
  // ברשתות סימטריות נוקשות ייתכן שיידרש TURN (הרחבה עתידית).
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  let pc = null;          // RTCPeerConnection
  let channel = null;     // RTCDataChannel
  let role = null;        // 'host' | 'guest'
  let active = false;     // האם מצב מרחוק פעיל
  let myIdx = 0;          // מארח=0, אורח=1
  let game = null;        // מופע המנוע (במארח: אמיתי; באורח: מראה)
  let myName = 'אני';
  let peerName = 'חבר/ה';
  let localStream = null;
  let lastUiSig = '';     // מונע פתיחת דיאלוגים חוזרת
  let lastDice = [0, 0];

  /* ==================== איתות (העתק-הדבק) ==================== */

  // ממתין לסיום איסוף מועמדי ICE כדי לארוז הכול בקוד יחיד (בלי trickle).
  function waitIceComplete(conn) {
    return new Promise((resolve) => {
      if (conn.iceGatheringState === 'complete') return resolve();
      const check = () => {
        if (conn.iceGatheringState === 'complete') {
          conn.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      conn.addEventListener('icegatheringstatechange', check);
      // גיבוי: אם לוקח יותר מדי זמן, ממשיכים בכל זאת
      setTimeout(resolve, 4000);
    });
  }

  const encodeSignal = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  const decodeSignal = (str) => JSON.parse(decodeURIComponent(escape(atob(str.trim()))));

  async function getMedia() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      localStream = null; // ממשיכים בלי מצלמה/מיקרופון
    }
    return localStream;
  }

  function attachTracks() {
    if (!localStream || !pc) return;
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  }

  function setupPeerCommon() {
    pc.addEventListener('track', (ev) => {
      const v = $('#remote-video');
      if (v && ev.streams[0]) v.srcObject = ev.streams[0];
    });
    pc.addEventListener('connectionstatechange', () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        UI.toast('📴 החיבור עם החבר/ה נותק');
      }
    });
  }

  function bindChannel() {
    channel.addEventListener('open', onConnected);
    channel.addEventListener('message', (ev) => handleMessage(JSON.parse(ev.data)));
  }

  /* ---------- זרימת מארח ---------- */
  async function hostCreateOffer() {
    pc = new RTCPeerConnection(RTC_CONFIG);
    setupPeerCommon();
    channel = pc.createDataChannel('game');
    bindChannel();
    await getMedia();
    attachTracks();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceComplete(pc);
    return encodeSignal({ t: 'offer', sdp: pc.localDescription, name: myName });
  }

  async function hostAcceptAnswer(code) {
    const sig = decodeSignal(code);
    if (sig.t !== 'answer') throw new Error('קוד לא תקין');
    peerName = sig.name || peerName;
    await pc.setRemoteDescription(sig.sdp);
  }

  /* ---------- זרימת אורח ---------- */
  async function guestCreateAnswer(code) {
    const sig = decodeSignal(code);
    if (sig.t !== 'offer') throw new Error('קוד לא תקין');
    peerName = sig.name || peerName;
    pc = new RTCPeerConnection(RTC_CONFIG);
    setupPeerCommon();
    pc.addEventListener('datachannel', (ev) => { channel = ev.channel; bindChannel(); });
    await getMedia();
    attachTracks();
    await pc.setRemoteDescription(sig.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);
    return encodeSignal({ t: 'answer', sdp: pc.localDescription, name: myName });
  }

  /* ==================== פרוטוקול המשחק ==================== */

  function send(obj) {
    if (channel && channel.readyState === 'open') channel.send(JSON.stringify(obj));
  }

  function onConnected() {
    active = true;
    UI.closeDialog();
    showVideoTiles();
    bindRemoteButtons();
    UI.toast(`🎉 מחוברים! משחקים עם ${peerName}`);
    if (role === 'host') {
      myIdx = 0;
      startHostGame();
    } else {
      myIdx = 1;
      // האורח מחכה למצב הראשוני מהמארח
      send({ t: 'hello', name: myName });
    }
  }

  function startHostGame() {
    const tokens = D.TOKENS;
    const spec = [
      { name: myName, token: tokens[0].emoji, isAI: false, gender: 'm' },
      { name: peerName, token: tokens[1].emoji, isAI: false, gender: 'm' },
    ];
    game = new Game(spec, {}); // בלי מכירות/קופה מיוחדות — ברירת מחדל
    $('#setup-screen').classList.add('hidden');
    $('#game-screen').classList.remove('hidden');
    broadcastState();
    remoteTick();
  }

  function broadcastState() {
    send({ t: 'state', data: game.toJSON() });
  }

  // המארח מחיל פעולה מ-fromIdx (0=מארח, 1=אורח)
  function applyAction(fromIdx, act) {
    if (role !== 'host' || !game) return;
    try {
      const fn = act.fn;
      const allowed = [
        'rollDice', 'buy', 'declineBuy', 'placeBid', 'passAuction', 'endTurn',
        'payJailFine', 'useJailCard', 'buildHouse', 'sellHouse', 'mortgage',
        'unmortgage', 'settleDebt', 'declareBankruptcy',
      ];
      if (!allowed.includes(fn)) return;
      game[fn](...(act.args || []));
    } catch (e) {
      // פעולה לא חוקית — מודיעים לשולח בלבד
      if (fromIdx === myIdx) UI.toast(e.message);
      else send({ t: 'error', to: fromIdx, msg: e.message });
      return;
    }
    broadcastState();
    remoteTick();
  }

  // פעולה מקומית — מארח מחיל ישירות, אורח שולח למארח
  function doAction(act) {
    if (role === 'host') applyAction(myIdx, act);
    else send({ t: 'action', act });
  }

  function handleMessage(msg) {
    switch (msg.t) {
      case 'hello':
        peerName = msg.name || peerName;
        updateTileNames();
        break;
      case 'state':
        game = Game.restore(msg.data);
        remoteTick();
        break;
      case 'action':
        if (role === 'host') applyAction(1, msg.act); // רק פעולות של האורח
        break;
      case 'error':
        UI.toast(msg.msg);
        break;
      default:
        break;
    }
  }

  /* ==================== לולאת תצוגה משותפת ==================== */

  async function remoteTick() {
    if (!game) return;
    await UI.render(game);

    // אנימציית קוביות כשמשתנות
    if (game.dice[0] && (game.dice[0] !== lastDice[0] || game.dice[1] !== lastDice[1])) {
      UI.animateDice(game.dice[0], game.dice[1]);
    }
    lastDice = game.dice.slice();

    updateButtons();

    if (game.phase === 'gameover') {
      UI.showWin(game, () => location.reload(), { humanIdx: myIdx });
      return;
    }

    if (game.phase !== 'auction') UI.closeAuctionDialog();

    // חתימת מצב — כדי לפתוח דיאלוגים רק כשמשהו רלוונטי אליי משתנה
    const sig = [game.phase, game.turn, game.debt ? game.debt.debtor : '-',
      game.phase === 'auction' ? game.auctionTurn() : '-'].join(':');
    const sigChanged = sig !== lastUiSig;
    lastUiSig = sig;

    const banner = $('#turn-banner');
    const myTurn = game.turn === myIdx;

    if (game.phase === 'auction') {
      const bidderIsMe = game.auctionTurn() === myIdx;
      if (bidderIsMe) {
        UI.renderAuction(game, myIdx,
          (amt) => { UI.closeDialog(); doAction({ fn: 'placeBid', args: [myIdx, amt] }); },
          () => { UI.closeDialog(); doAction({ fn: 'passAuction', args: [myIdx] }); });
      } else {
        UI.closeAuctionDialog();
        if (sigChanged) waitToast('🔨 החבר/ה מציע/ה במכירה הפומבית...');
      }
      return;
    }

    if (!sigChanged) return; // נמנע מפתיחת דיאלוגים חוזרת

    if (game.phase === 'buy') {
      if (myTurn) {
        UI.showBuyDialog(game,
          () => doAction({ fn: 'buy' }),
          () => doAction({ fn: 'declineBuy' }));
      } else waitToast(`🛍️ ${peerName} מחליט/ה אם לקנות...`);
    } else if (game.phase === 'debt') {
      if (game.debt.debtor === myIdx) {
        UI.showDebtDialog(game, myIdx, {
          onAction: (a, pos) => doAction({ fn: mapManageFn(a), args: [pos] }),
          onSettle: () => doAction({ fn: 'settleDebt' }),
          onBankrupt: () => doAction({ fn: 'declareBankruptcy' }),
        });
      } else waitToast(`💸 ${peerName} מסדר/ת תשלום...`);
    } else if (game.phase === 'roll' && myTurn && game.current().inJail) {
      UI.showJailDialog(game, {
        onPay: () => doAction({ fn: 'payJailFine' }),
        onCard: () => doAction({ fn: 'useJailCard' }),
        onRoll: () => doAction({ fn: 'rollDice' }),
      });
    }

    if (banner && !myTurn && game.phase !== 'auction') {
      // כרזת "תור החבר/ה" מנוהלת ע"י render; כאן רק טוסט עדין בעת שינוי
      if (sigChanged) waitToast(`⏳ תורו/ה של ${peerName}`);
    }
  }

  const mapManageFn = (a) => ({ build: 'buildHouse', sellHouse: 'sellHouse', mortgage: 'mortgage', unmortgage: 'unmortgage' }[a] || a);

  // טוסט המתנה — מוצג רק כשחתימת המצב משתנה, כך שאינו חוזר על עצמו.
  function waitToast(text) { UI.toast(text); }

  /* ==================== כפתורים ==================== */

  function bindRemoteButtons() {
    const roll = $('#roll-btn');
    const endT = $('#end-turn-btn');
    const manage = $('#manage-btn');
    const trade = $('#trade-btn');
    if (roll) roll.onclick = () => { if (!roll.disabled) doAction({ fn: 'rollDice' }); };
    if (endT) endT.onclick = () => { if (!endT.disabled) doAction({ fn: 'endTurn' }); };
    if (manage) manage.onclick = () => {
      if (manage.disabled) return;
      UI.showManageDialog(game, myIdx, {
        onAction: (a, pos) => doAction({ fn: mapManageFn(a), args: [pos] }),
        onClose: () => {},
      });
    };
    if (trade) { trade.style.display = 'none'; } // מסחר בין ילדים — הרחבה עתידית
    const restart = $('#restart-btn');
    if (restart) restart.onclick = () => { if (confirm('לצאת מהמשחק המשותף?')) location.reload(); };
  }

  function updateButtons() {
    if (!game) return;
    const myTurn = game.turn === myIdx && !game.players[myIdx].bankrupt;
    const roll = $('#roll-btn');
    const endT = $('#end-turn-btn');
    const manage = $('#manage-btn');
    const inputPhase = game.phase === 'roll' || game.phase === 'end';
    if (roll) {
      const canRoll = myTurn && game.phase === 'roll' && !game.current().inJail;
      roll.style.display = game.phase === 'roll' ? '' : 'none';
      roll.disabled = !canRoll;
    }
    if (endT) {
      endT.style.display = game.phase === 'end' ? '' : 'none';
      endT.disabled = !(myTurn && game.phase === 'end');
    }
    if (manage) manage.disabled = !(myTurn && inputPhase);
  }

  /* ==================== משבצות וידאו ==================== */

  function showVideoTiles() {
    if ($('#video-tiles')) return;
    const wrap = document.createElement('div');
    wrap.id = 'video-tiles';
    wrap.innerHTML = `
      <div class="vtile"><video id="local-video" autoplay playsinline muted></video><span class="vlabel" id="local-label">${myName}</span></div>
      <div class="vtile"><video id="remote-video" autoplay playsinline></video><span class="vlabel" id="remote-label">${peerName}</span></div>
      <button id="vt-toggle" class="vt-btn" title="הסתרה/הצגה">🎥</button>`;
    document.body.appendChild(wrap);
    const lv = $('#local-video');
    if (lv && localStream) lv.srcObject = localStream;
    $('#vt-toggle').onclick = () => wrap.classList.toggle('collapsed');
  }

  function updateTileNames() {
    const rl = $('#remote-label'); if (rl) rl.textContent = peerName;
    const ll = $('#local-label'); if (ll) ll.textContent = myName;
  }

  /* ==================== מסכי חיבור ==================== */

  function copyBtnHTML(id) { return `<button class="big-btn" id="${id}">📋 העתקה</button>`; }

  function wireCopy(d, btnId, text) {
    const b = d.querySelector('#' + btnId);
    if (b) b.onclick = async () => {
      try { await navigator.clipboard.writeText(text); UI.toast('הועתק! שלחו לחבר/ה'); }
      catch (e) { UI.toast('סמנו והעתיקו ידנית'); }
    };
  }

  function openEntry() {
    const d = UI.openDialog(`
      <h2>משחק עם חבר/ה מרחוק 🎥</h2>
      <p class="d-sub">שחקו יחד עם וידאו ומיקרופון! צריך עזרה של מבוגר להעביר קוד קצר בין השחקנים (למשל בוואטסאפ).</p>
      <label class="setup-label" for="rm-name">איך קוראים לך?</label>
      <input id="rm-name" type="text" maxlength="12" placeholder="השם שלי..." style="text-align:center">
      <div class="d-actions">
        <button class="big-btn green" id="rm-host">🎈 אני פותח/ת משחק</button>
        <button class="big-btn blue" id="rm-join">🔗 אני מצטרף/ת</button>
      </div>
      <div class="d-actions"><button class="link-btn" id="rm-cancel">חזרה</button></div>`);
    d.querySelector('#rm-host').onclick = () => { myName = ($('#rm-name').value.trim() || 'אני'); role = 'host'; hostFlow(); };
    d.querySelector('#rm-join').onclick = () => { myName = ($('#rm-name').value.trim() || 'אני'); role = 'guest'; guestFlow(); };
    d.querySelector('#rm-cancel').onclick = () => UI.closeDialog();
  }

  async function hostFlow() {
    UI.openDialog(`<h2>מכינים משחק... ⏳</h2><p class="d-sub">מבקשים גישה למצלמה ולמיקרופון ומכינים קוד הזמנה.</p>`);
    let code;
    try { code = await hostCreateOffer(); }
    catch (e) { UI.openDialog(`<h2>אופס 😕</h2><p class="d-sub">${e.message}</p><div class="d-actions"><button class="big-btn" id="e-ok">סגירה</button></div>`).querySelector('#e-ok').onclick = () => UI.closeDialog(); return; }
    const d = UI.openDialog(`
      <h2>שלב 1: שלחו את הקוד 📤</h2>
      <p class="d-sub">שלחו את קוד ההזמנה לחבר/ה. כשהוא/היא ישלח/תשלח לכם קוד בחזרה — הדביקו אותו למטה.</p>
      <textarea id="rm-code" class="rm-code" readonly>${code}</textarea>
      ${copyBtnHTML('rm-copy')}
      <label class="setup-label">הדביקו כאן את הקוד שקיבלתם בחזרה:</label>
      <textarea id="rm-answer" class="rm-code" placeholder="הדביקו כאן..."></textarea>
      <div class="d-actions"><button class="big-btn green" id="rm-connect">🔌 מתחברים!</button></div>`);
    wireCopy(d, 'rm-copy', code);
    d.querySelector('#rm-connect').onclick = async () => {
      const ans = d.querySelector('#rm-answer').value.trim();
      if (!ans) { UI.toast('הדביקו קודם את הקוד שקיבלתם'); return; }
      try { await hostAcceptAnswer(ans); UI.openDialog(`<h2>מתחברים... ⏳</h2><p class="d-sub">עוד רגע מתחילים לשחק!</p>`); }
      catch (e) { UI.toast(e.message); }
    };
  }

  async function guestFlow() {
    const d = UI.openDialog(`
      <h2>שלב 1: הדביקו את קוד ההזמנה 📥</h2>
      <p class="d-sub">הדביקו את הקוד שקיבלתם מהחבר/ה שפתח/ה את המשחק:</p>
      <textarea id="rm-offer" class="rm-code" placeholder="הדביקו כאן..."></textarea>
      <div class="d-actions"><button class="big-btn green" id="rm-make">➡️ ממשיכים</button></div>`);
    d.querySelector('#rm-make').onclick = async () => {
      const offer = d.querySelector('#rm-offer').value.trim();
      if (!offer) { UI.toast('הדביקו קודם את הקוד'); return; }
      UI.openDialog(`<h2>מכינים... ⏳</h2><p class="d-sub">מבקשים גישה למצלמה ולמיקרופון.</p>`);
      let code;
      try { code = await guestCreateAnswer(offer); }
      catch (e) { UI.toast(e.message); return; }
      const d2 = UI.openDialog(`
        <h2>שלב 2: שלחו את הקוד בחזרה 📤</h2>
        <p class="d-sub">שלחו את הקוד הזה בחזרה לחבר/ה שפתח/ה את המשחק — וזהו, מתחילים!</p>
        <textarea id="rm-code2" class="rm-code" readonly>${code}</textarea>
        ${copyBtnHTML('rm-copy2')}
        <p class="d-sub">⏳ ממתינים לחיבור...</p>`);
      wireCopy(d2, 'rm-copy2', code);
    };
  }

  /* ==================== API ==================== */

  globalThis.MonopolyRemote = {
    open: openEntry,
    active: () => active,
    // חשיפה לבדיקות loopback בלבד
    _internals: { encodeSignal, decodeSignal, RTC_CONFIG },
  };
})();
