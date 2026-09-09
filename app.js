/* =========================================================
   KRISHWAVE AI BEAST V7.1
   DERIV LIVE MARKET INTELLIGENCE + PAPER TRADING ENGINE

   ---------------------------------------------------------
   FEATURES
   - Live Deriv public tick data
   - 15 Volatility markets
   - Live digit analysis
   - Price chart
   - MATCHES / DIFFERS / OVER / UNDER / EVEN / ODD
   - AI market scanner
   - Circular AI
   - AI BOT
   - Manual paper trading
   - Demo / Real account connection
   - Deriv OAuth PKCE through Render backend
   - Paper balance
   - Take profit / stop loss
   - Martingale
   - Win / loss / accuracy
   - Amount won
   - Net profit
   - Persistent history
   - Analysis / Trade / History tabs

   IMPORTANT:
   NO REAL TRADES ARE EXECUTED BY THIS VERSION.
========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
========================================================= */

const BACKEND_URL =
  "https://krishwave-oauth.onrender.com";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const DEFAULT_PAPER_BALANCE = 1000;

const MIN_STAKE = 0.25;

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

const MARKET_NAMES = {
  R_10: "Volatility 10",
  R_25: "Volatility 25",
  R_50: "Volatility 50",
  R_75: "Volatility 75",
  R_100: "Volatility 100",

  "1HZ10V": "Volatility 10 (1s)",
  "1HZ25V": "Volatility 25 (1s)",
  "1HZ30V": "Volatility 30 (1s)",
  "1HZ50V": "Volatility 50 (1s)",
  "1HZ75V": "Volatility 75 (1s)",
  "1HZ90V": "Volatility 90 (1s)",
  "1HZ100V": "Volatility 100 (1s)",
  "1HZ150V": "Volatility 150 (1s)",
  "1HZ250V": "Volatility 250 (1s)",
  "1HZ1000V": "Volatility 1000 (1s)"
};

const STRATEGIES = [
  "MATCHES",
  "DIFFERS",
  "OVER",
  "UNDER",
  "EVEN",
  "ODD"
];

const STRATEGY_NAMES = {
  MATCHES: "Matches",
  DIFFERS: "Differs",
  OVER: "Over",
  UNDER: "Under",
  EVEN: "Even",
  ODD: "Odd"
};

/*
   These are paper-engine assumptions.
   They are NOT Deriv contract payout guarantees.
*/
const PAYOUT = {
  MATCHES: 8.5,
  DIFFERS: 0.09,
  OVER: 0.95,
  UNDER: 0.95,
  EVEN: 0.95,
  ODD: 0.95
};

const HISTORY_KEY =
  "KRISHWAVE_V71_HISTORY";

const PAPER_BALANCE_KEY =
  "KRISHWAVE_V71_BALANCE";

const THEME_KEY =
  "KRISHWAVE_V71_THEME";

const SESSION_KEY =
  "KRISHWAVE_DERIV_SESSION";

const PKCE_VERIFIER_KEY =
  "KRISHWAVE_PKCE_VERIFIER";

const OAUTH_STATE_KEY =
  "KRISHWAVE_OAUTH_STATE";

/* =========================================================
   DOM HELPERS
========================================================= */

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value;
}

function setValue(selector, value) {
  const el = $(selector);
  if (el) el.value = value;
}

function show(selector, visible = true) {
  const el = $(selector);
  if (!el) return;

  el.classList.toggle("show", visible);
  el.hidden = !visible;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   STATE
========================================================= */

const state = {
  publicWs: null,
  authWs: null,

  publicConnected: false,
  authConnected: false,

  reconnectTimer: null,
  reconnectAttempts: 0,

  markets: {},
  subscriptions: {},

  selectedMarket: "R_10",
  selectedStrategy: "MATCHES",

  aiMarket: "R_10",
  aiStrategy: "MATCHES",
  aiPrediction: null,
  aiConfidence: 0,

  paperBalance: DEFAULT_PAPER_BALANCE,

  history: [],

  activeTrades: [],

  totalStake: 0,
  amountWon: 0,
  netProfit: 0,

  wins: 0,
  losses: 0,

  currentPage: "analysis",

  engine: "AI",

  botRunning: false,
  botTimer: null,

  circularRunning: false,
  circularTimer: null,

  circularStage: "IDLE",
  circularRemaining: 0,
  circularPrediction: null,
  circularMarket: null,
  circularStrategy: null,

  takeProfit: 0,
  stopLoss: 0,

  martingale: 1,

  currentStake: MIN_STAKE,

  accountMode: "DEMO",
  connectedAccount: null,
  accounts: [],

  sessionId:
    sessionStorage.getItem(SESSION_KEY) || null,

  backendConfig: null,

  chartMarket: "R_10",

  chartPoints: [],

  initialized: false,

  lastScan: 0
};

/* =========================================================
   MARKET STATE
========================================================= */

function createMarket(symbol) {
  return {
    symbol,
    name:
      MARKET_NAMES[symbol] || symbol,

    ticks: [],
    digits: Array(10).fill(0),

    price: null,
    previousPrice: null,

    epoch: null,

    subscriptionId: null,

    ready: false,

    score: 0,
    confidence: 0,

    prediction: null,
    strategy: null,

    lastDigit: null
  };
}

MARKETS.forEach((symbol) => {
  state.markets[symbol] =
    createMarket(symbol);
});

/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);

async function init() {
  if (state.initialized) return;

  state.initialized = true;

  loadTheme();
  loadPaperState();
  bindNavigation();
  bindTheme();
  bindTradingControls();
  bindStrategyModals();
  bindAccountControls();

  populateMarketSelects();

  updateAllStats();
  renderHistory();
  renderActiveTrades();

  updateConnectionUI(
    false,
    "Connecting..."
  );

  setText(
    "#dataStatus",
    "Starting live market data..."
  );

  /*
     Fetch backend configuration first.
     The client ID is never hard-coded here.
  */
  await loadBackendConfig();

  /*
     If Deriv returned an OAuth callback,
     process it before normal account loading.
  */
  await handleOAuthCallback();

  connectPublicWebSocket();

  if (state.sessionId) {
    await loadAccounts();
  }

  updateAnalysis();
  updateBotUI();
  updateCircularUI();
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
          headers: {
            Accept: "application/json"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `Backend returned ${response.status}`
      );
    }

    const data =
      await response.json();

    if (data.success) {
      state.backendConfig = data;

      console.log(
        "KRISHWAVE backend:",
        data
      );
    }
  } catch (error) {
    console.warn(
      "Backend configuration unavailable:",
      error
    );
  }
}

/* =========================================================
   THEME
========================================================= */

function loadTheme() {
  const saved =
    localStorage.getItem(
      THEME_KEY
    );

  if (
    saved === "light" ||
    saved === "dark"
  ) {
    document.documentElement.dataset.theme =
      saved;
  }
}

function bindTheme() {
  const button =
    $("#themeToggle");

  if (!button) return;

  button.addEventListener(
    "click",
    () => {
      const current =
        document.documentElement.dataset.theme ||
        "dark";

      const next =
        current === "dark"
          ? "light"
          : "dark";

      document.documentElement.dataset.theme =
        next;

      localStorage.setItem(
        THEME_KEY,
        next
      );
    }
  );
}

/* =========================================================
   PAPER STATE
========================================================= */

function loadPaperState() {
  try {
    const savedBalance =
      Number(
        localStorage.getItem(
          PAPER_BALANCE_KEY
        )
      );

    if (
      Number.isFinite(savedBalance) &&
      savedBalance >= 0
    ) {
      state.paperBalance =
        savedBalance;
    }

    const savedHistory =
      JSON.parse(
        localStorage.getItem(
          HISTORY_KEY
        ) || "[]"
      );

    if (
      Array.isArray(savedHistory)
    ) {
      state.history =
        savedHistory;
    }
  } catch (error) {
    console.warn(
      "Unable to load paper state",
      error
    );
  }

  rebuildStats();
}

function savePaperState() {
  try {
    localStorage.setItem(
      PAPER_BALANCE_KEY,
      String(state.paperBalance)
    );

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(
        state.history
      )
    );
  } catch (error) {
    console.warn(
      "Unable to save paper state",
      error
    );
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

function bindNavigation() {
  $all(
    '[data-page]'
  ).forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const page =
          button.dataset.page;

        if (!page) return;

        switchPage(page);
      }
    );
  });
}

function switchPage(page) {
  state.currentPage =
    page;

  const pages = {
    analysis:
      "#analysisPage",
    trade:
      "#tradePage",
    history:
      "#historyPage"
  };

  Object.entries(
    pages
  ).forEach(
    ([name, selector]) => {
      const pageEl =
        $(selector);

      if (!pageEl) return;

      pageEl.classList.toggle(
        "active",
        name === page
      );

      pageEl.hidden =
        name !== page;
    }
  );

  $all(
    '[data-page]'
  ).forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.page ===
          page
      );
    }
  );

  if (page === "history") {
    renderHistory();
  }

  if (page === "trade") {
    updateBotUI();
    updateCircularUI();
  }

  if (page === "analysis") {
    updateAnalysis();
  }
}

/* =========================================================
   MARKET SELECTORS
========================================================= */

