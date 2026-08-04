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
  g.placeBid(0, 10);
  g.placeBid(1, 20);
  g.passAuction(0);
  assert.equal(g.owner[3], 1);
  assert.equal(g.players[1].money, 1500 - 20);
  assert.equal(g.phase, 'end');
});

test('מכירה פומבית בלי הצעות — הנכס נשאר בבנק', () => {
  const g = twoPlayers({ diceQueue: [[1, 2]] });
  g.rollDice();
  g.declineBuy();
  g.passAuction(0);
  g.passAuction(1);
  assert.equal(g.owner[3], null);
  assert.equal(g.phase, 'end');
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

test('רכבות: שכ"ד לפי מספר רכבות', () => {
  const g = twoPlayers();
  g.owner[5] = 1;
  assert.equal(g.rentOf(5, 7), 25);
  g.owner[15] = 1;
  g.owner[25] = 1;
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
  g.passAuction(0);
  g.passAuction(1);
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

test('בנייה שווה: אי אפשר בית שני לפני בית ראשון בכל הרחובות', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.phase = 'end';
  assert.equal(g.canBuildOn(0, 1), true);
  g.buildHouse(1);
  assert.equal(g.canBuildOn(0, 1), false); // חייבים לבנות קודם ב-3
  assert.equal(g.canBuildOn(0, 3), true);
  g.buildHouse(3);
  assert.equal(g.canBuildOn(0, 1), true);
  assert.equal(g.housesLeft, C.TOTAL_HOUSES - 2);
});

test('מלון: אחרי 4 בתים; הבתים חוזרים למלאי', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
  g.phase = 'end';
  g.players[0].money = 5000;
  for (let i = 0; i < 4; i++) { g.buildHouse(1); g.buildHouse(3); }
  assert.equal(g.houses[1], 4);
  g.buildHouse(1);
  assert.equal(g.houses[1], 5);
  assert.equal(g.hotelsLeft, C.TOTAL_HOTELS - 1);
  assert.equal(g.housesLeft, C.TOTAL_HOUSES - 4); // 8 נבנו, 4 חזרו
});

test('אסור לבנות כשרחוב בקבוצה ממושכן', () => {
  const g = twoPlayers();
  g.owner[1] = 0; g.owner[3] = 0;
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
  g.rollDice(); // המחשב: 16+4=20 חניה חופשית — זוכה בקופה (דאבל, אבל זכייה קודם)
  assert.equal(g.pot, 0);
  assert.equal(g.players[1].money, 1700);
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
