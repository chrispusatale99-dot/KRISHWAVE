/* =========================================================
   KRISHWAVE V4.0
   LIVE DERIV MARKET INTELLIGENCE + RISK ENGINE

   FEATURES
   ---------------------------------------------------------
   - Live Deriv public market data
   - Volatility Indices
   - Digit analysis
   - Even / Odd
   - High / Low
   - Over / Under
   - Match / Differ
   - Rise / Fall
   - AUTO strategy
   - Statistical AI engine
   - Market scanner
   - 10 second analysis
   - 7 second entry countdown
   - Stake minimum 0.25
   - Take profit
   - Stop loss
   - Martingale multiplier
   - Paper-trading risk simulation
   - Dark / Light mode
   - Analysis only
   ========================================================= */


"use strict";


/* =========================================================
   CONFIG
   ========================================================= */

const CONFIG = {

  WS_URL:
    "wss://api.derivws.com/trading/v1/options/ws/public",

  MAX_HISTORY: 200,

  RECENT_WINDOW: 80,

  MIN_SAMPLE: 30,

  RECONNECT_DELAY: 3000,

  WATCHDOG_MS: 15000,

  ANALYSIS_SECONDS: 10,

  COUNTDOWN_SECONDS: 7,

  MAX_MARKETS: 13,

  STRONG_EDGE: 10,

  WATCH_EDGE: 6,

  MAX_CONFIDENCE: 92,

  MIN_STAKE: 0.25,

  DEFAULT_TAKE_PROFIT: 5,

  DEFAULT_STOP_LOSS: 5,

  DEFAULT_MARTINGALE: 2,

  MAX_STAKE: 100
};


const MARKETS = [

  {
    symbol: "R_10",
    name: "Volatility 10 Index"
  },

  {
    symbol: "R_10_1S",
    name: "Volatility 10 (1s) Index"
  },

  {
    symbol: "R_15_1S",
    name: "Volatility 15 (1s) Index"
  },

  {
    symbol: "R_25",
    name: "Volatility 25 Index"
  },

  {
    symbol: "R_25_1S",
    name: "Volatility 25 (1s) Index"
  },

  {
    symbol: "R_30_1S",
    name: "Volatility 30 (1s) Index"
  },

  {
    symbol: "R_50",
    name: "Volatility 50 Index"
  },

  {
    symbol: "R_50_1S",
    name: "Volatility 50 (1s) Index"
  },

  {
    symbol: "R_75",
    name: "Volatility 75 Index"
  },

  {
    symbol: "R_75_1S",
    name: "Volatility 75 (1s) Index"
  },

  {
    symbol: "R_90_1S",
    name: "Volatility 90 (1s) Index"
  },

  {
    symbol: "R_100",
    name: "Volatility 100 Index"
  },

  {
    symbol: "R_100_1S",
    name: "Volatility 100 (1s) Index"
  }

];


/* =========================================================
   STATE
   ========================================================= */

const state = {

  ws: null,

  connected: false,

  selectedSymbol: "R_10",

  selectedStrategy: "AUTO",

  targetDigit: null,

  markets: {},

  requestId: 1,

  pendingHistory: new Set(),

  subscriptions: new Set(),

  liveTicks: 0,

  lastTickTime: 0,

  reconnectTimer: null,

  watchdogTimer: null,

  aiTimer: null,

  aiPhase: "READY",

  aiSeconds: CONFIG.ANALYSIS_SECONDS,

  running: false,

  tradeCount: 0,

  lastAction: "WAITING",

  scanResults: [],

  theme: "dark",

  risk: {

    minimumStake: CONFIG.MIN_STAKE,

    takeProfit: CONFIG.DEFAULT_TAKE_PROFIT,

    stopLoss: CONFIG.DEFAULT_STOP_LOSS,

    martingale: CONFIG.DEFAULT_MARTINGALE,

    currentStake: CONFIG.MIN_STAKE,

    sessionProfit: 0,

    lossStreak: 0,

    riskState: "READY"

  }

};


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {

  return document.getElementById(id);

}


function setText(id, value) {

  const element = $(id);

  if (element) {

    element.textContent =
      value === undefined || value === null
        ? "—"
        : String(value);

  }

}


function clamp(value, min, max) {

  return Math.min(
    max,
    Math.max(min, value)
  );

}


function round(value, decimals = 2) {

  const factor =
    Math.pow(10, decimals);

  return Math.round(
    Number(value) * factor
  ) / factor;

}


/* =========================================================
   MARKET HELPERS
   ========================================================= */

function getMarket(symbol) {

  if (!state.markets[symbol]) {

    state.markets[symbol] = {

      symbol,

      name:
        MARKETS.find(
          market => market.symbol === symbol
        )?.name || symbol,

      history: [],

      quote: null,

      digit: null,

      pipSize: 2,

      lastTick: 0,

      updated: 0

    };

  }

  return state.markets[symbol];

}


function getMarketHistory(symbol) {

  const market =
    getMarket(symbol);

  return market.history || [];

}


/* =========================================================
   THEME
   ========================================================= */

function applyTheme(theme) {

  const isLight =
    theme === "light";

  document.body.classList.toggle(
    "light-mode",
    isLight
  );

  state.theme =
    isLight ? "light" : "dark";

  const button =
    $("themeToggle");

  if (button) {

    button.textContent =
      isLight ? "☀️" : "🌙";

    button.setAttribute(
      "aria-pressed",
      String(isLight)
    );

    button.setAttribute(
      "aria-label",
      isLight
        ? "Switch to dark mode"
        : "Switch to light mode"
    );

  }

  try {

    localStorage.setItem(
      "krishwave-theme",
      state.theme
    );

  } catch (_) {}

}


function setupThemeToggle() {

  const button =
    $("themeToggle");

  if (!button) return;

  let saved =
    "dark";

  try {

    saved =
      localStorage.getItem(
        "krishwave-theme"
      ) || "dark";

  } catch (_) {}

  applyTheme(saved);

  button.addEventListener(
    "click",
    () => {

      applyTheme(
        state.theme === "dark"
          ? "light"
          : "dark"
      );

    }
  );

}


/* =========================================================
   WEBSOCKET
   ========================================================= */

function nextRequestId() {

  return state.requestId++;

}


function send(payload) {

  if (
    !state.ws ||
    state.ws.readyState !== WebSocket.OPEN
  ) {

    return false;

  }

  try {

    state.ws.send(
      JSON.stringify(payload)
    );

    return true;

  } catch (_) {

    return false;

  }

}


