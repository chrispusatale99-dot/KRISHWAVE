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

  initialized: false,

  lastPrediction: null

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
    element.textContent = value;
  }

}


function safeNumber(value, fallback = 0) {

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;

}


function escapeHTML(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   INITIAL MARKET STATE
========================================================= */

MARKET_DEFINITIONS.forEach((definition) => {

  state.markets.set(

    definition.symbol,

    {

      symbol:
        definition.symbol,

      name:
        definition.name,

      pipSize:
        null,

      ticks:
        [],

      quote:
        null,

      epoch:
        null,

      connected:
        false,

      available:
        false

    }

  );

});


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(
  status,
  connected
) {

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

  const id =
    state.requestId;

  state.requestId++;

  return id;

}


/* =========================================================
   SEND
========================================================= */

function send(message) {

  if (
    !state.socket ||
    state.socket.readyState !==
      WebSocket.OPEN
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
   CONNECT DERIV PUBLIC MARKET STREAM
========================================================= */

function connectDeriv() {

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


  state.intentionalClose =
    false;


  updateConnectionUI(
    "CONNECTING",
    false
  );


  updateFooter(
    "CONNECTING TO DERIV PUBLIC STREAM..."
  );


  try {

    state.socket =
      new WebSocket(
        CONFIG.WS_URL
      );

  } catch (error) {

    console.error(
      "WebSocket creation failed:",
      error
    );


    updateFooter(
      "WEBSOCKET CREATION FAILED"
    );


    scheduleReconnect();

    return;

  }


  state.socket.onopen =
    () => {

      state.connected =
        true;


      state.lastTickTime =
        Date.now();


      updateConnectionUI(
        "LIVE",
        true
      );


      updateFooter(
        "DERIV PUBLIC STREAM CONNECTED"
      );


      /*
         IMPORTANT:
         New Deriv active_symbols
         no longer uses product_type.
      */

      requestActiveSymbols();


      startWatchdog();

    };


  state.socket.onmessage =
    (event) => {

      handleMessage(
        event.data
      );

    };


  state.socket.onerror =
    (error) => {

      console.warn(
        "Deriv WebSocket error:",
        error
      );


      updateConnectionUI(
        "ERROR",
        false
      );


      updateFooter(
        "DERIV WEBSOCKET ERROR — RETRYING"
      );

    };


  state.socket.onclose =
    (event) => {

      state.connected =
        false;


      stopWatchdog();


      updateConnectionUI(
        "RECONNECTING",
        false
      );


      updateFooter(
        `STREAM CLOSED (${event.code}) — RECONNECTING`
      );


      if (
        !state.intentionalClose
      ) {

        scheduleReconnect();

      }

    };

}


/* =========================================================
   RECONNECT
========================================================= */

function scheduleReconnect() {

  if (
    state.reconnectTimer
  ) {

    return;

  }


  state.reconnectTimer =
    setTimeout(
      () => {

        state.reconnectTimer =
          null;

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


  const sent =
    send({

      active_symbols:
        "brief",

      req_id:
        id

    });


  if (!sent) {

    updateFooter(
      "ACTIVE SYMBOL REQUEST FAILED"
    );

  }

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


  const sent =
    send({

      ticks_history:
        symbol,

      count:
        CONFIG.MAX_HISTORY,

      end:
        "latest",

      style:
        "ticks",

      subscribe:
        0,

      req_id:
        id

    });


  if (!sent) {

    state.historyRequests.delete(
      id
    );

  }

}


/* =========================================================
   LIVE TICK SUBSCRIPTION
========================================================= */

function subscribeTicks(symbol) {

  if (
    state.subscriptions.has(
      symbol
    )
  ) {

    return;

  }


  const id =
    nextRequestId();


  const sent =
    send({

      ticks:
        symbol,

      subscribe:
        1,

      req_id:
        id

    });


  if (sent) {

    state.subscriptions.set(
      symbol,
      id
    );

  }

}


/* =========================================================
   ACTIVE SYMBOL RESPONSE
========================================================= */

function handleActiveSymbols(data) {

  const symbols =
    Array.isArray(
      data.active_symbols
    )
      ? data.active_symbols
      : [];


  if (!symbols.length) {

    updateFooter(
      "DERIV RETURNED NO ACTIVE SYMBOLS"
    );

    return;

  }


  let matched =
    0;


  symbols.forEach(
    (item) => {

      const symbol =
        item.underlying_symbol ||
        item.symbol;


      if (!symbol) {
        return;
      }


      if (
        !state.markets.has(
          symbol
        )
      ) {

        return;

      }


      const market =
        state.markets.get(
          symbol
        );


      market.available =
        true;


      market.pipSize =
        item.pip_size ??
        market.pipSize;


      market.name =
        item.underlying_symbol_name ||
        item.display_name ||
        market.name;


      matched++;


      requestHistory(
        symbol
      );


      subscribeTicks(
        symbol
      );

    }
  );


  setText(
    "connectedMarkets",
    matched
  );


  updateFooter(
    `${matched} VOLATILITY MARKETS CONNECTED`
  );


  renderMarketList();

}


/* =========================================================
   ERROR HANDLER
========================================================= */

function handleAPIError(
  error
) {

  console.error(
    "KRISHWAVE DERIV API ERROR:",
    error
  );


  const message =
    error?.message ||
    error?.code ||
    "Unknown Deriv API error";


  updateFooter(
    `DERIV ERROR: ${message}`
  );


  setText(
    "connectionText",
    "API ERROR"
  );

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
      "Invalid JSON from Deriv:",
      error
    );

    return;

  }


  if (
    data.error
  ) {

    handleAPIError(
      data.error
    );

    return;

  }


  switch (
    data.msg_type
  ) {

    case "active_symbols":

      handleActiveSymbols(
        data
      );

      break;


    case "history":

      handleHistory(
        data
      );

      break;


    case "tick":

      handleTick(
        data.tick
      );

      break;


    case "ping":

      break;


    default:

      /*
         Some public API responses can
         still contain useful data even if
         msg_type handling changes.
      */

      if (
        Array.isArray(
          data.active_symbols
        )
      ) {

        handleActiveSymbols(
          data
        );

      }


      if (
        data.history
      ) {

        handleHistory(
          data
        );

      }


      if (
        data.tick
      ) {

        handleTick(
          data.tick
        );

      }

      break;

  }

}


/* =========================================================
   HISTORY HANDLER
========================================================= */

function handleHistory(data) {

  const symbol =
    state.historyRequests.get(
      data.req_id
    );


  if (!symbol) {

    /*
       New API may not guarantee
       echo_req, so if req_id is absent
       try the first pending history.
    */

    const first =
      state.historyRequests.entries()
        .next()
        .value;


    if (!first) {
      return;
    }


    const fallbackId =
      first[0];


    const fallbackSymbol =
      first[1];


    state.historyRequests.delete(
      fallbackId
    );


    processHistory(
      fallbackSymbol,
      data
    );


    return;

  }


  state.historyRequests.delete(
    data.req_id
  );


  processHistory(
    symbol,
    data
  );

}


/* =========================================================
   PROCESS HISTORY
========================================================= */

function processHistory(
  symbol,
  data
) {

  const market =
    state.markets.get(
      symbol
    );


  if (!market) {
    return;
  }


  if (
    Number.isFinite(
      Number(data.pip_size)
    )
  ) {

    market.pipSize =
      Number(
        data.pip_size
      );

  }


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


  const ticks =
    [];


  prices.forEach(
    (price, index) => {

      const quote =
        safeNumber(
          price,
          NaN
        );


      if (
        !Number.isFinite(
          quote
        )
      ) {

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


  if (
    market.ticks.length
  ) {

    const latest =
      market.ticks[
        market.ticks.length - 1
      ];


    market.quote =
      latest.quote;


    market.epoch =
      latest.epoch;

  }


  market.connected =
    market.ticks.length > 0;


  if (
    state.selectedSymbol ===
    symbol
  ) {

    renderSelectedMarket();

    updateAIFromCurrentMarket();

  }


  renderMarketList();


  /*
     If the engine is already running,
     allow the AI to start once enough
     history has arrived.
  */

  if (
    state.engineRunning &&
    !state.aiAnalysisRunning &&
    state.strategy !== "AUTO"
  ) {

    const ticksNow =
      recentTicks();


    if (
      ticksNow.length >=
      CONFIG.MIN_SAMPLE
    ) {

      startAIAnalysisCycle();

    }

  }

}


/* =========================================================
   TICK HANDLER
========================================================= */

function handleTick(tick) {

  if (!tick) {
    return;
  }


  const symbol =
    tick.symbol;


  if (!symbol) {
    return;
  }


  const market =
    state.markets.get(
      symbol
    );


  if (!market) {

    return;

  }


  const quote =
    safeNumber(
      tick.quote,
      NaN
    );


  if (
    !Number.isFinite(
      quote
    )
  ) {

    return;

  }


  if (
    tick.pip_size !==
      undefined &&
    tick.pip_size !==
      null
  ) {

    const pip =
      safeNumber(
        tick.pip_size,
        NaN
      );


    if (
      Number.isFinite(
        pip
      )
    ) {

      market.pipSize =
        pip;

    }

  }


  const item = {

    quote,

    epoch:
      safeNumber(
        tick.epoch,
        Date.now() / 1000
      ),

    digit:
      extractDigit(
        quote,
        market.pipSize
      )

  };


  market.quote =
    quote;


  market.epoch =
    item.epoch;


  market.connected =
    true;


  market.available =
    true;


  market.ticks.push(
    item
  );


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


  renderMarketList();


  /*
     When the user selected a strategy
     but the engine is stopped, we still
     allow the interface to update.

     When engine is running, restart a
     fresh 7-second analysis only when
     the previous cycle has completed.
  */

  if (
    state.engineRunning &&
    !state.aiAnalysisRunning &&
    recentTicks().length >=
      CONFIG.MIN_SAMPLE
  ) {

    startAIAnalysisCycle();

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
    Number(
      quote
    );


  if (
    !Number.isFinite(
      numericQuote
    )
  ) {

    return null;

  }


  let decimals =
    2;


  const numericPip =
    Number(
      pipSize
    );


  if (
    Number.isFinite(
      numericPip
    ) &&
    numericPip > 0
  ) {

    decimals =
      Math.max(
        0,
        Math.round(
          -Math.log10(
            numericPip
          )
        )
      );

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


  container.innerHTML =
    "";


  MARKET_DEFINITIONS.forEach(
    (definition) => {

      const market =
        state.markets.get(
          definition.symbol
        );


      if (!market) {
        return;
      }


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
        market.ticks.length;


      const quote =
        market.quote;


      button.innerHTML = `

        <div>

          <strong>
            ${escapeHTML(
              market.name
            )}
          </strong>

          <span>
            ${escapeHTML(
              definition.symbol
            )}
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
   SELECT MARKET
========================================================= */

function selectMarket(symbol) {

  if (
    !state.markets.has(
      symbol
    )
  ) {

    return;

  }


  state.selectedSymbol =
    symbol;


  stopAICycle();


  renderMarketList();

  renderSelectedMarket();

  updateAIFromCurrentMarket();


  resetAIStructure(
    "MARKET CHANGED"
  );


  if (
    state.engineRunning
  ) {

    setTimeout(
      () => {

        if (
          state.engineRunning
        ) {

          startAIAnalysisCycle();

        }

      },
      100
    );

  }

}


/* =========================================================
   SELECTED MARKET
========================================================= */

function renderSelectedMarket() {

  const market =
    state.markets.get(
      state.selectedSymbol
    );


  if (!market) {
    return;
  }


  setText(
    "selectedMarketShort",
    state.selectedSymbol
  );


  setText(
    "selectedMarketCode",
    state.selectedSymbol
  );


  setText(
    "selectedMarketCodeLarge",
    state.selectedSymbol
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
    market.ticks;


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
    ticks.filter(
      (tick) =>
        Number.isInteger(
          tick.digit
        )
    ).length;


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
   RECENT TICKS
========================================================= */

function recentTicksForMarket(
  symbol
) {

  const market =
    state.markets.get(
      symbol
    );


  return (
    market?.ticks || []
  ).slice(
    -CONFIG.RECENT_WINDOW
  );

}


function recentTicks() {

  return recentTicksForMarket(
    state.selectedSymbol
  );

}


/* =========================================================
   GENERIC PROBABILITY
========================================================= */

function probability(
  ticks,
  predicate
) {

  if (!ticks.length) {
    return 0;
  }


  const valid =
    ticks.filter(
      (tick) =>
        Number.isInteger(
          tick.digit
        )
    );


  if (!valid.length) {
    return 0;
  }


  let matches =
    0;


  valid.forEach(
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
    valid.length
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
      tick.digit % 2 ===
      0
  );

}


function oddProbability(
  ticks
) {

  return probability(
    ticks,
    (tick) =>
      tick.digit % 2 !==
      0
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
      tick.digit ===
      digit
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
      tick.digit !==
      digit
  );

}


/* =========================================================
   DIGIT PROBABILITIES
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
    counts.reduce(
      (sum, value) =>
        sum + value,
      0
    );


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


/* =========================================================
   DOMINANT DIGIT
========================================================= */

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

      best =
        i;

    }

  }


  return {

    digit:
      best,

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


  let rises =
    0;


  let falls =
    0;


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
    rises +
    falls;


  if (!total) {
    return 0;
  }


  return (
    (rises -
      falls) /
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


  let count =
    0;


  for (
    let i =
      ticks.length - 1;
    i >= 0;
    i--
  ) {

    if (
      ticks[i].digit ===
      last
    ) {

      count++;

    } else {

      break;

    }

  }


  return `${last} × ${count}`;

}


/* =========================================================
   FORMAT PERCENT
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


  return `${value.toFixed(
    1
  )}%`;

}


/* =========================================================
   STRATEGY LABEL
========================================================= */

function getStrategyLabel() {

  const numbered =
    [
      "MATCH",
      "DIFFER",
      "OVER",
      "UNDER"
    ];


  if (
    numbered.includes(
      state.strategy
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
   BASIC AI METRICS
========================================================= */

function updateAIFromCurrentMarket() {

  const ticks =
    recentTicks();


  if (!ticks.length) {

    setText(
      "evenPercent",
      "—"
    );

    setText(
      "oddPercent",
      "—"
    );

    setText(
      "overPercent",
      "—"
    );

    setText(
      "underPercent",
      "—"
    );

    setText(
      "matchPercent",
      "—"
    );

    setText(
      "differPercent",
      "—"
    );

    setText(
      "risePercent",
      "—"
    );

    setText(
      "fallPercent",
      "—"
    );

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


  const m =
    momentum(
      ticks
    );


  const rise =
    Math.max(
      0,
      Math.min(
        100,
        50 + m / 2
      )
    );


  const fall =
    Math.max(
      0,
      Math.min(
        100,
        50 - m / 2
      )
    );


  setText(
    "evenPercent",
    formatPercent(
      even
    )
  );


  setText(
    "oddPercent",
    formatPercent(
      odd
    )
  );


  setText(
    "overPercent",
    formatPercent(
      over
    )
  );


  setText(
    "underPercent",
    formatPercent(
      under
    )
  );


  setText(
    "matchPercent",
    formatPercent(
      match
    )
  );


  setText(
    "differPercent",
    formatPercent(
      differ
    )
  );


  setText(
    "risePercent",
    formatPercent(
      rise
    )
  );


  setText(
    "fallPercent",
    formatPercent(
      fall
    )
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


  const last =
    ticks[
      ticks.length - 1
    ];


  setText(
    "aiStructureDigit",
    last?.digit ??
      "—"
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


  setStrategyLabel();

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
      sample / 100
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


  if (
    strategy ===
    "MATCH"
  ) {

    if (
      probabilityValue >=
      20
    ) {

      return "STRONG";

    }


    if (
      probabilityValue >=
      14
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
    edge >=
    2.5
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

  if (
    strategy ===
    "MATCH"
  ) {

    return probabilityValue;

  }


  return Math.abs(
    probabilityValue -
    50
  );

}


/* =========================================================
   BUILD AUTO CANDIDATES
========================================================= */

function buildCandidates(
  ticks
) {

  const candidates =
    [];


  if (
    ticks.length <
    CONFIG.MIN_SAMPLE
  ) {

    return candidates;

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
      `Recent digits are ${formatPercent(
        even
      )} even and ${formatPercent(
        odd
      )} odd.`,

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
      `Recent digits are ${formatPercent(
        odd
      )} odd and ${formatPercent(
        even
      )} even.`,

    score:
      scoreSignal(
        odd,
        "ODD"
      )

  });


  const matchRate =
    dominant.rate;


  candidates.push({

    strategy:
      "MATCH",

    signal:
      matchRate >= 15
        ? `MATCH ${dominant.digit}`
        : "WAIT",

    probability:
      matchRate,

    confidence:
      calculateConfidence(
        matchRate,
        ticks.length
      ),

    strength:
      getSignalStrength(
        matchRate,
        "MATCH"
      ),

    reason:
      `Digit ${dominant.digit} currently has the strongest observed digit pressure.`,

    score:
      scoreSignal(
        matchRate,
        "MATCH"
      )

  });


  const differRate =
    100 -
    matchRate;


  candidates.push({

    strategy:
      "DIFFER",

    signal:
      `DIFFER ${dominant.digit}`,

    probability:
      differRate,

    confidence:
      calculateConfidence(
        differRate,
        ticks.length
      ),

    strength:
      getSignalStrength(
        differRate,
        "DIFFER"
      ),

    reason:
      `Recent digits differed from ${dominant.digit} in ${formatPercent(
        differRate
      )} of observations.`,

    score:
      scoreSignal(
        differRate,
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
    Math.max(
      0,
      Math.min(
        100,
        50 + m / 2
      )
    );


  const fall =
    Math.max(
      0,
      Math.min(
        100,
        50 - m / 2
      )
    );


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
      `Quote momentum is ${m >= 0 ? "positive" : "negative"} at ${m.toFixed(
        1
      )}.`,

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
      `Quote momentum is ${m >= 0 ? "positive" : "negative"} at ${m.toFixed(
        1
      )}.`,

    score:
      scoreSignal(
        fall,
        "FALL"
      )

  });


  return candidates;

}


/* =========================================================
   CALCULATE STRATEGY
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


  let probabilityValue =
    0;


  let expected =
    "WAIT";


  let reason =
    "";


  switch (
    strategy
  ) {

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


    case "MATCH":

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


    case "DIFFER":

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


    case "OVER":

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


    case "UNDER":

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


      if (!candidates.length) {

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


      candidates.sort(
        (a, b) =>
          b.score -
          a.score
      );


      return candidates[0];

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
   STRATEGY BUTTONS
========================================================= */

function setupStrategyButtons() {

  const buttons =
    document.querySelectorAll(
      ".strategy-button"
    );


  if (!buttons.length) {

    console.warn(
      "KRISHWAVE: strategy buttons not found."
    );

    return;

  }


  buttons.forEach(
    (button) => {

      /*
         Prevent duplicate listeners.
      */

      if (
        button.dataset.krishwaveBound ===
        "1"
      ) {

        return;

      }


      button.dataset.krishwaveBound =
        "1";


      button.addEventListener(
        "click",
        function(event) {

          event.preventDefault();

          event.stopPropagation();


          const strategy =
            this.dataset.strategy;


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


  updateStrategyButtons();

}


/* =========================================================
   HANDLE STRATEGY SELECTION
========================================================= */

function handleStrategySelection(
  strategy
) {

  /*
     Number-free strategies.
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


    state.pendingStrategy =
      null;


    updateStrategyButtons();

    setStrategyLabel();


    /*
       User explicitly chose a strategy.
       Start the 7-second AI analysis when
       enough data is available.
    */

    startAIAnalysisCycle();

    return;

  }


  /*
     Number strategies.
  */

  if (
    strategy ===
      "MATCH" ||

    strategy ===
      "DIFFER" ||

    strategy ===
      "OVER" ||

    strategy ===
      "UNDER"
  ) {

    state.pendingStrategy =
      strategy;


    openStrategyNumberModal(
      strategy
    );

  }

}


/* =========================================================
   UPDATE STRATEGY BUTTONS
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
   SET STRATEGY LABEL
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

    /*
       Safety fallback if modal is missing.
    */

    console.warn(
      "KRISHWAVE: strategy number modal missing."
    );

    return;

  }


  if (title) {

    const titles = {

      MATCH:
        "MATCH — Target Digit",

      DIFFER:
        "DIFFER — Digit to Avoid",

      OVER:
        "OVER — Set Threshold",

      UNDER:
        "UNDER — Set Threshold"

    };


    title.textContent =
      titles[strategy] ||
      "Configure Strategy";

  }


  if (description) {

    const descriptions = {

      MATCH:
        "Enter the digit from 0 to 9 that KRISHWAVE AI should try to match.",

      DIFFER:
        "Enter the digit from 0 to 9 that KRISHWAVE AI should try to differ from.",

      OVER:
        "Enter a digit from 0 to 9. OVER means the next digit is above this threshold.",

      UNDER:
        "Enter a digit from 0 to 9. UNDER means the next digit is below this threshold."

    };


    description.textContent =
      descriptions[strategy] ||
      "Enter a number from 0 to 9.";

  }


  if (error) {

    error.textContent =
      "";

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
    100
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
   APPLY STRATEGY NUMBER
========================================================= */

function applyStrategyNumber() {

  const input =
    $("strategyNumberInput");


  const error =
    $("strategyNumberError");


  const strategy =
    state.pendingStrategy;


  if (
    !input ||
    !strategy
  ) {

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
   NUMBER MODAL EVENTS
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
      (event) => {

        event.preventDefault();

        applyStrategyNumber();

      }
    );

  }


  if (cancel) {

    cancel.addEventListener(
      "click",
      (event) => {

        event.preventDefault();

        closeStrategyNumberModal();

      }
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

          event.preventDefault();

          applyStrategyNumber();

        }


        if (
          event.key ===
          "Escape"
        ) {

          event.preventDefault();

          closeStrategyNumberModal();

        }

      }
    );

  }

}


/* =========================================================
   7-SECOND AI ANALYSIS
========================================================= */

function startAIAnalysisCycle() {

  stopAICycle();


  const ticks =
    recentTicks();


  /*
     We can show the selected strategy
     immediately even when data isn't
     ready yet.
  */

  setStrategyLabel();


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
      `KRISHWAVE needs at least ${CONFIG.MIN_SAMPLE} live/history ticks before the 7-second analysis. Current sample: ${ticks.length}.`
    );


    setText(
      "analysisConfidence",
      "0%"
    );


    setText(
      "engineState",
      "WAITING"
    );


    setText(
      "engineStateDetail",
      `${ticks.length}/${CONFIG.MIN_SAMPLE} ticks collected`
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
    CONFIG.AI_COUNTDOWN_SECONDS
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
          remaining <=
          0
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

  if (
    state.aiTimer
  ) {

    clearInterval(
      state.aiTimer
    );


    state.aiTimer =
      null;

  }


  state.aiAnalysisRunning =
    false;


  state.aiCountdown =
    null;

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
   RENDER PREDICTION
========================================================= */

function renderPrediction(
  result
) {

  if (!result) {
    return;
  }


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
      ? "AI statistical threshold reached"
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
   START ENGINE
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


/* =========================================================
   STOP ENGINE
========================================================= */

function stopEngine() {

  state.engineRunning =
    false;


  stopAICycle();


  if (
    state.scannerTimer
  ) {

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

  if (
    state.scannerTimer
  ) {

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
   SCAN MARKETS
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


      candidates.sort(
        (a, b) =>
          b.score -
          a.score
      );


      const candidate =
        candidates[0];


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


  /*
     AUTO can move to the strongest
     market automatically.

     Manual strategies stay on the
     market selected by the user.
  */

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
    (event) => {

      event.preventDefault();


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

        if (
          !state.connected
        ) {

          return;

        }


        const elapsed =
          Date.now() -
          state.lastTickTime;


        if (
          elapsed >
          CONFIG.WATCHDOG_MS
        ) {

          updateFooter(
            "CONNECTED — WAITING FOR LIVE TICKS"
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
   ACCOUNT BUTTONS
========================================================= */

function setupAccountButtons() {

  const connect =
    $("connectDeriv");


  const disconnect =
    $("disconnectDeriv");


  if (connect) {

    connect.addEventListener(
      "click",
      (event) => {

        event.preventDefault();


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
      (event) => {

        event.preventDefault();


        disconnectPublicStream();

      }
    );

  }

}


/* =========================================================
   DISCONNECT PUBLIC STREAM
========================================================= */

function disconnectPublicStream() {

  state.intentionalClose =
    true;


  state.connected =
    false;


  stopWatchdog();


  stopAICycle();


  if (
    state.reconnectTimer
  ) {

    clearTimeout(
      state.reconnectTimer
    );


    state.reconnectTimer =
      null;

  }


  if (
    state.socket
  ) {

    try {

      state.socket.close();

    } catch (error) {

      console.warn(
        error
      );

    }

  }


  state.socket =
    null;


  state.subscriptions.clear();

  state.historyRequests.clear();


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
   ENGINE BUTTONS
========================================================= */

function setupEngineButtons() {

  const start =
    $("start");


  const stop =
    $("stop");


  if (start) {

    start.addEventListener(
      "click",
      (event) => {

        event.preventDefault();

        startEngine();

      }
    );

  }


  if (stop) {

    stop.addEventListener(
      "click",
      (event) => {

        event.preventDefault();

        stopEngine();

      }
    );

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

function initializeKRISHWAVE() {

  if (
    state.initialized
  ) {

    return;

  }


  state.initialized =
    true;


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
    "liveTicks",
    "0"
  );


  setText(
    "connectedMarkets",
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
     Connect automatically to the
     public Deriv market-data stream.
  */

  connectDeriv();


  /*
     Keep AI engine stopped until
     START AI ENGINE is pressed.
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

}