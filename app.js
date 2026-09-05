"use strict";

/* =========================================================
   KRISHWAVE V3
   AI MARKET INTELLIGENCE ENGINE
   ========================================================= */

const CONFIG = {
  WS_URL:
    "wss://api.derivws.com/trading/v1/options/ws/public",

  MAX_HISTORY: 200,
  RECENT_WINDOW: 80,
  MIN_SAMPLE: 30,

  RECONNECT_DELAY: 3000,
  WATCHDOG_MS: 15000,

  STRONG_EDGE: 5,
  HIGH_CONFIDENCE: 65
};

/* =========================================================
   VOLATILITY MARKETS
   ========================================================= */

const MARKETS = [
  ["R_10", "Volatility 10 Index"],
  ["R_10_1S", "Volatility 10 (1s) Index"],
  ["R_15_1S", "Volatility 15 (1s) Index"],
  ["R_25", "Volatility 25 Index"],
  ["R_25_1S", "Volatility 25 (1s) Index"],
  ["R_30_1S", "Volatility 30 (1s) Index"],
  ["R_50", "Volatility 50 Index"],
  ["R_50_1S", "Volatility 50 (1s) Index"],
  ["R_75", "Volatility 75 Index"],
  ["R_75_1S", "Volatility 75 (1s) Index"],
  ["R_90_1S", "Volatility 90 (1s) Index"],
  ["R_100", "Volatility 100 Index"],
  ["R_100_1S", "Volatility 100 (1s) Index"]
];

/* =========================================================
   STATE
   ========================================================= */

const state = {
  socket: null,

  connected: false,

  engineRunning: false,

  selectedSymbol: "R_10",

  strategy: "AUTO",

  markets: new Map(),

  requestId: 1,

  requests: new Map(),

  subscriptions: new Map(),

  totalTicks: 0,

  lastTickAt: null,

  reconnectTimer: null,

  intentionalClose: false,

  scannerTimer: null
};

/* =========================================================
   BASIC HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}

function number(value) {
  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nextRequestId() {
  return state.requestId++;
}

function send(payload) {
  if (
    !state.socket ||
    state.socket.readyState !== WebSocket.OPEN
  ) {
    return false;
  }

  try {
    state.socket.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error("KRISHWAVE send error:", error);
    return false;
  }
}

/* =========================================================
   MARKET CREATION
   ========================================================= */

function createMarket(symbol, name) {
  return {
    symbol,
    name,

    available: true,

    quote: null,
    previousQuote: null,

    epoch: null,
    pipSize: null,

    ticks: [],

    digits: Array(10).fill(0),

    lastDigit: null,

    direction: "FLAT",
    directionStreak: 0,

    digitStreak: 0,

    bestStrategy: "WAIT",

    confidence: 0,

    aiScore: 0,

    aiQuality: "LOW",

    lastAnalysis: null,

    lastUpdate: null
  };
}

function initializeMarkets() {
  state.markets.clear();

  MARKETS.forEach(([symbol, name]) => {
    state.markets.set(
      symbol,
      createMarket(symbol, name)
    );
  });
}

/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function setConnectionStatus(status) {
  const pill = $("connectionPill");
  const text = $("connectionText");
  const heroDot = $("heroConnectionDot");
  const heroStatus = $("heroStreamStatus");

  if (status === "LIVE") {
    if (pill) {
      pill.classList.add("live");
      pill.classList.remove("offline");
    }

    if (text) {
      text.textContent = "LIVE";
    }

    if (heroDot) {
      heroDot.classList.add("live");
      heroDot.classList.remove("offline");
    }

    if (heroStatus) {
      heroStatus.textContent = "LIVE DERIV STREAM";
    }

    return;
  }

  if (status === "CONNECTING") {
    if (pill) {
      pill.classList.remove("live");
      pill.classList.add("offline");
    }

    if (text) {
      text.textContent = "CONNECTING";
    }

    if (heroDot) {
      heroDot.classList.remove("live");
      heroDot.classList.add("offline");
    }

    if (heroStatus) {
      heroStatus.textContent = "CONNECTING TO DERIV...";
    }

    return;
  }

  if (pill) {
    pill.classList.remove("live");
    pill.classList.add("offline");
  }

  if (text) {
    text.textContent = "DISCONNECTED";
  }

  if (heroDot) {
    heroDot.classList.remove("live");
    heroDot.classList.add("offline");
  }

  if (heroStatus) {
    heroStatus.textContent = "DERIV STREAM OFFLINE";
  }
}

/* =========================================================
   DERIV CONNECTION
   ========================================================= */

function connect() {
  clearTimeout(state.reconnectTimer);

  state.intentionalClose = false;

  setConnectionStatus("CONNECTING");

  setText(
    "footerStatus",
    "Connecting to live Deriv market data..."
  );

  try {
    state.socket = new WebSocket(CONFIG.WS_URL);

    state.socket.addEventListener(
      "open",
      handleOpen
    );

    state.socket.addEventListener(
      "message",
      handleMessage
    );

    state.socket.addEventListener(
      "error",
      handleError
    );

    state.socket.addEventListener(
      "close",
      handleClose
    );
  } catch (error) {
    console.error(error);

    state.connected = false;

    setConnectionStatus("OFFLINE");

    scheduleReconnect();
  }
}