function connectWebSocket() {

  clearTimeout(
    state.reconnectTimer
  );

  updateConnectionUI(
    "CONNECTING"
  );

  try {

    state.ws =
      new WebSocket(
        CONFIG.WS_URL
      );

  } catch (error) {

    scheduleReconnect();

    return;

  }


  state.ws.onopen =
    function () {

      state.connected = true;

      updateConnectionUI(
        "LIVE"
      );

      requestActiveSymbols();

      startWatchdog();

    };


  state.ws.onmessage =
    function (event) {

      handleMessage(
        event.data
      );

    };


  state.ws.onerror =
    function () {

      updateConnectionUI(
        "ERROR"
      );

    };


  state.ws.onclose =
    function () {

      state.connected = false;

      updateConnectionUI(
        "OFFLINE"
      );

      stopWatchdog();

      scheduleReconnect();

    };

}


function scheduleReconnect() {

  clearTimeout(
    state.reconnectTimer
  );

  state.reconnectTimer =
    setTimeout(
      connectWebSocket,
      CONFIG.RECONNECT_DELAY
    );

}


function startWatchdog() {

  stopWatchdog();

  state.watchdogTimer =
    setInterval(
      function () {

        if (
          state.connected &&
          state.lastTickTime &&
          Date.now() -
            state.lastTickTime >
            CONFIG.WATCHDOG_MS
        ) {

          try {

            state.ws.close();

          } catch (_) {}

        }

      },
      5000
    );

}


function stopWatchdog() {

  clearInterval(
    state.watchdogTimer
  );

  state.watchdogTimer = null;

}


/* =========================================================
   DERIV REQUESTS
   ========================================================= */

function requestActiveSymbols() {

  send({

    active_symbols:
      "brief",

    product_type:
      "basic",

    req_id:
      nextRequestId()

  });

}


function requestHistory(symbol) {

  if (
    state.pendingHistory.has(symbol)
  ) {

    return;

  }

  state.pendingHistory.add(
    symbol
  );

  send({

    ticks_history:
      symbol,

    end:
      "latest",

    count:
      CONFIG.MAX_HISTORY,

    style:
      "ticks",

    req_id:
      nextRequestId()

  });

}


function subscribeTicks(symbol) {

  if (
    state.subscriptions.has(symbol)
  ) {

    return;

  }

  const sent =
    send({

      ticks:
        symbol,

      subscribe:
        1,

      req_id:
        nextRequestId()

    });

  if (sent) {

    state.subscriptions.add(
      symbol
    );

  }

}


/* =========================================================
   MESSAGE ROUTER
   ========================================================= */

function handleMessage(raw) {

  let data;

  try {

    data =
      typeof raw === "string"
        ? JSON.parse(raw)
        : raw;

  } catch (_) {

    return;

  }


  if (data.error) {

    console.warn(
      "Deriv error:",
      data.error
    );

    return;

  }


  switch (data.msg_type) {

    case "active_symbols":

      handleActiveSymbols(data);

      break;


    case "history":

      handleHistory(data);

      break;


    case "tick":

      handleTick(data);

      break;

  }

}


/* =========================================================
   ACTIVE SYMBOLS
   ========================================================= */

function handleActiveSymbols(data) {

  const available =
    new Set(
      (data.active_symbols || [])
        .map(item => item.symbol)
    );


  const selected =
    MARKETS
      .filter(
        market =>
          available.has(
            market.symbol
          )
      )
      .slice(
        0,
        CONFIG.MAX_MARKETS
      );


  const marketsToUse =
    selected.length
      ? selected
      : MARKETS.slice(
          0,
          CONFIG.MAX_MARKETS
        );


  marketsToUse.forEach(
    market => {

      const item =
        getMarket(
          market.symbol
        );

      item.name =
        market.name;

      requestHistory(
        market.symbol
      );

      subscribeTicks(
        market.symbol
      );

    }
  );


  setText(
    "marketCount",
    marketsToUse.length
  );

}


/* =========================================================
   HISTORY
   ========================================================= */

function handleHistory(data) {

  const symbol =
    data.echo_req?.ticks_history ||
    data.echo_req?.symbol;

  if (!symbol) return;

  const market =
    getMarket(symbol);


  const prices =
    Array.isArray(
      data.history?.prices
    )
      ? data.history.prices
      : [];


  const times =
    Array.isArray(
      data.history?.times
    )
      ? data.history.times
      : [];


  market.history =
    prices
      .map(
        (price, index) => ({

          quote:
            Number(price),

          time:
            Number(times[index] || 0)

        })
      )
      .filter(
        item =>
          Number.isFinite(
            item.quote
          )
      )
      .slice(
        -CONFIG.MAX_HISTORY
      );


  if (
    market.history.length
  ) {

    const last =
      market.history[
        market.history.length - 1
      ];

    market.quote =
      last.quote;

    market.lastTick =
      last.time;

    market.digit =
      extractLastDigit(
        last.quote,
        market.pipSize
      );

  }


  state.pendingHistory.delete(
    symbol
  );


  updateMarketDerivedData(
    symbol
  );

  renderSelectedMarket();

  renderMarketScanner();

}


/* =========================================================
   LIVE TICKS
   ========================================================= */

function handleTick(data) {

  const tick =
    data.tick;

  if (!tick) return;

  const symbol =
    tick.symbol;

  if (!symbol) return;


  const market =
    getMarket(symbol);


  const quote =
    Number(tick.quote);


  if (!Number.isFinite(quote)) {

    return;

  }


  if (
    tick.pip_size !== undefined
  ) {

    market.pipSize =
      Number(tick.pip_size);

  }


  market.quote =
    quote;

  market.lastTick =
    Number(
      tick.epoch ||
      Date.now() / 1000
    );


  market.digit =
    extractLastDigit(
      quote,
      market.pipSize
    );


  market.history.push({

    quote,

    time:
      market.lastTick

  });


  if (
    market.history.length >
    CONFIG.MAX_HISTORY
  ) {

    market.history =
      market.history.slice(
        -CONFIG.MAX_HISTORY
      );

  }


  state.liveTicks++;

  state.lastTickTime =
    Date.now();


  updateMarketDerivedData(
    symbol
  );


  if (
    symbol ===
    state.selectedSymbol
  ) {

    renderSelectedMarket();

    renderDigitDistribution();

    renderProbabilities();

    renderAI();

  }

}


