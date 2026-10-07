/* משחק מרחוק (שלב ב') — שני ילדים אמיתיים, עם וידאו ומיקרופון.
 *
 * ארכיטקטורה (בלי שרת — מתאים ל-GitHub Pages):
 *  - חיבור P2P דו-שלבי: קודם ערוץ נתונים בלבד (קוד קטן), ואז הווידאו/מיקרופון
 *    מתווספים אוטומטית דרך הערוץ (מו"מ מושלם) — בלי העתקה נוספת.
 *  - האיתות הראשוני נעשה בקישור-ללחיצה: כל צד שולח קישור קצר (דחוס) שהחבר/ה
 *    רק *לוחצ/ת* עליו. אין העתקת בלוק ענק.
 *  - סנכרון מצב: המארח סמכותי — מריץ את המנוע ומשדר toJSON; האורח משקף ב-restore
 *    ושולח פעולות דרך גשר גנרי.
 *
 * מבודד לחלוטין ממשחק היחיד — נכנס אליו רק מכפתור ייעודי / מקישור הזמנה.
 */
(function () {
  'use strict';

  const D = globalThis.MONOPOLY_DATA;
  const UI = globalThis.MonopolyUI;
  const { Game } = globalThis.MonopolyEngine;
  const $ = (s) => document.querySelector(s);

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  let pc = null;
  let channel = null;
  let role = null;        // 'host' | 'guest'
  let active = false;
  let myIdx = 0;          // מארח=0, אורח=1
  let game = null;
  let myName = 'אני';
  let peerName = 'חבר/ה';
  let localStream = null;
  let lastUiSig = '';
  let lastDice = [0, 0];

  // מו"מ מושלם (perfect negotiation) — לתוספת מדיה אחרי החיבור
  let autoNego = false;   // מפעילים רק אחרי לחיצת היד הראשונית
  let makingOffer = false;
  let ignoreOffer = false;
  let polite = false;     // האורח מנומס

  /* ==================== קידוד/דחיסה של קוד האיתות ==================== */

  function bytesToB64url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  // 'C' = דחוס (deflate-raw), 'P' = רגיל. הדחיסה מקטינה את ה-SDP פי ~4.
  async function encodeSignal(obj) {
    const json = JSON.stringify(obj);
    if (typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('deflate-raw');
      const buf = await new Response(
        new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(cs),
      ).arrayBuffer();
      return 'C' + bytesToB64url(new Uint8Array(buf));
    }
    return 'P' + bytesToB64url(new TextEncoder().encode(json));
  }
  async function decodeSignal(code) {
    code = String(code).trim();
    const tag = code[0];
    const bytes = b64urlToBytes(code.slice(1));
    if (tag === 'C' && typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
      return JSON.parse(new TextDecoder().decode(buf));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ממתין לסיום איסוף ICE כדי לארוז הכול בקוד יחיד (בלי trickle) בשלב הראשוני.
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
      setTimeout(resolve, 4000);
    });
  }

  const baseUrl = () => location.href.split('#')[0];
  const joinLink = (code) => `${baseUrl()}#j=${code}`;
  const answerLink = (code) => `${baseUrl()}#a=${code}`;
  // חילוץ קוד מקישור או מקוד גולמי
  function extractCode(text) {
    text = String(text).trim();
    const m = text.match(/#[ja]=([^#\s]+)/);
    return m ? m[1] : text;
  }

  /* ==================== חיבוריות P2P ==================== */

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
    // מו"מ מושלם — מפעיל את שידור המדיה אחרי החיבור, דרך ערוץ הנתונים
    pc.addEventListener('negotiationneeded', async () => {
      if (!autoNego) return;
      try {
        makingOffer = true;
        await pc.setLocalDescription();
        send({ t: 'sdp', sdp: pc.localDescription });
      } catch (e) { /* */ } finally { makingOffer = false; }
    });
    pc.addEventListener('icecandidate', ({ candidate }) => {
      if (candidate && autoNego) send({ t: 'ice', candidate });
    });
  }

  function bindChannel() {
    channel.addEventListener('open', onConnected);
    channel.addEventListener('message', (ev) => handleMessage(JSON.parse(ev.data)));
  }

  async function hostCreateOffer() {
    pc = new RTCPeerConnection(RTC_CONFIG);
    polite = false;
    setupPeerCommon();
    channel = pc.createDataChannel('game');
    bindChannel();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceComplete(pc);
    return encodeSignal({ t: 'offer', sdp: pc.localDescription, name: myName });
  }

  async function hostAcceptAnswer(code) {
    const sig = await decodeSignal(extractCode(code));
    if (sig.t !== 'answer') throw new Error('הקוד לא מתאים — נסו שוב');
    peerName = sig.name || peerName;
    await pc.setRemoteDescription(sig.sdp);
  }

  async function guestCreateAnswer(code) {
    const sig = await decodeSignal(extractCode(code));
    if (sig.t !== 'offer') throw new Error('הקוד לא מתאים — נסו שוב');
    peerName = sig.name || peerName;
    pc = new RTCPeerConnection(RTC_CONFIG);
    polite = true;
    setupPeerCommon();
    pc.addEventListener('datachannel', (ev) => { channel = ev.channel; bindChannel(); });
    await pc.setRemoteDescription(sig.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);
    return encodeSignal({ t: 'answer', sdp: pc.localDescription, name: myName });
  }

  // תוספת וידאו/מיקרופון אחרי שהחיבור נוצר — מפעיל מו"מ אוטומטי דרך הערוץ.
  async function enableMedia() {
    autoNego = true;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const lv = $('#local-video');
      if (lv) lv.srcObject = localStream;
      for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    } catch (e) {
      UI.toast('אין גישה למצלמה — ממשיכים בלי וידאו');
    }
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
    // מנקים את ה-hash כדי שרענון לא ינסה להתחבר שוב
    try { history.replaceState(null, '', baseUrl()); } catch (e) { /* */ }
    UI.toast(`🎉 מחוברים! משחקים עם ${peerName}`);
    enableMedia(); // וידאו/מיקרופון מתווספים אוטומטית דרך הערוץ
    if (role === 'host') { myIdx = 0; } else { myIdx = 1; }
    UI.setLocalIdx(myIdx); // קריינות וחלוניות "שלם/קבל" — רק על השחקן שמול המסך הזה
    if (role === 'host') startHostGame();
    else send({ t: 'hello', name: myName });
  }

  function startHostGame() {
    const tokens = D.TOKENS;
    const spec = [
      { name: myName, token: tokens[0].emoji, isAI: false, gender: 'm' },
      { name: peerName, token: tokens[1].emoji, isAI: false, gender: 'm' },
    ];
    game = new Game(spec, {});
    $('#setup-screen').classList.add('hidden');
    $('#game-screen').classList.remove('hidden');
    broadcastState();
    remoteTick();
  }

  function broadcastState() { send({ t: 'state', data: game.toJSON() }); }

  function applyAction(fromIdx, act) {
    if (role !== 'host' || !game) return;
    const allowed = [
      'rollDice', 'buy', 'declineBuy', 'placeBid', 'passAuction', 'endTurn',
      'payJailFine', 'useJailCard', 'buildHouse', 'sellHouse', 'mortgage',
      'unmortgage', 'settleDebt', 'declareBankruptcy', 'confirmPayment', 'collectMoney',
    ];
    if (!allowed.includes(act.fn)) return;
    try {
      game[act.fn](...(act.args || []));
    } catch (e) {
      if (fromIdx === myIdx) UI.toast(e.message);
      else send({ t: 'error', msg: e.message });
      return;
    }
    broadcastState();
    remoteTick();
  }

  function doAction(act) {
    if (role === 'host') applyAction(myIdx, act);
    else send({ t: 'action', act });
  }

  // מו"מ מדיה (perfect negotiation) — הודעות sdp/ice דרך הערוץ
  async function handleSignal(msg) {
    try {
      if (msg.t === 'sdp') {
        const desc = msg.sdp;
        const collision = desc.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
        ignoreOffer = !polite && collision;
        if (ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          send({ t: 'sdp', sdp: pc.localDescription });
        }
      } else if (msg.t === 'ice') {
        try { await pc.addIceCandidate(msg.candidate); } catch (e) { if (!ignoreOffer) throw e; }
      }
    } catch (e) { /* מתעלמים מכשלי מו"מ בודדים */ }
  }

  function handleMessage(msg) {
    switch (msg.t) {
      case 'hello': peerName = msg.name || peerName; updateTileNames(); break;
      case 'state': game = Game.restore(msg.data); remoteTick(); break;
      case 'action': if (role === 'host') applyAction(1, msg.act); break;
      case 'error': UI.toast(msg.msg); break;
      case 'sdp': case 'ice': handleSignal(msg); break;
      default: break;
    }
  }

  /* ==================== לולאת תצוגה משותפת ==================== */

  async function remoteTick() {
    if (!game) return;
    await UI.render(game);
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

    const sig = [game.phase, game.turn, game.debt ? game.debt.debtor : '-',
      game.pendingPay ? game.pendingPay.payer + ':' + game.pendingPay.amount : '-',
      game.pendingCollect ? game.pendingCollect.payee + ':' + game.pendingCollect.amount : '-',
      game.phase === 'auction' ? game.auctionTurn() : '-'].join(':');
    const sigChanged = sig !== lastUiSig;
    lastUiSig = sig;
    const myTurn = game.turn === myIdx;

    if (game.phase === 'auction') {
      if (game.auctionTurn() === myIdx) {
        UI.renderAuction(game, myIdx,
          (amt) => { UI.closeDialog(); doAction({ fn: 'placeBid', args: [myIdx, amt] }); },
          () => { UI.closeDialog(); doAction({ fn: 'passAuction', args: [myIdx] }); });
      } else {
        UI.closeAuctionDialog();
        if (sigChanged) UI.toast('🔨 החבר/ה מציע/ה במכירה הפומבית...');
      }
      return;
    }

    if (!sigChanged) return;

    if (game.phase === 'buy') {
      if (myTurn) UI.showBuyDialog(game, () => doAction({ fn: 'buy' }), () => doAction({ fn: 'declineBuy' }));
      else UI.toast(`🛍️ ${peerName} מחליט/ה אם לקנות...`);
    } else if (game.phase === 'pay') {
      if (game.pendingPay.payer === myIdx) {
        UI.showPayDialog(game, myIdx, {
          onConfirm: (typed) => doAction({ fn: 'confirmPayment', args: [typed] }),
        });
      } else UI.toast(`💳 ${peerName} מעביר/ה תשלום...`);
    } else if (game.phase === 'collect') {
      if (game.pendingCollect.payee === myIdx) {
        UI.showCollectDialog(game, { onCollect: () => doAction({ fn: 'collectMoney' }) });
      } else UI.toast(`💰 ${peerName} גובה תשלום...`);
    } else if (game.phase === 'debt') {
      if (game.debt.debtor === myIdx) {
        UI.showDebtDialog(game, myIdx, {
          onAction: (a, pos) => doAction({ fn: mapManageFn(a), args: [pos] }),
          onSettle: () => doAction({ fn: 'settleDebt' }),
          onBankrupt: () => doAction({ fn: 'declareBankruptcy' }),
        });
      } else UI.toast(`💸 ${peerName} מסדר/ת תשלום...`);
    } else if (game.phase === 'roll' && myTurn && game.current().inJail) {
      UI.showJailDialog(game, {
        onPay: () => doAction({ fn: 'payJailFine' }),
        onCard: () => doAction({ fn: 'useJailCard' }),
        onRoll: () => doAction({ fn: 'rollDice' }),
      });
    } else if (!myTurn && game.phase !== 'auction') {
      UI.toast(`⏳ תורו/ה של ${peerName}`);
    }
  }

  const mapManageFn = (a) => ({ build: 'buildHouse', sellHouse: 'sellHouse', mortgage: 'mortgage', unmortgage: 'unmortgage' }[a] || a);

  /* ==================== כפתורים ==================== */

  function bindRemoteButtons() {
    const roll = $('#roll-btn'), endT = $('#end-turn-btn'), manage = $('#manage-btn'), trade = $('#trade-btn');
    if (roll) roll.onclick = () => { if (!roll.disabled) doAction({ fn: 'rollDice' }); };
    if (endT) endT.onclick = () => { if (!endT.disabled) doAction({ fn: 'endTurn' }); };
    if (manage) manage.onclick = () => {
      if (manage.disabled) return;
      UI.showManageDialog(game, myIdx, {
        onAction: (a, pos) => doAction({ fn: mapManageFn(a), args: [pos] }),
        onClose: () => {},
      });
    };
    if (trade) trade.style.display = 'none';
    // מצב חינוך פיננסי לא פעיל במשחק מרחוק (המארח פותח משחק בלי אפשרויות בית)
    const bank = $('#bank-btn');
    if (bank) bank.style.display = 'none';
    const restart = $('#restart-btn');
    if (restart) restart.onclick = () => { if (confirm('לצאת מהמשחק המשותף?')) location.reload(); };
  }

  function updateButtons() {
    if (!game) return;
    const myTurn = game.turn === myIdx && !game.players[myIdx].bankrupt;
    const roll = $('#roll-btn'), endT = $('#end-turn-btn'), manage = $('#manage-btn');
    const inputPhase = game.phase === 'roll' || game.phase === 'end';
    if (roll) {
      roll.style.display = game.phase === 'roll' ? '' : 'none';
      roll.disabled = !(myTurn && game.phase === 'roll' && !game.current().inJail);
    }
    if (endT) {
      endT.style.display = game.phase === 'end' ? '' : 'none';
      endT.disabled = !(myTurn && game.phase === 'end');
    }
    if (manage) manage.disabled = !(myTurn && inputPhase);
    // רמז לחיצה גם במשחק מרחוק
    if (roll && !roll.disabled) UI.nudge(roll);
    else if (endT && !endT.disabled) UI.nudge(endT);
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

  /* ==================== מסכי חיבור (קישור ללחיצה) ==================== */

  // כפתור שיתוף — פותח את גיליון השיתוף בנייד (וואטסאפ וכו'), אחרת מעתיק.
  function shareRow(label, url, tip) {
    return `<div class="rm-share">
      <div class="rm-share-tip">${tip}</div>
      <button class="big-btn green rm-share-btn" data-url="${encodeURIComponent(url)}">📤 ${label}</button>
      <a class="rm-linkview" href="${url}">${url}</a>
    </div>`;
  }
  function wireShare(d) {
    d.querySelectorAll('.rm-share-btn').forEach((b) => {
      const url = decodeURIComponent(b.dataset.url);
      b.onclick = async () => {
        if (navigator.share) {
          try { await navigator.share({ title: 'מונופול — בואו נשחק!', text: 'לחצו כדי לשחק איתי מונופול 🎩', url }); return; }
          catch (e) { /* בוטל — ננסה העתקה */ }
        }
        try { await navigator.clipboard.writeText(url); UI.toast('הקישור הועתק! שלחו לחבר/ה'); }
        catch (e) { UI.toast('סמנו את הקישור והעתיקו'); }
      };
    });
  }

  // שיתוף/העתקה של קוד טקסט (לקוד החוזר מהאורח) — לא קישור.
  function wireCodeShare(d) {
    d.querySelectorAll('.rm-copycode').forEach((b) => {
      const code = decodeURIComponent(b.dataset.code);
      b.onclick = async () => {
        if (navigator.share) {
          try { await navigator.share({ title: 'קוד חזרה למונופול', text: code }); return; }
          catch (e) { /* בוטל — ננסה העתקה */ }
        }
        try { await navigator.clipboard.writeText(code); UI.toast('הקוד הועתק! שלחו בחזרה לחבר/ה'); }
        catch (e) { UI.toast('סמנו את הקוד והעתיקו'); }
      };
    });
  }

  function openEntry() {
    const d = UI.openDialog(`
      <h2>משחק עם חבר/ה מרחוק 🎥</h2>
      <p class="d-sub">שחקו יחד עם וידאו ומיקרופון! שולחים קישור אחד לחבר/ה (למשל בוואטסאפ) — הוא/היא לוחצ/ת עליו, ומתחילים.</p>
      <label class="setup-label" for="rm-name">איך קוראים לך?</label>
      <input id="rm-name" type="text" maxlength="12" placeholder="השם שלי..." style="text-align:center">
      <div class="d-actions">
        <button class="big-btn green" id="rm-host">🎈 אני פותח/ת משחק</button>
        <button class="big-btn blue" id="rm-join">🔗 קיבלתי קישור</button>
      </div>
      <div class="d-actions"><button class="link-btn" id="rm-cancel">חזרה</button></div>`);
    d.querySelector('#rm-host').onclick = () => { myName = ($('#rm-name').value.trim() || 'אני'); role = 'host'; hostFlow(); };
    d.querySelector('#rm-join').onclick = () => {
      const jd = UI.openDialog(`
        <h2>הצטרפות למשחק 🔗</h2>
        <p class="d-sub">הדביקו כאן את הקישור שקיבלתם מהחבר/ה:</p>
        <textarea id="rm-joincode" class="rm-code" placeholder="הדביקו כאן את הקישור..."></textarea>
        <div class="d-actions"><button class="big-btn green" id="rm-joingo">➡️ ממשיכים</button></div>`);
      jd.querySelector('#rm-joingo').onclick = () => {
        const raw = jd.querySelector('#rm-joincode').value.trim();
        if (!raw) { UI.toast('הדביקו קודם את הקישור'); return; }
        guestFromLink(extractCode(raw));
      };
    };
    d.querySelector('#rm-cancel').onclick = () => UI.closeDialog();
  }

  async function hostFlow() {
    UI.openDialog(`<h2>מכינים קישור... ⏳</h2><p class="d-sub">עוד רגע יהיה מוכן קישור לשלוח לחבר/ה.</p>`);
    let code;
    try { code = await hostCreateOffer(); }
    catch (e) { showError(e.message); return; }
    const link = joinLink(code);
    const d = UI.openDialog(`
      <h2>שלב 1: שלחו קישור לחבר/ה 📤</h2>
      ${shareRow('שליחת קישור לחבר/ה', link, 'החבר/ה רק לוחצ/ת על הקישור ומצטרפ/ת:')}
      <hr class="rm-hr">
      <label class="setup-label">שלב 2: הדביקו כאן את הקוד שהחבר/ה שולח/ת בחזרה:</label>
      <p class="d-sub" style="margin:4px 0 8px">כדי שהמחשבים יכירו זה את זה, החבר/ה שולח/ת בסוף קוד קטן אחד בחזרה — הדביקו אותו כאן וזהו!</p>
      <textarea id="rm-answer" class="rm-code" placeholder="הדביקו כאן את הקוד שקיבלתם בחזרה..."></textarea>
      <div class="d-actions"><button class="big-btn green" id="rm-connect">🔌 מתחברים!</button></div>`);
    wireShare(d);
    d.querySelector('#rm-connect').onclick = async () => {
      const ans = d.querySelector('#rm-answer').value.trim();
      if (!ans) { UI.toast('הדביקו קודם את הקישור שקיבלתם'); return; }
      try { await hostAcceptAnswer(ans); UI.openDialog(`<h2>מתחברים... ⏳</h2><p class="d-sub">עוד רגע מתחילים לשחק!</p>`); }
      catch (e) { UI.toast(e.message); }
    };
  }

  // אורח שהגיע דרך קישור הזמנה (#j=...)
  async function guestFromLink(code) {
    role = 'guest';
    const d = UI.openDialog(`
      <h2>הזמנה למשחק! 🎉</h2>
      <p class="d-sub">מישהו הזמין אותך לשחק מונופול. איך קוראים לך?</p>
      <input id="rm-gname" type="text" maxlength="12" placeholder="השם שלי..." style="text-align:center">
      <div class="d-actions"><button class="big-btn green" id="rm-go">➡️ ממשיכים</button></div>`);
    d.querySelector('#rm-go').onclick = async () => {
      myName = (d.querySelector('#rm-gname').value.trim() || 'אני');
      UI.openDialog(`<h2>מתחברים... ⏳</h2><p class="d-sub">מכינים קישור קצר לשלוח בחזרה.</p>`);
      let ansCode;
      try { ansCode = await guestCreateAnswer(code); }
      catch (e) { showError(e.message); return; }
      const d2 = UI.openDialog(`
        <h2>צעד אחרון: שולחים קוד בחזרה 🔙</h2>
        <p class="d-sub">כדי שהמחשבים "יכירו" זה את זה, צריך לשלוח קוד קטן אחד בחזרה לחבר/ה שהזמין/ה — וזהו, מתחילים!</p>
        <textarea id="rm-anscode" class="rm-code" readonly>${ansCode}</textarea>
        <div class="d-actions">
          <button class="big-btn green rm-copycode" data-code="${encodeURIComponent(ansCode)}">📤 העתקה ושליחה בחזרה</button>
        </div>
        <p class="d-sub">⏳ אחרי ששלחתם — ממתינים לחיבור...</p>`);
      wireCodeShare(d2);
    };
  }

  function showError(msg) {
    const d = UI.openDialog(`<h2>אופס 😕</h2><p class="d-sub">${msg}</p><div class="d-actions"><button class="big-btn" id="e-ok">סגירה</button></div>`);
    d.querySelector('#e-ok').onclick = () => UI.closeDialog();
  }

  // זיהוי קישור הזמנה בטעינת הדף
  function checkHashOnLoad() {
    const h = location.hash || '';
    if (h.startsWith('#j=')) {
      const code = h.slice(3);
      // נותנים לדף להיטען, ואז פותחים את זרימת האורח
      setTimeout(() => guestFromLink(code), 300);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checkHashOnLoad);
  else checkHashOnLoad();

  /* ==================== API ==================== */

  globalThis.MonopolyRemote = {
    open: openEntry,
    active: () => active,
    _internals: { encodeSignal, decodeSignal, extractCode, joinLink, answerLink },
  };
})();
