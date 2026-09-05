/* =========================================================
   KRISHWAVE V3
   LIVE DERIV MARKET INTELLIGENCE ENGINE
   ========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const DERIV_WS_URL =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const MAX_HISTORY = 200;
const MIN_SAMPLE = 30;
const RECONNECT_DELAY = 3000;

/*
 * The 13 markets requested for KRISHWAVE.
 * The actual symbol will be confirmed against Deriv
 * active_symbols data before subscribing.
 */
const MARKET_DEFINITIONS = [
  {
    name: "Volatility 10 Index",
    symbol: "R_10",
    aliases: ["R_10"]
  },
  {
    name: "Volatility 10 (1s)",
    symbol: "R_10_1S",
    aliases: ["R_10_1S"]
  },
  {
    name: "Volatility 15 (1s)",
    symbol: "R_15_1S",
    aliases: ["R_15_1S"]
  },
  {
    name: "Volatility 25 Index",
    symbol: "R_25",
    aliases: ["R_25"]
  },
  {
    name: "Volatility 25 (1s)",
    symbol: "R_25_1S",
    aliases: ["R_25_1S"]
  },
  {
    name: "Volatility 30 (1s)",
    symbol: "R_30_1S",
    aliases: ["R_30_1S"]
  },
  {
    name: "Volatility 50 Index",
    symbol: "R_50",
    aliases: ["R_50"]
  },
  {
    name: "Volatility 50 (1s)",
    symbol: "R_50_1S",
    aliases: ["R_50_1S"]
  },
  {
    name: "Volatility 75 Index",
    symbol: "R_75",
    aliases: ["R_75"]
  },
  {
    name: "Volatility 75 (1s)",
    symbol: "R_75_1S",
    aliases: ["R_75_1S"]
  },
  {
    name: "Volatility 90 (1s)",
    symbol: "R_90_1S",
    aliases: ["R_90_1S"]
  },
  {
    name: "Volatility 100 Index",
    symbol: "R_100",
    aliases: ["R_100"]
  },
  {
    name: "Volatility 100 (1s)",
    symbol: "R_100_1S",
    aliases: ["R_100_1S"]
  }
];

/* =========================================================
   STATE
   ========================================================= */

const state = {
  socket: null,
  connected: false,
  reconnectTimer: null,

  running: true,

  selectedSymbol: "R_10",

  markets: new Map(),

  requestCounter: 1,

  requestMap: new Map(),

  subscriptions: new Map(),

  totalTicks: 0,

  lastConnectionAttempt: 0,

  activeSymbolsLoaded: false,

  strategy: "AUTO"
};

/* =========================================================
   INITIAL MARKET STATE
   ========================================================= */

for (const definition of MARKET_DEFINITIONS) {
  state.markets.set(definition.symbol, {
    ...definition,

    available: false,

    quote: null,
    epoch: null,
    pipSize: null,

    ticks: [],

    digits: Array(10).fill(0),

    lastDigit: null,

    previousQuote: null,

    direction: "FLAT",

    streakType: null,
    streakLength: 0,

    subscriptionId: null,

    lastUpdate: null
  });
}

/* =========================================================
   DOM HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = value;
  }
}

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "--";
  }

  return Number(value).toFixed(decimals);
}

function formatTime(epoch) {
  if (!epoch) {
    return "--";
  }

  const date = new Date(Number(epoch) * 1000);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

/* =========================================================
   CONNECTION UI
   ========================================================= */

function setConnectionStatus(status, message) {
  const pill = $("connectionPill");
  const text = $("connectionText");
  const heroStatus = $("heroStreamStatus");
  const footerStatus = $("footerStatus");

  if (text) {
    text.textContent = message;
  }

  if (heroStatus) {
    heroStatus.textContent = message;
  }

  if (footerStatus) {
    footerStatus.textContent = status === "LIVE"
      ? "Live Deriv market data connected"
      : message;
  }

  if (pill) {
    pill.classList.toggle("live", status === "LIVE");
  }

  document.querySelectorAll(".live-badge").forEach((badge) => {
    badge.classList.toggle("live", status === "LIVE");
  });
}

/* =========================================================
   MARKET LIST
   ========================================================= */

