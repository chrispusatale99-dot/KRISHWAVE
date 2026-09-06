/* =========================================================
   KRISHWAVE V4.0
   DERIV MARKET INTELLIGENCE + RISK ENGINE

   IMPORTANT:
   - Analysis only
   - No real contracts are submitted
   - Demo/Real OAuth login is initiated securely
   - OAuth token exchange requires secure backend
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

  ANALYSIS_SECONDS: 10,
  COUNTDOWN_SECONDS: 7,

  MAX_MARKETS: 13,

  STRONG_EDGE: 10,
  WATCH_EDGE: 6,

  MAX_CONFIDENCE: 92,

  MIN_STAKE: 0.25,
  DEFAULT_STAKE: 0.25,

  DEFAULT_TAKE_PROFIT: 5,
  DEFAULT_STOP_LOSS: 5,

  DEFAULT_MARTINGALE: 2,
  MAX_STAKE: 10,

  RECONNECT_DELAY: 3000
};

const MARKETS = [
  {symbol:"R_10",name:"Volatility 10 Index"},
  {symbol:"R_10_1S",name:"Volatility 10 (1s) Index"},
  {symbol:"R_15_1S",name:"Volatility 15 (1s) Index"},
  {symbol:"R_25",name:"Volatility 25 Index"},
  {symbol:"R_25_1S",name:"Volatility 25 (1s) Index"},
  {symbol:"R_30_1S",name:"Volatility 30 (1s) Index"},
  {symbol:"R_50",name:"Volatility 50 Index"},
  {symbol:"R_50_1S",name:"Volatility 50 (1s) Index"},
  {symbol:"R_75",name:"Volatility 75 Index"},
  {symbol:"R_75_1S",name:"Volatility 75 (1s) Index"},
  {symbol:"R_90_1S",name:"Volatility 90 (1s) Index"},
  {symbol:"R_100",name:"Volatility 100 Index"},
  {symbol:"R_100_1S",name:"Volatility 100 (1s) Index"}
];

/* =========================================================
   STATE
   ========================================================= */

const state = {

  ws: null,

  connected: false,

  selectedSymbol: "R_10",

  selectedStrategy: "AUTO",

  markets: {},

  requestId: 1,

  subscriptions: new Set(),

  pendingHistory: new Set(),

  reconnectTimer: null,

  aiTimer: null,

  aiPhase: "READY",

  aiSeconds: CONFIG.ANALYSIS_SECONDS,

  running: false,

  signals: 0,

  lastAction: "READY",

  theme: "dark",

  auth: {
    connected: false,
    accountType: "DEMO",
    accountId: null,
    balance: null,
    currency: null,
    accessToken: null,
    wsUrl: null
  },

  risk: {
    baseStake: CONFIG.DEFAULT_STAKE,
    currentStake: CONFIG.DEFAULT_STAKE,
    takeProfit: CONFIG.DEFAULT_TAKE_PROFIT,
    stopLoss: CONFIG.DEFAULT_STOP_LOSS,
    martingale: CONFIG.DEFAULT_MARTINGALE,
    maxStake: CONFIG.MAX_STAKE,

    sessionPL: 0,

    wins: 0,
    losses: 0,
    lossStreak: 0,

    paused: false,

    state: "READY"
  }
};

/* =========================================================
   DOM
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id,value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}

function clamp(value,min,max) {
  return Math.max(min,Math.min(max,value));
}

function round(value,digits=2) {
  const p = Math.pow(10,digits);
  return Math.round(value*p)/p;
}

/* =========================================================
   THEME
   ========================================================= */

function applyTheme(theme) {

  state.theme = theme;

  document.body.classList.toggle(
    "light-mode",
    theme === "light"
  );

  localStorage.setItem(
    "KRISHWAVE_THEME",
    theme
  );

  const btn = $("themeToggle");

  if (btn) {
    btn.textContent =
      theme === "light" ? "☀️" : "🌙";
  }
}

