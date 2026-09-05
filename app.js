/* =========================================================
   KRISHWAVE V3.1
   LIVE DERIV MARKET INTELLIGENCE ENGINE
   ANALYSIS ONLY
========================================================= */

const CONFIG = {
  WS_URL: "wss://api.derivws.com/trading/v1/options/ws/public",

  MAX_HISTORY: 200,
  RECENT_WINDOW: 80,
  MIN_SAMPLE: 30,

  RECONNECT_DELAY: 3000,
  WATCHDOG_MS: 15000,

  ANALYSIS_SECONDS: 10,
  COUNTDOWN_SECONDS: 7,

  MAX_MARKETS: 13,

  /* Minimum statistical edge before calling something STRONG */
  STRONG_EDGE: 6,

  /* Confidence is capped deliberately.
     A market-data model should not pretend certainty. */
  MAX_CONFIDENCE: 92
};

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
  lastAction: "READY",

  scanResults: []
};

/* =========================================================
   DOM HELPERS
========================================================= */

function $(selector) {
  return document.querySelector(selector);
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function setHTML(selector, value) {
  const element = $(selector);
  if (element) element.innerHTML = value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/* =========================================================
   MARKET HELPERS
========================================================= */

function getMarket(symbol) {
  if (!state.markets[symbol]) {
    const definition =
      MARKETS.find(item => item.symbol === symbol) ||
      { symbol, name: symbol };

    state.markets[symbol] = {
      ...definition,
      history: [],
      lastQuote: null,
      lastDigit: null,
      pipSize: 2,
      lastTickTime: 0
    };
  }

  return state.markets[symbol];
}

function getMarketHistory(symbol) {
  return getMarket(symbol).history || [];
}

/* =========================================================
   DERIV CONNECTION
========================================================= */

function connectWebSocket() {
  clearTimeout(state.reconnectTimer);

  updateConnectionUI("CONNECTING");

  try {
    state.ws = new WebSocket(CONFIG.WS_URL);
  } catch (error) {
    console.error(error);
    scheduleReconnect();
    return;
  }

  state.ws.addEventListener("open", () => {
    state.connected = true;

    updateConnectionUI("CONNECTED");

    requestActiveSymbols();

    clearInterval(state.watchdogTimer);

    state.watchdogTimer = setInterval(() => {
      const age = Date.now() - state.lastTickTime;

      if (state.lastTickTime && age > CONFIG.WATCHDOG_MS) {
        updateConnectionUI("RECONNECTING");
        reconnectWebSocket();
      }
    }, 5000);
  });

  state.ws.addEventListener("message", event => {
    handleMessage(event.data);
  });

  state.ws.addEventListener("error", error => {
    console.error("WebSocket error:", error);
    updateConnectionUI("ERROR");
  });

  state.ws.addEventListener("close", () => {
    state.connected = false;
    updateConnectionUI("DISCONNECTED");
    scheduleReconnect();
  });
}

function reconnectWebSocket() {
  try {
    if (state.ws) state.ws.close();
  } catch (_) {}

  state.connected = false;
  scheduleReconnect();
}

function scheduleReconnect() {
  clearTimeout(state.reconnectTimer);

  state.reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, CONFIG.RECONNECT_DELAY);
}

function send(payload) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  state.ws.send(JSON.stringify(payload));
  return true;
}

function nextRequestId() {
  return state.requestId++;
}

/* =========================================================
   ACTIVE SYMBOLS
========================================================= */

function requestActiveSymbols() {
  const id = nextRequestId();

  send({
    active_symbols: "brief",
    req_id: id
  });
}

/* =========================================================
   MESSAGE ROUTER
========================================================= */

function handleMessage(raw) {
  let data;

  try {
    data = JSON.parse(raw);
  } catch (_) {
    return;
  }

  if (data.error) {
    console.warn("Deriv error:", data.error);
    return;
  }

  if (Array.isArray(data.errors) && data.errors.length) {
    console.warn("Deriv errors:", data.errors);
    return;
  }

  if (data.active_symbols) {
    handleActiveSymbols(data.active_symbols);
  }

  if (data.history) {
    handleHistory(data);
  }

  if (data.tick) {
    handleTick(data.tick);
  }
}

/* =========================================================
   ACTIVE SYMBOL PARSING
========================================================= */

