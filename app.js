/* =========================================================
   KRISHWAVE AI BEAST V7.1
   app.js
   ---------------------------------------------------------
   IMPORTANT:
   1. Set DERIV_CLIENT_ID to your Deriv OAuth Client ID.
   2. Your GitHub Pages URL must be registered EXACTLY as the
      OAuth redirect URI in Deriv.
   3. OAuth authorization-code exchange must be performed by
      your backend/serverless function.
   4. Public market ticks work without authentication.
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const CONFIG = {

  /*
   * PUT YOUR DERIV OAUTH CLIENT ID HERE.
   *
   * Example:
   * DERIV_CLIENT_ID: "123456",
   */
  DERIV_CLIENT_ID: "",

  /*
   * Your exact GitHub Pages application URL.
   *
   * Your supplied URL:
   * https://chrispusatale99-dot.github.io/KRISHWAVE/34khasPjsT0PCRR8X3Z70
   *
   * If your OAuth app is registered with a different callback,
   * change this to EXACTLY that registered URL.
   */
  REDIRECT_URI:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/34khasPjsT0PCRR8X3Z70",

  /*
   * Current Deriv OAuth endpoint.
   */
  OAUTH_URL:
    "https://auth.deriv.com/oauth2/auth",

  /*
   * Public market-data WebSocket.
   * No authentication is required for ticks.
   */
  PUBLIC_WS:
    "wss://api.derivws.com/trading/v1/options/ws/public",

  /*
   * Markets used by your interface.
   */
  MARKETS: [
    {
      symbol: "R_100",
      name: "Volatility 100 Index"
    },
    {
      symbol: "R_75",
      name: "Volatility 75 Index"
    },
    {
      symbol: "R_50",
      name: "Volatility 50 Index"
    },
    {
      symbol: "R_25",
      name: "Volatility 25 Index"
    },
    {
      symbol: "R_10",
      name: "Volatility 10 Index"
    }
  ],

  /*
   * Number of ticks kept for analysis.
   */
  MAX_TICKS: 250,

  /*
   * Number of ticks used for digit statistics.
   */
  ANALYSIS_WINDOW: 100,

  /*
   * Reconnect delay.
   */
  RECONNECT_DELAY: 3000,

  /*
   * UI update interval.
   */
  CHART_INTERVAL: 250
};


/* =========================================================
   STATE
   ========================================================= */

const state = {

  theme: "dark",

  connected: false,
  authenticated: false,

  accountId: null,
  balance: 0,
  currency: "USD",

  accessToken: null,

  publicSocket: null,
  privateSocket: null,

  publicSocketReady: false,
  privateSocketReady: false,

  reconnectTimer: null,

  selectedMarket: "R_100",

  ticks: [],
  prices: [],

  digitCounts: Array(10).fill(0),

  lastDigit: null,
  lastPrice: 0,

  confidence: 0,
  prediction: "--",
  predictionType: "DIGIT",

  aiRunning: false,
  aiTimer: null,
  aiCountdown: 0,

  botRunning: false,
  circularRunning: false,

  selectedStrategy: "MATCHES",
  botStrategies: [
    "MATCHES",
    "DIFFERS",
    "OVER",
    "UNDER",
    "EVEN",
    "ODD"
  ],

  trades: [],
  activeTrades: [],

  stats: {
    total: 0,
    wins: 0,
    losses: 0
  },

  history: [],

  paperBalance: 10000,

  chartAnimation: 0,

  pendingOAuthState: null,
  pendingCodeVerifier: null
};


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function safeText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function formatMoney(value, currency = "USD") {
  const number = Number(value) || 0;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(number);
  } catch {
    return `${currency} ${number.toFixed(2)}`;
  }
}

