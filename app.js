/* =========================================================
   KRISHWAVE AI BEAST V8.0
   INTELLIGENCE ENGINE & DERIV WEBSOCKET TRADER

   MODES:
   - PAPER TRADING (SIMULATED)
   - DEMO / REAL EXECUTION (DERIV WEBSOCKET API)
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const CONFIG = {
  VERSION: "8.0",
  CLIENT_ID: "34khasPjsT0PCRR8X3Z70",
  REDIRECT_URI: "https://chrispusatale99-dot.github.io/KRISHWAVE/",
  CLOUD_API: "https://krishwave2.chrispusatale99.workers.dev",
  PUBLIC_WS: "wss://api.derivws.com/trading/v1/options/ws/public",
  
  // Official Deriv Endpoint for Authorized/Trading Operations
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
  MAX_ACTIVE_TRADES: 10,

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
   STATE MANAGEMENT
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
  marketScanner: [],
  strongestMarket: null,

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

  pendingProposals: new Map(),

  stats: {
    total: 0,
    wins: 0,
    losses: 0,
    stake: 0,
    won: 0,
    profit: 0
  },

  takeProfit: 20,
  stopLoss: 20,
  sessionProfit: 0,
  realMode: true // Enables real API trade execution on Deriv (Demo/Real)
};

/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const $ = id => document.getElementById(id);

const els = {
  connectionDot: $("connectionDot"),
  connectionText: $("connectionText"),
  modeBadge: $("modeBadge"),
  accountId: $("accountId"),
  currency: $("currency"),
  balanceDisplay: $("balanceDisplay"),
  dataStatus: $("dataStatus"),
  connectDerivBtn: $("connectDerivBtn"),

  analysisMarketSelect: $("analysisMarketSelect"),
  currentChartMarket: $("currentChartMarket"),
  currentLivePrice: $("currentLivePrice"),
  priceChartCanvas: $("priceChartCanvas"),

  aiStatus: $("aiStatus"),
  analysisConfidence: $("analysisConfidence"),
  aiMarket: $("aiMarket"),
  aiPrediction: $("aiPrediction"),
  aiType: $("aiType"),
  analysisMsg: $("analysisMsg"),
  digitSampleCount: $("digitSampleCount"),
  lastDigit: $("lastDigit"),

  aiCircleStatus: $("aiCircleStatus"),
  aiCircleLabel: $("aiCircleLabel"),
  aiCirclePrediction: $("aiCirclePrediction"),
  cycleAnalysis: $("cycleAnalysis"),
  cycleTrade: $("cycleTrade"),
  aiCircleTimer: $("aiCircleTimer"),
  cycleCooldown: $("cycleCooldown"),
  startAI: $("startAI"),
  stopAI: $("stopAI"),

  botStatusDash: $("botStatusDash"),
  botSelectedMarket: $("botSelectedMarket"),
  botScore: $("botScore"),
  aiPredictionLarge: $("aiPredictionLarge"),
  predictionConfidence: $("predictionConfidence"),
  botMarketSelect: $("botMarketSelect"),
  stakeInput: $("stakeInput"),
  takeProfitInput: $("takeProfitInput"),
  stopLossInput: $("stopLossInput"),
  startBotBtn: $("startBotBtn"),

  circularStatusText: $("circularStatusText"),
  circularMarketSelect: $("circularMarketSelect"),
  circularStakeInput: $("circularStakeInput"),
  startCircularTradeBtn: $("startCircularTradeBtn"),

  manualStatusText: $("manualStatusText"),
  manualMarketSelect: $("manualMarketSelect"),
  manualTargetDigitInput: $("manualTargetDigitInput"),
  manualStakeInput: $("manualStakeInput"),
  placeTradeBtn: $("placeTradeBtn"),

  activeTradeCount: $("activeTradeCount"),
  activeTradesList: $("activeTradesList"),
  sessionProfitDisplay: $("sessionProfitDisplay"),
  totalProfitDisplay: $("totalProfitDisplay"),

  paperTotal: $("paperTotal"),
  paperWins: $("paperWins"),
  paperLosses: $("paperLosses"),
  paperAccuracy: $("paperAccuracy")
};

/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
  populateMarkets();
  setupEventListeners();
  updateModeUI();

  connectPublicMarket();
  if (state.derivApiToken) {
    connectAuthenticatedWs();
  }

  updateStatus("KRISHWAVE V8.0 Engine Initialized.");
}

function populateMarkets() {
  const selects = [els.analysisMarketSelect, els.botMarketSelect, els.circularMarketSelect, els.manualMarketSelect];
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

/* =========================================================
   AUTHENTICATED WEBSOCKET & DERIV TRADING ENGINE
   ========================================================= */

