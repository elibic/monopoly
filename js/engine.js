/* מנוע המשחק — לוגיקה טהורה, בלי DOM.
 * ממומש לפי חוברת ההוראות המקורית (קודקוד/Hasbro 2004):
 * מכירה פומבית, בנייה שווה, מלאי בניינים, משכנתא + 10% ריבית,
 * כלא (קנס/דאבל/כרטיס), דאבל שלישי, פשיטת רגל.
 */
(function () {
  'use strict';

  const D = globalThis.MONOPOLY_DATA;
  const { CONSTANTS: C, BOARD, GROUPS, RAIL_RENTS, FINANCE: F } = D;

  // מצב חינוך פיננסי: כל הסכומים בשקלים שלמים — עיגול בכל חישוב תשואה.
  const emptyInvest = () => ({
    savings: 0,
    deposit: 0,
    stocks: Object.fromEntries(F.COMPANIES.map((c) => [c.id, 0])),
    // basis = ההפקדה המקורית של כל אחזקה: עולה בהפקדה, מתאפסת במשיכה,
    // ולא מושפעת מתנועות השוק ומדמי הניהול — כדי להראות "כמה שמתי" מול "כמה שווה".
    basis: { savings: 0, deposit: 0, stocks: Object.fromEntries(F.COMPANIES.map((c) => [c.id, 0])) },
    totalIn: 0,   // כמה הופקד בסך הכול (להצגת רווח)
    totalOut: 0,  // כמה נמשך בסך הכול
    crash: null,  // {co, val} — נפילה שעוד לא התאוששה (למדבקת "ידיים של יהלום")
    crashSurvived: false,
  });

  // מונים לסיכום שבסוף המשחק: מה הילד באמת עשה לאורך המשחק
  const emptyStats = () => ({
    transfers: 0,       // כמה העברות ביצע בעצמו
    paid: 0,            // כמה שילם בסך הכול
    biggestPay: 0,      // התשלום הגדול ביותר
    collections: 0,     // כמה פעמים גבה כסף
    collected: 0,       // כמה גבה בסך הכול
    biggestCollect: 0,  // הגבייה הגדולה ביותר
    housesBuilt: 0,     // בתים שנבנו
    hotelsBuilt: 0,     // מלונות שנבנו
    bought: 0,          // נכסים שנקנו
    salary: 0,          // משכורות מ"דרך צלחה"
    mathWrong: 0,       // כמה פעמים הסכום שהוקלד לא היה מדויק
  });

  // בנק מונופול: הון משלו, תיק השקעות משלו, והכנסות מדמי ניהול.
  // זה מה שמאפשר להראות לילד "במה הבנק משקיע וכמה הוא מרוויח".
  const emptyBank = () => ({
    cash: F.BANK_START,
    invest: { deposit: 0, stocks: Object.fromEntries(F.COMPANIES.map((c) => [c.id, 0])) },
    fees: 0,      // דמי ניהול שנגבו מהשחקנים
    profit: 0,    // רווח מצטבר מהשקעות הבנק
    salaries: 0,  // משכורות ששולמו
    loans: 0,     // כסף שהבנק נתן במשכנתאות
  });

  const emptyMarket = () => ({
    round: 0,
    trend: Object.fromEntries(F.COMPANIES.map((c) => [c.id, [100]])), // מסלול מחירים לגרף
    report: null, // דוח הסבב האחרון — מה קרה לכל אחזקה ולמה
  });

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
      this.auctionsEnabled = opts.auctions !== false; // מכירה פומבית בוויתור על קנייה
      this.potEnabled = opts.pot !== false; // קופה בחניה חופשית (חוק בית)
      this.financeEnabled = opts.finance === true; // מצב חינוך פיננסי — כבוי אלא אם בחרו בו
      this.marketQueue = (opts.marketQueue || []).slice(); // עדכוני שוק כפויים לבדיקות
      this.difficulty = opts.difficulty || 'medium'; // easy | medium | hard — רמת הבוט
      // העברות ידניות: הילד מבצע כל תשלום בעצמו במקום שהבנק יגבה לבד.
      // ברירת המחדל של המנוע היא החוקים הקלאסיים (גבייה אוטומטית);
      // המשחק עצמו מדליק את המצב הזה במסך הפתיחה.
      this.manualPay = opts.manualPay === true;

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
        invest: emptyInvest(),
        stats: emptyStats(),
      }));

      this.owner = new Array(40).fill(null);     // idx של שחקן או null (בנק)
      this.houses = new Array(40).fill(0);       // 0-4 בתים, 5 = מלון
      this.mortgaged = new Array(40).fill(false);
      this.housesLeft = C.TOTAL_HOUSES;
      this.hotelsLeft = C.TOTAL_HOTELS;
      this.pot = 0; // הקופה: כל תשלום לבנק נכנס אליה, מי שנוחת בחניה חופשית זוכה
      this.market = emptyMarket(); // מצב חינוך פיננסי: שוק אחד משותף לכל השחקנים
      this.bank = emptyBank();     // קופת בנק מונופול — נפרדת מקופת הקנסות ומהבורסה

      this.decks = {
        chance: shuffle(D.CHANCE_CARDS, this.rand),
        chest: shuffle(D.CHEST_CARDS, this.rand),
      };

      this.turn = 0;
      this.phase = 'roll'; // roll | buy | auction | pay | collect | debt | end | gameover
      this.dice = [0, 0];
      this.doubles = 0;
      this.pendingBuy = null;   // pos
      this.auction = null;      // {pos, currentBid, highBidder, active:[idx], ptr}
      this.auctionQueue = [];   // מכירות פומביות שממתינות (פשיטת רגל לבנק)
      this.debt = null;         // {debtor, creditor|null, amount, reason}
      this.pendingPay = null;     // {payer, creditor|null, amount, reason} — העברה שממתינה לילד
      this.pendingCollect = null; // {payee, payer, amount, reason} — כסף שממתין לגבייה
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
      const gp = this.groupPositions(group);
      // הגנה: קבוצה לא מוכרת מחזירה רשימה ריקה, ו-every על רשימה ריקה הוא true.
      // בלי השורה הזאת "אין עיר" היה נחשב "כל העיר שלך".
      if (!gp.length) return false;
      return gp.every((p) => this.owner[p] === idx);
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

    // כמה כסף שחקן מסוגל לגייס בסך הכול (מזומן + השקעות + מכירת בניינים + משכנתאות)
    liquidationValue(idx) {
      let total = this.players[idx].money + this.investTotal(idx);
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
      let total = this.players[idx].money + this.investTotal(idx);
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

    /* ---------- מצב חינוך פיננסי: השקעות ושוק ----------
     * הכסף המושקע נשמר לכל שחקן ב-p.invest, בשקלים שלמים.
     * הפקדה ומשיכה מזיזות כסף ישירות ולא דרך _charge — כדי שההשקעה
     * לא תיכנס לקופת החניה החופשית. */

    _holding(p, track, co) {
      return track === 'stocks' ? p.invest.stocks[co] : p.invest[track];
    }

    _setHolding(p, track, co, val) {
      if (track === 'stocks') p.invest.stocks[co] = val;
      else p.invest[track] = val;
    }

    _basis(p, track, co) {
      const b = p.invest.basis;
      if (!b) return 0;
      return track === 'stocks' ? (b.stocks[co] || 0) : (b[track] || 0);
    }

    _setBasis(p, track, co, val) {
      const b = p.invest.basis;
      if (!b) return;
      if (track === 'stocks') b.stocks[co] = val;
      else b[track] = val;
    }

    // שם קריא לילד: "קופת חיסכון" / "מפעל הגלידה"
    _holdingName(track, co) {
      if (track === 'stocks') {
        const c = F.COMPANIES.find((x) => x.id === co);
        return c ? `${c.emoji} ${c.name}` : 'מניות';
      }
      const t = F.TRACKS[track];
      return `${t.emoji} ${t.name}`;
    }

    /* שלוש קופות נפרדות במשחק:
     *   this.pot   — קופת הקנסות והתשלומים (חוק בית: זוכים בה בחניה חופשית)
     *   this.bank  — קופת בנק מונופול: ההון שלו, ההשקעות שלו וההכנסות שלו
     *   marketPool — קופת הבורסה הציבורית: כל הכסף שמושקע, של כולם יחד */

    _bankPay(amount, kind) {
      this.bank.cash -= amount;
      if (kind && this.bank[kind] !== undefined) this.bank[kind] += amount;
    }

    // תשלום לבנק: בחוק הבית הוא מגיע לקופת הקנסות, אחרת אל הבנק עצמו
    _toBankOrPot(amount) {
      if (this.potEnabled) this.pot += amount;
      else this.bank.cash += amount;
    }

    bankInvested() {
      const inv = this.bank.invest;
      let total = inv.deposit;
      for (const c of F.COMPANIES) total += inv.stocks[c.id] || 0;
      return total;
    }

    bankTotal() { return this.bank.cash + this.bankInvested(); }

    // כל הכסף שמושקע בבורסה — של כל השחקנים ושל הבנק יחד
    marketPool() {
      let total = this.bankInvested();
      for (const p of this.players) if (!p.bankrupt) total += this.investTotal(p.idx);
      return total;
    }

    investTotal(idx) {
      const inv = this.players[idx].invest;
      if (!inv) return 0;
      let total = inv.savings + inv.deposit;
      for (const c of F.COMPANIES) total += inv.stocks[c.id] || 0;
      return total;
    }

    // רווח/הפסד מצטבר מהשקעות (כולל מה שכבר נמשך)
    investProfit(idx) {
      const inv = this.players[idx].invest;
      if (!inv) return 0;
      return inv.totalOut + this.investTotal(idx) - inv.totalIn;
    }

    // כל האחזקות הפעילות של שחקן: [{track, co, value, name}]
    holdings(idx) {
      const p = this.players[idx];
      const res = [];
      if (!p.invest) return res;
      for (const track of ['savings', 'deposit']) {
        if (p.invest[track] > 0) {
          res.push({ track, co: null, value: p.invest[track], basis: this._basis(p, track, null), name: this._holdingName(track, null) });
        }
      }
      for (const c of F.COMPANIES) {
        const val = p.invest.stocks[c.id] || 0;
        if (val > 0) res.push({ track: 'stocks', co: c.id, value: val, basis: this._basis(p, 'stocks', c.id), name: this._holdingName('stocks', c.id) });
      }
      return res;
    }

    invest(idx, track, co, amount) {
      if (!this.financeEnabled) throw new Error('מצב חינוך פיננסי כבוי');
      if (idx !== this.turn) throw new Error('אפשר להשקיע רק בתור שלך');
      if (this.phase !== 'roll' && this.phase !== 'end') throw new Error('אי אפשר להשקיע עכשיו');
      if (!F.TRACKS[track]) throw new Error('מסלול לא מוכר');
      if (track === 'stocks' && !F.COMPANIES.some((c) => c.id === co)) throw new Error('חברה לא מוכרת');
      if (!Number.isInteger(amount) || amount <= 0) throw new Error('סכום לא תקין');
      const p = this.players[idx];
      if (p.money < amount) throw new Error('אין מספיק כסף בחשבון');

      p.money -= amount;
      this._setHolding(p, track, co, this._holding(p, track, co) + amount);
      this._setBasis(p, track, co, this._basis(p, track, co) + amount);
      p.invest.totalIn += amount;
      this._log(`🏦 ${p.name} ${v(p, 'השקיע', 'השקיעה')} ${money(amount)} ב${this._holdingName(track, co)}.`,
        'invest', { pIdx: idx, track, co, amount });
    }

    // משיכה מלאה של אחזקה אחת — גם בשלב חוב, כדי שאפשר יהיה לשלם
    withdraw(idx, track, co) {
      if (!this.financeEnabled) throw new Error('מצב חינוך פיננסי כבוי');
      const inDebt = this.phase === 'debt' && this.debt && this.debt.debtor === idx;
      const ownTurn = idx === this.turn && (this.phase === 'roll' || this.phase === 'end');
      if (!inDebt && !ownTurn) throw new Error('אפשר למשוך רק בתור שלך');
      const p = this.players[idx];
      const val = this._holding(p, track, co);
      if (!val) throw new Error('אין מה למשוך');

      this._setHolding(p, track, co, 0);
      this._setBasis(p, track, co, 0);
      p.money += val;
      p.invest.totalOut += val;
      if (p.invest.crash && p.invest.crash.co === co) p.invest.crash = null; // ויתר על ההמתנה להתאוששות
      this._log(`🏦 ${p.name} ${v(p, 'משך', 'משכה')} ${money(val)} מ${this._holdingName(track, co)}.`,
        'withdraw', { pIdx: idx, track, co, amount: val });
      return val;
    }

    // בחירת כפולה מתוך טבלת הסתברויות (סכום ההסתברויות = 1)
    _drawMult(table) {
      let r = this.rand();
      for (const row of table) {
        r -= row.p;
        if (r <= 0) return row.m;
      }
      return table[table.length - 1].m;
    }

    /* עדכון השוק — פעם בסבב מלא.
     * סדר ההגרלות קבוע ומתועד כדי שהמשחק יהיה דטרמיניסטי עם אותו זרע:
     *   1) האם יש חדשות  2) איזו חברה  3) איזה אירוע
     *   4) כפולה לכל חברה לפי סדר COMPANIES (חברת החדשות לא מגרילה)
     *   5) כפולה לפיקדון
     * marketQueue (לבדיקות) עוקף את כל ההגרלות. */
    _marketTick() {
      const forced = this.marketQueue.length ? this.marketQueue.shift() : null;
      let news = null;
      let depositMult;
      const mults = {};

      if (forced) {
        news = forced.news ? F.NEWS.find((n) => n.id === forced.news.id) || null : null;
        for (const c of F.COMPANIES) mults[c.id] = forced.mults && forced.mults[c.id] !== undefined ? forced.mults[c.id] : 1;
        if (news) mults[news.co] = news.m;
        depositMult = forced.deposit !== undefined ? forced.deposit : 1;
      } else {
        if (this.rand() < F.NEWS_CHANCE) {
          const co = F.COMPANIES[Math.floor(this.rand() * F.COMPANIES.length)].id;
          const pool = F.NEWS.filter((n) => n.co === co);
          news = pool[Math.floor(this.rand() * pool.length)];
        }
        for (const c of F.COMPANIES) {
          mults[c.id] = news && news.co === c.id ? news.m : this._drawMult(F.TRACKS.stocks.table);
        }
        depositMult = this._drawMult(F.TRACKS.deposit.table);
      }

      this.market.round += 1;
      const round = this.market.round;

      // קודם הסיפור, אחר כך מה שהוא עשה לכסף
      if (news) {
        const co = F.COMPANIES.find((c) => c.id === news.co);
        this._log(`📰 חדשות מהבורסה: ${news.text} (${co.emoji} ${co.name})`, 'market_news', { newsId: news.id, co: news.co });
      }

      // מסלול המחירים לגרף המגמה
      for (const c of F.COMPANIES) {
        const arr = this.market.trend[c.id];
        arr.push(Math.max(F.FLOOR, Math.round(arr[arr.length - 1] * mults[c.id])));
        if (arr.length > 13) arr.shift();
      }

      const report = {
        round,
        news: news ? { id: news.id, co: news.co, m: news.m, text: news.text } : null,
        entries: [], totals: {}, fees: {},
        bank: { profit: 0, fees: 0 },
      };

      for (const p of this.players) {
        if (p.bankrupt || !p.invest) continue;
        let sum = 0;

        for (const h of this.holdings(p.idx)) {
          const oldVal = h.value;
          let newVal;
          let reason;

          if (h.track === 'savings') {
            newVal = oldVal + Math.max(1, Math.round(oldVal * F.TRACKS.savings.rate));
            reason = F.REASONS.savings;
          } else if (h.track === 'deposit') {
            newVal = Math.max(F.FLOOR, Math.round(oldVal * depositMult));
            reason = depositMult > 1 ? F.REASONS.deposit.up : depositMult < 1 ? F.REASONS.deposit.down : F.REASONS.deposit.flat;
          } else {
            const m = mults[h.co];
            newVal = Math.max(F.FLOOR, Math.round(oldVal * m));
            if (news && news.co === h.co) {
              reason = news.text;
            } else if (m > 1) {
              const pool = F.REASONS[h.co].up;
              reason = pool[round % pool.length];
            } else if (m < 1) {
              const pool = F.REASONS[h.co].down;
              reason = pool[round % pool.length];
            } else {
              reason = F.REASONS.flat;
            }
          }

          this._setHolding(p, h.track, h.co, newVal);
          const delta = newVal - oldVal;
          sum += delta;
          report.entries.push({
            idx: p.idx, track: h.track, co: h.co, name: h.name, reason,
            oldVal, newVal, delta,
            pct: oldVal ? Math.round((delta / oldVal) * 100) : 0,
          });

          // מעקב "ידיים של יהלום": החזיק מניה דרך נפילה גדולה עד שהתאוששה
          if (h.track === 'stocks') {
            if (news && news.co === h.co && news.m < 1 && !p.invest.crash) {
              p.invest.crash = { co: h.co, val: oldVal };
            } else if (p.invest.crash && p.invest.crash.co === h.co && newVal >= p.invest.crash.val) {
              p.invest.crashSurvived = true;
              p.invest.crash = null;
            }
          }
        }

        // דמי ניהול: הבנק גובה אחוז קטן על פיקדון ומניות (בקופת החיסכון אין עמלה)
        const managed = p.invest.deposit + F.COMPANIES.reduce((t, c) => t + p.invest.stocks[c.id], 0);
        // מתחת ל-100 ש"ח מנוהלים אין עמלה בכלל — כלל פשוט וברור לילד
        const fee = Math.floor(managed * F.FEE_RATE);
        if (fee > 0) {
          let left = fee;
          const feeable = this.holdings(p.idx)
            .filter((h) => h.track !== 'savings')
            .sort((a, b) => b.value - a.value); // גובים מהאחזקה הגדולה קודם
          for (const h of feeable) {
            if (left <= 0) break;
            const cur = this._holding(p, h.track, h.co);
            const take = Math.min(left, Math.max(0, cur - F.FLOOR));
            if (take > 0) { this._setHolding(p, h.track, h.co, cur - take); left -= take; }
          }
          const taken = fee - left;
          if (taken > 0) {
            this.bank.cash += taken;
            this.bank.fees += taken;
            report.fees[p.idx] = taken;
            report.bank.fees += taken;
            sum -= taken;
          }
        }

        report.totals[p.idx] = sum;
        if (this.holdings(p.idx).length) {
          const word = sum > 0 ? 'גדלו' : sum < 0 ? 'ירדו' : 'נשארו כמו שהיו';
          const tail = sum === 0 ? '' : ` ב-${money(Math.abs(sum))}`;
          this._log(`📊 עדכון שוק: ההשקעות של ${p.name} ${word}${tail}.`, 'market', { pIdx: p.idx, delta: sum });
        }
      }

      // הבנק משקיע חלק מההון שלו באותו שוק — ככה הילד רואה שגם הבנק מרוויח מהכסף
      const bInv = this.bank.invest;
      let bankBefore = this.bankInvested();
      bInv.deposit = Math.max(0, Math.round(bInv.deposit * depositMult));
      for (const c of F.COMPANIES) bInv.stocks[c.id] = Math.max(0, Math.round(bInv.stocks[c.id] * mults[c.id]));
      const bankGain = this.bankInvested() - bankBefore;
      this.bank.profit += bankGain;
      report.bank.profit = bankGain;

      // איזון: הבנק שומר חלק קבוע מההון שלו מושקע (חצי בפיקדון, חצי מפוזר במניות)
      const target = Math.round(this.bankTotal() * F.BANK_INVEST_SHARE);
      const move = target - this.bankInvested();
      if (move > 0 && this.bank.cash >= move) {
        this.bank.cash -= move;
        const half = Math.round(move / 2);
        bInv.deposit += half;
        const per = Math.round((move - half) / F.COMPANIES.length);
        for (const c of F.COMPANIES) bInv.stocks[c.id] += per;
      }

      this.market.report = report;
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
      p.stats.salary += C.GO_SALARY;
      this._bankPay(C.GO_SALARY, 'salaries');
      this._log(`${p.name} ${v(p, 'עבר ב"דרך צלחה" וקיבל', 'עברה ב"דרך צלחה" וקיבלה')} משכורת ${money(C.GO_SALARY)}!`, 'money');
    }

    _resolveLanding(opts = {}) {
      const p = this.current();
      const sq = this.square(p.pos);
      this._log(`${p.name} ${v(p, 'הגיע', 'הגיעה')} אל "${sq.name}".`, 'move', { pIdx: p.idx, pos: p.pos });

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
            }
            // מנוחה בחניה: התור נגמר כאן בכל מקרה — גם כשזוכים בקופה
            // וגם אחרי דאבל (אין הטלה נוספת).
            this._log(`🅿️ חניה חופשית — ${p.name} ${v(p, 'נח', 'נחה')} ו${v(p, 'מפסיד', 'מפסידה')} את התור${this.doubles > 0 ? ' (גם אחרי דאבל)' : ''}.`, 'park');
            return this._afterAction({ ...opts, noExtraRoll: true });
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
      this._toBankOrPot(sq.price);
      this.owner[pos] = p.idx;
      p.stats.bought += 1;
      this.pendingBuy = null;
      this._log(`${p.name} ${v(p, 'קנה', 'קנתה')} את "${sq.name}" ב-${money(sq.price)}! 🎉`, 'buy');
      this._afterAction();
    }

    declineBuy() {
      if (this.phase !== 'buy') throw new Error('אין נכס ממתין לקנייה');
      const pos = this.pendingBuy;
      this.pendingBuy = null;
      if (!this.auctionsEnabled) {
        // מצב מפושט לילדים: מוותרים → הנכס נשאר פנוי, בלי מכירה פומבית
        this._log(`ויתרת על "${this.square(pos).name}" — הוא נשאר פנוי.`, 'info');
        return this._afterAction();
      }
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
      // מי שוויתר על הקנייה לא פותח את המכירה — השחקן הבא מציע ראשון,
      // והמוותר מגיב להצעה שלו. ככה זה גם הוגן וגם ברור יותר לילד.
      const declined = this.auction.active.indexOf(this.turn);
      this.auction.ptr = declined < 0 ? 0 : (declined + 1) % this.auction.active.length;
      this.auction.opener = this.auction.active[this.auction.ptr];
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
        this._toBankOrPot(a.currentBid);
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
          this._log(`${p.name} ${v(p, 'הגיע', 'הגיעה')} אל "${sq2.name}".`, 'move', { pIdx: p.idx, pos: p.pos });
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
      this._log(`${p.name} ${v(p, 'נכנס', 'נכנסה')} לבית הכלא.`, 'move', { pIdx: p.idx, pos: C.JAIL_POS });
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
      this._toBankOrPot(C.JAIL_FINE);
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
      // חוק בית: בונים רק כשהחייל נמצא בעיר הזאת — הגעת לעיר שלך? אפשר לבנות בה
      if (!gp.includes(this.players[idx].pos)) return false;
      if (gp.some((g) => this.mortgaged[g])) return false;
      const h = this.houses[pos];
      if (h >= 5) return false;
      // בנייה שווה: אסור להקדים רחוב אחד בעיר ביותר מבית אחד על פני הנמוך שבהם.
      // בלי זה אפשר היה להעמיד מלון ברחוב אחד בזמן שהשאר ריקים.
      if (h > Math.min(...gp.map((g) => this.houses[g]))) return false;
      if (h === 4) { if (this.hotelsLeft < 1) return false; }
      else if (this.housesLeft < 1) return false;
      return this.players[idx].money >= GROUPS[sq.group].houseCost;
    }

    // כל הרחובות שמותר לשחקן לבנות בהם עכשיו — לפי סדר הבנייה השווה
    buildablePositions(idx) {
      return this.playerProps(idx).filter((pos) => this.canBuildOn(idx, pos));
    }

    buildHouse(pos) {
      const p = this.current();
      if (!['roll', 'end', 'buy'].includes(this.phase)) throw new Error('אי אפשר לבנות עכשיו');
      if (!this.canBuildOn(p.idx, pos)) throw new Error('בנייה לא חוקית כאן');
      const sq = this.square(pos);
      const cost = GROUPS[sq.group].houseCost;
      p.money -= cost;
      this._toBankOrPot(cost);
      if (this.houses[pos] === 4) {
        this.houses[pos] = 5;
        this.hotelsLeft--;
        p.stats.hotelsBuilt += 1;
        this.housesLeft += 4; // 4 הבתים חוזרים לבנק
        this._log(`${p.name} ${v(p, 'בנה', 'בנתה')} מלון 🏨 ב"${sq.name}" (${money(cost)}).`, 'build');
      } else {
        this.houses[pos]++;
        this.housesLeft--;
        p.stats.housesBuilt += 1;
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
      this._toBankOrPot(cost);
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
        // העברה ידנית: הכסף לא זז לבד — הילד מבצע את ההעברה בעצמו.
        // הבוטים תמיד משלמים אוטומטית, אחרת המשחק היה נתקע.
        if (this.manualPay && !p.isAI && amount > 0) {
          this.pendingPay = { payer: idx, creditor: creditorIdx, amount, reason, onPaid, cont: cont || { kind: 'afterAction' } };
          this.phase = 'pay';
          this._log(`💳 ${p.name} ${v(p, 'צריך', 'צריכה')} להעביר ${money(amount)} — ${reason}.`, 'pay');
          return;
        }
        p.money -= amount;
        const d = { onPaid, cont: cont || { kind: 'afterAction' } };
        if (this._deliver(amount, creditorIdx, reason, d, idx)) return; // ממתינים לגבייה
        if (onPaid) onPaid();
        return;
      }
      this.debt = { debtor: idx, creditor: creditorIdx, amount, reason, onPaid, cont: cont || { kind: 'afterAction' } };
      this.phase = 'debt';
      this._log(`ל${p.name} אין מספיק כסף לשלם ${money(amount)} (${reason}). צריך לגייס כסף!`, 'debt');
    }

    // הכסף שמגיע לשחקן שיושב מול המסך לא נכנס לבד — הוא גובה אותו בעצמו.
    // מחזיר true אם נכנסנו לשלב גבייה, ואז ההמשך ימתין ל-collectMoney.
    _deliver(amount, creditorIdx, reason, d, payerIdx) {
      if (creditorIdx === null) { this._toBankOrPot(amount); return false; }
      const c = this.players[creditorIdx];
      if (this.manualPay && !c.isAI && !c.bankrupt && amount > 0) {
        this.pendingCollect = { payee: creditorIdx, payer: payerIdx, amount, reason, onPaid: d.onPaid, cont: d.cont };
        this.phase = 'collect';
        this._log(`💰 מגיע ל${c.name} ${money(amount)} — ${reason}. צריך לגבות!`, 'collect');
        return true;
      }
      c.money += amount;
      return false;
    }

    // הגבייה שהילד מבצע: רק עכשיו הכסף נכנס לחשבון שלו
    collectMoney() {
      if (this.phase !== 'collect' || !this.pendingCollect) throw new Error('אין כסף שממתין לגבייה');
      const c = this.pendingCollect;
      const p = this.players[c.payee];
      p.money += c.amount;
      p.stats.collected += c.amount;
      p.stats.collections += 1;
      if (c.amount > p.stats.biggestCollect) p.stats.biggestCollect = c.amount;
      this.pendingCollect = null;
      this._log(`✅ ${p.name} ${v(p, 'גבה', 'גבתה')} ${money(c.amount)}!`, 'money');
      this._resumeAfterPayment(c, c.payer);
    }

    // המשך הריצה אחרי שתשלום הושלם — משותף להעברה ידנית ולסגירת חוב
    _resumeAfterPayment(d, payerIdx) {
      this.phase = 'end';
      if (d.onPaid) d.onPaid();
      else if (d.cont && d.cont.kind === 'jailMove') {
        this._move(this.players[payerIdx], d.cont.total, { noExtraRoll: true });
      } else this._afterAction();
    }

    // ההעברה שהילד מבצע. typed הוא הסכום שהוקלד — חייב להיות מדויק.
    // בלי typed (למשל בבוט או במשחק מרחוק) מאשרים בלחיצה בלבד.
    confirmPayment(typed) {
      if (this.phase !== 'pay' || !this.pendingPay) throw new Error('אין העברה שממתינה');
      const d = this.pendingPay;
      if (typed !== undefined && typed !== null && Number(typed) !== d.amount) {
        throw new Error(`הסכום לא מדויק — צריך להעביר בדיוק ${money(d.amount)}`);
      }
      const p = this.players[d.payer];
      if (p.money < d.amount) {
        // הגנה: אם משהו שינה את היתרה בינתיים, עוברים למסלול גיוס הכסף
        this.pendingPay = null;
        this.debt = { debtor: d.payer, creditor: d.creditor, amount: d.amount, reason: d.reason, onPaid: d.onPaid, cont: d.cont };
        this.phase = 'debt';
        this._log(`ל${p.name} אין מספיק כסף לשלם ${money(d.amount)} (${d.reason}). צריך לגייס כסף!`, 'debt');
        return;
      }
      p.money -= d.amount;
      p.stats.paid += d.amount;
      p.stats.transfers += 1;
      if (d.amount > p.stats.biggestPay) p.stats.biggestPay = d.amount;
      this.pendingPay = null;
      const to = d.creditor !== null ? this.players[d.creditor].name : 'הבנק';
      this._log(`✅ ${p.name} ${v(p, 'העביר', 'העבירה')} ${money(d.amount)} ל${to}.`, 'money');
      if (this._deliver(d.amount, d.creditor, d.reason, d, d.payer)) return; // ממתינים לגבייה
      this._resumeAfterPayment(d, d.payer);
    }

    settleDebt() {
      if (this.phase !== 'debt') throw new Error('אין חוב פתוח');
      const d = this.debt;
      const p = this.players[d.debtor];
      if (p.money < d.amount) throw new Error('עדיין אין מספיק כסף');
      p.money -= d.amount;
      p.stats.paid += d.amount;
      this.debt = null;
      this._log(`${p.name} ${v(p, 'שילם', 'שילמה')} את החוב (${money(d.amount)}).`, 'money');
      if (this._deliver(d.amount, d.creditor, d.reason, d, d.debtor)) return; // ממתינים לגבייה
      this._resumeAfterPayment(d, d.debtor);
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

      // מוכרים את כל הבניינים לבנק (חצי מחיר) — הכסף נכנס לקופת החייב.
      // תמיד מוכרים קודם את הרחוב עם הכי הרבה בתים: כלל המכירה השווה
      // חוסם מכירה מרחוב נמוך, ומעבר רחוב-רחוב היה נתקע על עיר כמו 3-2.
      let guard = 300;
      while (guard-- > 0) {
        const built = this.playerProps(p.idx).filter((pos) => this.houses[pos] > 0);
        if (!built.length) break;
        built.sort((a, b) => this.houses[b] - this.houses[a]);
        this.sellHouse(built[0]);
      }

      // ההשקעות נפדות בכוח — אסור שיישאר כסף "תקוע" בבנק ההשקעות
      const invested = this.investTotal(p.idx);
      if (invested > 0) {
        p.money += invested;
        p.invest.totalOut += invested;
        p.invest.savings = 0;
        p.invest.deposit = 0;
        for (const c of D.FINANCE.COMPANIES) p.invest.stocks[c.id] = 0;
        p.invest.basis = { savings: 0, deposit: 0, stocks: Object.fromEntries(D.FINANCE.COMPANIES.map((c) => [c.id, 0])) };
        p.invest.crash = null;
        this._log(`💼 ההשקעות של ${p.name} נפדו: ${money(invested)}.`, 'withdraw', { pIdx: p.idx });
      }

      if (d.creditor !== null) {
        const creditor = this.players[d.creditor];
        creditor.money += p.money;
        for (const held of p.jailCards) creditor.jailCards.push(held);
        for (const pos of this.playerProps(p.idx)) this._transferProp(pos, d.creditor);
        this._log(`כל הרכוש והכסף של ${p.name} עוברים ל${creditor.name}.`, 'bankrupt');
      } else {
        // חוב לבנק: הנכסים חוזרים לבנק (ויוצאים למכירה פומבית אם היא מופעלת)
        for (const held of p.jailCards) this.decks[held.deck].push(held.card);
        for (const pos of this.playerProps(p.idx)) {
          this.owner[pos] = null;
          this.mortgaged[pos] = false;
          if (this.auctionsEnabled) this.auctionQueue.push(pos);
        }
        this._log(`נכסי ${p.name} חוזרים לבנק${this.auctionsEnabled ? ' ויוצאים למכירה פומבית' : ''}.`, 'bankrupt');
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
      const prevTurn = this.turn;
      do {
        this.turn = (this.turn + 1) % this.players.length;
      } while (this.current().bankrupt);
      this.phase = 'roll';
      // סיבוב שלם הושלם (התור "עטף" חזרה להתחלה) — הבורסה מתעדכנת פעם בסבב
      if (this.financeEnabled && this.turn < prevTurn) this._marketTick();
      this._log(`התור של ${this.current().name}.`, 'turn');
    }

    /* ---------- שמירה ושחזור ---------- */

    toJSON() {
      return {
        v: 1,
        auctionsEnabled: this.auctionsEnabled,
        potEnabled: this.potEnabled,
        financeEnabled: this.financeEnabled,
        difficulty: this.difficulty,
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
        market: this.market,
        bank: this.bank,
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
        manualPay: this.manualPay,
        pendingPay: this.pendingPay
          ? { payer: this.pendingPay.payer, creditor: this.pendingPay.creditor, amount: this.pendingPay.amount, reason: this.pendingPay.reason, cont: this.pendingPay.cont }
          : null,
        pendingCollect: this.pendingCollect
          ? { payee: this.pendingCollect.payee, payer: this.pendingCollect.payer, amount: this.pendingCollect.amount, reason: this.pendingCollect.reason, cont: this.pendingCollect.cont }
          : null,
        log: this.log.slice(-120),
        logSeq: this._logSeq,
      };
    }

    static restore(data) {
      const cardById = (deck, id) =>
        (deck === 'chance' ? D.CHANCE_CARDS : D.CHEST_CARDS).find((c) => c.id === id);
      const g = new Game(data.playersSpec, {
        auctions: data.auctionsEnabled !== false,
        pot: data.potEnabled !== false,
        finance: data.financeEnabled === true,
        difficulty: data.difficulty || 'medium',
        manualPay: data.manualPay === true,
      });
      // שמירות ישנות (מלפני מצב החינוך הפיננסי) נטענות עם ברירות מחדל ריקות
      g.players = data.players.map((p) => ({
        ...p,
        stats: { ...emptyStats(), ...(p.stats || {}) }, // שמירות ישנות מתחילות מאפס
        jailCards: (p.jailCards || []).map((h) => ({ deck: h.deck, card: cardById(h.deck, h.id) })),
        invest: p.invest ? {
          ...emptyInvest(),
          ...p.invest,
          stocks: { ...emptyInvest().stocks, ...(p.invest.stocks || {}) },
          basis: p.invest.basis
            ? { ...emptyInvest().basis, ...p.invest.basis, stocks: { ...emptyInvest().basis.stocks, ...(p.invest.basis.stocks || {}) } }
            : { savings: p.invest.savings || 0, deposit: p.invest.deposit || 0, stocks: { ...emptyInvest().basis.stocks, ...(p.invest.stocks || {}) } },
        } : emptyInvest(),
      }));
      g.owner = data.owner;
      g.houses = data.houses;
      g.mortgaged = data.mortgaged;
      g.housesLeft = data.housesLeft;
      g.hotelsLeft = data.hotelsLeft;
      g.pot = data.pot || 0;
      g.market = data.market ? { ...emptyMarket(), ...data.market, trend: { ...emptyMarket().trend, ...(data.market.trend || {}) } } : emptyMarket();
      g.bank = data.bank
        ? { ...emptyBank(), ...data.bank, invest: { ...emptyBank().invest, ...(data.bank.invest || {}), stocks: { ...emptyBank().invest.stocks, ...((data.bank.invest || {}).stocks || {}) } } }
        : emptyBank();
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
      g.pendingPay = data.pendingPay ? { ...data.pendingPay, onPaid: null } : null;
      g.pendingCollect = data.pendingCollect ? { ...data.pendingCollect, onPaid: null } : null;
      g.log = data.log || [];
      g._logSeq = data.logSeq || 0;
      return g;
    }
  }

  globalThis.MonopolyEngine = { Game };
})();