function showToast(message, duration = 3000) {
  const toast = $("toast");
  const messageEl = $("toastMessage");

  if (!toast || !messageEl) return;

  messageEl.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function randomString(length = 64) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const array = new Uint8Array(length);

  if (window.crypto && crypto.getRandomValues) {
    crypto.getRandomValues(array);
    return Array.from(array)
      .map(x => chars[x % chars.length])
      .join("");
  }

  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

function base64UrlEncode(buffer) {
  let binary = "";

  const bytes = new Uint8Array(buffer);

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  return crypto.subtle.digest("SHA-256", data);
}

async function createPKCE() {
  const verifier = randomString(64);
  const digest = await sha256(verifier);
  const challenge = base64UrlEncode(digest);

  return {
    verifier,
    challenge
  };
}


/* =========================================================
   CONNECTION UI
   ========================================================= */

function setConnectionStatus(online, text = null) {

  const dot = $("connectionDot");
  const label = $("connectionText");

  if (dot) {
    dot.classList.toggle("online", online);
    dot.classList.toggle("offline", !online);
  }

  if (label) {
    label.textContent =
      text || (online ? "ONLINE" : "OFFLINE");
  }
}

function setMode(real = false) {

  const badge = $("modeBadge");

  if (!badge) return;

  badge.classList.toggle("demo-mode", !real);
  badge.classList.toggle("real-mode", real);

  badge.textContent = real ? "REAL" : "DEMO";
}

function updateAccountUI() {

  safeText(
    "accountId",
    state.accountId || "Not connected"
  );

  safeText(
    "balanceDisplay",
    formatMoney(state.balance, state.currency)
  );

  safeText(
    "currency",
    state.currency || "USD"
  );

  safeText(
    "dataStatus",
    state.authenticated
      ? "Deriv account connected. Live market data active."
      : "Public market data active. Connect Deriv for account information."
  );

  const button = $("connectDerivBtn");

  if (button) {
    button.textContent =
      state.authenticated
        ? "CONNECTED"
        : "CONNECT DERIV";
  }
}


/* =========================================================
   MARKET SELECTS
   ========================================================= */

function populateMarkets() {

  const ids = [
    "analysisMarketSelect",
    "botMarketSelect",
    "circularMarketSelect",
    "manualMarketSelect"
  ];

  ids.forEach(id => {

    const select = $(id);

    if (!select) return;

    select.innerHTML = "";

    CONFIG.MARKETS.forEach(market => {

      const option = document.createElement("option");

      option.value = market.symbol;
      option.textContent = market.symbol;

      if (market.symbol === state.selectedMarket) {
        option.selected = true;
      }

      select.appendChild(option);
    });

    select.addEventListener("change", () => {

      state.selectedMarket = select.value;

      syncMarketSelectors();

      subscribePublicMarket();

      resetMarketAnalysis();
    });
  });
}

function syncMarketSelectors() {

  const ids = [
    "analysisMarketSelect",
    "botMarketSelect",
    "circularMarketSelect",
    "manualMarketSelect"
  ];

  ids.forEach(id => {

    const select = $(id);

    if (select) {
      select.value = state.selectedMarket;
    }
  });

  safeText("currentChartMarket", state.selectedMarket);
  safeText("aiMarket", state.selectedMarket);
  safeText("botSelectedMarket", state.selectedMarket);
}


/* =========================================================
   PUBLIC MARKET DATA
   ========================================================= */

function connectPublicWebSocket() {

  if (
    state.publicSocket &&
    (
      state.publicSocket.readyState === WebSocket.OPEN ||
      state.publicSocket.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  setConnectionStatus(false, "CONNECTING");

  try {

    state.publicSocket = new WebSocket(CONFIG.PUBLIC_WS);

    state.publicSocket.onopen = () => {

      state.publicSocketReady = true;

      setConnectionStatus(
        state.authenticated,
        state.authenticated ? "ONLINE" : "MARKET LIVE"
      );

      subscribePublicMarket();
    };

    state.publicSocket.onmessage = event => {

      try {

        const message = JSON.parse(event.data);

        handlePublicMessage(message);

      } catch (error) {

        console.error(
          "Invalid Deriv message:",
          error
        );
      }
    };

    state.publicSocket.onerror = error => {

      console.error(
        "Deriv public WebSocket error",
        error
      );

      state.publicSocketReady = false;
    };

    state.publicSocket.onclose = () => {

      state.publicSocketReady = false;

      if (!state.authenticated) {
        setConnectionStatus(false, "OFFLINE");
      }

      clearTimeout(state.reconnectTimer);

      state.reconnectTimer = setTimeout(() => {
        connectPublicWebSocket();
      }, CONFIG.RECONNECT_DELAY);
    };

  } catch (error) {

    console.error(error);

    setConnectionStatus(false, "OFFLINE");
  }
}

function subscribePublicMarket() {

  if (
    !state.publicSocket ||
    state.publicSocket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  const request = {
    ticks: state.selectedMarket,
    subscribe: 1
  };

  try {

    state.publicSocket.send(
      JSON.stringify(request)
    );

  } catch (error) {

    console.error(
      "Could not subscribe to ticks:",
      error
    );
  }
}

function handlePublicMessage(message) {

  if (message.error) {

    console.error(
      "Deriv API error:",
      message.error
    );

    return;
  }

  if (
    message.msg_type === "tick" &&
    message.tick
  ) {

    const tick = message.tick;

    if (
      tick.symbol &&
      tick.symbol !== state.selectedMarket
    ) {
      return;
    }

    processTick(tick);
  }
}


/* =========================================================
   TICK PROCESSING
   ========================================================= */

function processTick(tick) {

  const quote = Number(tick.quote);

  if (!Number.isFinite(quote)) {
    return;
  }

  state.lastPrice = quote;

  state.ticks.push({
    epoch: tick.epoch || Date.now() / 1000,
    quote
  });

  state.prices.push(quote);

  if (state.ticks.length > CONFIG.MAX_TICKS) {
    state.ticks.shift();
  }

  if (state.prices.length > CONFIG.MAX_TICKS) {
    state.prices.shift();
  }

  state.lastDigit = extractLastDigit(
    quote,
    tick.pip_size
  );

  safeText(
    "currentLivePrice",
    formatPrice(quote)
  );

  safeText(
    "lastDigit",
    state.lastDigit
  );

  safeText(
    "digitSampleCount",
    state.ticks.length
  );

  calculateDigitDistribution();
  updatePrediction();
  updateChart();
}

function formatPrice(price) {

  if (!Number.isFinite(price)) {
    return "0.00000";
  }

  if (price >= 1000) {
    return price.toFixed(2);
  }

  if (price >= 100) {
    return price.toFixed(3);
  }

  if (price >= 10) {
    return price.toFixed(4);
  }

  return price.toFixed(5);
}

function extractLastDigit(price, pipSize) {

  if (
    Number.isFinite(Number(pipSize)) &&
    Number(pipSize) >= 0
  ) {

    const decimals =
      Math.max(
        0,
        Math.round(
          -Math.log10(Number(pipSize))
        )
      );

    const scaled =
      Math.round(
        price * Math.pow(10, decimals)
      );

    return Math.abs(scaled) % 10;
  }

  const text = String(price);

  const clean =
    text.includes("e")
      ? price.toFixed(8)
      : text;

  const digits =
    clean.replace(/\D/g, "");

  return digits.length
    ? Number(digits[digits.length - 1])
    : 0;
}


/* =========================================================
   DIGIT ANALYSIS
   ========================================================= */

function calculateDigitDistribution() {

  const counts = Array(10).fill(0);

  const recent =
    state.ticks.slice(
      -CONFIG.ANALYSIS_WINDOW
    );

  recent.forEach(item => {

    const digit =
      extractLastDigit(item.quote);

    if (
      digit >= 0 &&
      digit <= 9
    ) {
      counts[digit]++;
    }
  });

  state.digitCounts = counts;

  renderDigitDistribution();
}

function renderDigitDistribution() {

  const grid = $("digitStatsGrid");

  if (!grid) return;

  const total =
    state.digitCounts.reduce(
      (a, b) => a + b,
      0
    );

  grid.innerHTML = "";

  for (let digit = 0; digit <= 9; digit++) {

    const count =
      state.digitCounts[digit];

    const percent =
      total > 0
        ? (count / total) * 100
        : 0;

    const cell =
      document.createElement("div");

    cell.className = "digit-cell";

    cell.innerHTML = `
      <strong>${digit}</strong>
      <span>${count} · ${percent.toFixed(1)}%</span>
      <div
        class="digit-bar"
        style="width:${Math.max(3, percent)}%"
      ></div>
    `;

    grid.appendChild(cell);
  }
}


/* =========================================================
   AI PREDICTION
   ========================================================= */

function updatePrediction() {

  if (state.ticks.length < 10) {

    state.prediction = "--";
    state.confidence = 0;

    safeText(
      "aiPrediction",
      "WAITING"
    );

    safeText(
      "aiPredictionLarge",
      "WAITING"
    );

    safeText(
      "aiCirclePrediction",
      "--"
    );

    safeText(
      "analysisConfidence",
      "0%"
    );

    safeText(
      "predictionConfidence",
      "0% confidence"
    );

    safeText(
      "analysisMsg",
      "Waiting for enough market data."
    );

    return;
  }

  const counts = state.digitCounts;

  let highestDigit = 0;
  let highestCount = counts[0];

  counts.forEach((count, digit) => {

    if (count > highestCount) {
      highestCount = count;
      highestDigit = digit;
    }
  });

  const total =
    counts.reduce(
      (a, b) => a + b,
      0
    );

  /*
   * This is statistical digit analysis, not a guarantee
   * of future market movement.
   */
  const distributionConfidence =
    total > 0
      ? highestCount / total
      : 0;

  const recent =
    state.ticks.slice(-20);

  let momentum = 0;

  if (recent.length >= 5) {

    const first =
      recent[0].quote;

    const last =
      recent[recent.length - 1].quote;

    if (last > first) {
      momentum = 1;
    } else if (last < first) {
      momentum = -1;
    }
  }

  let confidence =
    45 +
    distributionConfidence * 35 +
    Math.abs(momentum) * 5;

  confidence =
    Math.min(
      95,
      Math.max(
        1,
        Math.round(confidence)
      )
    );

  state.prediction =
    String(highestDigit);

  state.confidence = confidence;

  safeText(
    "aiPrediction",
    state.prediction
  );

  safeText(
    "aiPredictionLarge",
    state.prediction
  );

  safeText(
    "aiCirclePrediction",
    state.prediction
  );

  safeText(
    "analysisConfidence",
    `${confidence}%`
  );

  safeText(
    "predictionConfidence",
    `${confidence}% confidence`
  );

  safeText(
    "botScore",
    confidence
  );

  safeText(
    "analysisMsg",
    momentum > 0
      ? "Recent price movement is positive; digit distribution is being monitored."
      : momentum < 0
        ? "Recent price movement is negative; digit distribution is being monitored."
        : "Market movement is mixed; waiting for stronger statistical confirmation."
  );
}


/* =========================================================
   CHART
   ========================================================= */

function updateChart() {

  const canvas =
    $("priceChartCanvas");

  if (!canvas) return;

  const ctx =
    canvas.getContext("2d");

  if (!ctx) return;

  const rect =
    canvas.getBoundingClientRect();

  const width =
    Math.max(
      1,
      Math.floor(rect.width)
    );

  const height =
    Math.max(
      1,
      Math.floor(rect.height)
    );

  const dpr =
    window.devicePixelRatio || 1;

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

  const values =
    state.prices.slice(-80);

  if (values.length < 2) {
    drawChartMessage(
      ctx,
      width,
      height,
      "WAITING FOR LIVE DATA"
    );

    return;
  }

  let min =
    Math.min(...values);

  let max =
    Math.max(...values);

  if (max === min) {
    max += 1;
    min -= 1;
  }

  const padding = 12;

  ctx.strokeStyle =
    "rgba(255,255,255,.06)";

  ctx.lineWidth = 1;

  for (let i = 1; i < 4; i++) {

    const y =
      padding +
      ((height - padding * 2) / 4) * i;

    ctx.beginPath();

    ctx.moveTo(
      padding,
      y
    );

    ctx.lineTo(
      width - padding,
      y
    );

    ctx.stroke();
  }

  const points = values.map(
    (value, index) => {

      const x =
        padding +
        (index / (values.length - 1)) *
        (width - padding * 2);

      const y =
        height -
        padding -
        ((value - min) / (max - min)) *
        (height - padding * 2);

      return {
        x,
        y
      };
    }
  );

  const gradient =
    ctx.createLinearGradient(
      0,
      0,
      width,
      0
    );

  gradient.addColorStop(
    0,
    "#00e5ff"
  );

  gradient.addColorStop(
    1,
    "#6366f1"
  );

  ctx.beginPath();

  points.forEach(
    (point, index) => {

      if (index === 0) {
        ctx.moveTo(
          point.x,
          point.y
        );
      } else {
        ctx.lineTo(
          point.x,
          point.y
        );
      }
    }
  );

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.stroke();

  const last =
    points[points.length - 1];

  ctx.beginPath();

  ctx.arc(
    last.x,
    last.y,
    4,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "#00e5ff";

  ctx.shadowColor =
    "#00e5ff";

  ctx.shadowBlur = 12;

  ctx.fill();

  ctx.shadowBlur = 0;
}

function drawChartMessage(
  ctx,
  width,
  height,
  text
) {

  ctx.fillStyle =
    "rgba(145,167,189,.7)";

  ctx.font =
    "10px system-ui";

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    text,
    width / 2,
    height / 2
  );
}


/* =========================================================
   RESET MARKET
   ========================================================= */

function resetMarketAnalysis() {

  state.ticks = [];
  state.prices = [];

  state.lastDigit = null;
  state.lastPrice = 0;

  state.digitCounts =
    Array(10).fill(0);

  state.prediction = "--";
  state.confidence = 0;

  safeText(
    "currentLivePrice",
    "0.00000"
  );

  safeText(
    "lastDigit",
    "-"
  );

  safeText(
    "digitSampleCount",
    "0"
  );

  safeText(
    "analysisConfidence",
    "0%"
  );

  safeText(
    "aiPrediction",
    "WAITING"
  );

  safeText(
    "aiPredictionLarge",
    "WAITING"
  );

  safeText(
    "aiCirclePrediction",
    "--"
  );

  renderDigitDistribution();
}


/* =========================================================
   OAUTH LOGIN
   ========================================================= */

async function startDerivLogin() {

  if (!CONFIG.DERIV_CLIENT_ID) {

    showToast(
      "Deriv Client ID is not configured yet."
    );

    alert(
      "Add your Deriv OAuth Client ID to CONFIG.DERIV_CLIENT_ID in app.js first."
    );

    return;
  }

  try {

    const pkce =
      await createPKCE();

    const oauthState =
      randomString(32);

    state.pendingOAuthState =
      oauthState;

    state.pendingCodeVerifier =
      pkce.verifier;

    sessionStorage.setItem(
      "krishwave_oauth_state",
      oauthState
    );

    sessionStorage.setItem(
      "krishwave_code_verifier",
      pkce.verifier
    );

    const params =
      new URLSearchParams({
        response_type: "code",
        client_id: CONFIG.DERIV_CLIENT_ID,
        redirect_uri: CONFIG.REDIRECT_URI,

        /*
         * Request only the permissions your application needs.
         * trade allows trading functionality.
         */
        scope: "trade",

        state: oauthState,

        code_challenge: pkce.challenge,

        code_challenge_method: "S256"
      });

    const loginUrl =
      `${CONFIG.OAUTH_URL}?${params.toString()}`;

    /*
     * Correct OAuth behavior:
     * send the user to Deriv.
     */
    window.location.assign(loginUrl);

  } catch (error) {

    console.error(
      "OAuth initialization failed:",
      error
    );

    showToast(
      "Could not start Deriv login."
    );
  }
}


/* =========================================================
   OAUTH CALLBACK
   ========================================================= */

function getOAuthCallback() {

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

  const errorDescription =
    params.get(
      "error_description"
    );

  return {
    code,
    returnedState,
    error,
    errorDescription
  };
}

async function handleOAuthCallback() {

  const callback =
    getOAuthCallback();

  if (callback.error) {

    console.error(
      "Deriv OAuth error:",
      callback.error,
      callback.errorDescription
    );

    showToast(
      callback.errorDescription ||
      "Deriv login was cancelled."
    );

    cleanUrl();

    return;
  }

  if (!callback.code) {
    return;
  }

  const savedState =
    sessionStorage.getItem(
      "krishwave_oauth_state"
    );

  const verifier =
    sessionStorage.getItem(
      "krishwave_code_verifier"
    );

  if (
    !savedState ||
    !callback.returnedState ||
    savedState !== callback.returnedState
  ) {

    showToast(
      "Security check failed. Please try connecting again."
    );

    cleanOAuthStorage();
    cleanUrl();

    return;
  }

  if (!verifier) {

    showToast(
      "OAuth session expired. Please connect again."
    );

    cleanOAuthStorage();
    cleanUrl();

    return;
  }

  /*
   * IMPORTANT:
   *
   * Do NOT exchange the OAuth code directly from this browser.
   *
   * Deriv requires this step to be done server-side.
   *
   * Your backend should accept:
   *
   *   code
   *   code_verifier
   *   redirect_uri
   *   client_id
   *
   * and return the access_token.
   *
   * After you add that backend, call:
   *
   *   finishOAuthLogin(accessToken)
   *
   * here.
   */

  sessionStorage.setItem(
    "krishwave_pending_auth_code",
    callback.code
  );

  sessionStorage.setItem(
    "krishwave_pending_verifier",
    verifier
  );

  showToast(
    "Deriv authorization successful. Token exchange is required on your server."
  );

  cleanUrl();
}

function cleanOAuthStorage() {

  sessionStorage.removeItem(
    "krishwave_oauth_state"
  );

  sessionStorage.removeItem(
    "krishwave_code_verifier"
  );
}

function cleanUrl() {

  try {

    const clean =
      window.location.origin +
      window.location.pathname;

    window.history.replaceState(
      {},
      document.title,
      clean
    );

  } catch {
    /* Ignore */
  }
}


/* =========================================================
   AUTHENTICATED SESSION
   ========================================================= */

/*
 * Call this function after your backend returns the OAuth
 * access token.
 *
 * Example:
 *
 * finishOAuthLogin("ory_at_xxxxxxxxx");
 */
async function finishOAuthLogin(accessToken) {

  if (!accessToken) {
    throw new Error(
      "Missing Deriv access token."
    );
  }

  state.accessToken =
    accessToken;

  state.authenticated = true;

  setConnectionStatus(
    true,
    "ONLINE"
  );

  setMode(false);

  updateAccountUI();

  /*
   * The new Deriv API uses an authenticated REST request to
   * obtain an OTP and then opens an authenticated WebSocket.
   *
   * This function expects your server/backend to provide the
   * authenticated WebSocket URL or OTP.
   *
   * For now we also store the token locally only for this
   * browser session.
   */
  sessionStorage.setItem(
    "krishwave_access_token",
    accessToken
  );

  showToast(
    "Deriv authentication successful."
  );
}


/* =========================================================
   OPTIONAL AUTH SESSION REST HELPER
   ========================================================= */

/*
 * This function is intentionally provided as a helper for
 * your backend/API proxy.
 *
 * It should NOT be used with an OAuth token exchange directly
 * from GitHub Pages.
 */
async function derivFetch(
  endpoint,
  options = {}
) {

  if (!state.accessToken) {
    throw new Error(
      "No Deriv access token."
    );
  }

  const headers = {
    ...(options.headers || {}),
    Authorization:
      `Bearer ${state.accessToken}`,
    "Content-Type":
      "application/json"
  };

  const response =
    await fetch(
      `https://api.derivws.com${endpoint}`,
      {
        ...options,
        headers
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.errors?.[0]?.message ||
      "Deriv API request failed."
    );
  }

  return data;
}


/* =========================================================
   BALANCE
   ========================================================= */

/*
 * Your backend can call this after authentication and return
 * the account balance.
 *
 * The function is also ready for a direct API response.
 */
function applyBalanceResponse(data) {

  const balance =
    data?.balance ||
    data?.data?.balance;

  if (!balance) return;

  state.balance =
    Number(
      balance.balance ??
      balance.amount ??
      0
    );

  state.currency =
    balance.currency ||
    state.currency;

  state.accountId =
    balance.loginid ||
    state.accountId;

  updateAccountUI();
}


/* =========================================================
   AUTHENTICATED WEBSOCKET
   ========================================================= */

/*
 * New Deriv API authenticated WebSockets are opened using an
 * OTP-generated WebSocket URL.
 *
 * Your backend can obtain the URL from:
 *
 * POST
 * /trading/v1/options/accounts/{accountId}/otp
 *
 * and pass it to this function.
 */
function connectAuthenticatedWebSocket(wsUrl) {

  if (!wsUrl) {

    showToast(
      "Authenticated WebSocket URL is missing."
    );

    return;
  }

  try {

    if (state.privateSocket) {

      try {
        state.privateSocket.close();
      } catch {}
    }

    state.privateSocket =
      new WebSocket(wsUrl);

    state.privateSocket.onopen = () => {

      state.privateSocketReady = true;

      setConnectionStatus(
        true,
        "ONLINE"
      );

      showToast(
        "Deriv account connection is live."
      );

      requestAuthenticatedBalance();
    };

    state.privateSocket.onmessage =
      event => {

        try {

          const message =
            JSON.parse(event.data);

          handleAuthenticatedMessage(
            message
          );

        } catch (error) {

          console.error(
            "Private Deriv message error:",
            error
          );
        }
      };

    state.privateSocket.onerror =
      error => {

        console.error(
          "Authenticated WebSocket error:",
          error
        );
      };

    state.privateSocket.onclose = () => {

      state.privateSocketReady =
        false;

      if (state.authenticated) {
        setConnectionStatus(
          false,
          "RECONNECT REQUIRED"
        );
      }
    };

  } catch (error) {

    console.error(error);

    showToast(
      "Could not open Deriv account connection."
    );
  }
}

function sendPrivateRequest(request) {

  if (
    !state.privateSocket ||
    state.privateSocket.readyState !==
      WebSocket.OPEN
  ) {
    return false;
  }

  try {

    state.privateSocket.send(
      JSON.stringify(request)
    );

    return true;

  } catch (error) {

    console.error(error);

    return false;
  }
}

function requestAuthenticatedBalance() {

  sendPrivateRequest({
    balance: 1,
    subscribe: 1
  });
}

function handleAuthenticatedMessage(
  message
) {

  if (message.error) {

    console.error(
      "Authenticated Deriv error:",
      message.error
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
      ) || 0;

    state.currency =
      message.balance.currency ||
      state.currency;

    updateAccountUI();
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  document
    .querySelectorAll(".nav-item")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const page =
            button.dataset.page;

          if (!page) return;

          document
            .querySelectorAll(".nav-item")
            .forEach(item => {
              item.classList.remove(
                "active"
              );
            });

          button.classList.add(
            "active"
          );

          document
            .querySelectorAll(".page")
            .forEach(section => {
              section.classList.remove(
                "active"
              );
            });

          const target =
            $(`${page}Page`);

          if (target) {
            target.classList.add(
              "active"
            );
          }
        }
      );
    });
}


/* =========================================================
   THEME
   ========================================================= */

function setupTheme() {

  const button =
    $("themeToggle");

  if (!button) return;

  const saved =
    localStorage.getItem(
      "krishwave_theme"
    );

  if (saved === "light") {
    document.body.classList.add(
      "light"
    );

    state.theme = "light";
    button.textContent = "🌙";
  }

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

      state.theme =
        light ? "light" : "dark";

      localStorage.setItem(
        "krishwave_theme",
        state.theme
      );

      button.textContent =
        light ? "🌙" : "☀️";
    }
  );
}