function populateMarketSelects() {
  const selectors = [
    "#circularMarketSelect",
    "#manualMarketSelect"
  ];

  selectors.forEach(
    (selector) => {
      const select =
        $(selector);

      if (!select) return;

      select.innerHTML =
        MARKETS.map(
          (symbol) =>
            `<option value="${symbol}">
              ${escapeHTML(
                MARKET_NAMES[symbol]
              )}
            </option>`
        ).join("");

      select.value =
        state.selectedMarket;

      select.addEventListener(
        "change",
        () => {
          state.selectedMarket =
            select.value;

          state.chartMarket =
            select.value;

          updateAnalysis();
        }
      );
    }
  );
}

/* =========================================================
   STRATEGY MODALS
========================================================= */

function bindStrategyModals() {
  const close =
    $("#closeStrategyModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        show(
          "#strategyModal",
          false
        );
      }
    );
  }

  const strategyTrigger =
    $("#manualStrategyTrigger");

  if (strategyTrigger) {
    strategyTrigger.addEventListener(
      "click",
      () => {
        openStrategyModal(
          "manual"
        );
      }
    );
  }

  const circularTrigger =
    $("#circularStrategyTrigger");

  if (circularTrigger) {
    circularTrigger.addEventListener(
      "click",
      () => {
        openStrategyModal(
          "circular"
        );
      }
    );
  }

  const botTrigger =
    $("#botStrategyTrigger");

  if (botTrigger) {
    botTrigger.addEventListener(
      "click",
      () => {
        show(
          "#botStrategyModal",
          true
        );
      }
    );
  }

  const closeBot =
    $("#closeBotStrategyModal");

  if (closeBot) {
    closeBot.addEventListener(
      "click",
      () => {
        show(
          "#botStrategyModal",
          false
        );
      }
    );
  }

  const applyBot =
    $("#applyBotStrategies");

  if (applyBot) {
    applyBot.addEventListener(
      "click",
      () => {
        show(
          "#botStrategyModal",
          false
        );

        updateBotStrategyLabel();
        toast(
          "AI Bot strategy pool updated."
        );
      }
    );
  }

  const strategyOptions =
    $("#strategyOptions");

  if (strategyOptions) {
    strategyOptions.addEventListener(
      "click",
      (event) => {
        const option =
          event.target.closest(
            "[data-strategy]"
          );

        if (!option) return;

        const strategy =
          option.dataset.strategy;

        if (
          !STRATEGIES.includes(
            strategy
          )
        ) {
          return;
        }

        state.selectedStrategy =
          strategy;

        setText(
          "#manualSelectedStrategyLabel",
          STRATEGY_NAMES[
            strategy
          ]
        );

        setText(
          "#circularStrategyLabel",
          STRATEGY_NAMES[
            strategy
          ]
        );

        updateTargetDigitVisibility();

        show(
          "#strategyModal",
          false
        );
      }
    );
  }

  updateTargetDigitVisibility();
}

function openStrategyModal(type) {
  show(
    "#strategyModal",
    true
  );

  const modal =
    $("#strategyModal");

  if (!modal) return;

  modal.dataset.mode =
    type;

  $all(
    "#strategyOptions [data-strategy]"
  ).forEach(
    (option) => {
      option.classList.toggle(
        "selected",
        option.dataset.strategy ===
          state.selectedStrategy
      );
    }
  );
}

function updateTargetDigitVisibility() {
  const needsDigit =
    state.selectedStrategy ===
      "MATCHES" ||
    state.selectedStrategy ===
      "DIFFERS" ||
    state.selectedStrategy ===
      "OVER" ||
    state.selectedStrategy ===
      "UNDER";

  const container =
    $("#targetDigitContainer");

  if (container) {
    container.style.display =
      needsDigit
        ? ""
        : "none";
  }

  if (
    state.selectedStrategy ===
      "EVEN" ||
    state.selectedStrategy ===
      "ODD"
  ) {
    setValue(
      "#manualTargetDigitInput",
      ""
    );
  }
}

/* =========================================================
   BOT STRATEGIES
========================================================= */

function getBotStrategies() {
  const checked =
    $all(
      ".bot-strategy-check:checked"
    ).map(
      (input) =>
        input.value
    );

  if (checked.length) {
    return checked.filter(
      (item) =>
        STRATEGIES.includes(
          item
        )
    );
  }

  return [
    "MATCHES",
    "DIFFERS"
  ];
}

function updateBotStrategyLabel() {
  const strategies =
    getBotStrategies();

  const text =
    strategies
      .map(
        (s) =>
          STRATEGY_NAMES[s]
      )
      .join(" • ");

  setText(
    "#botStrategyLabel",
    text
  );
}

/* =========================================================
   ACCOUNT CONTROLS
========================================================= */

function bindAccountControls() {
  const connect =
    $("#connectDerivBtn");

  if (connect) {
    connect.addEventListener(
      "click",
      startDerivOAuth
    );
  }

  const demo =
    $("#demoModeBtn");

  if (demo) {
    demo.addEventListener(
      "click",
      () => {
        state.accountMode =
          "DEMO";

        updateAccountModeUI();

        toast(
          "Demo / paper mode selected."
        );
      }
    );
  }

  const real =
    $("#realModeBtn");

  if (real) {
    real.addEventListener(
      "click",
      requestRealMode
    );
  }

  const cancel =
    $("#cancelRealBtn");

  if (cancel) {
    cancel.addEventListener(
      "click",
      () => {
        show(
          "#realConfirmModal",
          false
        );
      }
    );
  }

  const confirm =
    $("#confirmRealBtn");

  if (confirm) {
    confirm.addEventListener(
      "click",
      () => {
        /*
           Real trading is intentionally
           disabled in this version.
        */

        show(
          "#realConfirmModal",
          false
        );

        toast(
          "Real execution is protected. KRISHWAVE remains paper mode."
        );
      }
    );
  }
}

function requestRealMode() {
  show(
    "#realConfirmModal",
    true
  );
}

function updateAccountModeUI() {
  const mode =
    state.accountMode;

  setText(
    ".mode-badge",
    mode === "REAL"
      ? "REAL"
      : "DEMO"
  );

  const badge =
    $(".mode-badge");

  if (badge) {
    badge.classList.toggle(
      "real-mode",
      mode === "REAL"
    );

    badge.classList.toggle(
      "demo-mode",
      mode === "DEMO"
    );
  }

  setText(
    "#dataStatus",
    mode === "REAL"
      ? "Real account selected"
      : "Demo / Paper"
  );
}

/* =========================================================
   DERIV OAUTH PKCE
========================================================= */

function randomBytes(length) {
  const bytes =
    new Uint8Array(length);

  crypto.getRandomValues(
    bytes
  );

  return bytes;
}

