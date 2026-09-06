/* =========================================================
   KRISHWAVE V4.0
   LIVE DERIV MARKET INTELLIGENCE
   ACCOUNT CONNECTION + RISK CONTROL
   =========================================================

   IMPORTANT:
   - No Deriv password is requested.
   - Authentication uses a Deriv access token.
   - Token is kept only in sessionStorage.
   - Authenticated WebSocket URL is obtained through
     Deriv's short-lived OTP endpoint.
   - REAL account connection is supported.
   - REAL MONEY TRADING IS DISABLED.
   ========================================================= */

"use strict";

/* =========================
   CONFIG
========================= */

const APP_CONFIG = window.KRISHWAVE_CONFIG || {};

const CONFIG = {
  APP_ID: APP_CONFIG.derivAppId || "34jzkIFHayWQzG6sXikax",

  PUBLIC_WS:
    "wss://api.derivws.com/trading/v1/options/ws/public",

  API_BASE:
    "https://api.derivws.com",

  MAX_HISTORY: 200,
  RECENT_WINDOW: 80,
  MIN_SAMPLE: 30,

  ANALYSIS_SECONDS: 10,
  COUNTDOWN_SECONDS: 7,

  MIN_STAKE: 0.25,

  STORAGE_TOKEN: "krishwave_session_token",
  STORAGE_SETTINGS: "krishwave_settings",
  STORAGE_THEME: "krishwave_theme"
};

/* =========================
   MARKETS
========================= */

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

/* =========================
   STATE
========================= */

const state = {
  ws: null,

  publicWs: null,

  connected: false,
  authenticated: false,

  accountType: "PUBLIC",
  accountId: null,
  balance: null,
  currency: null,

  selectedSymbol: "R_10",
  selectedStrategy: "AUTO",

  markets: {},

  liveTicks: 0,
  lastTickTime: 0,

  subscriptions: new Set(),

  aiTimer: null,
  aiPhase: "READY",
  aiSeconds: CONFIG.ANALYSIS_SECONDS,
  running: false,

  tradeCount: 0,
  lastAction: "READY",

  scanResults: [],

  risk: {
    baseStake: 0.25,
    currentStake: 0.25,

    takeProfit: 5,
    stopLoss: 5,

    martingale: 2,

    sessionPL: 0,

    wins: 0,
    losses: 0,
    lossStreak: 0,

    paused: false,
    reason: "READY"
  },

  theme: "dark"
};

/* =========================
   DOM
========================= */

const $ = id => document.getElementById(id);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : 0;
}

/* =========================
   THEME
========================= */

function applyTheme(theme) {
  state.theme = theme;

  document.body.classList.toggle("light", theme === "light");

  localStorage.setItem(CONFIG.STORAGE_THEME, theme);

  const button = $("themeToggle");

  if (button) {
    button.textContent = theme === "light" ? "☾" : "☀";
  }
}

function setupTheme() {
  const saved = localStorage.getItem(CONFIG.STORAGE_THEME) || "dark";

  applyTheme(saved);

  $("themeToggle")?.addEventListener("click", () => {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  });
}

/* =========================
   MARKET STATE
========================= */

function createMarket(symbol, name) {
  if (!state.markets[symbol]) {
    state.markets[symbol] = {
      symbol,
      name,

      history: [],

      quote: null,
      lastDigit: null,

      lastTick: 0,
      tickCount: 0
    };
  }

  return state.markets[symbol];
}

MARKETS.forEach(m => createMarket(m.symbol, m.name));

function getMarket(symbol = state.selectedSymbol) {
  return state.markets[symbol];
}

function getRecentHistory(symbol) {
  const market = getMarket(symbol);

  return (market?.history || []).slice(-CONFIG.RECENT_WINDOW);
}

/* =========================
   DIGITS
========================= */

function extractLastDigit(quote) {
  if (quote === null || quote === undefined) return null;

  const text = String(quote);

  const clean = text.replace(/[^0-9]/g, "");

  if (!clean.length) return null;

  return Number(clean[clean.length - 1]);
}

function getDigits(symbol) {
  return getRecentHistory(symbol)
    .map(item => item.digit)
    .filter(d => Number.isInteger(d));
}

function getDigitCounts(symbol) {
  const counts = Array(10).fill(0);

  getDigits(symbol).forEach(d => {
    if (d >= 0 && d <= 9) {
      counts[d]++;
    }
  });

  return counts;
}

function getDigitRates(symbol) {
  const counts = getDigitCounts(symbol);

  const total = counts.reduce((a, b) => a + b, 0);

  if (!total) {
    return counts.map(() => 0);
  }

  return counts.map(c => (c / total) * 100);
}

/* =========================
   MARKET ANALYSIS
========================= */

function analyzeEvenOdd(symbol) {
  const digits = getDigits(symbol);

  if (!digits.length) {
    return { even: 50, odd: 50 };
  }

  const even = digits.filter(d => d % 2 === 0).length;

  return {
    even: (even / digits.length) * 100,
    odd: ((digits.length - even) / digits.length) * 100
  };
}

function analyzeHighLow(symbol) {
  const digits = getDigits(symbol);

  if (!digits.length) {
    return { high: 50, low: 50 };
  }

  const high = digits.filter(d => d >= 5).length;

  return {
    high: (high / digits.length) * 100,
    low: ((digits.length - high) / digits.length) * 100
  };
}

