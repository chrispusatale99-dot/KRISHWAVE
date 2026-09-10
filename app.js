/* =========================================================
   KRISHWAVE AI BEAST V7.2
   ---------------------------------------------------------
   LIVE DERIV MARKET INTELLIGENCE
   OAUTH + PKCE
   AI SCANNER
   CIRCULAR AI
   MANUAL PAPER ENGINE
   AI BOT PAPER ENGINE
   TRADE HISTORY
   TAKE PROFIT / STOP LOSS
   MARTINGALE
   DARK / LIGHT MODE

   IMPORTANT:
   - Real trades are NOT executed.
   - REAL mode is display/account-selection only.
   - All trading engines use PAPER execution.
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
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
const STARTING_BALANCE = 1000;

const STORAGE = {
  history: "krishwave_v72_history",
  balance: "krishwave_v72_balance",
  theme: "krishwave_v72_theme",
  settings: "krishwave_v72_settings"
};

const PAYOUT = {
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

  sessionId:
    sessionStorage.getItem("kw_session_id") || null,

  accountInfo: null,

  publicWs: null,
  authenticatedWs: null,

  publicConnected: false,
  authenticatedConnected: false,

  connectionState: "OFFLINE",

  selectedMarket: "R_10",
  selectedStrategy: "MATCHES",

  botStrategyPool: [...DEFAULT_BOT_POOL],

  currentPage: "analysis",
  currentEngine: "bot",

  accountMode: "demo",

  theme:
    localStorage.getItem(STORAGE.theme) || "dark",

  paperBalance:
    Number(
      localStorage.getItem(STORAGE.balance)
    ) || STARTING_BALANCE,

  history: [],

  activeTrades: [],

  marketData: new Map(),

  tickSequence: 0,

  latestSignal: null,

  circular: {
    running: false,
    stage: "ANALYZING",
    deadline: 0,
    timer: null,
    market: "R_10",
    strategy: "MATCHES",
    prediction: null
  },

  bot: {
    running: false,
    timer: null,
    lastTradeAt: 0,
    baseStake: 0.25,
    currentStake: 0.25,
    takeProfit: 10,
    stopLoss: 10,
    martingale: 2
  },

  session: {
    startBalance: STARTING_BALANCE,
    profit: 0
  },

  manual: {
    strategy: "MATCHES"
  },

  oauth: {
    processing: false
  },

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
    el.textContent = value;
  }
}

function setValue(id, value) {
  const el = $(id);
  if (el) {
    el.value = value;
  }
}

function show(el) {
  if (el) {
    el.classList.add("show");
  }
}

function hide(el) {
  if (el) {
    el.classList.remove("show");
  }
}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);

async function init() {

  loadStorage();

  applyTheme();

  initializeMarkets();

  initializeStrategies();

  initializeNavigation();

  initializeEngineTabs();

  initializeButtons();

  initializeModals();

  initializeForms();

  updateAllUI();

  await handleOAuthCallback();

  await loadBackendConfig();

  connectPublicWebSocket();

  updateConnectionUI(
    "CONNECTING",
    "LIVE DATA CONNECTING..."
  );
}


/* =========================================================
   STORAGE
========================================================= */

function loadStorage() {

  try {

    const history =
      localStorage.getItem(
        STORAGE.history
      );

    if (history) {
      const parsed = JSON.parse(history);

      if (Array.isArray(parsed)) {
        state.history = parsed;
      }
    }

  } catch (error) {

    console.warn(
      "History storage error",
      error
    );

    state.history = [];
  }


  try {

    const balance =
      localStorage.getItem(
        STORAGE.balance
      );

    if (balance !== null) {

      const value =
        Number(balance);

      if (
        Number.isFinite(value) &&
        value >= 0
      ) {
        state.paperBalance = value;
      }
    }

  } catch (error) {
    console.warn(
      "Balance storage error",
      error
    );
  }


  state.session.startBalance =
    state.paperBalance;

  state.session.profit = 0;
}

function saveHistory() {

  try {

    localStorage.setItem(
      STORAGE.history,
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
      STORAGE.balance,
      String(state.paperBalance)
    );

  } catch (error) {

    console.warn(
      "Unable to save balance",
      error
    );
  }
}


/* =========================================================
   THEME
========================================================= */

function applyTheme() {

  document.body.classList.toggle(
    "light-theme",
    state.theme === "light"
  );

  const button = $("themeToggle");

  if (button) {

    button.textContent =
      state.theme === "light"
        ? "🌙"
        : "☀";
  }
}

function toggleTheme() {

  state.theme =
    state.theme === "light"
      ? "dark"
      : "light";

  localStorage.setItem(
    STORAGE.theme,
    state.theme
  );

  applyTheme();

  showToast(
    state.theme === "light"
      ? "Light theme enabled"
      : "Dark theme enabled"
  );
}


/* =========================================================
   MARKET INITIALIZATION
========================================================= */

function initializeMarkets() {

  const selects = [
    $("circularMarketSelect"),
    $("manualMarketSelect")
  ];

  selects.forEach(select => {

    if (!select) return;

    select.innerHTML = "";

    MARKETS.forEach(market => {

      const option =
        document.createElement("option");

      option.value = market;
      option.textContent = market;

      select.appendChild(option);
    });

    select.value =
      state.selectedMarket;
  });


  MARKETS.forEach(market => {

    if (!state.marketData.has(market)) {

      state.marketData.set(
        market,
        createMarketState(market)
      );
    }
  });
}

function createMarketState(symbol) {

  return {
    symbol,

    price: null,

    previousPrice: null,

    quote: null,

    pipSize: null,

    decimals: null,

    ticks: [],

    digits: [],

    digitCounts:
      Array(10).fill(0),

    lastDigit: null,

    lastTickAt: 0,

    sequence: 0,

    score: 0,

    confidence: 0,

    strategy: "MATCHES",

    prediction: null
  };
}


/* =========================================================
   STRATEGY INITIALIZATION
========================================================= */

function initializeStrategies() {

  renderStrategyOptions();

  updateStrategyLabels();

  updateTargetDigitVisibility();
}

function renderStrategyOptions() {

  const container =
    $("strategyOptions");

  if (!container) return;

  container.innerHTML = "";

  STRATEGIES.forEach(strategy => {

    const button =
      document.createElement("button");

    button.type = "button";

    button.className =
      "strategy-option";

    if (
      strategy ===
      state.manual.strategy
    ) {
      button.classList.add("active");
    }

    button.dataset.strategy =
      strategy;

    button.innerHTML = `
      <strong>${strategy}</strong>
      <small>${strategyDescription(strategy)}</small>
    `;

    button.addEventListener(
      "click",
      () => selectManualStrategy(strategy)
    );

    container.appendChild(button);
  });
}

function strategyDescription(strategy) {

  switch (strategy) {

    case "MATCHES":
      return "Next digit equals target.";

    case "DIFFERS":
      return "Next digit differs from target.";

    case "OVER":
      return "Next digit is above threshold.";

    case "UNDER":
      return "Next digit is below threshold.";

    case "EVEN":
      return "Next digit is even.";

    case "ODD":
      return "Next digit is odd.";

    default:
      return "";
  }
}

function selectManualStrategy(strategy) {

  state.manual.strategy =
    strategy;

  state.selectedStrategy =
    strategy;

  setText(
    "manualSelectedStrategyLabel",
    strategy
  );

  hide($("strategyModal"));

  updateTargetDigitVisibility();

  renderStrategyOptions();

  showToast(
    `Manual strategy: ${strategy}`
  );
}

function updateTargetDigitVisibility() {

  const container =
    $("targetDigitContainer");

  if (!container) return;

  const strategy =
    state.manual.strategy;

  const needsDigit =
    strategy === "MATCHES" ||
    strategy === "DIFFERS" ||
    strategy === "OVER" ||
    strategy === "UNDER";

  container.style.display =
    needsDigit ? "block" : "none";

  const input =
    $("manualTargetDigitInput");

  if (input) {

    input.required =
      needsDigit;

    if (
      strategy === "OVER" &&
      !input.value
    ) {
      input.value = "4";
    }

    if (
      strategy === "UNDER" &&
      !input.value
    ) {
      input.value = "5";
    }
  }
}

function updateStrategyLabels() {

  setText(
    "botStrategyLabel",
    state.botStrategyPool.join(" + ")
  );

  setText(
    "botSelectedStrategy",
    state.botStrategyPool[0] || "MATCHES"
  );

  setText(
    "circularStrategyLabel",
    state.circular.strategy
  );

  setText(
    "manualSelectedStrategyLabel",
    state.manual.strategy
  );
}


/* =========================================================
   NAVIGATION
========================================================= */

function initializeNavigation() {

  qsa(".nav-btn").forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const page =
          button.dataset.page;

        if (page) {
          navigateTo(page);
        }
      }
    );
  });
}

