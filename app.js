/* =========================================================
   KRISHWAVE AI BEAST V8.0
   PREMIUM DEMO / PAPER INTELLIGENCE ENGINE

   IMPORTANT
   ---------------------------------------------------------
   DEMO / PAPER ONLY
   NO REAL DERIV TRADES ARE EXECUTED.

   ENGINES
   ---------------------------------------------------------
   AI BOT:
   3 SEC SCAN -> DECISION -> PAPER TRADE -> SETTLE

   CIRCULAR AI:
   10 SEC ANALYSIS
   -> 5 SEC PREDICTION
   -> 3 SEC TRADE WINDOW
   -> 3 SEC COOLDOWN
   -> REPEAT

   CIRCULAR AI NEVER FORCES A WEAK TRADE.
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const CONFIG = {

  VERSION: "8.0",

  CLIENT_ID:
    "34khasPjsT0PCRR8X3Z70",

  REDIRECT_URI:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/",

  CLOUD_API:
    "https://krishwave2.chrispusatale99.workers.dev",

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

  SCAN_TICKS: 60,

  CIRCULAR_ANALYSIS_SECONDS: 10,

  CIRCULAR_PREDICT_SECONDS: 5,

  CIRCULAR_TRADE_SECONDS: 3,

  CIRCULAR_COOLDOWN_SECONDS: 3,

  BOT_INTERVAL_MS: 3000,

  START_PAPER_BALANCE: 1000,

  MIN_STAKE: 0.25,

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
   STATE
   ========================================================= */

const state = {

  sessionToken:
    sessionStorage.getItem(
      "krishwave_cloud_session"
    ) || null,

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

  publicReconnectTimer: null,

  tradeCounter: 0,

  paperBalance:
    Number(
      localStorage.getItem(
        "krishwave_paper_balance"
      )
    ) || CONFIG.START_PAPER_BALANCE,

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


/* =========================================================
   DOM
   ========================================================= */

const $ = id =>
  document.getElementById(id);

const els = {

  connectionDot:
    $("connectionDot"),

  connectionText:
    $("connectionText"),

  modeBadge:
    $("modeBadge"),

  accountId:
    $("accountId"),

  currency:
    $("currency"),

  balanceDisplay:
    $("balanceDisplay"),

  dataStatus:
    $("dataStatus"),

  connectDerivBtn:
    $("connectDerivBtn"),

  analysisPage:
    $("analysisPage"),

  tradePage:
    $("tradePage"),

  historyPage:
    $("historyPage"),

  analysisMarketSelect:
    $("analysisMarketSelect"),

  currentChartMarket:
    $("currentChartMarket"),

  currentLivePrice:
    $("currentLivePrice"),

  priceChartCanvas:
    $("priceChartCanvas"),

  aiStatus:
    $("aiStatus"),

  analysisConfidence:
    $("analysisConfidence"),

  aiMarket:
    $("aiMarket"),

  aiPrediction:
    $("aiPrediction"),

  aiType:
    $("aiType"),

  analysisMsg:
    $("analysisMsg"),

  digitSampleCount:
    $("digitSampleCount"),

  lastDigit:
    $("lastDigit"),

  digitStatsGrid:
    $("digitStatsGrid"),

  aiCircleStatus:
    $("aiCircleStatus"),

  aiCircleLabel:
    $("aiCircleLabel"),

  aiCirclePrediction:
    $("aiCirclePrediction"),

  cycleAnalysis:
    $("cycleAnalysis"),

  cycleTrade:
    $("cycleTrade"),

  aiCircleTimer:
    $("aiCircleTimer"),

  cycleCooldown:
    $("cycleCooldown"),

  startAI:
    $("startAI"),

  stopAI:
    $("stopAI"),

  tabAiBot:
    $("tabAiBot"),

  tabCircularAI:
    $("tabCircularAI"),

  tabManual:
    $("tabManual"),

  aiBotPanel:
    $("aiBotPanel"),

  circularPanel:
    $("circularPanel"),

  manualPanel:
    $("manualPanel"),

  engineStatusText:
    $("engineStatusText"),

  botStatusDash:
    $("botStatusDash"),

  botSelectedMarket:
    $("botSelectedMarket"),

  botScore:
    $("botScore"),

  aiPredictionLarge:
    $("aiPredictionLarge"),

  predictionConfidence:
    $("predictionConfidence"),

  botMarketSelect:
    $("botMarketSelect"),

  stakeInput:
    $("stakeInput"),

  takeProfitInput:
    $("takeProfitInput"),

  stopLossInput:
    $("stopLossInput"),

  martingaleInput:
    $("martingaleInput"),

  botStrategyTrigger:
    $("botStrategyTrigger"),

  botStrategyLabel:
    $("botStrategyLabel"),

  startBotBtn:
    $("startBotBtn"),

  circularStatusText:
    $("circularStatusText"),

  circularMarketSelect:
    $("circularMarketSelect"),

  circularStrategyTrigger:
    $("circularStrategyTrigger"),

  circularStrategyLabel:
    $("circularStrategyLabel"),

  circularStakeInput:
    $("circularStakeInput"),

  circularTakeProfitInput:
    $("circularTakeProfitInput"),

  circularStopLossInput:
    $("circularStopLossInput"),

  startCircularTradeBtn:
    $("startCircularTradeBtn"),

  manualStatusText:
    $("manualStatusText"),

  manualMarketSelect:
    $("manualMarketSelect"),

  manualStrategyTrigger:
    $("manualStrategyTrigger"),

  manualSelectedStrategyLabel:
    $("manualSelectedStrategyLabel"),

  targetDigitContainer:
    $("targetDigitContainer"),

  manualTargetDigitInput:
    $("manualTargetDigitInput"),

  manualStakeInput:
    $("manualStakeInput"),

  manualTakeProfitInput:
    $("manualTakeProfitInput"),

  manualStopLossInput:
    $("manualStopLossInput"),

  placeTradeBtn:
    $("placeTradeBtn"),

  paperTotal:
    $("paperTotal"),

  paperWins:
    $("paperWins"),

  paperLosses:
    $("paperLosses"),

  paperAccuracy:
    $("paperAccuracy"),

  activeTradeCount:
    $("activeTradeCount"),

  activeTradesList:
    $("activeTradesList"),

  clearLogsBtn:
    $("clearLogsBtn"),

  tradingStatusLabel:
    $("tradingStatusLabel"),

  sessionProfitDisplay:
    $("sessionProfitDisplay"),

  stopTradingBtn:
    $("stopTradingBtn"),

  totalProfitDisplay:
    $("totalProfitDisplay"),

  historyTotalStake:
    $("historyTotalStake"),

  historyAmountWon:
    $("historyAmountWon"),

  historyNetProfit:
    $("historyNetProfit"),

  historyCardsList:
    $("historyCardsList"),

  strategyModal:
    $("strategyModal"),

  closeStrategyModal:
    $("closeStrategyModal"),

  strategyOptions:
    $("strategyOptions"),

  botStrategyModal:
    $("botStrategyModal"),

  closeBotStrategyModal:
    $("closeBotStrategyModal"),

  applyBotStrategies:
    $("applyBotStrategies"),

  realConfirmModal:
    $("realConfirmModal"),

  confirmRealBtn:
    $("confirmRealBtn"),

  cancelRealBtn:
    $("cancelRealBtn"),

  themeToggle:
    $("themeToggle"),

  toast:
    $("toast"),

  toastMessage:
    $("toastMessage")

};


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initializeApp
);


function initializeApp() {

  populateMarkets();

  loadHistory();

  setupNavigation();

  setupTabs();

  setupStrategyControls();

  setupButtons();

  setupTheme();

  updateStrategyUI();

  updateStatsUI();

  updatePaperBalance();

  updateModeUI();

  updateConnectionUI();

  updateAccountUI();

  connectPublicMarket();

  drawChart();

  handleOAuthCallback();

  if (state.sessionToken) {

    restoreCloudSession();

  }

  updateStatus(
    "KRISHWAVE BEAST is scanning for market data..."
  );

}


/* =========================================================
   MARKETS
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

      const option =
        document.createElement(
          "option"
        );

      option.value = symbol;

      option.textContent = symbol;

      option.selected =
        symbol === state.currentMarket;

      select.appendChild(option);

    });

  });

}


/* =========================================================
   PUBLIC WEBSOCKET
   ========================================================= */

function connectPublicMarket() {

  if (
    state.publicWs &&
    (
      state.publicWs.readyState ===
        WebSocket.OPEN ||
      state.publicWs.readyState ===
        WebSocket.CONNECTING
    )
  ) {

    return;

  }

  setConnection(
    false,
    "CONNECTING"
  );

  try {

    state.publicWs =
      new WebSocket(
        CONFIG.PUBLIC_WS
      );

    state.publicWs.onopen =
      () => {

        setConnection(
          true,
          "LIVE"
        );

        subscribeMarket(
          state.currentMarket
        );

        updateStatus(
          "BEAST market scanner connected."
        );

      };

    state.publicWs.onmessage =
      event => {

        let data;

        try {

          data =
            JSON.parse(
              event.data
            );

        } catch {

          return;

        }

        processPublicMessage(data);

      };

    state.publicWs.onerror =
      error => {

        console.error(
          "Public WS error:",
          error
        );

        setConnection(
          false,
          "ERROR"
        );

        updateStatus(
          "Market feed connection error."
        );

      };

    state.publicWs.onclose =
      () => {

        state.publicWs =
          null;

        setConnection(
          false,
          "OFFLINE"
        );

        updateStatus(
          "Market feed disconnected. Reconnecting..."
        );

        clearTimeout(
          state.publicReconnectTimer
        );

        state.publicReconnectTimer =
          setTimeout(
            () => {

              state.publicReconnectTimer =
                null;

              connectPublicMarket();

            },
            3000
          );

      };

  } catch(error) {

    console.error(error);

    setConnection(
      false,
      "ERROR"
    );

  }

}


