/* =========================================================
   KRISHWAVE V3
   LIVE DERIV MARKET INTELLIGENCE ENGINE
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const WS_URL =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const MAX_HISTORY = 200;
const MIN_SAMPLE = 30;
const RECONNECT_DELAY = 3000;

/* =========================================================
   MARKETS
   ========================================================= */

const MARKETS = [
  { symbol: "R_10", name: "Volatility 10 Index" },
  { symbol: "R_10_1S", name: "Volatility 10 (1s) Index" },
  { symbol: "R_15_1S", name: "Volatility 15 (1s) Index" },
  { symbol: "R_25", name: "Volatility 25 Index" },
  { symbol: "R_25_1S", name: "Volatility 25 (1s) Index" },
  { symbol: "R_30_1S", name: "Volatility 30 (1s) Index" },
  { symbol: "R_50", name: "Volatility 50 Index" },
  { symbol: "R_50_1S", name: "Volatility 50 (1s) Index" },
  { symbol: "R_75", name: "Volatility 75 Index" },
  { symbol: "R_75_1S", name: "Volatility 75 (1s) Index" },
  { symbol: "R_90_1S", name: "Volatility 90 (1s) Index" },
  { symbol: "R_100", name: "Volatility 100 Index" },
  { symbol: "R_100_1S", name: "Volatility 100 (1s) Index" }
];

/* =========================================================
   STATE
   ========================================================= */

const state = {
  socket: null,
  connected: false,
  running: true,

  selectedSymbol: "R_10",

  markets: new Map(),

  requestCounter: 1,
  requestMap: new Map(),

  subscriptions: new Map(),

  totalTicks: 0,

  strategy: "AUTO",

  reconnectTimer: null,

  intentionalClose: false,

  lastTickAt: null
};

/* =========================================================
   HELPERS
   ========================================================= */

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function send(payload) {
  if (
    state.socket &&
    state.socket.readyState === WebSocket.OPEN
  ) {
    state.socket.send(JSON.stringify(payload));

    return true;
  }

  return false;
}

function nextRequestId() {
  const id = state.requestCounter;

  state.requestCounter += 1;

  return id;
}

/* =========================================================
   MARKET OBJECT
   ========================================================= */

function createMarket(market) {
  return {
    name: market.name,
    symbol: market.symbol,

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

    bestStrategy: "WAIT",

    confidence: 0,

    lastUpdate: null
  };
}

/* =========================================================
   INITIALIZE MARKETS
   ========================================================= */

function initializeMarkets() {
  state.markets.clear();

  MARKETS.forEach((market) => {
    state.markets.set(
      market.symbol,
      createMarket(market)
    );
  });
}

/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function setConnectionStatus(status) {
  const connection = document.getElementById(
    "connectionStatus"
  );

  const footer = document.getElementById(
    "footerStatus"
  );

  const hero = document.getElementById(
    "heroStreamStatus"
  );

  if (status === "LIVE") {
    if (connection) {
      connection.textContent = "LIVE";
      connection.classList.remove("offline");
      connection.classList.add("live");
    }

    if (hero) {
      hero.textContent = "LIVE STREAM";
    }

    if (footer) {
      footer.textContent =
        "Live Deriv market stream connected.";
    }

    return;
  }

  if (status === "CONNECTING") {
    if (connection) {
      connection.textContent = "CONNECTING";
      connection.classList.remove("live");
      connection.classList.add("offline");
    }

    if (hero) {
      hero.textContent = "CONNECTING";
    }

    if (footer) {
      footer.textContent =
        "Connecting to Deriv market stream...";
    }

    return;
  }

  if (connection) {
    connection.textContent = "OFFLINE";
    connection.classList.remove("live");
    connection.classList.add("offline");
  }

  if (hero) {
    hero.textContent = "OFFLINE";
  }

  if (footer) {
    footer.textContent =
      "Market stream offline. Reconnecting...";
  }
}

/* =========================================================
   CONNECT
   ========================================================= */