function base64UrlEncode(
  bytes
) {
  let binary = "";

  bytes.forEach(
    (byte) => {
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

async function sha256Base64Url(
  value
) {
  const data =
    new TextEncoder().encode(
      value
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

async function startDerivOAuth() {
  try {
    if (!state.backendConfig) {
      await loadBackendConfig();
    }

    const clientId =
      state.backendConfig?.client_id;

    const redirectUri =
      state.backendConfig?.redirect_uri ||
      `${location.origin}${location.pathname}`;

    if (!clientId) {
      toast(
        "Backend configuration unavailable."
      );
      return;
    }

    const verifier =
      base64UrlEncode(
        randomBytes(64)
      );

    const challenge =
      await sha256Base64Url(
        verifier
      );

    const oauthState =
      base64UrlEncode(
        randomBytes(32)
      );

    sessionStorage.setItem(
      PKCE_VERIFIER_KEY,
      verifier
    );

    sessionStorage.setItem(
      OAUTH_STATE_KEY,
      oauthState
    );

    const params =
      new URLSearchParams({
        response_type:
          "code",
        client_id:
          clientId,
        redirect_uri:
          redirectUri,
        code_challenge:
          challenge,
        code_challenge_method:
          "S256",
        state:
          oauthState
      });

    setText(
      "#dataStatus",
      "Opening Deriv login..."
    );

    window.location.href =
      `https://auth.deriv.com/oauth2/auth?${params.toString()}`;
  } catch (error) {
    console.error(
      "OAuth start error:",
      error
    );

    toast(
      "Unable to start Deriv login."
    );
  }
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

  const oauthError =
    params.get("error");

  if (oauthError) {
    console.error(
      "Deriv OAuth error:",
      oauthError
    );

    toast(
      `Deriv login failed: ${oauthError}`
    );

    cleanOAuthUrl();

    return;
  }

  if (!code) return;

  const savedState =
    sessionStorage.getItem(
      OAUTH_STATE_KEY
    );

  const verifier =
    sessionStorage.getItem(
      PKCE_VERIFIER_KEY
    );

  if (
    !savedState ||
    !returnedState ||
    savedState !== returnedState
  ) {
    toast(
      "OAuth security check failed."
    );

    cleanOAuthUrl();

    return;
  }

  if (!verifier) {
    toast(
      "OAuth verifier missing."
    );

    cleanOAuthUrl();

    return;
  }

  try {
    setText(
      "#dataStatus",
      "Connecting Deriv account..."
    );

    const response =
      await fetch(
        `${BACKEND_URL}/api/oauth/exchange`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept:
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
          "OAuth exchange failed"
      );
    }

    state.sessionId =
      data.session_id;

    sessionStorage.setItem(
      SESSION_KEY,
      state.sessionId
    );

    sessionStorage.removeItem(
      PKCE_VERIFIER_KEY
    );

    sessionStorage.removeItem(
      OAUTH_STATE_KEY
    );

    cleanOAuthUrl();

    toast(
      "Deriv account connected."
    );

    await loadAccounts();
  } catch (error) {
    console.error(
      "OAuth callback error:",
      error
    );

    toast(
      error.message ||
        "Deriv connection failed."
    );

    cleanOAuthUrl();
  }
}

function cleanOAuthUrl() {
  const cleanUrl =
    `${location.origin}${location.pathname}`;

  window.history.replaceState(
    {},
    document.title,
    cleanUrl
  );
}

/* =========================================================
   DERIV ACCOUNTS
========================================================= */

async function loadAccounts() {
  if (!state.sessionId) {
    return;
  }

  try {
    const response =
      await fetch(
        `${BACKEND_URL}/api/accounts`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept:
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
      response.status === 401
    ) {
      logoutDeriv();
      return;
    }

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
          "Unable to load accounts"
      );
    }

    const accounts =
      normalizeAccounts(
        data.accounts
      );

    state.accounts =
      accounts;

    if (accounts.length) {
      /*
         Prefer demo account.
      */
      const demo =
        accounts.find(
          (account) =>
            isDemoAccount(account)
        );

      state.connectedAccount =
        demo ||
        accounts[0];

      state.accountMode =
        isDemoAccount(
          state.connectedAccount
        )
          ? "DEMO"
          : "DEMO";

      renderAccount(
        state.connectedAccount
      );

      /*
         Get authenticated WebSocket
         for the selected account.
      */
      await connectAuthenticatedAccount(
        state.connectedAccount
      );
    }

    updateAccountModeUI();
  } catch (error) {
    console.error(
      "Account loading error:",
      error
    );

    toast(
      error.message ||
        "Unable to load Deriv accounts."
    );
  }
}

function normalizeAccounts(
  accounts
) {
  if (!accounts) return [];

  if (Array.isArray(accounts)) {
    return accounts.map(
      normalizeAccount
    );
  }

  if (
    Array.isArray(
      accounts.accounts
    )
  ) {
    return accounts.accounts.map(
      normalizeAccount
    );
  }

  if (
    typeof accounts ===
    "object"
  ) {
    return Object.values(
      accounts
    )
      .filter(
        (item) =>
          item &&
          typeof item ===
            "object"
      )
      .map(
        normalizeAccount
      );
  }

  return [];
}

function normalizeAccount(
  account
) {
  return {
    id:
      account.id ||
      account.account_id ||
      account.loginid ||
      account.login ||
      "",

    loginid:
      account.loginid ||
      account.login ||
      account.id ||
      "",

    currency:
      account.currency ||
      "USD",

    balance:
      Number(
        account.balance ??
          account.balance_available ??
          0
      ),

    type:
      account.type ||
      account.account_type ||
      account.accountType ||
      "",

    is_virtual:
      Boolean(
        account.is_virtual ||
          account.isVirtual ||
          String(
            account.type || ""
          ).toLowerCase() ===
            "demo"
      ),

    raw:
      account
  };
}

function isDemoAccount(
  account
) {
  if (!account) return false;

  const text =
    JSON.stringify(
      account.raw || account
    ).toLowerCase();

  return (
    account.is_virtual ||
    text.includes("virtual") ||
    text.includes("demo")
  );
}

function renderAccount(
  account
) {
  if (!account) return;

  setText(
    "#accountId",
    account.loginid ||
      account.id ||
      "CONNECTED"
  );

  setText(
    "#currency",
    account.currency ||
      "USD"
  );

  /*
     Display the real account balance
     only when connected.
     Paper balance remains the
     trading engine balance.
  */
  if (
    Number.isFinite(
      account.balance
    )
  ) {
    setText(
      "#balanceDisplay",
      formatMoney(
        account.balance,
        account.currency
      )
    );
  }
}

async function connectAuthenticatedAccount(
  account
) {
  if (
    !state.sessionId ||
    !account
  ) {
    return;
  }

  try {
    const accountId =
      account.id ||
      account.loginid;

    const response =
      await fetch(
        `${BACKEND_URL}/api/otp`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept:
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
      response.status === 401
    ) {
      logoutDeriv();
      return;
    }

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
          "Unable to authenticate WebSocket"
      );
    }

    if (
      !data.websocket_url
    ) {
      throw new Error(
        "Deriv WebSocket URL missing."
      );
    }

    connectAuthenticatedWebSocket(
      data.websocket_url
    );
  } catch (error) {
    console.error(
      "Authenticated WS error:",
      error
    );

    toast(
      "Account connected, but authenticated data socket failed."
    );
  }
}

function logoutDeriv() {
  const sessionId =
    state.sessionId;

  state.sessionId =
    null;

  sessionStorage.removeItem(
    SESSION_KEY
  );

  if (state.authWs) {
    try {
      state.authWs.close();
    } catch {}
  }

  state.authWs = null;
  state.authConnected =
    false;

  if (sessionId) {
    fetch(
      `${BACKEND_URL}/api/logout`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          session_id:
            sessionId
        })
      }
    ).catch(
      () => {}
    );
  }

  setText(
    "#accountId",
    "NOT CONNECTED"
  );

  toast(
    "Deriv account disconnected."
  );
}

/* =========================================================
   AUTHENTICATED WEBSOCKET
========================================================= */

function connectAuthenticatedWebSocket(
  url
) {
  if (state.authWs) {
    try {
      state.authWs.close();
    } catch {}
  }

  try {
    const ws =
      new WebSocket(url);

    state.authWs = ws;

    ws.onopen = () => {
      state.authConnected =
        true;

      console.log(
        "Authenticated Deriv WebSocket connected."
      );
    };

    ws.onmessage = (
      event
    ) => {
      handleAuthenticatedMessage(
        event.data
      );
    };

    ws.onerror = (error) => {
      console.warn(
        "Authenticated WS error",
        error
      );
    };

    ws.onclose = () => {
      state.authConnected =
        false;

      console.log(
        "Authenticated WebSocket closed."
      );
    };
  } catch (error) {
    console.error(
      "Authenticated WebSocket error:",
      error
    );
  }
}

function handleAuthenticatedMessage(
  raw
) {
  try {
    const data =
      typeof raw ===
      "string"
        ? JSON.parse(raw)
        : raw;

    if (data.error) {
      console.warn(
        "Deriv authenticated error:",
        data.error
      );
    }
  } catch {
    /* Ignore malformed messages */
  }
}

/* =========================================================
   PUBLIC WEBSOCKET
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
    false,
    "Connecting..."
  );

  try {
    const ws =
      new WebSocket(
        PUBLIC_WS
      );

    state.publicWs =
      ws;

    ws.onopen = () => {
      state.publicConnected =
        true;

      state.reconnectAttempts =
        0;

      updateConnectionUI(
        true,
        "LIVE"
      );

      setText(
        "#dataStatus",
        "Deriv live data connected"
      );

      subscribeToAllMarkets();

      /*
         Bootstrap each market with
         historical ticks.
      */
      bootstrapAllMarkets();
    };

    ws.onmessage = (
      event
    ) => {
      handlePublicMessage(
        event.data
      );
    };

    ws.onerror = (error) => {
      console.warn(
        "Public WebSocket error:",
        error
      );

      updateConnectionUI(
        false,
        "Connection error"
      );
    };

    ws.onclose = () => {
      state.publicConnected =
        false;

      updateConnectionUI(
        false,
        "Reconnecting..."
      );

      schedulePublicReconnect();
    };
  } catch (error) {
    console.error(
      "Public WebSocket creation failed:",
      error
    );

    schedulePublicReconnect();
  }
}

function schedulePublicReconnect() {
  if (
    state.reconnectTimer
  ) {
    return;
  }

  const delay =
    Math.min(
      15000,
      1000 *
        Math.pow(
          2,
          state.reconnectAttempts
        )
    );

  state.reconnectAttempts++;

  state.reconnectTimer =
    setTimeout(
      () => {
        state.reconnectTimer =
          null;

        connectPublicWebSocket();
      },
      delay
    );
}

function sendPublic(
  payload
) {
  if (
    !state.publicWs ||
    state.publicWs.readyState !==
      WebSocket.OPEN
  ) {
    return false;
  }

  try {
    state.publicWs.send(
      JSON.stringify(
        payload
      )
    );

    return true;
  } catch (error) {
    console.warn(
      "WebSocket send failed:",
      error
    );

    return false;
  }
}

/* =========================================================
   SUBSCRIPTIONS
========================================================= */

function subscribeToAllMarkets() {
  MARKETS.forEach(
    (symbol) => {
      sendPublic({
        ticks:
          symbol,
        subscribe:
          1
      });

      state.subscriptions[
        symbol
      ] = true;
    }
  );
}

function bootstrapAllMarkets() {
  MARKETS.forEach(
    (symbol) => {
      requestHistory(
        symbol
      );
    }
  );
}

function requestHistory(
  symbol
) {
  sendPublic({
    ticks_history:
      symbol,

    count:
      120,

    end:
      "latest",

    style:
      "ticks"
  });
}

/* =========================================================
   PUBLIC MESSAGE HANDLING
========================================================= */

function handlePublicMessage(
  raw
) {
  let data;

  try {
    data =
      typeof raw ===
      "string"
        ? JSON.parse(raw)
        : raw;
  } catch {
    return;
  }

  if (data.error) {
    console.warn(
      "Deriv public error:",
      data.error
    );

    return;
  }

  /*
     Historical ticks.
  */
  if (
    data.history &&
    data.history.prices
  ) {
    processHistory(
      data
    );
  }

  /*
     Live tick.
  */
  if (data.tick) {
    processTick(
      data.tick
    );
  }

  /*
     Some Deriv responses can
     return a tick-like structure
     directly.
  */
  if (
    data.msg_type ===
      "tick" &&
    data.tick
  ) {
    processTick(
      data.tick
    );
  }
}

