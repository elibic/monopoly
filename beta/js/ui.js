/* שכבת התצוגה: לוח, כרטיסי אשראי, דיאלוגים, אנימציות, קול והקראה מנוקדת. */
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
  let uiGame = null; // הפניה למשחק הנוכחי — לשליפת שטר קניין בלחיצה על משבצת

  // ---------- קצב המשחק ----------
  // mult גדול = איטי יותר. משפיע על אנימציות, כרזות, הקראה והשהיות המחשב.
  const SPEED_PRESETS = {
    slow:   { mult: 1.5,  aiDelay: 1500, rate: -12, icon: '🐢', label: 'רגוע' },
    normal: { mult: 1.0,  aiDelay: 950,  rate: 8,   icon: '🚶', label: 'רגיל' },
    fast:   { mult: 0.55, aiDelay: 450,  rate: 22,  icon: '🐇', label: 'מהיר' },
  };
  const SPEED_KEY = 'monopoly-beta-speed';
  let speed = 'normal';
  try { const s = localStorage.getItem(SPEED_KEY); if (s && SPEED_PRESETS[s]) speed = s; } catch (e) { /* */ }
  const sp = () => SPEED_PRESETS[speed];
  const scaled = (ms) => Math.round(ms * sp().mult);
  function setSpeed(s) {
    if (!SPEED_PRESETS[s]) return;
    speed = s;
    try { localStorage.setItem(SPEED_KEY, s); } catch (e) { /* */ }
    const btn = $('#speed-btn');
    if (btn) { btn.textContent = sp().icon; btn.title = `קצב: ${sp().label}`; }
  }
  const getSpeed = () => speed;
  const aiDelay = () => sp().aiDelay;

  /* ==================== איורי SVG ==================== */

  const SVG = {
    house: (color = '#2FA671', dark = '#1E5C3F') =>
      `<svg viewBox="0 0 20 17" class="svg-house"><path d="M10 1 L19 8.5 H16.2 V16 H3.8 V8.5 H1 Z" fill="${color}" stroke="${dark}" stroke-width="1.2"/><rect x="8.4" y="11" width="3.2" height="5" fill="${dark}"/></svg>`,
    hotel: () =>
      `<svg viewBox="0 0 26 18" class="svg-hotel"><rect x="2" y="6" width="22" height="11" rx="1.5" fill="#D93A3A" stroke="#8E1F23" stroke-width="1.3"/><path d="M13 1 L23 7 H3 Z" fill="#D93A3A" stroke="#8E1F23" stroke-width="1.3"/><rect x="6" y="9" width="3" height="3" fill="#FBE9E9"/><rect x="11.5" y="9" width="3" height="3" fill="#FBE9E9"/><rect x="17" y="9" width="3" height="3" fill="#FBE9E9"/><rect x="10.8" y="12.5" width="4.4" height="4.5" fill="#8E1F23"/></svg>`,
    go: `<svg viewBox="0 0 60 44"><text x="30" y="13" text-anchor="middle" font-size="11.5" font-weight="bold" fill="#B02A2F" font-family="inherit">דרך צלחה</text><text x="30" y="24" text-anchor="middle" font-size="7" font-weight="bold" fill="#8A8060" font-family="inherit">קבל 200 ₪</text><path d="M50 28 H18 V25 L6 33 L18 41 V38 H50 Z" fill="#E0393E" stroke="#8E1F23" stroke-width="1.5"/></svg>`,
    jail: `<svg viewBox="0 0 44 40"><rect x="4" y="4" width="36" height="32" rx="3" fill="#F5D9A8" stroke="#8A6B3A" stroke-width="2"/><circle cx="22" cy="20" r="8" fill="#FBEED3"/><circle cx="19" cy="18" r="1.6" fill="#4A3319"/><circle cx="25" cy="18" r="1.6" fill="#4A3319"/><path d="M18 24 Q22 27 26 24" stroke="#4A3319" stroke-width="1.4" fill="none"/><g stroke="#6B4E24" stroke-width="2.6"><line x1="10" y1="4" x2="10" y2="36"/><line x1="18" y1="4" x2="18" y2="36"/><line x1="26" y1="4" x2="26" y2="36"/><line x1="34" y1="4" x2="34" y2="36"/></g></svg>`,
    parking: `<svg viewBox="0 0 52 32"><path d="M6 24 Q7 15 14 14 L18 9 Q19 7 22 7 H34 Q37 7 38 9 L42 14 Q49 15 50 22 L50 24 Q50 26 48 26 H8 Q6 26 6 24 Z" fill="#D93A3A" stroke="#8E1F23" stroke-width="1.6"/><rect x="21" y="9.5" width="6" height="4.5" rx="1" fill="#BFE3F5"/><rect x="29" y="9.5" width="6" height="4.5" rx="1" fill="#BFE3F5"/><circle cx="15" cy="26" r="4.4" fill="#2A2A32"/><circle cx="15" cy="26" r="1.8" fill="#9AA0AB"/><circle cx="40" cy="26" r="4.4" fill="#2A2A32"/><circle cx="40" cy="26" r="1.8" fill="#9AA0AB"/></svg>`,
    gotojail: `<svg viewBox="0 0 40 40"><circle cx="20" cy="15" r="8" fill="#FBEED3" stroke="#4A3319" stroke-width="1"/><path d="M11 12 Q20 4 29 12 L29 9 Q20 2 11 9 Z" fill="#2456A6" stroke="#17376B" stroke-width="1"/><rect x="10.5" y="11" width="19" height="3" rx="1.5" fill="#17376B"/><circle cx="17" cy="15.5" r="1.5" fill="#4A3319"/><circle cx="23" cy="15.5" r="1.5" fill="#4A3319"/><path d="M16 20 L24 20" stroke="#4A3319" stroke-width="1.4"/><path d="M13 28 Q20 23 27 28 L27 38 H13 Z" fill="#2456A6" stroke="#17376B" stroke-width="1.2"/><circle cx="29" cy="27" r="4" fill="#F5B940" stroke="#8A6B3A" stroke-width="1.2"/><path d="M29 27 L33 30" stroke="#8A6B3A" stroke-width="1.6"/></svg>`,
    rail: `<svg viewBox="0 0 54 34"><rect x="4" y="8" width="30" height="16" rx="3" fill="#2A2A32"/><rect x="34" y="13" width="12" height="11" rx="2" fill="#3C3C46"/><rect x="44" y="9" width="6" height="15" rx="1.5" fill="#2A2A32"/><rect x="8" y="11" width="7" height="6" rx="1" fill="#BFE3F5"/><rect x="19" y="11" width="7" height="6" rx="1" fill="#BFE3F5"/><circle cx="12" cy="27" r="4.6" fill="#4A4A54" stroke="#1B1B21" stroke-width="1.4"/><circle cx="26" cy="27" r="4.6" fill="#4A4A54" stroke="#1B1B21" stroke-width="1.4"/><circle cx="41" cy="27" r="3.8" fill="#4A4A54" stroke="#1B1B21" stroke-width="1.4"/><rect x="47" y="4" width="4" height="6" fill="#6B6B75"/><circle cx="49" cy="3" r="2.4" fill="#C7CBD4"/></svg>`,
    electric: `<svg viewBox="0 0 34 40"><circle cx="17" cy="15" r="12" fill="#F5B940" stroke="#B07E14" stroke-width="1.6"/><path d="M19 6 L12 17 H16.5 L14.5 25 L22 14 H17.5 Z" fill="#FFFBEA" stroke="#B07E14" stroke-width="1"/><rect x="12" y="27" width="10" height="4" rx="1.5" fill="#8A8F9C"/><rect x="13.5" y="31" width="7" height="3" rx="1.2" fill="#6B7080"/></svg>`,
    water: `<svg viewBox="0 0 30 40"><path d="M15 3 Q26 18 26 26 A11 11 0 1 1 4 26 Q4 18 15 3 Z" fill="#57A7E3" stroke="#2A6AA0" stroke-width="1.6"/><path d="M10 26 Q10 31 14 33" stroke="#D6ECFA" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`,
    tax: `<svg viewBox="0 0 36 40"><path d="M12 10 Q6 18 6 27 Q6 36 18 36 Q30 36 30 27 Q30 18 24 10 Z" fill="#C9A96A" stroke="#8A6B3A" stroke-width="1.6"/><path d="M12 10 Q18 6 24 10 L22 5 Q18 2 14 5 Z" fill="#8A6B3A"/><text x="18" y="29" text-anchor="middle" font-size="14" font-weight="bold" fill="#5E4522">₪</text></svg>`,
    chest: `<svg viewBox="0 0 44 34"><path d="M4 14 Q4 5 22 5 Q40 5 40 14 V16 H4 Z" fill="#C98A2D" stroke="#7C5314" stroke-width="1.6"/><rect x="4" y="16" width="36" height="14" rx="2.5" fill="#E0A93E" stroke="#7C5314" stroke-width="1.6"/><rect x="18.5" y="13" width="7" height="9" rx="1.5" fill="#F5D77C" stroke="#7C5314" stroke-width="1.4"/><circle cx="22" cy="18" r="1.6" fill="#7C5314"/><circle cx="10" cy="9" r="1.4" fill="#F5D77C"/><circle cx="34" cy="9" r="1.4" fill="#F5D77C"/></svg>`,
    chance: `<svg viewBox="0 0 30 40"><text x="15" y="32" text-anchor="middle" font-size="34" font-weight="900" fill="#E0393E" stroke="#8E1F23" stroke-width="1">?</text></svg>`,
    coin: `<svg viewBox="0 0 24 24" class="svg-coin"><circle cx="12" cy="12" r="11" fill="#F5C542" stroke="#B07E14" stroke-width="2"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="#D9A82B" stroke-width="1.2"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="900" fill="#8A6210">₪</text></svg>`,
    boy: `<svg viewBox="0 0 64 64"><circle cx="32" cy="38" r="19" fill="#FBD9B0" stroke="#D9A878" stroke-width="1.5"/><path d="M13 36 Q11 16 32 15 Q53 16 51 36 L51 30 Q50 25 44 26 L22 28 Q14 28 13 36 Z" fill="#4A3018"/><path d="M12 27 Q16 12 34 13 L52 16 Q53 22 46 22 L18 24 Q12 24 12 27 Z" fill="#3D8FD1" stroke="#2A6AA0" stroke-width="1.4"/><path d="M45 14 L60 17 L59 22 L45 20 Z" fill="#3D8FD1" stroke="#2A6AA0" stroke-width="1.2"/><circle cx="25" cy="39" r="2.4" fill="#33261A"/><circle cx="39" cy="39" r="2.4" fill="#33261A"/><path d="M26 48 Q32 53 38 48" stroke="#B0663A" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="19" cy="44" r="3" fill="#F5A98F" opacity=".55"/><circle cx="45" cy="44" r="3" fill="#F5A98F" opacity=".55"/></svg>`,
    girl: `<svg viewBox="0 0 64 64"><circle cx="11" cy="40" r="7" fill="#7C4A21"/><circle cx="53" cy="40" r="7" fill="#7C4A21"/><circle cx="32" cy="38" r="19" fill="#FBD9B0" stroke="#D9A878" stroke-width="1.5"/><path d="M13 38 Q10 14 32 14 Q54 14 51 38 L50 28 Q46 20 32 20 Q18 20 14 28 Z" fill="#7C4A21"/><path d="M24 14 L32 8 L40 14 L32 19 Z" fill="#E0398F" stroke="#A8246A" stroke-width="1.2"/><circle cx="25" cy="39" r="2.4" fill="#33261A"/><circle cx="39" cy="39" r="2.4" fill="#33261A"/><path d="M26 48 Q32 53 38 48" stroke="#B0663A" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="19" cy="44" r="3" fill="#F5A98F" opacity=".55"/><circle cx="45" cy="44" r="3" fill="#F5A98F" opacity=".55"/></svg>`,
    robot: `<svg viewBox="0 0 64 64"><line x1="32" y1="4" x2="32" y2="12" stroke="#8A8F9C" stroke-width="2.4"/><circle cx="32" cy="4" r="3" fill="#E0393E"/><rect x="12" y="12" width="40" height="36" rx="9" fill="#B9C2D0" stroke="#7A8494" stroke-width="2"/><rect x="17" y="18" width="30" height="16" rx="6" fill="#2A2F3A"/><circle cx="26" cy="26" r="4" fill="#57E38F"><animate attributeName="opacity" values="1;.35;1" dur="2.2s" repeatCount="indefinite"/></circle><circle cx="38" cy="26" r="4" fill="#57E38F"><animate attributeName="opacity" values="1;.35;1" dur="2.2s" repeatCount="indefinite"/></circle><rect x="22" y="38" width="20" height="4.5" rx="2.2" fill="#5B6472"/><rect x="8" y="24" width="4" height="12" rx="2" fill="#8A8F9C"/><rect x="52" y="24" width="4" height="12" rx="2" fill="#8A8F9C"/></svg>`,
    mascot: `<svg viewBox="0 0 80 92"><ellipse cx="40" cy="86" rx="26" ry="5" fill="rgba(0,0,0,.12)"/><path d="M18 30 Q18 12 40 12 Q62 12 62 30 L62 34 H18 Z" fill="#2A2A32"/><rect x="12" y="32" width="56" height="7" rx="3.5" fill="#2A2A32"/><rect x="20" y="27" width="40" height="6" fill="#E0393E"/><circle cx="40" cy="52" r="19" fill="#FBEED3" stroke="#D9BE93" stroke-width="1.4"/><circle cx="33" cy="48" r="2.4" fill="#332611"/><circle cx="47" cy="48" r="2.4" fill="#332611"/><circle cx="49" cy="48" r="6.5" fill="none" stroke="#B07E14" stroke-width="1.6"/><line x1="55" y1="51" x2="58" y2="60" stroke="#B07E14" stroke-width="1.4"/><path d="M28 57 Q33 54 38 57 Q36 60 32 60 Q29 60 28 57 Z M52 57 Q47 54 42 57 Q44 60 48 60 Q51 60 52 57 Z" fill="#EDEDF0"/><path d="M34 63 Q40 68 46 63" stroke="#8E5B2A" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="40" cy="45" r="1.8" fill="#E8A7A0"/></svg>`,
  };

  const SQ_ART = {
    go: SVG.go, jail: SVG.jail, parking: SVG.parking, gotojail: SVG.gotojail,
    rail: SVG.rail, chance: SVG.chance, chest: SVG.chest, tax: SVG.tax,
  };
  const artFor = (sq) => {
    if (sq.type === 'utility') return sq.pos === 12 ? SVG.electric : SVG.water;
    return SQ_ART[sq.type] || '';
  };

  /* ==================== קול והקראה מנוקדת ==================== */

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
    coin() { tone(988, .07, 0, 'triangle', .1); tone(1319, .1, .06, 'triangle', .1); },
    money() { tone(880, .1); tone(1175, .12, .09); },
    pay() { tone(392, .12); tone(294, .16, .1); },
    buy() { tone(523, .1); tone(659, .1, .09); tone(784, .18, .18); },
    jail() { tone(220, .25, 0, 'sawtooth', .09); tone(180, .35, .2, 'sawtooth', .09); },
    card() { tone(700, .08); tone(940, .1, .08); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .22, i * .15, 'triangle', .15)); },
    // צלילים עשירים נוספים
    build() { tone(330, .07, 0, 'square', .09); tone(392, .07, .07, 'square', .09); tone(523, .12, .14, 'triangle', .11); },
    hotel() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .16, i * .08, 'triangle', .13)); },
    passGo() { [659, 784, 988, 1319].forEach((f, i) => tone(f, .16, i * .1, 'triangle', .13)); },
    cash() { tone(1047, .06, 0, 'triangle', .1); tone(1319, .08, .05, 'triangle', .1); tone(1568, .12, .11, 'triangle', .1); },
    sticker() { [784, 988, 1319, 1047, 1568].forEach((f, i) => tone(f, .18, i * .09, 'triangle', .14)); },
    tap() { tone(880, .04, 0, 'sine', .06); },
  };

  /* ==================== מוזיקת רקע (WebAudio, בלי קבצים — עובד אופליין) ==================== */
  // לולאה עדינה ורגועה: פרוגרסיה I-vi-IV-V עם ארפג'ו + בס רך.
  const music = (() => {
    let on = false, timer = null, master = null, step = 0;
    const KEY = 'monopoly-beta-music';
    try { on = localStorage.getItem(KEY) === 'on'; } catch (e) { /* */ }
    // תווים (הרץ) — דו מז'ור. כל אקורד: תו בס + שלושה תווי ארפג'ו.
    const CHORDS = [
      { bass: 130.81, notes: [261.63, 329.63, 392.00] }, // C
      { bass: 110.00, notes: [261.63, 329.63, 440.00] }, // Am
      { bass: 174.61, notes: [349.23, 440.00, 523.25] }, // F
      { bass: 196.00, notes: [392.00, 493.88, 587.33] }, // G
    ];
    const STEP_MS = 480; // קצב נעים ואיטי

    function voice(freq, dur, when, vol, type) {
      const c = ctx(); if (!c || !master) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g).connect(master);
      o.start(when); o.stop(when + dur + 0.05);
    }

    function pulse() {
      const c = ctx(); if (!c || !master) return;
      const chord = CHORDS[Math.floor(step / 4) % CHORDS.length];
      const beat = step % 4;
      const t = c.currentTime + 0.02;
      if (beat === 0) voice(chord.bass, 1.6, t, 0.10, 'triangle'); // בס בתחילת אקורד
      voice(chord.notes[beat % chord.notes.length], 0.7, t, 0.045, 'sine'); // ארפג'ו רך
      step++;
    }

    function start() {
      const c = ctx(); if (!c) return;
      if (c.state === 'suspended') c.resume();
      if (!master) { master = c.createGain(); master.gain.value = 0.5; master.connect(c.destination); }
      if (timer) return;
      pulse();
      timer = setInterval(pulse, STEP_MS);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    return {
      isOn: () => on,
      toggle() {
        on = !on;
        try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* */ }
        if (on) start(); else stop();
        return on;
      },
      // מופעל אחרי אינטראקציית משתמש (כדי לעקוף חסימת autoplay)
      resumeIfOn() { if (on) start(); },
    };
  })();

  // מילון ניקוד: מילים נפוצות בהודעות המשחק → צורה מנוקדת שה-TTS קורא נכון
  const LEXICON = {
    'דרך צלחה': 'דֶּרֶךְ צְלֵחָה', 'הפתעה': 'הַפְתָּעָה', 'תיבת המזל': 'תֵּיבַת הַמַּזָּל',
    'רחוב אילות': 'רְחוֹב אֵילוֹת', 'חוף אלמוג': 'חוֹף אַלְמוֹג', 'אילת': 'אֵילַת',
    'רחוב הירדן': 'רְחוֹב הַיַּרְדֵּן', 'רחוב הגליל': 'רְחוֹב הַגָּלִיל', 'רחוב הבנים': 'רְחוֹב הַבָּנִים', 'טבריה': 'טְבֶרְיָה',
    'רחוב העצמאות': 'רְחוֹב הָעַצְמָאוּת', 'רחוב הנגב': 'רְחוֹב הַנֶּגֶב', 'שדרות רגר': 'שְׂדֵרוֹת רָגֶר', 'באר שבע': 'בְּאֵר שֶׁבַע',
    'רחוב הרצל': 'רְחוֹב הֶרְצְל', 'רחוב סמילנסקי': 'רְחוֹב סְמִילַנְסְקִי', 'שדרות בנימין': 'שְׂדֵרוֹת בִּנְיָמִין', 'נתניה': 'נְתַנְיָה',
    'שדרות הנשיא': 'שְׂדֵרוֹת הַנָּשִׂיא', 'רחוב הכרמל': 'רְחוֹב הַכַּרְמֶל', 'רחוב הנביאים': 'רְחוֹב הַנְּבִיאִים', 'חיפה': 'חֵיפָה',
    'רחוב יפו': 'רְחוֹב יָפוֹ', "רחוב המלך ג'ורג'": "רְחוֹב הַמֶּלֶךְ גּ'וֹרְגּ'", 'רחוב בן יהודה': 'רְחוֹב בֶּן יְהוּדָה', 'ירושלים': 'יְרוּשָׁלַיִם',
    'רחוב אלנבי': 'רְחוֹב אַלֶנְבִּי', 'שדרות רוטשילד': 'שְׂדֵרוֹת רוֹטְשִׁילְד', 'רחוב דיזנגוף': 'רְחוֹב דִּיזֶנְגּוֹף', 'תל אביב': 'תֵּל אָבִיב',
    'רמת אביב': 'רָמַת אָבִיב', 'הרצליה פיתוח': 'הֶרְצְלִיָּה פִּתּוּחַ',
    'חברת החשמל': 'חֶבְרַת הַחַשְׁמַל', 'חברת המים': 'חֶבְרַת הַמַּיִם', 'רכבת': 'רַכֶּבֶת',
    'מס הכנסה': 'מַס הַכְנָסָה', 'מס מותרות': 'מַס מוֹתָרוֹת', 'חניה חופשית': 'חֲנָיָה חָפְשִׁית',
    'כלא / ביקור': 'כֶּלֶא', 'לך לכלא': 'לֵךְ לַכֶּלֶא', 'מהכלא': 'מֵהַכֶּלֶא', 'בכלא': 'בַּכֶּלֶא', 'לכלא': 'לַכֶּלֶא',
    'הטילה': 'הֵטִילָה', 'הטיל': 'הֵטִיל', 'מטילה': 'מְטִילָה', 'מטיל': 'מֵטִיל',
    'דאבל שלישי ברצף': 'דַּאבְּל שְׁלִישִׁי בָּרֶצֶף', 'דאבל': 'דַּאבְּל',
    'קנתה': 'קָנְתָה', 'קנה': 'קָנָה', 'פנוי לקנייה': 'פָּנוּי לִקְנִיָּה', 'במחיר': 'בִּמְחִיר',
    'שכר דירה': 'שְׂכַר דִּירָה', 'משלמת': 'מְשַׁלֶּמֶת', 'משלם': 'מְשַׁלֵּם',
    'משכורת': 'מַשְׂכֹּרֶת', 'עברה': 'עָבְרָה', 'עבר': 'עָבַר', 'וקיבלה': 'וְקִבְּלָה', 'וקיבל': 'וְקִבֵּל',
    'הגיעה': 'הִגִּיעָה', 'הגיע': 'הִגִּיעַ',
    'נשלחת': 'נִשְׁלַחַת', 'נשלח': 'נִשְׁלָח', 'נשארת': 'נִשְׁאֶרֶת', 'נשאר': 'נִשְׁאָר',
    'שילמה קנס': 'שִׁלְּמָה קְנָס', 'שילם קנס': 'שִׁלֵּם קְנָס', 'ויצאה': 'וְיָצְאָה', 'ויצא': 'וְיָצָא', 'קנס': 'קְנָס',
    'מכירה פומבית': 'מְכִירָה פּוּמְבִּית', 'במכירה': 'בַּמְּכִירָה', 'מציעה': 'מַצִּיעָה', 'מציע': 'מַצִּיעַ',
    'פורשת': 'פּוֹרֶשֶׁת', 'פורש': 'פּוֹרֵשׁ', 'זכתה': 'זָכְתָה', 'זכה': 'זָכָה',
    'בנתה': 'בָּנְתָה', 'בנה': 'בָּנָה', 'מלון': 'מָלוֹן', 'בתים': 'בָּתִּים', 'בית': 'בַּיִת',
    'מכרה': 'מָכְרָה', 'מכר': 'מָכַר', 'משכנה את': 'מִשְׁכְּנָה אֶת', 'משכן את': 'מִשְׁכֵּן אֶת',
    'פדתה': 'פָּדְתָה', 'פדה': 'פָּדָה', 'משכנתא': 'מַשְׁכַּנְתָּא', 'ריבית': 'רִבִּית', 'ממושכן': 'מְמֻשְׁכָּן',
    'החוב': 'הַחוֹב', 'חוב של': 'חוֹב שֶׁל', 'לגייס': 'לְגַיֵּס', 'צריך': 'צָרִיךְ',
    'פשטה רגל': 'פָּשְׁטָה רֶגֶל', 'פשט רגל': 'פָּשַׁט רֶגֶל', 'ניצחה': 'נִצְּחָה', 'ניצח': 'נִצֵּחַ',
    'התור של': 'הַתּוֹר שֶׁל', 'תור ראשון': 'תּוֹר רִאשׁוֹן', 'המשחק התחיל': 'הַמִּשְׂחָק הִתְחִיל',
    'לכל משתתף': 'לְכָל מִשְׁתַּתֵּף', 'בחשבון הבנק': 'בְּחֶשְׁבּוֹן הַבַּנְק', 'לבנק': 'לַבַּנְק', 'מהבנק': 'מֵהַבַּנְק', 'הבנק': 'הַבַּנְק',
    'שקלים': 'שְׁקָלִים', 'קלף': 'קְלַף', 'עשינו עסק': 'עָשִׂינוּ עֵסֶק', 'בהצלחה במשחק': 'בְּהַצְלָחָה בַּמִּשְׂחָק',
    'שלום': 'שָׁלוֹם', 'ממשיכים לשחק': 'מַמְשִׁיכִים לְשַׂחֵק', 'יוצאת': 'יוֹצֵאת', 'יוצא': 'יוֹצֵא',
    'ניסיון': 'נִסָּיוֹן', 'מתוך': 'מִתּוֹךְ', 'חייבת': 'חַיֶּבֶת', 'חייב': 'חַיָּב', 'ולצאת': 'וְלָצֵאת', 'ישר': 'יָשָׁר',
  };
  // מהארוך לקצר, כדי ש"רחוב הרצל" ינוקד לפני "הרצל"
  const LEX_KEYS = Object.keys(LEXICON).sort((a, b) => b.length - a.length);

  function vocalize(text) {
    let out = text
      .replace(/["״🎉🏆💥🏨🏠😄]/g, '')
      .replace(/ש"ח/g, 'שקלים')
      .replace(/₪/g, 'שקלים');
    for (const key of LEX_KEYS) {
      if (out.includes(key)) out = out.split(key).join(LEXICON[key]);
    }
    return out;
  }

  function speak(text, { raw = false } = {}) {
    if (!soundOn || !('speechSynthesis' in window)) return;
    const final = raw ? text : vocalize(text);
    const u = new SpeechSynthesisUtterance(final);
    u.lang = 'he-IL';
    u.rate = 1 + sp().rate / 100;
    const voices = speechSynthesis.getVoices().filter((vc) => vc.lang && vc.lang.startsWith('he'));
    const voice = voices.find((vc) => /google/i.test(vc.name)) || voices[0];
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }

  // הערה: 'offer' לא כאן — ההצעה מוקראת ע"י showBuyDialog בלבד, אחרת נוצרת כפילות
  const SPOKEN_KINDS = new Set(['turn', 'buy', 'rent', 'jail', 'win', 'debt', 'bankrupt', 'money', 'tax', 'pot']);

  /* ---------- קריין AI: קליפים מוקלטים מראש (audio/), עם נסיגה לקול הדפדפן ---------- */

  const narrator = {
    ids: null,          // Set של קליפים זמינים (מתוך audio/manifest.json)
    cache: {},
    queue: Promise.resolve(),
    async init() {
      // אופליין (file://): fetch חסום, אז מעדיפים מניפסט שנטען כ-<script>
      if (Array.isArray(globalThis.MONOPOLY_VOICE_MANIFEST)) {
        this.ids = new Set(globalThis.MONOPOLY_VOICE_MANIFEST);
        return;
      }
      try {
        const r = await fetch('audio/manifest.json', { cache: 'no-cache' });
        if (r.ok) this.ids = new Set(await r.json());
      } catch (e) { this.ids = null; }
    },
    available() { return !!(this.ids && this.ids.size); },
    say(ids, fallbackText) {
      if (!soundOn) return;
      const usable = this.ids && ids.every((id) => this.ids.has(id));
      if (usable) {
        this.queue = this.queue.then(async () => {
          for (const id of ids) await this._play(id);
        }).catch(() => {});
      } else if (fallbackText) {
        speak(fallbackText, { raw: fallbackText.includes('ְ') || fallbackText.includes('ָ') });
      }
    },
    _play(id) {
      return new Promise((resolve) => {
        if (!soundOn) return resolve();
        let a = this.cache[id];
        // ?v — מניעת קאש: מבטיח שהדפדפן יטען את קובצי הקול המעודכנים
        if (!a) { a = new Audio(`audio/${id}.mp3?v=b8`); a.preload = 'auto'; this.cache[id] = a; }
        a.currentTime = 0;
        a.onended = resolve;
        a.onerror = resolve;
        a.play().catch(resolve);
      });
    },
    stop() {
      for (const a of Object.values(this.cache)) { try { a.pause(); } catch (e) { /* */ } }
      this.queue = Promise.resolve();
    },
  };

  // מיפוי רשומת יומן → קליפ קריינות (משפט שלם אחד, בלי הדבקות)
  function narrationFor(g, entry) {
    const t = entry.text;
    const actor = g.players
      .filter((p) => t.includes(p.name))
      .sort((a, b) => t.indexOf(a.name) - t.indexOf(b.name))[0];
    const vk = actor ? (actor.isAI ? 'ai' : 'h') : null;
    const sqm = t.match(/"([^"]+)"/);
    const sqEntry = sqm ? BOARD.find((s) => s.name === sqm[1]) : null;

    switch (entry.kind) {
      case 'turn':
        if (t.includes('דאבל')) return ['ev_double'];
        if (!vk) return null;
        return [`ev_turn_${vk}`];
      case 'buy':
        if (!vk || !sqEntry) return null;
        return [`buy_${vk}_${sqEntry.pos}`];
      case 'rent':
        if (!vk) return null;
        return [`ev_rent_${vk}`];
      case 'money':
        if (vk && t.includes('משכורת')) return [`ev_salary_${vk}`];
        return null;
      case 'tax':
        if (!vk) return null;
        return [`ev_tax_${vk}`];
      case 'jail':
        if (!vk) return null;
        if (/ויצא|יצא|יוצא/.test(t)) return [`ev_jailout_${vk}`];
        if (/נשאר/.test(t)) return null;
        return [`ev_jailin_${vk}`];
      case 'auction':
        if (t.includes('מכירה פומבית')) return ['ev_auction'];
        return null;
      case 'debt':
        return ['ev_debt'];
      case 'pot':
        return ['ev_pot'];
      case 'bankrupt':
        if (!vk) return null;
        return [`ev_bankrupt_${vk}`];
      case 'win':
        return [actor && !actor.isAI ? 'ev_win_h' : 'ev_lose'];
      case 'trade':
        return ['ev_trade'];
      default:
        return null;
    }
  }

  /* ==================== בניית הלוח ==================== */

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
      div.classList.add(`t-${sq.type}`);

      if (sq.type === 'street') {
        // הפס הצבעוני נושא את שם העיר (הקבוצה), כמו בלוח המקורי
        const band = el('div', 'band', `<span class="band-city">${GROUPS[sq.group].name}</span>`);
        band.style.background = GROUPS[sq.group].color;
        div.appendChild(band);
        div.appendChild(el('div', 'sq-name', sq.name));
        div.appendChild(el('div', 'sq-price', money(sq.price)));
      } else {
        div.appendChild(el('div', 'sq-art', artFor(sq)));
        div.appendChild(el('div', 'sq-name', sq.name));
        if (sq.price) div.appendChild(el('div', 'sq-price', money(sq.price)));
        if (sq.amount) div.appendChild(el('div', 'sq-price', money(sq.amount)));
      }
      div.appendChild(el('div', 'owner-flag'));
      div.appendChild(el('div', 'sq-houses'));
      div.appendChild(el('div', 'sq-tokens'));
      if (sq.type === 'parking') div.appendChild(el('div', 'pot-badge'));
      div.title = sq.name;
      div.classList.add('tappable');
      // לחיצה על משבצת פותחת את שטר הקניין / הסבר קצר
      div.addEventListener('click', () => { if (uiGame) showDeed(uiGame, sq.pos); });
      board.appendChild(div);
    }
    buildDice();
  }

  /* ==================== קוביות תלת-ממד ==================== */

  const PIP_LAYOUT = {
    1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
  };
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
          if (!PIP_LAYOUT[f.value].includes(cell)) continue;
          const pip = el('span', 'pip' + (f.value === 1 ? ' red' : ''));
          pip.style.gridArea = `${Math.ceil(cell / 3)} / ${((cell - 1) % 3) + 1}`;
          face.appendChild(pip);
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
    for (const id of ['die1', 'die2']) {
      const die = document.getElementById(id);
      const size = die.parentElement.offsetWidth;
      if (size) die.style.setProperty('--hz', `${size / 2}px`);
    }
    sounds.dice();
    if (reducedMotion()) { setDieFace('die1', v1); setDieFace('die2', v2); return; }
    setDieFace('die1', v1, true);
    setDieFace('die2', v2, true);
    await wait(scaled(1080));
  }

  /* ==================== אנימציית תנועת כלי ==================== */

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

    const fwd = (to - from + 40) % 40;
    const back = (from - to + 40) % 40;
    let path = [];
    if (fwd > 0 && fwd <= 12) for (let i = 1; i <= fwd; i++) path.push((from + i) % 40);
    else if (back > 0 && back <= 3) for (let i = 1; i <= back; i++) path.push((from - i + 40) % 40);
    else path = [to];

    const oldSq = document.querySelector(`#sq-${from} .sq-tokens`);
    if (oldSq) {
      for (const t of oldSq.children) if (t.textContent === p.token) t.style.visibility = 'hidden';
    }

    const layer = $('#token-layer');
    const fly = el('span', 'fly-token', p.token);
    fly.style.setProperty('--pc', PLAYER_COLORS[playerIdx]);
    const start = squareCenter(from);
    fly.style.left = `${start.x}px`;
    fly.style.top = `${start.y}px`;
    layer.appendChild(fly);
    await wait(30);

    const stepMs = scaled(path.length > 8 ? 130 : 165);
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
    await wait(100);
    fly.remove();
  }

  /* ==================== כרזות אירוע ==================== */

  const BANNER_ICONS = {
    buy: '🛍️', rent: '💸', money: '💰', tax: '🧾', jail: '👮',
    bankrupt: '💥', auction: '🔨', build: '🏠', mortgage: '🏦', trade: '🤝', pot: '🎁',
  };
  const BANNER_KINDS = new Set(['buy', 'rent', 'money', 'tax', 'jail', 'bankrupt', 'pot']);

  // הדמות שמכריזה: ילד/ילדה לשחקן, רובוט למחשב, הקמע לאירועים כלליים
  function avatarFor(g, entry) {
    const actor = entry
      ? g.players.filter((p) => entry.text.includes(p.name))
          .sort((a, b) => entry.text.indexOf(a.name) - entry.text.indexOf(b.name))[0]
      : null;
    return avatarOf(actor);
  }

  function avatarOf(p) {
    if (!p) return SVG.mascot;
    if (p.isAI) return SVG.robot;
    return p.gender === 'f' ? SVG.girl : SVG.boy;
  }

  async function announce(text, icon = '⭐', avatarSvg = null) {
    const root = $('#banner-root');
    if (!root) return;
    const b = el('div', 'event-banner',
      `<span class="eb-avatar">${avatarSvg || SVG.mascot}</span>
       <span class="eb-bubble"><span class="eb-icon">${icon}</span><span>${text}</span></span>`);
    root.appendChild(b);
    await wait(reducedMotion() ? 350 : scaled(1400));
    b.classList.add('out');
    await wait(reducedMotion() ? 10 : scaled(220));
    b.remove();
  }

  // דיאלוג אינטראקטיבי: השחקן חייב ללחוץ "שלם" או "קבל"
  function showAckDialog({ title, amount, mode }) {
    return new Promise((resolve) => {
      const isPay = mode === 'pay';
      const d = openDialog(`
        <h2>${title}</h2>
        <div class="ack-amount ${isPay ? 'pay' : 'receive'}">${amount ? `${amount} ₪` : ''}</div>
        <div class="d-actions">
          <button class="big-btn ${isPay ? '' : 'green'}" id="d-ack">
            ${isPay ? '💳 שלם' : '🤑 קבל'}
          </button>
        </div>`);
      d.querySelector('#d-ack').onclick = () => { closeDialog(); resolve(); };
    });
  }

  // האם רשומת היומן דורשת אישור מהשחקן האנושי (שחקן 0)?
  function ackFor(g, entry) {
    const human = g.players[0];
    if (!human || human.bankrupt || human.isAI) return null;
    const t = entry.text;
    const amount = (t.match(/([\d,]+) ש"ח/) || [])[1] || null;
    const actor = g.players.filter((p) => t.includes(p.name))
      .sort((a, b) => t.indexOf(a.name) - t.indexOf(b.name))[0];

    switch (entry.kind) {
      case 'rent':
        if (actor && !actor.isAI) return { title: 'שכר דירה! 💸', amount, mode: 'pay' };
        if (t.includes(`ל${human.name}`)) return { title: 'קיבלת שכר דירה! 🤑', amount, mode: 'receive' };
        return null;
      case 'tax':
        if (actor && !actor.isAI) return { title: 'מס לבנק 🧾', amount, mode: 'pay' };
        return null;
      case 'money':
        if (actor && !actor.isAI && t.includes('משכורת')) return { title: 'משכורת! 💰', amount, mode: 'receive' };
        return null;
      case 'pot':
        if (actor && !actor.isAI) return { title: 'זכית בקופה! 🎁', amount, mode: 'receive' };
        return null;
      default:
        return null;
    }
  }

  /* ==================== מטבעות עפים (העברות כסף) ==================== */

  function cardCenter(idx) {
    const card = document.querySelectorAll('#cards-panel .credit-card')[idx];
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function bankCenter() {
    const b = $('#board-center').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }

  async function flyCoins(fromPt, toPt, n = 4) {
    if (reducedMotion() || !fromPt || !toPt) return;
    const layer = $('#fx-layer');
    const flights = [];
    for (let i = 0; i < n; i++) {
      flights.push((async () => {
        await wait(i * 90);
        const coin = el('span', 'fx-coin', SVG.coin);
        coin.style.left = `${fromPt.x + (Math.random() * 26 - 13)}px`;
        coin.style.top = `${fromPt.y + (Math.random() * 26 - 13)}px`;
        layer.appendChild(coin);
        await wait(30);
        coin.style.left = `${toPt.x + (Math.random() * 18 - 9)}px`;
        coin.style.top = `${toPt.y + (Math.random() * 18 - 9)}px`;
        sounds.coin();
        await wait(620);
        coin.classList.add('pop');
        await wait(160);
        coin.remove();
      })());
    }
    await Promise.all(flights);
  }

  // לפי הפרשי היתרות: ממי אל מי עברו מטבעות
  async function animateMoneyFlow(g, prev) {
    const losers = [], gainers = [];
    g.players.forEach((p, i) => {
      if (prev[i] === undefined || p.bankrupt) return;
      const diff = p.money - prev[i];
      if (diff < 0) losers.push(i);
      if (diff > 0) gainers.push(i);
    });
    if (!losers.length && !gainers.length) return;
    if (losers.length && gainers.length) {
      for (const l of losers) for (const gI of gainers) await flyCoins(cardCenter(l), cardCenter(gI));
    } else if (losers.length) {
      for (const l of losers) await flyCoins(cardCenter(l), bankCenter());
    } else {
      for (const gI of gainers) await flyCoins(bankCenter(), cardCenter(gI));
    }
  }

  /* ==================== קלף מתהפך ==================== */

  async function showCardFlip(deck, text, { interactive = false } = {}) {
    const root = $('#card-root');
    root.classList.remove('hidden');
    const isChance = deck === 'chance';
    root.innerHTML = `
      <div class="flip-card ${isChance ? 'chance' : 'chest'}">
        <div class="flip-face flip-back">${isChance ? SVG.chance : SVG.chest}</div>
        <div class="flip-face flip-front">
          <div class="gc-title">${isChance ? '✨ הפתעה ✨' : '🎁 תיבת המזל 🎁'}</div>
          <div class="gc-text">${text}</div>
          ${interactive ? '<button class="big-btn blue gc-ok" id="gc-ok">👍 הבנתי!</button>' : ''}
        </div>
      </div>`;
    sounds.card();
    if (interactive) {
      await new Promise((resolve) => {
        const btn = root.querySelector('#gc-ok');
        if (btn) btn.onclick = resolve;
        else resolve();
      });
    } else {
      await wait(reducedMotion() ? 700 : scaled(2600));
    }
    root.classList.add('hidden');
    root.innerHTML = '';
  }

  /* ==================== קונפטי ==================== */

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

  /* ==================== רינדור מצב ==================== */

  let prevMoney = [];
  let lastLogId = 0;
  let lastPositions = [];
  let lastHouses = new Array(40).fill(0); // מעקב אחר בתים לאנימציית בנייה

  function animateBalance(elBalance, from, to) {
    if (from === to || reducedMotion()) { elBalance.textContent = money(to); return; }
    const t0 = performance.now();
    const dur = scaled(750);
    (function frame(t) {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      elBalance.textContent = money(Math.round(from + (to - from) * eased));
      if (k < 1) requestAnimationFrame(frame);
    })(t0);
  }

  function housesHTML(h) {
    if (h === 5) return SVG.hotel();
    return SVG.house().repeat(h);
  }

  async function render(g) {
    uiGame = g; // שמירת הפניה למשחק לצורך לחיצה על משבצות
    const prev = prevMoney.slice();

    // 1. אנימציות תנועה (לפני עדכון המשבצות)
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

      const housesBox = div.querySelector('.sq-houses');
      const nowH = g.houses[sq.pos];
      housesBox.innerHTML = housesHTML(nowH);
      // אנימציית בנייה — הבניין החדש "צומח"
      if (nowH > (lastHouses[sq.pos] || 0)) {
        const built = housesBox.lastElementChild || housesBox.firstElementChild;
        if (built) {
          built.classList.add(nowH === 5 ? 'hotel-pop' : 'house-grow');
          div.classList.add('build-flash');
          setTimeout(() => div.classList.remove('build-flash'), 700);
        }
        sounds[nowH === 5 ? 'hotel' : 'build']();
      }
      lastHouses[sq.pos] = nowH;

      const toks = div.querySelector('.sq-tokens');
      toks.innerHTML = '';
      for (const p of g.players) {
        if (!p.bankrupt && p.pos === sq.pos) {
          const t = el('span', 'tok', p.token);
          t.style.setProperty('--pc', PLAYER_COLORS[p.idx]);
          if (p.idx === g.turn && g.phase !== 'gameover') t.classList.add('current');
          toks.appendChild(t);
        }
      }
    }

    // 3. קוביות
    if (g.dice[0]) { setDieFace('die1', g.dice[0]); setDieFace('die2', g.dice[1]); }

    // 3.5 הקופה — תג על משבצת החניה + תצוגה ברורה במרכז הלוח
    const potBadge = document.querySelector('.pot-badge');
    if (potBadge) {
      potBadge.textContent = g.pot > 0 ? `🎁 ${money(g.pot)}` : '';
      potBadge.classList.toggle('has-pot', g.pot > 0);
    }
    const potDisplay = $('#pot-display');
    if (potDisplay) {
      const show = g.potEnabled && g.pot > 0;
      potDisplay.classList.toggle('hidden', !show);
      if (show) {
        potDisplay.innerHTML = `<span class="pot-coins">${SVG.coin}${SVG.coin}${SVG.coin}</span>
          <span class="pot-label">הקופה</span>
          <span class="pot-amount">${money(g.pot)}</span>`;
      }
    }

    // 4. באנר תור
    const cur = g.current();
    $('#turn-banner').innerHTML =
      g.phase === 'gameover'
        ? `🏆 ${g.players[g.winner].name} ${g.players[g.winner].gender === 'f' ? 'ניצחה' : 'ניצח'}!`
        : `התור של <b>${cur.token} ${cur.name}</b>`;

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
        <div class="cc-top">
          <span class="cc-who"><span class="cc-ava">${avatarOf(p)}</span> ${p.name} ${p.token}</span>
          <span class="cc-chip">💳</span>
        </div>
        <div class="cc-balance"></div>
        <div class="cc-sub"><span>חשבון בנק מונופול</span><span>🏠 ${props} נכסים</span></div>`;
      const balEl = card.querySelector('.cc-balance');
      if (p.bankrupt) balEl.textContent = 'פשיטת רגל';
      else animateBalance(balEl, prev[i] !== undefined ? prev[i] : p.money, p.money);
      if (prev[i] !== undefined && prev[i] !== p.money && !p.bankrupt) {
        const diff = p.money - prev[i];
        const f = el('div', `cc-float ${diff > 0 ? 'gain' : 'loss'}`,
          `${diff > 0 ? '+' : ''}${diff.toLocaleString('he-IL')} ₪`);
        card.appendChild(f);
        setTimeout(() => f.remove(), 1500);
      }
      panel.appendChild(card);
    });
    prevMoney = g.players.map((p) => p.money);

    // 6. מטבעות עפים בין החשבונות
    await animateMoneyFlow(g, prev);

    // 7. יומן: צלילים, הקראה, קלפים, כרזות
    const logEl = $('#log');
    const newEntries = g.log.filter((entry) => entry.id > lastLogId);
    lastLogId = g._logSeq;
    for (const entry of newEntries) {
      logEl.prepend(el('div', `entry kind-${entry.kind}`, entry.text));
      if (entry.kind === 'buy') sounds.buy();
      if (entry.kind === 'rent' || entry.kind === 'tax') sounds.pay();
      if (entry.kind === 'money') sounds.money();
      if (entry.kind === 'jail' || entry.kind === 'bankrupt') sounds.jail();
      if (entry.kind === 'card' && entry.deck) {
        const deckCards = entry.deck === 'chance' ? D.CHANCE_CARDS : D.CHEST_CARDS;
        const cardData = deckCards.find((cd) => cd.id === entry.cardId) ||
          deckCards.find((cd) => cd.text === entry.cardText);
        const intro = entry.deck === 'chance' ? 'ev_chance' : 'ev_chest';
        const cardClip = cardData ? [cardData.id] : [];
        narrator.say([intro, ...cardClip],
          'קלף ' + (entry.deck === 'chance' ? 'הפתעה' : 'תיבת המזל') + '. ' + entry.cardText);
        const humanCard = !g.current().isAI;
        await showCardFlip(entry.deck, entry.cardText, { interactive: humanCard });
        // קלף כסף לשחקן האנושי — לוחצים "שלם"/"קבל"
        if (humanCard && cardData) {
          const act = cardData.action;
          if (act.type === 'pay') await showAckDialog({ title: 'הקלף אומר לשלם 💳', amount: act.amount, mode: 'pay' });
          if (act.type === 'receive') await showAckDialog({ title: 'הקלף נותן לך כסף! 🤑', amount: act.amount, mode: 'receive' });
          if (act.type === 'collectFromAll') await showAckDialog({ title: 'כולם משלמים לך! 🥳', amount: act.amount * (g.alive().length - 1), mode: 'receive' });
          if (act.type === 'payToAll') await showAckDialog({ title: 'משלמים לכל המשתתפים 💳', amount: act.amount * (g.alive().length - 1), mode: 'pay' });
        }
        continue;
      }
      if (SPOKEN_KINDS.has(entry.kind)) {
        const clips = narrationFor(g, entry);
        if (clips) narrator.say(clips, entry.text);
        else speak(entry.text);
      }
      const ack = ackFor(g, entry);
      if (ack) {
        await showAckDialog(ack);
      } else if (BANNER_KINDS.has(entry.kind) && !g.current().isAI) {
        // כרזות מהבהבות רק בתור השחקן; בתור הרובוט הכול מרוכז בחלונית הסיכום
        await announce(entry.text, BANNER_ICONS[entry.kind] || '⭐', avatarFor(g, entry));
      }
    }

    // 8. הבהוב המשבצת הנוכחית
    const sqDiv = $(`#sq-${cur.pos}`);
    if (sqDiv) { sqDiv.classList.remove('flash'); void sqDiv.offsetWidth; sqDiv.classList.add('flash'); }
  }

  /* ==================== דיאלוגים ==================== */

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
          <div class="deed-top">שטר קניין</div>
          <div class="deed-band" style="background:${grp.color}">${sq.name}<br><small>${grp.name}</small></div>
          <div class="deed-body"><table>
            <tr><td>שכר דירה</td><td>${money(sq.rent[0])}</td></tr>
            <tr><td>עם בית אחד</td><td>${money(sq.rent[1])}</td></tr>
            <tr><td>עם 2 בתים</td><td>${money(sq.rent[2])}</td></tr>
            <tr><td>עם 3 בתים</td><td>${money(sq.rent[3])}</td></tr>
            <tr><td>עם 4 בתים</td><td>${money(sq.rent[4])}</td></tr>
            <tr><td>עם מלון</td><td>${money(sq.rent[5])}</td></tr>
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
        <div class="deed-top">שטר קניין</div>
        <div class="deed-band deed-art" style="background:#546E7A">${artFor(sq)}<span>${sq.name}</span></div>
        <div class="deed-body">${desc}<br>משכנתא: ${money(sq.price / 2)}</div>
      </div>`;
  }

  // הסבר ידידותי למשבצת שאינה נכס (לילדים)
  const TILE_INFO = {
    go: ['דרך צלחה 🎉', 'בכל פעם שעוברים כאן מקבלים 200 ₪ מהבנק!'],
    jail: ['בית הכלא 🔒', 'אפשר רק "לבקר" כאן — זה בסדר גמור, לא נכנסים לכלא.'],
    parking: ['חניה חופשית 🅿️', 'משבצת מנוחה — פשוט חונים ונחים עד התור הבא.'],
    gotojail: ['לך לכלא 🚔', 'מי שנוחת כאן הולך ישר לכלא (בלי לקבל 200 ₪).'],
    tax: ['מס 💰', 'משלמים לבנק את הסכום הרשום על המשבצת.'],
    chance: ['הפתעה ❓', 'שולפים קלף הפתעה — אולי כסף, אולי הפתעה אחרת!'],
    chest: ['תיבת המזל 🎁', 'שולפים קלף מתיבת המזל — בהצלחה!'],
  };

  // תצוגת שטר קניין מלאה בלחיצה על משבצת — כולל מצב נוכחי (בעלים/בתים/שכ"ד)
  function showDeed(g, pos) {
    const sq = BOARD[pos];
    sounds.tick();
    // משבצת שאינה נכס — הסבר קצר וידידותי
    if (!['street', 'rail', 'utility'].includes(sq.type)) {
      const info = TILE_INFO[sq.type] || [sq.name, ''];
      const d = openDialog(`
        <div class="deed-art-big">${artFor(sq) || '🎲'}</div>
        <h2>${info[0]}</h2>
        <p class="d-sub">${info[1]}</p>
        <div class="d-actions"><button class="big-btn" id="deed-close">הבנתי 👍</button></div>`);
      d.querySelector('#deed-close').onclick = () => closeDialog();
      return;
    }
    // נכס — שטר קניין + שורת מצב
    const ownerIdx = g.owner[pos];
    let status;
    if (ownerIdx === null) {
      status = '<div class="deed-status free">🟢 פנוי לקנייה</div>';
    } else {
      const owner = g.players[ownerIdx];
      const color = PLAYER_COLORS[ownerIdx];
      let extra = '';
      if (sq.type === 'street') {
        const h = g.houses[pos];
        extra = h === 5 ? ' · 🏨 מלון' : h > 0 ? ` · ${h} 🏠` : '';
      }
      const mort = g.mortgaged[pos] ? ' · 🚫 ממושכן' : '';
      status = `<div class="deed-status owned" style="border-color:${color}">
        <span class="deed-owner-dot" style="background:${color}"></span>
        בבעלות <b>${owner.name}</b>${extra}${mort}</div>`;
    }
    const d = openDialog(`
      <h2>שטר קניין 📜</h2>
      ${deedHTML(g, pos)}
      ${status}
      <div class="d-actions"><button class="big-btn" id="deed-close">סגירה</button></div>`);
    d.querySelector('#deed-close').onclick = () => closeDialog();
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
    narrator.say([`offer_${pos}`], `${vocalize(sq.name)} פָּנוּי לִקְנִיָּה. רוֹצֶה לִקְנוֹת?`);
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
        : `<p class="d-sub">⏳ ${g.players[g.auctionTurn()].name} חושב...</p>`}
    `);
    d.dataset.auction = '1'; // סימון לזיהוי דיאלוג מכירה לצורך סגירה אוטומטית
    if (isMyTurn) {
      d.querySelector('#d-bid10').onclick = () => onBid(minBid);
      d.querySelector('#d-bid50').onclick = () => onBid(a.currentBid + 50);
      d.querySelector('#d-pass').onclick = () => onPass();
    }
  }

  // סוגר דיאלוג מכירה שנותר פתוח אחרי סיום המכירה (לא נוגע בדיאלוגים אחרים)
  function closeAuctionDialog() {
    const root = $('#dialog-root');
    if (!root.classList.contains('hidden') && root.querySelector('[data-auction]')) {
      closeDialog();
    }
  }

  function showJailDialog(g, { onPay, onCard, onRoll }) {
    const p = g.current();
    const isF = p.gender === 'f';
    const d = openDialog(`
      <h2>${isF ? 'את בכלא' : 'אתה בכלא'}! 👮</h2>
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
    narrator.say(['ev_trade_offer'], `הַצָּעַת עִסְקָה! ${ai.name} רוֹצֶה לִקְנוֹת מִמְּךָ אֶת ${vocalize(sq.name)}`);
    d.querySelector('#d-acc').onclick = () => { closeDialog(); onAccept(); };
    d.querySelector('#d-dec').onclick = () => { closeDialog(); onDecline(); };
  }

  /* ==================== מדבקות והישגים ==================== */

  // כל מדבקה: תנאי שמחושב ממצב סוף המשחק עבור השחקן האנושי.
  const STICKERS = [
    { id: 'winner',     emoji: '🏆', label: 'מנצח/ת!',        cond: (g, i) => g.winner === i },
    { id: 'monopoly',   emoji: '🌈', label: 'מונופול שלם',    cond: (g, i) => Object.keys(GROUPS).some((k) => g.ownsFullGroup(i, k)) },
    { id: 'builder',    emoji: '🏠', label: 'בנאי/ת',          cond: (g, i) => g.houses.some((h, p) => h >= 1 && h <= 4 && g.owner[p] === i) },
    { id: 'hotelier',   emoji: '🏨', label: 'בעל/ת מלון',      cond: (g, i) => g.houses.some((h, p) => h === 5 && g.owner[p] === i) },
    { id: 'railking',   emoji: '🚂', label: 'שליט/ת הרכבות',   cond: (g, i) => g.countOwned(i, 'rail') >= 2 },
    { id: 'landlord',   emoji: '🏘️', label: 'אספן/ית נכסים',   cond: (g, i) => g.playerProps(i).length >= 5 },
    { id: 'millionaire',emoji: '💰', label: 'עשיר/ה גדול/ה',   cond: (g, i) => g.netWorth(i) >= 2500 },
    { id: 'player',     emoji: '🎮', label: 'שיחקתי מונופול!', cond: () => true },
  ];
  const ALBUM_KEY = 'monopoly-beta-stickers';

  function loadAlbum() {
    try { return new Set(JSON.parse(localStorage.getItem(ALBUM_KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function saveAlbum(set) {
    try { localStorage.setItem(ALBUM_KEY, JSON.stringify([...set])); } catch (e) { /* */ }
  }

  // גרף שווי-נטו לאורך המשחק — SVG פשוט, קו לכל שחקן
  function wealthChart(g, history) {
    if (!history || history.length < 2) return '';
    const n = g.players.length;
    const W = 300, H = 120, pad = 6;
    let max = 1;
    for (const row of history) for (const v of row) if (v > max) max = v;
    const x = (i) => pad + (i / (history.length - 1)) * (W - 2 * pad);
    const y = (v) => H - pad - (v / max) * (H - 2 * pad);
    let lines = '';
    for (let pi = 0; pi < n; pi++) {
      const pts = history.map((row, i) => `${x(i).toFixed(1)},${y(row[pi] || 0).toFixed(1)}`).join(' ');
      lines += `<polyline points="${pts}" fill="none" stroke="${PLAYER_COLORS[pi]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" opacity="${g.players[pi].bankrupt ? .45 : 1}"/>`;
    }
    const legend = g.players.map((p) =>
      `<span class="wc-leg"><span class="wc-dot" style="background:${PLAYER_COLORS[p.idx]}"></span>${p.token} ${p.name}</span>`).join('');
    return `<div class="wealth-chart">
      <div class="wc-title">📈 העושר במהלך המשחק</div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${lines}</svg>
      <div class="wc-legend">${legend}</div>
    </div>`;
  }

  // תצוגת אלבום המדבקות שנאספו (מכל המשחקים)
  function showStickerAlbum() {
    const album = loadAlbum();
    const cells = STICKERS.map((s) => {
      const has = album.has(s.id);
      return `<div class="sticker ${has ? 'earned' : 'locked'}">
        <div class="sticker-emoji">${has ? s.emoji : '❔'}</div>
        <div class="sticker-label">${has ? s.label : '???'}</div>
      </div>`;
    }).join('');
    const d = openDialog(`
      <h2>אלבום המדבקות שלי 🏅</h2>
      <p class="d-sub">${album.size} מתוך ${STICKERS.length} מדבקות נאספו</p>
      <div class="sticker-grid">${cells}</div>
      <div class="d-actions"><button class="big-btn" id="al-close">סגירה</button></div>`);
    d.querySelector('#al-close').onclick = () => closeDialog();
  }

  function showWin(g, onRestart, extra = {}) {
    const w = g.players[g.winner];
    const isF = w.gender === 'f';
    const humanIdx = extra.humanIdx != null ? extra.humanIdx : 0;
    sounds.win();
    confettiBurst(6000);

    // דירוג סופי לפי שווי-נטו
    const standings = g.players.slice().sort((a, b) => g.netWorth(b.idx) - g.netWorth(a.idx));
    const rows = standings.map((p, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || '🎖️';
      return `<div class="stand-row ${p.idx === humanIdx ? 'me' : ''} ${p.bankrupt ? 'out' : ''}">
        <span class="stand-medal">${medal}</span>
        <span class="stand-name">${p.token} ${p.name}</span>
        <span class="stand-worth">${money(g.netWorth(p.idx))}</span>
      </div>`;
    }).join('');

    // מדבקות שהושגו בתפקיד השחקן האנושי
    const album = loadAlbum();
    const earned = STICKERS.filter((s) => s.cond(g, humanIdx));
    const fresh = earned.filter((s) => !album.has(s.id));
    earned.forEach((s) => album.add(s.id));
    saveAlbum(album);
    const stickerHTML = earned.map((s) => {
      const isNew = fresh.some((f) => f.id === s.id);
      return `<div class="sticker earned ${isNew ? 'new-sticker' : ''}">
        ${isNew ? '<span class="new-badge">חדש!</span>' : ''}
        <div class="sticker-emoji">${s.emoji}</div>
        <div class="sticker-label">${s.label}</div>
      </div>`;
    }).join('');

    const humanWon = g.winner === humanIdx;
    const title = humanWon
      ? `${w.token} ${w.name} ${isF ? 'ניצחת! את האלופה' : 'ניצחת! אתה האלוף'}! 🎉`
      : `${w.token} ${w.name} ${isF ? 'ניצחה' : 'ניצח'} במשחק`;

    const d = openDialog(`
      <div class="win-burst">🏆</div>
      <h2>${title}</h2>
      <div class="win-standings">${rows}</div>
      ${wealthChart(g, extra.history)}
      <div class="win-stickers-title">המדבקות שהרווחת 🏅</div>
      <div class="sticker-strip">${stickerHTML}</div>
      <div class="d-actions">
        <button class="big-btn green" id="d-again">🎲 משחק חדש</button>
        <button class="big-btn" id="d-album">🏅 האוסף שלי</button>
      </div>`);
    if (fresh.length) setTimeout(() => sounds.sticker(), 500);
    d.querySelector('#d-again').onclick = onRestart;
    d.querySelector('#d-album').onclick = () => showStickerAlbum();
  }

  function toast(text) {
    const t = el('div', 'toast', text);
    $('#toast-root').appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }

  /* ==================== מדריך למתחילים ==================== */

  const TUTORIAL_KEY = 'monopoly-beta-tutorial-seen';
  function tutorialSeen() { try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (e) { return false; } }
  function markTutorialSeen() { try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) { /* */ } }

  const TUTORIAL_STEPS = [
    { sel: null, emoji: '👋', text: 'שָׁלוֹם! אֲנִי אֶלַמֵּד אוֹתְךָ אֵיךְ מְשַׂחֲקִים מוֹנוֹפּוֹל. זֶה קַל וְכֵיף!' },
    { sel: '#board', emoji: '🎲', text: 'זֶה לוּחַ הַמִּשְׂחָק. עוֹבְרִים סָבִיב הַלּוּחַ וְאוֹסְפִים רְחוֹבוֹת וְעָרִים.' },
    { sel: '#cards-panel', emoji: '💳', text: 'כָּאן רוֹאִים כַּמָּה כֶּסֶף יֵשׁ לְכָל שַׂחְקָן. מַתְחִילִים עִם אֶלֶף וַחֲמֵשׁ מֵאוֹת שֶׁקֶל.' },
    { sel: '#roll-btn', emoji: '🎲', text: 'בַּתּוֹר שֶׁלְּךָ לוֹחֲצִים כָּאן כְּדֵי לְהָטִיל אֶת הַקּוּבִּיּוֹת וּלְהִתְקַדֵּם.' },
    { sel: null, emoji: '🏠', text: 'כְּשֶׁנּוֹחֲתִים עַל עִיר פְּנוּיָה אֶפְשָׁר לִקְנוֹת אוֹתָהּ. אַחַר כָּךְ מִי שֶׁנּוֹחֵת עָלֶיהָ מְשַׁלֵּם לְךָ שְׂכַר דִּירָה!' },
    { sel: '#board', emoji: '👆', text: 'אֶפְשָׁר לִלְחֹץ עַל כָּל מִשְׁבֶּצֶת בַּלּוּחַ כְּדֵי לִרְאוֹת אֶת הַמְּחִיר וְאֶת שְׂכַר הַדִּירָה שֶׁלָּהּ.' },
    { sel: '#end-turn-btn', emoji: '✅', text: 'בְּסוֹף הַתּוֹר לוֹחֲצִים כָּאן. הַמַּטָּרָה: לִהְיוֹת הָאַחֲרוֹן שֶׁנִּשְׁאָר עִם כֶּסֶף. בְּהַצְלָחָה!' },
  ];

  function startTutorial(onDone) {
    let i = 0;
    const overlay = el('div', 'tut-overlay');
    overlay.innerHTML = `
      <div class="tut-spot"></div>
      <div class="tut-bubble">
        <div class="tut-emoji"></div>
        <div class="tut-text"></div>
        <div class="tut-actions">
          <button class="big-btn" id="tut-skip">דילוג</button>
          <button class="big-btn green" id="tut-next"></button>
        </div>
        <div class="tut-progress"></div>
      </div>`;
    document.body.appendChild(overlay);
    const spot = overlay.querySelector('.tut-spot');
    const bubble = overlay.querySelector('.tut-bubble');
    const emojiEl = overlay.querySelector('.tut-emoji');
    const textEl = overlay.querySelector('.tut-text');
    const nextBtn = overlay.querySelector('#tut-next');
    const progEl = overlay.querySelector('.tut-progress');

    function finish() {
      speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel();
      overlay.remove();
      markTutorialSeen();
      if (onDone) onDone();
    }

    function show() {
      const step = TUTORIAL_STEPS[i];
      emojiEl.textContent = step.emoji || '💡';
      textEl.textContent = step.text;
      nextBtn.textContent = i === TUTORIAL_STEPS.length - 1 ? '🎉 מתחילים!' : 'הבא ▶';
      progEl.textContent = `${i + 1} / ${TUTORIAL_STEPS.length}`;
      // זרקור על היעד
      const target = step.sel && $(step.sel);
      const r = target && target.getBoundingClientRect();
      if (r && r.width > 4 && r.height > 4) {
        const pad = 8;
        spot.style.display = 'block';
        spot.style.top = `${r.top - pad}px`;
        spot.style.left = `${r.left - pad}px`;
        spot.style.width = `${r.width + pad * 2}px`;
        spot.style.height = `${r.height + pad * 2}px`;
        // מיקום הבועה: מתחת ליעד אם יש מקום, אחרת מעליו
        bubble.classList.remove('tut-center');
        const below = r.bottom + 20;
        if (below + 180 < window.innerHeight) { bubble.style.top = `${below}px`; }
        else { bubble.style.top = `${Math.max(16, r.top - 200)}px`; }
        bubble.style.left = '50%';
        bubble.style.transform = 'translateX(-50%)';
      } else {
        spot.style.display = 'none';
        bubble.classList.add('tut-center');
        bubble.style.top = ''; bubble.style.left = ''; bubble.style.transform = '';
      }
      speak(step.text, { raw: true });
    }

    nextBtn.onclick = () => {
      i++;
      if (i >= TUTORIAL_STEPS.length) finish();
      else show();
    };
    overlay.querySelector('#tut-skip').onclick = finish;
    window.addEventListener('resize', show);
    show();
  }

  // חלונית סיכום תור הרובוט/ים — מה עשו מאז התור הקודם של השחקן
  const TS_ICON = {
    dice: '🎲', move: '📍', buy: '🛍️', rent: '💸', tax: '🧾', money: '💰',
    jail: '👮', card: '🃏', pot: '🎁', build: '🏠', mortgage: '🏦',
    auction: '🔨', bankrupt: '💥', trade: '🤝', win: '🏆',
  };
  const TS_NOTABLE = new Set(['buy', 'rent', 'tax', 'money', 'jail', 'card', 'pot', 'build', 'mortgage', 'auction', 'bankrupt']);

  // מחזיר true אם הוצגה חלונית (כלומר קרה משהו שכדאי לספר עליו)
  function showTurnSummary(entries, onOk, botLabel = 'המחשב') {
    const notable = entries.some((e) => TS_NOTABLE.has(e.kind));
    if (!notable) { onOk(); return false; }

    const rows = entries
      .filter((e) => TS_ICON[e.kind])
      .map((e) => `<div class="ts-row ts-${e.kind}"><span class="ts-ic">${TS_ICON[e.kind]}</span><span>${e.text}</span></div>`);

    const d = openDialog(`
      <h2><span class="ts-bot">${SVG.robot}</span> מה עשה ${botLabel}?</h2>
      <div class="turn-summary">${rows.join('')}</div>
      <div class="d-actions"><button class="big-btn green" id="ts-ok">👍 הבנתי, תורי!</button></div>`);
    d.querySelector('#ts-ok').onclick = () => { closeDialog(); onOk(); };
    return true;
  }

  // אתחול התצוגה אחרי שחזור משחק שמור: היומן נטען בלי צלילים והקראות
  function primeFromRestore(g) {
    const logEl = $('#log');
    logEl.innerHTML = '';
    for (const entry of g.log) logEl.prepend(el('div', `entry kind-${entry.kind}`, entry.text));
    lastLogId = g._logSeq;
    lastPositions = g.players.map((p) => p.pos);
    prevMoney = g.players.map((p) => p.money);
    lastHouses = g.houses.slice(); // כדי לא לאנן בתים קיימים בשחזור
  }

  function setSound(on) {
    soundOn = on;
    if (!on) {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      narrator.stop();
    }
    $('#sound-btn').textContent = on ? '🔊' : '🔇';
  }

  function isSoundOn() { return soundOn; }

  globalThis.MonopolyUI = {
    buildBoard, render, animateDice, openDialog, closeDialog,
    showBuyDialog, renderAuction, showJailDialog, showDebtDialog,
    showManageDialog, showTradeDialog, showAiTradeOffer, showWin,
    toast, speak, vocalize, setSound, isSoundOn, sounds, confettiBurst,
    primeFromRestore, announce, SVG, narrator, showTurnSummary,
    setSpeed, getSpeed, aiDelay, closeAuctionDialog, showDeed, music,
    showStickerAlbum, startTutorial, tutorialSeen,
  };
})();