function setupTheme() {

  const saved =
    localStorage.getItem(
      "KRISHWAVE_THEME"
    ) || "dark";

  applyTheme(saved);

  const btn = $("themeToggle");

  if (btn) {
    btn.addEventListener(
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
}

/* =========================================================
   MARKET HELPERS
   ========================================================= */

function getMarket(symbol) {

  if (!state.markets[symbol]) {

    const info =
      MARKETS.find(
        m => m.symbol === symbol
      ) || {
        symbol,
        name: symbol
      };

    state.markets[symbol] = {
      ...info,
      history: [],
      quote: null,
      digit: null,
      pipSize: 2,
      lastUpdate: 0
    };
  }

  return state.markets[symbol];
}

function getHistory(symbol) {

  const market =
    getMarket(symbol);

  return market.history.slice(
    -CONFIG.RECENT_WINDOW
  );
}

/* =========================================================
   DERIV PUBLIC WEBSOCKET
   ========================================================= */

function nextRequestId() {
  return state.requestId++;
}

function send(data) {

  if (
    state.ws &&
    state.ws.readyState === WebSocket.OPEN
  ) {
    state.ws.send(
      JSON.stringify(data)
    );

    return true;
  }

  return false;
}

function connectPublicWebSocket() {

  if (
    state.ws &&
    (
      state.ws.readyState === WebSocket.OPEN ||
      state.ws.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  updateConnection(
    "CONNECTING"
  );

  try {

    state.ws =
      new WebSocket(
        CONFIG.WS_URL
      );

  } catch (error) {

    console.error(error);

    updateConnection(
      "ERROR"
    );

    scheduleReconnect();

    return;
  }

  state.ws.onopen = () => {

    state.connected = true;

    updateConnection(
      "LIVE"
    );

    requestActiveSymbols();

  };

  state.ws.onmessage = event => {

    try {

      handleMessage(
        JSON.parse(event.data)
      );

    } catch (error) {

      console.error(
        "Invalid Deriv message",
        error
      );

    }

  };

  state.ws.onerror = () => {

    updateConnection(
      "ERROR"
    );

  };

  state.ws.onclose = () => {

    state.connected = false;

    updateConnection(
      "OFFLINE"
    );

    scheduleReconnect();

  };
}

function scheduleReconnect() {

  if (state.reconnectTimer) {
    return;
  }

  state.reconnectTimer =
    setTimeout(
      () => {

        state.reconnectTimer =
          null;

        connectPublicWebSocket();

      },
      CONFIG.RECONNECT_DELAY
    );
}

function requestActiveSymbols() {

  send({
    active_symbols: "brief",
    product_type: "basic",
    req_id: nextRequestId()
  });

}

function handleMessage(data) {

  if (data.error) {

    console.warn(
      "Deriv:",
      data.error.message
    );

    return;
  }

  if (data.msg_type === "active_symbols") {

    handleActiveSymbols(
      data.active_symbols || []
    );

    return;
  }

  if (data.msg_type === "history") {

    handleHistory(data);

    return;
  }

  if (data.msg_type === "tick") {

    handleTick(data);

  }
}

/* =========================================================
   MARKET SUBSCRIPTIONS
   ========================================================= */

function handleActiveSymbols(list) {

  const available =
    MARKETS.filter(
      wanted =>
        list.some(
          item =>
            item.symbol === wanted.symbol
        )
    );

  const selected =
    available.length
      ? available
      : MARKETS;

  selected
    .slice(0,CONFIG.MAX_MARKETS)
    .forEach(
      market => {

        getMarket(
          market.symbol
        );

        requestHistory(
          market.symbol
        );

        subscribeTicks(
          market.symbol
        );

      }
    );
}

function requestHistory(symbol) {

  const requestId =
    nextRequestId();

  state.pendingHistory.add(
    requestId
  );

  send({
    ticks_history: symbol,
    count: CONFIG.MAX_HISTORY,
    end: "latest",
    style: "ticks",
    req_id: requestId
  });
}

function subscribeTicks(symbol) {

  if (
    state.subscriptions.has(
      symbol
    )
  ) {
    return;
  }

  const ok =
    send({
      ticks: symbol,
      subscribe: 1,
      req_id: nextRequestId()
    });

  if (ok) {
    state.subscriptions.add(
      symbol
    );
  }
}

function handleHistory(data) {

  const symbol =
    data.echo_req &&
    data.echo_req.ticks_history;

  if (!symbol) {
    return;
  }

  const market =
    getMarket(symbol);

  const prices =
    data.history &&
    data.history.prices
      ? data.history.prices
      : [];

  const times =
    data.history &&
    data.history.times
      ? data.history.times
      : [];

  market.history = prices.map(
    (price,index) => ({
      quote: Number(price),
      time: Number(times[index] || 0),
      digit: extractLastDigit(
        Number(price),
        market.pipSize
      )
    })
  ).slice(
    -CONFIG.MAX_HISTORY
  );

  if (market.history.length) {

    const last =
      market.history[
        market.history.length - 1
      ];

    market.quote =
      last.quote;

    market.digit =
      last.digit;
  }

  renderAll();
}

function handleTick(data) {

  const tick =
    data.tick;

  if (!tick || !tick.symbol) {
    return;
  }

  const symbol =
    tick.symbol;

  const market =
    getMarket(symbol);

  const quote =
    Number(tick.quote);

  const digit =
    extractLastDigit(
      quote,
      market.pipSize
    );

  market.quote =
    quote;

  market.digit =
    digit;

  market.lastUpdate =
    Date.now();

  market.history.push({
    quote,
    time:
      Number(tick.epoch || 0),
    digit
  });

  if (
    market.history.length >
    CONFIG.MAX_HISTORY
  ) {
    market.history.shift();
  }

  renderAll();
}

/* =========================================================
   DIGIT ENGINE
   ========================================================= */

function extractLastDigit(
  quote,
  pipSize = 2
) {

  if (!Number.isFinite(quote)) {
    return null;
  }

  const fixed =
    Math.abs(
      quote
    ).toFixed(pipSize);

  const digits =
    fixed.replace(
      /\D/g,
      ""
    );

  return Number(
    digits.charAt(
      digits.length - 1
    )
  );
}

function getDigits(symbol) {

  return getHistory(symbol)
    .map(x => x.digit)
    .filter(
      d =>
        Number.isInteger(d) &&
        d >= 0 &&
        d <= 9
    );
}

function getDigitCounts(symbol) {

  const counts =
    Array(10).fill(0);

  getDigits(symbol)
    .forEach(
      digit => {
        counts[digit]++;
      }
    );

  return counts;
}

function getDigitRates(symbol) {

  const counts =
    getDigitCounts(symbol);

  const total =
    counts.reduce(
      (a,b) => a+b,
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
   BASIC ANALYSIS
   ========================================================= */

function analyzeEvenOdd(symbol) {

  const digits =
    getDigits(symbol);

  const sample =
    digits.length;

  if (!sample) {
    return {
      even: 50,
      odd: 50,
      sample
    };
  }

  const even =
    digits.filter(
      d => d % 2 === 0
    ).length / sample * 100;

  return {
    even,
    odd: 100-even,
    sample
  };
}

function analyzeHighLow(symbol) {

  const digits =
    getDigits(symbol);

  const sample =
    digits.length;

  if (!sample) {
    return {
      high: 50,
      low: 50,
      sample
    };
  }

  const high =
    digits.filter(
      d => d >= 5
    ).length / sample * 100;

  return {
    high,
    low: 100-high,
    sample
  };
}

function analyzeOverUnder(symbol) {

  const digits =
    getDigits(symbol);

  const sample =
    digits.length;

  if (!sample) {
    return {
      over: 50,
      under: 50,
      threshold: 5,
      sample
    };
  }

  let best = null;

  for (
    let threshold = 1;
    threshold <= 8;
    threshold++
  ) {

    const over =
      digits.filter(
        d => d > threshold
      ).length / sample * 100;

    const under =
      100-over;

    const edge =
      Math.abs(
        over - 50
      );

    const score =
      edge -
      Math.abs(
        threshold - 5
      ) * .7;

    if (
      !best ||
      score > best.score
    ) {

      best = {
        over,
        under,
        threshold,
        score
      };

    }
  }

  return {
    ...best,
    sample
  };
}

function analyzeMatchDiffer(symbol) {

  const rates =
    getDigitRates(symbol);

  const sample =
    getDigits(symbol).length;

  if (!sample) {

    return {
      target: 0,
      match: 10,
      differ: 90,
      sample
    };
  }

  let target =
    rates.indexOf(
      Math.max(...rates)
    );

  const match =
    rates[target];

  return {
    target,
    match,
    differ: 100-match,
    sample
  };
}

function analyzeMomentum(symbol) {

  const history =
    getHistory(symbol);

  if (
    history.length < 2
  ) {
    return {
      rise: 50,
      fall: 50
    };
  }

  let rise = 0;
  let fall = 0;

  for (
    let i = 1;
    i < history.length;
    i++
  ) {

    if (
      history[i].quote >
      history[i-1].quote
    ) {
      rise++;
    }

    if (
      history[i].quote <
      history[i-1].quote
    ) {
      fall++;
    }
  }

  const total =
    rise + fall;

  if (!total) {
    return {
      rise: 50,
      fall: 50
    };
  }

  return {
    rise: rise/total*100,
    fall: fall/total*100
  };
}

/* =========================================================
   CONFIDENCE
   ========================================================= */

function confidenceFromProbability(
  probability,
  sample
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

  return clamp(
    50 +
    edge * .8 +
    sampleFactor * 8,
    50,
    CONFIG.MAX_CONFIDENCE
  );
}

function getQuality(
  probability,
  sample
) {

  if (
    sample <
    CONFIG.MIN_SAMPLE
  ) {
    return "WAIT";
  }

  const edge =
    Math.abs(
      probability - 50
    );

  if (
    edge >= CONFIG.STRONG_EDGE
  ) {
    return "STRONG";
  }

  if (
    edge >= CONFIG.WATCH_EDGE
  ) {
    return "WATCH";
  }

  return "WEAK";
}

/* =========================================================
   STRATEGY ENGINE
   ========================================================= */

function analyzeStrategy(
  symbol,
  strategy
) {

  const sample =
    getDigits(symbol).length;

  let label =
    "WAIT";

  let target =
    "—";

  let probability =
    50;

  let reason =
    "Waiting for sufficient data.";

  const eo =
    analyzeEvenOdd(symbol);

  const hl =
    analyzeHighLow(symbol);

  const ou =
    analyzeOverUnder(symbol);

  const md =
    analyzeMatchDiffer(symbol);

  const mom =
    analyzeMomentum(symbol);

  switch(strategy) {

    case "EVEN":

      label = "EVEN";
      probability = eo.even;

      reason =
        `Even digits represent ${round(eo.even)}% of the recent sample.`;

      break;

    case "ODD":

      label = "ODD";
      probability = eo.odd;

      reason =
        `Odd digits represent ${round(eo.odd)}% of the recent sample.`;

      break;

    case "HIGH":

      label = "HIGH";
      probability = hl.high;

      reason =
        `High digits (5–9) represent ${round(hl.high)}% of the sample.`;

      break;

    case "LOW":

      label = "LOW";
      probability = hl.low;

      reason =
        `Low digits (0–4) represent ${round(hl.low)}% of the sample.`;

      break;

    case "OVER":

      label =
        `OVER ${ou.threshold}`;

      probability =
        ou.over;

      target =
        `>${ou.threshold}`;

      reason =
        `Digits above ${ou.threshold} represent ${round(ou.over)}%.`;

      break;

    case "UNDER":

      label =
        `UNDER ${ou.threshold}`;

      probability =
        ou.under;

      target =
        `<${ou.threshold}`;

      reason =
        `Digits below or equal to ${ou.threshold} represent ${round(ou.under)}%.`;

      break;

    case "MATCH":

      label = "MATCH";
      probability = md.match;
      target = String(md.target);

      reason =
        `Digit ${md.target} is currently the most frequent digit at ${round(md.match)}%.`;

      break;

    case "DIFFER":

      label = "DIFFER";
      probability = md.differ;
      target = String(md.target);

      reason =
        `Different from digit ${md.target}: estimated ${round(md.differ)}%.`;

      break;

    case "RISE":

      label = "RISE";
      probability = mom.rise;

      reason =
        `Recent quote movement is rising ${round(mom.rise)}% of directional moves.`;

      break;

    case "FALL":

      label = "FALL";
      probability = mom.fall;

      reason =
        `Recent quote movement is falling ${round(mom.fall)}% of directional moves.`;

      break;

    default:

      label = "WAIT";

  }

  const confidence =
    confidenceFromProbability(
      probability,
      sample
    );

  const edge =
    Math.abs(
      probability - 50
    );

  return {
    strategy,
    label,
    target,
    probability,
    confidence,
    edge,
    quality:
      getQuality(
        probability,
        sample
      ),
    sample,
    reason
  };
}

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

  const results =
    strategies.map(
      strategy =>
        analyzeStrategy(
          symbol,
          strategy
        )
    );

  const valid =
    results.filter(
      result =>
        result.sample >=
        CONFIG.MIN_SAMPLE
    );

  if (!valid.length) {

    return {
      strategy: "AUTO",
      label: "WAIT",
      target: "—",
      probability: 50,
      confidence: 50,
      edge: 0,
      quality: "WAIT",
      sample:
        getDigits(symbol).length,
      reason:
        "Waiting for at least 30 recent ticks."
    };
  }

  valid.sort(
    (a,b) =>
      (
        b.edge +
        b.confidence * .12
      ) -
      (
        a.edge +
        a.confidence * .12
      )
  );

  return {
    ...valid[0],
    strategy: "AUTO",
    reason:
      `AUTO selected ${valid[0].label} because it currently has the strongest statistical edge among the available strategies.`
  };
}

/* =========================================================
   RISK ENGINE
   ========================================================= */

function loadRiskSettings() {

  try {

    const saved =
      JSON.parse(
        localStorage.getItem(
          "KRISHWAVE_RISK"
        ) || "null"
      );

    if (!saved) {
      return;
    }

    state.risk.baseStake =
      Math.max(
        CONFIG.MIN_STAKE,
        Number(saved.baseStake) ||
        CONFIG.DEFAULT_STAKE
      );

    state.risk.currentStake =
      Math.max(
        CONFIG.MIN_STAKE,
        Number(saved.currentStake) ||
        state.risk.baseStake
      );

    state.risk.takeProfit =
      Math.max(
        0,
        Number(saved.takeProfit) ||
        CONFIG.DEFAULT_TAKE_PROFIT
      );

    state.risk.stopLoss =
      Math.max(
        0,
        Number(saved.stopLoss) ||
        CONFIG.DEFAULT_STOP_LOSS
      );

    state.risk.martingale =
      Math.max(
        1,
        Number(saved.martingale) ||
        CONFIG.DEFAULT_MARTINGALE
      );

  } catch(error) {

    console.warn(
      "Risk settings could not load",
      error
    );
  }
}

function saveRiskSettings() {

  localStorage.setItem(
    "KRISHWAVE_RISK",
    JSON.stringify({
      baseStake:
        state.risk.baseStake,

      currentStake:
        state.risk.currentStake,

      takeProfit:
        state.risk.takeProfit,

      stopLoss:
        state.risk.stopLoss,

      martingale:
        state.risk.martingale
    })
  );
}

function syncRiskInputs() {

  const stake =
    Math.max(
      CONFIG.MIN_STAKE,
      Number(
        $("baseStake")?.value
      ) || CONFIG.MIN_STAKE
    );

  const tp =
    Math.max(
      0,
      Number(
        $("takeProfit")?.value
      ) || 0
    );

  const sl =
    Math.max(
      0,
      Number(
        $("stopLoss")?.value
      ) || 0
    );

  const multiplier =
    Math.max(
      1,
      Number(
        $("martingale")?.value
      ) || 1
    );

  state.risk.baseStake =
    stake;

  state.risk.takeProfit =
    tp;

  state.risk.stopLoss =
    sl;

  state.risk.martingale =
    multiplier;

  if (
    state.risk.currentStake <
    CONFIG.MIN_STAKE
  ) {
    state.risk.currentStake =
      stake;
  }

  saveRiskSettings();

  renderRisk();
}

function paperWin() {

  if (state.risk.paused) {
    return;
  }

  const stake =
    state.risk.currentStake;

  state.risk.sessionPL =
    round(
      state.risk.sessionPL +
      stake
    );

  state.risk.wins++;

  state.risk.lossStreak = 0;

  state.risk.currentStake =
    state.risk.baseStake;

  state.lastAction =
    "PAPER WIN";

  checkRiskLimits();

  renderRisk();
  updateStatus();

}

function paperLoss() {

  if (state.risk.paused) {
    return;
  }

  const stake =
    state.risk.currentStake;

  state.risk.sessionPL =
    round(
      state.risk.sessionPL -
      stake
    );

  state.risk.losses++;

  state.risk.lossStreak++;

  let nextStake =
    stake *
    state.risk.martingale;

  nextStake =
    clamp(
      nextStake,
      CONFIG.MIN_STAKE,
      state.risk.maxStake
    );

  state.risk.currentStake =
    round(
      nextStake
    );

  state.lastAction =
    "PAPER LOSS";

  checkRiskLimits();

  renderRisk();
  updateStatus();

}

function checkRiskLimits() {

  const pl =
    state.risk.sessionPL;

  if (
    state.risk.takeProfit > 0 &&
    pl >=
    state.risk.takeProfit
  ) {

    state.risk.paused = true;

    state.risk.state =
      "TAKE PROFIT";

    stopAIEngine();

    return;
  }

  if (
    state.risk.stopLoss > 0 &&
    pl <=
    -state.risk.stopLoss
  ) {

    state.risk.paused = true;

    state.risk.state =
      "STOP LOSS";

    stopAIEngine();

    return;
  }

  state.risk.paused = false;
  state.risk.state = "READY";
}

function resetRisk() {

  state.risk.sessionPL = 0;
  state.risk.wins = 0;
  state.risk.losses = 0;
  state.risk.lossStreak = 0;

  state.risk.currentStake =
    state.risk.baseStake;

  state.risk.paused = false;
  state.risk.state = "READY";

  state.lastAction =
    "RISK RESET";

  renderRisk();
  updateStatus();
}

function renderRisk() {

  setText(
    "currentStake",
    state.risk.currentStake.toFixed(2)
  );

  setText(
    "sessionPL",
    state.risk.sessionPL >= 0
      ? `+${state.risk.sessionPL.toFixed(2)}`
      : state.risk.sessionPL.toFixed(2)
  );

  setText(
    "winCount",
    state.risk.wins
  );

  setText(
    "lossCount",
    state.risk.losses
  );

  setText(
    "lossStreak",
    state.risk.lossStreak
  );

  setText(
    "maxStakeDisplay",
    state.risk.maxStake.toFixed(2)
  );

  setText(
    "riskStateBadge",
    state.risk.state
  );

  setText(
    "statusRisk",
    state.risk.state
  );

  const plLabel =
    $("sessionPLLabel");

  if (plLabel) {

    plLabel.textContent =
      state.risk.paused
        ? "Engine paused"
        : "Session running";
  }
}

/* =========================================================
   RENDER DIGITS
   ========================================================= */

function renderDigitDistribution() {

  const container =
    $("digitDistribution");

  if (!container) {
    return;
  }

  const rates =
    getDigitRates(
      state.selectedSymbol
    );

  container.innerHTML =
    rates.map(
      (rate,digit) => `
        <div class="digit-item">
          <div class="digit-number">${digit}</div>
          <div class="digit-rate">${round(rate)}%</div>
          <div class="digit-bar">
            <span style="width:${clamp(rate,0,100)}%"></span>
          </div>
        </div>
      `
    ).join("");
}

/* =========================================================
   RENDER PROBABILITIES
   ========================================================= */

function renderProbabilities() {

  const container =
    $("probabilityGrid");

  if (!container) {
    return;
  }

  const symbol =
    state.selectedSymbol;

  const eo =
    analyzeEvenOdd(symbol);

  const hl =
    analyzeHighLow(symbol);

  const ou =
    analyzeOverUnder(symbol);

  const md =
    analyzeMatchDiffer(symbol);

  const mom =
    analyzeMomentum(symbol);

  const items = [
    ["EVEN",eo.even],
    ["ODD",eo.odd],
    ["HIGH",hl.high],
    ["LOW",hl.low],
    [`OVER ${ou.threshold}`,ou.over],
    [`UNDER ${ou.threshold}`,ou.under],
    ["MATCH",md.match],
    ["DIFFER",md.differ],
    ["RISE",mom.rise],
    ["FALL",mom.fall]
  ];

  container.innerHTML =
    items.map(
      ([label,value]) => `
        <div class="probability-card">
          <span>${label}</span>
          <strong>${round(value)}%</strong>
          <small>Estimated probability</small>
        </div>
      `
    ).join("");
}

/* =========================================================
   RENDER AI
   ========================================================= */

function getCurrentAnalysis() {

  if (
    state.selectedStrategy ===
    "AUTO"
  ) {

    return analyzeAuto(
      state.selectedSymbol
    );

  }

  return analyzeStrategy(
    state.selectedSymbol,
    state.selectedStrategy
  );
}

function renderAI() {

  const result =
    getCurrentAnalysis();

  setText(
    "aiSignal",
    result.label
  );

  setText(
    "aiTarget",
    `Target: ${result.target}`
  );

  setText(
    "aiConfidence",
    `${round(result.confidence)}%`
  );

  setText(
    "aiSample",
    `Sample: ${result.sample}`
  );

  setText(
    "aiEdge",
    `${round(result.edge)}%`
  );

  setText(
    "aiReason",
    result.reason
  );

  setText(
    "aiQualityBadge",
    result.quality
  );

  setText(
    "marketQuality",
    result.quality
  );

  setText(
    "selectedSample",
    result.sample
  );

  setText(
    "selectedEdge",
    `${round(result.edge)}%`
  );
}

/* =========================================================
   SCANNER
   ========================================================= */

function renderScanner() {

  const container =
    $("marketScannerList");

  if (!container) {
    return;
  }

  const symbols =
    Object.keys(
      state.markets
    ).length
      ? Object.keys(state.markets)
      : MARKETS.map(
          m => m.symbol
        );

  const results =
    symbols.map(
      symbol => {

        const analysis =
          state.selectedStrategy ===
          "AUTO"
            ? analyzeAuto(symbol)
            : analyzeStrategy(
                symbol,
                state.selectedStrategy
              );

        return {
          symbol,
          analysis
        };

      }
    );

  results.sort(
    (a,b) =>
      b.analysis.edge -
      a.analysis.edge
  );

  setText(
    "marketCount",
    results.length
  );

  container.innerHTML =
    results.map(
      (item,index) => {

        const market =
          getMarket(
            item.symbol
          );

        const a =
          item.analysis;

        const active =
          item.symbol ===
          state.selectedSymbol
            ? "active"
            : "";

        return `
          <div
            class="market-card ${active}"
            data-symbol="${item.symbol}"
          >

            <div class="market-card-top">
              <div>
                <div class="market-card-name">
                  ${market.name}
                </div>

                <div class="market-card-symbol">
                  ${item.symbol}
                </div>
              </div>

              <div class="market-rank">
                #${index+1}
              </div>
            </div>

            <div class="market-signal">
              ${a.label}
            </div>

            <div class="market-quality">
              ${a.quality}
            </div>

            <div class="market-card-stats">

              <div>
                <span>DIGIT</span>
                <strong>${market.digit ?? "—"}</strong>
              </div>

              <div>
                <span>SAMPLE</span>
                <strong>${a.sample}</strong>
              </div>

              <div>
                <span>CONF.</span>
                <strong>${round(a.confidence)}%</strong>
              </div>

            </div>

          </div>
        `;
      }
    ).join("");
}

/* =========================================================
   SELECTED MARKET
   ========================================================= */

function renderSelectedMarket() {

  const market =
    getMarket(
      state.selectedSymbol
    );

  setText(
    "liveSymbol",
    market.symbol
  );

  setText(
    "liveMarketName",
    market.name
  );

  setText(
    "streamQuote",
    market.quote === null
      ? "—"
      : market.quote
  );

  setText(
    "streamDigit",
    market.digit ?? "—"
  );

  setText(
    "selectedMarketSymbol",
    market.symbol
  );

  setText(
    "selectedMarketName",
    market.name
  );

  setText(
    "selectedQuote",
    market.quote === null
      ? "—"
      : market.quote
  );

  setText(
    "selectedDigit",
    market.digit ?? "—"
  );
}

/* =========================================================
   STRATEGY UI
   ========================================================= */

function selectStrategy(strategy) {

  state.selectedStrategy =
    strategy;

  setText(
    "strategyCurrentName",
    strategy
  );

  document
    .querySelectorAll(
      ".strategy-button"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.strategy ===
          strategy
        );

      }
    );

  renderAll();
}

function setupStrategy() {

  const current =
    $("strategyCurrent");

  const control =
    $("strategyControl");

  if (current) {

    current.addEventListener(
      "click",
      () => {

        control.classList.toggle(
          "open"
        );

      }
    );

  }

  document
    .querySelectorAll(
      ".strategy-button"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            selectStrategy(
              button.dataset.strategy
            );

            control.classList.remove(
              "open"
            );

          }
        );

      }
    );
}

