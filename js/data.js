/* נתוני המשחק: לוח, קלפים וקבועים.
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

  // קבוצות צבע: כל קבוצה היא "עיר"
  const GROUPS = {
    brown:   { name: 'אילת',          color: '#8B5E3C', houseCost: 50 },
    lblue:   { name: 'טבריה',         color: '#7EC8E3', houseCost: 50 },
    pink:    { name: 'באר שבע',       color: '#E85D9E', houseCost: 100 },
    orange:  { name: 'נתניה',         color: '#F2921D', houseCost: 100 },
    red:     { name: 'חיפה',          color: '#D93A3A', houseCost: 150 },
    yellow:  { name: 'ירושלים',       color: '#F2CB2E', houseCost: 150 },
    green:   { name: 'תל אביב',       color: '#3AA655', houseCost: 200 },
    dblue:   { name: 'אזור היוקרה',   color: '#2456A6', houseCost: 200 },
  };

  // rent: [רגיל, בית1, בית2, בית3, בית4, מלון]
  const BOARD = [
    { pos: 0,  type: 'go',      name: 'דרך צלחה' },
    { pos: 1,  type: 'street',  name: 'רחוב אילות',        group: 'brown',  price: 60,  rent: [2, 10, 30, 90, 160, 250] },
    { pos: 2,  type: 'chest',   name: 'תיבת המזל' },
    { pos: 3,  type: 'street',  name: 'חוף אלמוג',          group: 'brown',  price: 60,  rent: [4, 20, 60, 180, 320, 450] },
    { pos: 4,  type: 'tax',     name: 'מס הכנסה', amount: 200 },
    { pos: 5,  type: 'rail',    name: 'רכבת באר שבע', price: 200 },
    { pos: 6,  type: 'street',  name: 'רחוב הירדן',         group: 'lblue',  price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { pos: 7,  type: 'chance',  name: 'הפתעה' },
    { pos: 8,  type: 'street',  name: 'רחוב הגליל',         group: 'lblue',  price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { pos: 9,  type: 'street',  name: 'רחוב הבנים',         group: 'lblue',  price: 120, rent: [8, 40, 100, 300, 450, 600] },
    { pos: 10, type: 'jail',    name: 'כלא / ביקור' },
    { pos: 11, type: 'street',  name: 'רחוב העצמאות',       group: 'pink',   price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { pos: 12, type: 'utility', name: 'חברת החשמל', price: 150 },
    { pos: 13, type: 'street',  name: 'רחוב הנגב',          group: 'pink',   price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { pos: 14, type: 'street',  name: 'שדרות רגר',          group: 'pink',   price: 160, rent: [12, 60, 180, 500, 700, 900] },
    { pos: 15, type: 'rail',    name: 'רכבת תל אביב', price: 200 },
    { pos: 16, type: 'street',  name: 'רחוב הרצל',          group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { pos: 17, type: 'chest',   name: 'תיבת המזל' },
    { pos: 18, type: 'street',  name: 'רחוב סמילנסקי',      group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { pos: 19, type: 'street',  name: 'שדרות בנימין',       group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000] },
    { pos: 20, type: 'parking', name: 'חניה חופשית' },
    { pos: 21, type: 'street',  name: 'שדרות הנשיא',        group: 'red',    price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { pos: 22, type: 'chance',  name: 'הפתעה' },
    { pos: 23, type: 'street',  name: 'רחוב הכרמל',         group: 'red',    price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { pos: 24, type: 'street',  name: 'רחוב הנביאים',       group: 'red',    price: 240, rent: [20, 100, 300, 750, 925, 1100] },
    { pos: 25, type: 'rail',    name: 'רכבת חיפה', price: 200 },
    { pos: 26, type: 'street',  name: 'רחוב יפו',           group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { pos: 27, type: 'street',  name: 'רחוב המלך ג\'ורג\'', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { pos: 28, type: 'utility', name: 'חברת המים', price: 150 },
    { pos: 29, type: 'street',  name: 'רחוב בן יהודה',      group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200] },
    { pos: 30, type: 'gotojail', name: 'לך לכלא' },
    { pos: 31, type: 'street',  name: 'רחוב אלנבי',         group: 'green',  price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { pos: 32, type: 'street',  name: 'שדרות רוטשילד',      group: 'green',  price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { pos: 33, type: 'chest',   name: 'תיבת המזל' },
    { pos: 34, type: 'street',  name: 'רחוב דיזנגוף',       group: 'green',  price: 320, rent: [28, 150, 450, 1000, 1200, 1400] },
    { pos: 35, type: 'rail',    name: 'רכבת ירושלים', price: 200 },
    { pos: 36, type: 'chance',  name: 'הפתעה' },
    { pos: 37, type: 'street',  name: 'רמת אביב',           group: 'dblue',  price: 350, rent: [35, 175, 500, 1100, 1300, 1500] },
    { pos: 38, type: 'tax',     name: 'מס מותרות', amount: 100 },
    { pos: 39, type: 'street',  name: 'הרצליה פיתוח',       group: 'dblue',  price: 400, rent: [50, 200, 600, 1400, 1700, 2000] },
  ];

  // קלפי הפתעה
  const CHANCE_CARDS = [
    { id: 'ch1',  text: 'התקדם ל"דרך צלחה" וקבל 200 ש"ח', action: { type: 'moveTo', pos: 0 } },
    { id: 'ch2',  text: 'סע לרחוב דיזנגוף', action: { type: 'moveTo', pos: 34 } },
    { id: 'ch3',  text: 'סע לשדרות הנשיא בחיפה', action: { type: 'moveTo', pos: 21 } },
    { id: 'ch4',  text: 'סע לתחנת הרכבת הקרובה', action: { type: 'moveToNearest', kind: 'rail' } },
    { id: 'ch5',  text: 'חזור לאילת, לרחוב אילות', action: { type: 'moveBackTo', pos: 1 } },
    { id: 'ch6',  text: 'חזור 3 צעדים אחורה', action: { type: 'moveSteps', steps: -3 } },
    { id: 'ch7',  text: 'לך ישר לכלא!', action: { type: 'goToJail' } },
    { id: 'ch8',  text: 'צא מהכלא חינם! שמור את הכרטיס', action: { type: 'getOutOfJail' } },
    { id: 'ch9',  text: 'הבנק משלם לך דיבידנד — קבל 50 ש"ח', action: { type: 'receive', amount: 50 } },
    { id: 'ch10', text: 'קנס מהירות — שלם 15 ש"ח', action: { type: 'pay', amount: 15 } },
    { id: 'ch11', text: 'תיקונים בנכסיך: שלם 25 ש"ח לכל בית ו-100 ש"ח לכל מלון', action: { type: 'repairs', perHouse: 25, perHotel: 100 } },
    { id: 'ch12', text: 'שלם מס עירייה — 150 ש"ח', action: { type: 'pay', amount: 150 } },
    { id: 'ch13', text: 'קיבלת החזר מס — קבל 150 ש"ח', action: { type: 'receive', amount: 150 } },
    { id: 'ch14', text: 'סע לחברת החשמל', action: { type: 'moveTo', pos: 12 } },
    { id: 'ch15', text: 'זכית בתחרות — קבל 100 ש"ח', action: { type: 'receive', amount: 100 } },
    { id: 'ch16', text: 'סע לרכבת תל אביב', action: { type: 'moveTo', pos: 15 } },
  ];

  // קלפי תיבת המזל
  const CHEST_CARDS = [
    { id: 'cc1',  text: 'קיבלת ירושה — קבל 100 ש"ח', action: { type: 'receive', amount: 100 } },
    { id: 'cc2',  text: 'שגיאת בנק לטובתך — קבל 200 ש"ח', action: { type: 'receive', amount: 200 } },
    { id: 'cc3',  text: 'תשלום ביטוח — שלם 50 ש"ח', action: { type: 'pay', amount: 50 } },
    { id: 'cc4',  text: 'החזר מהבנק — קבל 20 ש"ח', action: { type: 'receive', amount: 20 } },
    { id: 'cc5',  text: 'יום הולדת שמח! קבל 10 ש"ח מכל משתתף', action: { type: 'collectFromAll', amount: 10 } },
    { id: 'cc6',  text: 'חשבון רופא — שלם 50 ש"ח', action: { type: 'pay', amount: 50 } },
    { id: 'cc7',  text: 'שלם שכר לימוד — 50 ש"ח', action: { type: 'pay', amount: 50 } },
    { id: 'cc8',  text: 'שכר ייעוץ — קבל 25 ש"ח', action: { type: 'receive', amount: 25 } },
    { id: 'cc9',  text: 'תיקוני רחוב: שלם 40 ש"ח לכל בית ו-115 ש"ח לכל מלון', action: { type: 'repairs', perHouse: 40, perHotel: 115 } },
    { id: 'cc10', text: 'זכית בפרס שני בתחרות יופי — קבל 10 ש"ח', action: { type: 'receive', amount: 10 } },
    { id: 'cc11', text: 'צא מהכלא חינם! שמור את הכרטיס', action: { type: 'getOutOfJail' } },
    { id: 'cc12', text: 'לך ישר לכלא!', action: { type: 'goToJail' } },
    { id: 'cc13', text: 'התקדם ל"דרך צלחה" וקבל 200 ש"ח', action: { type: 'moveTo', pos: 0 } },
    { id: 'cc14', text: 'החזר מס הכנסה — קבל 20 ש"ח', action: { type: 'receive', amount: 20 } },
    { id: 'cc15', text: 'מכרת מניות — קבל 45 ש"ח', action: { type: 'receive', amount: 45 } },
    { id: 'cc16', text: 'קרן חגים — קבל 100 ש"ח', action: { type: 'receive', amount: 100 } },
  ];

  const TOKENS = [
    { id: 'car',   emoji: '🚗', name: 'מכונית' },
    { id: 'dog',   emoji: '🐶', name: 'כלב' },
    { id: 'ship',  emoji: '🚢', name: 'אונייה' },
    { id: 'hat',   emoji: '🎩', name: 'כובע' },
    { id: 'cat',   emoji: '🐱', name: 'חתול' },
    { id: 'plane', emoji: '✈️', name: 'מטוס' },
  ];

  const RAIL_RENTS = [25, 50, 100, 200]; // לפי מספר רכבות בבעלות

  globalThis.MONOPOLY_DATA = { CONSTANTS, GROUPS, BOARD, CHANCE_CARDS, CHEST_CARDS, TOKENS, RAIL_RENTS };
})();
