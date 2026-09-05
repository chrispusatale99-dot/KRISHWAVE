/* =========================================================
   KRISHWAVE V3
   LIVE DERIV MARKET INTELLIGENCE + AI PREDICTION ENGINE
========================================================= */

"use strict";


/* =========================================================
   CONFIGURATION
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

  HIGH_CONFIDENCE: 65,

  AI_COUNTDOWN_SECONDS: 7

};


/* =========================================================
   VOLATILITY MARKETS
========================================================= */

const MARKET_DEFINITIONS = [

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

  socket: null,

  connected: false,

  engineRunning: false,

  selectedSymbol: "R_10",

  strategy: "AUTO",

  targetDigit: null,

  markets: new Map(),

  requestId: 1,

  historyRequests: new Map(),

  subscriptions: new Map(),

  totalTicks: 0,

  lastTickTime: 0,

  reconnectTimer: null,

  scannerTimer: null,

  watchdogTimer: null,

  aiTimer: null,

  aiCountdown: null,

  aiAnalysisRunning: false,

  pendingStrategy: null,

  intentionalClose: false,

  lastPrediction: null

};


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (id) =>
  document.getElementById(id);


function setText(id, value) {

  const element = $(id);

  if (element) {
    element.textContent = value;
  }

}


function safeNumber(value, fallback = 0) {

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;

}


/* =========================================================
   INITIAL MARKET STATE
========================================================= */

MARKET_DEFINITIONS.forEach((market) => {

  state.markets.set(
    market.symbol,
    {

      symbol: market.symbol,

      name: market.name,

      pipSize: null,

      ticks: [],

      quote: null,

      epoch: null,

      connected: false

    }
  );

});


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(status, connected) {

  setText(
    "connectionText",
    status
  );

  setText(
    "heroStreamStatus",
    connected
      ? "LIVE MARKET STREAM"
      : "MARKET STREAM OFFLINE"
  );

  const pill =
    $("connectionPill");

  const heroDot =
    $("heroConnectionDot");

  if (pill) {

    pill.dataset.state =
      connected
        ? "connected"
        : "offline";

  }

  if (heroDot) {

    heroDot.dataset.state =
      connected
        ? "connected"
        : "offline";

  }

}


function updateFooter(message) {

  setText(
    "footerStatus",
    message
  );

}


/* =========================================================
   REQUEST ID
========================================================= */

function nextRequestId() {

  return state.requestId++;

}


/* =========================================================
   SEND WEBSOCKET MESSAGE
========================================================= */

