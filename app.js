/* =========================================================
   KRISHWAVE V3
   LIVE DERIV MARKET INTELLIGENCE ENGINE
   ========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const WS_URL =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const MAX_HISTORY = 200;
const MIN_SAMPLE = 30;
const RECONNECT_DELAY = 3000;

/* =========================================================
   TARGET MARKETS
   ========================================================= */

const MARKETS = [
  {
    name: "Volatility 10 Index",
    symbol: "R_10"
  },
  {
    name: "Volatility 10 (1s)",
    symbol: "R_10_1S"
  },
  {
    name: "Volatility 15 (1s)",
    symbol: "R_15_1S"
  },
  {
    name: "Volatility 25 Index",
    symbol: "R_25"
  },
  {
    name: "Volatility 25 (1s)",
    symbol: "R_25_1S"
  },
  {
    name: "Volatility 30 (1s)",
    symbol: "R_30_1S"
  },
  {
    name: "Volatility 50 Index",
    symbol: "R_50"
  },
  {
    name: "Volatility 50 (1s)",
    symbol: "R_50_1S"
  },
  {
    name: "Volatility 75 Index",
    symbol: "R_75"
  },
  {
    name: "Volatility 75 (1s)",
    symbol: "R_75_1S"
  },
  {
    name: "Volatility 90 (1s)",
    symbol: "R_90_1S"
  },
  {
    name: "Volatility 100 Index",
    symbol: "R_100"
  },
  {
    name: "Volatility 100 (1s)",
    symbol: "R_100_1S"
  }
];

/* =========================================================
   APPLICATION STATE
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

  strategy: "AUTO",

  activeSymbolsLoaded: false
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

function formatNumber(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "--";
  }

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  });
}

function formatTime(epoch) {
  if (!epoch) {
    return "--";
  }

  const date = new Date(Number(epoch) * 1000);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleTimeString();
}

/* =========================================================
   MARKET CREATION
   ========================================================= */

function createMarket(market) {
  return {
    name: market.name,

    symbol: market.symbol,

    available: false,

    quote: null,

    epoch: null,

    pipSize: null,

    ticks: [],

    digits: Array(10).fill(0),

    lastDigit: null,

    previousQuote: null,

    direction: "FLAT",

    directionStreak: 0,

    bestStrategy: "WAIT",

    confidence: 0
  };
}

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
  const pill = $("connectionPill");

  if (status === "LIVE") {
    if (pill) {
      pill.classList.add("live");
    }

    setText(
      "connectionText",
      "LIVE"
    );

    setText(
      "heroStreamStatus",
      "LIVE"
    );

    setText(
      "footerStatus",
      "Live Deriv market data connected"
    );

    return;
  }

  if (status === "RECONNECTING") {
    if (pill) {
      pill.classList.remove("live");
    }

    setText(
      "connectionText",
      "RECONNECTING"
    );

    setText(
      "heroStreamStatus",
      "RECONNECTING"
    );

    setText(
      "footerStatus",
      "Reconnecting to Deriv..."
    );

    return;
  }

  if (pill) {
    pill.classList.remove("live");
  }

  setText(
    "connectionText",
    "CONNECTING"
  );

  setText(
    "heroStreamStatus",
    "CONNECTING"
  );

  setText(
    "footerStatus",
    "Connecting to Deriv..."
  );
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

  MARKETS.forEach((marketInfo) => {
    const market =
      state.markets.get(
        marketInfo.symbol
      );

    if (!market) {
      return;
    }

    const button =
      document.createElement("button");

    button.className =
      "market-item";

    if (
      marketInfo.symbol ===
      state.selectedSymbol
    ) {
      button.classList.add("active");
    }

    button.dataset.symbol =
      marketInfo.symbol;

    const price =
      market.quote !== null
        ? formatNumber(market.quote)
        : "Waiting...";

    const status =
      market.available
        ? "LIVE"
        : "WAITING";

    button.innerHTML = `
      <div>
        <div class="market-name">
          ${market.name}
        </div>

        <div class="market-code">
          ${market.symbol}
        </div>
      </div>

      <div>
        <div class="market-price">
          ${price}
        </div>

        <div class="market-code">
          ${status}
        </div>
      </div>
    `;

    button.addEventListener(
      "click",
      () => {
        selectMarket(
          marketInfo.symbol
        );
      }
    );

    container.appendChild(button);
  });
}

