/* =========================================================
   KRISHWAVE AI BEAST V6.2
   ---------------------------------------------------------
   DEMO / PAPER MODE
   - Live Tick Price Charting & Digit Distribution
   - AI Bot & Manual Trading Engine Switcher
   - Full 6-Strategy Radio Selector Modal (Matches, Differs, Even, Odd, Over, Under)
   - Card-Based Trading History with Profit/Loss Tracking
   ========================================================= */

"use strict";

/* ================= CONFIG ================= */

const DERIV_CLIENT_ID = "34khasPjsT0PCRR8X3Z70";
const REDIRECT_URI = "https://chrispusatale99-dot.github.io/KRISHWAVE/";
const OAUTH_BACKEND = "https://krishwave-oauth.chrispusatale99.workers.dev";
const PUBLIC_WS = "wss://api.derivws.com/trading/v1/options/ws/public";

const MARKETS = [
  "R_10",
  "R_25",
  "R_50",
  "R_75",
  "R_100",
  "1HZ10V",
  "1HZ25V",
  "1HZ30V",
  "1HZ50V",
  "1HZ75V",
  "1HZ90V",
  "1HZ100V",
  "1HZ150V",
  "1HZ250V",
  "1HZ1000V"
];

/* ================= STATE ================= */

const state = {
  connected: false,
  accessToken: null,
  accountId: null,
  currency: null,

  engineMode: "ai", // "ai" or "manual"
  selectedStrategy: "MATCHES", // "MATCHES", "DIFFERS", "EVEN", "ODD", "OVER", "UNDER"
  selectedMarket: "R_10",

  markets: {},
  priceHistory: [],

  aiRunning: false,
  aiPhase: "IDLE",
  phaseToken: 0,
  prediction: null,
  predictionConfidence: 0,
  predictionMarket: null,

  paperRunning: false,
  activePaperTrade: null,

  history: [],
  totalProfit: 0.00,
  paperBalance: null,

  publicWS: null,
  demoWS: null
};

const $ = id => document.getElementById(id);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ================= INITIALIZE ================= */

document.addEventListener("DOMContentLoaded", () => {
  loadHistory();
  loadTheme();
  buildInitialMarkets();
  bindNavigation();
  bindControls();
  bindStrategyModal();
  bindEngineTabs();
  bindManualControls();
  renderHistory();
  updateStats();
  connectPublicMarket();
  checkOAuthCallback();
});

/* ================= NAVIGATION ================= */

function bindNavigation() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;

      document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
      });

      const target = $(page + "Page");
      if (target) target.classList.add("active");

      document.querySelectorAll(".nav-btn").forEach(b => {
        b.classList.remove("active");
      });

      btn.classList.add("active");

      if (page === "trade") {
        updateChart();
        renderDigitStats();
      }

      if (page === "history") {
        renderHistory();
        updateStats();
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* ================= CONTROLS & ENGINE SWITCHER ================= */

function bindControls() {
  $("themeToggle")?.addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem(
      "krishwave_theme",
      document.body.classList.contains("light") ? "light" : "dark"
    );
  });

  $("startBotBtn")?.addEventListener("click", () => {
    if (!state.aiRunning) startAICycle();
    else stopAI();
  });

  $("clearLogsBtn")?.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear trading logs?")) {
      state.history = [];
      state.totalProfit = 0.00;
      saveHistory();
      renderHistory();
      updateStats();
    }
  });
}

function bindEngineTabs() {
  const aiTab = $("tabAiBot");
  const manualTab = $("tabManual");
  const aiContent = $("aiBotContent");
  const manualContent = $("manualContent");

  aiTab?.addEventListener("click", () => {
    state.engineMode = "ai";
    aiTab.classList.add("active");
    manualTab?.classList.remove("active");
    if (aiContent) aiContent.style.display = "block";
    if (manualContent) manualContent.style.display = "none";
  });

  manualTab?.addEventListener("click", () => {
    state.engineMode = "manual";
    manualTab.classList.add("active");
    aiTab?.classList.remove("active");
    if (aiContent) aiContent.style.display = "none";
    if (manualContent) manualContent.style.display = "block";
  });
}

/* ================= MANUAL ENGINE CONTROLS ================= */

function bindManualControls() {
  const manualStrategyTrigger = $("manualStrategyTrigger");
  manualStrategyTrigger?.addEventListener("click", () => {
    const modal = $("strategyModal");
    if (modal) modal.style.display = "flex";
  });

  const placeTradeBtn = $("placeTradeBtn");
  placeTradeBtn?.addEventListener("click", () => {
    executeManualTrade();
  });
}

function executeManualTrade() {
  const targetDigit = Number($("manualTargetDigitInput")?.value ?? 4);
  const stake = Number($("manualStakeInput")?.value ?? 10);

  const trade = {
    id: Date.now(),
    time: new Date().toLocaleTimeString(),
    market: formatMarketName(state.selectedMarket),
    strategy: state.selectedStrategy,
    prediction: targetDigit,
    stake: stake,
    result: null,
    status: "PENDING",
    profit: 0
  };

  state.activePaperTrade = trade;
  setText("manualStatusText", `Trade placed [${state.selectedStrategy}] for digit ${targetDigit}...`);
}

