/* =========================================================
   KRISHWAVE AI BEAST V9.2
   PREMIUM MOBILE TRADING INTELLIGENCE ENGINE

   DEMO / PAPER ONLY
   ---------------------------------------------------------
   NO REAL TRADES ARE EXECUTED.

   SYSTEMS
   ---------------------------------------------------------
   1. AI BOT
      - 3 second analysis
      - independent multi-strategy selection
      - paper trade
      - settlement
      - repeat

   2. CIRCULAR AI
      - 10 sec analysis
      - 5 sec prediction
      - 3 sec trade window
      - 3 sec cooldown
      - repeat

   3. MANUAL
      - independent strategy
      - independent market
      - paper trade only

   STRATEGIES
   ---------------------------------------------------------
   MATCHES
   DIFFERS
   OVER
   UNDER
   EVEN
   ODD
   ========================================================= */


/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {
  VERSION: "9.2",

  CLIENT_ID: "34khasPjsT0PCRR8X3Z70",

  REDIRECT_URI:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/",

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

  CIRCULAR_ANALYSIS: 10,
  CIRCULAR_PREDICTION: 5,
  CIRCULAR_TRADE: 3,
  CIRCULAR_COOLDOWN: 3,

  BOT_INTERVAL_MS: 3000,

  START_PAPER_BALANCE: 1000,
  MIN_STAKE: 0.25,
  MAX_ACTIVE_TRADES: 10,

  BOT_MIN_CONFIDENCE: 60,
  STRONG_SIGNAL: 75,
  BEAST_SIGNAL: 85,

  PAYOUTS: {
    MATCHES: 8.5,
    DIFFERS: 0.09,
    OVER: 0.95,
    UNDER: 0.95,
    EVEN: 0.95,
    ODD: 0.95
  }
};


/* =========================================================
   STRATEGIES
========================================================= */

const STRATEGIES = [
  "MATCHES",
  "DIFFERS",
  "OVER",
  "UNDER",
  "EVEN",
  "ODD"
];


function isValidStrategy(strategy) {
  return STRATEGIES.includes(strategy);
}


function strategyNeedsDigit(strategy) {
  return (
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
  );
}


/* =========================================================
   STATE
========================================================= */

const state = {

  socket: null,
  socketConnected: false,
  reconnectTimer: null,

  selectedMarket: "R_10",
  activeMarket: "R_10",

  marketData: {},

  /* Independent strategy systems */
  manualStrategy: "MATCHES",
  circularStrategy: "AUTO",

  /* AI Bot */
  botStrategies: [
    "MATCHES",
    "DIFFERS"
  ],

  botRunning: false,
  botTimer: null,
  botMarket: "R_10",

  /* Circular */
  circularRunning: false,
  circularPhase: "IDLE",
  circularTimer: 0,
  circularTimerHandle: null,
  circularMarket: "R_10",
  circularAnalysis: null,

  /* Paper account */
  paperBalance: 1000,
  startingBalance: 1000,

  totalTrades: 0,
  wins: 0,
  losses: 0,
  profit: 0,

  activeTrades: [],
  history: [],

  lastAnalysis: null,
  lastDigit: null,

  activeStrategySelector: null,

  currentPage: "analysis",
  currentTradeTab: "bot",

  accountId: "DEMO",
  currency: "USD",

  demoConnected: true
};


/* =========================================================
   DOM CACHE
========================================================= */

const DOM = {};


function $(id) {
  return document.getElementById(id);
}


function cacheDOM() {

  const ids = [

    /* Top */
    "connectionDot",
    "connectionText",
    "modeBadge",
    "themeToggle",

    /* Account */
    "accountId",
    "balanceDisplay",
    "currency",
    "connectDerivBtn",
    "dataStatus",

    /* Pages */
    "analysisPage",
    "tradePage",
    "historyPage",

    /* Analysis */
    "analysisMarketSelect",
    "currentChartMarket",
    "currentLivePrice",
    "priceChartCanvas",
    "digitSampleCount",
    "lastDigit",
    "analysisConfidence",
    "aiStatus",
    "aiCircle",
    "aiCircleLabel",
    "aiCirclePrediction",
    "aiPrediction",
    "aiType",
    "analysisMsg",
    "aiMarket",
    "digitStatsGrid",
    "aiCircleStatus",
    "cycleAnalysis",
    "cycleTrade",
    "aiCircleTimer",
    "cycleCooldown",
    "startAI",
    "stopAI",

    /* Trade tabs */
    "tabAiBot",
    "tabCircularAI",
    "tabManual",

    /* AI Bot */
    "aiBotPanel",
    "botStatusDash",
    "botSelectedMarket",
    "botScore",
    "aiPredictionLarge",
    "predictionConfidence",
    "botMarketSelect",
    "botStrategyTrigger",
    "botStrategyLabel",
    "stakeInput",
    "takeProfitInput",
    "stopLossInput",
    "martingaleInput",
    "startBotBtn",

    /* Circular */
    "circularPanel",
    "circularMarketSelect",
    "circularStrategyTrigger",
    "circularStrategyLabel",
    "circularStakeInput",
    "circularTakeProfitInput",
    "circularStopLossInput",
    "startCircularTradeBtn",
    "circularStatusText",

    /* Manual */
    "manualPanel",
    "manualMarketSelect",
    "manualStrategyTrigger",
    "manualSelectedStrategyLabel",
    "targetDigitContainer",
    "manualTargetDigitInput",
    "manualStakeInput",
    "manualTakeProfitInput",
    "manualStopLossInput",
    "placeTradeBtn",
    "manualStatusText",

    /* Stats */
    "paperTotal",
    "paperWins",
    "paperLosses",
    "paperAccuracy",
    "activeTradeCount",
    "activeTradesList",

    /* History */
    "clearLogsBtn",
    "historyTotalStake",
    "historyAmountWon",
    "historyNetProfit",
    "tradingStatusLabel",
    "sessionProfitDisplay",
    "totalProfitDisplay",
    "stopTradingBtn",
    "historyCardsList",

    /* Strategy modal */
    "strategyModal",
    "closeStrategyModal",
    "strategyOptions",

    /* Bot strategy modal */
    "botStrategyModal",
    "closeBotStrategyModal",
    "applyBotStrategies",

    /* Real modal */
    "realConfirmModal",
    "cancelRealBtn",
    "confirmRealBtn",

    /* Toast */
    "toast",
    "toastMessage",

    /* Navigation */
    "toast"
  ];

  ids.forEach(id => {
    DOM[id] = $(id);
  });
}


