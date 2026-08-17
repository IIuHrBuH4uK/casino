'use strict';

const C = () => Casino;

/* ============================================================
   Общие помощники
   ============================================================ */

const SUITS = ['♠', '♥', '♦', '♣'];
const RANK_LABEL = (r) => r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r);

function newDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
  return d;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardHTML(c, small) {
  const red = (c.s === 1 || c.s === 2);
  return `<div class="pcard${red ? ' red' : ''}${small ? ' small' : ''}"><span class="prank">${RANK_LABEL(c.r)}</span><span class="psuit">${SUITS[c.s]}</span></div>`;
}

/* ---------- Покерная оценка ---------- */

function eval5(cards) {
  const rs = cards.map((c) => c.r).sort((a, b) => b - a);
  const cm = new Map();
  rs.forEach((r) => cm.set(r, (cm.get(r) || 0) + 1));
  const counts = [...cm.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFlush = cards.every((c) => c.s === cards[0].s);
  const uniq = [...new Set(rs)];
  let straightRank = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightRank = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightRank = 5;
  }
  if (isFlush && straightRank > 0) return { tier: 8, k: [straightRank] };
  if (counts[0][1] === 4) return { tier: 7, k: [counts[0][0], counts[1][0]] };
  if (counts[0][1] === 3 && counts[1][1] === 2) return { tier: 6, k: [counts[0][0], counts[1][0]] };
  if (isFlush) return { tier: 5, k: rs };
  if (straightRank > 0) return { tier: 4, k: [straightRank] };
  if (counts[0][1] === 3) return { tier: 3, k: [counts[0][0], ...counts.slice(1).map((x) => x[0])] };
  if (counts[0][1] === 2 && counts[1][1] === 2) return { tier: 2, k: [counts[0][0], counts[1][0], counts[2][0]] };
  if (counts[0][1] === 2) return { tier: 1, k: [counts[0][0], ...counts.slice(1).map((x) => x[0])] };
  return { tier: 0, k: rs };
}

function cmpHand(a, b) {
  if (a.tier !== b.tier) return a.tier - b.tier;
  const len = Math.max(a.k.length, b.k.length);
  for (let i = 0; i < len; i++) {
    const d = (a.k[i] || 0) - (b.k[i] || 0);
    if (d) return d;
  }
  return 0;
}

function bestHand(seven) {
  let best = null;
  const n = seven.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const five = seven.filter((_, k) => k !== i && k !== j);
      const e = eval5(five);
      if (!best || cmpHand(e, best) > 0) best = e;
    }
  }
  return best;
}

const HAND_NAMES = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'];

/* ---------- Удача (перерождения) ---------- */

const lucky = () => Math.random() < C().luckBias();

function weightedPick(list, weightFn) {
  const tot = list.reduce((s, x) => s + weightFn(x), 0);
  if (tot <= 0) return list[Math.floor(Math.random() * list.length)];
  let r = Math.random() * tot;
  for (const x of list) { r -= weightFn(x); if (r <= 0) return x; }
  return list[list.length - 1];
}

/* ============================================================
   1. РУЛЕТКА
   ============================================================ */