function handleOpen() {
  state.connected = true;

  state.requests.clear();
  state.subscriptions.clear();

  setConnectionStatus("CONNECTING");

  setText(
    "footerStatus",
    "Connected. Loading historical tick data..."
  );

  requestActiveSymbols();
  requestAllHistory();
  subscribeAll();

  updateAccountUI();
  updateEngineButtons();
}

function handleError(error) {
  console.error(
    "KRISHWAVE WebSocket error:",
    error
  );

  setText(
    "footerStatus",
    "Market stream error. Reconnecting..."
  );
}

function handleClose() {
  state.connected = false;

  state.subscriptions.clear();

  setConnectionStatus("OFFLINE");

  updateAccountUI();
  updateEngineButtons();

  if (!state.intentionalClose) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  clearTimeout(state.reconnectTimer);

  if (state.intentionalClose) {
    return;
  }

  state.reconnectTimer = setTimeout(() => {
    connect();
  }, CONFIG.RECONNECT_DELAY);
}

/* =========================================================
   MESSAGE ROUTER
   ========================================================= */

function handleMessage(event) {
  let data;

  try {
    data = JSON.parse(event.data);
  } catch (error) {
    console.error(
      "Invalid Deriv response:",
      event.data
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

    case "balance":
      handleBalance(data);
      break;

    case "error":
      handleDerivError(data);
      break;

    default:
      break;
  }
}

/* =========================================================
   ACTIVE SYMBOLS
   ========================================================= */

function requestActiveSymbols() {
  const reqId = nextRequestId();

  state.requests.set(reqId, {
    type: "active_symbols"
  });

  send({
    active_symbols: "brief",
    product_type: "basic",
    req_id: reqId
  });
}

function handleActiveSymbols(data) {
  if (!Array.isArray(data.active_symbols)) {
    return;
  }

  data.active_symbols.forEach((item) => {
    const symbol = item.underlying_symbol;

    const market = state.markets.get(symbol);

    if (!market) {
      return;
    }

    market.available = true;

    if (item.pip_size !== undefined) {
      const pip = number(item.pip_size);

      if (pip !== null) {
        market.pipSize = pip;
      }
    }
  });

  renderMarketList();
}

/* =========================================================
   HISTORY
   ========================================================= */

function requestHistory(symbol) {
  const reqId = nextRequestId();

  state.requests.set(reqId, {
    type: "history",
    symbol
  });

  send({
    ticks_history: symbol,
    count: CONFIG.MAX_HISTORY,
    end: "latest",
    style: "ticks",
    adjust_start_time: 1,
    req_id: reqId
  });
}

function requestAllHistory() {
  MARKETS.forEach(([symbol]) => {
    requestHistory(symbol);
  });
}

function handleHistory(data) {
  const reqId = number(data.req_id);

  if (reqId === null) {
    return;
  }

  const request = state.requests.get(reqId);

  if (!request) {
    return;
  }

  state.requests.delete(reqId);

  if (request.type !== "history") {
    return;
  }

  processHistory(
    data,
    request.symbol
  );
}

function processHistory(data, symbol) {
  const market = state.markets.get(symbol);

  if (!market) {
    return;
  }

  const prices =
    data.history &&
    Array.isArray(data.history.prices)
      ? data.history.prices
      : [];

  const times =
    data.history &&
    Array.isArray(data.history.times)
      ? data.history.times
      : [];

  if (!prices.length) {
    return;
  }

  market.ticks = [];
  market.digits = Array(10).fill(0);

  market.quote = null;
  market.previousQuote = null;

  market.direction = "FLAT";
  market.directionStreak = 0;
  market.digitStreak = 0;

  prices.forEach((price, index) => {
    const quote = number(price);

    if (quote === null) {
      return;
    }

    const epoch = number(times[index]);

    addTick(
      market,
      quote,
      epoch,
      market.pipSize
    );
  });

  updateMarketUI(market);

  renderMarketList();

  updateGlobalStats();
}

/* =========================================================
   LIVE SUBSCRIPTIONS
   ========================================================= */

function subscribe(symbol) {
  if (!state.connected) {
    return;
  }

  if (state.subscriptions.has(symbol)) {
    return;
  }

  const reqId = nextRequestId();

  state.requests.set(reqId, {
    type: "subscription",
    symbol
  });

  const success = send({
    ticks: symbol,
    subscribe: 1,
    req_id: reqId
  });

  if (!success) {
    state.requests.delete(reqId);
  }
}

function subscribeAll() {
  MARKETS.forEach(([symbol]) => {
    subscribe(symbol);
  });
}

/* =========================================================
   TICK HANDLER
   ========================================================= */

function handleTick(data) {
  const tick = data.tick;

  if (!tick) {
    return;
  }

  const symbol = tick.symbol;

  if (!symbol) {
    return;
  }

  const market = state.markets.get(symbol);

  if (!market) {
    return;
  }

  if (
    data.subscription &&
    data.subscription.id
  ) {
    state.subscriptions.set(
      symbol,
      data.subscription.id
    );
  }

  const quote = number(tick.quote);

  const epoch = number(tick.epoch);

  if (quote === null) {
    return;
  }

  if (tick.pip_size !== undefined) {
    const pip = number(tick.pip_size);

    if (pip !== null) {
      market.pipSize = pip;
    }
  }

  addTick(
    market,
    quote,
    epoch,
    market.pipSize
  );

  market.lastUpdate = Date.now();

  state.totalTicks += 1;

  state.lastTickAt = Date.now();

  setConnectionStatus("LIVE");

  updateGlobalStats();

  updateMarketUI(market);

  renderMarketList();

  if (
    state.engineRunning &&
    symbol === state.selectedSymbol
  ) {
    updateAI(market);
  }
}

/* =========================================================
   ADD TICK
   ========================================================= */

function addTick(
  market,
  quote,
  epoch,
  pipSize
) {
  market.previousQuote =
    market.quote;

  market.quote = quote;

  market.epoch =
    epoch !== null
      ? epoch
      : Math.floor(Date.now() / 1000);

  const digit =
    getLastDigit(
      quote,
      pipSize
    );

  market.lastDigit = digit;

  market.ticks.push({
    quote,
    epoch: market.epoch,
    digit
  });

  if (
    market.ticks.length >
    CONFIG.MAX_HISTORY
  ) {
    market.ticks.shift();
  }

  rebuildDigitCounts(market);

  updateDirection(market);

  updateDigitStreak(market);
}

/* =========================================================
   DIGIT ENGINE
   ========================================================= */

function getLastDigit(
  quote,
  pipSize
) {
  let decimals = 0;

  if (
    pipSize !== null &&
    pipSize !== undefined
  ) {
    const text = String(pipSize);

    if (text.includes(".")) {
      decimals =
        text.split(".")[1].length;
    }
  }

  if (decimals === 0) {
    const text = String(quote);

    if (text.includes(".")) {
      decimals =
        text.split(".")[1].length;
    }
  }

  const multiplier =
    Math.pow(10, decimals);

  const scaled =
    Math.round(
      quote * multiplier
    );

  return Math.abs(scaled) % 10;
}

function rebuildDigitCounts(market) {
  market.digits =
    Array(10).fill(0);

  market.ticks.forEach((tick) => {
    if (
      Number.isInteger(tick.digit) &&
      tick.digit >= 0 &&
      tick.digit <= 9
    ) {
      market.digits[tick.digit]++;
    }
  });
}

/* =========================================================
   DIRECTION ENGINE
   ========================================================= */

function updateDirection(market) {
  if (
    market.previousQuote === null ||
    market.quote === null
  ) {
    market.direction = "FLAT";
    market.directionStreak = 0;

    return;
  }

  if (
    market.quote >
    market.previousQuote
  ) {
    if (market.direction === "RISE") {
      market.directionStreak++;
    } else {
      market.direction = "RISE";
      market.directionStreak = 1;
    }

    return;
  }

  if (
    market.quote <
    market.previousQuote
  ) {
    if (market.direction === "FALL") {
      market.directionStreak++;
    } else {
      market.direction = "FALL";
      market.directionStreak = 1;
    }

    return;
  }

  market.direction = "FLAT";
  market.directionStreak = 0;
}

/* =========================================================
   DIGIT STREAK
   ========================================================= */

function updateDigitStreak(market) {
  const ticks = market.ticks;

  if (!ticks.length) {
    market.digitStreak = 0;

    return;
  }

  const lastDigit =
    ticks[ticks.length - 1].digit;

  let streak = 0;

  for (
    let i = ticks.length - 1;
    i >= 0;
    i--
  ) {
    if (
      ticks[i].digit ===
      lastDigit
    ) {
      streak++;
    } else {
      break;
    }
  }

  market.digitStreak = streak;
}

/* =========================================================
   AI CORE — RECENT WEIGHT
   ========================================================= */

function weightedProbability(
  ticks,
  predicate
) {
  if (!ticks.length) {
    return 0;
  }

  const recent =
    ticks.slice(
      -CONFIG.RECENT_WINDOW
    );

  let totalWeight = 0;
  let matchingWeight = 0;

  recent.forEach((tick, index) => {
    const weight = index + 1;

    totalWeight += weight;

    if (predicate(tick)) {
      matchingWeight += weight;
    }
  });

  if (!totalWeight) {
    return 0;
  }

  return (
    matchingWeight /
    totalWeight
  ) * 100;
}

/* =========================================================
   AI CORE — RECENT DIGIT PRESSURE
   ========================================================= */

function digitPressure(
  ticks
) {
  const recent =
    ticks.slice(
      -CONFIG.RECENT_WINDOW
    );

  const counts =
    Array(10).fill(0);

  recent.forEach((tick) => {
    if (
      Number.isInteger(tick.digit)
    ) {
      counts[tick.digit]++;
    }
  });

  let strongestDigit = 0;

  for (
    let i = 1;
    i < 10;
    i++
  ) {
    if (
      counts[i] >
      counts[strongestDigit]
    ) {
      strongestDigit = i;
    }
  }

  const total =
    recent.length;

  const rate =
    total
      ? (
          counts[strongestDigit] /
          total
        ) * 100
      : 0;

  return {
    digit: strongestDigit,
    rate
  };
}

/* =========================================================
   AI CORE — MOMENTUM
   ========================================================= */

function momentum(ticks) {
  if (ticks.length < 10) {
    return {
      rise: 50,
      fall: 50,
      strength: 0
    };
  }

  const recent =
    ticks.slice(
      -CONFIG.RECENT_WINDOW
    );

  let rises = 0;
  let falls = 0;

  for (
    let i = 1;
    i < recent.length;
    i++
  ) {
    if (
      recent[i].quote >
      recent[i - 1].quote
    ) {
      rises++;
    } else if (
      recent[i].quote <
      recent[i - 1].quote
    ) {
      falls++;
    }
  }

  const total =
    rises + falls;

  if (!total) {
    return {
      rise: 50,
      fall: 50,
      strength: 0
    };
  }

  const rise =
    (rises / total) * 100;

  const fall =
    (falls / total) * 100;

  return {
    rise,
    fall,
    strength:
      Math.abs(rise - fall)
  };
}

/* =========================================================
   AI CORE — VOLATILITY / DIVERSITY
   ========================================================= */

function digitDiversity(market) {
  const total =
    market.ticks.length;

  if (!total) {
    return 0;
  }

  let activeDigits = 0;

  market.digits.forEach((count) => {
    if (count > 0) {
      activeDigits++;
    }
  });

  return (
    activeDigits / 10
  ) * 100;
}

/* =========================================================
   AI CORE — STREAK FACTOR
   ========================================================= */

function streakFactor(market) {
  const digitStreak =
    market.digitStreak;

  const directionStreak =
    market.directionStreak;

  return Math.min(
    100,
    (
      digitStreak * 12 +
      directionStreak * 8
    )
  );
}

/* =========================================================
   AI CORE — FULL ANALYSIS
   ========================================================= */

function calculateAI(market) {
  const ticks =
    market.ticks;

  const total =
    ticks.length;

  if (
    total <
    CONFIG.MIN_SAMPLE
  ) {
    return {
      signal: "WAIT",
      strategy: "WAIT",
      confidence: 0,
      score: 0,

      reason:
        `AI collecting data: ${total}/${CONFIG.MIN_SAMPLE} ticks.`,

      dominantDigit: null,
      dominantDigitRate: 0,

      evenPercent: 0,
      oddPercent: 0,

      overPercent: 0,
      underPercent: 0,

      matchPercent: 0,
      differPercent: 0,

      risePercent: 0,
      fallPercent: 0,

      streak: 0,
      quality: "LOW"
    };
  }

  const evenPercent =
    (
      ticks.filter(
        (tick) =>
          tick.digit % 2 === 0
      ).length /
      total
    ) * 100;

  const oddPercent =
    100 -
    evenPercent;

  const overPercent =
    (
      ticks.filter(
        (tick) =>
          tick.digit >= 5
      ).length /
      total
    ) * 100;

  const underPercent =
    100 -
    overPercent;

  const weightedEven =
    weightedProbability(
      ticks,
      (tick) =>
        tick.digit % 2 === 0
    );

  const weightedOdd =
    100 -
    weightedEven;

  const weightedOver =
    weightedProbability(
      ticks,
      (tick) =>
        tick.digit >= 5
    );

  const weightedUnder =
    100 -
    weightedOver;

  const recentDigit =
    digitPressure(ticks);

  const dominantDigit =
    recentDigit.digit;

  const dominantDigitRate =
    recentDigit.rate;

  const matchPercent =
    dominantDigitRate;

  const differPercent =
    100 -
    matchPercent;

  const move =
    momentum(ticks);

  const risePercent =
    move.rise;

  const fallPercent =
    move.fall;

  const recentRise =
    weightedProbability(
      ticks.slice(
        1
      ),
      (tick, index, arr) => {
        const previous =
          ticks[
            Math.max(
              0,
              ticks.indexOf(tick) - 1
            )
          ];

        return (
          previous &&
          tick.quote >
            previous.quote
        );
      }
    );

  const recentFall =
    100 -
    recentRise;

  const candidates = [
    {
      strategy: "EVEN",
      probability:
        weightedEven,
      baseline: 50
    },

    {
      strategy: "ODD",
      probability:
        weightedOdd,
      baseline: 50
    },

    {
      strategy: "OVER",
      probability:
        weightedOver,
      baseline: 50
    },

    {
      strategy: "UNDER",
      probability:
        weightedUnder,
      baseline: 50
    },

    {
      strategy: "MATCH",
      probability:
        matchPercent,
      baseline: 10
    },

    {
      strategy: "DIFFER",
      probability:
        differPercent,
      baseline: 90
    },

    {
      strategy: "RISE",
      probability:
        risePercent,
      baseline: 50
    },

    {
      strategy: "FALL",
      probability:
        fallPercent,
      baseline: 50
    }
  ];

  candidates.forEach(
    (candidate) => {
      candidate.edge =
        candidate.probability -
        candidate.baseline;

      candidate.absEdge =
        Math.abs(
          candidate.edge
        );
    }
  );

  /*
     AI should prefer a positive
     statistical edge.

     Example:
     EVEN = 47%
     ODD  = 53%

     The AI prefers ODD,
     not EVEN.
  */

  candidates.sort(
    (a, b) => {
      if (
        b.edge !==
        a.edge
      ) {
        return (
          b.edge -
          a.edge
        );
      }

      return (
        b.absEdge -
        a.absEdge
      );
    }
  );

  let selected =
    candidates[0];

  /*
     Manual strategy mode.
  */

  if (
    state.strategy !== "AUTO"
  ) {
    const manual =
      candidates.find(
        (candidate) =>
          candidate.strategy ===
          state.strategy
      );

    if (manual) {
      selected = manual;
    }
  }

  const sampleFactor =
    Math.min(
      1,
      total / CONFIG.MAX_HISTORY
    );

  const edgeStrength =
    Math.max(
      0,
      selected.edge
    );

  let confidence =
    50 +
    (
      edgeStrength *
      2.2
    );

  confidence =
    50 +
    (
      confidence -
      50
    ) *
      sampleFactor;

  /*
     Add a small consistency
     bonus when recent and
     full-window information
     agree.
  */

  let consistencyBonus = 0;

  if (
    selected.strategy === "EVEN" &&
    weightedEven >
      evenPercent
  ) {
    consistencyBonus += 2;
  }

  if (
    selected.strategy === "ODD" &&
    weightedOdd >
      oddPercent
  ) {
    consistencyBonus += 2;
  }

  if (
    selected.strategy === "OVER" &&
    weightedOver >
      overPercent
  ) {
    consistencyBonus += 2;
  }

  if (
    selected.strategy === "UNDER" &&
    weightedUnder >
      underPercent
  ) {
    consistencyBonus += 2;
  }

  if (
    selected.strategy === "RISE" &&
    risePercent >
      50
  ) {
    consistencyBonus += 2;
  }

  if (
    selected.strategy === "FALL" &&
    fallPercent >
      50
  ) {
    consistencyBonus += 2;
  }

  confidence +=
    consistencyBonus;

  confidence =
    Math.max(
      50,
      Math.min(
        95,
        confidence
      )
    );

  /*
     AI quality.
  */

  let quality =
    "LOW";

  if (
    total >= 100 &&
    confidence >= 70
  ) {
    quality = "HIGH";
  } else if (
    total >= 60 &&
    confidence >= 60
  ) {
    quality = "MEDIUM";
  }

  /*
     Strong signal requirement.
  */

  const strong =
    selected.edge >=
      CONFIG.STRONG_EDGE &&
    confidence >=
      CONFIG.HIGH_CONFIDENCE;

  const signal =
    strong
      ? selected.strategy
      : "NEUTRAL";

  const strategy =
    strong
      ? selected.strategy
      : "WAIT";

  /*
     AI score.

     This combines edge,
     confidence and sample
     quality.
  */

  const score =
    strong
      ? (
          selected.edge *
          confidence *
          sampleFactor
        )
      : 0;

  let reason;

  if (!strong) {
    reason =
      "AI found market movement, but the statistical evidence is not strong enough yet.";
  } else {
    reason =
      buildAIReason(
        market,
        selected,
        confidence,
        dominantDigit,
        dominantDigitRate,
        move,
        quality
      );
  }

  return {
    signal,

    strategy,

    confidence:
      Math.round(confidence),

    score,

    reason,

    dominantDigit,

    dominantDigitRate,

    evenPercent:
      weightedEven,

    oddPercent:
      weightedOdd,

    overPercent:
      weightedOver,

    underPercent:
      weightedUnder,

    matchPercent,

    differPercent,

    risePercent,

    fallPercent,

    streak:
      Math.max(
        market.digitStreak,
        market.directionStreak
      ),

    quality
  };
}

/* =========================================================
   AI EXPLANATION ENGINE
   ========================================================= */

function buildAIReason(
  market,
  selected,
  confidence,
  dominantDigit,
  dominantDigitRate,
  move,
  quality
) {
  const parts = [];

  parts.push(
    `${selected.strategy} shows a ${selected.edge.toFixed(1)} percentage-point edge`
  );

  if (
    dominantDigit !== null
  ) {
    parts.push(
      `digit ${dominantDigit} is currently dominant at ${dominantDigitRate.toFixed(1)}%`
    );
  }

  if (
    selected.strategy === "RISE" &&
    move.rise > 50
  ) {
    parts.push(
      `recent momentum favors RISE at ${move.rise.toFixed(1)}%`
    );
  }

  if (
    selected.strategy === "FALL" &&
    move.fall > 50
  ) {
    parts.push(
      `recent momentum favors FALL at ${move.fall.toFixed(1)}%`
    );
  }

  parts.push(
    `${market.ticks.length} ticks analyzed`
  );

  parts.push(
    `${quality} data quality`
  );

  parts.push(
    `AI confidence ${Math.round(confidence)}%`
  );

  return (
    parts.join(". ") +
    "."
  );
}

/* =========================================================
   UPDATE AI
   ========================================================= */

function updateAI(market) {
  const analysis =
    calculateAI(market);

  market.lastAnalysis =
    analysis;

  market.bestStrategy =
    analysis.strategy;

  market.confidence =
    analysis.confidence;

  market.aiScore =
    analysis.score;

  market.aiQuality =
    analysis.quality;

  setText(
    "engineStatus",
    state.engineRunning
      ? analysis.signal
      : "STOPPED"
  );

  setText(
    "analysisSignal",
    state.engineRunning
      ? analysis.signal
      : "WAIT"
  );

  setText(
    "analysisReason",
    state.engineRunning
      ? analysis.reason
      : "Press START ENGINE to activate the KRISHWAVE AI Core."
  );

  setText(
    "analysisStrategy",
    state.engineRunning
      ? analysis.strategy
      : "AUTO"
  );

  setText(
    "analysisConfidence",
    state.engineRunning
      ? `${analysis.confidence}%`
      : "0%"
  );

  setText(
    "dominantDigit",
    analysis.dominantDigit !== null
      ? analysis.dominantDigit
      : "—"
  );

  setText(
    "dominantDigitRate",
    `${analysis.dominantDigitRate.toFixed(1)}%`
  );

  setText(
    "evenPercent",
    `${analysis.evenPercent.toFixed(1)}%`
  );

  setText(
    "oddPercent",
    `${analysis.oddPercent.toFixed(1)}%`
  );

  setText(
    "overPercent",
    `${analysis.overPercent.toFixed(1)}%`
  );

  setText(
    "underPercent",
    `${analysis.underPercent.toFixed(1)}%`
  );

  setText(
    "matchPercent",
    `${analysis.matchPercent.toFixed(1)}%`
  );

  setText(
    "differPercent",
    `${analysis.differPercent.toFixed(1)}%`
  );

  setText(
    "risePercent",
    `${analysis.risePercent.toFixed(1)}%`
  );

  setText(
    "fallPercent",
    `${analysis.fallPercent.toFixed(1)}%`
  );
}

/* =========================================================
   MARKET UI
   ========================================================= */

function updateMarketUI(market) {
  if (
    market.symbol !==
    state.selectedSymbol
  ) {
    return;
  }

  setText(
    "selectedMarketName",
    market.name
  );

  setText(
    "selectedMarketCodeLarge",
    market.symbol
  );

  setText(
    "liveQuote",
    market.quote !== null
      ? formatQuote(
          market.quote
        )
      : "—"
  );

  if (
    market.epoch !== null
  ) {
    setText(
      "quoteTime",
      new Date(
        market.epoch * 1000
      ).toLocaleTimeString()
    );
  }

  setText(
    "lastDigit",
    market.lastDigit !== null
      ? market.lastDigit
      : "—"
  );

  setText(
    "sampleSize",
    market.ticks.length
  );

  setText(
    "streakValue",
    market.direction !== "FLAT"
      ? `${market.direction} ${market.directionStreak}`
      : "FLAT"
  );

  updateDigitStats(market);

  if (
    state.engineRunning
  ) {
    updateAI(market);
  }
}

function formatQuote(quote) {
  return Number(
    quote
  ).toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    }
  );
}

