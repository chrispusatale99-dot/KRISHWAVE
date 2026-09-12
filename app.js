/* =========================================================
   KRISHWAVE AI BEAST V10.0
   DERIV DEMO TRADING ENGINE
   =========================================================

   DEMO ONLY
   NO PAPER TRADING
   NO REAL-MONEY TRADING

   Architecture:

   GitHub Pages
        |
        +-- Public Deriv WebSocket
        |      |
        |      +-- Live ticks
        |      +-- Digit analysis
        |      +-- Market scanner
        |
        +-- Supabase Edge Function
               |
               +-- OAuth code exchange
               |
               +-- Demo account
               |
               +-- OTP
               |
               +-- Authenticated Deriv WebSocket
                       |
                       +-- Proposal
                       +-- Buy
                       +-- Open contract
                       +-- Actual DEMO result

   ========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const CONFIG = {
  VERSION: "10.0",

  CLIENT_ID: "34nw4IAw4CXiixJLUhBWu",

  REDIRECT_URI:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/",

  SUPABASE_AUTH_FUNCTION:
    "https://jlfgoaipzkwtmjlloaur.supabase.co/functions/v1/deriv-auth",

  DERIV_API:
    "https://api.derivws.com",

  DERIV_OAUTH:
    "https://auth.deriv.com/oauth2/auth",

  PUBLIC_WS:
    "wss://api.derivws.com/trading/v1/options/ws/public",

  MARKETS: [
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
  ],

  STRATEGIES: [
    "MATCHES",
    "DIFFERS",
    "OVER",
    "UNDER",
    "EVEN",
    "ODD"
  ],

  MAX_TICKS: 250,

  MIN_ANALYSIS_TICKS: 20,

  SCAN_TICKS: 60,

  MIN_STAKE: 0.25,

  MAX_STAKE: 100,

  MAX_ACTIVE_TRADES: 10,

  BOT_MIN_CONFIDENCE: 60,

  STRONG_SIGNAL: 75,

  BEAST_SIGNAL: 85,

  /* Circular AI */
  CIRCULAR_ANALYSIS_SECONDS: 10,
  CIRCULAR_PREDICTION_SECONDS: 5,
  CIRCULAR_TRADE_SECONDS: 3,
  CIRCULAR_COOLDOWN_SECONDS: 3,

  /* AI BOT */
  BOT_INTERVAL_MS: 3000,

  /* OAuth */
  OAUTH_SCOPE: "trade",

  STORAGE_HISTORY: "KRISHWAVE_DEMO_HISTORY_V10",
  STORAGE_SETTINGS: "KRISHWAVE_SETTINGS_V10",
  STORAGE_THEME: "KRISHWAVE_THEME_V10",

  /* Safety */
  DEMO_ONLY: true
};


/* =========================================================
   STATE
   ========================================================= */

const state = {

  /* Connection */
  publicWS: null,
  authWS: null,

  publicConnected: false,
  authConnected: false,

  connectingPublic: false,
  connectingAuth: false,

  /* OAuth */
  accessToken: null,
  accountId: null,
  accountCurrency: "USD",
  accountBalance: 0,

  oauthState: null,
  codeVerifier: null,

  /* Markets */
  markets: {},

  selectedAnalysisMarket: "R_10",
  selectedBotMarket: "AUTO",
  selectedCircularMarket: "AUTO",
  selectedManualMarket: "R_10",

  /* Strategies */
  botStrategies: ["MATCHES", "DIFFERS"],

  manualStrategy: "MATCHES",
  circularStrategy: "MATCHES",

  /* Trading */
  activeTrades: {},
  pendingRequests: new Map(),

  tradeSequence: 0,

  /* History */
  history: [],

  /* Statistics */
  stats: {
    total: 0,
    wins: 0,
    losses: 0,
    profit: 0,
    stake: 0
  },

  /* Automation */
  botRunning: false,
  circularRunning: false,

  botTimer: null,
  circularTimer: null,

  circularPhaseTimer: null,

  /* Risk */
  sessionProfit: 0,

  takeProfit: 0,
  stopLoss: 0,

  currentBotStake: 0.25,
  currentCircularStake: 0.25,

  botBaseStake: 0.25,
  circularBaseStake: 0.25,

  martingale: 2,

  /* Chart */
  chartMarket: "R_10",

  /* Toast */
  toastTimer: null,

  /* UI */
  activePage: "analysis",

  /* Initialization */
  initialized: false
};


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function setHTML(id, value) {
  const el = $(id);
  if (el) el.innerHTML = value;
}

function showElement(id) {
  const el = $(id);
  if (el) el.style.display = "";
}

function hideElement(id) {
  const el = $(id);
  if (el) el.style.display = "none";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/* =========================================================
   TOAST
   ========================================================= */

function toast(message, type = "info") {

  const box = $("toast");
  const msg = $("toastMessage");

  if (!box || !msg) {
    console.log(`[${type}] ${message}`);
    return;
  }

  msg.textContent = message;

  box.classList.remove(
    "success",
    "error",
    "warning",
    "info",
    "show"
  );

  box.classList.add(type);
  box.classList.add("show");

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    box.classList.remove("show");
  }, 3500);
}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function setConnectionStatus(
  connected,
  text = connected ? "CONNECTED" : "OFFLINE"
) {

  const dot = $("connectionDot");
  const label = $("connectionText");

  if (dot) {
    dot.classList.toggle("online", connected);
    dot.classList.toggle("offline", !connected);
  }

  if (label) {
    label.textContent = text;
  }
}

function setEngineStatus(text) {

  setText("engineStatusText", text);
  setText("botStatusDash", text);
  setText("circularStatusText", text);
  setText("manualStatusText", text);
}


/* =========================================================
   DEMO MODE SAFETY
   ========================================================= */

function enforceDemoOnly() {

  document.body.dataset.tradingMode = "DEMO";

  setText("modeBadge", "DEMO");

  setText("engineStatusText", "DEMO MODE");

  const realButtonIds = [
    "realTradeBtn",
    "switchRealBtn",
    "realModeBtn",
    "confirmRealBtn"
  ];

  realButtonIds.forEach(id => {

    const el = $(id);

    if (!el) return;

    el.disabled = true;
    el.setAttribute(
      "title",
      "REAL TRADING IS DISABLED"
    );

    el.onclick = event => {
      event.preventDefault();
      event.stopPropagation();

      toast(
        "REAL TRADING IS DISABLED. KRISHWAVE is DEMO ONLY.",
        "warning"
      );
    };
  });

  const realModal = $("realConfirmModal");

  if (realModal) {
    realModal.classList.remove("show", "active");
  }
}


/* =========================================================
   STORAGE
   ========================================================= */

function loadHistory() {

  try {

    const raw =
      localStorage.getItem(CONFIG.STORAGE_HISTORY);

    if (!raw) {
      state.history = [];
      return;
    }

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      state.history = parsed;
    } else {
      state.history = [];
    }

  } catch {

    state.history = [];
  }

  rebuildStats();
}

function saveHistory() {

  try {

    localStorage.setItem(
      CONFIG.STORAGE_HISTORY,
      JSON.stringify(state.history.slice(0, 500))
    );

  } catch (error) {

    console.warn(
      "Could not save DEMO history",
      error
    );
  }
}

function rebuildStats() {

  state.stats = {
    total: 0,
    wins: 0,
    losses: 0,
    profit: 0,
    stake: 0
  };

  for (const trade of state.history) {

    if (!trade) continue;

    state.stats.total++;

    state.stats.stake += number(trade.stake);

    const profit = number(trade.profit);

    state.stats.profit += profit;

    if (trade.result === "WIN") {
      state.stats.wins++;
    }

    if (trade.result === "LOSS") {
      state.stats.losses++;
    }
  }

  updateStatsUI();
}


/* =========================================================
   STATS UI
   ========================================================= */

function updateStatsUI() {

  setText(
    "paperTotal",
    String(state.stats.total)
  );

  setText(
    "paperWins",
    String(state.stats.wins)
  );

  setText(
    "paperLosses",
    String(state.stats.losses)
  );

  const accuracy =
    state.stats.total > 0
      ? (state.stats.wins / state.stats.total) * 100
      : 0;

  setText(
    "paperAccuracy",
    `${accuracy.toFixed(1)}%`
  );

  setText(
    "historyTotalStake",
    state.stats.stake.toFixed(2)
  );

  setText(
    "historyAmountWon",
    state.stats.profit.toFixed(2)
  );

  setText(
    "historyNetProfit",
    state.stats.profit.toFixed(2)
  );

  setText(
    "sessionProfitDisplay",
    state.sessionProfit.toFixed(2)
  );

  setText(
    "totalProfitDisplay",
    state.stats.profit.toFixed(2)
  );
}


