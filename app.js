/* =========================================================
   KRISHWAVE AI BEAST V7.3
   ---------------------------------------------------------
   LIVE DERIV MARKET INTELLIGENCE ENGINE

   V7.3 FEATURES
   ---------------------------------------------------------
   ✓ Railway OAuth / PKCE
   ✓ Demo account connection
   ✓ Server-side OAuth session
   ✓ Current Deriv OTP WebSocket format
   ✓ Public live Deriv market feed
   ✓ Authenticated account WebSocket
   ✓ 16 Volatility markets
   ✓ Live prices
   ✓ Tick counters
   ✓ Digit distribution 0-9
   ✓ MATCHES
   ✓ DIFFERS
   ✓ OVER
   ✓ UNDER
   ✓ EVEN
   ✓ ODD
   ✓ AI confidence engine
   ✓ Market scoring
   ✓ Automatic strongest-market selection
   ✓ Circular AI
   ✓ 10 second analysis
   ✓ 5 second trade window
   ✓ 3 second TRADE NOW phase
   ✓ AI BOT
   ✓ Manual paper engine
   ✓ Take Profit
   ✓ Stop Loss
   ✓ Martingale
   ✓ Trade history
   ✓ Amount won
   ✓ Net profit
   ✓ Dark / Light mode
   ✓ Analysis / Trade / History navigation
   ✓ Automatic WebSocket reconnect
   ✓ Connection diagnostics
   ✓ Mobile friendly
   ✓ NO REAL TRADES

   IMPORTANT
   ---------------------------------------------------------
   KRISHWAVE signals are analytical only.
   No prediction is guaranteed.
   No real Deriv contract is purchased by this file.
========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
========================================================= */

const APP_VERSION = "7.3.0";

const BACKEND_URL =
  "https://krishwave-production.up.railway.app";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const DERIV_AUTH_URL =
  "https://auth.deriv.com/oauth2/auth";

const CLIENT_ID =
  "34khasPjsT0PCRR8X3Z70";

const REDIRECT_URI =
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const PAPER_START_BALANCE = 1000;

const MIN_STAKE = 0.25;

const MAX_HISTORY = 500;

const RECONNECT_DELAY = 3000;

const MARKETS = [
  "R_10",
  "R_25",
  "R_50",
  "R_75",
  "R_100",
  "1HZ10V",
  "1HZ25V",
  "1HZ30V",
  "1HZ50V",
  "1HZ75V",
  "1HZ90V",
  "1HZ100V",
  "1HZ150V",
  "1HZ250V",
  "1HZ1000V"
];

const STRATEGIES = [
  "MATCHES",
  "DIFFERS",
  "OVER",
  "UNDER",
  "EVEN",
  "ODD"
];

/* =========================================================
   STORAGE KEYS
========================================================= */

const STORAGE = {
  HISTORY: "krishwave_v73_history",
  BALANCE: "krishwave_v73_balance",
  THEME: "krishwave_v73_theme",
  SETTINGS: "krishwave_v73_settings"
};

/* =========================================================
   GLOBAL STATE
========================================================= */

const state = {

  version: APP_VERSION,

  backendConfig: null,

  sessionId: null,

  accountInfo: null,

  accountMode: "demo",

  publicWs: null,

  authenticatedWs: null,

  publicConnected: false,

  authenticatedConnected: false,

  publicReconnectTimer: null,

  authReconnectTimer: null,

  connectionAttempts: 0,

  selectedMarket: "R_10",

  selectedStrategy: "MATCHES",

  manualTargetDigit: 5,

  marketData: {},

  lastDigits: {},

  totalTicks: {},

  marketScores: {},

  strongestMarket: "R_10",

  strongestConfidence: 0,

  strongestPrediction: null,

  lastGlobalTick: null,

  balance: PAPER_START_BALANCE,

  startingBalance: PAPER_START_BALANCE,

  history: [],

  activeTrades: [],

  totalProfit: 0,

  totalAmountWon: 0,

  totalStake: 0,

  wins: 0,

  losses: 0,

  botRunning: false,

  circularRunning: false,

  manualRunning: false,

  botLastTrade: 0,

  botTradeInterval: 6000,

  botMinConfidence: 55,

  circularPhase: "READY",

  circularRemaining: 10,

  circularPrediction: null,

  circularMarket: "R_10",

  circularStrategy: "MATCHES",

  circularConfidence: 0,

  circularTimer: null,

  circularPhaseStarted: 0,

  circularTradeDone: false,

  paperStake: MIN_STAKE,

  takeProfit: 100,

  stopLoss: 100,

  martingaleEnabled: false,

  martingaleMultiplier: 2,

  currentMartingaleStake: MIN_STAKE,

  theme: "dark",

  currentTab: "analysis",

  initialized: false,

  tickLoop: null,

  uiLoop: null,

  botLoop: null,

  sessionChecked: false

};

/* =========================================================
   SAFE DOM HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function q(selector) {
  return document.querySelector(selector);
}

function qa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent =
      value === undefined ||
      value === null
        ? ""
        : String(value);
  }
}

function setHTML(id, value) {
  const el = $(id);

  if (el) {
    el.innerHTML =
      value === undefined ||
      value === null
        ? ""
        : String(value);
  }
}

function setValue(id, value) {
  const el = $(id);

  if (el) {
    el.value = value;
  }
}

function show(id, visible = true) {
  const el = $(id);

  if (el) {
    el.style.display =
      visible ? "" : "none";
  }
}

function addClass(id, className) {
  const el = $(id);

  if (el) {
    el.classList.add(className);
  }
}

function removeClass(id, className) {
  const el = $(id);

  if (el) {
    el.classList.remove(className);
  }
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
   NUMBER HELPERS
========================================================= */