/* =========================================================
   DIGIT ENGINE
   ========================================================= */

function extractLastDigit(
  quote,
  pipSize = 2
) {

  const numeric =
    Number(quote);

  if (!Number.isFinite(numeric)) {

    return null;

  }


  const decimals =
    Number.isFinite(
      Number(pipSize)
    )
      ? Number(pipSize)
      : 2;


  const scaled =
    Math.round(
      Math.abs(numeric) *
      Math.pow(
        10,
        decimals
      )
    );


  return scaled % 10;

}


function getDigits(
  symbol,
  windowSize =
    CONFIG.RECENT_WINDOW
) {

  const market =
    getMarket(symbol);


  return market.history
    .slice(-windowSize)
    .map(
      item =>
        extractLastDigit(
          item.quote,
          market.pipSize
        )
    )
    .filter(
      digit =>
        Number.isInteger(digit)
    );

}


function getDigitCounts(
  symbol,
  windowSize =
    CONFIG.RECENT_WINDOW
) {

  const counts =
    Array(10).fill(0);


  getDigits(
    symbol,
    windowSize
  ).forEach(
    digit => {

      counts[digit]++;

    }
  );


  return counts;

}


function getDigitRates(
  symbol,
  windowSize =
    CONFIG.RECENT_WINDOW
) {

  const counts =
    getDigitCounts(
      symbol,
      windowSize
    );


  const total =
    counts.reduce(
      (a, b) =>
        a + b,
      0
    );


  if (!total) {

    return counts.map(
      () => 0
    );

  }


  return counts.map(
    count =>
      count / total * 100
  );

}


/* =========================================================
   PRESSURE
   ========================================================= */

function getRecentDigitPressure(
  symbol
) {

  const digits =
    getDigits(
      symbol,
      20
    );


  if (
    digits.length < 10
  ) {

    return 0;

  }


  const recent =
    digits.slice(-10);


  const older =
    digits.slice(
      Math.max(
        0,
        digits.length - 20
      ),
      -10
    );


  if (!older.length) {

    return 0;

  }


  const recentMean =
    recent.reduce(
      (a, b) =>
        a + b,
      0
    ) / recent.length;


  const olderMean =
    older.reduce(
      (a, b) =>
        a + b,
      0
    ) / older.length;


  return clamp(
    (recentMean - olderMean) * 4,
    -10,
    10
  );

}


/* =========================================================
   PROBABILITY ANALYSIS
   ========================================================= */

function analyzeEvenOdd(
  symbol
) {

  const digits =
    getDigits(symbol);

  const sample =
    digits.length;


  if (!sample) {

    return null;

  }


  const even =
    digits.filter(
      d => d % 2 === 0
    ).length;


  const probability =
    even / sample * 100;


  return {

    even:
      round(probability),

    odd:
      round(100 - probability),

    sample

  };

}


function analyzeHighLow(
  symbol
) {

  const digits =
    getDigits(symbol);

  const sample =
    digits.length;


  if (!sample) {

    return null;

  }


  const high =
    digits.filter(
      d => d >= 5
    ).length;


  const probability =
    high / sample * 100;


  return {

    high:
      round(probability),

    low:
      round(100 - probability),

    sample

  };

}


function analyzeOverUnder(
  symbol
) {

  const digits =
    getDigits(symbol);


  if (!digits.length) {

    return null;

  }


  let best = null;


  for (
    let threshold = 1;
    threshold <= 8;
    threshold++
  ) {

    const over =
      digits.filter(
        d =>
          d > threshold
      ).length /
      digits.length *
      100;


    const under =
      100 - over;


    const overEdge =
      Math.abs(
        over - 50
      );


    const underEdge =
      Math.abs(
        under - 50
      );


    const overScore =
      overEdge -
      Math.abs(
        threshold - 5
      ) * .7;


    const underScore =
      underEdge -
      Math.abs(
        threshold - 5
      ) * .7;


    const candidateOver = {

      side:
        "OVER",

      threshold,

      probability:
        over,

      score:
        overScore

    };


    const candidateUnder = {

      side:
        "UNDER",

      threshold,

      probability:
        under,

      score:
        underScore

    };


    [candidateOver, candidateUnder]
      .forEach(
        candidate => {

          if (
            !best ||
            candidate.score >
              best.score
          ) {

            best =
              candidate;

          }

        }
      );

  }


  return {

    ...best,

    sample:
      digits.length

  };

}


function analyzeMatchDiffer(
  symbol
) {

  const digits =
    getDigits(symbol);


  if (!digits.length) {

    return null;

  }


  const counts =
    getDigitCounts(symbol);


  let target = 0;


  for (
    let digit = 1;
    digit <= 9;
    digit++
  ) {

    if (
      counts[digit] >
      counts[target]
    ) {

      target =
        digit;

    }

  }


  const match =
    counts[target] /
    digits.length *
    100;


  return {

    target,

    match:
      round(match),

    differ:
      round(100 - match),

    sample:
      digits.length

  };

}


function analyzeMomentum(
  symbol
) {

  const market =
    getMarket(symbol);


  const history =
    market.history
      .slice(-30);


  if (
    history.length < 10
  ) {

    return null;

  }


  let rises = 0;

  let falls = 0;


  for (
    let i = 1;
    i < history.length;
    i++
  ) {

    if (
      history[i].quote >
      history[i - 1].quote
    ) {

      rises++;

    } else if (
      history[i].quote <
      history[i - 1].quote
    ) {

      falls++;

    }

  }


  const total =
    rises + falls;


  if (!total) {

    return null;

  }


  const rise =
    rises /
    total *
    100;


  return {

    rise:
      round(rise),

    fall:
      round(100 - rise),

    sample:
      total

  };

}


/* =========================================================
   STREAK
   ========================================================= */

function calculateStreak(
  symbol
) {

  const digits =
    getDigits(
      symbol,
      50
    );


  if (!digits.length) {

    return {

      digit: null,

      length: 0

    };

  }


  const last =
    digits[
      digits.length - 1
    ];


  let length = 1;


  for (
    let i =
      digits.length - 2;
    i >= 0;
    i--
  ) {

    if (
      digits[i] === last
    ) {

      length++;

    } else {

      break;

    }

  }


  return {

    digit:
      last,

    length

  };

}


/* =========================================================
   QUALITY
   ========================================================= */