/* =========================================================
   MARKET OBJECT
   ========================================================= */

function ensureMarket(symbol) {

  if (!state.markets[symbol]) {

    state.markets[symbol] = {
      symbol,
      ticks: [],
      prices: [],
      digits: [],
      lastPrice: null,
      lastDigit: null,
      updatedAt: 0
    };
  }

  return state.markets[symbol];
}


/* =========================================================
   DIGIT EXTRACTION
   ========================================================= */

function extractLastDigit(price) {

  const text = String(price);

  const clean = text.replace(
    /[^0-9]/g,
    ""
  );

  if (!clean.length) return null;

  return Number(
    clean.charAt(clean.length - 1)
  );
}


/* =========================================================
   TICK ANALYSIS
   ========================================================= */

function analyzeMarket(symbol) {

  const market = ensureMarket(symbol);

  const digits = market.digits.slice(
    -CONFIG.SCAN_TICKS
  );

  if (digits.length < CONFIG.MIN_ANALYSIS_TICKS) {

    return {
      symbol,
      confidence: 0,
      prediction: null,
      strategy: "MATCHES",
      strength: "WAIT",
      even: 0,
      odd: 0,
      over: 0,
      under: 0,
      digitCounts: Array(10).fill(0)
    };
  }

  const counts = Array(10).fill(0);

  for (const digit of digits) {

    if (
      Number.isInteger(digit) &&
      digit >= 0 &&
      digit <= 9
    ) {
      counts[digit]++;
    }
  }

  const total = digits.length;

  let maxDigit = 0;

  for (let i = 1; i <= 9; i++) {

    if (counts[i] > counts[maxDigit]) {
      maxDigit = i;
    }
  }

  const highestCount =
    counts[maxDigit];

  const frequency =
    highestCount / total;

  const evenCount =
    digits.filter(d => d % 2 === 0).length;

  const oddCount =
    total - evenCount;

  const evenPct =
    (evenCount / total) * 100;

  const oddPct =
    (oddCount / total) * 100;

  const overCount =
    digits.filter(d => d >= 5).length;

  const underCount =
    total - overCount;

  const overPct =
    (overCount / total) * 100;

  const underPct =
    (underCount / total) * 100;

  let strategy = "MATCHES";
  let confidence = 50;

  if (evenPct >= 65) {

    strategy = "EVEN";
    confidence = evenPct;

  } else if (oddPct >= 65) {

    strategy = "ODD";
    confidence = oddPct;

  } else if (overPct >= 65) {

    strategy = "OVER";
    confidence = overPct;

  } else if (underPct >= 65) {

    strategy = "UNDER";
    confidence = underPct;

  } else {

    strategy = "MATCHES";

    confidence =
      45 + frequency * 100;
  }

  confidence = clamp(
    confidence,
    0,
    99
  );

  let strength = "WEAK";

  if (confidence >= CONFIG.BEAST_SIGNAL) {
    strength = "BEAST";
  } else if (
    confidence >= CONFIG.STRONG_SIGNAL
  ) {
    strength = "STRONG";
  } else if (
    confidence >= CONFIG.BOT_MIN_CONFIDENCE
  ) {
    strength = "GOOD";
  }

  return {
    symbol,
    confidence,
    prediction: maxDigit,
    strategy,
    strength,
    even: evenPct,
    odd: oddPct,
    over: overPct,
    under: underPct,
    digitCounts: counts,
    sample: total
  };
}


/* =========================================================
   MARKET SCANNER
   ========================================================= */

function scanMarkets() {

  const results = [];

  for (const symbol of CONFIG.MARKETS) {

    const analysis =
      analyzeMarket(symbol);

    results.push(analysis);
  }

  results.sort(
    (a, b) =>
      b.confidence - a.confidence
  );

  return results;
}

function getBestMarket() {

  const results = scanMarkets();

  const valid =
    results.filter(
      item =>
        item.confidence >=
        CONFIG.BOT_MIN_CONFIDENCE
    );

  if (!valid.length) {

    return results[0] || null;
  }

  return valid[0];
}


/* =========================================================
   PUBLIC DERIV WEBSOCKET
   ========================================================= */

function connectPublicWS() {

  if (
    state.publicWS &&
    (
      state.publicWS.readyState ===
      WebSocket.OPEN ||
      state.publicWS.readyState ===
      WebSocket.CONNECTING
    )
  ) {
    return;
  }

  if (state.connectingPublic) return;

  state.connectingPublic = true;

  setConnectionStatus(
    false,
    "CONNECTING"
  );

  try {

    const ws =
      new WebSocket(CONFIG.PUBLIC_WS);

    state.publicWS = ws;

    ws.onopen = () => {

      state.connectingPublic = false;
      state.publicConnected = true;

      setConnectionStatus(
        true,
        "MARKET LIVE"
      );

      setText(
        "dataStatus",
        "LIVE MARKET DATA"
      );

      subscribePublicMarkets();

      toast(
        "Deriv market data connected.",
        "success"
      );
    };

    ws.onmessage = event => {

      try {

        const message =
          JSON.parse(event.data);

        handlePublicMessage(message);

      } catch (error) {

        console.warn(
          "Public WS parse error",
          error
        );
      }
    };

    ws.onerror = error => {

      console.warn(
        "Public WS error",
        error
      );

      state.publicConnected = false;

      setConnectionStatus(
        false,
        "MARKET ERROR"
      );
    };

    ws.onclose = () => {

      state.connectingPublic = false;
      state.publicConnected = false;

      setConnectionStatus(
        false,
        "RECONNECTING"
      );

      setTimeout(
        connectPublicWS,
        4000
      );
    };

  } catch (error) {

    state.connectingPublic = false;

    console.error(
      "Public WS connection failed",
      error
    );

    setTimeout(
      connectPublicWS,
      5000
    );
  }
}


/* =========================================================
   PUBLIC MARKET SUBSCRIPTIONS
   ========================================================= */

function subscribePublicMarkets() {

  if (
    !state.publicWS ||
    state.publicWS.readyState !==
    WebSocket.OPEN
  ) {
    return;
  }

  for (const symbol of CONFIG.MARKETS) {

    ensureMarket(symbol);

    state.publicWS.send(
      JSON.stringify({
        ticks: symbol,
        subscribe: 1
      })
    );
  }
}


/* =========================================================
   PUBLIC MESSAGE HANDLER
   ========================================================= */

function handlePublicMessage(message) {

  if (!message) return;

  if (message.error) {

    console.warn(
      "Deriv public error",
      message.error
    );

    return;
  }

  if (
    message.msg_type !== "tick" ||
    !message.tick
  ) {
    return;
  }

  const tick = message.tick;

  const symbol =
    tick.symbol ||
    tick.underlying_symbol;

  if (!symbol) return;

  const price =
    number(
      tick.quote,
      null
    );

  if (price === null) return;

  const market =
    ensureMarket(symbol);

  const digit =
    extractLastDigit(
      tick.quote
    );

  market.lastPrice = price;
  market.lastDigit = digit;
  market.updatedAt = Date.now();

  market.ticks.push(tick);
  market.prices.push(price);

  if (digit !== null) {
    market.digits.push(digit);
  }

  if (
    market.ticks.length >
    CONFIG.MAX_TICKS
  ) {
    market.ticks.shift();
  }

  if (
    market.prices.length >
    CONFIG.MAX_TICKS
  ) {
    market.prices.shift();
  }

  if (
    market.digits.length >
    CONFIG.MAX_TICKS
  ) {
    market.digits.shift();
  }

  updateLiveUI(symbol);
}


/* =========================================================
   LIVE UI
   ========================================================= */

function updateLiveUI(symbol) {

  const market =
    ensureMarket(symbol);

  if (
    symbol === state.selectedAnalysisMarket
  ) {

    setText(
      "currentLivePrice",
      market.lastPrice !== null
        ? String(market.lastPrice)
        : "--"
    );

    setText(
      "lastDigit",
      market.lastDigit !== null
        ? String(market.lastDigit)
        : "--"
    );

    setText(
      "digitSampleCount",
      String(market.digits.length)
    );

    updateAnalysisUI(symbol);
    drawChart(symbol);
  }

  updateBotMarketUI();
}


/* =========================================================
   ANALYSIS UI
   ========================================================= */

function updateAnalysisUI(symbol) {

  const analysis =
    analyzeMarket(symbol);

  if (!analysis) return;

  setText(
    "analysisConfidence",
    `${Math.round(
      analysis.confidence
    )}%`
  );

  setText(
    "aiPrediction",
    analysis.prediction !== null
      ? String(analysis.prediction)
      : "--"
  );

  setText(
    "aiType",
    analysis.strategy
  );

  setText(
    "analysisMsg",
    analysis.confidence >=
      CONFIG.BEAST_SIGNAL
      ? "BEAST SIGNAL"
      : analysis.confidence >=
        CONFIG.STRONG_SIGNAL
      ? "STRONG SIGNAL"
      : "MARKET ANALYSIS"
  );

  setText(
    "aiMarket",
    symbol
  );

  updateDigitGrid(
    analysis.digitCounts
  );

  updateAIStatus(
    analysis
  );
}


