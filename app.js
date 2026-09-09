/* =========================================================
   KRISHWAVE AI BEAST V7.1
   DERIV CLOUD CONNECTED EDITION

   Frontend:
   - OAuth 2.0 + PKCE
   - Cloudflare Worker session
   - Live public Deriv market data
   - Authenticated demo WebSocket
   - Balance
   - Analysis
   - Circular AI
   - AI Bot
   - Manual paper trading
   - History
   ========================================================= */

"use strict";

/* ================= CONFIG ================= */

const CONFIG = {

  CLIENT_ID: "34khasPjsT0PCRR8X3Z70",

  REDIRECT_URI:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/",

  /*
    AFTER YOU DEPLOY THE CLOUDFLARE WORKER,
    PUT ITS URL HERE.

    Example:
    https://krishwave-api.yourname.workers.dev
  */
  CLOUD_API:
    "https://REPLACE-WITH-YOUR-CLOUDFLARE-WORKER.workers.dev",

  PUBLIC_WS:
    "wss://api.derivws.com/trading/v1/options/ws/public",

  MARKETS: [
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
  ],

  MAX_TICKS: 250,
  MIN_ANALYSIS_TICKS: 20,

  CIRCULAR_ANALYSIS_SECONDS: 10,
  CIRCULAR_PREDICT_SECONDS: 5,
  CIRCULAR_TRADE_SECONDS: 3,
  CIRCULAR_COOLDOWN_SECONDS: 3,

  BOT_INTERVAL_MS: 3000,

  START_BALANCE: 1000,

  PAYOUT: {
    MATCHES: 8.5,
    DIFFERS: 0.09,
    OVER: 0.95,
    UNDER: 0.95,
    EVEN: 0.95,
    ODD: 0.95
  }

};

/* ================= STATE ================= */

const state = {

  sessionToken:
    sessionStorage.getItem("krishwave_cloud_session") || null,

  accountId: null,
  currency: "USD",
  balance: 0,

  publicWs: null,
  authWs: null,

  currentMarket: "R_100",

  ticks: {},

  chartPrices: [],

  lastDigit: null,

  strategy: "MATCHES",

  botStrategies: [
    "MATCHES",
    "DIFFERS",
    "OVER",
    "UNDER",
    "EVEN",
    "ODD"
  ],

  botRunning: false,

  circularRunning: false,

  circularPhase: "IDLE",

  circularTimer: 0,

  circularInterval: null,

  botInterval: null,

  tradeCounter: 0,

  paperTrades: [],

  activeTrades: [],

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

  realMode: false

};

/* ================= DOM ================= */

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

  analysisPage: $("analysisPage"),
  tradePage: $("tradePage"),
  historyPage: $("historyPage"),

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
  digitStatsGrid: $("digitStatsGrid"),

  aiCircleStatus: $("aiCircleStatus"),
  aiCircleLabel: $("aiCircleLabel"),
  aiCirclePrediction: $("aiCirclePrediction"),
  cycleAnalysis: $("cycleAnalysis"),
  cycleTrade: $("cycleTrade"),
  aiCircleTimer: $("aiCircleTimer"),
  cycleCooldown: $("cycleCooldown"),

  startAI: $("startAI"),
  stopAI: $("stopAI"),

  tabAiBot: $("tabAiBot"),
  tabCircularAI: $("tabCircularAI"),
  tabManual: $("tabManual"),

  aiBotPanel: $("aiBotPanel"),
  circularPanel: $("circularPanel"),
  manualPanel: $("manualPanel"),

  engineStatusText: $("engineStatusText"),

  botStatusDash: $("botStatusDash"),
  botSelectedMarket: $("botSelectedMarket"),
  botSelectedStrategy: $("botSelectedStrategy"),
  botScore: $("botScore"),
  aiPredictionLarge: $("aiPredictionLarge"),
  predictionConfidence: $("predictionConfidence"),

  botMarketSelect: $("botMarketSelect"),
  stakeInput: $("stakeInput"),
  takeProfitInput: $("takeProfitInput"),
  stopLossInput: $("stopLossInput"),
  martingaleInput: $("martingaleInput"),

  botStrategyTrigger: $("botStrategyTrigger"),
  botStrategyLabel: $("botStrategyLabel"),
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
  tradingStatusLabel: $("tradingStatusLabel"),
  sessionProfitDisplay: $("sessionProfitDisplay"),
  stopTradingBtn: $("stopTradingBtn"),
  totalProfitDisplay: $("totalProfitDisplay"),

  historyTotalStake: $("historyTotalStake"),
  historyAmountWon: $("historyAmountWon"),
  historyNetProfit: $("historyNetProfit"),
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

  themeToggle: $("themeToggle"),

  toast: $("toast"),
  toastMessage: $("toastMessage")
};

/* ================= INITIALIZATION ================= */

document.addEventListener("DOMContentLoaded", () => {

  populateMarkets();

  loadHistory();

  setupNavigation();

  setupTabs();

  setupStrategyControls();

  setupButtons();

  setupTheme();

  updateStrategyUI();

  updateStatsUI();

  connectPublicMarket();

  handleOAuthCallback();

  if (state.sessionToken) {
    restoreCloudSession();
  }

  drawChart();

});

/* ================= MARKETS ================= */

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

      if (symbol === state.currentMarket) {
        option.selected = true;
      }

      select.appendChild(option);

    });

  });

}

/* ================= PUBLIC DERIV ================= */

