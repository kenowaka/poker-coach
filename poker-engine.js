(function (root) {
  "use strict";

  const SUITS = ["s", "h", "d", "c"];
  const SUIT_LABELS = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const RANK_LABELS = { 11: "J", 12: "Q", 13: "K", 14: "A" };
  const deck = SUITS.flatMap(suit => Array.from({ length: 13 }, (_, index) => ({ rank: index + 2, suit })));

  function cardLabel(card) {
    return `${RANK_LABELS[card.rank] || card.rank}${SUIT_LABELS[card.suit]}`;
  }

  function key(card) { return `${card.rank}${card.suit}`; }

  function compareScores(a, b) {
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (a[index] || 0) - (b[index] || 0);
      if (difference) return Math.sign(difference);
    }
    return 0;
  }

  function straightHigh(ranks) {
    const unique = [...new Set(ranks)].sort((a, b) => b - a);
    if (unique.includes(14)) unique.push(1);
    for (let index = 0; index <= unique.length - 5; index += 1) {
      const run = unique.slice(index, index + 5);
      if (run.every((rank, offset) => offset === 0 || run[offset - 1] - rank === 1)) return run[0];
    }
    return null;
  }

  function scoreFive(cards) {
    const ranks = cards.map(card => card.rank).sort((a, b) => b - a);
    const counts = [...new Set(ranks)]
      .map(rank => ({ rank, count: ranks.filter(value => value === rank).length }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);
    const flush = new Set(cards.map(card => card.suit)).size === 1;
    const straight = straightHigh(ranks);

    if (flush && straight) return [8, straight];
    if (counts[0].count === 4) return [7, counts[0].rank, counts[1].rank];
    if (counts[0].count === 3 && counts[1].count === 2) return [6, counts[0].rank, counts[1].rank];
    if (flush) return [5, ...ranks];
    if (straight) return [4, straight];
    if (counts[0].count === 3) return [3, counts[0].rank, ...counts.slice(1).map(item => item.rank).sort((a, b) => b - a)];

    const pairs = counts.filter(item => item.count === 2).map(item => item.rank).sort((a, b) => b - a);
    if (pairs.length >= 2) {
      const kicker = counts.find(item => item.count === 1)?.rank || 0;
      return [2, pairs[0], pairs[1], kicker];
    }
    if (pairs.length === 1) {
      const kickers = counts.filter(item => item.count === 1).map(item => item.rank).sort((a, b) => b - a);
      return [1, pairs[0], ...kickers];
    }
    return [0, ...ranks];
  }

  function combinations(source, count) {
    const output = [];
    function visit(start, selected) {
      if (selected.length === count) { output.push(selected.slice()); return; }
      for (let index = start; index <= source.length - (count - selected.length); index += 1) {
        selected.push(source[index]);
        visit(index + 1, selected);
        selected.pop();
      }
    }
    visit(0, []);
    return output;
  }

  function bestScore(cards) {
    if (cards.length < 5) return [0, ...cards.map(card => card.rank).sort((a, b) => b - a)];
    return combinations(cards, 5).reduce((best, hand) => {
      const score = scoreFive(hand);
      return compareScores(score, best) > 0 ? score : best;
    }, [-1]);
  }

  function handName(cards) {
    if (cards.length < 5) {
      return cards.length >= 2 && cards[0].rank === cards[1].rank ? "Карманная пара" : "Старшая карта";
    }
    return ["Старшая карта", "Пара", "Две пары", "Сет", "Стрит", "Флеш", "Фулл-хаус", "Каре", "Стрит-флеш"][bestScore(cards)[0]];
  }

  function shuffledSample(source, count) {
    const copy = source.slice();
    for (let index = 0; index < count; index += 1) {
      const swap = index + Math.floor(Math.random() * (copy.length - index));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy.slice(0, count);
  }

  function equity(holeCards, board, simulations = 3500) {
    const known = new Set([...holeCards, ...board].map(key));
    const available = deck.filter(card => !known.has(key(card)));
    const missingBoard = 5 - board.length;
    let wins = 0;

    for (let run = 0; run < simulations; run += 1) {
      const drawn = shuffledSample(available, missingBoard + 2);
      const finalBoard = [...board, ...drawn.slice(0, missingBoard)];
      const opponent = drawn.slice(missingBoard);
      const comparison = compareScores(bestScore([...holeCards, ...finalBoard]), bestScore([...opponent, ...finalBoard]));
      if (comparison > 0) wins += 1;
      else if (comparison === 0) wins += 0.5;
    }
    return wins / simulations;
  }

  function analyze(holeCards, board, pot, callAmount, simulations) {
    const all = [...holeCards, ...board];
    if (holeCards.length !== 2) throw new Error("Выбери две карманные карты");
    if (new Set(all.map(key)).size !== all.length) throw new Error("Одна карта выбрана дважды");
    if (board.length > 5) throw new Error("На борде может быть не больше пяти карт");

    const estimatedEquity = equity(holeCards, board, simulations);
    const potOdds = callAmount > 0 ? callAmount / Math.max(0.01, pot + callAmount) : 0;
    const edge = estimatedEquity - potOdds;
    let recommendation;
    if (callAmount === 0) recommendation = estimatedEquity >= 0.6 ? "Можно ставить для вэлью" : "Чек — спокойная линия";
    else if (edge >= 0.08) recommendation = "Колл выгоден по шансам банка";
    else if (edge >= 0) recommendation = "Пограничный колл";
    else recommendation = "Фолд по базовой математике";

    return { holeCards, board, pot, callAmount, equity: estimatedEquity, potOdds, edge, hand: handName(all), recommendation, createdAt: Date.now() };
  }

  function parseVoice(source) {
    const text = source.toLowerCase().replaceAll("ё", "е").replace(/[^а-яa-z0-9.,]+/gi, " ");
    const tokens = text.trim().split(/\s+/);
    const ranks = {
      "2": 2, двойка: 2, два: 2, "3": 3, тройка: 3, три: 3, "4": 4, четверка: 4, четыре: 4,
      "5": 5, пятерка: 5, пять: 5, "6": 6, шестерка: 6, шесть: 6, "7": 7, семерка: 7, семь: 7,
      "8": 8, восьмерка: 8, восемь: 8, "9": 9, девятка: 9, девять: 9, "10": 10, десятка: 10,
      десять: 10, валет: 11, дама: 12, король: 13, туз: 14
    };
    const suitFor = word => word.startsWith("пик") ? "s" : word.startsWith("черв") ? "h" : word.startsWith("буб") ? "d" : (word.startsWith("треф") || word.startsWith("крест")) ? "c" : null;
    const numberAfter = index => {
      for (let cursor = index + 1; cursor < Math.min(tokens.length, index + 4); cursor += 1) {
        const number = Number(tokens[cursor].replace(",", "."));
        if (Number.isFinite(number)) return number;
      }
      return null;
    };

    const result = { cards: [], pot: null, callAmount: null };
    tokens.forEach((token, index) => {
      if (ranks[token]) {
        for (let cursor = index + 1; cursor < Math.min(tokens.length, index + 4); cursor += 1) {
          const suit = suitFor(tokens[cursor]);
          if (suit) {
            const card = { rank: ranks[token], suit };
            if (!result.cards.some(item => key(item) === key(card))) result.cards.push(card);
            break;
          }
        }
      }
      if (["банк", "банке", "пот"].includes(token)) result.pot = numberAfter(index);
      if (["ставка", "колл", "доколлить", "доставить"].includes(token)) result.callAmount = numberAfter(index);
    });
    return result;
  }

  const api = { SUITS, SUIT_LABELS, RANK_LABELS, cardLabel, bestScore, compareScores, handName, analyze, parseVoice };
  root.PokerEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