/* =========================================================
   DIGIT GRID
   ========================================================= */

function updateDigitGrid(counts) {

  const grid =
    $("digitStatsGrid");

  if (!grid) return;

  const total =
    counts.reduce(
      (a, b) => a + b,
      0
    );

  grid.innerHTML = "";

  counts.forEach(
    (count, digit) => {

      const percentage =
        total > 0
          ? (count / total) * 100
          : 0;

      const card =
        document.createElement(
          "div"
        );

      card.className =
        "digit-stat";

      card.innerHTML = `
        <div class="digit-stat-number">
          ${digit}
        </div>
        <div class="digit-stat-count">
          ${count}
        </div>
        <div class="digit-stat-percent">
          ${percentage.toFixed(1)}%
        </div>
      `;

      grid.appendChild(card);
    }
  );
}


/* =========================================================
   AI STATUS
   ========================================================= */

function updateAIStatus(analysis) {

  if (!analysis) return;

  const confidence =
    Math.round(
      analysis.confidence
    );

  setText(
    "aiStatus",
    `${analysis.strength} • ${confidence}%`
  );

  setText(
    "aiCirclePrediction",
    analysis.prediction !== null
      ? `DIGIT ${analysis.prediction}`
      : "--"
  );

  setText(
    "aiCircleLabel",
    analysis.strategy
  );
}


/* =========================================================
   CHART
   ========================================================= */

