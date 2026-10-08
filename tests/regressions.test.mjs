import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../js/data.js');
await import('../js/engine.js');
await import('../js/ai.js');
const { Game } = globalThis.MonopolyEngine;
const make = (opts = {}, count = 3) => new Game(Array.from({ length: count }, (_, idx) => ({ name: `Player${idx}`, isAI: idx > 0, token: '🚗' })), opts);
const restore = (g) => Game.restore(JSON.parse(JSON.stringify(g.toJSON())));

test('pay-all card waits for each manual transfer and survives reload', () => {
  let g = make({ manualPay: true, cardQueue: ['cc12'] });
  g._drawCard('chest');
  assert.equal(g.phase, 'pay');
  assert.equal(g.players[0].money, 1500);
  g = restore(g);
  g.confirmPayment(50);
  assert.equal(g.phase, 'pay');
  assert.deepEqual(g.players.map((p) => p.money), [1450, 1550, 1500]);
  g = restore(g);
  g.confirmPayment(50);
  assert.equal(g.phase, 'end');
  assert.deepEqual(g.players.map((p) => p.money), [1400, 1550, 1550]);
  assert.throws(() => g.confirmPayment(50));
});
test('pay-all cannot silently forgive the unpaid remainder', () => {
  const g = make({ cardQueue: ['cc12'] });
  g.players[0].money = 60;
  g._drawCard('chest');
  assert.equal(g.phase, 'debt');
  assert.equal(g.debt.amount, 50);
  assert.equal(g.debt.creditor, 2);
  assert.equal(g.players[2].money, 1500);
});
test('birthday collection continues after off-turn bankruptcy', () => {
  let g = make({ manualPay: true, cardQueue: ['ch10'] });
  g.players[1].money = 3;
  g._drawCard('chance');
  assert.equal(g.phase, 'debt');
  assert.equal(g.debt.debtor, 1);
  g = restore(g);
  g.declareBankruptcy();
  assert.equal(g.phase, 'collect');
  assert.equal(g.pendingCollect.payer, 2);
  g.collectMoney();
  assert.equal(g.phase, 'end');
  assert.equal(g.players[0].money, 1513);
});
test('jail cards are returned to both decks every time', () => {
  for (const [deck, id] of [['chest', 'cc6'], ['chance', 'ch8']]) {
    const g = make({ cardQueue: [id] });
    const size = g.decks[deck].length;
    g._drawCard(deck);
    assert.equal(g.decks[deck].length, size);
    assert.equal(g.decks[deck].at(-1).id, id);
  }
});
test('trade preflight rejects invalid amounts and duplicates without mutation', () => {
  const g = make(); g.owner[1] = 0;
  for (const proposal of [{ moneyA: -10 }, { moneyA: NaN }, { moneyA: 1.5 }, { propsA: [1, 1] }]) {
    const before = JSON.stringify(g.toJSON());
    assert.throws(() => g.executeTrade(0, 1, proposal));
    assert.equal(JSON.stringify(g.toJSON()), before);
  }
});
test('trade includes mortgage interest in affordability before transferring', () => {
  const g = make(); g.owner[39] = 0; g.mortgaged[39] = true; g.players[1].money = 10;
  assert.throws(() => g.executeTrade(0, 1, { propsA: [39] }));
  assert.equal(g.owner[39], 0);
  assert.equal(g.players[1].money, 10);
  g.players[1].money = 100;
  const bank = g.bank.cash;
  g.executeTrade(0, 1, { propsA: [39] });
  assert.equal(g.players[1].money, 80);
  assert.equal(g.bank.cash, bank + 20);
});
test('receive cards debit bank; invalid investment routes cannot create money', () => {
  const g = make({ finance: true, cardQueue: ['ch6'] });
  const bank = g.bank.cash;
  g._drawCard('chance');
  assert.equal(g.bank.cash, bank - 20);
  assert.throws(() => g.withdraw(0, 'totalIn'));
  assert.throws(() => g.invest(0, 'constructor', null, 20));
});
test('seeded games with debt, card transfers and repeated reloads advance without lockup', () => {
  for (let seed = 1; seed <= 12; seed++) {
    let state = seed;
    const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    let g = make({ rand, manualPay: true, finance: seed % 2 === 0, auctions: seed % 3 !== 0 });
    let steps = 0;
    while (g.phase !== 'gameover' && steps++ < 3000) {
      if (steps % 31 === 0) { g = restore(g); g.rand = rand; }
      if (g.phase === 'pay') g.confirmPayment(g.pendingPay.amount);
      else if (g.phase === 'collect') g.collectMoney();
      else if (g.phase === 'debt') globalThis.MonopolyAI.handleDebt(g, g.debt.debtor);
      else if (g.phase === 'buy') {
        if (globalThis.MonopolyAI.decideBuy(g, g.turn)) g.buy(); else g.declineBuy();
      } else if (g.phase === 'auction') {
        const idx = g.auctionTurn(), amount = globalThis.MonopolyAI.decideAuction(g, idx);
        if (amount === 'pass' || amount === null) g.passAuction(idx); else g.placeBid(idx, amount);
      } else if (g.phase === 'roll') g.rollDice();
      else if (g.phase === 'end') { globalThis.MonopolyAI.manageAssets(g, g.turn); if (g.phase === 'end') g.endTurn(); }
      else assert.fail(`Unknown phase ${g.phase}`);
      assert.ok(g.players.every((p) => Number.isSafeInteger(p.money) && p.money >= 0));
      assert.ok(g.housesLeft >= 0 && g.hotelsLeft >= 0);
      assert.equal(g.housesLeft + g.houses.reduce((n, h) => n + (h === 5 ? 0 : h), 0), 32);
      assert.equal(g.hotelsLeft + g.houses.filter((h) => h === 5).length, 12);
    }
    assert.ok(g.phase === 'gameover' || g._logSeq > 1000, `Seed ${seed} failed to advance`);
  }
});

