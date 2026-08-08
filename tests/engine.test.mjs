import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../js/data.js');
await import('../js/engine.js');

const { Game } = globalThis.MonopolyEngine;
const C = globalThis.MONOPOLY_DATA.CONSTANTS;

const twoPlayers = (opts) => new Game(
  [{ name: 'דנה', token: '🚗' }, { name: 'מחשב', token: '🐶', isAI: true }],
  opts,
);

test('התחלה: 1500 ש"ח לכל שחקן, תור לשחקן הראשון', () => {
  const g = twoPlayers();
  assert.equal(g.players[0].money, 1500);
  assert.equal(g.players[1].money, 1500);
  assert.equal(g.turn, 0);
  assert.equal(g.phase, 'roll');
});

test('נחיתה על נכס פנוי מציעה קנייה, וקנייה מעבירה בעלות', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] }); // אל משבצת 3 (חוף אלמוג, 60)
  g.rollDice();
  assert.equal(g.phase, 'buy');
  assert.equal(g.pendingBuy, 3);
  g.buy();
  assert.equal(g.owner[3], 0);
  assert.equal(g.players[0].money, 1500 - 60);
  assert.equal(g.phase, 'end');
});

test('ויתור על קנייה פותח מכירה פומבית; הזוכה משלם', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.rollDice();
  g.declineBuy();
  assert.equal(g.phase, 'auction');
  assert.equal(g.auctionTurn(), 1, 'מי שוויתר לא מציע ראשון');
  g.placeBid(1, 10);
  g.placeBid(0, 20);
  g.passAuction(1);
  assert.equal(g.owner[3], 0);
  assert.equal(g.players[0].money, 1500 - 20);
  assert.equal(g.phase, 'end');
});

test('מכירה פומבית בלי הצעות — הנכס נשאר בבנק', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.rollDice();
  g.declineBuy();
  g.passAuction(1);
  g.passAuction(0);
  assert.equal(g.owner[3], null);
  assert.equal(g.phase, 'end');
});

test('סדר המכירה: השחקן הבא פותח, והמוותר מגיב אחריו', () => {
  const g = new Game(
    [{ name: 'א' }, { name: 'ב', isAI: true }, { name: 'ג', isAI: true }],
    { diceQueue: [[1, 2]] },
  );
  g.rollDice();
  g.declineBuy();
  assert.equal(g.auctionTurn(), 1, 'הפותח הוא השחקן שאחרי המוותר');
  g.placeBid(1, 10);
  assert.equal(g.auctionTurn(), 2);
  g.passAuction(2);
  assert.equal(g.auctionTurn(), 0, 'רק עכשיו תור מי שוויתר');
});

test('שכר דירה: רחוב בודד רגיל, קבוצה שלמה בלי בתים — כפול', () => {
  const g = twoPlayers();
  g.owner[1] = 1; // רחוב אילות של המחשב
  assert.equal(g.rentOf(1, 7), 2);
  g.owner[3] = 1; // כל אילת
  assert.equal(g.rentOf(1, 7), 4); // כפול
  g.houses[1] = 2;
  assert.equal(g.rentOf(1, 7), 30); // לפי טבלת בתים
});

test('נחיתה על נכס של יריב גובה שכ"ד אוטומטית', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.owner[3] = 1;
  g.rollDice();
  assert.equal(g.players[0].money, 1500 - 4 - 0 + 0 === 0 ? 0 : 1500 - 4); // קבוצה לא שלמה: 4? לא — רק רחוב אחד: 4 זה rent[0] של משבצת 3
  // rent[0] של חוף אלמוג = 4
  assert.equal(g.players[1].money, 1500 + 4);
  assert.equal(g.phase, 'end');
});

test('רכבות: 25 ש"ח לכל רכבת בבעלות (3 רכבות = 75)', () => {
  const g = twoPlayers();
  g.owner[5] = 1;
  assert.equal(g.rentOf(5, 7), 25);
  g.owner[15] = 1;
  g.owner[25] = 1;
  assert.equal(g.rentOf(5, 7), 75);
  g.owner[35] = 1;
  assert.equal(g.rentOf(5, 7), 100);
});

test('חברות: פי 4 מהקוביות עם נכס אחד, פי 10 עם שניים', () => {
  const g = twoPlayers();
  g.owner[12] = 1;
  assert.equal(g.rentOf(12, 7), 28);
  g.owner[28] = 1;
  assert.equal(g.rentOf(12, 7), 70);
});

test('מעבר ב"דרך צלחה" מזכה ב-200', () => {
  const g = twoPlayers({ diceQueue: [[5, 6]] });
  g.players[0].pos = 35; // רכבת ירושלים → 35+11=46 → 6
  g.owner[6] = 0; // שלו — בלי אירוע
  g.rollDice();
  assert.equal(g.players[0].pos, 6);
  assert.equal(g.players[0].money, 1500 + 200);
});

test('דאבל נותן תור נוסף; דאבל שלישי שולח לכלא', () => {
  const g = twoPlayers({ diceQueue: [[2, 2], [4, 4], [3, 3]] });
  g.rollDice(); // אל 4 (מס הכנסה) — משלם 200, דאבל → שוב
  assert.equal(g.phase, 'roll');
  g.rollDice(); // אל 12 — חברת חשמל פנויה → קנייה
  g.declineBuy();
  g.passAuction(1); // המחשב פותח (מי שוויתר לא מציע ראשון)
  g.passAuction(0);
  assert.equal(g.phase, 'roll'); // עדיין דאבל
  g.rollDice(); // דאבל שלישי → כלא
  const p = g.players[0];
  assert.equal(p.inJail, true);
  assert.equal(p.pos, C.JAIL_POS);
  assert.equal(g.phase, 'end');
});

test('יציאה מהכלא בדאבל — בלי תור נוסף', () => {
  const g = twoPlayers({ diceQueue: [[3, 3]] });
  const p = g.players[0];
  p.inJail = true; p.pos = C.JAIL_POS;
  g.rollDice();
  assert.equal(p.inJail, false);
  assert.equal(p.pos, 16); // 10+6
  assert.equal(g.phase, 'buy'); // רחוב הרצל פנוי
  g.buy();
  assert.equal(g.phase, 'end'); // אין תור נוסף
});

test('כישלון שלישי בכלא — תשלום קנס כפוי ותנועה', () => {
  const g = twoPlayers({ diceQueue: [[1, 2], [1, 2], [1, 2]] });
  const p = g.players[0];
  p.inJail = true; p.pos = C.JAIL_POS;
  g.rollDice(); g.endTurn(); g._advanceTurn && null; // תור המחשב לא רלוונטי — נחזיר ידנית
  g.turn = 0; g.phase = 'roll';
  g.rollDice();
  g.turn = 0; g.phase = 'roll';
  assert.equal(p.jailRolls, 2);
  g.rollDice(); // ניסיון שלישי: קנס 50 + תזוזה ל-13
  assert.equal(p.inJail, false);
  assert.equal(p.money, 1500 - 50);
  assert.equal(p.pos, 13);
});

