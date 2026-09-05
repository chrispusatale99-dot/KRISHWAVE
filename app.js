/* =========================================================
   KRISHWAVE V3 - AI MARKET ANALYSIS ENGINE
   Public Deriv market data
   Analysis only - NO automatic real-money trading
   ========================================================= */

const CONFIG = {
  WS_URL: "wss://api.derivws.com/trading/v1/options/ws/public",

  MAX_HISTORY: 200,
  RECENT_WINDOW: 80,
  MIN_SAMPLE: 30,

  RECONNECT_DELAY: 3000,
  WATCHDOG_MS: 15000,

  STRONG_EDGE: 5,
  HIGH_CONFIDENCE: 65,

  ANALYSIS_SECONDS: 10,
  COUNTDOWN_SECONDS: 7,

  MAX_MARKETS: 13
};


/* =========================================================
   SUPPORTED VOLATILITY MARKETS
   ========================================================= */

const MARKET_DEFINITIONS = [
  { symbol: "R_10",     name: "Volatility 10 Index" },
  { symbol: "R_10_1S",  name: "Volatility 10 (1s) Index" },

  { symbol: "R_15_1S",  name: "Volatility 15 (1s) Index" },

  { symbol: "R_25",     name: "Volatility 25 Index" },
  { symbol: "R_25_1S",  name: "Volatility 25 (1s) Index" },

  { symbol: "R_30_1S",  name: "Volatility 30 (1s) Index" },

  { symbol: "R_50",     name: "Volatility 50 Index" },
  { symbol: "R_50_1S",  name: "Volatility 50 (1s) Index" },

  { symbol: "R_75",     name: "Volatility 75 Index" },
  { symbol: "R_75_1S",  name: "Volatility 75 (1s) Index" },

  { symbol: "R_90_1S",  name: "Volatility 90 (1s) Index" },

  { symbol: "R_100",    name: "Volatility 100 Index" },
  { symbol: "R_100_1S", name: "Volatility 100 (1s) Index" }
];


/* =========================================================
   STATE
   ========================================================= */

const state = {
  ws: null,

  connected: false,
  connecting: false,

  selectedSymbol: null,

  strategy: "AUTO",
  targetDigit: null,

  markets: new Map(),

  requestId: 1000,

  historyRequests: new Set(),
  subscriptions: new Set(),

  lastTickAt: 0,
  totalTicks: 0,

  reconnectTimer: null,
  watchdogTimer: null,

  scanBusy: false,

  aiRunning: false,
  aiTimer: null,
  aiPhase: "IDLE",
  aiSecondsLeft: 0,

  currentPrediction: null,

  tradeCount: 0,
  lastAction: "READY",

  accountMode: "demo"
};


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function show(el, visible = true) {
  if (!el) return;
  el.style.display = visible ? "" : "none";
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}


/* =========================================================
   REQUEST ID
   ========================================================= */

function nextRequestId() {
  state.requestId += 1;
  return state.requestId;
}


/* =========================================================
   WEBSOCKET SEND
   ========================================================= */

function send(payload) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    state.ws.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error("WebSocket send error:", error);
    return false;
  }
}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function updateConnectionUI(status, connected = false) {
  state.connected = connected;

  const pill = document.querySelector(".connection-pill");

  if (pill) {
    pill.textContent = status;

    pill.classList.toggle("connected", connected);
    pill.classList.toggle("online", connected);
    pill.classList.toggle("disconnected", !connected);
  }

  setText("engineState", connected ? "CONNECTED" : "CONNECTING");
  setText("footerStatus", status);
}


/* =========================================================
   CONNECT
   ========================================================= */

function connect() {
  if (
    state.connecting ||
    (state.ws && state.ws.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  state.connecting = true;

  updateConnectionUI("CONNECTING...", false);

  try {
    state.ws = new WebSocket(CONFIG.WS_URL);

    state.ws.addEventListener("open", onSocketOpen);
    state.ws.addEventListener("message", onSocketMessage);
    state.ws.addEventListener("error", onSocketError);
    state.ws.addEventListener("close", onSocketClose);

  } catch (error) {
    console.error("WebSocket creation error:", error);

    state.connecting = false;

    updateConnectionUI("CONNECTION ERROR", false);

    scheduleReconnect();
  }
}


/* =========================================================
   SOCKET OPEN
   ========================================================= */

function onSocketOpen() {
  state.connecting = false;
  state.connected = true;
  state.lastTickAt = Date.now();

  updateConnectionUI("LIVE DATA CONNECTED", true);

  requestActiveSymbols();

  startWatchdog();
}


/* =========================================================
   SOCKET ERROR
   ========================================================= */

function onSocketError(error) {
  console.error("Deriv WebSocket error:", error);

  updateConnectionUI("DATA ERROR", false);
}


/* =========================================================
   SOCKET CLOSE
   ========================================================= */

function onSocketClose() {
  state.connecting = false;
  state.connected = false;

  updateConnectionUI("RECONNECTING...", false);

  scheduleReconnect();
}


/* =========================================================
   RECONNECT
   ========================================================= */

function scheduleReconnect() {
  if (state.reconnectTimer) {
    return;
  }

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connect();
  }, CONFIG.RECONNECT_DELAY);
}


/* =========================================================
   WATCHDOG
   ========================================================= */