function drawChart(symbol) {

  const canvas =
    $("priceChartCanvas");

  if (!canvas) return;

  const ctx =
    canvas.getContext("2d");

  if (!ctx) return;

  const market =
    ensureMarket(symbol);

  const prices =
    market.prices.slice(-80);

  if (prices.length < 2) {

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    return;
  }

  const rect =
    canvas.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio || 1;

  canvas.width =
    Math.max(
      1,
      Math.floor(
        rect.width * dpr
      )
    );

  canvas.height =
    Math.max(
      1,
      Math.floor(
        rect.height * dpr
      )
    );

  ctx.scale(dpr, dpr);

  const width =
    rect.width;

  const height =
    rect.height;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const min =
    Math.min(...prices);

  const max =
    Math.max(...prices);

  const range =
    max - min || 1;

  ctx.beginPath();

  prices.forEach(
    (price, index) => {

      const x =
        (index /
          (prices.length - 1)) *
        width;

      const y =
        height -
        ((price - min) / range) *
          (height - 10) -
        5;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  );

  ctx.strokeStyle =
    "#00e5ff";

  ctx.lineWidth = 2;

  ctx.stroke();
}


/* =========================================================
   AUTHENTICATED DERIV REST
   ========================================================= */

async function derivREST(
  path,
  options = {}
) {

  if (!state.accessToken) {
    throw new Error(
      "DEMO account is not connected."
    );
  }

  const headers = {
    Authorization:
      `Bearer ${state.accessToken}`,
    ...(options.headers || {})
  };

  const response =
    await fetch(
      CONFIG.DERIV_API + path,
      {
        ...options,
        headers
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {

    throw new Error(
      `Invalid Deriv response (${response.status})`
    );
  }

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
      data?.message ||
      `Deriv API error ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   FETCH DEMO ACCOUNTS
   ========================================================= */

async function getAccounts() {

  const result =
    await derivREST(
      "/trading/v1/options/accounts"
    );

  let accounts = [];

  if (Array.isArray(result)) {
    accounts = result;
  }

  if (Array.isArray(result?.data)) {
    accounts = result.data;
  }

  if (
    Array.isArray(
      result?.data?.accounts
    )
  ) {
    accounts =
      result.data.accounts;
  }

  if (
    Array.isArray(
      result?.accounts
    )
  ) {
    accounts =
      result.accounts;
  }

  return accounts;
}


/* =========================================================
   SELECT DEMO ACCOUNT
   ========================================================= */

function selectDemoAccount(accounts) {

  if (!Array.isArray(accounts)) {
    return null;
  }

  const demo =
    accounts.find(account => {

      const type =
        String(
          account?.account_type ||
          account?.type ||
          ""
        ).toLowerCase();

      return (
        type === "demo" ||
        account?.is_demo === true
      );
    });

  if (demo) return demo;

  const vrt =
    accounts.find(account =>
      String(
        account?.loginid ||
        account?.account_id ||
        account?.id ||
        ""
      ).startsWith("VRT")
    );

  return vrt || null;
}


/* =========================================================
   GET DEMO OTP / WEBSOCKET URL
   ========================================================= */

async function getDemoOTP(
  accountId
) {

  const result =
    await derivREST(
      `/trading/v1/options/accounts/${encodeURIComponent(
        accountId
      )}/otp`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        }
      }
    );

  return result;
}


/* =========================================================
   OAUTH HELPERS
   ========================================================= */

function randomString(length = 64) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const bytes =
    new Uint8Array(length);

  crypto.getRandomValues(bytes);

  let output = "";

  for (let i = 0; i < bytes.length; i++) {
    output +=
      chars[
        bytes[i] % chars.length
      ];
  }

  return output;
}

function base64UrlEncode(buffer) {

  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(
      byte
    );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256(value) {

  const data =
    new TextEncoder().encode(
      value
    );

  return crypto.subtle.digest(
    "SHA-256",
    data
  );
}


/* =========================================================
   START OAUTH
   ========================================================= */

async function startOAuth() {

  try {

    const state =
      randomString(32);

    const verifier =
      randomString(64);

    const challenge =
      base64UrlEncode(
        await sha256(verifier)
      );

    sessionStorage.setItem(
      "KRISHWAVE_OAUTH_STATE",
      state
    );

    sessionStorage.setItem(
      "KRISHWAVE_OAUTH_VERIFIER",
      verifier
    );

    const params =
      new URLSearchParams({

        response_type: "code",

        client_id:
          CONFIG.CLIENT_ID,

        redirect_uri:
          CONFIG.REDIRECT_URI,

        scope:
          CONFIG.OAUTH_SCOPE,

        state,

        code_challenge:
          challenge,

        code_challenge_method:
          "S256"
      });

    window.location.href =
      `${CONFIG.DERIV_OAUTH}?${params.toString()}`;

  } catch (error) {

    console.error(
      "OAuth start error",
      error
    );

    toast(
      "Could not start Deriv login.",
      "error"
    );
  }
}


/* =========================================================
   EXCHANGE OAUTH CODE
   ========================================================= */

async function exchangeOAuthCode(
  code,
  verifier
) {

  const response =
    await fetch(
      CONFIG.SUPABASE_AUTH_FUNCTION,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          action:
            "exchange_code",

          code,

          code_verifier:
            verifier,

          redirect_uri:
            CONFIG.REDIRECT_URI
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok || !data.ok) {

    throw new Error(
      data?.error ||
      "OAuth exchange failed."
    );
  }

  if (!data.access_token) {

    throw new Error(
      "Deriv did not return an access token."
    );
  }

  return data;
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

  const error =
    params.get("error");

  if (error) {

    toast(
      `Deriv login failed: ${error}`,
      "error"
    );

    cleanOAuthURL();

    return;
  }

  if (!code) {
    return;
  }

  const savedState =
    sessionStorage.getItem(
      "KRISHWAVE_OAUTH_STATE"
    );

  const verifier =
    sessionStorage.getItem(
      "KRISHWAVE_OAUTH_VERIFIER"
    );

  if (
    !savedState ||
    !verifier ||
    returnedState !== savedState
  ) {

    toast(
      "OAuth security check failed.",
      "error"
    );

    cleanOAuthURL();

    return;
  }

  try {

    setConnectionStatus(
      false,
      "AUTHENTICATING"
    );

    toast(
      "Connecting your Deriv DEMO account...",
      "info"
    );

    const token =
      await exchangeOAuthCode(
        code,
        verifier
      );

    state.accessToken =
      token.access_token;

    /*
      Keep token only for this browser session.
      Never put the access token in localStorage.
    */

    sessionStorage.setItem(
      "KRISHWAVE_DERIV_ACCESS_TOKEN",
      state.accessToken
    );

    cleanOAuthURL();

    await connectDemoAccount();

  } catch (error) {

    console.error(
      "OAuth callback error",
      error
    );

    toast(
      error.message ||
      "Deriv connection failed.",
      "error"
    );

    setConnectionStatus(
      false,
      "AUTH ERROR"
    );
  }
}


/* =========================================================
   CLEAN OAUTH URL
   ========================================================= */

function cleanOAuthURL() {

  const clean =
    `${window.location.origin}${window.location.pathname}`;

  window.history.replaceState(
    {},
    document.title,
    clean
  );

  sessionStorage.removeItem(
    "KRISHWAVE_OAUTH_STATE"
  );

  sessionStorage.removeItem(
    "KRISHWAVE_OAUTH_VERIFIER"
  );
}


/* =========================================================
   RESTORE SESSION TOKEN
   ========================================================= */

function restoreSession() {

  const token =
    sessionStorage.getItem(
      "KRISHWAVE_DERIV_ACCESS_TOKEN"
    );

  if (token) {
    state.accessToken = token;
  }
}


/* =========================================================
   CONNECT DEMO ACCOUNT
   ========================================================= */

async function connectDemoAccount() {

  if (!state.accessToken) {

    throw new Error(
      "No Deriv access token."
    );
  }

  setConnectionStatus(
    false,
    "GETTING DEMO ACCOUNT"
  );

  const accounts =
    await getAccounts();

  const demo =
    selectDemoAccount(accounts);

  if (!demo) {

    throw new Error(
      "No Deriv DEMO account was found."
    );
  }

  const accountId =
    demo.loginid ||
    demo.account_id ||
    demo.id;

  if (!accountId) {

    throw new Error(
      "Deriv DEMO account ID was not found."
    );
  }

  state.accountId =
    accountId;

  state.accountCurrency =
    demo.currency ||
    demo.account_currency ||
    "USD";

  setText(
    "accountId",
    state.accountId
  );

  setText(
    "currency",
    state.accountCurrency
  );

  setConnectionStatus(
    false,
    "GETTING DEMO OTP"
  );

  const otpResult =
    await getDemoOTP(
      state.accountId
    );

  const wsUrl =
    otpResult?.data?.url ||
    otpResult?.url ||
    otpResult?.data?.ws_url;

  if (!wsUrl) {

    throw new Error(
      "Deriv did not return a DEMO WebSocket URL."
    );
  }

  /*
    Safety check:
    never allow the application to connect
    to the real trading WebSocket.
  */

  if (
    !wsUrl.includes("/demo")
  ) {

    throw new Error(
      "Safety blocked: returned WebSocket is not DEMO."
    );
  }

  connectAuthenticatedWS(
    wsUrl
  );
}


/* =========================================================
   AUTHENTICATED WEBSOCKET
   ========================================================= */

function connectAuthenticatedWS(
  wsUrl
) {

  if (state.authWS) {

    try {
      state.authWS.close();
    } catch {}
  }

  state.connectingAuth = true;

  setConnectionStatus(
    false,
    "CONNECTING DEMO"
  );

  const ws =
    new WebSocket(wsUrl);

  state.authWS = ws;

  ws.onopen = () => {

    state.connectingAuth = false;
    state.authConnected = true;

    setConnectionStatus(
      true,
      "DEMO LIVE"
    );

    setText(
      "modeBadge",
      "DEMO"
    );

    setText(
      "engineStatusText",
      "DEMO MODE"
    );

    toast(
      `DERIV DEMO CONNECTED • ${state.accountId}`,
      "success"
    );

    subscribeBalance();

    setEngineStatus(
      "DEMO READY"
    );
  };

  ws.onmessage = event => {

    try {

      const message =
        JSON.parse(event.data);

      handleAuthMessage(
        message
      );

    } catch (error) {

      console.warn(
        "Auth WS parse error",
        error
      );
    }
  };

  ws.onerror = error => {

    console.warn(
      "Auth WS error",
      error
    );

    state.authConnected = false;

    setConnectionStatus(
      false,
      "DEMO ERROR"
    );
  };

  ws.onclose = () => {

    state.authConnected = false;
    state.connectingAuth = false;

    setConnectionStatus(
      false,
      "DEMO DISCONNECTED"
    );

    setEngineStatus(
      "DEMO OFFLINE"
    );
  };
}


/* =========================================================
   AUTH WS REQUEST
   ========================================================= */

function authRequest(
  payload,
  timeout = 15000
) {

  return new Promise(
    (resolve, reject) => {

      if (
        !state.authWS ||
        state.authWS.readyState !==
        WebSocket.OPEN
      ) {

        reject(
          new Error(
            "DEMO WebSocket is not connected."
          )
        );

        return;
      }

      const reqId =
        ++state.tradeSequence;

      const message = {
        ...payload,
        req_id: reqId
      };

      const timer =
        setTimeout(() => {

          state.pendingRequests.delete(
            reqId
          );

          reject(
            new Error(
              "Deriv request timed out."
            )
          );

        }, timeout);

      state.pendingRequests.set(
        reqId,
        {
          resolve,
          reject,
          timer
        }
      );

      try {

        state.authWS.send(
          JSON.stringify(message)
        );

      } catch (error) {

        clearTimeout(timer);

        state.pendingRequests.delete(
          reqId
        );

        reject(error);
      }
    }
  );
}


/* =========================================================
   AUTH MESSAGE HANDLER
   ========================================================= */

function handleAuthMessage(
  message
) {

  if (!message) return;

  if (message.req_id) {

    const pending =
      state.pendingRequests.get(
        message.req_id
      );

    if (pending) {

      clearTimeout(
        pending.timer
      );

      state.pendingRequests.delete(
        message.req_id
      );

      if (message.error) {

        pending.reject(
          new Error(
            message.error.message ||
            "Deriv request failed."
          )
        );

      } else {

        pending.resolve(
          message
        );
      }
    }
  }

  if (message.error) {

    console.warn(
      "Deriv authenticated error",
      message.error
    );
  }

  if (
    message.msg_type ===
    "balance"
  ) {

    handleBalance(
      message
    );
  }

  if (
    message.msg_type ===
    "proposal"
  ) {

    handleProposal(
      message
    );
  }

  if (
    message.msg_type ===
    "buy"
  ) {

    handleBuy(
      message
    );
  }

  if (
    message.msg_type ===
    "proposal_open_contract"
  ) {

    handleOpenContract(
      message
    );
  }
}


/* =========================================================
   BALANCE SUBSCRIPTION
   ========================================================= */

function subscribeBalance() {

  if (
    !state.authWS ||
    state.authWS.readyState !==
    WebSocket.OPEN
  ) {
    return;
  }

  state.authWS.send(
    JSON.stringify({
      balance: 1,
      subscribe: 1
    })
  );
}


/* =========================================================
   BALANCE HANDLER
   ========================================================= */

function handleBalance(message) {

  const balance =
    message?.balance;

  if (!balance) return;

  const value =
    number(
      balance.balance ??
      balance.amount ??
      balance,
      0
    );

  state.accountBalance =
    value;

  state.accountCurrency =
    balance.currency ||
    state.accountCurrency;

  setText(
    "balanceDisplay",
    `${state.accountCurrency} ${value.toFixed(2)}`
  );

  setText(
    "currency",
    state.accountCurrency
  );
}


/* =========================================================
   CONTRACT TYPE MAPPING
   ========================================================= */

function contractTypeFor(
  strategy
) {

  switch (
    String(strategy).toUpperCase()
  ) {

    case "MATCHES":
      return "DIGITMATCH";

    case "DIFFERS":
      return "DIGITDIFF";

    case "OVER":
      return "DIGITOVER";

    case "UNDER":
      return "DIGITUNDER";

    case "EVEN":
      return "DIGITEVEN";

    case "ODD":
      return "DIGITODD";

    default:
      throw new Error(
        `Unsupported strategy: ${strategy}`
      );
  }
}


/* =========================================================
   BARRIER
   ========================================================= */

function barrierFor(
  strategy,
  prediction
) {

  switch (
    String(strategy).toUpperCase()
  ) {

    case "MATCHES":
      return clamp(
        Math.round(
          number(prediction, 5)
        ),
        0,
        9
      );

    case "DIFFERS":
      return clamp(
        Math.round(
          number(prediction, 5)
        ),
        0,
        9
      );

    /*
      OVER means final digit > barrier.
      UNDER means final digit < barrier.

      4 / 5 gives a clean split.
    */

    case "OVER":
      return 4;

    case "UNDER":
      return 5;

    case "EVEN":
    case "ODD":
      return undefined;

    default:
      return undefined;
  }
}


/* =========================================================
   BUILD PROPOSAL
   ========================================================= */

function buildProposal(
  market,
  strategy,
  stake,
  prediction
) {

  const contractType =
    contractTypeFor(
      strategy
    );

  const proposal = {

    proposal: 1,

    amount: number(
      stake,
      CONFIG.MIN_STAKE
    ),

    basis: "stake",

    contract_type:
      contractType,

    currency:
      state.accountCurrency ||
      "USD",

    underlying_symbol:
      market,

    duration: 1,

    duration_unit: "t",

    subscribe: 1
  };

  const barrier =
    barrierFor(
      strategy,
      prediction
    );

  if (
    barrier !== undefined
  ) {
    proposal.barrier =
      String(barrier);
  }

  return proposal;
}


/* =========================================================
   ACTUAL DEMO TRADE
   ========================================================= */

async function executeDemoTrade({
  market,
  strategy,
  stake,
  prediction,
  source = "MANUAL"
}) {

  if (!CONFIG.DEMO_ONLY) {

    throw new Error(
      "Trading safety configuration invalid."
    );
  }

  if (!state.authConnected) {

    throw new Error(
      "Connect your Deriv DEMO account first."
    );
  }

  if (
    Object.keys(
      state.activeTrades
    ).length >=
    CONFIG.MAX_ACTIVE_TRADES
  ) {

    throw new Error(
      "Maximum active DEMO trades reached."
    );
  }

  const amount =
    clamp(
      number(
        stake,
        CONFIG.MIN_STAKE
      ),
      CONFIG.MIN_STAKE,
      CONFIG.MAX_STAKE
    );

  if (
    state.accountBalance < amount
  ) {

    throw new Error(
      "Insufficient DEMO balance."
    );
  }

  const cleanStrategy =
    String(strategy).toUpperCase();

  const proposalRequest =
    buildProposal(
      market,
      cleanStrategy,
      amount,
      prediction
    );

  toast(
    `Requesting ${cleanStrategy} proposal on ${market}...`,
    "info"
  );

  const proposalResponse =
    await authRequest(
      proposalRequest,
      15000
    );

  if (
    proposalResponse.error
  ) {

    throw new Error(
      proposalResponse.error.message
    );
  }

  const proposal =
    proposalResponse.proposal;

  if (!proposal) {

    throw new Error(
      "Deriv did not return a proposal."
    );
  }

  const proposalId =
    proposal.id ||
    proposal.proposal_id;

  const askPrice =
    number(
      proposal.ask_price ??
      proposal.display_value ??
      amount,
      amount
    );

  if (!proposalId) {

    throw new Error(
      "Proposal ID missing."
    );
  }

  const buyResponse =
    await authRequest(
      {
        buy: proposalId,
        price: askPrice
      },
      15000
    );

  if (
    buyResponse.error
  ) {

    throw new Error(
      buyResponse.error.message
    );
  }

  const buy =
    buyResponse.buy;

  if (!buy) {

    throw new Error(
      "Deriv did not return a buy confirmation."
    );
  }

  const contractId =
    buy.contract_id;

  if (!contractId) {

    throw new Error(
      "Contract ID missing."
    );
  }

  const tradeId =
    `KW-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  const trade = {

    id: tradeId,

    contractId,

    market,

    strategy:
      cleanStrategy,

    prediction:
      prediction ?? null,

    stake:
      amount,

    askPrice,

    payout:
      number(
        proposal.payout,
        0
      ),

    source,

    openedAt:
      Date.now(),

    status:
      "OPEN",

    result:
      null,

    profit:
      0
  };

  state.activeTrades[
    contractId
  ] = trade;

  renderActiveTrades();

  /*
    Subscribe to actual contract.
  */

  if (
    state.authWS &&
    state.authWS.readyState ===
      WebSocket.OPEN
  ) {

    state.authWS.send(
      JSON.stringify({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1
      })
    );
  }

  toast(
    `DEMO trade opened • ${cleanStrategy} • ${market}`,
    "success"
  );

  return trade;
}


/* =========================================================
   PROPOSAL HANDLER
   ========================================================= */

function handleProposal(message) {
  /*
    Proposal responses are primarily consumed by
    authRequest(). This function is intentionally
    available for diagnostics and future UI.
  */

  if (message?.proposal) {

    console.log(
      "Proposal received",
      message.proposal
    );
  }
}


/* =========================================================
   BUY HANDLER
   ========================================================= */

function handleBuy(message) {

  if (message?.buy) {

    console.log(
      "DEMO contract bought",
      message.buy.contract_id
    );
  }
}


/* =========================================================
   OPEN CONTRACT HANDLER
   ========================================================= */

function handleOpenContract(
  message
) {

  const contract =
    message?.proposal_open_contract;

  if (!contract) return;

  const contractId =
    contract.contract_id;

  if (!contractId) return;

  const trade =
    state.activeTrades[
      contractId
    ];

  if (!trade) return;

  trade.status =
    contract.is_sold
      ? "CLOSED"
      : "OPEN";

  if (
    contract.entry_spot !== undefined
  ) {
    trade.entrySpot =
      contract.entry_spot;
  }

  if (
    contract.exit_spot !== undefined
  ) {
    trade.exitSpot =
      contract.exit_spot;
  }

  if (
    contract.exit_spot_time !== undefined
  ) {
    trade.exitTime =
      contract.exit_spot_time;
  }

  if (
    contract.payout !== undefined
  ) {
    trade.payout =
      number(
        contract.payout,
        trade.payout
      );
  }

  if (
    contract.profit !== undefined
  ) {
    trade.profit =
      number(
        contract.profit,
        0
      );
  }

  if (
    contract.status
  ) {
    trade.contractStatus =
      contract.status;
  }

  renderActiveTrades();

  /*
    A completed one-tick contract will normally
    arrive with is_sold = 1.
  */

  if (
    contract.is_sold ||
    String(
      contract.status || ""
    ).toLowerCase() === "sold"
  ) {

    settleTrade(
      trade,
      contract
    );
  }
}


/* =========================================================
   SETTLE ACTUAL DEMO TRADE
   ========================================================= */

function settleTrade(
  trade,
  contract
) {

  if (
    trade.result
  ) {
    return;
  }

  const profit =
    number(
      contract?.profit ??
      trade.profit,
      0
    );

  trade.profit =
    profit;

  trade.result =
    profit > 0
      ? "WIN"
      : "LOSS";

  trade.status =
    "CLOSED";

  trade.closedAt =
    Date.now();

  state.history.unshift(
    {
      ...trade
    }
  );

  delete state.activeTrades[
    trade.contractId
  ];

  state.stats.total++;

  state.stats.stake +=
    number(trade.stake);

  state.stats.profit +=
    profit;

  if (profit > 0) {

    state.stats.wins++;

  } else {

    state.stats.losses++;
  }

  state.sessionProfit +=
    profit;

  updateStatsUI();

  saveHistory();

  renderHistory();
  renderActiveTrades();

  if (profit > 0) {

    toast(
      `DEMO WIN • +${profit.toFixed(2)} ${state.accountCurrency}`,
      "success"
    );

  } else {

    toast(
      `DEMO LOSS • ${profit.toFixed(2)} ${state.accountCurrency}`,
      "error"
    );
  }

  handleAutomationAfterResult(
    trade
  );
}


/* =========================================================
   AUTOMATION RESULT HANDLER
   ========================================================= */

function handleAutomationAfterResult(
  trade
) {

  const profit =
    number(
      trade.profit
    );

  /*
    Martingale applies only to the
    next automated trade after an
    actual DEMO loss.
  */

  if (
    trade.source === "AI BOT"
  ) {

    if (profit < 0) {

      state.currentBotStake =
        clamp(
          state.currentBotStake *
            state.martingale,
          CONFIG.MIN_STAKE,
          CONFIG.MAX_STAKE
        );

    } else {

      state.currentBotStake =
        state.botBaseStake;
    }
  }

  if (
    trade.source === "CIRCULAR AI"
  ) {

    if (profit < 0) {

      state.currentCircularStake =
        clamp(
          state.currentCircularStake *
            state.martingale,
          CONFIG.MIN_STAKE,
          CONFIG.MAX_STAKE
        );

    } else {

      state.currentCircularStake =
        state.circularBaseStake;
    }
  }

  checkRiskLimits();
}


/* =========================================================
   RISK LIMITS
   ========================================================= */

function checkRiskLimits() {

  if (
    state.takeProfit > 0 &&
    state.sessionProfit >=
      state.takeProfit
  ) {

    stopAllAutomation();

    toast(
      `TAKE PROFIT reached: ${state.sessionProfit.toFixed(2)}`,
      "success"
    );

    return;
  }

  if (
    state.stopLoss > 0 &&
    state.sessionProfit <=
      -Math.abs(state.stopLoss)
  ) {

    stopAllAutomation();

    toast(
      `STOP LOSS reached: ${state.sessionProfit.toFixed(2)}`,
      "warning"
    );
  }
}


/* =========================================================
   ACTIVE TRADE UI
   ========================================================= */

function renderActiveTrades() {

  const container =
    $("activeTradesList");

  if (!container) return;

  const trades =
    Object.values(
      state.activeTrades
    );

  setText(
    "activeTradeCount",
    String(trades.length)
  );

  if (!trades.length) {

    container.innerHTML =
      `<div class="empty-state">
        No active DEMO trades
      </div>`;

    return;
  }

  container.innerHTML =
    trades.map(trade => {

      return `
        <div class="trade-card">
          <div>
            <strong>${trade.market}</strong>
            <div>${trade.strategy}</div>
          </div>

          <div>
            <strong>
              ${trade.stake.toFixed(2)}
              ${state.accountCurrency}
            </strong>

            <div>
              ${trade.status}
            </div>
          </div>
        </div>
      `;

    }).join("");
}


/* =========================================================
   HISTORY UI
   ========================================================= */

function renderHistory() {

  const container =
    $("historyCardsList");

  if (!container) return;

  if (!state.history.length) {

    container.innerHTML =
      `<div class="empty-state">
        No DEMO trades yet.
      </div>`;

    return;
  }

  container.innerHTML =
    state.history
      .slice(0, 100)
      .map(trade => {

        const win =
          trade.result === "WIN";

        return `
          <div class="history-card">

            <div class="history-main">

              <strong>
                ${trade.market}
              </strong>

              <span>
                ${trade.strategy}
              </span>

            </div>

            <div class="history-result">

              <strong>
                ${win ? "WIN" : "LOSS"}
              </strong>

              <span>
                ${trade.profit >= 0 ? "+" : ""}
                ${number(trade.profit).toFixed(2)}
                ${state.accountCurrency}
              </span>

            </div>

          </div>
        `;

      })
      .join("");
}


/* =========================================================
   FORM VALUES
   ========================================================= */

function readNumberInput(
  id,
  fallback
) {

  const el = $(id);

  if (!el) return fallback;

  return number(
    el.value,
    fallback
  );
}

function syncTradingSettings() {

  const botStake =
    clamp(
      readNumberInput(
        "stakeInput",
        CONFIG.MIN_STAKE
      ),
      CONFIG.MIN_STAKE,
      CONFIG.MAX_STAKE
    );

  const circularStake =
    clamp(
      readNumberInput(
        "circularStakeInput",
        CONFIG.MIN_STAKE
      ),
      CONFIG.MIN_STAKE,
      CONFIG.MAX_STAKE
    );

  state.botBaseStake =
    botStake;

  state.currentBotStake =
    botStake;

  state.circularBaseStake =
    circularStake;

  state.currentCircularStake =
    circularStake;

  state.takeProfit =
    Math.max(
      0,
      readNumberInput(
        "takeProfitInput",
        0
      )
    );

  state.stopLoss =
    Math.max(
      0,
      readNumberInput(
        "stopLossInput",
        0
      )
    );

  state.martingale =
    clamp(
      readNumberInput(
        "martingaleInput",
        2
      ),
      1,
      5
    );

  saveSettings();
}


/* =========================================================
   SETTINGS STORAGE
   ========================================================= */

function saveSettings() {

  try {

    localStorage.setItem(
      CONFIG.STORAGE_SETTINGS,
      JSON.stringify({

        botBaseStake:
          state.botBaseStake,

        circularBaseStake:
          state.circularBaseStake,

        takeProfit:
          state.takeProfit,

        stopLoss:
          state.stopLoss,

        martingale:
          state.martingale
      })
    );

  } catch {}
}

function loadSettings() {

  try {

    const raw =
      localStorage.getItem(
        CONFIG.STORAGE_SETTINGS
      );

    if (!raw) return;

    const settings =
      JSON.parse(raw);

    if (
      settings.botBaseStake
    ) {

      state.botBaseStake =
        number(
          settings.botBaseStake,
          CONFIG.MIN_STAKE
        );

      state.currentBotStake =
        state.botBaseStake;
    }

    if (
      settings.circularBaseStake
    ) {

      state.circularBaseStake =
        number(
          settings.circularBaseStake,
          CONFIG.MIN_STAKE
        );

      state.currentCircularStake =
        state.circularBaseStake;
    }

    state.takeProfit =
      number(
        settings.takeProfit,
        0
      );

    state.stopLoss =
      number(
        settings.stopLoss,
        0
      );

    state.martingale =
      number(
        settings.martingale,
        2
      );

  } catch {}
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

  if (
    !state.authConnected
  ) {

    toast(
      "Connect your Deriv DEMO account first.",
      "warning"
    );

    return;
  }

  syncTradingSettings();

  state.botRunning =
    true;

  setText(
    "startBotBtn",
    "STOP AI BOT"
  );

  setEngineStatus(
    "AI BOT RUNNING"
  );

  toast(
    "AI BOT started in DEMO mode.",
    "success"
  );

  runBotCycle();
}

function stopAIBot() {

  state.botRunning =
    false;

  if (state.botTimer) {

    clearTimeout(
      state.botTimer
    );

    state.botTimer =
      null;
  }

  setText(
    "startBotBtn",
    "START AI BOT"
  );

  setEngineStatus(
    "DEMO READY"
  );
}

async function runBotCycle() {

  if (!state.botRunning) {
    return;
  }

  try {

    const best =
      state.selectedBotMarket ===
      "AUTO"
        ? getBestMarket()
        : analyzeMarket(
            state.selectedBotMarket
          );

    if (!best) {

      scheduleBotCycle();
      return;
    }

    setText(
      "botSelectedMarket",
      best.symbol
    );

    setText(
      "botScore",
      `${Math.round(best.confidence)}/100`
    );

    setText(
      "aiPredictionLarge",
      best.prediction ??
      "--"
    );

    setText(
      "predictionConfidence",
      `${Math.round(best.confidence)}%`
    );

    const strategies =
      state.botStrategies.length
        ? state.botStrategies
        : [best.strategy];

    let strategy =
      best.strategy;

    if (
      !strategies.includes(
        strategy
      )
    ) {

      strategy =
        strategies[0];
    }

    if (
      best.confidence >=
      CONFIG.BOT_MIN_CONFIDENCE
    ) {

      await executeDemoTrade({

        market:
          best.symbol,

        strategy,

        stake:
          state.currentBotStake,

        prediction:
          best.prediction,

        source:
          "AI BOT"
      });

    } else {

      setText(
        "botStatusDash",
        "WAITING FOR SIGNAL"
      );
    }

  } catch (error) {

    console.error(
      "AI Bot error",
      error
    );

    toast(
      error.message ||
      "AI Bot trade failed.",
      "error"
    );
  }

  scheduleBotCycle();
}

function scheduleBotCycle() {

  if (!state.botRunning) {
    return;
  }

  clearTimeout(
    state.botTimer
  );

  state.botTimer =
    setTimeout(
      runBotCycle,
      CONFIG.BOT_INTERVAL_MS
    );
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

  if (
    !state.authConnected
  ) {

    toast(
      "Connect your Deriv DEMO account first.",
      "warning"
    );

    return;
  }

  syncTradingSettings();

  state.circularRunning =
    true;

  setText(
    "startCircularTradeBtn",
    "STOP CIRCULAR AI"
  );

  setEngineStatus(
    "CIRCULAR AI RUNNING"
  );

  toast(
    "Circular AI started.",
    "success"
  );

  runCircularCycle();
}

function stopCircularAI() {

  state.circularRunning =
    false;

  if (state.circularTimer) {

    clearTimeout(
      state.circularTimer
    );

    state.circularTimer =
      null;
  }

  if (state.circularPhaseTimer) {

    clearInterval(
      state.circularPhaseTimer
    );

    state.circularPhaseTimer =
      null;
  }

  setText(
    "startCircularTradeBtn",
    "START CIRCULAR AI"
  );

  setText(
    "aiCircleStatus",
    "STOPPED"
  );

  setEngineStatus(
    "DEMO READY"
  );
}


/* =========================================================
   CIRCULAR CYCLE
   ========================================================= */

async function runCircularCycle() {

  if (
    !state.circularRunning
  ) {
    return;
  }

  const symbol =
    state.selectedCircularMarket ===
    "AUTO"
      ? (
          getBestMarket()?.symbol ||
          "R_10"
        )
      : state.selectedCircularMarket;

  const analysis =
    analyzeMarket(symbol);

  setText(
    "aiMarket",
    symbol
  );

  setText(
    "circularStatusText",
    "ANALYSIS"
  );

  await circularCountdown(
    CONFIG.CIRCULAR_ANALYSIS_SECONDS,
    "ANALYSIS",
    "cycleAnalysis"
  );

  if (
    !state.circularRunning
  ) {
    return;
  }

  const updated =
    analyzeMarket(symbol);

  setText(
    "aiCirclePrediction",
    updated.prediction !== null
      ? `DIGIT ${updated.prediction}`
      : "--"
  );

  setText(
    "aiPrediction",
    updated.prediction ??
    "--"
  );

  setText(
    "analysisConfidence",
    `${Math.round(
      updated.confidence
    )}%`
  );

  setText(
    "circularStatusText",
    "PREDICTION"
  );

  await circularCountdown(
    CONFIG.CIRCULAR_PREDICTION_SECONDS,
    "PREDICTION",
    "cycleAnalysis"
  );

  if (
    !state.circularRunning
  ) {
    return;
  }

  setText(
    "circularStatusText",
    "TRADE NOW"
  );

  setText(
    "cycleTrade",
    "TRADE NOW"
  );

  /*
    Enter trade window and place one
    actual DEMO trade immediately.
  */

  try {

    if (
      updated.confidence >=
      CONFIG.BOT_MIN_CONFIDENCE
    ) {

      const strategy =
        state.circularStrategy ||
        updated.strategy;

      await executeDemoTrade({

        market:
          symbol,

        strategy,

        stake:
          state.currentCircularStake,

        prediction:
          updated.prediction,

        source:
          "CIRCULAR AI"
      });

    } else {

      toast(
        "Circular AI skipped: confidence too low.",
        "warning"
      );
    }

  } catch (error) {

    console.error(
      "Circular trade error",
      error
    );

    toast(
      error.message,
      "error"
    );
  }

  await circularCountdown(
    CONFIG.CIRCULAR_TRADE_SECONDS,
    "TRADE WINDOW",
    "cycleTrade"
  );

  if (
    !state.circularRunning
  ) {
    return;
  }

  setText(
    "circularStatusText",
    "COOLDOWN"
  );

  await circularCountdown(
    CONFIG.CIRCULAR_COOLDOWN_SECONDS,
    "COOLDOWN",
    "cycleCooldown"
  );

  if (
    !state.circularRunning
  ) {
    return;
  }

  runCircularCycle();
}


/* =========================================================
   CIRCULAR COUNTDOWN
   ========================================================= */

function circularCountdown(
  seconds,
  phase,
  elementId
) {

  return new Promise(
    resolve => {

      let remaining =
        seconds;

      setText(
        elementId,
        `${phase} ${remaining}s`
      );

      setText(
        "aiCircleTimer",
        String(remaining)
      );

      clearInterval(
        state.circularPhaseTimer
      );

      state.circularPhaseTimer =
        setInterval(() => {

          remaining--;

          setText(
            elementId,
            `${phase} ${
              Math.max(
                remaining,
                0
              )
            }s`
          );

          setText(
            "aiCircleTimer",
            String(
              Math.max(
                remaining,
                0
              )
            )
          );

          if (
            remaining <= 0
          ) {

            clearInterval(
              state.circularPhaseTimer
            );

            state.circularPhaseTimer =
              null;

            resolve();
          }

        }, 1000);
    }
  );
}


/* =========================================================
   MANUAL TRADE
   ========================================================= */

async function placeManualTrade() {

  if (
    !state.authConnected
  ) {

    toast(
      "Connect your Deriv DEMO account first.",
      "warning"
    );

    return;
  }

  syncTradingSettings();

  const market =
    state.selectedManualMarket ||
    "R_10";

  const strategy =
    state.manualStrategy ||
    "MATCHES";

  let prediction =
    null;

  if (
    strategy ===
      "MATCHES" ||
    strategy ===
      "DIFFERS"
  ) {

    prediction =
      clamp(
        readNumberInput(
          "manualTargetDigitInput",
          analyzeMarket(
            market
          ).prediction ?? 5
        ),
        0,
        9
      );
  }

  const stake =
    clamp(
      readNumberInput(
        "manualStakeInput",
        CONFIG.MIN_STAKE
      ),
      CONFIG.MIN_STAKE,
      CONFIG.MAX_STAKE
    );

  try {

    await executeDemoTrade({

      market,

      strategy,

      stake,

      prediction,

      source:
        "MANUAL"
    });

  } catch (error) {

    toast(
      error.message,
      "error"
    );
  }
}


/* =========================================================
   STOP ALL AUTOMATION
   ========================================================= */

function stopAllAutomation() {

  stopAIBot();

  stopCircularAI();
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  const navButtons =
    $all(
      "[data-page]"
    );

  navButtons.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const page =
            button.dataset.page;

          if (!page) return;

          switchPage(
            page
          );
        }
      );
    }
  );
}