/* ================= STRATEGY MODAL PICKER ================= */

function bindStrategyModal() {
  const triggerAI = $("strategyTrigger");
  const triggerManual = $("manualStrategyTrigger");
  const modal = $("strategyModal");
  const options = document.querySelectorAll(".strategy-option");
  const targetDigitField = $("targetDigitContainer");

  const openModal = () => { if (modal) modal.style.display = "flex"; };

  triggerAI?.addEventListener("click", openModal);
  triggerManual?.addEventListener("click", openModal);

  options.forEach(opt => {
    opt.addEventListener("click", () => {
      const val = opt.dataset.strategy;
      const label = opt.dataset.label || val;
      state.selectedStrategy = val;

      options.forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");

      setText("selectedStrategyLabel", label);
      setText("manualSelectedStrategyLabel", label);

      // Hide or show Target Digit input based on strategy
      if (targetDigitField) {
        if (val === "EVEN" || val === "ODD") {
          targetDigitField.style.display = "none";
        } else {
          targetDigitField.style.display = "flex";
        }
      }

      if (modal) modal.style.display = "none";
    });
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      if (modal) modal.style.display = "none";
    }
  });
}

/* ================= THEME ================= */

function loadTheme() {
  if (localStorage.getItem("krishwave_theme") === "light") {
    document.body.classList.add("light");
  }
}

/* ================= INITIAL MARKETS ================= */

function buildInitialMarkets() {
  MARKETS.forEach(symbol => {
    state.markets[symbol] = {
      price: null,
      lastDigit: null,
      digits: Array(10).fill(0),
      ticks: [],
      updated: 0
    };
  });
}

/* ================= PUBLIC DERIV DATA ================= */

function connectPublicMarket() {
  try {
    state.publicWS = new WebSocket(PUBLIC_WS);
  } catch (e) {
    return;
  }

  state.publicWS.onopen = () => {
    MARKETS.forEach(symbol => {
      state.publicWS.send(JSON.stringify({
        ticks: symbol,
        subscribe: 1
      }));
    });
  };

  state.publicWS.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.tick) {
        processTick(msg.tick);
      }
    } catch (err) {}
  };

  state.publicWS.onclose = () => {
    setTimeout(() => {
      if (!state.publicWS || state.publicWS.readyState === WebSocket.CLOSED) {
        connectPublicMarket();
      }
    }, 3000);
  };
}

function processTick(tick) {
  const symbol = tick.symbol;
  if (!state.markets[symbol]) return;

  const price = Number(tick.quote);
  if (!Number.isFinite(price)) return;

  const str = String(price);
  const clean = str.replace(".", "");
  const digit = Number(clean.slice(-1));

  const m = state.markets[symbol];
  m.price = price;
  m.lastDigit = digit;
  m.digits[digit]++;
  m.ticks.push(digit);

  if (m.ticks.length > 100) m.ticks.shift();

  if (symbol === state.selectedMarket) {
    state.priceHistory.push(price);
    if (state.priceHistory.length > 30) state.priceHistory.shift();

    setText("currentChartMarket", formatMarketName(symbol));
    setText("currentLivePrice", price.toFixed(2));

    updateChart();
    renderDigitStats();
  }

  if (state.activePaperTrade) {
    evaluatePaperTradeTick(symbol, digit);
  }
}

function formatMarketName(symbol) {
  return symbol.replace("R_", "Volatility ").replace("1HZ", "Volatility ") + " Index";
}

/* ================= CHART & DIGIT STATS RENDERER ================= */