function getSignalQuality(
  edge,
  sample
) {

  if (
    sample <
    CONFIG.MIN_SAMPLE
  ) {

    return "WAIT";

  }


  if (
    edge >=
    CONFIG.STRONG_EDGE
  ) {

    return "STRONG";

  }


  if (
    edge >=
    CONFIG.WATCH_EDGE
  ) {

    return "WATCH";

  }


  return "WEAK";

}


function confidenceFromProbability(
  probability,
  sample,
  extraPressure = 0
) {

  const edge =
    Math.abs(
      probability - 50
    );


  const sampleFactor =
    clamp(
      sample / 100,
      0,
      1
    );


  const pressureFactor =
    clamp(
      Math.abs(
        extraPressure
      ) / 10,
      0,
      1
    );


  const confidence =
    50 +
    edge * .8 +
    sampleFactor * 8 +
    pressureFactor * 4;


  return round(
    clamp(
      confidence,
      50,
      CONFIG.MAX_CONFIDENCE
    )
  );

}


/* =========================================================
   STRATEGY ENGINE
   ========================================================= */

function analyzeStrategy(
  symbol,
  strategy
) {

  const key =
    String(
      strategy || "AUTO"
    ).toUpperCase();


  const digits =
    getDigits(symbol);


  const sample =
    digits.length;


  if (
    sample < CONFIG.MIN_SAMPLE
  ) {

    return {

      strategy: key,

      label: "WAIT",

      target: "—",

      probability: 0,

      confidence: 0,

      edge: 0,

      quality: "WAIT",

      sample,

      reason:
        `Waiting for at least ${CONFIG.MIN_SAMPLE} ticks.`

    };

  }


  const evenOdd =
    analyzeEvenOdd(symbol);

  const highLow =
    analyzeHighLow(symbol);

  const overUnder =
    analyzeOverUnder(symbol);

  const matchDiffer =
    analyzeMatchDiffer(symbol);

  const momentum =
    analyzeMomentum(symbol);


  let probability = 0;

  let target = "—";

  let label = key;

  let reason = "";


  switch (key) {

    case "EVEN":

      probability =
        evenOdd.even;

      target =
        "EVEN";

      reason =
        `Recent sample shows ${evenOdd.even}% Even digits.`;

      break;


    case "ODD":

      probability =
        evenOdd.odd;

      target =
        "ODD";

      reason =
        `Recent sample shows ${evenOdd.odd}% Odd digits.`;

      break;


    case "HIGH":

      probability =
        highLow.high;

      target =
        "HIGH";

      reason =
        `Digits 5–9 represent ${highLow.high}% of the sample.`;

      break;


    case "LOW":

      probability =
        highLow.low;

      target =
        "LOW";

      reason =
        `Digits 0–4 represent ${highLow.low}% of the sample.`;

      break;


    case "OVER":

      probability =
        overUnder.side === "OVER"
          ? overUnder.probability
          : 100 - overUnder.probability;

      target =
        `OVER ${overUnder.threshold}`;

      reason =
        `Best observed threshold is ${overUnder.threshold}.`;

      break;


    case "UNDER":

      probability =
        overUnder.side === "UNDER"
          ? overUnder.probability
          : 100 - overUnder.probability;

      target =
        `UNDER ${overUnder.threshold}`;

      reason =
        `Best observed threshold is ${overUnder.threshold}.`;

      break;


    case "MATCH":

      probability =
        matchDiffer.match;

      target =
        `DIGIT ${matchDiffer.target}`;

      reason =
        `Digit ${matchDiffer.target} is currently the most frequent digit.`;

      break;


    case "DIFFER":

      probability =
        matchDiffer.differ;

      target =
        `NOT ${matchDiffer.target}`;

      reason =
        `Differ probability is ${matchDiffer.differ}% against the current leading digit.`;

      break;


    case "RISE":

      probability =
        momentum.rise;

      target =
        "RISE";

      reason =
        `Recent quote movement shows ${momentum.rise}% upward moves.`;

      break;


    case "FALL":

      probability =
        momentum.fall;

      target =
        "FALL";

      reason =
        `Recent quote movement shows ${momentum.fall}% downward moves.`;

      break;


    default:

      return analyzeAuto(symbol);

  }


  const pressure =
    getRecentDigitPressure(
      symbol
    );


  const confidence =
    confidenceFromProbability(
      probability,
      sample,
      pressure
    );


  const edge =
    round(
      Math.abs(
        probability - 50
      )
    );


  const quality =
    getSignalQuality(
      edge,
      sample
    );


  return {

    strategy: key,

    label,

    target,

    probability:
      round(probability),

    confidence,

    edge,

    quality,

    sample,

    reason

  };

}


/* =========================================================
   AUTO STRATEGY
   ========================================================= */

function analyzeAuto(
  symbol
) {

  const strategies = [

    "EVEN",
    "ODD",
    "HIGH",
    "LOW",
    "OVER",
    "UNDER",
    "MATCH",
    "DIFFER",
    "RISE",
    "FALL"

  ];


  const results =
    strategies
      .map(
        strategy =>
          analyzeStrategy(
            symbol,
            strategy
          )
      )
      .filter(
        result =>
          result.sample >=
          CONFIG.MIN_SAMPLE
      );


  if (!results.length) {

    return {

      strategy: "AUTO",

      label: "WAIT",

      target: "—",

      probability: 0,

      confidence: 0,

      edge: 0,

      quality: "WAIT",

      sample:
        getDigits(symbol).length,

      reason:
        `Waiting for ${CONFIG.MIN_SAMPLE} ticks.`

    };

  }


  results.sort(
    (a, b) => {

      const scoreA =
        a.edge +
        a.confidence * .12;

      const scoreB =
        b.edge +
        b.confidence * .12;

      return scoreB - scoreA;

    }
  );


  const best =
    results[0];


  return {

    ...best,

    strategy:
      "AUTO",

    reason:
      `AUTO selected ${best.label} using the strongest current statistical edge from ${best.sample} observations.`

  };

}


/* =========================================================
   DERIVED MARKET DATA
   ========================================================= */

function updateMarketDerivedData(
  symbol
) {

  const market =
    getMarket(symbol);


  const digits =
    getDigits(symbol);


  if (!digits.length) {

    return;

  }


  market.digit =
    digits[
      digits.length - 1
    ];

  market.updated =
    Date.now();

}


/* =========================================================
   RENDER SELECTED MARKET
   ========================================================= */