/* =========================================================
   TOAST
========================================================= */

function showToast(message) {

  if (DOM.toast && DOM.toastMessage) {

    DOM.toastMessage.textContent =
      message;

    DOM.toast.classList.add("active");

    clearTimeout(
      showToast.timer
    );

    showToast.timer =
      setTimeout(() => {

        DOM.toast.classList.remove(
          "active"
        );

      }, 2500);

    return;
  }

  console.log("KRISHWAVE:", message);
}


/* =========================================================
   STORAGE
========================================================= */

function saveState() {

  try {

    localStorage.setItem(
      "KRISHWAVE_PAPER_STATE",
      JSON.stringify({

        paperBalance:
          state.paperBalance,

        startingBalance:
          state.startingBalance,

        totalTrades:
          state.totalTrades,

        wins:
          state.wins,

        losses:
          state.losses,

        profit:
          state.profit,

        history:
          state.history,

        manualStrategy:
          state.manualStrategy,

        circularStrategy:
          state.circularStrategy,

        botStrategies:
          state.botStrategies

      })
    );

  } catch (error) {

    console.warn(
      "Storage save failed:",
      error
    );

  }
}


function loadState() {

  try {

    const raw =
      localStorage.getItem(
        "KRISHWAVE_PAPER_STATE"
      );

    if (!raw) return;

    const saved =
      JSON.parse(raw);

    if (
      typeof saved.paperBalance ===
      "number"
    ) {
      state.paperBalance =
        saved.paperBalance;
    }

    if (
      typeof saved.startingBalance ===
      "number"
    ) {
      state.startingBalance =
        saved.startingBalance;
    }

    if (
      typeof saved.totalTrades ===
      "number"
    ) {
      state.totalTrades =
        saved.totalTrades;
    }

    if (
      typeof saved.wins ===
      "number"
    ) {
      state.wins =
        saved.wins;
    }

    if (
      typeof saved.losses ===
      "number"
    ) {
      state.losses =
        saved.losses;
    }

    if (
      typeof saved.profit ===
      "number"
    ) {
      state.profit =
        saved.profit;
    }

    if (
      Array.isArray(
        saved.history
      )
    ) {
      state.history =
        saved.history;
    }

    if (
      isValidStrategy(
        saved.manualStrategy
      )
    ) {
      state.manualStrategy =
        saved.manualStrategy;
    }

    if (
      saved.circularStrategy ===
      "AUTO" ||
      isValidStrategy(
        saved.circularStrategy
      )
    ) {
      state.circularStrategy =
        saved.circularStrategy;
    }

    if (
      Array.isArray(
        saved.botStrategies
      )
    ) {

      const valid =
        saved.botStrategies.filter(
          strategy =>
            isValidStrategy(strategy)
        );

      if (valid.length) {
        state.botStrategies =
          valid;
      }

    }

  } catch (error) {

    console.warn(
      "Storage load failed:",
      error
    );

  }
}


/* =========================================================
   MARKET DATA
========================================================= */

function ensureMarket(market) {

  if (!state.marketData[market]) {

    state.marketData[market] = {

      ticks: [],
      prices: [],
      digits: [],

      lastPrice: null,
      lastDigit: null,
      lastUpdate: null

    };

  }

  return state.marketData[market];
}


function extractLastDigit(price) {

  if (
    price === null ||
    price === undefined
  ) {
    return null;
  }

  const text =
    String(price);

  const cleaned =
    text.replace(/\D/g, "");

  if (!cleaned) {
    return null;
  }

  return Number(
    cleaned.charAt(
      cleaned.length - 1
    )
  );
}


function addTick(
  market,
  price
) {

  const data =
    ensureMarket(market);

  const numericPrice =
    Number(price);

  if (
    !Number.isFinite(
      numericPrice
    )
  ) {
    return;
  }

  const digit =
    extractLastDigit(
      numericPrice
    );

  data.ticks.push({
    price: numericPrice,
    digit,
    time: Date.now()
  });

  data.prices.push(
    numericPrice
  );

  data.digits.push(
    digit
  );

  if (
    data.ticks.length >
    CONFIG.MAX_TICKS
  ) {
    data.ticks.shift();
  }

  if (
    data.prices.length >
    CONFIG.MAX_TICKS
  ) {
    data.prices.shift();
  }

  if (
    data.digits.length >
    CONFIG.MAX_TICKS
  ) {
    data.digits.shift();
  }

  data.lastPrice =
    numericPrice;

  data.lastDigit =
    digit;

  data.lastUpdate =
    Date.now();

  state.lastDigit =
    digit;

  updateAnalysisUI(
    state.selectedMarket
  );

  if (
    market ===
    state.selectedMarket
  ) {
    drawChart(market);
  }
}


/* =========================================================
   DERIV PUBLIC MARKET CONNECTION
========================================================= */

function connectPublicMarket() {

  if (
    state.socket &&
    (
      state.socket.readyState ===
      WebSocket.OPEN ||

      state.socket.readyState ===
      WebSocket.CONNECTING
    )
  ) {
    return;
  }

  updateConnectionUI(
    false,
    "CONNECTING..."
  );

  try {

    const socket =
      new WebSocket(
        CONFIG.PUBLIC_WS
      );

    state.socket =
      socket;


    socket.addEventListener(
      "open",
      () => {

        state.socketConnected =
          true;

        updateConnectionUI(
          true,
          "MARKET LIVE"
        );

        subscribeToMarkets();

        showToast(
          "LIVE MARKET CONNECTED"
        );

      }
    );


    socket.addEventListener(
      "message",
      event => {

        handleSocketMessage(
          event.data
        );

      }
    );


    socket.addEventListener(
      "error",
      error => {

        console.warn(
          "WebSocket error:",
          error
        );

        state.socketConnected =
          false;

        updateConnectionUI(
          false,
          "CONNECTION ERROR"
        );

      }
    );


    socket.addEventListener(
      "close",
      () => {

        state.socketConnected =
          false;

        updateConnectionUI(
          false,
          "RECONNECTING..."
        );

        scheduleReconnect();

      }
    );

  } catch (error) {

    console.error(
      "WebSocket failed:",
      error
    );

    updateConnectionUI(
      false,
      "OFFLINE"
    );

    scheduleReconnect();
  }
}