function num(value, fallback = 0) {

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function round(value, decimals = 2) {

  const factor =
    Math.pow(10, decimals);

  return Math.round(
    num(value) * factor
  ) / factor;
}

function money(value) {

  return "$" +
    num(value)
      .toLocaleString(
        undefined,
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
}

function formatNumber(value) {

  return num(value)
    .toLocaleString(
      undefined,
      {
        maximumFractionDigits: 5
      }
    );
}

function now() {
  return Date.now();
}

/* =========================================================
   TOAST
========================================================= */

function showToast(message, duration = 3000) {

  let toast =
    $("kwToast");

  if (!toast) {

    toast =
      document.createElement("div");

    toast.id =
      "kwToast";

    toast.style.position =
      "fixed";

    toast.style.left =
      "50%";

    toast.style.bottom =
      "80px";

    toast.style.transform =
      "translateX(-50%)";

    toast.style.zIndex =
      "99999";

    toast.style.padding =
      "12px 18px";

    toast.style.borderRadius =
      "14px";

    toast.style.background =
      "rgba(15,15,20,.95)";

    toast.style.color =
      "#fff";

    toast.style.fontSize =
      "13px";

    toast.style.fontWeight =
      "700";

    toast.style.maxWidth =
      "90%";

    toast.style.textAlign =
      "center";

    document.body.appendChild(
      toast
    );
  }

  toast.textContent =
    message;

  toast.style.display =
    "block";

  clearTimeout(
    toast._timer
  );

  toast._timer =
    setTimeout(
      () => {
        toast.style.display =
          "none";
      },
      duration
    );
}

/* =========================================================
   LOCAL STORAGE
========================================================= */

function saveState() {

  try {

    localStorage.setItem(
      STORAGE.BALANCE,
      String(state.balance)
    );

    localStorage.setItem(
      STORAGE.HISTORY,
      JSON.stringify(
        state.history.slice(
          0,
          MAX_HISTORY
        )
      )
    );

    localStorage.setItem(
      STORAGE.THEME,
      state.theme
    );

    localStorage.setItem(
      STORAGE.SETTINGS,
      JSON.stringify({
        selectedMarket:
          state.selectedMarket,
        selectedStrategy:
          state.selectedStrategy,
        manualTargetDigit:
          state.manualTargetDigit,
        paperStake:
          state.paperStake,
        takeProfit:
          state.takeProfit,
        stopLoss:
          state.stopLoss,
        martingaleEnabled:
          state.martingaleEnabled,
        martingaleMultiplier:
          state.martingaleMultiplier
      })
    );

  } catch (error) {

    console.warn(
      "Storage save failed:",
      error
    );
  }
}

function loadState() {

  try {

    const balance =
      Number(
        localStorage.getItem(
          STORAGE.BALANCE
        )
      );

    if (
      Number.isFinite(balance) &&
      balance >= 0
    ) {
      state.balance =
        balance;
    }

    const history =
      JSON.parse(
        localStorage.getItem(
          STORAGE.HISTORY
        ) || "[]"
      );

    if (Array.isArray(history)) {
      state.history =
        history.slice(
          0,
          MAX_HISTORY
        );
    }

    const theme =
      localStorage.getItem(
        STORAGE.THEME
      );

    if (
      theme === "dark" ||
      theme === "light"
    ) {
      state.theme =
        theme;
    }

    const settings =
      JSON.parse(
        localStorage.getItem(
          STORAGE.SETTINGS
        ) || "{}"
      );

    if (settings.selectedMarket) {
      state.selectedMarket =
        settings.selectedMarket;
    }

    if (settings.selectedStrategy) {
      state.selectedStrategy =
        settings.selectedStrategy;
    }

    if (
      Number.isFinite(
        Number(
          settings.manualTargetDigit
        )
      )
    ) {
      state.manualTargetDigit =
        clamp(
          Number(
            settings.manualTargetDigit
          ),
          0,
          9
        );
    }

    if (
      Number.isFinite(
        Number(settings.paperStake)
      )
    ) {
      state.paperStake =
        Math.max(
          MIN_STAKE,
          Number(settings.paperStake)
        );
    }

    if (
      Number.isFinite(
        Number(settings.takeProfit)
      )
    ) {
      state.takeProfit =
        Math.max(
          0,
          Number(settings.takeProfit)
        );
    }

    if (
      Number.isFinite(
        Number(settings.stopLoss)
      )
    ) {
      state.stopLoss =
        Math.max(
          0,
          Number(settings.stopLoss)
        );
    }

    if (
      typeof settings.martingaleEnabled ===
      "boolean"
    ) {
      state.martingaleEnabled =
        settings.martingaleEnabled;
    }

    if (
      Number.isFinite(
        Number(
          settings.martingaleMultiplier
        )
      )
    ) {
      state.martingaleMultiplier =
        Math.max(
          1,
          Number(
            settings.martingaleMultiplier
          )
        );
    }

  } catch (error) {

    console.warn(
      "Storage load failed:",
      error
    );
  }
}

/* =========================================================
   THEME
========================================================= */

function applyTheme() {

  document.documentElement
    .setAttribute(
      "data-theme",
      state.theme
    );

  document.body
    .classList.toggle(
      "light-mode",
      state.theme === "light"
    );

  document.body
    .classList.toggle(
      "dark-mode",
      state.theme === "dark"
    );

  const buttons =
    qa(
      "#themeToggle, .theme-toggle, [data-theme-toggle]"
    );

  buttons.forEach(
    button => {

      button.textContent =
        state.theme === "dark"
          ? "☀️"
          : "🌙";
    }
  );

  saveState();
}

function toggleTheme() {

  state.theme =
    state.theme === "dark"
      ? "light"
      : "dark";

  applyTheme();
}

/* =========================================================
   INITIAL MARKET OBJECT
========================================================= */

function createMarketState(symbol) {

  if (!state.marketData[symbol]) {

    state.marketData[symbol] = {

      symbol,

      price: 0,

      previousPrice: 0,

      tick: 0,

      ticks: [],

      digits: [],

      digitCounts:
        Array(10).fill(0),

      lastDigit: null,

      lastTimestamp: 0,

      tickCount: 0,

      confidence: 0,

      prediction: null,

      strategy: null,

      direction: null,

      updated: 0

    };
  }

  return state.marketData[symbol];
}

MARKETS.forEach(
  createMarketState
);

/* =========================================================
   DIGIT EXTRACTION
========================================================= */

function extractLastDigit(price) {

  if (
    price === undefined ||
    price === null
  ) {
    return null;
  }

  const text =
    String(price);

  const digits =
    text.match(/\d/g);

  if (
    !digits ||
    digits.length === 0
  ) {
    return null;
  }

  return Number(
    digits[digits.length - 1]
  );
}

/* =========================================================
   PROCESS TICK
========================================================= */

function processTick(
  symbol,
  price,
  timestamp
) {

  const market =
    createMarketState(symbol);

  const numericPrice =
    num(price, 0);

  if (
    numericPrice <= 0
  ) {
    return;
  }

  const digit =
    extractLastDigit(
      numericPrice
    );

  market.previousPrice =
    market.price;

  market.price =
    numericPrice;

  market.tick =
    numericPrice;

  market.lastTimestamp =
    num(timestamp, now());

  market.tickCount += 1;

  if (
    digit !== null
  ) {

    market.lastDigit =
      digit;

    market.digits.push(
      digit
    );

    market.digitCounts[digit] += 1;

    if (
      market.digits.length >
      200
    ) {
      const old =
        market.digits.shift();

      if (
        Number.isInteger(old)
      ) {
        market.digitCounts[old] =
          Math.max(
            0,
            market.digitCounts[old] - 1
          );
      }
    }
  }

  market.ticks.push(
    numericPrice
  );

  if (
    market.ticks.length >
    100
  ) {
    market.ticks.shift();
  }

  state.lastGlobalTick = {
    symbol,
    price:
      numericPrice,
    digit,
    timestamp:
      market.lastTimestamp
  };

  state.lastDigits[symbol] =
    digit;

  state.totalTicks[symbol] =
    market.tickCount;

  calculateMarketPrediction(
    symbol
  );

  if (
    symbol === state.selectedMarket
  ) {
    renderSelectedMarket();
  }

  renderGlobalUI();
}

/* =========================================================
   DIGIT STATISTICS
========================================================= */

function getDigitStats(symbol) {

  const market =
    createMarketState(symbol);

  const total =
    market.digits.length;

  const result =
    Array(10)
      .fill(null)
      .map(
        (_, digit) => {

          const count =
            market.digitCounts[digit];

          return {
            digit,
            count,
            percent:
              total > 0
                ? (count / total) * 100
                : 0
          };
        }
      );

  return result;
}

function getHotDigit(symbol) {

  const stats =
    getDigitStats(symbol);

  return stats.reduce(
    (best, item) =>
      item.count >
      best.count
        ? item
        : best,
    stats[0]
  );
}

function getColdDigit(symbol) {

  const stats =
    getDigitStats(symbol);

  return stats.reduce(
    (best, item) =>
      item.count <
      best.count
        ? item
        : best,
    stats[0]
  );
}

/* =========================================================
   EVEN / ODD
========================================================= */

function evenOddScore(symbol) {

  const market =
    createMarketState(symbol);

  const digits =
    market.digits;

  if (
    digits.length < 5
  ) {
    return {
      even: 50,
      odd: 50
    };
  }

  let even = 0;

  let odd = 0;

  digits.forEach(
    digit => {

      if (
        digit % 2 === 0
      ) {
        even++;
      } else {
        odd++;
      }
    }
  );

  const total =
    even + odd;

  return {
    even:
      total
        ? (even / total) * 100
        : 50,

    odd:
      total
        ? (odd / total) * 100
        : 50
  };
}

/* =========================================================
   OVER / UNDER
========================================================= */

function overUnderScore(
  symbol,
  barrier = 4
) {

  const market =
    createMarketState(symbol);

  const digits =
    market.digits;

  if (
    digits.length < 5
  ) {
    return {
      over: 50,
      under: 50
    };
  }

  let over = 0;

  let under = 0;

  digits.forEach(
    digit => {

      if (
        digit > barrier
      ) {
        over++;
      } else {
        under++;
      }
    }
  );

  const total =
    over + under;

  return {
    over:
      total
        ? (over / total) * 100
        : 50,

    under:
      total
        ? (under / total) * 100
        : 50
  };
}

/* =========================================================
   STRATEGY CONFIDENCE
========================================================= */

function strategyConfidence(
  symbol,
  strategy,
  targetDigit =
    state.manualTargetDigit
) {

  const market =
    createMarketState(symbol);

  const digits =
    market.digits;

  if (
    digits.length < 5
  ) {
    return {
      confidence: 0,
      prediction: null,
      reason:
        "Waiting for enough live ticks."
    };
  }

  const stats =
    getDigitStats(symbol);

  const hot =
    getHotDigit(symbol);

  const evenOdd =
    evenOddScore(symbol);

  const overUnder =
    overUnderScore(symbol);

  let confidence =
    50;

  let prediction =
    null;

  let reason =
    "Live digit distribution";

  switch (strategy) {

    case "MATCHES": {

      const target =
        clamp(
          Number(targetDigit),
          0,
          9
        );

      const item =
        stats[target];

      const frequency =
        item.percent;

      const recent =
        digits
          .slice(-20)
          .filter(
            d =>
              d === target
          ).length;

      const recentPercent =
        (recent / 20) * 100;

      confidence =
        45 +
        frequency * 0.45 +
        recentPercent * 0.25;

      confidence =
        clamp(
          confidence,
          1,
          95
        );

      prediction =
        `DIGIT ${target}`;

      reason =
        `Digit ${target} frequency ${frequency.toFixed(1)}%`;

      break;
    }

    case "DIFFERS": {

      const target =
        clamp(
          Number(targetDigit),
          0,
          9
        );

      const item =
        stats[target];

      confidence =
        100 -
        item.percent;

      confidence =
        45 +
        confidence * 0.45;

      confidence =
        clamp(
          confidence,
          1,
          95
        );

      prediction =
        `NOT ${target}`;

      reason =
        `Digit ${target} occurrence ${item.percent.toFixed(1)}%`;

      break;
    }

    case "OVER": {

      confidence =
        overUnder.over;

      prediction =
        "OVER 4";

      reason =
        `Digits over 4: ${overUnder.over.toFixed(1)}%`;

      break;
    }

    case "UNDER": {

      confidence =
        overUnder.under;

      prediction =
        "UNDER 5";

      reason =
        `Digits under 5: ${overUnder.under.toFixed(1)}%`;

      break;
    }

    case "EVEN": {

      confidence =
        evenOdd.even;

      prediction =
        "EVEN";

      reason =
        `Even digits: ${evenOdd.even.toFixed(1)}%`;

      break;
    }

    case "ODD": {

      confidence =
        evenOdd.odd;

      prediction =
        "ODD";

      reason =
        `Odd digits: ${evenOdd.odd.toFixed(1)}%`;

      break;
    }

    default:

      confidence = 50;

      prediction = "—";
  }

  return {
    confidence:
      clamp(
        confidence,
        0,
        99
      ),

    prediction,

    reason
  };
}

/* =========================================================
   MARKET PREDICTION
========================================================= */

function calculateMarketPrediction(
  symbol
) {

  const market =
    createMarketState(symbol);

  let best = {
    strategy: "MATCHES",
    confidence: 0,
    prediction: null,
    reason: ""
  };

  STRATEGIES.forEach(
    strategy => {

      let target =
        state.manualTargetDigit;

      if (
        strategy === "MATCHES" ||
        strategy === "DIFFERS"
      ) {

        const hot =
          getHotDigit(symbol);

        target =
          hot
            ? hot.digit
            : state.manualTargetDigit;
      }

      const result =
        strategyConfidence(
          symbol,
          strategy,
          target
        );

      if (
        result.confidence >
        best.confidence
      ) {

        best = {
          strategy,
          confidence:
            result.confidence,
          prediction:
            result.prediction,
          reason:
            result.reason
        };
      }
    }
  );

  market.confidence =
    best.confidence;

  market.prediction =
    best.prediction;

  market.strategy =
    best.strategy;

  state.marketScores[symbol] =
    best.confidence;

  return best;
}

/* =========================================================
   SCAN ALL MARKETS
========================================================= */

function scanMarkets() {

  let strongest = {
    symbol:
      state.selectedMarket,
    confidence: 0,
    strategy:
      "MATCHES",
    prediction: null,
    reason: ""
  };

  MARKETS.forEach(
    symbol => {

      const market =
        createMarketState(symbol);

      const prediction =
        calculateMarketPrediction(
          symbol
        );

      if (
        prediction.confidence >
        strongest.confidence
      ) {

        strongest = {
          symbol,
          confidence:
            prediction.confidence,
          strategy:
            prediction.strategy,
          prediction:
            prediction.prediction,
          reason:
            prediction.reason
        };
      }
    }
  );

  state.strongestMarket =
    strongest.symbol;

  state.strongestConfidence =
    strongest.confidence;

  state.strongestPrediction =
    strongest;

  return strongest;
}

/* =========================================================
   AUTO SELECT STRONGEST MARKET
========================================================= */

function autoSelectStrongestMarket() {

  const strongest =
    scanMarkets();

  if (
    strongest &&
    strongest.confidence > 0
  ) {

    state.strongestMarket =
      strongest.symbol;

    state.circularMarket =
      strongest.symbol;

    state.circularStrategy =
      strongest.strategy;

    state.circularConfidence =
      strongest.confidence;

    state.circularPrediction =
      strongest.prediction;
  }

  return strongest;
}

/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(
  status,
  message
) {

  const normalized =
    String(status)
      .toUpperCase();

  const online =
    normalized === "ONLINE" ||
    normalized === "CONNECTED";

  const statusTexts = [
    "connectionStatus",
    "derivConnectionStatus",
    "connectionText",
    "statusText"
  ];

  statusTexts.forEach(
    id => {

      if ($(id)) {

        setText(
          id,
          message ||
          normalized
        );
      }
    }
  );

  const badges =
    qa(
      ".connection-status, .status-badge, [data-connection-status]"
    );

  badges.forEach(
    badge => {

      badge.textContent =
        online
          ? "🟢 CONNECTED"
          : normalized === "CONNECTING"
            ? "🟡 CONNECTING"
            : "🔴 OFFLINE";

      badge.classList.toggle(
        "online",
        online
      );

      badge.classList.toggle(
        "offline",
        !online
      );
    }
  );

  setText(
    "derivConnection",
    online
      ? "CONNECTED"
      : "DERIV CONNECTION FAILED"
  );

  setText(
    "connectionStatus",
    online
      ? "LIVE"
      : normalized
  );

  setText(
    "appConnectionStatus",
    online
      ? "ONLINE"
      : "OFFLINE"
  );

  setText(
    "engineConnection",
    message ||
    normalized
  );
}

/* =========================================================
   LOAD BACKEND CONFIG
========================================================= */

async function loadBackendConfig() {

  try {

    const response =
      await fetch(
        `${BACKEND_URL}/api/config`,
        {
          method: "GET",
          cache: "no-store"
        }
      );

    const data =
      await response.json();

    if (
      data &&
      data.success
    ) {

      state.backendConfig =
        data;

      console.log(
        "KRISHWAVE backend:",
        data
      );

      return data;
    }

    throw new Error(
      data?.error ||
      "Backend configuration unavailable"
    );

  } catch (error) {

    console.error(
      "Backend config error:",
      error
    );

    updateConnectionUI(
      "OFFLINE",
      "RAILWAY BACKEND UNAVAILABLE"
    );

    return null;
  }
}

/* =========================================================
   RANDOM PKCE
========================================================= */

function randomString(length = 64) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  let output = "";

  const values =
    new Uint8Array(length);

  crypto.getRandomValues(
    values
  );

  values.forEach(
    value => {

      output +=
        chars[
          value % chars.length
        ];
    }
  );

  return output;
}

function base64UrlEncode(
  buffer
) {

  let binary = "";

  const bytes =
    new Uint8Array(buffer);

  bytes.forEach(
    byte => {
      binary +=
        String.fromCharCode(
          byte
        );
    }
  );

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function sha256(
  text
) {

  const data =
    new TextEncoder()
      .encode(text);

  return crypto.subtle.digest(
    "SHA-256",
    data
  );
}

async function createPKCE() {

  const verifier =
    randomString(96);

  const digest =
    await sha256(
      verifier
    );

  const challenge =
    base64UrlEncode(
      digest
    );

  return {
    verifier,
    challenge
  };
}

/* =========================================================
   OAUTH CONNECT
========================================================= */

async function connectDeriv() {

  try {

    if (
      !state.backendConfig
    ) {

      await loadBackendConfig();
    }

    const pkce =
      await createPKCE();

    const oauthState =
      randomString(32);

    sessionStorage.setItem(
      "krishwave_oauth_state",
      oauthState
    );

    sessionStorage.setItem(
      "krishwave_pkce_verifier",
      pkce.verifier
    );

    sessionStorage.setItem(
      "krishwave_oauth_started",
      String(Date.now())
    );

    const params =
      new URLSearchParams({

        response_type:
          "code",

        client_id:
          CLIENT_ID,

        redirect_uri:
          REDIRECT_URI,

        scope:
          "trade",

        state:
          oauthState,

        code_challenge:
          pkce.challenge,

        code_challenge_method:
          "S256"
      });

    const url =
      `${DERIV_AUTH_URL}?${params.toString()}`;

    console.log(
      "Opening Deriv OAuth"
    );

    window.location.href =
      url;

  } catch (error) {

    console.error(
      "OAuth error:",
      error
    );

    showToast(
      "Unable to start Deriv connection"
    );
  }
}

/* =========================================================
   HANDLE OAUTH CALLBACK
========================================================= */

async function handleOAuthCallback() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const code =
    params.get("code");

  const returnedState =
    params.get("state");

  const oauthError =
    params.get("error");

  if (oauthError) {

    console.error(
      "Deriv OAuth error:",
      oauthError
    );

    showToast(
      `Deriv authorization failed: ${oauthError}`
    );

    cleanOAuthUrl();

    return;
  }

  if (!code) {
    return;
  }

  const savedState =
    sessionStorage.getItem(
      "krishwave_oauth_state"
    );

  const verifier =
    sessionStorage.getItem(
      "krishwave_pkce_verifier"
    );

  if (
    !savedState ||
    !verifier
  ) {

    showToast(
      "OAuth security session expired. Connect again."
    );

    cleanOAuthUrl();

    return;
  }

  if (
    returnedState !==
    savedState
  ) {

    console.error(
      "OAuth state mismatch"
    );

    showToast(
      "OAuth security check failed"
    );

    cleanOAuthUrl();

    return;
  }

  try {

    updateConnectionUI(
      "CONNECTING",
      "AUTHORIZING DERIV..."
    );

    const response =
      await fetch(
        `${BACKEND_URL}/api/oauth/exchange`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            code,
            code_verifier:
              verifier
          })
        }
      );

    const data =
      await response.json();

    console.log(
      "OAuth exchange:",
      data
    );

    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data?.error ||
        data?.message ||
        "OAuth exchange failed"
      );
    }

    state.sessionId =
      data.session_id ||
      data.sessionId;

    if (
      !state.sessionId
    ) {

      throw new Error(
        "No server session returned"
      );
    }

    sessionStorage.setItem(
      "krishwave_session_id",
      state.sessionId
    );

    cleanOAuthUrl();

    showToast(
      "Deriv authorization successful"
    );

    await loadAccounts();

  } catch (error) {

    console.error(
      "OAuth exchange error:",
      error
    );

    updateConnectionUI(
      "OFFLINE",
      "DERIV AUTHORIZATION FAILED"
    );

    showToast(
      error.message ||
      "Deriv authorization failed"
    );

    cleanOAuthUrl();
  }
}