function connect() {
  clearTimeout(state.reconnectTimer);

  state.intentionalClose = false;

  setConnectionStatus("CONNECTING");

  try {
    state.socket = new WebSocket(WS_URL);

    state.socket.addEventListener(
      "open",
      handleSocketOpen
    );

    state.socket.addEventListener(
      "message",
      handleSocketMessage
    );

    state.socket.addEventListener(
      "error",
      handleSocketError
    );

    state.socket.addEventListener(
      "close",
      handleSocketClose
    );

  } catch (error) {
    console.error(
      "WebSocket connection error:",
      error
    );

    scheduleReconnect();
  }
}

/* =========================================================
   SOCKET OPEN
   ========================================================= */

function handleSocketOpen() {
  state.connected = true;

  state.subscriptions.clear();

  setConnectionStatus("CONNECTING");

  setText(
    "footerStatus",
    "Connected. Loading live Deriv market data..."
  );

  /*
     Do NOT wait for active_symbols before subscribing.
     We already know the requested Volatility symbols.
  */

  requestAllHistory();

  subscribeToAllTicks();
}

/* =========================================================
   SOCKET ERROR
   ========================================================= */

function handleSocketError(error) {
  console.error(
    "Deriv WebSocket error:",
    error
  );
}

/* =========================================================
   SOCKET CLOSE
   ========================================================= */

function handleSocketClose() {
  state.connected = false;

  state.subscriptions.clear();

  setConnectionStatus("OFFLINE");

  scheduleReconnect();
}

/* =========================================================
   RECONNECT
   ========================================================= */

function scheduleReconnect() {
  clearTimeout(state.reconnectTimer);

  if (state.intentionalClose) {
    return;
  }

  state.reconnectTimer = setTimeout(
    () => {
      connect();
    },
    RECONNECT_DELAY
  );
}

/* =========================================================
   MESSAGE ROUTER
   ========================================================= */