function scheduleReconnect() {

  if (
    state.reconnectTimer
  ) {
    return;
  }

  state.reconnectTimer =
    setTimeout(() => {

      state.reconnectTimer =
        null;

      connectPublicMarket();

    }, 5000);
}


function subscribeToMarkets() {

  if (
    !state.socket ||
    state.socket.readyState !==
    WebSocket.OPEN
  ) {
    return;
  }

  CONFIG.MARKETS.forEach(
    market => {

      try {

        state.socket.send(
          JSON.stringify({
            ticks: market,
            subscribe: 1
          })
        );

      } catch (error) {

        console.warn(
          "Subscription failed:",
          market,
          error
        );

      }

    }
  );
}


function handleSocketMessage(raw) {

  let message;

  try {

    message =
      typeof raw === "string"
        ? JSON.parse(raw)
        : raw;

  } catch {

    return;
  }

  if (!message) return;


  if (message.tick) {

    const tick =
      message.tick;

    const market =
      tick.symbol ||
      tick.underlying_symbol;

    const price =
      tick.quote;

    if (
      market &&
      price !== undefined
    ) {

      addTick(
        market,
        price
      );

    }

    return;
  }


  if (message.ohlc) {

    const candle =
      message.ohlc;

    const market =
      candle.symbol ||
      candle.underlying_symbol;

    const price =
      candle.close;

    if (
      market &&
      price !== undefined
    ) {

      addTick(
        market,
        price
      );

    }

  }
}


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(
  connected,
  text
) {

  if (DOM.connectionText) {

    DOM.connectionText.textContent =
      text ||
      (
        connected
          ? "MARKET LIVE"
          : "OFFLINE"
      );

  }


  if (DOM.connectionDot) {

    DOM.connectionDot.classList.toggle(
      "connected",
      connected
    );

    DOM.connectionDot.classList.toggle(
      "offline",
      !connected
    );

  }


  if (DOM.modeBadge) {

    DOM.modeBadge.textContent =
      "DEMO";

  }


  if (DOM.dataStatus) {

    DOM.dataStatus.textContent =
      connected
        ? "Deriv public market data LIVE • PAPER MODE"
        : "Waiting for Deriv market connection...";

  }
}


/* =========================================================
   MARKET SELECTORS
========================================================= */

function populateMarketSelectors() {

  const selectors = [

    DOM.analysisMarketSelect,
    DOM.botMarketSelect,
    DOM.circularMarketSelect,
    DOM.manualMarketSelect

  ];


  selectors.forEach(select => {

    if (!select) return;

    select.innerHTML = "";

    CONFIG.MARKETS.forEach(
      market => {

        const option =
          document.createElement(
            "option"
          );

        option.value =
          market;

        option.textContent =
          market;

        select.appendChild(
          option
        );

      }
    );

  });


  if (DOM.analysisMarketSelect) {

    DOM.analysisMarketSelect.value =
      state.selectedMarket;

  }


  if (DOM.botMarketSelect) {

    DOM.botMarketSelect.value =
      state.botMarket;

  }


  if (DOM.circularMarketSelect) {

    DOM.circularMarketSelect.value =
      state.circularMarket;

  }


  if (DOM.manualMarketSelect) {

    DOM.manualMarketSelect.value =
      state.selectedMarket;

  }
}


function setupMarketSelectors() {

  DOM.analysisMarketSelect
    ?.addEventListener(
      "change",
      event => {

        state.selectedMarket =
          event.target.value;

        state.activeMarket =
          state.selectedMarket;

        if (
          DOM.manualMarketSelect
        ) {
          DOM.manualMarketSelect.value =
            state.selectedMarket;
        }

        updateAnalysisUI(
          state.selectedMarket
        );

        drawChart(
          state.selectedMarket
        );

      }
    );


  DOM.botMarketSelect
    ?.addEventListener(
      "change",
      event => {

        state.botMarket =
          event.target.value;

        if (
          DOM.botSelectedMarket
        ) {
          DOM.botSelectedMarket.textContent =
            state.botMarket;
        }

      }
    );


  DOM.circularMarketSelect
    ?.addEventListener(
      "change",
      event => {

        state.circularMarket =
          event.target.value;

      }
    );


  DOM.manualMarketSelect
    ?.addEventListener(
      "change",
      event => {

        state.selectedMarket =
          event.target.value;

        state.activeMarket =
          state.selectedMarket;

        if (
          DOM.analysisMarketSelect
        ) {
          DOM.analysisMarketSelect.value =
            state.selectedMarket;
        }

        updateAnalysisUI(
          state.selectedMarket
        );

        drawChart(
          state.selectedMarket
        );

      }
    );
}


/* =========================================================
   DIGIT ANALYSIS
========================================================= */

function getDigitCounts(
  market
) {

  const data =
    ensureMarket(market);

  const counts =
    Array(10).fill(0);

  data.digits.forEach(
    digit => {

      if (
        Number.isInteger(digit) &&
        digit >= 0 &&
        digit <= 9
      ) {

        counts[digit]++;

      }

    }
  );

  return counts;
}


function getDigitPercentages(
  market
) {

  const counts =
    getDigitCounts(
      market
    );

  const total =
    counts.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  if (!total) {
    return counts.map(
      () => 0
    );
  }

  return counts.map(
    value =>
      (
        value /
        total
      ) * 100
  );
}


function getMostFrequentDigit(
  market
) {

  const counts =
    getDigitCounts(
      market
    );

  let best =
    0;

  for (
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      counts[i] >
      counts[best]
    ) {

      best = i;

    }

  }

  return best;
}


function getLeastFrequentDigit(
  market
) {

  const counts =
    getDigitCounts(
      market
    );

  let best =
    0;

  for (
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      counts[i] <
      counts[best]
    ) {

      best = i;

    }

  }

  return best;
}


/* =========================================================
   STRATEGY ANALYSIS
========================================================= */

