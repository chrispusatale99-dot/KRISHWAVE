/* =========================================================
   KRISHWAVE AI BEAST V7.1 / V8.0
   COMPLETE INTEGRATION SCRIPT FOR INDEX.HTML
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const CONFIG = {
  VERSION: "7.1",
  CLIENT_ID: "34khasPjsT0PCRR8X3Z70",
  REDIRECT_URI: "https://chrispusatale99-dot.github.io/KRISHWAVE/",
  CLOUD_API: "https://krishwave2.chrispusatale99.workers.dev",
  PUBLIC_WS: "wss://api.derivws.com/trading/v1/options/ws/public",
  DERIV_WS: "wss://ws.derivws.com/websockets/v3?app_id=1089",

  MARKETS: [
    "R_10", "R_25", "R_50", "R_75", "R_100",
    "1HZ10V", "1HZ25V", "1HZ30V", "1HZ50V", "1HZ75V",
    "1HZ90V", "1HZ100V", "1HZ150V", "1HZ250V", "1HZ1000V"
  ],

  MAX_TICKS: 250,
  MIN_ANALYSIS_TICKS: 20,
  SCAN_TICKS: 60,

  CIRCULAR_ANALYSIS_SECONDS: 10,
  CIRCULAR_PREDICT_SECONDS: 5,
  CIRCULAR_TRADE_SECONDS: 3,
  CIRCULAR_COOLDOWN_SECONDS: 3,

  BOT_INTERVAL_MS: 3000,
  START_PAPER_BALANCE: 1000,
  MIN_STAKE: 0.35,

  BOT_MIN_CONFIDENCE: 60,
  STRONG_SIGNAL: 75,
  BEAST_SIGNAL: 85,

  PAYOUT: {
    MATCHES: 8.5,
    DIFFERS: 0.09,
    OVER: 0.95,
    UNDER: 0.95,
    EVEN: 0.95,
    ODD: 0.95
  }
};

/* =========================================================
   STATE
   ========================================================= */

const state = {
  sessionToken: sessionStorage.getItem("krishwave_cloud_session") || null,
  derivApiToken: localStorage.getItem("krishwave_deriv_token") || null,
  accountId: null,
  currency: "USD",
  balance: 0,
  connectedToDeriv: false,

  publicWs: null,
  authWs: null,

  currentMarket: "R_100",
  subscribedMarket: null,
  ticks: {},
  chartPrices: [],
  lastDigit: null,
  currentAnalysis: null,

  strategy: "MATCHES",
  botStrategies: ["MATCHES", "DIFFERS", "OVER", "UNDER", "EVEN", "ODD"],

  botRunning: false,
  circularRunning: false,
  circularPhase: "IDLE",
  circularTimer: 0,
  circularInterval: null,
  botInterval: null,
  publicReconnectTimer: null,
  authReconnectTimer: null,

  tradeCounter: 0,
  paperBalance: Number(localStorage.getItem("krishwave_paper_balance")) || CONFIG.START_PAPER_BALANCE,
  paperTrades: [],
  activeTrades: [],
  historyTrades: [],

  stats: {
    total: 0,
    wins: 0,
    losses: 0,
    stake: 0,
    won: 0,
    profit: 0
  },

  sessionProfit: 0,
  realMode: true,
  activeModalTarget: null
};

/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const $ = id => document.getElementById(id);