function handleActiveSymbols(symbols) {
  const available = new Set();

  symbols.forEach(item => {
    const symbol =
      item.underlying_symbol ||
      item.symbol;

    if (!symbol) return;

    available.add(symbol);

    const market = getMarket(symbol);

    market.name =
      item.underlying_symbol_name ||
      item.display_name ||
      market.name;

    market.pipSize =
      Number.isFinite(Number(item.pip_size))
        ? Number(item.pip_size)
        : Number.isFinite(Number(item.pip))
          ? Number(item.pip)
          : market.pipSize;
  });

  const requested = MARKETS.filter(item =>
    available.has(item.symbol)
  );

  const list =
    requested.length
      ? requested
      : MARKETS;

  list.slice(0, CONFIG.MAX_MARKETS).forEach(item => {
    const market = getMarket(item.symbol);

    if (!market.history.length) {
      requestHistory(item.symbol);
    }

    if (!state.subscriptions.has(item.symbol)) {
      subscribeTicks(item.symbol);
    }
  });

  renderMarketScanner();
}

/* =========================================================
   HISTORY
========================================================= */

function requestHistory(symbol) {
  if (state.pendingHistory.has(symbol)) return;

  state.pendingHistory.add(symbol);

  const id = nextRequestId();

  send({
    ticks_history: symbol,
    count: CONFIG.MAX_HISTORY,
    end: "latest",
    style: "ticks",
    req_id: id
  });
}

function handleHistory(data) {
  const symbol = data.echo_req?.ticks_history;

  if (!symbol) return;

  const market = getMarket(symbol);

  const prices = data.history?.prices || [];
  const times = data.history?.times || [];

  const history = [];

  prices.forEach((price, index) => {
    const numeric = Number(price);

    if (!Number.isFinite(numeric)) return;

    history.push({
      quote: numeric,
      time: times[index]
        ? Number(times[index]) * 1000
        : Date.now()
    });
  });

  market.history = history.slice(-CONFIG.MAX_HISTORY);

  state.pendingHistory.delete(symbol);

  updateMarketDerivedData(symbol);

  if (symbol === state.selectedSymbol) {
    renderSelectedMarket();
    renderProbabilities();
    renderAI();
  }

  renderMarketScanner();
}

/* =========================================================
   LIVE TICKS
========================================================= */

function subscribeTicks(symbol) {
  const id = nextRequestId();

  const sent = send({
    ticks: symbol,
    subscribe: 1,
    req_id: id
  });

  if (sent) {
    state.subscriptions.add(symbol);
  }
}

function handleTick(tick) {
  const symbol =
    tick.symbol ||
    tick.echo_req?.ticks;

  if (!symbol) return;

  const quote = Number(tick.quote);

  if (!Number.isFinite(quote)) return;

  const market = getMarket(symbol);

  market.lastQuote = quote;
  market.lastTickTime = Date.now();

  market.history.push({
    quote,
    time: tick.epoch
      ? Number(tick.epoch) * 1000
      : Date.now()
  });

  if (market.history.length > CONFIG.MAX_HISTORY) {
    market.history.shift();
  }

  market.lastDigit = extractLastDigit(
    quote,
    market.pipSize
  );

  state.liveTicks++;
  state.lastTickTime = Date.now();

  updateMarketDerivedData(symbol);

  if (symbol === state.selectedSymbol) {
    renderSelectedMarket();
    renderProbabilities();
    renderAI();
  }

  renderMarketScanner();
}

/* =========================================================
   DIGIT ENGINE
========================================================= */

function extractLastDigit(quote, pipSize = 2) {
  const decimals = clamp(
    Math.round(Number(pipSize)),
    0,
    8
  );

  const factor = Math.pow(10, decimals);

  const scaled = Math.round(
    Math.abs(Number(quote)) * factor
  );

  return scaled % 10;
}

function getDigits(symbol) {
  const market = getMarket(symbol);

  return market.history
    .slice(-CONFIG.RECENT_WINDOW)
    .map(item =>
      extractLastDigit(
        item.quote,
        market.pipSize
      )
    )
    .filter(digit =>
      Number.isInteger(digit) &&
      digit >= 0 &&
      digit <= 9
    );
}

function getDigitCounts(symbol) {
  const counts = Array(10).fill(0);
  const digits = getDigits(symbol);

  digits.forEach(digit => {
    counts[digit]++;
  });

  return counts;
}

function getDigitRates(symbol) {
  const counts = getDigitCounts(symbol);
  const total = counts.reduce((a, b) => a + b, 0);

  if (!total) return Array(10).fill(0);

  return counts.map(count =>
    (count / total) * 100
  );
}

function getRecentDigitPressure(symbol, digit) {
  const digits = getDigits(symbol);

  if (!digits.length) return 0;

  const recent = digits.slice(-30);

  const hits =
    recent.filter(item => item === digit).length;

  return (hits / recent.length) * 100;
}

/* =========================================================
   BASIC PROBABILITIES
========================================================= */