function renderMarketList() {
  const container = $("marketList");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  for (const market of state.markets.values()) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "market-item";

    if (market.symbol === state.selectedSymbol) {
      button.classList.add("active");
    }

    const price = market.quote !== null
      ? formatNumber(market.quote, market.pipSize ?? 2)
      : "Waiting...";

    const status = market.available
      ? "LIVE"
      : "WAITING";

    button.innerHTML = `
      <div>
        <span class="market-name">${escapeHtml(market.name)}</span>
        <span class="market-code">${escapeHtml(market.symbol)}</span>
      </div>

      <div class="market-price">
        <strong>${escapeHtml(price)}</strong>
        <small>${status}</small>
      </div>
    `;

    button.addEventListener("click", () => {
      selectMarket(market.symbol);
    });

    container.appendChild(button);
  }
}

/* =========================================================
   MARKET SELECTION
   ========================================================= */

function selectMarket(symbol) {
  if (!state.markets.has(symbol)) {
    return;
  }

  state.selectedSymbol = symbol;

  renderMarketList();
  updateSelectedMarket();

  const market = state.markets.get(symbol);

  if (market) {
    updateMarketAnalysis(market);
  }
}

/* =========================================================
   SELECTED MARKET UI
   ========================================================= */

function updateSelectedMarket() {
  const market = state.markets.get(state.selectedSymbol);

  if (!market) {
    return;
  }

  setText("selectedMarketName", market.name);
  setText("selectedMarketCodeLarge", market.symbol);

  setText(
    "selectedMarketShort",
    market.name
      .replace("Volatility ", "V")
      .replace(" Index", "")
      .replace(" (1s)", " 1s")
  );

  setText("selectedMarketCode", market.symbol);

  if (market.quote !== null) {
    setText(
      "liveQuote",
      formatNumber(
        market.quote,
        market.pipSize ?? inferDecimals(market.quote)
      )
    );
  } else {
    setText("liveQuote", "Waiting...");
  }

  setText(
    "quoteTime",
    market.epoch
      ? `Last tick ${formatTime(market.epoch)}`
      : "Waiting for tick..."
  );

  setText(
    "lastDigit",
    market.lastDigit === null
      ? "--"
      : String(market.lastDigit)
  );

  setText(
    "sampleSize",
    String(market.ticks.length)
  );

  setText(
    "streakValue",
    market.streakLength > 0
      ? `${market.streakType} ${market.streakLength}`
      : "--"
  );
}

/* =========================================================
   DIGIT STATISTICS
   ========================================================= */

function updateDigitStats(market) {
  const total = market.ticks.length;

  for (let digit = 0; digit <= 9; digit++) {
    const count = market.digits[digit] || 0;

    const percent = total > 0
      ? (count / total) * 100
      : 0;

    const valueElement = document.querySelector(
      `[data-digit="${digit}"]`
    );

    const fillElement = document.querySelector(
      `[data-fill-digit="${digit}"]`
    );

    if (valueElement) {
      valueElement.textContent = `${percent.toFixed(1)}%`;
    }

    if (fillElement) {
      fillElement.style.width = `${Math.min(percent, 100)}%`;
    }
  }
}

/* =========================================================
   LAST DIGIT EXTRACTION
   ========================================================= */

function getLastDigit(quote, pipSize) {
  if (quote === null || quote === undefined) {
    return null;
  }

  const numericQuote = Number(quote);

  if (!Number.isFinite(numericQuote)) {
    return null;
  }

  let decimals = Number(pipSize);

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
    decimals = inferDecimals(quote);
  }

  const scaled = Math.round(
    numericQuote * Math.pow(10, decimals)
  );

  return Math.abs(scaled) % 10;
}

/* =========================================================
   DECIMAL INFERENCE
   ========================================================= */

function inferDecimals(value) {
  const text = String(value);

  if (!text.includes(".")) {
    return 0;
  }

  return Math.min(
    text.split(".")[1].length,
    10
  );
}

/* =========================================================
   PROCESS TICK
   ========================================================= */