function connectPublicMarket() {

  setConnection(false, "CONNECTING");

  try {

    state.publicWs =
      new WebSocket(CONFIG.PUBLIC_WS);

    state.publicWs.onopen = () => {

      setConnection(true, "LIVE");

      sendPublic({
        active_symbols: "brief",
        req_id: 100
      });

      subscribeMarket(state.currentMarket);

      updateStatus(
        "Deriv public market feed connected."
      );

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

    state.publicWs.onerror = () => {

      setConnection(false, "ERROR");

      updateStatus(
        "Deriv public market connection error."
      );

    };

    state.publicWs.onclose = () => {

      setConnection(false, "OFFLINE");

      setTimeout(connectPublicMarket, 3000);

    };

  } catch (error) {

    console.error(error);

    setConnection(false, "ERROR");

  }

}

function sendPublic(payload) {

  if (
    state.publicWs &&
    state.publicWs.readyState === WebSocket.OPEN
  ) {

    state.publicWs.send(
      JSON.stringify(payload)
    );

  }

}

function subscribeMarket(symbol) {

  state.currentMarket = symbol;

  if (state.publicWs) {

    sendPublic({
      ticks: symbol,
      subscribe: 1,
      req_id: 200
    });

    sendPublic({
      ticks_history: symbol,
      count: CONFIG.MAX_TICKS,
      end: "latest",
      style: "ticks",
      req_id: 201
    });

  }

  resetMarketState(symbol);

  els.currentChartMarket.textContent = symbol;
  els.aiMarket.textContent = symbol;

  updateStatus(
    `Analyzing ${symbol}...`
  );

}

function processPublicMessage(data) {

  if (data.msg_type === "tick") {

    const tick = data.tick;

    if (!tick) return;

    const symbol =
      tick.symbol || state.currentMarket;

    addTick(
      symbol,
      Number(tick.quote),
      Number(tick.epoch || Date.now() / 1000)
    );

  }

  if (data.msg_type === "history") {

    processHistory(data);

  }

  if (data.error) {

    updateStatus(
      data.error.message ||
      "Deriv API error"
    );

  }

}

function processHistory(data) {

  const prices =
    data.history?.prices || [];

  const times =
    data.history?.times || [];

  const symbol =
    data.echo_req?.ticks_history ||
    state.currentMarket;

  state.ticks[symbol] = [];

  prices.forEach((price, index) => {

    addTick(
      symbol,
      Number(price),
      Number(times[index] || Date.now() / 1000),
      false
    );

  });

  updateAnalysis();

}

/* ================= TICKS ================= */

function resetMarketState(symbol) {

  if (!state.ticks[symbol]) {
    state.ticks[symbol] = [];
  }

  state.chartPrices = [];

}

function addTick(
  symbol,
  price,
  epoch,
  redraw = true
) {

  if (!Number.isFinite(price)) return;

  if (!state.ticks[symbol]) {
    state.ticks[symbol] = [];
  }

  const list = state.ticks[symbol];

  const tick = {
    price,
    epoch,
    digit: getLastDigit(price)
  };

  list.push(tick);

  while (list.length > CONFIG.MAX_TICKS) {
    list.shift();
  }

  if (symbol === state.currentMarket) {

    state.lastDigit = tick.digit;

    state.chartPrices.push(price);

    while (state.chartPrices.length > 80) {
      state.chartPrices.shift();
    }

    els.currentLivePrice.textContent =
      formatPrice(price);

    els.digitSampleCount.textContent =
      list.length;

    els.lastDigit.textContent =
      tick.digit;

    if (redraw) {
      updateAnalysis();
      drawChart();
    }

  }

  settlePaperTrades(symbol, tick);

}

function getLastDigit(price) {

  const text =
    Number(price)
      .toFixed(5)
      .replace(".", "");

  return Number(
    text.charAt(text.length - 1)
  );

}

function formatPrice(price) {

  return Number(price)
    .toFixed(5);

}

/* ================= ANALYSIS ================= */

function updateAnalysis() {

  const data =
    state.ticks[state.currentMarket] || [];

  if (data.length < CONFIG.MIN_ANALYSIS_TICKS) {

    els.aiStatus.textContent =
      "COLLECTING DATA";

    els.aiPrediction.textContent =
      "WAITING";

    els.aiCirclePrediction.textContent =
      "--";

    els.analysisConfidence.textContent =
      "0%";

    return;

  }

  const digits =
    data.map(t => t.digit);

  const counts =
    Array(10).fill(0);

  digits.forEach(d => counts[d]++);

  renderDigitStats(counts, digits.length);

  const analysis =
    analyzeDigits(digits);

  els.aiStatus.textContent =
    "AI ANALYSIS ACTIVE";

  els.aiPrediction.textContent =
    analysis.prediction;

  els.aiType.textContent =
    analysis.strategy;

  els.analysisConfidence.textContent =
    `${analysis.confidence}%`;

  els.analysisMsg.textContent =
    analysis.reason;

  els.aiCirclePrediction.textContent =
    analysis.prediction;

  els.botSelectedMarket.textContent =
    state.currentMarket;

  els.botScore.textContent =
    analysis.score;

  els.aiPredictionLarge.textContent =
    analysis.prediction;

  els.predictionConfidence.textContent =
    `${analysis.confidence}% confidence`;

}

/* ================= DIGIT AI ================= */

function analyzeDigits(digits) {

  const counts =
    Array(10).fill(0);

  digits.forEach(d => counts[d]++);

  const total =
    digits.length;

  let hottest = 0;
  let coldest = 0;

  for (let i = 1; i < 10; i++) {

    if (counts[i] > counts[hottest]) {
      hottest = i;
    }

    if (counts[i] < counts[coldest]) {
      coldest = i;
    }

  }

  const even =
    digits.filter(d => d % 2 === 0).length;

  const odd =
    total - even;

  const over =
    digits.filter(d => d > 4).length;

  const under =
    total - over;

  const evenPct =
    even / total;

  const oddPct =
    odd / total;

  const overPct =
    over / total;

  const underPct =
    under / total;

  let strategy = "EVEN";
  let prediction = "EVEN";
  let score = 50;

  if (Math.abs(overPct - underPct) > .12) {

    strategy =
      overPct > underPct
        ? "OVER"
        : "UNDER";

    prediction = strategy;

    score =
      Math.round(
        50 +
        Math.abs(overPct - underPct) * 100
      );

  } else if (
    Math.abs(evenPct - oddPct) > .12
  ) {

    strategy =
      evenPct > oddPct
        ? "EVEN"
        : "ODD";

    prediction = strategy;

    score =
      Math.round(
        50 +
        Math.abs(evenPct - oddPct) * 100
      );

  } else {

    strategy = "MATCHES";

    prediction =
      String(hottest);

    score =
      Math.round(
        45 +
        (counts[hottest] / total) * 100
      );

  }

  score =
    Math.max(
      1,
      Math.min(99, score)
    );

  const confidence =
    Math.max(
      1,
      Math.min(99, score - 3)
    );

  const reason =
    `Hot digit ${hottest} appears ${
      counts[hottest]
    }/${total} ticks. ` +
    `Even ${Math.round(evenPct * 100)}%, ` +
    `Odd ${Math.round(oddPct * 100)}%, ` +
    `Over ${Math.round(overPct * 100)}%, ` +
    `Under ${Math.round(underPct * 100)}%.`;

  return {
    prediction,
    strategy,
    score,
    confidence,
    reason,
    hottest,
    coldest
  };

}

function renderDigitStats(
  counts,
  total
) {

  els.digitStatsGrid.innerHTML = "";

  const max =
    Math.max(...counts, 1);

  counts.forEach((count, digit) => {

    const pct =
      total
        ? Math.round((count / total) * 100)
        : 0;

    const cell =
      document.createElement("div");

    cell.className =
      "digit-cell";

    cell.innerHTML = `
      <strong>${digit}</strong>
      <span>${count} · ${pct}%</span>
      <div class="digit-bar"
           style="width:${Math.max(4, (count / max) * 100)}%">
      </div>
    `;

    els.digitStatsGrid.appendChild(cell);

  });

}

/* ================= CIRCULAR AI ================= */

function startCircularAI() {

  if (state.circularRunning) return;

  state.circularRunning = true;

  els.startAI.textContent =
    "CIRCULAR AI RUNNING";

  els.circularStatusText.textContent =
    "RUNNING";

  runCircularPhase();

}

function stopCircularAI() {

  state.circularRunning = false;

  if (state.circularInterval) {

    clearInterval(
      state.circularInterval
    );

    state.circularInterval = null;

  }

  state.circularPhase = "IDLE";

  els.aiCircleStatus.textContent =
    "IDLE";

  els.circularStatusText.textContent =
    "READY";

  els.aiCircleLabel.textContent =
    "AI";

  els.aiCircleTimer.textContent =
    "--";

  els.cycleAnalysis.textContent =
    "STOPPED";

  els.cycleTrade.textContent =
    "WAITING";

}

function runCircularPhase() {

  if (!state.circularRunning) return;

  const phases = [

    {
      name: "ANALYZING",
      seconds: CONFIG.CIRCULAR_ANALYSIS_SECONDS
    },

    {
      name: "PREDICTING",
      seconds: CONFIG.CIRCULAR_PREDICT_SECONDS
    },

    {
      name: "TRADE WINDOW",
      seconds: CONFIG.CIRCULAR_TRADE_SECONDS
    },

    {
      name: "COOLDOWN",
      seconds: CONFIG.CIRCULAR_COOLDOWN_SECONDS
    }

  ];

  let index = 0;

  const nextPhase = () => {

    if (!state.circularRunning) return;

    const phase = phases[index];

    state.circularPhase =
      phase.name;

    let remaining =
      phase.seconds;

    els.aiCircleStatus.textContent =
      phase.name;

    els.cycleAnalysis.textContent =
      phase.name;

    els.aiCircleTimer.textContent =
      remaining;

    els.cycleTrade.textContent =
      phase.name === "TRADE WINDOW"
        ? "ACTIVE"
        : "WAITING";

    els.cycleCooldown.textContent =
      phase.name === "COOLDOWN"
        ? remaining
        : 0;

    if (phase.name === "PREDICTING") {

      updateAnalysis();

    }

    if (phase.name === "TRADE WINDOW") {

      executeCircularPaperTrade();

    }

    if (state.circularInterval) {
      clearInterval(state.circularInterval);
    }

    state.circularInterval =
      setInterval(() => {

        remaining--;

        els.aiCircleTimer.textContent =
          Math.max(remaining, 0);

        if (
          phase.name === "COOLDOWN"
        ) {

          els.cycleCooldown.textContent =
            Math.max(remaining, 0);

        }

        if (remaining <= 0) {

          clearInterval(
            state.circularInterval
          );

          index =
            (index + 1) % phases.length;

          nextPhase();

        }

      }, 1000);

  };

  nextPhase();

}

function executeCircularPaperTrade() {

  const analysis =
    analyzeCurrent();

  if (!analysis) return;

  const strategy =
    els.circularStrategyLabel.textContent === "AUTO"
      ? analysis.strategy
      : els.circularStrategyLabel.textContent;

  const stake =
    Number(
      els.circularStakeInput.value
    ) || 1;

  createPaperTrade({

    engine: "CIRCULAR AI",

    market: state.currentMarket,

    strategy,

    target:
      strategy === "MATCHES" ||
      strategy === "DIFFERS"
        ? analysis.hottest
        : null,

    stake

  });

}

function analyzeCurrent() {

  const list =
    state.ticks[state.currentMarket] || [];

  if (list.length < CONFIG.MIN_ANALYSIS_TICKS) {
    return null;
  }

  return analyzeDigits(
    list.map(t => t.digit)
  );

}

/* ================= AI BOT ================= */

function toggleBot() {

  state.botRunning =
    !state.botRunning;

  if (state.botRunning) {

    els.startBotBtn.textContent =
      "STOP AI BOT";

    els.botStatusDash.textContent =
      "RUNNING";

    els.engineStatusText.textContent =
      "AI BOT ACTIVE";

    runBotCycle();

    state.botInterval =
      setInterval(
        runBotCycle,
        CONFIG.BOT_INTERVAL_MS
      );

  } else {

    stopBot();

  }

}

function stopBot() {

  state.botRunning = false;

  if (state.botInterval) {

    clearInterval(
      state.botInterval
    );

    state.botInterval = null;

  }

  els.startBotBtn.textContent =
    "START AI BOT";

  els.botStatusDash.textContent =
    "STOPPED";

  els.engineStatusText.textContent =
    "PAPER MODE";

}

function runBotCycle() {

  if (!state.botRunning) return;

  const list =
    state.ticks[state.currentMarket] || [];

  if (
    list.length <
    CONFIG.MIN_ANALYSIS_TICKS
  ) {

    els.botStatusDash.textContent =
      "COLLECTING DATA";

    return;

  }

  const analysis =
    analyzeCurrent();

  if (!analysis) return;

  let strategy =
    analysis.strategy;

  if (
    !state.botStrategies.includes(strategy)
  ) {

    strategy =
      state.botStrategies[0] ||
      "EVEN";

  }

  const target =
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
      ? analysis.hottest
      : null;

  els.botSelectedStrategy.textContent =
    strategy;

  els.botScore.textContent =
    analysis.score;

  els.aiPredictionLarge.textContent =
    target !== null
      ? String(target)
      : strategy;

  els.predictionConfidence.textContent =
    `${analysis.confidence}% confidence`;

  /*
    The bot only enters when confidence
    reaches the minimum threshold.
  */

  if (analysis.confidence >= 58) {

    const stake =
      Number(els.stakeInput.value) || 1;

    createPaperTrade({

      engine: "AI BOT",

      market: state.currentMarket,

      strategy,

      target,

      stake

    });

  }

}

/* ================= MANUAL ================= */

function placeManualTrade() {

  const strategy =
    els.manualSelectedStrategyLabel.textContent;

  const market =
    els.manualMarketSelect.value;

  const stake =
    Number(
      els.manualStakeInput.value
    ) || 1;

  const target =
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
      ? Number(
          els.manualTargetDigitInput.value
        )
      : null;

  createPaperTrade({

    engine: "MANUAL",

    market,

    strategy,

    target,

    stake

  });

}

/* ================= PAPER TRADES ================= */

function createPaperTrade({
  engine,
  market,
  strategy,
  target,
  stake
}) {

  if (!Number.isFinite(stake) || stake <= 0) {

    showToast("Invalid stake.");

    return;

  }

  if (state.activeTrades.length >= 10) {

    showToast(
      "Maximum active paper trades reached."
    );

    return;

  }

  if (state.balance < stake) {

    showToast(
      "Insufficient demo balance."
    );

    return;

  }

  const id =
    ++state.tradeCounter;

  const trade = {

    id,

    engine,

    market,

    strategy,

    target,

    stake,

    entryDigit: null,

    entryPrice: null,

    exitDigit: null,

    createdAt: new Date(),

    status: "OPEN"

  };

  const list =
    state.ticks[market] || [];

  const latest =
    list[list.length - 1];

  if (latest) {

    trade.entryDigit =
      latest.digit;

    trade.entryPrice =
      latest.price;

  }

  state.balance -= stake;

  state.activeTrades.push(trade);

  state.stats.stake += stake;

  renderActiveTrades();

  updateBalance();

  showToast(
    `${engine}: ${strategy} paper trade opened`
  );

}

/* ================= SETTLEMENT ================= */

function settlePaperTrades(
  market,
  tick
) {

  const matching =
    state.activeTrades.filter(
      trade =>
        trade.market === market
    );

  if (!matching.length) return;

  matching.forEach(trade => {

    /*
      Wait for a tick after entry.
    */

    if (
      trade.entryPrice === tick.price
    ) return;

    const win =
      evaluateStrategy(
        trade.strategy,
        trade.target,
        tick.digit
      );

    settleTrade(
      trade,
      tick,
      win
    );

  });

}

function evaluateStrategy(
  strategy,
  target,
  digit
) {

  switch(strategy) {

    case "MATCHES":
      return digit === Number(target);

    case "DIFFERS":
      return digit !== Number(target);

    case "OVER":
      return digit > 4;

    case "UNDER":
      return digit < 5;

    case "EVEN":
      return digit % 2 === 0;

    case "ODD":
      return digit % 2 !== 0;

    default:
      return false;

  }

}

function settleTrade(
  trade,
  tick,
  win
) {

  const index =
    state.activeTrades.indexOf(trade);

  if (index === -1) return;

  state.activeTrades.splice(index, 1);

  const payout =
    win
      ? trade.stake *
        (1 + (
          CONFIG.PAYOUT[
            trade.strategy
          ] || .95
        ))
      : 0;

  const profit =
    payout - trade.stake;

  if (win) {

    state.balance += payout;

    state.stats.wins++;

    state.stats.won += payout;

  } else {

    state.stats.losses++;

  }

  state.stats.total++;

  state.stats.profit += profit;

  state.sessionProfit += profit;

  trade.exitDigit =
    tick.digit;

  trade.status =
    win ? "WIN" : "LOSS";

  trade.amountWon =
    payout;

  trade.profit =
    profit;

  trade.exitPrice =
    tick.price;

  trade.closedAt =
    new Date();

  state.paperTrades.unshift(
    trade
  );

  saveHistory();

  updateStatsUI();

  renderActiveTrades();

  updateHistoryUI();

  updateBalance();

}

/* ================= STATS ================= */

function updateStatsUI() {

  els.paperTotal.textContent =
    state.stats.total;

  els.paperWins.textContent =
    state.stats.wins;

  els.paperLosses.textContent =
    state.stats.losses;

  const accuracy =
    state.stats.total
      ? Math.round(
          state.stats.wins /
          state.stats.total *
          100
        )
      : 0;

  els.paperAccuracy.textContent =
    `${accuracy}%`;

}

function renderActiveTrades() {

  els.activeTradeCount.textContent =
    state.activeTrades.length;

  if (!state.activeTrades.length) {

    els.activeTradesList.innerHTML =
      `<div class="empty">No active trades.</div>`;

    return;

  }

  els.activeTradesList.innerHTML =
    state.activeTrades.map(trade => `

      <div class="active-trade">

        <div>
          <strong>${escapeHtml(trade.strategy)}</strong>
          <small>
            ${escapeHtml(trade.engine)}
            · ${escapeHtml(trade.market)}
          </small>
        </div>

        <div>
          <strong>
            $${Number(trade.stake).toFixed(2)}
          </strong>
          <small>
            #${trade.id}
          </small>
        </div>

      </div>

    `).join("");

}

/* ================= HISTORY ================= */

function saveHistory() {

  localStorage.setItem(
    "krishwave_history",
    JSON.stringify(
      state.paperTrades
    )
  );

}

function loadHistory() {

  try {

    const raw =
      localStorage.getItem(
        "krishwave_history"
      );

    if (!raw) return;

    state.paperTrades =
      JSON.parse(raw);

    recalculateStats();

    updateHistoryUI();

  } catch(error) {

    console.error(error);

  }

}

function recalculateStats() {

  state.stats = {

    total: state.paperTrades.length,

    wins:
      state.paperTrades.filter(
        t => t.status === "WIN"
      ).length,

    losses:
      state.paperTrades.filter(
        t => t.status === "LOSS"
      ).length,

    stake:
      state.paperTrades.reduce(
        (sum,t) =>
          sum + Number(t.stake || 0),
        0
      ),

    won:
      state.paperTrades.reduce(
        (sum,t) =>
          sum + Number(t.amountWon || 0),
        0
      ),

    profit:
      state.paperTrades.reduce(
        (sum,t) =>
          sum + Number(t.profit || 0),
        0
      )

  };

  state.sessionProfit =
    state.stats.profit;

}

function updateHistoryUI() {

  const totalStake =
    state.paperTrades.reduce(
      (sum,t) =>
        sum + Number(t.stake || 0),
      0
    );

  const amountWon =
    state.paperTrades.reduce(
      (sum,t) =>
        sum + Number(t.amountWon || 0),
      0
    );

  const netProfit =
    state.paperTrades.reduce(
      (sum,t) =>
        sum + Number(t.profit || 0),
      0
    );

  els.historyTotalStake.textContent =
    money(totalStake);

  els.historyAmountWon.textContent =
    money(amountWon);

  els.historyNetProfit.textContent =
    money(netProfit);

  els.totalProfitDisplay.textContent =
    money(netProfit);

  els.sessionProfitDisplay.textContent =
    money(state.sessionProfit);

  els.sessionProfitDisplay.className =
    state.sessionProfit >= 0
      ? "positive"
      : "negative";

  if (!state.paperTrades.length) {

    els.historyCardsList.innerHTML =
      `<div class="empty">No completed trades yet.</div>`;

    return;

  }

  els.historyCardsList.innerHTML =
    state.paperTrades
      .slice(0,100)
      .map(trade => {

        const win =
          trade.status === "WIN";

        return `

          <div class="history-card ${
            win
              ? "history-win"
              : "history-loss"
          }">

            <div class="history-top">

              <strong>
                ${escapeHtml(trade.engine)}
              </strong>

              <strong class="result">
                ${win ? "WIN" : "LOSS"}
                ${
                  win
                    ? ` +${money(trade.profit)}`
                    : ` ${money(trade.profit)}`
                }
              </strong>

            </div>

            <div class="history-details">

              <div>
                <span>MARKET</span>
                <strong>
                  ${escapeHtml(trade.market)}
                </strong>
              </div>

              <div>
                <span>STRATEGY</span>
                <strong>
                  ${escapeHtml(trade.strategy)}
                </strong>
              </div>

              <div>
                <span>STAKE</span>
                <strong>
                  ${money(trade.stake)}
                </strong>
              </div>

              <div>
                <span>AMOUNT WON</span>
                <strong>
                  ${money(trade.amountWon)}
                </strong>
              </div>

              <div>
                <span>ENTRY</span>
                <strong>
                  ${trade.entryDigit ?? "-"}
                </strong>
              </div>

              <div>
                <span>EXIT</span>
                <strong>
                  ${trade.exitDigit ?? "-"}
                </strong>
              </div>

              <div>
                <span>TARGET</span>
                <strong>
                  ${trade.target ?? "-"}
                </strong>
              </div>

              <div>
                <span>TIME</span>
                <strong>
                  ${formatTime(trade.closedAt)}
                </strong>
              </div>

            </div>

          </div>

        `;

      })
      .join("");

}

/* ================= CLOUD AUTH ================= */

async function startDerivOAuth() {

  if (
    CONFIG.CLOUD_API.includes(
      "REPLACE-WITH"
    )
  ) {

    showToast(
      "First deploy the Cloudflare Worker and add its URL to app.js."
    );

    return;

  }

  try {

    const verifier =
      randomString(64);

    const stateValue =
      randomString(32);

    const challenge =
      await sha256Base64Url(verifier);

    sessionStorage.setItem(
      "krishwave_pkce_verifier",
      verifier
    );

    sessionStorage.setItem(
      "krishwave_oauth_state",
      stateValue
    );

    const url =
      new URL(
        "https://auth.deriv.com/oauth2/auth"
      );

    url.searchParams.set(
      "response_type",
      "code"
    );

    url.searchParams.set(
      "client_id",
      CONFIG.CLIENT_ID
    );

    url.searchParams.set(
      "redirect_uri",
      CONFIG.REDIRECT_URI
    );

    url.searchParams.set(
      "scope",
      "trade"
    );

    url.searchParams.set(
      "state",
      stateValue
    );

    url.searchParams.set(
      "code_challenge",
      challenge
    );

    url.searchParams.set(
      "code_challenge_method",
      "S256"
    );

    window.location.href =
      url.toString();

  } catch(error) {

    console.error(error);

    showToast(
      "Unable to start Deriv login."
    );

  }

}

async function handleOAuthCallback() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const code =
    params.get("code");

  const returnedState =
    params.get("state");

  const error =
    params.get("error");

  if (error) {

    showToast(
      params.get("error_description") ||
      error
    );

    cleanUrl();

    return;

  }

  if (!code) return;

  const savedState =
    sessionStorage.getItem(
      "krishwave_oauth_state"
    );

  const verifier =
    sessionStorage.getItem(
      "krishwave_pkce_verifier"
    );

  if (
    !savedState ||
    !returnedState ||
    savedState !== returnedState
  ) {

    showToast(
      "OAuth security check failed."
    );

    cleanUrl();

    return;

  }

  if (!verifier) {

    showToast(
      "PKCE verifier missing."
    );

    cleanUrl();

    return;

  }

  updateStatus(
    "Completing secure Deriv login..."
  );

  try {

    const response =
      await fetch(
        `${CONFIG.CLOUD_API}/api/oauth/exchange`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            code,
            code_verifier: verifier
          })
        }
      );

    const result =
      await response.json();

    if (!response.ok) {

      throw new Error(
        result.error ||
        "OAuth exchange failed."
      );

    }

    if (!result.session) {

      throw new Error(
        "Cloud session was not created."
      );

    }

    state.sessionToken =
      result.session;

    sessionStorage.setItem(
      "krishwave_cloud_session",
      result.session
    );

    sessionStorage.removeItem(
      "krishwave_pkce_verifier"
    );

    sessionStorage.removeItem(
      "krishwave_oauth_state"
    );

    cleanUrl();

    await restoreCloudSession();

    showToast(
      "Deriv demo account connected."
    );

  } catch(error) {

    console.error(error);

    showToast(
      error.message ||
      "Deriv connection failed."
    );

    updateStatus(
      "Deriv authentication failed."
    );

    cleanUrl();

  }

}