/* =========================================================
   MARKET SELECTION
   ========================================================= */

function setupMarketSelection() {

  const container =
    $("marketScannerList");

  if (!container) {
    return;
  }

  container.addEventListener(
    "click",
    event => {

      const card =
        event.target.closest(
          ".market-card"
        );

      if (!card) {
        return;
      }

      const symbol =
        card.dataset.symbol;

      if (!symbol) {
        return;
      }

      state.selectedSymbol =
        symbol;

      renderAll();

    }
  );
}

/* =========================================================
   AI ENGINE
   ========================================================= */

function startAIEngine() {

  if (
    state.risk.paused
  ) {

    state.lastAction =
      "RISK PAUSED";

    updateStatus();

    return;
  }

  if (state.running) {
    return;
  }

  state.running = true;

  beginAnalysis();

  updateStatus();
}

function stopAIEngine() {

  state.running = false;

  if (state.aiTimer) {

    clearInterval(
      state.aiTimer
    );

    state.aiTimer = null;
  }

  state.aiPhase =
    "READY";

  state.aiSeconds =
    CONFIG.ANALYSIS_SECONDS;

  setText(
    "enginePhase",
    "READY"
  );

  setText(
    "engineTimer",
    state.aiSeconds
  );

  setText(
    "engineMessage",
    "Analysis engine stopped."
  );

  updateStatus();
}