/* =========================================================
   DIGIT DISPLAY
   ========================================================= */

function updateDigitStats(market) {
  const total =
    market.ticks.length;

  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {
    const count =
      market.digits[digit] || 0;

    const percent =
      total
        ? (
            count /
            total
          ) * 100
        : 0;

    const row =
      document.querySelector(
        `[data-digit="${digit}"]`
      );

    if (row) {
      const strong =
        row.querySelector(
          "strong"
        );

      if (strong) {
        strong.textContent =
          `${percent.toFixed(1)}%`;
      }
    }

    const fill =
      document.querySelector(
        `[data-fill-digit="${digit}"]`
      );

    if (fill) {
      fill.style.width =
        `${Math.min(
          100,
          percent
        )}%`;
    }
  }
}

/* =========================================================
   MARKET SCANNER
   ========================================================= */

function scanAllMarkets() {
  const results = [];

  state.markets.forEach(
    (market) => {
      if (
        market.ticks.length <
        CONFIG.MIN_SAMPLE
      ) {
        return;
      }

      const analysis =
        calculateAI(market);

      market.lastAnalysis =
        analysis;

      market.confidence =
        analysis.confidence;

      market.aiScore =
        analysis.score;

      market.bestStrategy =
        analysis.strategy;

      if (
        analysis.score > 0
      ) {
        results.push({
          market,
          analysis,
          score:
            analysis.score
        });
      }
    }
  );

  results.sort(
    (a, b) =>
      b.score -
      a.score
  );

  if (!results.length) {
    setText(
      "engineState",
      state.engineRunning
        ? "WAITING"
        : "STOPPED"
    );

    setText(
      "engineStateDetail",
      state.engineRunning
        ? "AI is waiting for a stronger market setup."
        : "Engine ready — press Start"
    );

    return;
  }

  const best =
    results[0];

  /*
     AUTO mode allows the AI
     to move to the strongest
     qualifying market.
  */

  if (
    state.strategy ===
    "AUTO"
  ) {
    if (
      best.market.symbol !==
      state.selectedSymbol
    ) {
      selectMarket(
        best.market.symbol
      );
    }
  }

  setText(
    "engineState",
    state.engineRunning
      ? "SCANNING"
      : "STOPPED"
  );

  setText(
    "engineStateDetail",
    state.engineRunning
      ? `AI scanning ${state.markets.size} Volatility markets`
      : "Engine ready — press Start"
  );

  setText(
    "footerStatus",
    state.engineRunning
      ? `AI best setup: ${best.market.symbol} → ${best.analysis.signal} ${best.analysis.confidence}%`
      : "Live market data connected. AI engine stopped."
  );
}