/* =========================================================
   STRATEGY MODAL
   ========================================================= */

function setupStrategyModal() {

  const modal =
    $("strategyModal");

  const close =
    $("closeStrategyModal");

  const buttons =
    document.querySelectorAll(
      "#strategyOptions button"
    );

  function open() {

    if (modal) {
      modal.classList.add("show");
    }
  }

  function hide() {

    if (modal) {
      modal.classList.remove("show");
    }
  }

  [
    "circularStrategyTrigger",
    "manualStrategyTrigger"
  ].forEach(id => {

    const button = $(id);

    if (button) {
      button.addEventListener(
        "click",
        open
      );
    }
  });

  if (close) {
    close.addEventListener(
      "click",
      hide
    );
  }

  buttons.forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const strategy =
          button.dataset.strategy;

        if (!strategy) return;

        state.selectedStrategy =
          strategy;

        safeText(
          "circularStrategyLabel",
          strategy
        );

        safeText(
          "manualSelectedStrategyLabel",
          strategy
        );

        const target =
          $("targetDigitContainer");

        if (target) {

          target.style.display =
            strategy === "MATCHES" ||
            strategy === "DIFFERS"
              ? ""
              : "none";
        }

        hide();
      }
    );
  });

  if (modal) {

    modal.addEventListener(
      "click",
      event => {

        if (event.target === modal) {
          hide();
        }
      }
    );
  }
}