function analyzeStrategy(
  market,
  strategy
) {

  const data =
    ensureMarket(
      market
    );

  if (
    data.digits.length <
    CONFIG.MIN_ANALYSIS_TICKS
  ) {

    return {

      market,
      strategy,

      signal: "WAIT",
      confidence: 0,
      prediction: null,

      reason:
        "Waiting for enough market data"

    };

  }


  const recent =
    data.digits.slice(
      -CONFIG.SCAN_TICKS
    );


  const total =
    recent.length;


  const counts =
    Array(10).fill(0);


  recent.forEach(
    digit => {

      if (
        Number.isInteger(digit)
      ) {

        counts[digit]++;

      }

    }
  );


  const percentages =
    counts.map(
      count =>
        total
          ? (
              count /
              total
            ) * 100
          : 0
    );


  const hottestDigit =
    percentages.indexOf(
      Math.max(
        ...percentages
      )
    );


  const coldestDigit =
    percentages.indexOf(
      Math.min(
        ...percentages
      )
    );


  const lastDigit =
    recent[
      recent.length - 1
    ];


  let signal =
    "WAIT";

  let confidence =
    50;

  let prediction =
    hottestDigit;

  let reason =
    "";


  /* MATCHES */

  if (
    strategy === "MATCHES"
  ) {

    prediction =
      hottestDigit;

    const strength =
      percentages[
        hottestDigit
      ];

    confidence =
      Math.min(
        96,
        55 +
        strength * 2.5
      );

    signal =
      confidence >=
      CONFIG.BOT_MIN_CONFIDENCE
        ? "MATCH"
        : "WAIT";

    reason =
      `Digit ${prediction} frequency ${strength.toFixed(1)}%`;

  }


  /* DIFFERS */

  else if (
    strategy === "DIFFERS"
  ) {

    prediction =
      lastDigit;

    const frequency =
      percentages[
        lastDigit
      ] || 0;

    confidence =
      Math.min(
        96,
        70 +
        (
          10 -
          frequency
        ) * 2
      );

    signal =
      confidence >=
      CONFIG.BOT_MIN_CONFIDENCE
        ? "DIFFER"
        : "WAIT";

    reason =
      `Current digit ${prediction} frequency ${frequency.toFixed(1)}%`;

  }


  /* OVER */

  else if (
    strategy === "OVER"
  ) {

    const over =
      recent.filter(
        digit =>
          digit > 4
      ).length;

    const probability =
      (
        over /
        total
      ) * 100;

    confidence =
      Math.min(
        96,
        Math.max(
          50,
          probability >= 50
            ? probability
            : 100 - probability
        )
      );

    signal =
      confidence >=
      CONFIG.BOT_MIN_CONFIDENCE
        ? "OVER"
        : "WAIT";

    prediction =
      hottestDigit;

    reason =
      `High digits probability ${probability.toFixed(1)}%`;

  }


  /* UNDER */

  else if (
    strategy === "UNDER"
  ) {

    const under =
      recent.filter(
        digit =>
          digit < 5
      ).length;

    const probability =
      (
        under /
        total
      ) * 100;

    confidence =
      Math.min(
        96,
        Math.max(
          50,
          probability >= 50
            ? probability
            : 100 - probability
        )
      );

    signal =
      confidence >=
      CONFIG.BOT_MIN_CONFIDENCE
        ? "UNDER"
        : "WAIT";

    prediction =
      coldestDigit;

    reason =
      `Low digits probability ${probability.toFixed(1)}%`;

  }


  /* EVEN */

  else if (
    strategy === "EVEN"
  ) {

    const even =
      recent.filter(
        digit =>
          digit % 2 === 0
      ).length;

    const probability =
      (
        even /
        total
      ) * 100;

    confidence =
      Math.min(
        96,
        Math.max(
          50,
          probability >= 50
            ? probability
            : 100 - probability
        )
      );

    signal =
      confidence >=
      CONFIG.BOT_MIN_CONFIDENCE
        ? "EVEN"
        : "WAIT";

    prediction =
      hottestDigit;

    reason =
      `Even probability ${probability.toFixed(1)}%`;

  }


  /* ODD */

  else if (
    strategy === "ODD"
  ) {

    const odd =
      recent.filter(
        digit =>
          digit % 2 !== 0
      ).length;

    const probability =
      (
        odd /
        total
      ) * 100;

    confidence =
      Math.min(
        96,
        Math.max(
          50,
          probability >= 50
            ? probability
            : 100 - probability
        )
      );

    signal =
      confidence >=
      CONFIG.BOT_MIN_CONFIDENCE
        ? "ODD"
        : "WAIT";

    prediction =
      hottestDigit;

    reason =
      `Odd probability ${probability.toFixed(1)}%`;

  }


  return {

    market,
    strategy,
    signal,

    confidence:
      Math.round(
        confidence
      ),

    prediction,

    reason,

    lastDigit,
    hottestDigit,
    coldestDigit

  };
}


/* =========================================================
   FULL MARKET ANALYSIS
========================================================= */

function analyzeMarket(
  market
) {

  const strategies =
    STRATEGIES.map(
      strategy =>
        analyzeStrategy(
          market,
          strategy
        )
    );


  const valid =
    strategies
      .filter(
        result =>
          result.signal !==
          "WAIT"
      )
      .sort(
        (a, b) =>
          b.confidence -
          a.confidence
      );


  return {

    market,

    strategies,

    best:
      valid.length
        ? valid[0]
        : null

  };
}


/* =========================================================
   AI BOT ANALYSIS
========================================================= */

function analyzeBot(
  market
) {

  const results =
    state.botStrategies
      .map(
        strategy =>
          analyzeStrategy(
            market,
            strategy
          )
      )
      .filter(
        result =>
          result.signal !==
            "WAIT" &&

          result.confidence >=
            CONFIG.BOT_MIN_CONFIDENCE
      )
      .sort(
        (a, b) =>
          b.confidence -
          a.confidence
      );


  return results.length
    ? results[0]
    : null;
}


/* =========================================================
   ANALYSIS UI
========================================================= */