function beginAnalysis() {

  state.aiPhase =
    "ANALYSIS";

  state.aiSeconds =
    CONFIG.ANALYSIS_SECONDS;

  setText(
    "enginePhase",
    "ANALYSIS"
  );

  setText(
    "engineTimer",
    state.aiSeconds
  );

  setText(
    "engineMessage",
    "Collecting live market data..."
  );

  state.aiTimer =
    setInterval(
      () => {

        state.aiSeconds--;

        setText(
          "engineTimer",
          state.aiSeconds
        );

        if (
          state.aiSeconds <= 0
        ) {

          clearInterval(
            state.aiTimer
          );

          state.aiTimer =
            null;

          finishAnalysis();

        }

      },
      1000
    );
}

function finishAnalysis() {

  const analysis =
    getCurrentAnalysis();

  if (
    analysis.quality ===
    "WAIT"
  ) {

    setText(
      "engineMessage",
      "Insufficient data. Waiting for more ticks."
    );

    beginAnalysis();

    return;
  }

  state.signals++;

  state.lastAction =
    analysis.label;

  beginEntryCountdown(
    analysis
  );
}

function beginEntryCountdown(
  analysis
) {

  state.aiPhase =
    "SIGNAL";

  state.aiSeconds =
    CONFIG.COUNTDOWN_SECONDS;

  setText(
    "enginePhase",
    "SIGNAL"
  );

  setText(
    "engineTimer",
    state.aiSeconds
  );

  setText(
    "engineMessage",
    `${analysis.label} • ${round(analysis.confidence)}% confidence`
  );

  state.aiTimer =
    setInterval(
      () => {

        if (
          state.risk.paused
        ) {

          stopAIEngine();

          return;
        }

        state.aiSeconds--;

        setText(
          "engineTimer",
          state.aiSeconds
        );

        if (
          state.aiSeconds <= 0
        ) {

          clearInterval(
            state.aiTimer
          );

          state.aiTimer =
            null;

          fireSignal(
            analysis
          );

        }

      },
      1000
    );
}