function navigateTo(page) {

  state.currentPage =
    page;

  qsa(".page").forEach(section => {

    section.classList.toggle(
      "active",
      section.id ===
      `${page}Page`
    );
  });

  qsa(".nav-btn").forEach(button => {

    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (page === "analysis") {
    renderAnalysis();
  }

  if (page === "trade") {
    renderTradeUI();
  }

  if (page === "history") {
    renderHistory();
  }
}


/* =========================================================
   ENGINE TABS
========================================================= */

function initializeEngineTabs() {

  qsa(".engine-tab").forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const engine =
          button.dataset.engine;

        if (engine) {
          switchEngine(engine);
        }
      }
    );
  });
}

function switchEngine(engine) {

  state.currentEngine =
    engine;

  qsa(".engine-tab").forEach(button => {

    button.classList.toggle(
      "active",
      button.dataset.engine === engine
    );
  });

  qsa(".engine-panel").forEach(panel => {

    panel.classList.remove("active");
  });

  const panel =
    $(`${engine}Panel`);

  if (panel) {
    panel.classList.add("active");
  }
}


/* =========================================================
   BUTTONS
========================================================= */

function initializeButtons() {

  $("themeToggle")?.addEventListener(
    "click",
    toggleTheme
  );

  $("connectDerivBtn")?.addEventListener(
    "click",
    connectDeriv
  );

  $("demoModeBtn")?.addEventListener(
    "click",
    () => selectAccountMode("demo")
  );

  $("realModeBtn")?.addEventListener(
    "click",
    requestRealMode
  );

  $("startAI")?.addEventListener(
    "click",
    startCircularFromAnalysis
  );

  $("stopAI")?.addEventListener(
    "click",
    stopCircularAI
  );

  $("startBotBtn")?.addEventListener(
    "click",
    startAIBot
  );

  $("startCircularTradeBtn")?.addEventListener(
    "click",
    startCircularTradingEngine
  );

  $("placeTradeBtn")?.addEventListener(
    "click",
    placeManualTrade
  );

  $("stopTradingBtn")?.addEventListener(
    "click",
    stopAllTrading
  );

  $("clearLogsBtn")?.addEventListener(
    "click",
    clearHistory
  );

  $("botStrategyTrigger")?.addEventListener(
    "click",
    () => show($("botStrategyModal"))
  );

  $("circularStrategyTrigger")?.addEventListener(
    "click",
    () => openCircularStrategyModal()
  );

  $("manualStrategyTrigger")?.addEventListener(
    "click",
    () => show($("strategyModal"))
  );
}


/* =========================================================
   FORMS
========================================================= */

function initializeForms() {

  $("circularMarketSelect")
    ?.addEventListener(
      "change",
      event => {

        state.circular.market =
          event.target.value;
      }
    );

  $("manualMarketSelect")
    ?.addEventListener(
      "change",
      event => {

        state.selectedMarket =
          event.target.value;

        updateSelectedMarketUI();
      }
    );

  $("manualTargetDigitInput")
    ?.addEventListener(
      "input",
      event => {

        let value =
          Number(event.target.value);

        if (!Number.isFinite(value)) {
          return;
        }

        value =
          Math.max(
            0,
            Math.min(9, Math.round(value))
          );

        event.target.value =
          String(value);
      }
    );
}


/* =========================================================
   MODALS
========================================================= */

function initializeModals() {

  $("closeStrategyModal")
    ?.addEventListener(
      "click",
      () => hide($("strategyModal"))
    );

  $("closeBotStrategyModal")
    ?.addEventListener(
      "click",
      () => hide($("botStrategyModal"))
    );

  $("applyBotStrategies")
    ?.addEventListener(
      "click",
      applyBotStrategies
    );

  $("cancelRealBtn")
    ?.addEventListener(
      "click",
      () => hide($("realConfirmModal"))
    );

  $("confirmRealBtn")
    ?.addEventListener(
      "click",
      confirmRealMode
    );


  qsa(".modal").forEach(modal => {

    modal.addEventListener(
      "click",
      event => {

        if (event.target === modal) {
          hide(modal);
        }
      }
    );
  });
}

function openCircularStrategyModal() {

  renderStrategyOptions();

  show($("strategyModal"));
}

function applyBotStrategies() {

  const checked =
    qsa(".bot-strategy-check:checked")
      .map(input => input.value);

  if (!checked.length) {

    showToast(
      "Select at least one bot strategy"
    );

    return;
  }

  state.botStrategyPool =
    checked;

  updateStrategyLabels();

  hide($("botStrategyModal"));

  showToast(
    `Bot pool: ${checked.join(" + ")}`
  );
}


/* =========================================================
   ACCOUNT MODE
========================================================= */

function selectAccountMode(mode) {

  if (mode === "real") {
    requestRealMode();
    return;
  }

  state.accountMode =
    "demo";

  document.body.classList.remove(
    "real-mode"
  );

  document.body.classList.add(
    "demo-mode"
  );

  $("demoModeBtn")
    ?.classList.add("active");

  $("realModeBtn")
    ?.classList.remove("active");

  setText(
    "tradingStatusLabel",
    "PAPER MODE"
  );

  showToast(
    "DEMO account mode selected"
  );
}

function requestRealMode() {

  show($("realConfirmModal"));
}

function confirmRealMode() {

  state.accountMode =
    "real";

  document.body.classList.remove(
    "demo-mode"
  );

  document.body.classList.add(
    "real-mode"
  );

  $("realModeBtn")
    ?.classList.add("active");

  $("demoModeBtn")
    ?.classList.remove("active");

  setText(
    "tradingStatusLabel",
    "REAL SELECTED • PAPER"
  );

  hide($("realConfirmModal"));

  showToast(
    "REAL selected — paper execution only"
  );
}


/* =========================================================
   BACKEND CONFIG
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

    if (!response.ok) {
      throw new Error(
        `Backend HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    state.backendConfig =
      data;

    console.log(
      "KRISHWAVE backend config:",
      data
    );

    setText(
      "dataStatus",
      "Railway backend online • Live market data available"
    );

  } catch (error) {

    console.error(
      "Backend config error:",
      error
    );

    setText(
      "dataStatus",
      "Live market data is starting..."
    );
  }
}


/* =========================================================
   DERIV OAUTH CONNECT
========================================================= */

async function connectDeriv() {

  if (state.oauth.processing) {
    return;
  }

  state.oauth.processing =
    true;

  updateConnectionUI(
    "CONNECTING",
    "OPENING DERIV LOGIN..."
  );

  try {

    if (!state.backendConfig) {

      await loadBackendConfig();
    }

    const config =
      state.backendConfig;

    if (
      !config ||
      !config.client_id ||
      !config.redirect_uri
    ) {

      throw new Error(
        "KRISHWAVE backend configuration unavailable"
      );
    }


    const verifier =
      generateCodeVerifier();

    const challenge =
      await generateCodeChallenge(
        verifier
      );

    const oauthState =
      generateRandomString(32);


    sessionStorage.setItem(
      "kw_code_verifier",
      verifier
    );

    sessionStorage.setItem(
      "kw_oauth_state",
      oauthState
    );


    const params =
      new URLSearchParams();

    params.set(
      "response_type",
      "code"
    );

    params.set(
      "client_id",
      config.client_id
    );

    params.set(
      "redirect_uri",
      config.redirect_uri
    );

    params.set(
      "scope",
      "trade account_manage application_read"
    );

    params.set(
      "state",
      oauthState
    );

    params.set(
      "code_challenge",
      challenge
    );

    params.set(
      "code_challenge_method",
      "S256"
    );


    window.location.href =
      `${DERIV_AUTH_URL}?${params.toString()}`;

  } catch (error) {

    console.error(
      "Deriv connect error:",
      error
    );

    state.oauth.processing =
      false;

    updateConnectionUI(
      "OFFLINE",
      "CONNECT FAILED"
    );

    showToast(
      error.message ||
      "Unable to start Deriv login"
    );
  }
}