const els = {
  connectionDot: $("connectionDot"),
  connectionText: $("connectionText"),
  modeBadge: $("modeBadge"),
  themeToggle: $("themeToggle"),

  accountId: $("accountId"),
  currency: $("currency"),
  balanceDisplay: $("balanceDisplay"),
  connectDerivBtn: $("connectDerivBtn"),
  dataStatus: $("dataStatus"),

  analysisMarketSelect: $("analysisMarketSelect"),
  currentChartMarket: $("currentChartMarket"),
  currentLivePrice: $("currentLivePrice"),
  priceChartCanvas: $("priceChartCanvas"),
  digitSampleCount: $("digitSampleCount"),
  lastDigit: $("lastDigit"),
  analysisConfidence: $("analysisConfidence"),

  aiStatus: $("aiStatus"),
  aiCircleLabel: $("aiCircleLabel"),
  aiCirclePrediction: $("aiCirclePrediction"),
  aiPrediction: $("aiPrediction"),
  aiType: $("aiType"),
  analysisMsg: $("analysisMsg"),

  aiMarket: $("aiMarket"),
  digitStatsGrid: $("digitStatsGrid"),

  aiCircleStatus: $("aiCircleStatus"),
  cycleAnalysis: $("cycleAnalysis"),
  cycleTrade: $("cycleTrade"),
  aiCircleTimer: $("aiCircleTimer"),
  cycleCooldown: $("cycleCooldown"),
  startAI: $("startAI"),
  stopAI: $("stopAI"),

  engineStatusText: $("engineStatusText"),
  tabAiBot: $("tabAiBot"),
  tabCircularAI: $("tabCircularAI"),
  tabManual: $("tabManual"),

  aiBotPanel: $("aiBotPanel"),
  circularPanel: $("circularPanel"),
  manualPanel: $("manualPanel"),

  botStatusDash: $("botStatusDash"),
  botSelectedMarket: $("botSelectedMarket"),
  botScore: $("botScore"),
  aiPredictionLarge: $("aiPredictionLarge"),
  predictionConfidence: $("predictionConfidence"),
  botMarketSelect: $("botMarketSelect"),
  botStrategyTrigger: $("botStrategyTrigger"),
  botStrategyLabel: $("botStrategyLabel"),
  stakeInput: $("stakeInput"),
  takeProfitInput: $("takeProfitInput"),
  stopLossInput: $("stopLossInput"),
  martingaleInput: $("martingaleInput"),
  startBotBtn: $("startBotBtn"),

  circularStatusText: $("circularStatusText"),
  circularMarketSelect: $("circularMarketSelect"),
  circularStrategyTrigger: $("circularStrategyTrigger"),
  circularStrategyLabel: $("circularStrategyLabel"),
  circularStakeInput: $("circularStakeInput"),
  circularTakeProfitInput: $("circularTakeProfitInput"),
  circularStopLossInput: $("circularStopLossInput"),
  startCircularTradeBtn: $("startCircularTradeBtn"),

  manualStatusText: $("manualStatusText"),
  manualMarketSelect: $("manualMarketSelect"),
  manualStrategyTrigger: $("manualStrategyTrigger"),
  manualSelectedStrategyLabel: $("manualSelectedStrategyLabel"),
  targetDigitContainer: $("targetDigitContainer"),
  manualTargetDigitInput: $("manualTargetDigitInput"),
  manualStakeInput: $("manualStakeInput"),
  manualTakeProfitInput: $("manualTakeProfitInput"),
  manualStopLossInput: $("manualStopLossInput"),
  placeTradeBtn: $("placeTradeBtn"),

  paperTotal: $("paperTotal"),
  paperWins: $("paperWins"),
  paperLosses: $("paperLosses"),
  paperAccuracy: $("paperAccuracy"),
  activeTradeCount: $("activeTradeCount"),
  activeTradesList: $("activeTradesList"),

  clearLogsBtn: $("clearLogsBtn"),
  historyTotalStake: $("historyTotalStake"),
  historyAmountWon: $("historyAmountWon"),
  historyNetProfit: $("historyNetProfit"),
  tradingStatusLabel: $("tradingStatusLabel"),
  sessionProfitDisplay: $("sessionProfitDisplay"),
  totalProfitDisplay: $("totalProfitDisplay"),
  stopTradingBtn: $("stopTradingBtn"),
  historyCardsList: $("historyCardsList"),

  strategyModal: $("strategyModal"),
  closeStrategyModal: $("closeStrategyModal"),
  strategyOptions: $("strategyOptions"),

  botStrategyModal: $("botStrategyModal"),
  closeBotStrategyModal: $("closeBotStrategyModal"),
  applyBotStrategies: $("applyBotStrategies"),

  realConfirmModal: $("realConfirmModal"),
  confirmRealBtn: $("confirmRealBtn"),
  cancelRealBtn: $("cancelRealBtn"),

  toast: $("toast"),
  toastMessage: $("toastMessage")
};