function updateAnalysisUI(
  market
) {

  if (!market) {
    return;
  }


  const data =
    ensureMarket(
      market
    );


  const analysis =
    analyzeMarket(
      market
    );


  state.lastAnalysis =
    analysis;


  if (
    DOM.currentChartMarket
  ) {

    DOM.currentChartMarket.textContent =
      market;

  }


  if (
    DOM.aiMarket
  ) {

    DOM.aiMarket.textContent =
      market;

  }


  if (
    DOM.currentLivePrice
  ) {

    DOM.currentLivePrice.textContent =
      data.lastPrice !== null
        ? Number(
            data.lastPrice
          ).toFixed(5)
        : "0.00000";

  }


  if (
    DOM.digitSampleCount
  ) {

    DOM.digitSampleCount.textContent =
      data.digits.length;

  }


  if (
    DOM.lastDigit
  ) {

    DOM.lastDigit.textContent =
      data.lastDigit ??
      "-";

  }


  if (
    DOM.analysisConfidence
  ) {

    DOM.analysisConfidence.textContent =
      analysis.best
        ? `${analysis.best.confidence}%`
        : "0%";

  }


  if (
    DOM.aiStatus
  ) {

    DOM.aiStatus.textContent =
      analysis.best
        ? "AI SIGNAL READY"
        : "AI WAITING";

  }


  if (
    DOM.aiPrediction
  ) {

    DOM.aiPrediction.textContent =
      analysis.best &&
      analysis.best.prediction !== null
        ? analysis.best.prediction
        : "WAITING";

  }


  if (
    DOM.aiType
  ) {

    DOM.aiType.textContent =
      analysis.best
        ? analysis.best.strategy
        : "DIGIT";

  }


  if (
    DOM.analysisMsg
  ) {

    DOM.analysisMsg.textContent =
      analysis.best
        ? analysis.best.reason
        : "Waiting for enough market data.";

  }


  if (
    DOM.aiCirclePrediction
  ) {

    DOM.aiCirclePrediction.textContent =
      analysis.best?.prediction ??
      "--";

  }


  updateDigitDistribution(
    market
  );

  updateDigitStats(
    market
  );

  updateMarketScanner();
}


/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function updateDigitDistribution(
  market
) {

  if (
    !DOM.digitStatsGrid
  ) {
    return;
  }


  const percentages =
    getDigitPercentages(
      market
    );


  DOM.digitStatsGrid.innerHTML =
    "";


  percentages.forEach(
    (
      percentage,
      digit
    ) => {

      const item =
        document.createElement(
          "div"
        );

      item.className =
        "digit-item";


      item.innerHTML = `
        <span class="digit-number">
          ${digit}
        </span>

        <div class="digit-bar">
          <div
            class="digit-fill"
            style="width:${Math.min(
              100,
              percentage
            )}%">
          </div>
        </div>

        <span class="digit-percent">
          ${percentage.toFixed(1)}%
        </span>
      `;


      DOM.digitStatsGrid.appendChild(
        item
      );

    }
  );
}


/* =========================================================
   DIGIT STATS
========================================================= */

function updateDigitStats(
  market
) {

  const data =
    ensureMarket(
      market
    );

  const percentages =
    getDigitPercentages(
      market
    );


  const hot =
    percentages.indexOf(
      Math.max(
        ...percentages
      )
    );


  const cold =
    percentages.indexOf(
      Math.min(
        ...percentages
      )
    );


  if (
    DOM.digitSampleCount
  ) {
    DOM.digitSampleCount.textContent =
      data.digits.length;
  }


  if (
    DOM.lastDigit
  ) {
    DOM.lastDigit.textContent =
      data.lastDigit ??
      "-";
  }


  if (
    DOM.analysisConfidence
  ) {

    const analysis =
      analyzeMarket(
        market
      );

    DOM.analysisConfidence.textContent =
      analysis.best
        ? `${analysis.best.confidence}%`
        : "0%";

  }


  /* Keep hot/cold available for future UI */
  return {
    hot,
    cold
  };
}


/* =========================================================
   MARKET SCANNER
========================================================= */

function updateMarketScanner() {

  /*
    The current index.html does not contain
    a scanner container, so this function safely
    does nothing until one is added.
  */

  return;
}


/* =========================================================
   CHART
========================================================= */

function drawChart(
  market
) {

  if (
    !DOM.priceChartCanvas
  ) {
    return;
  }


  const canvas =
    DOM.priceChartCanvas;

  const ctx =
    canvas.getContext(
      "2d"
    );


  if (!ctx) {
    return;
  }


  const rect =
    canvas.getBoundingClientRect();


  const width =
    Math.max(
      300,
      Math.floor(
        rect.width ||
        canvas.parentElement?.clientWidth ||
        320
      )
    );


  const height =
    Math.max(
      180,
      Math.floor(
        rect.height ||
        220
      )
    );


  const dpr =
    window.devicePixelRatio ||
    1;


  canvas.width =
    width * dpr;

  canvas.height =
    height * dpr;


  canvas.style.height =
    `${height}px`;


  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );


  ctx.clearRect(
    0,
    0,
    width,
    height
  );


  const data =
    ensureMarket(
      market
    );


  const prices =
    data.prices.slice(
      -80
    );


  if (
    prices.length < 2
  ) {

    ctx.font =
      "14px Arial";

    ctx.fillText(
      "Waiting for live market data...",
      20,
      height / 2
    );

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
    max - min ||
    1;


  const padding =
    20;


  const chartWidth =
    width -
    padding * 2;


  const chartHeight =
    height -
    padding * 2;


  ctx.beginPath();


  prices.forEach(
    (
      price,
      index
    ) => {

      const x =
        padding +
        (
          index /
          (
            prices.length - 1
          )
        ) *
        chartWidth;


      const y =
        padding +
        (
          1 -
          (
            (
              price -
              min
            ) /
            range
          )
        ) *
        chartHeight;


      if (
        index === 0
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


  ctx.strokeStyle =
    "rgba(0,255,180,.9)";

  ctx.lineWidth =
    2;

  ctx.stroke();


  if (
    DOM.currentLivePrice
  ) {

    DOM.currentLivePrice.textContent =
      Number(
        data.lastPrice
      ).toFixed(5);

  }
}


/* =========================================================
   STRATEGY CONTROLS
========================================================= */

function setupStrategyControls() {

  DOM.strategyOptions
    ?.querySelectorAll(
      "[data-strategy]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const strategy =
              button.dataset.strategy;


            if (
              !isValidStrategy(
                strategy
              )
            ) {
              return;
            }


            /* MANUAL */

            if (
              state.activeStrategySelector ===
              "manual"
            ) {

              state.manualStrategy =
                strategy;


              if (
                DOM.manualSelectedStrategyLabel
              ) {

                DOM.manualSelectedStrategyLabel
                  .textContent =
                  strategy;

                DOM.manualSelectedStrategyLabel
                  .dataset.strategy =
                  strategy;

              }


              updateManualTargetVisibility();

              saveState();

              showToast(
                `Manual strategy: ${strategy}`
              );

            }


            /* CIRCULAR */

            else if (
              state.activeStrategySelector ===
              "circular"
            ) {

              state.circularStrategy =
                strategy;


              if (
                DOM.circularStrategyLabel
              ) {

                DOM.circularStrategyLabel
                  .textContent =
                  strategy;

                DOM.circularStrategyLabel
                  .dataset.strategy =
                  strategy;

              }


              saveState();

              showToast(
                `Circular AI strategy: ${strategy}`
              );

            }


            DOM.strategyModal
              ?.classList.remove(
                "active"
              );


            state.activeStrategySelector =
              null;

          }
        );

      }
    );


  DOM.manualStrategyTrigger
    ?.addEventListener(
      "click",
      () => {

        state.activeStrategySelector =
          "manual";

        openStrategyModal();

      }
    );


  DOM.circularStrategyTrigger
    ?.addEventListener(
      "click",
      () => {

        state.activeStrategySelector =
          "circular";

        openStrategyModal();

      }
    );


  DOM.closeStrategyModal
    ?.addEventListener(
      "click",
      closeStrategyModal
    );


  if (
    DOM.manualSelectedStrategyLabel
  ) {

    DOM.manualSelectedStrategyLabel
      .textContent =
      state.manualStrategy;

    DOM.manualSelectedStrategyLabel
      .dataset.strategy =
      state.manualStrategy;

  }


  if (
    DOM.circularStrategyLabel
  ) {

    DOM.circularStrategyLabel
      .textContent =
      state.circularStrategy;

    DOM.circularStrategyLabel
      .dataset.strategy =
      state.circularStrategy;

  }


  updateManualTargetVisibility();
}