Casino.registerGame({
  id: 'roulette',
  name: 'Рулетка',
  icon: '🎡',
  color: '#ff2d95',
  desc: 'Европейская рулетка: числа, цвета, чётность и дюжины. До 36:1.',
  mount(box) {
    const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const numColor = (n) => n === 0 ? 'green' : (REDS.has(n) ? 'red' : 'black');
    const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

    const bets = {};
    let chip = 10;
    let removeMode = false;
    let spinning = false;
    let rot = 0;
    let spinRaf = null;
    const timers = [];

    /* ---- сборка стола ---- */
    const wrap = C().el('div', 'roulette-wrap');
    const table = C().el('div', 'roulette-table');

    const zero = C().el('div', 'rt-zero', '0');
    zero.dataset.key = '0';
    table.appendChild(zero);

    const grid = C().el('div', 'rt-grid');
    const rows = [[3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36], [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35], [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]];
    rows.forEach((row) => row.forEach((n) => {
      const cell = C().el('div', 'rt-cell ' + numColor(n), String(n));
      cell.dataset.key = String(n);
      grid.appendChild(cell);
    }));
    table.appendChild(grid);

    const dozen = C().el('div', 'rt-outside');
    dozen.style.gridTemplateColumns = 'repeat(3, 46px)';
    dozen.style.width = 'auto';
    dozen.style.margin = '4px 0 0 auto';
    [['d1', '1-12 2:1'], ['d2', '13-24 2:1'], ['d3', '25-36 2:1']].forEach(([k, lbl]) => {
      const c = C().el('div', 'rt-cell black', lbl);
      c.dataset.key = k;
      dozen.appendChild(c);
    });
    table.appendChild(dozen);

    const outside = C().el('div', 'rt-outside');
    [['low', '1-18', 'red'], ['red', 'КРАС', 'red'], ['black', 'ЧЁРН', 'black'], ['even', 'ЧЁТ', 'even'], ['odd', 'НЕЧЁТ', 'odd'], ['high', '19-36', 'even']].forEach(([k, lbl, cls]) => {
      const c = C().el('div', 'rt-cell ' + cls, lbl);
      c.dataset.key = k;
      outside.appendChild(c);
    });
    table.appendChild(outside);

    /* ---- колесо (canvas) ---- */
    const side = C().el('div', 'roulette-side');
    const wheelC = C().el('canvas', 'roulette-wheel');
    wheelC.width = 320;
    wheelC.height = 320;
    side.appendChild(wheelC);
    const wctx = wheelC.getContext('2d');
    const WCX = 160, WCY = 168, WR = 148;
    const segAng = 360 / 37;

    function drawWheel(rotDeg, highlightIdx) {
      wctx.clearRect(0, 0, wheelC.width, wheelC.height);
      wctx.shadowBlur = 0;

      for (let i = 0; i < 37; i++) {
        const start = ((i * segAng + rotDeg) * Math.PI) / 180;
        const end = (((i + 1) * segAng + rotDeg) * Math.PI) / 180;
        wctx.beginPath();
        wctx.moveTo(WCX, WCY);
        wctx.arc(WCX, WCY, WR, start, end);
        wctx.closePath();
        const n = WHEEL_ORDER[i];
        wctx.fillStyle = n === 0 ? '#0a8a2a' : (REDS.has(n) ? '#d81b45' : '#1c1433');
        wctx.fill();
        wctx.strokeStyle = 'rgba(255, 215, 0, 0.55)';
        wctx.lineWidth = 1;
        wctx.stroke();
      }

      for (let i = 0; i < 37; i++) {
        const n = WHEEL_ORDER[i];
        const mid = ((i * segAng + rotDeg) * Math.PI) / 180 + (segAng * Math.PI) / 360;
        const tx = WCX + Math.cos(mid) * WR * 0.74;
        const ty = WCY + Math.sin(mid) * WR * 0.74;
        wctx.fillStyle = n === 0 ? '#eaffea' : '#ffffff';
        wctx.font = 'bold 13px Orbitron, sans-serif';
        wctx.textAlign = 'center';
        wctx.textBaseline = 'middle';
        wctx.fillText(String(n), tx, ty);
      }

      wctx.beginPath();
      wctx.arc(WCX, WCY, 27, 0, Math.PI * 2);
      wctx.fillStyle = '#ffd700';
      wctx.fill();
      wctx.strokeStyle = '#fff';
      wctx.lineWidth = 3;
      wctx.stroke();

      wctx.beginPath();
      wctx.moveTo(WCX, 27);
      wctx.lineTo(WCX - 11, 12);
      wctx.lineTo(WCX + 11, 12);
      wctx.closePath();
      wctx.fillStyle = '#ff3860';
      wctx.shadowColor = '#ff3860';
      wctx.shadowBlur = 12;
      wctx.fill();
      wctx.shadowBlur = 0;

      if (highlightIdx >= 0) {
        const hs = ((highlightIdx * segAng + rotDeg) * Math.PI) / 180;
        const he = (((highlightIdx + 1) * segAng + rotDeg) * Math.PI) / 180;
        wctx.beginPath();
        wctx.arc(WCX, WCY, WR + 3, hs, he);
        wctx.lineWidth = 6;
        wctx.strokeStyle = '#ffffff';
        wctx.shadowColor = '#ffd700';
        wctx.shadowBlur = 16;
        wctx.stroke();
        wctx.shadowBlur = 0;
      }
    }
    drawWheel(0, -1);

    const result = C().resultEl(side);

    wrap.appendChild(table);
    wrap.appendChild(side);
    box.appendChild(wrap);

    /* ---- чипы и кнопки ---- */
    const chipBar = C().el('div', 'roulette-chips');
    const chipValues = [1, 5, 10, 25, 50, 100];
    chipValues.forEach((v) => {
      const b = C().el('button', 'chip-btn' + (v === chip ? ' active' : ''), String(v));
      b.onclick = () => {
        if (removeMode) return;
        chip = v;
        chipBar.querySelectorAll('.chip-btn').forEach((x, i) => {
          if (i < chipValues.length) x.classList.toggle('active', chipValues[i] === v);
        });
        const ab = chipBar.querySelector('.chip-all');
        if (ab) ab.classList.remove('active');
      };
      chipBar.appendChild(b);
    });
    const btnAll = C().el('button', 'chip-btn chip-all', 'ВСЁ');
    btnAll.title = 'Поставить все деньги';
    btnAll.onclick = () => {
      removeMode = false;
      btnRemove.classList.remove('active');
      chipBar.querySelectorAll('.chip-btn').forEach((x) => x.classList.remove('dim'));
      chipBar.querySelectorAll('.chip-btn').forEach((x, i) => {
        if (i < chipValues.length) x.classList.toggle('active', false);
      });
      btnAll.classList.add('active');
      chip = Math.max(1, Math.floor(C().getState().balance));
    };
    chipBar.appendChild(btnAll);
    const btnRemove = C().el('button', 'chip-btn chip-remove', '−');
    btnRemove.title = 'Снять ставки: тап по полю убирает фишку';
    btnRemove.onclick = () => {
      removeMode = !removeMode;
      btnRemove.classList.toggle('active', removeMode);
      chipBar.querySelectorAll('.chip-btn').forEach((x, i) => {
        if (i < chipValues.length) x.classList.toggle('dim', removeMode);
      });
    };
    chipBar.appendChild(btnRemove);
    box.appendChild(chipBar);

    const betSum = () => Object.values(bets).reduce((a, b) => a + b, 0);

    const totalLine = C().el('div', 'result-line info', 'Ставок на поле: 0 ₽');
    box.appendChild(totalLine);

    const actions = C().el('div', 'actions');
    const btnSpin = C().el('button', 'btn neon', '🎲 Крутить');
    const btnClear = C().el('button', 'btn ghost', 'Очистить ставки');
    actions.appendChild(btnSpin);
    actions.appendChild(btnClear);
    box.appendChild(actions);
    const ap = C().autoplay({ container: actions, getBtn: () => btnSpin });

    /* ---- обработка кликов по полю ---- */
    const handleCell = (e) => {
      const cell = e.target.closest('[data-key]');
      if (!cell || spinning) return;
      const key = cell.dataset.key;
      if (e.button === 2 || (e.shiftKey && e.type === 'click') || removeMode) {
        bets[key] = Math.max(0, (bets[key] || 0) - chip);
        if (bets[key] === 0) delete bets[key];
      } else {
        bets[key] = (bets[key] || 0) + chip;
      }
      drawChips();
      totalLine.textContent = 'Ставок на поле: ' + C().fmt(betSum());
    };
    table.addEventListener('click', handleCell);
    table.addEventListener('contextmenu', (e) => { e.preventDefault(); handleCell(e); });

    function drawChips() {
      table.querySelectorAll('.rt-betchip').forEach((x) => x.remove());
      Object.entries(bets).forEach(([key, amt]) => {
        const cell = table.querySelector(`[data-key="${key}"]`);
        if (!cell) return;
        const c = C().el('div', 'rt-betchip', String(amt));
        cell.appendChild(c);
      });
    }

    /* ---- спин ---- */
    function spin() {
      if (spinning) return;
      const total = betSum();
      if (total === 0) return C().notify('Сделайте хотя бы одну ставку', 'warn');
      const d = C().deductBet(total);
      if (!d.ok) return C().notify(d.msg, 'warn');

      spinning = true;
      btnSpin.disabled = true;
      btnClear.disabled = true;
      result.set('Крутим...', 'info');

      const num = lucky() ? luckyNum(bets) : Math.floor(Math.random() * 37);
      const i = WHEEL_ORDER.indexOf(num);
      const targetNorm = ((270 - i * segAng) % 360 + 360) % 360;
      const finalRot = rot + 360 * 5 + ((targetNorm - (rot % 360) + 360) % 360);
      const startRot = rot;
      const startT = performance.now();
      const dur = 3200;

      const animate = (now) => {
        const t = Math.min(1, (now - startT) / dur);
        const ease = 1 - Math.pow(1 - t, 3);
        rot = startRot + (finalRot - startRot) * ease;
        drawWheel(rot, -1);
        if (t < 1) {
          spinRaf = requestAnimationFrame(animate);
        } else {
          spinRaf = null;
          const payout = resolveBets(num);
          drawWheel(rot, i);
          const color = numColor(num);
          const colorTxt = color === 'red' ? 'КРАСНОЕ' : color === 'black' ? 'ЧЁРНОЕ' : 'ЗЕЛЁНОЕ';
          if (payout > 0) {
            C().pay(payout);
            result.set(`Выпало: ${num} (${colorTxt}) · Выигрыш: ${C().fmt(payout)}`, 'win');
          } else {
            result.set(`Выпало: ${num} (${colorTxt}) · Проигрыш`, 'lose');
          }
          C().resolveGame(total, payout);
          spinning = false;
          btnSpin.disabled = false;
          btnClear.disabled = false;
        }
      };
      spinRaf = requestAnimationFrame(animate);
    }

    function luckyNum(bets) {
      const keys = Object.keys(bets);
      if (!keys.length) return Math.floor(Math.random() * 37);
      const k = keys[Math.floor(Math.random() * keys.length)];
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      if (/^\d+$/.test(k)) return Number(k);
      if (k === 'red') return pick([...REDS]);
      if (k === 'black') return pick([1,2,3,4,5,6,7,8,9,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);
      if (k === 'even') return pick([2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36]);
      if (k === 'odd') return pick([1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35]);
      if (k === 'low') return pick([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
      if (k === 'high') return pick([19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36]);
      if (k === 'd1') return pick([1,2,3,4,5,6,7,8,9,10,11,12]);
      if (k === 'd2') return pick([13,14,15,16,17,18,19,20,21,22,23,24]);
      if (k === 'd3') return pick([25,26,27,28,29,30,31,32,33,34,35,36]);
      return Math.floor(Math.random() * 37);
    }

    function resolveBets(num) {
      const color = numColor(num);
      const even = num !== 0 && num % 2 === 0;
      let total = 0;
      Object.entries(bets).forEach(([k, bet]) => {
        let mult = 0;
        if (k === '0' && num === 0) mult = 36;
        else if (/^\d+$/.test(k) && Number(k) === num) mult = 36;
        else if (k === 'red' && color === 'red') mult = 2;
        else if (k === 'black' && color === 'black') mult = 2;
        else if (k === 'even' && even) mult = 2;
        else if (k === 'odd' && num !== 0 && num % 2 === 1) mult = 2;
        else if (k === 'low' && num >= 1 && num <= 18) mult = 2;
        else if (k === 'high' && num >= 19 && num <= 36) mult = 2;
        else if (k === 'd1' && num >= 1 && num <= 12) mult = 3;
        else if (k === 'd2' && num >= 13 && num <= 24) mult = 3;
        else if (k === 'd3' && num >= 25 && num <= 36) mult = 3;
        total += bet * mult;
      });
      return total;
    }

    btnSpin.onclick = spin;
    btnClear.onclick = () => { if (spinning) return; Object.keys(bets).forEach((k) => delete bets[k]); drawChips(); totalLine.textContent = 'Ставок на поле: 0 ₽'; };

    return {
      destroy() { if (spinRaf) cancelAnimationFrame(spinRaf); timers.forEach(clearTimeout); ap.stop(); },
    };
  },
});

/* ============================================================
   2. СЛОТЫ
   ============================================================ */

Casino.registerGame({
  id: 'slots',
  name: 'Слоты',
  icon: '🎰',
  color: '#a855f7',
  desc: 'Классический автомат 3×3: три линии, символы до ×50.',
  mount(box) {
    const SYMS = ['🍒', '🍋', '🍇', '🔔', '💎', '7'];
    const PAY = { '🍒': 2, '🍋': 3, '🍇': 5, '🔔': 10, '💎': 25, '7': 50 };
    const timers = [];

    const { bar, getBet } = C().betControls(box);

    const grid = C().el('div', 'slot-grid');
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const c = C().el('div', 'slot-cell', SYMS[Math.floor(Math.random() * SYMS.length)]);
      cells.push(c);
      grid.appendChild(c);
    }
    box.appendChild(grid);

    const actions = C().el('div', 'actions');
    const btn = C().el('button', 'btn neon', '🎲 Крутить');
    actions.appendChild(btn);
    box.appendChild(actions);
    const ap = C().autoplay({ container: actions, getBtn: () => btn });

    const PAY_ORDER = [['7', '×50'], ['💎', '×25'], ['🔔', '×10'], ['🍇', '×5'], ['🍋', '×3'], ['🍒', '×2']];
    const paytable = C().el('div', 'slot-paytable',
      '<div class="pt-title">ТАБЛИЦА ВЫПЛАТ</div>' +
      PAY_ORDER.map(([s, p]) => `<div class="pt-row"><span class="pt-sym">${s}</span><span class="pt-combo">${s} ${s} ${s} в строке</span><span class="pt-pay">${p}</span></div>`).join('') +
      '<div class="pt-row"><span class="pt-sym">🍒</span><span class="pt-combo">2 вишни в строке</span><span class="pt-pay">×1</span></div>' +
      '<div class="pt-note">Играются 3 горизонтальные линии. Ставка умножается на коэффициент.</div>'
    );
    box.appendChild(paytable);

    const result = C().resultEl(box);

    function randomSym() { return SYMS[Math.floor(Math.random() * SYMS.length)]; }

    function forceSlotsWin(final) {
      const row = Math.floor(Math.random() * 3);
      if (Math.random() < 0.6) {
        const s = randomSym();
        final[row * 3] = s;
        final[row * 3 + 1] = s;
        final[row * 3 + 2] = s;
      } else {
        final[row * 3] = '🍒';
        final[row * 3 + 1] = '🍒';
        final[row * 3 + 2] = randomSym();
      }
    }

    function spin() {
      const bet = getBet();
      const d = C().deductBet(bet);
      if (!d.ok) return C().notify(d.msg, 'warn');

      btn.disabled = true;
      result.set('Крутим...', 'info');
      cells.forEach((c) => c.classList.add('spin'));

      const final = cells.map(() => randomSym());
      const forcedSym = C().getState().cheatSymbol;
      if (forcedSym) {
        for (let i = 0; i < 9; i++) final[i] = forcedSym;
      } else if (lucky()) {
        forceSlotsWin(final);
      }
      const spinT = setInterval(() => {
        cells.forEach((c) => { if (c.classList.contains('spin')) c.textContent = randomSym(); });
      }, 70);
      timers.push(spinT);

      [0, 1, 2].forEach((col) => {
        timers.push(setTimeout(() => {
          for (let r = 0; r < 3; r++) {
            const idx = r * 3 + col;
            cells[idx].textContent = final[idx];
            cells[idx].classList.remove('spin');
          }
          if (col === 2) { clearInterval(spinT); finish(final, bet); }
        }, 500 + col * 450));
      });
    }

    function finish(final, bet) {
      cells.forEach((c, i) => { c.textContent = final[i]; c.classList.remove('spin'); });
      let mult = 0;
      for (let r = 0; r < 3; r++) {
        const a = final[r * 3], b = final[r * 3 + 1], c = final[r * 3 + 2];
        if (a === b && b === c) {
          mult += PAY[a];
        } else {
          const cherries = [a, b, c].filter((x) => x === '🍒').length;
          if (cherries >= 2) mult += 1;
        }
      }
      const payout = bet * mult;
      if (payout > 0) {
        C().pay(payout);
        result.set('Выигрыш: ' + C().fmt(payout) + ' (×' + mult + ')', 'win');
      } else {
        result.set('Повезёт в следующий раз!', 'lose');
      }
      C().resolveGame(bet, payout);
      btn.disabled = false;
    }

    btn.onclick = spin;

    return {
      destroy() { timers.forEach((t) => clearTimeout(t)); ap.stop(); },
    };
  },
});

/* ============================================================
   3. ПОКЕР (Texas Hold'em против бота)
   ============================================================ */

Casino.registerGame({
  id: 'poker',
  name: 'Покер (ТХ)',
  icon: '🃏',
  color: '#ffd700',
  desc: 'Техасский холдем против бота. Кто собрал сильнейшую комбинацию — забирает банк.',
  mount(box) {
    const { bar, getBet } = C().betControls(box, { defaultBet: 20 });

    const table = C().el('div', 'poker-table');
    const comm = C().el('div', 'poker-community');
    const botRow = C().el('div', 'poker-bot', '<div class="plabel">Бот</div><div class="card-row" id="botCards"></div>');
    const playRow = C().el('div', 'poker-player', '<div class="plabel">Вы</div><div class="card-row" id="playerCards"></div>');
    table.appendChild(comm);
    table.appendChild(botRow);
    table.appendChild(playRow);
    box.appendChild(table);

    const info = C().el('div', 'poker-info');
    box.appendChild(info);

    const actions = C().el('div', 'actions');
    const btnDeal = C().el('button', 'btn neon', '🃏 Сдать');
    const btnShow = C().el('button', 'btn pink', 'Шоудаун');
    const btnFold = C().el('button', 'btn ghost', 'Фолд');
    actions.appendChild(btnDeal);
    actions.appendChild(btnShow);
    actions.appendChild(btnFold);
    box.appendChild(actions);

    const result = C().resultEl(box);

    let hand = null;
    let busy = false;
    const timers = [];

    function renderHand() {
      const botCards = botRow.querySelector('#botCards');
      const playCards = playRow.querySelector('#playerCards');
      botCards.innerHTML = hand
        ? (hand.revealed
          ? hand.botCards.map((c) => cardHTML(c, true)).join('')
          : '<div class="pcard back small"></div><div class="pcard back small"></div>')
        : '';
      playCards.innerHTML = hand ? hand.playerCards.map((c) => cardHTML(c, true)).join('') : '';
      if (hand && hand.community.length) {
        comm.innerHTML = hand.community.map((c) => cardHTML(c, true)).join('');
      } else {
        comm.innerHTML = '';
      }
    }

    function drawLuckyPair(deck) {
      const rank = 9 + Math.floor(Math.random() * 6);
      const cards = [];
      for (let i = deck.length - 1; i >= 0 && cards.length < 2; i--) {
        if (deck[i].r === rank) cards.push(deck.splice(i, 1)[0]);
      }
      return cards.length === 2 ? cards : null;
    }

    function deal() {
      if (busy) return;
      if (hand) return C().notify('Сначала завершите раздачу', 'warn');
      const bet = getBet();
      const d = C().deductBet(bet);
      if (!d.ok) return C().notify(d.msg, 'warn');

      busy = true;
      btnDeal.disabled = true;
      const deck = shuffle(newDeck());
      let playerCards = [deck.pop(), deck.pop()];
      if (lucky()) {
        const good = drawLuckyPair(deck);
        if (good) playerCards = good;
      }
      hand = {
        bet,
        deck,
        playerCards,
        botCards: [deck.pop(), deck.pop()],
        community: [],
        done: false,
      };
      info.innerHTML = `Пот: <b>${C().fmt(bet * 2)} ₽</b> · Ваша ставка: ${C().fmt(bet)} ₽`;
      result.set('Карты розданы. Шоудаун или фолд?', 'info');
      renderHand();
    }

    function showdown() {
      if (!hand || hand.done) return;
      busy = true;
      btnShow.disabled = true;
      btnFold.disabled = true;
      result.set('Сдаём общие карты...', 'info');

      let i = 0;
      const dealAll = () => {
        hand.community.push(hand.deck.pop());
        renderHand();
        i++;
        if (i < 5) timers.push(setTimeout(dealAll, 500));
        else timers.push(setTimeout(resolve, 500));
      };
      dealAll();
    }

    function resolve() {
      hand.revealed = true;
      renderHand();
      const pBest = bestHand([...hand.playerCards, ...hand.community]);
      const bBest = bestHand([...hand.botCards, ...hand.community]);
      const cmp = cmpHand(pBest, bBest);
      const pName = HAND_NAMES[pBest.tier];
      const bName = HAND_NAMES[bBest.tier];

      let payout = 0;
      if (cmp > 0) {
        payout = hand.bet * 2;
        C().pay(payout);
        result.set(`Победа! Ваша комбинация: ${pName}. Бот: ${bName}. Выигрыш: ${C().fmt(payout)}`, 'win');
      } else if (cmp < 0) {
        result.set(`Поражение. Бот: ${bName}. Вы: ${pName}`, 'lose');
      } else {
        payout = hand.bet;
        C().pay(payout);
        result.set(`Ничья: ${pName}. Ставка возвращена.`, 'info');
      }
      C().resolveGame(hand.bet, payout);
      hand.done = true;
      busy = false;
      btnDeal.disabled = false;
      btnShow.disabled = false;
      btnFold.disabled = false;
      hand = null;
      btnShow.textContent = 'Шоудаун';
    }

    function fold() {
      if (!hand || hand.done) return;
      result.set('Фолд. Бот забирает банк.', 'lose');
      C().resolveGame(hand.bet, 0);
      hand.done = true;
      hand = null;
      comm.innerHTML = '';
      botRow.querySelector('#botCards').innerHTML = '';
      playRow.querySelector('#playerCards').innerHTML = '';
      info.innerHTML = 'Пот: 0 ₽';
      btnDeal.disabled = false;
      btnShow.disabled = false;
      btnFold.disabled = false;
    }

    btnDeal.onclick = deal;
    btnShow.onclick = showdown;
    btnFold.onclick = fold;

    return {
      destroy() { timers.forEach(clearTimeout); },
    };
  },
});

/* ============================================================
   4. БЛЭКДЖЕК
   ============================================================ */

Casino.registerGame({
  id: 'blackjack',
  name: 'Блэкджек',
  icon: '♠️',
  color: '#00e5ff',
  desc: 'Сыграйте до 21 против дилера. Блэкджек платит 3:2, есть удвоение.',
  mount(box) {
    const { bar, getBet } = C().betControls(box, { defaultBet: 20 });

    const table = C().el('div', 'bj-table');
    const dealer = C().el('div', 'bj-row', '<div class="bj-label">Дилер</div><div class="card-row" id="dealerCards"></div><div class="bj-total" id="dealerTotal"></div>');
    const player = C().el('div', 'bj-row', '<div class="bj-label">Вы</div><div class="card-row" id="playerCards"></div><div class="bj-total" id="playerTotal"></div>');
    table.appendChild(dealer);
    table.appendChild(player);
    box.appendChild(table);

    const actions = C().el('div', 'actions');
    const btnDeal = C().el('button', 'btn neon', '🎴 Раздать');
    const btnHit = C().el('button', 'btn pink', 'Ещё');
    const btnStand = C().el('button', 'btn gold', 'Хватит');
    const btnDouble = C().el('button', 'btn ghost', 'Удвоить');
    [btnDeal, btnHit, btnStand, btnDouble].forEach((b) => { b.disabled = true; actions.appendChild(b); });
    actions.appendChild(btnDeal);
    btnDeal.disabled = false;
    box.appendChild(actions);

    const result = C().resultEl(box);

    let deck = [];
    let pCards = [], dCards = [];
    let bet = 0;
    let doubled = false;
    let busy = false;
    let handActive = false;
    const timers = [];

    function val(c) { return c.r === 1 ? 11 : c.r >= 11 ? 10 : c.r; }
    function handValue(cards) {
      let s = 0, aces = 0;
      cards.forEach((c) => { if (c.r === 1) { aces++; s += 11; } else s += val(c); });
      while (s > 21 && aces > 0) { s -= 10; aces--; }
      return s;
    }

    function render(revealDealer) {
      const dc = dealer.querySelector('#dealerCards');
      const pc = player.querySelector('#playerCards');
      const dt = dealer.querySelector('#dealerTotal');
      const pt = player.querySelector('#playerTotal');

      pc.innerHTML = pCards.map((c) => cardHTML(c, true)).join('');
      dc.innerHTML = dCards.map((c, i) => (i === 1 && !revealDealer) ? '<div class="pcard back small"></div>' : cardHTML(c, true)).join('');

      const dv = revealDealer ? handValue(dCards) : handValue([dCards[0]]);
      dt.textContent = revealDealer ? 'Сумма: ' + dv : 'Сумма: ' + (dCards.length ? val(dCards[0]) : 0);
      dt.className = 'bj-total' + (revealDealer && dv > 21 ? ' bust' : '');
      const pv = handValue(pCards);
      pt.textContent = 'Сумма: ' + pv;
      pt.className = 'bj-total' + (pv > 21 ? ' bust' : '');
    }

    function newDeck6() {
      const d = [];
      for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) for (let k = 0; k < 6; k++) d.push({ r, s });
      return shuffle(d);
    }

    function findCard(deck, pred) {
      for (let i = deck.length - 1; i >= 0; i--) {
        if (pred(deck[i])) return deck.splice(i, 1)[0];
      }
      return null;
    }

    function drawAceTen(deck) {
      const ace = findCard(deck, (c) => c.r === 1);
      const ten = findCard(deck, (c) => c.r >= 10 && c.r <= 13);
      return ace && ten ? [ace, ten] : null;
    }

    function drawSafe(deck) {
      return findCard(deck, (c) => c.r >= 2 && c.r <= 6);
    }

    function deal() {
      if (busy || handActive) return;
      const b = getBet();
      const d = C().deductBet(b);
      if (!d.ok) return C().notify(d.msg, 'warn');
      bet = b;
      doubled = false;
      if (!deck.length) deck = newDeck6();
      pCards = [deck.pop(), deck.pop()];
      if (lucky()) {
        const good = drawAceTen(deck);
        if (good) pCards = good;
      }
      dCards = [deck.pop(), deck.pop()];
      result.set('', '');
      render(false);

      handActive = true;
      busy = false;
      btnDeal.disabled = true;
      btnHit.disabled = false;
      btnStand.disabled = false;
      btnDouble.disabled = pCards.length !== 2 || b > C().getState().balance;

      const pv = handValue(pCards);
      if (pv === 21) {
        busy = true;
        btnHit.disabled = true;
        btnStand.disabled = true;
        btnDouble.disabled = true;
        timers.push(setTimeout(() => dealerPlays(), 700));
      }
    }

    function hit() {
      if (busy || !handActive) return;
      pCards.push(lucky() ? drawSafe(deck) || deck.pop() : deck.pop());
      render(false);
      btnDouble.disabled = true;
      const pv = handValue(pCards);
      if (pv > 21) {
        busy = true;
        btnHit.disabled = true;
        btnStand.disabled = true;
        btnDouble.disabled = true;
        timers.push(setTimeout(() => end(false, 0, false), 600));
      }
    }

    function doubleDown() {
      if (busy || !handActive || pCards.length !== 2) return;
      const d = C().deductBet(bet);
      if (!d.ok) return C().notify(d.msg, 'warn');
      doubled = true;
      btnDouble.disabled = true;
      pCards.push(lucky() ? drawSafe(deck) || deck.pop() : deck.pop());
      render(false);
      const pv = handValue(pCards);
      btnHit.disabled = true;
      btnStand.disabled = true;
      busy = true;
      if (pv > 21) timers.push(setTimeout(() => end(false, 0, false), 600));
      else timers.push(setTimeout(() => dealerPlays(), 600));
    }

    function stand() {
      if (busy || !handActive) return;
      btnHit.disabled = true;
      btnDouble.disabled = true;
      btnStand.disabled = true;
      busy = true;
      dealerPlays();
    }

    function dealerPlays() {
      render(true);
      const step = () => {
        const dv = handValue(dCards);
        if (dv < 17) {
          dCards.push(deck.pop());
          render(true);
          timers.push(setTimeout(step, 550));
        } else {
          finish(dv);
        }
      };
      step();
    }

    function finish(dv) {
      const pv = handValue(pCards);
      render(true);
      const playerNatural = pCards.length === 2 && pv === 21;
      const dealerNatural = dCards.length === 2 && dv === 21;
      if (pv > 21) return end(false, 0, false);
      if (playerNatural && !dealerNatural) return end(true, Math.round(bet * 2.5), false);
      if (dealerNatural && !playerNatural) return end(false, 0, false);
      if (dv > 21 || pv > dv) return end(true, bet * 2, false);
      if (pv === dv) return end(true, bet, true);
      return end(false, 0, false);
    }

    function end(win, payout, push) {
      render(true);
      if (push) {
        result.set('Ничья. Ставка возвращена.', 'info');
      } else if (win) {
        C().pay(payout);
        result.set('Выигрыш: ' + C().fmt(payout), 'win');
      } else {
        result.set('Проигрыш: ' + C().fmt(bet), 'lose');
      }
      C().resolveGame(bet, payout);
      busy = false;
      handActive = false;
      btnDeal.disabled = false;
      btnHit.disabled = true;
      btnStand.disabled = true;
      btnDouble.disabled = true;
    }

    btnDeal.onclick = deal;
    btnHit.onclick = hit;
    btnStand.onclick = stand;
    btnDouble.onclick = doubleDown;

    return {
      destroy() { timers.forEach(clearTimeout); },
    };
  },
});

/* ============================================================
   5. КОСТИ (DICE)
   ============================================================ */

Casino.registerGame({
  id: 'dice',
  name: 'Кости (Dice)',
  icon: '🎲',
  color: '#39ff14',
  desc: 'Два кубика: малый/большой, семёрка, дубль или точная сумма.',
  mount(box) {
    const EXACT = [0, 0, 36, 18, 12, 9, 7, 6, 7, 9, 12, 18, 36];

    const diceScreen = C().el('div', 'dice-screen');
    box.appendChild(diceScreen);

    const diceRow = C().el('div', 'dice-dice');
    const dieA = C().el('div', 'die');
    const dieB = C().el('div', 'die');
    diceRow.appendChild(dieA);
    diceRow.appendChild(dieB);
    diceScreen.appendChild(diceRow);

    const options = [
      { key: 'low', name: 'Малый (2–6)', pay: '×2' },
      { key: 'seven', name: 'Семь (7)', pay: '×5' },
      { key: 'high', name: 'Большой (8–12)', pay: '×2' },
      { key: 'double', name: 'Дубль', pay: '×9' },
    ];

    const optBets = {};
    const optRow = C().el('div', 'dice-options');
    const inputs = {};
    options.forEach((o) => {
      const cell = C().el('div', 'dice-opt', `
        <div class="do-name">${o.name}</div>
        <div class="do-pay">Выплата <b>${o.pay}</b></div>
      `);
      const inp = C().el('input', 'do-bet', '');
      inp.type = 'number';
      inp.min = '1';
      inp.value = '0';
      inp.placeholder = 'Ставка';
      inputs[o.key] = inp;
      cell.appendChild(inp);
      optRow.appendChild(cell);
    });

    const exactCell = C().el('div', 'dice-opt', `
      <div class="do-name">Точная сумма</div>
      <div class="do-pay">Выплата по шансу</div>
    `);
    const sel = C().el('select', 'do-bet', '');
    sel.style.width = '110px';
    const none = document.createElement('option');
    none.value = '0';
    none.textContent = '— нет —';
    sel.appendChild(none);
    for (let s = 2; s <= 12; s++) {
      const op = document.createElement('option');
      op.value = s;
      op.textContent = s + ' (×' + EXACT[s] + ')';
      sel.appendChild(op);
    }
    exactCell.appendChild(sel);
    inputs.exact = sel;
    optRow.appendChild(exactCell);
    diceScreen.appendChild(optRow);

    const actions = C().el('div', 'actions');
    const btnRoll = C().el('button', 'btn neon', '🎲 Бросить кости');
    actions.appendChild(btnRoll);
    diceScreen.appendChild(actions);
    const ap = C().autoplay({ container: actions, getBtn: () => btnRoll });

    const result = C().resultEl(diceScreen);

    let rolling = false;
    const timers = [];

    function showDice(a, b) {
      const render = (die, v) => {
        die.innerHTML = '';
        const dots = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[v];
        for (let i = 0; i < 9; i++) {
          const pip = C().el('div', 'pip');
          if (dots.includes(i)) pip.classList.add('show');
          die.appendChild(pip);
        }
      };
      render(dieA, a);
      render(dieB, b);
    }
    showDice(1, 1);

    function totalBet() {
      return Object.values(inputs).reduce((s, i) => s + Math.max(0, Math.floor(Number(i.value) || 0)), 0);
    }

    function rollDice() { return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]; }

    function luckyDice(inputs) {
      const opts = [];
      if (+inputs.low.value > 0) opts.push({ type: 'range', min: 2, max: 6 });
      if (+inputs.high.value > 0) opts.push({ type: 'range', min: 8, max: 12 });
      if (+inputs.seven.value > 0) opts.push({ type: 'exact', v: 7 });
      if (+inputs.double.value > 0) opts.push({ type: 'double' });
      if (+inputs.exact.value > 0) opts.push({ type: 'exact', v: Math.min(12, Math.max(2, +inputs.exact.value)) });
      if (!opts.length) return rollDice();
      const o = opts[Math.floor(Math.random() * opts.length)];
      if (o.type === 'range') {
        const sum = o.min + Math.floor(Math.random() * (o.max - o.min + 1));
        const a = (sum > 7 ? sum - 6 : 1) + Math.floor(Math.random() * (Math.min(6, sum - 1) - (sum > 7 ? sum - 6 : 1) + 1));
        return [a, sum - a];
      }
      if (o.type === 'exact') {
        const a = (o.v > 7 ? o.v - 6 : 1) + Math.floor(Math.random() * (Math.min(6, o.v - 1) - (o.v > 7 ? o.v - 6 : 1) + 1));
        return [a, o.v - a];
      }
      const d = 1 + Math.floor(Math.random() * 6);
      return [d, d];
    }

    function roll() {
      if (rolling) return;
      const total = totalBet();
      if (total <= 0) return C().notify('Укажите хотя бы одну ставку', 'warn');
      const d = C().deductBet(total);
      if (!d.ok) return C().notify(d.msg, 'warn');

      rolling = true;
      btnRoll.disabled = true;
      dieA.classList.add('rolling');
      dieB.classList.add('rolling');
      result.set('Бросаем...', 'info');

      const spinT = setInterval(() => {
        showDice(1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6));
      }, 80);
      timers.push(spinT);

      timers.push(setTimeout(() => {
        clearInterval(spinT);
        const [a, b] = lucky() ? luckyDice(inputs) : rollDice();
        const sum = a + b;
        dieA.classList.remove('rolling');
        dieB.classList.remove('rolling');
        showDice(a, b);

        let payout = 0;
        if (inputs.low.value > 0 && sum >= 2 && sum <= 6) payout += +inputs.low.value * 2;
        if (inputs.high.value > 0 && sum >= 8 && sum <= 12) payout += +inputs.high.value * 2;
        if (inputs.seven.value > 0 && sum === 7) payout += +inputs.seven.value * 5;
        if (inputs.double.value > 0 && a === b) payout += +inputs.double.value * 9;
        if (inputs.exact.value > 0 && sum === +sel.value) payout += +inputs.exact.value * EXACT[sum];

        if (payout > 0) {
          C().pay(payout);
          result.set(`Выпало: ${a} + ${b} = ${sum}. Выигрыш: ${C().fmt(payout)}`, 'win');
        } else {
          result.set(`Выпало: ${a} + ${b} = ${sum}. Проигрыш`, 'lose');
        }
        C().resolveGame(total, payout);
        rolling = false;
        btnRoll.disabled = false;
      }, 900));
    }

    btnRoll.onclick = roll;

    return {
      destroy() { timers.forEach(clearTimeout); ap.stop(); },
    };
  },
});