function analyzeOverUnder(symbol) {
  const digits = getDigits(symbol);

  if (!digits.length) {
    return {
      over: 50,
      under: 50,
      threshold: 5
    };
  }

  let best = null;

  for (let threshold = 1; threshold <= 8; threshold++) {
    const overCount = digits.filter(d => d > threshold).length;

    const over = (overCount / digits.length) * 100;
    const under = 100 - over;

    const edge = Math.abs(over - 50);

    const score = edge - Math.abs(threshold - 5) * 0.25;

    if (!best || score > best.score) {
      best = {
        over,
        under,
        threshold,
        score
      };
    }
  }

  return best;
}

function analyzeMatchDiffer(symbol) {
  const rates = getDigitRates(symbol);

  let target = 0;

  rates.forEach((rate, digit) => {
    if (rate > rates[target]) {
      target = digit;
    }
  });

  const match = rates[target] || 0;

  return {
    target,
    match,
    differ: 100 - match
  };
}

function analyzeMomentum(symbol) {
  const history = getRecentHistory(symbol);

  if (history.length < 5) {
    return {
      rise: 50,
      fall: 50,
      direction: "FLAT"
    };
  }

  let riseCount = 0;
  let fallCount = 0;

  for (let i = 1; i < history.length; i++) {
    if (history[i].quote > history[i - 1].quote) {
      riseCount++;
    } else if (history[i].quote < history[i - 1].quote) {
      fallCount++;
    }
  }

  const total = riseCount + fallCount;

  if (!total) {
    return {
      rise: 50,
      fall: 50,
      direction: "FLAT"
    };
  }

  const rise = (riseCount / total) * 100;
  const fall = 100 - rise;

  return {
    rise,
    fall,
    direction:
      rise > fall
        ? "RISING"
        : fall > rise
        ? "FALLING"
        : "FLAT"
  };
}

function calculateStreak(symbol) {
  const digits = getDigits(symbol);

  if (!digits.length) {
    return {
      digit: null,
      length: 0
    };
  }

  const last = digits[digits.length - 1];

  let length = 0;

  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] === last) {
      length++;
    } else {
      break;
    }
  }

  return {
    digit: last,
    length
  };
}

/* =========================
   CONFIDENCE
========================= */

function confidenceFromProbability(probability, sample) {
  const edge = Math.abs(probability - 50);

  const sampleFactor = clamp(sample / 100, 0, 1);

  const confidence =
    50 +
    edge * 0.8 +
    sampleFactor * 8;

  return clamp(confidence, 50, 92);
}

function getSignalQuality(edge, sample) {
  if (sample < CONFIG.MIN_SAMPLE) {
    return "WAIT";
  }

  if (edge >= 10) {
    return "STRONG";
  }

  if (edge >= 6) {
    return "WATCH";
  }

  return "WEAK";
}

/* =========================
   STRATEGY
========================= */

function analyzeStrategy(symbol, strategy) {
  const digits = getDigits(symbol);
  const sample = digits.length;

  if (!sample) {
    return {
      strategy,
      label: "WAIT",
      target: "—",
      probability: 50,
      confidence: 50,
      edge: 0,
      quality: "WAIT",
      sample: 0,
      reason: "Waiting for live tick data."
    };
  }

  let probability = 50;
  let target = "—";
  let reason = "";

  const evenOdd = analyzeEvenOdd(symbol);
  const highLow = analyzeHighLow(symbol);
  const overUnder = analyzeOverUnder(symbol);
  const matchDiffer = analyzeMatchDiffer(symbol);
  const momentum = analyzeMomentum(symbol);

  switch (strategy) {

    case "EVEN":
      probability = evenOdd.even;
      target = "EVEN";
      reason =
        `Recent sample shows ${round(evenOdd.even, 1)}% even digits.`;
      break;

    case "ODD":
      probability = evenOdd.odd;
      target = "ODD";
      reason =
        `Recent sample shows ${round(evenOdd.odd, 1)}% odd digits.`;
      break;

    case "HIGH":
      probability = highLow.high;
      target = "HIGH";
      reason =
        `Digits 5–9 currently represent ${round(highLow.high, 1)}% of the sample.`;
      break;

    case "LOW":
      probability = highLow.low;
      target = "LOW";
      reason =
        `Digits 0–4 currently represent ${round(highLow.low, 1)}% of the sample.`;
      break;

    case "OVER":
      probability = overUnder.over;
      target = `OVER ${overUnder.threshold}`;
      reason =
        `${round(overUnder.over, 1)}% of recent digits are above ${overUnder.threshold}.`;
      break;

    case "UNDER":
      probability = overUnder.under;
      target = `UNDER ${overUnder.threshold}`;
      reason =
        `${round(overUnder.under, 1)}% of recent digits are below or equal to ${overUnder.threshold}.`;
      break;

    case "MATCH":
      probability = matchDiffer.match;
      target = `DIGIT ${matchDiffer.target}`;
      reason =
        `Digit ${matchDiffer.target} has the highest recent frequency at ${round(matchDiffer.match, 1)}%.`;
      break;

    case "DIFFER":
      probability = matchDiffer.differ;
      target = `DIFFER ${matchDiffer.target}`;
      reason =
        `Recent sample estimates ${round(matchDiffer.differ, 1)}% non-match frequency against digit ${matchDiffer.target}.`;
      break;

    case "RISE":
      probability = momentum.rise;
      target = "RISE";
      reason =
        `Recent quote movement is ${momentum.direction.toLowerCase()}, with ${round(momentum.rise, 1)}% upward observations.`;
      break;

    case "FALL":
      probability = momentum.fall;
      target = "FALL";
      reason =
        `Recent quote movement is ${momentum.direction.toLowerCase()}, with ${round(momentum.fall, 1)}% downward observations.`;
      break;

    default:
      return analyzeAuto(symbol);
  }

  const edge = Math.abs(probability - 50);

  return {
    strategy,
    label: target,
    target,
    probability,
    confidence: confidenceFromProbability(probability, sample),
    edge,
    quality: getSignalQuality(edge, sample),
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

  const results = strategies
    .map(strategy => analyzeStrategy(symbol, strategy))
    .filter(result => result.sample >= CONFIG.MIN_SAMPLE);

  if (!results.length) {
    return {
      strategy: "AUTO",
      label: "WAIT",
      target: "—",
      probability: 50,
      confidence: 50,
      edge: 0,
      quality: "WAIT",
      sample: getDigits(symbol).length,
      reason: "Collecting enough market data for AUTO analysis."
    };
  }

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
    strategy: "AUTO",
    reason:
      `AUTO selected ${best.target} as the strongest statistical setup from the available strategies. ${best.reason}`
  };
}

