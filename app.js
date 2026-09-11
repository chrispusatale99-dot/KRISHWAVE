/* =========================================================
   KRISHWAVE AI BEAST V9.1
   PREMIUM MOBILE TRADING INTELLIGENCE ENGINE
   =========================================================

   DEMO / PAPER ONLY
   ---------------------------------------------------------
   NO REAL TRADES ARE EXECUTED.

   SYSTEMS
   ---------------------------------------------------------
   1. AI BOT
      - 3 second analysis
      - selected strategy set
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
  VERSION: "9.1",

  CLIENT_ID: "34khasPjsT0PCRR8X3Z70",

  REDIRECT_URI:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/",

  CLOUD_API:
    "https://krishwave2.chrispussatale99.workers.dev",

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
   STATE
   ========================================================= */

const state = {

  /* connection */
  socket: null,
  socketConnected: false,
  reconnectTimer: null,

  /* markets */
  selectedMarket: "R_10",
  activeMarket: "R_10",

  marketData: {},

  /* strategy separation */
  manualStrategy: "MATCHES",
  circularStrategy: "AUTO",

  /* compatibility */
  strategy: "MATCHES",

  /* AI Bot */
  botStrategies: [
    "MATCHES",
    "DIFFERS"
  ],

  botRunning: false,
  botTimer: null,
  botMarket: "R_10",

  /* Circular AI */
  circularRunning: false,
  circularPhase: "IDLE",
  circularTimer: 0,
  circularTimerHandle: null,
  circularMarket: "R_10",

  /* paper account */
  paperBalance: 1000,
  startingBalance: 1000,

  totalTrades: 0,
  wins: 0,
  losses: 0,
  profit: 0,

  /* settings */
  stake: 0.25,
  takeProfit: 0,
  stopLoss: 0,
  martingale: 1,

  /* trades */
  activeTrades: [],
  history: [],

  /* analysis */
  lastAnalysis: null,
  lastDigit: null,

  /* selector */
  activeStrategySelector: null,

  /* UI */
  currentPage: "analysis",
  currentTradeTab: "bot",

  /* account */
  accountId: "DEMO",
  currency: "USD",

  /* demo */
  demoConnected: true
};


/* =========================================================
   DOM CACHE
   ========================================================= */

const DOM = {};


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}


function cacheDOM() {

  const ids = [

    /* top */
    "connectionDot",
    "connectionText",
    "demoBadge",
    "themeToggle",

    /* account */
    "accountId",
    "balanceDisplay",
    "currency",
    "connectDerivBtn",

    /* pages */
    "analysisPage",
    "tradePage",
    "historyPage",

    /* navigation */
    "navAnalysis",
    "navTrade",
    "navHistory",

    /* analysis */
    "marketSelect",
    "chartCanvas",
    "digitDistribution",
    "digitStats",
    "aiSignal",
    "aiConfidence",
    "aiStrategy",
    "aiPrediction",
    "marketScanner",

    /* circular */
    "circularMarketSelect",
    "circularStrategyTrigger",
    "circularStrategyLabel",
    "startCircularTradeBtn",
    "circularTimer",
    "circularPhase",
    "circularStatus",
    "circularPrediction",

    /* bot */
    "botMarketSelect",
    "botStrategyTrigger",
    "botStrategyLabel",
    "botStakeInput",
    "botTakeProfitInput",
    "botStopLossInput",
    "botMartingaleInput",
    "startBotBtn",
    "botStatus",
    "botProfit",

    /* manual */
    "manualMarketSelect",
    "manualStrategyTrigger",
    "manualSelectedStrategyLabel",
    "manualStakeInput",
    "manualTakeProfitInput",
    "manualStopLossInput",
    "manualMartingaleInput",
    "manualTargetDigitInput",
    "targetDigitContainer",
    "placeTradeBtn",
    "manualStatus",

    /* tabs */
    "botTab",
    "circularTab",
    "manualTab",
    "botPanel",
    "circularPanel",
    "manualPanel",

    /* strategy modal */
    "strategyModal",
    "closeStrategyModal",
    "strategyOptions",

    /* bot strategy modal */
    "botStrategyModal",
    "closeBotStrategyModal",
    "applyBotStrategies",

    /* history */
    "historyList",
    "historyEmpty",
    "totalTrades",
    "wins",
    "losses",
    "totalProfit",

    /* scanner */
    "scannerList",
    "marketCards",

    /* misc */
    "toastContainer"
  ];

  ids.forEach(id => {
    DOM[id] = $(id);
  });
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message) {

  let container = DOM.toastContainer;

  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";

    Object.assign(container.style, {
      position: "fixed",
      left: "50%",
      bottom: "85px",
      transform: "translateX(-50%)",
      zIndex: "99999",
      width: "calc(100% - 30px)",
      maxWidth: "420px",
      pointerEvents: "none"
    });

    document.body.appendChild(container);
    DOM.toastContainer = container;
  }

  const toast = document.createElement("div");

  toast.textContent = message;

  Object.assign(toast.style, {
    background: "rgba(10,20,35,.96)",
    color: "#fff",
    padding: "12px 16px",
    marginTop: "8px",
    borderRadius: "12px",
    border: "1px solid rgba(0,255,180,.25)",
    boxShadow: "0 10px 30px rgba(0,0,0,.35)",
    fontSize: "13px",
    textAlign: "center"
  });

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity .3s";

    setTimeout(() => {
      toast.remove();
    }, 300);

  }, 2500);
}