/* =========================================================
   SELECT MARKET
   ========================================================= */

function selectMarket(symbol) {
  const market =
    state.markets.get(symbol);

  if (!market) {
    return;
  }

  state.selectedSymbol =
    symbol;

  updateMarketUI(market);

  if (
    state.engineRunning
  ) {
    updateAI(market);
  }

  renderMarketList();

  updateGlobalStats();
}

/* =========================================================
   MARKET LIST
   ========================================================= */

function renderMarketList() {
  const container =
    $("marketList");

  if (!container) {
    return;
  }

  const markets =
    Array.from(
      state.markets.values()
    );

  markets.forEach(
    (market) => {
      if (
        market.ticks.length >=
        CONFIG.MIN_SAMPLE
      ) {
        const analysis =
          calculateAI(market);

        market.aiScore =
          analysis.score;

        market.confidence =
          analysis.confidence;
      } else {
        market.aiScore = 0;
        market.confidence = 0;
      }
    }
  );

  markets.sort(
    (a, b) => {
      if (
        a.symbol ===
        state.selectedSymbol
      ) {
        return -1;
      }

      if (
        b.symbol ===
        state.selectedSymbol
      ) {
        return 1;
      }

      return (
        b.aiScore -
        a.aiScore
      );
    }
  );

  container.innerHTML = "";

  markets.forEach(
    (market) => {
      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        "market-item";

      if (
        market.symbol ===
        state.selectedSymbol
      ) {
        button.classList.add(
          "active"
        );
      }

      const sample =
        market.ticks.length;

      const analysis =
        sample >=
        CONFIG.MIN_SAMPLE
          ? calculateAI(market)
          : null;

      const signal =
        analysis
          ? analysis.signal
          : "WAIT";

      const confidence =
        analysis
          ? analysis.confidence
          : 0;

      button.innerHTML = `
        <div class="market-item-main">
          <strong>
            ${escapeHTML(
              market.name
            )}
          </strong>

          <span>
            ${escapeHTML(
              market.symbol
            )}
          </span>
        </div>

        <div class="market-item-meta">
          <span>
            ${sample} ticks
          </span>

          <span>
            ${
              confidence
                ? `${confidence}%`
                : "—"
            }
          </span>

          <span>
            ${signal}
          </span>
        </div>
      `;

      button.addEventListener(
        "click",
        () => {
          selectMarket(
            market.symbol
          );
        }
      );

      container.appendChild(
        button
      );
    }
  );
}