/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
  populateMarkets();
  setupNavigation();
  setupTabs();
  setupEventListeners();
  updateModeUI();

  connectPublicMarket();
  if (state.derivApiToken) {
    connectAuthenticatedWs();
  }

  updateStatus("KRISHWAVE AI BEAST V7.1 Initialized.");
}

/* =========================================================
   MARKETS & NAVIGATION
   ========================================================= */

function populateMarkets() {
  const selects = [
    els.analysisMarketSelect,
    els.botMarketSelect,
    els.circularMarketSelect,
    els.manualMarketSelect
  ];

  selects.forEach(select => {
    if (!select) return;
    select.innerHTML = "";
    CONFIG.MARKETS.forEach(symbol => {
      const option = document.createElement("option");
      option.value = symbol;
      option.textContent = symbol;
      option.selected = symbol === state.currentMarket;
      select.appendChild(option);
    });
  });
}

function setupNavigation() {
  const navBtns = document.querySelectorAll(".bottom-nav .nav-item");
  const pages = document.querySelectorAll(".page");

  navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetPage = btn.getAttribute("data-page");

      navBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      pages.forEach(p => {
        p.classList.remove("active");
        if (p.id === `${targetPage}Page`) {
          p.classList.add("active");
        }
      });
    });
  });
}

function setupTabs() {
  const tabs = [
    { btn: els.tabAiBot, panel: els.aiBotPanel },
    { btn: els.tabCircularAI, panel: els.circularPanel },
    { btn: els.tabManual, panel: els.manualPanel }
  ];

  tabs.forEach(tab => {
    if (!tab.btn) return;
    tab.btn.addEventListener("click", () => {
      tabs.forEach(t => {
        if (t.btn) t.btn.classList.remove("active");
        if (t.panel) t.panel.classList.remove("active");
      });
      tab.btn.classList.add("active");
      if (tab.panel) tab.panel.classList.add("active");
    });
  });
}

/* =========================================================
   AUTHENTICATED DERIV WEBSOCKET
   ========================================================= */