function cleanOAuthUrl() {

  try {

    const clean =
      window.location.origin +
      window.location.pathname;

    window.history.replaceState(
      {},
      document.title,
      clean
    );

  } catch {}
}

/* =========================================================
   RESTORE SESSION
========================================================= */

function restoreSession() {

  const sessionId =
    sessionStorage.getItem(
      "krishwave_session_id"
    );

  if (
    sessionId
  ) {

    state.sessionId =
      sessionId;

    return true;
  }

  return false;
}

/* =========================================================
   LOAD ACCOUNTS
========================================================= */

async function loadAccounts() {

  if (
    !state.sessionId
  ) {

    return false;
  }

  try {

    updateConnectionUI(
      "CONNECTING",
      "LOADING DERIV ACCOUNT..."
    );

    const response =
      await fetch(
        `${BACKEND_URL}/api/accounts`,
        {
          method: "GET",
          headers: {
            "X-Session-ID":
              state.sessionId
          },
          cache: "no-store"
        }
      );

    const data =
      await response.json();

    console.log(
      "Deriv accounts:",
      data
    );

    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data?.error ||
        "Unable to load Deriv accounts"
      );
    }

    let accounts =
      data.accounts ||
      data.data ||
      [];

    if (
      !Array.isArray(accounts)
    ) {

      if (
        accounts.accounts &&
        Array.isArray(
          accounts.accounts
        )
      ) {
        accounts =
          accounts.accounts;
      } else {
        accounts = [];
      }
    }

    if (
      accounts.length === 0
    ) {

      throw new Error(
        "No Deriv accounts found"
      );
    }

    let account =
      chooseAccount(
        accounts
      );

    state.accountInfo =
      normalizeAccount(
        account
      );

    renderAccount();

    /*
      OAuth/account stage succeeded.
      Now request the authenticated OTP WebSocket.
    */

    await connectAuthenticatedWebSocket(
      state.accountInfo
    );

    /*
      Public market feed does not need authentication.
    */

    connectPublicWebSocket();

    updateConnectionUI(
      "CONNECTING",
      "CONNECTING TO DERIV LIVE DATA..."
    );

    return true;

  } catch (error) {

    console.error(
      "Account loading failed:",
      error
    );

    updateConnectionUI(
      "OFFLINE",
      "DERIV ACCOUNT CONNECTION FAILED"
    );

    showToast(
      error.message ||
      "Unable to load Deriv account"
    );

    return false;
  }
}

/* =========================================================
   CHOOSE ACCOUNT
========================================================= */

function chooseAccount(
  accounts
) {

  const list =
    accounts.filter(Boolean);

  if (
    list.length === 0
  ) {
    return null;
  }

  /*
    Prefer demo accounts when
    DEMO is selected.
  */

  if (
    state.accountMode ===
    "demo"
  ) {

    const demo =
      list.find(
        account =>
          String(
            account.loginid ||
            account.account_id ||
            account.id ||
            ""
          )
          .toUpperCase()
          .startsWith("VRTC")
      );

    if (demo) {
      return demo;
    }

    const demo2 =
      list.find(
        account =>
          String(
            account.type ||
            account.account_type ||
            ""
          )
          .toLowerCase()
          .includes("demo")
      );

    if (demo2) {
      return demo2;
    }
  }

  return list[0];
}

/* =========================================================
   NORMALIZE ACCOUNT
========================================================= */

function normalizeAccount(
  account
) {

  if (!account) {

    return {
      loginid: "",
      currency: "USD",
      balance: 0,
      type: "demo"
    };
  }

  const loginid =
    account.loginid ||
    account.account_id ||
    account.id ||
    "";

  const balance =
    num(
      account.balance ??
      account.available_balance ??
      account.balance_amount,
      state.balance
    );

  const currency =
    account.currency ||
    "USD";

  const type =
    account.type ||
    account.account_type ||
    (
      String(loginid)
        .startsWith("VRTC")
        ? "demo"
        : "real"
    );

  return {
    ...account,
    loginid,
    balance,
    currency,
    type
  };
}