/* =========================================================
   STORAGE
   ========================================================= */

function saveState() {

  try {

    localStorage.setItem(
      "KRISHWAVE_PAPER_STATE",
      JSON.stringify({
        paperBalance: state.paperBalance,
        startingBalance: state.startingBalance,
        totalTrades: state.totalTrades,
        wins: state.wins,
        losses: state.losses,
        profit: state.profit,
        history: state.history,
        manualStrategy: state.manualStrategy,
        circularStrategy: state.circularStrategy,
        botStrategies: state.botStrategies
      })
    );

  } catch (error) {
    console.warn("Storage save failed:", error);
  }
}


function loadState() {

  try {

    const saved =
      JSON.parse(
        localStorage.getItem("KRISHWAVE_PAPER_STATE")
      );

    if (!saved) return;

    if (typeof saved.paperBalance === "number") {
      state.paperBalance = saved.paperBalance;
    }

    if (typeof saved.startingBalance === "number") {
      state.startingBalance = saved.startingBalance;
    }

    if (typeof saved.totalTrades === "number") {
      state.totalTrades = saved.totalTrades;
    }

    if (typeof saved.wins === "number") {
      state.wins = saved.wins;
    }

    if (typeof saved.losses === "number") {
      state.losses = saved.losses;
    }

    if (typeof saved.profit === "number") {
      state.profit = saved.profit;
    }

    if (Array.isArray(saved.history)) {
      state.history = saved.history;
    }

    if (
      typeof saved.manualStrategy === "string" &&
      isValidStrategy(saved.manualStrategy)
    ) {
      state.manualStrategy = saved.manualStrategy;
    }

    if (
      typeof saved.circularStrategy === "string"
    ) {
      state.circularStrategy = saved.circularStrategy;
    }

    if (Array.isArray(saved.botStrategies)) {

      const valid =
        saved.botStrategies.filter(
          item => isValidStrategy(item)
        );

      if (valid.length) {
        state.botStrategies = valid;
      }
    }

  } catch (error) {
    console.warn("Storage load failed:", error);
  }
}


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

  if (price === null || price === undefined) {
    return null;
  }

  const str = String(price);

  const digits = str.replace(/\D/g, "");

  if (!digits.length) {
    return null;
  }

  return Number(
    digits.charAt(digits.length - 1)
  );
}


function addTick(market, price) {

  const data = ensureMarket(market);

  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice)) {
    return;
  }

  const digit = extractLastDigit(numericPrice);

  data.ticks.push({
    price: numericPrice,
    digit,
    time: Date.now()
  });

  data.prices.push(numericPrice);
  data.digits.push(digit);

  if (data.ticks.length > CONFIG.MAX_TICKS) {
    data.ticks.shift();
  }

  if (data.prices.length > CONFIG.MAX_TICKS) {
    data.prices.shift();
  }

  if (data.digits.length > CONFIG.MAX_TICKS) {
    data.digits.shift();
  }

  data.lastPrice = numericPrice;
  data.lastDigit = digit;
  data.lastUpdate = Date.now();

  state.lastDigit = digit;

  updateAnalysisUI(market);
  drawChart(market);
}


/* =========================================================
   DERIV PUBLIC SOCKET
   ========================================================= */