function analyzeEvenOdd(symbol) {
  const digits = getDigits(symbol);

  if (!digits.length) {
    return {
      even: 50,
      odd: 50
    };
  }

  const even =
    digits.filter(d => d % 2 === 0).length /
    digits.length * 100;

  return {
    even,
    odd: 100 - even
  };
}

function analyzeHighLow(symbol) {
  const digits = getDigits(symbol);

  if (!digits.length) {
    return {
      high: 50,
      low: 50
    };
  }

  const high =
    digits.filter(d => d >= 5).length /
    digits.length * 100;

  return {
    high,
    low: 100 - high
  };
}

/*
  Important:
  OVER and UNDER do NOT test trivial thresholds such as:

  OVER 0
  UNDER 9

  Those conditions are almost always true and create
  fake 99% signals.

  We therefore only evaluate thresholds 1 through 8.
*/

function analyzeOverUnder(symbol) {
  const digits = getDigits(symbol);

  if (!digits.length) {
    return {
      over: {
        threshold: 5,
        probability: 50
      },
      under: {
        threshold: 5,
        probability: 50
      }
    };
  }

  let bestOver = null;
  let bestUnder = null;

  for (let threshold = 1; threshold <= 8; threshold++) {
    const over =
      digits.filter(d => d > threshold).length /
      digits.length * 100;

    const under =
      digits.filter(d => d < threshold).length /
      digits.length * 100;

    /*
      Prefer thresholds with a useful statistical edge,
      but don't simply select the extreme percentage.
    */
    const overScore =
      Math.abs(over - 50) -
      Math.abs(threshold - 5) * 1.5;

    const underScore =
      Math.abs(under - 50) -
      Math.abs(threshold - 5) * 1.5;

    if (!bestOver || overScore > bestOver.score) {
      bestOver = {
        threshold,
        probability: over,
        score: overScore
      };
    }

    if (!bestUnder || underScore > bestUnder.score) {
      bestUnder = {
        threshold,
        probability: under,
        score: underScore
      };
    }
  }

  return {
    over: bestOver,
    under: bestUnder
  };
}

/* =========================================================
   MATCH / DIFFER
========================================================= */

function analyzeMatchDiffer(symbol) {
  const rates = getDigitRates(symbol);

  let targetDigit = 0;

  rates.forEach((rate, digit) => {
    if (rate > rates[targetDigit]) {
      targetDigit = digit;
    }
  });

  const match = rates[targetDigit] || 0;

  return {
    targetDigit,
    match,
    differ: 100 - match
  };
}

/* =========================================================
   MOMENTUM
========================================================= */

function analyzeMomentum(symbol) {
  const market = getMarket(symbol);
  const history = market.history.slice(-CONFIG.RECENT_WINDOW);

  if (history.length < 10) {
    return {
      rise: 50,
      fall: 50
    };
  }

  let rises = 0;
  let falls = 0;

  for (let i = 1; i < history.length; i++) {
    if (history[i].quote > history[i - 1].quote) {
      rises++;
    } else if (
      history[i].quote < history[i - 1].quote
    ) {
      falls++;
    }
  }

  const total = rises + falls;

  if (!total) {
    return {
      rise: 50,
      fall: 50
    };
  }

  const rise =
    (rises / total) * 100;

  return {
    rise,
    fall: 100 - rise
  };
}

/* =========================================================
   STREAK
========================================================= */

function calculateStreak(symbol) {
  const digits = getDigits(symbol);

  if (!digits.length) return null;

  const last = digits[digits.length - 1];

  let streak = 0;

  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] === last) {
      streak++;
    } else {
      break;
    }
  }

  return {
    digit: last,
    count: streak
  };
}

/* =========================================================
   SIGNAL QUALITY
========================================================= */

function getSignalQuality(edge, sample) {
  if (sample < CONFIG.MIN_SAMPLE) {
    return "WAIT";
  }

  if (edge >= CONFIG.STRONG_EDGE + 4) {
    return "STRONG";
  }

  if (edge >= CONFIG.STRONG_EDGE) {
    return "WATCH";
  }

  return "WEAK";
}

function confidenceFromProbability(
  probability,
  sample,
  extraPressure = 0
) {
  /*
    Confidence is based on distance from 50,
    sample size and optional pressure.

    It is deliberately capped.
  */

  const edge =
    Math.abs(probability - 50);

  const sampleFactor =
    clamp(sample / CONFIG.RECENT_WINDOW, 0, 1);

  const pressureFactor =
    clamp(Math.abs(extraPressure) / 20, 0, 1);

  let confidence =
    50 +
    edge * 0.8 +
    sampleFactor * 8 +
    pressureFactor * 4;

  confidence = clamp(
    confidence,
    50,
    CONFIG.MAX_CONFIDENCE
  );

  return round(confidence);
}