/* ============================================================
   6. CRASH
   ============================================================ */

Casino.registerGame({
  id: 'crash',
  name: 'Crash',
  icon: '🚀',
  color: '#ffd700',
  desc: 'Множитель растёт до взрыва. Заберите выигрыш вовремя!',
  mount(box) {
    const { bar, input, getBet } = C().betControls(box, { defaultBet: 20 });

    const screen = C().el('div', 'crash-screen');
    box.appendChild(screen);

    const disp = C().el('div', 'crash-display', '1.00×');
    screen.appendChild(disp);

    const barEl = C().el('div', 'crash-bar', '<div class="fill" id="crashFill"></div>');
    screen.appendChild(barEl);

    const actions = C().el('div', 'actions');
    const btnStart = C().el('button', 'btn neon', '🚀 Играть');
    const btnCash = C().el('button', 'btn pink', '💵 Забрать');
    btnCash.disabled = true;
    actions.appendChild(btnStart);
    actions.appendChild(btnCash);
    screen.appendChild(actions);

    const result = C().resultEl(screen);

    let playing = false;
    let mult = 1;
    let crashPoint = 0;
    let tick = null;
    let bet = 0;
    let fill = null;

    function start() {
      if (playing) return;
      bet = getBet();
      const d = C().deductBet(bet);
      if (!d.ok) return C().notify(d.msg, 'warn');

      playing = true;
      mult = 1;
      crashPoint = 1 + 99 * Math.pow(Math.random(), lucky() ? 1.6 : 3);
      btnStart.disabled = true;
      btnCash.disabled = false;
      input.disabled = true;
      disp.className = 'crash-display play';
      disp.textContent = '1.00×';
      fill = screen.querySelector('#crashFill');
      fill.style.width = '0%';
      result.set('Множитель растёт...', 'info');

      tick = setInterval(() => {
        mult *= 1.04;
        disp.textContent = mult.toFixed(2) + '×';
        fill.style.width = Math.min(100, Math.max(0, (mult - 1) / (crashPoint - 1)) * 100) + '%';
        if (mult >= crashPoint) {
          clearInterval(tick);
          disp.className = 'crash-display crash';
          disp.textContent = crashPoint.toFixed(2) + '× 💥';
          result.set('Краш! Ставка сгорела.', 'lose');
          C().resolveGame(bet, 0);
          reset();
        }
      }, 40);
    }

    function cashout() {
      if (!playing) return;
      clearInterval(tick);
      const payout = Math.floor(bet * mult);
      C().pay(payout);
      disp.className = 'crash-display cashout';
      result.set('Забрали ' + mult.toFixed(2) + '× · Выигрыш: ' + C().fmt(payout), 'win');
      C().resolveGame(bet, payout);
      reset();
    }

    function reset() {
      playing = false;
      btnStart.disabled = false;
      btnCash.disabled = true;
      input.disabled = false;
    }

    btnStart.onclick = start;
    btnCash.onclick = cashout;

    return {
      destroy() { if (tick) clearInterval(tick); },
    };
  },
});

