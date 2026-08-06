/* נתוני המשחק: לוח, קלפים וקבועים — לפי הלוח הישראלי הרשמי (Hasbro 2014).
 * קובץ נתונים בלבד — שינוי שם/מחיר נעשה כאן, בלי לגעת במנוע. */
(function () {
  'use strict';

  const CONSTANTS = {
    START_MONEY: 1500,
    GO_SALARY: 200,
    JAIL_FINE: 50,
    MORTGAGE_INTEREST: 0.10,
    TOTAL_HOUSES: 32,
    TOTAL_HOTELS: 12,
    JAIL_POS: 10,
    GO_TO_JAIL_POS: 30,
    GO_POS: 0,
    AUCTION_MIN_STEP: 10,
  };

  // קבוצות צבע: כל קבוצה היא עיר, כמו בלוח המקורי
  const GROUPS = {
    brown:   { name: 'אילת',      color: '#8B5E3C', houseCost: 50 },
    lblue:   { name: 'טבריה',     color: '#7EC8E3', houseCost: 50 },
    pink:    { name: 'באר-שבע',   color: '#D63E7E', houseCost: 100 },
    orange:  { name: 'נתניה',     color: '#F2921D', houseCost: 100 },
    red:     { name: 'רמת-גן',    color: '#D93A3A', houseCost: 150 },
    yellow:  { name: 'ירושלים',   color: '#F2CB2E', houseCost: 150 },
    green:   { name: 'חיפה',      color: '#1F9D55', houseCost: 200 },
    dblue:   { name: 'תל-אביב',   color: '#2456A6', houseCost: 200 },
  };

  // rent: [רגיל, בית1, בית2, בית3, בית4, מלון] — טבלאות שכ"ד סטנדרטיות לפי מחיר
  const BOARD = [
    { pos: 0,  type: 'go',      name: 'דרך צלחה' },
    { pos: 1,  type: 'street',  name: "רח' אילות",        group: 'brown',  price: 60,  rent: [2, 10, 30, 90, 160, 250] },
    { pos: 2,  type: 'chest',   name: 'תיבת המזל' },
    { pos: 3,  type: 'street',  name: "שד' התמרים",       group: 'brown',  price: 60,  rent: [4, 20, 60, 180, 320, 450] },
    { pos: 4,  type: 'tax',     name: 'מס הכנסה', amount: 200 },
    { pos: 5,  type: 'rail',    name: 'רכבת הפרברים', price: 200 },
    { pos: 6,  type: 'street',  name: "רח' הירדן",        group: 'lblue',  price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { pos: 7,  type: 'chance',  name: 'הפתעה' },
    { pos: 8,  type: 'street',  name: "רח' העצמאות",      group: 'lblue',  price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { pos: 9,  type: 'street',  name: "רח' הגליל",        group: 'lblue',  price: 120, rent: [8, 40, 100, 300, 450, 600] },
    { pos: 10, type: 'jail',    name: 'בית הכלא' },
    { pos: 11, type: 'street',  name: 'שד\' שז"ר',        group: 'pink',   price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { pos: 12, type: 'utility', name: 'חברת החשמל', price: 150 },
    { pos: 13, type: 'street',  name: 'דרך המשחררים',     group: 'pink',   price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { pos: 14, type: 'street',  name: 'דרך אילת',         group: 'pink',   price: 160, rent: [12, 60, 180, 500, 700, 900] },
    { pos: 15, type: 'rail',    name: 'רכבת משא', price: 200 },
    { pos: 16, type: 'street',  name: "שד' בנימין",       group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { pos: 17, type: 'chest',   name: 'תיבת המזל' },
    { pos: 18, type: 'street',  name: "שד' ויצמן",        group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { pos: 19, type: 'street',  name: "רח' הרצל",         group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000] },
    { pos: 20, type: 'parking', name: 'חניה חופשית' },
    { pos: 21, type: 'street',  name: 'דרך אבא-הלל',      group: 'red',    price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { pos: 22, type: 'chance',  name: 'הפתעה' },
    { pos: 23, type: 'street',  name: "רח' ז'בוטינסקי",   group: 'red',    price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { pos: 24, type: 'street',  name: "רח' ביאליק",       group: 'red',    price: 240, rent: [20, 100, 300, 750, 925, 1100] },
    { pos: 25, type: 'rail',    name: 'רכבת צפון', price: 200 },
    { pos: 26, type: 'street',  name: "רח' יפו",          group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { pos: 27, type: 'street',  name: "רח' בן-יהודה",     group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { pos: 28, type: 'utility', name: 'חברת המים', price: 150 },
    { pos: 29, type: 'street',  name: "רח' המלך ג'ורג'",  group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200] },
    { pos: 30, type: 'gotojail', name: 'לך לכלא' },
    { pos: 31, type: 'street',  name: "רח' העצמאות", group: 'green',  price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { pos: 32, type: 'street',  name: "רח' החלוץ",        group: 'green',  price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { pos: 33, type: 'chest',   name: 'תיבת המזל' },
    { pos: 34, type: 'street',  name: "רח' מוריה",        group: 'green',  price: 320, rent: [28, 150, 450, 1000, 1200, 1400] },
    { pos: 35, type: 'rail',    name: 'רכבת תחתית', price: 200 },
    { pos: 36, type: 'chance',  name: 'הפתעה' },
    { pos: 37, type: 'street',  name: "רח' אלנבי",        group: 'dblue',  price: 350, rent: [35, 175, 500, 1100, 1300, 1500] },
    { pos: 38, type: 'tax',     name: 'מס מותרות', amount: 100 },
    { pos: 39, type: 'street',  name: "רח' דיזנגוף",      group: 'dblue',  price: 400, rent: [50, 200, 600, 1400, 1700, 2000] },
  ];

  // קלפי הפתעה — הרשימה המקורית מהקופסה (Hasbro 2014)
  const CHANCE_CARDS = [
    { id: 'ch1',  text: "קבל קלף 'צא מהכלא' בחינם", action: { type: 'getOutOfJail' } },
    { id: 'ch2',  text: 'שכר רופא — שלם 50 ש"ח', action: { type: 'pay', amount: 50 } },
    { id: 'ch3',  text: 'תוכנית חיסכון לחופשה הפשירה — קבל 100 ש"ח', action: { type: 'receive', amount: 100 } },
    { id: 'ch4',  text: 'ביטוח החיים הפשיר — קבל 100 ש"ח', action: { type: 'receive', amount: 100 } },
    { id: 'ch5',  text: 'הוצאות שכר לימוד — שלם 50 ש"ח', action: { type: 'pay', amount: 50 } },
    { id: 'ch6',  text: 'החזר מס הכנסה — קבל 20 ש"ח', action: { type: 'receive', amount: 20 } },
    { id: 'ch7',  text: 'הוצאות אשפוז — שלם 100 ש"ח', action: { type: 'pay', amount: 100 } },
    { id: 'ch8',  text: 'לך לכלא! התקדם מיד מבלי לקבל 200 ש"ח במשבצת "דרך צלחה"', action: { type: 'goToJail' } },
    { id: 'ch9',  text: 'דמי ייעוץ — קבל 25 ש"ח', action: { type: 'receive', amount: 25 } },
    { id: 'ch10', text: 'יום הולדת — קבל 10 ש"ח מכל משתתף', action: { type: 'collectFromAll', amount: 10 } },
    { id: 'ch11', text: 'ירושה — קבל 100 ש"ח', action: { type: 'receive', amount: 100 } },
    { id: 'ch12', text: 'מכרת מניה — קבל 50 ש"ח', action: { type: 'receive', amount: 50 } },
    { id: 'ch13', text: 'זכית במקום שני בתחרות יופי — קבל 10 ש"ח', action: { type: 'receive', amount: 10 } },
    { id: 'ch14', text: 'שיפוצים ברחוב — שלם 40 ש"ח עבור כל בית ו-115 ש"ח עבור כל מלון', action: { type: 'repairs', perHouse: 40, perHotel: 115 } },
    { id: 'ch15', text: 'התקדם למשבצת "דרך צלחה" וקבל 200 ש"ח', action: { type: 'moveTo', pos: 0 } },
    { id: 'ch16', text: 'טעות בחישובי הבנק — קבל 200 ש"ח', action: { type: 'receive', amount: 200 } },
  ];

  // קלפי תיבת המזל — הרשימה המקורית מהקופסה (Hasbro 2014)
  const CHEST_CARDS = [
    { id: 'cc1',  text: 'התקדם לרחוב דיזנגוף בתל אביב', action: { type: 'moveTo', pos: 39 } },
    { id: 'cc2',  text: 'התקדם לתחנת "רכבת הפרברים". אם עברת דרך משבצת "דרך צלחה" קבל 200 ש"ח', action: { type: 'moveTo', pos: 5 } },
    { id: 'cc3',  text: 'החזר משכנתא — קבל 150 ש"ח', action: { type: 'receive', amount: 150 } },
    { id: 'cc4',  text: 'התקדם לרחוב ביאליק ברמת-גן. אם עברת ב"דרך צלחה" קבל 200 ש"ח', action: { type: 'moveTo', pos: 24 } },
    { id: 'cc5',  text: 'התקדם למשבצת הקרובה של "חברת החשמל" או "חברת המים". אם הנכס פנוי, ניתן לקנותו. אם הוא שייך למישהו — שלם לבעליו פי 10 מהטלת הקוביות', action: { type: 'moveToNearest', kind: 'utility', rentMult: 10 } },
    { id: 'cc6',  text: 'לך לכלא! התקדם מיד מבלי לקבל 200 ש"ח ב"דרך צלחה"', action: { type: 'goToJail' } },
    { id: 'cc7',  text: 'התקדם ל"דרך צלחה" — קבל 200 ש"ח', action: { type: 'moveTo', pos: 0 } },
    { id: 'cc8',  text: 'דיבידנד מהבנק — קבל 50 ש"ח', action: { type: 'receive', amount: 50 } },
    { id: 'cc9',  text: 'תיקונים! שלם 25 ש"ח עבור כל בית ו-100 ש"ח עבור כל מלון שברשותך', action: { type: 'repairs', perHouse: 25, perHotel: 100 } },
    { id: 'cc10', text: "קבל קלף 'צא מהכלא' בחינם", action: { type: 'getOutOfJail' } },
    { id: 'cc11', text: 'התקדם לשדרות שז"ר בבאר שבע. אם עברת ב"דרך צלחה" קבל 200 ש"ח', action: { type: 'moveTo', pos: 11 } },
    { id: 'cc12', text: 'נבחרת להיות יושב ראש — שלם 50 ש"ח לכל משתתף', action: { type: 'payToAll', amount: 50 } },
    { id: 'cc13', text: 'חזור 3 משבצות אחורה', action: { type: 'moveSteps', steps: -3 } },
    { id: 'cc14', text: 'קיבלת דו"ח על מהירות מופרזת — שלם 15 ש"ח', action: { type: 'pay', amount: 15 } },
    { id: 'cc15', text: 'התקדם לתחנת הרכבת הקרובה. אם הנכס פנוי, ניתן לקנותו. אם הוא שייך למישהו — שלם לו פי 2 משכר הדירה', action: { type: 'moveToNearest', kind: 'rail', rentMult: 2 } },
    { id: 'cc16', text: 'התקדם לתחנת הרכבת הקרובה. אם הנכס פנוי, ניתן לקנותו. אם הוא שייך למישהו — שלם לו פי 2 משכר הדירה', action: { type: 'moveToNearest', kind: 'rail', rentMult: 2 } },
  ];

  const TOKENS = [
    { id: 'car',   emoji: '🚗', name: 'מכונית' },
    { id: 'dog',   emoji: '🐶', name: 'כלב' },
    { id: 'ship',  emoji: '🚢', name: 'אונייה' },
    { id: 'hat',   emoji: '🎩', name: 'כובע' },
    { id: 'cat',   emoji: '🐱', name: 'חתול' },
    { id: 'plane', emoji: '✈️', name: 'מטוס' },
  ];

  const RAIL_RENTS = [25, 50, 75, 100]; // 25 ש"ח לכל רכבת בבעלות (חוק בית פשוט לילדים)

  /* ==================== מצב חינוך פיננסי ====================
   * שלושה מסלולי השקעה ברמות סיכון עולות, ועליהן ארבע חברות מומצאות.
   * הכסף מושקע בשקלים (בלי מניות ושברים) וגדל או קטן פעם בסבב.
   *
   * איזון: לאורך 20-30 סבבים חיסכון ×1.8, פיקדון ×3.2, מניות ×4.7 בתוחלת.
   * חזק ומשתלם, אבל לא שובר את המשחק: הכסף מתחרה על קניית רחובות,
   * ההפקדות בסכומים קבועים, ובסבב בודד אפשר לאבד עד חצי מההשקעה.
   * כפתור הכוונון היחיד אם ההשקעות חזקות מדי: טבלת stocks. */
  const FINANCE = {
    DEPOSIT_CHUNKS: [50, 100, 200], // סכומי הפקדה קבועים — לוחצים, לא מקלידים
    NEWS_CHANCE: 1 / 3,             // בערך אחד מכל שלושה סבבים מקבל אירוע חדשות
    FLOOR: 1,                       // השקעה לעולם לא נמחקת לגמרי

    TRACKS: {
      savings: {
        emoji: '🐷', name: 'קופת חיסכון', color: '#F48FB1', rate: 0.02,
        blurb: 'בטוח לגמרי — גדל קצת בכל סבב',
        risk: 1, riskLabel: 'בלי סיכון',
        what: 'זאת קופת חזירון גדולה בבנק. הכסף שלך שמור שם, ובכל סבב הבנק מוסיף לך עוד קצת — כי הוא משתמש בכסף שלך בינתיים.',
        good: 'תמיד גדל, גם כשלכולם יש שבוע רע',
        bad: 'גדל לאט, אז לא מתעשרים ממנו מהר',
      },
      deposit: {
        emoji: '🌳', name: 'פיקדון', color: '#81C784',
        blurb: 'בדרך כלל עולה, לפעמים נח',
        risk: 2, riskLabel: 'סיכון קטן',
        what: 'נותנים לבנק לשמור את הכסף לזמן ארוך, והוא משלם לך יותר מהקופה. זה כמו לשתול עץ: הוא גדל לאט אבל נותן פירות.',
        good: 'מרוויח יותר מקופת חיסכון',
        bad: 'לפעמים סבב שלם בלי רווח, ואפילו ירידה קטנה',
        // תוחלת +4% לסבב
        table: [{ p: 0.40, m: 1.08 }, { p: 0.30, m: 1.04 }, { p: 0.20, m: 1.00 }, { p: 0.10, m: 0.96 }],
      },
      stocks: {
        emoji: '🚀', name: 'מניות', color: '#64B5F6',
        blurb: 'יכול לעלות הרבה — ויכול גם לרדת!',
        risk: 3, riskLabel: 'מסוכן',
        what: 'קונים חתיכה קטנה מחברה אמיתית — ומאותו רגע אתה שותף שלה! אם החברה מוכרת הרבה, החתיכה שלך שווה יותר. אם היא מוכרת מעט, היא שווה פחות.',
        good: 'הכי הרבה כסף לאורך זמן',
        bad: 'בסבב אחד אפשר לאבד חלק גדול מהכסף',
        // תוחלת +8% לסבב, טווח 30%- עד 40%+
        table: [
          { p: 0.15, m: 1.40 }, { p: 0.20, m: 1.25 }, { p: 0.20, m: 1.10 }, { p: 0.15, m: 1.00 },
          { p: 0.15, m: 0.90 }, { p: 0.10, m: 0.80 }, { p: 0.05, m: 0.70 },
        ],
      },
    },

    COMPANIES: [
      { id: 'ice', emoji: '🍦', name: 'מפעל הגלידה',
        what: 'מייצרים גלידה בכל הטעמים ומוכרים לחנויות בכל הארץ.',
        good: 'כשחם בחוץ וכולם רוצים גלידה', bad: 'כשקר, גשום, או כשהמקררים מתקלקלים' },
      { id: 'toys', emoji: '🧸', name: 'חברת הצעצועים',
        what: 'ממציאים ומייצרים צעצועים חדשים לילדים.',
        good: 'לפני חגים וימי הולדת', bad: 'כשמשלוח מתעכב או שכולם משחקים בחוץ' },
      { id: 'space', emoji: '🚀', name: 'חלליות ישראל',
        what: 'בונים חלליות ולוויינים ומשגרים אותם לחלל.',
        good: 'כששיגור מצליח וכולם רוצים לעבוד איתם', bad: 'כשניסוי נכשל או שהשיגור נדחה' },
      { id: 'pizza', emoji: '🍕', name: 'רשת הפיצה',
        what: 'רשת של סניפי פיצה עם משלוחים.',
        good: 'כשיש מבצע וכולם מזמינים', bad: 'כשתנור מתקלקל או שנגמרים החומרים' },
    ],

    // אירועי חדשות: סיפור אחד ברור לכל תנועה גדולה. הטקסט משמש גם כשורת קריינות.
    NEWS: [
      { id: 'ice_boom1',    co: 'ice',   m: 1.8, text: 'קיץ לוהט — כולם קונים גלידה!' },
      { id: 'ice_boom2',    co: 'ice',   m: 1.5, text: 'טעם שוקולד חדש יצא, וכל הילדים רוצים אותו' },
      { id: 'ice_crash1',   co: 'ice',   m: 0.5, text: 'חורף קפוא — כמעט אף אחד לא קונה גלידה' },
      { id: 'ice_crash2',   co: 'ice',   m: 0.6, text: 'המקפיא הגדול של המפעל התקלקל' },
      { id: 'toys_boom1',   co: 'toys',  m: 1.8, text: 'עונת המתנות — כולם קונים צעצועים!' },
      { id: 'toys_boom2',   co: 'toys',  m: 1.5, text: 'יצא דובי חדש שכל הילדים מבקשים' },
      { id: 'toys_crash1',  co: 'toys',  m: 0.5, text: 'האונייה עם הצעצועים איחרה בחודש' },
      { id: 'toys_crash2',  co: 'toys',  m: 0.6, text: 'מזג האוויר נהדר וכולם משחקים בחוץ' },
      { id: 'space_boom1',  co: 'space', m: 1.8, text: 'שיגור מוצלח לירח — כל העולם מריע!' },
      { id: 'space_boom2',  co: 'space', m: 1.5, text: 'אסטרונאוטית מפורסמת הצטרפה לחברה' },
      { id: 'space_crash1', co: 'space', m: 0.5, text: 'החללית התפוצצה בניסוי, מנסים שוב' },
      { id: 'space_crash2', co: 'space', m: 0.6, text: 'התגלתה תקלה במנוע והשיגור נדחה' },
      { id: 'pizza_boom1',  co: 'pizza', m: 1.8, text: 'הפיצה נבחרה להכי טעימה בארץ!' },
      { id: 'pizza_boom2',  co: 'pizza', m: 1.5, text: 'המשלוחים הכי מהירים — כולם מזמינים' },
      { id: 'pizza_crash1', co: 'pizza', m: 0.5, text: 'התנור הגדול נשרף והסניף נסגר לשיפוץ' },
      { id: 'pizza_crash2', co: 'pizza', m: 0.6, text: 'נגמרו העגבניות ואין רוטב לפיצה' },
    ],

    // סיבות לתנועות רגילות — כדי שגם שינוי קטן יקבל הסבר
    REASONS: {
      ice:   { up: ['היה יום חם וקנו הרבה גלידה', 'טעם וניל חדש הצליח'], down: ['ירד גשם כל השבוע', 'המקרר עשה בעיות'] },
      toys:  { up: ['יצא צעצוע חדש שכולם רוצים', 'היו הרבה ימי הולדת'], down: ['הילדים שיחקו בחוץ', 'משלוח הצעצועים התעכב'] },
      space: { up: ['ניסוי המנוע הצליח', 'נחתם חוזה לטיסה חדשה'], down: ['השיגור נדחה בגלל עננים', 'חסר דלק לטילים'] },
      pizza: { up: ['היה מבצע פיצה משפחתית', 'נפתח סניף חדש'], down: ['התנור הקטן התקלקל', 'שבוע שקט במשלוחים'] },
      flat: 'שבוע רגיל, בלי שינויים גדולים',
      deposit: { up: 'הבנק שילם ריבית יפה', flat: 'החודש הפיקדון נח', down: 'ירידה קטנה — גם זה קורה' },
      savings: 'ריבית קבועה — הקופה תמיד גדלה',
    },
  };

  globalThis.MONOPOLY_DATA = { CONSTANTS, GROUPS, BOARD, CHANCE_CARDS, CHEST_CARDS, TOKENS, RAIL_RENTS, FINANCE };
})();