/* =========================================================
   OAUTH CALLBACK
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
      "OAuth returned error:",
      oauthError
    );

    cleanOAuthUrl();

    showToast(
      `Deriv login cancelled: ${oauthError}`
    );

    return;
  }


  if (!code) {
    return;
  }


  state.oauth.processing =
    true;

  updateConnectionUI(
    "CONNECTING",
    "FINISHING DERIV CONNECTION..."
  );


  try {

    const savedState =
      sessionStorage.getItem(
        "kw_oauth_state"
      );

    const verifier =
      sessionStorage.getItem(
        "kw_code_verifier"
      );


    if (
      !savedState ||
      !returnedState ||
      savedState !== returnedState
    ) {

      throw new Error(
        "OAuth security state check failed"
      );
    }

    if (!verifier) {

      throw new Error(
        "OAuth PKCE verifier missing"
      );
    }


    if (!state.backendConfig) {
      await loadBackendConfig();
    }


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
            code_verifier: verifier
          })
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.success ||
      !data.session_id
    ) {

      throw new Error(
        data.error ||
        "OAuth exchange failed"
      );
    }


    state.sessionId =
      data.session_id;

    sessionStorage.setItem(
      "kw_session_id",
      state.sessionId
    );


    sessionStorage.removeItem(
      "kw_oauth_state"
    );

    sessionStorage.removeItem(
      "kw_code_verifier"
    );


    cleanOAuthUrl();

    await loadAccounts();

  } catch (error) {

    console.error(
      "OAuth callback error:",
      error
    );

    sessionStorage.removeItem(
      "kw_oauth_state"
    );

    sessionStorage.removeItem(
      "kw_code_verifier"
    );

    cleanOAuthUrl();

    state.sessionId =
      null;

    sessionStorage.removeItem(
      "kw_session_id"
    );

    updateConnectionUI(
      "OFFLINE",
      "DERIV CONNECTION FAILED"
    );

    showToast(
      error.message ||
      "Deriv connection failed"
    );

  } finally {

    state.oauth.processing =
      false;
  }
}

function cleanOAuthUrl() {

  try {

    const cleanUrl =
      window.location.origin +
      window.location.pathname;

    window.history.replaceState(
      {},
      document.title,
      cleanUrl
    );

  } catch (error) {
    console.warn(
      "Unable to clean OAuth URL",
      error
    );
  }
}


/* =========================================================
   PKCE HELPERS
========================================================= */

function generateRandomString(length) {

  const bytes =
    new Uint8Array(length);

  crypto.getRandomValues(bytes);

  return Array.from(
    bytes,
    byte =>
      ("0" + byte.toString(16))
        .slice(-2)
  ).join("");
}

function generateCodeVerifier() {

  const bytes =
    new Uint8Array(64);

  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(
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
    new Uint8Array(digest)
  );
}

function base64UrlEncode(bytes) {

  let binary = "";

  bytes.forEach(
    byte => {
      binary += String.fromCharCode(
        byte
      );
    }
  );

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


/* =========================================================
   ACCOUNT LOAD
========================================================= */

async function loadAccounts() {

  if (!state.sessionId) {
    throw new Error(
      "Deriv session is missing"
    );
  }


  try {

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


    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data.error ||
        "Unable to load Deriv accounts"
      );
    }


    const accounts =
      normalizeAccounts(
        data.accounts
      );


    if (!accounts.length) {

      throw new Error(
        "No Deriv accounts returned"
      );
    }


    const demo =
      accounts.find(
        account =>
          isDemoAccount(account)
      );


    const selected =
      demo || accounts[0];


    state.accountInfo =
      selected;


    setText(
      "accountId",
      selected.loginid ||
      selected.account_id ||
      "Connected"
    );


    setText(
      "currency",
      selected.currency ||
      "USD"
    );


    if (
      selected.balance !== undefined
    ) {

      const realBalance =
        Number(selected.balance);

      if (
        Number.isFinite(realBalance)
      ) {

        setText(
          "balanceDisplay",
          formatMoney(realBalance)
        );
      }
    }


    updateConnectionUI(
      "ONLINE",
      "DERIV ACCOUNT CONNECTED"
    );


    showToast(
      `Connected: ${
        selected.loginid ||
        selected.account_id ||
        "Deriv account"
      }`
    );


    if (
      selected.loginid ||
      selected.account_id
    ) {

      await connectAuthenticatedWebSocket(
        selected
      );
    }

  } catch (error) {

    console.error(
      "Account load error:",
      error
    );

    updateConnectionUI(
      "OFFLINE",
      "ACCOUNT CONNECTION FAILED"
    );

    showToast(
      error.message ||
      "Unable to load Deriv account"
    );
  }
}

function normalizeAccounts(accounts) {

  if (Array.isArray(accounts)) {
    return accounts;
  }

  if (
    accounts &&
    Array.isArray(accounts.accounts)
  ) {
    return accounts.accounts;
  }

  if (
    accounts &&
    typeof accounts === "object"
  ) {

    return Object.values(accounts)
      .filter(
        value =>
          value &&
          typeof value === "object"
      );
  }

  return [];
}

function isDemoAccount(account) {

  const text =
    JSON.stringify(account)
      .toLowerCase();

  return (
    text.includes("demo") ||
    text.includes("virtual") ||
    text.includes("vrtc")
  );
}


/* =========================================================
   AUTHENTICATED WEBSOCKET
========================================================= */

async function connectAuthenticatedWebSocket(
  account
) {

  const accountId =
    account.loginid ||
    account.account_id;


  if (!accountId) {
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
              accountId
          })
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.success ||
      !data.websocket_url
    ) {

      throw new Error(
        data.error ||
        "Unable to obtain Deriv WebSocket"
      );
    }


    if (
      state.authenticatedWs
    ) {

      try {
        state.authenticatedWs.close();
      } catch {}
    }


    const ws =
      new WebSocket(
        data.websocket_url
      );

    state.authenticatedWs =
      ws;


    ws.addEventListener(
      "open",
      () => {

        state.authenticatedConnected =
          true;

        console.log(
          "Authenticated Deriv WebSocket connected"
        );
      }
    );


    ws.addEventListener(
      "close",
      () => {

        state.authenticatedConnected =
          false;
      }
    );


    ws.addEventListener(
      "error",
      error => {

        console.warn(
          "Authenticated WS error",
          error
        );
      }
    );


  } catch (error) {

    console.error(
      "Authenticated WebSocket error:",
      error
    );

    showToast(
      "Account connected, live account channel unavailable"
    );
  }
}


/* =========================================================
   PUBLIC DERIV WEBSOCKET
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


  updateConnectionUI(
    "CONNECTING",
    "CONNECTING TO LIVE MARKETS..."
  );


  let ws;

  try {

    ws =
      new WebSocket(
        PUBLIC_WS
      );

  } catch (error) {

    console.error(
      "WebSocket creation failed:",
      error
    );

    updateConnectionUI(
      "OFFLINE",
      "LIVE DATA OFFLINE"
    );

    retryPublicConnection();

    return;
  }


  state.publicWs =
    ws;


  ws.addEventListener(
    "open",
    handlePublicOpen
  );

  ws.addEventListener(
    "message",
    handlePublicMessage
  );

  ws.addEventListener(
    "error",
    handlePublicError
  );

  ws.addEventListener(
    "close",
    handlePublicClose
  );
}

function handlePublicOpen() {

  console.log(
    "KRISHWAVE public WebSocket connected"
  );

  state.publicConnected =
    true;


  updateConnectionUI(
    "ONLINE",
    "LIVE DERIV DATA CONNECTED"
  );


  subscribeToAllMarkets();

  showToast(
    "Live Deriv market data connected"
  );
}

function handlePublicError(error) {

  console.warn(
    "Public WebSocket error:",
    error
  );

  state.publicConnected =
    false;

  updateConnectionUI(
    "CONNECTING",
    "RECONNECTING LIVE DATA..."
  );
}

function handlePublicClose() {

  console.warn(
    "Public WebSocket closed"
  );

  state.publicConnected =
    false;

  updateConnectionUI(
    "CONNECTING",
    "LIVE DATA RECONNECTING..."
  );

  retryPublicConnection();
}

function retryPublicConnection() {

  window.clearTimeout(
    state.publicReconnectTimer
  );

  state.publicReconnectTimer =
    window.setTimeout(
      () => {

        connectPublicWebSocket();

      },
      3000
    );
}


/* =========================================================
   MARKET SUBSCRIPTIONS
========================================================= */

function subscribeToAllMarkets() {

  const ws =
    state.publicWs;

  if (
    !ws ||
    ws.readyState !== WebSocket.OPEN
  ) {
    return;
  }


  MARKETS.forEach(
    market => {

      const request = {
        ticks_history: market,
        count: 120,
        end: "latest",
        style: "ticks",
        subscribe: 1
      };

      try {

        ws.send(
          JSON.stringify(request)
        );

      } catch (error) {

        console.warn(
          `Subscription failed: ${market}`,
          error
        );
      }
    }
  );
}


/* =========================================================
   PUBLIC MESSAGE HANDLER
========================================================= */

function handlePublicMessage(event) {

  let data;

  try {

    data =
      JSON.parse(event.data);

  } catch (error) {

    return;
  }


  if (
    data.error
  ) {

    console.warn(
      "Deriv public API error:",
      data.error
    );

    return;
  }


  if (
    data.history
  ) {

    handleTickHistory(
      data
    );

    return;
  }


  if (
    data.tick
  ) {

    handleLiveTick(
      data.tick
    );

    return;
  }
}