/* =========================================================
   STRATEGY ANALYSIS
========================================================= */

function analyzeStrategy(
  symbol,
  strategy = state.selectedStrategy
) {
  const digits = getDigits(symbol);
  const sample = digits.length;

  if (sample < CONFIG.MIN_SAMPLE) {
    return {
      strategy,
      label: "WAIT",
      target: null,
      confidence: 0,
      probability: 50,
      edge: 0,
      quality: "WAIT",
      reason: `Need at least ${CONFIG.MIN_SAMPLE} recent ticks.`
    };
  }

  const evenOdd = analyzeEvenOdd(symbol);
  const highLow = analyzeHighLow(symbol);
  const overUnder = analyzeOverUnder(symbol);
  const matchDiffer = analyzeMatchDiffer(symbol);
  const momentum = analyzeMomentum(symbol);

  let selected;

  switch (strategy) {
    case "EVEN":
      selected = {
        label: "EVEN",
        target: null,
        probability: evenOdd.even,
        reason: "Recent digit distribution favors EVEN."
      };
      break;

    case "ODD":
      selected = {
        label: "ODD",
        target: null,
        probability: evenOdd.odd,
        reason: "Recent digit distribution favors ODD."
      };
      break;

    case "HIGH":
      selected = {
        label: "HIGH",
        target: null,
        probability: highLow.high,
        reason: "Digits 5–9 currently have the stronger share."
      };
      break;

    case "LOW":
      selected = {
        label: "LOW",
        target: null,
        probability: highLow.low,
        reason: "Digits 0–4 currently have the stronger share."
      };
      break;

    case "OVER":
      selected = {
        label: "OVER",
        target: overUnder.over.threshold,
        probability: overUnder.over.probability,
        reason:
          `AI selected OVER ${overUnder.over.threshold} ` +
          `from the recent digit distribution.`
      };
      break;

    case "UNDER":
      selected = {
        label: "UNDER",
        target: overUnder.under.threshold,
        probability: overUnder.under.probability,
        reason:
          `AI selected UNDER ${overUnder.under.threshold} ` +
          `from the recent digit distribution.`
      };
      break;

    case "MATCH":
      selected = {
        label: "MATCH",
        target: matchDiffer.targetDigit,
        probability: matchDiffer.match,
        reason:
          `Digit ${matchDiffer.targetDigit} has the highest ` +
          `observed recent frequency.`
      };
      break;

    case "DIFFER":
      selected = {
        label: "DIFFER",
        target: matchDiffer.targetDigit,
        probability: matchDiffer.differ,
        reason:
          `AI targets DIFFER from digit ${matchDiffer.targetDigit}.`
      };
      break;

    case "RISE":
      selected = {
        label: "RISE",
        target: null,
        probability: momentum.rise,
        reason:
          "Recent quote movement is being evaluated for upward momentum."
      };
      break;

    case "FALL":
      selected = {
        label: "FALL",
        target: null,
        probability: momentum.fall,
        reason:
          "Recent quote movement is being evaluated for downward momentum."
      };
      break;

    default:
      return analyzeAuto(symbol);
  }

  const edge =
    Math.abs(selected.probability - 50);

  const pressure =
    selected.target !== null
      ? getRecentDigitPressure(
          symbol,
          selected.target
        ) - 10
      : 0;

  const confidence =
    confidenceFromProbability(
      selected.probability,
      sample,
      pressure
    );

  const quality =
    getSignalQuality(
      edge,
      sample
    );

  return {
    strategy: selected.label,
    label: selected.label,
    target: selected.target,
    probability: selected.probability,
    confidence,
    edge,
    quality,
    sample,
    reason: selected.reason
  };
}

/* =========================================================
   AUTO ENGINE
========================================================= */

function analyzeAuto(symbol) {
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

  const results = strategies
    .map(strategy =>
      analyzeStrategy(symbol, strategy)
    )
    .filter(result =>
      result.sample >= CONFIG.MIN_SAMPLE
    );

  if (!results.length) {
    return {
      strategy: "AUTO",
      label: "WAIT",
      target: null,
      probability: 50,
      confidence: 0,
      edge: 0,
      quality: "WAIT",
      sample: getDigits(symbol).length,
      reason:
        `Waiting for at least ${CONFIG.MIN_SAMPLE} recent ticks.`
    };
  }

  /*
    Rank by edge first, then confidence.
    Slight preference for strategies with sensible targets.
  */

  results.sort((a, b) => {
    const scoreA =
      a.edge +
      a.confidence * 0.12;

    const scoreB =
      b.edge +
      b.confidence * 0.12;

    return scoreB - scoreA;
  });

  const best = results[0];

  return {
    ...best,
    strategy: best.label,
    reason:
      `AUTO selected ${best.label}` +
      (best.target !== null
        ? ` ${best.target}`
        : "") +
      ` as the strongest current statistical setup.`
  };
}