/* =========================================================
   GLOBAL STATS
   ========================================================= */

function updateGlobalStats() {
  let connectedMarkets = 0;

  state.markets.forEach(
    (market) => {
      if (
        market.ticks.length >
        0
      ) {
        connectedMarkets++;
      }
    }
  );

  setText(
    "connectedMarkets",
    connectedMarkets
  );

  setText(
    "liveTicks",
    state.totalTicks
  );

  const market =
    state.markets.get(
      state.selectedSymbol
    );

  if (market) {
    setText(
      "selectedMarketShort",
      market.name
    );

    setText(
      "selectedMarketCode",
      market.symbol
    );
  }

  setText(
    "engineState",
    state.engineRunning
      ? "RUNNING"
      : "STOPPED"
  );

  setText(
    "engineStateDetail",
    state.engineRunning
      ? "KRISHWAVE AI Core active"
      : "Engine ready — press Start"
  );

  setText(
    "tradingEngineStatus",
    state.engineRunning
      ? "RUNNING"
      : "STOPPED"
  );

  /*
     Trading remains disabled.
  */

  setText(
    "tradeCount",
    "0"
  );

  setText(
    "lastTradeAction",
    "ANALYSIS ONLY"
  );
}

/* =========================================================
   STRATEGY BUTTONS
   ========================================================= */