async function restoreCloudSession() {

  if (!state.sessionToken) return;

  try {

    const response =
      await cloudFetch(
        "/api/session"
      );

    if (!response.ok) {

      throw new Error(
        "Session expired."
      );

    }

    const data =
      await response.json();

    if (data.account) {

      state.accountId =
        data.account.account_id;

      state.currency =
        data.account.currency ||
        "USD";

      state.balance =
        Number(
          data.account.balance || 0
        );

      els.accountId.textContent =
        state.accountId;

      els.currency.textContent =
        state.currency;

      updateBalance();

    }

    if (data.wsUrl) {

      connectAuthenticatedWs(
        data.wsUrl
      );

    } else if (state.accountId) {

      await requestAuthenticatedWs();

    }

  } catch(error) {

    console.error(error);

    sessionStorage.removeItem(
      "krishwave_cloud_session"
    );

    state.sessionToken = null;

    showToast(
      "Cloud session expired. Reconnect Deriv."
    );

  }

}

async function requestAuthenticatedWs() {

  try {

    const response =
      await cloudFetch(
        `/api/otp?accountId=${encodeURIComponent(
          state.accountId
        )}`
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not get authenticated WebSocket."
      );

    }

    connectAuthenticatedWs(
      data.wsUrl
    );

  } catch(error) {

    console.error(error);

    showToast(
      error.message
    );

  }

}