/* =========================================================
   BOT STRATEGY MODAL
   ========================================================= */

function setupBotStrategyModal() {

  const modal =
    $("botStrategyModal");

  const openButton =
    $("botStrategyTrigger");

  const closeButton =
    $("closeBotStrategyModal");

  const applyButton =
    $("applyBotStrategies");

  if (openButton) {

    openButton.addEventListener(
      "click",
      () => {

        if (modal) {
          modal.classList.add(
            "show"
          );
        }
      }
    );
  }

  if (closeButton) {

    closeButton.addEventListener(
      "click",
      () => {

        if (modal) {
          modal.classList.remove(
            "show"
          );
        }
      }
    );
  }

  if (applyButton) {

    applyButton.addEventListener(
      "click",
      () => {

        const selected =
          Array.from(
            document.querySelectorAll(
              ".bot-strategy-check:checked"
            )
          ).map(
            checkbox =>
              checkbox.value
          );

        state.botStrategies =
          selected.length
            ? selected
            : ["MATCHES"];

        safeText(
          "botStrategyLabel",
          state.botStrategies.join(", ")
        );

        if (modal) {
          modal.classList.remove(
            "show"
          );
        }
      }
    );
  }
}


/* =========================================================
   CIRCULAR AI
   ========================================================= */

function startCircularAI() {

  if (state.aiRunning) {
    showToast(
      "Circular AI is already running."
    );
    return;
  }

  state.aiRunning = true;

  safeText(
    "aiStatus",
    "AI ACTIVE"
  );

  safeText(
    "aiCircleStatus",
    "RUNNING"
  );

  safeText(
    "cycleAnalysis",
    "ANALYZING"
  );

  safeText(
    "cycleTrade",
    "MONITORING"
  );

  runAITimer();

  showToast(
    "Circular AI started."
  );
}