test('תשלום קנס יציאה מהכלא', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  const p = g.players[0];
  p.inJail = true; p.pos = C.JAIL_POS;
  g.payJailFine();
  assert.equal(p.money, 1450);
  assert.equal(p.inJail, false);
  g.rollDice();
  assert.equal(p.pos, 13);
});

test('בנייה רק כשהחייל נמצא בעיר (חוק בית)', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.phase = 'end';
  assert.equal(g.canBuildOn(0, 1), false); // החייל ב"דרך צלחה" — לא בונים מרחוק
  g.players[0].pos = 1;
  assert.equal(g.canBuildOn(0, 1), true);  // הגיע לעיר — אפשר לבנות
  assert.equal(g.canBuildOn(0, 3), true);  // וגם ברחוב השני של אותה עיר
  g.buildHouse(1);
  assert.equal(g.houses[1], 1);
  assert.equal(g.housesLeft, C.TOTAL_HOUSES - 1);
});

test('בנייה שווה: אי אפשר להקדים רחוב אחד בעיר', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.phase = 'end';
  g.players[0].money = 5000;
  g.players[0].pos = 1;
  g.buildHouse(1);
  // ברחוב הראשון כבר יש בית ובשני אין — התור של השני
  assert.equal(g.canBuildOn(0, 1), false);
  assert.equal(g.canBuildOn(0, 3), true);
  assert.throws(() => g.buildHouse(1), /בנייה לא חוקית/);
  g.buildHouse(3);
  assert.equal(g.canBuildOn(0, 1), true); // חזרו להיות שווים
});

test('אסור להעמיד מלון בזמן שרחוב אחר בעיר ריק', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.phase = 'end';
  g.players[0].money = 5000;
  g.players[0].pos = 1;
  let built = 0;
  for (let i = 0; i < 10; i++) if (g.canBuildOn(0, 1)) { g.buildHouse(1); built++; }
  assert.equal(built, 1, 'רק בית אחד עד שהרחוב השני משלים');
  assert.equal(g.houses[1], 1);
  assert.equal(g.houses[3], 0);
});

test('אין עיר שלמה — אין בנייה בכלל', () => {
  const g = twoPlayers();
  g.owner[1] = 0; // רק רחוב אחד מתוך שניים באילת
  g.phase = 'end';
  g.players[0].pos = 1;
  assert.equal(g.canBuildOn(0, 1), false);
  assert.throws(() => g.buildHouse(1), /בנייה לא חוקית/);
  assert.equal(g.houses[1], 0);
});

test('קבוצה לא מוכרת אינה נחשבת "כל העיר שלך"', () => {
  const g = twoPlayers();
  assert.equal(g.ownsFullGroup(0, undefined), false);
  assert.equal(g.ownsFullGroup(0, 'no-such-city'), false);
});

test('מלון: אחרי 4 בתים בכל העיר; הבתים חוזרים למלאי', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.phase = 'end';
  g.players[0].money = 5000;
  g.players[0].pos = 1;
  // בונים לסירוגין עד 4 בתים בכל רחוב — כמו בחוקי המשחק
  for (let i = 0; i < 4; i++) { g.buildHouse(1); g.buildHouse(3); }
  assert.equal(g.houses[1], 4);
  assert.equal(g.houses[3], 4);
  g.buildHouse(1);
  assert.equal(g.houses[1], 5);
  assert.equal(g.hotelsLeft, C.TOTAL_HOTELS - 1);
  assert.equal(g.housesLeft, C.TOTAL_HOUSES - 4); // 8 נבנו, 4 חזרו מהמלון
});

test('buildablePositions מחזיר רק רחובות חוקיים לבנייה', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.owner[6] = 0; // רחוב בודד בטבריה — אין עיר שלמה
  g.phase = 'end';
  g.players[0].money = 5000;
  g.players[0].pos = 1;
  assert.deepEqual(g.buildablePositions(0), [1, 3]);
  g.buildHouse(1);
  assert.deepEqual(g.buildablePositions(0), [3]);
});

test('אסור לבנות כשרחוב בקבוצה ממושכן', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.players[0].pos = 1;
  g.mortgaged[3] = true;
  assert.equal(g.canBuildOn(0, 1), false);
});

test('משכנתא: מקבלים חצי מחיר; פדיון עם 10% ריבית', () => {
  const g = twoPlayers();
  g.owner[26] = 0; // רחוב יפו, 260
  g.mortgage(26);
  assert.equal(g.players[0].money, 1500 + 130);
  assert.equal(g.rentOf(26, 7), 0);
  g.unmortgage(26);
  assert.equal(g.players[0].money, 1500 + 130 - 143); // כמו בדוגמה בחוברת: 143
  assert.equal(g.mortgaged[26], false);
});

test('אי אפשר למשכן רחוב כשיש בתים בעיר', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.houses[1] = 1;
  assert.equal(g.canMortgage(0, 3), false);
});

test('חוב: שכ"ד גבוה מהמזומן → שלב debt, גיוס במשכנתא ותשלום', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.owner[3] = 1; g.owner[1] = 1;
  g.houses[3] = 5; // מלון: שכ"ד 450
  g.players[0].money = 200;
  g.owner[26] = 0; // יש לו נכס למשכן (130)
  g.owner[31] = 0; // ועוד אחד (150)
  g.rollDice();
  assert.equal(g.phase, 'debt');
  assert.equal(g.debt.amount, 450);
  g.mortgage(26);
  g.mortgage(31);
  assert.ok(g.players[0].money >= 450);
  g.settleDebt();
  assert.equal(g.debt, null);
  assert.equal(g.players[1].money, 1500 + 450);
});

test('פשיטת רגל לשחקן: כל הרכוש עובר לנושה', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.owner[3] = 1; g.owner[1] = 1;
  g.houses[3] = 5;
  g.players[0].money = 10;
  g.owner[26] = 0;
  g.rollDice();
  assert.equal(g.phase, 'debt');
  assert.equal(g.canAffordDebt(), false); // 10 + 130 < 450
  g.declareBankruptcy();
  assert.equal(g.players[0].bankrupt, true);
  assert.equal(g.owner[26], 1);
  assert.equal(g.winner, 1);
  assert.equal(g.phase, 'gameover');
});

test('פשיטת רגל לבנק: הנכסים יוצאים למכירה פומבית', () => {
  const g = new Game(
    [{ name: 'א' }, { name: 'ב' }, { name: 'ג' }],
    { diceQueue: [[1, 3]] }, // אל 4: מס הכנסה 200
  );
  g.players[0].money = 50;
  g.owner[1] = 0;
  g.rollDice();
  assert.equal(g.phase, 'debt');
  g.declareBankruptcy();
  assert.equal(g.players[0].bankrupt, true);
  assert.equal(g.phase, 'auction'); // רחוב אילות במכירה
  assert.equal(g.auction.pos, 1);
  g.passAuction(1);
  g.passAuction(2);
  assert.equal(g.owner[1], null);
  assert.equal(g.turn, 1); // התור עבר הלאה
});