function send(message) {

  if (
    !state.socket ||
    state.socket.readyState !== WebSocket.OPEN
  ) {

    return false;

  }

  try {

    state.socket.send(
      JSON.stringify(message)
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
   CONNECT DERIV PUBLIC STREAM
========================================================= */

function connectDeriv() {

  if (
    state.socket &&
    (
      state.socket.readyState === WebSocket.OPEN ||
      state.socket.readyState === WebSocket.CONNECTING
    )
  ) {

    return;

  }


  state.intentionalClose = false;

  updateConnectionUI(
    "CONNECTING",
    false
  );

  updateFooter(
    "CONNECTING TO DERIV PUBLIC STREAM"
  );


  try {

    state.socket =
      new WebSocket(
        CONFIG.WS_URL
      );

  } catch (error) {

    console.error(error);

    scheduleReconnect();

    return;

  }


  state.socket.onopen = () => {

    state.connected = true;

    state.lastTickTime =
      Date.now();

    updateConnectionUI(
      "LIVE",
      true
    );

    updateFooter(
      "DERIV STREAM CONNECTED"
    );

    requestActiveSymbols();

    startWatchdog();

  };


  state.socket.onmessage = (event) => {

    handleMessage(event.data);

  };


  state.socket.onerror = (error) => {

    console.warn(
      "Deriv websocket error:",
      error
    );

    updateConnectionUI(
      "ERROR",
      false
    );

  };


  state.socket.onclose = () => {

    state.connected = false;

    updateConnectionUI(
      "RECONNECTING",
      false
    );

    stopWatchdog();

    if (!state.intentionalClose) {

      scheduleReconnect();

    }

  };

}


/* =========================================================
   RECONNECT
========================================================= */

function scheduleReconnect() {

  if (state.reconnectTimer) {
    return;
  }

  state.reconnectTimer =
    setTimeout(
      () => {

        state.reconnectTimer = null;

        connectDeriv();

      },
      CONFIG.RECONNECT_DELAY
    );

}


/* =========================================================
   ACTIVE SYMBOLS
========================================================= */

function requestActiveSymbols() {

  const id =
    nextRequestId();

  send({

    active_symbols: "brief",

    product_type: "basic",

    req_id: id

  });

}


/* =========================================================
   HISTORY REQUEST
========================================================= */

function requestHistory(symbol) {

  const id =
    nextRequestId();

  state.historyRequests.set(
    id,
    symbol
  );


  send({

    ticks_history: symbol,

    count: CONFIG.MAX_HISTORY,

    end: "latest",

    style: "ticks",

    req_id: id

  });

}


/* =========================================================
   LIVE SUBSCRIPTION
========================================================= */

function subscribeTicks(symbol) {

  if (
    state.subscriptions.has(symbol)
  ) {

    return;

  }


  const id =
    nextRequestId();


  const sent =
    send({

      ticks: symbol,

      subscribe: 1,

      req_id: id

    });


  if (sent) {

    state.subscriptions.set(
      symbol,
      id
    );

  }

}


/* =========================================================
   PROCESS ACTIVE SYMBOL RESPONSE
========================================================= */

function handleActiveSymbols(data) {

  const symbols =
    Array.isArray(data.active_symbols)
      ? data.active_symbols
      : [];


  let connectedMarkets = 0;


  symbols.forEach((item) => {

    const symbol =
      item.underlying_symbol ||
      item.symbol;


    if (!symbol) {
      return;
    }


    if (!state.markets.has(symbol)) {
      return;
    }


    const market =
      state.markets.get(symbol);


    market.pipSize =
      item.pip_size ??
      market.pipSize;


    market.name =
      item.underlying_symbol_name ||
      item.display_name ||
      market.name;


    requestHistory(symbol);

    subscribeTicks(symbol);

  });


  connectedMarkets =
    state.markets.size;


  setText(
    "connectedMarkets",
    connectedMarkets
  );


  renderMarketList();

}


/* =========================================================
   GENERIC MESSAGE HANDLER
========================================================= */

function handleMessage(raw) {

  let data;

  try {

    data =
      typeof raw === "string"
        ? JSON.parse(raw)
        : raw;

  } catch (error) {

    console.warn(
      "Invalid Deriv message",
      error
    );

    return;

  }


  if (
    data.error
  ) {

    console.warn(
      "Deriv API error:",
      data.error
    );

    return;

  }


  if (
    Array.isArray(
      data.active_symbols
    )
  ) {

    handleActiveSymbols(data);

  }


  if (
    data.history
  ) {

    handleHistory(data);

  }


  if (
    data.tick
  ) {

    handleTick(data.tick);

  }

}


/* =========================================================
   HISTORY
========================================================= */

function handleHistory(data) {

  const symbol =
    state.historyRequests.get(
      data.req_id
    );


  if (!symbol) {
    return;
  }


  state.historyRequests.delete(
    data.req_id
  );


  const market =
    state.markets.get(symbol);


  if (!market) {
    return;
  }


  const prices =
    Array.isArray(data.history?.prices)
      ? data.history.prices
      : [];


  const times =
    Array.isArray(data.history?.times)
      ? data.history.times
      : [];


  const ticks = [];


  prices.forEach(
    (price, index) => {

      const quote =
        safeNumber(price, NaN);


      if (!Number.isFinite(quote)) {
        return;
      }


      ticks.push({

        quote,

        epoch:
          safeNumber(
            times[index],
            Date.now() / 1000
          ),

        digit:
          extractDigit(
            quote,
            market.pipSize
          )

      });

    }
  );


  market.ticks =
    ticks.slice(
      -CONFIG.MAX_HISTORY
    );


  if (market.ticks.length) {

    const latest =
      market.ticks[
        market.ticks.length - 1
      ];


    market.quote =
      latest.quote;

    market.epoch =
      latest.epoch;

  }


  renderSelectedMarket();

  updateAIFromCurrentMarket();

}


/* =========================================================
   TICK HANDLER
========================================================= */

function handleTick(tick) {

  const symbol =
    tick.symbol;


  const market =
    state.markets.get(symbol);


  if (!market) {
    return;
  }


  const quote =
    safeNumber(
      tick.quote,
      NaN
    );


  if (!Number.isFinite(quote)) {
    return;
  }


  if (
    tick.pip_size !== undefined &&
    tick.pip_size !== null
  ) {

    market.pipSize =
      safeNumber(
        tick.pip_size,
        market.pipSize
      );

  }


  const digit =
    extractDigit(
      quote,
      market.pipSize
    );


  const item = {

    quote,

    epoch:
      safeNumber(
        tick.epoch,
        Date.now() / 1000
      ),

    digit

  };


  market.quote =
    quote;

  market.epoch =
    item.epoch;

  market.connected =
    true;


  market.ticks.push(item);


  if (
    market.ticks.length >
    CONFIG.MAX_HISTORY
  ) {

    market.ticks =
      market.ticks.slice(
        -CONFIG.MAX_HISTORY
      );

  }


  state.totalTicks++;

  state.lastTickTime =
    Date.now();


  setText(
    "liveTicks",
    state.totalTicks
  );


  if (
    symbol ===
    state.selectedSymbol
  ) {

    renderSelectedMarket();

    updateAIFromCurrentMarket();

  }

}


/* =========================================================
   DIGIT EXTRACTION
========================================================= */

function extractDigit(
  quote,
  pipSize
) {

  const numericQuote =
    Number(quote);


  if (
    !Number.isFinite(numericQuote)
  ) {

    return null;

  }


  let decimals = 2;


  if (
    Number.isFinite(
      Number(pipSize)
    )
  ) {

    const p =
      Number(pipSize);


    if (p > 0) {

      decimals =
        Math.max(
          0,
          Math.round(
            -Math.log10(p)
          )
        );

    }

  }


  const fixed =
    numericQuote.toFixed(
      decimals
    );


  const digits =
    fixed.replace(
      /\D/g,
      ""
    );


  if (!digits.length) {
    return null;
  }


  return Number(
    digits[
      digits.length - 1
    ]
  );

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


  container.innerHTML = "";


  MARKET_DEFINITIONS.forEach(
    (definition) => {

      const market =
        state.markets.get(
          definition.symbol
        );


      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";


      button.className =
        "market-item" +
        (
          definition.symbol ===
          state.selectedSymbol
            ? " active"
            : ""
        );


      const ticks =
        market?.ticks?.length || 0;


      const quote =
        market?.quote;


      button.innerHTML = `

        <div>

          <strong>
            ${escapeHTML(
              market?.name ||
              definition.name
            )}
          </strong>

          <span>
            ${definition.symbol}
          </span>

        </div>

        <div>

          <strong>
            ${
              Number.isFinite(
                quote
              )
                ? quote
                : "—"
            }
          </strong>

          <span>
            ${ticks} ticks
          </span>

        </div>

      `;


      button.addEventListener(
        "click",
        () => {

          selectMarket(
            definition.symbol
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
   MARKET SELECTION
========================================================= */

function selectMarket(symbol) {

  if (
    !state.markets.has(symbol)
  ) {

    return;

  }


  state.selectedSymbol =
    symbol;


  renderMarketList();

  renderSelectedMarket();

  updateAIFromCurrentMarket();

  resetAIStructure(
    "MARKET CHANGED"
  );

}


/* =========================================================
   SELECTED MARKET RENDER
========================================================= */

function renderSelectedMarket() {

  const market =
    state.markets.get(
      state.selectedSymbol
    );


  if (!market) {
    return;
  }


  const short =
    state.selectedSymbol;


  setText(
    "selectedMarketShort",
    short
  );


  setText(
    "selectedMarketCode",
    short
  );


  setText(
    "selectedMarketCodeLarge",
    short
  );


  setText(
    "selectedMarketName",
    market.name
  );


  setText(
    "liveQuote",
    Number.isFinite(
      market.quote
    )
      ? market.quote
      : "—"
  );


  setText(
    "quoteTime",
    market.epoch
      ? new Date(
          market.epoch * 1000
        ).toLocaleTimeString()
      : "Waiting for tick..."
  );


  const ticks =
    market.ticks || [];


  const last =
    ticks[
      ticks.length - 1
    ];


  setText(
    "lastDigit",
    last?.digit ??
    "—"
  );


  setText(
    "sampleSize",
    ticks.length
  );


  setText(
    "streakValue",
    getDigitStreak(
      ticks
    )
  );


  renderDigitDistribution(
    ticks
  );


  setText(
    "aiStructureMarket",
    state.selectedSymbol
  );


  setText(
    "aiStructureSample",
    `${ticks.length} ticks`
  );


  setText(
    "aiStructureDigit",
    last?.digit ??
    "—"
  );

}


/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigitDistribution(
  ticks
) {

  const counts =
    Array(10).fill(0);


  ticks.forEach(
    (tick) => {

      if (
        Number.isInteger(
          tick.digit
        ) &&
        tick.digit >= 0 &&
        tick.digit <= 9
      ) {

        counts[
          tick.digit
        ]++;

      }

    }
  );


  const total =
    ticks.length;


  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    const percent =
      total
        ? (
            counts[digit] /
            total
          ) * 100
        : 0;


    const fill =
      document.querySelector(
        `[data-fill-digit="${digit}"]`
      );


    const row =
      document.querySelector(
        `[data-digit="${digit}"]`
      );


    if (fill) {

      fill.style.width =
        `${Math.min(
          100,
          percent
        )}%`;

    }


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

  }

}


/* =========================================================
   STATISTICS
========================================================= */

function recentTicks() {

  const market =
    state.markets.get(
      state.selectedSymbol
    );


  return (
    market?.ticks || []
  ).slice(
    -CONFIG.RECENT_WINDOW
  );

}


function probability(
  ticks,
  predicate
) {

  if (!ticks.length) {
    return 0;
  }


  let matches = 0;


  ticks.forEach(
    (tick) => {

      if (
        predicate(
          tick
        )
      ) {

        matches++;

      }

    }
  );


  return (
    matches /
    ticks.length
  ) * 100;

}


/* =========================================================
   EVEN / ODD
========================================================= */

function evenProbability(
  ticks
) {

  return probability(
    ticks,
    (tick) =>
      Number.isInteger(
        tick.digit
      ) &&
      tick.digit % 2 === 0
  );

}


function oddProbability(
  ticks
) {

  return probability(
    ticks,
    (tick) =>
      Number.isInteger(
        tick.digit
      ) &&
      tick.digit % 2 !== 0
  );

}


/* =========================================================
   OVER / UNDER
========================================================= */

function overProbability(
  ticks,
  threshold
) {

  return probability(
    ticks,
    (tick) =>
      Number.isInteger(
        tick.digit
      ) &&
      tick.digit >
      threshold
  );

}


function underProbability(
  ticks,
  threshold
) {

  return probability(
    ticks,
    (tick) =>
      Number.isInteger(
        tick.digit
      ) &&
      tick.digit <
      threshold
  );

}


/* =========================================================
   MATCH / DIFFER
========================================================= */

function matchProbability(
  ticks,
  digit
) {

  if (
    !Number.isInteger(
      digit
    )
  ) {

    return 0;

  }


  return probability(
    ticks,
    (tick) =>
      tick.digit === digit
  );

}


function differProbability(
  ticks,
  digit
) {

  if (
    !Number.isInteger(
      digit
    )
  ) {

    return 0;

  }


  return probability(
    ticks,
    (tick) =>
      Number.isInteger(
        tick.digit
      ) &&
      tick.digit !== digit
  );

}


/* =========================================================
   DIGIT FREQUENCY
========================================================= */

function digitProbabilities(
  ticks
) {

  const counts =
    Array(10).fill(0);


  ticks.forEach(
    (tick) => {

      if (
        Number.isInteger(
          tick.digit
        )
      ) {

        counts[
          tick.digit
        ]++;

      }

    }
  );


  const total =
    ticks.length;


  return counts.map(
    (count) =>
      total
        ? (
            count /
            total
          ) * 100
        : 0
  );

}


function dominantDigit(
  ticks
) {

  const probabilities =
    digitProbabilities(
      ticks
    );


  let best =
    0;


  for (
    let i = 1;
    i < probabilities.length;
    i++
  ) {

    if (
      probabilities[i] >
      probabilities[best]
    ) {

      best = i;

    }

  }


  return {

    digit: best,

    rate:
      probabilities[best] || 0

  };

}


/* =========================================================
   MOMENTUM
========================================================= */

function momentum(
  ticks
) {

  if (
    ticks.length < 10
  ) {

    return 0;

  }


  let rises = 0;

  let falls = 0;


  for (
    let i = 1;
    i < ticks.length;
    i++
  ) {

    const previous =
      ticks[i - 1];

    const current =
      ticks[i];


    if (
      current.quote >
      previous.quote
    ) {

      rises++;

    } else if (
      current.quote <
      previous.quote
    ) {

      falls++;

    }

  }


  const total =
    rises + falls;


  if (!total) {
    return 0;
  }


  return (
    (rises - falls) /
    total
  ) * 100;

}


/* =========================================================
   DIGIT STREAK
========================================================= */

function getDigitStreak(
  ticks
) {

  if (!ticks.length) {
    return "—";
  }


  const last =
    ticks[
      ticks.length - 1
    ]?.digit;


  if (
    !Number.isInteger(
      last
    )
  ) {

    return "—";

  }


  let count = 0;


  for (
    let i = ticks.length - 1;
    i >= 0;
    i--
  ) {

    if (
      ticks[i].digit === last
    ) {

      count++;

    } else {

      break;

    }

  }


  return `${last} × ${count}`;

}


/* =========================================================
   UPDATE BASIC AI METRICS
========================================================= */

function updateAIFromCurrentMarket() {

  const ticks =
    recentTicks();


  if (!ticks.length) {
    return;
  }


  const even =
    evenProbability(
      ticks
    );


  const odd =
    oddProbability(
      ticks
    );


  const dominant =
    dominantDigit(
      ticks
    );


  const selectedDigit =
    Number.isInteger(
      state.targetDigit
    )
      ? state.targetDigit
      : dominant.digit;


  const match =
    matchProbability(
      ticks,
      selectedDigit
    );


  const differ =
    differProbability(
      ticks,
      selectedDigit
    );


  /*
     For the general probability cards,
     use the current dominant digit as a
     neutral reference threshold when the
     user has not configured OVER/UNDER.
  */

  const defaultThreshold =
    5;


  const over =
    overProbability(
      ticks,
      defaultThreshold
    );


  const under =
    underProbability(
      ticks,
      defaultThreshold
    );


  const momentumValue =
    momentum(
      ticks
    );


  const rise =
    Math.max(
      0,
      50 +
      momentumValue / 2
    );


  const fall =
    Math.max(
      0,
      50 -
      momentumValue / 2
    );


  setText(
    "evenPercent",
    formatPercent(even)
  );


  setText(
    "oddPercent",
    formatPercent(odd)
  );


  setText(
    "overPercent",
    formatPercent(over)
  );


  setText(
    "underPercent",
    formatPercent(under)
  );


  setText(
    "matchPercent",
    formatPercent(match)
  );


  setText(
    "differPercent",
    formatPercent(differ)
  );


  setText(
    "risePercent",
    formatPercent(rise)
  );


  setText(
    "fallPercent",
    formatPercent(fall)
  );


  setText(
    "dominantDigit",
    dominant.digit
  );


  setText(
    "dominantDigitRate",
    formatPercent(
      dominant.rate
    )
  );


  setText(
    "aiStructureDigit",
    ticks[
      ticks.length - 1
    ]?.digit ?? "—"
  );


  setText(
    "aiStructurePressure",
    `${dominant.digit} (${formatPercent(
      dominant.rate
    )})`
  );


  setText(
    "aiStructureSample",
    `${ticks.length} ticks`
  );


  setText(
    "aiStructureStrategy",
    getStrategyLabel()
  );

}


/* =========================================================
   STRATEGY LABEL
========================================================= */

function getStrategyLabel() {

  if (
    (
      state.strategy ===
      "MATCH" ||
      state.strategy ===
      "DIFFER" ||
      state.strategy ===
      "OVER" ||
      state.strategy ===
      "UNDER"
    ) &&
    Number.isInteger(
      state.targetDigit
    )
  ) {

    return `${state.strategy} ${state.targetDigit}`;

  }


  return state.strategy;

}


/* =========================================================
   FORMAT
========================================================= */

function formatPercent(
  value
) {

  if (
    !Number.isFinite(
      value
    )
  ) {

    return "—";

  }


  return `${value.toFixed(1)}%`;

}


/* =========================================================
   AI STRATEGY CALCULATION
========================================================= */

function calculateStrategy(
  strategy,
  ticks
) {

  const sample =
    ticks.length;


  if (
    sample <
    CONFIG.MIN_SAMPLE
  ) {

    return {

      strategy,

      signal:
        "WAIT",

      probability:
        0,

      confidence:
        0,

      strength:
        "INSUFFICIENT DATA",

      reason:
        `Waiting for at least ${CONFIG.MIN_SAMPLE} ticks.`

    };

  }


  const even =
    evenProbability(
      ticks
    );


  const odd =
    oddProbability(
      ticks
    );


  const dominant =
    dominantDigit(
      ticks
    );


  let probabilityValue =
    0;


  let expected =
    "WAIT";


  let reason =
    "";


  switch (strategy) {

    case "EVEN":

      probabilityValue =
        even;

      expected =
        even >= 50
          ? "EVEN"
          : "WAIT";

      reason =
        `Recent digits are ${formatPercent(
          even
        )} even and ${formatPercent(
          odd
        )} odd.`;

      break;


    case "ODD":

      probabilityValue =
        odd;

      expected =
        odd >= 50
          ? "ODD"
          : "WAIT";

      reason =
        `Recent digits are ${formatPercent(
          odd
        )} odd and ${formatPercent(
          even
        )} even.`;

      break;


    case "MATCH": {

      if (
        !Number.isInteger(
          state.targetDigit
        )
      ) {

        return {

          strategy,

          signal:
            "SET DIGIT",

          probability:
            0,

          confidence:
            0,

          strength:
            "CONFIGURATION",

          reason:
            "Choose a target digit from 0 to 9."

        };

      }


      probabilityValue =
        matchProbability(
          ticks,
          state.targetDigit
        );


      expected =
        probabilityValue >= 10
          ? `MATCH ${state.targetDigit}`
          : "WAIT";


      reason =
        `Digit ${state.targetDigit} appeared in ${formatPercent(
          probabilityValue
        )} of the recent sample.`;

      break;

    }


    case "DIFFER": {

      if (
        !Number.isInteger(
          state.targetDigit
        )
      ) {

        return {

          strategy,

          signal:
            "SET DIGIT",

          probability:
            0,

          confidence:
            0,

          strength:
            "CONFIGURATION",

          reason:
            "Choose the digit to avoid from 0 to 9."

        };

      }


      probabilityValue =
        differProbability(
          ticks,
          state.targetDigit
        );


      expected =
        probabilityValue >= 90
          ? `DIFFER ${state.targetDigit}`
          : "WAIT";


      reason =
        `Recent digits differed from ${state.targetDigit} in ${formatPercent(
          probabilityValue
        )} of observations.`;

      break;

    }


    case "OVER": {

      if (
        !Number.isInteger(
          state.targetDigit
        )
      ) {

        return {

          strategy,

          signal:
            "SET NUMBER",

          probability:
            0,

          confidence:
            0,

          strength:
            "CONFIGURATION",

          reason:
            "Choose an OVER threshold from 0 to 9."

        };

      }


      probabilityValue =
        overProbability(
          ticks,
          state.targetDigit
        );


      expected =
        probabilityValue >= 50
          ? `OVER ${state.targetDigit}`
          : "WAIT";


      reason =
        `Digits above ${state.targetDigit} occurred in ${formatPercent(
          probabilityValue
        )} of the recent sample.`;

      break;

    }


    case "UNDER": {

      if (
        !Number.isInteger(
          state.targetDigit
        )
      ) {

        return {

          strategy,

          signal:
            "SET NUMBER",

          probability:
            0,

          confidence:
            0,

          strength:
            "CONFIGURATION",

          reason:
            "Choose an UNDER threshold from 0 to 9."

        };

      }


      probabilityValue =
        underProbability(
          ticks,
          state.targetDigit
        );


      expected =
        probabilityValue >= 50
          ? `UNDER ${state.targetDigit}`
          : "WAIT";


      reason =
        `Digits below ${state.targetDigit} occurred in ${formatPercent(
          probabilityValue
        )} of the recent sample.`;

      break;

    }


    case "RISE": {

      const m =
        momentum(
          ticks
        );


      probabilityValue =
        Math.max(
          0,
          Math.min(
            100,
            50 + m / 2
          )
        );


      expected =
        m > 0
          ? "RISE"
          : "WAIT";


      reason =
        `Short-term quote momentum is ${m >= 0 ? "positive" : "negative"} at ${m.toFixed(
          1
        )}.`;

      break;

    }


    case "FALL": {

      const m =
        momentum(
          ticks
        );


      probabilityValue =
        Math.max(
          0,
          Math.min(
            100,
            50 - m / 2
          )
        );


      expected =
        m < 0
          ? "FALL"
          : "WAIT";


      reason =
        `Short-term quote momentum is ${m >= 0 ? "positive" : "negative"} at ${m.toFixed(
          1
        )}.`;

      break;

    }


    case "AUTO": {

      const candidates =
        buildCandidates(
          ticks
        );


      const best =
        candidates.sort(
          (a, b) =>
            b.score -
            a.score
        )[0];


      if (!best) {

        return {

          strategy:
            "AUTO",

          signal:
            "WAIT",

          probability:
            0,

          confidence:
            0,

          strength:
            "WEAK",

          reason:
            "No clear statistical edge."

        };

      }


      return best;

    }


    default:

      return {

        strategy,

        signal:
          "WAIT",

        probability:
          0,

        confidence:
          0,

        strength:
          "UNKNOWN",

        reason:
          "Unknown strategy."

      };

  }


  const confidence =
    calculateConfidence(
      probabilityValue,
      sample
    );


  const strength =
    getSignalStrength(
      probabilityValue,
      strategy
    );


  return {

    strategy,

    signal:
      expected,

    probability:
      probabilityValue,

    confidence,

    strength,

    reason,

    score:
      scoreSignal(
        probabilityValue,
        strategy
      )

  };

}


/* =========================================================
   AUTO CANDIDATES
========================================================= */

function buildCandidates(
  ticks
) {

  const candidates = [];


  const even =
    evenProbability(
      ticks
    );


  const odd =
    oddProbability(
      ticks
    );


  const dominant =
    dominantDigit(
      ticks
    );


  candidates.push({

    strategy:
      "EVEN",

    signal:
      even >= 50
        ? "EVEN"
        : "WAIT",

    probability:
      even,

    confidence:
      calculateConfidence(
        even,
        ticks.length
      ),

    strength:
      getSignalStrength(
        even,
        "EVEN"
      ),

    reason:
      `Even digits represent ${formatPercent(
        even
      )} of the recent sample.`,

    score:
      scoreSignal(
        even,
        "EVEN"
      )

  });


  candidates.push({

    strategy:
      "ODD",

    signal:
      odd >= 50
        ? "ODD"
        : "WAIT",

    probability:
      odd,

    confidence:
      calculateConfidence(
        odd,
        ticks.length
      ),

    strength:
      getSignalStrength(
        odd,
        "ODD"
      ),

    reason:
      `Odd digits represent ${formatPercent(
        odd
      )} of the recent sample.`,

    score:
      scoreSignal(
        odd,
        "ODD"
      )

  });


  const dominantMatch =
    dominant.rate;


  candidates.push({

    strategy:
      "MATCH",

    signal:
      dominantMatch >= 15
        ? `MATCH ${dominant.digit}`
        : "WAIT",

    probability:
      dominantMatch,

    confidence:
      calculateConfidence(
        dominantMatch,
        ticks.length
      ),

    strength:
      getSignalStrength(
        dominantMatch,
        "MATCH"
      ),

    reason:
      `Digit ${dominant.digit} currently has the strongest observed digit pressure.`,

    score:
      scoreSignal(
        dominantMatch,
        "MATCH"
      )

  });


  candidates.push({

    strategy:
      "DIFFER",

    signal:
      `DIFFER ${dominant.digit}`,

    probability:
      100 -
      dominantMatch,

    confidence:
      calculateConfidence(
        100 -
        dominantMatch,
        ticks.length
      ),

    strength:
      getSignalStrength(
        100 -
        dominantMatch,
        "DIFFER"
      ),

    reason:
      `The probability of differing from dominant digit ${dominant.digit} is ${formatPercent(
        100 -
        dominantMatch
      )}.`,

    score:
      scoreSignal(
        100 -
        dominantMatch,
        "DIFFER"
      )

  });


  const over =
    overProbability(
      ticks,
      5
    );


  const under =
    underProbability(
      ticks,
      5
    );


  candidates.push({

    strategy:
      "OVER",

    signal:
      over >= 50
        ? "OVER 5"
        : "WAIT",

    probability:
      over,

    confidence:
      calculateConfidence(
        over,
        ticks.length
      ),

    strength:
      getSignalStrength(
        over,
        "OVER"
      ),

    reason:
      `Digits above 5 represent ${formatPercent(
        over
      )} of the sample.`,

    score:
      scoreSignal(
        over,
        "OVER"
      )

  });


  candidates.push({

    strategy:
      "UNDER",

    signal:
      under >= 50
        ? "UNDER 5"
        : "WAIT",

    probability:
      under,

    confidence:
      calculateConfidence(
        under,
        ticks.length
      ),

    strength:
      getSignalStrength(
        under,
        "UNDER"
      ),

    reason:
      `Digits below 5 represent ${formatPercent(
        under
      )} of the sample.`,

    score:
      scoreSignal(
        under,
        "UNDER"
      )

  });


  const m =
    momentum(
      ticks
    );


  const rise =
    50 + m / 2;


  const fall =
    50 - m / 2;


  candidates.push({

    strategy:
      "RISE",

    signal:
      m > 0
        ? "RISE"
        : "WAIT",

    probability:
      rise,

    confidence:
      calculateConfidence(
        rise,
        ticks.length
      ),

    strength:
      getSignalStrength(
        rise,
        "RISE"
      ),

    reason:
      "Quote momentum is currently leaning upward.",

    score:
      scoreSignal(
        rise,
        "RISE"
      )

  });


  candidates.push({

    strategy:
      "FALL",

    signal:
      m < 0
        ? "FALL"
        : "WAIT",

    probability:
      fall,

    confidence:
      calculateConfidence(
        fall,
        ticks.length
      ),

    strength:
      getSignalStrength(
        fall,
        "FALL"
      ),

    reason:
      "Quote momentum is currently leaning downward.",

    score:
      scoreSignal(
        fall,
        "FALL"
      )

  });


  return candidates;

}


/* =========================================================
   CONFIDENCE
========================================================= */

function calculateConfidence(
  probabilityValue,
  sample
) {

  const edge =
    Math.abs(
      probabilityValue -
      50
    );


  const sampleFactor =
    Math.min(
      1,
      sample /
      100
    );


  const confidence =
    50 +
    (
      edge *
      0.8
    ) *
    sampleFactor;


  return Math.max(
    0,
    Math.min(
      99,
      confidence
    )
  );

}


/* =========================================================
   SIGNAL STRENGTH
========================================================= */

function getSignalStrength(
  probabilityValue,
  strategy
) {

  const edge =
    Math.abs(
      probabilityValue -
      50
    );


  /*
     MATCH is naturally lower-frequency.
     Its useful signal can therefore have
     a different interpretation.
  */

  if (
    strategy ===
    "MATCH"
  ) {

    if (
      probabilityValue >= 20
    ) {

      return "STRONG";

    }


    if (
      probabilityValue >= 14
    ) {

      return "MODERATE";

    }


    return "WEAK";

  }


  if (
    edge >=
    CONFIG.STRONG_EDGE
  ) {

    return "STRONG";

  }


  if (
    edge >= 2.5
  ) {

    return "MODERATE";

  }


  return "WEAK";

}


/* =========================================================
   SIGNAL SCORE
========================================================= */

function scoreSignal(
  probabilityValue,
  strategy
) {

  const edge =
    Math.abs(
      probabilityValue -
      50
    );


  let score =
    edge;


  if (
    strategy ===
    "MATCH"
  ) {

    score =
      probabilityValue;

  }


  return score;

}


/* =========================================================
   STRATEGY BUTTONS
========================================================= */

function setupStrategyButtons() {

  const buttons =
    document.querySelectorAll(
      ".strategy-button"
    );


  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const strategy =
            button.dataset.strategy;


          if (!strategy) {
            return;
          }


          handleStrategySelection(
            strategy
          );

        }
      );

    }
  );

}


/* =========================================================
   STRATEGY SELECTION
========================================================= */

function handleStrategySelection(
  strategy
) {

  /*
     AUTO, EVEN, ODD, RISE and FALL
     do not require a number.
  */

  if (
    strategy ===
    "AUTO" ||
    strategy ===
    "EVEN" ||
    strategy ===
    "ODD" ||
    strategy ===
    "RISE" ||
    strategy ===
    "FALL"
  ) {

    state.strategy =
      strategy;

    state.targetDigit =
      null;

    updateStrategyButtons();

    setStrategyLabel();

    startAIAnalysisCycle();

    return;

  }


  /*
     MATCH / DIFFER / OVER / UNDER
     require a number from the user.
  */

  state.pendingStrategy =
    strategy;

  openStrategyNumberModal(
    strategy
  );

}


/* =========================================================
   STRATEGY BUTTON VISUAL STATE
========================================================= */

function updateStrategyButtons() {

  const buttons =
    document.querySelectorAll(
      ".strategy-button"
    );


  buttons.forEach(
    (button) => {

      button.classList.toggle(
        "active",
        button.dataset.strategy ===
        state.strategy
      );

    }
  );

}


/* =========================================================
   STRATEGY LABEL
========================================================= */

function setStrategyLabel() {

  const label =
    getStrategyLabel();


  setText(
    "analysisStrategy",
    label
  );


  setText(
    "strategyCurrent",
    label
  );


  setText(
    "aiStructureStrategy",
    label
  );

}


/* =========================================================
   NUMBER MODAL
========================================================= */

function openStrategyNumberModal(
  strategy
) {

  const modal =
    $("strategyNumberModal");


  const input =
    $("strategyNumberInput");


  const title =
    $("strategyNumberTitle");


  const description =
    $("strategyNumberDescription");


  const error =
    $("strategyNumberError");


  if (!modal) {
    return;
  }


  if (title) {

    if (
      strategy ===
      "MATCH"
    ) {

      title.textContent =
        "MATCH — Target Digit";

    } else if (
      strategy ===
      "DIFFER"
    ) {

      title.textContent =
        "DIFFER — Digit to Avoid";

    } else if (
      strategy ===
      "OVER"
    ) {

      title.textContent =
        "OVER — Set Threshold";

    } else if (
      strategy ===
      "UNDER"
    ) {

      title.textContent =
        "UNDER — Set Threshold";

    }

  }


  if (description) {

    if (
      strategy ===
      "MATCH"
    ) {

      description.textContent =
        "Enter the digit from 0 to 9 that KRISHWAVE AI should try to match.";

    } else if (
      strategy ===
      "DIFFER"
    ) {

      description.textContent =
        "Enter the digit from 0 to 9 that KRISHWAVE AI should try to differ from.";

    } else if (
      strategy ===
      "OVER"
    ) {

      description.textContent =
        "Enter a digit from 0 to 9. OVER means the next digit is above this threshold.";

    } else if (
      strategy ===
      "UNDER"
    ) {

      description.textContent =
        "Enter a digit from 0 to 9. UNDER means the next digit is below this threshold.";

    }

  }


  if (error) {
    error.textContent = "";
  }


  if (input) {

    input.value =
      Number.isInteger(
        state.targetDigit
      )
        ? state.targetDigit
        : "";

  }


  modal.hidden =
    false;


  setTimeout(
    () => {

      if (input) {

        input.focus();

        input.select();

      }

    },
    50
  );

}


/* =========================================================
   CLOSE NUMBER MODAL
========================================================= */

function closeStrategyNumberModal() {

  const modal =
    $("strategyNumberModal");


  if (modal) {

    modal.hidden =
      true;

  }


  state.pendingStrategy =
    null;

}


/* =========================================================
   APPLY NUMBER
========================================================= */

function applyStrategyNumber() {

  const input =
    $("strategyNumberInput");


  const error =
    $("strategyNumberError");


  const strategy =
    state.pendingStrategy;


  if (!input || !strategy) {
    return;
  }


  const value =
    Number(
      input.value
    );


  if (
    !Number.isInteger(
      value
    ) ||
    value < 0 ||
    value > 9
  ) {

    if (error) {

      error.textContent =
        "Enter a whole number from 0 to 9.";

    }

    return;

  }


  state.strategy =
    strategy;


  state.targetDigit =
    value;


  closeStrategyNumberModal();

  updateStrategyButtons();

  setStrategyLabel();

  startAIAnalysisCycle();

}


/* =========================================================
   MODAL BUTTONS
========================================================= */

function setupNumberModal() {

  const apply =
    $("applyStrategyNumber");


  const cancel =
    $("cancelStrategyNumber");


  const input =
    $("strategyNumberInput");


  if (apply) {

    apply.addEventListener(
      "click",
      applyStrategyNumber
    );

  }


  if (cancel) {

    cancel.addEventListener(
      "click",
      closeStrategyNumberModal
    );

  }


  if (input) {

    input.addEventListener(
      "keydown",
      (event) => {

        if (
          event.key ===
          "Enter"
        ) {

          applyStrategyNumber();

        }


        if (
          event.key ===
          "Escape"
        ) {

          closeStrategyNumberModal();

        }

      }
    );

  }


  document.addEventListener(
    "keydown",
    (event) => {

      const modal =
        $("strategyNumberModal");


      if (
        event.key ===
        "Escape" &&
        modal &&
        !modal.hidden
      ) {

        closeStrategyNumberModal();

      }

    }
  );

}


/* =========================================================
   7-SECOND AI ANALYSIS CYCLE
========================================================= */

function startAIAnalysisCycle() {

  stopAICycle();

  const ticks =
    recentTicks();


  if (
    ticks.length <
    CONFIG.MIN_SAMPLE
  ) {

    resetAIStructure(
      "WAITING FOR DATA"
    );


    setText(
      "analysisSignal",
      "WAIT"
    );


    setText(
      "analysisReason",
      `KRISHWAVE needs at least ${CONFIG.MIN_SAMPLE} ticks before running the 7-second analysis.`
    );


    setText(
      "analysisConfidence",
      "0%"
    );


    return;

  }


  state.aiAnalysisRunning =
    true;


  state.aiCountdown =
    CONFIG.AI_COUNTDOWN_SECONDS;


  const structure =
    $("aiAnalysisStructure");


  if (structure) {

    structure.classList.remove(
      "strong",
      "waiting"
    );

    structure.classList.add(
      "analyzing"
    );

  }


  setText(
    "aiLiveIndicator",
    "ANALYZING"
  );


  setText(
    "aiCircleStatus",
    "AI ANALYZING"
  );


  setText(
    "aiCountdown",
    state.aiCountdown
  );


  setText(
    "aiResultStatus",
    "ANALYZING"
  );


  setText(
    "aiResultMain",
    getStrategyLabel()
  );


  setText(
    "aiResultConfidence",
    "CALCULATING"
  );


  setText(
    "engineState",
    "ANALYZING"
  );


  setText(
    "engineStateDetail",
    "7-second AI market analysis"
  );


  setText(
    "engineStatus",
    "ANALYZING"
  );


  setText(
    "tradingEngineStatus",
    "ANALYZING"
  );


  setText(
    "lastTradeAction",
    "AI ANALYSIS"
  );


  let remaining =
    CONFIG.AI_COUNTDOWN_SECONDS;


  state.aiTimer =
    setInterval(
      () => {

        remaining--;

        state.aiCountdown =
          remaining;


        setText(
          "aiCountdown",
          Math.max(
            0,
            remaining
          )
        );


        if (
          remaining <= 0
        ) {

          clearInterval(
            state.aiTimer
          );


          state.aiTimer =
            null;


          finishAIAnalysis();

        }

      },
      1000
    );

}


/* =========================================================
   STOP AI CYCLE
========================================================= */

function stopAICycle() {

  if (state.aiTimer) {

    clearInterval(
      state.aiTimer
    );

    state.aiTimer =
      null;

  }


  state.aiAnalysisRunning =
    false;

}


/* =========================================================
   FINISH AI ANALYSIS
========================================================= */

function finishAIAnalysis() {

  state.aiAnalysisRunning =
    false;


  const ticks =
    recentTicks();


  const result =
    calculateStrategy(
      state.strategy,
      ticks
    );


  state.lastPrediction =
    result;


  renderPrediction(
    result
  );

}


/* =========================================================
   RENDER FINAL PREDICTION
========================================================= */

function renderPrediction(
  result
) {

  const structure =
    $("aiAnalysisStructure");


  const isStrong =
    result.signal !==
    "WAIT" &&
    result.signal !==
    "SET DIGIT" &&
    result.signal !==
    "SET NUMBER" &&
    result.confidence >=
    CONFIG.HIGH_CONFIDENCE;


  const isWeak =
    result.signal ===
    "WAIT" ||
    result.confidence <
    CONFIG.HIGH_CONFIDENCE;


  if (structure) {

    structure.classList.remove(
      "analyzing",
      "strong",
      "waiting"
    );


    structure.classList.add(
      isStrong
        ? "strong"
        : "waiting"
    );

  }


  setText(
    "aiLiveIndicator",
    isStrong
      ? "SIGNAL READY"
      : "WAIT"
  );


  setText(
    "aiCountdown",
    isStrong
      ? "✓"
      : "!"
  );


  setText(
    "aiCircleStatus",
    isStrong
      ? "SIGNAL READY"
      : "WAIT"
  );


  setText(
    "aiResultStatus",
    isStrong
      ? "TRADE NOW"
      : "WAIT"
  );


  setText(
    "aiResultMain",
    result.signal
  );


  setText(
    "aiResultConfidence",
    formatPercent(
      result.confidence
    )
  );


  setText(
    "analysisSignal",
    result.signal
  );


  setText(
    "analysisReason",
    result.reason
  );


  setText(
    "analysisStrategy",
    getStrategyLabel()
  );


  setText(
    "analysisConfidence",
    formatPercent(
      result.confidence
    )
  );


  setText(
    "aiStructureStrategy",
    getStrategyLabel()
  );


  setText(
    "aiStructureStrength",
    result.strength
  );


  setText(
    "engineState",
    isStrong
      ? "SIGNAL"
      : "WAIT"
  );


  setText(
    "engineStateDetail",
    isStrong
      ? "AI condition threshold reached"
      : "No strong statistical edge"
  );


  setText(
    "engineStatus",
    isStrong
      ? "SIGNAL READY"
      : "WAIT"
  );


  setText(
    "tradingEngineStatus",
    isStrong
      ? "SIGNAL READY"
      : "WAIT"
  );


  setText(
    "lastTradeAction",
    isStrong
      ? "TRADE NOW SIGNAL"
      : "WAIT"
  );


  updateAIFromCurrentMarket();

}


/* =========================================================
   RESET AI STRUCTURE
========================================================= */

function resetAIStructure(
  message = "SELECT STRATEGY"
) {

  stopAICycle();


  const structure =
    $("aiAnalysisStructure");


  if (structure) {

    structure.classList.remove(
      "analyzing",
      "strong",
      "waiting"
    );

  }


  setText(
    "aiLiveIndicator",
    "READY"
  );


  setText(
    "aiCountdown",
    "—"
  );


  setText(
    "aiCircleStatus",
    message
  );


  setText(
    "aiResultStatus",
    "AI READY"
  );


  setText(
    "aiResultMain",
    "Select a strategy to begin"
  );


  setText(
    "aiResultConfidence",
    "—"
  );


  setText(
    "aiStructureStrength",
    "—"
  );

}


/* =========================================================
   START / STOP ENGINE
========================================================= */

function startEngine() {

  state.engineRunning =
    true;


  setText(
    "engineState",
    "RUNNING"
  );


  setText(
    "engineStateDetail",
    "AI engine monitoring market"
  );


  setText(
    "engineStatus",
    "RUNNING"
  );


  setText(
    "tradingEngineStatus",
    "RUNNING"
  );


  setText(
    "lastTradeAction",
    "ANALYSIS ONLY"
  );


  startScanner();


  startAIAnalysisCycle();

}


function stopEngine() {

  state.engineRunning =
    false;


  stopAICycle();


  if (state.scannerTimer) {

    clearInterval(
      state.scannerTimer
    );

    state.scannerTimer =
      null;

  }


  setText(
    "engineState",
    "STOPPED"
  );


  setText(
    "engineStateDetail",
    "AI engine stopped"
  );


  setText(
    "engineStatus",
    "STOPPED"
  );


  setText(
    "tradingEngineStatus",
    "STOPPED"
  );


  setText(
    "lastTradeAction",
    "ANALYSIS ONLY"
  );


  resetAIStructure(
    "ENGINE STOPPED"
  );

}


/* =========================================================
   SCANNER
========================================================= */

function startScanner() {

  if (state.scannerTimer) {
    return;
  }


  state.scannerTimer =
    setInterval(
      () => {

        if (
          state.engineRunning
        ) {

          scanMarkets();

        }

      },
      5000
    );


  scanMarkets();

}


/* =========================================================
   MARKET SCAN
========================================================= */

function scanMarkets() {

  let best =
    null;


  state.markets.forEach(
    (market) => {

      const ticks =
        market.ticks.slice(
          -CONFIG.RECENT_WINDOW
        );


      if (
        ticks.length <
        CONFIG.MIN_SAMPLE
      ) {

        return;

      }


      const candidates =
        buildCandidates(
          ticks
        );


      if (!candidates.length) {
        return;
      }


      const candidate =
        candidates.sort(
          (a, b) =>
            b.score -
            a.score
        )[0];


      if (
        !best ||
        candidate.score >
        best.score
      ) {

        best = {

          symbol:
            market.symbol,

          name:
            market.name,

          score:
            candidate.score,

          candidate

        };

      }

    }
  );


  if (
    best &&
    state.strategy ===
    "AUTO"
  ) {

    if (
      best.symbol !==
      state.selectedSymbol
    ) {

      selectMarket(
        best.symbol
      );

    }

  }


  renderMarketList();

}


/* =========================================================
   SCAN ALL BUTTON
========================================================= */

function setupScanButton() {

  const button =
    $("scanAll");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    () => {

      scanMarkets();

      startAIAnalysisCycle();

    }
  );

}


/* =========================================================
   WATCHDOG
========================================================= */

function startWatchdog() {

  stopWatchdog();


  state.watchdogTimer =
    setInterval(
      () => {

        if (!state.connected) {
          return;
        }


        const elapsed =
          Date.now() -
          state.lastTickTime;


        if (
          elapsed >
          CONFIG.WATCHDOG_MS
        ) {

          console.warn(
            "KRISHWAVE watchdog: no recent ticks"
          );

          updateFooter(
            "WAITING FOR LIVE TICKS"
          );

        }

      },
      5000
    );

}


function stopWatchdog() {

  if (
    state.watchdogTimer
  ) {

    clearInterval(
      state.watchdogTimer
    );

    state.watchdogTimer =
      null;

  }

}


/* =========================================================
   CONNECT BUTTON
========================================================= */

function setupAccountButtons() {

  const connect =
    $("connectDeriv");


  const disconnect =
    $("disconnectDeriv");


  if (connect) {

    connect.addEventListener(
      "click",
      () => {

        /*
           Public market data is already
           available without account login.

           This button deliberately does not
           pretend to authenticate an account.
        */

        connectDeriv();

        setText(
          "accountLoginStatus",
          "MARKET DATA ONLY"
        );

        setText(
          "accountStatus",
          "PUBLIC DATA"
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


  if (disconnect) {

    disconnect.addEventListener(
      "click",
      () => {

        disconnectPublicStream();

      }
    );

  }

}


/* =========================================================
   DISCONNECT
========================================================= */

function disconnectPublicStream() {

  state.intentionalClose =
    true;


  state.connected =
    false;


  stopWatchdog();


  if (state.socket) {

    try {

      state.socket.close();

    } catch (error) {

      console.warn(error);

    }

  }


  state.socket =
    null;


  updateConnectionUI(
    "DISCONNECTED",
    false
  );


  setText(
    "accountLoginStatus",
    "NOT CONNECTED"
  );


  setText(
    "accountStatus",
    "NOT CONNECTED"
  );


  updateFooter(
    "MARKET STREAM DISCONNECTED"
  );

}


/* =========================================================
   START / STOP BUTTON SETUP
========================================================= */

function setupEngineButtons() {

  const start =
    $("start");


  const stop =
    $("stop");


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

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(
  value
) {

  return String(
    value
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


/* =========================================================
   INITIALIZE
========================================================= */

function initializeKRISHWAVE() {

  setupStrategyButtons();

  setupNumberModal();

  setupScanButton();

  setupEngineButtons();

  setupAccountButtons();


  setStrategyLabel();


  renderMarketList();

  renderSelectedMarket();


  setText(
    "tradeCount",
    "0"
  );


  setText(
    "lastTradeAction",
    "ANALYSIS ONLY"
  );


  setText(
    "tradingModeBadge",
    "ANALYSIS ONLY"
  );


  resetAIStructure(
    "SELECT STRATEGY"
  );


  updateFooter(
    "KRISHWAVE V3 READY"
  );


  /*
     Connect automatically to public
     market data.
  */

  connectDeriv();


  /*
     Keep the engine stopped until the
     user presses START AI ENGINE.
  */

  state.engineRunning =
    false;

}


/* =========================================================
   START APPLICATION
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeKRISHWAVE
  );

} else {

  initializeKRISHWAVE();