function stopCircularAI() {

  state.aiRunning = false;

  clearInterval(
    state.aiTimer
  );

  state.aiCountdown = 0;

  safeText(
    "aiStatus",
    "AI WAITING"
  );

  safeText(
    "aiCircleStatus",
    "IDLE"
  );

  safeText(
    "cycleAnalysis",
    "STOPPED"
  );

  safeText(
    "cycleTrade",
    "WAITING"
  );

  safeText(
    "aiCircleTimer",
    "--"
  );

  showToast(
    "Circular AI stopped."
  );
}

function runAITimer() {

  clearInterval(
    state.aiTimer
  );

  state.aiCountdown = 5;

  safeText(
    "aiCircleTimer",
    state.aiCountdown
  );

  state.aiTimer =
    setInterval(
      () => {

        if (!state.aiRunning) {
          clearInterval(
            state.aiTimer
          );
          return;
        }

        state.aiCountdown--;

        if (state.aiCountdown <= 0) {

          updatePrediction();

          state.aiCountdown = 5;
        }

        safeText(
          "aiCircleTimer",
          state.aiCountdown
        );
      },
      1000
    );
}


/* =========================================================
   PAPER TRADING
   ========================================================= */

function getNumberInput(id, fallback) {

  const input = $(id);

  if (!input) {
    return fallback;
  }

  const value =
    Number(input.value);

  return Number.isFinite(value)
    ? value
    : fallback;
}