function startWatchdog() {
  clearInterval(state.watchdogTimer);

  state.watchdogTimer = setInterval(() => {
    if (!state.connected) return;

    const age = Date.now() - state.lastTickAt;

    if (age > CONFIG.WATCHDOG_MS) {
      console.warn("No tick received recently.");
    }
  }, 5000);
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
   SOCKET MESSAGE
   ========================================================= */

function onSocketMessage(event) {
  let data;

  try {
    data = JSON.parse(event.data);
  } catch (error) {
    console.error("Invalid WebSocket message:", event.data);
    return;
  }

  if (data.error) {
    console.error("Deriv API error:", data.error);
  }

  if (Array.isArray(data.errors)) {
    console.error("Deriv API errors:", data.errors);
  }

  if (data.active_symbols) {
    processActiveSymbols(data.active_symbols);
  }

  if (data.history) {
    processHistory(data);
  }

  if (data.tick) {
    processTick(data.tick);
  }
}


/* =========================================================
   ACTIVE SYMBOL PROCESSING
   ========================================================= */

function processActiveSymbols(symbols) {
  if (!Array.isArray(symbols)) {
    return;
  }

  const available = new Map();

  symbols.forEach(item => {
    const symbol =
      item.underlying_symbol ||
      item.symbol;

    if (!symbol) return;

    const name =
      item.underlying_symbol_name ||
      item.display_name ||
      symbol;

    const pipSize =
      item.pip_size !== undefined
        ? safeNumber(item.pip_size, 2)
        : safeNumber(item.pip, 2);

    available.set(symbol, {
      symbol,
      name,
      pipSize,
      active: true
    });
  });

  MARKET_DEFINITIONS.forEach(def => {
    const item = available.get(def.symbol);

    if (!item) return;

    if (!state.markets.has(def.symbol)) {
      state.markets.set(def.symbol, {
        symbol: def.symbol,
        name: item.name || def.name,
        pipSize: item.pipSize,

        history: [],
        ticks: [],

        quote: null,
        lastDigit: null,

        lastTickTime: 0,

        scan: null
      });
    } else {
      const market = state.markets.get(def.symbol);

      market.name = item.name || def.name;
      market.pipSize = item.pipSize;
    }
  });

  renderMarketList();

  if (!state.selectedSymbol) {
    const first = MARKET_DEFINITIONS.find(def =>
      state.markets.has(def.symbol)
    );

    if (first) {
      selectMarket(first.symbol);
    }
  }

  loadAllMarketHistory();
}


/* =========================================================
   LOAD ALL MARKET HISTORY
   ========================================================= */

function loadAllMarketHistory() {
  state.markets.forEach(market => {
    requestMarketHistory(market.symbol);
  });
}


/* =========================================================
   REQUEST HISTORY
   ========================================================= */

function requestMarketHistory(symbol) {
  if (state.historyRequests.has(symbol)) {
    return;
  }

  const id = nextRequestId();

  state.historyRequests.add(symbol);

  send({
    ticks_history: symbol,
    count: CONFIG.MAX_HISTORY,
    end: "latest",
    style: "ticks",
    req_id: id
  });
}


/* =========================================================
   PROCESS HISTORY
   ========================================================= */

function processHistory(data) {
  const symbol = data.echo_req && data.echo_req.ticks_history;

  if (!symbol) return;

  const market = state.markets.get(symbol);

  state.historyRequests.delete(symbol);

  if (!market) return;

  const prices = data.history.prices || [];
  const times = data.history.times || [];

  market.history = prices
    .map((price, index) => ({
      price: safeNumber(price),
      time: safeNumber(times[index], 0)
    }))
    .filter(item => Number.isFinite(item.price));

  market.ticks = market.history.slice();

  if (market.history.length) {
    const last = market.history[market.history.length - 1];

    market.quote = last.price;
    market.lastDigit = getLastDigit(
      last.price,
      market.pipSize
    );
  }

  analyzeMarket(market);

  renderMarketList();

  if (state.selectedSymbol === symbol) {
    renderSelectedMarket();
    renderPredictionFromCurrentMarket();
  }

  subscribeToTicks(symbol);
}


/* =========================================================
   SUBSCRIBE TO LIVE TICKS
   ========================================================= */

function subscribeToTicks(symbol) {
  if (state.subscriptions.has(symbol)) {
    return;
  }

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


/* =========================================================
   PROCESS LIVE TICK
   ========================================================= */

function processTick(tick) {
  const symbol = tick.symbol;

  if (!symbol) return;

  const market = state.markets.get(symbol);

  if (!market) return;

  const quote = safeNumber(tick.quote, NaN);

  if (!Number.isFinite(quote)) return;

  const time = safeNumber(
    tick.epoch,
    Math.floor(Date.now() / 1000)
  );

  const item = {
    price: quote,
    time
  };

  market.quote = quote;
  market.lastTickTime = Date.now();

  market.history.push(item);
  market.ticks.push(item);

  if (market.history.length > CONFIG.MAX_HISTORY) {
    market.history.shift();
  }

  if (market.ticks.length > CONFIG.MAX_HISTORY) {
    market.ticks.shift();
  }

  market.lastDigit = getLastDigit(
    quote,
    market.pipSize
  );

  state.lastTickAt = Date.now();
  state.totalTicks += 1;

  analyzeMarket(market);

  if (state.selectedSymbol === symbol) {
    renderSelectedMarket();
    renderPredictionFromCurrentMarket();
  }

  renderMarketList();
}


/* =========================================================
   LAST DIGIT
   ========================================================= */

function getLastDigit(price, pipSize = 2) {
  const decimals = Math.max(
    0,
    Math.min(8, Math.round(pipSize))
  );

  const factor = Math.pow(10, decimals);

  const scaled = Math.round(
    safeNumber(price) * factor
  );

  return Math.abs(scaled) % 10;
}


/* =========================================================
   GET DIGITS
   ========================================================= */

function getDigits(market, windowSize = CONFIG.RECENT_WINDOW) {
  if (!market || !market.history) {
    return [];
  }

  return market.history
    .slice(-windowSize)
    .map(item =>
      getLastDigit(item.price, market.pipSize)
    )
    .filter(digit => digit >= 0 && digit <= 9);
}


/* =========================================================
   DIGIT FREQUENCIES
   ========================================================= */

function digitFrequencies(digits) {
  const counts = Array(10).fill(0);

  digits.forEach(digit => {
    if (digit >= 0 && digit <= 9) {
      counts[digit]++;
    }
  });

  const total = digits.length || 1;

  return counts.map(count => ({
    count,
    rate: (count / total) * 100
  }));
}


/* =========================================================
   BASIC STATISTICS
   ========================================================= */

function getParityStats(digits) {
  if (!digits.length) {
    return {
      even: 0,
      odd: 0
    };
  }

  const even =
    digits.filter(digit => digit % 2 === 0).length /
    digits.length *
    100;

  return {
    even,
    odd: 100 - even
  };
}


function getHighLowStats(digits) {
  if (!digits.length) {
    return {
      high: 0,
      low: 0
    };
  }

  const high =
    digits.filter(digit => digit >= 5).length /
    digits.length *
    100;

  return {
    high,
    low: 100 - high
  };
}


function getOverUnderStats(digits, threshold) {
  if (!digits.length) {
    return {
      over: 0,
      under: 0
    };
  }

  const over =
    digits.filter(digit => digit > threshold).length /
    digits.length *
    100;

  return {
    over,
    under: 100 - over
  };
}


/* =========================================================
   MOMENTUM
   ========================================================= */

function calculateMomentum(market) {
  const digits = getDigits(market, 30);

  if (digits.length < 10) {
    return 0;
  }

  const half = Math.floor(digits.length / 2);

  const older = digits.slice(0, half);
  const newer = digits.slice(half);

  const oldAverage =
    older.reduce((sum, d) => sum + d, 0) /
    older.length;

  const newAverage =
    newer.reduce((sum, d) => sum + d, 0) /
    newer.length;

  return newAverage - oldAverage;
}


/* =========================================================
   STREAK
   ========================================================= */

function calculateStreak(digits) {
  if (!digits.length) {
    return 0;
  }

  const last = digits[digits.length - 1];

  let streak = 1;

  for (let i = digits.length - 2; i >= 0; i--) {
    if (digits[i] === last) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}


/* =========================================================
   BEST DIGIT
   ========================================================= */

function getBestDigit(freqs) {
  let bestDigit = 0;
  let bestRate = -1;

  freqs.forEach((item, digit) => {
    if (item.rate > bestRate) {
      bestRate = item.rate;
      bestDigit = digit;
    }
  });

  return {
    digit: bestDigit,
    rate: bestRate
  };
}


/* =========================================================
   DIGIT PRESSURE
   ========================================================= */

function getDigitPressure(freqs) {
  const sorted = freqs
    .map((item, digit) => ({
      digit,
      rate: item.rate
    }))
    .sort((a, b) => b.rate - a.rate);

  if (!sorted.length) {
    return null;
  }

  return sorted[0];
}


/* =========================================================
   MATCH ANALYSIS
   ========================================================= */

function analyzeMatch(digits) {
  const freqs = digitFrequencies(digits);

  const best = getBestDigit(freqs);

  return {
    strategy: "MATCH",
    targetDigit: best.digit,
    probability: best.rate
  };
}


/* =========================================================
   DIFFER ANALYSIS
   ========================================================= */

function analyzeDiffer(digits) {
  const freqs = digitFrequencies(digits);

  const best = getBestDigit(freqs);

  return {
    strategy: "DIFFER",
    targetDigit: best.digit,
    probability: 100 - best.rate
  };
}


/* =========================================================
   OVER ANALYSIS
   ========================================================= */

function analyzeOver(digits) {
  if (!digits.length) {
    return {
      strategy: "OVER",
      targetDigit: 5,
      probability: 0
    };
  }

  let best = null;

  for (let threshold = 0; threshold <= 8; threshold++) {
    const stats =
      getOverUnderStats(digits, threshold);

    const probability = stats.over;

    if (!best || probability > best.probability) {
      best = {
        strategy: "OVER",
        targetDigit: threshold,
        probability
      };
    }
  }

  return best;
}


/* =========================================================
   UNDER ANALYSIS
   ========================================================= */

function analyzeUnder(digits) {
  if (!digits.length) {
    return {
      strategy: "UNDER",
      targetDigit: 5,
      probability: 0
    };
  }

  let best = null;

  for (let threshold = 1; threshold <= 9; threshold++) {
    const stats =
      getOverUnderStats(digits, threshold);

    const probability = stats.under;

    if (!best || probability > best.probability) {
      best = {
        strategy: "UNDER",
        targetDigit: threshold,
        probability
      };
    }
  }

  return best;
}


/* =========================================================
   EVEN ANALYSIS
   ========================================================= */

function analyzeEven(digits) {
  const stats = getParityStats(digits);

  return {
    strategy: "EVEN",
    targetDigit: null,
    probability: stats.even
  };
}


/* =========================================================
   ODD ANALYSIS
   ========================================================= */

function analyzeOdd(digits) {
  const stats = getParityStats(digits);

  return {
    strategy: "ODD",
    targetDigit: null,
    probability: stats.odd
  };
}


/* =========================================================
   HIGH ANALYSIS
   ========================================================= */

function analyzeHigh(digits) {
  const stats = getHighLowStats(digits);

  return {
    strategy: "HIGH",
    targetDigit: null,
    probability: stats.high
  };
}


/* =========================================================
   LOW ANALYSIS
   ========================================================= */

function analyzeLow(digits) {
  const stats = getHighLowStats(digits);

  return {
    strategy: "LOW",
    targetDigit: null,
    probability: stats.low
  };
}


/* =========================================================
   RISE / FALL MOMENTUM
   ========================================================= */

function analyzeRiseFall(market) {
  const history = market.history || [];

  if (history.length < 10) {
    return {
      rise: 50,
      fall: 50
    };
  }

  const prices = history.slice(-30);

  let rises = 0;
  let falls = 0;

  for (let i = 1; i < prices.length; i++) {
    if (prices[i].price > prices[i - 1].price) {
      rises++;
    } else if (prices[i].price < prices[i - 1].price) {
      falls++;
    }
  }

  const total = rises + falls || 1;

  return {
    rise: (rises / total) * 100,
    fall: (falls / total) * 100
  };
}


function analyzeRise(market) {
  const stats = analyzeRiseFall(market);

  return {
    strategy: "RISE",
    targetDigit: null,
    probability: stats.rise
  };
}


function analyzeFall(market) {
  const stats = analyzeRiseFall(market);

  return {
    strategy: "FALL",
    targetDigit: null,
    probability: stats.fall
  };
}


/* =========================================================
   CONFIDENCE
   ========================================================= */

function calculateConfidence(probability, sampleSize, momentum = 0) {
  if (!sampleSize) {
    return 0;
  }

  let confidence = probability;

  /*
     Reduce overconfidence when the sample is small.
  */

  if (sampleSize < 50) {
    confidence -= 4;
  }

  if (sampleSize < 40) {
    confidence -= 5;
  }

  /*
     Small momentum adjustment.
  */

  if (Math.abs(momentum) >= 1.5) {
    confidence += 2;
  }

  confidence = Math.max(
    0,
    Math.min(99, confidence)
  );

  return Math.round(confidence);
}


/* =========================================================
   ANALYZE ONE MARKET
   ========================================================= */

function analyzeMarket(market) {
  if (!market) return null;

  const digits = getDigits(
    market,
    CONFIG.RECENT_WINDOW
  );

  const sampleSize = digits.length;

  const frequencies =
    digitFrequencies(digits);

  const parity =
    getParityStats(digits);

  const highLow =
    getHighLowStats(digits);

  const momentum =
    calculateMomentum(market);

  const streak =
    calculateStreak(digits);

  const bestDigit =
    getBestDigit(frequencies);

  /*
     Not enough data.
  */

  if (sampleSize < CONFIG.MIN_SAMPLE) {
    market.scan = {
      status: "WAIT",
      signal: "WAIT",
      strategy: "WAIT",

      targetDigit: null,

      confidence: 0,

      sampleSize,

      lastDigit: market.lastDigit,

      bestDigit: bestDigit.digit,
      digitRate: bestDigit.rate,

      momentum,
      streak,

      probabilities: {
        even: parity.even,
        odd: parity.odd,

        high: highLow.high,
        low: highLow.low,

        over: 0,
        under: 0,

        match: bestDigit.rate,
        differ: 100 - bestDigit.rate,

        rise: 0,
        fall: 0
      },

      timestamp: Date.now()
    };

    return market.scan;
  }


  /*
     Individual strategy analysis.
  */

  const match = analyzeMatch(digits);
  const differ = analyzeDiffer(digits);
  const over = analyzeOver(digits);
  const under = analyzeUnder(digits);

  const even = analyzeEven(digits);
  const odd = analyzeOdd(digits);

  const high = analyzeHigh(digits);
  const low = analyzeLow(digits);

  const rise = analyzeRise(market);
  const fall = analyzeFall(market);


  /*
     Candidate signals.
  */

  const candidates = [
    match,
    differ,
    over,
    under,
    even,
    odd,
    high,
    low,
    rise,
    fall
  ];


  /*
     Calculate confidence for every candidate.
  */

  candidates.forEach(candidate => {
    candidate.confidence =
      calculateConfidence(
        candidate.probability,
        sampleSize,
        momentum
      );
  });


  /*
     Sort strongest first.
  */

  candidates.sort(
    (a, b) =>
      b.confidence - a.confidence
  );

  const strongest = candidates[0];


  /*
     WAIT protection.
  */

  const isStrong =
    strongest.confidence >= CONFIG.HIGH_CONFIDENCE;

  const status =
    isStrong
      ? "STRONG"
      : strongest.confidence >= 55
        ? "WATCH"
        : "WEAK";


  market.scan = {
    status,

    signal:
      strongest.strategy,

    strategy:
      strongest.strategy,

    targetDigit:
      strongest.targetDigit,

    confidence:
      strongest.confidence,

    sampleSize,

    lastDigit:
      market.lastDigit,

    bestDigit:
      bestDigit.digit,

    digitRate:
      bestDigit.rate,

    momentum,

    streak,

    probabilities: {
      even: even.probability,
      odd: odd.probability,

      high: high.probability,
      low: low.probability,

      over: over.probability,
      under: under.probability,

      match: match.probability,
      differ: differ.probability,

      rise: rise.probability,
      fall: fall.probability
    },

    candidates,

    timestamp: Date.now()
  };


  return market.scan;
}


/* =========================================================
   GET STRATEGY PREDICTION
   ========================================================= */

function getStrategyPrediction(market, strategy) {
  if (!market || !market.scan) {
    return null;
  }

  const scan = market.scan;

  if (strategy === "AUTO") {
    return {
      strategy: scan.strategy,
      targetDigit: scan.targetDigit,
      confidence: scan.confidence,
      probability:
        scan.probabilities[
          scan.strategy.toLowerCase()
        ] || scan.confidence
    };
  }


  const digits =
    getDigits(
      market,
      CONFIG.RECENT_WINDOW
    );

  if (digits.length < CONFIG.MIN_SAMPLE) {
    return {
      strategy,
      targetDigit: null,
      confidence: 0,
      probability: 0
    };
  }


  let result = null;

  switch (strategy) {

    case "MATCH":
      result = analyzeMatch(digits);
      break;

    case "DIFFER":
      result = analyzeDiffer(digits);
      break;

    case "OVER":
      result = analyzeOver(digits);
      break;

    case "UNDER":
      result = analyzeUnder(digits);
      break;

    case "EVEN":
      result = analyzeEven(digits);
      break;

    case "ODD":
      result = analyzeOdd(digits);
      break;

    case "HIGH":
      result = analyzeHigh(digits);
      break;

    case "LOW":
      result = analyzeLow(digits);
      break;

    case "RISE":
      result = analyzeRise(market);
      break;

    case "FALL":
      result = analyzeFall(market);
      break;

    default:
      return null;
  }


  result.confidence =
    calculateConfidence(
      result.probability,
      digits.length,
      calculateMomentum(market)
    );


  return result;
}


/* =========================================================
   SCAN ALL MARKETS
   ========================================================= */

function scanAllMarkets() {
  if (state.scanBusy) {
    return;
  }

  state.scanBusy = true;

  setText("footerStatus", "SCANNING ALL MARKETS...");

  let analyzed = 0;

  state.markets.forEach(market => {
    const result = analyzeMarket(market);

    if (result) {
      analyzed++;
    }
  });

  /*
     Rank markets.
  */

  const ranked = Array.from(
    state.markets.values()
  )
    .filter(market => market.scan)
    .sort((a, b) => {

      const aConfidence =
        a.scan.confidence || 0;

      const bConfidence =
        b.scan.confidence || 0;

      return bConfidence - aConfidence;
    });


  /*
     Select strongest market automatically.
  */

  if (ranked.length) {
    const strongest = ranked[0];

    if (
      strongest.scan &&
      strongest.scan.confidence >= CONFIG.HIGH_CONFIDENCE
    ) {
      selectMarket(strongest.symbol);
    }
  }


  renderMarketList();

  if (state.selectedSymbol) {
    renderSelectedMarket();
    renderPredictionFromCurrentMarket();
  }

  setText(
    "footerStatus",
    `SCAN COMPLETE • ${analyzed} MARKETS ANALYZED`
  );

  state.scanBusy = false;
}


/* =========================================================
   MARKET LIST
   ========================================================= */

function renderMarketList() {
  const container = $("marketList");

  if (!container) return;

  container.innerHTML = "";

  const markets = Array.from(
    state.markets.values()
  ).sort((a, b) => {

    const aScore =
      a.scan ? a.scan.confidence : 0;

    const bScore =
      b.scan ? b.scan.confidence : 0;

    return bScore - aScore;
  });


  if (!markets.length) {
    container.innerHTML = `
      <div class="empty-market">
        Waiting for volatility markets...
      </div>
    `;

    return;
  }


  markets.forEach(market => {

    const scan = market.scan || {};

    const status =
      scan.status || "LOADING";

    const confidence =
      Number.isFinite(scan.confidence)
        ? scan.confidence
        : 0;

    const strategy =
      scan.strategy || "ANALYZING";

    const target =
      scan.targetDigit !== null &&
      scan.targetDigit !== undefined
        ? ` • ${scan.targetDigit}`
        : "";

    const lastDigit =
      market.lastDigit !== null &&
      market.lastDigit !== undefined
        ? market.lastDigit
        : "-";

    const sample =
      scan.sampleSize || 0;


    const card =
      document.createElement("button");

    card.type = "button";

    card.className =
      "market-card" +
      (
        state.selectedSymbol === market.symbol
          ? " selected"
          : ""
      );


    card.innerHTML = `
      <div class="market-card-top">

        <div>
          <div class="market-symbol">
            ${escapeHTML(market.symbol)}
          </div>

          <div class="market-name">
            ${escapeHTML(market.name)}
          </div>
        </div>

        <div class="market-status ${status.toLowerCase()}">
          ${status}
        </div>

      </div>

      <div class="market-card-middle">

        <div>
          <span>AI</span>
          <strong>
            ${escapeHTML(strategy)}${target}
          </strong>
        </div>

        <div>
          <span>CONFIDENCE</span>
          <strong>${confidence}%</strong>
        </div>

      </div>

      <div class="market-card-bottom">

        <span>
          Last digit:
          <strong>${lastDigit}</strong>
        </span>

        <span>
          Sample:
          <strong>${sample}</strong>
        </span>

      </div>
    `;


    card.addEventListener(
      "click",
      () => selectMarket(market.symbol)
    );


    container.appendChild(card);
  });
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   SELECT MARKET
   ========================================================= */

function selectMarket(symbol) {
  if (!state.markets.has(symbol)) {
    return;
  }

  state.selectedSymbol = symbol;

  const market =
    state.markets.get(symbol);

  analyzeMarket(market);

  renderMarketList();
  renderSelectedMarket();
  renderPredictionFromCurrentMarket();

  setText(
    "selectedMarket",
    market.name
  );

  setText(
    "marketCode",
    symbol
  );
}


/* =========================================================
   RENDER SELECTED MARKET
   ========================================================= */

function renderSelectedMarket() {
  const market =
    state.markets.get(state.selectedSymbol);

  if (!market) return;


  setText(
    "selectedMarket",
    market.name
  );

  setText(
    "marketCode",
    market.symbol
  );

  setText(
    "quote",
    market.quote !== null
      ? Number(market.quote).toFixed(
          Math.max(
            0,
            Math.round(market.pipSize)
          )
        )
      : "-"
  );

  setText(
    "lastDigit",
    market.lastDigit !== null
      ? market.lastDigit
      : "-"
  );


  const digits =
    getDigits(
      market,
      CONFIG.RECENT_WINDOW
    );


  setText(
    "sample",
    digits.length
  );

  setText(
    "streak",
    calculateStreak(digits)
  );


  const freqs =
    digitFrequencies(digits);


  for (let digit = 0; digit <= 9; digit++) {

    const item =
      freqs[digit];

    setText(
      `digit${digit}`,
      `${item.rate.toFixed(1)}%`
    );
  }


  const stats =
    market.scan
      ? market.scan.probabilities
      : {};


  setText(
    "evenPercent",
    `${safeNumber(stats.even).toFixed(1)}%`
  );

  setText(
    "oddPercent",
    `${safeNumber(stats.odd).toFixed(1)}%`
  );

  setText(
    "overPercent",
    `${safeNumber(stats.over).toFixed(1)}%`
  );

  setText(
    "underPercent",
    `${safeNumber(stats.under).toFixed(1)}%`
  );

  setText(
    "matchPercent",
    `${safeNumber(stats.match).toFixed(1)}%`
  );

  setText(
    "differPercent",
    `${safeNumber(stats.differ).toFixed(1)}%`
  );

  setText(
    "risePercent",
    `${safeNumber(stats.rise).toFixed(1)}%`
  );

  setText(
    "fallPercent",
    `${safeNumber(stats.fall).toFixed(1)}%`
  );

  setText(
    "highPercent",
    `${safeNumber(stats.high).toFixed(1)}%`
  );

  setText(
    "lowPercent",
    `${safeNumber(stats.low).toFixed(1)}%`
  );


  setText(
    "liveTicks",
    state.totalTicks
  );
}


/* =========================================================
   RENDER CURRENT AI PREDICTION
   ========================================================= */

function renderPredictionFromCurrentMarket() {
  const market =
    state.markets.get(state.selectedSymbol);

  if (!market) return;


  const prediction =
    getStrategyPrediction(
      market,
      state.strategy
    );


  if (!prediction) {
    return;
  }


  state.currentPrediction =
    prediction;


  const strategy =
    prediction.strategy || "WAIT";

  const confidence =
    Math.round(
      safeNumber(prediction.confidence)
    );


  let mainText = strategy;


  /*
     Automatically show predicted number.
  */

  if (
    ["MATCH", "DIFFER", "OVER", "UNDER"]
      .includes(strategy)
  ) {

    if (
      prediction.targetDigit !== null &&
      prediction.targetDigit !== undefined
    ) {
      mainText =
        `${strategy} ${prediction.targetDigit}`;
    }
  }


  setText(
    "signal",
    mainText
  );

  setText(
    "aiReason",
    buildAIReason(
      market,
      prediction
    )
  );

  setText(
    "strategyDisplay",
    strategy
  );

  setText(
    "confidence",
    `${confidence}%`
  );


  setText(
    "dominantDigit",
    market.scan
      ? market.scan.bestDigit
      : "-"
  );

  setText(
    "digitRate",
    market.scan
      ? `${safeNumber(
          market.scan.digitRate
        ).toFixed(1)}%`
      : "-"
  );


  setText(
    "aiPredictionResult",
    mainText
  );

  setText(
    "aiResultMain",
    mainText
  );

  setText(
    "aiResultConfidence",
    `${confidence}% CONFIDENCE`
  );


  setText(
    "reasonMarket",
    market.symbol
  );

  setText(
    "reasonStrategy",
    strategy
  );

  setText(
    "reasonLastDigit",
    market.lastDigit ?? "-"
  );

  setText(
    "reasonDigitPressure",
    market.scan
      ? `${market.scan.bestDigit} • ${
          safeNumber(
            market.scan.digitRate
          ).toFixed(1)
        }%`
      : "-"
  );

  setText(
    "reasonSignalStrength",
    `${confidence}%`
  );

  setText(
    "reasonSample",
    market.scan
      ? market.scan.sampleSize
      : getDigits(market).length
  );
}


/* =========================================================
   AI REASON
   ========================================================= */

function buildAIReason(market, prediction) {

  if (!market) {
    return "Waiting for market data.";
  }

  const confidence =
    safeNumber(prediction.confidence);

  const sample =
    market.scan
      ? market.scan.sampleSize
      : 0;


  if (sample < CONFIG.MIN_SAMPLE) {
    return `Collecting more ticks. ${sample}/${CONFIG.MIN_SAMPLE} minimum sample.`;
  }


  if (confidence >= 75) {
    if (
      prediction.targetDigit !== null &&
      prediction.targetDigit !== undefined
    ) {
      return `Strong digit pressure detected around ${prediction.targetDigit}. The selected strategy currently has ${Math.round(confidence)}% confidence.`;
    }

    return `Strong statistical pressure detected for ${prediction.strategy}. Current confidence is ${Math.round(confidence)}%.`;
  }


  if (confidence >= 65) {
    return `Usable setup detected, but the edge is moderate. Current confidence is ${Math.round(confidence)}%.`;
  }


  if (confidence >= 55) {
    return `Market is being watched. The current setup is not strong enough for a high-confidence signal.`;
  }


  return `Weak setup. KRISHWAVE is waiting for stronger market evidence.`;
}


/* =========================================================
   STRATEGY BUTTONS
   ========================================================= */

function handleStrategySelection(strategy) {

  if (!strategy) return;

  strategy =
    String(strategy)
      .toUpperCase();


  const validStrategies = [
    "AUTO",
    "MATCH",
    "DIFFER",
    "OVER",
    "UNDER",
    "EVEN",
    "ODD",
    "HIGH",
    "LOW",
    "RISE",
    "FALL"
  ];


  if (!validStrategies.includes(strategy)) {
    return;
  }


  state.strategy = strategy;


  document
    .querySelectorAll(
      ".strategy-button"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.strategy === strategy
      );

    });


  /*
     IMPORTANT:
     No number modal.
     MATCH / DIFFER / OVER / UNDER
     get their number automatically.
  */

  state.targetDigit = null;


  renderPredictionFromCurrentMarket();


  setText(
    "strategyDisplay",
    strategy
  );


  setText(
    "footerStatus",
    `${strategy} STRATEGY SELECTED`
  );
}


/* =========================================================
   STRATEGY BUTTON DELEGATION
   ========================================================= */

function setupStrategyButtons() {

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
   START AI ENGINE
   ========================================================= */

function startAIEngine() {

  if (state.aiRunning) {
    return;
  }


  if (!state.selectedSymbol) {

    const first =
      Array.from(
        state.markets.values()
      )[0];

    if (!first) {
      setText(
        "footerStatus",
        "WAITING FOR MARKET DATA..."
      );

      return;
    }

    selectMarket(first.symbol);
  }


  state.aiRunning = true;
  state.tradeCount = 0;
  state.lastAction = "AI ENGINE STARTED";


  setText(
    "engineState",
    "AI RUNNING"
  );

  setText(
    "engineStatus",
    "RUNNING"
  );

  setText(
    "lastAction",
    "ANALYZING"
  );


  beginAnalysisPhase();
}


/* =========================================================
   BEGIN 10 SECOND ANALYSIS
   ========================================================= */

function beginAnalysisPhase() {

  if (!state.aiRunning) {
    return;
  }


  state.aiPhase = "ANALYSIS";
  state.aiSecondsLeft =
    CONFIG.ANALYSIS_SECONDS;


  setText(
    "aiCircleStatus",
    "ANALYZING MARKET"
  );

  setText(
    "aiPredictionResult",
    "ANALYZING..."
  );

  setText(
    "aiResultStatus",
    "10 SECOND ANALYSIS"
  );


  renderPredictionFromCurrentMarket();


  clearInterval(state.aiTimer);


  state.aiTimer =
    setInterval(() => {

      if (!state.aiRunning) {
        clearInterval(state.aiTimer);
        return;
      }


      state.aiSecondsLeft--;

      setText(
        "aiCountdown",
        state.aiSecondsLeft
      );


      /*
         Recalculate during analysis.
      */

      const market =
        state.markets.get(
          state.selectedSymbol
        );

      if (market) {
        analyzeMarket(market);
        renderPredictionFromCurrentMarket();
      }


      if (state.aiSecondsLeft <= 0) {

        clearInterval(
          state.aiTimer
        );

        finishAnalysisPhase();
      }

    }, 1000);


  setText(
    "aiCountdown",
    CONFIG.ANALYSIS_SECONDS
  );
}


/* =========================================================
   FINISH ANALYSIS
   ========================================================= */

function finishAnalysisPhase() {

  if (!state.aiRunning) {
    return;
  }


  const market =
    state.markets.get(
      state.selectedSymbol
    );


  if (!market) {
    beginAnalysisPhase();
    return;
  }


  analyzeMarket(market);


  const prediction =
    getStrategyPrediction(
      market,
      state.strategy
    );


  if (!prediction) {
    beginAnalysisPhase();
    return;
  }


  state.currentPrediction =
    prediction;


  /*
     If there is not enough data,
     keep waiting.
  */

  if (
    prediction.confidence <= 0 ||
    getDigits(
      market,
      CONFIG.RECENT_WINDOW
    ).length < CONFIG.MIN_SAMPLE
  ) {

    state.aiPhase = "WAIT";

    setText(
      "aiCircleStatus",
      "WAITING FOR DATA"
    );

    setText(
      "aiPredictionResult",
      "WAIT"
    );

    setText(
      "aiResultMain",
      "WAIT"
    );

    setText(
      "aiResultStatus",
      "MORE DATA NEEDED"
    );

    setText(
      "lastAction",
      "WAITING"
    );


    setTimeout(() => {

      if (state.aiRunning) {
        beginAnalysisPhase();
      }

    }, 1000);

    return;
  }


  /*
     Show automatic number.
  */

  let predictionText =
    prediction.strategy;


  if (
    ["MATCH", "DIFFER", "OVER", "UNDER"]
      .includes(prediction.strategy)
  ) {

    predictionText =
      `${prediction.strategy} ${prediction.targetDigit}`;
  }


  setText(
    "aiPredictionResult",
    predictionText
  );

  setText(
    "aiResultMain",
    predictionText
  );

  setText(
    "aiResultConfidence",
    `${Math.round(
      prediction.confidence
    )}% CONFIDENCE`
  );


  /*
     Move to 7 second preparation.
  */

  beginEntryCountdown();
}


/* =========================================================
   BEGIN 7 SECOND COUNTDOWN
   ========================================================= */

function beginEntryCountdown() {

  if (!state.aiRunning) {
    return;
  }


  state.aiPhase = "COUNTDOWN";
  state.aiSecondsLeft =
    CONFIG.COUNTDOWN_SECONDS;


  const prediction =
    state.currentPrediction;


  let text =
    prediction
      ? prediction.strategy
      : "WAIT";


  if (
    prediction &&
    ["MATCH", "DIFFER", "OVER", "UNDER"]
      .includes(prediction.strategy)
  ) {

    text =
      `${prediction.strategy} ${prediction.targetDigit}`;
  }


  setText(
    "aiCircleStatus",
    "PREPARE"
  );

  setText(
    "aiPredictionResult",
    text
  );

  setText(
    "aiResultStatus",
    "TRADE PREPARATION"
  );

  setText(
    "lastAction",
    `PREPARE ${text}`
  );

  setText(
    "aiCountdown",
    CONFIG.COUNTDOWN_SECONDS
  );


  clearInterval(
    state.aiTimer
  );


  state.aiTimer =
    setInterval(() => {

      if (!state.aiRunning) {
        clearInterval(state.aiTimer);
        return;
      }


      state.aiSecondsLeft--;


      setText(
        "aiCountdown",
        state.aiSecondsLeft
      );


      if (state.aiSecondsLeft <= 0) {

        clearInterval(
          state.aiTimer
        );

        fireTradeNow();
      }

    }, 1000);
}


/* =========================================================
   TRADE NOW SIGNAL
   ========================================================= */

function fireTradeNow() {

  if (!state.aiRunning) {
    return;
  }


  const prediction =
    state.currentPrediction;


  if (!prediction) {
    beginAnalysisPhase();
    return;
  }


  let predictionText =
    prediction.strategy;


  if (
    ["MATCH", "DIFFER", "OVER", "UNDER"]
      .includes(prediction.strategy)
  ) {

    predictionText =
      `${prediction.strategy} ${prediction.targetDigit}`;
  }


  /*
     Only issue TRADE NOW when
     confidence is reasonably strong.
  */

  if (
    prediction.confidence >= CONFIG.HIGH_CONFIDENCE
  ) {

    state.tradeCount++;
    state.lastAction =
      `TRADE NOW • ${predictionText}`;


    setText(
      "aiCircleStatus",
      "TRADE NOW"
    );

    setText(
      "aiPredictionResult",
      predictionText
    );

    setText(
      "aiResultStatus",
      "SIGNAL FIRED"
    );

    setText(
      "aiResultMain",
      predictionText
    );

    setText(
      "lastAction",
      state.lastAction
    );

    setText(
      "tradeCount",
      state.tradeCount
    );

  } else {

    /*
       Weak signal protection.
    */

    setText(
      "aiCircleStatus",
      "WAIT"
    );

    setText(
      "aiPredictionResult",
      "WAIT"
    );

    setText(
      "aiResultStatus",
      "SIGNAL TOO WEAK"
    );

    setText(
      "aiResultMain",
      "WAIT"
    );

    setText(
      "lastAction",
      "WAIT • WEAK SIGNAL"
    );
  }


  /*
     Immediately start another cycle.
  */

  setTimeout(() => {

    if (state.aiRunning) {
      beginAnalysisPhase();
    }

  }, 900);
}


/* =========================================================
   STOP AI ENGINE
   ========================================================= */

function stopAIEngine() {

  state.aiRunning = false;
  state.aiPhase = "IDLE";
  state.aiSecondsLeft = 0;

  clearInterval(
    state.aiTimer
  );

  state.aiTimer = null;


  setText(
    "aiCountdown",
    "STOP"
  );

  setText(
    "aiCircleStatus",
    "ENGINE STOPPED"
  );

  setText(
    "aiPredictionResult",
    "WAIT"
  );

  setText(
    "aiResultStatus",
    "READY"
  );

  setText(
    "aiResultMain",
    "WAIT"
  );

  setText(
    "engineState",
    "CONNECTED"
  );

  setText(
    "engineStatus",
    "STOPPED"
  );

  setText(
    "lastAction",
    "ENGINE STOPPED"
  );

  setText(
    "footerStatus",
    "AI ENGINE STOPPED"
  );
}


/* =========================================================
   ACCOUNT MODE
   ========================================================= */

function setAccountMode(mode) {

  mode =
    String(mode)
      .toLowerCase();


  if (
    mode !== "demo" &&
    mode !== "real"
  ) {
    mode = "demo";
  }


  state.accountMode = mode;


  document
    .querySelectorAll(
      "[data-account-mode]"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.accountMode === mode
      );

    });


  setText(
    "accountMode",
    mode.toUpperCase()
  );


  if (mode === "real") {

    setText(
      "footerStatus",
      "REAL MODE SELECTED • ANALYSIS ONLY"
    );

  } else {

    setText(
      "footerStatus",
      "DEMO MODE SELECTED"
    );
  }
}


/* =========================================================
   ACCOUNT BUTTONS
   ========================================================= */

function setupAccountButtons() {

  document
    .querySelectorAll(
      "[data-account-mode]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          setAccountMode(
            button.dataset.accountMode
          );

        }
      );

    });
}