function openStrategyModal() {

  DOM.strategyModal
    ?.classList.add(
      "active"
    );
}


function closeStrategyModal() {

  DOM.strategyModal
    ?.classList.remove(
      "active"
    );

  state.activeStrategySelector =
    null;
}


function updateManualTargetVisibility() {

  if (
    !DOM.targetDigitContainer
  ) {
    return;
  }


  DOM.targetDigitContainer.style.display =
    strategyNeedsDigit(
      state.manualStrategy
    )
      ? ""
      : "none";
}


/* =========================================================
   AI BOT STRATEGY CONTROLS
========================================================= */

function syncBotStrategyChecks() {

  const selected =
    new Set(
      state.botStrategies
    );


  document
    .querySelectorAll(
      ".bot-strategy-check"
    )
    .forEach(
      checkbox => {

        checkbox.checked =
          selected.has(
            checkbox.value
          );

      }
    );
}


function updateBotStrategyPreview() {

  if (
    !DOM.botStrategyLabel
  ) {
    return;
  }


  DOM.botStrategyLabel.textContent =
    state.botStrategies.length
      ? state.botStrategies.join(
          " + "
        )
      : "SELECT STRATEGIES";
}


function setupBotStrategyControls() {

  DOM.botStrategyTrigger
    ?.addEventListener(
      "click",
      () => {

        syncBotStrategyChecks();

        DOM.botStrategyModal
          ?.classList.add(
            "active"
          );

      }
    );


  DOM.closeBotStrategyModal
    ?.addEventListener(
      "click",
      () => {

        DOM.botStrategyModal
          ?.classList.remove(
            "active"
          );

        syncBotStrategyChecks();

      }
    );


  DOM.applyBotStrategies
    ?.addEventListener(
      "click",
      applyBotStrategies
    );


  syncBotStrategyChecks();

  updateBotStrategyPreview();
}


function applyBotStrategies() {

  const selected =
    Array.from(
      document.querySelectorAll(
        ".bot-strategy-check:checked"
      )
    )
    .map(
      checkbox =>
        checkbox.value
    )
    .filter(
      isValidStrategy
    );


  if (
    !selected.length
  ) {

    showToast(
      "Choose at least one strategy"
    );

    syncBotStrategyChecks();

    return;
  }


  state.botStrategies =
    selected;


  updateBotStrategyPreview();

  saveState();


  DOM.botStrategyModal
    ?.classList.remove(
      "active"
    );


  showToast(
    `AI Bot strategies: ${selected.join(
      " + "
    )}`
  );
}


/* =========================================================
   PAPER SETTINGS
========================================================= */

function readNumber(
  element,
  fallback
) {

  if (!element) {
    return fallback;
  }


  const value =
    Number(
      element.value
    );


  return Number.isFinite(
    value
  )
    ? value
    : fallback;
}


function getStakeFromInput(
  element
) {

  return Math.max(
    CONFIG.MIN_STAKE,
    readNumber(
      element,
      CONFIG.MIN_STAKE
    )
  );
}


function getTakeProfit(
  element
) {

  return Math.max(
    0,
    readNumber(
      element,
      0
    )
  );
}


function getStopLoss(
  element
) {

  return Math.max(
    0,
    readNumber(
      element,
      0
    )
  );
}


function getMartingale(
  element
) {

  return Math.max(
    1,
    readNumber(
      element,
      1
    )
  );
}


/* =========================================================
   PAPER TRADE ENGINE
========================================================= */

function canPlaceTrade(
  stake
) {

  if (
    state.activeTrades.length >=
    CONFIG.MAX_ACTIVE_TRADES
  ) {

    showToast(
      "Maximum active paper trades reached"
    );

    return false;
  }


  if (
    state.paperBalance <
    stake
  ) {

    showToast(
      "Insufficient paper balance"
    );

    return false;
  }


  return true;
}