test('קלף "חזור 3 משבצות" זז אחורה בלי משכורת', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]], cardQueue: ['cc13'] });
  g.players[0].pos = 14; // 14+3=17 תיבת המזל
  g.owner[14] = 0; // הנכס שלו — בלי דיאלוג קנייה
  g.rollDice();
  assert.equal(g.players[0].pos, 14);
  assert.equal(g.players[0].money, 1500); // בלי 200
});

test('קלף "התקדם לדרך צלחה" מזכה ב-200', () => {
  const g = twoPlayers({ diceQueue: [[3, 4]], cardQueue: ['ch15'] });
  g.players[0].pos = 29;
  g.rollDice();
  assert.equal(g.players[0].pos, 0);
  assert.equal(g.players[0].money, 1700);
});

test('קלף יום הולדת גובה מכל שחקן', () => {
  const g = new Game(
    [{ name: 'א' }, { name: 'ב' }, { name: 'ג' }],
    { diceQueue: [[3, 4]], cardQueue: ['ch10'] },
  );
  g.rollDice(); // אל 7 — הפתעה
  assert.equal(g.players[0].money, 1520);
  assert.equal(g.players[1].money, 1490);
  assert.equal(g.players[2].money, 1490);
});

test('כרטיס "צא מהכלא" נשמר ומשומש', () => {
  const g = twoPlayers({ diceQueue: [[1, 1], [2, 3]], cardQueue: ['ch1'] });
  g.players[0].pos = 5; // 5+2=7 הפתעה
  g.rollDice();
  assert.equal(g.players[0].jailCards.length, 1);
  const p = g.players[0];
  p.inJail = true; p.pos = C.JAIL_POS; g.phase = 'roll'; g.doubles = 0;
  g.useJailCard();
  assert.equal(p.inJail, false);
  assert.equal(p.jailCards.length, 0);
});

test('מסחר: העברת נכסים וכסף; נכס ממושכן גובה 10% מהמקבל', () => {
  const g = twoPlayers();
  g.owner[26] = 0;
  g.mortgaged[26] = true;
  g.owner[5] = 1;
  g.executeTrade(0, 1, { propsA: [26], propsB: [5], moneyB: 100 });
  assert.equal(g.owner[26], 1);
  assert.equal(g.owner[5], 0);
  // המחשב קיבל נכס ממושכן → שילם 13 ריבית, ושילם 100 לשחקן
  assert.equal(g.players[1].money, 1500 - 100 - 13);
  assert.equal(g.players[0].money, 1500 + 100);
});

test('אסור לסחור ברחוב מעיר שיש בה בתים', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.houses[1] = 1;
  assert.equal(g.canTradeProp(0, 3), false);
});

test('שמירה ושחזור: סבב מלא משמר את כל מצב המשחק', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.rollDice();
  g.buy(); // חוף אלמוג
  g.owner[26] = 0;
  g.mortgage(26);
  const data = JSON.parse(JSON.stringify(g.toJSON()));
  const r = Game.restore(data);
  assert.equal(r.players[0].money, g.players[0].money);
  assert.equal(r.players[0].pos, 3);
  assert.equal(r.owner[3], 0);
  assert.equal(r.mortgaged[26], true);
  assert.equal(r.phase, 'end');
  assert.equal(r.decks.chance.length, g.decks.chance.length);
  // ממשיכים לשחק אחרי שחזור
  r.endTurn();
  assert.equal(r.turn, 1);
  assert.equal(r.phase, 'roll');
});

test('שחזור באמצע חוב: settleDebt ממשיך תקין בלי onPaid', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.owner[3] = 1; g.owner[1] = 1;
  g.houses[3] = 5;
  g.players[0].money = 200;
  g.owner[26] = 0; g.owner[31] = 0;
  g.rollDice();
  assert.equal(g.phase, 'debt');
  const r = Game.restore(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(r.phase, 'debt');
  assert.equal(r.debt.amount, 450);
  r.mortgage(26);
  r.mortgage(31);
  r.settleDebt();
  assert.equal(r.debt, null);
  assert.equal(r.players[1].money, 1500 + 450);
  assert.equal(r.phase, 'end');
});

test('שחזור עם כרטיס "צא מהכלא" ביד', () => {
  const g = twoPlayers({ diceQueue: [[1, 1]], cardQueue: ['ch1'] });
  g.players[0].pos = 5; // 5+2=7 הפתעה
  g.rollDice();
  assert.equal(g.players[0].jailCards.length, 1);
  const r = Game.restore(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(r.players[0].jailCards.length, 1);
  assert.equal(r.players[0].jailCards[0].card.id, 'ch1');
  // הקלף לא נמצא בחפיסה
  assert.ok(!r.decks.chance.some((c) => c.id === 'ch1'));
});

test('מכירת מלון כשאין בתים במלאי — נמכר בשלמותו', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.houses[1] = 5;
  g.housesLeft = 0;
  const before = g.players[0].money;
  g.sellHouse(1);
  assert.equal(g.houses[1], 0);
  assert.equal(g.players[0].money, before + 125); // 5×50/2
});

test('באג הדאבל: הטלה רגילה אחרי דאבל לא נותנת עוד תור', () => {
  const g = twoPlayers({ diceQueue: [[2, 2], [1, 2]] });
  g.rollDice(); // דאבל אל 4 (מס) — תור נוסף
  assert.equal(g.phase, 'roll');
  g.rollDice(); // רגילה אל 7 — הפתעה... נשתמש במיקום נקי
  // אחרי הטלה רגילה אין עוד תור נוסף
  assert.notEqual(g.phase, 'roll');
});

test('דאבל בודד נותן בדיוק תור אחד נוסף', () => {
  const g = twoPlayers({ diceQueue: [[3, 3], [1, 2]] });
  g.players[0].pos = 10; // 10+6=16 נכס פנוי
  g.rollDice();
  g.buy(); // קונים את שד בנימין
  assert.equal(g.phase, 'roll'); // תור נוסף אחרי דאבל
  g.rollDice(); // 16+3=19 נכס פנוי, הטלה רגילה
  g.buy();
  assert.equal(g.phase, 'end'); // אין תור שלישי
});

test('קופה: תשלומים לבנק נאספים ומי שנוחת בחניה חופשית זוכה', () => {
  const g = twoPlayers({ diceQueue: [[1, 3], [2, 2]] });
  g.rollDice(); // אל 4 — מס הכנסה 200 לקופה
  assert.equal(g.pot, 200);
  assert.equal(g.players[0].money, 1300);
  g.endTurn();
  g.players[1].pos = 16;
  g.rollDice(); // המחשב: 16+4=20 חניה חופשית — זוכה בקופה (דאבל, אבל התור נגמר)
  assert.equal(g.pot, 0);
  assert.equal(g.players[1].money, 1700);
  assert.equal(g.phase, 'end');
});

