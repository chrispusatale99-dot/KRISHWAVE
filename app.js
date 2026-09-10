/* =========================================================
   KRISHWAVE AI BEAST V7.2
   LIVE DERIV MARKET INTELLIGENCE
   DEMO / PAPER TRADING ENGINE

   IMPORTANT
   ---------------------------------------------------------
   - Deriv OAuth uses PKCE.
   - Access tokens NEVER go into localStorage.
   - Real mode is display/selection only.
   - NO REAL TRADES ARE EXECUTED.
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const BACKEND_URL =
  "https://krishwave-production.up.railway.app";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const DERIV_AUTH_URL =
  "https://auth.deriv.com/oauth2/auth";


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


const DEFAULT_BOT_POOL = [
  "MATCHES",
  "DIFFERS"
];


const MIN_STAKE = 0.25;

const PAPER_START_BALANCE = 1000;

const STORAGE_HISTORY =
  "krishwave_v72_history";

const STORAGE_BALANCE =
  "krishwave_v72_balance";

const STORAGE_THEME =
  "krishwave_v72_theme";

const STORAGE_SETTINGS =
  "krishwave_v72_settings";

const STORAGE_MODE =
  "krishwave_v72_mode";


/* Paper profit assumptions */
const PAYOUT_MULTIPLIER = {
  MATCHES: 8.5,
  DIFFERS: 0.09,
  OVER: 0.95,
  UNDER: 0.95,
  EVEN: 0.95,
  ODD: 0.95
};


/* =========================================================
   STATE
   ========================================================= */

const state = {

  backendConfig: null,

  sessionId: null,

  accountInfo: null,

  authenticatedWs: null,

  publicWs: null,

  publicConnected: false,

  authConnected: false,

  selectedMarket: "R_10",

  selectedStrategy: "MATCHES",

  botStrategyPool: [...DEFAULT_BOT_POOL],

  currentEngine: "bot",

  currentPage: "analysis",

  mode: "demo",

  theme: "dark",

  paperBalance: PAPER_START_BALANCE,

  history: [],

  activeTrades: [],

  marketData: new Map(),

  circularRunning: false,

  circularStage: "READY",

  circularRemaining: 10,

  circularTimer: null,

  botRunning: false,

  botTimer: null,

  circularTradeTimer: null,

  lastBotTradeAt: 0,

  lastScanAt: 0,

  selectedManualMarket: "R_10",

  selectedCircularMarket: "R_10",

  strategyModalTarget: null,

  sessionProfit: 0,

  totalProfit: 0,

  wins: 0,

  losses: 0,

  totalTrades: 0,

  totalStake: 0,

  totalAmountWon: 0,

  tradeSequence: 0,

  toastTimer: null
};


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}


function qs(selector) {
  return document.querySelector(selector);
}


function qsa(selector) {
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


function show(el) {
  if (!el) return;

  el.classList.add("show");

  el.setAttribute(
    "aria-hidden",
    "false"
  );
}


function hide(el) {
  if (!el) return;

  el.classList.remove("show");

  el.setAttribute(
    "aria-hidden",
    "true"
  );
}


function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}


function money(value) {
  return `$${safeNumber(value).toFixed(2)}`;
}


function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   TOAST
   ========================================================= */

function toast(message) {

  const box = $("toast");
  const text = $("toastMessage");

  if (!box || !text) return;

  text.textContent = message;

  box.classList.add("show");

  clearTimeout(state.toastTimer);

  state.toastTimer =
    setTimeout(() => {
      box.classList.remove("show");
    }, 2800);
}


/* =========================================================
   CONNECTION UI
   ========================================================= */

function setConnectionStatus(
  status,
  message
) {

  const dot =
    $("connectionDot");

  const text =
    $("connectionText");

  if (dot) {

    dot.classList.remove(
      "online",
      "offline",
      "connecting"
    );

    dot.classList.add(status);
  }

  if (text) {
    text.textContent =
      message || "";
  }
}


function setDataStatus(message) {

  const el =
    $("dataStatus");

  if (el) {
    el.textContent = message;
  }
}


/* =========================================================
   LOCAL STORAGE
   ========================================================= */

function loadStorage() {

  try {

    const savedHistory =
      localStorage.getItem(
        STORAGE_HISTORY
      );

    if (savedHistory) {

      const parsed =
        JSON.parse(savedHistory);

      if (Array.isArray(parsed)) {
        state.history = parsed;
      }
    }

  } catch (error) {

    console.warn(
      "History load failed",
      error
    );

  }


  try {

    const savedBalance =
      localStorage.getItem(
        STORAGE_BALANCE
      );

    if (
      savedBalance !== null &&
      Number.isFinite(Number(savedBalance))
    ) {

      state.paperBalance =
        Number(savedBalance);
    }

  } catch (error) {

    console.warn(
      "Balance load failed",
      error
    );

  }


  try {

    const savedTheme =
      localStorage.getItem(
        STORAGE_THEME
      );

    if (
      savedTheme === "light" ||
      savedTheme === "dark"
    ) {

      state.theme =
        savedTheme;
    }

  } catch (error) {}


  try {

    const savedMode =
      localStorage.getItem(
        STORAGE_MODE
      );

    if (
      savedMode === "demo" ||
      savedMode === "real"
    ) {

      state.mode =
        savedMode;
    }

  } catch (error) {}


  calculateStats();

  applyTheme();

  updateModeUI();

  updateBalanceUI();

  renderHistory();
}


function saveHistory() {

  try {

    localStorage.setItem(
      STORAGE_HISTORY,
      JSON.stringify(state.history)
    );

  } catch (error) {

    console.warn(
      "Unable to save history",
      error
    );
  }
}


function saveBalance() {

  try {

    localStorage.setItem(
      STORAGE_BALANCE,
      String(state.paperBalance)
    );

  } catch (error) {

    console.warn(
      "Unable to save balance",
      error
    );
  }
}


function saveSettings() {

  try {

    localStorage.setItem(
      STORAGE_SETTINGS,
      JSON.stringify({
        selectedMarket:
          state.selectedMarket,

        selectedStrategy:
          state.selectedStrategy,

        botStrategyPool:
          state.botStrategyPool
      })
    );

  } catch (error) {}
}


/* =========================================================
   THEME
   ========================================================= */

function applyTheme() {

  document.body.classList.toggle(
    "light-theme",
    state.theme === "light"
  );

  const button =
    $("themeToggle");

  if (button) {

    button.textContent =
      state.theme === "light"
        ? "☾"
        : "☀";
  }

  try {

    localStorage.setItem(
      STORAGE_THEME,
      state.theme
    );

  } catch (error) {}
}


function toggleTheme() {

  state.theme =
    state.theme === "dark"
      ? "light"
      : "dark";

  applyTheme();
}


/* =========================================================
   MODE
   ========================================================= */

function updateModeUI() {

  const demo =
    $("demoModeBtn");

  const real =
    $("realModeBtn");

  if (demo) {
    demo.classList.toggle(
      "active",
      state.mode === "demo"
    );
  }

  if (real) {
    real.classList.toggle(
      "active",
      state.mode === "real"
    );
  }


  const label =
    $("tradingStatusLabel");

  if (label) {

    label.classList.remove(
      "demo-mode",
      "real-mode"
    );

    if (state.mode === "demo") {

      label.classList.add(
        "demo-mode"
      );

      label.textContent =
        "DEMO PAPER";

    } else {

      label.classList.add(
        "real-mode"
      );

      label.textContent =
        "REAL • PAPER ONLY";
    }
  }


  const engineStatus =
    $("engineStatusText");

  if (
    engineStatus &&
    state.mode === "real"
  ) {

    engineStatus.textContent =
      "REAL ACCOUNT SELECTED — PAPER EXECUTION ONLY";
  }
}


function selectDemoMode() {

  state.mode = "demo";

  try {
    localStorage.setItem(
      STORAGE_MODE,
      "demo"
    );
  } catch (error) {}

  updateModeUI();

  toast(
    "DEMO mode selected"
  );
}


function requestRealMode() {

  const modal =
    $("realConfirmModal");

  if (modal) {

    show(modal);

  } else {

    selectRealMode();
  }
}


function selectRealMode() {

  state.mode = "real";

  try {
    localStorage.setItem(
      STORAGE_MODE,
      "real"
    );
  } catch (error) {}

  updateModeUI();

  hide(
    $("realConfirmModal")
  );

  toast(
    "REAL selected — paper execution only"
  );

  setDataStatus(
    "REAL ACCOUNT SELECTED — KRISHWAVE remains PAPER ONLY."
  );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function showPage(page) {

  const pages =
    qsa(".page");

  pages.forEach(
    p => p.classList.remove("active")
  );

  const target =
    $(`${page}Page`);

  if (target) {
    target.classList.add("active");
  }

  qsa(".nav-btn").forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );

    }
  );

  state.currentPage =
    page;
}


function initNavigation() {

  qsa(".nav-btn").forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const page =
            button.dataset.page;

          if (page) {
            showPage(page);
          }

        }
      );

    }
  );
}


/* =========================================================
   ENGINE NAVIGATION
   ========================================================= */

function switchEngine(engine) {

  state.currentEngine =
    engine;

  qsa(".engine-tab").forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.engine === engine
      );

    }
  );

  qsa(".engine-panel").forEach(
    panel => {

      panel.classList.toggle(
        "active",
        panel.dataset.panel === engine
      );

    }
  );

  const status =
    $("engineStatusText");

  if (status) {

    const names = {
      bot: "AI BOT READY",
      circular: "CIRCULAR AI READY",
      manual: "MANUAL ENGINE READY"
    };

    status.textContent =
      names[engine] ||
      "ENGINE READY";
  }
}