function setupStrategies() {
  const buttons =
    document.querySelectorAll(
      "[data-strategy]"
    );

  buttons.forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          state.strategy =
            button.dataset.strategy;

          buttons.forEach(
            (item) => {
              item.classList.remove(
                "active"
              );
            }
          );

          button.classList.add(
            "active"
          );

          const market =
            state.markets.get(
              state.selectedSymbol
            );

          if (market) {
            updateAI(market);
          }

          renderMarketList();
        }
      );
    }
  );
}

/* =========================================================
   ENGINE BUTTONS
   ========================================================= */

function updateEngineButtons() {
  const start =
    $("start");

  const stop =
    $("stop");

  if (start) {
    start.disabled =
      !state.connected ||
      state.engineRunning;
  }

  if (stop) {
    stop.disabled =
      !state.engineRunning;
  }
}

/* =========================================================
   START ENGINE
   ========================================================= */

function startEngine() {
  if (!state.connected) {
    setText(
      "footerStatus",
      "Waiting for live Deriv market data..."
    );

    connect();

    return;
  }

  state.engineRunning =
    true;

  setText(
    "engineState",
    "RUNNING"
  );

  setText(
    "engineStateDetail",
    "KRISHWAVE AI Core active"
  );

  setText(
    "tradingEngineStatus",
    "RUNNING"
  );

  setText(
    "lastTradeAction",
    "ANALYSIS ONLY"
  );

  setText(
    "engineStatus",
    "SCANNING"
  );

  setText(
    "engineControlDescription",
    "AI engine is scanning live markets."
  );

  const market =
    state.markets.get(
      state.selectedSymbol
    );

  if (market) {
    updateAI(market);
  }

  updateEngineButtons();

  scanAllMarkets();

  setText(
    "footerStatus",
    "KRISHWAVE AI Core started."
  );
}