/* =========================================================
   MARKET SELECTION
   ========================================================= */

function selectMarket(symbol) {
  if (!state.markets.has(symbol)) {
    return;
  }

  state.selectedSymbol = symbol;

  const market =
    state.markets.get(symbol);

  setText(
    "selectedMarketName",
    market.name
  );

  setText(
    "selectedMarketCodeLarge",
    market.symbol
  );

  setText(
    "selectedMarketShort",
    market.symbol.replace(
      "R_",
      ""
    )
  );

  setText(
    "selectedMarketCode",
    market.symbol
  );

  updateSelectedMarket();

  updateMarketAnalysis();

  renderMarketList();

  if (
    state.connected &&
    market.available
  ) {
    requestTickHistory(symbol);
  }
}

/* =========================================================
   SELECTED MARKET DISPLAY
   ========================================================= */

function updateSelectedMarket() {
  const market =
    state.markets.get(
      state.selectedSymbol
    );

  if (!market) {
    return;
  }

  setText(
    "liveQuote",
    market.quote !== null
      ? formatNumber(market.quote)
      : "Waiting..."
  );

  setText(
    "quoteTime",
    market.epoch
      ? formatTime(market.epoch)
      : "Waiting for tick..."
  );

  setText(
    "lastDigit",
    market.lastDigit !== null
      ? market.lastDigit
      : "--"
  );

  setText(
    "sampleSize",
    market.ticks.length
  );

  if (
    market.direction ===
    "FLAT"
  ) {
    setText(
      "streakValue",
      "FLAT"
    );
  } else {
    setText(
      "streakValue",
      `${market.direction} ${market.directionStreak}`
    );
  }

  updateDigitStats(market);
}

/* =========================================================
   DIGIT STATISTICS
   ========================================================= */

function updateDigitStats(market) {
  const total =
    market.ticks.length;

  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {
    const percentage =
      total > 0
        ? (
            market.digits[digit] /
            total
          ) * 100
        : 0;

    const label =
      document.querySelector(
        `[data-digit="${digit}"]`
      );

    const fill =
      document.querySelector(
        `[data-fill-digit="${digit}"]`
      );

    if (label) {
      label.textContent =
        `${percentage.toFixed(1)}%`;
    }

    if (fill) {
      fill.style.width =
        `${percentage}%`;
    }
  }
}

/* =========================================================
   PIP SIZE / DECIMAL CALCULATION
   ========================================================= */

function decimalsFromPipSize(
  pipSize
) {
  const number =
    Number(pipSize);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return null;
  }

  const text =
    number.toString()
      .toLowerCase();

  if (
    text.includes("e-")
  ) {
    const exponent =
      Number(
        text.split("e-")[1]
      );

    return Number.isFinite(
      exponent
    )
      ? exponent
      : null;
  }

  if (
    text.includes(".")
  ) {
    const decimalPart =
      text.split(".")[1];

    return decimalPart
      ? decimalPart.length
      : 0;
  }

  return 0;
}

function inferDecimalsFromQuote(
  quote
) {
  if (
    quote === null ||
    quote === undefined
  ) {
    return 2;
  }

  const text =
    String(quote);

  if (
    text.includes("e-")
  ) {
    const exponent =
      Number(
        text.split("e-")[1]
      );

    if (
      Number.isFinite(
        exponent
      )
    ) {
      return exponent;
    }
  }

  if (!text.includes(".")) {
    return 0;
  }

  const decimalPart =
    text.split(".")[1];

  return decimalPart
    ? decimalPart.length
    : 0;
}

/* =========================================================
   LAST DIGIT
   ========================================================= */

function getLastDigit(
  quote,
  pipSize
) {
  const numericQuote =
    Number(quote);

  if (
    !Number.isFinite(
      numericQuote
    )
  ) {
    return null;
  }

  let decimals =
    decimalsFromPipSize(
      pipSize
    );

  if (
    decimals === null
  ) {
    decimals =
      inferDecimalsFromQuote(
        numericQuote
      );
  }

  const multiplier =
    Math.pow(
      10,
      decimals
    );

  const scaled =
    Math.round(
      Math.abs(
        numericQuote
      ) * multiplier
    );

  return (
    scaled % 10
  );
}