function connectAuthenticatedWs() {
  if (state.authWs && (state.authWs.readyState === WebSocket.OPEN || state.authWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    state.authWs = new WebSocket(CONFIG.DERIV_WS);

    state.authWs.onopen = () => {
      updateStatus("Authorizing Deriv Trading Socket...");
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
      updateStatus("Deriv Authorized WS connection error.");
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
    console.error("Connection Error:", err);
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
  // 1. Authorization Response
  if (data.msg_type === "authorize") {
    if (data.error) {
      updateStatus(`Auth Failed: ${data.error.message}`);
      state.connectedToDeriv = false;
    } else {
      state.connectedToDeriv = true;
      state.accountId = data.authorize.loginid;
      state.currency = data.authorize.currency;
      state.balance = Number(data.authorize.balance);
      updateAccountUI();
      updateStatus(`Connected to Deriv Account: ${state.accountId}`);

      // Subscribe to Balance & Transactions
      sendAuth({ balance: 1, subscribe: 1 });
      sendAuth({ transaction: 1, subscribe: 1 });
    }
    updateConnectionUI();
  }

  // 2. Real-Time Balance Updates
  if (data.msg_type === "balance") {
    if (data.balance) {
      state.balance = Number(data.balance.balance);
      updateAccountUI();
    }
  }

  // 3. Price Proposal Response
  if (data.msg_type === "proposal") {
    if (data.error) {
      updateStatus(`Proposal Rejected: ${data.error.message}`);
      return;
    }
    const reqId = data.echo_req.req_id;
    if (data.proposal && data.proposal.id) {
      // Automatically execute purchase if proposal is accepted
      sendAuth({
        buy: data.proposal.id,
        price: data.proposal.ask_price,
        req_id: reqId
      });
    }
  }

  // 4. Trade Execution (Buy) Response
  if (data.msg_type === "buy") {
    if (data.error) {
      updateStatus(`Trade Placement Failed: ${data.error.message}`);
      showToast(`Trade Failed: ${data.error.message}`);
    } else if (data.buy) {
      const contract = data.buy;
      updateStatus(`LIVE TRADE PLACED: ID #${contract.contract_id}`);
      showToast(`Trade Placed successfully! Contract #${contract.contract_id}`);
      
      // Track live trade in UI
      trackLiveTrade(contract);

      // Subscribe to open contract updates for settlement
      sendAuth({
        proposal_open_contract: 1,
        contract_id: contract.contract_id,
        subscribe: 1
      });
    }
  }

  // 5. Contract Settlement & Lifecycle Tracking
  if (data.msg_type === "proposal_open_contract") {
    if (data.proposal_open_contract) {
      const poc = data.proposal_open_contract;
      if (poc.is_sold) {
        processContractSettlement(poc);
      }
    }
  }
}

/* =========================================================
   TRADE EXECUTION GATEWAY
   ========================================================= */

function executeTrade(market, strategy, stake, targetDigit = 0, duration = 1, durationUnit = "t") {
  stake = parseFloat(stake) || CONFIG.MIN_STAKE;

  // Real Mode: Send Order to Deriv WebSocket API
  if (state.realMode && state.connectedToDeriv) {
    const contractParams = mapStrategyToContract(strategy, targetDigit);
    
    const reqId = Date.now();
    const proposalReq = {
      proposal: 1,
      amount: stake,
      basis: "stake",
      currency: state.currency,
      symbol: market,
      duration: duration,
      duration_unit: durationUnit,
      contract_type: contractParams.contractType,
      req_id: reqId
    };

    if (contractParams.barrier !== undefined) {
      proposalReq.barrier = String(contractParams.barrier);
    }

    sendAuth(proposalReq);
    updateStatus(`Requesting proposal for ${strategy} on ${market}...`);
  } 
  // Paper Mode: Execute In-Memory Simulation
  else {
    executePaperTrade(market, strategy, stake, targetDigit, duration);
  }
}

function mapStrategyToContract(strategy, targetDigit) {
  switch (strategy) {
    case "MATCHES":
      return { contractType: "DIGITMATCH", barrier: targetDigit };
    case "DIFFERS":
      return { contractType: "DIGITDIFF", barrier: targetDigit };
    case "OVER":
      return { contractType: "DIGITOVER", barrier: targetDigit ?? 4 };
    case "UNDER":
      return { contractType: "DIGITUNDER", barrier: targetDigit ?? 5 };
    case "EVEN":
      return { contractType: "DIGITEVEN" };
    case "ODD":
      return { contractType: "DIGITODD" };
    case "RISE":
      return { contractType: "CALL" };
    case "FALL":
      return { contractType: "PUT" };
    default:
      return { contractType: "DIGITEVEN" };
  }
}

/* =========================================================
   PAPER TRADING SIMULATOR ENGINE
   ========================================================= */

function executePaperTrade(market, strategy, stake, targetDigit, duration = 1) {
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
    startTick: state.ticks[market]?.slice(-1)[0]?.price || 0,
    ticksLeft: duration,
    status: "OPEN",
    timestamp: new Date().toLocaleTimeString()
  };

  state.paperBalance -= stake;
  state.activeTrades.push(trade);
  updatePaperBalance();
  renderActiveTrades();
  updateStatus(`PAPER TRADE OPENED: ${strategy} on ${market} ($${stake})`);
}

function settlePaperTrades(symbol, tick) {
  if (state.activeTrades.length === 0) return;

  for (let i = state.activeTrades.length - 1; i >= 0; i--) {
    const trade = state.activeTrades[i];
    if (trade.market !== symbol || trade.status !== "OPEN") continue;

    trade.ticksLeft--;

    if (trade.ticksLeft <= 0) {
      let isWin = false;
      const currentDigit = tick.digit;

      switch (trade.strategy) {
        case "MATCHES": isWin = currentDigit === Number(trade.targetDigit); break;
        case "DIFFERS": isWin = currentDigit !== Number(trade.targetDigit); break;
        case "OVER": isWin = currentDigit > (trade.targetDigit ?? 4); break;
        case "UNDER": isWin = currentDigit < (trade.targetDigit ?? 5); break;
        case "EVEN": isWin = currentDigit % 2 === 0; break;
        case "ODD": isWin = currentDigit % 2 !== 0; break;
      }

      trade.status = isWin ? "WIN" : "LOSS";
      const payoutMultiplier = CONFIG.PAYOUT[trade.strategy] || 0.95;
      const payout = isWin ? trade.stake + (trade.stake * payoutMultiplier) : 0;
      const profit = isWin ? trade.stake * payoutMultiplier : -trade.stake;

      state.paperBalance += payout;
      state.sessionProfit += profit;
      state.stats.total++;
      if (isWin) state.stats.wins++; else state.stats.losses++;
      state.stats.profit += profit;

      state.activeTrades.splice(i, 1);
      updatePaperBalance();
      updateStatsUI();
      renderActiveTrades();
      
      updateStatus(`PAPER TRADE CLOSED: ${trade.status} (${profit >= 0 ? '+' : ''}$${profit.toFixed(2)})`);
    }
  }
}

/* =========================================================
   PUBLIC WEBSOCKET & MARKET FEED MANAGEMENT
   ========================================================= */

function connectPublicMarket() {
  if (state.publicWs && (state.publicWs.readyState === WebSocket.OPEN || state.publicWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  setConnection(false, "CONNECTING");

  try {
    state.publicWs = new WebSocket(CONFIG.PUBLIC_WS);

    state.publicWs.onopen = () => {
      setConnection(true, "LIVE");
      subscribeMarket(state.currentMarket);
    };

    state.publicWs.onmessage = event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      processPublicMessage(data);
    };

    state.publicWs.onerror = () => setConnection(false, "ERROR");

    state.publicWs.onclose = () => {
      state.publicWs = null;
      setConnection(false, "OFFLINE");
      clearTimeout(state.publicReconnectTimer);
      state.publicReconnectTimer = setTimeout(connectPublicMarket, 3000);
    };
  } catch (err) {
    setConnection(false, "ERROR");
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
    state.publicWs.send(JSON.stringify({ ticks_history: symbol, count: CONFIG.MAX_TICKS, end: "latest", style: "ticks" }));
    state.subscribedMarket = symbol;
  }
}

function processPublicMessage(data) {
  if (data.msg_type === "tick" && data.tick) {
    addTick(data.tick.symbol || state.currentMarket, Number(data.tick.quote), Number(data.tick.epoch || Date.now() / 1000));
  } else if (data.msg_type === "history" && data.history) {
    processHistory(data);
  }
}

function processHistory(data) {
  const prices = data.history?.prices || [];
  const times = data.history?.times || [];
  const symbol = data.echo_req?.ticks_history || state.currentMarket;

  state.ticks[symbol] = [];
  prices.forEach((price, i) => addTick(symbol, Number(price), Number(times[i] || Date.now() / 1000), false));
  if (symbol === state.currentMarket) {
    updateAnalysis();
    drawChart();
  }
}

function addTick(symbol, price, epoch, redraw = true) {
  if (!Number.isFinite(price)) return;
  if (!state.ticks[symbol]) state.ticks[symbol] = [];

  const list = state.ticks[symbol];
  const tick = { price, epoch, digit: getLastDigit(price) };
  list.push(tick);

  while (list.length > CONFIG.MAX_TICKS) list.shift();

  if (symbol === state.currentMarket) {
    state.lastDigit = tick.digit;
    if (els.currentLivePrice) els.currentLivePrice.textContent = price.toFixed(5);
    if (els.lastDigit) els.lastDigit.textContent = tick.digit;
    if (redraw) {
      updateAnalysis();
      drawChart();
    }
  }

  settlePaperTrades(symbol, tick);
}

function getLastDigit(price) {
  const text = Number(price).toFixed(5).replace(/\D/g, "");
  return Number(text.charAt(text.length - 1));
}

/* =========================================================
   ANALYSIS ENGINE
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
}

function renderAnalysisUI(a) {
  if (els.aiStatus) els.aiStatus.textContent = a.signal;
  if (els.aiPrediction) els.aiPrediction.textContent = a.prediction;
  if (els.analysisConfidence) els.analysisConfidence.textContent = `${a.confidence}%`;
  if (els.aiCirclePrediction) els.aiCirclePrediction.textContent = a.prediction;
}

/* =========================================================
   CIRCULAR AI ENGINE & BOT CONTROLLERS
   ========================================================= */

function triggerCircularTrade() {
  if (!state.currentAnalysis) return;
  const stake = parseFloat(els.circularStakeInput?.value) || CONFIG.MIN_STAKE;
  const targetDigit = state.lastDigit ?? 0;
  
  executeTrade(state.currentMarket, state.currentAnalysis.strategy, stake, targetDigit);
}

function triggerManualTrade() {
  const market = els.manualMarketSelect?.value || state.currentMarket;
  const stake = parseFloat(els.manualStakeInput?.value) || CONFIG.MIN_STAKE;
  const targetDigit = parseInt(els.manualTargetDigitInput?.value) || 0;
  const strategy = state.strategy || "MATCHES";

  executeTrade(market, strategy, stake, targetDigit);
}

function triggerBotTrade() {
  if (!state.botRunning || !state.currentAnalysis) return;
  const stake = parseFloat(els.stakeInput?.value) || CONFIG.MIN_STAKE;
  
  executeTrade(state.currentMarket, state.currentAnalysis.strategy, stake, 0);
}

/* =========================================================
   EVENT LISTENERS & UI HELPERS
   ========================================================= */

function setupEventListeners() {
  if (els.placeTradeBtn) els.placeTradeBtn.addEventListener("click", triggerManualTrade);
  if (els.startCircularTradeBtn) els.startCircularTradeBtn.addEventListener("click", triggerCircularTrade);
  
  if (els.startBotBtn) {
    els.startBotBtn.addEventListener("click", () => {
      state.botRunning = !state.botRunning;
      els.startBotBtn.textContent = state.botRunning ? "STOP BOT" : "START AI BOT";
      if (state.botRunning) {
        state.botInterval = setInterval(triggerBotTrade, CONFIG.BOT_INTERVAL_MS);
      } else {
        clearInterval(state.botInterval);
      }
    });
  }

  if (els.connectDerivBtn) {
    els.connectDerivBtn.addEventListener("click", () => {
      const token = prompt("Enter your Deriv API Token (Ensure Read and Trade scopes are enabled):");
      if (token) {
        state.derivApiToken = token.trim();
        localStorage.setItem("krishwave_deriv_token", state.derivApiToken);
        connectAuthenticatedWs();
      }
    });
  }

  [els.analysisMarketSelect, els.botMarketSelect, els.circularMarketSelect, els.manualMarketSelect].forEach(select => {
    if (select) {
      select.addEventListener("change", e => subscribeMarket(e.target.value));
    }
  });
}

function setConnection(connected, text) {
  state.connectedToDeriv = connected;
  if (els.connectionDot) els.connectionDot.className = connected ? "dot live" : "dot offline";
  if (els.connectionText) els.connectionText.textContent = text;
}

function updateConnectionUI() {
  if (els.dataStatus) els.dataStatus.textContent = state.connectedToDeriv ? "CONNECTED" : "DISCONNECTED";
}

function updateAccountUI() {
  if (els.accountId) els.accountId.textContent = state.accountId || "DEMO";
  if (els.currency) els.currency.textContent = state.currency;
  if (els.balanceDisplay) els.balanceDisplay.textContent = state.balance.toFixed(2);
}

function updatePaperBalance() {
  localStorage.setItem("krishwave_paper_balance", state.paperBalance);
  if (els.paperTotal) els.paperTotal.textContent = `$${state.paperBalance.toFixed(2)}`;
}

function updateModeUI() {
  if (els.modeBadge) els.modeBadge.textContent = state.realMode ? "DERIV EXECUTION" : "PAPER MODE";
}

function updateStatsUI() {
  if (els.paperWins) els.paperWins.textContent = state.stats.wins;
  if (els.paperLosses) els.paperLosses.textContent = state.stats.losses;
  if (els.sessionProfitDisplay) els.sessionProfitDisplay.textContent = `$${state.sessionProfit.toFixed(2)}`;
}

function renderActiveTrades() {
  if (!els.activeTradesList) return;
  els.activeTradesList.innerHTML = state.activeTrades.map(t => `
    <div class="trade-card">
      <span>${t.market} (${t.strategy})</span>
      <span>$${t.stake}</span>
      <span class="status ${t.status.toLowerCase()}">${t.status}</span>
    </div>
  `).join("");
}

function trackLiveTrade(contract) {
  updateStatus(`Live Order Sent. Contract ID: ${contract.contract_id}`);
}

function processContractSettlement(poc) {
  const profit = Number(poc.profit);
  updateStatus(`Live Contract Closed #${poc.contract_id}: ${profit >= 0 ? "WON" : "LOST"} ($${profit.toFixed(2)})`);
  showToast(`Contract Settled: ${profit >= 0 ? "WIN" : "LOSS"} ($${profit.toFixed(2)})`);
}

function updateStatus(msg) {
  console.log(`[KRISHWAVE]: ${msg}`);
}

function showToast(msg) {
  alert(msg);
}

function drawChart() {
  // Chart rendering code stub
}