function connectAuthenticatedWs(wsUrl) {

  if (state.authWs) {

    try {
      state.authWs.close();
    } catch {}

  }

  try {

    state.authWs =
      new WebSocket(wsUrl);

    state.authWs.onopen = () => {

      updateStatus(
        "Authenticated Deriv DEMO connection live."
      );

      requestBalance();

      requestAuthenticatedTicks(
        state.currentMarket
      );

    };

    state.authWs.onmessage =
      event => {

        let data;

        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        processAuthenticatedMessage(
          data
        );

      };

    state.authWs.onerror = () => {

      updateStatus(
        "Authenticated Deriv connection error."
      );

    };

    state.authWs.onclose = () => {

      updateStatus(
        "Authenticated connection closed."
      );

    };

  } catch(error) {

    console.error(error);

  }

}

function processAuthenticatedMessage(
  data
) {

  if (data.msg_type === "balance") {

    if (data.balance) {

      state.balance =
        Number(
          data.balance.balance
        );

      state.currency =
        data.balance.currency ||
        state.currency;

      state.accountId =
        data.balance.loginid ||
        state.accountId;

      updateBalance();

    }

  }

  if (data.msg_type === "tick") {

    const tick =
      data.tick;

    if (!tick) return;

    addTick(
      tick.symbol ||
        state.currentMarket,
      Number(tick.quote),
      Number(tick.epoch || Date.now() / 1000)
    );

  }

  if (data.error) {

    updateStatus(
      data.error.message ||
      "Authenticated Deriv API error."
    );

  }

}