/* =========================================================
   UPDATE DERIVED DATA
========================================================= */

function updateMarketDerivedData(symbol) {
  const market = getMarket(symbol);

  const digits = getDigits(symbol);

  market.sample = digits.length;

  market.lastDigit =
    digits.length
      ? digits[digits.length - 1]
      : null;

  market.digitRates =
    getDigitRates(symbol);

  market.evenOdd =
    analyzeEvenOdd(symbol);

  market.highLow =
    analyzeHighLow(symbol);

  market.overUnder =
    analyzeOverUnder(symbol);

  market.matchDiffer =
    analyzeMatchDiffer(symbol);

  market.momentum =
    analyzeMomentum(symbol);

  market.streak =
    calculateStreak(symbol);

  market.auto =
    analyzeAuto(symbol);
}

/* =========================================================
   SELECTED MARKET
========================================================= */

function renderSelectedMarket() {
  const market =
    getMarket(state.selectedSymbol);

  setText(
    "#selectedMarket",
    market.name || "Volatility Market"
  );

  setText(
    "#marketCode",
    market.symbol
  );

  setText(
    "#quote",
    market.lastQuote !== null
      ? market.lastQuote
      : "—"
  );

  setText(
    "#lastDigit",
    market.lastDigit !== null
      ? market.lastDigit
      : "—"
  );

  setText(
    "#sample",
    market.sample || 0
  );

  const streak = market.streak;

  setText(
    "#streak",
    streak
      ? `${streak.count} × ${streak.digit}`
      : "—"
  );

  setText(
    "#liveTicks",
    state.liveTicks
  );
}

/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigitDistribution() {
  const rates =
    getDigitRates(state.selectedSymbol);

  rates.forEach((rate, digit) => {
    setText(
      `#digit${digit}`,
      `${round(rate)}%`
    );
  });
}

/* =========================================================
   PROBABILITIES
========================================================= */

function renderProbabilities() {
  const symbol = state.selectedSymbol;

  const evenOdd = analyzeEvenOdd(symbol);
  const highLow = analyzeHighLow(symbol);
  const overUnder = analyzeOverUnder(symbol);
  const matchDiffer = analyzeMatchDiffer(symbol);
  const momentum = analyzeMomentum(symbol);

  setText(
    "#evenPercent",
    `${round(evenOdd.even)}%`
  );

  setText(
    "#oddPercent",
    `${round(evenOdd.odd)}%`
  );

  setText(
    "#highPercent",
    `${round(highLow.high)}%`
  );

  setText(
    "#lowPercent",
    `${round(highLow.low)}%`
  );

  setText(
    "#overPercent",
    `${round(overUnder.over.probability)}%`
  );

  setText(
    "#underPercent",
    `${round(overUnder.under.probability)}%`
  );

  setText(
    "#matchPercent",
    `${round(matchDiffer.match)}%`
  );

  setText(
    "#differPercent",
    `${round(matchDiffer.differ)}%`
  );

  setText(
    "#risePercent",
    `${round(momentum.rise)}%`
  );

  setText(
    "#fallPercent",
    `${round(momentum.fall)}%`
  );
}

/* =========================================================
   AI PANEL
========================================================= */

function renderAI() {
  const symbol = state.selectedSymbol;

  const result =
    state.selectedStrategy === "AUTO"
      ? analyzeAuto(symbol)
      : analyzeStrategy(
          symbol,
          state.selectedStrategy
        );

  const market = getMarket(symbol);

  const targetText =
    result.target !== null
      ? ` • ${result.target}`
      : "";

  const prediction =
    result.label === "WAIT"
      ? "WAITING"
      : `${result.label}${targetText}`;

  setText(
    "#signal",
    prediction
  );

  setText(
    "#strategyDisplay",
    result.label
  );

  setText(
    "#confidence",
    result.confidence
      ? `${result.confidence}%`
      : "—"
  );

  setText(
    "#dominantDigit",
    market.lastDigit !== null
      ? market.lastDigit
      : "—"
  );

  const dominantRate =
    market.lastDigit !== null
      ? market.digitRates?.[market.lastDigit] || 0
      : 0;

  setText(
    "#digitRate",
    market.lastDigit !== null
      ? `${round(dominantRate)}%`
      : "—"
  );

  setText(
    "#aiReason",
    result.reason
  );

  setText(
    "#aiPredictionResult",
    prediction
  );

  setText(
    "#aiResultStatus",
    result.quality
  );

  setText(
    "#aiResultMain",
    prediction
  );

  setText(
    "#aiResultConfidence",
    result.confidence
      ? `${result.confidence}%`
      : "—"
  );

  setText(
    "#reasonMarket",
    market.name || symbol
  );

  setText(
    "#reasonStrategy",
    result.label
  );

  setText(
    "#reasonLastDigit",
    market.lastDigit !== null
      ? market.lastDigit
      : "—"
  );

  setText(
    "#reasonDigitPressure",
    market.lastDigit !== null
      ? `${round(dominantRate)}%`
      : "—"
  );

  setText(
    "#reasonSignalStrength",
    result.quality
  );

  setText(
    "#reasonSample",
    market.sample || 0
  );

  renderCircle(result);
}

