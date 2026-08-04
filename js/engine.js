/* מנוע המשחק — לוגיקה טהורה, בלי DOM.
 * ממומש לפי חוברת ההוראות המקורית (קודקוד/Hasbro 2004):
 * מכירה פומבית, בנייה שווה, מלאי בניינים, משכנתא + 10% ריבית,
 * כלא (קנס/דאבל/כרטיס), דאבל שלישי, פשיטת רגל.
 */
(function () {
  'use strict';

  const D = globalThis.MONOPOLY_DATA;
  const { CONSTANTS: C, BOARD, GROUPS, RAIL_RENTS } = D;

  const money = (n) => `${n.toLocaleString('he-IL')} ש"ח`;
  // פועל מותאם מגדר: v(p, 'קנה', 'קנתה')
  const v = (p, masc, fem) => (p.gender === 'f' ? fem : masc);

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  class Game {
    /**
     * @param {Array<{name:string, token:string, isAI:boolean}>} playersSpec
     * @param {{rand?:Function, diceQueue?:number[][], cardQueue?:string[]}} [opts]
     */
    constructor(playersSpec, opts = {}) {
      this.rand = opts.rand || Math.random;
      this.diceQueue = (opts.diceQueue || []).slice();
      this.cardQueue = (opts.cardQueue || []).slice(); // מזהי קלפים כפויים לבדיקות

      this.players = playersSpec.map((p, idx) => ({
        idx,
        name: p.name,
        token: p.token,
        gender: p.gender === 'f' ? 'f' : 'm',
        isAI: !!p.isAI,
        money: C.START_MONEY,
        pos: 0,
        inJail: false,
        jailRolls: 0,
        jailCards: [], // {deck:'chance'|'chest', card}
        bankrupt: false,
      }));

      this.owner = new Array(40).fill(null);     // idx של שחקן או null (בנק)
      this.houses = new Array(40).fill(0);       // 0-4 בתים, 5 = מלון
      this.mortgaged = new Array(40).fill(false);
      this.housesLeft = C.TOTAL_HOUSES;
      this.hotelsLeft = C.TOTAL_HOTELS;
      this.pot = 0; // הקופה: כל תשלום לבנק נכנס אליה, מי שנוחת בחניה חופשית זוכה

      this.decks = {
        chance: shuffle(D.CHANCE_CARDS, this.rand),
        chest: shuffle(D.CHEST_CARDS, this.rand),
      };

      this.turn = 0;
      this.phase = 'roll'; // roll | buy | auction | debt | end | gameover
      this.dice = [0, 0];
      this.doubles = 0;
      this.pendingBuy = null;   // pos
      this.auction = null;      // {pos, currentBid, highBidder, active:[idx], ptr}
      this.auctionQueue = [];   // מכירות פומביות שממתינות (פשיטת רגל לבנק)
      this.debt = null;         // {debtor, creditor|null, amount, reason}
      this.lastDrawnCard = null;
      this.winner = null;
      this.log = [];
      this._logSeq = 0;

      this._log(`המשחק התחיל! לכל משתתף ${money(C.START_MONEY)} בחשבון הבנק.`, 'info');
      this._log(`תור ראשון: ${this.current().name}`, 'turn');
    }

    /* ---------- עזרים ---------- */

    current() { return this.players[this.turn]; }
    square(pos) { return BOARD[pos]; }
    alive() { return this.players.filter((p) => !p.bankrupt); }

    groupPositions(group) {
      return BOARD.filter((s) => s.type === 'street' && s.group === group).map((s) => s.pos);
    }

    ownsFullGroup(idx, group) {
      return this.groupPositions(group).every((p) => this.owner[p] === idx);
    }

    playerProps(idx) {
      const res = [];
      for (let p = 0; p < 40; p++) if (this.owner[p] === idx) res.push(p);
      return res;
    }

    countOwned(idx, type) {
      return BOARD.filter((s) => s.type === type && this.owner[s.pos] === idx).length;
    }

    rentOf(pos, diceTotal) {
      const sq = this.square(pos);
      const ownerIdx = this.owner[pos];
      if (ownerIdx === null || this.mortgaged[pos]) return 0;
      if (sq.type === 'street') {
        const h = this.houses[pos];
        if (h > 0) return sq.rent[h];
        // רחוב שלם ללא בתים — שכ"ד כפול
        return this.ownsFullGroup(ownerIdx, sq.group) ? sq.rent[0] * 2 : sq.rent[0];
      }
      if (sq.type === 'rail') {
        return RAIL_RENTS[this.countOwned(ownerIdx, 'rail') - 1];
      }
      if (sq.type === 'utility') {
        const mult = this.countOwned(ownerIdx, 'utility') === 2 ? 10 : 4;
        return diceTotal * mult;
      }
      return 0;
    }

    // כמה כסף שחקן מסוגל לגייס בסך הכול (מזומן + מכירת בניינים + משכנתאות)
    liquidationValue(idx) {
      let total = this.players[idx].money;
      for (const pos of this.playerProps(idx)) {
        const sq = this.square(pos);
        if (sq.type === 'street' && this.houses[pos] > 0) {
          const h = this.houses[pos];
          const units = h === 5 ? 5 : h;
          total += (units * GROUPS[sq.group].houseCost) / 2;
        }
        if (!this.mortgaged[pos]) total += sq.price / 2;
      }
      return total;
    }

    netWorth(idx) {
      let total = this.players[idx].money;
      for (const pos of this.playerProps(idx)) {
        const sq = this.square(pos);
        total += this.mortgaged[pos] ? sq.price / 2 : sq.price;
        if (sq.type === 'street' && this.houses[pos] > 0) {
          const units = this.houses[pos] === 5 ? 5 : this.houses[pos];
          total += units * GROUPS[sq.group].houseCost;
        }
      }
      return total;
    }

    _log(text, kind = 'info', extra = {}) {
      this.log.push({ id: ++this._logSeq, text, kind, ...extra });
    }

    /* ---------- קוביות ותנועה ---------- */

    _rollPair() {
      if (this.diceQueue.length) return this.diceQueue.shift();
      return [1 + Math.floor(this.rand() * 6), 1 + Math.floor(this.rand() * 6)];
    }

    rollDice() {
      if (this.phase !== 'roll') throw new Error('לא שלב הטלת קוביות');
      const p = this.current();
      this.dice = this._rollPair();
      const [a, b] = this.dice;
      const isDouble = a === b;
      this._log(`${p.name} ${v(p, 'הטיל', 'הטילה')} ${a} ו-${b}${isDouble ? ' — דאבל!' : ''}`, 'dice');

      if (p.inJail) return this._jailRoll(isDouble, a + b);

      if (isDouble) {
        this.doubles++;
        if (this.doubles === 3) {
          this._log(`דאבל שלישי ברצף! ${p.name} ${v(p, 'נשלח', 'נשלחת')} לכלא.`, 'jail');
          this._goToJail(p);
          return;
        }
      } else {
        this.doubles = 0; // הטלה רגילה מאפסת — תור נוסף רק אחרי דאבל בהטלה הנוכחית
      }
      this._move(p, a + b);
    }

    _jailRoll(isDouble, total) {
      const p = this.current();
      if (isDouble) {
        this._log(`${p.name} ${v(p, 'הטיל דאבל ויוצא', 'הטילה דאבל ויוצאת')} מהכלא!`, 'jail');
        p.inJail = false;
        p.jailRolls = 0;
        this.doubles = 0; // אין תור נוסף אחרי יציאה בדאבל
        this._move(p, total, { noExtraRoll: true });
      } else {
        p.jailRolls++;
        if (p.jailRolls >= 3) {
          this._log(`ניסיון שלישי ללא דאבל — ${p.name} ${v(p, 'חייב', 'חייבת')} לשלם קנס ${money(C.JAIL_FINE)} ולצאת.`, 'jail');
          p.inJail = false;
          p.jailRolls = 0;
          this._charge(p.idx, C.JAIL_FINE, null, 'קנס יציאה מהכלא', () => {
            this._move(p, total, { noExtraRoll: true });
          }, { kind: 'jailMove', total });
        } else {
          this._log(`${p.name} ${v(p, 'נשאר', 'נשארת')} בכלא (ניסיון ${p.jailRolls} מתוך 3).`, 'jail');
          this.phase = 'end';
        }
      }
    }

    _move(p, steps, opts = {}) {
      const from = p.pos;
      p.pos = (p.pos + steps + 40) % 40;
      if (steps > 0 && p.pos < from) this._salary(p);
      this._resolveLanding(opts);
    }

    _moveTo(p, pos, { collectSalary = true } = {}) {
      const from = p.pos;
      p.pos = pos;
      if (collectSalary && (pos < from || pos === C.GO_POS)) this._salary(p);
      this._resolveLanding();
    }

    _salary(p) {
      p.money += C.GO_SALARY;
      this._log(`${p.name} ${v(p, 'עבר ב"דרך צלחה" וקיבל', 'עברה ב"דרך צלחה" וקיבלה')} משכורת ${money(C.GO_SALARY)}!`, 'money');
    }

    _resolveLanding(opts = {}) {
      const p = this.current();
      const sq = this.square(p.pos);
      this._log(`${p.name} ${v(p, 'הגיע', 'הגיעה')} אל "${sq.name}".`, 'move');

      switch (sq.type) {
        case 'street':
        case 'rail':
        case 'utility': {
          const ownerIdx = this.owner[p.pos];
          if (ownerIdx === null) {
            this.pendingBuy = p.pos;
            this.phase = 'buy';
            this._log(`"${sq.name}" פנוי לקנייה במחיר ${money(sq.price)}.`, 'offer');
            return;
          }
          if (ownerIdx === p.idx) break;
          if (this.mortgaged[p.pos]) {
            this._log(`"${sq.name}" ממושכן — אין שכר דירה.`, 'info');
            break;
          }
          const rent = this.rentOf(p.pos, this.dice[0] + this.dice[1]);
          const ownerP = this.players[ownerIdx];
          this._log(`שכר דירה: ${p.name} ${v(p, 'משלם', 'משלמת')} ${money(rent)} ל${ownerP.name}.`, 'rent');
          this._charge(p.idx, rent, ownerIdx, `שכר דירה על ${sq.name}`, () => this._afterAction(opts));
          return;
        }
        case 'tax':
          this._log(`${sq.name}: ${p.name} ${v(p, 'משלם', 'משלמת')} ${money(sq.amount)} לבנק.`, 'tax');
          this._charge(p.idx, sq.amount, null, sq.name, () => this._afterAction(opts));
          return;
        case 'chance':
          return this._drawCard('chance', opts);
        case 'chest':
          return this._drawCard('chest', opts);
        case 'gotojail':
          this._log(`${p.name} ${v(p, 'נשלח', 'נשלחת')} ישר לכלא!`, 'jail');
          this._goToJail(p);
          return;
        default:
          if (sq.type === 'parking') {
            if (this.pot > 0) {
              const won = this.pot;
              this.pot = 0;
              p.money += won;
              this._log(`🎁 ${p.name} ${v(p, 'נחת', 'נחתה')} בחניה חופשית ${v(p, 'וזכה', 'וזכתה')} בקופה: ${money(won)}!`, 'pot');
            } else {
              this._log('חניה חופשית — נחים תור אחד.', 'info');
            }
          }
          break;
      }
      this._afterAction(opts);
    }

    _afterAction(opts = {}) {
      if (this.phase === 'gameover') return;
      if (this.auctionQueue.length) return this._startNextQueuedAuction();
      const p = this.current();
      if (p.bankrupt) return this._advanceTurn();
      if (this.doubles > 0 && !p.inJail && !opts.noExtraRoll) {
        this.phase = 'roll';
        this._log(`דאבל! ${p.name} ${v(p, 'מטיל', 'מטילה')} שוב.`, 'turn');
      } else {
        this.phase = 'end';
      }
    }

    /* ---------- קנייה ומכירה פומבית ---------- */

    buy() {
      if (this.phase !== 'buy') throw new Error('אין נכס ממתין לקנייה');
      const pos = this.pendingBuy;
      const sq = this.square(pos);
      const p = this.current();
      if (p.money < sq.price) throw new Error('אין מספיק כסף בחשבון');
      p.money -= sq.price;
      this.pot += sq.price;
      this.owner[pos] = p.idx;
      this.pendingBuy = null;
      this._log(`${p.name} ${v(p, 'קנה', 'קנתה')} את "${sq.name}" ב-${money(sq.price)}! 🎉`, 'buy');
      this._afterAction();
    }

    declineBuy() {
      if (this.phase !== 'buy') throw new Error('אין נכס ממתין לקנייה');
      const pos = this.pendingBuy;
      this.pendingBuy = null;
      this._log(`"${this.square(pos).name}" יוצא למכירה פומבית!`, 'auction');
      this._startAuction(pos);
    }

    _startAuction(pos) {
      this.phase = 'auction';
      this.auction = {
        pos,
        currentBid: 0,
        highBidder: null,
        active: this.alive().map((p) => p.idx),
        ptr: 0,
      };
      this.auction.ptr = this.auction.active.indexOf(this.turn);
      if (this.auction.ptr < 0) this.auction.ptr = 0;
    }

    auctionTurn() { return this.auction.active[this.auction.ptr]; }

    placeBid(idx, amount) {
      const a = this.auction;
      if (this.phase !== 'auction') throw new Error('אין מכירה פומבית');
      if (this.auctionTurn() !== idx) throw new Error('לא תורך במכירה');
      const minBid = a.currentBid === 0 ? C.AUCTION_MIN_STEP : a.currentBid + C.AUCTION_MIN_STEP;
      if (amount < minBid) throw new Error(`הצעה נמוכה מדי (מינימום ${minBid})`);
      if (this.players[idx].money < amount) throw new Error('אין כיסוי להצעה');
      a.currentBid = amount;
      a.highBidder = idx;
      this._log(`${this.players[idx].name} ${v(this.players[idx], 'מציע', 'מציעה')} ${money(amount)} על "${this.square(a.pos).name}".`, 'auction');
      this._advanceAuction();
    }

    passAuction(idx) {
      const a = this.auction;
      if (this.phase !== 'auction') throw new Error('אין מכירה פומבית');
      if (this.auctionTurn() !== idx) throw new Error('לא תורך במכירה');
      if (a.highBidder === idx) { this._advanceAuction(); return; } // המוביל נשאר במכירה
      a.active.splice(a.ptr, 1);
      if (a.ptr >= a.active.length) a.ptr = 0;
      this._log(`${this.players[idx].name} ${v(this.players[idx], 'פורש', 'פורשת')} מהמכירה.`, 'auction');
      this._checkAuctionEnd();
    }

    _advanceAuction() {
      const a = this.auction;
      a.ptr = (a.ptr + 1) % a.active.length;
      this._checkAuctionEnd();
    }

    _checkAuctionEnd() {
      const a = this.auction;
      if (a.active.length === 0) {
        this._log(`אף אחד לא הציע — "${this.square(a.pos).name}" נשאר בידי הבנק.`, 'auction');
        this.auction = null;
        return this._afterAction();
      }
      if (a.active.length === 1 && a.highBidder === a.active[0]) {
        const winner = this.players[a.highBidder];
        winner.money -= a.currentBid;
        this.pot += a.currentBid;
        this.owner[a.pos] = winner.idx;
        this._log(`${winner.name} ${v(winner, 'זכה', 'זכתה')} במכירה! "${this.square(a.pos).name}" ב-${money(a.currentBid)}.`, 'buy');
        this.auction = null;
        return this._afterAction();
      }
      // אם נשאר שחקן יחיד בלי הצעה כלל — הוא יכול להציע מינימום או לפרוש
    }

    _startNextQueuedAuction() {
      const pos = this.auctionQueue.shift();
      this._log(`הבנק מוציא את "${this.square(pos).name}" למכירה פומבית.`, 'auction');
      this._startAuction(pos);
    }

    /* ---------- קלפים ---------- */

    _drawCard(deckName, opts = {}) {
      const deck = this.decks[deckName];
      let card;
      if (this.cardQueue.length) {
        const forcedId = this.cardQueue.shift();
        const i = deck.findIndex((c) => c.id === forcedId);
        card = i >= 0 ? deck.splice(i, 1)[0] : deck.shift();
      } else {
        card = deck.shift();
      }
      this.lastDrawnCard = { deck: deckName, card };
      const label = deckName === 'chance' ? 'הפתעה' : 'תיבת המזל';
      this._log(`קלף ${label}: "${card.text}"`, 'card', { deck: deckName, cardText: card.text, cardId: card.id });

      const p = this.current();
      const act = card.action;
      const returnCard = () => { if (act.type !== 'getOutOfJail') deck.push(card); };

      switch (act.type) {
        case 'receive':
          returnCard();
          p.money += act.amount;
          this._afterAction(opts);
          return;
        case 'pay':
          returnCard();
          this._charge(p.idx, act.amount, null, card.text, () => this._afterAction(opts));
          return;
        case 'collectFromAll': {
          returnCard();
          for (const other of this.alive()) {
            if (other.idx === p.idx) continue;
            const paid = Math.min(act.amount, other.money);
            other.money -= paid;
            p.money += paid;
          }
          this._afterAction(opts);
          return;
        }
        case 'payToAll': {
          returnCard();
          for (const other of this.alive()) {
            if (other.idx === p.idx) continue;
            const paid = Math.min(act.amount, p.money);
            p.money -= paid;
            other.money += paid;
          }
          this._afterAction(opts);
          return;
        }
        case 'repairs': {
          returnCard();
          let cost = 0;
          for (const pos of this.playerProps(p.idx)) {
            const h = this.houses[pos];
            if (h === 5) cost += act.perHotel;
            else cost += h * act.perHouse;
          }
          if (cost > 0) {
            this._log(`עלות תיקונים: ${money(cost)}.`, 'tax');
            this._charge(p.idx, cost, null, 'תיקונים', () => this._afterAction(opts));
          } else {
            this._afterAction(opts);
          }
          return;
        }
        case 'getOutOfJail':
          p.jailCards.push({ deck: deckName, card });
          this._afterAction(opts);
          return;
        case 'goToJail':
          this._goToJail(p);
          return;
        case 'moveTo':
          returnCard();
          this._moveTo(p, act.pos, { collectSalary: true });
          return;
        case 'moveBackTo':
          returnCard();
          this._moveTo(p, act.pos, { collectSalary: false });
          return;
        case 'moveSteps':
          returnCard();
          p.pos = (p.pos + act.steps + 40) % 40;
          this._resolveLanding(opts);
          return;
        case 'moveToNearest': {
          // התקדמות לתחנה/חברה הקרובה; אם הנכס בבעלות — שכ"ד מיוחד לפי הקלף:
          // רכבת פי 2 מהשכ"ד הרגיל, חברה פי 10 מסכום הקוביות.
          returnCard();
          let pos = p.pos;
          do { pos = (pos + 1) % 40; } while (this.square(pos).type !== act.kind);
          const from = p.pos;
          p.pos = pos;
          if (pos < from) this._salary(p);
          const sq2 = this.square(pos);
          const ownerIdx = this.owner[pos];
          this._log(`${p.name} ${v(p, 'הגיע', 'הגיעה')} אל "${sq2.name}".`, 'move');
          if (ownerIdx === null) {
            this.pendingBuy = pos;
            this.phase = 'buy';
            this._log(`"${sq2.name}" פנוי לקנייה במחיר ${money(sq2.price)}.`, 'offer');
            return;
          }
          if (ownerIdx !== p.idx && !this.mortgaged[pos]) {
            const diceTotal = this.dice[0] + this.dice[1];
            const rent = act.kind === 'utility'
              ? diceTotal * (act.rentMult || 10)
              : this.rentOf(pos, diceTotal) * (act.rentMult || 1);
            const ownerP = this.players[ownerIdx];
            this._log(`שכר דירה מיוחד: ${p.name} ${v(p, 'משלם', 'משלמת')} ${money(rent)} ל${ownerP.name}.`, 'rent');
            this._charge(p.idx, rent, ownerIdx, `שכר דירה על ${sq2.name}`, () => this._afterAction(opts));
            return;
          }
          this._afterAction(opts);
          return;
        }
        default:
          returnCard();
          this._afterAction(opts);
      }
    }

    /* ---------- כלא ---------- */

    _goToJail(p) {
      p.pos = C.JAIL_POS;
      p.inJail = true;
      p.jailRolls = 0;
      this.doubles = 0;
      this.phase = 'end';
    }

    payJailFine() {
      const p = this.current();
      if (this.phase !== 'roll' || !p.inJail) throw new Error('לא ניתן לשלם קנס עכשיו');
      if (p.money < C.JAIL_FINE) throw new Error('אין מספיק כסף לקנס');
      p.money -= C.JAIL_FINE;
      this.pot += C.JAIL_FINE;
      p.inJail = false;
      p.jailRolls = 0;
      this._log(`${p.name} ${v(p, 'שילם קנס', 'שילמה קנס')} ${money(C.JAIL_FINE)} ${v(p, 'ויצא', 'ויצאה')} מהכלא.`, 'jail');
    }

    useJailCard() {
      const p = this.current();
      if (this.phase !== 'roll' || !p.inJail) throw new Error('לא ניתן להשתמש בכרטיס עכשיו');
      const held = p.jailCards.shift();
      if (!held) throw new Error('אין כרטיס "צא מהכלא"');
      this.decks[held.deck].push(held.card);
      p.inJail = false;
      p.jailRolls = 0;
      this._log(`${p.name} ${v(p, 'השתמש', 'השתמשה')} בכרטיס "צא מהכלא חינם"!`, 'jail');
    }

    /* ---------- בנייה ---------- */

    canBuildOn(idx, pos) {
      const sq = this.square(pos);
      if (sq.type !== 'street' || this.owner[pos] !== idx) return false;
      if (!this.ownsFullGroup(idx, sq.group)) return false;
      const gp = this.groupPositions(sq.group);
      if (gp.some((g) => this.mortgaged[g])) return false;
      const h = this.houses[pos];
      if (h >= 5) return false;
      // בנייה שווה: אסור לעלות מעל המינימום בקבוצה
      const minH = Math.min(...gp.map((g) => this.houses[g]));
      if (h > minH) return false;
      if (h === 4) { if (this.hotelsLeft < 1) return false; }
      else if (this.housesLeft < 1) return false;
      return this.players[idx].money >= GROUPS[sq.group].houseCost;
    }

    buildHouse(pos) {
      const p = this.current();
      if (!['roll', 'end', 'buy'].includes(this.phase)) throw new Error('אי אפשר לבנות עכשיו');
      if (!this.canBuildOn(p.idx, pos)) throw new Error('בנייה לא חוקית כאן');
      const sq = this.square(pos);
      const cost = GROUPS[sq.group].houseCost;
      p.money -= cost;
      this.pot += cost;
      if (this.houses[pos] === 4) {
        this.houses[pos] = 5;
        this.hotelsLeft--;
        this.housesLeft += 4; // 4 הבתים חוזרים לבנק
        this._log(`${p.name} ${v(p, 'בנה', 'בנתה')} מלון 🏨 ב"${sq.name}" (${money(cost)}).`, 'build');
      } else {
        this.houses[pos]++;
        this.housesLeft--;
        this._log(`${p.name} ${v(p, 'בנה', 'בנתה')} בית 🏠 ב"${sq.name}" (${money(cost)}). סה"כ ${this.houses[pos]} בתים.`, 'build');
      }
    }

    canSellHouseOn(idx, pos) {
      const sq = this.square(pos);
      if (sq.type !== 'street' || this.owner[pos] !== idx) return false;
      const h = this.houses[pos];
      if (h === 0) return false;
      const gp = this.groupPositions(sq.group);
      const maxH = Math.max(...gp.map((g) => this.houses[g]));
      return h === maxH;
    }

    sellHouse(pos) {
      const p = this.players[this.owner[pos]];
      if (!this.canSellHouseOn(p.idx, pos)) throw new Error('מכירת בית לא חוקית כאן');
      const sq = this.square(pos);
      const cost = GROUPS[sq.group].houseCost;
      if (this.houses[pos] === 5) {
        if (this.housesLeft >= 4) {
          this.houses[pos] = 4;
          this.hotelsLeft++;
          this.housesLeft -= 4;
          p.money += cost / 2;
          this._log(`${p.name} ${v(p, 'מכר', 'מכרה')} מלון ב"${sq.name}" תמורת ${money(cost / 2)} (נשארו 4 בתים).`, 'build');
        } else {
          // אין בתים במלאי — המלון נמכר כולו (5 יחידות בחצי מחיר)
          this.houses[pos] = 0;
          this.hotelsLeft++;
          p.money += (5 * cost) / 2;
          this._log(`${p.name} ${v(p, 'מכר', 'מכרה')} מלון ב"${sq.name}" בשלמותו תמורת ${money((5 * cost) / 2)}.`, 'build');
        }
      } else {
        this.houses[pos]--;
        this.housesLeft++;
        p.money += cost / 2;
        this._log(`${p.name} ${v(p, 'מכר', 'מכרה')} בית ב"${sq.name}" תמורת ${money(cost / 2)}.`, 'build');
      }
    }

    /* ---------- משכנתא ---------- */

    canMortgage(idx, pos) {
      const sq = this.square(pos);
      if (this.owner[pos] !== idx || this.mortgaged[pos]) return false;
      if (sq.type === 'street') {
        const gp = this.groupPositions(sq.group);
        if (gp.some((g) => this.houses[g] > 0)) return false; // קודם מוכרים את כל הבניינים בעיר
      }
      return true;
    }

    mortgage(pos) {
      const idx = this.owner[pos];
      if (!this.canMortgage(idx, pos)) throw new Error('אי אפשר למשכן נכס זה');
      const sq = this.square(pos);
      this.mortgaged[pos] = true;
      this.players[idx].money += sq.price / 2;
      this._log(`${this.players[idx].name} ${v(this.players[idx], 'משכן את', 'משכנה את')} "${sq.name}" ${v(this.players[idx], 'וקיבל', 'וקיבלה')} ${money(sq.price / 2)} מהבנק.`, 'mortgage');
    }

    unmortgage(pos) {
      const idx = this.owner[pos];
      if (idx === null || !this.mortgaged[pos]) throw new Error('הנכס אינו ממושכן');
      const sq = this.square(pos);
      const cost = Math.round((sq.price / 2) * (1 + C.MORTGAGE_INTEREST));
      const p = this.players[idx];
      if (p.money < cost) throw new Error('אין מספיק כסף לפדיון');
      p.money -= cost;
      this.pot += cost;
      this.mortgaged[pos] = false;
      this._log(`${p.name} ${v(p, 'פדה', 'פדתה')} את "${sq.name}" מהמשכנתא תמורת ${money(cost)} (כולל 10% ריבית).`, 'mortgage');
    }

    /* ---------- מסחר ---------- */

    canTradeProp(idx, pos) {
      const sq = this.square(pos);
      if (this.owner[pos] !== idx) return false;
      if (sq.type === 'street') {
        const gp = this.groupPositions(sq.group);
        if (gp.some((g) => this.houses[g] > 0)) return false; // אין למכור רחוב מעיר עם בניינים
      }
      return true;
    }

    executeTrade(aIdx, bIdx, { propsA = [], propsB = [], moneyA = 0, moneyB = 0 } = {}) {
      const A = this.players[aIdx], B = this.players[bIdx];
      for (const pos of propsA) if (!this.canTradeProp(aIdx, pos)) throw new Error('נכס לא סחיר בהצעה');
      for (const pos of propsB) if (!this.canTradeProp(bIdx, pos)) throw new Error('נכס לא סחיר בהצעה');
      if (A.money < moneyA || B.money < moneyB) throw new Error('אין כיסוי כספי לעסקה');

      A.money -= moneyA; B.money += moneyA;
      B.money -= moneyB; A.money += moneyB;
      for (const pos of propsA) this._transferProp(pos, bIdx);
      for (const pos of propsB) this._transferProp(pos, aIdx);
      this._log(`עסקה בין ${A.name} ל${B.name} הושלמה! 🤝`, 'trade');
    }

    // העברת נכס (מסחר/פשיטת רגל). נכס ממושכן: המקבל משלם מיד 10% ריבית לבנק.
    _transferProp(pos, toIdx) {
      this.owner[pos] = toIdx;
      if (this.mortgaged[pos]) {
        const fee = Math.round((this.square(pos).price / 2) * C.MORTGAGE_INTEREST);
        const to = this.players[toIdx];
        const paid = Math.min(fee, to.money);
        to.money -= paid;
        this._log(`"${this.square(pos).name}" ממושכן — ${to.name} ${v(to, 'משלם', 'משלמת')} ${money(paid)} ריבית לבנק.`, 'mortgage');
      }
    }

    /* ---------- תשלומים, חוב ופשיטת רגל ---------- */

    // מחייב שחקן; אם אין כסף — נכנסים לשלב 'debt' עד גיוס הכסף או פשיטת רגל.
    // cont: תיאור ההמשך בצורה שניתנת לשמירה (לשחזור משחק מהדפדפן).
    _charge(idx, amount, creditorIdx, reason, onPaid, cont) {
      const p = this.players[idx];
      if (p.money >= amount) {
        p.money -= amount;
        if (creditorIdx !== null) this.players[creditorIdx].money += amount;
        else this.pot += amount;
        if (onPaid) onPaid();
        return;
      }
      this.debt = { debtor: idx, creditor: creditorIdx, amount, reason, onPaid, cont: cont || { kind: 'afterAction' } };
      this.phase = 'debt';
      this._log(`ל${p.name} אין מספיק כסף לשלם ${money(amount)} (${reason}). צריך לגייס כסף!`, 'debt');
    }

    settleDebt() {
      if (this.phase !== 'debt') throw new Error('אין חוב פתוח');
      const d = this.debt;
      const p = this.players[d.debtor];
      if (p.money < d.amount) throw new Error('עדיין אין מספיק כסף');
      p.money -= d.amount;
      if (d.creditor !== null) this.players[d.creditor].money += d.amount;
      else this.pot += d.amount;
      this.debt = null;
      this._log(`${p.name} ${v(p, 'שילם', 'שילמה')} את החוב (${money(d.amount)}).`, 'money');
      this.phase = 'end';
      if (d.onPaid) d.onPaid();
      else if (d.cont && d.cont.kind === 'jailMove') this._move(p, d.cont.total, { noExtraRoll: true });
      else this._afterAction();
    }

    canAffordDebt() {
      if (!this.debt) return true;
      return this.liquidationValue(this.debt.debtor) >= this.debt.amount;
    }

    declareBankruptcy() {
      if (this.phase !== 'debt') throw new Error('אין חוב פתוח');
      const d = this.debt;
      const p = this.players[d.debtor];
      this._log(`${p.name} ${v(p, 'פשט', 'פשטה')} רגל! 💥`, 'bankrupt');

      // מוכרים את כל הבניינים לבנק (חצי מחיר) — הכסף נכנס לקופת החייב
      for (const pos of this.playerProps(p.idx)) {
        while (this.houses[pos] > 0) this.sellHouse(pos);
      }

      if (d.creditor !== null) {
        const creditor = this.players[d.creditor];
        creditor.money += p.money;
        for (const held of p.jailCards) creditor.jailCards.push(held);
        for (const pos of this.playerProps(p.idx)) this._transferProp(pos, d.creditor);
        this._log(`כל הרכוש והכסף של ${p.name} עוברים ל${creditor.name}.`, 'bankrupt');
      } else {
        // חוב לבנק: הנכסים חוזרים לבנק ויוצאים למכירה פומבית
        for (const held of p.jailCards) this.decks[held.deck].push(held.card);
        for (const pos of this.playerProps(p.idx)) {
          this.owner[pos] = null;
          this.mortgaged[pos] = false;
          this.auctionQueue.push(pos);
        }
        this._log(`נכסי ${p.name} חוזרים לבנק ויוצאים למכירה פומבית.`, 'bankrupt');
      }
      p.money = 0;
      p.jailCards = [];
      p.bankrupt = true;
      this.debt = null;

      const alive = this.alive();
      if (alive.length === 1) {
        this.winner = alive[0].idx;
        this.phase = 'gameover';
        this._log(`🏆 ${alive[0].name} ${v(alive[0], 'ניצח', 'ניצחה')} במשחק! 🏆`, 'win');
        return;
      }
      // _afterAction מטפל גם בתור המכירות הפומביות וגם בהעברת התור הלאה
      this._afterAction();
    }

    /* ---------- תורות ---------- */

    endTurn() {
      if (this.phase !== 'end') throw new Error('אי אפשר לסיים תור עכשיו');
      this._advanceTurn();
    }

    _advanceTurn() {
      if (this.phase === 'gameover') return;
      this.doubles = 0;
      do {
        this.turn = (this.turn + 1) % this.players.length;
      } while (this.current().bankrupt);
      this.phase = 'roll';
      this._log(`התור של ${this.current().name}.`, 'turn');
    }

    /* ---------- שמירה ושחזור ---------- */

    toJSON() {
      return {
        v: 1,
        playersSpec: this.players.map((p) => ({ name: p.name, token: p.token, isAI: p.isAI, gender: p.gender })),
        players: this.players.map((p) => ({
          ...p,
          jailCards: p.jailCards.map((h) => ({ deck: h.deck, id: h.card.id })),
        })),
        owner: this.owner,
        houses: this.houses,
        mortgaged: this.mortgaged,
        housesLeft: this.housesLeft,
        hotelsLeft: this.hotelsLeft,
        pot: this.pot,
        decks: {
          chance: this.decks.chance.map((c) => c.id),
          chest: this.decks.chest.map((c) => c.id),
        },
        turn: this.turn,
        phase: this.phase,
        dice: this.dice,
        doubles: this.doubles,
        pendingBuy: this.pendingBuy,
        auction: this.auction,
        auctionQueue: this.auctionQueue,
        winner: this.winner,
        debt: this.debt
          ? { debtor: this.debt.debtor, creditor: this.debt.creditor, amount: this.debt.amount, reason: this.debt.reason, cont: this.debt.cont }
          : null,
        log: this.log.slice(-120),
        logSeq: this._logSeq,
      };
    }

    static restore(data) {
      const cardById = (deck, id) =>
        (deck === 'chance' ? D.CHANCE_CARDS : D.CHEST_CARDS).find((c) => c.id === id);
      const g = new Game(data.playersSpec);
      g.players = data.players.map((p) => ({
        ...p,
        jailCards: (p.jailCards || []).map((h) => ({ deck: h.deck, card: cardById(h.deck, h.id) })),
      }));
      g.owner = data.owner;
      g.houses = data.houses;
      g.mortgaged = data.mortgaged;
      g.housesLeft = data.housesLeft;
      g.hotelsLeft = data.hotelsLeft;
      g.pot = data.pot || 0;
      g.decks = {
        chance: data.decks.chance.map((id) => cardById('chance', id)),
        chest: data.decks.chest.map((id) => cardById('chest', id)),
      };
      g.turn = data.turn;
      g.phase = data.phase;
      g.dice = data.dice;
      g.doubles = data.doubles;
      g.pendingBuy = data.pendingBuy;
      g.auction = data.auction;
      g.auctionQueue = data.auctionQueue || [];
      g.winner = data.winner;
      g.debt = data.debt ? { ...data.debt, onPaid: null } : null;
      g.log = data.log || [];
      g._logSeq = data.logSeq || 0;
      return g;
    }
  }

  globalThis.MonopolyEngine = { Game };
})();