function fireSignal(analysis) {

  if (
    state.risk.paused
  ) {

    stopAIEngine();

    return;
  }

  /*
   * ANALYSIS ONLY.
   * No Deriv contract is submitted.
   */

  state.lastAction =
    "SIGNAL";

  setText(
    "enginePhase",
    "SIGNAL"
  );

  setText(
    "engineTimer",
    "GO"
  );

  setText(
    "engineMessage",
    `Analysis signal: ${analysis.label}. No real contract was placed.`
  );

  updateStatus();

  if (state.running) {
    beginAnalysis();
  }
}

/* =========================================================
   ACCOUNT UI
   ========================================================= */

function updateAccountUI(type) {

  const demo =
    $("accountDemo");

  const real =
    $("accountReal");

  if (demo) {
    demo.classList.toggle(
      "active",
      type === "DEMO"
    );
  }

  if (real) {
    real.classList.toggle(
      "active",
      type === "REAL"
    );
  }

  setText(
    "accountTypeLabel",
    type
  );

  setText(
    "statusAccount",
    type
  );
}

function updateConnection(
  status
) {

  setText(
    "connectionStatus",
    status
  );

  const dot =
    $("connectionDot");

  if (dot) {

    dot.style.background =
      status === "LIVE"
        ? "var(--green)"
        : status === "ERROR"
          ? "var(--red)"
          : "var(--yellow)";
  }
}