function sendPublic(payload) {

  if (
    state.publicWs &&
    state.publicWs.readyState ===
      WebSocket.OPEN
  ) {

    state.publicWs.send(
      JSON.stringify(payload)
    );

    return true;

  }

  return false;

}


/* =========================================================
   MARKET SUBSCRIPTION
   ========================================================= */

function subscribeMarket(symbol) {

  if (
    !CONFIG.MARKETS.includes(symbol)
  ) {

    return;

  }

  const previous =
    state.currentMarket;

  state.currentMarket =
    symbol;

  resetMarketState(symbol);

  /*
   * Prevent old subscriptions from
   * continuously feeding unwanted markets.
   */

  if (
    state.publicWs &&
    state.publicWs.readyState ===
      WebSocket.OPEN
  ) {

    if (
      state.subscribedMarket &&
      state.subscribedMarket !== symbol
    ) {

      sendPublic({

        forget_all:
          "ticks",

        req_id:
          900

      });

    }

    sendPublic({

      ticks:
        symbol,

      subscribe:
        1,

      req_id:
        901

    });

    sendPublic({

      ticks_history:
        symbol,

      count:
        CONFIG.MAX_TICKS,

      end:
        "latest",

      style:
        "ticks",

      req_id:
        902

    });

    state.subscribedMarket =
      symbol;

  }

  syncMarketSelectors();

  if (
    state.authWs &&
    state.authWs.readyState ===
      WebSocket.OPEN
  ) {

    requestAuthenticatedTicks(
      symbol
    );

  }

  if (
    previous !== symbol
  ) {

    updateStatus(
      `BEAST switched to ${symbol}. Collecting intelligence...`
    );

  }

}


function resetMarketState(symbol) {

  state.ticks[symbol] =
    state.ticks[symbol] || [];

  state.chartPrices = [];

  const list =
    state.ticks[symbol];

  list
    .slice(-80)
    .forEach(
      tick =>
        state.chartPrices.push(
          tick.price
        )
    );

  const latest =
    list[list.length - 1];

  state.lastDigit =
    latest
      ? latest.digit
      : null;

  if (els.currentChartMarket) {

    els.currentChartMarket.textContent =
      symbol;

  }

  if (els.aiMarket) {

    els.aiMarket.textContent =
      symbol;

  }

  if (els.botSelectedMarket) {

    els.botSelectedMarket.textContent =
      symbol;

  }

  if (els.currentLivePrice) {

    els.currentLivePrice.textContent =
      latest
        ? formatPrice(
            latest.price
          )
        : "--";

  }

  if (els.lastDigit) {

    els.lastDigit.textContent =
      latest
        ? latest.digit
        : "--";

  }

  if (els.digitSampleCount) {

    els.digitSampleCount.textContent =
      list.length;

  }

  drawChart();

  updateAnalysis();

}


function syncMarketSelectors() {

  [
    els.analysisMarketSelect,
    els.botMarketSelect,
    els.circularMarketSelect,
    els.manualMarketSelect
  ].forEach(select => {

    if (select) {

      select.value =
        state.currentMarket;

    }

  });

}


/* =========================================================
   PUBLIC DATA
   ========================================================= */