function sendAuthenticated(
  payload
) {

  if (
    state.authWs &&
    state.authWs.readyState ===
      WebSocket.OPEN
  ) {

    state.authWs.send(
      JSON.stringify(payload)
    );

    return true;

  }

  return false;

}

function requestBalance() {

  sendAuthenticated({

    balance: 1,

    subscribe: 1,

    req_id: 501

  });

}

function requestAuthenticatedTicks(
  symbol
) {

  sendAuthenticated({

    ticks: symbol,

    subscribe: 1,

    req_id: 502

  });

}

/* ================= CLOUD FETCH ================= */

async function cloudFetch(
  path,
  options = {}
) {

  const headers =
    new Headers(
      options.headers || {}
    );

  headers.set(
    "X-KRISHWAVE-SESSION",
    state.sessionToken || ""
  );

  return fetch(
    `${CONFIG.CLOUD_API}${path}`,
    {
      ...options,
      headers
    }
  );

}

/* ================= PKCE ================= */

function randomString(length) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const values =
    new Uint8Array(length);

  crypto.getRandomValues(values);

  return Array.from(
    values,
    value =>
      chars[value % chars.length]
  ).join("");

}

async function sha256Base64Url(
  value
) {

  const data =
    new TextEncoder().encode(value);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return base64Url(
    new Uint8Array(hash)
  );

}