/* =========================================================
   DIRECTION / STREAK
   ========================================================= */

function calculateDirection(
  market
) {
  if (
    market.ticks.length < 2
  ) {
    market.direction =
      "FLAT";

    market.directionStreak =
      0;

    return;
  }

  let streakDirection =
    null;

  let streak = 0;

  for (
    let i =
      market.ticks.length - 1;
    i > 0;
    i--
  ) {
    const current =
      market.ticks[i].quote;

    const previous =
      market.ticks[i - 1].quote;

    let direction =
      "FLAT";

    if (
      current > previous
    ) {
      direction = "RISE";
    }

    else if (
      current < previous
    ) {
      direction = "FALL";
    }

    if (
      direction === "FLAT"
    ) {
      if (streak === 0) {
        streakDirection =
          "FLAT";

        streak = 1;
      }

      break;
    }

    if (!streakDirection) {
      streakDirection =
        direction;

      streak = 1;

      continue;
    }

    if (
      direction ===
      streakDirection
    ) {
      streak++;

      continue;
    }

    break;
  }

  market.direction =
    streakDirection ||
    "FLAT";

  market.directionStreak =
    streak;
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
  const numericQuote =
    Number(quote);

  if (
    !Number.isFinite(
      numericQuote
    )
  ) {
    return;
  }

  if (
    pipSize !== undefined &&
    pipSize !== null
  ) {
    market.pipSize =
      pipSize;
  }

  const digit =
    getLastDigit(
      numericQuote,
      market.pipSize
    );

  const item = {
    quote: numericQuote,

    digit: digit,

    epoch: Number(epoch)
  };

  market.ticks.push(item);

  if (
    digit !== null &&
    digit >= 0 &&
    digit <= 9
  ) {
    market.digits[digit]++;
  }

  while (
    market.ticks.length >
    MAX_HISTORY
  ) {
    const removed =
      market.ticks.shift();

    if (
      removed &&
      removed.digit !== null &&
      removed.digit >= 0 &&
      removed.digit <= 9 &&
      market.digits[
        removed.digit
      ] > 0
    ) {
      market.digits[
        removed.digit
      ]--;
    }
  }

  market.quote =
    numericQuote;

  market.epoch =
    Number(epoch);

  market.lastDigit =
    digit;

  calculateDirection(
    market
  );
}

/* =========================================================
   LIVE TICK PROCESSING
   ========================================================= */

function processTick(
  tick
) {
  if (!tick) {
    return;
  }

  const symbol =
    tick.symbol;

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

  const quote =
    Number(tick.quote);

  if (
    !Number.isFinite(
      quote
    )
  ) {
    return;
  }

  addTickToMarket(
    market,
    quote,
    tick.epoch,
    tick.pip_size
  );

  market.available =
    true;

  state.totalTicks++;

  updateGlobalStats();

  renderMarketList();

  if (
    symbol ===
    state.selectedSymbol
  ) {
    updateSelectedMarket();

    updateMarketAnalysis();
  }
}

/* =========================================================
   HISTORY PROCESSING
   ========================================================= */

function processHistory(
  data,
  symbol
) {
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

  const history =
    data.history;

  if (!history) {
    return;
  }

  const prices =
    Array.isArray(
      history.prices
    )
      ? history.prices
      : [];

  const times =
    Array.isArray(
      history.times
    )
      ? history.times
      : [];

  if (!prices.length) {
    console.warn(
      `No history returned for ${symbol}`
    );

    return;
  }

  /*
   * Reset historical sample.
   */

  market.ticks = [];

  market.digits =
    Array(10).fill(0);

  /*
   * Load the recent history.
   */

  for (
    let i = 0;
    i < prices.length;
    i++
  ) {
    const quote =
      Number(prices[i]);

    const epoch =
      Number(times[i]);

    if (
      !Number.isFinite(
        quote
      )
    ) {
      continue;
    }

    addTickToMarket(
      market,
      quote,
      epoch,
      market.pipSize
    );
  }

  market.available =
    true;

  calculateDirection(
    market
  );

  updateGlobalStats();

  renderMarketList();

  if (
    symbol ===
    state.selectedSymbol
  ) {
    updateSelectedMarket();

    updateMarketAnalysis();
  }

  console.log(
    `Loaded ${market.ticks.length} historical ticks for ${symbol}`
  );
}