/* =========================================================
   CIRCULAR AI
========================================================= */

function renderCircle(result) {
  setText(
    "#aiCountdown",
    state.aiSeconds
  );

  setText(
    "#aiCircleStatus",
    state.aiPhase
  );

  const target =
    result?.target !== null &&
    result?.target !== undefined
      ? ` ${result.target}`
      : "";

  setText(
    "#aiPredictionResult",
    result
      ? `${result.label}${target}`
      : "WAITING"
  );

  setText(
    "#aiResultStatus",
    result?.quality || "WAIT"
  );

  setText(
    "#aiResultMain",
    result
      ? `${result.label}${target}`
      : "WAITING"
  );

  setText(
    "#aiResultConfidence",
    result?.confidence
      ? `${result.confidence}% CONFIDENCE`
      : "—"
  );
}

/* =========================================================
   MARKET SCANNER
========================================================= */

function getScannerResults() {
  const availableMarkets =
    Object.values(state.markets);

  return availableMarkets
    .filter(market =>
      market.history &&
      market.history.length
    )
    .map(market => {
      updateMarketDerivedData(
        market.symbol
      );

      const result =
        market.auto ||
        analyzeAuto(market.symbol);

      return {
        symbol: market.symbol,
        name: market.name,
        lastDigit: market.lastDigit,
        sample: market.sample || 0,
        result
      };
    })
    .sort((a, b) => {
      const scoreA =
        a.result.edge +
        a.result.confidence * 0.1;

      const scoreB =
        b.result.edge +
        b.result.confidence * 0.1;

      return scoreB - scoreA;
    });
}

function renderMarketScanner() {
  const results =
    getScannerResults();

  state.scanResults = results;

  /*
    The existing HTML may contain a scanner container
    under one of several IDs. We support all of them.
  */

  const container =
    $("#marketScannerList") ||
    $("#marketList") ||
    document.querySelector(".market-list") ||
    document.querySelector(".scanner-grid");

  if (!container) return;

  container.innerHTML = "";

  results.forEach((item, index) => {
    const result = item.result;

    const target =
      result.target !== null &&
      result.target !== undefined
        ? ` • ${result.target}`
        : "";

    const signal =
      result.label === "WAIT"
        ? "WAIT"
        : `${result.label}${target}`;

    const card =
      document.createElement("div");

    card.className =
      "market-card" +
      (item.symbol === state.selectedSymbol
        ? " selected"
        : "");

    card.dataset.symbol =
      item.symbol;

    card.innerHTML = `
      <div class="market-card-top">
        <div>
          <div class="market-card-name">
            ${escapeHTML(item.name)}
          </div>

          <div class="market-card-symbol">
            ${escapeHTML(item.symbol)}
          </div>
        </div>

        <div class="market-live">
          <span class="live-dot"></span>
          LIVE
        </div>
      </div>

      <div class="market-card-signal">
        <span class="signal-label">
          ${escapeHTML(signal)}
        </span>

        <span class="signal-quality ${result.quality.toLowerCase()}">
          ${escapeHTML(result.quality)}
        </span>
      </div>

      <div class="market-card-stats">
        <div>
          <span>LAST DIGIT</span>
          <strong>
            ${item.lastDigit ?? "—"}
          </strong>
        </div>

        <div>
          <span>SAMPLE</span>
          <strong>
            ${item.sample}
          </strong>
        </div>

        <div>
          <span>CONFIDENCE</span>
          <strong>
            ${result.confidence
              ? `${result.confidence}%`
              : "—"}
          </strong>
        </div>
      </div>

      <div class="market-card-rank">
        RANK #${index + 1}
      </div>
    `;

    card.addEventListener("click", () => {
      selectMarket(item.symbol);
    });

    container.appendChild(card);
  });

  setText(
    "#connectedMarkets",
    results.length
  );
}

