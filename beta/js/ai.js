/* שחקן המחשב — החלטות משחק.
 * מקבל את מצב המשחק (Game) ומחזיר/מבצע פעולות חוקיות בלבד. */
(function () {
  'use strict';

  const D = globalThis.MONOPOLY_DATA;
  const { GROUPS } = D;

  // פרופילי קושי — כל רמה מכווננת את התוקפנות, הרזרבה והדיוק של הבוט.
  const PROFILES = {
    easy: {
      reserve: 320,        // שומר הרבה מזומן — קונה מעט
      auctionMul: 0.45,    // הצעות נמוכות במכירה פומבית
      auctionMonoMul: 0.7,
      buildReserve: 400,   // בונה רק כשיש עודף גדול מאוד
      unmortgageSlack: 500,
      buysMistake: 0.35,   // סיכוי לוותר על קנייה טובה (טעות)
      bidMistake: 0.5,     // סיכוי לפרוש ממכירה מוקדם
      trades: false,       // לא יוזם עסקאות
      tradeLenient: true,  // מקבל עסקאות גם כשהן פחות טובות לו
      jailPayRatio: 0.4,
    },
    medium: {
      reserve: 120,
      auctionMul: 0.75,
      auctionMonoMul: 1.2,
      buildReserve: 80,
      unmortgageSlack: 200,
      buysMistake: 0,
      bidMistake: 0,
      trades: true,
      tradeLenient: false,
      jailPayRatio: 0.6,
    },
    hard: {
      reserve: 70,         // כמעט לא שומר עתודה — קונה תוקפני
      auctionMul: 0.95,
      auctionMonoMul: 1.6,
      buildReserve: 40,    // בונה בכל הזדמנות
      unmortgageSlack: 120,
      buysMistake: 0,
      bidMistake: 0,
      trades: true,
      tradeLenient: false,
      jailPayRatio: 0.75,
    },
  };

  function profile(g) { return PROFILES[g && g.difficulty] || PROFILES.medium; }

  const RESERVE = 120; // ברירת מחדל היסטורית (נשמרת לתאימות)

  // כמה רחובות חסרים למחשב כדי להשלים את הקבוצה של pos
  function missingForGroup(g, idx, pos) {
    const sq = g.square(pos);
    if (sq.type !== 'street') return Infinity;
    const gp = g.groupPositions(sq.group);
    return gp.filter((p) => g.owner[p] !== idx).length;
  }

  function decideBuy(g, idx) {
    const pos = g.pendingBuy;
    const sq = g.square(pos);
    const p = g.players[idx];
    const prof = profile(g);
    const missing = missingForGroup(g, idx, pos);
    // משלים קבוצה או חוסם יריב — קונים כמעט בכל מחיר (גם בקל לא מפספסים השלמה)
    const opponentClose = sq.type === 'street' &&
      g.groupPositions(sq.group).some((gp2) => g.owner[gp2] !== null && g.owner[gp2] !== idx);
    if (p.money >= sq.price && (missing === 1 || opponentClose)) return true;
    // ברמה קלה — לפעמים "טועה" ומוותר על קנייה טובה
    if (prof.buysMistake && g.rand() < prof.buysMistake) return false;
    return p.money - sq.price >= prof.reserve;
  }

  // תקרת הצעה במכירה פומבית
  function auctionCap(g, idx) {
    const pos = g.auction.pos;
    const sq = g.square(pos);
    const p = g.players[idx];
    const prof = profile(g);
    let cap = Math.floor(sq.price * prof.auctionMul);
    if (missingForGroup(g, idx, pos) === 1) cap = Math.floor(sq.price * prof.auctionMonoMul);
    return Math.min(cap, p.money - 50);
  }

  function decideAuction(g, idx) {
    const a = g.auction;
    const prof = profile(g);
    const cap = auctionCap(g, idx);
    const minBid = a.currentBid === 0 ? 10 : a.currentBid + 10;
    if (a.highBidder === idx) return null; // מובילים — מחכים
    // ברמה קלה — לפעמים פורש מוקדם גם כשעוד משתלם
    if (prof.bidMistake && minBid > 20 && g.rand() < prof.bidMistake) return 'pass';
    if (minBid <= cap) return minBid;
    return 'pass';
  }

  // גיוס כסף עד יעד: קודם מכירת בתים מקבוצות זולות, אחר כך משכנתאות
  function raiseFunds(g, idx, target) {
    let guard = 100;
    while (g.players[idx].money < target && guard-- > 0) {
      // 1. משכנתא על נכס שאינו חלק ממונופול בנוי
      const mortgageable = g.playerProps(idx)
        .filter((pos) => g.canMortgage(idx, pos))
        .sort((x, y) => {
          const gx = g.square(x), gy = g.square(y);
          const monoX = gx.type === 'street' && g.ownsFullGroup(idx, gx.group) ? 1 : 0;
          const monoY = gy.type === 'street' && g.ownsFullGroup(idx, gy.group) ? 1 : 0;
          return monoX - monoY || gx.price - gy.price; // קודם לא-מונופול, זול קודם
        });
      if (mortgageable.length) { g.mortgage(mortgageable[0]); continue; }
      // 2. מכירת בתים (מהיקר אל הזול כדי לשחרר הרבה מזומן... דווקא מהזול לשמור שכ"ד)
      const sellable = g.playerProps(idx)
        .filter((pos) => g.canSellHouseOn(idx, pos))
        .sort((x, y) => GROUPS[g.square(x).group].houseCost - GROUPS[g.square(y).group].houseCost);
      if (sellable.length) { g.sellHouse(sellable[0]); continue; }
      break;
    }
    return g.players[idx].money >= target;
  }

  function handleDebt(g, idx) {
    const d = g.debt;
    if (!g.canAffordDebt()) { g.declareBankruptcy(); return; }
    if (raiseFunds(g, idx, d.amount)) g.settleDebt();
    else g.declareBankruptcy();
  }

  // האם לשלם כדי לצאת מהכלא? בשלב מוקדם כן, בשלב מתקדם עדיף לשבת
  function jailStrategy(g, idx) {
    const p = g.players[idx];
    const prof = profile(g);
    if (p.jailCards.length) return 'card';
    const boughtRatio = g.owner.filter((o) => o !== null).length / 28;
    if (boughtRatio < prof.jailPayRatio && p.money > 200) return 'pay';
    return 'roll';
  }

  // ניהול נכסים בסוף תור: פדיון משכנתאות ובניית בתים
  function manageAssets(g, idx) {
    const p = g.players[idx];
    const prof = profile(g);
    let guard = 50;
    // פדיון משכנתא כשיש עודף גדול (עדיפות לרחובות ממונופול)
    while (guard-- > 0) {
      const mortgaged = g.playerProps(idx)
        .filter((pos) => g.mortgaged[pos])
        .filter((pos) => {
          const cost = Math.round((g.square(pos).price / 2) * 1.1);
          return p.money - cost > prof.reserve + prof.unmortgageSlack;
        })
        .sort((x, y) => {
          const sx = g.square(x), sy = g.square(y);
          const mx = sx.type === 'street' && g.ownsFullGroup(idx, sx.group) ? 0 : 1;
          const my = sy.type === 'street' && g.ownsFullGroup(idx, sy.group) ? 0 : 1;
          return mx - my;
        });
      if (!mortgaged.length) break;
      g.unmortgage(mortgaged[0]);
    }
    // בנייה: כל עוד נשאר מעל הרזרבה
    guard = 50;
    while (guard-- > 0) {
      const buildable = g.playerProps(idx)
        .filter((pos) => g.canBuildOn(idx, pos))
        .filter((pos) => p.money - GROUPS[g.square(pos).group].houseCost > prof.reserve + prof.buildReserve)
        .sort((x, y) => GROUPS[g.square(x).group].houseCost - GROUPS[g.square(y).group].houseCost);
      if (!buildable.length) break;
      g.buildHouse(buildable[0]);
    }
  }

  // הצעת עסקה לשחקן האנושי: המחשב מנסה להשלים קבוצה שחסר לו בה רחוב אחד.
  // מחזיר {pos, offer} או null.
  function proposeTrade(g, idx, humanIdx) {
    const p = g.players[idx];
    const prof = profile(g);
    if (!prof.trades) return null; // ברמה קלה הבוט לא יוזם עסקאות
    for (const groupKey of Object.keys(GROUPS)) {
      const gp = g.groupPositions(groupKey);
      const mine = gp.filter((pos) => g.owner[pos] === idx);
      const theirs = gp.filter((pos) => g.owner[pos] === humanIdx);
      if (mine.length === gp.length - 1 && theirs.length === 1) {
        const pos = theirs[0];
        if (!g.canTradeProp(humanIdx, pos)) continue;
        const offer = Math.round(g.square(pos).price * 1.5);
        if (p.money - offer > prof.reserve) return { pos, offer };
      }
    }
    return null;
  }

  // הערכת עסקה שהאדם הציע: החזר true אם כדאית למחשב
  function evaluateTrade(g, aiIdx, { propsGive = [], propsGet = [], moneyGive = 0, moneyGet = 0 }) {
    const value = (pos, forIdx) => {
      const sq = g.square(pos);
      let v = g.mortgaged[pos] ? sq.price * 0.4 : sq.price;
      if (sq.type === 'street' && missingForGroup(g, forIdx, pos) === 1) v *= 1.7;
      return v;
    };
    let gain = moneyGet - moneyGive;
    for (const pos of propsGet) gain += value(pos, aiIdx);
    for (const pos of propsGive) {
      const humanIdx = g.owner[pos] === aiIdx ? (aiIdx === 0 ? 1 : 0) : g.owner[pos];
      gain -= value(pos, aiIdx);
      // אם זה נותן לאדם מונופול — דורשים פרמיה גדולה
      const sq = g.square(pos);
      if (sq.type === 'street') {
        const gp = g.groupPositions(sq.group);
        const wouldComplete = gp.every((p2) => p2 === pos || g.owner[p2] === humanIdx || propsGive.includes(p2));
        if (wouldComplete) gain -= sq.price;
      }
    }
    const prof = profile(g);
    if (g.players[aiIdx].money - moneyGive < prof.reserve && moneyGive > 0) return false;
    // ברמה קלה הבוט "נדיב" ומקבל עסקאות גם כשהן מעט לרעתו
    const threshold = prof.tradeLenient ? -Math.abs(gain === 0 ? 0 : 60) : 0;
    return gain >= threshold;
  }

  globalThis.MonopolyAI = {
    decideBuy, decideAuction, handleDebt, jailStrategy,
    manageAssets, raiseFunds, proposeTrade, evaluateTrade,
  };
})();