function switchPage(page) {

  state.activePage =
    page;

  $all(
    ".page"
  ).forEach(
    element => {

      const match =
        element.id ===
        `${page}Page` ||
        element.dataset.page ===
        page;

      element.classList.toggle(
        "active",
        match
      );
    }
  );

  $all(
    "[data-page]"
  ).forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.page ===
          page
      );
    }
  );
}


/* =========================================================
   MARKET SELECTS
   ========================================================= */

function populateMarketSelect(
  selectId,
  includeAuto = false
) {

  const select =
    $(selectId);

  if (!select) return;

  const current =
    select.value;

  select.innerHTML = "";

  if (includeAuto) {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      "AUTO";

    option.textContent =
      "AUTO • BEST MARKET";

    select.appendChild(
      option
    );
  }

  CONFIG.MARKETS.forEach(
    symbol => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        symbol;

      option.textContent =
        symbol;

      select.appendChild(
        option
      );
    }
  );

  if (
    current &&
    (
      includeAuto &&
      current === "AUTO" ||
      CONFIG.MARKETS.includes(
        current
      )
    )
  ) {

    select.value =
      current;

  } else if (includeAuto) {

    select.value =
      "AUTO";
  }
}

function setupMarketSelectors() {

  populateMarketSelect(
    "analysisMarketSelect",
    false
  );

  populateMarketSelect(
    "botMarketSelect",
    true
  );

  populateMarketSelect(
    "circularMarketSelect",
    true
  );

  populateMarketSelect(
    "manualMarketSelect",
    false
  );

  const analysis =
    $("analysisMarketSelect");

  if (analysis) {

    analysis.value =
      state.selectedAnalysisMarket;

    analysis.addEventListener(
      "change",
      event => {

        state.selectedAnalysisMarket =
          event.target.value;

        state.chartMarket =
          event.target.value;

        setText(
          "currentChartMarket",
          event.target.value
        );

        updateAnalysisUI(
          event.target.value
        );

        drawChart(
          event.target.value
        );
      }
    );
  }

  const bot =
    $("botMarketSelect");

  if (bot) {

    bot.addEventListener(
      "change",
      event => {

        state.selectedBotMarket =
          event.target.value;

        updateBotMarketUI();
      }
    );
  }

  const circular =
    $("circularMarketSelect");

  if (circular) {

    circular.addEventListener(
      "change",
      event => {

        state.selectedCircularMarket =
          event.target.value;
      }
    );
  }

  const manual =
    $("manualMarketSelect");

  if (manual) {

    manual.value =
      state.selectedManualMarket;

    manual.addEventListener(
      "change",
      event => {

        state.selectedManualMarket =
          event.target.value;
      }
    );
  }
}