/* =========================================================
   STOP ENGINE
   ========================================================= */

function stopEngine() {
  state.engineRunning =
    false;

  setText(
    "engineState",
    "STOPPED"
  );

  setText(
    "engineStateDetail",
    "Monitoring paused"
  );

  setText(
    "engineStatus",
    "STOPPED"
  );

  setText(
    "analysisSignal",
    "WAIT"
  );

  setText(
    "analysisReason",
    "AI engine stopped. Live market data remains available."
  );

  setText(
    "analysisStrategy",
    "AUTO"
  );

  setText(
    "analysisConfidence",
    "0%"
  );

  setText(
    "tradingEngineStatus",
    "STOPPED"
  );

  setText(
    "lastTradeAction",
    "ENGINE STOPPED"
  );

  setText(
    "engineControlDescription",
    "Press START ENGINE to activate KRISHWAVE AI."
  );

  setText(
    "footerStatus",
    "AI engine stopped. Live market stream remains connected."
  );

  updateEngineButtons();
}

/* =========================================================
   ACCOUNT UI
   ========================================================= */

function updateAccountUI() {
  if (state.connected) {
    setText(
      "accountStatus",
      "MARKET DATA LIVE"
    );

    setText(
      "accountLoginStatus",
      "PUBLIC STREAM"
    );
  } else {
    setText(
      "accountStatus",
      "NOT CONNECTED"
    );

    setText(
      "accountLoginStatus",
      "OFFLINE"
    );
  }

  /*
     Public market data is NOT
     account authentication.

     Do not display fake balance.
  */

  setText(
    "accountBalance",
    "---"
  );

  setText(
    "accountCurrency",
    "---"
  );
}