function base64Url(bytes) {

  let binary = "";

  bytes.forEach(
    byte =>
      binary += String.fromCharCode(byte)
  );

  return btoa(binary)
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/,"");

}

/* ================= UI ================= */

function setConnection(
  online,
  text
) {

  els.connectionDot.className =
    `dot ${online ? "online" : "offline"}`;

  els.connectionText.textContent =
    text;

}

function updateStatus(message) {

  els.dataStatus.textContent =
    message;

}

function updateBalance() {

  els.balanceDisplay.textContent =
    `${state.currency} ${
      Number(state.balance).toFixed(2)
    }`;

}

function money(value) {

  return `$${Number(
    value || 0
  ).toFixed(2)}`;

}

function showToast(message) {

  els.toastMessage.textContent =
    message;

  els.toast.classList.add("show");

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(
      () =>
        els.toast.classList.remove(
          "show"
        ),
      3000
    );

}

function cleanUrl() {

  window.history.replaceState(
    {},
    document.title,
    CONFIG.REDIRECT_URI
  );

}

/* ================= NAVIGATION ================= */

function setupNavigation() {

  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const page =
            button.dataset.page;

          document
            .querySelectorAll(
              ".page"
            )
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );

          const target =
            $(`${page}Page`);

          if (target) {
            target.classList.add(
              "active"
            );
          }

          document
            .querySelectorAll(
              ".nav-item"
            )
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

        }
      );

    });

}