/* =========================================================
   ACCOUNT RENDER
========================================================= */

function renderAccount() {

  const account =
    state.accountInfo;

  if (!account) {
    return;
  }

  setText(
    "accountDisplay",
    account.loginid ||
    "—"
  );

  setText(
    "accountId",
    account.loginid ||
    "—"
  );

  setText(
    "currencyDisplay",
    account.currency ||
    "USD"
  );

  setText(
    "accountCurrency",
    account.currency ||
    "USD"
  );

  setText(
    "derivAccount",
    account.loginid ||
    "—"
  );

  setText(
    "balanceDisplay",
    money(account.balance)
  );

  setText(
    "accountBalance",
    money(account.balance)
  );

  setText(
    "derivBalance",
    money(account.balance)
  );

  const type =
    String(
      account.type ||
      ""
    ).toLowerCase();

  setText(
    "accountType",
    type.includes("real")
      ? "REAL"
      : "DEMO"
  );
}

/* =========================================================
   AUTHENTICATED WEBSOCKET
========================================================= */

async function connectAuthenticatedWebSocket(
  account
) {

  const accountId =
    account?.loginid ||
    account?.account_id;

  if (
    !accountId
  ) {

    console.warn(
      "No Deriv account ID"
    );

    return false;
  }

  if (
    !state.sessionId
  ) {

    console.warn(
      "No KRISHWAVE session"
    );

    return false;
  }

  try {

    updateConnectionUI(
      "CONNECTING",
      "GETTING DERIV LIVE CHANNEL..."
    );

    const response =
      await fetch(
        `${BACKEND_URL}/api/otp`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            session_id:
              state.sessionId,

            account_id:
              accountId
          })
        }
      );

    let data = {};

    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        `Invalid OTP response (${response.status})`
      );
    }

    console.log(
      "KRISHWAVE OTP response:",
      data
    );

    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data?.error ||
        data?.message ||
        "Deriv OTP request failed"
      );
    }

    /*
      Current Deriv format:

      {
        data: {
          url: "wss://..."
        }
      }

      Compatibility formats are also accepted.
    */

    const websocketUrl =
      data?.data?.url ||
      data?.websocket_url ||
      data?.url ||
      data?.ws_url;

    if (
      typeof websocketUrl !==
      "string" ||
      !websocketUrl.startsWith(
        "wss://"
      )
    ) {

      console.error(
        "Invalid Deriv WebSocket URL:",
        data
      );

      throw new Error(
        "Deriv returned no valid WebSocket URL"
      );
    }

    if (
      state.authenticatedWs
    ) {

      try {
        state.authenticatedWs.close();
      } catch {}

      state.authenticatedWs =
        null;
    }

    /*
      OTP is one-time.
      Connect immediately.
    */

    const ws =
      new WebSocket(
        websocketUrl
      );

    state.authenticatedWs =
      ws;

    ws.onopen =
      () => {

        console.log(
          "KRISHWAVE AUTH WS CONNECTED"
        );

        state.authenticatedConnected =
          true;

        state.connectionAttempts =
          0;

        updateConnectionUI(
          "ONLINE",
          "DERIV LIVE ACCOUNT CONNECTED"
        );

        showToast(
          "🟢 Deriv live connection established"
        );

        try {

          ws.send(
            JSON.stringify({
              balance: 1,
              subscribe: 1
            })
          );

        } catch (error) {

          console.warn(
            "Balance request failed:",
            error
          );
        }
      };

    ws.onmessage =
      event => {

        let message;

        try {

          message =
            JSON.parse(
              event.data
            );

        } catch {

          return;
        }

        handleAuthenticatedMessage(
          message
        );
      };

    ws.onerror =
      error => {

        console.warn(
          "Authenticated WebSocket error:",
          error
        );

        state.authenticatedConnected =
          false;

        /*
          Don't call this a total failure
          if the public market feed is alive.
        */

        if (
          !state.publicConnected
        ) {

          updateConnectionUI(
            "OFFLINE",
            "DERIV LIVE CONNECTION FAILED"
          );
        }
      };

    ws.onclose =
      event => {

        console.warn(
          "Authenticated WebSocket closed:",
          event.code,
          event.reason
        );

        state.authenticatedConnected =
          false;

        if (
          state.publicConnected
        ) {

          updateConnectionUI(
            "ONLINE",
            "LIVE MARKET DATA CONNECTED"
          );

        } else {

          updateConnectionUI(
            "CONNECTING",
            "RECONNECTING DERIV..."
          );
        }
      };

    return true;

  } catch (error) {

    console.error(
      "Authenticated WebSocket failed:",
      error
    );

    state.authenticatedConnected =
      false;

    if (
      !state.publicConnected
    ) {

      updateConnectionUI(
        "OFFLINE",
        "DERIV LIVE CONNECTION FAILED"
      );
    }

    showToast(
      error.message ||
      "Deriv live connection failed"
    );

    return false;
  }
}

/* =========================================================
   AUTHENTICATED MESSAGE
========================================================= */

function handleAuthenticatedMessage(
  message
) {

  if (
    message.error
  ) {

    console.warn(
      "Deriv authenticated error:",
      message.error
    );

    return;
  }

  const balanceData =
    message.balance;

  if (
    balanceData
  ) {

    const balance =
      num(
        balanceData.balance,
        NaN
      );

    if (
      Number.isFinite(balance)
    ) {

      if (
        state.accountInfo
      ) {

        state.accountInfo.balance =
          balance;
      }

      setText(
        "derivBalance",
        money(balance)
      );

      setText(
        "accountBalance",
        money(balance)
      );

      setText(
        "liveDerivBalance",
        money(balance)
      );
    }
  }

  if (
    message.authorize
  ) {

    const auth =
      message.authorize;

    const balance =
      num(
        auth.balance,
        NaN
      );

    if (
      Number.isFinite(balance)
    ) {

      if (
        state.accountInfo
      ) {
        state.accountInfo.balance =
          balance;
      }

      renderAccount();
    }
  }
}

/* =========================================================
   PUBLIC WEBSOCKET
========================================================= */

function connectPublicWebSocket() {

  if (
    state.publicWs
  ) {

    try {
      state.publicWs.close();
    } catch {}

    state.publicWs =
      null;
  }

  console.log(
    "KRISHWAVE connecting public WS..."
  );

  try {

    const ws =
      new WebSocket(
        PUBLIC_WS
      );

    state.publicWs =
      ws;

    ws.onopen =
      () => {

        console.log(
          "KRISHWAVE PUBLIC WS CONNECTED"
        );

        state.publicConnected =
          true;

        state.connectionAttempts =
          0;

        updateConnectionUI(
          "ONLINE",
          "DERIV LIVE MARKET DATA CONNECTED"
        );

        subscribeAllMarkets();
      };

    ws.onmessage =
      event => {

        let message;

        try {

          message =
            JSON.parse(
              event.data
            );

        } catch {

          return;
        }

        handlePublicMessage(
          message
        );
      };

    ws.onerror =
      error => {

        console.warn(
          "Public WebSocket error:",
          error
        );

        state.publicConnected =
          false;

        if (
          !state.authenticatedConnected
        ) {

          updateConnectionUI(
            "OFFLINE",
            "DERIV CONNECTION FAILED"
          );
        }
      };

    ws.onclose =
      event => {

        console.warn(
          "Public WS closed:",
          event.code,
          event.reason
        );

        state.publicConnected =
          false;

        if (
          !state.authenticatedConnected
        ) {

          updateConnectionUI(
            "OFFLINE",
            "DERIV CONNECTION CLOSED"
          );
        }

        schedulePublicReconnect();
      };

  } catch (error) {

    console.error(
      "Public WS creation failed:",
      error
    );

    state.publicConnected =
      false;

    schedulePublicReconnect();
  }
}

/* =========================================================
   SUBSCRIBE ALL MARKETS
========================================================= */

function subscribeAllMarkets() {

  if (
    !state.publicWs ||
    state.publicWs.readyState !==
      WebSocket.OPEN
  ) {

    return;
  }

  MARKETS.forEach(
    symbol => {

      try {

        state.publicWs.send(
          JSON.stringify({
            ticks_history:
              symbol,

            count:
              50,

            end:
              "latest",

            style:
              "ticks",

            subscribe:
              1
          })
        );

      } catch (error) {

        console.warn(
          "Subscription failed:",
          symbol,
          error
        );
      }
    }
  );
}

/* =========================================================
   PUBLIC MESSAGE
========================================================= */

function handlePublicMessage(
  message
) {

  if (
    message.error
  ) {

    console.warn(
      "Deriv public error:",
      message.error
    );

    return;
  }

  /*
    Historical ticks response
  */

  if (
    message.history
  ) {

    const symbol =
      message.echo_req?.ticks_history ||
      message.echo_req?.symbol;

    if (
      symbol &&
      message.history.prices
    ) {

      const prices =
        message.history.prices;

      const times =
        message.history.times ||
        [];

      prices.forEach(
        (price, index) => {

          processTick(
            symbol,
            price,
            times[index] ||
            now()
          );
        }
      );
    }
  }

  /*
    Live tick response
  */

  if (
    message.tick
  ) {

    const tick =
      message.tick;

    const symbol =
      tick.symbol ||
      message.echo_req?.ticks;

    const price =
      tick.quote;

    const timestamp =
      tick.epoch
        ? Number(tick.epoch) * 1000
        : now();

    if (
      symbol &&
      price !== undefined
    ) {

      processTick(
        symbol,
        price,
        timestamp
      );
    }
  }
}

/* =========================================================
   RECONNECT
========================================================= */

function schedulePublicReconnect() {

  if (
    state.publicReconnectTimer
  ) {
    return;
  }

  state.connectionAttempts++;

  state.publicReconnectTimer =
    setTimeout(
      () => {

        state.publicReconnectTimer =
          null;

        connectPublicWebSocket();

      },
      RECONNECT_DELAY
    );
}

/* =========================================================
   GET SELECTED MARKET
========================================================= */

function getSelectedMarket() {

  if (
    !MARKETS.includes(
      state.selectedMarket
    )
  ) {

    state.selectedMarket =
      MARKETS[0];
  }

  return createMarketState(
    state.selectedMarket
  );
}