function placePaperTrade({
  market,
  strategy,
  stake,
  targetDigit = null,
  source = "MANUAL"
}) {

  if (
    !Number.isFinite(stake) ||
    stake <= 0
  ) {

    showToast(
      "Invalid stake."
    );

    return;
  }

  const trade = {

    id:
      `PAPER-${Date.now()}-${Math.floor(
        Math.random() * 10000
      )}`,

    market,

    strategy,

    stake,

    targetDigit,

    source,

    prediction:
      state.prediction,

    confidence:
      state.confidence,

    entryPrice:
      state.lastPrice,

    createdAt:
      Date.now(),

    status:
      "ACTIVE"
  };

  state.activeTrades.push(
    trade
  );

  state.stats.total++;

  state.paperBalance -= stake;

  renderTradeStats();
  renderActiveTrades();

  /*
   * Demo/paper result simulation.
   *
   * This NEVER submits a real Deriv trade.
   */
  setTimeout(
    () => resolvePaperTrade(trade.id),
    4000 + Math.random() * 5000
  );

  showToast(
    `Demo trade placed: ${strategy}`
  );
}

function resolvePaperTrade(id) {

  const index =
    state.activeTrades.findIndex(
      trade => trade.id === id
    );

  if (index === -1) {
    return;
  }

  const trade =
    state.activeTrades[index];

  const currentDigit =
    state.lastDigit;

  let win = false;

  switch (trade.strategy) {

    case "MATCHES":

      win =
        currentDigit !== null &&
        Number(currentDigit) ===
          Number(
            trade.targetDigit ??
            trade.prediction
          );

      break;

    case "DIFFERS":

      win =
        currentDigit !== null &&
        Number(currentDigit) !==
          Number(
            trade.targetDigit ??
            trade.prediction
          );

      break;

    case "OVER":

      win =
        currentDigit !== null &&
        Number(currentDigit) >
          Number(
            trade.targetDigit ?? 5
          );

      break;

    case "UNDER":

      win =
        currentDigit !== null &&
        Number(currentDigit) <
          Number(
            trade.targetDigit ?? 5
          );

      break;

    case "EVEN":

      win =
        currentDigit !== null &&
        Number(currentDigit) % 2 === 0;

      break;

    case "ODD":

      win =
        currentDigit !== null &&
        Number(currentDigit) % 2 !== 0;

      break;

    default:

      win =
        Math.random() > 0.5;
  }

  const profit =
    win
      ? trade.stake * 0.95
      : -trade.stake;

  state.paperBalance +=
    trade.stake +
    profit;

  if (win) {
    state.stats.wins++;
  } else {
    state.stats.losses++;
  }

  trade.status =
    win ? "WIN" : "LOSS";

  trade.profit =
    profit;

  trade.exitPrice =
    state.lastPrice;

  trade.closedAt =
    Date.now();

  state.activeTrades.splice(
    index,
    1
  );

  state.history.unshift(
    trade
  );

  if (state.history.length > 100) {
    state.history.pop();
  }

  renderTradeStats();
  renderActiveTrades();
  renderHistory();

  showToast(
    win
      ? `Demo trade WON +${profit.toFixed(2)}`
      : `Demo trade LOST ${profit.toFixed(2)}`
  );
}


/* =========================================================
   TRADE UI
   ========================================================= */

function renderTradeStats() {

  const total =
    state.stats.total;

  const wins =
    state.stats.wins;

  const losses =
    state.stats.losses;

  const accuracy =
    total > 0
      ? Math.round(
          (wins / total) * 100
        )
      : 0;

  safeText(
    "paperTotal",
    total
  );

  safeText(
    "paperWins",
    wins
  );

  safeText(
    "paperLosses",
    losses
  );

  safeText(
    "paperAccuracy",
    `${accuracy}%`
  );
}