/* ================= TABS ================= */

function setupTabs() {

  const tabs = [

    [
      els.tabAiBot,
      els.aiBotPanel
    ],

    [
      els.tabCircularAI,
      els.circularPanel
    ],

    [
      els.tabManual,
      els.manualPanel
    ]

  ];

  tabs.forEach(
    ([button,panel]) => {

      button.addEventListener(
        "click",
        () => {

          tabs.forEach(
            ([b,p]) => {

              b.classList.remove(
                "active"
              );

              p.classList.remove(
                "active"
              );

            }
          );

          button.classList.add(
            "active"
          );

          panel.classList.add(
            "active"
          );

        }
      );

    }
  );

}

/* ================= STRATEGY UI ================= */

function setupStrategyControls() {

  [
    els.botStrategyTrigger,
    els.circularStrategyTrigger,
    els.manualStrategyTrigger
  ].forEach(
    button => {

      button.addEventListener(
        "click",
        openStrategyModal
      );

    }
  );

  els.strategyOptions
    .querySelectorAll(
      "[data-strategy]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const strategy =
            button.dataset.strategy;

          applySelectedStrategy(
            strategy
          );

          els.strategyModal
            .classList.remove(
              "show"
            );

        }
      );

    });

  els.botStrategyTrigger
    .addEventListener(
      "click",
      () =>
        els.botStrategyModal
          .classList.add("show")
    );

}

function openStrategyModal() {

  els.strategyModal
    .classList.add("show");

}