/* =========================================================
   START / STOP BUTTONS
   ========================================================= */

function setupEngineButtons() {

  const startButton =
    document.querySelector(
      "#startAiEngine"
    );

  const stopButton =
    document.querySelector(
      "#stopAiEngine"
    );

  if (startButton) {

    startButton.addEventListener(
      "click",
      startAIEngine
    );
  }

  if (stopButton) {

    stopButton.addEventListener(
      "click",
      stopAIEngine
    );
  }
}


/* =========================================================
   SCAN BUTTON
   ========================================================= */

function setupScanButton() {

  const button =
    document.querySelector(
      "#scanAll"
    );

  if (!button) return;

  button.addEventListener(
    "click",
    scanAllMarkets
  );
}


/* =========================================================
   MODAL DISABLER
   =========================================================

   Old versions had a target-number modal.
   We deliberately disable it because the AI
   now predicts the number automatically.
   ========================================================= */

function disableOldNumberModal() {

  const modal =
    document.querySelector(
      "#strategyNumberModal"
    );

  if (modal) {
    modal.style.display = "none";
  }


  const targetInput =
    document.querySelector(
      "#targetDigit"
    );

  if (targetInput) {
    targetInput.disabled = true;
  }
}


/* =========================================================
   AUTO SCANNER
   ========================================================= */