function initEngineTabs() {

  qsa(".engine-tab").forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          switchEngine(
            button.dataset.engine
          );

        }
      );

    }
  );
}


/* =========================================================
   MARKET SELECTORS
   ========================================================= */

function populateSelect(
  id,
  selected
) {

  const select =
    $(id);

  if (!select) return;

  select.innerHTML = "";

  MARKETS.forEach(
    market => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        market;

      option.textContent =
        market;

      option.selected =
        market === selected;

      select.appendChild(
        option
      );

    }
  );
}


function populateMarketSelectors() {

  populateSelect(
    "circularMarketSelect",
    state.selectedCircularMarket
  );

  populateSelect(
    "manualMarketSelect",
    state.selectedManualMarket
  );

  updateSelectedMarketUI();
}


function updateSelectedMarketUI() {

  setText(
    "currentChartMarket",
    state.selectedMarket
  );

  setText(
    "aiMarket",
    state.selectedMarket
  );

  setText(
    "botSelectedMarket",
    state.selectedMarket
  );
}


function initMarketSelectors() {

  const circular =
    $("circularMarketSelect");

  if (circular) {

    circular.addEventListener(
      "change",
      () => {

        state.selectedCircularMarket =
          circular.value;

        saveSettings();

      }
    );
  }


  const manual =
    $("manualMarketSelect");

  if (manual) {

    manual.addEventListener(
      "change",
      () => {

        state.selectedManualMarket =
          manual.value;

      }
    );
  }
}


/* =========================================================
   BACKEND CONFIG
   ========================================================= */

async function loadBackendConfig() {

  try {

    setConnectionStatus(
      "connecting",
      "Checking KRISHWAVE OAuth backend..."
    );

    const response =
      await fetch(
        `${BACKEND_URL}/api/config`,
        {
          method: "GET",
          cache: "no-store"
        }
      );

    if (!response.ok) {

      throw new Error(
        `Backend returned ${response.status}`
      );
    }

    const config =
      await response.json();

    if (!config.success) {

      throw new Error(
        config.error ||
        "Backend configuration failed"
      );
    }

    state.backendConfig =
      config;

    setConnectionStatus(
      state.publicConnected
        ? "online"
        : "connecting",
      state.publicConnected
        ? "Live market feed connected."
        : "OAuth backend ready."
    );

    return config;

  } catch (error) {

    console.error(
      "Backend config error:",
      error
    );

    setConnectionStatus(
      state.publicConnected
        ? "online"
        : "offline",
      state.publicConnected
        ? "Live market feed connected."
        : "OAuth backend unavailable."
    );

    toast(
      "OAuth backend could not be reached"
    );

    return null;
  }
}


/* =========================================================
   PKCE HELPERS
   ========================================================= */

function randomString(length = 64) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const bytes =
    new Uint8Array(length);

  crypto.getRandomValues(bytes);

  let result = "";

  for (let i = 0; i < bytes.length; i++) {

    result +=
      chars[
        bytes[i] % chars.length
      ];
  }

  return result;
}


function base64UrlEncode(buffer) {

  let binary = "";

  const bytes =
    new Uint8Array(buffer);

  bytes.forEach(
    byte => {
      binary +=
        String.fromCharCode(byte);
    }
  );

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


async function createCodeChallenge(
  verifier
) {

  const data =
    new TextEncoder()
      .encode(verifier);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return base64UrlEncode(
    digest
  );
}


/* =========================================================
   START DERIV OAUTH
   ========================================================= */

async function connectDeriv() {

  try {

    const button =
      $("connectDerivBtn");

    if (button) {

      button.disabled = true;

      button.textContent =
        "CONNECTING...";
    }

    setConnectionStatus(
      "connecting",
      "Preparing secure Deriv authorization..."
    );


    if (!state.backendConfig) {

      await loadBackendConfig();
    }


    const config =
      state.backendConfig;

    if (!config) {

      throw new Error(
        "KRISHWAVE backend configuration unavailable"
      );
    }


    const clientId =
      config.client_id;

    const redirectUri =
      config.redirect_uri;


    if (!clientId) {

      throw new Error(
        "Missing Deriv client ID from backend"
      );
    }


    if (!redirectUri) {

      throw new Error(
        "Missing registered redirect URI"
      );
    }


    const verifier =
      randomString(64);

    const challenge =
      await createCodeChallenge(
        verifier
      );

    const stateToken =
      randomString(48);


    /*
      Store only temporary OAuth values.

      These are not secrets and expire when
      the browser session ends.
    */

    sessionStorage.setItem(
      "krishwave_pkce_verifier",
      verifier
    );

    sessionStorage.setItem(
      "krishwave_oauth_state",
      stateToken
    );


    const params =
      new URLSearchParams();

    params.set(
      "response_type",
      "code"
    );

    params.set(
      "client_id",
      clientId
    );

    params.set(
      "redirect_uri",
      redirectUri
    );

    /*
      Request only the permissions needed
      for account/trading functionality.
    */

    params.set(
      "scope",
      "trade account_manage application_read"
    );

    params.set(
      "state",
      stateToken
    );

    params.set(
      "code_challenge",
      challenge
    );

    params.set(
      "code_challenge_method",
      "S256"
    );


    const authUrl =
      `${DERIV_AUTH_URL}?${params.toString()}`;


    /*
      Full-page redirect is intentional.
      Deriv OAuth should not be loaded inside
      an iframe.
    */

    window.location.assign(
      authUrl
    );

  } catch (error) {

    console.error(
      "Deriv connect error:",
      error
    );

    const button =
      $("connectDerivBtn");

    if (button) {

      button.disabled = false;

      button.textContent =
        "CONNECT DERIV";
    }

    setConnectionStatus(
      "offline",
      error.message ||
      "Unable to start Deriv connection."
    );

    toast(
      error.message ||
      "Unable to start Deriv connection"
    );
  }
}


/* =========================================================
   OAUTH CALLBACK
   ========================================================= */

async function handleOAuthCallback() {

  const url =
    new URL(
      window.location.href
    );

  const code =
    url.searchParams.get("code");

  const returnedState =
    url.searchParams.get("state");

  const oauthError =
    url.searchParams.get("error");

  const oauthDescription =
    url.searchParams.get(
      "error_description"
    );


  if (oauthError) {

    console.error(
      "Deriv OAuth error:",
      oauthError,
      oauthDescription
    );

    cleanOAuthUrl();

    setConnectionStatus(
      state.publicConnected
        ? "online"
        : "offline",
      oauthDescription ||
      oauthError
    );

    toast(
      oauthDescription ||
      `Deriv authorization failed: ${oauthError}`
    );

    resetConnectButton();

    return false;
  }


  if (!code) {
    return false;
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
    !returnedState ||
    returnedState !== savedState
  ) {

    console.error(
      "OAuth state mismatch"
    );

    cleanOAuthStorage();

    cleanOAuthUrl();

    toast(
      "Security check failed. Please reconnect."
    );

    resetConnectButton();

    return false;
  }


  if (!verifier) {

    cleanOAuthUrl();

    toast(
      "OAuth session expired. Please reconnect."
    );

    resetConnectButton();

    return false;
  }


  try {

    setConnectionStatus(
      "connecting",
      "Authorization received. Connecting account..."
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


    if (!response.ok || !data.success) {

      throw new Error(
        data.error ||
        `OAuth exchange failed (${response.status})`
      );
    }


    if (!data.session_id) {

      throw new Error(
        "Backend did not return a session"
      );
    }


    state.sessionId =
      data.session_id;


    cleanOAuthStorage();

    cleanOAuthUrl();


    toast(
      "Deriv authorization successful"
    );


    await loadDerivAccounts();


    return true;

  } catch (error) {

    console.error(
      "OAuth callback error:",
      error
    );

    cleanOAuthStorage();

    cleanOAuthUrl();

    setConnectionStatus(
      state.publicConnected
        ? "online"
        : "offline",
      error.message ||
      "Deriv account connection failed."
    );

    toast(
      error.message ||
      "Deriv account connection failed"
    );

    resetConnectButton();

    return false;
  }
}


function cleanOAuthStorage() {

  sessionStorage.removeItem(
    "krishwave_pkce_verifier"
  );

  sessionStorage.removeItem(
    "krishwave_oauth_state"
  );
}


function cleanOAuthUrl() {

  try {

    const clean =
      `${window.location.origin}${window.location.pathname}`;

    window.history.replaceState(
      {},
      document.title,
      clean
    );

  } catch (error) {

    console.warn(
      "Unable to clean OAuth URL",
      error
    );
  }
}


function resetConnectButton() {

  const button =
    $("connectDerivBtn");

  if (button) {

    button.disabled = false;

    button.textContent =
      "CONNECT DERIV";
  }
}


/* =========================================================
   DERIV ACCOUNTS
   ========================================================= */

async function loadDerivAccounts() {

  if (!state.sessionId) {

    throw new Error(
      "No KRISHWAVE Deriv session"
    );
  }


  try {

    setConnectionStatus(
      "connecting",
      "Retrieving Deriv accounts..."
    );


    const response =
      await fetch(
        `${BACKEND_URL}/api/accounts`,
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


    const data =
      await response.json();


    if (!response.ok || !data.success) {

      throw new Error(
        data.error ||
        "Unable to retrieve Deriv accounts"
      );
    }


    let accounts =
      data.accounts;


    if (!Array.isArray(accounts)) {

      if (
        accounts &&
        Array.isArray(accounts.accounts)
      ) {

        accounts =
          accounts.accounts;

      } else {

        accounts = [];
      }
    }


    if (!accounts.length) {

      throw new Error(
        "No Deriv accounts were returned"
      );
    }


    /*
      Prefer a demo account when available.
    */

    const demoAccount =
      accounts.find(
        account =>
          isDemoAccount(account)
      );


    const selected =
      demoAccount ||
      accounts[0];


    state.accountInfo =
      normalizeAccount(selected);


    updateAccountUI();

    toast(
      `Connected: ${state.accountInfo.id}`
    );


    await connectAuthenticatedWebSocket();


    return state.accountInfo;

  } catch (error) {

    console.error(
      "Accounts error:",
      error
    );

    setConnectionStatus(
      state.publicConnected
        ? "online"
        : "offline",
      error.message
    );

    toast(
      error.message ||
      "Could not load Deriv account"
    );

    resetConnectButton();

    throw error;
  }
}


function isDemoAccount(account) {

  if (!account) return false;

  const text =
    JSON.stringify(account)
      .toLowerCase();

  return (
    text.includes("demo") ||
    text.includes("virtual") ||
    text.includes("practice")
  );
}


function normalizeAccount(account) {

  const id =
    account.loginid ||
    account.login_id ||
    account.account_id ||
    account.id ||
    account.login ||
    "Connected";


  const currency =
    account.currency ||
    account.currency_code ||
    "USD";


  const balance =
    safeNumber(
      account.balance ??
      account.amount ??
      account.available_balance,
      0
    );


  const demo =
    isDemoAccount(account);


  return {
    id,
    currency,
    balance,
    demo,
    raw: account
  };
}


function updateAccountUI() {

  const account =
    state.accountInfo;

  if (!account) {

    setText(
      "accountId",
      "Not connected"
    );

    setText(
      "balanceDisplay",
      "$0.00"
    );

    setText(
      "currency",
      "USD"
    );

    return;
  }


  setText(
    "accountId",
    account.id
  );


  setText(
    "currency",
    account.currency
  );


  setText(
    "balanceDisplay",
    `${account.currency} ${account.balance.toFixed(2)}`
  );


  const button =
    $("connectDerivBtn");

  if (button) {

    button.textContent =
      "DERIV CONNECTED";

    button.disabled =
      false;
  }


  setConnectionStatus(
    "online",
    "Deriv account connected."
  );
}


/* =========================================================
   AUTHENTICATED WEBSOCKET
   ========================================================= */

async function connectAuthenticatedWebSocket() {

  if (!state.sessionId) {
    return;
  }


  if (!state.accountInfo?.id) {
    return;
  }


  try {

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
              state.accountInfo.id
          })
        }
      );


    const data =
      await response.json();


    if (!response.ok || !data.success) {

      throw new Error(
        data.error ||
        "Unable to authenticate Deriv WebSocket"
      );
    }


    const websocketUrl =
      data.websocket_url;


    if (!websocketUrl) {

      throw new Error(
        "No authenticated WebSocket URL returned"
      );
    }


    if (state.authenticatedWs) {

      try {
        state.authenticatedWs.close();
      } catch (error) {}

    }


    const ws =
      new WebSocket(
        websocketUrl
      );


    state.authenticatedWs =
      ws;


    ws.addEventListener(
      "open",
      () => {

        state.authConnected =
          true;

        console.log(
          "Authenticated Deriv WebSocket connected"
        );

        setConnectionStatus(
          "online",
          "Deriv account + live data connected."
        );

        setDataStatus(
          "Live Deriv market feed connected."
        );

      }
    );


    ws.addEventListener(
      "message",
      event => {

        handleAuthenticatedMessage(
          event.data
        );

      }
    );


    ws.addEventListener(
      "close",
      () => {

        state.authConnected =
          false;

        console.log(
          "Authenticated WebSocket closed"
        );

      }
    );


    ws.addEventListener(
      "error",
      error => {

        console.error(
          "Authenticated WebSocket error",
          error
        );

      }
    );


  } catch (error) {

    console.error(
      "Authenticated WebSocket error:",
      error
    );

    toast(
      error.message ||
      "Account WebSocket connection failed"
    );
  }
}