/* =========================================================
   BOT MARKET UI
   ========================================================= */

function updateBotMarketUI() {

  const selected =
    state.selectedBotMarket;

  const analysis =
    selected === "AUTO"
      ? getBestMarket()
      : analyzeMarket(selected);

  if (!analysis) return;

  setText(
    "botSelectedMarket",
    analysis.symbol
  );

  setText(
    "botScore",
    `${Math.round(
      analysis.confidence
    )}/100`
  );

  setText(
    "aiPredictionLarge",
    analysis.prediction ??
    "--"
  );

  setText(
    "predictionConfidence",
    `${Math.round(
      analysis.confidence
    )}%`
  );
}


/* =========================================================
   STRATEGY LABELS
   ========================================================= */

function strategyLabel(
  strategy
) {

  const labels = {

    MATCHES: "MATCHES",

    DIFFERS: "DIFFERS",

    OVER: "OVER",

    UNDER: "UNDER",

    EVEN: "EVEN",

    ODD: "ODD"
  };

  return (
    labels[strategy] ||
    strategy
  );
}

function updateStrategyLabels() {

  setText(
    "botStrategyLabel",
    state.botStrategies.join(
      " + "
    )
  );

  setText(
    "circularStrategyLabel",
    strategyLabel(
      state.circularStrategy
    )
  );

  setText(
    "manualSelectedStrategyLabel",
    strategyLabel(
      state.manualStrategy
    )
  );
}