function renderSelectedMarket() {

  const symbol =
    state.selectedSymbol;


  const market =
    getMarket(symbol);


  const definition =
    MARKETS.find(
      item =>
        item.symbol === symbol
    );


  setText(
    "liveSymbol",
    symbol
  );

  setText(
    "selectedSymbol",
    symbol
  );

  setText(
    "selectedMarketName",
    definition?.name ||
      market.name ||
      symbol
  );


  setText(
    "streamQuote",
    market.quote === null
      ? "—"
      : market.quote
  );

  setText(
    "selectedQuote",
    market.quote === null
      ? "—"
      : market.quote
  );


  setText(
    "streamDigit",
    market.digit ?? "—"
  );

  setText(
    "selectedDigit",
    market.digit ?? "—"
  );


  const sample =
    getDigits(symbol).length;


  const analysis =
    analyzeAuto(symbol);


  setText(
    "selectedSample",
    sample
  );

  setText(
    "selectedEdge",
    analysis.quality === "WAIT"
      ? "—"
      : `${analysis.edge}%`
  );

  setText(
    "selectedQuality",
    analysis.quality
  );

}


/* =========================================================
   DIGIT RENDER
   ========================================================= */

function renderDigitDistribution() {

  const symbol =
    state.selectedSymbol;


  const rates =
    getDigitRates(symbol);


  rates.forEach(
    (rate, digit) => {

      setText(
        `digit${digit}`,
        rates.length
          ? `${round(rate, 1)}%`
          : "—"
      );


      const item =
        document.querySelector(
          `#digit${digit}`
        );


      const digitItem =
        item?.closest(
          ".digit-item"
        );


      const bar =
        digitItem?.querySelector(
          ".digit-bar span"
        );


      if (bar) {

        bar.style.width =
          `${clamp(
            rate,
            0,
            100
          )}%`;

      }

    }
  );

}


/* =========================================================
   PROBABILITY RENDER
   ========================================================= */

function renderProbabilities() {

  const symbol =
    state.selectedSymbol;


  const evenOdd =
    analyzeEvenOdd(symbol);

  const highLow =
    analyzeHighLow(symbol);

  const overUnder =
    analyzeOverUnder(symbol);

  const matchDiffer =
    analyzeMatchDiffer(symbol);

  const momentum =
    analyzeMomentum(symbol);


  if (!evenOdd) {

    return;

  }


  setText(
    "evenPercent",
    `${evenOdd.even}%`
  );

  setText(
    "oddPercent",
    `${evenOdd.odd}%`
  );


  setText(
    "highPercent",
    `${highLow.high}%`
  );

  setText(
    "lowPercent",
    `${highLow.low}%`
  );


  if (overUnder) {

    if (
      overUnder.side ===
      "OVER"
    ) {

      setText(
        "overPercent",
        `${round(
          overUnder.probability
        )}%`
      );

      setText(
        "underPercent",
        `${round(
          100 -
          overUnder.probability
        )}%`
      );

    } else {

      setText(
        "underPercent",
        `${round(
          overUnder.probability
        )}%`
      );

      setText(
        "overPercent",
        `${round(
          100 -
          overUnder.probability
        )}%`
      );

    }

  }


  setText(
    "matchPercent",
    `${matchDiffer.match}%`
  );

  setText(
    "differPercent",
    `${matchDiffer.differ}%`
  );


  setText(
    "risePercent",
    momentum
      ? `${momentum.rise}%`
      : "—"
  );

  setText(
    "fallPercent",
    momentum
      ? `${momentum.fall}%`
      : "—"
  );

}


/* =========================================================
   AI RENDER
   ========================================================= */

function renderAI() {

  const result =
    state.selectedStrategy === "AUTO"
      ? analyzeAuto(
          state.selectedSymbol
        )
      : analyzeStrategy(
          state.selectedSymbol,
          state.selectedStrategy
        );


  if (!result) return;


  setText(
    "aiPrediction",
    result.label
  );

  setText(
    "aiConfidence",
    result.confidence
      ? `${result.confidence}%`
      : "—"
  );

  setText(
    "aiTarget",
    result.target
  );

  setText(
    "aiSample",
    result.sample
  );

  setText(
    "aiEdge",
    result.edge
      ? `${result.edge}%`
      : "—"
  );

  setText(
    "aiReason",
    result.reason
  );


  setText(
    "aiResultMain",
    result.label
  );

  setText(
    "aiResultConfidence",
    result.confidence
      ? `${result.confidence}%`
      : "—"
  );

  setText(
    "aiResultStake",
    state.risk.currentStake.toFixed(2)
  );

}


/* =========================================================
   SCANNER
   ========================================================= */

function renderMarketScanner() {

  const container =
    $("marketScannerList");


  if (!container) return;


  const results =
    MARKETS
      .slice(
        0,
        CONFIG.MAX_MARKETS
      )
      .map(
        market => {

          const result =
            analyzeAuto(
              market.symbol
            );

          return {

            market,

            result

          };

        }
      )
      .sort(
        (a, b) =>
          (
            b.result.edge || 0
          ) -
          (
            a.result.edge || 0
          )
      );


  state.scanResults =
    results;


  if (!results.length) {

    return;

  }


  container.innerHTML =
    results.map(
      (item, index) => {

        const market =
          item.market;

        const result =
          item.result;


        const signal =
          result.label ||
          "WAIT";


        const confidence =
          result.confidence
            ? `${result.confidence}%`
            : "—";


        return `

          <div
            class="market-card"
            data-symbol="${market.symbol}"
          >

            <div class="market-card-top">

              <span class="market-symbol">
                ${market.symbol}
              </span>

              <span class="signal-badge">
                ${result.quality}
              </span>

            </div>


            <h3>
              ${market.name}
            </h3>


            <div class="market-card-stats">

              <span>
                Signal: ${signal}
              </span>

              <span>
                Confidence: ${confidence}
              </span>

              <span>
                Sample: ${result.sample}
              </span>

            </div>

          </div>

        `;

      }
    )
    .join("");


  container
    .querySelectorAll(
      ".market-card[data-symbol]"
    )
    .forEach(
      card => {

        card.addEventListener(
          "click",
          () => {

            selectMarket(
              card.dataset.symbol
            );

          }
        );

      }
    );

}


/* =========================================================
   MARKET SELECTION
   ========================================================= */