function handleAuthenticatedMessage(
  raw
) {

  let data;

  try {

    data =
      typeof raw === "string"
        ? JSON.parse(raw)
        : raw;

  } catch (error) {

    return;
  }


  /*
    Some authenticated account messages can contain
    balance information.
  */

  if (
    data &&
    data.balance
  ) {

    const balance =
      safeNumber(
        data.balance.balance ??
        data.balance.amount
      );

    if (
      Number.isFinite(balance)
    ) {

      state.accountInfo.balance =
        balance;

      updateAccountUI();
    }
  }


  if (
    data &&
    data.authorize
  ) {

    console.log(
      "Deriv authorize message received"
    );
  }
}


/* =========================================================
   PUBLIC LIVE MARKET WEBSOCKET
   ========================================================= */

function ensureMarketState(
  market
) {

  if (!state.marketData.has(market)) {

    state.marketData.set(
      market,
      {
        market,

        ticks: [],

        prices: [],

        digits: [],

        digitCounts:
          Array(10).fill(0),

        lastPrice: null,

        lastDigit: null,

        pipSize: null,

        epoch: null,

        updatedAt: 0,

        received: 0,

        precision: 3
      }
    );
  }


  return state.marketData.get(
    market
  );
}


/* =========================================================
   PUBLIC WS CONNECT
   ========================================================= */

function connectPublicWebSocket() {

  if (
    state.publicWs &&
    (
      state.publicWs.readyState ===
        WebSocket.OPEN ||
      state.publicWs.readyState ===
        WebSocket.CONNECTING
    )
  ) {

    return;
  }


  setConnectionStatus(
    "connecting",
    "Connecting to live Deriv market feed..."
  );


  try {

    const ws =
      new WebSocket(
        PUBLIC_WS
      );


    state.publicWs =
      ws;


    ws.addEventListener(
      "open",
      () => {

        state.publicConnected =
          true;

        console.log(
          "Public Deriv market feed connected"
        );

        setConnectionStatus(
          "online",
          state.sessionId
            ? "Deriv account + live market feed connected."
            : "Live Deriv market feed connected."
        );

        setDataStatus(
          "Live Deriv market feed connected."
        );


        subscribeToMarkets(
          ws
        );

      }
    );


    ws.addEventListener(
      "message",
      event => {

        handlePublicMessage(
          event.data
        );

      }
    );


    ws.addEventListener(
      "close",
      () => {

        state.publicConnected =
          false;

        setConnectionStatus(
          state.sessionId
            ? "connecting"
            : "offline",
          state.sessionId
            ? "Account connected; reconnecting live feed..."
            : "Live market feed disconnected."
        );


        setDataStatus(
          "Reconnecting to live Deriv market feed..."
        );


        setTimeout(
          () => {

            connectPublicWebSocket();

          },
          2500
        );

      }
    );


    ws.addEventListener(
      "error",
      error => {

        console.error(
          "Public WS error:",
          error
        );

      }
    );


  } catch (error) {

    console.error(
      "Public WS creation error:",
      error
    );

    state.publicConnected =
      false;

    setTimeout(
      connectPublicWebSocket,
      3000
    );
  }
}


/* =========================================================
   MARKET SUBSCRIPTIONS
   ========================================================= */

function subscribeToMarkets(ws) {

  MARKETS.forEach(
    (market, index) => {

      setTimeout(
        () => {

          if (
            ws.readyState !==
            WebSocket.OPEN
          ) {
            return;
          }


          const request = {

            ticks_history:
              market,

            count: 120,

            end: "latest",

            style: "ticks",

            subscribe: 1,

            req_id:
              1000 + index

          };


          ws.send(
            JSON.stringify(request)
          );

        },
        index * 100
      );

    }
  );
}


/* =========================================================
   PUBLIC MESSAGE HANDLER
   ========================================================= */

function handlePublicMessage(
  raw
) {

  let data;

  try {

    data =
      typeof raw === "string"
        ? JSON.parse(raw)
        : raw;

  } catch (error) {

    return;
  }


  if (
    data.error
  ) {

    console.warn(
      "Deriv market error:",
      data.error
    );

    return;
  }


  const history =
    data.history;


  if (
    history &&
    Array.isArray(history.prices)
  ) {

    const market =
      extractMarket(
        data,
        history
      );


    if (market) {

      bootstrapMarketHistory(
        market,
        history
      );
    }

    return;
  }


  const tick =
    data.tick;


  if (tick) {

    handleLiveTick(
      tick,
      data
    );
  }
}


/* =========================================================
   MARKET IDENTIFICATION
   ========================================================= */

function extractMarket(
  data,
  history
) {

  return (
    data.echo_req?.ticks_history ||
    data.echo_req?.symbol ||
    data.subscription?.symbol ||
    history.symbol ||
    null
  );
}


/* =========================================================
   HISTORY BOOTSTRAP
   ========================================================= */