/* =========================================================
   STRATEGY MODAL
   ========================================================= */

function setupStrategyUI() {

  const options =
    $all(
      "[data-strategy]"
    );

  options.forEach(
    option => {

      option.addEventListener(
        "click",
        () => {

          const strategy =
            option.dataset.strategy;

          if (!CONFIG.STRATEGIES.includes(
            strategy
          )) {
            return;
          }

          const modal =
            option.closest(
              ".modal"
            );

          if (
            modal?.id ===
            "strategyModal"
          ) {

            state.manualStrategy =
              strategy;

          } else {

            state.circularStrategy =
              strategy;
          }

          updateStrategyLabels();

          if (modal) {
            modal.classList.remove(
              "show",
              "active"
            );
          }
        }
      );
    }
  );

  const botChecks =
    $all(
      ".bot-strategy-check"
    );

  botChecks.forEach(
    check => {

      check.addEventListener(
        "change",
        () => {

          const selected =
            botChecks
              .filter(
                item =>
                  item.checked
              )
              .map(
                item =>
                  item.value ||
                  item.dataset.strategy
              )
              .filter(
                value =>
                  CONFIG.STRATEGIES.includes(
                    value
                  )
              );

          if (selected.length) {

            state.botStrategies =
              selected;

          } else {

            state.botStrategies =
              ["MATCHES"];
          }

          updateStrategyLabels();
        }
      );
    }
  );
}