function updateChart() {
  const canvas = $("priceChartCanvas");
  if (!canvas || !state.priceHistory.length) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth;
  const height = canvas.height = canvas.clientHeight;

  ctx.clearRect(0, 0, width, height);

  const prices = state.priceHistory;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  ctx.beginPath();
  ctx.strokeStyle = "#6366f1";
  ctx.lineWidth = 2;

  prices.forEach((p, idx) => {
    const x = (idx / (prices.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 20) - 10;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

function renderDigitStats() {
  const box = $("digitStatsGrid");
  const m = state.markets[state.selectedMarket];
  if (!box || !m) return;

  const total = m.digits.reduce((a, b) => a + b, 0);
  if (!total) return;

  const percentages = m.digits.map(count => (count / total) * 100);
  const maxPct = Math.max(...percentages);
  const minPct = Math.min(...percentages);

  box.innerHTML = m.digits.map((count, d) => {
    const pct = ((count / total) * 100).toFixed(1);
    let statusClass = "";
    if (pct == maxPct && total > 10) statusClass = "highest";
    else if (pct == minPct && total > 10) statusClass = "lowest";

    return `
      <div class="digit-stat-circle ${statusClass}">
        <span class="digit-num">${d}</span>
        <span class="digit-pct">${pct}%</span>
      </div>
    `;
  }).join("");
}

/* ================= AI ENGINE & TRADE EXECUTION ================= */

async function startAICycle() {
  if (state.aiRunning) return;

  state.aiRunning = true;
  state.phaseToken++;
  const token = state.phaseToken;

  setText("engineStatusText", "ANALYZING MARKET DATA...");
  setText("startBotBtn", "Stop Trading Bot");

  while (state.aiRunning && token === state.phaseToken) {
    await sleep(2000);
    if (!state.aiRunning) break;

    const m = state.markets[state.selectedMarket];
    const targetDigit = m ? m.lastDigit : 5;

    executeTradeSignal(targetDigit);
    await sleep(3000);
  }
}

function stopAI() {
  state.aiRunning = false;
  state.phaseToken++;
  setText("engineStatusText", "AI Engine Ready to Start");
  setText("startBotBtn", "Start Trading Bot");
}

function executeTradeSignal(predictedDigit) {
  const stake = Number($("stakeInput")?.value || 10);
  const trade = {
    id: Date.now(),
    time: new Date().toLocaleTimeString(),
    market: formatMarketName(state.selectedMarket),
    strategy: state.selectedStrategy,
    prediction: predictedDigit,
    stake: stake,
    result: null,
    status: "PENDING",
    profit: 0
  };

  state.activePaperTrade = trade;
}

function evaluatePaperTradeTick(symbol, digit) {
  const trade = state.activePaperTrade;
  if (!trade) return;

  let win = false;
  let payoutMultiplier = 0.95; // Default payout ratio

  switch (trade.strategy) {
    case "MATCHES":
      win = (digit === trade.prediction);
      payoutMultiplier = 8.5; // Matches typically pays higher (e.g., 1 to 9 payout)
      break;
    case "DIFFERS":
      win = (digit !== trade.prediction);
      payoutMultiplier = 0.09; // Differs pays lower
      break;
    case "EVEN":
      win = (digit % 2 === 0);
      payoutMultiplier = 0.95;
      break;
    case "ODD":
      win = (digit % 2 !== 0);
      payoutMultiplier = 0.95;
      break;
    case "OVER":
      win = (digit > trade.prediction);
      payoutMultiplier = 0.95;
      break;
    case "UNDER":
      win = (digit < trade.prediction);
      payoutMultiplier = 0.95;
      break;
    default:
      win = (digit === trade.prediction);
  }

  const profit = win ? trade.stake * payoutMultiplier : -trade.stake;

  trade.status = win ? "WIN" : "LOSS";
  trade.profit = profit;
  trade.result = digit;

  state.history.unshift(trade);
  state.totalProfit += profit;
  state.activePaperTrade = null;

  if (state.engineMode === "manual") {
    setText("manualStatusText", "Manual trading active");
  }

  saveHistory();
  renderHistory();
  updateStats();
}

/* ================= HISTORY RENDERER ================= */

function loadHistory() {
  try {
    const raw = localStorage.getItem("krishwave_history");
    if (raw) {
      state.history = JSON.parse(raw);
      state.totalProfit = state.history.reduce((acc, item) => acc + (item.profit || 0), 0);
    }
  } catch (e) {
    state.history = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem("krishwave_history", JSON.stringify(state.history));
  } catch (e) {}
}

function renderHistory() {
  const list = $("historyCardsList");
  if (!list) return;

  setText("totalProfitDisplay", `Total Profit: $${state.totalProfit.toFixed(2)}`);

  if (!state.history.length) {
    list.innerHTML = `<div class="empty-history-card">No trading history recorded yet.</div>`;
    return;
  }

  list.innerHTML = state.history.map(trade => {
    const isWin = trade.profit > 0;
    const profitText = isWin ? `+$${trade.profit.toFixed(2)}` : `-$${Math.abs(trade.profit).toFixed(2)}`;
    const profitClass = isWin ? "profit-positive" : "profit-negative";

    return `
      <div class="history-card">
        <div class="history-card-left">
          <div class="history-card-market">${esc(trade.market)}</div>
          <div class="history-card-details">
            ${esc(trade.strategy)} | Target: ${trade.prediction} | Stake: $${trade.stake.toFixed(2)}
          </div>
        </div>
        <div class="history-card-right ${profitClass}">
          ${profitText}
        </div>
      </div>
    `;
  }).join("");
}

function updateStats() {
  const wins = state.history.filter(x => x.profit > 0).length;
  const total = state.history.length;
  const accuracy = total ? Math.round((wins / total) * 100) : 0;

  setText("paperTotal", total);
  setText("paperWins", wins);
  setText("paperLosses", total - wins);
  setText("paperAccuracy", accuracy + "%");
}

/* ================= OAUTH & SESSION ================= */

async function checkOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (code) {
    setText("authStatus", "CONNECTING DERIV...");
  }
}