function processTick(tick) {
  if (!tick) {
    return;
  }

  const symbol = tick.symbol;

  if (!symbol || !state.markets.has(symbol)) {
    return;
  }

  const market = state.markets.get(symbol);

  const quote = Number(tick.quote);

  if (!Number.isFinite(quote)) {
    return;
  }

  const previousQuote = market.quote;

  market.previousQuote = previousQuote;
  market.quote = quote;
  market.epoch = Number(tick.epoch) || Math.floor(Date.now() / 1000);

  if (
    tick.pip_size !== undefined &&
    tick.pip_size !== null
  ) {
    market.pipSize = Number(tick.pip_size);
  }

  const digit = getLastDigit(
    quote,
    market.pipSize
  );

  market.lastDigit = digit;

  if (digit !== null) {
    market.digits[digit]++;

    market.ticks.push({
      quote,
      digit,
      epoch: market.epoch
    });
  }

  if (market.ticks.length > MAX_HISTORY) {
    const removed = market.ticks.shift();

    if (removed && Number.isInteger(removed.digit)) {
      market.digits[removed.digit] =
        Math.max(
          0,
          market.digits[removed.digit] - 1
        );
    }
  }

  if (previousQuote !== null) {
    if (quote > previousQuote) {
      updateStreak(market, "RISE");
    } else if (quote < previousQuote) {
      updateStreak(market, "FALL");
    } else {
      updateStreak(market, "FLAT");
    }
  }

  market.available = true;
  market.lastUpdate = Date.now();

  state.totalTicks++;

  updateMarketCard(market);

  if (symbol === state.selectedSymbol) {
    updateSelectedMarket();
    updateDigitStats(market);
    updateMarketAnalysis(market);
  }

  updateGlobalStats();
}

/* =========================================================
   STREAK
   ========================================================= */

function updateStreak(market, type) {
  if (market.streakType === type) {
    market.streakLength++;
  } else {
    market.streakType = type;
    market.streakLength = 1;
  }
}

/* =========================================================
   MARKET CARD UPDATE
   ========================================================= */

function updateMarketCard(market) {
  const cards = document.querySelectorAll(".market-item");

  for (const card of cards) {
    const code = card.querySelector(".market-code");

    if (!code) {
      continue;
    }

    if (code.textContent === market.symbol) {
      const price = card.querySelector(".market-price strong");
      const status = card.querySelector(".market-price small");

      if (price) {
        price.textContent =
          market.quote === null
            ? "Waiting..."
            : formatNumber(
                market.quote,
                market.pipSize ?? inferDecimals(market.quote)
              );
      }

      if (status) {
        status.textContent = market.available
          ? "LIVE"
          : "WAITING";
      }
    }
  }
}

/* =========================================================
   GLOBAL STATS
   ========================================================= */

function updateGlobalStats() {
  let connected = 0;

  for (const market of state.markets.values()) {
    if (market.available) {
      connected++;
    }
  }

  setText(
    "connectedMarkets",
    String(connected)
  );

  setText(
    "liveTicks",
    String(state.totalTicks)
  );

  const selected = state.markets.get(
    state.selectedSymbol
  );

  if (selected) {
    setText(
      "engineState",
      selected.ticks.length >= MIN_SAMPLE
        ? "READY"
        : "WAIT"
    );

    setText(
      "engineStateDetail",
      selected.ticks.length >= MIN_SAMPLE
        ? `${selected.ticks.length} observations`
        : `Need ${Math.max(
            0,
            MIN_SAMPLE - selected.ticks.length
          )} more ticks`
    );
  }
}

/* =========================================================
   ANALYSIS ENGINE
   ========================================================= */

