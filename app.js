'use strict';

const Casino = (() => {
  const LS_KEY = 'neon_casino_v1';
  const START_BALANCE = 100;
  const MIN_BET = 1;
  const LOAN_RATE = 0.23;
  const DEPOSIT_RATE = 0.06;
  const INTEREST_EVERY = 5;
  const REBIRTH_COST = 1000000;
  const MAX_LUCK_BIAS = 1;
  const memStorage = {};

  const state = load();
  const games = {};

  /* ---------------- State / storage ---------------- */

  function storageGet(k) {
    try { if (typeof localStorage !== 'undefined') return localStorage.getItem(k); } catch (e) { /* ignore */ }
    return k in memStorage ? memStorage[k] : null;
  }

  function storageSet(k, v) {
    try { if (typeof localStorage !== 'undefined') { localStorage.setItem(k, v); return; } } catch (e) { /* ignore */ }
    memStorage[k] = v;
  }

  function storageRemove(k) {
    try { if (typeof localStorage !== 'undefined') { localStorage.removeItem(k); return; } } catch (e) { /* ignore */ }
    delete memStorage[k];
  }

  function defaultState() {
    return {
      balance: START_BALANCE,
      credit: 0,
      deposit: 0,
      gamesPlayed: 0,
      totalBet: 0,
      totalWin: 0,
      maxWin: 0,
      blocked: false,
      rebirths: 0,
      log: [],
      gameStats: {},
    };
  }

  let activeModule = null;
  let currentGame = null;

  function load() {
    try {
      const raw = storageGet(LS_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return defaultState();
  }

  function save() {
    storageSet(LS_KEY, JSON.stringify(state));
  }

  /* ---------------- Helpers ---------------- */

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };
  const fmt = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';

  function notify(msg, kind) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 350);
    }, 3400);
  }

  function addLog(kind, text) {
    state.log.push({ t: Date.now(), kind, text });
    if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
  }

  /* ---------------- UI ---------------- */

  function updateHeader() {
    $('#hBalance').textContent = fmt(state.balance);
    $('#hCredit').textContent = fmt(state.credit);
    $('#hDeposit').textContent = fmt(state.deposit);
    $('#hGames').textContent = state.gamesPlayed;
    $('#hProgress').textContent = (state.gamesPlayed % INTEREST_EVERY) + '/' + INTEREST_EVERY;
    $('#hRebirths').textContent = state.rebirths;
    $('#blockBanner').classList.toggle('hidden', !state.blocked);
  }

  function renderBank() {
    $('#bankCredit').textContent = fmt(state.credit);
    $('#bankDeposit').textContent = fmt(state.deposit);
    $('#bankRebirths').textContent = state.rebirths;
    $('#luckPct').textContent = Math.round(luckBias() * 100) + '%';
    const btn = $('#btnRebirth');
    if (btn) {
      btn.disabled = state.balance < REBIRTH_COST || state.rebirths >= 20;
      btn.textContent = state.rebirths >= 20 ? 'Максимум достигнут' : '✨ Переродиться за 1 000 000 ₽';
    }
  }

  function renderMenu() {
    const grid = $('#gameGrid');
    grid.innerHTML = '';
    Object.values(games).forEach((g) => {
      const card = el('div', 'game-card', `
        <div class="game-icon">${g.icon}</div>
        <div class="game-name">${g.name}</div>
        <div class="game-desc">${g.desc || ''}</div>
      `);
      card.style.setProperty('--gc', g.color);
      card.onclick = () => openGame(g.id);
      grid.appendChild(card);
    });

    const st = $('#stats');
    st.innerHTML = `
      <div class="stat"><span>Всего поставлено</span><b>${fmt(state.totalBet)}</b></div>
      <div class="stat"><span>Возвращено</span><b>${fmt(state.totalWin)}</b></div>
      <div class="stat"><span>Макс. выигрыш</span><b>${fmt(state.maxWin)}</b></div>
      <div class="stat"><span>Сыграно игр</span><b>${state.gamesPlayed}</b></div>
      <div class="stat"><span>Перерождений</span><b>${state.rebirths}</b></div>
    `;
  }

  function showMenu() {
    if (activeModule && activeModule.destroy) {
      try { activeModule.destroy(); } catch (e) { /* ignore */ }
    }
    activeModule = null;
    $('#viewGame').classList.add('hidden');
    $('#viewMenu').classList.remove('hidden');
    $('#btnHome').classList.add('hidden');
    renderMenu();
  }

  function openGame(id) {
    const g = games[id];
    if (!g) return;
    if (activeModule && activeModule.destroy) {
      try { activeModule.destroy(); } catch (e) { /* ignore */ }
    }
    currentGame = id;
    $('#viewMenu').classList.add('hidden');
    $('#viewGame').classList.remove('hidden');
    $('#btnHome').classList.remove('hidden');
    $('#gameTitle').textContent = g.icon + ' ' + g.name;
    const box = $('#gameBox');
    box.innerHTML = '';
    updateHeader();
    activeModule = g.mount(box);
  }

  /* ---------------- Banking ---------------- */

  function takeCredit(amount) {
    amount = Math.floor(Number(amount));
    if (!isFinite(amount) || amount < MIN_BET) return notify('Сумма не меньше ' + MIN_BET + ' ₽', 'warn');
    if (state.credit > 0) return notify('У вас уже есть активный кредит', 'warn');
    state.balance += amount;
    state.credit += amount;
    addLog('bank', 'Взят кредит: +' + fmt(amount));
    save(); updateHeader(); renderBank();
    notify('Кредит выдан: +' + fmt(amount), 'ok');
  }

  function repayCreditFull() {
    if (state.credit <= 0) return notify('Нет активного кредита', 'warn');
    const paid = Math.min(state.balance, state.credit);
    state.balance -= paid;
    state.credit -= paid;
    if (state.credit <= 0) {
      state.blocked = false;
      addLog('bank', 'Кредит полностью погашен: -' + fmt(paid));
      notify('Кредит полностью погашен', 'ok');
    } else {
      state.blocked = true;
      addLog('bank', 'Списано всё со счёта: -' + fmt(paid) + '. Остаток долга: ' + fmt(state.credit));
      notify('Списано всё со счёта. Остаток долга: ' + fmt(state.credit) + '. Игра заблокирована.', 'warn');
    }
    save(); updateHeader(); renderBank();
  }

  function repayCreditPartial(amount) {
    amount = Math.floor(Number(amount));
    if (!isFinite(amount) || amount < MIN_BET) return notify('Сумма не меньше ' + MIN_BET + ' ₽', 'warn');
    if (state.credit <= 0) return notify('Нет активного кредита', 'warn');
    if (amount > state.balance) return notify('Недостаточно средств на счёте', 'warn');
    const repay = Math.min(amount, state.credit);
    state.balance -= repay;
    state.credit -= repay;
    if (state.credit <= 0) {
      state.blocked = false;
      addLog('bank', 'Частичное погашение: -' + fmt(repay) + '. Долг погашен полностью');
      notify('Кредит полностью погашен', 'ok');
    } else {
      addLog('bank', 'Частичное погашение: -' + fmt(repay) + '. Остаток: ' + fmt(state.credit));
      notify('Погашено: ' + fmt(amount) + '. Остаток долга: ' + fmt(state.credit), 'ok');
    }
    save(); updateHeader(); renderBank();
  }

  function depositIn(amount) {
    amount = Math.floor(Number(amount));
    if (!isFinite(amount) || amount < MIN_BET) return notify('Сумма не меньше ' + MIN_BET + ' ₽', 'warn');
    if (amount > state.balance) return notify('Недостаточно средств на счёте', 'warn');
    state.balance -= amount;
    state.deposit += amount;
    addLog('bank', 'На депозит внесено: +' + fmt(amount));
    save(); updateHeader(); renderBank();
    notify('На депозит внесено: ' + fmt(amount), 'ok');
  }

  function depositOut(amount) {
    amount = Math.floor(Number(amount));
    if (!isFinite(amount) || amount < MIN_BET) return notify('Сумма не меньше ' + MIN_BET + ' ₽', 'warn');
    if (amount > state.deposit) return notify('Недостаточно средств на депозите', 'warn');
    state.deposit -= amount;
    state.balance += amount;
    addLog('bank', 'С депозита снято: +' + fmt(amount));
    save(); updateHeader(); renderBank();
    notify('С депозита снято: ' + fmt(amount), 'ok');
  }

  /* ---------------- Cheats ---------------- */

  function cheatAddMoney(amount) {
    amount = Math.floor(Number(amount));
    if (!isFinite(amount) || amount < 1) return notify('Введите сумму не меньше 1 ₽', 'warn');
    state.balance += amount;
    addLog('cheat', 'Чит: добавлено ' + fmt(amount));
    save(); updateHeader(); renderBank();
    notify('Чит: на счёт добавлено ' + fmt(amount), 'ok');
  }

  function cheatClearCredit() {
    if (state.credit <= 0) return notify('Долга нет', 'warn');
    state.credit = 0;
    state.blocked = false;
    addLog('cheat', 'Чит: долг по кредиту списан');
    save(); updateHeader(); renderBank();
    notify('Чит: долг по кредиту списан', 'ok');
  }

  /* ---------------- Luck / Rebirth ---------------- */

  // количество перерождений = уровень удачи
  function luck() {
    return state.rebirths || 0;
  }

  // шанс (0..1), с которым случайность "подкручивается" в пользу игрока
  function luckBias() {
    return Math.min(MAX_LUCK_BIAS, (state.rebirths || 0) * 0.05);
  }

  function doRebirth() {
    if (state.rebirths >= 20) return notify('Достигнут максимум перерождений (20)', 'warn');
    if (state.balance < REBIRTH_COST) return notify('Нужно ' + fmt(REBIRTH_COST) + ' для перерождения', 'warn');
    const r = state.rebirths + 1;
    state.balance = START_BALANCE;
    state.credit = 0;
    state.deposit = 0;
    state.gamesPlayed = 0;
    state.totalBet = 0;
    state.totalWin = 0;
    state.maxWin = 0;
    state.blocked = false;
    state.log = [];
    state.gameStats = {};
    state.rebirths = r;
    addLog('rebirth', '✨ Перерождение #' + r + '! Удача увеличена, начата новая игра.');
    save(); updateHeader(); renderBank(); renderMenu();
    notify('✨ Перерождение #' + r + '! Удача повышена, баланс сброшен до 100 ₽', 'ok');
  }

  /* ---------------- Interest / game stats ---------------- */

  function applyInterest() {
    let msg = 'Начислены проценты (каждые ' + INTEREST_EVERY + ' игр):';
    if (state.credit > 0) {
      const i = Math.round(state.credit * LOAN_RATE);
      state.credit += i;
      msg += ' долг +' + fmt(i) + ' (+23%).';
    }
    if (state.deposit > 0) {
      const i = Math.round(state.deposit * DEPOSIT_RATE);
      state.deposit += i;
      msg += ' депозит +' + fmt(i) + ' (+6%).';
    }
    if (state.credit > 0 || state.deposit > 0) {
      addLog('interest', msg);
      notify(msg, 'interest');
      save(); updateHeader(); renderBank();
    }
  }

  function registerGame(bet, payout) {
    state.gamesPlayed++;
    state.totalBet += bet;
    state.totalWin += payout;
    if (payout > state.maxWin) state.maxWin = payout;
    if (currentGame) {
      const s = state.gameStats[currentGame] || (state.gameStats[currentGame] = { played: 0, won: 0, bet: 0, win: 0, maxWin: 0 });
      s.played++;
      s.bet += bet;
      s.win += payout;
      if (payout > s.maxWin) s.maxWin = payout;
      if (payout > bet) s.won++;
      const name = games[currentGame] ? games[currentGame].name : currentGame;
      const profit = payout - bet;
      addLog('game', name + ': ставка ' + fmt(bet) + ', возврат ' + fmt(payout) + ' (' + (profit >= 0 ? '+' : '') + fmt(profit) + ')');
    }
    if (state.gamesPlayed % INTEREST_EVERY === 0) applyInterest();
    save(); updateHeader();
  }

  /* ---------------- Betting ---------------- */

  function canBet() {
    if (state.blocked) return { ok: false, msg: 'Игра заблокирована: остался долг по кредиту' };
    return { ok: true };
  }

  function deductBet(amount) {
    amount = Math.floor(Number(amount));
    if (!isFinite(amount) || amount < MIN_BET) return { ok: false, msg: 'Минимальная ставка ' + MIN_BET + ' ₽' };
    const c = canBet();
    if (!c.ok) return c;
    if (amount > state.balance) return { ok: false, msg: 'Недостаточно средств на счёте' };
    state.balance -= amount;
    save(); updateHeader();
    return { ok: true, amount };
  }

  function pay(amount) {
    state.balance += Math.round(amount);
    save(); updateHeader();
  }

  function resolveGame(bet, payout) {
    registerGame(bet, Math.round(payout));
  }

  /* ---------------- Bet controls ---------------- */

  function betControls(container, opts) {
    const o = opts || {};
    const bar = el('div', 'betbar', `
      <label class="bet-label">СТАВКА</label>
      <input type="number" class="bet-input" value="${o.defaultBet || 10}" min="1" step="1">
      <button class="btn ghost btn-half">½</button>
      <button class="btn ghost btn-x2">×2</button>
      <button class="btn ghost btn-all">ВСЁ</button>
    `);
    const input = bar.querySelector('.bet-input');
    bar.querySelector('.btn-half').onclick = () => { input.value = Math.max(1, Math.floor(input.value / 2)); };
    bar.querySelector('.btn-x2').onclick = () => { input.value = Math.max(1, Math.floor(input.value * 2)); };
    bar.querySelector('.btn-all').onclick = () => { input.value = Math.max(MIN_BET, Math.floor(state.balance)); };
    const getBet = () => {
      const v = Math.floor(Number(input.value));
      return (isFinite(v) && v >= MIN_BET) ? v : MIN_BET;
    };
    if (container) container.appendChild(bar);
    return { bar, input, getBet };
  }

  function resultEl(container) {
    const r = el('div', 'result-line');
    if (container) container.appendChild(r);
    const set = (txt, kind) => {
      r.className = 'result-line' + (kind ? ' ' + kind : '');
      r.textContent = txt;
    };
    return { r, set };
  }

  function autoplay(opts) {
    const wrap = el('div', 'autoplay', `
      <label class="ap-label">АВТО</label>
      <input type="number" class="ap-input" value="10" min="1" step="1">
      <button class="btn ghost ap-toggle">▶ Авто</button>
    `);
    const input = wrap.querySelector('.ap-input');
    const btn = wrap.querySelector('.ap-toggle');
    let active = false;
    let remaining = 0;
    let timer = null;

    function tick() {
      if (!active) return;
      if (remaining <= 0) { stop(); return; }
      if (state.blocked || state.balance < MIN_BET) {
        notify('Автоигра остановлена: нет средств', 'warn');
        stop();
        return;
      }
      const action = opts.getBtn ? opts.getBtn() : null;
      if (!action || action.disabled) { timer = setTimeout(tick, 300); return; }
      action.click();
      remaining--;
      timer = setTimeout(tick, 700);
    }

    function start() {
      if (active) return;
      remaining = Math.max(1, Math.floor(Number(input.value) || 10));
      active = true;
      btn.textContent = '⏹ Стоп';
      btn.classList.add('ap-active');
      input.disabled = true;
      tick();
    }

    function stop() {
      active = false;
      if (timer) clearTimeout(timer);
      timer = null;
      btn.textContent = '▶ Авто';
      btn.classList.remove('ap-active');
      input.disabled = false;
    }

    btn.onclick = () => (active ? stop() : start());
    if (opts.container) opts.container.appendChild(wrap);
    return { start, stop, isActive: () => active };
  }

  function renderHistory() {
    const list = $('#historyList');
    list.innerHTML = '';
    if (!state.log.length) {
      list.appendChild(el('div', 'log-empty', 'Операций пока нет. Сыграйте в игру или загляните в банк.'));
      return;
    }
    [...state.log].reverse().forEach((e) => {
      const d = new Date(e.t);
      const time = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
      const row = el('div', 'log-row log-' + e.kind, `<span class="log-time">${time}</span><span class="log-text">${e.text}</span>`);
      list.appendChild(row);
    });
  }

  function renderStats() {
    const tbody = $('#statsBody');
    tbody.innerHTML = '';
    if (!Object.keys(state.gameStats).length) {
      tbody.appendChild(el('tr', '', '<td colspan="8">Пока нет данных. Сыграйте в любую игру.</td>'));
      return;
    }
    Object.entries(state.gameStats).forEach(([id, s]) => {
      const name = games[id] ? games[id].name : id;
      const rtp = s.bet > 0 ? Math.round((s.win / s.bet) * 100) + '%' : '—';
      const wr = s.played > 0 ? Math.round((s.won / s.played) * 100) + '%' : '—';
      const row = el('tr', '',
        `<td>${name}</td><td>${s.played}</td><td>${s.won}</td><td>${fmt(s.bet)}</td><td>${fmt(s.win)}</td><td>${rtp}</td><td>${wr}</td><td>${fmt(s.maxWin)}</td>`);
      tbody.appendChild(row);
    });
  }

  /* ---------------- Init ---------------- */

  function init() {
    updateHeader();
    renderBank();
    showMenu();

    $('#btnBank').onclick = () => { renderBank(); $('#bankModal').classList.remove('hidden'); };
    $('#btnCloseBank').onclick = () => $('#bankModal').classList.add('hidden');
    $('#bankModal').addEventListener('click', (e) => { if (e.target.id === 'bankModal') $('#bankModal').classList.add('hidden'); });
    $('#btnHome').onclick = showMenu;

    $('#btnCheats').onclick = () => $('#cheatModal').classList.remove('hidden');
    $('#btnCloseCheats').onclick = () => $('#cheatModal').classList.add('hidden');
    $('#cheatModal').addEventListener('click', (e) => { if (e.target.id === 'cheatModal') $('#cheatModal').classList.add('hidden'); });
    $('#btnCheatAdd').onclick = () => cheatAddMoney($('#cheatAmount').value);
    $('#btnCheatAdd1000').onclick = () => cheatAddMoney(1000);
    $('#btnCheatAdd10000').onclick = () => cheatAddMoney(10000);
    $('#btnCheatClearCredit').onclick = cheatClearCredit;

    $('#btnHistory').onclick = () => { renderHistory(); $('#historyModal').classList.remove('hidden'); };
    $('#btnCloseHistory').onclick = () => $('#historyModal').classList.add('hidden');
    $('#historyModal').addEventListener('click', (e) => { if (e.target.id === 'historyModal') $('#historyModal').classList.add('hidden'); });

    $('#btnStats').onclick = () => { renderStats(); $('#statsModal').classList.remove('hidden'); };
    $('#btnCloseStats').onclick = () => $('#statsModal').classList.add('hidden');
    $('#statsModal').addEventListener('click', (e) => { if (e.target.id === 'statsModal') $('#statsModal').classList.add('hidden'); });

    $('#btnTakeCredit').onclick = () => takeCredit($('#creditAmount').value);
    $('#btnRepayFull').onclick = repayCreditFull;
    $('#btnRepayPartial').onclick = () => repayCreditPartial($('#repayAmount').value);
    $('#btnDepositIn').onclick = () => depositIn($('#depositInAmount').value);
    $('#btnDepositOut').onclick = () => depositOut($('#depositOutAmount').value);
    $('#btnRebirth').onclick = doRebirth;

    $('#btnReset').onclick = () => {
      if (!confirm('Сбросить весь прогресс и начать заново?')) return;
      storageRemove(LS_KEY);
      Object.assign(state, defaultState());
      save(); updateHeader(); renderBank();
      if (activeModule) { activeModule.destroy(); }
      showMenu();
      notify('Прогресс сброшен', 'ok');
    };
  }

  /* ---------------- Public API ---------------- */

  return {
    init,
    registerGame: (def) => { games[def.id] = def; },
    games,
    openGame,
    showMenu,
    $, el, fmt, notify,
    betControls,
    resultEl,
    autoplay,
    deductBet,
    pay,
    resolveGame,
    canBet,
    takeCredit,
    repayCreditFull,
    repayCreditPartial,
    depositIn,
    depositOut,
    applyInterest,
    cheatAddMoney,
    cheatClearCredit,
    doRebirth,
    luck,
    luckBias,
    getState: () => state,
    MIN_BET,
    LOAN_RATE,
    DEPOSIT_RATE,
    INTEREST_EVERY,
    REBIRTH_COST,
    MAX_LUCK_BIAS,
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Casino.init);
} else {
  Casino.init();
}