function createPaperTrade({
  market,
  strategy,
  stake,
  prediction = null,
  source = "MANUAL",
  takeProfit = 0,
  stopLoss = 0
}) {

  if (
    !isValidStrategy(
      strategy
    )
  ) {

    showToast(
      "Invalid strategy"
    );

    return null;
  }


  if (
    !canPlaceTrade(
      stake
    )
  ) {

    return null;
  }


  const data =
    ensureMarket(
      market
    );


  const trade = {

    id:
      `KW-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    market,

    strategy,

    stake,

    prediction,

    entryDigit:
      data.lastDigit,

    source,

    status:
      "OPEN",

    createdAt:
      Date.now(),

    takeProfit,

    stopLoss

  };


  state.paperBalance -=
    stake;


  state.activeTrades.push(
    trade
  );


  state.totalTrades++;


  updateAccountUI();

  updateStatsUI();

  renderActiveTrades();

  saveState();


  return trade;
}


/* =========================================================
   PAPER SETTLEMENT
========================================================= */

function settlePaperTrade(
  trade
) {

  if (
    !trade ||
    trade.status !== "OPEN"
  ) {
    return;
  }


  const data =
    ensureMarket(
      trade.market
    );


  const finalDigit =
    data.lastDigit;


  if (
    finalDigit === null ||
    finalDigit === undefined
  ) {

    return;
  }


  let won =
    false;


  switch (
    trade.strategy
  ) {

    case "MATCHES":

      won =
        finalDigit ===
        Number(
          trade.prediction
        );

      break;


    case "DIFFERS":

      won =
        finalDigit !==
        Number(
          trade.prediction
        );

      break;


    case "OVER":

      won =
        finalDigit > 4;

      break;


    case "UNDER":

      won =
        finalDigit < 5;

      break;


    case "EVEN":

      won =
        finalDigit % 2 === 0;

      break;


    case "ODD":

      won =
        finalDigit % 2 !== 0;

      break;

  }


  const payout =
    CONFIG.PAYOUTS[
      trade.strategy
    ] || 0;


  let resultAmount;


  if (won) {

    resultAmount =
      trade.stake *
      payout;


    state.paperBalance +=
      trade.stake +
      resultAmount;


    state.profit +=
      resultAmount;


    state.wins++;

  } else {

    resultAmount =
      -trade.stake;


    state.profit +=
      resultAmount;


    state.losses++;

  }


  trade.status =
    won
      ? "WIN"
      : "LOSS";


  trade.finalDigit =
    finalDigit;


  trade.result =
    resultAmount;


  trade.settledAt =
    Date.now();


  state.activeTrades =
    state.activeTrades.filter(
      item =>
        item.id !==
        trade.id
    );


  state.history.unshift(
    trade
  );


  if (
    state.history.length >
    100
  ) {

    state.history =
      state.history.slice(
        0,
        100
      );

  }


  updateAccountUI();

  updateStatsUI();

  renderActiveTrades();

  renderHistory();

  saveState();

  checkTradingLimits();

  return trade;
}


function scheduleTradeSettlement(
  trade,
  delay = 3000
) {

  setTimeout(
    () => {

      settlePaperTrade(
        trade
      );

    },
    delay
  );
}


/* =========================================================
   TRADING LIMITS
========================================================= */

function checkTradingLimits() {

  const takeProfit =
    Math.max(
      0,
      readNumber(
        DOM.takeProfitInput,
        0
      )
    );


  const stopLoss =
    Math.max(
      0,
      readNumber(
        DOM.stopLossInput,
        0
      )
    );


  if (
    takeProfit > 0 &&
    state.profit >=
    takeProfit
  ) {

    if (
      state.botRunning
    ) {
      stopBot();
    }

    showToast(
      "TAKE PROFIT REACHED"
    );

    return true;
  }


  if (
    stopLoss > 0 &&
    state.profit <=
    -stopLoss
  ) {

    if (
      state.botRunning
    ) {
      stopBot();
    }

    showToast(
      "STOP LOSS REACHED"
    );

    return true;
  }


  return false;
}


/* =========================================================
   AI BOT
========================================================= */

function setBotStatus(
  message
) {

  if (
    DOM.botStatusDash
  ) {

    DOM.botStatusDash.textContent =
      message;

  }
}


function updateBotButton() {

  if (
    !DOM.startBotBtn
  ) {
    return;
  }


  DOM.startBotBtn.textContent =
    state.botRunning
      ? "STOP AI BOT"
      : "START AI BOT";
}


function updateBotDisplay(
  analysis
) {

  if (
    DOM.botSelectedMarket
  ) {

    DOM.botSelectedMarket.textContent =
      state.botMarket;

  }


  if (
    DOM.botScore
  ) {

    DOM.botScore.textContent =
      analysis
        ? analysis.confidence
        : "0";

  }


  if (
    DOM.aiPredictionLarge
  ) {

    DOM.aiPredictionLarge.textContent =
      analysis
        ? analysis.prediction
        : "WAITING";

  }


  if (
    DOM.predictionConfidence
  ) {

    DOM.predictionConfidence.textContent =
      analysis
        ? `${analysis.confidence}% confidence`
        : "0% confidence";

  }
}


function startBot() {

  if (
    state.botRunning
  ) {

    stopBot();

    return;
  }


  if (
    !state.botStrategies.length
  ) {

    showToast(
      "Select at least one AI Bot strategy"
    );

    return;
  }


  state.botRunning =
    true;


  updateBotButton();


  setBotStatus(
    "AI BOT STARTING..."
  );


  runBotCycle();
}


function stopBot() {

  state.botRunning =
    false;


  if (
    state.botTimer
  ) {

    clearTimeout(
      state.botTimer
    );

    state.botTimer =
      null;

  }


  updateBotButton();


  setBotStatus(
    "STOPPED"
  );
}


function runBotCycle() {

  if (
    !state.botRunning
  ) {
    return;
  }


  const market =
    state.botMarket ||
    DOM.botMarketSelect?.value ||
    "R_10";


  const analysis =
    analyzeBot(
      market
    );


  updateBotDisplay(
    analysis
  );


  if (!analysis) {

    setBotStatus(
      "ANALYZING MARKET..."
    );


    state.botTimer =
      setTimeout(
        runBotCycle,
        CONFIG.BOT_INTERVAL_MS
      );

    return;
  }


  const stake =
    getStakeFromInput(
      DOM.stakeInput
    );


  const takeProfit =
    getTakeProfit(
      DOM.takeProfitInput
    );


  const stopLoss =
    getStopLoss(
      DOM.stopLossInput
    );


  if (
    takeProfit > 0 &&
    state.profit >=
    takeProfit
  ) {

    setBotStatus(
      "TAKE PROFIT REACHED"
    );

    stopBot();

    return;
  }


  if (
    stopLoss > 0 &&
    state.profit <=
    -stopLoss
  ) {

    setBotStatus(
      "STOP LOSS REACHED"
    );

    stopBot();

    return;
  }


  const trade =
    createPaperTrade({

      market,

      strategy:
        analysis.strategy,

      stake,

      prediction:
        analysis.prediction,

      source:
        "AI BOT",

      takeProfit,

      stopLoss

    });


  if (trade) {

    setBotStatus(
      `PAPER TRADE • ${analysis.strategy}`
    );


    /*
      IMPORTANT:
      The strategy card continues showing
      the complete selected AI Bot set.
    */

    updateBotStrategyPreview();


    scheduleTradeSettlement(
      trade,
      3000
    );

  } else {

    setBotStatus(
      "WAITING FOR BALANCE / DATA"
    );

  }


  state.botTimer =
    setTimeout(
      runBotCycle,
      CONFIG.BOT_INTERVAL_MS
    );
}


/* =========================================================
   CIRCULAR AI
========================================================= */

function setCircularStatus(
  message
) {

  if (
    DOM.circularStatusText
  ) {

    DOM.circularStatusText.textContent =
      message;

  }
}


function updateCircularUI() {

  if (
    DOM.aiCircleStatus
  ) {

    DOM.aiCircleStatus.textContent =
      state.circularPhase;

  }


  if (
    DOM.cycleAnalysis
  ) {

    DOM.cycleAnalysis.textContent =
      state.circularPhase ===
      "ANALYSIS"
        ? "ANALYZING"
        : state.circularPhase;

  }


  if (
    DOM.cycleTrade
  ) {

    DOM.cycleTrade.textContent =
      state.circularPhase ===
      "TRADE NOW"
        ? "OPEN"
        : state.circularPhase ===
          "IDLE"
            ? "WAITING"
            : "READY";

  }


  if (
    DOM.aiCircleTimer
  ) {

    DOM.aiCircleTimer.textContent =
      state.circularTimer > 0
        ? state.circularTimer
        : "--";

  }


  if (
    DOM.cycleCooldown
  ) {

    DOM.cycleCooldown.textContent =
      state.circularPhase ===
      "COOLDOWN"
        ? state.circularTimer
        : "0";

  }


  if (
    DOM.circularStatusText &&
    !state.circularRunning
  ) {

    DOM.circularStatusText.textContent =
      "READY";

  }
}


function updateCircularButton() {

  if (
    !DOM.startCircularTradeBtn
  ) {
    return;
  }


  DOM.startCircularTradeBtn.textContent =
    state.circularRunning
      ? "STOP CIRCULAR AI"
      : "START CIRCULAR TRADING";
}


function startCircularAI() {

  if (
    state.circularRunning
  ) {

    stopCircularAI();

    return;
  }


  state.circularRunning =
    true;

  state.circularPhase =
    "ANALYSIS";


  updateCircularButton();

  runCircularPhase();
}


function stopCircularAI() {

  state.circularRunning =
    false;

  state.circularPhase =
    "IDLE";

  state.circularTimer =
    0;


  if (
    state.circularTimerHandle
  ) {

    clearInterval(
      state.circularTimerHandle
    );

    state.circularTimerHandle =
      null;
  }


  updateCircularUI();

  updateCircularButton();

  setCircularStatus(
    "READY"
  );
}


function runCircularPhase() {

  if (
    !state.circularRunning
  ) {
    return;
  }


  const market =
    state.circularMarket ||
    DOM.circularMarketSelect?.value ||
    "R_10";


  state.circularPhase =
    "ANALYSIS";

  state.circularTimer =
    CONFIG.CIRCULAR_ANALYSIS;


  updateCircularUI();


  state.circularAnalysis =
    analyzeMarket(
      market
    );


  updateCircularPrediction();


  setCircularStatus(
    "ANALYZING..."
  );


  runCircularCountdown(
    CONFIG.CIRCULAR_ANALYSIS,
    () => {

      if (
        !state.circularRunning
      ) {
        return;
      }

      circularPredictionPhase();

    }
  );
}


function updateCircularPrediction() {

  const analysis =
    state.circularAnalysis;


  const prediction =
    analysis?.best?.prediction;


  if (
    DOM.aiCirclePrediction
  ) {

    DOM.aiCirclePrediction.textContent =
      prediction ??
      "--";

  }
}


function circularPredictionPhase() {

  if (
    !state.circularRunning
  ) {
    return;
  }


  state.circularPhase =
    "PREDICTION";

  state.circularTimer =
    CONFIG.CIRCULAR_PREDICTION;


  state.circularAnalysis =
    analyzeMarket(
      state.circularMarket
    );


  updateCircularUI();

  updateCircularPrediction();


  setCircularStatus(
    "PREDICTION READY"
  );


  runCircularCountdown(
    CONFIG.CIRCULAR_PREDICTION,
    () => {

      if (
        !state.circularRunning
      ) {
        return;
      }

      circularTradePhase();

    }
  );
}


function circularTradePhase() {

  if (
    !state.circularRunning
  ) {
    return;
  }


  state.circularPhase =
    "TRADE NOW";

  state.circularTimer =
    CONFIG.CIRCULAR_TRADE;


  updateCircularUI();


  setCircularStatus(
    "TRADE WINDOW OPEN"
  );


  executeCircularPaperTrade();


  runCircularCountdown(
    CONFIG.CIRCULAR_TRADE,
    () => {

      if (
        !state.circularRunning
      ) {
        return;
      }

      circularCooldownPhase();

    }
  );
}


function circularCooldownPhase() {

  if (
    !state.circularRunning
  ) {
    return;
  }


  state.circularPhase =
    "COOLDOWN";

  state.circularTimer =
    CONFIG.CIRCULAR_COOLDOWN;


  updateCircularUI();


  setCircularStatus(
    "COOLDOWN"
  );


  runCircularCountdown(
    CONFIG.CIRCULAR_COOLDOWN,
    () => {

      if (
        !state.circularRunning
      ) {
        return;
      }

      runCircularPhase();

    }
  );
}


function runCircularCountdown(
  seconds,
  callback
) {

  if (
    state.circularTimerHandle
  ) {

    clearInterval(
      state.circularTimerHandle
    );

  }


  state.circularTimer =
    seconds;


  updateCircularUI();


  state.circularTimerHandle =
    setInterval(
      () => {

        if (
          !state.circularRunning
        ) {

          clearInterval(
            state.circularTimerHandle
          );

          state.circularTimerHandle =
            null;

          return;
        }


        state.circularTimer--;


        updateCircularUI();


        if (
          state.circularTimer <= 0
        ) {

          clearInterval(
            state.circularTimerHandle
          );

          state.circularTimerHandle =
            null;

          callback();

        }

      },
      1000
    );
}


/* =========================================================
   CIRCULAR PAPER TRADE
========================================================= */

function executeCircularPaperTrade() {

  const market =
    state.circularMarket ||
    DOM.circularMarketSelect?.value ||
    "R_10";


  const analysis =
    state.circularAnalysis ||
   