function calculateAnalysis(market) {
  const total = market.ticks.length;

  if (total === 0) {
    return {
      ready: false,
      signal: "WAIT",
      strategy: "--",
      confidence: 0,
      reason: "Waiting for live tick data.",
      dominantDigit: null,
      dominantRate: 0,
      even: 0,
      odd: 0,
      over: 0,
      under: 0,
      match: 0,
      differ: 0,
      rise: 0,
      fall: 0
    };
  }

  const evenCount = market.ticks.filter(
    (item) => item.digit % 2 === 0
  ).length;

  const oddCount = total - evenCount;

  const overCount = market.ticks.filter(
    (item) => item.digit >= 5
  ).length;

  const underCount = total - overCount;

  const digitCounts = [...market.digits];

  let dominantDigit = 0;

  for (let digit = 1; digit <= 9; digit++) {
    if (digitCounts[digit] > digitCounts[dominantDigit]) {
      dominantDigit = digit;
    }
  }

  const dominantCount =
    digitCounts[dominantDigit] || 0;

  const dominantRate =
    total > 0
      ? (dominantCount / total) * 100
      : 0;

  const match = dominantRate;

  const differ = 100 - match;

  let riseCount = 0;
  let fallCount = 0;

  for (let i = 1; i < market.ticks.length; i++) {
    if (
      market.ticks[i].quote >
      market.ticks[i - 1].quote
    ) {
      riseCount++;
    } else if (
      market.ticks[i].quote <
      market.ticks[i - 1].quote
    ) {
      fallCount++;
    }
  }

  const directionSamples =
    Math.max(1, riseCount + fallCount);

  const rise =
    (riseCount / directionSamples) * 100;

  const fall =
    (fallCount / directionSamples) * 100;

  const values = {
    EVEN: evenCount / total * 100,
    ODD: oddCount / total * 100,
    OVER: overCount / total * 100,
    UNDER: underCount / total * 100,
    MATCH: match,
    DIFFER: differ,
    RISE: rise,
    FALL: fall
  };

  const strongest = Object.entries(values)
    .sort((a, b) => b[1] - a[1])[0];

  const selectedStrategy =
    state.strategy === "AUTO"
      ? strongest[0]
      : state.strategy;

  const selectedValue =
    values[selectedStrategy] || 0;

  /*
   * Confidence is deliberately conservative.
   * A percentage near 50% should not become a high
   * confidence signal.
   */
  const edge = Math.abs(
    selectedValue - 50
  );

  let confidence =
    50 + edge * 1.6;

  if (total < MIN_SAMPLE) {
    confidence *= total / MIN_SAMPLE;
  }

  confidence = Math.max(
    0,
    Math.min(95, confidence)
  );

  let signal = "WAIT";

  if (
    total >= MIN_SAMPLE &&
    confidence >= 65
  ) {
    signal =
      selectedStrategy === "EVEN"
        ? "EVEN BIAS"
        : selectedStrategy === "ODD"
          ? "ODD BIAS"
          : selectedStrategy === "OVER"
            ? "OVER 4"
            : selectedStrategy === "UNDER"
              ? "UNDER 5"
              : selectedStrategy === "MATCH"
                ? "MATCH"
                : selectedStrategy === "DIFFER"
                  ? "DIFFER"
                  : selectedStrategy === "RISE"
                    ? "RISE"
                    : selectedStrategy === "FALL"
                      ? "FALL"
                      : "SCAN";
  }

  let reason;

  if (total < MIN_SAMPLE) {
    reason =
      `Collecting data: ${total}/${MIN_SAMPLE} ticks.`;
  } else {
    reason =
      `${selectedStrategy} currently leads with ` +
      `${selectedValue.toFixed(1)}% historical frequency ` +
      `across ${total} recent ticks.`;
  }

  return {
    ready: total >= MIN_SAMPLE,
    signal,
    strategy: selectedStrategy,
    confidence,
    reason,
    dominantDigit,
    dominantRate,
    even: values.EVEN,
    odd: values.ODD,
    over: values.OVER,
    under: values.UNDER,
    match: values.MATCH,
    differ: values.DIFFER,
    rise: values.RISE,
    fall: values.FALL
  };
}

/* =========================================================
   UPDATE ANALYSIS UI
   ========================================================= */

function updateMarketAnalysis(market) {
  const analysis = calculateAnalysis(market);

  setText(
    "analysisSignal",
    analysis.signal
  );

  setText(
    "analysisStrategy",
    analysis.strategy
  );

  setText(
    "analysisConfidence",
    `${analysis.confidence.toFixed(0)}%`
  );

  setText(
    "analysisReason",
    analysis.reason
  );

  setText(
    "dominantDigit",
    analysis.dominantDigit === null
      ? "--"
      : String(analysis.dominantDigit)
  );

  setText(
    "dominantDigitRate",
    `${analysis.dominantRate.toFixed(1)}%`
  );

  setText(
    "evenPercent",
    `${analysis.even.toFixed(1)}%`
  );

  setText(
    "oddPercent",
    `${analysis.odd.toFixed(1)}%`
  );

  setText(
    "overPercent",
    `${analysis.over.toFixed(1)}%`
  );

  setText(
    "underPercent",
    `${analysis.under.toFixed(1)}%`
  );

  setText(
    "matchPercent",
    `${analysis.match.toFixed(1)}%`
  );

  setText(
    "differPercent",
    `${analysis.differ.toFixed(1)}%`
  );

  setText(
    "risePercent",
    `${analysis.rise.toFixed(1)}%`
  );

  setText(
    "fallPercent",
    `${analysis.fall.toFixed(1)}%`
  );

  const engineBadge = $("engineStatus");

  if (engineBadge) {
    const strong = engineBadge.querySelector("strong");
    const small = engineBadge.querySelector("small");

    if (strong) {
      strong.textContent =
        analysis.ready ? "READY" : "WAIT";
    }

    if (small) {
      small.textContent =
        analysis.ready
          ? "Analysis available"
          : "Collecting live ticks";
    }
  }
}