/* =========================================================
   TICK EXTRACTION
========================================================= */

function getQuoteFromTick(
  tick
) {
  const quote =
    Number(
      tick.quote
    );

  return Number.isFinite(
    quote
  )
    ? quote
    : null;
}

function getEpochFromTick(
  tick
) {
  const epoch =
    Number(
      tick.epoch
    );

  return Number.isFinite(
    epoch
  )
    ? epoch
    : Math.floor(
        Date.now() / 1000
      );
}

function getLastDigitFromQuote(
  quote,
  symbol
) {
  if (
    !Number.isFinite(
      quote
    )
  ) {
    return null;
  }

  /*
     Deriv quote precision is not
     identical for every market.

     The string representation is
     safer than Math.floor(quote*10)
     because the last displayed digit
     is what matters.
  */
  let text =
    String(quote);

  if (
    text.includes("e") ||
    text.includes("E")
  ) {
    /*
       Fallback for scientific notation.
    */
    const decimals =
      Math.max(
        1,
        getMarketDecimals(
          quote,
          symbol
        )
      );

    text =
      quote.toFixed(
        decimals
      );
  }

  const clean =
    text.replace(
      /[^0-9]/g,
      ""
    );

  if (!clean.length) {
    return null;
  }

  return Number(
    clean.charAt(
      clean.length - 1
    )
  );
}

function getMarketDecimals(
  quote,
  symbol
) {
  /*
     Volatility indices normally
     provide 2 or more decimals.
     Use a practical precision
     fallback.
  */

  const text =
    String(quote);

  if (
    text.includes(".")
  ) {
    return text.split(".")[1]
      .length;
  }

  return 2;
}

/* =========================================================
   PROCESS HISTORY
========================================================= */

function processHistory(
  data
) {
  const symbol =
    data.echo_req?.ticks_history ||
    data.echo_req?.symbol ||
    data.subscription?.symbol;

  if (
    !symbol ||
    !state.markets[symbol]
  ) {
    return;
  }

  const prices =
    Array.isArray(
      data.history.prices
    )
      ? data.history.prices
      : [];

  const times =
    Array.isArray(
      data.history.times
    )
      ? data.history.times
      : [];

  const market =
    state.markets[symbol];

  market.ticks = [];

  prices.forEach(
    (price, index) => {
      const quote =
        Number(price);

      if (
        !Number.isFinite(
          quote
        )
      ) {
        return;
      }

      const epoch =
        Number(
          times[index]
        ) ||
        Math.floor(
          Date.now() /
            1000
        );

      const digit =
        getLastDigitFromQuote(
          quote,
          symbol
        );

      market.ticks.push({
        quote,
        epoch,
        digit
      });
    }
  );

  market.ticks =
    market.ticks.slice(
      -200
    );

  rebuildMarketStats(
    market
  );

  market.ready =
    market.ticks.length >=
    10;

  renderMarketAnalysis(
    market
  );

  updateAnalysis();

  runMarketScanner();
}

/* =========================================================
   PROCESS LIVE TICK
========================================================= */

function processTick(
  tick
) {
  const symbol =
    tick.symbol ||
    tick.echo_req?.ticks;

  if (
    !symbol ||
    !state.markets[symbol]
  ) {
    return;
  }

  const quote =
    getQuoteFromTick(
      tick
    );

  if (
    quote === null
  ) {
    return;
  }

  const epoch =
    getEpochFromTick(
      tick
    );

  const digit =
    getLastDigitFromQuote(
      quote,
      symbol
    );

  const market =
    state.markets[symbol];

  market.previousPrice =
    market.price;

  market.price =
    quote;

  market.epoch =
    epoch;

  market.lastDigit =
    digit;

  market.ticks.push({
    quote,
    epoch,
    digit
  });

  if (
    market.ticks.length >
    200
  ) {
    market.ticks.shift();
  }

  rebuildMarketStats(
    market
  );

  if (
    symbol ===
    state.chartMarket
  ) {
    updateChart(
      market
    );
  }

  renderMarketAnalysis(
    market
  );

  if (
    symbol ===
    state.selectedMarket
  ) {
    updateAnalysis();
  }

  /*
     Settle paper trades waiting
     for the next tick.
  */
  settleTradesForTick(
    symbol,
    digit,
    quote,
    epoch
  );

  /*
     Refresh scanner periodically,
     rather than on every tick.
  */
  const now =
    Date.now();

  if (
    now -
      state.lastScan >
    1000
  ) {
    state.lastScan =
      now;

    runMarketScanner();
  }
}

/* =========================================================
   MARKET STATISTICS
========================================================= */

function rebuildMarketStats(
  market
) {
  market.digits =
    Array(10).fill(0);

  market.ticks.forEach(
    (tick) => {
      if (
        Number.isInteger(
          tick.digit
        ) &&
        tick.digit >= 0 &&
        tick.digit <= 9
      ) {
        market.digits[
          tick.digit
        ]++;
      }
    }
  );

  const total =
    market.ticks.filter(
      (tick) =>
        Number.isInteger(
          tick.digit
        )
    ).length;

  if (!total) {
    market.score = 0;
    market.confidence = 0;
    return;
  }

  const recent =
    market.ticks.slice(
      -30
    );

  const recentCounts =
    Array(10).fill(0);

  recent.forEach(
    (tick) => {
      if (
        Number.isInteger(
          tick.digit
        )
      ) {
        recentCounts[
          tick.digit
        ]++;
      }
    }
  );

  const latestDigit =
    market.lastDigit;

  const frequencies =
    market.digits.map(
      (count) =>
        count / total
    );

  const strongestDigit =
    frequencies.indexOf(
      Math.max(
        ...frequencies
      )
    );

  const strongestFrequency =
    frequencies[
      strongestDigit
    ];

  const recentStrongest =
    recentCounts.indexOf(
      Math.max(
        ...recentCounts
      )
    );

  let confidence =
    50 +
    strongestFrequency *
      100;

  /*
     Small trend bonus.
  */
  if (
    latestDigit ===
    recentStrongest
  ) {
    confidence += 4;
  }

  /*
     Do not claim unrealistic
     certainty.
  */
  confidence =
    clamp(
      confidence,
      50,
      96
    );

  market.confidence =
    Math.round(
      confidence
    );

  market.score =
    Math.round(
      confidence
    );
}

/* =========================================================
   STRATEGY PREDICTION ENGINE
========================================================= */

function predictStrategy(
  market,
  strategy
) {
  if (
    !market ||
    market.ticks.length <
      5
  ) {
    return {
      strategy,
      prediction:
        "WAIT",
      confidence: 0,
      reason:
        "Waiting for enough live ticks."
    };
  }

  const counts =
    market.digits;

  const total =
    counts.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  if (!total) {
    return {
      strategy,
      prediction:
        "WAIT",
      confidence: 0,
      reason:
        "No digit data yet."
    };
  }

  const probabilities =
    counts.map(
      (value) =>
        value / total
    );

  const hottest =
    probabilities.indexOf(
      Math.max(
        ...probabilities
      )
    );

  const coldest =
    probabilities.indexOf(
      Math.min(
        ...probabilities
      )
    );

  const evenCount =
    counts[0] +
    counts[2] +
    counts[4] +
    counts[6] +
    counts[8];

  const oddCount =
    counts[1] +
    counts[3] +
    counts[5] +
    counts[7] +
    counts[9];

  const evenProbability =
    evenCount /
    total;

  const oddProbability =
    oddCount /
    total;

  const target =
    hottest;

  let prediction =
    null;

  let confidence =
    50;

  let reason = "";

  if (
    strategy ===
    "MATCHES"
  ) {
    prediction =
      target;

    confidence =
      50 +
      probabilities[
        target
      ] *
        100;

    reason =
      `Digit ${target} has the strongest recent frequency.`;
  }

  else if (
    strategy ===
    "DIFFERS"
  ) {
    prediction =
      coldest;

    confidence =
      50 +
      (
        1 -
        probabilities[
          target
        ]
      ) *
        45;

    reason =
      `Differ analysis favors avoiding the hottest digit ${target}.`;
  }

  else if (
    strategy ===
    "OVER"
  ) {
    const high =
      counts
        .slice(5)
        .reduce(
          (a, b) =>
            a + b,
          0
        );

    prediction =
      4;

    confidence =
      50 +
      (
        high /
        total
      ) *
        45;

    reason =
      "Higher digits 5–9 are being measured against the lower range.";
  }

  else if (
    strategy ===
    "UNDER"
  ) {
    const low =
      counts
        .slice(0, 5)
        .reduce(
          (a, b) =>
            a + b,
          0
        );

    prediction =
      5;

    confidence =
      50 +
      (
        low /
        total
      ) *
        45;

    reason =
      "Lower digits 0–4 are being measured against the higher range.";
  }

  else if (
    strategy ===
    "EVEN"
  ) {
    prediction =
      "EVEN";

    confidence =
      50 +
      Math.abs(
        evenProbability -
          0.5
      ) *
        90;

    reason =
      `Even digits represent ${Math.round(
        evenProbability * 100
      )}% of the sample.`;
  }

  else if (
    strategy ===
    "ODD"
  ) {
    prediction =
      "ODD";

    confidence =
      50 +
      Math.abs(
        oddProbability -
          0.5
      ) *
        90;

    reason =
      `Odd digits represent ${Math.round(
        oddProbability * 100
      )}% of the sample.`;
  }

  confidence =
    clamp(
      Math.round(
        confidence
      ),
      50,
      95
    );

  return {
    strategy,
    prediction,
    confidence,
    reason,
    hottestDigit:
      hottest,
    coldestDigit:
      coldest,
    evenProbability,
    oddProbability
  };
}