/* ============================================================
   7. ПЛИНКО
   ============================================================ */

Casino.registerGame({
  id: 'plinko',
  name: 'Плинко',
  icon: '🔮',
  color: '#00e5ff',
  desc: 'Шарик летит сквозь штыри. Выберите риск и ловите множитель!',
  mount(box) {
    const ROWS = 12;
    const COLS = ROWS + 1;
    const W = 420, H = 560;
    const padX = 34, pegTop = 90, rowGap = 34, pegR = 4, ballR = 9;

    const TABLES = {
      low: [0.5, 0.7, 1, 1.2, 1.5, 2, 3, 2, 1.5, 1.2, 1, 0.7, 0.5],
      medium: [0.4, 0.5, 0.8, 1.2, 2, 3, 5, 3, 2, 1.2, 0.8, 0.5, 0.4],
      high: [0.2, 0.3, 0.5, 1, 2, 5, 15, 5, 2, 1, 0.5, 0.3, 0.2],
    };
    const spacing = (W - padX * 2) / ROWS;
    const slotX = (i) => padX + i * spacing;

    const { bar, getBet } = C().betControls(box, { defaultBet: 10 });

    const wrap = C().el('div', 'plinko-wrap');
    box.appendChild(wrap);

    const riskRow = C().el('div', 'risk-select');
    let risk = 'medium';
    const riskBtns = {};
    [['low', 'Низкий'], ['medium', 'Средний'], ['high', 'Высокий']].forEach(([k, lbl]) => {
      const b = C().el('button', 'risk-btn btn' + (k === risk ? ' active' : ''), lbl);
      b.onclick = () => {
        risk = k;
        Object.entries(riskBtns).forEach(([key, btn]) => btn.classList.toggle('active', key === k));
        draw();
      };
      riskBtns[k] = b;
      riskRow.appendChild(b);
    });
    wrap.appendChild(riskRow);

    const canvas = C().el('canvas', 'plinko-canvas');
    canvas.width = W;
    canvas.height = H;
    wrap.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const actions = C().el('div', 'actions');
    const btnDrop = C().el('button', 'btn neon', '🔮 Бросить шарик');
    actions.appendChild(btnDrop);
    wrap.appendChild(actions);
    const ap = C().autoplay({ container: actions, getBtn: () => btnDrop });

    const result = C().resultEl(wrap);

    let ball = null;
    let raf = null;
    let dropping = false;
    const timers = [];

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#150327';
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(1, 1, W - 2, H - 2);

      for (let r = 0; r < ROWS; r++) {
        for (let j = 0; j <= r; j++) {
          const x = padX + j * spacing;
          const y = pegTop + r * rowGap;
          ctx.beginPath();
          ctx.arc(x, y, pegR, 0, Math.PI * 2);
          ctx.fillStyle = '#a855f7';
          ctx.shadowColor = '#a855f7';
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      const table = TABLES[risk];
      for (let i = 0; i < COLS; i++) {
        const x = slotX(i);
        const y = H - 34;
        ctx.fillStyle = i % 2 ? '#1c0a33' : '#240f42';
        ctx.fillRect(x - spacing / 2, y, spacing, 34);
        ctx.fillStyle = table[i] >= 1 ? '#39ff14' : '#ff3860';
        ctx.font = '10px Orbitron';
        ctx.textAlign = 'center';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;
        ctx.fillText(table[i] + '×', x, y + 21);
        ctx.shadowBlur = 0;
      }

      if (ball) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ballR, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function luckyBin(table) {
      const good = table.map((m, i) => ({ i, m })).filter((x) => x.m > 1);
      if (!good.length) return Math.floor(Math.random() * table.length);
      return weightedPick(good, (x) => x.m).i;
    }

    function drop() {
      if (dropping) return;
      const bet = getBet();
      const d = C().deductBet(bet);
      if (!d.ok) return C().notify(d.msg, 'warn');

      dropping = true;
      btnDrop.disabled = true;
      result.set('Шарик летит...', 'info');

      let idx = 0;
      const dirs = [];
      for (let r = 0; r < ROWS; r++) {
        const move = Math.random() < 0.5 ? 1 : -1;
        if (idx + move >= 0 && idx + move <= r + 1) idx += move;
        dirs.push(idx);
      }
      let finalIdx = idx;
      if (lucky()) {
        const table = TABLES[risk];
        const target = luckyBin(table);
        finalIdx = target;
        const path = [];
        let cur = 0;
        for (let r = 0; r < ROWS; r++) {
          const tgt = Math.max(0, Math.min(r + 1, target));
          let mv;
          if (tgt > cur) mv = 1;
          else if (tgt < cur) mv = -1;
          else mv = 0;
          cur = Math.max(0, Math.min(r + 1, cur + mv));
          path.push(cur);
        }
        finalIdx = target;
        dirs.length = 0;
        dirs.push(...path);
      }

      ball = { x: W / 2, y: pegTop - 40, row: 0, prevX: W / 2 };
      let last = performance.now();
      const speed = 8;

      const step = (now) => {
        const dt = (now - last) / 1000;
        last = now;
        ball.y += speed * dt * 60;
        const r = ball.row;
        if (ball.y >= pegTop + r * rowGap && r < ROWS) {
          const targetX = slotX(dirs[r]);
          ball.x = targetX;
          ball.row = r + 1;
          if (ball.row <= ROWS) ball.prevX = targetX;
        }
        draw();
        if (ball.y < H - 34 - ballR && ball.row <= ROWS) {
          raf = requestAnimationFrame(step);
        } else {
          raf = null;
          ball.x = slotX(finalIdx);
          draw();
          finish(bet, finalIdx);
        }
      };
      raf = requestAnimationFrame(step);
    }

    function finish(bet, idx) {
      const table = TABLES[risk];
      const mult = table[idx];
      const payout = Math.round(bet * mult);
      if (payout > 0) {
        C().pay(payout);
        result.set(`Слот ${idx + 1}: ×${mult}. Выигрыш: ${C().fmt(payout)}`, 'win');
      } else {
        result.set(`Слот ${idx + 1}: ×${mult}. Проигрыш`, 'lose');
      }
      C().resolveGame(bet, payout);
      dropping = false;
      btnDrop.disabled = false;
      timers.push(setTimeout(() => { ball = null; draw(); }, 900));
    }

    btnDrop.onclick = drop;
    draw();

    return {
      destroy() { if (raf) cancelAnimationFrame(raf); timers.forEach(clearTimeout); ap.stop(); },
    };
  },
});

/* ============================================================
   8. КОЛЕСО ФОРТУНЫ
   ============================================================ */

Casino.registerGame({
  id: 'wheel',
  name: 'Колесо фортуны',
  icon: '🎯',
  color: '#ffd700',
  desc: 'Крутите колесо: сектора с множителями до ×10.',
  mount(box) {
    const SEGS = [1, 2, 5, 1, 0.5, 3, 1, 10, 0.5, 2, 1, 0.5];
    const N = SEGS.length;
    const seg = 360 / N;
    const W = 340, CEN = W / 2, R = 150;

    const { bar, getBet } = C().betControls(box, { defaultBet: 10 });

    const wrap = C().el('div', 'wheel-wrap');
    box.appendChild(wrap);

    const canvas = C().el('canvas', 'wheel-canvas');
    canvas.width = W;
    canvas.height = W;
    wrap.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const actions = C().el('div', 'actions');
    const btnSpin = C().el('button', 'btn neon', '🎯 Крутить');
    actions.appendChild(btnSpin);
    wrap.appendChild(actions);
    const ap = C().autoplay({ container: actions, getBtn: () => btnSpin });

    const result = C().resultEl(wrap);

    let rot = 0;
    let spinning = false;
    let raf = null;
    const timers = [];

    function drawWheel() {
      ctx.clearRect(0, 0, W, W);
      ctx.fillStyle = '#0b0116';
      ctx.fillRect(0, 0, W, W);

      for (let i = 0; i < N; i++) {
        const start = (i * seg + rot) * Math.PI / 180;
        const end = ((i + 1) * seg + rot) * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(CEN, CEN);
        ctx.arc(CEN, CEN, R, start, end);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? '#ff2d95' : '#1c0a33';
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.translate(CEN, CEN);
        ctx.rotate(start + seg * Math.PI / 360);
        ctx.textAlign = 'right';
        ctx.fillStyle = i % 2 ? '#fff' : '#ffd700';
        ctx.font = 'bold 17px Orbitron';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText((SEGS[i]) + '×', R - 12, 6);
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(CEN, CEN, 34, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd700';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(CEN, 6);
      ctx.lineTo(CEN - 10, 0);
      ctx.lineTo(CEN + 10, 0);
      ctx.closePath();
      ctx.fillStyle = '#ff3860';
      ctx.shadowColor = '#ff3860';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function luckyIdx(segs) {
      const good = segs.map((m, i) => ({ i, m })).filter((x) => x.m > 1);
      if (!good.length) return Math.floor(Math.random() * segs.length);
      return weightedPick(good, (x) => x.m).i;
    }

    function spin() {
      if (spinning) return;
      const bet = getBet();
      const d = C().deductBet(bet);
      if (!d.ok) return C().notify(d.msg, 'warn');

      spinning = true;
      btnSpin.disabled = true;
      result.set('Крутим...', 'info');

      const idx = lucky() ? luckyIdx(SEGS) : Math.floor(Math.random() * N);
      const target = 255 - idx * seg;
      const norm = ((target % 360) + 360) % 360;
      const finalRot = rot + 360 * 6 + ((norm - (rot % 360) + 360) % 360);

      const duration = 4200;
      const startRot = rot;
      const start = performance.now();

      const animate = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        rot = startRot + (finalRot - startRot) * ease;
        drawWheel();
        if (t < 1) {
          raf = requestAnimationFrame(animate);
        } else {
          raf = null;
          const mult = SEGS[idx];
          const payout = Math.round(bet * mult);
          if (payout > 0) {
            C().pay(payout);
            result.set('Сектор ×' + mult + '. Выигрыш: ' + C().fmt(payout), 'win');
          } else {
            result.set('Сектор ×' + mult + '. Проигрыш', 'lose');
          }
          C().resolveGame(bet, payout);
          spinning = false;
          btnSpin.disabled = false;
        }
      };
      raf = requestAnimationFrame(animate);
    }

    btnSpin.onclick = spin;
    drawWheel();

    return {
      destroy() { if (raf) cancelAnimationFrame(raf); timers.forEach(clearTimeout); ap.stop(); },
    };
  },
});

/* ============================================================
   9. ХАЙЛО
   ============================================================ */

Casino.registerGame({
  id: 'hilo',
  name: 'Хайло',
  icon: '↕️',
  color: '#39ff14',
  desc: 'Угадайте, будет ли следующая карта выше или ниже текущей. Равные карты — проигрыш.',
  mount(box) {
    const HPAY = { 2: 2, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 4, 9: 4, 10: 5, 11: 6, 12: 8, 13: 12, 14: 0 };
    const LPAY = { 2: 0, 3: 12, 4: 8, 5: 6, 6: 5, 7: 4, 8: 4, 9: 3, 10: 3, 11: 2, 12: 2, 13: 2, 14: 2 };

    const { bar, getBet } = C().betControls(box, { defaultBet: 10 });
    const screen = C().el('div', 'hilo-screen');
    box.appendChild(screen);

    const table = C().el('div', 'hilo-table');
    table.appendChild(C().el('div', 'hilo-current-label', 'Текущая карта'));
    const curCard = C().el('div', 'hilo-card');
    table.appendChild(curCard);
    const pays = C().el('div', 'hilo-pays');
    const payUp = C().el('div', 'hilo-pay up', '<div class="hp-dir">Выше</div><div class="hp-val">×1</div>');
    const payDown = C().el('div', 'hilo-pay down', '<div class="hp-dir">Ниже</div><div class="hp-val">×1</div>');
    pays.appendChild(payUp);
    pays.appendChild(payDown);
    table.appendChild(pays);
    screen.appendChild(table);

    const nextRow = C().el('div', 'hilo-next');
    nextRow.appendChild(C().el('div', 'hilo-next-label', 'Следующая карта:'));
    const nextCard = C().el('div', 'hilo-card');
    nextRow.appendChild(nextCard);
    screen.appendChild(nextRow);

    const actions = C().el('div', 'hilo-actions');
    const btnUp = C().el('button', 'btn neon', '⬆ Выше');
    const btnDown = C().el('button', 'btn pink', '⬇ Ниже');
    actions.appendChild(btnUp);
    actions.appendChild(btnDown);
    screen.appendChild(actions);

    const result = C().resultEl(screen);

    let deck = shuffle(newDeck());
    let current = deck.pop();
    let playing = false;
    const timers = [];

    function renderCurrent() {
      curCard.innerHTML = cardHTML(current);
      payUp.querySelector('.hp-val').textContent = '×' + HPAY[current.r];
      payDown.querySelector('.hp-val').textContent = '×' + LPAY[current.r];
      btnUp.disabled = HPAY[current.r] === 0;
      btnDown.disabled = LPAY[current.r] === 0;
      nextCard.innerHTML = '<div class="pcard back"></div>';
    }

    function drawMatching(deck, pred) {
      for (let i = deck.length - 1; i >= 0; i--) {
        if (pred(deck[i])) return deck.splice(i, 1)[0];
      }
      return null;
    }

    function play(dir) {
      if (playing) return;
      const bet = getBet();
      const d = C().deductBet(bet);
      if (!d.ok) return C().notify(d.msg, 'warn');
      playing = true;
      btnUp.disabled = true;
      btnDown.disabled = true;
      result.set('Открываем карту...', 'info');

      let next = null;
      if (lucky()) {
        next = drawMatching(deck, dir === 'up' ? (c) => c.r > current.r : (c) => c.r < current.r);
      }
      if (!next) next = deck.pop();
      if (deck.length < 6) deck = shuffle(newDeck());

      timers.push(setTimeout(() => {
        nextCard.innerHTML = cardHTML(next);
        let win = false;
        if (dir === 'up' && next.r > current.r) win = true;
        if (dir === 'down' && next.r < current.r) win = true;
        const pay = win ? bet * (dir === 'up' ? HPAY[current.r] : LPAY[current.r]) : 0;
        if (pay > 0) {
          C().pay(pay);
          result.set('Карта: ' + RANK_LABEL(next.r) + ' · Выигрыш: ' + C().fmt(pay), 'win');
        } else if (next.r === current.r) {
          result.set('Карта: ' + RANK_LABEL(next.r) + ' · Ничья — проигрыш', 'lose');
        } else {
          result.set('Карта: ' + RANK_LABEL(next.r) + ' · Проигрыш', 'lose');
        }
        C().resolveGame(bet, pay);
        current = next;
        playing = false;
        renderCurrent();
      }, 380));
    }

    btnUp.onclick = () => play('up');
    btnDown.onclick = () => play('down');
    renderCurrent();

    return {
      destroy() { timers.forEach(clearTimeout); },
    };
  },
});