/* =========================================================
   BALANCE
   ========================================================= */

function handleBalance(data) {
  /*
     Reserved for authenticated
     Demo/Real account connection.

     Current public market stream
     does not expose account balance.
  */

  if (!data.balance) {
    return;
  }

  if (
    data.balance.balance !==
    undefined
  ) {
    setText(
      "accountBalance",
      data.balance.balance
    );
  }

  if (
    data.balance.currency
  ) {
    setText(
      "accountCurrency",
      data.balance.currency
    );
  }
}

/* =========================================================
   DERIV ERROR
   ========================================================= */

function handleDerivError(data) {
  console.error(
    "Deriv API error:",
    data.error
  );

  const message =
    data.error &&
    data.error.message
      ? data.error.message
      : "Deriv API error.";

  setText(
    "footerStatus",
    `Deriv: ${message}`
  );
}

/* =========================================================
   ACCOUNT BUTTONS
   ========================================================= */

function setupAccountButtons() {
  const connectButton =
    $("connectDeriv");

  const disconnectButton =
    $("disconnectDeriv");

  if (connectButton) {
    connectButton.addEventListener(
      "click",
      () => {
        /*
           This is deliberately honest:
           public market data is already
           connected, but account
           authentication is not yet
           implemented.
        */

        if (state.connected) {
          setText(
            "accountStatus",
            "PUBLIC DATA ONLY"
          );

          setText(
            "accountLoginStatus",
            "AUTH NOT CONFIGURED"
          );

          setText(
            "footerStatus",
            "Live market data is connected. Account authentication is the next security layer."
          );
        } else {
          connect();
        }
      }
    );
  }

  if (disconnectButton) {
    disconnectButton.addEventListener(
      "click",
      () => {
        setText(
          "accountStatus",
          "NOT CONNECTED"
        );

        setText(
          "accountLoginStatus",
          "NOT AUTHENTICATED"
        );

        setText(
          "accountBalance",
          "---"
        );

        setText(
          "accountCurrency",
          "---"
        );

        setText(
          "footerStatus",
          "Account authentication state cleared. Market data remains available."
        );
      }
    );
  }
}

/* =========================================================
   CONTROLS
   ========================================================= */

function setupControls() {
  const start =
    $("start");

  const stop =
    $("stop");

  const scan =
    $("scanAll");

  if (start) {
    start.addEventListener(
      "click",
      startEngine
    );
  }

  if (stop) {
    stop.addEventListener(
      "click",
      stopEngine
    );
  }

  if (scan) {
    scan.addEventListener(
      "click",
      scanAllMarkets
    );
  }

  updateEngineButtons();
}

/* =========================================================
   PERIODIC AI SCAN
   ========================================================= */

function startScanner() {
  clearInterval(
    state.scannerTimer
  );

  state.scannerTimer =
    setInterval(
      () => {
        if (
          !state.engineRunning
        ) {
          return;
        }

        scanAllMarkets();

        const market =
          state.markets.get(
            state.selectedSymbol
          );

        if (market) {
          updateAI(market);
        }
      },
      5000
    );
}

/* =========================================================
   WATCHDOG
   ========================================================= */

setInterval(
  () => {
    if (
      !state.connected
    ) {
      return;
    }

    if (
      state.lastTickAt &&
      Date.now() -
        state.lastTickAt >
        CONFIG.WATCHDOG_MS
    ) {
      setText(
        "footerStatus",
        "Connected, waiting for live tick data..."
      );
    }
  },
  5000
);

/* =========================================================
   INITIALIZE
   ========================================================= */

function initialize() {
  initializeMarkets();

  setupStrategies();

  setupControls();

  setupAccountButtons();

  selectMarket(
    state.selectedSymbol
  );

  updateGlobalStats();

  updateAccountUI();

  setConnectionStatus(
    "CONNECTING"
  );

  setText(
    "engineControlDescription",
    "Waiting for live market data..."
  );

  startScanner();

  connect();
}

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