function renderActiveTrades() {

  const list =
    $("activeTradesList");

  const count =
    $("activeTradeCount");

  if (count) {
    count.textContent =
      state.activeTrades.length;
  }

  if (!list) return;

  if (!state.activeTrades.length) {

    list.innerHTML =
      `<div style="padding:12px;color:var(--muted);font-size:10px">
        No active demo trades.
      </div>`;

    return;
  }

  list.innerHTML =
    state.activeTrades
      .map(trade => `
        <div class="active-trade">
          <div>
            <strong>
              ${escapeHTML(trade.strategy)}
            </strong>
            <br>
            <small>
              ${escapeHTML(trade.market)}
              · ${escapeHTML(trade.source)}
            </small>
          </div>

          <div>
            <strong>
              $${Number(trade.stake).toFixed(2)}
            </strong>
            <br>
            <small>
              ${trade.confidence || 0}%
            </small>
          </div>
        </div>
      `)
      .join("");
}


/* =========================================================
   AI BOT
   ========================================================= */

function startBot() {

  if (state.botRunning) {

    showToast(
      "AI Bot is already running."
    );

    return;
  }

  state.botRunning = true;

  safeText(
    "botStatusDash",
    "RUNNING"
  );

  safeText(
    "engineStatusText",
    "PAPER MODE"
  );

  showToast(
    "AI Bot started in paper mode."
  );

  /*
   * Run the first cycle after enough market data exists.
   */
  runBotCycle();

  state.botInterval =
    setInterval(
      runBotCycle,
      10000
    );
}

function stopBot() {

  state.botRunning = false;

  clearInterval(
    state.botInterval
  );

  safeText(
    "botStatusDash",
    "STOPPED"
  );
}

function runBotCycle() {

  if (!state.botRunning) {
    return;
  }

  if (
    state.ticks.length <
    10
  ) {

    safeText(
      "botStatusDash",
      "WAITING DATA"
    );

    return;
  }

  const strategy =
    chooseBotStrategy();

  const stake =
    getNumberInput(
      "stakeInput",
      1
    );

  placePaperTrade({
    market:
      state.selectedMarket,

    strategy,

    stake,

    targetDigit:
      Number(
        state.prediction
      ),

    source:
      "AI BOT"
  });
}

function chooseBotStrategy() {

  if (
    !state.botStrategies.length
  ) {
    return "MATCHES";
  }

  /*
   * Select the strategy from the currently configured list.
   */
  const index =
    Math.floor(
      Math.random() *
      state.botStrategies.length
    );

  return state.botStrategies[index];
}


/* =========================================================
   MANUAL TRADE
   ========================================================= */

function placeManualTrade() {

  const strategy =
    state.selectedStrategy;

  const stake =
    getNumberInput(
      "manualStakeInput",
      1
    );

  const target =
    getNumberInput(
      "manualTargetDigitInput",
      5
    );

  placePaperTrade({
    market:
      state.selectedMarket,

    strategy,

    stake,

    targetDigit:
      target,

    source:
      "MANUAL"
  });
}


/* =========================================================
   CIRCULAR TRADING
   ========================================================= */

function startCircularTrading() {

  if (state.circularRunning) {

    showToast(
      "Circular trading is already running."
    );

    return;
  }

  state.circularRunning = true;

  safeText(
    "circularStatusText",
    "RUNNING"
  );

  showToast(
    "Circular demo trading started."
  );

  runCircularCycle();

  state.circularInterval =
    setInterval(
      runCircularCycle,
      12000
    );
}

function stopCircularTrading() {

  state.circularRunning = false;

  clearInterval(
    state.circularInterval
  );

  safeText(
    "circularStatusText",
    "READY"
  );
}

function runCircularCycle() {

  if (!state.circularRunning) {
    return;
  }

  if (state.ticks.length < 10) {
    return;
  }

  const stake =
    getNumberInput(
      "circularStakeInput",
      1
    );

  placePaperTrade({
    market:
      state.selectedMarket,

    strategy:
      state.selectedStrategy,

    stake,

    targetDigit:
      Number(state.prediction),

    source:
      "CIRCULAR AI"
  });
}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {

  const list =
    $("historyCardsList");

  if (!list) return;

  if (!state.history.length) {

    list.innerHTML =
      `<div style="padding:12px;color:var(--muted);font-size:10px">
        No completed demo trades.
      </div>`;

  } else {

    list.innerHTML =
      state.history
        .map(trade => {

          const win =
            trade.status === "WIN";

          return `
            <div class="history-card ${
              win
                ? "history-win"
                : "history-loss"
            }">

              <div class="history-top">

                <strong>
                  ${escapeHTML(trade.strategy)}
                </strong>

                <strong class="result">
                  ${
                    win
                      ? "WIN"
                      : "LOSS"
                  }
                </strong>

              </div>

              <div class="history-details">

                <div>
                  <span>MARKET</span>
                  <strong>
                    ${escapeHTML(trade.market)}
                  </strong>
                </div>

                <div>
                  <span>STAKE</span>
                  <strong>
                    $${Number(
                      trade.stake
                    ).toFixed(2)}
                  </strong>
                </div>

                <div>
                  <span>PROFIT</span>
                  <strong class="${
                    win
                      ? "positive"
                      : "negative"
                  }">
                    ${
                      Number(
                        trade.profit
                      ) >= 0
                        ? "+"
                        : ""
                    }${
                      Number(
                        trade.profit
                      ).toFixed(2)
                    }
                  </strong>
                </div>

                <div>
                  <span>CONFIDENCE</span>
                  <strong>
                    ${trade.confidence || 0}%
                  </strong>
                </div>

              </div>

            </div>
          `;
        })
        .join("");
  }

  let totalStake = 0;
  let amountWon = 0;
  let netProfit = 0;

  state.history.forEach(
    trade => {

      totalStake +=
        Number(trade.stake) || 0;

      if (
        Number(trade.profit) > 0
      ) {
        amountWon +=
          Number(trade.profit);
      }

      netProfit +=
        Number(trade.profit) || 0;
    }
  );

  safeText(
    "historyTotalStake",
    formatMoney(totalStake)
  );

  safeText(
    "historyAmountWon",
    formatMoney(amountWon)
  );

  safeText(
    "historyNetProfit",
    formatMoney(netProfit)
  );

  safeText(
    "sessionProfitDisplay",
    formatMoney(netProfit)
  );

  safeText(
    "totalProfitDisplay",
    formatMoney(netProfit)
  );
}