function bootstrapMarketHistory(
  market,
  history
) {

  const m =
    ensureMarketState(
      market
    );


  const prices =
    Array.isArray(history.prices)
      ? history.prices
      : [];


  const times =
    Array.isArray(history.times)
      ? history.times
      : [];


  m.ticks = [];

  m.prices = [];

  m.digits = [];

  m.digitCounts =
    Array(10).fill(0);


  prices.forEach(
    (price, index) => {

      const numericPrice =
        safeNumber(
          price,
          NaN
        );

      if (
        !Number.isFinite(
          numericPrice
        )
      ) {
        return;
      }


      const epoch =
        safeNumber(
          times[index],
          Date.now() / 1000
        );


      const digit =
        deriveLastDigit(
          numericPrice,
          market
        );


      m.prices.push(
        numericPrice
      );

      m.digits.push(
        digit
      );

      m.ticks.push({
        price:
          numericPrice,

        digit,

        epoch
      });

      m.digitCounts[digit]++;

      m.received++;
      m.lastPrice =
        numericPrice;

      m.lastDigit =
        digit;

      m.epoch =
        epoch;

      m.updatedAt =
        Date.now();
    }
  );


  trimMarket(
    m
  );


  renderMarket(
    market
  );


  /*
    If this is the selected market,
    update the main AI.
  */

  if (
    market ===
    state.selectedMarket
  ) {

    updateAIAnalysis();
    drawChart();
  }
}


/* =========================================================
   LIVE TICK
   ========================================================= */

function handleLiveTick(
  tick,
  data
) {

  const market =
    tick.symbol ||
    data.echo_req?.ticks_history ||
    data.echo_req?.symbol ||
    data.subscription?.symbol;


  if (!market) {
    return;
  }


  const price =
    safeNumber(
      tick.quote,
      NaN
    );


  if (
    !Number.isFinite(price)
  ) {
    return;
  }


  const m =
    ensureMarketState(
      market
    );


  const digit =
    deriveLastDigit(
      price,
      market,
      tick
    );


  const epoch =
    safeNumber(
      tick.epoch,
      Date.now() / 1000
    );


  m.prices.push(
    price
  );

  m.digits.push(
    digit
  );

  m.ticks.push({
    price,
    digit,
    epoch
  });


  m.digitCounts[digit]++;

  m.received++;

  m.lastPrice =
    price;

  m.lastDigit =
    digit;

  m.epoch =
    epoch;

  m.updatedAt =
    Date.now();


  trimMarket(
    m
  );


  renderMarket(
    market
  );


  /*
    Settle paper trades using the next
    live tick from the same market.
  */

  settleTradesForTick(
    market,
    digit,
    price,
    epoch
  );


  if (
    market ===
    state.selectedMarket
  ) {

    updateAIAnalysis();

    drawChart();

    updateCircularDisplay();
  }
}


/* =========================================================
   TRIM MARKET
   ========================================================= */

function trimMarket(m) {

  const MAX =
    180;

  while (
    m.prices.length > MAX
  ) {

    m.prices.shift();
  }

  while (
    m.digits.length > MAX
  ) {

    const removed =
      m.digits.shift();

    if (
      Number.isInteger(
        removed
      ) &&
      m.digitCounts[removed] > 0
    ) {

      m.digitCounts[removed]--;
    }
  }


  while (
    m.ticks.length > MAX
  ) {

    m.ticks.shift();
  }
}


/* =========================================================
   LAST DIGIT
   ========================================================= */

function deriveLastDigit(
  price,
  market,
  tick = null
) {

  /*
    Deriv tick quote precision can differ between
    markets. Prefer explicit pip_size where available.
  */

  let precision = 3;


  if (
    tick &&
    tick.pip_size !== undefined
  ) {

    const pip =
      safeNumber(
        tick.pip_size,
        NaN
      );

    if (
      Number.isFinite(pip) &&
      pip > 0
    ) {

      precision =
        Math.max(
          0,
          Math.round(
            -Math.log10(pip)
          )
        );
    }
  }


  /*
    Common volatility indices normally expose
    sufficient decimal precision. Convert the
    displayed price to a fixed decimal string.
  */

  const fixed =
    Number(price).toFixed(
      precision
    );


  const digits =
    fixed.replace(
      /\D/g,
      ""
    );


  if (!digits.length) {
    return 0;
  }


  return Number(
    digits.charAt(
      digits.length - 1
    )
  );
}


/* =========================================================
   MARKET RENDER
   ========================================================= */

function renderMarket(
  market
) {

  if (
    market !==
    state.selectedMarket
  ) {
    return;
  }


  const m =
    ensureMarketState(
      market
    );


  setText(
    "currentChartMarket",
    market
  );


  if (
    m.lastPrice !== null
  ) {

    setText(
      "currentLivePrice",
      formatPrice(
        m.lastPrice
      )
    );
  }


  setText(
    "digitSampleCount",
    m.digits.length
  );


  renderDigitDistribution(
    m
  );
}


function formatPrice(
  price
) {

  if (
    !Number.isFinite(
      Number(price)
    )
  ) {
    return "—";
  }


  return Number(price)
    .toFixed(3);
}


/* =========================================================
   DIGIT DISTRIBUTION
   ========================================================= */

function renderDigitDistribution(
  marketState
) {

  const grid =
    $("digitStatsGrid");

  if (!grid) return;


  const total =
    marketState.digits.length;


  grid.innerHTML = "";


  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    const count =
      marketState.digitCounts[digit] ||
      0;


    const percent =
      total > 0
        ? Math.round(
            (count / total) * 100
          )
        : 0;


    const box =
      document.createElement(
        "div"
      );

    box.className =
      "digit-stat";


    box.innerHTML = `
      <strong>${digit}</strong>
      <span>${percent}%</span>
    `;


    grid.appendChild(
      box
    );
  }
}


/* =========================================================
   AI ANALYSIS
   ========================================================= */

function calculateMarketSignal(
  market
) {

  const m =
    state.marketData.get(
      market
    );


  if (
    !m ||
    m.digits.length < 10
  ) {

    return {
      market,
      strategy:
        state.selectedStrategy,

      prediction: null,

      confidence: 0,

      score: 0,

      reason:
        "Waiting for enough live ticks."
    };
  }


  const recent =
    m.digits.slice(
      -60
    );


  const counts =
    Array(10).fill(0);


  recent.forEach(
    digit => {

      if (
        Number.isInteger(
          digit
        )
      ) {

        counts[digit]++;
      }

    }
  );


  const total =
    recent.length;


  let leastDigit = 0;

  let mostDigit = 0;


  for (
    let i = 1;
    i <= 9;
    i++
  ) {

    if (
      counts[i] >
      counts[mostDigit]
    ) {

      mostDigit =
        i;
    }


    if (
      counts[i] <
      counts[leastDigit]
    ) {

      leastDigit =
        i;
    }
  }


  const mostFrequency =
    counts[mostDigit] /
    total;


  const leastFrequency =
    counts[leastDigit] /
    total;


  /*
    Select strategy from the bot pool.
  */

  const pool =
    state.botStrategyPool.length
      ? state.botStrategyPool
      : DEFAULT_BOT_POOL;


  let best =
    null;


  pool.forEach(
    strategy => {

      const candidate =
        buildStrategyCandidate(
          strategy,
          counts,
          recent,
          total,
          mostDigit,
          leastDigit
        );


      if (
        !best ||
        candidate.confidence >
          best.confidence
      ) {

        best =
          candidate;
      }

    }
  );


  if (!best) {

    best =
      buildStrategyCandidate(
        "DIFFERS",
        counts,
        recent,
        total,
        mostDigit,
        leastDigit
      );
  }


  return {

    market,

    strategy:
      best.strategy,

    prediction:
      best.prediction,

    targetDigit:
      best.targetDigit,

    confidence:
      best.confidence,

    score:
      Math.round(
        best.confidence * 100
      ),

    reason:
      best.reason,

    recentCount:
      total,

    mostDigit,

    leastDigit,

    frequency:
      mostFrequency,

    leastFrequency
  };
}


/* =========================================================
   STRATEGY CANDIDATE
   ========================================================= */

function buildStrategyCandidate(
  strategy,
  counts,
  recent,
  total,
  mostDigit,
  leastDigit
) {

  let confidence = 50;

  let prediction = null;

  let targetDigit = null;

  let reason = "";


  switch (
    strategy
  ) {

    case "MATCHES": {

      prediction =
        mostDigit;

      targetDigit =
        mostDigit;

      confidence =
        Math.min(
          94,
          50 +
          (
            counts[mostDigit] /
            Math.max(total,1)
          ) * 80
        );

      reason =
        `Digit ${mostDigit} is currently the strongest recent digit.`;

      break;
    }


    case "DIFFERS": {

      prediction =
        leastDigit;

      targetDigit =
        mostDigit;

      const targetFrequency =
        counts[mostDigit] /
        Math.max(total,1);

      confidence =
        Math.min(
          95,
          58 +
          targetFrequency * 50
        );

      reason =
        `Recent distribution gives a Differ signal against digit ${mostDigit}.`;

      break;
    }


    case "OVER": {

      targetDigit = 4;

      const over =
        recent.filter(
          d => d > targetDigit
        ).length;

      confidence =
        Math.min(
          93,
          45 +
          (over / total) * 70
        );

      prediction =
        targetDigit;

      reason =
        `${Math.round((over / total) * 100)}% of recent digits were above 4.`;

      break;
    }


    case "UNDER": {

      targetDigit = 5;

      const under =
        recent.filter(
          d => d < targetDigit
        ).length;

      confidence =
        Math.min(
          93,
          45 +
          (under / total) * 70
        );

      prediction =
        targetDigit;

      reason =
        `${Math.round((under / total) * 100)}% of recent digits were below 5.`;

      break;
    }


    case "EVEN": {

      const even =
        recent.filter(
          d => d % 2 === 0
        ).length;

      confidence =
        Math.min(
          93,
          45 +
          (even / total) * 70
        );

      prediction =
        "EVEN";

      reason =
        `${Math.round((even / total) * 100)}% of recent digits were even.`;

      break;
    }


    case "ODD": {

      const odd =
        recent.filter(
          d => d % 2 === 1
        ).length;

      confidence =
        Math.min(
          93,
          45 +
          (odd / total) * 70
        );

      prediction =
        "ODD";

      reason =
        `${Math.round((odd / total) * 100)}% of recent digits were odd.`;

      break;
    }


    default:

      prediction =
        mostDigit;

      targetDigit =
        mostDigit;

      confidence =
        50;

      reason =
        "Basic digit distribution signal.";
  }


  return {

    strategy,

    prediction,

    targetDigit,

    confidence:
      Math.round(
        confidence
      ),

    reason
  };
}