/* =========================================================
   TICK HISTORY
========================================================= */

function handleTickHistory(data) {

  const symbol =
    data.echo_req?.ticks_history ||
    data.echo_req?.symbol ||
    data.history?.symbol;


  if (!symbol) {
    return;
  }


  const market =
    getMarket(symbol);

  if (!market) {
    return;
  }


  const prices =
    Array.isArray(data.history?.prices)
      ? data.history.prices
      : [];

  const times =
    Array.isArray(data.history?.times)
      ? data.history.times
      : [];


  market.ticks = [];
  market.digits = [];
  market.digitCounts =
    Array(10).fill(0);


  prices.forEach(
    (price, index) => {

      const timestamp =
        times[index]
          ? Number(times[index]) * 1000
          : Date.now();

      processMarketTick(
        market,
        price,
        timestamp,
        false
      );
    }
  );


  if (prices.length) {

    market.price =
      Number(prices[prices.length - 1]);

    market.previousPrice =
      prices.length > 1
        ? Number(
            prices[prices.length - 2]
          )
        : null;
  }


  renderAnalysis();
}


/* =========================================================
   LIVE TICK
========================================================= */

function handleLiveTick(tick) {

  const symbol =
    tick.symbol;

  if (!symbol) {
    return;
  }


  const market =
    getMarket(symbol);

  if (!market) {
    return;
  }


  const quote =
    Number(tick.quote);

  if (
    !Number.isFinite(quote)
  ) {
    return;
  }


  const timestamp =
    tick.epoch
      ? Number(tick.epoch) * 1000
      : Date.now();


  processMarketTick(
    market,
    quote,
    timestamp,
    true
  );


  updateCurrentMarketIfNeeded(
    market
  );


  settleTradesForMarket(
    market
  );


  renderActiveTrades();

  renderTradingStats();

  renderHistorySummary();

  updateAIAnalysis();

  drawChart();

  checkAutoEngines();

  checkSessionLimits();
}

function getMarket(symbol) {

  if (!state.marketData.has(symbol)) {

    state.marketData.set(
      symbol,
      createMarketState(symbol)
    );
  }

  return state.marketData.get(
    symbol
  );
}


/* =========================================================
   PROCESS MARKET TICK
========================================================= */

function processMarketTick(
  market,
  price,
  timestamp,
  isLive
) {

  const numericPrice =
    Number(price);

  if (
    !Number.isFinite(numericPrice)
  ) {
    return;
  }


  market.previousPrice =
    market.price;

  market.price =
    numericPrice;

  market.quote =
    numericPrice;

  market.lastTickAt =
    timestamp;


  if (
    market.decimals === null
  ) {

    market.decimals =
      inferDecimalsFromPrice(
        numericPrice
      );
  }


  const digit =
    extractLastDigit(
      numericPrice,
      market.decimals
    );


  market.lastDigit =
    digit;


  market.ticks.push({
    price: numericPrice,
    time: timestamp,
    digit
  });


  market.digits.push(
    digit
  );


  market.digitCounts[digit]++;


  if (market.ticks.length > 150) {
    market.ticks.shift();
  }

  if (market.digits.length > 150) {
    market.digits.shift();
  }


  market.sequence =
    ++state.tickSequence;


  if (isLive) {

    market.lastLiveSequence =
      market.sequence;
  }


  calculateMarketScore(
    market
  );
}


/* =========================================================
   DIGIT EXTRACTION
========================================================= */

function inferDecimalsFromPrice(price) {

  const text =
    String(price);

  if (
    text.includes("e-")
  ) {

    const parts =
      text.split("e-");

    return Number(parts[1]) || 2;
  }


  const decimalIndex =
    text.indexOf(".");


  if (decimalIndex === -1) {
    return 0;
  }


  return Math.min(
    8,
    text.length - decimalIndex - 1
  );
}

function extractLastDigit(
  price,
  decimals
) {

  let fixed;

  try {

    fixed =
      Number(price)
        .toFixed(
          Math.max(
            0,
            decimals
          )
        );

  } catch {

    fixed =
      String(price);
  }


  const digits =
    fixed.replace(
      /\D/g,
      ""
    );


  if (!digits.length) {
    return 0;
  }


  return Number(
    digits[digits.length - 1]
  );
}


/* =========================================================
   MARKET SCORE
========================================================= */

function calculateMarketScore(market) {

  const digits =
    market.digits.slice(-80);


  if (
    digits.length < 10
  ) {

    market.score = 0;
    market.confidence = 0;

    return;
  }


  const counts =
    Array(10).fill(0);


  digits.forEach(
    digit => {

      if (
        Number.isInteger(digit)
      ) {
        counts[digit]++;
      }
    }
  );


  const total =
    digits.length;


  const frequencies =
    counts.map(
      count =>
        count / total
    );


  const maxFreq =
    Math.max(
      ...frequencies
    );


  const minFreq =
    Math.min(
      ...frequencies
    );


  const spread =
    maxFreq - minFreq;


  const recent =
    digits.slice(-12);


  let repeatCount = 0;

  if (recent.length >= 2) {

    const last =
      recent[recent.length - 1];

    recent.forEach(
      digit => {

        if (digit === last) {
          repeatCount++;
        }
      }
    );
  }


  const concentration =
    maxFreq * 100;


  const recency =
    recent.length
      ? (
          recent.filter(
            digit =>
              digit ===
              recent[recent.length - 1]
          ).length /
          recent.length
        ) * 100
      : 0;


  market.score =
    Math.round(
      Math.min(
        100,
        30 +
        concentration * .55 +
        spread * 100 * .2 +
        recency * .15
      )
    );


  market.confidence =
    Math.round(
      Math.min(
        96,
        Math.max(
          50,
          48 +
          spread * 90 +
          Math.abs(
            concentration - 10
          ) * .35
        )
      )
    );
}


/* =========================================================
   AI SCANNER
========================================================= */