function applySelectedStrategy(
  strategy
) {

  els.circularStrategyLabel.textContent =
    strategy;

  els.manualSelectedStrategyLabel.textContent =
    strategy;

  state.strategy =
    strategy;

  updateStrategyUI();

}

function updateStrategyUI() {

  const strategy =
    els.manualSelectedStrategyLabel
      .textContent;

  const digitRequired =
    strategy === "MATCHES" ||
    strategy === "DIFFERS";

  els.targetDigitContainer.style.display =
    digitRequired
      ? "block"
      : "none";

}

/* ================= BUTTONS ================= */

function setupButtons() {

  els.connectDerivBtn
    .addEventListener(
      "click",
      startDerivOAuth
    );

  els.startAI
    .addEventListener(
      "click",
      () => {

        if (state.circularRunning) {
          stopCircularAI();
        } else {
          startCircularAI();
        }

      }
    );

  els.stopAI
    .addEventListener(
      "click",
      stopCircularAI
    );

  els.startBotBtn
    .addEventListener(
      "click",
      toggleBot
    );

  els.startCircularTradeBtn
    .addEventListener(
      "click",
      () => {

        if (!state.circularRunning) {

          startCircularAI();

          showToast(
            "Circular AI trading started in demo mode."
          );

        } else {

          stopCircularAI();

        }

      }
    );

  els.placeTradeBtn
    .addEventListener(
      "click",
      placeManualTrade
    );

  els.closeStrategyModal
    .addEventListener(
      "click",
      () =>
        els.strategyModal
          .classList.remove("show")
    );

  els.closeBotStrategyModal
    .addEventListener(
      "click",
      () =>
        els.botStrategyModal
          .classList.remove("show")
    );

  els.applyBotStrategies
    .addEventListener(
      "click",
      applyBotStrategies
    );

  els.clearLogsBtn
    .addEventListener(
      "click",
      clearHistory
    );

  els.stopTradingBtn
    .addEventListener(
      "click",
      () => {

        stopBot();
        stopCircularAI();

        showToast(
          "Trading engines stopped."
        );

      }
    );

  els.analysisMarketSelect
    .addEventListener(
      "change",
      event =>
        subscribeMarket(
          event.target.value
        )
    );

  els.botMarketSelect
    .addEventListener(
      "change",
      event => {

        state.currentMarket =
          event.target.value;

        subscribeMarket(
          event.target.value
        );

      }
    );

  els.circularMarketSelect
    .addEventListener(
      "change",
      event => {

        state.currentMarket =
          event.target.value;

        subscribeMarket(
          event.target.value
        );

      }
    );

  els.manualMarketSelect
    .addEventListener(
      "change",
      event => {

        state.currentMarket =
          event.target.value;

      }
    );

}

/* ================= BOT STRATEGIES ================= */

function applyBotStrategies() {

  const checked =
    Array.from(
      document.querySelectorAll(
        ".bot-strategy-check:checked"
      )
    ).map(
      input => input.value
    );

  if (!checked.length) {

    showToast(
      "Select at least one strategy."
    );

    return;

  }

  state.botStrategies =
    checked;

  els.botStrategyLabel.textContent =
    checked.length === 6
      ? "AUTO"
      : checked.join(" / ");

  els.botStrategyModal
    .classList.remove(
      "show"
    );

}

/* ================= THEME ================= */

function setupTheme() {

  const saved =
    localStorage.getItem(
      "krishwave_theme"
    );

  if (saved === "light") {
    document.body.classList.add(
      "light"
    );
  }

  els.themeToggle
    .addEventListener(
      "click",
      () => {

        document.body.classList.toggle(
          "light"
        );

        localStorage.setItem(
          "krishwave_theme",
          document.body.classList.contains(
            "light"
          )
            ? "light"
            : "dark"
        );

      }
    );

}

/* ================= CHART ================= */

function drawChart() {

  const canvas =
    els.priceChartCanvas;

  if (!canvas) return;

  const rect =
    canvas.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio || 1;

  canvas.width =
    rect.width * dpr;

  canvas.height =
    rect.height * dpr;

  const ctx =
    canvas.getContext("2d");

  ctx.scale(dpr,dpr);

  const width =
    rect.width;

  const height =
    rect.height;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const prices =
    state.chartPrices;

  if (prices.length < 2) return;

  const min =
    Math.min(...prices);

  const max =
    Math.max(...prices);

  const range =
    max - min || 1;

  ctx.beginPath();

  prices.forEach(
    (price,index) => {

      const x =
        (index /
          (prices.length - 1)) *
        width;

      const y =
        height -
        ((price - min) / range) *
        (height - 20) -
        10;

      if (index === 0) {
        ctx.moveTo(x,y);
      } else {
        ctx.lineTo(x,y);
      }

    }
  );

  ctx.strokeStyle =
    "#00e5ff";

  ctx.lineWidth = 2;

  ctx.stroke();

}

window.addEventListener(
  "resize",
  drawChart
);

/* ================= CLEAR HISTORY ================= */

function clearHistory() {

  if (
    !confirm(
      "Clear KRISHWAVE trading history?"
    )
  ) return;

  state.paperTrades = [];

  recalculateStats();

  localStorage.removeItem(
    "krishwave_history"
  );

  updateStatsUI();

  updateHistoryUI();

  showToast(
    "Trading history cleared."
  );

}

/* ================= HELPERS ================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

}

function formatTime(value) {

  if (!value) return "-";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) return "-";

  return date.toLocaleTimeString(
    [],
    {
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit"
    }
  );

}