/* =========================================================
   MARKET SCANNER
========================================================= */

function runMarketScanner() {
  const readyMarkets =
    MARKETS
      .map(
        (symbol) =>
          state.markets[symbol]
      )
      .filter(
        (market) =>
          market.ready &&
          market.ticks.length >=
            10
      );

  if (!readyMarkets.length) {
    setText(
      "#aiMarket",
      "SCANNING..."
    );

    setText(
      "#aiPrediction",
      "WAIT"
    );

    setText(
      "#analysisConfidence",
      "--"
    );

    return;
  }

  let best = null;

  const botStrategies =
    getBotStrategies();

  readyMarkets.forEach(
    (market) => {
      botStrategies.forEach(
        (strategy) => {
          const prediction =
            predictStrategy(
              market,
              strategy
            );

          if (
            !best ||
            prediction.confidence >
              best.prediction.confidence
          ) {
            best = {
              market,
              prediction
            };
          }
        }
      );
    }
  );

  if (!best) return;

  state.aiMarket =
    best.market.symbol;

  state.aiStrategy =
    best.prediction.strategy;

  state.aiPrediction =
    best.prediction.prediction;

  state.aiConfidence =
    best.prediction.confidence;

  setText(
    "#aiMarket",
    best.market.name
  );

  setText(
    "#aiPrediction",
    formatPrediction(
      best.prediction
        .prediction
    )
  );

  setText(
    "#aiType",
    STRATEGY_NAMES[
      best.prediction
        .strategy
    ]
  );

  setText(
    "#analysisConfidence",
    `${best.prediction.confidence}%`
  );

  setText(
    "#analysisMsg",
    best.prediction.reason
  );

  updateAIStatus(
    best.prediction.confidence
  );

  updateCircularPredictionPreview(
    best
  );

  updateBotSelection(
    best
  );
}

/* =========================================================
   ANALYSIS PAGE
========================================================= */

function updateAnalysis() {
  const market =
    state.markets[
      state.selectedMarket
    ];

  if (!market) return;

  state.chartMarket =
    state.selectedMarket;

  setText(
    "#currentChartMarket",
    market.name
  );

  if (
    market.price !==
    null
  ) {
    setText(
      "#currentLivePrice",
      formatPrice(
        market.price
      )
    );
  } else {
    setText(
      "#currentLivePrice",
      "--"
    );
  }

  setText(
    "#digitSampleCount",
    `${market.ticks.length} ticks`
  );

  renderDigitStats(
    market
  );

  renderMarketAnalysis(
    market
  );

  updateChart(
    market
  );

  updateCycleDisplay();
}

function renderMarketAnalysis(
  market
) {
  if (
    !market ||
    market.ticks.length <
      5
  ) {
    return;
  }

  const strategy =
    state.selectedStrategy;

  const prediction =
    predictStrategy(
      market,
      strategy
    );

  if (
    market.symbol ===
    state.selectedMarket
  ) {
    setText(
      "#aiType",
      STRATEGY_NAMES[
        prediction.strategy
      ]
    );
  }
}

function renderDigitStats(
  market
) {
  const grid =
    $("#digitStatsGrid");

  if (!grid) return;

  const total =
    market.digits.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  grid.innerHTML =
    market.digits
      .map(
        (count, digit) => {
          const pct =
            total
              ? Math.round(
                  (
                    count /
                    total
                  ) *
                    100
                )
              : 0;

          return `
            <div class="digit-stat">
              <span>${digit}</span>
              <strong>${count}</strong>
              <small>${pct}%</small>
            </div>
          `;
        }
      )
      .join("");
}

function updateAIStatus(
  confidence
) {
  let text =
    "AI ANALYZING";

  if (confidence >= 80) {
    text =
      "AI STRONG SIGNAL";
  } else if (
    confidence >= 65
  ) {
    text =
      "AI GOOD SIGNAL";
  } else {
    text =
      "AI WATCHING";
  }

  setText(
    "#aiStatus",
    text
  );
}

/* =========================================================
   CHART
========================================================= */

