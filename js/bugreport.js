/* דיווח באג בלחיצה אחת.
 *
 * הקובץ הזה נטען ראשון — לפני כל שאר הקוד — כדי שיתפוס גם שגיאות
 * שקורות בזמן הטעינה עצמה. הוא אוסף ברקע, בלי לשלוח שום דבר לשום
 * מקום, את מה שצריך כדי להבין תקלה: שגיאות, הודעות קונסול, הלחיצות
 * האחרונות, יומן המשחק ומצב המשחק המלא. רק כשהמשתמש לוחץ על
 * "דיווח באג" הכול נארז לקובץ אחד ונשלח/יורד ביוזמתו.
 *
 * שום מידע לא עוזב את המכשיר בלי לחיצה מפורשת.
 */
(function () {
  'use strict';

  const MAX_ERRORS = 60;
  const MAX_CONSOLE = 60;
  const MAX_CLICKS = 40;

  const startedAt = new Date();
  const errors = [];
  const consoleLines = [];
  const clicks = [];

  let getGame = null; // main.js מזריק גישה למשחק הנוכחי

  const ring = (arr, max, item) => {
    arr.push(item);
    if (arr.length > max) arr.shift();
  };

  const since = () => `+${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)}s`;

  /* ---------- איסוף ברקע ---------- */

  window.addEventListener('error', (e) => {
    // שגיאת טעינה של נכס (תמונה/סקריפט) מגיעה בלי message
    const isAsset = e.target && e.target !== window && e.target.tagName;
    ring(errors, MAX_ERRORS, {
      t: since(),
      kind: isAsset ? 'asset' : 'error',
      msg: isAsset ? `נכשלה טעינת ${e.target.tagName}: ${e.target.src || e.target.href || ''}`
                   : String(e.message || 'שגיאה לא ידועה'),
      where: isAsset ? '' : `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}`,
      stack: (e.error && e.error.stack) ? String(e.error.stack).split('\n').slice(0, 12).join('\n') : '',
    });
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    ring(errors, MAX_ERRORS, {
      t: since(),
      kind: 'promise',
      msg: String((r && r.message) || r || 'הבטחה נדחתה'),
      where: '',
      stack: (r && r.stack) ? String(r.stack).split('\n').slice(0, 12).join('\n') : '',
    });
  });

  // עטיפת הקונסול — בלי לשנות את ההתנהגות המקורית
  for (const level of ['error', 'warn', 'log']) {
    const orig = console[level] ? console[level].bind(console) : null;
    if (!orig) continue;
    console[level] = function (...args) {
      try {
        ring(consoleLines, MAX_CONSOLE, {
          t: since(),
          level,
          text: args.map((a) => {
            if (typeof a === 'string') return a;
            if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
            try { return JSON.stringify(a); } catch (e) { return String(a); }
          }).join(' ').slice(0, 600),
        });
      } catch (e) { /* איסוף לעולם לא יפיל את המשחק */ }
      orig(...args);
    };
  }

  // פירורי לחם: מה נלחץ ובאיזה סדר — זה מה שמאפשר לשחזר את הבאג
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('button, .asset-row, .square, a, input') : null;
    if (!el) return;
    const label = (el.id ? '#' + el.id : '')
      + (el.dataset && el.dataset.act ? `[${el.dataset.act}]` : '')
      + (el.dataset && el.dataset.pos !== undefined ? `[pos=${el.dataset.pos}]` : '')
      + (el.dataset && el.dataset.build !== undefined ? `[build=${el.dataset.build}]` : '');
    ring(clicks, MAX_CLICKS, {
      t: since(),
      tag: el.tagName.toLowerCase(),
      label: label || '',
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    });
  }, true);

  /* ---------- צילום מסך ---------- */

  // תמונת PNG אמיתית דרך הרשאת שיתוף-מסך של הדפדפן.
  // לא נתמך בכל מכשיר, ותמיד דורש אישור מפורש — לכן זה אף פעם לא חובה.
  async function capturePNG() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return null;
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true,
      });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      // ממתינים לפריים אמיתי, אחרת התמונה יוצאת שחורה
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const s = track.getSettings();
      const canvas = document.createElement('canvas');
      canvas.width = s.width || video.videoWidth || 1280;
      canvas.height = s.height || video.videoHeight || 720;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      video.pause();
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null; // המשתמש ביטל, או שהדפדפן לא תומך — ממשיכים בלי
    } finally {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    }
  }

  // גיליון הסגנון כטקסט — כדי שעותק המסך ייראה בדיוק כמו המשחק.
  // ב-file:// הדפדפן חוסם קריאת חוקים, ואז נופלים לקישור המקורי.
  async function collectCSS() {
    const parts = [];
    let blocked = false;
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules;
        if (!rules) continue;
        for (const r of Array.from(rules)) parts.push(r.cssText);
      } catch (e) { blocked = true; }
    }
    if (!blocked && parts.length) return { css: parts.join('\n'), how: 'inline' };
    // ניסיון שני: משיכת הקובץ עצמו (עובד כששרת מגיש את הדף)
    try {
      const link = document.querySelector('link[rel="stylesheet"]');
      if (link) {
        const res = await fetch(link.href);
        if (res.ok) return { css: await res.text(), how: 'fetch' };
      }
    } catch (e) { /* אופליין — ממשיכים */ }
    return { css: '', how: 'link' };
  }

  // עותק HTML של המסך: תמיד עובד, בלי הרשאות ובלי ספריות חיצוניות
  async function captureHTML() {
    const { css, how } = await collectCSS();
    const clone = document.documentElement.cloneNode(true);
    // מסירים סקריפטים — העותק הוא תמונה סטטית, לא משחק שרץ מחדש
    clone.querySelectorAll('script').forEach((s) => s.remove());
    if (how === 'inline' || how === 'fetch') {
      clone.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
      const style = document.createElement('style');
      style.textContent = css;
      const head = clone.querySelector('head');
      if (head) head.appendChild(style);
    }
    // ערכי טפסים לא עוברים ב-outerHTML — מעתיקים ידנית
    const srcInputs = document.querySelectorAll('input');
    const dstInputs = clone.querySelectorAll('input');
    for (let i = 0; i < srcInputs.length && i < dstInputs.length; i++) {
      dstInputs[i].setAttribute('value', srcInputs[i].value);
    }
    return { html: '<!DOCTYPE html>' + clone.outerHTML, cssHow: how };
  }

  /* ---------- איסוף המצב ---------- */

  function gameSnapshot() {
    const g = typeof getGame === 'function' ? getGame() : null;
    if (!g) return { running: false };
    const out = { running: true };
    try { out.state = g.toJSON(); } catch (e) { out.stateError = String(e && e.message); }
    try {
      out.log = (g.log || []).map((l) => ({ id: l.id, kind: l.kind, text: l.text }));
    } catch (e) { out.logError = String(e && e.message); }
    try {
      out.summary = {
        phase: g.phase,
        turn: g.turn,
        currentPlayer: g.current() ? g.current().name : '',
        housesLeft: g.housesLeft,
        hotelsLeft: g.hotelsLeft,
        pot: g.pot,
        players: g.players.map((p) => ({
          name: p.name, isAI: p.isAI, money: p.money, pos: p.pos,
          inJail: p.inJail, bankrupt: p.bankrupt,
          props: g.playerProps(p.idx).map((pos) => ({
            pos,
            name: (globalThis.MONOPOLY_DATA.BOARD[pos] || {}).name,
            houses: g.houses[pos],
            mortgaged: !!g.mortgaged[pos],
          })),
        })),
      };
    } catch (e) { out.summaryError = String(e && e.message); }
    return out;
  }

  function envInfo() {
    let storage = 'לא זמין';
    try {
      const raw = localStorage.getItem('monopoly-hebrew-save');
      storage = raw ? `יש משחק שמור (${raw.length} תווים)` : 'אין משחק שמור';
    } catch (e) { /* חסום */ }
    return {
      version: (document.querySelector('script[src*="main.js"]') || {}).src || '',
      url: location.href,
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform || '',
      screen: `${screen.width}×${screen.height} (חלון ${innerWidth}×${innerHeight}, פי ${devicePixelRatio})`,
      online: navigator.onLine,
      storage,
      openedAt: startedAt.toLocaleString('he-IL'),
      reportedAt: new Date().toLocaleString('he-IL'),
      sessionLength: since(),
    };
  }

  /* ---------- בניית הקובץ ---------- */

  // מברחים גם מרכאות: עותק המסך נכנס לתוך srcdoc="...", וכל מרכאה
  // לא מוברחת הייתה שוברת שם את התגית ומרסקת את הדוח
  const esc = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function buildReport(data) {
    const rows = (obj) => Object.entries(obj)
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');

    const errList = data.errors.length
      ? data.errors.map((e) => `<div class="err"><b>[${esc(e.t)}] ${esc(e.kind)}</b> ${esc(e.msg)}
          ${e.where ? `<div class="where">${esc(e.where)}</div>` : ''}
          ${e.stack ? `<pre>${esc(e.stack)}</pre>` : ''}</div>`).join('')
      : '<p class="ok">לא נרשמו שגיאות בהרצה הזאת.</p>';

    const clickList = data.clicks.length
      ? `<ol class="clicks">${data.clicks.map((c) =>
          `<li><span class="t">${esc(c.t)}</span> <code>${esc(c.tag + c.label)}</code> ${esc(c.text)}</li>`).join('')}</ol>`
      : '<p class="ok">לא נרשמו לחיצות.</p>';

    const consoleList = data.console.length
      ? `<pre class="con">${data.console.map((c) => esc(`[${c.t}] ${c.level}: ${c.text}`)).join('\n')}</pre>`
      : '<p class="ok">הקונסול נקי.</p>';

    const gameLog = data.game.log && data.game.log.length
      ? `<ol class="glog">${data.game.log.map((l) =>
          `<li class="k-${esc(l.kind)}"><span class="t">${l.id}</span> ${esc(l.text)}</li>`).join('')}</ol>`
      : '<p class="ok">אין יומן משחק (המשחק לא התחיל).</p>';

    const players = data.game.summary
      ? `<table class="tbl"><tr><th>שחקן</th><th>כסף</th><th>משבצת</th><th>נכסים</th></tr>${
          data.game.summary.players.map((p) => `<tr>
            <td>${esc(p.name)}${p.isAI ? ' 🤖' : ''}${p.bankrupt ? ' (פשט רגל)' : ''}${p.inJail ? ' 🚔' : ''}</td>
            <td>${esc(p.money)} ₪</td><td>${esc(p.pos)}</td>
            <td>${p.props.map((pr) => esc(pr.name) + (pr.houses === 5 ? ' 🏨' : pr.houses ? ' 🏠'.repeat(pr.houses) : '') + (pr.mortgaged ? ' 🔒' : '')).join(', ') || '—'}</td>
          </tr>`).join('')}</table>`
      : '<p class="ok">אין משחק פעיל.</p>';

    return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>דיווח באג — מונופול בעברית</title>
<style>
  body { font-family: system-ui, "Segoe UI", Arial, sans-serif; background: #F4EFE2; color: #2B2B2B;
         margin: 0; padding: 18px; line-height: 1.6; }
  .wrap { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 26px 0 8px; border-bottom: 3px solid #E0C97F; padding-bottom: 4px; }
  .card { background: #fff; border: 2px solid #E4DCC4; border-radius: 14px; padding: 14px 16px; margin: 12px 0; }
  .desc { font-size: 17px; white-space: pre-wrap; background: #FFF8E1; border-right: 6px solid #E0A03E; }
  table.tbl, table.kv { border-collapse: collapse; width: 100%; font-size: 14px; }
  table.tbl td, table.tbl th, table.kv td, table.kv th { border: 1px solid #E4DCC4; padding: 5px 8px; text-align: right;
         vertical-align: top; word-break: break-word; }
  table.kv th { width: 150px; background: #FAF6EA; }
  .err { background: #FFF0F0; border-right: 5px solid #D93A3A; padding: 8px 12px; margin: 8px 0; border-radius: 8px; }
  .where { color: #7A6F5E; font-size: 13px; }
  pre { background: #2B2B2B; color: #E8E8E8; padding: 10px; border-radius: 8px; overflow-x: auto;
        font-size: 12.5px; white-space: pre-wrap; word-break: break-word; }
  .ok { color: #1F9D55; font-weight: 600; }
  ol.clicks, ol.glog { margin: 0; padding-inline-start: 24px; font-size: 14px; max-height: 480px; overflow-y: auto; }
  ol.glog li { padding: 1px 0; }
  .t { color: #8A8375; font-size: 12px; }
  code { background: #F0EAD8; padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
  img.shot { max-width: 100%; border: 2px solid #E4DCC4; border-radius: 10px; }
  details summary { cursor: pointer; font-weight: 700; padding: 6px 0; }
  .k-build { background: #EAF7EA; } .k-debt, .k-bankrupt { background: #FFF0F0; }
  .k-rent, .k-tax { background: #FFF8E1; }
  .hint { color: #7A6F5E; font-size: 13.5px; }
</style></head><body><div class="wrap">
<h1>🐞 דיווח באג — מונופול בעברית</h1>
<p class="hint">נוצר ב-${esc(data.env.reportedAt)} · אורך המשחק: ${esc(data.env.sessionLength)}</p>

<h2>מה קרה?</h2>
<div class="card desc">${esc(data.description) || '(המשתמש לא כתב תיאור)'}</div>

<h2>📸 צילום מסך</h2>
<div class="card">
${data.png ? `<img class="shot" src="${data.png}" alt="צילום מסך">`
           : '<p class="hint">אין תמונת PNG (המשתמש לא אישר צילום, או שהדפדפן לא תומך). למטה יש עותק מלא של המסך.</p>'}
</div>
<div class="card">
  <details><summary>📄 עותק חי של המסך כפי שנראה ברגע הדיווח (לחיצה לפתיחה)</summary>
  <p class="hint">${data.snapshot.cssHow === 'link'
    ? 'העיצוב מקושר לקבצי המשחק — ייראה נכון כשפותחים ליד המשחק או עם אינטרנט.'
    : 'העיצוב מוטמע בפנים — ייראה נכון בכל מצב.'}</p>
  <iframe style="width:100%;height:640px;border:2px solid #E4DCC4;border-radius:10px;background:#fff"
          srcdoc="${esc(data.snapshot.html)}"></iframe>
  </details>
</div>

<h2>❗ שגיאות שנתפסו</h2>
<div class="card">${errList}</div>

<h2>🎮 מצב המשחק</h2>
<div class="card">
${data.game.summary ? `<table class="kv">
  <tr><th>שלב</th><td>${esc(data.game.summary.phase)}</td></tr>
  <tr><th>תור של</th><td>${esc(data.game.summary.currentPlayer)}</td></tr>
  <tr><th>מלאי הבנק</th><td>${esc(data.game.summary.housesLeft)} בתים · ${esc(data.game.summary.hotelsLeft)} מלונות</td></tr>
  <tr><th>קופה</th><td>${esc(data.game.summary.pot)} ₪</td></tr>
</table>` : ''}
${players}
</div>

<h2>📜 יומן המשחק המלא</h2>
<div class="card">${gameLog}</div>

<h2>👆 הלחיצות האחרונות</h2>
<div class="card">${clickList}</div>

<h2>🖥️ הקונסול</h2>
<div class="card">${consoleList}</div>

<h2>⚙️ פרטי המכשיר</h2>
<div class="card"><table class="kv">${rows(data.env)}</table></div>

<h2>💾 מצב מלא לשחזור</h2>
<div class="card">
  <p class="hint">אפשר לטעון את זה חזרה למשחק ולראות בדיוק את אותו מצב.</p>
  <details><summary>הצגת ה-JSON</summary>
  <pre>${esc(JSON.stringify(data.game.state, null, 1))}</pre></details>
</div>
</div></body></html>`;
  }

  /* ---------- שליחה ---------- */

  function fileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `monopoly-bug-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.html`;
  }

  function download(html, name) {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // בנייד נפתח תפריט השיתוף (וואטסאפ, מייל...) ואפשר לשלוח ישירות.
  // אם אין שיתוף קבצים — הקובץ פשוט יורד למכשיר.
  async function deliver(html, name) {
    const file = new File([html], name, { type: 'text/html' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({ files: [file], title: 'דיווח באג — מונופול' });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    download(html, name);
    return 'downloaded';
  }

  /* ---------- החלונית ---------- */

  // נשענים על עיצוב המשחק כשהוא קיים, ואם המשחק קרס — חלונית עצמאית.
  // דיווח באג חייב לעבוד גם כשכל השאר שבור.
  function openPanel(html) {
    const UI = globalThis.MonopolyUI;
    if (UI && UI.openDialog) return { el: UI.openDialog(html), close: UI.closeDialog };
    const back = document.createElement('div');
    back.setAttribute('style', 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;'
      + 'display:flex;align-items:center;justify-content:center;padding:16px;');
    const box = document.createElement('div');
    box.setAttribute('dir', 'rtl');
    box.setAttribute('style', 'background:#FFFDF5;border-radius:16px;padding:20px;max-width:520px;width:100%;'
      + 'max-height:88vh;overflow:auto;font-family:system-ui,Arial,sans-serif;text-align:right;');
    box.innerHTML = html;
    back.appendChild(box);
    document.body.appendChild(back);
    return { el: box, close: () => back.remove() };
  }

  function note(msg) {
    const UI = globalThis.MonopolyUI;
    if (UI && UI.toast) UI.toast(msg);
    else alert(msg);
  }

  async function start() {
    const canPNG = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    const panel = openPanel(`
      <h2>🐞 דיווח באג</h2>
      <p class="d-sub">ספרו במילים שלכם מה קרה — וכל השאר נאסף לבד:
        צילום המסך, יומן המשחק, מצב הלוח והשגיאות.</p>
      <textarea id="bug-desc" rows="4" placeholder="למשל: לחצתי על 'בונים' ופתאום נעלם לי הכסף..."
        style="width:100%;box-sizing:border-box;font-family:inherit;font-size:16px;padding:10px;
               border:2px solid #E4DCC4;border-radius:12px;resize:vertical"></textarea>
      <label style="display:${canPNG ? 'flex' : 'none'};align-items:center;gap:8px;margin:12px 0;font-size:15px">
        <input type="checkbox" id="bug-png" checked style="width:20px;height:20px">
        לצרף צילום מסך אמיתי (הדפדפן יבקש אישור)
      </label>
      <p class="d-sub" style="font-size:13.5px">הדוח נשמר כקובץ אחד אצלכם. בנייד ייפתח תפריט שיתוף
        כדי לשלוח בוואטסאפ או במייל — שום דבר לא נשלח לבד.</p>
      <div class="d-actions">
        <button class="big-btn green" id="bug-send">📤 יוצרים את הדוח</button>
        <button class="big-btn" id="bug-cancel">ביטול</button>
      </div>`);

    panel.el.querySelector('#bug-cancel').onclick = () => panel.close();
    panel.el.querySelector('#bug-send').onclick = async () => {
      const description = panel.el.querySelector('#bug-desc').value.trim();
      const wantPNG = canPNG && panel.el.querySelector('#bug-png').checked;
      const btn = panel.el.querySelector('#bug-send');
      btn.disabled = true;
      btn.textContent = '⏳ אוספים...';
      // סוגרים לפני הצילום, אחרת החלונית עצמה תסתיר את המסך
      panel.close();
      try {
        const png = wantPNG ? await capturePNG() : null;
        const snapshot = await captureHTML();
        const html = buildReport({
          description, png, snapshot,
          errors: errors.slice(), console: consoleLines.slice(), clicks: clicks.slice(),
          game: gameSnapshot(), env: envInfo(),
        });
        const how = await deliver(html, fileName());
        if (how === 'shared') note('📤 הדוח נשלח, תודה!');
        else if (how === 'cancelled') note('הביטול נקלט — הדוח לא נשלח.');
        else note('✅ הדוח נשמר במכשיר. אפשר לשלוח אותו בוואטסאפ או במייל.');
      } catch (e) {
        note('לא הצלחנו לייצר את הדוח: ' + (e && e.message ? e.message : e));
      }
    };
  }

  globalThis.MonopolyBug = {
    open: start,
    // main.js מחבר את המשחק כאן, כדי שהדוח יכלול מצב ויומן
    attach(fn) { getGame = fn; },
    // חשיפה לבדיקות ולניפוי שגיאות מהקונסול
    game: () => (typeof getGame === 'function' ? getGame() : null),
    snapshot: () => ({ game: gameSnapshot(), env: envInfo(), errors, consoleLines, clicks }),
  };
})();