/* =========================================================
   SECURE DERIV OAUTH / PKCE
   ========================================================= */

function randomString(length=64) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const bytes =
    new Uint8Array(length);

  crypto.getRandomValues(bytes);

  return Array.from(
    bytes,
    byte =>
      chars[
        byte % chars.length
      ]
  ).join("");
}

function base64UrlEncode(buffer) {

  return btoa(
    String.fromCharCode(
      ...new Uint8Array(buffer)
    )
  )
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/,"");
}

async function createChallenge(
  verifier
) {

  const data =
    new TextEncoder().encode(
      verifier
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return base64UrlEncode(
    digest
  );
}

function setAuthMessage(
  message,
  type=""
) {

  const box =
    $("derivAuthStatus");

  const text =
    $("derivAuthMessage");

  if (text) {
    text.textContent =
      message;
  }

  if (box) {

    box.classList.remove(
      "connected",
      "error"
    );

    if (type) {
      box.classList.add(
        type
      );
    }
  }
}

async function startDerivLogin() {

  const config =
    window.KRISHWAVE_CONFIG || {};

  /*
   * We refuse to send the user into OAuth
   * if a secure exchange backend is not configured.
   */
  if (
    !config.oauthExchangeEndpoint
  ) {

    setAuthMessage(
      "Secure OAuth backend is not connected yet. Your market feed is still active, but account login is not enabled.",
      "error"
    );

    alert(
      "KRISHWAVE needs its secure Deriv OAuth backend before account login can be enabled. Do not enter your Deriv password or token into this website."
    );

    return;
  }

  if (
    !config.oauthClientId
  ) {

    setAuthMessage(
      "Deriv OAuth client ID is missing.",
      "error"
    );

    return;
  }

  const verifier =
    randomString(64);

  const challenge =
    await createChallenge(
      verifier
    );

  const oauthState =
    randomString(32);

  sessionStorage.setItem(
    "KW_PKCE_VERIFIER",
    verifier
  );

  sessionStorage.setItem(
    "KW_OAUTH_STATE",
    oauthState
  );

  sessionStorage.setItem(
    "KW_ACCOUNT_TYPE",
    state.auth.accountType
  );

  const params =
    new URLSearchParams({
      response_type: "code",
      client_id:
        config.oauthClientId,
      redirect_uri:
        config.oauthRedirectUri,
      scope: "trade",
      state: oauthState,
      code_challenge:
        challenge,
      code_challenge_method:
        "S256"
    });

  setAuthMessage(
    "Opening secure Deriv authentication..."
  );

  window.location.href =
    "https://auth.deriv.com/oauth2/auth?" +
    params.toString();
}

async function handleOAuthCallback() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const code =
    params.get("code");

  const returnedState =
    params.get("state");

  const error =
    params.get("error");

  if (error) {

    setAuthMessage(
      `Deriv authentication cancelled: ${error}`,
      "error"
    );

    return;
  }

  if (!code) {
    return;
  }

  const savedState =
    sessionStorage.getItem(
      "KW_OAUTH_STATE"
    );

  const verifier =
    sessionStorage.getItem(
      "KW_PKCE_VERIFIER"
    );

  if (
    !savedState ||
    !verifier
  ) {

    setAuthMessage(
      "Authentication session is missing. Please connect again.",
      "error"
    );

    return;
  }

  if (
    savedState !==
    returnedState
  ) {

    setAuthMessage(
      "Security validation failed.",
      "error"
    );

    return;
  }

  const config =
    window.KRISHWAVE_CONFIG;

  try {

    setAuthMessage(
      "Completing secure Deriv authentication..."
    );

    const response =
      await fetch(
        config.oauthExchangeEndpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            code,

            code_verifier:
              verifier,

            redirect_uri:
              config.oauthRedirectUri
          })
        }
      );

    if (!response.ok) {
      throw new Error(
        `Authentication server error ${response.status}`
      );
    }

    const result =
      await response.json();

    /*
     * Expected backend result:
     *
     * {
     *   accessToken: "...",
     *   accountId: "...",
     *   accountType: "DEMO",
     *   balance: 10000,
     *   currency: "USD",
     *   wsUrl: "wss://..."
     * }
     */

    if (
      !result.accessToken
    ) {

      throw new Error(
        "No access token returned."
      );
    }

    state.auth.connected =
      true;

    state.auth.accessToken =
      result.accessToken;

    state.auth.accountId =
      result.accountId || null;

    state.auth.accountType =
      result.accountType ||
      sessionStorage.getItem(
        "KW_ACCOUNT_TYPE"
      ) ||
      "DEMO";

    state.auth.balance =
      result.balance ?? null;

    state.auth.currency =
      result.currency || null;

    state.auth.wsUrl =
      result.wsUrl || null;

    updateAuthenticatedUI();

    /*
     * Remove OAuth code from address bar.
     */
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );

    sessionStorage.removeItem(
      "KW_PKCE_VERIFIER"
    );

    sessionStorage.removeItem(
      "KW_OAUTH_STATE"
    );

    sessionStorage.removeItem(
      "KW_ACCOUNT_TYPE"
    );

  } catch(error) {

    console.error(error);

    setAuthMessage(
      error.message ||
      "Authentication failed.",
      "error"
    );
  }
}