/* =========================================================
   UPDATE AI
   ========================================================= */

function updateAIAnalysis() {

  const result =
    calculateMarketSignal(
      state.selectedMarket
    );


  setText(
    "analysisConfidence",
    `${result.confidence}%`
  );


  setText(
    "aiMarket",
    result.market
  );


  setText(
    "aiPrediction",
    result.prediction === null
      ? "—"
      : result.prediction
  );


  setText(
    "aiType",
    result.strategy || "—"
  );


  setText(
    "analysisMsg",
    result.reason ||
    "Waiting for live market analysis."
  );


  setText(
    "botSelectedMarket",
    result.market
  );


  setText(
    "botSelectedStrategy",
    result.strategy
  );


  setText(
    "botScore",
    result.score
  );


  setText(
    "botConfidence",
    `${result.confidence}%`
  );


  setText(
    "aiPredictionLarge",
    result.prediction === null
      ? "—"
      : result.prediction
  );


  setText(
    "predictionConfidence",
    result.confidence
      ? `${result.confidence}% confidence`
      : "Waiting for signal"
  );


  updateSelectedMarketUI();
}


/* =========================================================
   SCANNER
   ========================================================= */

function scanMarkets() {

  let best =
    null;


  MARKETS.forEach(
    market => {

      const result =
        calculateMarketSignal(
          market
        );


      if (
        !best ||
        result.confidence >
          best.confidence
      ) {

        best =
          result;
      }

    }
  );


  if (
    !best ||
    !best.confidence
  ) {

    toast(
      "Scanner is waiting for more live ticks."
    );

    return null;
  }


  state.selectedMarket =
    best.market;


  state.selectedStrategy =
    best.strategy;


  updateSelectedMarketUI();

  updateAIAnalysis();

  saveSettings();


  toast(
    `Scanner selected ${best.market} • ${best.confidence}%`
  );


  return best;
}


/* =========================================================
   CHART
   ========================================================= */