function startPeriodicMarketAnalysis() {

  setInterval(() => {

    state.markets.forEach(
      market => analyzeMarket(market)
    );

    renderMarketList();

    if (state.selectedSymbol) {
      renderSelectedMarket();
    }

  }, 3000);
}


/* =========================================================
   INITIAL UI
   ========================================================= */

function initializeUI() {

  setupStrategyButtons();
  setupAccountButtons();
  setupEngineButtons();
  setupScanButton();

  disableOldNumberModal();

  setAccountMode(
    state.accountMode
  );


  /*
     Default strategy.
  */

  handleStrategySelection(
    "AUTO"
  );


  setText(
    "aiCountdown",
    "10"
  );

  setText(
    "aiCircleStatus",
    "READY"
  );

  setText(
    "aiPredictionResult",
    "WAIT"
  );

  setText(
    "aiResultStatus",
    "AI READY"
  );

  setText(
    "engineStatus",
    "STOPPED"
  );

  setText(
    "lastAction",
    "READY"
  );

  setText(
    "tradeCount",
    "0"
  );
}


/* =========================================================
   INITIALIZE
   ========================================================= */

function init() {

  initializeUI();

  startPeriodicMarketAnalysis();

  connect();

  /*
     Public data is analysis only.
  */

  if (
    window.KRISHWAVE_CONFIG &&
    window.KRISHWAVE_CONFIG.tradingEnabled
  ) {

    console.warn(
      "Trading execution is not implemented in this analysis build."
    );
  }
}


/* =========================================================
   PUBLIC API
   ========================================================= */

window.KRISHWAVE = {
  state,

  connect,

  scanAllMarkets,

  startAIEngine,

  stopAIEngine,

  selectMarket,

  setAccountMode,

  analyzeMarket,

  getStrategyPrediction
};


/* =========================================================
   START APP
   ========================================================= */

if (
  document.readyState === "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

} else {

  init();
}