function updateAuthenticatedUI() {

  const type =
    state.auth.accountType ===
    "REAL"
      ? "REAL"
      : "DEMO";

  updateAccountUI(type);

  setText(
    "accountId",
    state.auth.accountId || "CONNECTED"
  );

  setText(
    "accountStatus",
    "CONNECTED"
  );

  setText(
    "accountBalance",
    state.auth.balance === null
      ? "—"
      : Number(
          state.auth.balance
        ).toFixed(2)
  );

  setText(
    "accountCurrency",
    state.auth.currency || "—"
  );

  setAuthMessage(
    `${type} Deriv account connected securely.`,
    "connected"
  );

  updateConnection(
    "LIVE"
  );

  /*
   * Real trading remains disabled.
   */
  setText(
    "statusAccount",
    type
  );
}

function disconnectAccount() {

  state.auth.connected =
    false;

  state.auth.accessToken =
    null;

  state.auth.accountId =
    null;

  state.auth.balance =
    null;

  state.auth.currency =
    null;

  state.auth.wsUrl =
    null;

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

  setText(
    "accountStatus",
    "NOT CONNECTED"
  );

  setAuthMessage(
    "Deriv account disconnected."
  );
}

/* =========================================================
   ACCOUNT CONTROLS
   ========================================================= */