/* =========================================================
   RENDER SELECTED MARKET
========================================================= */

function renderSelectedMarket() {

  const market =
    getSelectedMarket();

  const prediction =
    calculateMarketPrediction(
      market.symbol
    );

  setText(
    "activeMarket",
    market.symbol
  );

  setText(
    "selectedMarket",
    market.symbol
  );

  setText(
    "analysisMarket",
    market.symbol
  );

  setText(
    "livePrice",
    market.price > 0
      ? formatNumber(market.price)
      : "0.00"
  );

  setText(
    "priceDisplay",
    market.price > 0
      ? formatNumber(market.price)
      : "0.00"
  );

  setText(
    "tickCount",
    market.tickCount
  );

  setText(
    "ticksDisplay",
    market.tickCount
  );

  setText(
    "analysisTicks",
    market.tickCount
  );

  setText(
    "aiConfidence",
    `${Math.round(
      prediction.confidence
    )}%`
  );

  setText(
    "analysisConfidence",
    `${Math.round(
      prediction.confidence
    )}%`
  );

  setText(
    "predictionDisplay",
    prediction.prediction ||
    "—"
  );

  setText(
    "marketPrediction",
    prediction.prediction ||
    "—"
  );

  setText(
    "aiSignal",
    prediction.prediction ||
    "—"
  );

  setText(
    "strategyDisplay",
    prediction.strategy ||
    "—"
  );

  setText(
    "aiReason",
    prediction.reason ||
    "Waiting for enough live ticks to analyze the market."
  );

  setText(
    "analysisReason",
    prediction.reason ||
    "Waiting for enough live ticks to analyze the market."
  );

  renderDigitDistribution(
    market.symbol
  );

  renderMarketChart(
    market.symbol
  );
}

/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigitDistribution(
  symbol
) {

  const stats =
    getDigitStats(symbol);

  const container =
    $(
      "digitDistribution"
    ) ||
    $(
      "digitTable"
    ) ||
    $(
      "digitGrid"
    );

  /*
    First try known individual
    digit percentage IDs.
  */

  stats.forEach(
    item => {

      const percent =
        `${item.percent.toFixed(1)}%`;

      const ids = [
        `digit${item.digit}Percent`,
        `digit-${item.digit}-percent`,
        `digitPercent${item.digit}`
      ];

      ids.forEach(
        id => {

          if ($(id)) {
            setText(
              id,
              percent
            );
          }
        }
      );

      const countIds = [
        `digit${item.digit}Count`,
        `digit-${item.digit}-count`,
        `digitCount${item.digit}`
      ];

      countIds.forEach(
        id => {

          if ($(id)) {
            setText(
              id,
              item.count
            );
          }
        }
      );
    }
  );

  if (
    !container
  ) {
    return;
  }

  /*
    If the existing HTML already contains
    digit rows/cards, update them instead
    of destroying the structure.
  */

  const digitRows =
    container.querySelectorAll(
      "[data-digit]"
    );

  if (
    digitRows.length
  ) {

    digitRows.forEach(
      row => {

        const digit =
          Number(
            row.dataset.digit
          );

        const item =
          stats.find(
            x =>
              x.digit === digit
          );

        if (!item) {
          return;
        }

        const percent =
          row.querySelector(
            ".digit-percent"
          );

        const count =
          row.querySelector(
            ".digit-count"
          );

        const bar =
          row.querySelector(
            ".digit-bar-fill"
          );

        if (percent) {
          percent.textContent =
            `${item.percent.toFixed(1)}%`;
        }

        if (count) {
          count.textContent =
            item.count;
        }

        if (bar) {
          bar.style.width =
            `${clamp(
              item.percent,
              0,
              100
            )}%`;
        }
      }
    );

    return;
  }

  /*
    If no structured digit UI exists,
    build a compact distribution.
  */

  container.innerHTML =
    stats.map(
      item => `
        <div
          data-digit="${item.digit}"
          style="
            display:flex;
            align-items:center;
            gap:8px;
            margin:4px 0;
          "
        >
          <strong
            style="
              width:18px;
              text-align:center;
            "
          >
            ${item.digit}
          </strong>

          <div
            style="
              flex:1;
              height:7px;
              background:rgba(128,128,128,.18);
              border-radius:99px;
              overflow:hidden;
            "
          >
            <div
              class="digit-bar-fill"
              style="
                width:${item.percent}%;
                height:100%;
                border-radius:99px;
                background:currentColor;
              "
            ></div>
          </div>

          <span
            class="digit-percent"
            style="
              width:48px;
              text-align:right;
              font-size:11px;
            "
          >
            ${item.percent.toFixed(1)}%
          </span>
        </div>
      `
    )
    .join("");
}

/* =========================================================
   SIMPLE CHART
========================================================= */

function renderMarketChart(
  symbol
) {

  const canvas =
    $("priceChart") ||
    $("marketChart") ||
    $("analysisChart");

  if (
    !canvas ||
    typeof canvas.getContext !==
      "function"
  ) {
    return;
  }

  const ctx =
    canvas.getContext("2d");

  const rect =
    canvas.getBoundingClientRect();

  const width =
    Math.max(
      300,
      Math.floor(
        rect.width ||
        canvas.clientWidth ||
        300
      )
    );

  const height =
    Math.max(
      150,
      Math.floor(
        rect.height ||
        canvas.clientHeight ||
        180
      )
    );

  const dpr =
    window.devicePixelRatio ||
    1;

  canvas.width =
    width * dpr;

  canvas.height =
    height * dpr;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const market =
    createMarketState(symbol);

  const values =
    market.ticks.slice(-60);

  if (
    values.length < 2
  ) {

    ctx.font =
      "12px sans-serif";

    ctx.fillText(
      "Waiting for live ticks...",
      15,
      25
    );

    return;
  }

  let min =
    Math.min(...values);

  let max =
    Math.max(...values);

  if (
    max === min
  ) {

    max += 0.00001;

    min -= 0.00001;
  }

  const padding =
    15;

  const chartWidth =
    width -
    padding * 2;

  const chartHeight =
    height -
    padding * 2;

  ctx.beginPath();

  values.forEach(
    (value, index) => {

      const x =
        padding +
        (
          index /
          (values.length - 1)
        ) *
        chartWidth;

      const y =
        padding +
        (
          1 -
          (
            value - min
          ) /
          (
            max - min
          )
        ) *
        chartHeight;

      if (
        index === 0
      ) {

        ctx.moveTo(
          x,
          y
        );

      } else {

        ctx.lineTo(
          x,
          y
        );
      }
    }
  );

  ctx.strokeStyle =
    getComputedStyle(
      document.body
    )
      .color ||
    "#ffffff";

  ctx.lineWidth =
    2;

  ctx.stroke();
}

/* =========================================================
   GLOBAL UI
========================================================= */

function renderGlobalUI() {

  const strongest =
    scanMarkets();

  setText(
    "strongestMarket",
    strongest.symbol
  );

  setText(
    "strongestConfidence",
    `${Math.round(
      strongest.confidence
    )}%`
  );

  setText(
    "aiStatus",
    strongest.confidence >= 70
      ? "STRONG"
      : strongest.confidence >= 55
        ? "GOOD"
        : "WAITING"
  );

  setText(
    "totalProfitDisplay",
    money(state.totalProfit)
  );

  setText(
    "totalProfit",
    money(state.totalProfit)
  );

  setText(
    "amountWonDisplay",
    money(state.totalAmountWon)
  );

  setText(
    "winsDisplay",
    state.wins
  );

  setText(
    "lossesDisplay",
    state.losses
  );

  setText(
    "activeTradesDisplay",
    state.activeTrades.length
  );

  setText(
    "paperBalance",
    money(state.balance)
  );

  renderAccount();

  renderHistory();

  renderTradeStatus();

  renderCircularUI();
}

/* =========================================================
   MARKET SELECTOR
========================================================= */

function populateMarketSelectors() {

  const selectors =
    qa(
      "#marketSelector, #aiMarketSelector, select[data-market-selector]"
    );

  selectors.forEach(
    select => {

      const current =
        select.value ||
        state.selectedMarket;

      select.innerHTML =
        MARKETS.map(
          symbol => `
            <option value="${symbol}">
              ${symbol}
            </option>
          `
        )
        .join("");

      select.value =
        MARKETS.includes(current)
          ? current
          : state.selectedMarket;

      select.onchange =
        () => {

          selectMarket(
            select.value
          );
        };
    }
  );
}

function selectMarket(
  symbol
) {

  if (
    !MARKETS.includes(symbol)
  ) {
    return;
  }

  state.selectedMarket =
    symbol;

  qa(
    "#marketSelector, #aiMarketSelector, select[data-market-selector]"
  )
    .forEach(
      select => {
        select.value =
          symbol;
      }
    );

  renderSelectedMarket();

  saveState();
}

/* =========================================================
   STRATEGY SELECTORS
========================================================= */

function populateStrategySelectors() {

  const selectors =
    qa(
      "#strategySelector, #manualStrategySelector, #strategySelect, select[data-strategy-selector]"
    );

  selectors.forEach(
    select => {

      const current =
        select.value ||
        state.selectedStrategy;

      select.innerHTML =
        STRATEGIES.map(
          strategy => `
            <option value="${strategy}">
              ${strategy}
            </option>
          `
        )
        .join("");

      select.value =
        STRATEGIES.includes(current)
          ? current
          : state.selectedStrategy;

      select.onchange =
        () => {

          selectStrategy(
            select.value
          );
        };
    }
  );
}

function selectStrategy(
  strategy
) {

  if (
    !STRATEGIES.includes(strategy)
  ) {
    return;
  }

  state.selectedStrategy =
    strategy;

  qa(
    "#strategySelector, #manualStrategySelector, #strategySelect, select[data-strategy-selector]"
  )
    .forEach(
      select => {
        select.value =
          strategy;
      }
    );

  setText(
    "selectedStrategy",
    strategy
  );

  updateTargetDigitVisibility();

  saveState();
}

/* =========================================================
   TARGET DIGIT
========================================================= */

function updateTargetDigitVisibility() {

  const needsDigit =
    state.selectedStrategy ===
      "MATCHES" ||
    state.selectedStrategy ===
      "DIFFERS";

  [
    "targetDigitContainer",
    "manualTargetContainer",
    "targetDigitBox"
  ].forEach(
    id => {

      if ($(id)) {
        show(
          id,
          needsDigit
        );
      }
    }
  );
}