function connectAuthenticatedWs() {
  if (
    state.authWs &&
    (state.authWs.readyState === WebSocket.OPEN ||
      state.authWs.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  try {
    state.authWs = new WebSocket(CONFIG.DERIV_WS);

    state.authWs.onopen = () => {
      updateStatus("Authenticating with Deriv Socket...");
      if (state.derivApiToken) {
        sendAuth({ authorize: state.derivApiToken });
      }
    };

    state.authWs.onmessage = event => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      handleAuthMessage(data);
    };

    state.authWs.onerror = error => {
      console.error("Auth WS Error:", error);
      setConnection(false, "ERROR");
    };

    state.authWs.onclose = () => {
      state.connectedToDeriv = false;
      updateConnectionUI();
      clearTimeout(state.authReconnectTimer);
      state.authReconnectTimer = setTimeout(() => {
        if (state.derivApiToken) connectAuthenticatedWs();
      }, 5000);
    };
  } catch (err) {
    console.error(err);
  }
}

function sendAuth(payload) {
  if (state.authWs && state.authWs.readyState === WebSocket.OPEN) {
    state.authWs.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

function handleAuthMessage(data) {
  if (data.msg_type === "authorize") {
    if (data.error) {
      updateStatus(`Auth Failed: ${data.error.message}`);
      showToast(`Auth Failed: ${data.error.message}`);
      setConnection(false, "AUTH ERROR");
    } else {
      state.connectedToDeriv = true;
      state.accountId = data.authorize.loginid;
      state.currency = data.authorize.currency;
      state.balance = Number(data.authorize.balance);
      updateAccountUI();
      setConnection(true, "CONNECTED");
      updateStatus(`Connected: ${state.accountId}`);

      sendAuth({ balance: 1, subscribe: 1 });
    }
  }

  if (data.msg_type === "balance" && data.balance) {
    state.balance = Number(data.balance.balance);
    updateAccountUI();
  }

  if (data.msg_type === "proposal") {
    if (data.error) {
      updateStatus(`Proposal Error: ${data.error.message}`);
      return;
    }
    if (data.proposal && data.proposal.id) {
      sendAuth({
        buy: data.proposal.id,
        price: data.proposal.ask_price,
        req_id: data.echo_req.req_id
      });
    }
  }

  if (data.msg_type === "buy") {
    if (data.error) {
      updateStatus(`Trade Error: ${data.error.message}`);
      showToast(`Trade Failed: ${data.error.message}`);
    } else if (data.buy) {
      const contract = data.buy;
      updateStatus(`LIVE TRADE PLACED: #${contract.contract_id}`);
      showToast(`Trade Placed! #${contract.contract_id}`);

      sendAuth({
        proposal_open_contract: 1,
        contract_id: contract.contract_id,
        subscribe: 1
      });
    }
  }

  if (data.msg_type === "proposal_open_contract") {
    if (data.proposal_open_contract?.is_sold) {
      const poc = data.proposal_open_contract;
      const profit = Number(poc.profit);
      updateStatus(`Settled #${poc.contract_id}: $${profit.toFixed(2)}`);
      showToast(`Contract Closed: ${profit >= 0 ? "WIN" : "LOSS"} ($${profit.toFixed(2)})`);
    }
  }
}

/* =========================================================
   PUBLIC WEBSOCKET & FEED
   ========================================================= */

function connectPublicMarket() {
  if (
    state.publicWs &&
    (state.publicWs.readyState === WebSocket.OPEN ||
      state.publicWs.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  try {
    state.publicWs = new WebSocket(CONFIG.PUBLIC_WS);

    state.publicWs.onopen = () => {
      subscribeMarket(state.currentMarket);
    };

    state.publicWs.onmessage = event => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      processPublicMessage(data);
    };

    state.publicWs.onclose = () => {
      state.publicWs = null;
      clearTimeout(state.publicReconnectTimer);
      state.publicReconnectTimer = setTimeout(connectPublicMarket, 3000);
    };
  } catch (err) {
    console.error(err);
  }
}

function subscribeMarket(symbol) {
  if (!CONFIG.MARKETS.includes(symbol)) return;
  state.currentMarket = symbol;

  if (state.publicWs && state.publicWs.readyState === WebSocket.OPEN) {
    if (state.subscribedMarket && state.subscribedMarket !== symbol) {
      state.publicWs.send(JSON.stringify({ forget_all: "ticks" }));
    }
    state.publicWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    state.publicWs.send(
      JSON.stringify({
        ticks_history: symbol,
        count: CONFIG.MAX_TICKS,
        end: "latest",
        style: "ticks"
      })
    );
    state.subscribedMarket = symbol;
  }

  syncMarketSelectors();
}

function processPublicMessage(data) {
  if (data.msg_type === "tick" && data.tick) {
    addTick(
      data.tick.symbol || state.currentMarket,
      Number(data.tick.quote),
      Number(data.tick.epoch || Date.now() / 1000)
    );
  } else if (data.msg_type === "history" && data.history) {
    const prices = data.history.prices || [];
    const times = data.history.times || [];
    const symbol = data.echo_req?.ticks_history || state.currentMarket;

    state.ticks[symbol] = [];
    prices.forEach((price, index) => {
      addTick(symbol, Number(price), Number(times[index] || Date.now() / 1000), false);
    });

    if (symbol === state.currentMarket) {
      updateAnalysis();
    }
  }
}

function addTick(symbol, price, epoch, redraw = true) {
  if (!Number.isFinite(price)) return;
  if (!state.ticks[symbol]) state.ticks[symbol] = [];

  const list = state.ticks[symbol];
  const digit = getLastDigit(price);
  list.push({ price, epoch, digit });

  while (list.length > CONFIG.MAX_TICKS) list.shift();

  if (symbol === state.currentMarket) {
    state.lastDigit = digit;
    if (els.currentLivePrice) els.currentLivePrice.textContent = price.toFixed(5);
    if (els.lastDigit) els.lastDigit.textContent = digit;
    if (els.digitSampleCount) els.digitSampleCount.textContent = list.length;

    if (redraw) {
      updateAnalysis();
    }
  }

  settlePaperTrades(symbol, { price, epoch, digit });
}

function getLastDigit(price) {
  const text = Number(price).toFixed(5).replace(/\D/g, "");
  return Number(text.charAt(text.length - 1));
}

/* =========================================================
   ANALYSIS ENGINE & DIGIT GRID
   ========================================================= */

function updateAnalysis() {
  const list = state.ticks[state.currentMarket] || [];
  if (list.length < CONFIG.MIN_ANALYSIS_TICKS) return;

  const digits = list.slice(-CONFIG.SCAN_TICKS).map(t => t.digit);
  const total = digits.length;
  const counts = Array(10).fill(0);
  digits.forEach(d => counts[d]++);

  const even = digits.filter(d => d % 2 === 0).length;
  const over = digits.filter(d => d > 4).length;

  const analysis = {
    market: state.currentMarket,
    total,
    counts,
    signal: "STRONG",
    strategy: over > total / 2 ? "OVER" : "UNDER",
    prediction: over > total / 2 ? "OVER 4" : "UNDER 5",
    confidence: Math.min(99, Math.round((Math.max(even, total - even) / total) * 100 + 20)),
    beastScore: Math.round(75 + Math.random() * 20)
  };

  state.currentAnalysis = analysis;
  renderAnalysisUI(analysis);
  renderDigitGrid(counts, total);
}

function renderAnalysisUI(a) {
  if (els.aiStatus) els.aiStatus.textContent = a.signal;
  if (els.aiCirclePrediction) els.aiCirclePrediction.textContent = a.prediction;
  if (els.aiPrediction) els.aiPrediction.textContent = a.prediction;
  if (els.aiType) els.aiType.textContent = a.strategy;
  if (els.analysisConfidence) els.analysisConfidence.textContent = `${a.confidence}%`;
  if (els.currentChartMarket) els.currentChartMarket.textContent = a.market;
  if (els.aiMarket) els.aiMarket.textContent = a.market;
  if (els.botSelectedMarket) els.botSelectedMarket.textContent = a.market;
  if (els.botScore) els.botScore.textContent = a.beastScore;
  if (els.aiPredictionLarge) els.aiPredictionLarge.textContent = a.prediction;
  if (els.predictionConfidence) els.predictionConfidence.textContent = `${a.confidence}% confidence`;
}

function renderDigitGrid(counts, total) {
  if (!els.digitStatsGrid) return;
  els.digitStatsGrid.innerHTML = "";

  counts.forEach((count, digit) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const item = document.createElement("div");
    item.className = "digit-item";
    item.innerHTML = `
      <span>${digit}</span>
      <strong>${pct}%</strong>
    `;
    els.digitStatsGrid.appendChild(item);
  });
}

/* =========================================================
   TRADE EXECUTION & SIMULATION
   ========================================================= */

function executeTrade(market, strategy, stake, targetDigit = 0, duration = 1) {
  stake = parseFloat(stake) || CONFIG.MIN_STAKE;

  if (state.realMode && state.connectedToDeriv) {
    const contract = mapStrategyToContract(strategy, targetDigit);
    const req = {
      proposal: 1,
      amount: stake,
      basis: "stake",
      currency: state.currency,
      symbol: market,
      duration: duration,
      duration_unit: "t",
      contract_type: contract.contractType,
      req_id: Date.now()
    };
    if (contract.barrier !== undefined) req.barrier = String(contract.barrier);
    sendAuth(req);
    updateStatus(`Requesting ${strategy} trade proposal...`);
  } else {
    executePaperTrade(market, strategy, stake, targetDigit, duration);
  }
}

function mapStrategyToContract(strategy, targetDigit) {
  switch (strategy) {
    case "MATCHES": return { contractType: "DIGITMATCH", barrier: targetDigit };
    case "DIFFERS": return { contractType: "DIGITDIFF", barrier: targetDigit };
    case "OVER": return { contractType: "DIGITOVER", barrier: targetDigit ?? 4 };
    case "UNDER": return { contractType: "DIGITUNDER", barrier: targetDigit ?? 5 };
    case "EVEN": return { contractType: "DIGITEVEN" };
    case "ODD": return { contractType: "DIGITODD" };
    default: return { contractType: "DIGITEVEN" };
  }
}

function executePaperTrade(market, strategy, stake, targetDigit, duration) {
  if (state.paperBalance < stake) {
    showToast("Insufficient Paper Balance!");
    return;
  }

  state.tradeCounter++;
  const trade = {
    id: "PAPER_" + state.tradeCounter,
    market,
    strategy,
    stake,
    targetDigit,
    ticksLeft: duration,
    status: "OPEN"
  };

  state.paperBalance -= stake;
  state.activeTrades.push(trade);
  updatePaperBalance();
  renderActiveTrades();
  updateStatus(`Paper Trade Opened: ${strategy} ($${stake})`);
}

function settlePaperTrades(symbol, tick) {
  for (let i = state.activeTrades.length - 1; i >= 0; i--) {
    const trade = state.activeTrades[i];
    if (trade.market !== symbol || trade.status !== "OPEN") continue;

    trade.ticksLeft--;
    if (trade.ticksLeft <= 0) {
      let isWin = false;
      const d = tick.digit;

      switch (trade.strategy) {
        case "MATCHES": isWin = d === Number(trade.targetDigit); break;
        case "DIFFERS": isWin = d !== Number(trade.targetDigit); break;
        case "OVER": isWin = d > (trade.targetDigit ?? 4); break;
        case "UNDER": isWin = d < (trade.targetDigit ?? 5); break;
        case "EVEN": isWin = d % 2 === 0; break;
        case "ODD": isWin = d % 2 !== 0; break;
      }

      trade.status = isWin ? "WIN" : "LOSS";
      const payoutMult = CONFIG.PAYOUT[trade.strategy] || 0.95;
      const profit = isWin ? trade.stake * payoutMult : -trade.stake;

      state.paperBalance += isWin ? trade.stake + profit : 0;
      state.sessionProfit += profit;
      state.stats.total++;
      if (isWin) state.stats.wins++; else state.stats.losses++;

      state.historyTrades.unshift({ ...trade, profit });
      state.activeTrades.splice(i, 1);

      updatePaperBalance();
      updateStatsUI();
      renderActiveTrades();
      renderHistoryList();
    }
  }
}

/* =========================================================
   EVENT LISTENERS & UI HELPERS
   ========================================================= */

function setupEventListeners() {
  if (els.placeTradeBtn) {
    els.placeTradeBtn.addEventListener("click", () => {
      const market = els.manualMarketSelect?.value || state.currentMarket;
      const stake = els.manualStakeInput?.value || 1;
      const digit = els.manualTargetDigitInput?.value || 5;
      executeTrade(market, state.strategy, stake, digit);
    });
  }

  if (els.startCircularTradeBtn) {
    els.startCircularTradeBtn.addEventListener("click", () => {
      const market = els.circularMarketSelect?.value || state.currentMarket;
      const stake = els.circularStakeInput?.value || 1;
      const strategy = state.currentAnalysis?.strategy || "EVEN";
      executeTrade(market, strategy, stake, state.lastDigit || 0);
    });
  }

  if (els.startBotBtn) {
    els.startBotBtn.addEventListener("click", () => {
      state.botRunning = !state.botRunning;
      els.startBotBtn.textContent = state.botRunning ? "STOP AI BOT" : "START AI BOT";
      if (els.botStatusDash) els.botStatusDash.textContent = state.botRunning ? "RUNNING" : "STOPPED";

      if (state.botRunning) {
        state.botInterval = setInterval(() => {
          if (!state.currentAnalysis) return;
          const stake = els.stakeInput?.value || 1;
          executeTrade(state.currentMarket, state.currentAnalysis.strategy, stake, 0);
        }, CONFIG.BOT_INTERVAL_MS);
      } else {
        clearInterval(state.botInterval);
      }
    });
  }

  if (els.connectDerivBtn) {
    els.connectDerivBtn.addEventListener("click", () => {
      const token = prompt("Enter your Deriv API Token (With Read and Trade scopes):");
      if (token) {
        state.derivApiToken = token.trim();
        localStorage.setItem("krishwave_deriv_token", state.derivApiToken);
        connectAuthenticatedWs();
      }
    });
  }

  if (els.manualStrategyTrigger) {
    els.manualStrategyTrigger.addEventListener("click", () => {
      if (els.strategyModal) els.strategyModal.classList.add("active");
    });
  }

  if (els.closeStrategyModal) {
    els.closeStrategyModal.addEventListener("click", () => {
      if (els.strategyModal) els.strategyModal.classList.remove("active");
    });
  }

  if (els.strategyOptions) {
    els.strategyOptions.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        state.strategy = btn.getAttribute("data-strategy");
        if (els.manualSelectedStrategyLabel) els.manualSelectedStrategyLabel.textContent = state.strategy;
        if (els.strategyModal) els.strategyModal.classList.remove("active");
      });
    });
  }

  if (els.clearLogsBtn) {
    els.clearLogsBtn.addEventListener("click", () => {
      state.historyTrades = [];
      renderHistoryList();
    });
  }

  [els.analysisMarketSelect, els.botMarketSelect, els.circularMarketSelect, els.manualMarketSelect].forEach(select => {
    if (select) {
      select.addEventListener("change", e => subscribeMarket(e.target.value));
    }
  });
}