function selectMarket(
  symbol
) {

  if (!symbol) return;

  state.selectedSymbol =
    symbol;


  getMarket(symbol);


  renderSelectedMarket();

  renderDigitDistribution();

  renderProbabilities();

  renderAI();


  const selected =
    MARKETS.find(
      item =>
        item.symbol === symbol
    );


  if (selected) {

    setText(
      "selectedMarketName",
      selected.name
    );

  }

}


/* =========================================================
   STRATEGY CONTROL
   ========================================================= */

const STRATEGY_META = {

  AUTO: {
    icon: "A",
    name: "AUTO"
  },

  EVEN: {
    icon: "E",
    name: "EVEN"
  },

  ODD: {
    icon: "O",
    name: "ODD"
  },

  HIGH: {
    icon: "H",
    name: "HIGH"
  },

  LOW: {
    icon: "L",
    name: "LOW"
  },

  OVER: {
    icon: ">",
    name: "OVER"
  },

  UNDER: {
    icon: "<",
    name: "UNDER"
  },

  MATCH: {
    icon: "M",
    name: "MATCH"
  },

  DIFFER: {
    icon: "D",
    name: "DIFFER"
  },

  RISE: {
    icon: "↗",
    name: "RISE"
  },

  FALL: {
    icon: "↘",
    name: "FALL"
  }

};


function setupStrategyControls() {

  const card =
    $("strategyControlCard");

  const trigger =
    $("strategyCurrentButton");

  const menu =
    $("strategyMenu");

  if (
    !card ||
    !trigger ||
    !menu
  ) {

    return;

  }


  const icon =
    $("strategyCurrentIcon");

  const name =
    $("strategyCurrentName");


  function updateDisplay(
    strategy
  ) {

    const meta =
      STRATEGY_META[
        strategy
      ] ||
      STRATEGY_META.AUTO;


    if (icon) {

      icon.textContent =
        meta.icon;

    }


    if (name) {

      name.textContent =
        meta.name;

    }

  }


  trigger.addEventListener(
    "click",
    event => {

      event.stopPropagation();

      const open =
        card.classList.toggle(
          "open"
        );


      trigger.setAttribute(
        "aria-expanded",
        String(open)
      );

      menu.setAttribute(
        "aria-hidden",
        String(!open)
      );

    }
  );


  menu
    .querySelectorAll(
      ".strategy-button"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const strategy =
              button.dataset.strategy ||
              "AUTO";


            state.selectedStrategy =
              strategy;


            menu
              .querySelectorAll(
                ".strategy-button"
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


            updateDisplay(
              strategy
            );


            card.classList.remove(
              "open"
            );


            trigger.setAttribute(
              "aria-expanded",
              "false"
            );


            menu.setAttribute(
              "aria-hidden",
              "true"
            );


            renderAI();

          }
        );

      }
  );


  document.addEventListener(
    "click",
    event => {

      if (
        !card.contains(
          event.target
        )
      ) {

        card.classList.remove(
          "open"
        );

        trigger.setAttribute(
          "aria-expanded",
          "false"
        );

        menu.setAttribute(
          "aria-hidden",
          "true"
        );

      }

    }
  );


  updateDisplay(
    "AUTO"
  );

}


/* =========================================================
   RISK ENGINE
   ========================================================= */