function setManualTargetDigit(
  value
) {

  const digit =
    clamp(
      Number(value),
      0,
      9
    );

  state.manualTargetDigit =
    digit;

  [
    "targetDigit",
    "manualTargetDigit"
  ].forEach(
    id => {

      if ($(id)) {
        setValue(
          id,
          digit
        );
      }
    }
  );

  saveState();
}

/* =========================================================
   PAPER TRADE PREDICTION
========================================================= */

function getPaperPrediction(
  symbol,
  strategy,
  targetDigit
) {

  const market =
    createMarketState(symbol);

  if (
    market.digits.length < 5
  ) {

    return {
      valid: false,
      confidence: 0,
      prediction: null
    };
  }

  const result =
    strategyConfidence(
      symbol,
      strategy,
      targetDigit
    );

  return {
    valid:
      result.confidence >= 1,

    confidence:
      result.confidence,

    prediction:
      result.prediction,

    reason:
      result.reason
  };
}

/* =========================================================
   PAPER TRADE
========================================================= */

function placePaperTrade(
  options = {}
) {

  const symbol =
    options.symbol ||
    state.selectedMarket;

  const strategy =
    options.strategy ||
    state.selectedStrategy;

  const targetDigit =
    Number.isFinite(
      Number(options.targetDigit)
    )
      ? Number(options.targetDigit)
      : state.manualTargetDigit;

  const stake =
    Math.max(
      MIN_STAKE,
      num(
        options.stake,
        state.currentMartingaleStake ||
        state.paperStake
      )
    );

  if (
    state.balance < stake
  ) {

    showToast(
      "Insufficient paper balance"
    );

    return null;
  }

  const prediction =
    getPaperPrediction(
      symbol,
      strategy,
      targetDigit
    );

  if (
    !prediction.valid
  ) {

    showToast(
      "Waiting for enough live ticks"
    );

    return null;
  }

  const trade = {

    id:
      `KW-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,

    timestamp:
      now(),

    symbol,

    strategy,

    targetDigit,

    prediction:
      prediction.prediction,

    confidence:
      prediction.confidence,

    stake,

    status:
      "OPEN",

    entryPrice:
      createMarketState(symbol).price,

    entryDigit:
      createMarketState(symbol).lastDigit,

    amountWon:
      0,

    netProfit:
      0
  };

  state.balance =
    round(
      state.balance - stake,
      2
    );

  state.totalStake +=
    stake;

  state.activeTrades.push(
    trade
  );

  saveState();

  renderGlobalUI();

  showToast(
    `PAPER TRADE: ${strategy} ${symbol}`
  );

  /*
    Resolve after a short live-data window.
  */

  setTimeout(
    () => {

      resolvePaperTrade(
        trade.id
      );

    },
    5000
  );

  return trade;
}

/* =========================================================
   RESOLVE PAPER TRADE
========================================================= */

function resolvePaperTrade(
  tradeId
) {

  const index =
    state.activeTrades.findIndex(
      trade =>
        trade.id ===
        tradeId
    );

  if (
    index === -1
  ) {
    return;
  }

  const trade =
    state.activeTrades[index];

  const market =
    createMarketState(
      trade.symbol
    );

  const digit =
    market.lastDigit;

  let win =
    false;

  switch (
    trade.strategy
  ) {

    case "MATCHES":

      win =
        digit ===
        trade.targetDigit;

      break;

    case "DIFFERS":

      win =
        digit !==
        trade.targetDigit;

      break;

    case "OVER":

      win =
        digit > 4;

      break;

    case "UNDER":

      win =
        digit < 5;

      break;

    case "EVEN":

      win =
        digit !== null &&
        digit % 2 === 0;

      break;

    case "ODD":

      win =
        digit !== null &&
        digit % 2 === 1;

      break;
  }

  /*
    Paper payout is deliberately conservative.
    This is not a Deriv contract calculation.
  */

  const payoutMultiplier =
    0.80;

  let amountWon =
    0;

  let netProfit =
    -trade.stake;

  if (win) {

    amountWon =
      trade.stake *
      (1 + payoutMultiplier);

    netProfit =
      trade.stake *
      payoutMultiplier;

    state.wins++;

  } else {

    state.losses++;
  }

  trade.status =
    win
      ? "WON"
      : "LOST";

  trade.exitDigit =
    digit;

  trade.amountWon =
    round(
      amountWon,
      2
    );

  trade.netProfit =
    round(
      netProfit,
      2
    );

  trade.exitPrice =
    market.price;

  trade.closedAt =
    now();

  state.balance =
    round(
      state.balance +
      amountWon,
      2
    );

  state.totalProfit =
    round(
      state.totalProfit +
      netProfit,
      2
    );

  state.totalAmountWon =
    round(
      state.totalAmountWon +
      amountWon,
      2
    );

  state.activeTrades.splice(
    index,
    1
  );

  state.history.unshift(
    {
      ...trade
    }
  );

  state.history =
    state.history.slice(
      0,
      MAX_HISTORY
    );

  /*
    Martingale.
  */

  if (
    state.martingaleEnabled
  ) {

    if (win) {

      state.currentMartingaleStake =
        state.paperStake;

    } else {

      state.currentMartingaleStake =
        Math.max(
          MIN_STAKE,
          round(
            trade.stake *
            state.martingaleMultiplier,
            2
          )
        );
    }

  } else {

    state.currentMartingaleStake =
      state.paperStake;
  }

  saveState();

  renderGlobalUI();
}

/* =========================================================
   SESSION LIMITS
========================================================= */

function checkSessionLimits() {

  const profit =
    state.totalProfit;

  if (
    state.takeProfit > 0 &&
    profit >=
      state.takeProfit
  ) {

    stopAIBot();

    stopCircularAI();

    showToast(
      "TAKE PROFIT reached"
    );
  }

  if (
    state.stopLoss > 0 &&
    profit <=
      -Math.abs(
        state.stopLoss
      )
  ) {

    stopAIBot();

    stopCircularAI();

    showToast(
      "STOP LOSS reached"
    );
  }
}

/* =========================================================
   AI BOT
========================================================= */

function startAIBot() {

  if (
    state.botRunning
  ) {
    return;
  }

  state.botRunning =
    true;

  state.botLastTrade =
    0;

  setText(
    "engineStatusText",
    "AI BOT RUNNING"
  );

  setText(
    "botStatus",
    "RUNNING"
  );

  showToast(
    "🤖 AI BOT started"
  );

  clearInterval(
    state.botLoop
  );

  state.botLoop =
    setInterval(
      runAIBotCycle,
      1000
    );

  renderGlobalUI();
}

function stopAIBot() {

  state.botRunning =
    false;

  clearInterval(
    state.botLoop
  );

  state.botLoop =
    null;

  setText(
    "engineStatusText",
    "AI BOT STOPPED"
  );

  setText(
    "botStatus",
    "STOPPED"
  );

  renderGlobalUI();
}

function runAIBotCycle() {

  if (
    !state.botRunning
  ) {
    return;
  }

  checkSessionLimits();

  if (
    !state.botRunning
  ) {
    return;
  }

  const strongest =
    autoSelectStrongestMarket();

  if (
    !strongest ||
    strongest.confidence <
      state.botMinConfidence
  ) {
    return;
  }

  if (
    now() -
      state.botLastTrade <
      state.botTradeInterval
  ) {
    return;
  }

  if (
    state.balance <
    state.currentMartingaleStake
  ) {
    showToast(
      "AI BOT: insufficient paper balance"
    );

    stopAIBot();

    return;
  }

  state.botLastTrade =
    now();

  placePaperTrade({
    symbol:
      strongest.symbol,

    strategy:
      strongest.strategy,

    targetDigit:
      getAutomaticTargetDigit(
        strongest.symbol
      ),

    stake:
      state.currentMartingaleStake
  });
}

/* =========================================================
   AUTOMATIC TARGET
========================================================= */

function getAutomaticTargetDigit(
  symbol
) {

  const hot =
    getHotDigit(symbol);

  return hot
    ? hot.digit
    : state.manualTargetDigit;
}

/* =========================================================
   CIRCULAR AI
========================================================= */

function startCircularAI() {

  if (
    state.circularRunning
  ) {
    return;
  }

  state.circularRunning =
    true;

  state.circularPhase =
    "ANALYZING";

  state.circularRemaining =
    10;

  state.circularPrediction =
    null;

  state.circularTradeDone =
    false;

  beginCircularAnalysis();

  showToast(
    "🧠 Circular AI started"
  );

  renderCircularUI();
}

function stopCircularAI() {

  state.circularRunning =
    false;

  state.circularPhase =
    "READY";

  state.circularRemaining =
    10;

  state.circularPrediction =
    null;

  state.circularConfidence =
    0;

  state.circularTradeDone =
    false;

  clearInterval(
    state.circularTimer
  );

  state.circularTimer =
    null;

  setText(
    "circularStatus",
    "STOPPED"
  );

  setText(
    "circularPhase",
    "READY"
  );

  renderCircularUI();
}

function beginCircularAnalysis() {

  if (
    !state.circularRunning
  ) {
    return;
  }

  clearInterval(
    state.circularTimer
  );

  /*
    Automatically scan the strongest market
    at the beginning of every cycle.
  */

  const strongest =
    autoSelectStrongestMarket();

  state.circularMarket =
    strongest.symbol;

  state.circularStrategy =
    strongest.strategy;

  state.circularConfidence =
    strongest.confidence;

  state.circularPrediction =
    strongest.prediction;

  state.circularPhase =
    "ANALYZING";

  state.circularRemaining =
    10;

  state.circularPhaseStarted =
    now();

  state.circularTradeDone =
    false;

  updateCircularCountdown();

  state.circularTimer =
    setInterval(
      circularTick,
      1000
    );
}

function circularTick() {

  if (
    !state.circularRunning
  ) {
    return;
  }

  state.circularRemaining =
    Math.max(
      0,
      state.circularRemaining - 1
    );

  updateCircularCountdown();

  if (
    state.circularRemaining <=
    0
  ) {

    if (
      state.circularPhase ===
      "ANALYZING"
    ) {

      state.circularPhase =
        "TRADE WINDOW";

      state.circularRemaining =
        5;

      state.circularPrediction =
        calculateMarketPrediction(
          state.circularMarket
        ).prediction;

      updateCircularCountdown();

      return;
    }

    if (
      state.circularPhase ===
      "TRADE WINDOW"
    ) {

      state.circularPhase =
        "TRADE NOW";

      state.circularRemaining =
        3;

      updateCircularCountdown();

      if (
        !state.circularTradeDone
      ) {

        executeCircularPaperTrade();

        state.circularTradeDone =
          true;
      }

      return;
    }

    if (
      state.circularPhase ===
      "TRADE NOW"
    ) {

      beginCircularAnalysis();

      return;
    }
  }
}

/* =========================================================
   CIRCULAR PAPER TRADE
========================================================= */

function executeCircularPaperTrade() {

  const symbol =
    state.circularMarket;

  const strategy =
    state.circularStrategy;

  const prediction =
    calculateMarketPrediction(
      symbol
    );

  if (
    prediction.confidence <
    50
  ) {

    showToast(
      "Circular AI: confidence too low"
    );

    return;
  }

  /*
    Circular AI uses its own target.
    It does not overwrite the manual target.
  */

  const target =
    getAutomaticTargetDigit(
      symbol
    );

  placePaperTrade({
    symbol,
    strategy,
    targetDigit:
      target,
    stake:
      state.currentMartingaleStake
  });
}

/* =========================================================
   CIRCULAR UI
========================================================= */

function renderCircularUI() {

  setText(
    "circularStatus",
    state.circularRunning
      ? "RUNNING"
      : "STOPPED"
  );

  setText(
    "circularPhase",
    state.circularPhase
  );

  setText(
    "circularCountdown",
    state.circularRemaining
  );

  setText(
    "circularMarket",
    state.circularMarket
  );

  setText(
    "circularStrategy",
    state.circularStrategy
  );

  setText(
    "circularPrediction",
    state.circularPrediction ||
    "—"
  );

  setText(
    "circularConfidence",
    `${Math.round(
      state.circularConfidence
    )}%`
  );

  setText(
    "circularMarketDisplay",
    state.circularMarket
  );

  setText(
    "circularPredictionDisplay",
    state.circularPrediction ||
    "—"
  );

  const startButtons =
    qa(
      "#startCircularAI, #startAI"
    );

  startButtons.forEach(
    button => {

      button.textContent =
        state.circularRunning
          ? "STOP AI"
          : "START AI";
    }
  );
}

/* =========================================================
   COUNTDOWN UI
========================================================= */

function updateCircularCountdown() {

  renderCircularUI();

  const countdown =
    $("circularCountdown");

  if (countdown) {

    countdown.textContent =
      state.circularRemaining;
  }

  setText(
    "circularTimer",
    state.circularRemaining
  );

  setText(
    "circularPhaseText",
    state.circularPhase
  );
}

/* =========================================================
   MANUAL ENGINE
========================================================= */

function startManualEngine() {

  if (
    state.manualRunning
  ) {
    return;
  }

  state.manualRunning =
    true;

  setText(
    "manualStatus",
    "RUNNING"
  );

  showToast(
    "Manual paper engine ready"
  );

  renderGlobalUI();
}

function stopManualEngine() {

  state.manualRunning =
    false;

  setText(
    "manualStatus",
    "STOPPED"
  );

  renderGlobalUI();
}

function executeManualTrade() {

  if (
    !state.manualRunning
  ) {

    startManualEngine();
  }

  const trade =
    placePaperTrade({
      symbol:
        state.selectedMarket,

      strategy:
        state.selectedStrategy,

      targetDigit:
        state.manualTargetDigit,

      stake:
        state.currentMartingaleStake
    });

  if (trade) {

    renderGlobalUI();
  }
}

/* =========================================================
   TRADE STATUS
========================================================= */

function renderTradeStatus() {

  setText(
    "paperBalance",
    money(state.balance)
  );

  setText(
    "tradeBalance",
    money(state.balance)
  );

  setText(
    "totalProfitDisplay",
    money(state.totalProfit)
  );

  setText(
    "amountWonDisplay",
    money(state.totalAmountWon)
  );

  setText(
    "totalStakeDisplay",
    money(state.totalStake)
  );

  setText(
    "winsDisplay",
    state.wins
  );

  setText(
    "lossesDisplay",
    state.losses
  );
}

/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

  const container =
    $("historyList") ||
    $("tradeHistory");

  if (
    !container
  ) {
    return;
  }

  if (
    state.history.length === 0
  ) {

    container.innerHTML =
      `
        <div
          style="
            padding:20px;
            text-align:center;
            opacity:.65;
          "
        >
          No paper trades yet.
        </div>
      `;

    return;
  }

  container.innerHTML =
    state.history
      .slice(0, 100)
      .map(
        trade => {

          const won =
            trade.status ===
            "WON";

          return `
            <div
              class="kw-history-item"
              style="
                padding:12px;
                margin-bottom:8px;
                border-radius:12px;
                border:1px solid rgba(128,128,128,.18);
              "
            >

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  gap:8px;
                "
              >

                <strong>
                  ${escapeHTML(
                    trade.strategy
                  )}
                </strong>

                <strong>
                  ${won
                    ? "WON"
                    : "LOST"}
                </strong>

              </div>

              <div
                style="
                  font-size:12px;
                  opacity:.75;
                  margin-top:5px;
                "
              >
                ${escapeHTML(
                  trade.symbol
                )}
                •
                ${escapeHTML(
                  trade.prediction ||
                  "—"
                )}
              </div>

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  margin-top:7px;
                  font-size:12px;
                "
              >

                <span>
                  Stake:
                  ${money(
                    trade.stake
                  )}
                </span>

                <span>
                  Amount won:
                  ${money(
                    trade.amountWon
                  )}
                </span>

                <span>
                  Net:
                  ${trade.netProfit >= 0
                    ? "+"
                    : ""}${money(
                      trade.netProfit
                    )}
                </span>

              </div>

            </div>
          `;
        }
      )
      .join("");
}

/* =========================================================
   CLEAR HISTORY
========================================================= */

function clearHistory() {

  if (
    !confirm(
      "Clear all KRISHWAVE paper trade history?"
    )
  ) {
    return;
  }

  state.history =
    [];

  state.totalProfit =
    0;

  state.totalAmountWon =
    0;

  state.totalStake =
    0;

  state.wins =
    0;

  state.losses =
    0;

  state.balance =
    PAPER_START_BALANCE;

  state.currentMartingaleStake =
    state.paperStake;

  saveState();

  renderGlobalUI();

  showToast(
    "Paper history cleared"
  );
}

/* =========================================================
   NAVIGATION
========================================================= */

function showTab(
  tab
) {

  state.currentTab =
    tab;

  const sections = {

    analysis: [
      "#analysisPage",
      "#analysisSection",
      "[data-page='analysis']"
    ],

    trade: [
      "#tradePage",
      "#tradeSection",
      "[data-page='trade']"
    ],

    history: [
      "#historyPage",
      "#historySection",
      "[data-page='history']"
    ]
  };

  Object.entries(
    sections
  )
    .forEach(
      ([name, selectors]) => {

        const visible =
          name === tab;

        selectors.forEach(
          selector => {

            qa(selector)
              .forEach(
                element => {

                  element.style.display =
                    visible
                      ? ""
                      : "none";
                }
              );
          }
        );
      }
    );

  qa(
    "[data-tab]"
  )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.tab ===
          tab
        );
      }
    );

  /*
    Common button IDs.
  */

  [
    "analysisTab",
    "tradeTab",
    "historyTab"
  ]
    .forEach(
      id => {

        const button =
          $(id);

        if (!button) {
          return;
        }

        const expected =
          id
            .replace(
              "Tab",
              ""
            )
            .toLowerCase();

        button.classList.toggle(
          "active",
          expected === tab
        );
      }
    );

  if (
    tab === "analysis"
  ) {

    renderSelectedMarket();

  } else if (
    tab === "trade"
  ) {

    renderGlobalUI();

  } else if (
    tab === "history"
  ) {

    renderHistory();
  }
}

/* =========================================================
   ACCOUNT MODE
========================================================= */

function selectAccountMode(
  mode
) {

  if (
    mode !== "demo" &&
    mode !== "real"
  ) {
    return;
  }

  if (
    mode === "real"
  ) {

    const confirmed =
      confirm(
        "REAL mode is not enabled for real contract execution in KRISHWAVE V7.3.\n\nContinue using KRISHWAVE paper/analysis mode?"
      );

    if (!confirmed) {

      state.accountMode =
        "demo";

      updateAccountModeUI();

      return;
    }
  }

  state.accountMode =
    mode;

  updateAccountModeUI();

  showToast(
    mode === "demo"
      ? "DEMO mode selected"
      : "REAL account selected — paper engine remains active"
  );

  /*
    If already connected, reconnect account
    channel using the selected account.
  */

  if (
    state.sessionId
  ) {

    loadAccounts();
  }
}

function updateAccountModeUI() {

  qa(
    "[data-account-mode]"
  )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.accountMode ===
          state.accountMode
        );
      }
    );

  const demo =
    $("demoButton");

  const real =
    $("realButton");

  if (demo) {
    demo.classList.toggle(
      "active",
      state.accountMode ===
      "demo"
    );
  }

  if (real) {
    real.classList.toggle(
      "active",
      state.accountMode ===
      "real"
    );
  }

  setText(
    "modeDisplay",
    state.accountMode
      .toUpperCase()
  );
}

/* =========================================================
   LOGOUT
========================================================= */

async function logoutDeriv() {

  stopAIBot();

  stopCircularAI();

  stopManualEngine();

  if (
    state.publicWs
  ) {

    try {
      state.publicWs.close();
    } catch {}
  }

  if (
    state.authenticatedWs
  ) {

    try {
      state.authenticatedWs.close();
    } catch {}
  }

  state.publicWs =
    null;

  state.authenticatedWs =
    null;

  state.publicConnected =
    false;

  state.authenticatedConnected =
    false;

  if (
    state.sessionId
  ) {

    try {

      await fetch(
        `${BACKEND_URL}/api/logout`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            session_id:
              state.sessionId
          })
        }
      );

    } catch {}
  }

  sessionStorage.removeItem(
    "krishwave_session_id"
  );

  state.sessionId =
    null;

  state.accountInfo =
    null;

  updateConnectionUI(
    "OFFLINE",
    "KRISHWAVE READY"
  );

  showToast(
    "Disconnected from Deriv"
  );

  renderAccount();
}

/* =========================================================
   SETTINGS
========================================================= */

function bindSettings() {

  const stakeInputs =
    qa(
      "#stakeInput, #paperStake, input[data-stake]"
    );

  stakeInputs.forEach(
    input => {

      input.value =
        state.paperStake;

      input.addEventListener(
        "change",
        () => {

          state.paperStake =
            Math.max(
              MIN_STAKE,
              num(
                input.value,
                MIN_STAKE
              )
            );

          state.currentMartingaleStake =
            state.paperStake;

          saveState();
        }
      );
    }
  );

  const tpInputs =
    qa(
      "#takeProfit, input[data-take-profit]"
    );

  tpInputs.forEach(
    input => {

      input.value =
        state.takeProfit;

      input.addEventListener(
        "change",
        () => {

          state.takeProfit =
            Math.max(
              0,
              num(
                input.value,
                0
              )
            );

          saveState();
        }
      );
    }
  );

  const slInputs =
    qa(
      "#stopLoss, input[data-stop-loss]"
    );

  slInputs.forEach(
    input => {

      input.value =
        state.stopLoss;

      input.addEventListener(
        "change",
        () => {

          state.stopLoss =
            Math.max(
              0,
              num(
                input.value,
                0
              )
            );

          saveState();
        }
      );
    }
  );

  const martingale =
    qa(
      "#martingaleToggle, input[data-martingale]"
    );

  martingale.forEach(
    input => {

      input.checked =
        state.martingaleEnabled;

      input.addEventListener(
        "change",
        () => {

          state.martingaleEnabled =
            input.checked;

          saveState();
        }
      );
    }
  );

  const multiplier =
    qa(
      "#martingaleMultiplier, input[data-martingale-multiplier]"
    );

  multiplier.forEach(
    input => {

      input.value =
        state.martingaleMultiplier;

      input.addEventListener(
        "change",
        () => {

          state.martingaleMultiplier =
            Math.max(
              1,
              num(
                input.value,
                2
              )
            );

          saveState();
        }
      );
    }
  );
}

/* =========================================================
   BUTTON BINDING
========================================================= */

function bindButtons() {

  /*
    Connect buttons
  */

  qa(
    "#connectDeriv, #connectButton, [data-connect-deriv]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          connectDeriv
        );
      }
    );

  /*
    Theme
  */

  qa(
    "#themeToggle, .theme-toggle, [data-theme-toggle]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          toggleTheme
        );
      }
    );

  /*
    Tabs
  */

  qa(
    "[data-tab]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            showTab(
              button.dataset.tab
            );
          }
        );
      }
    );

  if (
    $("analysisTab")
  ) {

    $("analysisTab")
      .addEventListener(
        "click",
        () =>
          showTab("analysis")
      );
  }

  if (
    $("tradeTab")
  ) {

    $("tradeTab")
      .addEventListener(
        "click",
        () =>
          showTab("trade")
      );
  }

  if (
    $("historyTab")
  ) {

    $("historyTab")
      .addEventListener(
        "click",
        () =>
          showTab("history")
      );
  }

  /*
    Account mode
  */

  qa(
    "[data-account-mode]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            selectAccountMode(
              button.dataset.accountMode
            )
        );
      }
    );

  if (
    $("demoButton")
  ) {

    $("demoButton")
      .addEventListener(
        "click",
        () =>
          selectAccountMode("demo")
      );
  }

  if (
    $("realButton")
  ) {

    $("realButton")
      .addEventListener(
        "click",
        () =>
          selectAccountMode("real")
      );
  }

  /*
    AI BOT
  */

  qa(
    "#startAIBot, #aiBotStart, [data-start-bot]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          startAIBot
        );
      }
    );

  qa(
    "#stopAIBot, #aiBotStop, [data-stop-bot]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          stopAIBot
        );
      }
    );

  /*
    Circular AI
  */

  qa(
    "#startCircularAI, #startAI, [data-start-circular]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            if (
              state.circularRunning
            ) {
              stopCircularAI();
            } else {
              startCircularAI();
            }
          }
        );
      }
    );

  qa(
    "#stopCircularAI, #stopAI, [data-stop-circular]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          stopCircularAI
        );
      }
    );

  /*
    Manual
  */

  qa(
    "#manualStart, [data-manual-start]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          startManualEngine
        );
      }
    );

  qa(
    "#manualStop, [data-manual-stop]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          stopManualEngine
        );
      }
    );

  qa(
    "#manualTrade, #executeTrade, [data-manual-trade]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          executeManualTrade
        );
      }
    );

  /*
    Scan
  */

  qa(
    "#analysisScanBtn, #scanMarkets, #scanButton, [data-scan-markets]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const strongest =
              autoSelectStrongestMarket();

            selectMarket(
              strongest.symbol
            );

            showToast(
              `Strongest: ${strongest.symbol} • ${Math.round(strongest.confidence)}%`
            );

            renderGlobalUI();
          }
        );
      }
    );

  /*
    Clear history
  */

  qa(
    "#clearHistory, [data-clear-history]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          clearHistory
        );
      }
    );

  /*
    Logout
  */

  qa(
    "#logoutButton, [data-logout]"
  )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          logoutDeriv
        );
      }
    );

  /*
    Target digit
  */

  qa(
    "#targetDigit, #manualTargetDigit"
  )
    .forEach(
      input => {

        input.addEventListener(
          "change",
          () =>
            setManualTargetDigit(
              input.value
            )
        );
      }
    );
}

/* =========================================================
   ENGINE STATUS LOOP
========================================================= */

function updateEngineStatus() {

  const market =
    getSelectedMarket();

  if (
    market.tickCount === 0
  ) {

    setText(
      "status",
      "WAITING"
    );

  } else if (
    market.confidence >= 70
  ) {

    setText(
      "status",
      "STRONG"
    );

  } else if (
    market.confidence >= 55
  ) {

    setText(
      "status",
      "GOOD"
    );

  } else {

    setText(
      "status",
      "ANALYZING"
    );
  }

  setText(
    "liveIndicator",
    state.publicConnected
      ? "● LIVE"
      : "● OFFLINE"
  );

  checkSessionLimits();
}

/* =========================================================
   PERIODIC RENDER
========================================================= */

function startUILoop() {

  clearInterval(
    state.uiLoop
  );

  state.uiLoop =
    setInterval(
      () => {

        renderSelectedMarket();

        renderGlobalUI();

        updateEngineStatus();

      },
      1000
    );
}

/* =========================================================
   PUBLIC FEED FALLBACK
========================================================= */

function ensurePublicFeed() {

  if (
    state.publicConnected
  ) {
    return;
  }

  if (
    state.publicWs &&
    (
      state.publicWs.readyState ===
      WebSocket.CONNECTING ||
      state.publicWs.readyState ===
      WebSocket.OPEN
    )
  ) {
    return;
  }

  connectPublicWebSocket();
}

/* =========================================================
   GLOBAL ERROR HANDLING
========================================================= */

window.addEventListener(
  "error",
  event => {

    console.error(
      "KRISHWAVE runtime error:",
      event.error ||
      event.message
    );
  }
);

window.addEventListener(
  "unhandledrejection",
  event => {

    console.error(
      "KRISHWAVE promise error:",
      event.reason
    );
  }
);

/* =========================================================
   RESIZE
========================================================= */

window.addEventListener(
  "resize",
  () => {

    renderMarketChart(
      state.selectedMarket
    );
  }
);

/* =========================================================
   PAGE VISIBILITY
========================================================= */

document.addEventListener(
  "visibilitychange",
  () => {

    if (
      !document.hidden
    ) {

      ensurePublicFeed();

      renderSelectedMarket();

      renderGlobalUI();
    }
  }
);

/* =========================================================
   INITIALIZE
========================================================= */

async function initializeKRISHWAVE() {

  if (
    state.initialized
  ) {
    return;
  }

  state.initialized =
    true;

  console.log(
    `%cKRISHWAVE AI BEAST V${APP_VERSION}`,
    "font-weight:bold;font-size:16px"
  );

  loadState();

  state.currentMartingaleStake =
    state.paperStake;

  applyTheme();

  populateMarketSelectors();

  populateStrategySelectors();

  updateTargetDigitVisibility();

  updateAccountModeUI();

  bindSettings();

  bindButtons();

  showTab(
    state.currentTab
  );

  renderSelectedMarket();

  renderGlobalUI();

  startUILoop();

  /*
    Backend health/config.
  */

  await loadBackendConfig();

  /*
    Handle OAuth callback first.
  */

  await handleOAuthCallback();

  /*
    Restore an existing server session.
  */

  if (
    !state.sessionId
  ) {

    restoreSession();
  }

  /*
    If session exists, load account.
    Otherwise start public feed anyway.
  */

  if (
    state.sessionId
  ) {

    const success =
      await loadAccounts();

    if (
      !success
    ) {

      /*
        Even if account authentication
        is unavailable, public market
        intelligence should still work.
      */

      connectPublicWebSocket();
    }

  } else {

    /*
      Public Deriv market feed requires
      no OAuth login.
    */

    connectPublicWebSocket();

    updateConnectionUI(
      "CONNECTING",
      "DERIV LIVE MARKET DATA CONNECTING..."
    );
  }

  setText(
    "versionDisplay",
    `V${APP_VERSION}`
  );

  setText(
    "appVersion",
    `V${APP_VERSION}`
  );

  setText(
    "footerVersion",
    `KRISHWAVE AI BEAST V${APP_VERSION}`
  );

  console.log(
    "KRISHWAVE initialized"
  );
}

/* =========================================================
   GLOBAL FUNCTIONS
   ---------------------------------------------------------
   These are intentionally exposed so existing
   HTML onclick="" handlers continue working.
========================================================= */

window.connectDeriv =
  connectDeriv;

window.selectMarket =
  selectMarket;

window.selectStrategy =
  selectStrategy;

window.selectManualStrategy =
  selectStrategy;

window.selectAccountMode =
  selectAccountMode;

window.toggleTheme =
  toggleTheme;

window.startAIBot =
  startAIBot;

window.stopAIBot =
  stopAIBot;

window.startCircularAI =
  startCircularAI;

window.stopCircularAI =
  stopCircularAI;

window.startManualEngine =
  startManualEngine;

window.stopManualEngine =
  stopManualEngine;

window.executeManualTrade =
  executeManualTrade;

window.placePaperTrade =
  placePaperTrade;

window.clearHistory =
  clearHistory;

window.showTab =
  showTab;

window.scanMarkets =
  scanMarkets;

window.autoSelectStrongestMarket =
  autoSelectStrongestMarket;

/* =========================================================
   START
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeKRISHWAVE,
    {
      once: true
    }
  );

} else {

  initializeKRISHWAVE();
}

/* =========================================================
   END KRISHWAVE V7.3
========================================================= */