function connectPublicMarket() {

  if (
    state.socket &&
    (
      state.socket.readyState === WebSocket.OPEN ||
      state.socket.readyState === WebSocket.CONNECTING
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
      new WebSocket(CONFIG.PUBLIC_WS);

    state.socket = socket;

    socket.addEventListener("open", () => {

      state.socketConnected = true;

      updateConnectionUI(
        true,
        "MARKET LIVE"
      );

      subscribeToMarkets();

      showToast("LIVE MARKET CONNECTED");

    });


    socket.addEventListener("message", event => {

      handleSocketMessage(event.data);

    });


    socket.addEventListener("error", error => {

      console.warn(
        "Market WebSocket error:",
        error
      );

      state.socketConnected = false;

      updateConnectionUI(
        false,
        "CONNECTION ERROR"
      );

    });


    socket.addEventListener("close", () => {

      state.socketConnected = false;

      updateConnectionUI(
        false,
        "RECONNECTING..."
      );

      scheduleReconnect();

    });

  } catch (error) {

    console.error(
      "WebSocket connection failed:",
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

  if (state.reconnectTimer) {
    return;
  }

  state.reconnectTimer =
    setTimeout(() => {

      state.reconnectTimer = null;

      connectPublicMarket();

    }, 5000);
}


function subscribeToMarkets() {

  if (
    !state.socket ||
    state.socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  CONFIG.MARKETS.forEach(market => {

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

  });
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

    const tick = message.tick;

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

  }

  if (DOM.demoBadge) {
    DOM.demoBadge.textContent =
      "DEMO";
  }
}


/* =========================================================
   MARKET SELECTORS
   ========================================================= */

function populateMarketSelectors() {

  const selectors = [
    DOM.marketSelect,
    DOM.botMarketSelect,
    DOM.circularMarketSelect,
    DOM.manualMarketSelect
  ];

  selectors.forEach(select => {

    if (!select) return;

    select.innerHTML = "";

    CONFIG.MARKETS.forEach(market => {

      const option =
        document.createElement("option");

      option.value = market;
      option.textContent = market;

      select.appendChild(option);

    });

  });

  if (DOM.marketSelect) {
    DOM.marketSelect.value =
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

  DOM.marketSelect?.addEventListener(
    "change",
    event => {

      state.selectedMarket =
        event.target.value;

      state.activeMarket =
        state.selectedMarket;

      updateAnalysisUI(
        state.selectedMarket
      );

      drawChart(
        state.selectedMarket
      );
    }
  );


  DOM.botMarketSelect?.addEventListener(
    "change",
    event => {

      state.botMarket =
        event.target.value;

    }
  );


  DOM.circularMarketSelect?.addEventListener(
    "change",
    event => {

      state.circularMarket =
        event.target.value;

    }
  );


  DOM.manualMarketSelect?.addEventListener(
    "change",
    event => {

      state.selectedMarket =
        event.target.value;

    }
  );
}


/* =========================================================
   DIGIT ANALYSIS
   ========================================================= */

function getDigitCounts(market) {

  const data =
    ensureMarket(market);

  const counts =
    Array(10).fill(0);

  data.digits.forEach(digit => {

    if (
      Number.isInteger(digit) &&
      digit >= 0 &&
      digit <= 9
    ) {
      counts[digit]++;
    }

  });

  return counts;
}


function getDigitPercentages(market) {

  const counts =
    getDigitCounts(market);

  const total =
    counts.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  if (!total) {
    return counts.map(() => 0);
  }

  return counts.map(
    value =>
      (value / total) * 100
  );
}


function getLastDigits(market, count = 20) {

  const data =
    ensureMarket(market);

  return data.digits.slice(-count);
}


function getMostFrequentDigit(market) {

  const counts =
    getDigitCounts(market);

  let best = 0;

  for (let i = 1; i < 10; i++) {

    if (counts[i] > counts[best]) {
      best = i;
    }

  }

  return best;
}


function getLeastFrequentDigit(market) {

  const counts =
    getDigitCounts(market);

  let best = 0;

  for (let i = 1; i < 10; i++) {

    if (counts[i] < counts[best]) {
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
    ensureMarket(market);

  const digits =
    data.digits;

  if (
    digits.length <
    CONFIG.MIN_ANALYSIS_TICKS
  ) {

    return {
      market,
      strategy,
      signal: "WAIT",
      confidence: 0,
      prediction: null,
      reason: "Waiting for market data"
    };

  }


  const recent =
    digits.slice(-CONFIG.SCAN_TICKS);

  const counts =
    Array(10).fill(0);

  recent.forEach(digit => {

    if (
      Number.isInteger(digit)
    ) {
      counts[digit]++;
    }

  });


  const total =
    recent.length;


  const percentages =
    counts.map(
      count =>
        total
          ? (count / total) * 100
          : 0
    );


  const hottestDigit =
    percentages.indexOf(
      Math.max(...percentages)
    );


  const coldestDigit =
    percentages.indexOf(
      Math.min(...percentages)
    );


  const lastDigit =
    recent[recent.length - 1];


  let signal = "WAIT";
  let confidence = 50;
  let prediction = hottestDigit;
  let reason = "";


  /* MATCHES */

  if (strategy === "MATCHES") {

    prediction =
      hottestDigit;

    const strength =
      percentages[hottestDigit];

    confidence =
      Math.min(
        96,
        55 + strength * 2.5
      );

    signal =
      confidence >= CONFIG.BOT_MIN_CONFIDENCE
        ? "MATCH"
        : "WAIT";

    reason =
      `Digit ${prediction} frequency ${strength.toFixed(1)}%`;
  }


  /* DIFFERS */

  else if (strategy === "DIFFERS") {

    prediction =
      lastDigit;

    const frequency =
      percentages[lastDigit] || 0;

    confidence =
      Math.min(
        96,
        70 + (10 - frequency) * 2
      );

    signal =
      confidence >= CONFIG.BOT_MIN_CONFIDENCE
        ? "DIFFER"
        : "WAIT";

    reason =
      `Current digit ${prediction} frequency ${frequency.toFixed(1)}%`;
  }


  /* OVER */

  else if (strategy === "OVER") {

    const over =
      recent.filter(
        digit => digit > 4
      ).length;

    const probability =
      (over / total) * 100;

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
      confidence >= CONFIG.BOT_MIN_CONFIDENCE
        ? "OVER"
        : "WAIT";

    prediction =
      hottestDigit;

    reason =
      `High digits probability ${probability.toFixed(1)}%`;
  }


  /* UNDER */

  else if (strategy === "UNDER") {

    const under =
      recent.filter(
        digit => digit < 5
      ).length;

    const probability =
      (under / total) * 100;

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
      confidence >= CONFIG.BOT_MIN_CONFIDENCE
        ? "UNDER"
        : "WAIT";

    prediction =
      coldestDigit;

    reason =
      `Low digits probability ${probability.toFixed(1)}%`;
  }


  /* EVEN */

  else if (strategy === "EVEN") {

    const even =
      recent.filter(
        digit =>
          digit % 2 === 0
      ).length;

    const probability =
      (even / total) * 100;

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
      confidence >= CONFIG.BOT_MIN_CONFIDENCE
        ? "EVEN"
        : "WAIT";

    prediction =
      hottestDigit;

    reason =
      `Even probability ${probability.toFixed(1)}%`;
  }


  /* ODD */

  else if (strategy === "ODD") {

    const odd =
      recent.filter(
        digit =>
          digit % 2 !== 0
      ).length;

    const probability =
      (odd / total) * 100;

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
      confidence >= CONFIG.BOT_MIN_CONFIDENCE
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
    confidence: Math.round(confidence),
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

function analyzeMarket(market) {

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
          result.signal !== "WAIT"
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

function analyzeBot(market) {

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
        analysis =>
          analysis.signal !== "WAIT" &&
          analysis.confidence >=
            CONFIG.BOT_MIN_CONFIDENCE
      )
      .sort(
        (a, b) =>
          b.confidence -
          a.confidence
      );

  if (!results.length) {
    return null;
  }

  return results[0];
}


/* =========================================================
   ANALYSIS UI
   ========================================================= */

function updateAnalysisUI(market) {

  const data =
    ensureMarket(market);

  const analysis =
    analyzeMarket(market);

  state.lastAnalysis =
    analysis;


  if (DOM.aiSignal) {

    DOM.aiSignal.textContent =
      analysis.best
        ? analysis.best.signal
        : "WAIT";

  }


  if (DOM.aiConfidence) {

    DOM.aiConfidence.textContent =
      analysis.best
        ? `${analysis.best.confidence}%`
        : "--";

  }


  if (DOM.aiStrategy) {

    DOM.aiStrategy.textContent =
      analysis.best
        ? analysis.best.strategy
        : "--";

  }


  if (DOM.aiPrediction) {

    DOM.aiPrediction.textContent =
      analysis.best &&
      analysis.best.prediction !== null
        ? analysis.best.prediction
        : "--";

  }


  updateDigitDistribution(market);
  updateDigitStats(market);
  updateMarketScanner();

  if (
    DOM.circularPrediction &&
    state.circularPhase !== "IDLE"
  ) {

    DOM.circularPrediction.textContent =
      analysis.best &&
      analysis.best.prediction !== null
        ? analysis.best.prediction
        : "--";
  }
}


/* =========================================================
   DIGIT DISTRIBUTION UI
   ========================================================= */

function updateDigitDistribution(market) {

  const container =
    DOM.digitDistribution;

  if (!container) return;

  const percentages =
    getDigitPercentages(market);

  container.innerHTML = "";

  percentages.forEach(
    (percentage, digit) => {

      const row =
        document.createElement("div");

      row.className =
        "digit-row";

      row.innerHTML = `
        <span class="digit-label">${digit}</span>
        <div class="digit-bar">
          <div class="digit-fill"
               style="width:${Math.min(
                 100,
                 percentage
               )}%"></div>
        </div>
        <span class="digit-value">
          ${percentage.toFixed(1)}%
        </span>
      `;

      container.appendChild(row);
    }
  );
}


/* =========================================================
   DIGIT STATS
   ========================================================= */

function updateDigitStats(market) {

  const container =
    DOM.digitStats;

  if (!container) return;

  const data =
    ensureMarket(market);

  const counts =
    getDigitCounts(market);

  const total =
    data.digits.length;

  const hottest =
    getMostFrequentDigit(market);

  const coldest =
    getLeastFrequentDigit(market);

  container.innerHTML = `
    <div class="stat-item">
      <span>Ticks</span>
      <strong>${total}</strong>
    </div>

    <div class="stat-item">
      <span>Last Digit</span>
      <strong>${data.lastDigit ?? "--"}</strong>
    </div>

    <div class="stat-item">
      <span>Hot Digit</span>
      <strong>${hottest}</strong>
    </div>

    <div class="stat-item">
      <span>Cold Digit</span>
      <strong>${coldest}</strong>
    </div>
  `;
}


/* =========================================================
   MARKET SCANNER
   ========================================================= */

function updateMarketScanner() {

  const container =
    DOM.marketScanner ||
    DOM.scannerList ||
    DOM.marketCards;

  if (!container) return;

  const results = [];

  CONFIG.MARKETS.forEach(
    market => {

      const analysis =
        analyzeMarket(market);

      results.push({
        market,
        analysis
      });

    }
  );


  results.sort(
    (a, b) =>
      (
        b.analysis.best?.confidence || 0
      ) -
      (
        a.analysis.best?.confidence || 0
      )
  );


  container.innerHTML = "";

  results.forEach(item => {

    const best =
      item.analysis.best;

    const card =
      document.createElement("div");

    card.className =
      "scanner-card";

    const confidence =
      best
        ? best.confidence
        : 0;

    const strength =
      confidence >= CONFIG.BEAST_SIGNAL
        ? "BEAST"
        : confidence >= CONFIG.STRONG_SIGNAL
          ? "STRONG"
          : confidence >= CONFIG.BOT_MIN_CONFIDENCE
            ? "MODERATE"
            : "WAIT";


    card.innerHTML = `
      <div class="scanner-market">
        ${item.market}
      </div>

      <div class="scanner-strategy">
        ${
          best
            ? best.strategy
            : "WAIT"
        }
      </div>

      <div class="scanner-confidence">
        ${confidence}%
      </div>

      <div class="scanner-strength">
        ${strength}
      </div>
    `;

    card.addEventListener(
      "click",
      () => {

        state.selectedMarket =
          item.market;

        state.activeMarket =
          item.market;

        if (DOM.marketSelect) {
          DOM.marketSelect.value =
            item.market;
        }

        updateAnalysisUI(
          item.market
        );

        drawChart(
          item.market
        );

        showToast(
          `${item.market} selected`
        );

      }
    );

    container.appendChild(card);

  });
}


/* =========================================================
   CHART
   ========================================================= */

function drawChart(market) {

  const canvas =
    DOM.chartCanvas;

  if (!canvas) return;

  const ctx =
    canvas.getContext("2d");

  if (!ctx) return;

  const rect =
    canvas.getBoundingClientRect();

  const width =
    Math.max(
      300,
      Math.floor(rect.width || 320)
    );

  const height =
    Math.max(
      180,
      Math.floor(rect.height || 220)
    );


  const dpr =
    window.devicePixelRatio || 1;

  canvas.width =
    width * dpr;

  canvas.height =
    height * dpr;

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
    ensureMarket(market);

  const prices =
    data.prices.slice(-80);


  if (prices.length < 2) {

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
    Math.min(...prices);

  const max =
    Math.max(...prices);

  const range =
    max - min || 1;


  const padding = 20;

  const chartWidth =
    width - padding * 2;

  const chartHeight =
    height - padding * 2;


  ctx.beginPath();


  prices.forEach(
    (price, index) => {

      const x =
        padding +
        (
          index /
          (prices.length - 1)
        ) *
        chartWidth;

      const y =
        padding +
        (
          1 -
          (
            (price - min) /
            range
          )
        ) *
        chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

    }
  );


  ctx.strokeStyle =
    "rgba(0,255,180,.9)";

  ctx.lineWidth = 2;

  ctx.stroke();


  ctx.beginPath();

  prices.forEach(
    (price, index) => {

      const x =
        padding +
        (
          index /
          (prices.length - 1)
        ) *
        chartWidth;

      const y =
        padding +
        (
          1 -
          (
            (price - min) /
            range
          )
        ) *
        chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

    }
  );

  ctx.lineTo(
    width - padding,
    height - padding
  );

  ctx.lineTo(
    padding,
    height - padding
  );

  ctx.closePath();

  ctx.fillStyle =
    "rgba(0,255,180,.08)";

  ctx.fill();


  ctx.fillStyle =
    "rgba(255,255,255,.55)";

  ctx.font =
    "10px Arial";

  ctx.fillText(
    market,
    padding,
    12
  );

}


/* =========================================================
   STRATEGY CONTROLS
   ========================================================= */

function setupStrategyControls() {

  DOM.strategyOptions
    ?.querySelectorAll("[data-strategy]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const strategy =
            button.dataset.strategy;

          if (!isValidStrategy(strategy)) {
            return;
          }


          if (
            state.activeStrategySelector ===
            "manual"
          ) {

            state.manualStrategy =
              strategy;

            state.strategy =
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

            showToast(
              `Manual strategy: ${strategy}`
            );
          }


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

    });


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
      () => {

        DOM.strategyModal
          ?.classList.remove(
            "active"
          );

        state.activeStrategySelector =
          null;

      }
    );


  if (DOM.manualSelectedStrategyLabel) {

    DOM.manualSelectedStrategyLabel
      .textContent =
      state.manualStrategy;

    DOM.manualSelectedStrategyLabel
      .dataset.strategy =
      state.manualStrategy;
  }


  if (DOM.circularStrategyLabel) {

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


function updateManualTargetVisibility() {

  if (!DOM.targetDigitContainer) {
    return;
  }

  const strategy =
    state.manualStrategy;

  const show =
    strategyNeedsDigit(
      strategy
    );

  DOM.targetDigitContainer.style.display =
    show
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

  if (!DOM.botStrategyLabel) {
    return;
  }

  DOM.botStrategyLabel.textContent =
    state.botStrategies.length
      ? state.botStrategies.join(" + ")
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
      strategy =>
        isValidStrategy(strategy)
    );


  if (!selected.length) {

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
    `AI Bot: ${selected.join(" + ")}`
  );
}


/* =========================================================
   SETTINGS
   ========================================================= */

function readNumber(
  element,
  fallback
) {

  if (!element) {
    return fallback;
  }

  const value =
    Number(element.value);

  return Number.isFinite(value)
    ? value
    : fallback;
}


function setupSettings() {

  const inputs = [

    DOM.botStakeInput,
    DOM.botTakeProfitInput,
    DOM.botStopLossInput,
    DOM.botMartingaleInput,
    DOM.manualStakeInput,
    DOM.manualTakeProfitInput,
    DOM.manualStopLossInput,
    DOM.manualMartingaleInput
  ];


  inputs.forEach(input => {

    input?.addEventListener(
      "change",
      () => {

        const stake =
          readNumber(
            DOM.botStakeInput ||
            DOM.manualStakeInput,
            CONFIG.MIN_STAKE
          );

        state.stake =
          Math.max(
            CONFIG.MIN_STAKE,
            stake
          );

      }
    );

  });
}


/* =========================================================
   PAPER TRADE ENGINE
   ========================================================= */

function getStakeFromInput(
  element
) {

  const value =
    readNumber(
      element,
      state.stake
    );

  return Math.max(
    CONFIG.MIN_STAKE,
    value
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

  const value =
    readNumber(
      element,
      1
    );

  return Math.max(
    1,
    value
  );
}


function canPlaceTrade(stake) {

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
    state.paperBalance < stake
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
    !isValidStrategy(strategy)
  ) {

    showToast(
      "Invalid strategy"
    );

    return null;
  }


  if (
    !canPlaceTrade(stake)
  ) {

    return null;
  }


  const data =
    ensureMarket(market);

  const entryDigit =
    data.lastDigit;


  const trade = {

    id:
      `KW-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,

    market,
    strategy,
    stake,

    prediction,

    entryDigit,

    source,

    status: "OPEN",

    createdAt: Date.now(),

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

  return trade;
}


/* =========================================================
   SETTLE PAPER TRADE
   ========================================================= */

function settlePaperTrade(
  trade
) {

  if (!trade) {
    return;
  }

  if (
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


  let won = false;


  if (
    trade.strategy ===
    "MATCHES"
  ) {

    won =
      finalDigit ===
      Number(trade.prediction);

  }


  else if (
    trade.strategy ===
    "DIFFERS"
  ) {

    won =
      finalDigit !==
      Number(trade.prediction);

  }


  else if (
    trade.strategy ===
    "OVER"
  ) {

    won =
      finalDigit > 4;

  }


  else if (
    trade.strategy ===
    "UNDER"
  ) {

    won =
      finalDigit < 5;

  }


  else if (
    trade.strategy ===
    "EVEN"
  ) {

    won =
      finalDigit % 2 === 0;

  }


  else if (
    trade.strategy ===
    "ODD"
  ) {

    won =
      finalDigit % 2 !== 0;

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
        item.id !== trade.id
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
  renderHistory();
  saveState();


  return trade;
}


/* =========================================================
   AUTO SETTLEMENT
   ========================================================= */

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
   AI BOT
   ========================================================= */

function setBotStatus(
  message
) {

  if (DOM.botStatus) {
    DOM.botStatus.textContent =
      message;
  }
}


function updateBotButton() {

  if (!DOM.startBotBtn) {
    return;
  }

  DOM.startBotBtn.textContent =
    state.botRunning
      ? "STOP AI BOT"
      : "START AI BOT";
}


function startBot() {

  if (state.botRunning) {

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


  state.botRunning = true;

  updateBotButton();

  setBotStatus(
    "AI BOT STARTING..."
  );


  runBotCycle();
}


function stopBot() {

  state.botRunning =
    false;


  if (state.botTimer) {

    clearTimeout(
      state.botTimer
    );

    state.botTimer = null;
  }


  updateBotButton();

  setBotStatus(
    "AI BOT STOPPED"
  );
}


function runBotCycle() {

  if (!state.botRunning) {
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
      DOM.botStakeInput
    );


  const takeProfit =
    getTakeProfit(
      DOM.botTakeProfitInput
    );


  const stopLoss =
    getStopLoss(
      DOM.botStopLossInput
    );


  if (
    takeProfit > 0 &&
    state.profit >= takeProfit
  ) {

    setBotStatus(
      "TAKE PROFIT REACHED"
    );

    stopBot();

    return;
  }


  if (
    stopLoss > 0 &&
    Math.abs(
      Math.min(
        0,
        state.profit
      )
    ) >= stopLoss
  ) {

    setBotStatus(
      "STOP LOSS REACHED"
    );

    stopBot();

    return;
  }


  const prediction =
    analysis.prediction;


  const trade =
    createPaperTrade({
      market,
      strategy:
        analysis.strategy,
      stake,
      prediction,
      source: "AI BOT",
      takeProfit,
      stopLoss
    });


  if (trade) {

    setBotStatus(
      `PAPER TRADE • ${analysis.strategy}`
    );


    /* IMPORTANT:
       Keep selected strategy set displayed.
       Never replace it with ACTIVE: strategy.
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

  if (DOM.circularStatus) {
    DOM.circularStatus.textContent =
      message;
  }
}


function updateCircularUI() {

  if (DOM.circularPhase) {

    DOM.circularPhase.textContent =
      state.circularPhase;
  }


  if (DOM.circularTimer) {

    DOM.circularTimer.textContent =
      state.circularTimer;
  }
}


function updateCircularButton() {

  if (!DOM.startCircularTradeBtn) {
    return;
  }

  DOM.startCircularTradeBtn.textContent =
    state.circularRunning
      ? "STOP CIRCULAR AI"
      : "START CIRCULAR AI";
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
    "CIRCULAR AI STOPPED"
  );
}


function runCircularPhase() {

  if (
    !state.circularRunning
  ) {
    return;
  }


  state.circularPhase =
    "ANALYSIS";

  state.circularTimer =
    CONFIG.CIRCULAR_ANALYSIS;

  updateCircularUI();


  const market =
    state.circularMarket ||
    DOM.circularMarketSelect?.value ||
    "R_10";


  const analysis =
    analyzeMarket(
      market
    );


  state.circularAnalysis =
    analysis;


  if (
    DOM.circularPrediction
  ) {

    DOM.circularPrediction.textContent =
      analysis.best?.prediction ??
      "--";
  }


  setCircularStatus(
    "ANALYZING MARKET..."
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


function circularPredictionPhase() {

  state.circularPhase =
    "PREDICTION";

  state.circularTimer =
    CONFIG.CIRCULAR_PREDICTION;

  updateCircularUI();

  setCircularStatus(
    "PREDICTION READY"
  );


  const analysis =
    analyzeMarket(
      state.circularMarket
    );


  state.circularAnalysis =
    analysis;


  if (
    DOM.circularPrediction
  ) {

    DOM.circularPrediction.textContent =
      analysis.best?.prediction ??
      "--";
  }


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
    "R_10";


  const analysis =
    state.circularAnalysis ||
    analyzeMarket(
      market
    );


  if (!analysis) {
    return;
  }


  const selectedCircularStrategy =
    state.circularStrategy ||
    DOM.circularStrategyLabel?.dataset?.strategy ||
    "AUTO";


  const strategy =
    selectedCircularStrategy === "AUTO"
      ? (
          analysis.best?.strategy ||
          "MATCHES"
        )
      : selectedCircularStrategy;


  const prediction =
    analysis.best?.prediction ??
    getMostFrequentDigit(
      market
    );


  const stake =
    getStakeFromInput(
      DOM.circularStakeInput
    );


  const takeProfit =
    getTakeProfit(
      DOM.circularTakeProfitInput
    );


  const stopLoss =
    getStopLoss(
      DOM.circularStopLossInput
    );


  const trade =
    createPaperTrade({
      market,
      strategy,
      stake,
      prediction,
      source: "CIRCULAR AI",
      takeProfit,
      stopLoss
    });


  if (trade) {

    setCircularStatus(
      `PAPER TRADE • ${strategy}`
    );

    scheduleTradeSettlement(
      trade,
      3000
    );

  } else {

    setCircularStatus(
      "TRADE NOT PLACED"
    );

  }
}


/* =========================================================
   MANUAL TRADING
   ========================================================= */

function setManualStatus(
  message
) {

  if (DOM.manualStatus) {
    DOM.manualStatus.textContent =
      message;
  }
}


function placeManualTrade() {

  const market =
    DOM.manualMarketSelect?.value ||
    state.selectedMarket ||
    "R_10";


  const strategy =
    state.manualStrategy ||
    DOM.manualSelectedStrategyLabel
      ?.dataset
      ?.strategy ||
    "MATCHES";


  let prediction = null;


  if (
    strategyNeedsDigit(
      strategy
    )
  ) {

    prediction =
      Number(
        DOM.manualTargetDigitInput
          ?.value
      );


    if (
      !Number.isInteger(
        prediction
      ) ||
      prediction < 0 ||
      prediction > 9
    ) {

      showToast(
        "Enter a target digit from 0 to 9"
      );

      return;
    }
  }


  const stake =
    getStakeFromInput(
      DOM.manualStakeInput
    );


  const takeProfit =
    getTakeProfit(
      DOM.manualTakeProfitInput
    );


  const stopLoss =
    getStopLoss(
      DOM.manualStopLossInput
    );


  const trade =
    createPaperTrade({
      market,
      strategy,
      stake,
      prediction,
      source: "MANUAL",
      takeProfit,
      stopLoss
    });


  if (!trade) {

    setManualStatus(
      "TRADE NOT PLACED"
    );

    return;
  }


  setManualStatus(
    `PAPER TRADE • ${strategy}`
  );


  scheduleTradeSettlement(
    trade,
    3000
  );


  showToast(
    `Manual ${strategy} paper trade placed`
  );
}


/* =========================================================
   ACCOUNT UI
   ========================================================= */

function updateAccountUI() {

  if (DOM.balanceDisplay) {

    DOM.balanceDisplay.textContent =
      state.paperBalance.toFixed(2);

  }


  if (DOM.accountId) {

    DOM.accountId.textContent =
      state.accountId;

  }


  if (DOM.currency) {

    DOM.currency.textContent =
      state.currency;

  }
}


/* =========================================================
   STATISTICS UI
   ========================================================= */

function updateStatsUI() {

  if (DOM.totalTrades) {

    DOM.totalTrades.textContent =
      state.totalTrades;

  }


  if (DOM.wins) {

    DOM.wins.textContent =
      state.wins;

  }


  if (DOM.losses) {

    DOM.losses.textContent =
      state.losses;

  }


  if (DOM.totalProfit) {

    const value =
      state.profit;

    DOM.totalProfit.textContent =
      `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

  }


  if (DOM.botProfit) {

    DOM.botProfit.textContent =
      `${state.profit >= 0 ? "+" : ""}${state.profit.toFixed(2)}`;

  }
}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {

  if (!DOM.historyList) {
    return;
  }


  if (!state.history.length) {

    DOM.historyList.innerHTML =
      `<div class="empty-history">
         No paper trades yet
       </div>`;

    return;
  }


  DOM.historyList.innerHTML =
    "";


  state.history.forEach(
    trade => {

      const item =
        document.createElement("div");

      item.className =
        "history-item";


      const result =
        Number(
          trade.result || 0
        );


      item.innerHTML = `
        <div class="history-top">
          <strong>
            ${trade.market}
          </strong>

          <span>
            ${trade.status}
          </span>
        </div>

        <div class="history-middle">
          <span>
            ${trade.strategy}
          </span>

          <span>
            ${trade.source}
          </span>
        </div>

        <div class="history-bottom">
          <span>
            Stake: ${Number(
              trade.stake || 0
            ).toFixed(2)}
          </span>

          <span>
            ${
              result >= 0
                ? "+"
                : ""
            }${result.toFixed(2)}
          </span>
        </div>
      `;


      DOM.historyList.appendChild(
        item
      );

    }
  );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function showPage(
  page
) {

  state.currentPage =
    page;


  const pages = {

    analysis:
      DOM.analysisPage,

    trade:
      DOM.tradePage,

    history:
      DOM.historyPage

  };


  Object.keys(pages).forEach(
    key => {

      const element =
        pages[key];

      if (!element) return;

      element.classList.toggle(
        "active",
        key === page
      );

    }
  );


  DOM.navAnalysis
    ?.classList.toggle(
      "active",
      page === "analysis"
    );


  DOM.navTrade
    ?.classList.toggle(
      "active",
      page === "trade"
    );


  DOM.navHistory
    ?.classList.toggle(
      "active",
      page === "history"
    );


  if (
    page === "analysis"
  ) {

    updateAnalysisUI(
      state.selectedMarket
    );

    drawChart(
      state.selectedMarket
    );

  }


  if (
    page === "history"
  ) {

    renderHistory();

  }
}


function setupNavigation() {

  DOM.navAnalysis
    ?.addEventListener(
      "click",
      () =>
        showPage(
          "analysis"
        )
    );


  DOM.navTrade
    ?.addEventListener(
      "click",
      () =>
        showPage(
          "trade"
        )
    );


  DOM.navHistory
    ?.addEventListener(
      "click",
      () =>
        showPage(
          "history"
        )
    );
}


/* =========================================================
   TRADE TABS
   ========================================================= */

function showTradeTab(
  tab
) {

  state.currentTradeTab =
    tab;


  const panels = {

    bot:
      DOM.botPanel,

    circular:
      DOM.circularPanel,

    manual:
      DOM.manualPanel

  };


  Object.keys(panels).forEach(
    key => {

      const panel =
        panels[key];

      if (!panel) return;

      panel.classList.toggle(
        "active",
        key === tab
      );

    }
  );


  DOM.botTab
    ?.classList.toggle(
      "active",
      tab === "bot"
    );


  DOM.circularTab
    ?.classList.toggle(
      "active",
      tab === "circular"
    );


  DOM.manualTab
    ?.classList.toggle(
      "active",
      tab === "manual"
    );
}


function setupTradeTabs() {

  DOM.botTab
    ?.addEventListener(
      "click",
      () =>
        showTradeTab(
          "bot"
        )
    );


  DOM.circularTab
    ?.addEventListener(
      "click",
      () =>
        showTradeTab(
          "circular"
        )
    );


  DOM.manualTab
    ?.addEventListener(
      "click",
      () =>
        showTradeTab(
          "manual"
        )
    );
}


/* =========================================================
   THEME
   ========================================================= */

function setupTheme() {

  DOM.themeToggle
    ?.addEventListener(
      "click",
      () => {

        document.body.classList.toggle(
          "light-mode"
        );

        const light =
          document.body.classList.contains(
            "light-mode"
          );

        localStorage.setItem(
          "KRISHWAVE_THEME",
          light
            ? "light"
            : "dark"
        );

      }
    );


  const savedTheme =
    localStorage.getItem(
      "KRISHWAVE_THEME"
    );


  if (
    savedTheme === "light"
  ) {

    document.body.classList.add(
      "light-mode"
    );
  }
}


/* =========================================================
   CONNECT BUTTON
   ========================================================= */

function setupConnectButton() {

  DOM.connectDerivBtn
    ?.addEventListener(
      "click",
      () => {

        showToast(
          "KRISHWAVE is running in DEMO / PAPER mode"
        );

      }
    );
}


/* =========================================================
   RESIZE
   ========================================================= */

function setupResize() {

  window.addEventListener(
    "resize",
    () => {

      drawChart(
        state.selectedMarket
      );

    }
  );
}


/* =========================================================
   STARTUP
   ========================================================= */

function initializeApp() {

  cacheDOM();

  loadState();

  state.startingBalance =
    state.startingBalance ||
    CONFIG.START_PAPER_BALANCE;

  state.paperBalance =
    Number.isFinite(
      state.paperBalance
    )
      ? state.paperBalance
      : CONFIG.START_PAPER_BALANCE;


  populateMarketSelectors();

  setupMarketSelectors();

  setupStrategyControls();

  setupBotStrategyControls();

  setupSettings();

  setupNavigation();

  setupTradeTabs();

  setupTheme();

  setupConnectButton();

  setupResize();


  /* buttons */

  DOM.startBotBtn
    ?.addEventListener(
      "click",
      startBot
    );


  DOM.startCircularTradeBtn
    ?.addEventListener(
      "click",
      startCircularAI
    );


  DOM.placeTradeBtn
    ?.addEventListener(
      "click",
      placeManualTrade
    );


  /* initial UI */

  updateConnectionUI(
    false,
    "CONNECTING..."
  );

  updateAccountUI();

  updateStatsUI();

  renderHistory();

  updateBotStrategyPreview();

  syncBotStrategyChecks();

  updateManualTargetVisibility();

  updateCircularUI();

  updateCircularButton();

  updateBotButton();

  showTradeTab("bot");

  showPage("analysis");


  /* market connection */

  connectPublicMarket();


  /* periodic analysis */

  setInterval(
    () => {

      updateAnalysisUI(
        state.selectedMarket
      );

    },
    2000
  );


  /* periodic scanner */

  setInterval(
    () => {

      updateMarketScanner();

    },
    5000
  );


  console.log(
    `%cKRISHWAVE AI BEAST V${CONFIG.VERSION}`,
    "font-size:20px;font-weight:bold;"
  );

  console.log(
    "DEMO / PAPER ONLY — NO REAL TRADES"
  );

}


/* =========================================================
   GLOBAL SAFETY
   ========================================================= */

window.addEventListener(
  "error",
  event => {

    console.error(
      "KRISHWAVE error:",
      event.error ||
      event.message
    );

  }
);


/* =========================================================
   BOOT
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp
  );

} else {

  initializeApp();

}