function handleSocketMessage(event) {
  let data;

  try {
    data = JSON.parse(event.data);
  } catch (error) {
    console.error(
      "Invalid Deriv message:",
      event.data
    );

    return;
  }

  if (!data) {
    return;
  }

  switch (data.msg_type) {
    case "tick":
      handleTickMessage(data);
      break;

    case "history":
      handleHistoryMessage(data);
      break;

    case "active_symbols":
      handleActiveSymbols(data);
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

  state.requestMap.set(
    reqId,
    {
      type: "active_symbols"
    }
  );

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

  data.active_symbols.forEach(
    (item) => {
      const symbol =
        item.underlying_symbol;

      const market =
        state.markets.get(symbol);

      if (!market) {
        return;
      }

      market.available = true;

      if (item.pip_size !== undefined) {
        market.pipSize =
          safeNumber(item.pip_size);
      }
    }
  );

  renderMarketList();
}

/* =========================================================
   HISTORY
   ========================================================= */

function requestTickHistory(symbol) {
  if (!state.connected) {
    return;
  }

  const reqId = nextRequestId();

  state.requestMap.set(
    reqId,
    {
      type: "history",
      symbol
    }
  );

  send({
    ticks_history: symbol,
    count: MAX_HISTORY,
    end: "latest",
    style: "ticks",
    adjust_start_time: 1,
    req_id: reqId
  });
}

function requestAllHistory() {
  MARKETS.forEach(
    (market) => {
      requestTickHistory(
        market.symbol
      );
    }
  );
}

/* =========================================================
   HISTORY MESSAGE
   ========================================================= */

function handleHistoryMessage(data) {
  const reqId = safeNumber(data.req_id);

  let symbol = null;

  if (reqId !== null) {
    const request =
      state.requestMap.get(reqId);

    if (request) {
      symbol = request.symbol;

      state.requestMap.delete(reqId);
    }
  }

  if (!symbol) {
    return;
  }

  processHistory(
    data,
    symbol
  );
}

/* =========================================================
   PROCESS HISTORY
   ========================================================= */

function processHistory(data, symbol) {
  const market =
    state.markets.get(symbol);

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

  market.digits =
    Array(10).fill(0);

  market.previousQuote = null;

  for (
    let i = 0;
    i < prices.length;
    i++
  ) {
    const quote =
      safeNumber(prices[i]);

    const epoch =
      safeNumber(times[i]);

    if (quote === null) {
      continue;
    }

    addTickToMarket(
      market,
      quote,
      epoch,
      market.pipSize
    );
  }

  market.available = true;

  updateMarketUI(market);

  renderMarketList();

  if (
    market.symbol ===
    state.selectedSymbol
  ) {
    updateSelectedMarket(market);
  }

  updateGlobalStats();
}

/* =========================================================
   LIVE SUBSCRIPTIONS
   ========================================================= */

function subscribeToTicks(symbol) {
  if (
    !state.connected ||
    !state.socket
  ) {
    return;
  }

  if (
    state.subscriptions.has(symbol)
  ) {
    return;
  }

  const reqId = nextRequestId();

  state.requestMap.set(
    reqId,
    {
      type: "subscription",
      symbol
    }
  );

  const sent = send({
    ticks: symbol,
    subscribe: 1,
    req_id: reqId
  });

  if (!sent) {
    state.requestMap.delete(reqId);
  }
}

/* =========================================================
   SUBSCRIBE ALL
   ========================================================= */

function subscribeToAllTicks() {
  MARKETS.forEach(
    (market) => {
      subscribeToTicks(
        market.symbol
      );
    }
  );
}

/* =========================================================
   TICK MESSAGE
   ========================================================= */

function handleTickMessage(data) {
  const tick = data.tick;

  if (!tick) {
    return;
  }

  const symbol =
    tick.symbol;

  if (
    tick.subscription &&
    tick.subscription.id
  ) {
    state.subscriptions.set(
      symbol,
      tick.subscription.id
    );
  }

  processTick(tick);
}

/* =========================================================
   PROCESS LIVE TICK
   ========================================================= */

function processTick(tick) {
  if (!state.running) {
    return;
  }

  const symbol =
    tick.symbol;

  const market =
    state.markets.get(symbol);

  if (!market) {
    return;
  }

  const quote =
    safeNumber(tick.quote);

  const epoch =
    safeNumber(tick.epoch);

  if (quote === null) {
    return;
  }

  if (tick.pip_size !== undefined) {
    const pip =
      safeNumber(tick.pip_size);

    if (pip !== null) {
      market.pipSize = pip;
    }
  }

  addTickToMarket(
    market,
    quote,
    epoch,
    market.pipSize
  );

  market.available = true;

  state.totalTicks += 1;

  state.lastTickAt =
    Date.now();

  /*
     The connection is only called LIVE
     after actual tick data arrives.
  */

  setConnectionStatus("LIVE");

  updateGlobalStats();

  updateMarketUI(market);

  renderMarketList();

  if (
    symbol ===
    state.selectedSymbol
  ) {
    updateSelectedMarket(
      market
    );

    updateAnalysis(
      market
    );
  }
}

/* =========================================================
   ADD TICK
   ========================================================= */

function addTickToMarket(
  market,
  quote,
  epoch,
  pipSize
) {
  const lastQuote =
    market.quote;

  market.previousQuote =
    lastQuote;

  market.quote =
    quote;

  market.epoch =
    epoch || Math.floor(Date.now() / 1000);

  market.lastUpdate =
    Date.now();

  const digit =
    getLastDigit(
      quote,
      pipSize
    );

  market.lastDigit =
    digit;

  market.ticks.push({
    quote,
    epoch:
      market.epoch,
    digit
  });

  if (
    market.ticks.length >
    MAX_HISTORY
  ) {
    market.ticks.shift();
  }

  /*
     Recalculate digit counts
     from retained tick window.
  */

  market.digits =
    Array(10).fill(0);

  market.ticks.forEach(
    (tick) => {
      if (
        Number.isInteger(
          tick.digit
        ) &&
        tick.digit >= 0 &&
        tick.digit <= 9
      ) {
        market.digits[
          tick.digit
        ] += 1;
      }
    }
  );

  updateDirection(
    market
  );
}

/* =========================================================
   LAST DIGIT
   ========================================================= */

function getLastDigit(
  quote,
  pipSize
) {
  let decimals = 0;

  if (
    pipSize !== null &&
    pipSize !== undefined &&
    Number.isFinite(
      Number(pipSize)
    )
  ) {
    const text =
      String(pipSize);

    if (text.includes(".")) {
      decimals =
        text.split(".")[1]
          .length;
    }
  }

  if (
    decimals === 0
  ) {
    const text =
      String(quote);

    if (text.includes(".")) {
      decimals =
        text.split(".")[1]
          .length;
    }
  }

  const multiplier =
    Math.pow(
      10,
      decimals
    );

  const scaled =
    Math.round(
      quote * multiplier
    );

  return (
    Math.abs(scaled) % 10
  );
}

/* =========================================================
   DIRECTION
   ========================================================= */

function updateDirection(market) {
  if (
    market.previousQuote ===
      null ||
    market.quote === null
  ) {
    market.direction =
      "FLAT";

    market.directionStreak =
      0;

    return;
  }

  if (
    market.quote >
    market.previousQuote
  ) {
    if (
      market.direction ===
      "RISE"
    ) {
      market.directionStreak += 1;
    } else {
      market.direction =
        "RISE";

      market.directionStreak =
        1;
    }

    return;
  }

  if (
    market.quote <
    market.previousQuote
  ) {
    if (
      market.direction ===
      "FALL"
    ) {
      market.directionStreak += 1;
    } else {
      market.direction =
        "FALL";

      market.directionStreak =
        1;
    }

    return;
  }

  market.direction =
    "FLAT";

  market.directionStreak =
    0;
}

/* =========================================================
   GLOBAL STATS
   ========================================================= */

function updateGlobalStats() {
  const connected =
    Array.from(
      state.markets.values()
    ).filter(
      (market) =>
        market.ticks.length > 0
    ).length;

  setText(
    "connectedMarkets",
    connected
  );

  setText(
    "liveTicks",
    state.totalTicks
  );

  const selected =
    state.markets.get(
      state.selectedSymbol
    );

  if (selected) {
    setText(
      "selectedMarketShort",
      selected.name
    );

    setText(
      "selectedMarketCode",
      selected.symbol
    );
  }

  if (state.running) {
    setText(
      "engineState",
      "RUNNING"
    );

    setText(
      "engineStateDetail",
      "Live intelligence engine active"
    );
  } else {
    setText(
      "engineState",
      "STOPPED"
    );

    setText(
      "engineStateDetail",
      "Monitoring paused"
    );
  }
}

/* =========================================================
   MARKET LIST
   ========================================================= */

function renderMarketList() {
  const container =
    document.getElementById(
      "marketList"
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const ranked =
    Array.from(
      state.markets.values()
    )
      .sort(
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
            b.confidence -
            a.confidence
          );
        }
      );

  ranked.forEach(
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
        sample >= MIN_SAMPLE
          ? calculateAnalysis(
              market
            )
          : null;

      const confidence =
        analysis
          ? analysis.confidence
          : 0;

      market.confidence =
        confidence;

      button.innerHTML = `
        <div class="market-item-main">
          <strong>
            ${market.name}
          </strong>
          <span>
            ${market.symbol}
          </span>
        </div>

        <div class="market-item-meta">
          <span>
            ${
              sample
            } ticks
          </span>

          <span>
            ${
              confidence
                ? confidence.toFixed(0)
                : "—"
            }%
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

  updateSelectedMarket(
    market
  );

  updateAnalysis(
    market
  );

  renderMarketList();

  updateGlobalStats();
}

/* =========================================================
   SELECTED MARKET UI
   ========================================================= */

function updateSelectedMarket(
  market
) {
  setText(
    "selectedMarketName",
    market.name
  );

  setText(
    "selectedMarketCodeLarge",
    market.symbol
  );

  if (
    market.quote !== null
  ) {
    setText(
      "liveQuote",
      formatQuote(
        market.quote
      )
    );
  } else {
    setText(
      "liveQuote",
      "—"
    );
  }

  if (
    market.epoch
  ) {
    const date =
      new Date(
        market.epoch * 1000
      );

    setText(
      "quoteTime",
      date.toLocaleTimeString()
    );
  } else {
    setText(
      "quoteTime",
      "Waiting..."
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
    market.direction !==
      "FLAT"
      ? `${market.direction} ${market.directionStreak}`
      : "FLAT"
  );

  updateDigitStats(
    market
  );
}

/* =========================================================
   QUOTE FORMAT
   ========================================================= */

function formatQuote(
  quote
) {
  if (
    quote === null ||
    quote === undefined
  ) {
    return "—";
  }

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
   DIGIT STATS
   ========================================================= */

function updateDigitStats(
  market
) {
  const total =
    market.ticks.length;

  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {
    const count =
      market.digits[digit] || 0;

    const percentage =
      total > 0
        ? (
            count /
            total
          ) * 100
        : 0;

    /*
       Keep the digit label as
       0–9. Only update the
       percentage element.
    */

    const row =
      document.querySelector(
        `[data-digit="${digit}"]`
      );

    if (!row) {
      continue;
    }

    const percentageElement =
      row.querySelector(
        "strong"
      );

    if (
      percentageElement
    ) {
      percentageElement.textContent =
        `${percentage.toFixed(1)}%`;
    }

    const fill =
      document.querySelector(
        `[data-fill-digit="${digit}"]`
      );

    if (fill) {
      fill.style.width =
        `${percentage}%`;
    }
  }
}

/* =========================================================
   ANALYSIS
   ========================================================= */

function calculateAnalysis(
  market
) {
  const ticks =
    market.ticks;

  const total =
    ticks.length;

  if (
    total === 0
  ) {
    return {
      signal: "WAIT",
      reason:
        "Waiting for live tick data.",
      strategy: "WAIT",
      confidence: 0,

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

      edge: 0
    };
  }

  const evenCount =
    ticks.filter(
      (tick) =>
        tick.digit % 2 === 0
    ).length;

  const oddCount =
    total -
    evenCount;

  const overCount =
    ticks.filter(
      (tick) =>
        tick.digit >= 5
    ).length;

  const underCount =
    total -
    overCount;

  const digitCounts =
    Array(10).fill(0);

  ticks.forEach(
    (tick) => {
      digitCounts[
        tick.digit
      ] += 1;
    }
  );

  let dominantDigit = 0;

  for (
    let digit = 1;
    digit <= 9;
    digit++
  ) {
    if (
      digitCounts[digit] >
      digitCounts[
        dominantDigit
      ]
    ) {
      dominantDigit =
        digit;
    }
  }

  const dominantDigitRate =
    (
      digitCounts[
        dominantDigit
      ] /
      total
    ) * 100;

  let riseCount = 0;
  let fallCount = 0;

  for (
    let i = 1;
    i < ticks.length;
    i++
  ) {
    if (
      ticks[i].quote >
      ticks[i - 1].quote
    ) {
      riseCount += 1;
    } else if (
      ticks[i].quote <
      ticks[i - 1].quote
    ) {
      fallCount += 1;
    }
  }

  const movementTotal =
    riseCount +
    fallCount;

  const risePercent =
    movementTotal > 0
      ? (
          riseCount /
          movementTotal
        ) * 100
      : 50;

  const fallPercent =
    movementTotal > 0
      ? (
          fallCount /
          movementTotal
        ) * 100
      : 50;

  const evenPercent =
    (evenCount / total) *
    100;

  const oddPercent =
    (oddCount / total) *
    100;

  const overPercent =
    (overCount / total) *
    100;

  const underPercent =
    (underCount / total) *
    100;

  const matchPercent =
    dominantDigitRate;

  const differPercent =
    100 -
    dominantDigitRate;

  /*
     Meaningful edges.

     DIFFER is not automatically
     considered a strong signal just
     because its raw probability is
     naturally high.
  */

  const candidates = [
    {
      strategy: "EVEN",
      value: evenPercent,
      baseline: 50
    },

    {
      strategy: "ODD",
      value: oddPercent,
      baseline: 50
    },

    {
      strategy: "OVER",
      value: overPercent,
      baseline: 50
    },

    {
      strategy: "UNDER",
      value: underPercent,
      baseline: 50
    },

    {
      strategy: "MATCH",
      value: matchPercent,
      baseline: 10
    },

    {
      strategy: "DIFFER",
      value: differPercent,
      baseline: 90
    },

    {
      strategy: "RISE",
      value: risePercent,
      baseline: 50
    },

    {
      strategy: "FALL",
      value: fallPercent,
      baseline: 50
    }
  ];

  /*
     Rank by distance from baseline,
     rather than simply highest raw
     probability.
  */

  candidates.forEach(
    (candidate) => {
      candidate.edge =
        candidate.value -
        candidate.baseline;

      candidate.absEdge =
        Math.abs(
          candidate.edge
        );
    }
  );

  candidates.sort(
    (a, b) =>
      b.absEdge -
      a.absEdge
  );

  const best =
    candidates[0];

  const sampleFactor =
    Math.min(
      1,
      total / 100
    );

  let confidence =
    50 +
    best.absEdge * 1.6;

  confidence =
    50 +
    (
      confidence -
      50
    ) *
      sampleFactor;

  confidence =
    Math.min(
      95,
      Math.max(
        50,
        confidence
      )
    );

  /*
     Small samples should wait.
  */

  if (
    total < MIN_SAMPLE
  ) {
    return {
      signal: "WAIT",

      reason:
        `Collecting data: ${total}/${MIN_SAMPLE} ticks.`,

      strategy: "WAIT",

      confidence:
        Math.round(
          confidence
        ),

      dominantDigit,
      dominantDigitRate,

      evenPercent,
      oddPercent,

      overPercent,
      underPercent,

      matchPercent,
      differPercent,

      risePercent,
      fallPercent,

      edge:
        best.edge
    };
  }

  const strongEnough =
    best.absEdge >= 5 &&
    confidence >= 65;

  return {
    signal:
      strongEnough
        ? best.strategy
        : "NEUTRAL",

    reason:
      strongEnough
        ? `${best.strategy} shows the strongest statistical deviation in the current ${total}-tick window.`
        : "No strategy currently has a strong enough statistical edge.",

    strategy:
      strongEnough
        ? best.strategy
        : "WAIT",

    confidence:
      Math.round(
        confidence
      ),

    dominantDigit,
    dominantDigitRate,

    evenPercent,
    oddPercent,

    overPercent,
    underPercent,

    matchPercent,
    differPercent,

    risePercent,
    fallPercent,

    edge:
      best.edge
  };
}

/* =========================================================
   UPDATE ANALYSIS UI
   ========================================================= */

function updateAnalysis(
  market
) {
  const analysis =
    calculateAnalysis(
      market
    );

  market.bestStrategy =
    analysis.strategy;

  market.confidence =
    analysis.confidence;

  setText(
    "engineStatus",
    analysis.signal
  );

  setText(
    "analysisSignal",
    analysis.signal
  );

  setText(
    "analysisReason",
    analysis.reason
  );

  setText(
    "analysisStrategy",
    analysis.strategy
  );

  setText(
    "analysisConfidence",
    `${analysis.confidence}%`
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

  updateDigitStats(
    market
  );
}

/* =========================================================
   MARKET UI
   ========================================================= */

function updateMarketUI(
  market
) {
  if (
    market.symbol ===
    state.selectedSymbol
  ) {
    updateSelectedMarket(
      market
    );

    updateAnalysis(
      market
    );
  }
}

/* =========================================================
   SCANNER
   ========================================================= */

function scanAllMarkets() {
  const results = [];

  state.markets.forEach(
    (market) => {
      if (
        market.ticks.length <
        MIN_SAMPLE
      ) {
        return;
      }

      const analysis =
        calculateAnalysis(
          market
        );

      /*
         Score the actual statistical
         edge instead of blindly favoring
         high raw probability strategies.
      */

      const score =
        Math.abs(
          analysis.edge
        ) *
        Math.min(
          1,
          market.ticks.length /
            MAX_HISTORY
        );

      results.push({
        market,
        analysis,
        score
      });
    }
  );

  results.sort(
    (a, b) =>
      b.score -
      a.score
  );

  if (
    results.length === 0
  ) {
    setText(
      "engineState",
      "WAITING"
    );

    setText(
      "engineStateDetail",
      `Collecting at least ${MIN_SAMPLE} ticks per market.`
    );

    return;
  }

  const best =
    results[0];

  /*
     Only switch automatically
     if AUTO is selected.
  */

  if (
    state.strategy ===
    "AUTO"
  ) {
    selectMarket(
      best.market.symbol
    );
  }
}

/* =========================================================
   STRATEGIES
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
          const strategy =
            button.dataset
              .strategy;

          state.strategy =
            strategy;

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
            updateAnalysis(
              market
            );
          }
        }
      );
    }
  );
}

/* =========================================================
   CONTROLS
   ========================================================= */

function setupControls() {
  const start =
    document.getElementById(
      "start"
    );

  const stop =
    document.getElementById(
      "stop"
    );

  if (start) {
    start.addEventListener(
      "click",
      startMonitor
    );
  }

  if (stop) {
    stop.addEventListener(
      "click",
      stopMonitor
    );
  }

  const scan =
    document.getElementById(
      "scanAll"
    );

  if (scan) {
    scan.addEventListener(
      "click",
      scanAllMarkets
    );
  }
}

/* =========================================================
   START
   ========================================================= */

function startMonitor() {
  state.running =
    true;

  setText(
    "engineState",
    "RUNNING"
  );

  setText(
    "engineStateDetail",
    "Live intelligence engine active"
  );

  setText(
    "engineStatus",
    "SCANNING"
  );

  if (
    !state.connected ||
    !state.socket ||
    state.socket.readyState !==
      WebSocket.OPEN
  ) {
    connect();

    return;
  }

  /*
     Re-subscribe in case the
     connection was restored.
  */

  subscribeToAllTicks();

  const market =
    state.markets.get(
      state.selectedSymbol
    );

  if (market) {
    updateAnalysis(
      market
    );
  }
}

/* =========================================================
   STOP
   ========================================================= */

function stopMonitor() {
  state.running =
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
    "PAUSED"
  );

  setText(
    "footerStatus",
    "Monitoring paused. Press Start to resume."
  );
}

/* =========================================================
   DERIV ERROR
   ========================================================= */

function handleDerivError(
  data
) {
  console.error(
    "Deriv API error:",
    data.error
  );

  setText(
    "footerStatus",
    data.error &&
    data.error.message
      ? `Deriv: ${data.error.message}`
      : "Deriv returned an API error."
  );
}

/* =========================================================
   AUTO SCAN LOOP
   ========================================================= */

setInterval(
  () => {
    if (
      !state.running
    ) {
      return;
    }

    scanAllMarkets();
  },
  5000
);

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

    /*
       If there has been no tick for
       a while, do not falsely display
       LIVE forever.
    */

    if (
      state.lastTickAt &&
      Date.now() -
        state.lastTickAt >
        15000
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

  renderMarketList();

  setupStrategies();

  setupControls();

  selectMarket(
    state.selectedSymbol
  );

  updateGlobalStats();

  setConnectionStatus(
    "CONNECTING"
  );

  connect();
}

/* =========================================================
   DOM READY
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initialize
);