function drawChart() {

  const canvas =
    $("priceChartCanvas");

  if (!canvas) return;


  const rect =
    canvas.getBoundingClientRect();


  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return;
  }


  const dpr =
    window.devicePixelRatio ||
    1;


  canvas.width =
    Math.round(
      rect.width * dpr
    );

  canvas.height =
    Math.round(
      rect.height * dpr
    );


  const ctx =
    canvas.getContext(
      "2d"
    );


  if (!ctx) return;


  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  ctx.save();

  ctx.scale(
    dpr,
    dpr
  );


  const width =
    rect.width;

  const height =
    rect.height;


  /*
    Grid.
  */

  ctx.globalAlpha =
    0.12;

  ctx.strokeStyle =
    "#8fa4bc";

  ctx.lineWidth =
    1;


  for (
    let i = 1;
    i < 5;
    i++
  ) {

    const y =
      (height / 5) * i;

    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      width,
      y
    );

    ctx.stroke();
  }


  const market =
    state.marketData.get(
      state.selectedMarket
    );


  if (
    !market ||
    market.prices.length < 2
  ) {

    ctx.restore();

    return;
  }


  const prices =
    market.prices.slice(
      -80
    );


  const min =
    Math.min(
      ...prices
    );

  const max =
    Math.max(
      ...prices
    );


  const range =
    Math.max(
      max - min,
      0.000001
    );


  ctx.globalAlpha =
    1;

  ctx.strokeStyle =
    "#20d6ff";

  ctx.lineWidth =
    2;


  ctx.beginPath();


  prices.forEach(
    (price, index) => {

      const x =
        (index /
          Math.max(
            prices.length - 1,
            1
          )) *
        width;


      const y =
        height -
        (
          (price - min) /
          range
        ) *
        (height - 12) -
        6;


      if (index === 0) {

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


  ctx.stroke();


  ctx.restore();
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

  state.circularStage =
    "ANALYZING";

  state.circularRemaining =
    10;


  setText(
    "aiCircleStatus",
    "ANALYZING"
  );


  setText(
    "cycleCooldown",
    "Circular AI is analyzing live market data."
  );


  const circle =
    $("aiCircle");

  if (circle) {

    circle.classList.remove(
      "locked",
      "trade-now"
    );

    circle.classList.add(
      "analyzing"
    );
  }


  clearInterval(
    state.circularTimer
  );


  state.circularTimer =
    setInterval(
      circularTick,
      1000
    );


  updateCircularDisplay();
}


function stopCircularAI() {

  state.circularRunning =
    false;

  state.circularStage =
    "READY";

  state.circularRemaining =
    10;


  clearInterval(
    state.circularTimer
  );

  state.circularTimer =
    null;


  const circle =
    $("aiCircle");

  if (circle) {

    circle.classList.remove(
      "analyzing",
      "locked",
      "trade-now"
    );
  }


  setText(
    "aiCircleStatus",
    "READY"
  );


  setText(
    "aiCircleLabel",
    "READY"
  );


  setText(
    "aiCircleTimer",
    "10"
  );


  setText(
    "aiCirclePrediction",
    "No prediction yet"
  );


  setText(
    "cycleCooldown",
    "Circular AI is stopped."
  );


  updateCycleStages(
    "ready"
  );
}


function circularTick() {

  if (
    !state.circularRunning
  ) {
    return;
  }


  /*
    ANALYZING = exactly 10 seconds.
  */

  if (
    state.circularStage ===
    "ANALYZING"
  ) {

    state.circularRemaining--;

    if (
      state.circularRemaining <= 0
    ) {

      beginCircularPrediction();

      return;
    }


    updateCircularDisplay();

    return;
  }


  /*
    LOCK = exactly 5 seconds.
  */

  if (
    state.circularStage ===
    "LOCK"
  ) {

    state.circularRemaining--;

    if (
      state.circularRemaining <= 0
    ) {

      beginCircularTradeNow();

      return;
    }


    updateCircularDisplay();

    return;
  }


  /*
    TRADE NOW = exactly 3 seconds.
  */

  if (
    state.circularStage ===
    "TRADE_NOW"
  ) {

    state.circularRemaining--;

    if (
      state.circularRemaining <= 0
    ) {

      beginCircularNextCycle();

      return;
    }


    updateCircularDisplay();
  }
}


/* =========================================================
   CIRCULAR PREDICTION
   ========================================================= */

function beginCircularPrediction() {

  const scan =
    scanMarkets();


  if (!scan) {

    state.circularStage =
      "ANALYZING";

    state.circularRemaining =
      10;

    updateCircularDisplay();

    return;
  }


  state.circularStage =
    "LOCK";

  state.circularRemaining =
    5;


  setText(
    "aiCircleStatus",
    "LOCK"
  );


  setText(
    "aiCircleLabel",
    "LOCK"
  );


  setText(
    "aiCirclePrediction",
    `${scan.strategy} • ${scan.prediction}`
  );


  setText(
    "cycleCooldown",
    "Prediction locked for the next 5 seconds."
  );


  const circle =
    $("aiCircle");

  if (circle) {

    circle.classList.remove(
      "analyzing",
      "trade-now"
    );

    circle.classList.add(
      "locked"
    );
  }


  updateCycleStages(
    "lock"
  );


  updateCircularDisplay();
}


/* =========================================================
   CIRCULAR TRADE NOW
   ========================================================= */

function beginCircularTradeNow() {

  state.circularStage =
    "TRADE_NOW";

  state.circularRemaining =
    3;


  setText(
    "aiCircleStatus",
    "TRADE NOW"
  );


  setText(
    "aiCircleLabel",
    "TRADE NOW"
  );


  setText(
    "cycleCooldown",
    "Paper trade signal active."
  );


  const circle =
    $("aiCircle");

  if (circle) {

    circle.classList.remove(
      "analyzing",
      "locked"
    );

    circle.classList.add(
      "trade-now"
    );
  }


  updateCycleStages(
    "trade"
  );


  /*
    Circular AI places PAPER trade only.
  */

  const result =
    calculateMarketSignal(
      state.selectedMarket
    );


  if (
    result &&
    result.confidence >= 50
  ) {

    openPaperTrade({
      market:
        result.market,

      strategy:
        result.strategy,

      prediction:
        result.prediction,

      targetDigit:
        result.targetDigit,

      stake:
        getNumberInput(
          "circularStakeInput",
          MIN_STAKE
        ),

      takeProfit:
        getNumberInput(
          "circularTakeProfitInput",
          10
        ),

      stopLoss:
        getNumberInput(
          "circularStopLossInput",
          10
        ),

      source:
        "CIRCULAR AI"
    });

  }


  updateCircularDisplay();
}


/* =========================================================
   NEXT CIRCULAR CYCLE
   ========================================================= */

function beginCircularNextCycle() {

  state.circularStage =
    "ANALYZING";

  state.circularRemaining =
    10;


  setText(
    "aiCircleStatus",
    "ANALYZING"
  );


  setText(
    "aiCircleLabel",
    "ANALYZING"
  );


  setText(
    "cycleCooldown",
    "Starting a new 10-second analysis cycle."
  );


  const circle =
    $("aiCircle");

  if (circle) {

    circle.classList.remove(
      "locked",
      "trade-now"
    );

    circle.classList.add(
      "analyzing"
    );
  }


  updateCycleStages(
    "analyzing"
  );


  updateCircularDisplay();
}


function updateCircularDisplay() {

  setText(
    "aiCircleTimer",
    Math.max(
      0,
      state.circularRemaining
    )
  );
}


function updateCycleStages(
  stage
) {

  const analysis =
    $("cycleAnalysis");

  const trade =
    $("cycleTrade");


  if (analysis) {

    analysis.classList.remove(
      "active",
      "trade-active"
    );
  }


  if (trade) {

    trade.classList.remove(
      "active",
      "trade-active"
    );
  }


  if (
    stage ===
      "analyzing" ||
    stage ===
      "ready"
  ) {

    if (analysis) {
      analysis.classList.add(
        "active"
      );
    }

  } else if (
    stage === "lock"
  ) {

    if (analysis) {
      analysis.classList.add(
        "active"
      );
    }

  } else if (
    stage === "trade"
  ) {

    if (trade) {

      trade.classList.add(
        "active",
        "trade-active"
      );
    }
  }
}


/* =========================================================
   PAPER TRADING
   ========================================================= */

function getNumberInput(
  id,
  fallback
) {

  const el =
    $(id);

  if (!el) {
    return fallback;
  }


  const value =
    Number(el.value);


  if (
    !Number.isFinite(value)
  ) {

    return fallback;
  }


  return value;
}


function normalizeStake(
  stake
) {

  return Math.max(
    MIN_STAKE,
    safeNumber(
      stake,
      MIN_STAKE
    )
  );
}


function openPaperTrade(
  options
) {

  const market =
    options.market ||
    state.selectedMarket;


  const strategy =
    options.strategy ||
    state.selectedStrategy;


  const stake =
    normalizeStake(
      options.stake
    );


  if (
    stake >
    state.paperBalance
  ) {

    toast(
      "Insufficient paper balance"
    );

    return null;
  }


  let targetDigit =
    options.targetDigit;


  /*
    Manual MATCHES / DIFFERS require a target.
  */

  if (
    (
      strategy ===
        "MATCHES" ||
      strategy ===
        "DIFFERS"
    ) &&
    (
      targetDigit ===
        undefined ||
      targetDigit ===
        null ||
      targetDigit === ""
    )
  ) {

    const m =
      state.marketData.get(
        market
      );


    targetDigit =
      m?.lastDigit ??
      0;
  }


  if (
    targetDigit !==
      null &&
    targetDigit !==
      undefined
  ) {

    targetDigit =
      Math.max(
        0,
        Math.min(
          9,
          Math.round(
            Number(
              targetDigit
            )
          )
        )
      );
  }


  const marketState =
    state.marketData.get(
      market
    );


  const entryPrice =
    marketState?.lastPrice ??
    0;


  const entryDigit =
    marketState?.lastDigit ??
    0;


  const takeProfit =
    safeNumber(
      options.takeProfit,
      0
    );


  const stopLoss =
    safeNumber(
      options.stopLoss,
      0
    );


  const martingale =
    Math.max(
      1,
      safeNumber(
        options.martingale,
        2
      )
    );


  const trade = {

    id:
      `KW-${Date.now()}-${++state.tradeSequence}`,

    market,

    strategy,

    prediction:
      options.prediction ??
      targetDigit ??
      strategy,

    targetDigit,

    entryDigit,

    entryPrice,

    stake,

    source:
      options.source ||
      "MANUAL",

    createdAt:
      Date.now(),

    takeProfit,

    stopLoss,

    martingale,

    status:
      "ACTIVE"
  };


  /*
    Paper ledger:
    stake leaves balance immediately.
  */

  state.paperBalance -=
    stake;


  state.paperBalance =
    Math.max(
      0,
      state.paperBalance
    );


  state.activeTrades.push(
    trade
  );


  saveBalance();

  renderActiveTrades();

  updateBalanceUI();


  toast(
    `${strategy} paper trade opened • ${market}`
  );


  return trade;
}


/* =========================================================
   SETTLE PAPER TRADE
   ========================================================= */

function settleTradesForTick(
  market,
  exitDigit,
  exitPrice,
  epoch
) {

  const trades =
    state.activeTrades.filter(
      trade =>
        trade.market ===
        market &&
        trade.status ===
        "ACTIVE"
    );


  trades.forEach(
    trade => {

      settlePaperTrade(
        trade,
        exitDigit,
        exitPrice,
        epoch
      );

    }
  );
}


function settlePaperTrade(
  trade,
  exitDigit,
  exitPrice,
  epoch
) {

  const won =
    evaluateStrategy(
      trade,
      exitDigit
    );


  const profit =
    won
      ? trade.stake *
        PAYOUT_MULTIPLIER[
          trade.strategy
        ]
      : -trade.stake;


  const amountWon =
    won
      ? trade.stake +
        profit
      : 0;


  const net =
    amountWon -
    trade.stake;


  /*
    Return stake + profit on win.
    Nothing returned on loss because the
    stake was already removed at opening.
  */

  if (won) {

    state.paperBalance +=
      amountWon;
  }


  state.sessionProfit +=
    net;


  state.totalProfit +=
    net;


  state.totalStake +=
    trade.stake;


  state.totalAmountWon +=
    amountWon;


  state.totalTrades++;


  if (won) {

    state.wins++;

  } else {

    state.losses++;
  }


  trade.status =
    won
      ? "WON"
      : "LOST";


  trade.exitDigit =
    exitDigit;

  trade.exitPrice =
    exitPrice;

  trade.settledAt =
    Date.now();

  trade.amountWon =
    amountWon;

  trade.net =
    net;


  /*
    Remove from active trades.
  */

  state.activeTrades =
    state.activeTrades.filter(
      item =>
        item.id !==
        trade.id
    );


  /*
    Add to permanent history.
  */

  state.history.unshift({
    ...trade
  });


  saveHistory();

  saveBalance();

  calculateStats();

  renderHistory();

  renderActiveTrades();

  updateBalanceUI();


  toast(
    won
      ? `WIN • ${trade.strategy} • +${money(net)}`
      : `LOSS • ${trade.strategy} • -${money(trade.stake)}`
  );


  enforceRiskControls();
}


/* =========================================================
   STRATEGY EVALUATION
   ========================================================= */

function evaluateStrategy(
  trade,
  exitDigit
) {

  switch (
    trade.strategy
  ) {

    case "MATCHES":

      return (
        exitDigit ===
        Number(
          trade.targetDigit
        )
      );


    case "DIFFERS":

      return (
        exitDigit !==
        Number(
          trade.targetDigit
        )
      );


    case "OVER":

      return (
        exitDigit >
        Number(
          trade.targetDigit ??
          4
        )
      );


    case "UNDER":

      return (
        exitDigit <
        Number(
          trade.targetDigit ??
          5
        )
      );


    case "EVEN":

      return (
        exitDigit % 2 === 0
      );


    case "ODD":

      return (
        exitDigit % 2 === 1
      );


    default:

      return false;
  }
}


/* =========================================================
   MANUAL TRADE
   ========================================================= */

function placeManualTrade() {

  const market =
    $("manualMarketSelect")?.value ||
    state.selectedManualMarket;


  const strategy =
    state.selectedStrategy;


  let targetDigit = null;


  if (
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
  ) {

    const input =
      $("manualTargetDigitInput");


    if (!input) return;


    if (
      input.value === ""
    ) {

      toast(
        "Enter a target digit from 0 to 9"
      );

      return;
    }


    targetDigit =
      Number(
        input.value
      );


    if (
      !Number.isInteger(
        targetDigit
      ) ||
      targetDigit < 0 ||
      targetDigit > 9
    ) {

      toast(
        "Target digit must be 0 to 9"
      );

      return;
    }
  }


  openPaperTrade({

    market,

    strategy,

    targetDigit,

    prediction:
      targetDigit ??
      strategy,

    stake:
      getNumberInput(
        "manualStakeInput",
        MIN_STAKE
      ),

    takeProfit:
      getNumberInput(
        "manualTakeProfitInput",
        10
      ),

    stopLoss:
      getNumberInput(
        "manualStopLossInput",
        10
      ),

    source:
      "MANUAL"
  });
}


/* =========================================================
   AI BOT
   ========================================================= */

function startBot() {

  if (
    state.botRunning
  ) {

    return;
  }


  state.botRunning =
    true;


  setText(
    "botStatusDash",
    "AI BOT is scanning for qualified signals."
  );


  setText(
    "engineStatusText",
    "AI BOT RUNNING"
  );


  botCycle();


  clearInterval(
    state.botTimer
  );


  state.botTimer =
    setInterval(
      botCycle,
      5000
    );


  toast(
    "AI BOT started"
  );
}


function stopBot() {

  state.botRunning =
    false;


  clearInterval(
    state.botTimer
  );


  state.botTimer =
    null;


  setText(
    "botStatusDash",
    "AI BOT is stopped."
  );


  setText(
    "engineStatusText",
    "AI BOT READY"
  );
}


function botCycle() {

  if (
    !state.botRunning
  ) {
    return;
  }


  const now =
    Date.now();


  if (
    now -
    state.lastBotTradeAt <
    4500
  ) {

    return;
  }


  const result =
    scanMarkets();


  if (
    !result ||
    result.confidence <
    60
  ) {

    setText(
      "botStatusDash",
      "Scanning... confidence threshold not reached."
    );

    return;
  }


  const trade =
    openPaperTrade({

      market:
        result.market,

      strategy:
        result.strategy,

      prediction:
        result.prediction,

      targetDigit:
        result.targetDigit,

      stake:
        getNumberInput(
          "stakeInput",
          MIN_STAKE
        ),

      takeProfit:
        getNumberInput(
          "takeProfitInput",
          10
        ),

      stopLoss:
        getNumberInput(
          "stopLossInput",
          10
        ),

      martingale:
        getNumberInput(
          "martingaleInput",
          2
        ),

      source:
        "AI BOT"
    });


  if (trade) {

    state.lastBotTradeAt =
      Date.now();


    setText(
      "botStatusDash",
      `Paper trade active • ${result.strategy} • ${result.market}`
    );
  }
}


/* =========================================================
   RISK CONTROLS
   ========================================================= */

function enforceRiskControls() {

  const takeProfit =
    getNumberInput(
      "takeProfitInput",
      0
    );


  const stopLoss =
    getNumberInput(
      "stopLossInput",
      0
    );


  if (
    takeProfit > 0 &&
    state.sessionProfit >=
      takeProfit
  ) {

    stopBot();

    stopCircularAI();

    toast(
      "Take Profit reached — engines stopped"
    );

    return;
  }


  if (
    stopLoss > 0 &&
    state.sessionProfit <=
      -stopLoss
  ) {

    stopBot();

    stopCircularAI();

    toast(
      "Stop Loss reached — engines stopped"
    );
  }
}


/* =========================================================
   ACTIVE TRADES RENDER
   ========================================================= */

function renderActiveTrades() {

  const list =
    $("activeTradesList");

  if (!list) return;


  setText(
    "activeTradeCount",
    state.activeTrades.length
  );


  if (
    !state.activeTrades.length
  ) {

    list.innerHTML =
      `<div class="empty-state">
        No active paper trades.
      </div>`;

    return;
  }


  list.innerHTML =
    state.activeTrades
      .map(
        trade => `

        <div class="active-trade-card">

          <div class="trade-top">

            <div>
              <strong>
                ${escapeHTML(trade.market)}
              </strong>

              <small>
                ${escapeHTML(trade.strategy)}
              </small>
            </div>

            <strong>
              ${money(trade.stake)}
            </strong>

          </div>

          <div class="trade-details">

            <div>
              <span>ENTRY</span>
              <b>${escapeHTML(trade.entryDigit)}</b>
            </div>

            <div>
              <span>TARGET</span>
              <b>
                ${escapeHTML(
                  trade.targetDigit ??
                  trade.strategy
                )}
              </b>
            </div>

            <div>
              <span>SOURCE</span>
              <b>${escapeHTML(trade.source)}</b>
            </div>

          </div>

        </div>
      `
      )
      .join("");
}


/* =========================================================
   STATISTICS
   ========================================================= */

function calculateStats() {

  const history =
    state.history;


  state.totalTrades =
    history.length;


  state.wins =
    history.filter(
      item =>
        item.status ===
        "WON"
    ).length;


  state.losses =
    history.filter(
      item =>
        item.status ===
        "LOST"
    ).length;


  state.totalStake =
    history.reduce(
      (
        sum,
        item
      ) =>
        sum +
        safeNumber(
          item.stake
        ),
      0
    );


  state.totalAmountWon =
    history.reduce(
      (
        sum,
        item
      ) =>
        sum +
        safeNumber(
          item.amountWon
        ),
      0
    );


  state.totalProfit =
    history.reduce(
      (
        sum,
        item
      ) =>
        sum +
        safeNumber(
          item.net
        ),
      0
    );


  state.sessionProfit =
    state.history.reduce(
      (
        sum,
        item
      ) =>
        sum +
        safeNumber(
          item.net
        ),
      0
    );
}


function updatePerformanceUI() {

  const accuracy =
    state.totalTrades > 0
      ? Math.round(
          (
            state.wins /
            state.totalTrades
          ) * 100
        )
      : 0;


  setText(
    "paperTotal",
    state.totalTrades
  );


  setText(
    "paperWins",
    state.wins
  );


  setText(
    "paperLosses",
    state.losses
  );


  setText(
    "paperAccuracy",
    `${accuracy}%`
  );


  setText(
    "sessionProfitDisplay",
    money(
      state.sessionProfit
    )
  );


  setText(
    "totalProfitDisplay",
    money(
      state.totalProfit
    )
  );


  const session =
    $("sessionProfitDisplay");


  if (session) {

    session.classList.remove(
      "positive",
      "negative"
    );


    session.classList.add(
      state.sessionProfit >= 0
        ? "positive"
        : "negative"
    );
  }
}


/* =========================================================
   BALANCE UI
   ========================================================= */

function updateBalanceUI() {

  /*
    Paper balance is always shown by the trading engine.
    Connected Deriv balance is shown after account login.
  */

  if (
    state.accountInfo
  ) {

    setText(
      "balanceDisplay",
      `${state.accountInfo.currency} ${state.accountInfo.balance.toFixed(2)}`
    );

    return;
  }


  setText(
    "balanceDisplay",
    money(
      state.paperBalance
    )
  );
}


/* =========================================================
   HISTORY RENDER
   ========================================================= */

function renderHistory() {

  const list =
    $("historyCardsList");

  if (!list) return;


  calculateStats();

  updatePerformanceUI();


  setText(
    "historyTotalStake",
    money(
      state.totalStake
    )
  );


  setText(
    "historyAmountWon",
    money(
      state.totalAmountWon
    )
  );


  setText(
    "historyNetProfit",
    money(
      state.totalProfit
    )
  );


  const net =
    $("historyNetProfit");


  if (net) {

    net.classList.remove(
      "positive",
      "negative"
    );

    net.classList.add(
      state.totalProfit >= 0
        ? "positive"
        : "negative"
    );
  }


  if (
    !state.history.length
  ) {

    list.innerHTML =
      `<div class="empty-state">
        No paper trade history yet.
      </div>`;

    return;
  }


  list.innerHTML =
    state.history
      .map(
        trade => {

          const win =
            trade.status ===
            "WON";


          const date =
            new Date(
              trade.settledAt ||
              trade.createdAt
            );


          const time =
            date.toLocaleString();


          return `

            <div class="history-card ${
              win
                ? "history-win"
                : "history-loss"
            }">

              <div class="history-top">

                <div>
                  <strong>
                    ${escapeHTML(trade.market)}
                  </strong>

                  <div class="history-time">
                    ${escapeHTML(time)}
                  </div>
                </div>

                <span class="history-result">
                  ${win ? "WIN" : "LOSS"}
                </span>

              </div>


              <div class="history-details">

                <div>
                  <span>STRATEGY</span>
                  <strong>
                    ${escapeHTML(trade.strategy)}
                  </strong>
                </div>

                <div>
                  <span>PREDICTION</span>
                  <strong>
                    ${escapeHTML(trade.prediction)}
                  </strong>
                </div>

                <div>
                  <span>TARGET</span>
                  <strong>
                    ${escapeHTML(
                      trade.targetDigit ??
                      "—"
                    )}
                  </strong>
                </div>

                <div>
                  <span>ENTRY</span>
                  <strong>
                    ${escapeHTML(trade.entryDigit)}
                  </strong>
                </div>

                <div>
                  <span>EXIT</span>
                  <strong>
                    ${escapeHTML(trade.exitDigit)}
                  </strong>
                </div>

                <div>
                  <span>STAKE</span>
                  <strong>
                    ${money(trade.stake)}
                  </strong>
                </div>

                <div>
                  <span>AMOUNT WON</span>
                  <strong>
                    ${money(trade.amountWon)}
                  </strong>
                </div>

                <div>
                  <span>NET</span>
                  <strong class="${
                    trade.net >= 0
                      ? "positive"
                      : "negative"
                  }">
                    ${trade.net >= 0 ? "+" : ""}
                    ${money(trade.net)}
                  </strong>
                </div>

                <div>
                  <span>SOURCE</span>
                  <strong>
                    ${escapeHTML(trade.source)}
                  </strong>
                </div>

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

  const confirmed =
    window.confirm(
      "Clear all KRISHWAVE paper trade history?"
    );


  if (!confirmed) {
    return;
  }


  state.history = [];

  state.activeTrades = [];

  state.sessionProfit = 0;

  state.totalProfit = 0;

  state.totalTrades = 0;

  state.wins = 0;

  state.losses = 0;

  state.totalStake = 0;

  state.totalAmountWon = 0;


  saveHistory();

  renderHistory();

  renderActiveTrades();


  toast(
    "Paper history cleared"
  );
}


/* =========================================================
   STRATEGY MODAL
   ========================================================= */

function openStrategyModal(
  target
) {

  state.strategyModalTarget =
    target;


  const modal =
    $("strategyModal");

  if (!modal) return;


  qsa(
    "#strategyOptions .strategy-option"
  )
  .forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.strategy ===
          state.selectedStrategy
      );

    }
  );


  show(
    modal
  );
}


function closeStrategyModal() {

  hide(
    $("strategyModal")
  );

  state.strategyModalTarget =
    null;
}


function chooseStrategy(
  strategy
) {

  if (
    !STRATEGIES.includes(
      strategy
    )
  ) {
    return;
  }


  state.selectedStrategy =
    strategy;


  updateStrategyLabels();

  updateAIAnalysis();

  saveSettings();

  closeStrategyModal();


  toast(
    `${strategy} selected`
  );
}


function updateStrategyLabels() {

  setText(
    "manualSelectedStrategyLabel",
    state.selectedStrategy
  );


  setText(
    "circularStrategyLabel",
    state.selectedStrategy
  );


  setText(
    "botSelectedStrategy",
    state.selectedStrategy
  );


  updateTargetDigitVisibility();
}


function updateTargetDigitVisibility() {

  const container =
    $("targetDigitContainer");

  if (!container) return;


  const needsDigit =
    state.selectedStrategy ===
      "MATCHES" ||
    state.selectedStrategy ===
      "DIFFERS";


  container.classList.toggle(
    "hidden",
    !needsDigit
  );
}


/* =========================================================
   BOT STRATEGY MODAL
   ========================================================= */

function openBotStrategyModal() {

  const modal =
    $("botStrategyModal");

  if (!modal) return;


  qsa(
    ".bot-strategy-check"
  )
  .forEach(
    checkbox => {

      checkbox.checked =
        state.botStrategyPool.includes(
          checkbox.value
        );

    }
  );


  show(
    modal
  );
}


function closeBotStrategyModal() {

  hide(
    $("botStrategyModal")
  );
}


function applyBotStrategies() {

  const selected =
    qsa(
      ".bot-strategy-check:checked"
    )
    .map(
      checkbox =>
        checkbox.value
    );


  if (!selected.length) {

    toast(
      "Select at least one AI BOT strategy"
    );

    return;
  }


  state.botStrategyPool =
    selected;


  setText(
    "botStrategyLabel",
    selected.join(", ")
  );


  saveSettings();

  closeBotStrategyModal();

  updateAIAnalysis();


  toast(
    `AI BOT: ${selected.join(", ")}`
  );
}


/* =========================================================
   CIRCULAR STRATEGY
   ========================================================= */

function selectCircularStrategy() {

  openStrategyModal(
    "circular"
  );
}


/* =========================================================
   MANUAL STRATEGY
   ========================================================= */

function selectManualStrategy() {

  openStrategyModal(
    "manual"
  );
}


/* =========================================================
   CIRCULAR PAPER TRADE BUTTON
   ========================================================= */

function startCircularTradeEngine() {

  showPage(
    "analysis"
  );

  startCircularAI();


  toast(
    "Circular AI started"
  );
}


/* =========================================================
   STOP ALL
   ========================================================= */

function stopAllTrading() {

  stopBot();

  stopCircularAI();


  /*
    Active trades are allowed to settle on the
    next tick rather than being force-closed.
  */

  setText(
    "engineStatusText",
    "ALL AUTO ENGINES STOPPED"
  );


  toast(
    "All automatic engines stopped"
  );
}


/* =========================================================
   SETTINGS LOAD
   ========================================================= */

function loadSettings() {

  try {

    const raw =
      localStorage.getItem(
        STORAGE_SETTINGS
      );


    if (!raw) {
      return;
    }


    const settings =
      JSON.parse(raw);


    if (
      MARKETS.includes(
        settings.selectedMarket
      )
    ) {

      state.selectedMarket =
        settings.selectedMarket;
    }


    if (
      STRATEGIES.includes(
        settings.selectedStrategy
      )
    ) {

      state.selectedStrategy =
        settings.selectedStrategy;
    }


    if (
      Array.isArray(
        settings.botStrategyPool
      )
    ) {

      const valid =
        settings.botStrategyPool.filter(
          strategy =>
            STRATEGIES.includes(
              strategy
            )
        );


      if (valid.length) {

        state.botStrategyPool =
          valid;
      }
    }


  } catch (error) {

    console.warn(
      "Settings load failed",
      error
    );
  }
}


/* =========================================================
   EVENTS
   ========================================================= */

function initEvents() {

  const connect =
    $("connectDerivBtn");

  if (connect) {

    connect.addEventListener(
      "click",
      connectDeriv
    );
  }


  const theme =
    $("themeToggle");

  if (theme) {

    theme.addEventListener(
      "click",
      toggleTheme
    );
  }


  const demo =
    $("demoModeBtn");

  if (demo) {

    demo.addEventListener(
      "click",
      selectDemoMode
    );
  }


  const real =
    $("realModeBtn");

  if (real) {

    real.addEventListener(
      "click",
      requestRealMode
    );
  }


  const scan =
    $("analysisScanBtn");

  if (scan) {

    scan.addEventListener(
      "click",
      scanMarkets
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


  const botStart =
    $("startBotBtn");

  if (botStart) {

    botStart.addEventListener(
      "click",
      () => {

        if (
          state.botRunning
        ) {

          stopBot();

        } else {

          startBot();
        }

      }
    );
  }


  const circularStart =
    $("startCircularTradeBtn");

  if (circularStart) {

    circularStart.addEventListener(
      "click",
      startCircularTradeEngine
    );
  }


  const manualTrade =
    $("placeTradeBtn");

  if (manualTrade) {

    manualTrade.addEventListener(
      "click",
      placeManualTrade
    );
  }


  const stopTrading =
    $("stopTradingBtn");

  if (stopTrading) {

    stopTrading.addEventListener(
      "click",
      stopAllTrading
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


  const botStrategy =
    $("botStrategyTrigger");

  if (botStrategy) {

    botStrategy.addEventListener(
      "click",
      openBotStrategyModal
    );
  }


  const closeBot =
    $("closeBotStrategyModal");

  if (closeBot) {

    closeBot.addEventListener(
      "click",
      closeBotStrategyModal
    );
  }


  const applyBot =
    $("applyBotStrategies");

  if (applyBot) {

    applyBot.addEventListener(
      "click",
      applyBotStrategies
    );
  }


  const circularStrategy =
    $("circularStrategyTrigger");

  if (circularStrategy) {

    circularStrategy.addEventListener(
      "click",
      selectCircularStrategy
    );
  }


  const manualStrategy =
    $("manualStrategyTrigger");

  if (manualStrategy) {

    manualStrategy.addEventListener(
      "click",
      selectManualStrategy
    );
  }


  const closeStrategy =
    $("closeStrategyModal");

  if (closeStrategy) {

    closeStrategy.addEventListener(
      "click",
      closeStrategyModal
    );
  }


  qsa(
    "#strategyOptions .strategy-option"
  )
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          chooseStrategy(
            button.dataset.strategy
          );

        }
      );

    }
  );


  const cancelReal =
    $("cancelRealBtn");

  if (cancelReal) {

    cancelReal.addEventListener(
      "click",
      () => {

        hide(
          $("realConfirmModal")
        );

      }
    );
  }


  const confirmReal =
    $("confirmRealBtn");

  if (confirmReal) {

    confirmReal.addEventListener(
      "click",
      selectRealMode
    );
  }


  /*
    Close modal by clicking backdrop.
  */

  qsa(
    ".modal-backdrop"
  )
  .forEach(
    backdrop => {

      backdrop.addEventListener(
        "click",
        () => {

          const modal =
            backdrop.closest(
              ".modal"
            );

          hide(
            modal
          );

        }
      );

    }
  );


  /*
    Manual strategy controls.
  */

  updateTargetDigitVisibility();
}


/* =========================================================
   WINDOW RESIZE
   ========================================================= */

function initResize() {

  window.addEventListener(
    "resize",
    () => {

      drawChart();

    }
  );
}


/* =========================================================
   STARTUP
   ========================================================= */

async function initializeApp() {

  console.log(
    "KRISHWAVE AI BEAST V7.2 starting..."
  );


  loadStorage();

  loadSettings();


  /*
    Settings may have been loaded after storage,
    so refresh the UI.
  */

  populateMarketSelectors();

  updateStrategyLabels();

  updateModeUI();

  updateBalanceUI();

  renderHistory();

  renderActiveTrades();


  initNavigation();

  initEngineTabs();

  initMarketSelectors();

  initEvents();

  initResize();


  /*
    Start PUBLIC live feed immediately.
    This does not require a Deriv account.
  */

  connectPublicWebSocket();


  /*
    Load Railway configuration.
  */

  await loadBackendConfig();


  /*
    If Deriv redirected us back with ?code=...,
    process OAuth before doing anything else.
  */

  const hasCode =
    new URLSearchParams(
      window.location.search
    ).has("code");


  if (hasCode) {

    await handleOAuthCallback();

  } else {

    resetConnectButton();
  }


  /*
    Initial UI.
  */

  updateAIAnalysis();

  updateCircularDisplay();

  drawChart();


  console.log(
    "KRISHWAVE V7.2 ready."
  );
}


/* =========================================================
   DOM READY
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp
  );

} else {

  initializeApp();
}