function clearHistory() {

  if (!confirm(
    "Clear all demo trading history?"
  )) {
    return;
  }

  state.history = [];

  state.stats = {
    total: 0,
    wins: 0,
    losses: 0
  };

  renderTradeStats();
  renderHistory();

  showToast(
    "Demo history cleared."
  );
}


/* =========================================================
   TABS
   ========================================================= */

function setupTradeTabs() {

  const mappings = [

    {
      button: "tabAiBot",
      panel: "aiBotPanel"
    },

    {
      button: "tabCircularAI",
      panel: "circularPanel"
    },

    {
      button: "tabManual",
      panel: "manualPanel"
    }
  ];

  mappings.forEach(item => {

    const button =
      $(item.button);

    if (!button) return;

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(".trade-tabs .tab")
          .forEach(tab => {
            tab.classList.remove(
              "active"
            );
          });

        document
          .querySelectorAll(".trade-panel")
          .forEach(panel => {
            panel.classList.remove(
              "active"
            );
          });

        button.classList.add(
          "active"
        );

        const panel =
          $(item.panel);

        if (panel) {
          panel.classList.add(
            "active"
          );
        }
      }
    );
  });
}


/* =========================================================
   BUTTON EVENTS
   ========================================================= */

function setupButtons() {

  const connect =
    $("connectDerivBtn");

  if (connect) {

    connect.addEventListener(
      "click",
      startDerivLogin
    );
  }

  const startAI =
    $("startAI");

  if (startAI) {

    startAI.addEventListener(
      "click",
      startCircularAI
    );
  }

  const stopAI =
    $("stopAI");

  if (stopAI) {

    stopAI.addEventListener(
      "click",
      stopCircularAI
    );
  }

  const bot =
    $("startBotBtn");

  if (bot) {

    bot.addEventListener(
      "click",
      () => {

        if (state.botRunning) {
          stopBot();
          bot.textContent =
            "START AI BOT";
        } else {
          startBot();
          bot.textContent =
            "STOP AI BOT";
        }
      }
    );
  }

  const circular =
    $("startCircularTradeBtn");

  if (circular) {

    circular.addEventListener(
      "click",
      () => {

        if (state.circularRunning) {

          stopCircularTrading();

          circular.textContent =
            "START CIRCULAR TRADING";

        } else {

          startCircularTrading();

          circular.textContent =
            "STOP CIRCULAR TRADING";
        }
      }
    );
  }

  const manual =
    $("placeTradeBtn");

  if (manual) {

    manual.addEventListener(
      "click",
      placeManualTrade
    );
  }

  const clear =
    $("clearLogsBtn");

  if (clear) {

    clear.addEventListener(
      "click",
      clearHistory
    );
  }

  const stopTrading =
    $("stopTradingBtn");

  if (stopTrading) {

    stopTrading.addEventListener(
      "click",
      () => {

        stopBot();
        stopCircularTrading();
        stopCircularAI();

        showToast(
          "All demo trading engines stopped."
        );
      }
    );
  }
}


/* =========================================================
   REAL MODE CONFIRMATION
   ========================================================= */

function setupRealConfirmation() {

  const cancel =
    $("cancelRealBtn");

  const confirm =
    $("confirmRealBtn");

  if (cancel) {

    cancel.addEventListener(
      "click",
      () => {

        const modal =
          $("realConfirmModal");

        if (modal) {
          modal.classList.remove(
            "show"
          );
        }
      }
    );
  }

  if (confirm) {

    confirm.addEventListener(
      "click",
      () => {

        const modal =
          $("realConfirmModal");

        if (modal) {
          modal.classList.remove(
            "show"
          );
        }

        showToast(
          "Real trading is disabled in this demo engine."
        );
      }
    );
  }
}


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   RESIZE
   ========================================================= */

window.addEventListener(
  "resize",
  () => {
    updateChart();
  }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initializeApp() {

  console.log(
    "KRISHWAVE AI BEAST V7.1 starting..."
  );

  populateMarkets();
  syncMarketSelectors();

  setupNavigation();
  setupTheme();
  setupStrategyModal();
  setupBotStrategyModal();
  setupTradeTabs();
  setupButtons();
  setupRealConfirmation();

  renderDigitDistribution();
  renderTradeStats();
  renderActiveTrades();
  renderHistory();

  updateAccountUI();

  /*
   * Check whether Deriv redirected us back with
   * ?code=...&state=...
   */
  await handleOAuthCallback();

  /*
   * Restore access token if a previous authenticated
   * session exists.
   *
   * NOTE:
   * This is sessionStorage only, so it disappears when the
   * browser session ends.
   */
  const savedToken =
    sessionStorage.getItem(
      "krishwave_access_token"
    );

  if (savedToken) {

    state.accessToken =
      savedToken;

    /*
     * We know a token exists, but don't claim account
     * authentication until the authenticated API/WebSocket
     * succeeds.
     */
  }

  /*
   * Public market data requires NO login.
   */
  connectPublicWebSocket();

  safeText(
    "dataStatus",
    "Connecting to live Deriv market data..."
  );

  /*
   * Give the chart a first render.
   */
  updateChart();
}


/* =========================================================
   START
   ========================================================= */

if (
  document.readyState === "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp
  );

} else {

  initializeApp();
}


/* =========================================================
   GLOBAL API
   ========================================================= */

window.KRISHWAVE = {

  state,

  config: CONFIG,

  login:
    startDerivLogin,

  finishOAuthLogin,

  connectAuthenticatedWebSocket,

  applyBalanceResponse,

  startCircularAI,

  stopCircularAI,

  startBot,

  stopBot,

  startCircularTrading,

  stopCircularTrading,

  placeManualTrade,

  resetMarketAnalysis
};