function setupAccountControls() {

  const demo =
    $("accountDemo");

  const real =
    $("accountReal");

  if (demo) {

    demo.addEventListener(
      "click",
      () => {

        state.auth.accountType =
          "DEMO";

        updateAccountUI(
          "DEMO"
        );

        setAuthMessage(
          "DEMO selected. Press CONNECT DERIV."
        );

      }
    );

  }

  if (real) {

    real.addEventListener(
      "click",
      () => {

        state.auth.accountType =
          "REAL";

        updateAccountUI(
          "REAL"
        );

        setAuthMessage(
          "REAL selected. Real trading remains disabled."
        );

      }
    );

  }

  const connect =
    $("connectAccount");

  if (connect) {

    connect.addEventListener(
      "click",
      startDerivLogin
    );

  }

  const disconnect =
    $("disconnectAccount");

  if (disconnect) {

    disconnect.addEventListener(
      "click",
      disconnectAccount
    );

  }
}

/* =========================================================
   RENDER EVERYTHING
   ========================================================= */

function renderAll() {

  renderSelectedMarket();

  renderDigitDistribution();

  renderProbabilities();

  renderAI();

  renderScanner();

  renderRisk();

  updateStatus();
}

/* =========================================================
   STATUS
   ========================================================= */

function updateStatus() {

  setText(
    "statusEngine",
    state.running
      ? state.aiPhase
      : "READY"
  );

  setText(
    "statusAction",
    state.lastAction
  );

  setText(
    "statusSignals",
    state.signals
  );

  setText(
    "statusRisk",
    state.risk.state
  );

  setText(
    "statusAccount",
    state.auth.accountType
  );
}

/* =========================================================
   RISK INPUTS
   ========================================================= */

function setupRiskControls() {

  [
    "baseStake",
    "takeProfit",
    "stopLoss",
    "martingale"
  ].forEach(
    id => {

      const input =
        $(id);

      if (input) {

        input.addEventListener(
          "change",
          syncRiskInputs
        );

        input.addEventListener(
          "input",
          syncRiskInputs
        );

      }

    }
  );

  const win =
    $("simWin");

  const loss =
    $("simLoss");

  const reset =
    $("resetRisk");

  if (win) {
    win.addEventListener(
      "click",
      paperWin
    );
  }

  if (loss) {
    loss.addEventListener(
      "click",
      paperLoss
    );
  }

  if (reset) {
    reset.addEventListener(
      "click",
      resetRisk
    );
  }
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function initialize() {

  setupTheme();

  setupAccountControls();

  setupRiskControls();

  setupStrategy();

  setupMarketSelection();

  loadRiskSettings();

  /*
   * Put saved values into inputs.
   */

  setText(
    "currentStake",
    state.risk.currentStake.toFixed(2)
  );

  const base =
    $("baseStake");

  const tp =
    $("takeProfit");

  const sl =
    $("stopLoss");

  const mg =
    $("martingale");

  if (base) {
    base.value =
      state.risk.baseStake;
  }

  if (tp) {
    tp.value =
      state.risk.takeProfit;
  }

  if (sl) {
    sl.value =
      state.risk.stopLoss;
  }

  if (mg) {
    mg.value =
      state.risk.martingale;
  }

  updateAccountUI(
    "DEMO"
  );

  renderRisk();

  renderAll();

  connectPublicWebSocket();

  /*
   * Refresh calculations without
   * rebuilding the WebSocket.
   */
  setInterval(
    () => {

      renderAll();

    },
    2000
  );

  /*
   * Check whether Deriv returned
   * an OAuth callback.
   */
  handleOAuthCallback();

}

/* =========================================================
   PUBLIC API
   ========================================================= */

window.KRISHWAVE = {

  state,

  analyzeStrategy,

  analyzeAuto,

  startAIEngine,

  stopAIEngine,

  selectStrategy,

  resetRisk,

  paperWin,

  paperLoss,

  connectPublicWebSocket,

  disconnectAccount
};

/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initialize
);