/* =========================================================
   REQUEST HISTORY
   ========================================================= */

function requestTickHistory(
  symbol
) {
  if (
    !state.connected ||
    !state.socket
  ) {
    return;
  }

  const market =
    state.markets.get(
      symbol
    );

  if (!market) {
    return;
  }

  if (!market.available) {
    return;
  }

  const reqId =
    state.requestCounter++;

  state.requestMap.set(
    reqId,
    {
      type: "history",
      symbol: symbol
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
  if (
    !state.connected
  ) {
    return;
  }

  MARKETS.forEach(
    (marketInfo) => {
      const market =
        state.markets.get(
          marketInfo.symbol
        );

      if (
        market &&
        market.available
      ) {
        requestTickHistory(
          marketInfo.symbol
        );
      }
    }
  );
}

/* =========================================================
   LIVE TICK SUBSCRIPTIONS
   ========================================================= */

function subscribeToTicks(
  symbol
) {
  if (
    !state.connected ||
    !state.socket
  ) {
    return;
  }

  const market =
    state.markets.get(
      symbol
    );

  if (
    !market ||
    !market.available
  ) {
    return;
  }

  if (
    state.subscriptions.has(
      symbol
    )
  ) {
    return;
  }

  const reqId =
    state.requestCounter++;

  state.requestMap.set(
    reqId,
    {
      type: "tick",
      symbol: symbol
    }
  );

  send({
    ticks: symbol,

    subscribe: 1,

    req_id: reqId
  });
}

function subscribeToAllTicks() {
  MARKETS.forEach(
    (marketInfo) => {
      subscribeToTicks(
        marketInfo.symbol
      );
    }
  );
}

/* =========================================================
   GLOBAL STATISTICS
   ========================================================= */

function updateGlobalStats() {
  let connectedMarkets = 0;

  state.markets.forEach(
    (market) => {
      if (
        market.available
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
}

/* =========================================================
   ANALYSIS ENGINE
   ========================================================= */

function calculateAnalysis(
  market
) {
  const total =
    market.ticks.length;

  if (!total) {
    return {
      signal: "WAIT",

      strategy: "WAIT",

      confidence: 0,

      reason:
        "Waiting for market data.",

      dominantDigit: "--",

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

  let even = 0;

  let odd = 0;

  let over = 0;

  let under = 0;

  market.ticks.forEach(
    (tick) => {
      if (
        tick.digit === null
      ) {
        return;
      }

      if (
        tick.digit % 2 === 0
      ) {
        even++;
      } else {
        odd++;
      }

      if (
        tick.digit >= 5
      ) {
        over++;
      } else {
        under++;
      }
    }
  );

  const evenPercent =
    (even / total) * 100;

  const oddPercent =
    (odd / total) * 100;

  const overPercent =
    (over / total) * 100;

  const underPercent =
    (under / total) * 100;

  /*
   * Find dominant digit.
   */

  let dominantDigit = 0;

  for (
    let digit = 1;
    digit <= 9;
    digit++
  ) {
    if (
      market.digits[digit] >
      market.digits[
        dominantDigit
      ]
    ) {
      dominantDigit =
        digit;
    }
  }

  const dominantRate =
    (
      market.digits[
        dominantDigit
      ] / total
    ) * 100;

  const matchPercent =
    dominantRate;

  const differPercent =
    100 - dominantRate;

  /*
   * Rise / Fall.
   */

  let rises = 0;

  let falls = 0;

  let movements = 0;

  for (
    let i = 1;
    i < market.ticks.length;
    i++
  ) {
    const previous =
      market.ticks[
        i - 1
      ].quote;

    const current =
      market.ticks[i].quote;

    if (
      current > previous
    ) {
      rises++;

      movements++;
    }

    else if (
      current < previous
    ) {
      falls++;

      movements++;
    }
  }

  const risePercent =
    movements
      ? (rises / movements) * 100
      : 0;

  const fallPercent =
    movements
      ? (falls / movements) * 100
      : 0;

  /*
   * Strategy values.
   */

  const values = {
    EVEN: evenPercent,

    ODD: oddPercent,

    OVER: overPercent,

    UNDER: underPercent,

    MATCH: matchPercent,

    DIFFER: differPercent,

    RISE: risePercent,

    FALL: fallPercent
  };

  /*
   * Each strategy gets its own
   * statistical baseline.
   *
   * MATCH baseline = 10%
   * DIFFER baseline = 90%
   * Others baseline = 50%
   */

  const baselines = {
    EVEN: 50,

    ODD: 50,

    OVER: 50,

    UNDER: 50,

    MATCH: 10,

    DIFFER: 90,

    RISE: 50,

    FALL: 50
  };

  let bestStrategy =
    "WAIT";

  let bestValue = 0;

  let bestEdge = 0;

  if (
    state.strategy ===
    "AUTO"
  ) {
    Object.entries(
      values
    ).forEach(
      ([strategy, value]) => {
        const baseline =
          baselines[strategy];

        const edge =
          value - baseline;

        if (
          edge > bestEdge
        ) {
          bestEdge = edge;

          bestValue =
            value;

          bestStrategy =
            strategy;
        }
      }
    );
  }

  else {
    bestStrategy =
      state.strategy;

    bestValue =
      values[
        state.strategy
      ] || 0;

    bestEdge =
      bestValue -
      (
        baselines[
          state.strategy
        ] || 50
      );
  }

  /*
   * Confidence is based on
   * observed probability plus
   * sample size.
   */

  let confidence;

  if (
    state.strategy ===
    "DIFFER"
  ) {
    confidence =
      bestValue;
  }

  else if (
    state.strategy ===
    "MATCH"
  ) {
    confidence =
      bestValue;
  }

  else {
    confidence =
      50 +
      Math.abs(bestEdge) *
        1.6;
  }

  /*
   * Reduce confidence when
   * the sample is small.
   */

  if (
    total < MIN_SAMPLE
  ) {
    confidence *=
      total / MIN_SAMPLE;
  }

  /*
   * Cap displayed confidence.
   */

  confidence =
    Math.max(
      0,
      Math.min(
        95,
        confidence
      )
    );

  /*
   * Require a meaningful
   * statistical edge.
   */

  let signal = "WAIT";

  if (
    total >= MIN_SAMPLE
  ) {
    if (
      bestEdge >= 5 &&
      confidence >= 65
    ) {
      signal =
        bestStrategy;
    } else {
      signal =
        "NEUTRAL";
    }
  }

  let reason =
    `Based on ${total} recent ticks.`;

  if (
    total < MIN_SAMPLE
  ) {
    reason =
      `Collecting more data (${total}/${MIN_SAMPLE} ticks).`;
  }

  else if (
    signal === "NEUTRAL"
  ) {
    reason =
      "No strong statistical edge detected.";
  }

  else {
    reason =
      `${bestStrategy} currently shows the strongest observed bias from recent tick data.`;
  }

  return {
    signal,

    strategy:
      bestStrategy,

    confidence,

    reason,

    dominantDigit,

    dominantRate,

    even:
      evenPercent,

    odd:
      oddPercent,

    over:
      overPercent,

    under:
      underPercent,

    match:
      matchPercent,

    differ:
      differPercent,

    rise:
      risePercent,

    fall:
      fallPercent
  };
}

/* =========================================================
   UPDATE ANALYSIS DISPLAY
   ========================================================= */

function updateMarketAnalysis() {
  const market =
    state.markets.get(
      state.selectedSymbol
    );

  if (!market) {
    return;
  }

  const analysis =
    calculateAnalysis(
      market
    );

  market.bestStrategy =
    analysis.strategy;

  market.confidence =
    analysis.confidence;

  setText(
    "engineState",
    analysis.signal
  );

  setText(
    "engineStateDetail",
    analysis.reason
  );

  const engineStatus =
    $("engineStatus");

  if (engineStatus) {
    engineStatus.innerHTML = `
      <span>ENGINE</span>
      <strong>${analysis.signal}</strong>
      <small>${analysis.reason}</small>
    `;
  }

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
    `${analysis.confidence.toFixed(0)}%`
  );

  setText(
    "dominantDigit",
    analysis.dominantDigit
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

          state.strategy =
            button.dataset.strategy;

          updateMarketAnalysis();
        }
      );
    }
  );
}

/* =========================================================
   SCAN ALL MARKETS
   ========================================================= */

function scanAllMarkets() {
  let bestMarket =
    null;

  let bestScore =
    -Infinity;

  state.markets.forEach(
    (market) => {
      if (
        !market.available ||
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
       * Save latest analysis.
       */

      market.bestStrategy =
        analysis.strategy;

      market.confidence =
        analysis.confidence;

      /*
       * AUTO scanner uses
       * confidence plus edge.
       */

      const score =
        analysis.confidence +
        Math.max(
          0,
          analysis.confidence -
            50
        );

      if (
        score > bestScore
      ) {
        bestScore =
          score;

        bestMarket =
          market;
      }
    }
  );

  if (!bestMarket) {
    setText(
      "engineStateDetail",
      "Waiting for enough data across markets."
    );

    return;
  }

  selectMarket(
    bestMarket.symbol
  );

  setText(
    "footerStatus",
    `Scanner selected ${bestMarket.name}`
  );
}

/* =========================================================
   SEND WEBSOCKET REQUEST
   ========================================================= */

function send(payload) {
  if (
    !state.socket ||
    state.socket.readyState !==
      WebSocket.OPEN
  ) {
    return false;
  }

  try {
    state.socket.send(
      JSON.stringify(payload)
    );

    return true;
  }

  catch (error) {
    console.error(
      "WebSocket send error:",
      error
    );

    return false;
  }
}

/* =========================================================
   ACTIVE SYMBOLS
   ========================================================= */

function requestActiveSymbols() {
  const reqId =
    state.requestCounter++;

  state.requestMap.set(
    reqId,
    {
      type:
        "active_symbols"
    }
  );

  send({
    active_symbols:
      "brief",

    product_type:
      "basic",

    req_id:
      reqId
  });
}

function handleActiveSymbols(
  data
) {
  if (
    !Array.isArray(
      data.active_symbols
    )
  ) {
    return;
  }

  const returnedSymbols =
    new Map();

  data.active_symbols.forEach(
    (item) => {
      const symbol =
        item.underlying_symbol;

      if (!symbol) {
        return;
      }

      returnedSymbols.set(
        symbol,
        item
      );
    }
  );

  MARKETS.forEach(
    (marketInfo) => {
      const market =
        state.markets.get(
          marketInfo.symbol
        );

      if (!market) {
        return;
      }

      const active =
        returnedSymbols.get(
          marketInfo.symbol
        );

      if (active) {
        market.available =
          true;

        if (
          active.pip_size !==
          undefined
        ) {
          market.pipSize =
            active.pip_size;
        }

        if (
          active.underlying_symbol_name
        ) {
          market.name =
            active.underlying_symbol_name;
        }
      }

      else {
        market.available =
          false;
      }
    }
  );

  state.activeSymbolsLoaded =
    true;

  updateGlobalStats();

  renderMarketList();

  setText(
    "footerStatus",
    "Markets loaded. Loading recent tick history..."
  );

  /*
   * Load historical data.
   */

  requestAllHistory();

  /*
   * Start live subscriptions.
   */

  subscribeToAllTicks();
}

/* =========================================================
   LIVE TICK MESSAGE
   ========================================================= */

function handleTickMessage(
  data
) {
  if (!data.tick) {
    return;
  }

  const tick =
    data.tick;

  if (
    tick.subscription &&
    tick.subscription.id
  ) {
    state.subscriptions.set(
      tick.symbol,
      tick.subscription.id
    );
  }

  processTick(tick);
}

/* =========================================================
   HISTORY MESSAGE
   ========================================================= */

function handleHistoryMessage(
  data,
  requestInfo
) {
  if (
    !requestInfo ||
    requestInfo.type !==
      "history"
  ) {
    return;
  }

  processHistory(
    data,
    requestInfo.symbol
  );

  setText(
    "footerStatus",
    "Historical data loaded. Live monitoring active."
  );
}

/* =========================================================
   API ERRORS
   ========================================================= */

function handleError(
  data
) {
  console.error(
    "Deriv API error:",
    data
  );

  if (
    data.error
  ) {
    setText(
      "footerStatus",
      data.error.message ||
        "Deriv API error"
    );
  }
}

/* =========================================================
   WEBSOCKET MESSAGE ROUTER
   ========================================================= */

function handleMessage(
  event
) {
  let data;

  try {
    data =
      JSON.parse(
        event.data
      );
  }

  catch (error) {
    console.error(
      "Invalid WebSocket message:",
      event.data
    );

    return;
  }

  if (data.error) {
    handleError(data);

    return;
  }

  const reqId =
    data.req_id;

  const requestInfo =
    reqId !== undefined
      ? state.requestMap.get(
          Number(reqId)
        )
      : null;

  if (
    data.msg_type ===
    "active_symbols"
  ) {
    handleActiveSymbols(
      data
    );
  }

  else if (
    data.msg_type ===
    "history"
  ) {
    handleHistoryMessage(
      data,
      requestInfo
    );
  }

  else if (
    data.msg_type ===
    "tick"
  ) {
    handleTickMessage(
      data
    );
  }

  /*
   * Remove one-time request
   * mappings.
   *
   * Tick subscriptions stay
   * alive.
   */

  if (
    reqId !== undefined &&
    requestInfo &&
    data.msg_type !==
      "tick"
  ) {
    state.requestMap.delete(
      Number(reqId)
    );
  }
}

/* =========================================================
   CONNECT TO DERIV
   ========================================================= */

function connect() {
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

  setConnectionStatus(
    "CONNECTING"
  );

  try {
    state.socket =
      new WebSocket(
        WS_URL
      );

    state.socket.addEventListener(
      "open",
      () => {
        state.connected =
          true;

        state.activeSymbolsLoaded =
          false;

        state.subscriptions.clear();

        setConnectionStatus(
          "LIVE"
        );

        setText(
          "footerStatus",
          "Connected. Loading Deriv markets..."
        );

        requestActiveSymbols();
      }
    );

    state.socket.addEventListener(
      "message",
      handleMessage
    );

    state.socket.addEventListener(
      "error",
      (error) => {
        console.error(
          "WebSocket error:",
          error
        );
      }
    );

    state.socket.addEventListener(
      "close",
      () => {
        state.connected =
          false;

        state.activeSymbolsLoaded =
          false;

        state.subscriptions.clear();

        setConnectionStatus(
          "RECONNECTING"
        );

        if (
          state.reconnectTimer
        ) {
          clearTimeout(
            state.reconnectTimer
          );
        }

        state.reconnectTimer =
          setTimeout(
            connect,
            RECONNECT_DELAY
          );
      }
    );
  }

  catch (error) {
    console.error(
      "Connection error:",
      error
    );

    state.connected =
      false;

    setConnectionStatus(
      "RECONNECTING"
    );

    state.reconnectTimer =
      setTimeout(
        connect,
        RECONNECT_DELAY
      );
  }
}

/* =========================================================
   START MONITOR
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
    "Live analysis monitor running."
  );

  setText(
    "analysisSignal",
    "WAIT"
  );

  setText(
    "footerStatus",
    "Analysis monitor running."
  );

  if (
    !state.connected
  ) {
    connect();
  }
}

/* =========================================================
   STOP MONITOR
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
    "Analysis monitor stopped."
  );

  setText(
    "analysisSignal",
    "STOPPED"
  );

  setText(
    "footerStatus",
    "Analysis monitor stopped."
  );
}

/* =========================================================
   CONTROLS
   ========================================================= */

function setupControls() {
  const startButton =
    $("start");

  const stopButton =
    $("stop");

  const scanButton =
    $("scanAll");

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
   INITIALIZE APPLICATION
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
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initialize
);