function processPublicMessage(data) {

  if (
    data.msg_type ===
    "tick"
  ) {

    const tick =
      data.tick;

    if (!tick) return;

    addTick(

      tick.symbol ||
      state.currentMarket,

      Number(
        tick.quote
      ),

      Number(
        tick.epoch ||
        Date.now() / 1000
      )

    );

  }

  if (
    data.msg_type ===
    "history"
  ) {

    processHistory(data);

  }

  if (data.error) {

    updateStatus(
      data.error.message ||
      "Deriv market error."
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

  state.ticks[symbol] =
    [];

  prices.forEach(
    (price, index) => {

      addTick(

        symbol,

        Number(price),

        Number(
          times[index] ||
          Date.now() / 1000
        ),

        false

      );

    }
  );

  if (
    symbol ===
    state.currentMarket
  ) {

    state.chartPrices =
      state.ticks[symbol]
        .slice(-80)
        .map(
          tick =>
            tick.price
        );

    updateAnalysis();

    drawChart();

  }

}


/* =========================================================
   TICKS
   ========================================================= */

function addTick(
  symbol,
  price,
  epoch,
  redraw = true
) {

  if (
    !Number.isFinite(price)
  ) {

    return;

  }

  if (
    !state.ticks[symbol]
  ) {

    state.ticks[symbol] =
      [];

  }

  const list =
    state.ticks[symbol];

  const tick = {

    price,

    epoch,

    digit:
      getLastDigit(price)

  };

  list.push(tick);

  while (
    list.length >
    CONFIG.MAX_TICKS
  ) {

    list.shift();

  }

  if (
    symbol ===
    state.currentMarket
  ) {

    state.lastDigit =
      tick.digit;

    state.chartPrices.push(
      price
    );

    while (
      state.chartPrices.length >
      80
    ) {

      state.chartPrices.shift();

    }

    if (els.currentLivePrice) {

      els.currentLivePrice.textContent =
        formatPrice(price);

    }

    if (els.lastDigit) {

      els.lastDigit.textContent =
        tick.digit;

    }

    if (els.digitSampleCount) {

      els.digitSampleCount.textContent =
        list.length;

    }

    if (redraw) {

      updateAnalysis();

      drawChart();

    }

  }

  settlePaperTrades(
    symbol,
    tick
  );

}


/* =========================================================
   DIGIT EXTRACTION
   ========================================================= */

function getLastDigit(price) {

  const value =
    Number(price);

  if (
    !Number.isFinite(value)
  ) {

    return 0;

  }

  const text =
    value.toFixed(5);

  const digits =
    text.replace(
      /\D/g,
      ""
    );

  return Number(
    digits.charAt(
      digits.length - 1
    )
  );

}


function formatPrice(price) {

  return Number(
    price
  ).toFixed(5);

}


/* =========================================================
   MASTER ANALYSIS
   ========================================================= */

function updateAnalysis() {

  const analysis =
    analyzeCurrent();

  state.currentAnalysis =
    analysis;

  if (!analysis) {

    showWaitingAnalysis();

    return;

  }

  renderAnalysis(
    analysis
  );

}


function showWaitingAnalysis() {

  if (els.aiStatus) {

    els.aiStatus.textContent =
      "COLLECTING DATA";

  }

  if (els.aiPrediction) {

    els.aiPrediction.textContent =
      "WAITING";

  }

  if (els.aiCirclePrediction) {

    els.aiCirclePrediction.textContent =
      "--";

  }

  if (els.analysisConfidence) {

    els.analysisConfidence.textContent =
      "0%";

  }

  if (els.analysisMsg) {

    els.analysisMsg.textContent =
      "Waiting for enough market data.";

  }

  if (els.aiType) {

    els.aiType.textContent =
      "WAIT";

  }

}


function renderAnalysis(analysis) {

  const signal =
    analysis.signal;

  const prediction =
    analysis.prediction;

  if (els.aiStatus) {

    els.aiStatus.textContent =
      signal;

  }

  if (els.aiPrediction) {

    els.aiPrediction.textContent =
      prediction;

  }

  if (els.aiType) {

    els.aiType.textContent =
      analysis.strategy;

  }

  if (els.analysisConfidence) {

    els.analysisConfidence.textContent =
      `${analysis.confidence}%`;

  }

  if (els.analysisMsg) {

    els.analysisMsg.textContent =
      analysis.reason;

  }

  if (els.aiCirclePrediction) {

    els.aiCirclePrediction.textContent =
      prediction;

  }

  if (els.aiMarket) {

    els.aiMarket.textContent =
      analysis.market;

  }

  if (els.botSelectedMarket) {

    els.botSelectedMarket.textContent =
      analysis.market;

  }

  if (els.botScore) {

    els.botScore.textContent =
      analysis.beastScore;

  }

  if (els.aiPredictionLarge) {

    els.aiPredictionLarge.textContent =
      prediction;

  }

  if (els.predictionConfidence) {

    els.predictionConfidence.textContent =
      `${analysis.confidence}% confidence`;

  }

  renderDigitStats(
    analysis.counts,
    analysis.total
  );

}


/* =========================================================
   CURRENT MARKET ANALYSIS
   ========================================================= */

function analyzeCurrent() {

  const list =
    state.ticks[
      state.currentMarket
    ] || [];

  if (
    list.length <
    CONFIG.MIN_ANALYSIS_TICKS
  ) {

    return null;

  }

  return analyzeMarket(
    state.currentMarket,
    list
  );

}


/* =========================================================
   BEAST MARKET ANALYZER
   ========================================================= */

function analyzeMarket(
  market,
  list
) {

  const recent =
    list.slice(
      -Math.min(
        CONFIG.SCAN_TICKS,
        list.length
      )
    );

  if (
    recent.length <
    CONFIG.MIN_ANALYSIS_TICKS
  ) {

    return null;

  }

  const digits =
    recent.map(
      tick =>
        tick.digit
    );

  const total =
    digits.length;

  const counts =
    Array(10).fill(0);

  digits.forEach(
    digit =>
      counts[digit]++
  );

  const sortedDigits =
    counts
      .map(
        (
          count,
          digit
        ) => ({
          digit,
          count
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          b.count -
          a.count
      );

  const hottest =
    sortedDigits[0]?.digit ??
    0;

  const coldest =
    sortedDigits[9]?.digit ??
    0;

  const hotRate =
    counts[hottest] /
    total;

  const coldRate =
    counts[coldest] /
    total;

  const even =
    digits.filter(
      d =>
        d % 2 === 0
    ).length;

  const odd =
    total - even;

  const over =
    digits.filter(
      d =>
        d > 4
    ).length;

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

  const recentDigits =
    digits.slice(
      -10
    );

  const recentEven =
    recentDigits.filter(
      d =>
        d % 2 === 0
    ).length /
    Math.max(
      recentDigits.length,
      1
    );

  const recentOver =
    recentDigits.filter(
      d =>
        d > 4
    ).length /
    Math.max(
      recentDigits.length,
      1
    );

  const firstHalf =
    digits.slice(
      0,
      Math.floor(
        total / 2
      )
    );

  const secondHalf =
    digits.slice(
      Math.floor(
        total / 2
      )
    );

  const firstAverage =
    average(firstHalf);

  const secondAverage =
    average(secondHalf);

  const momentumRaw =
    secondAverage -
    firstAverage;

  const momentum =
    clamp(
      50 +
      momentumRaw * 12,
      0,
      100
    );

  const range =
    Math.max(
      ...recent.map(
        t =>
          t.price
      )
    ) -
    Math.min(
      ...recent.map(
        t =>
          t.price
      )
    );

  const volatility =
    normalizeVolatility(
      range,
      recent
    );

  const digitPressureValues = [

    Math.abs(
      evenPct -
      oddPct
    ),

    Math.abs(
      overPct -
      underPct
    ),

    Math.abs(
      hotRate -
      0.10
    ) * 2,

    Math.abs(
      recentEven -
      0.50
    )

  ];

  const pressure =
    average(
      digitPressureValues
    );

  /*
   * Signal candidates.
   */

  const candidates = [

    {
      strategy:
        "OVER",

      strength:
        Math.abs(
          overPct -
          underPct
        ) * 100,

      prediction:
        "OVER"

    },

    {
      strategy:
        "UNDER",

      strength:
        Math.abs(
          overPct -
          underPct
        ) * 100,

      prediction:
        "UNDER"

    },

    {
      strategy:
        "EVEN",

      strength:
        Math.abs(
          evenPct -
          oddPct
        ) * 100,

      prediction:
        "EVEN"

    },

    {
      strategy:
        "ODD",

      strength:
        Math.abs(
          evenPct -
          oddPct
        ) * 100,

      prediction:
        "ODD"

    },

    {
      strategy:
        "MATCHES",

      strength:
        Math.max(
          0,
          (
            hotRate -
            0.10
          ) * 100
        ),

      prediction:
        String(hottest)

    },

    {
      strategy:
        "DIFFERS",

      strength:
        Math.max(
          0,
          (
            0.10 -
            coldRate
          ) * 100
        ),

      prediction:
        String(coldest)

    }

  ];

  candidates.sort(
    (
      a,
      b
    ) =>
      b.strength -
      a.strength
  );

  let best =
    candidates[0];

  /*
   * Prefer agreement between signals.
   */

  const overBias =
    overPct >
    underPct;

  const evenBias =
    evenPct >
    oddPct;

  const digitBias =
    hotRate >
    0.10;

  let agreement = 0;

  if (
    Math.abs(
      overPct -
      underPct
    ) >=
    0.10
  ) {

    agreement += 25;

  }

  if (
    Math.abs(
      evenPct -
      oddPct
    ) >=
    0.10
  ) {

    agreement += 25;

  }

  if (
    hotRate >=
    0.14
  ) {

    agreement += 25;

  }

  if (
    Math.abs(
      momentumRaw
    ) >=
    0.30
  ) {

    agreement += 25;

  }

  const dataQuality =
    clamp(
      (
        total /
        60
      ) * 100,
      0,
      100
    );

  /*
   * Beast score.
   *
   * Multiple independent factors
   * are combined rather than relying
   * on one digit frequency.
   */

  let beastScore =
    40;

  beastScore +=
    Math.min(
      25,
      best.strength *
      0.70
    );

  beastScore +=
    agreement *
    0.22;

  beastScore +=
    Math.abs(
      momentum -
      50
    ) *
    0.12;

  beastScore +=
    volatility *
    0.08;

  beastScore +=
    dataQuality *
    0.05;

  beastScore =
    Math.round(
      clamp(
        beastScore,
        1,
        99
      )
    );

  /*
   * Confidence is deliberately stricter
   * than the raw score.
   */

  let confidence =
    Math.round(
      (
        beastScore * 0.55
      ) +
      (
        agreement * 0.20
      ) +
      (
        dataQuality * 0.15
      ) +
      (
        pressure * 100 * 0.10
      )
    );

  confidence =
    Math.round(
      clamp(
        confidence,
        1,
        99
      )
    );

  let signal =
    "WEAK";

  if (
    beastScore >=
    CONFIG.BEAST_SIGNAL
  ) {

    signal =
      "BEAST";

  } else if (
    beastScore >=
    CONFIG.STRONG_SIGNAL
  ) {

    signal =
      "STRONG";

  } else if (
    beastScore >=
    60
  ) {

    signal =
      "MODERATE";

  }

  /*
   * Require agreement.
   */

  if (
    confidence <
    CONFIG.BOT_MIN_CONFIDENCE
  ) {

    signal =
      "WAIT";

  }

  let reason =
    `Hot ${hottest} ${Math.round(
      hotRate * 100
    )}%, ` +
    `cold ${coldest} ${Math.round(
      coldRate * 100
    )}%. ` +
    `Even ${Math.round(
      evenPct * 100
    )}% / Odd ${Math.round(
      oddPct * 100
    )}%. ` +
    `Over ${Math.round(
      overPct * 100
    )}% / Under ${Math.round(
      underPct * 100
    )}%. ` +
    `Momentum ${Math.round(
      momentum
    )}/100. ` +
    `Agreement ${agreement}%.`;

  if (
    signal ===
    "WAIT"
  ) {

    reason +=
      " WEAK SIGNAL — waiting for stronger agreement.";

  }

  return {

    market,

    total,

    counts,

    hottest,

    coldest,

    hotRate,

    coldRate,

    evenPct,

    oddPct,

    overPct,

    underPct,

    momentum,

    volatility,

    pressure,

    agreement,

    dataQuality,

    beastScore,

    confidence,

    signal,

    strategy:
      best.strategy,

    prediction:
      best.prediction,

    reason

  };

}


/* =========================================================
   MULTI-MARKET BEAST SCANNER
   ========================================================= */

function scanAllMarkets() {

  const results = [];

  CONFIG.MARKETS.forEach(
    market => {

      const list =
        state.ticks[market] ||
        [];

      const analysis =
        analyzeMarket(
          market,
          list
        );

      if (analysis) {

        results.push(
          analysis
        );

      }

    }
  );

  results.sort(
    (
      a,
      b
    ) => {

      const scoreA =
        a.beastScore +
        a.confidence * 0.25;

      const scoreB =
        b.beastScore +
        b.confidence * 0.25;

      return scoreB - scoreA;

    }
  );

  state.marketScanner =
    results;

  state.strongestMarket =
    results[0] ||
    null;

  return results;

}


/* =========================================================
   CIRCULAR AI
   ========================================================= */

function startCircularAI() {

  if (
    state.circularRunning
  ) {

    return;

  }

  state.circularRunning =
    true;

  if (els.startAI) {

    els.startAI.textContent =
      "CIRCULAR AI RUNNING";

  }

  if (els.circularStatusText) {

    els.circularStatusText.textContent =
      "RUNNING";

  }

  if (els.engineStatusText) {

    els.engineStatusText.textContent =
      "CIRCULAR AI ACTIVE";

  }

  updateStatus(
    "Circular AI started: 10s analysis → 5s prediction → 3s trade → 3s cooldown."
  );

  runCircularPhase();

}


function stopCircularAI() {

  state.circularRunning =
    false;

  clearInterval(
    state.circularInterval
  );

  state.circularInterval =
    null;

  state.circularPhase =
    "IDLE";

  state.circularTimer =
    0;

  if (els.aiCircleStatus) {

    els.aiCircleStatus.textContent =
      "IDLE";

  }

  if (els.circularStatusText) {

    els.circularStatusText.textContent =
      "READY";

  }

  if (els.startAI) {

    els.startAI.textContent =
      "START CIRCULAR AI";

  }

  if (els.aiCircleLabel) {

    els.aiCircleLabel.textContent =
      "AI";

  }

  if (els.aiCircleTimer) {

    els.aiCircleTimer.textContent =
      "--";

  }

  if (els.cycleAnalysis) {

    els.cycleAnalysis.textContent =
      "STOPPED";

  }

  if (els.cycleTrade) {

    els.cycleTrade.textContent =
      "WAITING";

  }

  if (els.cycleCooldown) {

    els.cycleCooldown.textContent =
      "0";

  }

}


function runCircularPhase() {

  if (
    !state.circularRunning
  ) {

    return;

  }

  const phases = [

    {
      name:
        "ANALYZING",

      seconds:
        CONFIG.CIRCULAR_ANALYSIS_SECONDS
    },

    {
      name:
        "PREDICTING",

      seconds:
        CONFIG.CIRCULAR_PREDICT_SECONDS
    },

    {
      name:
        "TRADE WINDOW",

      seconds:
        CONFIG.CIRCULAR_TRADE_SECONDS
    },

    {
      name:
        "COOLDOWN",

      seconds:
        CONFIG.CIRCULAR_COOLDOWN_SECONDS
    }

  ];

  let phaseIndex = 0;

  function beginPhase() {

    if (
      !state.circularRunning
    ) {

      return;

    }

    const phase =
      phases[phaseIndex];

    let remaining =
      phase.seconds;

    state.circularPhase =
      phase.name;

    state.circularTimer =
      remaining;

    /*
     * 10-second analysis.
     */

    if (
      phase.name ===
      "ANALYZING"
    ) {

      const scan =
        scanAllMarkets();

      const best =
        scan[0];

      if (best) {

        state.currentMarket =
          best.market;

        subscribeMarket(
          best.market
        );

        state.currentAnalysis =
          best;

        renderAnalysis(
          best
        );

        if (els.aiCircleLabel) {

          els.aiCircleLabel.textContent =
            `BEAST ${best.beastScore}`;

        }

      }

      if (els.cycleAnalysis) {

        els.cycleAnalysis.textContent =
          best
            ? `SCANNING ${best.market}`
            : "COLLECTING DATA";

      }

      updateStatus(
        best
          ? `BEAST selected ${best.market} — ${best.signal} ${best.beastScore}/100`
          : "Circular AI collecting market data..."
      );

    }

    /*
     * 5-second prediction.
     */

    if (
      phase.name ===
      "PREDICTING"
    ) {

      const analysis =
        analyzeCurrent();

      state.currentAnalysis =
        analysis;

      if (analysis) {

        renderAnalysis(
          analysis
        );

        if (els.aiCircleLabel) {

          els.aiCircleLabel.textContent =
            analysis.signal;

        }

        if (els.cycleAnalysis) {

          els.cycleAnalysis.textContent =
            `${analysis.prediction} · ${analysis.confidence}%`;

        }

      }

    }

    /*
     * 3-second trade window.
     */

    if (
      phase.name ===
      "TRADE WINDOW"
    ) {

      executeCircularPaperTrade();

    }

    /*
     * 3-second cooldown.
     */

    if (
      phase.name ===
      "COOLDOWN"
    ) {

      if (els.cycleTrade) {

        els.cycleTrade.textContent =
          "SETTLING";

      }

    }

    updateCircularUI(
      phase,
      remaining
    );

    clearInterval(
      state.circularInterval
    );

    state.circularInterval =
      setInterval(
        () => {

          remaining--;

          state.circularTimer =
            Math.max(
              remaining,
              0
            );

          updateCircularTimer(
            phase,
            remaining
          );

          if (
            remaining <=
            0
          ) {

            clearInterval(
              state.circularInterval
            );

            state.circularInterval =
              null;

            phaseIndex =
              (
                phaseIndex +
                1
              ) %
              phases.length;

            beginPhase();

          }

        },
        1000
      );

  }

  beginPhase();

}


function updateCircularUI(
  phase,
  remaining
) {

  if (els.aiCircleStatus) {

    els.aiCircleStatus.textContent =
      phase.name;

  }

  if (els.aiCircleTimer) {

    els.aiCircleTimer.textContent =
      remaining;

  }

  if (els.cycleTrade) {

    if (
      phase.name ===
      "TRADE WINDOW"
    ) {

      els.cycleTrade.textContent =
        "TRADE NOW";

    } else if (
      phase.name ===
      "COOLDOWN"
    ) {

      els.cycleTrade.textContent =
        "COOLDOWN";

    } else {

      els.cycleTrade.textContent =
        "WAITING";

    }

  }

  if (els.cycleCooldown) {

    els.cycleCooldown.textContent =
      phase.name ===
      "COOLDOWN"
        ? remaining
        : "0";

  }

}


function updateCircularTimer(
  phase,
  remaining
) {

  if (els.aiCircleTimer) {

    els.aiCircleTimer.textContent =
      Math.max(
        remaining,
        0
      );

  }

  if (
    phase.name ===
    "COOLDOWN" &&
    els.cycleCooldown
  ) {

    els.cycleCooldown.textContent =
      Math.max(
        remaining,
        0
      );

  }

}


/* =========================================================
   CIRCULAR PAPER ENTRY
   ========================================================= */

function executeCircularPaperTrade() {

  const analysis =
    state.currentAnalysis ||
    analyzeCurrent();

  if (!analysis) {

    setCircularDecision(
      "WAIT — NOT ENOUGH DATA"
    );

    return;

  }

  /*
   * THIS IS IMPORTANT:
   *
   * Circular AI NEVER forces a trade.
   */

  if (
    analysis.signal ===
      "WAIT" ||
    analysis.confidence <
      CONFIG.BOT_MIN_CONFIDENCE ||
    analysis.beastScore <
      60
  ) {

    setCircularDecision(
      `WAIT — WEAK SIGNAL ${analysis.confidence}%`
    );

    showToast(
      `Circular AI: WAIT — ${analysis.market} signal is weak.`
    );

    return;

  }

  let strategy =
    els.circularStrategyLabel
      ?.textContent ||
    "AUTO";

  if (
    strategy ===
      "AUTO" ||
    !isValidStrategy(strategy)
  ) {

    strategy =
      analysis.strategy;

  }

  /*
   * If the manually selected strategy
   * conflicts strongly with the AI,
   * use AI only when AUTO is selected.
   */

  const target =
    (
      strategy ===
        "MATCHES" ||
      strategy ===
        "DIFFERS"
    )
      ? analysis.hottest
      : null;

  const stake =
    Number(
      els.circularStakeInput?.value
    ) ||
    CONFIG.MIN_STAKE;

  setCircularDecision(
    `TRADE NOW · ${strategy} · ${analysis.confidence}%`
  );

  createPaperTrade({

    engine:
      "CIRCULAR AI",

    market:
      analysis.market,

    strategy,

    target,

    stake,

    confidence:
      analysis.confidence,

    beastScore:
      analysis.beastScore,

    reason:
      analysis.reason

  });

}


function setCircularDecision(
  text
) {

  if (els.cycleTrade) {

    els.cycleTrade.textContent =
      text;

  }

  if (els.circularStatusText) {

    els.circularStatusText.textContent =
      text;

  }

}


/* =========================================================
   AI BOT
   ========================================================= */

function toggleBot() {

  if (
    state.botRunning
  ) {

    stopBot();

  } else {

    startBot();

  }

}


function startBot() {

  if (
    state.botRunning
  ) {

    return;

  }

  state.botRunning =
    true;

  if (els.startBotBtn) {

    els.startBotBtn.textContent =
      "STOP AI BOT";

  }

  if (els.botStatusDash) {

    els.botStatusDash.textContent =
      "SCANNING";

  }

  if (els.engineStatusText) {

    els.engineStatusText.textContent =
      "AI BOT ACTIVE";

  }

  updateStatus(
    "AI BOT: scanning all markets..."
  );

  runBotCycle();

  clearInterval(
    state.botInterval
  );

  state.botInterval =
    setInterval(
      runBotCycle,
      CONFIG.BOT_INTERVAL_MS
    );

}


function stopBot() {

  state.botRunning =
    false;

  clearInterval(
    state.botInterval
  );

  state.botInterval =
    null;

  if (els.startBotBtn) {

    els.startBotBtn.textContent =
      "START AI BOT";

  }

  if (els.botStatusDash) {

    els.botStatusDash.textContent =
      "STOPPED";

  }

  if (els.engineStatusText) {

    els.engineStatusText.textContent =
      "PAPER MODE";

  }

}


function runBotCycle() {

  if (
    !state.botRunning
  ) {

    return;

  }

  const scanner =
    scanAllMarkets();

  if (!scanner.length) {

    if (els.botStatusDash) {

      els.botStatusDash.textContent =
        "COLLECTING DATA";

    }

    return;

  }

  const best =
    scanner[0];

  /*
   * Automatically select the strongest
   * market.
   */

  if (
    best.market !==
    state.currentMarket
  ) {

    subscribeMarket(
      best.market
    );

  }

  state.currentAnalysis =
    best;

  renderAnalysis(
    best
  );

  if (els.botSelectedMarket) {

    els.botSelectedMarket.textContent =
      best.market;

  }

  if (els.botScore) {

    els.botScore.textContent =
      best.beastScore;

  }

  /*
   * Respect selected bot strategies.
   */

  let strategy =
    best.strategy;

  if (
    !state.botStrategies.includes(
      strategy
    )
  ) {

    strategy =
      chooseBestAllowedStrategy(
        best
      );

  }

  const target =
    (
      strategy ===
        "MATCHES" ||
      strategy ===
        "DIFFERS"
    )
      ? best.hottest
      : null;

  if (els.botStrategyLabel) {

    els.botStrategyLabel.textContent =
      strategy;

  }

  if (els.aiPredictionLarge) {

    els.aiPredictionLarge.textContent =
      target !== null
        ? String(target)
        : strategy;

  }

  if (els.predictionConfidence) {

    els.predictionConfidence.textContent =
      `${best.confidence}% confidence`;

  }

  /*
   * Strong signal gate.
   */

  if (
    best.signal ===
      "WAIT" ||
    best.confidence <
      CONFIG.BOT_MIN_CONFIDENCE ||
    best.beastScore <
      60
  ) {

    if (els.botStatusDash) {

      els.botStatusDash.textContent =
        `WAIT · ${best.market} · ${best.confidence}%`;

    }

    updateStatus(
      `AI BOT WAIT — ${best.market}: ${best.reason}`
    );

    return;

  }

  const stake =
    Number(
      els.stakeInput?.value
    ) ||
    CONFIG.MIN_STAKE;

  createPaperTrade({

    engine:
      "AI BOT",

    market:
      best.market,

    strategy,

    target,

    stake,

    confidence:
      best.confidence,

    beastScore:
      best.beastScore,

    reason:
      best.reason

  });

}


function chooseBestAllowedStrategy(
  analysis
) {

  const candidates = [];

  if (
    state.botStrategies.includes(
      "OVER"
    )
  ) {

    candidates.push({

      strategy:
        "OVER",

      score:
        Math.abs(
          analysis.overPct -
          analysis.underPct
        )

    });

  }

  if (
    state.botStrategies.includes(
      "UNDER"
    )
  ) {

    candidates.push({

      strategy:
        "UNDER",

      score:
        Math.abs(
          analysis.overPct -
          analysis.underPct
        )

    });

  }

  if (
    state.botStrategies.includes(
      "EVEN"
    )
  ) {

    candidates.push({

      strategy:
        "EVEN",

      score:
        Math.abs(
          analysis.evenPct -
          analysis.oddPct
        )

    });

  }

  if (
    state.botStrategies.includes(
      "ODD"
    )
  ) {

    candidates.push({

      strategy:
        "ODD",

      score:
        Math.abs(
          analysis.evenPct -
          analysis.oddPct
        )

    });

  }

  if (
    state.botStrategies.includes(
      "MATCHES"
    )
  ) {

    candidates.push({

      strategy:
        "MATCHES",

      score:
        analysis.hotRate

    });

  }

  if (
    state.botStrategies.includes(
      "DIFFERS"
    )
  ) {

    candidates.push({

      strategy:
        "DIFFERS",

      score:
        0.10 -
        analysis.coldRate

    });

  }

  candidates.sort(
    (
      a,
      b
    ) =>
      b.score -
      a.score
  );

  return (
    candidates[0]?.strategy ||
    state.botStrategies[0] ||
    "EVEN"
  );

}


/* =========================================================
   MANUAL PAPER TRADE
   ========================================================= */

function placeManualTrade() {

  const strategy =
    els.manualSelectedStrategyLabel
      ?.textContent ||
    "MATCHES";

  const market =
    els.manualMarketSelect?.value ||
    state.currentMarket;

  const stake =
    Number(
      els.manualStakeInput?.value
    ) ||
    CONFIG.MIN_STAKE;

  let target =
    null;

  if (
    strategy ===
      "MATCHES" ||
    strategy ===
      "DIFFERS"
  ) {

    target =
      Number(
        els.manualTargetDigitInput
          ?.value
      );

    if (
      !Number.isInteger(target) ||
      target < 0 ||
      target > 9
    ) {

      showToast(
        "Choose a target digit from 0 to 9."
      );

      return;

    }

  }

  createPaperTrade({

    engine:
      "MANUAL",

    market,

    strategy,

    target,

    stake,

    confidence:
      null,

    beastScore:
      null,

    reason:
      "Manual paper trade."

  });

}


/* =========================================================
   CREATE PAPER TRADE
   ========================================================= */

function createPaperTrade({
  engine,
  market,
  strategy,
  target,
  stake,
  confidence = null,
  beastScore = null,
  reason = ""
}) {

  stake =
    Number(stake);

  if (
    !Number.isFinite(stake) ||
    stake <
      CONFIG.MIN_STAKE
  ) {

    showToast(
      `Minimum stake is ${CONFIG.MIN_STAKE}.`
    );

    return null;

  }

  if (
    state.activeTrades.length >=
    CONFIG.MAX_ACTIVE_TRADES
  ) {

    showToast(
      "Maximum active paper trades reached."
    );

    return null;

  }

  if (
    state.paperBalance <
    stake
  ) {

    showToast(
      "Insufficient KRISHWAVE paper balance."
    );

    return null;

  }

  if (
    !isValidStrategy(strategy)
  ) {

    showToast(
      "Invalid strategy."
    );

    return null;

  }

  if (
    (
      strategy ===
        "MATCHES" ||
      strategy ===
        "DIFFERS"
    ) &&
    (
      !Number.isInteger(
        Number(target)
      ) ||
      Number(target) < 0 ||
      Number(target) > 9
    )
  ) {

    showToast(
      "Invalid target digit."
    );

    return null;

  }

  const list =
    state.ticks[market] ||
    [];

  const latest =
    list[list.length - 1];

  if (!latest) {

    showToast(
      "Waiting for market tick."
    );

    return null;

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

    entryDigit:
      latest.digit,

    entryPrice:
      latest.price,

    exitDigit:
      null,

    exitPrice:
      null,

    confidence,

    beastScore,

    reason,

    createdAt:
      new Date(),

    status:
      "OPEN"

  };

  /*
   * This is PAPER BALANCE only.
   * It never changes the Deriv
   * account balance.
   */

  state.paperBalance -=
    stake;

  state.activeTrades.push(
    trade
  );

  state.stats.stake +=
    stake;

  savePaperBalance();

  renderActiveTrades();

  updateStatsUI();

  updatePaperBalance();

  showToast(
    `${engine}: ${strategy} PAPER trade opened`
  );

  return trade;

}


/* =========================================================
   PAPER SETTLEMENT
   ========================================================= */

function settlePaperTrades(
  market,
  tick
) {

  const matching =
    state.activeTrades.filter(
      trade =>
        trade.market ===
        market
    );

  if (!matching.length) {

    return;

  }

  matching.forEach(
    trade => {

      /*
       * Give the trade at least
       * one tick after entry.
       */

      if (
        trade.entryPrice ===
        tick.price &&
        trade.entryDigit ===
        tick.digit
      ) {

        return;

      }

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

    }
  );

}


function evaluateStrategy(
  strategy,
  target,
  digit
) {

  switch(strategy) {

    case "MATCHES":

      return (
        digit ===
        Number(target)
      );

    case "DIFFERS":

      return (
        digit !==
        Number(target)
      );

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
    state.activeTrades.indexOf(
      trade
    );

  if (
    index === -1
  ) {

    return;

  }

  state.activeTrades.splice(
    index,
    1
  );

  const payoutMultiplier =
    CONFIG.PAYOUT[
      trade.strategy
    ] ??
    0.95;

  const payout =
    win
      ? trade.stake *
        (
          1 +
          payoutMultiplier
        )
      : 0;

  const profit =
    payout -
    trade.stake;

  if (win) {

    state.paperBalance +=
      payout;

    state.stats.wins++;

    state.stats.won +=
      payout;

  } else {

    state.stats.losses++;

  }

  state.stats.total++;

  state.stats.profit +=
    profit;

  state.sessionProfit +=
    profit;

  trade.exitDigit =
    tick.digit;

  trade.exitPrice =
    tick.price;

  trade.status =
    win
      ? "WIN"
      : "LOSS";

  trade.amountWon =
    payout;

  trade.profit =
    profit;

  trade.closedAt =
    new Date();

  state.paperTrades.unshift(
    trade
  );

  saveHistory();

  savePaperBalance();

  updateStatsUI();

  updateHistoryUI();

  renderActiveTrades();

  updatePaperBalance();

  updateRiskStatus();

  showToast(
    `${trade.engine}: ${win ? "WIN" : "LOSS"} ${money(profit)}`
  );

}


/* =========================================================
   PAPER BALANCE
   ========================================================= */

function savePaperBalance() {

  localStorage.setItem(
    "krishwave_paper_balance",
    String(
      state.paperBalance
    )
  );

}


function updatePaperBalance() {

  /*
   * The existing HTML only has one balance
   * display, so keep it truthful to the
   * connected Deriv account.
   *
   * Paper balance is shown in trade status
   * and used internally for trades.
   */

  if (
    els.tradingStatusLabel
  ) {

    els.tradingStatusLabel.textContent =
      `PAPER $${state.paperBalance.toFixed(2)}`;

  }

}


/* =========================================================
   STATS
   ========================================================= */

function updateStatsUI() {

  if (els.paperTotal) {

    els.paperTotal.textContent =
      state.stats.total;

  }

  if (els.paperWins) {

    els.paperWins.textContent =
      state.stats.wins;

  }

  if (els.paperLosses) {

    els.paperLosses.textContent =
      state.stats.losses;

  }

  const accuracy =
    state.stats.total
      ? Math.round(
          (
            state.stats.wins /
            state.stats.total
          ) *
          100
        )
      : 0;

  if (els.paperAccuracy) {

    els.paperAccuracy.textContent =
      `${accuracy}%`;

  }

}


function renderActiveTrades() {

  if (
    !els.activeTradeCount ||
    !els.activeTradesList
  ) {

    return;

  }

  els.activeTradeCount.textContent =
    state.activeTrades.length;

  if (
    !state.activeTrades.length
  ) {

    els.activeTradesList.innerHTML =
      `
      <div class="empty">
        No active trades.
      </div>
      `;

    return;

  }

  els.activeTradesList.innerHTML =
    state.activeTrades
      .map(
        trade => `

        <div class="active-trade">

          <div>

            <strong>
              ${escapeHtml(
                trade.strategy
              )}
            </strong>

            <small>
              ${escapeHtml(
                trade.engine
              )}
              ·
              ${escapeHtml(
                trade.market
              )}
            </small>

          </div>

          <div>

            <strong>
              ${money(
                trade.stake
              )}
            </strong>

            <small>
              ${
                trade.beastScore
                  ? `BEAST ${trade.beastScore}`
                  : `#${trade.id}`
              }
            </small>

          </div>

        </div>

        `
      )
      .join("");

}


/* =========================================================
   HISTORY
   ========================================================= */

function saveHistory() {

  try {

    localStorage.setItem(
      "krishwave_history",
      JSON.stringify(
        state.paperTrades
      )
    );

  } catch(error) {

    console.error(
      "History save error:",
      error
    );

  }

}


function loadHistory() {

  try {

    const raw =
      localStorage.getItem(
        "krishwave_history"
      );

    if (raw) {

      const parsed =
        JSON.parse(raw);

      if (
        Array.isArray(parsed)
      ) {

        state.paperTrades =
          parsed;

      }

    }

  } catch(error) {

    console.error(
      error
    );

    state.paperTrades =
      [];

  }

  recalculateStats();

  updateHistoryUI();

}


function recalculateStats() {

  state.stats = {

    total:
      state.paperTrades.length,

    wins:
      state.paperTrades.filter(
        trade =>
          trade.status ===
          "WIN"
      ).length,

    losses:
      state.paperTrades.filter(
        trade =>
          trade.status ===
          "LOSS"
      ).length,

    stake:
      state.paperTrades.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          Number(
            trade.stake ||
            0
          ),
        0
      ),

    won:
      state.paperTrades.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          Number(
            trade.amountWon ||
            0
          ),
        0
      ),

    profit:
      state.paperTrades.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          Number(
            trade.profit ||
            0
          ),
        0
      )

  };

  state.sessionProfit =
    state.stats.profit;

}


function updateHistoryUI() {

  if (
    !els.historyCardsList
  ) {

    return;

  }

  const totalStake =
    state.paperTrades.reduce(
      (
        sum,
        trade
      ) =>
        sum +
        Number(
          trade.stake ||
          0
        ),
      0
    );

  const amountWon =
    state.paperTrades.reduce(
      (
        sum,
        trade
      ) =>
        sum +
        Number(
          trade.amountWon ||
          0
        ),
      0
    );

  const netProfit =
    state.paperTrades.reduce(
      (
        sum,
        trade
      ) =>
        sum +
        Number(
          trade.profit ||
          0
        ),
      0
    );

  if (els.historyTotalStake) {

    els.historyTotalStake.textContent =
      money(totalStake);

  }

  if (els.historyAmountWon) {

    els.historyAmountWon.textContent =
      money(amountWon);

  }

  if (els.historyNetProfit) {

    els.historyNetProfit.textContent =
      money(netProfit);

  }

  if (els.totalProfitDisplay) {

    els.totalProfitDisplay.textContent =
      money(netProfit);

  }

  if (els.sessionProfitDisplay) {

    els.sessionProfitDisplay.textContent =
      money(
        state.sessionProfit
      );

    els.sessionProfitDisplay.className =
      state.sessionProfit >= 0
        ? "positive"
        : "negative";

  }

  if (
    !state.paperTrades.length
  ) {

    els.historyCardsList.innerHTML =
      `
      <div class="empty">
        No completed trades yet.
      </div>
      `;

    return;

  }

  els.historyCardsList.innerHTML =
    state.paperTrades
      .slice(
        0,
        100
      )
      .map(
        trade => {

          const win =
            trade.status ===
            "WIN";

          return `

          <div class="history-card ${
            win
              ? "history-win"
              : "history-loss"
          }">

            <div class="history-top">

              <strong>
                ${escapeHtml(
                  trade.engine
                )}
              </strong>

              <strong class="result">

                ${
                  win
                    ? "WIN"
                    : "LOSS"
                }

                ${
                  win
                    ? ` +${money(
                        trade.profit
                      )}`
                    : ` ${money(
                        trade.profit
                      )}`
                }

              </strong>

            </div>

            <div class="history-details">

              <div>
                <span>MARKET</span>
                <strong>
                  ${escapeHtml(
                    trade.market
                  )}
                </strong>
              </div>

              <div>
                <span>STRATEGY</span>
                <strong>
                  ${escapeHtml(
                    trade.strategy
                  )}
                </strong>
              </div>

              <div>
                <span>STAKE</span>
                <strong>
                  ${money(
                    trade.stake
                  )}
                </strong>
              </div>

              <div>
                <span>AMOUNT WON</span>
                <strong>
                  ${money(
                    trade.amountWon
                  )}
                </strong>
              </div>

              <div>
                <span>ENTRY</span>
                <strong>
                  ${
                    trade.entryDigit ??
                    "-"
                  }
                </strong>
              </div>

              <div>
                <span>EXIT</span>
                <strong>
                  ${
                    trade.exitDigit ??
                    "-"
                  }
                </strong>
              </div>

              <div>
                <span>TARGET</span>
                <strong>
                  ${
                    trade.target ??
                    "-"
                  }
                </strong>
              </div>

              <div>
                <span>BEAST</span>
                <strong>
                  ${
                    trade.beastScore ??
                    "-"
                  }
                </strong>
              </div>

              <div>
                <span>CONFIDENCE</span>
                <strong>
                  ${
                    trade.confidence != null
                      ? `${trade.confidence}%`
                      : "-"
                  }
                </strong>
              </div>

              <div>
                <span>TIME</span>
                <strong>
                  ${formatTime(
                    trade.closedAt
                  )}
                </strong>
              </div>

            </div>

            ${
              trade.reason
                ? `
                <div class="history-reason">
                  ${escapeHtml(
                    trade.reason
                  )}
                </div>
                `
                : ""
            }

          </div>

          `;

        }
      )
      .join("");

}


/* =========================================================
   RISK STATUS
   ========================================================= */

function updateRiskStatus() {

  if (
    state.sessionProfit >=
    state.takeProfit
  ) {

    stopBot();

    stopCircularAI();

    showToast(
      "Take profit reached. AI engines stopped."
    );

  }

  if (
    state.sessionProfit <=
    -Math.abs(
      state.stopLoss
    )
  ) {

    stopBot();

    stopCircularAI();

    showToast(
      "Stop loss reached. AI engines stopped."
    );

  }

}


/* =========================================================
   DERIV OAUTH
   ========================================================= */

async function startDerivOAuth() {

  try {

    const verifier =
      randomString(64);

    const stateValue =
      randomString(32);

    const challenge =
      await sha256Base64Url(
        verifier
      );

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

    updateStatus(
      "Opening secure Deriv login..."
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
      params.get(
        "error_description"
      ) ||
      error
    );

    cleanUrl();

    return;

  }

  if (!code) {

    return;

  }

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
    savedState !==
      returnedState
  ) {

    showToast(
      "OAuth security check failed."
    );

    cleanOAuthStorage();

    cleanUrl();

    return;

  }

  if (!verifier) {

    showToast(
      "PKCE verifier missing."
    );

    cleanOAuthStorage();

    cleanUrl();

    return;

  }

  try {

    updateStatus(
      "Completing secure Deriv login..."
    );

    const response =
      await fetch(
        `${CONFIG.CLOUD_API}/api/oauth/exchange`,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              code,

              code_verifier:
                verifier

            })

        }
      );

    const result =
      await response.json();

    if (
      !response.ok
    ) {

      throw new Error(
        result.error ||
        result.message ||
        "OAuth exchange failed."
      );

    }

    if (
      !result.session
    ) {

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

    cleanOAuthStorage();

    cleanUrl();

    await restoreCloudSession();

    showToast(
      "Deriv DEMO account connected."
    );

  } catch(error) {

    console.error(
      error
    );

    showToast(
      error.message ||
      "Deriv connection failed."
    );

    cleanOAuthStorage();

    cleanUrl();

  }

}


/* =========================================================
   CLOUD SESSION
   ========================================================= */

async function restoreCloudSession() {

  if (
    !state.sessionToken
  ) {

    return;

  }

  try {

    updateStatus(
      "Loading Deriv demo account..."
    );

    const response =
      await cloudFetch(
        "/api/session"
      );

    const data =
      await safeJson(
        response
      );

    if (
      !response.ok
    ) {

      throw new Error(
        data.error ||
        data.message ||
        "Session expired."
      );

    }

    const account =
      selectDemoAccount(data);

    if (!account) {

      throw new Error(
        "No demo account returned."
      );

    }

    state.accountId =
      account.account_id ||
      account.id ||
      null;

    state.currency =
      account.currency ||
      "USD";

    state.balance =
      Number(
        account.balance ||
        0
      );

    state.connectedToDeriv =
      true;

    updateAccountUI();

    updateStatus(
      "Deriv DEMO account connected."
    );

    if (
      state.accountId
    ) {

      await requestAuthenticatedWs();

    }

  } catch(error) {

    console.error(
      error
    );

    state.connectedToDeriv =
      false;

    updateConnectionUI();

    if (
      /401|unauthorized|expired|invalid/i
        .test(
          error.message || ""
        )
    ) {

      clearCloudSession();

    }

    showToast(
      error.message ||
      "Unable to restore Deriv session."
    );

  }

}


function selectDemoAccount(data) {

  const accounts =
    Array.isArray(
      data.accounts
    )
      ? data.accounts
      : [];

  if (
    data.account &&
    isDemoAccount(
      data.account
    )
  ) {

    return data.account;

  }

  const demo =
    accounts.find(
      account =>
        isDemoAccount(
          account
        )
    );

  return (
    demo ||
    data.account ||
    accounts[0] ||
    null
  );

}


function isDemoAccount(account) {

  if (!account) {

    return false;

  }

  const type =
    String(
      account.account_type ||
      account.type ||
      ""
    ).toLowerCase();

  const id =
    String(
      account.account_id ||
      account.id ||
      ""
    ).toUpperCase();

  return (
    type === "demo" ||
    id.startsWith("DOT")
  );

}


/* =========================================================
   AUTHENTICATED WS
   ========================================================= */

async function requestAuthenticatedWs() {

  if (!state.accountId) {

    return;

  }

  try {

    const response =
      await cloudFetch(
        `/api/otp?accountId=${encodeURIComponent(
          state.accountId
        )}`
      );

    const data =
      await safeJson(response);

    if (
      !response.ok
    ) {

      throw new Error(
        data.error ||
        data.message ||
        "Could not get WebSocket."
      );

    }

    if (!data.wsUrl) {

      throw new Error(
        "No authenticated WebSocket URL returned."
      );

    }

    connectAuthenticatedWs(
      data.wsUrl
    );

  } catch(error) {

    console.error(
      error
    );

    showToast(
      error.message ||
      "Could not connect to demo account."
    );

  }

}


function connectAuthenticatedWs(wsUrl) {

  if (!wsUrl) return;

  if (state.authWs) {

    try {

      state.authWs.close();

    } catch {}

  }

  try {

    state.authWs =
      new WebSocket(
        wsUrl
      );

    state.authWs.onopen =
      () => {

        state.connectedToDeriv =
          true;

        updateConnectionUI();

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

          data =
            JSON.parse(
              event.data
            );

        } catch {

          return;

        }

        processAuthenticatedMessage(
          data
        );

      };

    state.authWs.onerror =
      error => {

        console.error(
          error
        );

      };

    state.authWs.onclose =
      () => {

        state.authWs =
          null;

        state.connectedToDeriv =
          false;

        updateConnectionUI();

      };

  } catch(error) {

    console.error(error);

  }

}


function processAuthenticatedMessage(data) {

  if (
    data.msg_type ===
    "balance"
  ) {

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

      updateAccountUI();

    }

  }

  if (
    data.msg_type ===
    "tick"
  ) {

    const tick =
      data.tick;

    if (!tick) return;

    addTick(

      tick.symbol ||
      state.currentMarket,

      Number(
        tick.quote
      ),

      Number(
        tick.epoch ||
        Date.now() / 1000
      )

    );

  }

  if (data.error) {

    updateStatus(
      data.error.message ||
      "Authenticated Deriv error."
    );

  }

}


function sendAuthenticated(payload) {

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

    balance:
      1,

    subscribe:
      1,

    req_id:
      501

  });

}


function requestAuthenticatedTicks(symbol) {

  sendAuthenticated({

    ticks:
      symbol,

    subscribe:
      1,

    req_id:
      502

  });

}


/* =========================================================
   CLOUD FETCH
   ========================================================= */

async function cloudFetch(
  path,
  options = {}
) {

  const headers =
    new Headers(
      options.headers ||
      {}
    );

  headers.set(
    "X-KRISHWAVE-SESSION",
    state.sessionToken ||
    ""
  );

  return fetch(
    `${CONFIG.CLOUD_API}${path}`,
    {
      ...options,
      headers
    }
  );

}


async function safeJson(response) {

  try {

    return await response.json();

  } catch {

    return {};

  }

}


function clearCloudSession() {

  state.sessionToken =
    null;

  state.accountId =
    null;

  state.connectedToDeriv =
    false;

  sessionStorage.removeItem(
    "krishwave_cloud_session"
  );

  if (state.authWs) {

    try {

      state.authWs.close();

    } catch {}

    state.authWs =
      null;

  }

  updateConnectionUI();

}


function cleanOAuthStorage() {

  sessionStorage.removeItem(
    "krishwave_pkce_verifier"
  );

  sessionStorage.removeItem(
    "krishwave_oauth_state"
  );

}


/* =========================================================
   PKCE
   ========================================================= */

function randomString(length) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const values =
    new Uint8Array(length);

  crypto.getRandomValues(
    values
  );

  return Array.from(
    values,
    value =>
      chars[
        value %
        chars.length
      ]
  ).join("");

}


async function sha256Base64Url(value) {

  const data =
    new TextEncoder()
      .encode(value);

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

  let binary =
    "";

  bytes.forEach(
    byte => {

      binary +=
        String.fromCharCode(
          byte
        );

    }
  );

  return btoa(binary)
    .replace(
      /\+/g,
      "-"
    )
    .replace(
      /\//g,
      "_"
    )
    .replace(
      /=+$/,
      ""
    );

}


/* =========================================================
   ACCOUNT UI
   ========================================================= */

function updateAccountUI() {

  if (els.accountId) {

    els.accountId.textContent =
      state.accountId ||
      "NOT CONNECTED";

  }

  if (els.currency) {

    els.currency.textContent =
      state.currency ||
      "USD";

  }

  updateBalance();

  updateModeUI();

  updateConnectionUI();

}


function updateBalance() {

  if (!els.balanceDisplay) return;

  els.balanceDisplay.textContent =
    `${state.currency} ${Number(
      state.balance
    ).toFixed(2)}`;

}


function updateModeUI() {

  state.realMode =
    false;

  if (!els.modeBadge) return;

  els.modeBadge.textContent =
    "DEMO";

  els.modeBadge.classList.remove(
    "real-mode"
  );

  els.modeBadge.classList.add(
    "demo-mode"
  );

}


function updateConnectionUI() {

  if (els.connectionDot) {

    els.connectionDot.className =
      `dot ${
        state.connectedToDeriv
          ? "online"
          : "offline"
      }`;

  }

  if (els.connectionText) {

    els.connectionText.textContent =
      state.connectedToDeriv
        ? "DEMO LIVE"
        : "OFFLINE";

  }

}


/* =========================================================
   GENERAL UI
   ========================================================= */

function setConnection(
  online,
  text
) {

  if (els.connectionDot) {

    els.connectionDot.className =
      `dot ${
        online
          ? "online"
          : "offline"
      }`;

  }

  if (els.connectionText) {

    els.connectionText.textContent =
      text;

  }

}


function updateStatus(message) {

  if (els.dataStatus) {

    els.dataStatus.textContent =
      message;

  }

}


function money(value) {

  return `$${Number(
    value || 0
  ).toFixed(2)}`;

}


function showToast(message) {

  if (
    !els.toast ||
    !els.toastMessage
  ) {

    return;

  }

  els.toastMessage.textContent =
    message;

  els.toast.classList.add(
    "show"
  );

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


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  const navItems =
    document.querySelectorAll(
      ".nav-item"
    );

  navItems.forEach(
    button => {

      button.addEventListener(
        "click",
        event => {

          event.preventDefault();

          const page =
            button.dataset.page;

          showPage(page);

        }
      );

    }
  );

  /*
   * Force Analysis as initial page.
   */

  showPage("analysis");

}


function showPage(page) {

  const pages =
    document.querySelectorAll(
      ".page"
    );

  pages.forEach(
    item => {

      item.classList.remove(
        "active"
      );

    }
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
      item => {

        item.classList.toggle(
          "active",
          item.dataset.page ===
            page
        );

      }
    );

  /*
   * Redraw chart when returning
   * to analysis page.
   */

  if (
    page ===
    "analysis"
  ) {

    setTimeout(
      drawChart,
      50
    );

  }

}


/* =========================================================
   TRADE TABS
   ========================================================= */

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
    (
      [button, panel]
    ) => {

      if (
        !button ||
        !panel
      ) {

        return;

      }

      button.addEventListener(
        "click",
        () => {

          tabs.forEach(
            (
              [b, p]
            ) => {

              b?.classList.remove(
                "active"
              );

              p?.classList.remove(
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


/* =========================================================
   STRATEGY
   ========================================================= */

function setupStrategyControls() {

  els.botStrategyTrigger?.addEventListener(
    "click",
    () =>
      els.botStrategyModal
        ?.classList.add(
          "show"
        )
  );

  els.circularStrategyTrigger?.addEventListener(
    "click",
    openStrategyModal
  );

  els.manualStrategyTrigger?.addEventListener(
    "click",
    openStrategyModal
  );

  els.strategyOptions
    ?.querySelectorAll(
      "[data-strategy]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            applySelectedStrategy(
              button.dataset.strategy
            );

            els.strategyModal
              ?.classList.remove(
                "show"
              );

          }
        );

      }
    );

}


function openStrategyModal() {

  els.strategyModal
    ?.classList.add(
      "show"
    );

}


function applySelectedStrategy(
  strategy
) {

  if (
    !isValidStrategy(strategy)
  ) {

    return;

  }

  if (
    els.circularStrategyLabel
  ) {

    els.circularStrategyLabel.textContent =
      strategy;

  }

  if (
    els.manualSelectedStrategyLabel
  ) {

    els.manualSelectedStrategyLabel.textContent =
      strategy;

  }

  state.strategy =
    strategy;

  updateStrategyUI();

}


function updateStrategyUI() {

  const strategy =
    els.manualSelectedStrategyLabel
      ?.textContent ||
    state.strategy ||
    "MATCHES";

  const requiresDigit =
    strategy ===
      "MATCHES" ||
    strategy ===
      "DIFFERS";

  if (
    els.targetDigitContainer
  ) {

    els.targetDigitContainer.style.display =
      requiresDigit
        ? "block"
        : "none";

  }

}


function isValidStrategy(strategy) {

  return [

    "MATCHES",
    "DIFFERS",
    "OVER",
    "UNDER",
    "EVEN",
    "ODD"

  ].includes(strategy);

}


/* =========================================================
   BUTTONS
   ========================================================= */

function setupButtons() {

  els.connectDerivBtn?.addEventListener(
    "click",
    startDerivOAuth
  );

  els.startAI?.addEventListener(
    "click",
    () => {

      state.circularRunning
        ? stopCircularAI()
        : startCircularAI();

    }
  );

  els.stopAI?.addEventListener(
    "click",
    stopCircularAI
  );

  els.startBotBtn?.addEventListener(
    "click",
    toggleBot
  );

  els.startCircularTradeBtn?.addEventListener(
    "click",
    () => {

      if (
        state.circularRunning
      ) {

        stopCircularAI();

      } else {

        startCircularAI();

      }

    }
  );

  els.placeTradeBtn?.addEventListener(
    "click",
    placeManualTrade
  );

  els.closeStrategyModal?.addEventListener(
    "click",
    () =>
      els.strategyModal
        ?.classList.remove(
          "show"
        )
  );

  els.closeBotStrategyModal?.addEventListener(
    "click",
    () =>
      els.botStrategyModal
        ?.classList.remove(
          "show"
        )
  );

  els.applyBotStrategies?.addEventListener(
    "click",
    applyBotStrategies
  );

  els.clearLogsBtn?.addEventListener(
    "click",
    clearHistory
  );

  els.stopTradingBtn?.addEventListener(
    "click",
    () => {

      stopBot();

      stopCircularAI();

      showToast(
        "All AI trading engines stopped."
      );

    }
  );

  setupMarketSelectors();

  els.confirmRealBtn?.addEventListener(
    "click",
    () => {

      state.realMode =
        false;

      els.realConfirmModal
        ?.classList.remove(
          "show"
        );

      showToast(
        "Real trading is disabled in this build."
      );

    }
  );

  els.cancelRealBtn?.addEventListener(
    "click",
    () =>
      els.realConfirmModal
        ?.classList.remove(
          "show"
        )
  );

}


function setupMarketSelectors() {

  els.analysisMarketSelect?.addEventListener(
    "change",
    event =>
      subscribeMarket(
        event.target.value
      )
  );

  /*
   * AI Bot is allowed to manually choose
   * a starting market, but the Beast scanner
   * can automatically move to a stronger one.
   */

  els.botMarketSelect?.addEventListener(
    "change",
    event =>
      subscribeMarket(
        event.target.value
      )
  );

  els.circularMarketSelect?.addEventListener(
    "change",
    event =>
      subscribeMarket(
        event.target.value
      )
  );

  els.manualMarketSelect?.addEventListener(
    "change",
    event => {

      if (
        CONFIG.MARKETS.includes(
          event.target.value
        )
      ) {

        state.currentMarket =
          event.target.value;

        if (
          els.manualStatusText
        ) {

          els.manualStatusText.textContent =
            event.target.value;

        }

      }

    }
  );

}


/* =========================================================
   BOT STRATEGIES
   ========================================================= */

function applyBotStrategies() {

  const checked =
    Array.from(
      document.querySelectorAll(
        ".bot-strategy-check:checked"
      )
    ).map(
      input =>
        input.value
    );

  if (
    !checked.length
  ) {

    showToast(
      "Select at least one strategy."
    );

    return;

  }

  state.botStrategies =
    checked;

  if (els.botStrategyLabel) {

    els.botStrategyLabel.textContent =
      checked.length === 6
        ? "AUTO"
        : checked.join(
            " / "
          );

  }

  els.botStrategyModal
    ?.classList.remove(
      "show"
    );

}


/* =========================================================
   THEME
   ========================================================= */

function setupTheme() {

  const saved =
    localStorage.getItem(
      "krishwave_theme"
    );

  if (
    saved ===
    "light"
  ) {

    document.body.classList.add(
      "light"
    );

  } else {

    document.body.classList.remove(
      "light"
    );

  }

  updateThemeButton();

  els.themeToggle?.addEventListener(
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

      updateThemeButton();

      drawChart();

    }
  );

}


function updateThemeButton() {

  if (!els.themeToggle) return;

  els.themeToggle.textContent =
    document.body.classList.contains(
      "light"
    )
      ? "☀️"
      : "🌙";

}


/* =========================================================
   CHART
   ========================================================= */

function drawChart() {

  const canvas =
    els.priceChartCanvas;

  if (!canvas) return;

  const rect =
    canvas.getBoundingClientRect();

  if (
    !rect.width ||
    !rect.height
  ) {

    return;

  }

  const dpr =
    window.devicePixelRatio ||
    1;

  canvas.width =
    rect.width *
    dpr;

  canvas.height =
    rect.height *
    dpr;

  const ctx =
    canvas.getContext(
      "2d"
    );

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

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

  if (
    prices.length <
    2
  ) {

    return;

  }

  const min =
    Math.min(
      ...prices
    );

  const max =
    Math.max(
      ...prices
    );

  const range =
    max -
    min ||
    1;

  ctx.beginPath();

  prices.forEach(
    (
      price,
      index
    ) => {

      const x =
        (
          index /
          (
            prices.length -
            1
          )
        ) *
        width;

      const y =
        height -
        (
          (
            price -
            min
          ) /
          range
        ) *
        (
          height -
          20
        ) -
        10;

      if (
        index ===
        0
      ) {

        ctx.moveTo(
          x,
          y
        );

      } else {

        ctx.lineTo(
          x,
          y
        );

      }

    }
  );

  /*
   * Use a color that remains visible
   * in both themes.
   */

  ctx.strokeStyle =
    document.body.classList.contains(
      "light"
    )
      ? "#0066ff"
      : "#00e5ff";

  ctx.lineWidth =
    2;

  ctx.stroke();

}


window.addEventListener(
  "resize",
  drawChart
);


/* =========================================================
   CLEAR HISTORY
   ========================================================= */

function clearHistory() {

  if (
    !confirm(
      "Clear KRISHWAVE trading history?"
    )
  ) {

    return;

  }

  state.paperTrades =
    [];

  state.activeTrades =
    [];

  state.tradeCounter =
    0;

  state.paperBalance =
    CONFIG.START_PAPER_BALANCE;

  recalculateStats();

  localStorage.removeItem(
    "krishwave_history"
  );

  savePaperBalance();

  updateStatsUI();

  updateHistoryUI();

  renderActiveTrades();

  updatePaperBalance();

  showToast(
    "History cleared. Paper balance reset to $1000."
  );

}


/* =========================================================
   HELPERS
   ========================================================= */

function average(values) {

  if (
    !values ||
    !values.length
  ) {

    return 0;

  }

  return (
    values.reduce(
      (
        sum,
        value
      ) =>
        sum +
        Number(value),
      0
    ) /
    values.length
  );

}


function clamp(
  value,
  min,
  max
) {

  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );

}


function normalizeVolatility(
  range,
  ticks
) {

  if (
    !ticks ||
    ticks.length <
      2
  ) {

    return 0;

  }

  const prices =
    ticks.map(
      tick =>
        tick.price
    );

  const averagePrice =
    average(prices);

  if (
    !averagePrice
  ) {

    return 0;

  }

  const percentage =
    (
      range /
      averagePrice
    ) *
    100;

  return clamp(
    percentage *
      500,
    0,
    100
  );

}


function escapeHtml(value) {

  return String(
    value ??
    ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


function formatTime(value) {

  if (!value) {

    return "-";

  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "-";

  }

  return date.toLocaleTimeString(
    [],
    {

      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit"

    }
  );

}


/* =========================================================
   GLOBAL DEBUG / APP INFO
   ========================================================= */

if (
  typeof window !==
  "undefined"
) {

  window.KRISHWAVE = {

    version:
      CONFIG.VERSION,

    mode:
      "DEMO / PAPER",

    cloud:
      CONFIG.CLOUD_API,

    getState:
      () => state,

    scanMarkets:
      () =>
        scanAllMarkets(),

    stopAll:
      () => {

        stopBot();

        stopCircularAI();

      }

  };

}