test('cancel an unpaid purchase without changing money, ownership, bank or stats', () => {
  const g=make({manualPay:true,auctions:false});
  g.current().pos=1;g.pendingBuy=1;g.phase='buy';
  const money=g.current().money, bank=g.bank.cash, pot=g.pot, bought=g.current().stats.bought;
  g.buy();assert.equal(g.phase,'pay');g.cancelPendingPurchase();
  assert.equal(g.phase,'end');assert.equal(g.pendingPay,null);assert.equal(g.owner[1],null);
  assert.equal(g.current().money,money);assert.equal(g.bank.cash,bank);assert.equal(g.pot,pot);assert.equal(g.current().stats.bought,bought);
  assert.throws(()=>g.confirmPayment(60));assert.throws(()=>g.cancelPendingPurchase());
});
test('cancel pending purchase after save and restore preserves auction rules', () => {
  let g=make({manualPay:true,auctions:true});
  g.current().pos=1;g.pendingBuy=1;g.phase='buy';g.buy();g=restore(g);
  g.cancelPendingPurchase();assert.equal(g.phase,'auction');assert.equal(g.auction.pos,1);
  assert.equal(g.current().money,1500);assert.equal(g.owner[1],null);
});
test('mandatory payments and completed purchases cannot be cancelled', () => {
  const g=make({manualPay:true,auctions:false});
  g._charge(0,100,null,'tax',null,{kind:'afterAction'});
  const before=JSON.stringify(g.toJSON());
  assert.throws(()=>g.cancelPendingPurchase());assert.equal(JSON.stringify(g.toJSON()),before);
  g.confirmPayment(100);g.current().pos=1;g.pendingBuy=1;g.phase='buy';g.buy();g.confirmPayment(60);
  assert.throws(()=>g.cancelPendingPurchase());assert.equal(g.owner[1],0);assert.equal(g.current().money,1340);
});