test('חניה חופשית מפסידה את התור גם כשזוכים בקופה', () => {
  const g = twoPlayers({ diceQueue: [[1, 3], [1, 3]] });
  g.rollDice(); // אל 4 — מס הכנסה 200 לקופה
  assert.equal(g.pot, 200);
  g.endTurn();
  g.players[1].pos = 16;
  g.rollDice(); // המחשב: 16+4=20 חניה חופשית — זוכה בקופה
  assert.equal(g.pot, 0);
  assert.equal(g.players[1].money, 1700);
  assert.equal(g.phase, 'end'); // התור נגמר — אין הטלה נוספת
});

test('חניה חופשית מפסידה את התור גם אחרי דאבל', () => {
  const g = twoPlayers({ diceQueue: [[2, 2]] });
  g.players[0].pos = 16; // 16+4=20 חניה חופשית, בדאבל
  g.rollDice();
  assert.equal(g.players[0].pos, 20);
  assert.equal(g.phase, 'end'); // דאבל לא מזכה בהטלה נוספת בחניה
});

test('קופה: קניית נכס נכנסת לקופה', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.rollDice();
  g.buy(); // 60 ש"ח
  assert.equal(g.pot, 60);
});

test('קלף "שלם 50 לכל משתתף" (יושב ראש)', () => {
  const g = new Game(
    [{ name: 'א' }, { name: 'ב' }, { name: 'ג' }],
    { diceQueue: [[1, 1]], cardQueue: ['cc12'] },
  );
  g.rollDice(); // אל 2 — תיבת המזל
  assert.equal(g.players[0].money, 1400);
  assert.equal(g.players[1].money, 1550);
  assert.equal(g.players[2].money, 1550);
});

test('קלף רכבת קרובה: שכ"ד כפול לבעלים', () => {
  const g = twoPlayers({ diceQueue: [[1, 1]], cardQueue: ['cc15'] });
  g.owner[5] = 1; // רכבת הפרברים של המחשב (רכבת אחת = 25)
  g.rollDice(); // אל 2 — תיבת המזל → מתקדם לרכבת 5
  assert.equal(g.players[0].pos, 5);
  assert.equal(g.players[0].money, 1500 - 50); // פי 2
  assert.equal(g.players[1].money, 1500 + 50);
});

test('קלף חברה קרובה: פי 10 מהקוביות', () => {
  const g = twoPlayers({ diceQueue: [[1, 1]], cardQueue: ['cc5'] });
  g.owner[12] = 1; // חברת החשמל של המחשב
  g.rollDice(); // קוביות 1+1=2 → אל 2 תיבת המזל → חברת החשמל, שכ"ד 2×10=20
  assert.equal(g.players[0].pos, 12);
  assert.equal(g.players[0].money, 1500 - 20);
  assert.equal(g.players[1].money, 1500 + 20);
});

test('מכירות מכובות: ויתור משאיר את הנכס פנוי בלי מכירה', () => {
  const g = new Game(
    [{ name: 'דנה' }, { name: 'מחשב', isAI: true }],
    { diceQueue: [[1, 2]], auctions: false },
  );
  g.rollDice();
  assert.equal(g.phase, 'buy');
  g.declineBuy();
  assert.equal(g.owner[3], null);
  assert.equal(g.phase, 'end'); // בלי מכירה פומבית
});