/* =========================================================
   MODAL CLOSE BUTTONS
   ========================================================= */

function setupModals() {

  $all(
    "[data-close-modal]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const id =
            button.dataset.closeModal;

          const modal =
            $(id);

          if (modal) {

            modal.classList.remove(
              "show",
              "active"
            );
          }
        }
      );
    }
  );

  const closeStrategy =
    $("closeStrategyModal");

  if (closeStrategy) {

    closeStrategy.onclick =
      () => {

        const modal =
          $("strategyModal");

        if (modal) {
          modal.classList.remove(
            "show",
            "active"
          );
        }
      };
  }

  const closeBotStrategy =
    $("closeBotStrategyModal");

  if (closeBotStrategy) {

    closeBotStrategy.onclick =
      () => {

        const modal =
          $("botStrategyModal");

        if (modal) {
          modal.classList.remove(
            "show",
            "active"
          );
        }
      };
  }
}


/* =========================================================
   TRADE TABS
   ========================================================= */

function setupTradeTabs() {

  const tabs = [
    [
      "tabAiBot",
      "aiBotPanel"
    ],
    [
      "tabCircularAI",
      "circularAIPanel"
    ],
    [
      "tabManual",
      "manualPanel"
    ]
  ];

  tabs.forEach(
    ([tabId, panelId]) => {

      const tab =
        $(tabId);

      if (!tab) return;

      tab.addEventListener(
        "click",
        () => {

          tabs.forEach(
            ([otherTabId, otherPanelId]) => {

              const otherTab =
                $(otherTabId);

              const otherPanel =
                $(otherPanelId);

              if (otherTab) {
                otherTab.classList.toggle(
                  "active",
                  otherTabId === tabId
                );
              }

              if (otherPanel) {
                otherPanel.classList.toggle(
                  "active",
                  otherPanelId === panelId
                );
              }
            }
          );
        }
      );
    }
  );
}


/* =========================================================
   BUTTONS
   ========================================================= */

function setupButtons() {

  const connect =
    $("connectDerivBtn");

  if (connect) {

    connect.addEventListener(
      "click",
      () => {

        if (
          state.authConnected
        ) {

          toast(
            `DEMO CONNECTED • ${state.accountId}`,
            "success"
          );

          return;
        }

        startOAuth();
      }
    );
  }

  const botButton =
    $("startBotBtn");

  if (botButton) {

    botButton.addEventListener(
      "click",
      () => {

        if (state.botRunning) {
          stopAIBot();
        } else {
          startAIBot();
        }
      }
    );
  }

  const circularButton =
    $("startCircularTradeBtn");

  if (circularButton) {

    circularButton.addEventListener(
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

  const manualButton =
    $("placeTradeBtn");

  if (manualButton) {

    manualButton.addEventListener(
      "click",
      placeManualTrade
    );
  }

  const startAI =
    $("startAI");

  if (startAI) {

    startAI.addEventListener(
      "click",
      () => {

        switchPage(
          "trade"
        );

        startAIBot();
      }
    );
  }

  const stopAI =
    $("stopAI");

  if (stopAI) {

    stopAI.addEventListener(
      "click",
      stopAllAutomation
    );
  }

  const stopTrading =
    $("stopTradingBtn");

  if (stopTrading) {

    stopTrading.addEventListener(
      "click",
      stopAllAutomation
    );
  }

  const clearLogs =
    $("clearLogsBtn");

  if (clearLogs) {

    clearLogs.addEventListener(
      "click",
      () => {

        if (
          !confirm(
            "Clear KRISHWAVE DEMO trade history?"
          )
        ) {
          return;
        }

        state.history = [];

        saveHistory();

        rebuildStats();

        renderHistory();

        toast(
          "DEMO history cleared.",
          "success"
        );
      }
    );
  }
}


/* =========================================================
   THEME
   ========================================================= */

function setupTheme() {

  const button =
    $("themeToggle");

  const saved =
    localStorage.getItem(
      CONFIG.STORAGE_THEME
    );

  if (saved === "light") {

    document.body.classList.add(
      "light"
    );

  } else if (saved === "dark") {

    document.body.classList.remove(
      "light"
    );
  }

  if (button) {

    button.addEventListener(
      "click",
      () => {

        document.body.classList.toggle(
          "light"
        );

        const light =
          document.body.classList.contains(
            "light"
          );

        localStorage.setItem(
          CONFIG.STORAGE_THEME,
          light
            ? "light"
            : "dark"
        );
      }
    );
  }
}


/* =========================================================
   WINDOW RESIZE
   ========================================================= */

function setupResize() {

  window.addEventListener(
    "resize",
    () => {

      drawChart(
        state.selectedAnalysisMarket
      );
    }
  );
}


/* =========================================================
   DEMO ACCOUNT DISPLAY
   ========================================================= */

function updateAccountDisplay() {

  if (state.accountId) {

    setText(
      "accountId",
      state.accountId
    );
  }

  setText(
    "currency",
    state.accountCurrency
  );

  setText(
    "modeBadge",
    "DEMO"
  );

  setText(
    "engineStatusText",
    "DEMO MODE"
  );
}


/* =========================================================
   INITIAL CONNECTION RESTORE
   ========================================================= */

async function restoreDemoConnection() {

  restoreSession();

  if (!state.accessToken) {

    setConnectionStatus(
      false,
      "DEMO DISCONNECTED"
    );

    return;
  }

  try {

    await connectDemoAccount();

  } catch (error) {

    console.warn(
      "Stored DEMO session could not reconnect",
      error
    );

    sessionStorage.removeItem(
      "KRISHWAVE_DERIV_ACCESS_TOKEN"
    );

    state.accessToken =
      null;

    setConnectionStatus(
      false,
      "DEMO LOGIN REQUIRED"
    );
  }
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {

  if (state.initialized) {
    return;
  }

  state.initialized =
    true;

  enforceDemoOnly();

  loadHistory();

  loadSettings();

  setupTheme();

  setupNavigation();

  setupMarketSelectors();

  setupStrategyUI();

  setupModals();

  setupTradeTabs();

  setupButtons();

  setupResize();

  updateStrategyLabels();

  updateStatsUI();

  renderHistory();

  renderActiveTrades();

  updateAccountDisplay();

  setText(
    "currentChartMarket",
    state.selectedAnalysisMarket
  );

  setText(
    "dataStatus",
    "CONNECTING TO DERIV"
  );

  /*
    Public market data does not require
    an authenticated account.
  */

  connectPublicWS();

  /*
    Then restore an existing DEMO
    OAuth session if one exists.
  */

  await restoreDemoConnection();

  /*
    OAuth callback must be checked
    after page initialization.
  */

  await handleOAuthCallback();

  /*
    Initial chart/UI.
  */

  updateAnalysisUI(
    state.selectedAnalysisMarket
  );

  drawChart(
    state.selectedAnalysisMarket
  );

  setText(
    "aiCircleStatus",
    "READY"
  );

  console.log(
    `KRISHWAVE AI BEAST V${CONFIG.VERSION} initialized.`
  );

  console.log(
    "MODE: DEMO ONLY"
  );
}


/* =========================================================
   GLOBAL API
   ========================================================= */

window.KRISHWAVE = {

  version:
    CONFIG.VERSION,

  config:
    CONFIG,

  state,

  startOAuth,

  connectPublicWS,

  startAIBot,

  stopAIBot,

  startCircularAI,

  stopCircularAI,

  placeManualTrade,

  stopAllAutomation,

  analyzeMarket,

  scanMarkets
};
      

/*  =========================================================
   START
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

} else {

  init();
}