/* =========================================================
   STRATEGY BUTTONS
   ========================================================= */

function setupStrategies() {
  const buttons =
    document.querySelectorAll(
      ".strategy-card"
    );

  buttons.forEach((button) => {
    button.addEventListener("click", () => {

      buttons.forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      state.strategy =
        button.dataset.strategy || "AUTO";

      const market =
        state.markets.get(
          state.selectedSymbol
        );

      if (market) {
        updateMarketAnalysis(market);
      }
    });
  });
}

/* =========================================================
   SCAN ALL
   ========================================================= */

function scanAllMarkets() {
  let best = null;

  for (const market of state.markets.values()) {
    if (market.ticks.length < MIN_SAMPLE) {
      continue;
    }

    const analysis =
      calculateAnalysis(market);

    if (!best || analysis.confidence > best.confidence) {
      best = {
        symbol: market.symbol,
        confidence: analysis.confidence
      };
    }
  }

  if (best) {
    selectMarket(best.symbol);
  }
}

/* =========================================================
   WEBSOCKET
   ========================================================= */

function connect() {
  if (
    state.socket &&
    (
      state.socket.readyState === WebSocket.OPEN ||
      state.socket.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  clearTimeout(state.reconnectTimer);

  state.lastConnectionAttempt = Date.now();

  setConnectionStatus(
    "CONNECTING",
    "CONNECTING"
  );

  let socket;

  try {
    socket = new WebSocket(DERIV_WS_URL);
  } catch (error) {
    console.error(
      "KRISHWAVE WebSocket error:",
      error
    );

    scheduleReconnect();
    return;
  }

  state.socket = socket;

  socket.addEventListener(
    "open",
    handleSocketOpen
  );

  socket.addEventListener(
    "message",
    handleSocketMessage
  );

  socket.addEventListener(
    "error",
    handleSocketError
  );

  socket.addEventListener(
    "close",
    handleSocketClose
  );
}

/* =========================================================
   SOCKET OPEN
   ========================================================= */

function handleSocketOpen() {
  state.connected = true;

  setConnectionStatus(
    "LIVE",
    "LIVE"
  );

  requestActiveSymbols();
}

/* =========================================================
   SOCKET MESSAGE
   ========================================================= */

function handleSocketMessage(event) {
  let data;

  try {
    data = JSON.parse(event.data);
  } catch (error) {
    console.warn(
      "KRISHWAVE received non-JSON message:",
      event.data
    );

    return;
  }

  if (!data) {
    return;
  }

  if (data.error) {
    console.warn(
      "Deriv API error:",
      data.error
    );

    handleApiError(data.error);
    return;
  }

  switch (data.msg_type) {

    case "active_symbols":
      handleActiveSymbols(data);
      break;

    case "tick":
      handleTickMessage(data);
      break;

    case "ping":
      break;

    case "time":
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

  rememberRequest(
    reqId,
    "active_symbols"
  );

  send({
    active_symbols: "brief",
    product_type: "basic",
    req_id: reqId
  });
}

function handleActiveSymbols(data) {
  const symbols =
    Array.isArray(data.active_symbols)
      ? data.active_symbols
      : [];

  state.activeSymbolsLoaded = true;

  const availableSymbols =
    new Set(
      symbols
        .map((item) =>
          item?.underlying_symbol
        )
        .filter(Boolean)
    );

  for (const market of state.markets.values()) {
    market.available =
      availableSymbols.has(
        market.symbol
      );
  }

  renderMarketList();

  /*
   * Subscribe only to symbols confirmed by
   * the current active_symbols response.
   */
  for (const market of state.markets.values()) {
    if (market.available) {
      subscribeToTicks(market.symbol);
    }
  }

  updateGlobalStats();
}

/* =========================================================
   TICK SUBSCRIPTION
   ========================================================= */

function subscribeToTicks(symbol) {
  if (!state.connected) {
    return;
  }

  const market = state.markets.get(symbol);

  if (!market) {
    return;
  }

  if (market.subscriptionId) {
    return;
  }

  const reqId = nextRequestId();

  rememberRequest(
    reqId,
    "ticks",
    symbol
  );

  send({
    ticks: symbol,
    subscribe: 1,
    req_id: reqId
  });
}

/* =========================================================
   TICK MESSAGE
   ========================================================= */

function handleTickMessage(data) {
  if (!data.tick) {
    return;
  }

  const tick = data.tick;

  /*
   * The current API provides the symbol directly
   * inside tick.symbol. Do not depend on echo_req.
   */
  const symbol = tick.symbol;

  if (!symbol || !state.markets.has(symbol)) {
    return;
  }

  if (
    tick.subscription &&
    tick.subscription.id
  ) {
    const market =
      state.markets.get(symbol);

    market.subscriptionId =
      tick.subscription.id;

    state.subscriptions.set(
      symbol,
      tick.subscription.id
    );
  }

  processTick(tick);
}

/* =========================================================
   SOCKET ERROR
   ========================================================= */

function handleSocketError(error) {
  console.warn(
    "KRISHWAVE WebSocket error:",
    error
  );

  setConnectionStatus(
    "ERROR",
    "CONNECTION ERROR"
  );
}

/* =========================================================
   SOCKET CLOSE
   ========================================================= */

function handleSocketClose() {
  state.connected = false;

  for (const market of state.markets.values()) {
    market.subscriptionId = null;
  }

  state.subscriptions.clear();

  setConnectionStatus(
    "OFFLINE",
    "RECONNECTING"
  );

  scheduleReconnect();
}

/* =========================================================
   RECONNECT
   ========================================================= */

function scheduleReconnect() {
  clearTimeout(state.reconnectTimer);

  state.reconnectTimer =
    setTimeout(() => {
      connect();
    }, RECONNECT_DELAY);
}

/* =========================================================
   SEND
   ========================================================= */

function send(payload) {
  if (
    !state.socket ||
    state.socket.readyState !== WebSocket.OPEN
  ) {
    return false;
  }

  try {
    state.socket.send(
      JSON.stringify(payload)
    );

    return true;
  } catch (error) {
    console.error(
      "KRISHWAVE send error:",
      error
    );

    return false;
  }
}

/* =========================================================
   REQUEST IDs
   ========================================================= */

function nextRequestId() {
  return state.requestCounter++;
}

function rememberRequest(
  reqId,
  type,
  symbol = null
) {
  state.requestMap.set(
    reqId,
    {
      type,
      symbol,
      createdAt: Date.now()
    }
  );
}

/* =========================================================
   API ERROR
   ========================================================= */

function handleApiError(error) {
  const message =
    typeof error === "string"
      ? error
      : error?.message || "Unknown API error";

  setText(
    "footerStatus",
    `API error: ${message}`
  );
}

/* =========================================================
   MONITOR CONTROLS
   ========================================================= */

function startMonitor() {
  state.running = true;

  setText(
    "engineState",
    "RUNNING"
  );

  setText(
    "engineStateDetail",
    "Live analysis monitor active"
  );

  if (
    !state.socket ||
    state.socket.readyState !== WebSocket.OPEN
  ) {
    connect();
  }
}

function stopMonitor() {
  state.running = false;

  setText(
    "engineState",
    "STOPPED"
  );

  setText(
    "engineStateDetail",
    "Analysis monitor paused"
  );
}

/* =========================================================
   BUTTON SETUP
   ========================================================= */

function setupControls() {
  const startButton = $("start");
  const stopButton = $("stop");
  const scanButton = $("scanAll");

  if (startButton) {
    startButton.addEventListener(
      "click",
      startMonitor
    );
  }

  if (stopButton) {
    stopButton.addEventListener(
      "click",
      stopMonitor
    );
  }

  if (scanButton) {
    scanButton.addEventListener(
      "click",
      scanAllMarkets
    );
  }
}

/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function initialize() {
  renderMarketList();

  setupStrategies();

  setupControls();

  selectMarket(
    state.selectedSymbol
  );

  updateGlobalStats();

  setConnectionStatus(
    "CONNECTING",
    "CONNECTING"
  );

  connect();
}

/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initialize
);