/* =========================
   DERIV PUBLIC DATA
========================= */

function connectPublicWebSocket() {

  if (
    state.publicWs &&
    (
      state.publicWs.readyState === WebSocket.OPEN ||
      state.publicWs.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  updateConnectionUI("CONNECTING PUBLIC");

  const ws = new WebSocket(CONFIG.PUBLIC_WS);

  state.publicWs = ws;

  ws.onopen = () => {

    setText("connectionText", "PUBLIC DATA");

    $("connectionPill")?.classList.remove("offline");
    $("connectionPill")?.classList.add("online");

    requestActiveSymbols(ws);
  };

  ws.onmessage = event => {
    try {
      const message = JSON.parse(event.data);

      handlePublicMessage(message);

    } catch (error) {
      console.error("Public WS parse error:", error);
    }
  };

  ws.onerror = error => {
    console.warn("Public WebSocket error", error);
  };

  ws.onclose = () => {

    $("connectionPill")?.classList.remove("online");

    setText("connectionText", "PUBLIC DATA");

    setTimeout(connectPublicWebSocket, 3000);
  };
}

function sendPublic(payload) {

  if (
    state.publicWs &&
    state.publicWs.readyState === WebSocket.OPEN
  ) {
    state.publicWs.send(JSON.stringify(payload));
  }
}

function requestActiveSymbols(ws) {

  ws.send(
    JSON.stringify({
      active_symbols: "brief",
      product_type: "basic"
    })
  );
}

function subscribePublicMarket(symbol) {

  sendPublic({
    ticks_history: symbol,
    count: CONFIG.MAX_HISTORY,
    end: "latest",
    style: "ticks"
  });

  sendPublic({
    ticks: symbol,
    subscribe: 1
  });
}

function handlePublicMessage(message) {

  if (message.error) {
    console.warn("Deriv public error:", message.error.message);
    return;
  }

  if (message.msg_type === "active_symbols") {

    const available =
      message.active_symbols || [];

    const availableSymbols =
      new Set(
        available.map(item => item.symbol)
      );

    MARKETS.forEach(market => {

      if (availableSymbols.has(market.symbol)) {
        subscribePublicMarket(market.symbol);
      }

    });

    return;
  }

  if (message.msg_type === "history") {

    const symbol =
      message.echo_req?.ticks_history;

    if (!symbol) return;

    const market = getMarket(symbol);

    if (!market) return;

    const prices =
      message.history?.prices || [];

    const times =
      message.history?.times || [];

    market.history = prices
      .map((price, index) => {

        const quote = Number(price);

        return {
          quote,
          time: times[index] || Date.now(),
          digit: extractLastDigit(quote)
        };

      })
      .filter(item => Number.isFinite(item.quote))
      .slice(-CONFIG.MAX_HISTORY);

    if (market.history.length) {

      const last =
        market.history[market.history.length - 1];

      market.quote = last.quote;
      market.lastDigit = last.digit;
    }

    renderEverything();

    return;
  }

  if (message.msg_type === "tick") {

    handleTick(message);

  }
}

function handleTick(message) {

  const symbol =
    message.tick?.symbol;

  if (!symbol) return;

  const quote =
    Number(message.tick.quote);

  if (!Number.isFinite(quote)) return;

  const market =
    getMarket(symbol);

  if (!market) return;

  const digit =
    extractLastDigit(
      message.tick.quote
    );

  const tick = {
    quote,
    digit,
    time:
      Number(message.tick.epoch) * 1000 ||
      Date.now()
  };

  market.history.push(tick);

  if (
    market.history.length >
    CONFIG.MAX_HISTORY
  ) {
    market.history.shift();
  }

  market.quote = quote;
  market.lastDigit = digit;

  market.tickCount++;

  state.liveTicks++;
  state.lastTickTime = Date.now();

  renderEverything();
}

/* =========================
   ACCOUNT AUTH
========================= */

function getStoredToken() {
  return sessionStorage.getItem(
    CONFIG.STORAGE_TOKEN
  );
}

function clearStoredToken() {
  sessionStorage.removeItem(
    CONFIG.STORAGE_TOKEN
  );
}

async function connectDerivAccount() {

  if (!window.isSecureContext && location.hostname !== "localhost") {

    alert(
      "Secure authentication requires HTTPS. Open KRISHWAVE through GitHub Pages or another HTTPS site."
    );

    return;
  }

  let token =
    getStoredToken();

  if (!token) {

    token = prompt(
      "Enter your Deriv Personal Access Token.\n\nDo NOT enter your Deriv password.\n\nThe token will only be kept in this browser session."
    );

    if (!token) {
      return;
    }

    token = token.trim();

    if (!token) return;

    sessionStorage.setItem(
      CONFIG.STORAGE_TOKEN,
      token
    );
  }

  setAuthLoading(true);

  try {

    const accounts =
      await fetchDerivAccounts(token);

    const account =
      chooseAccount(accounts);

    if (!account) {

      throw new Error(
        "No suitable Deriv account was found."
      );
    }

    await connectAuthenticatedAccount(
      token,
      account
    );

  } catch (error) {

    console.error(error);

    clearStoredToken();

    setAuthLoading(false);

    updateAuthUI(false);

    alert(
      "Deriv connection failed:\n\n" +
      (error.message || "Unknown error")
    );
  }
}

async function fetchDerivAccounts(token) {

  const response =
    await fetch(
      `${CONFIG.API_BASE}/trading/v1/options/accounts`,
      {
        method: "GET",

        headers: {
          "Deriv-App-ID":
            CONFIG.APP_ID,

          "Authorization":
            `Bearer ${token}`
        }
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.errors?.[0]?.message ||
      "Could not retrieve Deriv accounts."
    );
  }

  return data?.data || [];
}

function chooseAccount(accounts) {

  if (!Array.isArray(accounts) ||
      !accounts.length) {
    return null;
  }

  const demo =
    accounts.find(account =>
      String(
        account.account_type ||
        account.type ||
        ""
      ).toLowerCase() === "demo"
    );

  const real =
    accounts.find(account =>
      String(
        account.account_type ||
        account.type ||
        ""
      ).toLowerCase() === "real"
    );

  const choice =
    prompt(
      "Choose Deriv account:\n\n" +
      "1 = DEMO\n" +
      "2 = REAL\n\n" +
      "Enter 1 or 2.",
      "1"
    );

  if (choice === "2") {

    if (!real) {

      alert(
        "No real Options account was returned for this authorization."
      );

      return null;
    }

    return real;
  }

  return demo || accounts[0];
}

async function connectAuthenticatedAccount(
  token,
  account
) {

  const accountId =
    account.account_id ||
    account.id;

  if (!accountId) {
    throw new Error(
      "Deriv account ID was not returned."
    );
  }

  updateConnectionUI(
    "AUTHENTICATING"
  );

  const response =
    await fetch(
      `${CONFIG.API_BASE}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
      {
        method: "POST",

        headers: {
          "Deriv-App-ID":
            CONFIG.APP_ID,

          "Authorization":
            `Bearer ${token}`
        }
      }
    );

  const result =
    await response.json();

  if (!response.ok) {

    throw new Error(
      result?.errors?.[0]?.message ||
      "Could not obtain authenticated WebSocket."
    );
  }

  const wsUrl =
    result?.data?.url;

  if (!wsUrl) {
    throw new Error(
      "Deriv did not return an authenticated WebSocket URL."
    );
  }

  openAuthenticatedWebSocket(
    wsUrl,
    account
  );
}

function openAuthenticatedWebSocket(
  wsUrl,
  account
) {

  if (state.ws) {

    try {
      state.ws.close();
    } catch (_) {}

  }

  const ws =
    new WebSocket(wsUrl);

  state.ws = ws;

  ws.onopen = () => {

    state.authenticated = true;
    state.connected = true;

    state.accountId =
      account.account_id ||
      account.id;

    state.accountType =
      String(
        account.account_type ||
        account.type ||
        "DEMO"
      ).toUpperCase();

    state.currency =
      account.currency ||
      "USD";

    updateAuthUI(true);

    requestAuthenticatedBalance();

    updateConnectionUI(
      `DERIV ${state.accountType}`
    );

    setAuthLoading(false);
  };

  ws.onmessage = event => {

    try {

      const message =
        JSON.parse(event.data);

      handleAuthenticatedMessage(
        message
      );

    } catch (error) {

      console.error(
        "Authenticated WS error:",
        error
      );

    }

  };

  ws.onerror = error => {

    console.error(
      "Authenticated Deriv WS error:",
      error
    );

  };

  ws.onclose = () => {

    state.authenticated = false;
    state.connected = false;

    updateAuthUI(false);

    updateConnectionUI(
      "PUBLIC DATA"
    );

    state.ws = null;
  };
}

function sendAuthenticated(payload) {

  if (
    state.ws &&
    state.ws.readyState === WebSocket.OPEN
  ) {

    state.ws.send(
      JSON.stringify(payload)
    );

  }
}

function requestAuthenticatedBalance() {

  sendAuthenticated({
    balance: 1,
    subscribe: 1
  });
}

function handleAuthenticatedMessage(message) {

  if (message.error) {

    console.warn(
      "Deriv authenticated error:",
      message.error.message
    );

    return;
  }

  if (
    message.msg_type === "balance" &&
    message.balance
  ) {

    state.balance =
      Number(
        message.balance.balance
      );

    state.currency =
      message.balance.currency ||
      state.currency ||
      "USD";

    renderAccount();

  }
}

/* =========================
   DISCONNECT
========================= */

function disconnectDeriv() {

  clearStoredToken();

  if (state.ws) {

    try {
      state.ws.close();
    } catch (_) {}

  }

  state.ws = null;

  state.authenticated = false;
  state.connected = false;

  state.accountId = null;
  state.balance = null;
  state.currency = null;
  state.accountType = "PUBLIC";

  updateAuthUI(false);

  updateConnectionUI(
    "PUBLIC DATA"
  );
}

/* =========================
   AUTH UI
========================= */

function setAuthLoading(loading) {

  const button =
    $("connectDerivBtn");

  if (!button) return;

  button.disabled =
    loading;

  button.textContent =
    loading
      ? "CONNECTING..."
      : "CONNECT DERIV";
}

function updateConnectionUI(text) {

  setText(
    "connectionText",
    text
  );
}

function updateAuthUI(connected) {

  const connect =
    $("connectDerivBtn");

  const disconnect =
    $("disconnectDerivBtn");

  const badge =
    $("authBadge");

  if (connected) {

    connect?.classList.add(
      "hidden"
    );

    disconnect?.classList.remove(
      "hidden"
    );

    if (badge) {

      badge.textContent =
        state.accountType;

      badge.className =
        "badge badge-blue";
    }

  } else {

    connect?.classList.remove(
      "hidden"
    );

    disconnect?.classList.add(
      "hidden"
    );

    if (badge) {

      badge.textContent =
        "NOT CONNECTED";

      badge.className =
        "badge badge-blue";
    }

  }

  renderAccount();
}

function renderAccount() {

  setText(
    "accountType",
    state.accountType
  );

  setText(
    "accountId",
    state.accountId || "—"
  );

  setText(
    "liveBalance",
    state.balance === null
      ? "—"
      : state.balance.toFixed(2)
  );

  setText(
    "balanceCurrency",
    state.currency || "—"
  );

  setText(
    "authStatus",
    state.authenticated
      ? "AUTHENTICATED"
      : "PUBLIC DATA"
  );

  setText(
    "statusAccount",
    state.authenticated
      ? `${state.accountType} • ${state.accountId || ""}`
      : "PUBLIC"
  );
}

/* =========================
   RENDER MARKET
========================= */

function renderSelectedMarket() {

  const market =
    getMarket();

  if (!market) return;

  setText(
    "liveMarketName",
    market.name
  );

  setText(
    "liveMarketSymbol",
    market.symbol
  );

  setText(
    "liveQuote",
    market.quote === null
      ? "—"
      : market.quote
  );

  setText(
    "liveLastDigit",
    market.lastDigit ?? "—"
  );

  setText(
    "liveTicks",
    state.liveTicks
  );

  setText(
    "selectedMarketName",
    market.name
  );

  setText(
    "selectedSymbol",
    market.symbol
  );

  setText(
    "selectedQuote",
    market.quote === null
      ? "—"
      : market.quote
  );

  setText(
    "selectedLastDigit",
    market.lastDigit ?? "—"
  );

  const digits =
    getDigits(market.symbol);

  setText(
    "selectedSample",
    digits.length
  );

  const analysis =
    state.selectedStrategy === "AUTO"
      ? analyzeAuto(market.symbol)
      : analyzeStrategy(
          market.symbol,
          state.selectedStrategy
        );

  setText(
    "selectedEdge",
    `${round(analysis.edge, 1)}%`
  );

  setText(
    "selectedQualityText",
    analysis.quality
  );

  updateQualityBadge(
    "selectedQuality",
    analysis.quality
  );
}

function updateQualityBadge(
  id,
  quality
) {

  const element =
    $(id);

  if (!element) return;

  element.textContent =
    quality;

  element.className =
    "quality-badge " +
    quality.toLowerCase();
}

function renderDigitDistribution() {

  const container =
    $("digitDistribution");

  if (!container) return;

  const rates =
    getDigitRates(
      state.selectedSymbol
    );

  container.innerHTML =
    rates.map(
      (rate, digit) => `
        <div class="digit-item">
          <div class="digit-number">${digit}</div>
          <div class="digit-percent">
            ${round(rate, 1)}%
          </div>
          <div class="digit-bar">
            <span style="width:${clamp(rate, 0, 100)}%"></span>
          </div>
        </div>
      `
    ).join("");
}

function renderProbabilities() {

  const container =
    $("probabilityGrid");

  if (!container) return;

  const evenOdd =
    analyzeEvenOdd(
      state.selectedSymbol
    );

  const highLow =
    analyzeHighLow(
      state.selectedSymbol
    );

  const overUnder =
    analyzeOverUnder(
      state.selectedSymbol
    );

  const matchDiffer =
    analyzeMatchDiffer(
      state.selectedSymbol
    );

  const momentum =
    analyzeMomentum(
      state.selectedSymbol
    );

  const values = [
    ["EVEN", evenOdd.even],
    ["ODD", evenOdd.odd],
    ["HIGH", highLow.high],
    ["LOW", highLow.low],
    [`OVER ${overUnder.threshold}`, overUnder.over],
    [`UNDER ${overUnder.threshold}`, overUnder.under],
    [`MATCH ${matchDiffer.target}`, matchDiffer.match],
    [`DIFFER ${matchDiffer.target}`, matchDiffer.differ],
    ["RISE", momentum.rise],
    ["FALL", momentum.fall]
  ];

  container.innerHTML =
    values.map(
      ([label, value]) => `
        <div class="probability-card">
          <span>${label}</span>
          <strong>${round(value, 1)}%</strong>
        </div>
      `
    ).join("");
}

function renderAI() {

  const analysis =
    state.selectedStrategy === "AUTO"
      ? analyzeAuto(
          state.selectedSymbol
        )
      : analyzeStrategy(
          state.selectedSymbol,
          state.selectedStrategy
        );

  setText(
    "aiSignal",
    analysis.label
  );

  setText(
    "aiTarget",
    analysis.target
  );

  setText(
    "aiConfidence",
    `${round(analysis.confidence, 1)}%`
  );

  setText(
    "aiSample",
    analysis.sample
  );

  setText(
    "aiEdge",
    `${round(analysis.edge, 1)}%`
  );

  setText(
    "aiReason",
    analysis.reason
  );

  updateQualityBadge(
    "aiQuality",
    analysis.quality
  );

  const momentum =
    analyzeMomentum(
      state.selectedSymbol
    );

  const streak =
    calculateStreak(
      state.selectedSymbol
    );

  const rates =
    getDigitRates(
      state.selectedSymbol
    );

  let hottest =
    rates.indexOf(
      Math.max(...rates)
    );

  setText(
    "reasonDigit",
    `Digit ${hottest}`
  );

  setText(
    "reasonMomentum",
    momentum.direction
  );

  setText(
    "reasonStreak",
    streak.length
      ? `${streak.digit} × ${streak.length}`
      : "—"
  );

  setText(
    "reasonState",
    analysis.quality
  );
}

/* =========================
   SCANNER
========================= */

function renderMarketScanner() {

  const container =
    $("marketScanner");

  if (!container) return;

  const results =
    MARKETS.map(market => {

      const analysis =
        state.selectedStrategy === "AUTO"
          ? analyzeAuto(market.symbol)
          : analyzeStrategy(
              market.symbol,
              state.selectedStrategy
            );

      return {
        market,
        analysis
      };

    });

  results.sort(
    (a, b) =>
      b.analysis.edge -
      a.analysis.edge
  );

  state.scanResults =
    results;

  container.innerHTML =
    results.map(
      (item, index) => {

        const market =
          item.market;

        const analysis =
          item.analysis;

        const selected =
          market.symbol ===
          state.selectedSymbol;

        return `
          <div
            class="market-card ${selected ? "selected" : ""}"
            data-symbol="${market.symbol}"
          >

            <div class="market-card-top">

              <div>
                <div class="market-card-name">
                  ${market.name}
                </div>

                <div class="market-card-symbol">
                  ${market.symbol}
                </div>
              </div>

              <span class="market-live">
                LIVE
              </span>

            </div>

            <div class="market-signal">

              <span class="signal-label">
                ${analysis.label}
              </span>

              <span class="quality-badge ${analysis.quality.toLowerCase()}">
                ${analysis.quality}
              </span>

            </div>

            <div class="market-card-stats">

              <div>
                <span>LAST</span>
                <strong>
                  ${getMarket(market.symbol)?.lastDigit ?? "—"}
                </strong>
              </div>

              <div>
                <span>SAMPLE</span>
                <strong>
                  ${analysis.sample}
                </strong>
              </div>

              <div>
                <span>CONF.</span>
                <strong>
                  ${round(analysis.confidence, 0)}%
                </strong>
              </div>

            </div>

            <div class="market-rank">
              RANK #${index + 1}
            </div>

          </div>
        `;

      }
    ).join("");
}

function setupMarketScanner() {

  $("marketScanner")?.addEventListener(
    "click",
    event => {

      const card =
        event.target.closest(
          ".market-card"
        );

      if (!card) return;

      selectMarket(
        card.dataset.symbol
      );

    }
  );

  $("scanAllBtn")?.addEventListener(
    "click",
    () => {

      MARKETS.forEach(
        market =>
          subscribePublicMarket(
            market.symbol
          )
      );

      renderEverything();

    }
  );
}

/* =========================
   STRATEGY
========================= */

function setStrategy(strategy) {

  state.selectedStrategy =
    strategy;

  document
    .querySelectorAll(
      ".strategy-button"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.strategy ===
          strategy
      );

    });

  const select =
    $("strategySelect");

  if (select) {
    select.value =
      strategy;
  }

  renderEverything();
}

function setupStrategy() {

  document
    .querySelectorAll(
      ".strategy-button"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          setStrategy(
            button.dataset.strategy
          );

        }
      );

    });

  $("strategySelect")
    ?.addEventListener(
      "change",
      event =>
        setStrategy(
          event.target.value
        )
    );
}

/* =========================
   MARKET SELECTION
========================= */

function selectMarket(symbol) {

  if (!state.markets[symbol]) {
    return;
  }

  state.selectedSymbol =
    symbol;

  subscribePublicMarket(
    symbol
  );

  renderEverything();
}

/* =========================
   RISK SETTINGS
========================= */

function loadRiskSettings() {

  const saved =
    localStorage.getItem(
      CONFIG.STORAGE_SETTINGS
    );

  if (!saved) return;

  try {

    const data =
      JSON.parse(saved);

    if (data.baseStake !== undefined)
      state.risk.baseStake =
        Math.max(
          CONFIG.MIN_STAKE,
          Number(data.baseStake)
        );

    if (data.currentStake !== undefined)
      state.risk.currentStake =
        Math.max(
          CONFIG.MIN_STAKE,
          Number(data.currentStake)
        );

    if (data.takeProfit !== undefined)
      state.risk.takeProfit =
        Math.max(
          0,
          Number(data.takeProfit)
        );

    if (data.stopLoss !== undefined)
      state.risk.stopLoss =
        Math.max(
          0,
          Number(data.stopLoss)
        );

    if (data.martingale !== undefined)
      state.risk.martingale =
        Math.max(
          1,
          Number(data.martingale)
        );

  } catch (error) {

    console.warn(
      "Risk settings could not be loaded."
    );

  }
}

function saveRiskSettings() {

  localStorage.setItem(
    CONFIG.STORAGE_SETTINGS,
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

function readRiskInputs() {

  const base =
    Number(
      $("baseStake")?.value
    );

  const takeProfit =
    Number(
      $("takeProfit")?.value
    );

  const stopLoss =
    Number(
      $("stopLoss")?.value
    );

  const martingale =
    Number(
      $("martingale")?.value
    );

  state.risk.baseStake =
    Math.max(
      CONFIG.MIN_STAKE,
      Number.isFinite(base)
        ? base
        : CONFIG.MIN_STAKE
    );

  state.risk.takeProfit =
    Math.max(
      0,
      Number.isFinite(takeProfit)
        ? takeProfit
        : 5
    );

  state.risk.stopLoss =
    Math.max(
      0,
      Number.isFinite(stopLoss)
        ? stopLoss
        : 5
    );

  state.risk.martingale =
    Math.max(
      1,
      Number.isFinite(martingale)
        ? martingale
        : 2
    );

  if (
    state.risk.currentStake <
    CONFIG.MIN_STAKE
  ) {

    state.risk.currentStake =
      state.risk.baseStake;

  }

  saveRiskSettings();

  renderRisk();
}

function enforceRiskLimits() {

  if (
    state.risk.takeProfit > 0 &&
    state.risk.sessionPL >=
      state.risk.takeProfit
  ) {

    state.risk.paused = true;

    state.risk.reason =
      "TAKE PROFIT";

    stopAIEngine();

    return;
  }

  if (
    state.risk.stopLoss > 0 &&
    state.risk.sessionPL <=
      -state.risk.stopLoss
  ) {

    state.risk.paused = true;

    state.risk.reason =
      "STOP LOSS";

    stopAIEngine();

    return;
  }

  if (!state.risk.paused) {

    state.risk.reason =
      "READY";

  }
}

function simulateWin() {

  if (state.risk.paused) {

    alert(
      `Risk system paused: ${state.risk.reason}. Reset the session first.`
    );

    return;
  }

  const stake =
    Math.max(
      CONFIG.MIN_STAKE,
      state.risk.currentStake
    );

  state.risk.sessionPL +=
    stake;

  state.risk.wins++;

  state.risk.lossStreak = 0;

  state.risk.currentStake =
    Math.max(
      CONFIG.MIN_STAKE,
      state.risk.baseStake
    );

  state.lastAction =
    "PAPER WIN";

  enforceRiskLimits();

  saveRiskSettings();

  renderEverything();
}

function simulateLoss() {

  if (state.risk.paused) {

    alert(
      `Risk system paused: ${state.risk.reason}. Reset the session first.`
    );

    return;
  }

  const stake =
    Math.max(
      CONFIG.MIN_STAKE,
      state.risk.currentStake
    );

  state.risk.sessionPL -=
    stake;

  state.risk.losses++;

  state.risk.lossStreak++;

  state.risk.currentStake =
    Math.max(
      CONFIG.MIN_STAKE,
      stake *
        state.risk.martingale
    );

  state.lastAction =
    "PAPER LOSS";

  enforceRiskLimits();

  saveRiskSettings();

  renderEverything();
}

function resetRisk() {

  state.risk.sessionPL = 0;

  state.risk.wins = 0;

  state.risk.losses = 0;

  state.risk.lossStreak = 0;

  state.risk.currentStake =
    Math.max(
      CONFIG.MIN_STAKE,
      state.risk.baseStake
    );

  state.risk.paused = false;

  state.risk.reason =
    "READY";

  state.lastAction =
    "RISK RESET";

  saveRiskSettings();

  renderEverything();
}

function renderRisk() {

  setText(
    "currentStake",
    state.risk.currentStake.toFixed(2)
  );

  const pl =
    state.risk.sessionPL;

  const plElement =
    $("sessionPL");

  if (plElement) {

    plElement.textContent =
      pl.toFixed(2);

    plElement.style.color =
      pl > 0
        ? "var(--green)"
        : pl < 0
        ? "var(--red)"
        : "";
  }

  setText(
    "winLoss",
    `${state.risk.wins} / ${state.risk.losses}`
  );

  setText(
    "lossStreak",
    state.risk.lossStreak
  );

  const badge =
    $("riskStateBadge");

  if (badge) {

    badge.textContent =
      state.risk.paused
        ? state.risk.reason
        : "READY";

    badge.className =
      "risk-badge " +
      (
        state.risk.paused
          ? "paused"
          : "safe"
      );
  }

  setText(
    "statusRisk",
    state.risk.paused
      ? state.risk.reason
      : "READY"
  );
}

function setupRiskControls() {

  loadRiskSettings();

  const base =
    $("baseStake");

  const take =
    $("takeProfit");

  const stop =
    $("stopLoss");

  const multi =
    $("martingale");

  if (base)
    base.value =
      state.risk.baseStake;

  if (take)
    take.value =
      state.risk.takeProfit;

  if (stop)
    stop.value =
      state.risk.stopLoss;

  if (multi)
    multi.value =
      state.risk.martingale;

  [
    base,
    take,
    stop,
    multi
  ].forEach(input => {

    input?.addEventListener(
      "change",
      readRiskInputs
    );

  });

  $("simWinBtn")
    ?.addEventListener(
      "click",
      simulateWin
    );

  $("simLossBtn")
    ?.addEventListener(
      "click",
      simulateLoss
    );

  $("resetRiskBtn")
    ?.addEventListener(
      "click",
      resetRisk
    );

  renderRisk();
}

/* =========================
   AI ENGINE
========================= */

function startAIEngine() {

  if (state.running) {
    return;
  }

  if (state.risk.paused) {

    setText(
      "tradeSignalBox",
      `RISK PAUSED: ${state.risk.reason}`
    );

    return;
  }

  state.running = true;

  state.aiPhase =
    "ANALYSIS";

  state.aiSeconds =
    CONFIG.ANALYSIS_SECONDS;

  setText(
    "statusEngine",
    "RUNNING"
  );

  runAIInterval();
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
    "aiPhase",
    "READY"
  );

  setText(
    "aiSeconds",
    CONFIG.ANALYSIS_SECONDS
  );

  setText(
    "statusEngine",
    "READY"
  );

  setText(
    "tradeSignalBox",
    "ENGINE STOPPED"
  );
}

function runAIInterval() {

  if (state.aiTimer) {

    clearInterval(
      state.aiTimer
    );

  }

  setText(
    "aiPhase",
    "ANALYSIS"
  );

  setText(
    "aiSeconds",
    state.aiSeconds
  );

  state.aiTimer =
    setInterval(() => {

      if (!state.running) {
        return;
      }

      if (state.risk.paused) {

        stopAIEngine();

        return;
      }

      state.aiSeconds--;

      setText(
        "aiSeconds",
        state.aiSeconds
      );

      renderEverything();

      if (state.aiSeconds <= 0) {

        fireAnalysisSignal();

        state.aiSeconds =
          CONFIG.ANALYSIS_SECONDS;

      }

    }, 1000);
}

function fireAnalysisSignal() {

  if (state.risk.paused) {

    setText(
      "tradeSignalBox",
      `RISK PAUSED: ${state.risk.reason}`
    );

    return;
  }

  const analysis =
    state.selectedStrategy === "AUTO"
      ? analyzeAuto(
          state.selectedSymbol
        )
      : analyzeStrategy(
          state.selectedSymbol,
          state.selectedStrategy
        );

  state.tradeCount++;

  state.lastAction =
    `SIGNAL ${analysis.label}`;

  setText(
    "statusSignals",
    state.tradeCount
  );

  setText(
    "statusAction",
    state.lastAction
  );

  if (
    analysis.quality === "STRONG" ||
    analysis.quality === "WATCH"
  ) {

    setText(
      "tradeSignalBox",
      `SIGNAL: ${analysis.label} • ${round(analysis.confidence, 0)}%`
    );

  } else {

    setText(
      "tradeSignalBox",
      `WAIT • ${analysis.quality}`
    );

  }

  setText(
    "aiPhase",
    "SIGNAL"
  );

  setTimeout(() => {

    if (state.running) {

      setText(
        "aiPhase",
        "ANALYSIS"
      );

    }

  }, 1500);
}

/* =========================
   CONNECTION EVENTS
========================= */

function setupAccountControls() {

  $("connectDerivBtn")
    ?.addEventListener(
      "click",
      connectDerivAccount
    );

  $("disconnectDerivBtn")
    ?.addEventListener(
      "click",
      disconnectDeriv
    );
}

function setupEngineControls() {

  $("startEngineBtn")
    ?.addEventListener(
      "click",
      startAIEngine
    );

  $("stopEngineBtn")
    ?.addEventListener(
      "click",
      stopAIEngine
    );
}

/* =========================
   RENDER EVERYTHING
========================= */

function renderEverything() {

  renderAccount();

  renderSelectedMarket();

  renderDigitDistribution();

  renderProbabilities();

  renderAI();

  renderMarketScanner();

  renderRisk();

  setText(
    "statusAction",
    state.lastAction
  );

  setText(
    "statusSignals",
    state.tradeCount
  );
}

/* =========================
   INITIALIZE
========================= */

function initialize() {

  setupTheme();

  setupAccountControls();

  setupEngineControls();

  setupMarketScanner();

  setupStrategy();

  setupRiskControls();

  renderEverything();

  connectPublicWebSocket();

  updateConnectionUI(
    "PUBLIC DATA"
  );

  setText(
    "statusEngine",
    "READY"
  );

  setText(
    "statusAction",
    "READY"
  );
}

initialize();

/* =========================
   PUBLIC API
========================= */

window.KRISHWAVE = {

  state,

  selectMarket,

  analyzeStrategy,

  analyzeAuto,

  startAIEngine,

  stopAIEngine,

  connectDerivAccount,

  disconnectDeriv,

  simulateWin,

  simulateLoss,

  resetRisk,

  applyTheme
};