function scanBestMarket(
  strategyPool =
    state.botStrategyPool
) {

  let best = null;


  MARKETS.forEach(
    symbol => {

      const market =
        getMarket(symbol);


      if (
        market.digits.length < 10
      ) {
        return;
      }


      const analysis =
        analyzeMarketForStrategies(
          market,
          strategyPool
        );


      if (!analysis) {
        return;
      }


      const candidate = {
        market,
        ...analysis
      };


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

    const fallback =
      getMarket(
        state.selectedMarket
      );

    return {
      market: fallback,
      strategy:
        strategyPool[0] ||
        "MATCHES",
      prediction:
        fallback.lastDigit ?? 0,
      confidence: 50,
      score: 0
    };
  }


  return best;
}

function analyzeMarketForStrategies(
  market,
  strategyPool
) {

  const digits =
    market.digits.slice(-80);


  if (
    digits.length < 10
  ) {
    return null;
  }


  const counts =
    Array(10).fill(0);


  digits.forEach(
    digit => {

      if (
        Number.isInteger(digit)
      ) {
        counts[digit]++;
      }
    }
  );


  const total =
    digits.length;


  let best =
    null;


  strategyPool.forEach(
    strategy => {

      const prediction =
        predictStrategy(
          market,
          strategy,
          counts,
          total
        );


      if (!prediction) {
        return;
      }


      const candidate = {

        strategy,

        prediction:
          prediction.prediction,

        targetDigit:
          prediction.targetDigit,

        confidence:
          prediction.confidence,

        score:
          Math.round(
            (
              prediction.confidence +
              market.score
            ) / 2
          )
      };


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


  return best;
}


/* =========================================================
   STRATEGY PREDICTION
========================================================= */

function predictStrategy(
  market,
  strategy,
  counts,
  total
) {

  if (!total) {
    return null;
  }


  const frequencies =
    counts.map(
      count =>
        count / total
    );


  const highestDigit =
    frequencies.indexOf(
      Math.max(...frequencies)
    );


  const lowestDigit =
    frequencies.indexOf(
      Math.min(...frequencies)
    );


  const evenCount =
    counts.reduce(
      (sum, count, digit) =>
        sum +
        (
          digit % 2 === 0
            ? count
            : 0
        ),
      0
    );


  const oddCount =
    total - evenCount;


  const over4 =
    counts.reduce(
      (sum, count, digit) =>
        sum +
        (
          digit > 4
            ? count
            : 0
        ),
      0
    );


  const under5 =
    counts.reduce(
      (sum, count, digit) =>
        sum +
        (
          digit < 5
            ? count
            : 0
        ),
      0
    );


  let prediction =
    highestDigit;

  let targetDigit =
    highestDigit;

  let probability = .5;


  switch (strategy) {

    case "MATCHES":

      prediction =
        highestDigit;

      targetDigit =
        highestDigit;

      probability =
        frequencies[highestDigit];

      break;


    case "DIFFERS":

      prediction =
        lowestDigit;

      targetDigit =
        highestDigit;

      probability =
        1 -
        frequencies[highestDigit];

      break;


    case "OVER":

      targetDigit = 4;

      prediction =
        highestDigit > 4
          ? highestDigit
          : 5;

      probability =
        over4 / total;

      break;


    case "UNDER":

      targetDigit = 5;

      prediction =
        highestDigit < 5
          ? highestDigit
          : 4;

      probability =
        under5 / total;

      break;


    case "EVEN":

      prediction =
        evenCount >= oddCount
          ? "EVEN"
          : "ODD";

      probability =
        Math.max(
          evenCount,
          oddCount
        ) / total;

      break;


    case "ODD":

      prediction =
        oddCount >= evenCount
          ? "ODD"
          : "EVEN";

      probability =
        Math.max(
          oddCount,
          evenCount
        ) / total;

      break;


    default:
      return null;
  }


  const confidence =
    Math.round(
      Math.max(
        50,
        Math.min(
          96,
          probability * 100
        )
      )
    );


  return {
    prediction,
    targetDigit,
    confidence
  };
}


/* =========================================================
   AI ANALYSIS
========================================================= */

function updateAIAnalysis() {

  const result =
    scanBestMarket(
      state.botStrategyPool
    );


  if (!result) {
    return;
  }


  state.latestSignal =
    result;


  state.selectedMarket =
    result.market.symbol;

  state.selectedStrategy =
    result.strategy;


  result.market.strategy =
    result.strategy;

  result.market.prediction =
    result.prediction;

  result.market.confidence =
    result.confidence;


  setText(
    "currentChartMarket",
    result.market.symbol
  );

  setText(
    "currentLivePrice",
    formatPrice(
      result.market.price
    )
  );


  setText(
    "aiMarket",
    result.market.symbol
  );

  setText(
    "aiPrediction",
    formatPrediction(
      result.prediction
    )
  );

  setText(
    "aiType",
    result.strategy
  );

  setText(
    "analysisConfidence",
    `${result.confidence}%`
  );


  setText(
    "botSelectedMarket",
    result.market.symbol
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
    formatPrediction(
      result.prediction
    )
  );

  setText(
    "predictionConfidence",
    `${result.confidence}% confidence`
  );


  const message =
    buildSignalMessage(
      result
    );


  setText(
    "analysisMsg",
    message
  );


  updateDigitDistribution(
    result.market
  );
}

function buildSignalMessage(
  result
) {

  const strategy =
    result.strategy;

  if (
    strategy === "MATCHES"
  ) {

    return `AI analysis favors ${result.market.symbol} — ${strategy} target ${result.targetDigit}. Confidence ${result.confidence}%.`;
  }

  if (
    strategy === "DIFFERS"
  ) {

    return `AI analysis favors ${result.market.symbol} — DIFFERS from target ${result.targetDigit}. Confidence ${result.confidence}%.`;
  }

  if (
    strategy === "OVER"
  ) {

    return `AI analysis favors digits OVER 4 on ${result.market.symbol}. Confidence ${result.confidence}%.`;
  }

  if (
    strategy === "UNDER"
  ) {

    return `AI analysis favors digits UNDER 5 on ${result.market.symbol}. Confidence ${result.confidence}%.`;
  }

  if (
    strategy === "EVEN" ||
    strategy === "ODD"
  ) {

    return `AI analysis favors ${result.strategy} on ${result.market.symbol}. Confidence ${result.confidence}%.`;
  }

  return "AI is analyzing live market data.";
}


/* =========================================================
   ANALYSIS RENDER
========================================================= */

function renderAnalysis() {

  const market =
    getMarket(
      state.selectedMarket
    );


  setText(
    "currentChartMarket",
    market.symbol
  );

  setText(
    "currentLivePrice",
    formatPrice(
      market.price
    )
  );

  setText(
    "digitSampleCount",
    market.digits.length
  );


  updateDigitDistribution(
    market
  );

  drawChart();
}

function updateCurrentMarketIfNeeded(
  market
) {

  if (
    market.symbol ===
    state.selectedMarket
  ) {

    setText(
      "currentLivePrice",
      formatPrice(
        market.price
      )
    );

    setText(
      "digitSampleCount",
      market.digits.length
    );

    updateDigitDistribution(
      market
    );
  }
}

function updateSelectedMarketUI() {

  const market =
    getMarket(
      state.selectedMarket
    );


  setText(
    "currentChartMarket",
    market.symbol
  );

  setText(
    "currentLivePrice",
    formatPrice(
      market.price
    )
  );

  drawChart();
}

function updateDigitDistribution(
  market
) {

  const grid =
    $("digitStatsGrid");

  if (!grid) {
    return;
  }


  const total =
    market.digits.length;


  grid.innerHTML = "";


  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    const percentage =
      total
        ? (
            market.digitCounts[digit] /
            total
          ) * 100
        : 0;


    const item =
      document.createElement("div");

    item.className =
      "digit-stat";


    item.innerHTML = `
      <span>${digit}</span>
      <strong>${percentage.toFixed(1)}%</strong>
    `;


    if (
      market.lastDigit === digit
    ) {

      item.style.borderColor =
        "rgba(25,211,255,.45)";

      item.style.background =
        "rgba(25,211,255,.08)";
    }


    grid.appendChild(item);
  }
}


/* =========================================================
   CHART
========================================================= */

function drawChart() {

  const canvas =
    $("priceChartCanvas");

  if (!canvas) {
    return;
  }


  const wrapper =
    canvas.parentElement;

  if (!wrapper) {
    return;
  }


  const width =
    Math.max(
      280,
      wrapper.clientWidth
    );

  const height =
    Math.max(
      150,
      wrapper.clientHeight
    );


  const ratio =
    window.devicePixelRatio || 1;


  canvas.width =
    width * ratio;

  canvas.height =
    height * ratio;


  canvas.style.width =
    `${width}px`;

  canvas.style.height =
    `${height}px`;


  const ctx =
    canvas.getContext("2d");

  if (!ctx) {
    return;
  }


  ctx.setTransform(
    ratio,
    0,
    0,
    ratio,
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
    getMarket(
      state.selectedMarket
    );


  const prices =
    market.ticks
      .slice(-70)
      .map(
        tick =>
          Number(tick.price)
      )
      .filter(
        Number.isFinite
      );


  if (
    prices.length < 2
  ) {

    ctx.fillStyle =
      "rgba(142,162,184,.65)";

    ctx.font =
      "11px system-ui";

    ctx.textAlign =
      "center";

    ctx.fillText(
      "Waiting for live price data...",
      width / 2,
      height / 2
    );

    return;
  }


  const min =
    Math.min(...prices);

  const max =
    Math.max(...prices);

  const range =
    max - min || 1;


  const padding =
    15;


  ctx.beginPath();


  prices.forEach(
    (price, index) => {

      const x =
        padding +
        (
          index /
          (prices.length - 1)
        ) *
        (
          width -
          padding * 2
        );


      const y =
        height -
        padding -
        (
          (
            price - min
          ) /
          range
        ) *
        (
          height -
          padding * 2
        );


      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  );


  ctx.strokeStyle =
    "#19d3ff";

  ctx.lineWidth =
    2;

  ctx.stroke();


  const last =
    prices[prices.length - 1];


  const lastX =
    width - padding;


  const lastY =
    height -
    padding -
    (
      (
        last - min
      ) /
      range
    ) *
    (
      height -
      padding * 2
    );


  ctx.beginPath();

  ctx.arc(
    lastX,
    lastY,
    3.5,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "#19d3ff";

  ctx.fill();
}


/* =========================================================
   CIRCULAR AI
========================================================= */

function startCircularFromAnalysis() {

  switchEngine(
    "circular"
  );

  navigateTo(
    "trade"
  );

  startCircularTradingEngine();
}

function startCircularTradingEngine() {

  if (
    state.circular.running
  ) {

    showToast(
      "Circular AI is already running"
    );

    return;
  }


  state.circular.running =
    true;


  state.circular.market =
    $("circularMarketSelect")?.value ||
    state.selectedMarket;


  state.circular.strategy =
    state.circular.strategy ||
    "MATCHES";


  const strategy =
    state.circular.strategy;


  setText(
    "circularStrategyLabel",
    strategy
  );


  beginCircularAnalysis();

  showToast(
    "Circular AI started"
  );
}

function beginCircularAnalysis() {

  if (
    !state.circular.running
  ) {
    return;
  }


  state.circular.stage =
    "ANALYZING";


  state.circular.prediction =
    null;


  state.circular.deadline =
    Date.now() +
    10000;


  updateCircularStageUI();

  startCircularTimer();
}

function startCircularTimer() {

  window.clearInterval(
    state.circular.timer
  );


  state.circular.timer =
    window.setInterval(
      circularTick,
      100
    );


  circularTick();
}

function circularTick() {

  if (
    !state.circular.running
  ) {

    window.clearInterval(
      state.circular.timer
    );

    return;
  }


  const remainingMs =
    state.circular.deadline -
    Date.now();


  const remaining =
    Math.max(
      0,
      Math.ceil(
        remainingMs / 1000
      )
    );


  setText(
    "aiCircleTimer",
    remaining
  );


  updateCircleProgress(
    remainingMs
  );


  if (
    remainingMs <= 0
  ) {

    advanceCircularStage();
  }
}

function advanceCircularStage() {

  if (
    state.circular.stage ===
    "ANALYZING"
  ) {

    generateCircularPrediction();

    state.circular.stage =
      "LOCK";

    state.circular.deadline =
      Date.now() +
      5000;


    updateCircularStageUI();

    return;
  }


  if (
    state.circular.stage ===
    "LOCK"
  ) {

    state.circular.stage =
      "TRADE";

    state.circular.deadline =
      Date.now() +
      3000;


    updateCircularStageUI();

    return;
  }


  if (
    state.circular.stage ===
    "TRADE"
  ) {

    executeCircularPaperTrade();

    beginCircularAnalysis();
  }
}

function generateCircularPrediction() {

  const selectedMarket =
    getMarket(
      state.circular.market
    );


  const analysis =
    analyzeMarketForStrategies(
      selectedMarket,
      [
        state.circular.strategy
      ]
    );


  if (analysis) {

    state.circular.prediction =
      analysis.prediction;

  } else {

    state.circular.prediction =
      selectedMarket.lastDigit ??
      0;
  }


  setText(
    "aiCirclePrediction",
    formatPrediction(
      state.circular.prediction
    )
  );


  setText(
    "circularStatusText",
    "PREDICTION LOCKED"
  );
}

function updateCircularStageUI() {

  const circle =
    $("aiCircle");


  if (circle) {

    circle.classList.remove(
      "analyzing",
      "locked",
      "trade-now"
    );


    if (
      state.circular.stage ===
      "ANALYZING"
    ) {

      circle.classList.add(
        "analyzing"
      );

    } else if (
      state.circular.stage ===
      "LOCK"
    ) {

      circle.classList.add(
        "locked"
      );

    } else if (
      state.circular.stage ===
      "TRADE"
    ) {

      circle.classList.add(
        "trade-now"
      );
    }
  }


  qsa(".cycle-stage")
    .forEach(stage =>
      stage.classList.remove(
        "active"
      )
    );


  if (
    state.circular.stage ===
    "ANALYZING"
  ) {

    $("cycleAnalysis")
      ?.classList.add("active");

    setText(
      "aiCircleLabel",
      "ANALYZING"
    );

    setText(
      "aiCircleStatus",
      "ANALYZING"
    );

    setText(
      "circularStatusText",
      "ANALYZING"
    );

  } else if (
    state.circular.stage ===
    "LOCK"
  ) {

    $("cycleTrade")
      ?.classList.add("active");

    setText(
      "aiCircleLabel",
      "LOCKED"
    );

    setText(
      "aiCircleStatus",
      "LOCK"
    );

    setText(
      "circularStatusText",
      "LOCK"
    );

  } else {

    $("cycleCooldown")
      ?.classList.add("active");

    setText(
      "aiCircleLabel",
      "TRADE NOW"
    );

    setText(
      "aiCircleStatus",
      "TRADE NOW"
    );

    setText(
      "circularStatusText",
      "TRADE NOW"
    );
  }
}

function updateCircleProgress(
  remainingMs
) {

  const circle =
    $("aiCircle");

  if (!circle) {
    return;
  }


  let duration = 10000;


  if (
    state.circular.stage ===
    "LOCK"
  ) {
    duration = 5000;
  }


  if (
    state.circular.stage ===
    "TRADE"
  ) {
    duration = 3000;
  }


  const elapsed =
    Math.max(
      0,
      Math.min(
        duration,
        duration - remainingMs
      )
    );


  const progress =
    elapsed / duration;


  const degrees =
    progress * 360;


  circle.style.background =
    `conic-gradient(
      var(--primary) ${degrees}deg,
      rgba(25,211,255,.15) ${degrees}deg,
      rgba(255,255,255,.04) 360deg
    )`;
}

function stopCircularAI() {

  state.circular.running =
    false;


  window.clearInterval(
    state.circular.timer
  );


  state.circular.timer =
    null;


  state.circular.stage =
    "ANALYZING";


  state.circular.prediction =
    null;


  setText(
    "aiCircleLabel",
    "READY"
  );

  setText(
    "aiCirclePrediction",
    "—"
  );

  setText(
    "aiCircleTimer",
    "10"
  );

  setText(
    "aiCircleStatus",
    "STOPPED"
  );

  setText(
    "circularStatusText",
    "STOPPED"
  );


  $("aiCircle")
    ?.classList.remove(
      "analyzing",
      "locked",
      "trade-now"
    );


  qsa(".cycle-stage")
    .forEach(stage =>
      stage.classList.remove(
        "active"
      )
    );


  $("cycleAnalysis")
    ?.classList.add("active");


  showToast(
    "Circular AI stopped"
  );
}

function executeCircularPaperTrade() {

  const market =
    getMarket(
      state.circular.market
    );


  const strategy =
    state.circular.strategy;


  const prediction =
    state.circular.prediction;


  if (
    !market ||
    market.lastDigit === null
  ) {

    showToast(
      "Circular AI skipped — waiting for live tick"
    );

    return;
  }


  const targetDigit =
    getTargetForStrategy(
      strategy,
      prediction
    );


  const stake =
    getNumericInput(
      "circularStakeInput",
      MIN_STAKE
    );


  openPaperTrade({
    market,
    strategy,
    prediction,
    targetDigit,
    source: "CIRCULAR AI",
    stake,
    takeProfit:
      getNumericInput(
        "circularTakeProfitInput",
        10
      ),
    stopLoss:
      getNumericInput(
        "circularStopLossInput",
        10
      ),
    martingale: 1
  });
}


/* =========================================================
   AI BOT
========================================================= */

function startAIBot() {

  if (
    state.bot.running
  ) {

    showToast(
      "AI BOT is already running"
    );

    return;
  }


  state.bot.running =
    true;


  state.bot.baseStake =
    getNumericInput(
      "stakeInput",
      MIN_STAKE
    );


  state.bot.currentStake =
    state.bot.baseStake;


  state.bot.takeProfit =
    getNumericInput(
      "takeProfitInput",
      10
    );


  state.bot.stopLoss =
    getNumericInput(
      "stopLossInput",
      10
    );


  state.bot.martingale =
    Math.max(
      1,
      getNumericInput(
        "martingaleInput",
        2
      )
    );


  setText(
    "botStatusDash",
    "RUNNING"
  );


  showToast(
    "AI BOT started — paper execution"
  );


  runBotCycle();
}

function runBotCycle() {

  if (
    !state.bot.running
  ) {
    return;
  }


  checkSessionLimits();


  if (
    !state.bot.running
  ) {
    return;
  }


  const now =
    Date.now();


  if (
    now -
    state.bot.lastTradeAt <
    5000
  ) {

    state.bot.timer =
      window.setTimeout(
        runBotCycle,
        1000
      );

    return;
  }


  const signal =
    scanBestMarket(
      state.botStrategyPool
    );


  if (
    signal &&
    signal.confidence >= 55
  ) {

    const market =
      signal.market;


    const targetDigit =
      getTargetForStrategy(
        signal.strategy,
        signal.prediction
      );


    const opened =
      openPaperTrade({
        market,
        strategy:
          signal.strategy,
        prediction:
          signal.prediction,
        targetDigit,
        source:
          "AI BOT",
        stake:
          state.bot.currentStake,
        takeProfit:
          state.bot.takeProfit,
        stopLoss:
          state.bot.stopLoss,
        martingale:
          state.bot.martingale
      });


    if (opened) {

      state.bot.lastTradeAt =
        now;

      setText(
        "botStatusDash",
        `RUNNING • ${signal.strategy}`
      );
    }
  }


  state.bot.timer =
    window.setTimeout(
      runBotCycle,
      1000
    );
}

function stopAIBot() {

  state.bot.running =
    false;


  window.clearTimeout(
    state.bot.timer
  );


  state.bot.timer =
    null;


  setText(
    "botStatusDash",
    "STOPPED"
  );
}


/* =========================================================
   MANUAL PAPER TRADE
========================================================= */

function placeManualTrade() {

  const strategy =
    state.manual.strategy;


  const marketSymbol =
    $("manualMarketSelect")?.value ||
    state.selectedMarket;


  const market =
    getMarket(
      marketSymbol
    );


  if (
    !market ||
    market.lastDigit === null
  ) {

    showToast(
      "Waiting for live tick data"
    );

    return;
  }


  let targetDigit = null;


  if (
    strategy === "MATCHES" ||
    strategy === "DIFFERS" ||
    strategy === "OVER" ||
    strategy === "UNDER"
  ) {

    targetDigit =
      Number(
        $("manualTargetDigitInput")
          ?.value
      );


    if (
      !Number.isInteger(
        targetDigit
      ) ||
      targetDigit < 0 ||
      targetDigit > 9
    ) {

      showToast(
        "Enter a target digit from 0 to 9"
      );

      return;
    }
  }


  const prediction =
    strategy === "EVEN"
      ? "EVEN"
      : strategy === "ODD"
        ? "ODD"
        : targetDigit;


  openPaperTrade({
    market,
    strategy,
    prediction,
    targetDigit,
    source: "MANUAL",
    stake:
      getNumericInput(
        "manualStakeInput",
        MIN_STAKE
      ),
    takeProfit:
      getNumericInput(
        "manualTakeProfitInput",
        10
      ),
    stopLoss:
      getNumericInput(
        "manualStopLossInput",
        10
      ),
    martingale: 1
  });
}


/* =========================================================
   PAPER TRADE OPEN
========================================================= */

function openPaperTrade({
  market,
  strategy,
  prediction,
  targetDigit,
  source,
  stake,
  takeProfit,
  stopLoss,
  martingale
}) {

  if (
    !market ||
    market.lastDigit === null
  ) {

    showToast(
      "No live market tick available"
    );

    return false;
  }


  stake =
    normalizeStake(
      stake
    );


  if (
    stake > state.paperBalance
  ) {

    showToast(
      "Insufficient paper balance"
    );

    return false;
  }


  state.paperBalance -=
    stake;


  saveBalance();


  const trade = {

    id:
      `KW-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    market:
      market.symbol,

    strategy,

    prediction,

    targetDigit,

    entryDigit:
      market.lastDigit,

    entryPrice:
      market.price,

    stake,

    source,

    createdAt:
      Date.now(),

    takeProfit:
      Number(takeProfit) || 0,

    stopLoss:
      Number(stopLoss) || 0,

    martingale:
      Number(martingale) || 1,

    entrySequence:
      market.sequence,

    status:
      "ACTIVE"
  };


  state.activeTrades.push(
    trade
  );


  renderActiveTrades();

  renderTradingStats();

  showToast(
    `${source}: ${strategy} opened — ${market.symbol}`
  );


  return true;
}


/* =========================================================
   TARGET HELPERS
========================================================= */

function getTargetForStrategy(
  strategy,
  prediction
) {

  if (
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
  ) {

    const digit =
      Number(prediction);

    return Number.isInteger(digit)
      ? Math.max(
          0,
          Math.min(9, digit)
        )
      : 0;
  }


  if (
    strategy === "OVER"
  ) {
    return 4;
  }


  if (
    strategy === "UNDER"
  ) {
    return 5;
  }


  return null;
}


/* =========================================================
   SETTLE TRADES
========================================================= */

function settleTradesForMarket(
  market
) {

  if (
    !state.activeTrades.length
  ) {
    return;
  }


  const trades =
    state.activeTrades.filter(
      trade =>
        trade.market ===
        market.symbol
    );


  trades.forEach(
    trade => {

      /*
       * Important:
       * never settle on the opening tick.
       * We wait for a later live tick.
       */

      if (
        market.sequence <=
        trade.entrySequence
      ) {
        return;
      }


      const exitDigit =
        market.lastDigit;


      if (
        exitDigit === null ||
        exitDigit === undefined
      ) {
        return;
      }


      settleTrade(
        trade,
        market,
        exitDigit
      );
    }
  );
}

function settleTrade(
  trade,
  market,
  exitDigit
) {

  const index =
    state.activeTrades.findIndex(
      item =>
        item.id === trade.id
    );


  if (index === -1) {
    return;
  }


  const won =
    evaluateTrade(
      trade,
      exitDigit
    );


  let amountWon = 0;
  let net = 0;
  let profit = 0;


  if (won) {

    profit =
      trade.stake *
      (
        PAYOUT[
          trade.strategy
        ] || 0
      );


    amountWon =
      trade.stake +
      profit;


    net =
      profit;


    state.paperBalance +=
      amountWon;


  } else {

    amountWon = 0;

    net =
      -trade.stake;
  }


  saveBalance();


  const completed = {

    ...trade,

    exitDigit,

    exitPrice:
      market.price,

    result:
      won
        ? "WIN"
        : "LOSS",

    amountWon,

    net,

    settledAt:
      Date.now(),

    status:
      "SETTLED"
  };


  state.activeTrades.splice(
    index,
    1
  );


  state.history.unshift(
    completed
  );


  /*
   * Keep history manageable.
   */

  if (
    state.history.length > 500
  ) {

    state.history =
      state.history.slice(
        0,
        500
      );
  }


  saveHistory();


  /*
   * Martingale only belongs
   * to the AI BOT engine.
   */

  if (
    trade.source ===
    "AI BOT"
  ) {

    if (won) {

      state.bot.currentStake =
        state.bot.baseStake;

    } else {

      state.bot.currentStake =
        normalizeStake(
          trade.stake *
          state.bot.martingale
        );
    }
  }


  showToast(
    `${trade.result}: ${trade.strategy} ${market.symbol} • Net ${formatMoney(net)}`
  );


  renderActiveTrades();

  renderTradingStats();

  renderHistory();

  renderHistorySummary();

  updateBalanceDisplay();

  checkSessionLimits();
}

function evaluateTrade(
  trade,
  exitDigit
) {

  const target =
    trade.targetDigit;


  switch (
    trade.strategy
  ) {

    case "MATCHES":

      return (
        exitDigit ===
        target
      );


    case "DIFFERS":

      return (
        exitDigit !==
        target
      );


    case "OVER":

      return (
        exitDigit >
        target
      );


    case "UNDER":

      return (
        exitDigit <
        target
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
   SESSION LIMITS
========================================================= */

function calculateSessionProfit() {

  return state.history.reduce(
    (sum, trade) =>
      sum +
      Number(trade.net || 0),
    0
  );
}

function checkSessionLimits() {

  const profit =
    calculateSessionProfit();


  state.session.profit =
    profit;


  const takeProfit =
    Math.max(
      0,
      state.bot.takeProfit
    );


  const stopLoss =
    Math.max(
      0,
      state.bot.stopLoss
    );


  if (
    state.bot.running &&
    takeProfit > 0 &&
    profit >= takeProfit
  ) {

    stopAIBot();

    showToast(
      `Take profit reached: ${formatMoney(profit)}`
    );
  }


  if (
    state.bot.running &&
    stopLoss > 0 &&
    profit <= -stopLoss
  ) {

    stopAIBot();

    showToast(
      `Stop loss reached: ${formatMoney(profit)}`
    );
  }


  setText(
    "sessionProfitDisplay",
    formatMoney(profit)
  );


  const display =
    $("sessionProfitDisplay");

  if (display) {

    display.classList.toggle(
      "positive",
      profit > 0
    );

    display.classList.toggle(
      "negative",
      profit < 0
    );
  }
}


/* =========================================================
   STOP ALL TRADING
========================================================= */

function stopAllTrading() {

  stopAIBot();

  stopCircularAI();

  showToast(
    "All trading engines stopped"
  );
}


/* =========================================================
   TRADING UI
========================================================= */

function renderTradeUI() {

  updateBalanceDisplay();

  renderActiveTrades();

  renderTradingStats();

  checkSessionLimits();
}

function renderActiveTrades() {

  const container =
    $("activeTradesList");

  if (!container) {
    return;
  }


  setText(
    "activeTradeCount",
    state.activeTrades.length
  );


  if (
    !state.activeTrades.length
  ) {

    container.innerHTML = `
      <div class="empty-state">
        No active paper trades.
      </div>
    `;

    return;
  }


  container.innerHTML = "";


  state.activeTrades.forEach(
    trade => {

      const card =
        document.createElement("div");

      card.className =
        "active-trade-card";


      card.innerHTML = `
        <div class="active-trade-top">
          <strong>${escapeHtml(trade.market)}</strong>
          <span class="status-pill">ACTIVE</span>
        </div>

        <div class="active-trade-details">

          <div>
            <span>STRATEGY</span>
            <strong>${escapeHtml(trade.strategy)}</strong>
          </div>

          <div>
            <span>ENTRY</span>
            <strong>${escapeHtml(String(trade.entryDigit))}</strong>
          </div>

          <div>
            <span>STAKE</span>
            <strong>${formatMoney(trade.stake)}</strong>
          </div>

          <div>
            <span>TARGET</span>
            <strong>${trade.targetDigit === null ? "—" : trade.targetDigit}</strong>
          </div>

          <div>
            <span>SOURCE</span>
            <strong>${escapeHtml(trade.source)}</strong>
          </div>

          <div>
            <span>WAITING</span>
            <strong>NEXT TICK</strong>
          </div>

        </div>
      `;


      container.appendChild(
        card
      );
    }
  );
}

function renderTradingStats() {

  const total =
    state.history.length;

  const wins =
    state.history.filter(
      trade =>
        trade.result === "WIN"
    ).length;

  const losses =
    state.history.filter(
      trade =>
        trade.result === "LOSS"
    ).length;


  const accuracy =
    total
      ? (
          wins /
          total
        ) * 100
      : 0;


  setText(
    "paperTotal",
    total
  );

  setText(
    "paperWins",
    wins
  );

  setText(
    "paperLosses",
    losses
  );

  setText(
    "paperAccuracy",
    `${accuracy.toFixed(1)}%`
  );


  updateBalanceDisplay();
}

function updateBalanceDisplay() {

  setText(
    "balanceDisplay",
    formatMoney(
      state.paperBalance
    )
  );
}


/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

  const container =
    $("historyCardsList");

  if (!container) {
    return;
  }


  if (
    !state.history.length
  ) {

    container.innerHTML = `
      <div class="empty-state">
        No trades recorded yet.
      </div>
    `;

    return;
  }


  container.innerHTML = "";


  state.history.forEach(
    trade => {

      const card =
        document.createElement("div");


      card.className =
        `history-card ${
          trade.result === "WIN"
            ? "history-win"
            : "history-loss"
        }`;


      const time =
        new Date(
          trade.settledAt ||
          trade.createdAt
        ).toLocaleString();


      card.innerHTML = `

        <div class="history-top">

          <strong>
            ${escapeHtml(trade.market)}
          </strong>

          <span class="history-result ${
            trade.result === "WIN"
              ? "positive"
              : "negative"
          }">
            ${escapeHtml(trade.result)}
          </span>

        </div>


        <div class="history-meta">

          <div>
            <span>STRATEGY</span>
            <strong>
              ${escapeHtml(trade.strategy)}
            </strong>
          </div>

          <div>
            <span>PREDICTION</span>
            <strong>
              ${formatPrediction(
                trade.prediction
              )}
            </strong>
          </div>

          <div>
            <span>TARGET</span>
            <strong>
              ${
                trade.targetDigit === null ||
                trade.targetDigit === undefined
                  ? "—"
                  : trade.targetDigit
              }
            </strong>
          </div>

          <div>
            <span>ENTRY</span>
            <strong>
              ${trade.entryDigit}
            </strong>
          </div>

          <div>
            <span>EXIT</span>
            <strong>
              ${trade.exitDigit}
            </strong>
          </div>

          <div>
            <span>STAKE</span>
            <strong>
              ${formatMoney(trade.stake)}
            </strong>
          </div>

          <div>
            <span>AMOUNT WON</span>
            <strong class="${
              Number(trade.amountWon) > 0
                ? "positive"
                : ""
            }">
              ${formatMoney(
                trade.amountWon || 0
              )}
            </strong>
          </div>

          <div>
            <span>NET</span>
            <strong class="${
              Number(trade.net) > 0
                ? "positive"
                : Number(trade.net) < 0
                  ? "negative"
                  : ""
            }">
              ${formatMoney(
                trade.net || 0
              )}
            </strong>
          </div>

          <div>
            <span>SOURCE</span>
            <strong>
              ${escapeHtml(trade.source)}
            </strong>
          </div>

        </div>


        <div class="history-bottom">

          <span class="history-source">
            ${escapeHtml(time)}
          </span>

          <span class="history-source">
            PAPER
          </span>

        </div>
      `;


      container.appendChild(
        card
      );
    }
  );
}

function renderHistorySummary() {

  const totalStake =
    state.history.reduce(
      (sum, trade) =>
        sum +
        Number(trade.stake || 0),
      0
    );


  const amountWon =
    state.history.reduce(
      (sum, trade) =>
        sum +
        Number(
          trade.amountWon || 0
        ),
      0
    );


  const net =
    state.history.reduce(
      (sum, trade) =>
        sum +
        Number(trade.net || 0),
      0
    );


  setText(
    "historyTotalStake",
    formatMoney(totalStake)
  );

  setText(
    "historyAmountWon",
    formatMoney(amountWon)
  );

  setText(
    "historyNetProfit",
    formatMoney(net)
  );


  const netEl =
    $("historyNetProfit");

  if (netEl) {

    netEl.classList.toggle(
      "positive",
      net > 0
    );

    netEl.classList.toggle(
      "negative",
      net < 0
    );
  }
}

function clearHistory() {

  const confirmed =
    window.confirm(
      "Clear all KRISHWAVE trade history?"
    );


  if (!confirmed) {
    return;
  }


  state.history = [];

  saveHistory();

  renderHistory();

  renderTradingStats();

  renderHistorySummary();

  state.session.profit = 0;

  showToast(
    "Trade history cleared"
  );
}


/* =========================================================
   AUTO ENGINE CHECK
========================================================= */

function checkAutoEngines() {

  if (
    state.bot.running &&
    !state.bot.timer
  ) {

    runBotCycle();
  }
}


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(
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
      "connecting",
      "offline"
    );


    if (status === "ONLINE") {

      dot.classList.add(
        "online"
      );

    } else if (
      status === "CONNECTING"
    ) {

      dot.classList.add(
        "connecting"
      );

    } else {

      dot.classList.add(
        "offline"
      );
    }
  }


  if (text) {

    text.textContent =
      status;
  }


  if (message) {

    setText(
      "dataStatus",
      message
    );
  }


  state.connectionState =
    status;


  const button =
    $("connectDerivBtn");


  if (button) {

    if (
      status === "ONLINE"
    ) {

      button.textContent =
        "CONNECTED";

    } else if (
      status === "CONNECTING"
    ) {

      button.textContent =
        "CONNECTING...";

    } else {

      button.textContent =
        "CONNECT DERIV";
    }
  }
}


/* =========================================================
   GLOBAL UI
========================================================= */

function updateAllUI() {

  updateBalanceDisplay();

  updateStrategyLabels();

  renderTradingStats();

  renderActiveTrades();

  renderHistory();

  renderHistorySummary();

  renderAnalysis();

  updateTargetDigitVisibility();

  updateConnectionUI(
    "OFFLINE",
    "Starting KRISHWAVE live data..."
  );
}


/* =========================================================
   UTILITIES
========================================================= */

function getNumericInput(
  id,
  fallback
) {

  const value =
    Number(
      $(id)?.value
    );


  if (
    !Number.isFinite(value)
  ) {
    return fallback;
  }


  return value;
}

function normalizeStake(value) {

  let stake =
    Number(value);


  if (
    !Number.isFinite(stake) ||
    stake < MIN_STAKE
  ) {

    stake =
      MIN_STAKE;
  }


  stake =
    Math.round(
      stake * 100
    ) / 100;


  return stake;
}

function formatMoney(value) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number)
  ) {

    return "$0.00";
  }


  return (
    "$" +
    number.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  );
}

function formatPrice(value) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number)
  ) {
    return "—";
  }


  return number.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    }
  );
}

function formatPrediction(
  prediction
) {

  if (
    prediction === null ||
    prediction === undefined
  ) {
    return "—";
  }


  return String(
    prediction
  );
}

function escapeHtml(value) {

  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


/* =========================================================
   WINDOW RESIZE
========================================================= */

window.addEventListener(
  "resize",
  () => {

    if (
      state.currentPage ===
      "analysis"
    ) {

      drawChart();
    }
  }
);


/* =========================================================
   PAGE VISIBILITY
========================================================= */

document.addEventListener(
  "visibilitychange",
  () => {

    if (
      !document.hidden &&
      (
        !state.publicWs ||
        state.publicWs.readyState !==
        WebSocket.OPEN
      )
    ) {

      connectPublicWebSocket();
    }
  }
);


/* =========================================================
   KEYBOARD / ESCAPE
========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape"
    ) {

      qsa(".modal.show")
        .forEach(
          modal =>
            hide(modal)
        );
    }
  }
);


/* =========================================================
   DEBUG HELPERS
========================================================= */

window.KRISHWAVE =
  {
    state,

    connectDeriv,

    connectPublicWebSocket,

    scanBestMarket,

    startAIBot,

    stopAIBot,

    startCircularTradingEngine,

    stopCircularAI,

    placeManualTrade,

    clearHistory
  };

console.log(
  "%cKRISHWAVE AI BEAST V7.2 loaded",
  "font-weight:bold;font-size:16px"
);

console.log(
  "Paper balance:",
  state.paperBalance
);

console.log(
  "Markets:",
  MARKETS.length
);

console.log(
  "Real trading:",
  "DISABLED"
);