test('מכירות מכובות: שמירה ושחזור משמרים את ההגדרה', () => {
  const g = new Game([{ name: 'א' }, { name: 'ב', isAI: true }], { auctions: false });
  const r = Game.restore(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(r.auctionsEnabled, false);
});

test('מכירות מופעלות כברירת מחדל', () => {
  const g = new Game([{ name: 'א' }, { name: 'ב', isAI: true }]);
  assert.equal(g.auctionsEnabled, true);
});

test('קופה מכובה: תשלום לבנק לא מצטבר וחניה חופשית לא מזכה', () => {
  const g = new Game(
    [{ name: 'א' }, { name: 'ב', isAI: true }],
    { diceQueue: [[1, 3], [4, 4]], pot: false },
  );
  g.rollDice(); // מס הכנסה 200 — לא נכנס לקופה
  assert.equal(g.pot, 0);
  g.endTurn();
  g.players[1].pos = 16;
  g.rollDice(); // המחשב: 16+4=20 חניה חופשית — אין קופה לזכות
  assert.equal(g.players[1].money, 1500);
  assert.equal(g.pot, 0);
});

test('קופה מכובה: שמירה ושחזור', () => {
  const g = new Game([{ name: 'א' }, { name: 'ב', isAI: true }], { pot: false });
  const r = Game.restore(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(r.potEnabled, false);
});

/* ==================== מצב חינוך פיננסי ==================== */

const F = globalThis.MONOPOLY_DATA.FINANCE;

// מגריל דטרמיניסטי (LCG) — אותו זרע, אותו שוק
const seeded = (seed) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
};

// משחק פיננסי עם קוביות בטוחות (משבצות ריקות) ומכירות כבויות
const finGame = (opts = {}) => new Game(
  [{ name: 'דנה', token: '🚗' }, { name: 'מחשב', token: '🐶', isAI: true }],
  { finance: true, auctions: false, diceQueue: opts.dice || Array(20).fill([1, 2]), ...opts },
);

// תור אחד: הטלה, ויתור על קנייה, סיום
const playTurn = (g) => {
  if (g.phase === 'roll') g.rollDice();
  if (g.phase === 'buy') g.declineBuy();
  while (g.phase === 'auction') g.passAuction(g.auctionTurn());
  if (g.phase === 'end') g.endTurn();
};

test('חינוך פיננסי: כבוי כברירת מחדל ולא משנה כלום', () => {
  const g = twoPlayers({ diceQueue: [[1, 2], [2, 3]], auctions: false });
  assert.equal(g.financeEnabled, false);
  assert.throws(() => g.invest(0, 'savings', null, 100), /כבוי/);
  playTurn(g); playTurn(g);
  assert.equal(g.market.round, 0);
  assert.equal(g.log.filter((l) => l.kind === 'market' || l.kind === 'invest').length, 0);
  assert.equal(g.toJSON().financeEnabled, false);
});

test('הפקדה מעבירה כסף להשקעה — ולא לקופת החניה החופשית', () => {
  const g = finGame({ pot: true });
  g.invest(0, 'savings', null, 100);
  assert.equal(g.players[0].money, 1400);
  assert.equal(g.investTotal(0), 100);
  assert.equal(g.pot, 0); // הקופה לא מתנפחת מהשקעות
  assert.equal(g.players[0].invest.totalIn, 100);
});

test('הפקדה: חסימות — לא בתור, שלב לא מתאים, ואין מספיק כסף', () => {
  const g = finGame();
  assert.throws(() => g.invest(1, 'savings', null, 50), /בתור שלך/);
  assert.throws(() => g.invest(0, 'savings', null, 5000), /מספיק כסף/);
  assert.throws(() => g.invest(0, 'savings', null, 0), /סכום/);
  assert.throws(() => g.invest(0, 'stocks', 'nope', 50), /חברה/);
  g.rollDice();
  if (g.phase === 'buy') { assert.throws(() => g.invest(0, 'savings', null, 50), /אי אפשר להשקיע/); }
});

test('משיכה מחזירה את מלוא הערך ומעדכנת רווח', () => {
  const g = finGame();
  g.invest(0, 'deposit', null, 200);
  g.players[0].invest.deposit = 260; // כאילו עלה
  const got = g.withdraw(0, 'deposit', null);
  assert.equal(got, 260);
  assert.equal(g.players[0].money, 1300 + 260);
  assert.equal(g.investTotal(0), 0);
  assert.equal(g.investProfit(0), 60);
  assert.throws(() => g.withdraw(0, 'deposit', null), /אין מה למשוך/);
});

test('עדכון השוק קורה בדיוק פעם בסבב מלא', () => {
  const g = finGame({ marketQueue: [{ mults: {}, deposit: 1 }, { mults: {}, deposit: 1 }] });
  g.invest(0, 'savings', null, 100);
  playTurn(g);                       // סוף התור של דנה
  assert.equal(g.market.round, 0);   // עדיין באמצע הסבב
  playTurn(g);                       // סוף התור של המחשב — הסבב הושלם
  assert.equal(g.market.round, 1);
  playTurn(g);
  assert.equal(g.market.round, 1);
  playTurn(g);
  assert.equal(g.market.round, 2);
});

test('קופת חיסכון: ריבית של 2% ולפחות שקל אחד', () => {
  const g = finGame({ marketQueue: [{ mults: {}, deposit: 1 }] });
  g.invest(0, 'savings', null, 50);
  playTurn(g); playTurn(g);
  assert.equal(g.players[0].invest.savings, 51); // 50 → +1 (מינימום)
  const g2 = finGame({ marketQueue: [{ mults: {}, deposit: 1 }] });
  g2.invest(0, 'savings', null, 200);
  playTurn(g2); playTurn(g2);
  assert.equal(g2.players[0].invest.savings, 204); // 200 → +4
});

test('פיקדון ומניות: עיגול לשקלים שלמים ורצפה שלא נמחקת', () => {
  const g = finGame({ marketQueue: [{ mults: { ice: 0.7 }, deposit: 0.96 }] });
  g.invest(0, 'deposit', null, 50);
  g.invest(0, 'stocks', 'ice', 100);
  playTurn(g); playTurn(g);
  assert.equal(g.players[0].invest.deposit, 48);   // 50 × 0.96
  assert.equal(g.players[0].invest.stocks.ice, 69); // 100 × 0.7, פחות שקל דמי ניהול
  // רצפה: ערך זעיר לא נמחק לאפס
  const g2 = finGame({ marketQueue: [{ mults: { ice: 0.5 }, deposit: 1 }] });
  g2.invest(0, 'stocks', 'ice', 100);
  g2.players[0].invest.stocks.ice = 1;
  playTurn(g2); playTurn(g2);
  assert.equal(g2.players[0].invest.stocks.ice, F.FLOOR);
});

test('מניות: הכפולה חלה רק על החברה הנכונה', () => {
  const g = finGame({ marketQueue: [{ mults: { ice: 1.4, pizza: 0.8, toys: 1, space: 1 }, deposit: 1 }] });
  g.invest(0, 'stocks', 'ice', 100);
  g.invest(0, 'stocks', 'pizza', 100);
  playTurn(g); playTurn(g);
  assert.equal(g.players[0].invest.stocks.ice, 138); // 140 פחות 2 דמי ניהול (מהאחזקה הגדולה)
  assert.equal(g.players[0].invest.stocks.pizza, 80);
  assert.equal(g.players[0].invest.stocks.toys, 0);
});

test('חדשות: מחליפות את התנועה הרגילה ומופיעות בדוח עם הסבר', () => {
  const g = finGame({ marketQueue: [{ news: { id: 'ice_crash1' }, mults: { toys: 1, space: 1, pizza: 1 }, deposit: 1 }] });
  g.invest(0, 'stocks', 'ice', 50);
  playTurn(g); playTurn(g);
  const newsLog = g.log.find((l) => l.kind === 'market_news');
  assert.ok(newsLog && newsLog.newsId === 'ice_crash1');
  const rep = g.market.report;
  assert.equal(rep.round, 1);
  assert.equal(rep.news.id, 'ice_crash1');
  const row = rep.entries.find((e) => e.co === 'ice');
  assert.equal(row.oldVal, 50);
  assert.equal(row.newVal, 25);
  assert.equal(row.delta, -25);
  assert.equal(row.pct, -50);
  assert.ok(row.reason.includes('חורף')); // ההסבר הוא סיפור החדשות
  assert.equal(rep.totals[0], -25);
});

test('כל תנועה מקבלת הסבר — גם בלי חדשות', () => {
  const g = finGame({ marketQueue: [{ mults: { ice: 1.25 }, deposit: 1.08 }] });
  g.invest(0, 'stocks', 'ice', 100);
  g.invest(0, 'deposit', null, 100);
  g.invest(0, 'savings', null, 100);
  playTurn(g); playTurn(g);
  assert.equal(g.market.report.entries.length, 3);
  for (const e of g.market.report.entries) {
    assert.ok(typeof e.reason === 'string' && e.reason.length > 3, `חסר הסבר ל-${e.name}`);
  }
});

test('שווי נטו ושווי מימוש כוללים את ההשקעות', () => {
  const g = finGame();
  const before = g.netWorth(0);
  g.invest(0, 'stocks', 'space', 300);
  assert.equal(g.netWorth(0), before); // הכסף עבר מקום, לא נעלם
  assert.equal(g.liquidationValue(0), before);
  g.players[0].invest.stocks.space = 500;
  assert.equal(g.netWorth(0), before + 200);
});

test('חוב: אפשר למשוך השקעות כדי לשלם', () => {
  const g = finGame({ diceQueue: [[1, 3]] }); // מס הכנסה 200
  g.invest(0, 'savings', null, 1450);
  g.rollDice();
  assert.equal(g.phase, 'debt');
  assert.ok(g.canAffordDebt()); // ההשקעות נחשבות לנזילות
  g.withdraw(0, 'savings', null);
  g.settleDebt();
  assert.equal(g.phase, 'end');
  assert.equal(g.players[0].money, 1500 - 200);
});

test('פשיטת רגל פודה את ההשקעות לטובת הנושה', () => {
  const g = finGame({ diceQueue: [[1, 2]] });
  g.owner[3] = 1;
  g.houses[3] = 5; // מלון — שכ"ד גבוה
  g.players[0].money = 10;
  g.invest(0, 'savings', null, 10);
  g.players[0].invest.savings = 400;
  g.rollDice();
  assert.equal(g.phase, 'debt');
  const creditorBefore = g.players[1].money;
  g.declareBankruptcy();
  assert.equal(g.investTotal(0), 0);
  assert.ok(g.players[1].money >= creditorBefore + 400); // הכסף מההשקעות עבר לנושה
  assert.ok(g.log.some((l) => l.kind === 'withdraw' && l.text.includes('נפדו')));
});

test('שמירה ושחזור: אחזקות, מגמות ומצב השוק', () => {
  const g = finGame({ marketQueue: [{ mults: { ice: 1.25 }, deposit: 1.08 }] });
  g.invest(0, 'stocks', 'ice', 100);
  g.invest(0, 'savings', null, 100);
  playTurn(g); playTurn(g);
  const r = Game.restore(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(r.financeEnabled, true);
  assert.equal(r.market.round, 1);
  assert.equal(r.players[0].invest.stocks.ice, 124); // 125 פחות שקל דמי ניהול
  assert.equal(r.players[0].invest.savings, 102);    // בקופת החיסכון אין עמלה
  assert.equal(r.investTotal(0), g.investTotal(0));
  assert.deepEqual(r.market.trend.ice, g.market.trend.ice);
  assert.equal(r.market.report.entries.length, 2);
});

test('שמירה ישנה (מלפני החינוך הפיננסי) נטענת עם ברירות מחדל', () => {
  const g = twoPlayers({ auctions: false });
  const data = JSON.parse(JSON.stringify(g.toJSON()));
  delete data.financeEnabled;
  delete data.market;
  delete data.players[0].invest;
  delete data.players[1].invest;
  const r = Game.restore(data);
  assert.equal(r.financeEnabled, false);
  assert.equal(r.investTotal(0), 0);
  assert.equal(r.market.round, 0);
  assert.equal(r.netWorth(0), 1500);
});

test('דטרמיניזם: אותו זרע מייצר בדיוק אותו שוק', () => {
  const run = () => {
    const g = new Game(
      [{ name: 'א' }, { name: 'ב', isAI: true }],
      { finance: true, auctions: false, rand: seeded(2026), diceQueue: Array(20).fill([1, 2]) },
    );
    g.invest(0, 'stocks', 'ice', 200);
    g.invest(0, 'deposit', null, 200);
    for (let i = 0; i < 6; i++) playTurn(g);
    return { ice: g.players[0].invest.stocks.ice, dep: g.players[0].invest.deposit, trend: g.market.trend };
  };
  const a = run(); const b = run();
  assert.equal(a.ice, b.ice);
  assert.equal(a.dep, b.dep);
  assert.deepEqual(a.trend, b.trend);
});

test('תוחלת המניות חיובית ובטווח המתוכנן', () => {
  const g = finGame({ rand: seeded(7) });
  let sum = 0; let min = 9; let max = 0;
  for (let i = 0; i < 2000; i++) {
    const m = g._drawMult(F.TRACKS.stocks.table);
    sum += m; min = Math.min(min, m); max = Math.max(max, m);
  }
  const ev = sum / 2000;
  assert.ok(ev > 1.05 && ev < 1.11, `תוחלת חריגה: ${ev}`);
  assert.equal(min, 0.70); // ההפסד הרגיל המקסימלי — 30%
  assert.equal(max, 1.40);
});

test('סבב עם פושט רגל: עדיין עדכון שוק אחד בדיוק לכל סבב', () => {
  const g = new Game(
    [{ name: 'א' }, { name: 'ב' }, { name: 'ג', isAI: true }],
    { finance: true, auctions: false, diceQueue: Array(20).fill([1, 2]), marketQueue: [{ mults: {}, deposit: 1 }, { mults: {}, deposit: 1 }] },
  );
  g.players[1].bankrupt = true; // ב' מחוץ למשחק
  g.invest(0, 'savings', null, 100);
  playTurn(g); // א' — הבא בתור הוא ג' (מדלגים על ב')
  assert.equal(g.turn, 2);
  assert.equal(g.market.round, 0);
  playTurn(g); // ג' — חזרה לא', הסבב הושלם
  assert.equal(g.turn, 0);
  assert.equal(g.market.round, 1);
  playTurn(g); playTurn(g);
  assert.equal(g.market.round, 2);
});

/* ---------- הבוטים והשקעות (ai.js) ---------- */

await import('../js/ai.js');
const AI = globalThis.MonopolyAI;

test('הבוט הקשה משקיע כולל מניות; הקל נוגע רק בחיסכון', () => {
  const hard = new Game(
    [{ name: 'א' }, { name: 'בוט', isAI: true }],
    { finance: true, auctions: false, difficulty: 'hard', rand: seeded(3) },
  );
  hard.turn = 1; hard.phase = 'end';
  AI.manageAssets(hard, 1);
  assert.ok(hard.investTotal(1) > 0, 'הבוט הקשה לא השקיע');
  const stocks = Object.values(hard.players[1].invest.stocks).reduce((a, b) => a + b, 0);
  assert.ok(stocks > 0, 'הבוט הקשה לא קנה מניות');

  const easy = new Game(
    [{ name: 'א' }, { name: 'בוט', isAI: true }],
    { finance: true, auctions: false, difficulty: 'easy', rand: () => 0.1 },
  );
  easy.turn = 1; easy.phase = 'end';
  AI.manageAssets(easy, 1);
  assert.equal(Object.values(easy.players[1].invest.stocks).reduce((a, b) => a + b, 0), 0);
  assert.ok(easy.players[1].invest.savings > 0);
});

test('הבוט לא משקיע כשהמצב כבוי', () => {
  const g = new Game([{ name: 'א' }, { name: 'בוט', isAI: true }], { auctions: false, difficulty: 'hard' });
  g.turn = 1; g.phase = 'end';
  AI.manageAssets(g, 1);
  assert.equal(g.investTotal(1), 0);
});

test('הבוט מושך השקעות לפני משכנתא כשצריך לשלם חוב', () => {
  const g = new Game(
    [{ name: 'א' }, { name: 'בוט', isAI: true }],
    { finance: true, auctions: false, diceQueue: [[1, 2], [1, 3]] },
  );
  g.rollDice(); g.buy(); // א' קונה את חוף אלמוג
  g.endTurn();
  g.players[1].money = 30;
  g.invest(1, 'savings', null, 30);
  g.players[1].invest.savings = 400;
  g.owner[6] = 1; // רחוב לבוט, כדי שתהיה גם אפשרות משכנתא
  g.rollDice(); // הבוט נוחת על מס הכנסה (4) — 200 ש"ח
  assert.equal(g.phase, 'debt');
  AI.handleDebt(g, 1);
  assert.equal(g.phase, 'end');
  assert.equal(g.mortgaged[6], false, 'הבוט משכן במקום למשוך השקעות');
  assert.equal(g.investTotal(1), 0);
});

/* ---------- שלוש הקופות: בורסה, קנסות ובנק ---------- */

test('שלוש קופות נפרדות: הבורסה, קופת הקנסות והבנק', () => {
  const g = finGame({ pot: true, diceQueue: [[1, 3]] });
  const bankStart = g.bank.cash;
  g.invest(0, 'stocks', 'ice', 200);
  assert.equal(g.pot, 0, 'השקעה לא נכנסת לקופת הקנסות');
  assert.equal(g.bank.cash, bankStart, 'השקעה לא נכנסת לבנק');
  assert.equal(g.marketPool(), 200, 'הכסף נמצא בקופת הבורסה');

  g.rollDice(); // מס הכנסה 200 → קופת הקנסות
  assert.equal(g.pot, 200);
  assert.equal(g.marketPool(), 200, 'קופת הקנסות לא נוגעת בבורסה');
});

test('כשקופת הקנסות כבויה — התשלומים מגיעים לבנק', () => {
  const g = new Game(
    [{ name: 'א' }, { name: 'ב', isAI: true }],
    { finance: true, auctions: false, pot: false, diceQueue: [[1, 3]] },
  );
  const before = g.bank.cash;
  g.rollDice(); // מס הכנסה 200
  assert.equal(g.pot, 0);
  assert.equal(g.bank.cash, before + 200);
});

test('הבנק משלם משכורות ומקבל את מחיר הנכס כשאין קופה', () => {
  const g = new Game(
    [{ name: 'א' }, { name: 'ב', isAI: true }],
    { finance: true, auctions: false, pot: false, diceQueue: [[1, 2]] },
  );
  const before = g.bank.cash;
  g.rollDice();
  g.buy(); // חוף אלמוג 60 → לבנק
  assert.equal(g.bank.cash, before + 60);
  const mid = g.bank.cash;
  g._salary(g.players[0]);
  assert.equal(g.bank.cash, mid - 200);
  assert.equal(g.bank.salaries, 200);
});

test('דמי ניהול: נגבים על פיקדון ומניות, לא על קופת החיסכון', () => {
  const g = finGame({ marketQueue: [{ mults: {}, deposit: 1 }] });
  g.invest(0, 'savings', null, 500);
  g.invest(0, 'stocks', 'ice', 400);
  playTurn(g); playTurn(g);
  const rep = g.market.report;
  assert.equal(rep.fees[0], 4, 'עמלה של 1% על 400 ש"ח המנוהלים');
  assert.equal(g.players[0].invest.stocks.ice, 396);
  assert.equal(g.players[0].invest.savings, 510, 'בקופת החיסכון אין עמלה');
  assert.equal(g.bank.fees, 4, 'דמי הניהול נרשמו אצל הבנק');
});

test('סכום קטן (מתחת ל-100 ש"ח) פטור מדמי ניהול', () => {
  const g = finGame({ marketQueue: [{ mults: {}, deposit: 1 }] });
  g.invest(0, 'deposit', null, 50);
  playTurn(g); playTurn(g);
  assert.equal(g.players[0].invest.deposit, 50);
  assert.equal(g.market.report.fees[0], undefined);
});

test('הבנק משקיע בבורסה ומרוויח יחד עם כולם', () => {
  const g = finGame({ marketQueue: [{ mults: {}, deposit: 1 }, { mults: { ice: 1.4, toys: 1.4, space: 1.4, pizza: 1.4 }, deposit: 1.08 }] });
  g.invest(0, 'savings', null, 100);
  playTurn(g); playTurn(g);            // סבב 1 — הבנק מאזן ומשקיע
  const invested = g.bankInvested();
  assert.ok(invested > 0, 'הבנק השקיע חלק מההון שלו');
  playTurn(g); playTurn(g);            // סבב 2 — עלייה בשוק
  assert.ok(g.bank.profit > 0, 'הבנק הרוויח מההשקעות שלו');
  assert.ok(g.marketPool() >= g.bankInvested(), 'קופת הבורסה כוללת גם את הבנק');
});

test('שמירה ושחזור שומרים את קופת הבנק', () => {
  const g = finGame({ marketQueue: [{ mults: {}, deposit: 1 }] });
  g.invest(0, 'deposit', null, 300);
  playTurn(g); playTurn(g);
  const r = Game.restore(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(r.bank.cash, g.bank.cash);
  assert.equal(r.bank.fees, g.bank.fees);
  assert.deepEqual(r.bank.invest, g.bank.invest);
  assert.equal(r.marketPool(), g.marketPool());
  // שמירה ישנה בלי בנק — נטענת עם ברירת מחדל
  const old = JSON.parse(JSON.stringify(g.toJSON()));
  delete old.bank;
  assert.equal(Game.restore(old).bank.cash, F.BANK_START);
});

/* ---------- יומן תנועה: הממשק מנפיש כל רגל בנפרד לפי המשבצות ---------- */

test('רשומת תנועה נושאת את המשבצת ואת השחקן', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.rollDice();
  const moves = g.log.filter((e) => e.kind === 'move');
  assert.equal(moves.length, 1);
  assert.equal(moves[0].pos, 3);
  assert.equal(moves[0].pIdx, 0);
});

test('קלף שמזיז אחורה מייצר שתי רגלי תנועה — לפני הקלף ואחריו', () => {
  const g = twoPlayers({ diceQueue: [[3, 2]], cardQueue: ['cc13'] });
  g.players[0].pos = 28;
  g.rollDice(); // 28+5=33 תיבת המזל, ואז 3 אחורה ל-30
  const kinds = g.log.filter((e) => ['move', 'card'].includes(e.kind)).map((e) => e.kind);
  assert.deepEqual(kinds.slice(0, 3), ['move', 'card', 'move'], 'הקלף חייב להיות בין שתי הרגליים');
  const moves = g.log.filter((e) => e.kind === 'move');
  assert.equal(moves[0].pos, 33, 'רגל ראשונה — עד משבצת ההפתעה');
  assert.equal(moves[1].pos, 30, 'רגל שנייה — אחרי הקלף');
});

test('כניסה לכלא רושמת תנועה משלה', () => {
  const g = twoPlayers({ diceQueue: [[2, 2]] });
  g.players[0].pos = 26; // 26+4=30 "לך לכלא"
  g.rollDice();
  const moves = g.log.filter((e) => e.kind === 'move');
  assert.equal(moves[moves.length - 1].pos, 10, 'הרגל האחרונה היא הכניסה לכלא');
  assert.equal(g.players[0].pos, 10);
});

test('חניה חופשית מסומנת בסוג משלה כדי שתופיע בסיכום תור הבוט', () => {
  const g = twoPlayers({ diceQueue: [[2, 2]] });
  g.players[0].pos = 16; // 16+4=20
  g.rollDice();
  const park = g.log.find((e) => e.kind === 'park');
  assert.ok(park, 'אין רשומת חניה חופשית');
  assert.match(park.text, /דאבל/, 'צריך להסביר שגם דאבל לא נותן תור נוסף כאן');
});

/* ---------- הפקדה מקורית לכל אחזקה ---------- */

test('basis: ההפקדה המקורית נשמרת ולא מושפעת משוק ומעמלות', () => {
  const g = finGame({ marketQueue: [{ mults: { ice: 1.4, toys: 1, space: 1, pizza: 1 }, deposit: 1.08 }] });
  g.invest(0, 'stocks', 'ice', 300);
  g.invest(0, 'stocks', 'ice', 200); // שתי הפקדות מצטברות
  assert.equal(g.players[0].invest.basis.stocks.ice, 500);
  playTurn(g); playTurn(g); // סבב שוק: עלייה + דמי ניהול
  assert.ok(g.players[0].invest.stocks.ice > 500, 'הערך גדל');
  assert.equal(g.players[0].invest.basis.stocks.ice, 500, 'ההפקדה המקורית לא זזה');
  const h = g.holdings(0).find((x) => x.co === 'ice');
  assert.equal(h.basis, 500);
});

test('basis: משיכה מאפסת את ההפקדה של אותה אחזקה בלבד', () => {
  const g = finGame();
  g.invest(0, 'savings', null, 100);
  g.invest(0, 'deposit', null, 200);
  g.withdraw(0, 'savings', null);
  assert.equal(g.players[0].invest.basis.savings, 0);
  assert.equal(g.players[0].invest.basis.deposit, 200);
});

test('basis: שורד שמירה ושחזור, ושמירה ישנה מקבלת ברירת מחדל הגיונית', () => {
  const g = finGame({ marketQueue: [{ mults: {}, deposit: 1.08 }] });
  g.invest(0, 'deposit', null, 400);
  playTurn(g); playTurn(g);
  const json = JSON.parse(JSON.stringify(g.toJSON()));
  assert.equal(Game.restore(json).players[0].invest.basis.deposit, 400);

  // שמירה ישנה בלי basis — מאותחל לשווי הנוכחי כדי שלא יוצג רווח מדומה
  const old = JSON.parse(JSON.stringify(g.toJSON()));
  delete old.players[0].invest.basis;
  const r = Game.restore(old);
  assert.equal(r.players[0].invest.basis.deposit, r.players[0].invest.deposit);
});

test('basis: פשיטת רגל מאפסת גם את ההפקדות', () => {
  const g = finGame({ diceQueue: [[1, 3]] });
  g.invest(0, 'savings', null, 500);
  g.players[0].money = 0;
  g.rollDice(); // מס הכנסה 200 — אין מזומן
  assert.equal(g.phase, 'debt');
  g.declareBankruptcy();
  assert.equal(g.players[0].invest.basis.savings, 0);
});

/* ==================== העברות ידניות ==================== */

const manualGame = (opts) => new Game(
  [{ name: 'דנה', token: '🚗' }, { name: 'מחשב', token: '🐶', isAI: true }],
  { manualPay: true, ...opts },
);

test('העברה ידנית: הכסף לא זז עד שהשחקן מעביר אותו', () => {
  const g = manualGame({ diceQueue: [[1, 2]] });
  g.owner[3] = 1; // חוף אלמוג של היריב, שכ"ד 4
  g.rollDice();
  assert.equal(g.phase, 'pay', 'נכנסים לשלב ההעברה');
  assert.equal(g.players[0].money, 1500, 'הכסף עדיין בחשבון');
  assert.equal(g.players[1].money, 1500, 'והיריב עוד לא קיבל');
  assert.equal(g.pendingPay.amount, 4);
  assert.equal(g.pendingPay.creditor, 1);
  g.confirmPayment(4);
  assert.equal(g.players[0].money, 1496);
  assert.equal(g.players[1].money, 1504);
  assert.equal(g.phase, 'end');
  assert.equal(g.pendingPay, null);
});

test('העברה ידנית: סכום שגוי נדחה והכסף לא זז', () => {
  const g = manualGame({ diceQueue: [[1, 2]] });
  g.owner[3] = 1;
  g.rollDice();
  assert.throws(() => g.confirmPayment(3), /לא מדויק/);
  assert.throws(() => g.confirmPayment(400), /לא מדויק/);
  assert.equal(g.players[0].money, 1500);
  assert.equal(g.phase, 'pay');
  g.confirmPayment(4); // הסכום הנכון עובר
  assert.equal(g.players[0].money, 1496);
});

test('העברה ידנית: מס הכנסה מגיע לקופה רק אחרי אישור', () => {
  const g = manualGame({ diceQueue: [[1, 3]] }); // משבצת 4 — מס הכנסה 200
  g.rollDice();
  assert.equal(g.phase, 'pay');
  assert.equal(g.pot, 0, 'הקופה עוד ריקה');
  g.confirmPayment(200);
  assert.equal(g.players[0].money, 1300);
  assert.equal(g.pot, 200);
});

test('העברה ידנית: הבוט משלם אוטומטית ולא נתקע', () => {
  const g = manualGame({ diceQueue: [[1, 2]] });
  g.owner[3] = 0; // חוף אלמוג שייך לשחקן האנושי
  g.turn = 1;     // תור הבוט
  g.rollDice();   // הבוט נוחת על הרחוב של השחקן
  assert.equal(g.phase, 'end', 'הבוט לא נעצר בשלב העברה');
  assert.equal(g.pendingPay, null);
  assert.equal(g.players[1].money, 1500 - 4, 'הבוט שילם מיד');
  assert.equal(g.players[0].money, 1500 + 4, 'והשחקן קיבל מיד');
});

test('העברה ידנית: בלי מספיק כסף נכנסים לחוב כרגיל', () => {
  const g = manualGame({ diceQueue: [[1, 3]] });
  g.players[0].money = 50;
  g.rollDice(); // מס הכנסה 200
  assert.equal(g.phase, 'debt', 'אין העברה ידנית כשאין כסף — קודם מגייסים');
  assert.equal(g.pendingPay, null);
});

test('העברה ידנית: אין אישור בלי העברה ממתינה', () => {
  const g = manualGame();
  assert.throws(() => g.confirmPayment(100), /אין העברה/);
});

test('העברה ידנית: קנס כלא כפוי עובר דרך אישור וממשיך לזוז', () => {
  const g = manualGame({ diceQueue: [[1, 2]] });
  const p = g.players[0];
  p.inJail = true; p.pos = C.JAIL_POS; p.jailRolls = 2;
  g.rollDice(); // ניסיון שלישי בלי דאבל — קנס כפוי
  assert.equal(g.phase, 'pay');
  assert.equal(g.pendingPay.amount, C.JAIL_FINE);
  assert.equal(p.pos, C.JAIL_POS, 'לא זז לפני שהעביר את הקנס');
  g.confirmPayment(C.JAIL_FINE);
  assert.equal(p.inJail, false);
  assert.equal(p.money, 1500 - C.JAIL_FINE);
  assert.equal(p.pos, C.JAIL_POS + 3, 'ממשיך לזוז אחרי ששילם');
});

test('העברה ידנית: המצב נשמר ונטען עם ההעברה הפתוחה', () => {
  const g = manualGame({ diceQueue: [[1, 3]] });
  g.rollDice();
  assert.equal(g.phase, 'pay');
  const r = Game.restore(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(r.manualPay, true);
  assert.equal(r.phase, 'pay');
  assert.equal(r.pendingPay.amount, 200);
  r.confirmPayment(200);
  assert.equal(r.players[0].money, 1300);
  assert.equal(r.phase, 'end');
});

test('אישור בלי סכום מוקלד מתקבל (משחק מרחוק)', () => {
  const g = manualGame({ diceQueue: [[1, 3]] });
  g.rollDice();
  g.confirmPayment();
  assert.equal(g.players[0].money, 1300);
});

test('בלי המצב הידני — הגבייה נשארת אוטומטית', () => {
  const g = twoPlayers({ diceQueue: [[1, 3]] });
  g.rollDice();
  assert.equal(g.phase, 'end');
  assert.equal(g.players[0].money, 1300);
});