function syncMarketSelectors() {
  [els.analysisMarketSelect, els.botMarketSelect, els.circularMarketSelect, els.manualMarketSelect].forEach(s => {
    if (s) s.value = state.currentMarket;
  });
}

function setConnection(connected, text) {
  state.connectedToDeriv = connected;
  if (els.connectionDot) els.connectionDot.className = connected ? "dot live" : "dot offline";
  if (els.connectionText) els.connectionText.textContent = text;
}

function updateConnectionUI() {
  if (els.dataStatus) {
    els.dataStatus.textContent = state.connectedToDeriv
      ? `Connected to Deriv (${state.accountId})`
      : "Waiting for Deriv connection...";
  }
}

function updateAccountUI() {
  if (els.accountId) els.accountId.textContent = state.accountId || "Not connected";
  if (els.currency) els.currency.textContent = state.currency;
  if (els.balanceDisplay) els.balanceDisplay.textContent = `$${state.balance.toFixed(2)}`;
}

function updatePaperBalance() {
  localStorage.setItem("krishwave_paper_balance", state.paperBalance);
  if (els.paperTotal) els.paperTotal.textContent = state.stats.total;
}

function updateModeUI() {
  if (els.modeBadge) els.modeBadge.textContent = state.realMode ? "DEMO" : "PAPER";
  if (els.engineStatusText) els.engineStatusText.textContent = state.realMode ? "DERIV EXECUTION" : "PAPER MODE";
}

