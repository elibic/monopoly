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
  };

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
    u.rate = 0.95;
    const voices = speechSynthesis.getVoices().filter((vc) => vc.lang && vc.lang.startsWith('he'));
    const voice = voices.find((vc) => /google/i.test(vc.name)) || voices[0];
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }

  const SPOKEN_KINDS = new Set(['turn', 'buy', 'rent', 'jail', 'win', 'debt', 'offer', 'bankrupt', 'money', 'tax']);

  /* ---------- קריין AI: קליפים מוקלטים מראש (audio/), עם נסיגה לקול הדפדפן ---------- */

  const narrator = {
    ids: null,          // Set של קליפים זמינים (מתוך audio/manifest.json)
    cache: {},
    queue: Promise.resolve(),
    async init() {
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
        if (!a) { a = new Audio(`audio/${id}.mp3`); a.preload = 'auto'; this.cache[id] = a; }
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
        const band = el('div', 'band');
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
      div.title = sq.name;
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
    await wait(1080);
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
    const start = squareCenter(from);
    fly.style.left = `${start.x}px`;
    fly.style.top = `${start.y}px`;
    layer.appendChild(fly);
    await wait(30);

    const stepMs = path.length > 8 ? 130 : 165;
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
    bankrupt: '💥', auction: '🔨', build: '🏠', mortgage: '🏦', trade: '🤝',
  };
  const BANNER_KINDS = new Set(['buy', 'rent', 'money', 'tax', 'jail', 'bankrupt']);

  async function announce(text, icon = '⭐') {
    const root = $('#banner-root');
    if (!root) return;
    const b = el('div', 'event-banner', `<span class="eb-icon">${icon}</span><span>${text}</span>`);
    root.appendChild(b);
    await wait(reducedMotion() ? 400 : 1900);
    b.classList.add('out');
    await wait(reducedMotion() ? 10 : 250);
    b.remove();
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

  async function showCardFlip(deck, text) {
    const root = $('#card-root');
    root.classList.remove('hidden');
    const isChance = deck === 'chance';
    root.innerHTML = `
      <div class="flip-card ${isChance ? 'chance' : 'chest'}">
        <div class="flip-face flip-back">${isChance ? SVG.chance : SVG.chest}</div>
        <div class="flip-face flip-front">
          <div class="gc-title">${isChance ? '✨ הפתעה ✨' : '🎁 תיבת המזל 🎁'}</div>
          <div class="gc-text">${text}</div>
        </div>
      </div>`;
    sounds.card();
    await wait(reducedMotion() ? 700 : 3300);
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

  function animateBalance(elBalance, from, to) {
    if (from === to || reducedMotion()) { elBalance.textContent = money(to); return; }
    const t0 = performance.now();
    const dur = 750;
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

      div.querySelector('.sq-houses').innerHTML = housesHTML(g.houses[sq.pos]);

      const toks = div.querySelector('.sq-tokens');
      toks.innerHTML = '';
      for (const p of g.players) {
        if (!p.bankrupt && p.pos === sq.pos) toks.appendChild(el('span', 'tok', p.token));
      }
    }

    // 3. קוביות
    if (g.dice[0]) { setDieFace('die1', g.dice[0]); setDieFace('die2', g.dice[1]); }

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
        <div class="cc-top"><span>${p.token} ${p.name}</span><span class="cc-chip">💳</span></div>
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
          'קְלַף ' + (entry.deck === 'chance' ? 'הַפְתָּעָה' : 'תֵּיבַת הַמַּזָּל') + '. ' +
          (cardData && cardData.speech ? cardData.speech : vocalize(entry.cardText)));
        await showCardFlip(entry.deck, entry.cardText);
        continue;
      }
      if (SPOKEN_KINDS.has(entry.kind)) {
        const clips = narrationFor(g, entry);
        if (clips) narrator.say(clips, entry.text);
        else speak(entry.text);
      }
      if (BANNER_KINDS.has(entry.kind)) {
        await announce(entry.text, BANNER_ICONS[entry.kind] || '⭐');
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

  function showWin(g, onRestart) {
    const w = g.players[g.winner];
    const isF = w.gender === 'f';
    sounds.win();
    confettiBurst(6000);
    const d = openDialog(`
      <div class="win-burst">🏆</div>
      <h2>${w.token} ${w.name} ${isF ? 'ניצחה' : 'ניצח'} במשחק!</h2>
      <p class="d-sub">כל הכבוד! ${w.name} ${isF ? 'נשארה אחרונה' : 'נשאר אחרון'} במשחק עם ${money(w.money)} בחשבון.</p>
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
    primeFromRestore, announce, SVG, narrator,
  };
})();