/* =========================================================
   HTML SAFETY
========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   MARKET SELECTION
========================================================= */

function selectMarket(symbol) {
  if (!symbol) return;

  state.selectedSymbol = symbol;

  getMarket(symbol);

  updateMarketDerivedData(symbol);

  renderSelectedMarket();
  renderDigitDistribution();
  renderProbabilities();
  renderAI();
  renderMarketScanner();
}

/* =========================================================
   STRATEGY SELECTION
========================================================= */

function handleStrategySelection(strategy) {
  state.selectedStrategy =
    strategy || "AUTO";

  state.targetDigit = null;

  document
    .querySelectorAll(".strategy-button")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.strategy ===
          state.selectedStrategy
      );
    });

  renderAI();

  if (state.running) {
    beginAnalysisPhase();
  }
}

/* =========================================================
   AI ENGINE
========================================================= */

function startAIEngine() {
  if (state.running) return;

  state.running = true;
  state.tradeCount = 0;
  state.lastAction = "ANALYZING";

  setText(
    "#engineStatus",
    "RUNNING"
  );

  beginAnalysisPhase();
}

function stopAIEngine() {
  state.running = false;

  clearTimeout(state.aiTimer);
  state.aiTimer = null;

  state.aiPhase = "STOPPED";
  state.aiSeconds = CONFIG.ANALYSIS_SECONDS;
  state.lastAction = "STOPPED";

  setText(
    "#engineStatus",
    "STOPPED"
  );

  renderAI();

  setText(
    "#aiCircleStatus",
    "STOPPED"
  );

  setText(
    "#aiCountdown",
    CONFIG.ANALYSIS_SECONDS
  );

  setText(
    "#lastAction",
    "STOPPED"
  );
}

function beginAnalysisPhase() {
  if (!state.running) return;

  clearTimeout(state.aiTimer);

  state.aiPhase = "ANALYZING";
  state.aiSeconds = CONFIG.ANALYSIS_SECONDS;

  state.lastAction =
    "ANALYZING MARKET";

  updateTradingStatus();

  runAnalysisCountdown();
}

function runAnalysisCountdown() {
  if (!state.running) return;

  const result =
    state.selectedStrategy === "AUTO"
      ? analyzeAuto(state.selectedSymbol)
      : analyzeStrategy(
          state.selectedSymbol,
          state.selectedStrategy
        );

  renderCircle(result);

  if (state.aiSeconds <= 0) {
    finishAnalysisPhase();
    return;
  }

  state.aiSeconds--;

  state.aiTimer = setTimeout(
    runAnalysisCountdown,
    1000
  );
}

function finishAnalysisPhase() {
  if (!state.running) return;

  const result =
    state.selectedStrategy === "AUTO"
      ? analyzeAuto(state.selectedSymbol)
      : analyzeStrategy(
          state.selectedSymbol,
          state.selectedStrategy
        );

  /*
    Weak setups do not receive a fake TRADE NOW.
  */

  if (
    result.quality === "WAIT" ||
    result.quality === "WEAK"
  ) {
    state.aiPhase = "WAIT";

    state.aiSeconds = CONFIG.ANALYSIS_SECONDS;

    state.lastAction =
      "WAITING FOR STRONG SETUP";

    renderCircle(result);
    updateTradingStatus();

    state.aiTimer = setTimeout(
      beginAnalysisPhase,
      1000
    );

    return;
  }

  beginEntryCountdown(result);
}

function beginEntryCountdown(result) {
  if (!state.running) return;

  state.aiPhase = "ENTRY";
  state.aiSeconds = CONFIG.COUNTDOWN_SECONDS;

  state.lastAction =
    "PREPARE ENTRY";

  updateTradingStatus();

  runEntryCountdown(result);
}

function runEntryCountdown(result) {
  if (!state.running) return;

  renderCircle(result);

  if (state.aiSeconds <= 0) {
    fireTradeNow(result);
    return;
  }

  state.aiSeconds--;

  state.aiTimer = setTimeout(
    () => runEntryCountdown(result),
    1000
  );
}

function fireTradeNow(result) {
  if (!state.running) return;

  state.aiPhase = "TRADE NOW";

  state.lastAction = "TRADE NOW";

  state.tradeCount++;

  /*
    ANALYSIS ONLY:
    We do not submit a Deriv contract.
  */

  renderCircle(result);
  updateTradingStatus();

  state.aiTimer = setTimeout(
    beginAnalysisPhase,
    900
  );
}

/* =========================================================
   TRADING STATUS
========================================================= */