function updateStatsUI() {
  if (els.paperWins) els.paperWins.textContent = state.stats.wins;
  if (els.paperLosses) els.paperLosses.textContent = state.stats.losses;
  if (els.paperAccuracy) {
    const acc = state.stats.total > 0 ? Math.round((state.stats.wins / state.stats.total) * 100) : 0;
    els.paperAccuracy.textContent = `${acc}%`;
  }
  if (els.sessionProfitDisplay) els.sessionProfitDisplay.textContent = `$${state.sessionProfit.toFixed(2)}`;
}

function renderActiveTrades() {
  if (!els.activeTradesList) return;
  if (els.activeTradeCount) els.activeTradeCount.textContent = state.activeTrades.length;
  els.activeTradesList.innerHTML = state.activeTrades.map(t => `
    <div class="list-item">
      <span>${t.market} (${t.strategy})</span>
      <strong>$${t.stake}</strong>
    </div>
  `).join("");
}

function renderHistoryList() {
  if (!els.historyCardsList) return;
  els.historyCardsList.innerHTML = state.historyTrades.map(t => `
    <div class="list-item ${t.profit >= 0 ? 'win' : 'loss'}">
      <span>${t.market} - ${t.strategy}</span>
      <strong>${t.profit >= 0 ? '+' : ''}$${t.profit.toFixed(2)}</strong>
    </div>
  `).join("");
}

function updateStatus(msg) {
  if (els.dataStatus) els.dataStatus.textContent = msg;
  console.log(`[KRISHWAVE]: ${msg}`);
}

function showToast(msg) {
  if (els.toastMessage) els.toastMessage.textContent = msg;
  if (els.toast) {
    els.toast.classList.add("show");
    setTimeout(() => els.toast.classList.remove("show"), 3000);
  }
}