function updateChart(
  market
) {
  const canvas =
    $("#priceChartCanvas");

  if (
    !canvas ||
    !market
  ) {
    return;
  }

  const ctx =
    canvas.getContext(
      "2d"
    );

  if (!ctx) return;

  const rect =
    canvas.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio ||
    1;

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
      180,
      Math.floor(
        rect.height ||
          canvas.clientHeight ||
          220
      )
    );

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

  const points =
    market.ticks
      .slice(-60)
      .map(
        (tick) =>
          Number(tick.quote)
      )
      .filter(
        Number.isFinite
      );

  if (
    points.length < 2
  ) {
    ctx.font =
      "13px sans-serif";

    ctx.fillText(
      "Waiting for live price data...",
      16,
      30
    );

    return;
  }

  const min =
    Math.min(
      ...points
    );

  const max =
    Math.max(
      ...points
    );

  const range =
    max - min || 1;

  const pad =
    18;

  const chartWidth =
    width -
    pad * 2;

  const chartHeight =
    height -
    pad * 2;

  ctx.beginPath();

  points.forEach(
    (value, index) => {
      const x =
        pad +
        (
          index /
          (
            points.length -
            1
          )
        ) *
          chartWidth;

      const y =
        pad +
        (
          1 -
          (
            value -
            min
          ) /
            range
        ) *
          chartHeight;

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

  ctx.strokeStyle =
    getCSSVariable(
      "--accent",
      "#00e5ff"
    );

  ctx.lineWidth =
    2;

  ctx.stroke();

  ctx.font =
    "11px sans-serif";

  ctx.fillStyle =
    getCSSVariable(
      "--muted",
      "#91a7bd"
    );

  ctx.fillText(
    formatPrice(max),
    8,
    14
  );

  ctx.fillText(
    formatPrice(min),
    8,
    height - 6
  );
}

function getCSSVariable(
  name,
  fallback
) {
  const value =
    getComputedStyle(
      document.documentElement
    )
      .getPropertyValue(
        name
      )
      .trim();

  return value || fallback;
}

window.addEventListener(
  "resize",
  () => {
    const market =
      state.markets[
        state.chartMarket
      ];

    if (market) {
      updateChart(
        market
      );
    }
  }
);

/* =========================================================
   PAPER TRADING
========================================================= */

function normalizeStake(
  value
) {
  const stake =
    Number(value);

  if (
    !Number.isFinite(
      stake
    ) ||
    stake < MIN_STAKE
  ) {
    return MIN_STAKE;
  }

  return Math.round(
    stake * 100
  ) / 100;
}

function placePaperTrade({
  marketSymbol,
  strategy,
  prediction,
  stake,
  source = "MANUAL",
  targetDigit = null
}) {
  if (
    !state.markets[
      marketSymbol
    ]
  ) {
    toast(
      "Market unavailable."
    );

    return null;
  }

  const market =
    state.markets[
      marketSymbol
    ];

  if (
    !market.ready &&
    market.ticks.length <
      5
  ) {
    toast(
      "Waiting for live tick data."
    );

    return null;
  }

  stake =
    normalizeStake(
      stake
    );

  if (
    state.paperBalance <
    stake
  ) {
    toast(
      "Insufficient paper balance."
    );

    return null;
  }

  /*
     Validate MATCHES/DIFFERS
     target digit.
  */
  if (
    (
      strategy ===
        "MATCHES" ||
      strategy ===
        "DIFFERS" ||
      strategy ===
        "OVER" ||
      strategy ===
        "UNDER"
    ) &&
    targetDigit !== null
  ) {
    targetDigit =
      Number(
        targetDigit
      );

    if (
      !Number.isInteger(
        targetDigit
      ) ||
      targetDigit < 0 ||
      targetDigit > 9
    ) {
      toast(
        "Target digit must be 0–9."
      );

      return null;
    }
  }

  /*
     Reserve the stake immediately.
  */
  state.paperBalance -=
    stake;

  const trade = {
    id:
      `KW-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    time:
      new Date().toISOString(),

    market:
      marketSymbol,

    marketName:
      market.name,

    strategy,

    prediction,

    targetDigit,

    stake,

    source,

    entryPrice:
      market.price,

    entryDigit:
      market.lastDigit,

    status:
      "ACTIVE",

    result:
      null,

    exitDigit:
      null,

    amountWon:
      0,

    profit:
      0,

    net:
      0
  };

  state.activeTrades.push(
    trade
  );

  state.totalStake +=
    stake;

  renderActiveTrades();
  updateAllStats();

  toast(
    `${source}: ${STRATEGY_NAMES[strategy]} ${formatPrediction(prediction)}`
  );

  /*
     The next live tick settles
     the paper contract.
  */
  return trade;
}

/* =========================================================
   SETTLEMENT
========================================================= */

function settleTradesForTick(
  symbol,
  digit,
  quote,
  epoch
) {
  if (
    !Number.isInteger(
      digit
    )
  ) {
    return;
  }

  const waiting =
    state.activeTrades.filter(
      (trade) =>
        trade.market ===
          symbol &&
        trade.status ===
          "ACTIVE"
    );

  waiting.forEach(
    (trade) => {
      settleTrade(
        trade,
        digit,
        quote,
        epoch
      );
    }
  );
}

function settleTrade(
  trade,
  exitDigit,
  exitPrice,
  epoch
) {
  if (
    !trade ||
    trade.status !==
      "ACTIVE"
  ) {
    return;
  }

  const win =
    evaluateTrade(
      trade,
      exitDigit
    );

  trade.exitDigit =
    exitDigit;

  trade.exitPrice =
    exitPrice;

  trade.settledAt =
    new Date(
      Number(epoch) *
        1000
    ).toISOString();

  trade.status =
    win
      ? "WIN"
      : "LOSS";

  if (win) {
    const profit =
      trade.stake *
      (
        PAYOUT[
          trade.strategy
        ] ??
        0
      );

    const amountWon =
      trade.stake +
      profit;

    trade.profit =
      roundMoney(
        profit
      );

    trade.amountWon =
      roundMoney(
        amountWon
      );

    trade.net =
      roundMoney(
        amountWon -
          trade.stake
      );

    state.paperBalance +=
      amountWon;

    state.wins++;
  } else {
    trade.profit =
      -roundMoney(
        trade.stake
      );

    trade.amountWon =
      0;

    trade.net =
      -roundMoney(
        trade.stake
      );

    state.losses++;
  }

  state.amountWon +=
    trade.amountWon;

  state.netProfit +=
    trade.net;

  state.activeTrades =
    state.activeTrades.filter(
      (item) =>
        item.id !==
        trade.id
    );

  state.history.unshift(
    trade
  );

  /*
     Keep history manageable.
  */
  state.history =
    state.history.slice(
      0,
      500
    );

  savePaperState();

  updateAllStats();
  renderActiveTrades();
  renderHistory();

  handleRiskControls(
    trade
  );

  const resultText =
    win
      ? `WIN +${formatMoney(trade.profit)}`
      : `LOSS -${formatMoney(trade.stake)}`;

  toast(
    `${trade.marketName}: ${resultText}`
  );
}

function evaluateTrade(
  trade,
  digit
) {
  switch (
    trade.strategy
  ) {
    case "MATCHES":
      return (
        digit ===
        Number(
          trade.targetDigit ??
            trade.prediction
        )
      );

    case "DIFFERS":
      return (
        digit !==
        Number(
          trade.targetDigit ??
            trade.prediction
        )
      );

    case "OVER":
      return (
        digit >
        Number(
          trade.targetDigit ??
            4
        )
      );

    case "UNDER":
      return (
        digit <
        Number(
          trade.targetDigit ??
            5
        )
      );

    case "EVEN":
      return digit % 2 === 0;

    case "ODD":
      return digit % 2 !== 0;

    default:
      return false;
  }
}

/* =========================================================
   RISK CONTROLS
========================================================= */

function handleRiskControls(
  trade
) {
  const tp =
    Number(
      trade.source ===
        "CIRCULAR"
        ? $(
            "#circularTakeProfitInput"
          )?.value
        : $(
            "#takeProfitInput"
          )?.value
    ) || 0;

  const sl =
    Number(
      trade.source ===
        "CIRCULAR"
        ? $(
            "#circularStopLossInput"
          )?.value
        : $(
            "#stopLossInput"
          )?.value
    ) || 0;

  state.takeProfit =
    tp;

  state.stopLoss =
    sl;

  if (
    tp > 0 &&
    state.netProfit >=
      tp
  ) {
    stopAllEngines(
      "Take profit reached."
    );

    toast(
      "TAKE PROFIT reached."
    );
  }

  if (
    sl > 0 &&
    state.netProfit <=
      -Math.abs(sl)
  ) {
    stopAllEngines(
      "Stop loss reached."
    );

    toast(
      "STOP LOSS reached."
    );
  }

  /*
     Martingale applies only after
     a losing paper trade.
  */
  const martingale =
    Number(
      $(
        "#martingaleInput"
      )?.value
    ) || 1;

  if (
    trade.status ===
      "LOSS"
  ) {
    state.currentStake =
      normalizeStake(
        trade.stake *
          Math.max(
            1,
            martingale
          )
      );
  } else {
    state.currentStake =
      normalizeStake(
        getConfiguredStake(
          trade.source
        )
      );
  }
}

/* =========================================================
   MANUAL ENGINE
========================================================= */

function bindTradingControls() {
  const place =
    $("#placeTradeBtn");

  if (place) {
    place.addEventListener(
      "click",
      placeManualTrade
    );
  }

  const startBot =
    $("#startBotBtn");

  if (startBot) {
    startBot.addEventListener(
      "click",
      toggleBot
    );
  }

  const startCircular =
    $("#startCircularTradeBtn");

  if (startCircular) {
    startCircular.addEventListener(
      "click",
      toggleCircular
    );
  }

  const startAI =
    $("#startAI");

  if (startAI) {
    startAI.addEventListener(
      "click",
      startCircular
    );
  }

  const stopAI =
    $("#stopAI");

  if (stopAI) {
    stopAI.addEventListener(
      "click",
      stopCircular
    );
  }

  const stopTrading =
    $("#stopTradingBtn");

  if (stopTrading) {
    stopTrading.addEventListener(
      "click",
      () =>
        stopAllEngines(
          "Trading engines stopped."
        )
    );
  }

  const clear =
    $("#clearLogsBtn");

  if (clear) {
    clear.addEventListener(
      "click",
      clearHistory
    );
  }

  /*
     Trade engine tabs.
  */
  const tabs =
    [
      ["#tabAiBot", "AI"],
      [
        "#tabCircularAI",
        "CIRCULAR"
      ],
      ["#tabManual", "MANUAL"]
    ];

  tabs.forEach(
    ([selector, engine]) => {
      const button =
        $(selector);

      if (!button) return;

      button.addEventListener(
        "click",
        () => {
          state.engine =
            engine;

          tabs.forEach(
            ([other]) => {
              const el =
                $(other);

              if (el) {
                el.classList.toggle(
                  "active",
                  other ===
                    selector
                );
              }
            }
          );

          updateEngineVisibility();
        }
      );
    }
  );

  updateEngineVisibility();
}

function updateEngineVisibility() {
  const ai =
    $(
      "#aiBotEngine"
    );

  const circular =
    $(
      "#circularAIEngine"
    );

  const manual =
    $(
      "#manualEngine"
    );

  if (ai) {
    ai.style.display =
      state.engine ===
      "AI"
        ? ""
        : "none";
  }

  if (circular) {
    circular.style.display =
      state.engine ===
      "CIRCULAR"
        ? ""
        : "none";
  }

  if (manual) {
    manual.style.display =
      state.engine ===
      "MANUAL"
        ? ""
        : "none";
  }
}

function getConfiguredStake(
  source
) {
  let input = null;

  if (
    source ===
    "CIRCULAR"
  ) {
    input =
      $("#circularStakeInput");
  } else {
    input =
      $("#stakeInput");
  }

  return normalizeStake(
    Number(
      input?.value
    ) || MIN_STAKE
  );
}

function placeManualTrade() {
  const marketSymbol =
    $(
      "#manualMarketSelect"
    )?.value ||
    state.selectedMarket;

  const strategy =
    state.selectedStrategy;

  const stake =
    normalizeStake(
      Number(
        $(
          "#manualStakeInput"
        )?.value
      ) || MIN_STAKE
    );

  let targetDigit =
    null;

  if (
    strategy ===
      "MATCHES" ||
    strategy ===
      "DIFFERS" ||
    strategy ===
      "OVER" ||
    strategy ===
      "UNDER"
  ) {
    targetDigit =
      Number(
        $(
          "#manualTargetDigitInput"
        )?.value
      );

    if (
      !Number.isInteger(
        targetDigit
      ) ||
      targetDigit < 0 ||
      targetDigit > 9
    ) {
      toast(
        "Enter a target digit from 0 to 9."
      );

      return;
    }
  }

  const market =
    state.markets[
      marketSymbol
    ];

  if (!market) {
    toast(
      "Select a valid market."
    );

    return;
  }

  /*
     Manual prediction is based on
     the user's chosen strategy.
  */
  const prediction =
    strategy ===
      "MATCHES" ||
    strategy ===
      "DIFFERS" ||
    strategy ===
      "OVER" ||
    strategy ===
      "UNDER"
      ? targetDigit
      : strategy;

  placePaperTrade({
    marketSymbol,
    strategy,
    prediction,
    stake,
    source: "MANUAL",
    targetDigit
  });
}

/* =========================================================
   AI BOT
========================================================= */

function updateBotSelection(
  best
) {
  if (!best) return;

  setText(
    "#botSelectedMarket",
    best.market.name
  );

  setText(
    "#botSelectedStrategy",
    STRATEGY_NAMES[
      best.prediction
        .strategy
    ]
  );

  setText(
    "#botScore",
    `${best.market.score}`
  );

  setText(
    "#botConfidence",
    `${best.prediction.confidence}%`
  );

  setText(
    "#aiPredictionLarge",
    formatPrediction(
      best.prediction
        .prediction
    )
  );

  setText(
    "#predictionConfidence",
    `${best.prediction.confidence}%`
  );
}

function updateBotUI() {
  updateBotStrategyLabel();

  if (
    state.botRunning
  ) {
    setText(
      "#botStatusDash",
      "AI BOT RUNNING"
    );

    setText(
      "#engineStatusText",
      "AI BOT ACTIVE"
    );
  } else {
    setText(
      "#botStatusDash",
      "AI BOT READY"
    );

    if (
      state.engine ===
      "AI"
    ) {
      setText(
        "#engineStatusText",
        "AI BOT READY"
      );
    }
  }

  const button =
    $("#startBotBtn");

  if (button) {
    button.textContent =
      state.botRunning
        ? "STOP AI BOT"
        : "START AI BOT";
  }
}

function toggleBot() {
  if (
    state.botRunning
  ) {
    stopBot();

    return;
  }

  startBot();
}

function startBot() {
  if (
    state.botRunning
  ) {
    return;
  }

  state.botRunning =
    true;

  updateBotUI();

  toast(
    "AI BOT started."
  );

  runBotCycle();
}

function stopBot() {
  state.botRunning =
    false;

  if (state.botTimer) {
    clearTimeout(
      state.botTimer
    );

    state.botTimer =
      null;
  }

  updateBotUI();

  toast(
    "AI BOT stopped."
  );
}

function runBotCycle() {
  if (
    !state.botRunning
  ) {
    return;
  }

  runMarketScanner();

  const market =
    state.markets[
      state.aiMarket
    ];

  const strategy =
    state.aiStrategy;

  if (
    market &&
    market.ready
  ) {
    const prediction =
      predictStrategy(
        market,
        strategy
      );

    if (
      prediction.confidence >=
      55
    ) {
      const stake =
        normalizeStake(
          state.currentStake ||
            getConfiguredStake(
              "AI"
            )
        );

      let targetDigit =
        null;

      if (
        strategy ===
          "MATCHES" ||
        strategy ===
          "DIFFERS" ||
        strategy ===
          "OVER" ||
        strategy ===
          "UNDER"
      ) {
        targetDigit =
          Number(
            prediction.prediction
          );
      }

      placePaperTrade({
        marketSymbol:
          market.symbol,

        strategy,

        prediction:
          prediction.prediction,

        stake,

        source:
          "AI BOT",

        targetDigit
      });
    }
  }

  /*
     Wait before another AI decision.
     The next live tick will settle
     the current paper contract.
  */
  state.botTimer =
    setTimeout(
      runBotCycle,
      5000
    );
}

/* =========================================================
   CIRCULAR AI
========================================================= */

/*
   EXACT CYCLE:

   10 seconds ANALYZING
   ↓
   prediction generated
   ↓
   5 seconds LOCK
   ↓
   3 seconds TRADE NOW
   ↓
   repeat

   No negative countdown.
*/

const CIRCULAR_ANALYSIS_SECONDS =
  10;

const CIRCULAR_LOCK_SECONDS =
  5;

const CIRCULAR_TRADE_SECONDS =
  3;

function startCircular() {
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
    CIRCULAR_ANALYSIS_SECONDS;

  updateCircularUI();

  toast(
    "Circular AI started."
  );

  circularTick();
}

function stopCircular() {
  state.circularRunning =
    false;

  if (
    state.circularTimer
  ) {
    clearTimeout(
      state.circularTimer
    );

    state.circularTimer =
      null;
  }

  state.circularStage =
    "IDLE";

  state.circularRemaining =
    0;

  updateCircularUI();

  toast(
    "Circular AI stopped."
  );
}

function toggleCircular() {
  if (
    state.circularRunning
  ) {
    stopCircular();
  } else {
    startCircular();
  }
}

function circularTick() {
  if (
    !state.circularRunning
  ) {
    return;
  }

  updateCircularUI();

  /*
     The timer is stage-local.
     It never goes below zero.
  */
  if (
    state.circularRemaining >
    0
  ) {
    state.circularRemaining--;

    state.circularTimer =
      setTimeout(
        circularTick,
        1000
      );

    return;
  }

  /*
     Exact stage transition.
  */
  if (
    state.circularStage ===
    "ANALYZING"
  ) {
    generateCircularPrediction();

    state.circularStage =
      "LOCK";

    state.circularRemaining =
      CIRCULAR_LOCK_SECONDS;

    updateCircularUI();

    state.circularTimer =
      setTimeout(
        circularTick,
        1000
      );

    return;
  }

  if (
    state.circularStage ===
    "LOCK"
  ) {
    state.circularStage =
      "TRADE NOW";

    state.circularRemaining =
      CIRCULAR_TRADE_SECONDS;

    executeCircularTrade();

    updateCircularUI();

    state.circularTimer =
      setTimeout(
        circularTick,
        1000
      );

    return;
  }

  if (
    state.circularStage ===
    "TRADE NOW"
  ) {
    state.circularStage =
      "ANALYZING";

    state.circularRemaining =
      CIRCULAR_ANALYSIS_SECONDS;

    updateCircularUI();

    state.circularTimer =
      setTimeout(
        circularTick,
        1000
      );

    return;
  }

  /*
     Safety reset.
  */
  state.circularStage =
    "ANALYZING";

  state.circularRemaining =
    CIRCULAR_ANALYSIS_SECONDS;

  state.circularTimer =
    setTimeout(
      circularTick,
      1000
    );
}

function generateCircularPrediction() {
  /*
     Always scan at the beginning
     of the prediction stage.
  */
  runMarketScanner();

  const selectedMarket =
    state.aiMarket ||
    state.selectedMarket;

  const market =
    state.markets[
      selectedMarket
    ];

  /*
     Circular strategy follows
     the user's selected strategy.
     AUTO-like behavior is represented
     by the currently selected strategy.
  */
  const strategy =
    state.selectedStrategy ||
    state.aiStrategy ||
    "MATCHES";

  if (
    !market ||
    market.ticks.length <
      5
  ) {
    state.circularMarket =
      selectedMarket;

    state.circularStrategy =
      strategy;

    state.circularPrediction =
      "WAIT";

    return;
  }

  const prediction =
    predictStrategy(
      market,
      strategy
    );

  state.circularMarket =
    selectedMarket;

  state.circularStrategy =
    strategy;

  state.circularPrediction =
    prediction;

  /*
     IMPORTANT:
     Do NOT fill the manual target
     digit input here.

     Circular AI predicts only.
  */
  setText(
    "#aiCirclePrediction",
    formatPrediction(
      prediction.prediction
    )
  );

  setText(
    "#aiType",
    STRATEGY_NAMES[
      strategy
    ]
  );

  setText(
    "#analysisConfidence",
    `${prediction.confidence}%`
  );

  setText(
    "#analysisMsg",
    prediction.reason
  );

  updateCircularPredictionPreview(
    {
      market,
      prediction
    }
  );
}

function executeCircularTrade() {
  if (
    !state.circularPrediction ||
    !state.circularMarket
  ) {
    return;
  }

  const prediction =
    state.circularPrediction;

  if (
    !prediction ||
    prediction.prediction ===
      "WAIT"
  ) {
    return;
  }

  const market =
    state.markets[
      state.circularMarket
    ];

  if (!market) return;

  const strategy =
    state.circularStrategy;

  const stake =
    normalizeStake(
      Number(
        $(
          "#circularStakeInput"
        )?.value
      ) ||
        MIN_STAKE
    );

  let targetDigit =
    null;

  if (
    strategy ===
      "MATCHES" ||
    strategy ===
      "DIFFERS" ||
    strategy ===
      "OVER" ||
    strategy ===
      "UNDER"
  ) {
    targetDigit =
      Number(
        prediction.prediction
      );
  }

  placePaperTrade({
    marketSymbol:
      market.symbol,

    strategy,

    prediction:
      prediction.prediction,

    stake,

    source:
      "CIRCULAR",

    targetDigit
  });
}

function updateCircularPredictionPreview(
  best
) {
  if (!best) return;

  const prediction =
    best.prediction;

  if (!prediction) return;

  setText(
    "#aiCirclePrediction",
    formatPrediction(
      prediction.prediction
    )
  );

  setText(
    "#aiCircleLabel",
    STRATEGY_NAMES[
      prediction.strategy
    ]
  );

  setText(
    "#circularStatusText",
    `AI • ${best.market.name}`
  );
}

function updateCircularUI() {
  const button =
    $("#startCircularTradeBtn");

  if (button) {
    button.textContent =
      state.circularRunning
        ? "STOP CIRCULAR AI"
        : "START CIRCULAR AI";
  }

  if (
    state.circularRunning
  ) {
    setText(
      "#circularStatusText",
      `${state.circularStage} • ${state.circularRemaining}s`
    );
  } else {
    setText(
      "#circularStatusText",
      "CIRCULAR AI READY"
    );
  }

  setText(
    "#aiCircleTimer",
    String(
      Math.max(
        0,
        state.circularRemaining
      )
    )
  );

  setText(
    "#cycleAnalysis",
    state.circularStage ===
      "ANALYZING"
      ? "ACTIVE"
      : "DONE"
  );

  setText(
    "#cycleTrade",
    state.circularStage ===
      "TRADE NOW"
      ? "TRADE NOW"
      : state.circularStage ===
        "LOCK"
      ? "LOCKED"
      : "WAIT"
  );

  setText(
    "#cycleCooldown",
    state.circularStage ===
      "TRADE NOW"
      ? `${state.circularRemaining}s`
      : ""
  );

  const circle =
    $("#aiCircle");

  if (circle) {
    circle.dataset.stage =
      state.circularStage;
  }

  const label =
    $("#aiCircleLabel");

  if (label) {
    label.textContent =
      state.circularStage ===
      "TRADE NOW"
        ? "TRADE NOW"
        : state.circularStage;
  }

  updateCycleDisplay();
}

function updateCycleDisplay() {
  if (
    !state.circularRunning
  ) {
    return;
  }

  setText(
    "#aiCircleTimer",
    String(
      Math.max(
        0,
        state.circularRemaining
      )
    )
  );
}

/* =========================================================
   ENGINE STATUS
========================================================= */

function stopAllEngines(
  message = "Engines stopped."
) {
  stopBot();
  stopCircular();

  setText(
    "#engineStatusText",
    "ENGINES STOPPED"
  );

  toast(
    message
  );
}

/* =========================================================
   ACTIVE TRADES
========================================================= */

function renderActiveTrades() {
  const container =
    $("#activeTradesList");

  setText(
    "#activeTradeCount",
    String(
      state.activeTrades.length
    )
  );

  if (!container) return;

  if (
    !state.activeTrades.length
  ) {
    container.innerHTML =
      `<div class="empty-state">
        No active paper trades
      </div>`;

    return;
  }

  container.innerHTML =
    state.activeTrades
      .map(
        (trade) => `
          <div class="active-trade-card">
            <div>
              <strong>
                ${escapeHTML(
                  trade.marketName
                )}
              </strong>

              <small>
                ${escapeHTML(
                  STRATEGY_NAMES[
                    trade.strategy
                  ] ||
                    trade.strategy
                )}
              </small>
            </div>

            <div>
              <strong>
                ${formatPrediction(
                  trade.prediction
                )}
              </strong>

              <small>
                ${formatMoney(
                  trade.stake
                )}
              </small>
            </div>

            <span>
              ACTIVE
            </span>
          </div>
        `
      )
      .join("");
}

/* =========================================================
   HISTORY
========================================================= */

function rebuildStats() {
  state.totalStake = 0;
  state.amountWon = 0;
  state.netProfit = 0;
  state.wins = 0;
  state.losses = 0;

  state.history.forEach(
    (trade) => {
      state.totalStake +=
        Number(
          trade.stake
        ) || 0;

      state.amountWon +=
        Number(
          trade.amountWon
        ) || 0;

      state.netProfit +=
        Number(
          trade.net
        ) || 0;

      if (
        trade.status ===
        "WIN"
      ) {
        state.wins++;
      }

      if (
        trade.status ===
        "LOSS"
      ) {
        state.losses++;
      }
    }
  );
}

function renderHistory() {
  rebuildStats();

  const container =
    $("#historyCardsList");

  if (!container) return;

  if (
    !state.history.length
  ) {
    container.innerHTML =
      `<div class="empty-state">
        No trading history yet.
      </div>`;

    return;
  }

  container.innerHTML =
    state.history
      .map(
        (trade) => {
          const win =
            trade.status ===
            "WIN";

          return `
            <div class="history-card ${
              win
                ? "history-win"
                : "history-loss"
            }">

              <div class="history-main">

                <div>
                  <strong>
                    ${escapeHTML(
                      trade.marketName
                    )}
                  </strong>

                  <small>
                    ${escapeHTML(
                      STRATEGY_NAMES[
                        trade.strategy
                      ] ||
                        trade.strategy
                    )}
                  </small>
                </div>

                <div class="${
                  win
                    ? "positive"
                    : "negative"
                }">
                  ${
                    win
                      ? "WIN"
                      : "LOSS"
                  }
                </div>

              </div>

              <div class="history-grid">

                <div>
                  <span>Prediction</span>
                  <strong>
                    ${formatPrediction(
                      trade.prediction
                    )}
                  </strong>
                </div>

                <div>
                  <span>Entry Digit</span>
                  <strong>
                    ${
                      trade.entryDigit ??
                      "-"
                    }
                  </strong>
                </div>

                <div>
                  <span>Exit Digit</span>
                  <strong>
                    ${
                      trade.exitDigit ??
                      "-"
                    }
                  </strong>
                </div>

                <div>
                  <span>Stake</span>
                  <strong>
                    ${formatMoney(
                      trade.stake
                    )}
                  </strong>
                </div>

                <div>
                  <span>Amount Won</span>
                  <strong>
                    ${formatMoney(
                      trade.amountWon
                    )}
                  </strong>
                </div>

                <div>
                  <span>Net Profit</span>
                  <strong class="${
                    Number(
                      trade.net
                    ) >= 0
                      ? "positive"
                      : "negative"
                  }">
                    ${
                      Number(
                        trade.net
                      ) >= 0
                        ? "+"
                        : ""
                    }${formatMoney(
                      trade.net
                    )}
                  </strong>
                </div>

              </div>

              <small>
                ${formatDate(
                  trade.settledAt ||
                    trade.time
                )}
              </small>

            </div>
          `;
        }
      )
      .join("");
}

function clearHistory() {
  if (
    !state.history.length
  ) {
    toast(
      "History is already empty."
    );

    return;
  }

  const confirmed =
    window.confirm(
      "Clear all KRISHWAVE paper trading history?"
    );

  if (!confirmed) return;

  state.history = [];

  state.totalStake = 0;
  state.amountWon = 0;
  state.netProfit = 0;
  state.wins = 0;
  state.losses = 0;

  savePaperState();

  renderHistory();
  updateAllStats();

  toast(
    "History cleared."
  );
}

/* =========================================================
   STATS
========================================================= */

function updateAllStats() {
  const total =
    state.wins +
    state.losses;

  const accuracy =
    total
      ? (
          state.wins /
          total
        ) *
        100
      : 0;

  setText(
    "#paperTotal",
    String(total)
  );

  setText(
    "#paperWins",
    String(state.wins)
  );

  setText(
    "#paperLosses",
    String(state.losses)
  );

  setText(
    "#paperAccuracy",
    `${accuracy.toFixed(1)}%`
  );

  setText(
    "#totalProfitDisplay",
    formatSignedMoney(
      state.netProfit
    )
  );

  setText(
    "#historyTotalStake",
    formatMoney(
      state.totalStake
    )
  );

  setText(
    "#historyAmountWon",
    formatMoney(
      state.amountWon
    )
  );

  setText(
    "#historyNetProfit",
    formatSignedMoney(
      state.netProfit
    )
  );

  setText(
    "#sessionProfitDisplay",
    formatSignedMoney(
      state.netProfit
    )
  );

  setText(
    "#balanceDisplay",
    formatMoney(
      state.paperBalance
    )
  );

  const profitEl =
    $("#historyNetProfit");

  if (profitEl) {
    profitEl.classList.toggle(
      "positive",
      state.netProfit >
        0
    );

    profitEl.classList.toggle(
      "negative",
      state.netProfit <
        0
    );
  }
}

/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(
  connected,
  text
) {
  const dot =
    $(".connectionDot");

  if (dot) {
    dot.classList.toggle(
      "online",
      connected
    );

    dot.classList.toggle(
      "offline",
      !connected
    );
  }

  setText(
    ".connectionText",
    text
  );
}

/* =========================================================
   TOAST
========================================================= */

let toastTimer =
  null;

function toast(
  message
) {
  const box =
    $("#toast");

  const text =
    $("#toastMessage");

  if (!box || !text) {
    console.log(
      "KRISHWAVE:",
      message
    );

    return;
  }

  text.textContent =
    message;

  box.classList.add(
    "show"
  );

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(
      () => {
        box.classList.remove(
          "show"
        );
      },
      2800
    );
}

/* =========================================================
   FORMATTING
========================================================= */

function formatMoney(
  value,
  currency = "USD"
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return "$0.00";
  }

  const symbol =
    currency ===
    "USD"
      ? "$"
      : `${currency} `;

  return (
    symbol +
    number.toFixed(2)
  );
}

function formatSignedMoney(
  value
) {
  const number =
    Number(value) || 0;

  return (
    number >= 0
      ? "+"
      : "-"
  ) +
    formatMoney(
      Math.abs(number)
    );
}

function formatPrice(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return "--";
  }

  return number.toFixed(
    2
  );
}

function formatPrediction(
  prediction
) {
  if (
    prediction ===
    null ||
    prediction ===
    undefined
  ) {
    return "WAIT";
  }

  if (
    typeof prediction ===
    "number"
  ) {
    return String(
      prediction
    );
  }

  return String(
    prediction
  );
}

function formatDate(
  value
) {
  if (!value) {
    return "--";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(
      value
    );
  }

  return date.toLocaleString();
}

function roundMoney(
  value
) {
  return Math.round(
    (
      Number(value) ||
      0
    ) * 100
  ) / 100;
}

function clamp(
  value,
  min,
  max
) {
  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}

/* =========================================================
   STARTUP POLISH
========================================================= */

function initializeInputs() {
  const stakeInputs =
    [
      "#stakeInput",
      "#manualStakeInput",
      "#circularStakeInput"
    ];

  stakeInputs.forEach(
    (selector) => {
      const input =
        $(selector);

      if (!input) return;

      input.min =
        String(
          MIN_STAKE
        );

      if (
        !input.value
      ) {
        input.value =
          MIN_STAKE.toFixed(
            2
          );
      }
    }
  );
}

initializeInputs();

/* =========================================================
   PUBLIC MARKET STATUS REFRESH
========================================================= */

setInterval(
  () => {
    if (
      state.publicConnected
    ) {
      const ready =
        MARKETS.filter(
          (symbol) =>
            state.markets[
              symbol
            ].ready
        ).length;

      setText(
        "#dataStatus",
        `LIVE • ${ready}/${MARKETS.length} markets`
      );
    }
  },
  3000
);

/* =========================================================
   DEBUG ACCESS
========================================================= */

window.KRISHWAVE =
  {
    state,
    markets:
      state.markets,

    startBot,
    stopBot,

    startCircular,
    stopCircular,

    placeManualTrade,

    connectPublicWebSocket,

    logoutDeriv
  };

console.log(
  "KRISHWAVE AI BEAST V7.1 loaded."
);