function updateTradingStatus() {
  setText(
    "#engineStatus",
    state.running
      ? "RUNNING"
      : "STOPPED"
  );

  setText(
    "#lastAction",
    state.lastAction
  );

  setText(
    "#tradeCount",
    state.tradeCount
  );

  setText(
    "#accountMode",
    "DEMO"
  );

  setText(
    "#engineState",
    state.running
      ? state.aiPhase
      : "STOPPED"
  );
}

/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(status) {
  const pill =
    document.querySelector(
      ".connection-pill"
    );

  if (pill) {
    pill.textContent =
      status === "CONNECTED"
        ? "LIVE DATA CONNECTED"
        : status;
  }

  setText(
    "#footerStatus",
    status === "CONNECTED"
      ? "LIVE DATA CONNECTED"
      : status
  );

  setText(
    "#engineState",
    status
  );
}

/* =========================================================
   ACCOUNT BUTTONS
========================================================= */

function setupAccountControls() {
  document
    .querySelectorAll("[data-account]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const account =
            button.dataset.account;

          if (account === "demo") {
            setText(
              "#accountMode",
              "DEMO"
            );

            setText(
              "#accountType",
              "DEMO"
            );
          }

          if (account === "real") {
            /*
              Real account connection remains disabled
              until authenticated Deriv authorization
              is deliberately implemented.
            */

            setText(
              "#accountMode",
              "REAL"
            );

            setText(
              "#accountType",
              "REAL"
            );

            setText(
              "#loginStatus",
              "NOT CONNECTED"
            );
          }

          document
            .querySelectorAll(
              "[data-account]"
            )
            .forEach(item => {
              item.classList.toggle(
                "active",
                item === button
              );
            });
        }
      );
    });
}

/* =========================================================
   SCAN ALL
========================================================= */

function scanAllMarkets() {
  MARKETS.forEach(item => {
    if (!state.markets[item.symbol]) {
      getMarket(item.symbol);
    }

    if (
      !state.markets[item.symbol].history.length
    ) {
      requestHistory(item.symbol);
    }

    if (
      !state.subscriptions.has(item.symbol)
    ) {
      subscribeTicks(item.symbol);
    }
  });

  renderMarketScanner();
}

/* =========================================================
   STRATEGY BUTTONS
========================================================= */

function setupStrategyControls() {
  const container =
    document.querySelector(
      ".strategy-options"
    );

  if (!container) return;

  container.addEventListener(
    "click",
    event => {
      const button =
        event.target.closest(
          ".strategy-button"
        );

      if (!button) return;

      const strategy =
        button.dataset.strategy;

      if (!strategy) return;

      handleStrategySelection(
        strategy
      );
    }
  );
}

/* =========================================================
   MARKET CARD FALLBACK
========================================================= */

function setupMarketSelectionDelegation() {
  document.addEventListener(
    "click",
    event => {
      const card =
        event.target.closest(
          ".market-card"
        );

      if (!card) return;

      const symbol =
        card.dataset.symbol;

      if (symbol) {
        selectMarket(symbol);
      }
    }
  );
}

/* =========================================================
   INITIALIZATION
========================================================= */

function initialize() {
  setupStrategyControls();
  setupAccountControls();
  setupMarketSelectionDelegation();

  const start =
    $("#startAiEngine");

  if (start) {
    start.addEventListener(
      "click",
      startAIEngine
    );
  }

  const stop =
    $("#stopAiEngine");

  if (stop) {
    stop.addEventListener(
      "click",
      stopAIEngine
    );
  }

  const scan =
    $("#scanAll");

  if (scan) {
    scan.addEventListener(
      "click",
      scanAllMarkets
    );
  }

  /*
    Make sure the initial market exists
    immediately.
  */

  getMarket(
    state.selectedSymbol
  );

  renderSelectedMarket();
  renderDigitDistribution();
  renderProbabilities();
  renderAI();
  updateTradingStatus();

  connectWebSocket();

  /*
    Periodic UI refresh keeps scanner rankings
    synchronized even when multiple markets are
    receiving ticks.
  */

  setInterval(() => {
    Object.keys(state.markets)
      .forEach(symbol => {
        updateMarketDerivedData(symbol);
      });

    renderSelectedMarket();
    renderDigitDistribution();
    renderProbabilities();
    renderAI();
    renderMarketScanner();
    updateTradingStatus();
  }, 2000);
}

document.addEventListener(
  "DOMContentLoaded",
  initialize
);

/* =========================================================
   PUBLIC DEBUG API
========================================================= */

window.KRISHWAVE = {
  state,
  analyzeStrategy,
  analyzeAuto,
  selectMarket,
  startAIEngine,
  stopAIEngine,
  scanAllMarkets
};