function readNumber(
  id,
  fallback
) {

  const element =
    $(id);


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


function syncRiskInputs() {

  let minimum =
    readNumber(
      "minimumStake",
      CONFIG.MIN_STAKE
    );


  let takeProfit =
    readNumber(
      "takeProfit",
      CONFIG.DEFAULT_TAKE_PROFIT
    );


  let stopLoss =
    readNumber(
      "stopLoss",
      CONFIG.DEFAULT_STOP_LOSS
    );


  let martingale =
    readNumber(
      "martingaleMultiplier",
      CONFIG.DEFAULT_MARTINGALE
    );


  minimum =
    Math.max(
      CONFIG.MIN_STAKE,
      minimum
    );


  takeProfit =
    Math.max(
      0,
      takeProfit
    );


  stopLoss =
    Math.max(
      0,
      stopLoss
    );


  martingale =
    Math.max(
      1,
      martingale
    );


  state.risk.minimumStake =
    round(
      minimum,
      2
    );

  state.risk.takeProfit =
    round(
      takeProfit,
      2
    );

  state.risk.stopLoss =
    round(
      stopLoss,
      2
    );

  state.risk.martingale =
    round(
      martingale,
      2
    );


  const minimumInput =
    $("minimumStake");


  if (minimumInput) {

    minimumInput.value =
      state.risk.minimumStake
        .toFixed(2);

  }


  const tpInput =
    $("takeProfit");


  if (tpInput) {

    tpInput.value =
      state.risk.takeProfit
        .toFixed(2);

  }


  const slInput =
    $("stopLoss");


  if (slInput) {

    slInput.value =
      state.risk.stopLoss
        .toFixed(2);

  }


  const mgInput =
    $("martingaleMultiplier");


  if (mgInput) {

    mgInput.value =
      state.risk.martingale
        .toFixed(2);

  }


  state.risk.currentStake =
    clamp(
      state.risk.currentStake,
      state.risk.minimumStake,
      CONFIG.MAX_STAKE
    );


  updateRiskUI();

}


function calculateNextStake() {

  const next =
    state.risk.currentStake *
    state.risk.martingale;


  return round(
    clamp(
      next,
      state.risk.minimumStake,
      CONFIG.MAX_STAKE
    ),
    2
  );

}


function resetRiskEngine(
  message =
    "Risk engine reset. Stake returned to minimum."
) {

  syncRiskInputs();


  state.risk.currentStake =
    state.risk.minimumStake;

  state.risk.sessionProfit =
    0;

  state.risk.lossStreak =
    0;

  state.risk.riskState =
    "READY";


  updateRiskUI(
    message
  );


  renderAI();

}


function simulateWin() {

  syncRiskInputs();


  if (
    state.risk.riskState !==
    "READY"
  ) {

    updateRiskUI(
      "Risk target already reached. Reset risk before continuing."
    );

    return;

  }


  const stake =
    state.risk.currentStake;


  /*
    Paper simulation assumes the stake
    amount is the result credited for
    a winning simulation.

    This is NOT a Deriv payout calculation.
  */


  state.risk.sessionProfit =
    round(
      state.risk.sessionProfit +
      stake,
      2
    );


  state.risk.lossStreak =
    0;


  state.risk.currentStake =
    state.risk.minimumStake;


  if (
    state.risk.takeProfit > 0 &&
    state.risk.sessionProfit >=
      state.risk.takeProfit
  ) {

    state.risk.riskState =
      "TAKE PROFIT";


    updateRiskUI(
      "Take-profit target reached. Risk engine paused."
    );

    return;

  }


  state.risk.riskState =
    "WIN";


  updateRiskUI(
    `Simulated WIN +${stake.toFixed(2)}. Stake reset to ${state.risk.minimumStake.toFixed(2)}.`
  );


  renderAI();

}


function simulateLoss() {

  syncRiskInputs();


  if (
    state.risk.riskState !==
    "READY" &&
    state.risk.riskState !==
    "WIN" &&
    state.risk.riskState !==
    "LOSS"
  ) {

    updateRiskUI(
      "Risk target already reached. Reset risk before continuing."
    );

    return;

  }


  const stake =
    state.risk.currentStake;


  state.risk.sessionProfit =
    round(
      state.risk.sessionProfit -
      stake,
      2
    );


  state.risk.lossStreak++;


  state.risk.currentStake =
    calculateNextStake();


  if (
    state.risk.stopLoss > 0 &&
    Math.abs(
      Math.min(
        state.risk.sessionProfit,
        0
      )
    ) >=
      state.risk.stopLoss
  ) {

    state.risk.riskState =
      "STOP LOSS";


    updateRiskUI(
      "Stop-loss limit reached. Risk engine paused."
    );

    return;

  }


  state.risk.riskState =
    "LOSS";


  updateRiskUI(
    `Simulated LOSS −${stake.toFixed(2)}. Next stake: ${state.risk.currentStake.toFixed(2)}.`
  );


  renderAI();

}


function updateRiskUI(
  message
) {

  setText(
    "currentStake",
    state.risk.currentStake.toFixed(2)
  );


  setText(
    "sessionProfit",
    state.risk.sessionProfit >= 0
      ? `+${state.risk.sessionProfit.toFixed(2)}`
      : state.risk.sessionProfit.toFixed(2)
  );


  setText(
    "lossStreak",
    state.risk.lossStreak
  );


  setText(
    "riskState",
    state.risk.riskState
  );


  if (message) {

    setText(
      "riskMessage",
      message
    );

  }

}


function setupRiskEngine() {

  const inputs = [

    "minimumStake",

    "takeProfit",

    "stopLoss",

    "martingaleMultiplier"

  ];


  inputs.forEach(
    id => {

      const input =
        $(id);

      if (!input) return;


      input.addEventListener(
        "change",
        () => {

          syncRiskInputs();

          setText(
            "riskMessage",
            "Risk settings updated."
          );

        }
      );

    }
  );


  const win =
    $("simulateWin");

  const loss =
    $("simulateLoss");

  const reset =
    $("resetRisk");


  if (win) {

    win.addEventListener(
      "click",
      simulateWin
    );

  }


  if (loss) {

    loss.addEventListener(
      "click",
      simulateLoss
    );

  }


  if (reset) {

    reset.addEventListener(
      "click",
      () =>
        resetRiskEngine()
    );

  }


  syncRiskInputs();

}


/* =========================================================
   AI ENGINE
   ========================================================= */

function startAIEngine() {

  if (
    state.running
  ) {

    return;

  }


  state.running =
    true;


  state.tradeCount++;


  state.lastAction =
    "ANALYZING";


  beginAnalysisPhase();


  updateTradingStatus();

}


function stopAIEngine() {

  state.running =
    false;


  clearTimeout(
    state.aiTimer
  );


  state.aiTimer =
    null;


  state.aiPhase =
    "READY";


  state.aiSeconds =
    CONFIG.ANALYSIS_SECONDS;


  state.lastAction =
    "STOPPED";


  setText(
    "aiCircleStatus",
    "READY"
  );

  setText(
    "aiCountdown",
    CONFIG.ANALYSIS_SECONDS
  );

  setText(
    "aiPredictionResult",
    "ENGINE STOPPED"
  );

  setText(
    "aiResultStatus",
    "AI engine has been stopped."
  );


  updateTradingStatus();

}


function beginAnalysisPhase() {

  if (!state.running) {

    return;

  }


  state.aiPhase =
    "ANALYSIS";


  state.aiSeconds =
    CONFIG.ANALYSIS_SECONDS;


  setText(
    "aiCircleStatus",
    "ANALYZING"
  );


  runAnalysisCountdown();

}


function runAnalysisCountdown() {

  if (!state.running) {

    return;

  }


  setText(
    "aiCountdown",
    state.aiSeconds
  );


  if (
    state.aiSeconds <= 0
  ) {

    finishAnalysisPhase();

    return;

  }


  state.aiSeconds--;


  state.aiTimer =
    setTimeout(
      runAnalysisCountdown,
      1000
    );

}


function finishAnalysisPhase() {

  if (!state.running) {

    return;

  }


  const result =
    state.selectedStrategy ===
    "AUTO"

      ? analyzeAuto(
          state.selectedSymbol
        )

      : analyzeStrategy(
          state.selectedSymbol,
          state.selectedStrategy
        );


  if (
    !result ||
    result.quality ===
      "WAIT"
  ) {

    setText(
      "aiPredictionResult",
      "WAIT"
    );

    setText(
      "aiResultStatus",
      result?.reason ||
        "Not enough data."
    );

    setText(
      "aiResultMain",
      "WAIT"
    );

    setText(
      "aiResultConfidence",
      "—"
    );


    state.lastAction =
      "WAIT — DATA";


    updateTradingStatus();


    state.running =
      false;


    return;

  }


  setText(
    "aiPredictionResult",
    result.label
  );


  setText(
    "aiResultStatus",
    result.reason
  );


  setText(
    "aiResultMain",
    result.target
  );


  setText(
    "aiResultConfidence",
    `${result.confidence}%`
  );


  setText(
    "aiResultStake",
    state.risk.currentStake.toFixed(2)
  );


  beginEntryCountdown(
    result
  );

}


function beginEntryCountdown(
  result
) {

  if (!state.running) {

    return;

  }


  state.aiPhase =
    "ENTRY";


  state.aiSeconds =
    CONFIG.COUNTDOWN_SECONDS;


  setText(
    "aiCircleStatus",
    "ENTRY"
  );


  runEntryCountdown(
    result
  );

}


function runEntryCountdown(
  result
) {

  if (!state.running) {

    return;

  }


  setText(
    "aiCountdown",
    state.aiSeconds
  );


  if (
    state.aiSeconds <= 0
  ) {

    fireTradeNow(
      result
    );

    return;

  }


  state.aiSeconds--;


  state.aiTimer =
    setTimeout(
      () =>
        runEntryCountdown(
          result
        ),
      1000
    );

}


function fireTradeNow(
  result
) {

  if (!state.running) {

    return;

  }


  /*
    ANALYSIS ONLY.

    This function deliberately does NOT
    submit a Deriv contract.
  */


  state.aiPhase =
    "SIGNAL";


  state.lastAction =
    "SIGNAL READY";


  setText(
    "aiCircleStatus",
    "SIGNAL"
  );


  setText(
    "aiCountdown",
    "✓"
  );


  setText(
    "aiPredictionResult",
    `SIGNAL: ${result.label}`
  );


  setText(
    "aiResultStatus",
    `Target ${result.target} • ${result.confidence}% statistical confidence • Stake ${state.risk.currentStake.toFixed(2)}`
  );


  state.running =
    false;


  updateTradingStatus();

}


/* =========================================================
   STATUS
   ========================================================= */

function updateTradingStatus() {

  setText(
    "accountModeStatus",
    "ANALYSIS"
  );


  setText(
    "engineStatus",
    state.running
      ? state.aiPhase
      : "STOPPED"
  );


  setText(
    "lastAction",
    state.lastAction
  );


  setText(
    "tradeCount",
    state.tradeCount
  );


  setText(
    "engineState",
    state.aiPhase
  );

}


/* =========================================================
   CONNECTION UI
   ========================================================= */

function updateConnectionUI(
  status
) {

  setText(
    "connectionStatus",
    status
  );


  const dot =
    document.querySelector(
      ".status-dot"
    );


  if (!dot) return;


  if (
    status === "LIVE"
  ) {

    dot.style.background =
      "var(--green)";

    dot.style.boxShadow =
      "0 0 12px rgba(32,245,154,.6)";

  } else if (
    status === "CONNECTING"
  ) {

    dot.style.background =
      "var(--yellow)";

    dot.style.boxShadow =
      "0 0 12px rgba(250,204,21,.5)";

  } else {

    dot.style.background =
      "var(--red)";

    dot.style.boxShadow =
      "0 0 12px rgba(255,77,103,.5)";

  }

}


/* =========================================================
   ACCOUNT UI
   ========================================================= */

function updateAccountUI(
  mode
) {

  const isReal =
    mode === "REAL";


  document
    .querySelectorAll(
      ".account-card"
    )
    .forEach(
      card =>
        card.classList.remove(
          "active"
        )
    );


  const active =
    isReal
      ? $("accountReal")
      : $("accountDemo");


  if (active) {

    active.classList.add(
      "active"
    );

  }


  setText(
    "accountTypeLabel",
    isReal
      ? "REAL"
      : "DEMO"
  );


  setText(
    "accountMode",
    "ANALYSIS"
  );


  setText(
    "accountModeStatus",
    "ANALYSIS"
  );


  setText(
    "accountStatus",
    "DISPLAY MODE"
  );


  /*
    No authenticated account balance is
    requested here. Public market analysis
    remains independent from account login.
  */

}


function setupAccountControls() {

  const demo =
    $("accountDemo");

  const real =
    $("accountReal");


  if (demo) {

    demo.addEventListener(
      "click",
      () =>
        updateAccountUI(
          "DEMO"
        )
    );

  }


  if (real) {

    real.addEventListener(
      "click",
      () =>
        updateAccountUI(
          "REAL"
        )
    );

  }


  const connect =
    $("connectAccount");


  const disconnect =
    $("disconnectAccount");


  if (connect) {

    connect.addEventListener(
      "click",
      () => {

        setText(
          "accountStatus",
          "ANALYSIS CONNECTION"
        );

        setText(
          "accountMode",
          "ANALYSIS"
        );

      }
    );

  }


  if (disconnect) {

    disconnect.addEventListener(
      "click",
      () => {

        setText(
          "accountStatus",
          "NOT CONNECTED"
        );

        setText(
          "accountId",
          "—"
        );

        setText(
          "accountBalance",
          "—"
        );

        setText(
          "accountCurrency",
          "—"
        );

      }
    );

  }

}


/* =========================================================
   SCAN ALL
   ========================================================= */

function scanAllMarkets() {

  MARKETS
    .slice(
      0,
      CONFIG.MAX_MARKETS
    )
    .forEach(
      market => {

        requestHistory(
          market.symbol
        );

        subscribeTicks(
          market.symbol
        );

      }
    );


  renderMarketScanner();

}


/* =========================================================
   START BUTTONS
   ========================================================= */

function setupAIControls() {

  const start =
    $("startAiEngine");

  const stop =
    $("stopAiEngine");

  const scan =
    $("scanAll");


  if (start) {

    start.addEventListener(
      "click",
      startAIEngine
    );

  }


  if (stop) {

    stop.addEventListener(
      "click",
      stopAIEngine
    );

  }


  if (scan) {

    scan.addEventListener(
      "click",
      scanAllMarkets
    );

  }

}


/* =========================================================
   INITIAL RENDER
   ========================================================= */

function renderAll() {

  renderSelectedMarket();

  renderDigitDistribution();

  renderProbabilities();

  renderAI();

  renderMarketScanner();

  updateTradingStatus();

  updateRiskUI();

}


/* =========================================================
   PERIODIC UI UPDATE
   ========================================================= */

function startUIRefresh() {

  setInterval(
    () => {

      renderSelectedMarket();

      renderDigitDistribution();

      renderProbabilities();

      renderAI();

      renderMarketScanner();

      updateTradingStatus();

      updateRiskUI();

    },
    2500
  );

}


/* =========================================================
   INITIALIZE
   ========================================================= */

function initialize() {

  setupThemeToggle();

  setupStrategyControls();

  setupRiskEngine();

  setupAccountControls();

  setupAIControls();


  updateAccountUI(
    "DEMO"
  );


  selectMarket(
    "R_10"
  );


  renderAll();


  connectWebSocket();


  startUIRefresh();

}


/* =========================================================
   PUBLIC API
   ========================================================= */

window.KRISHWAVE = {

  state,

  analyzeStrategy,

  analyzeAuto,

  selectMarket,

  startAIEngine,

  stopAIEngine,

  scanAllMarkets,

  applyTheme,

  simulateWin,

  simulateLoss,

  resetRiskEngine

};


/* =========================================================
   START
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initialize
  );

} else {

  initialize();

}