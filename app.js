/* =========================================================
   KRISHWAVE AI BEAST V7.3
   ---------------------------------------------------------
   LIVE DERIV MARKET INTELLIGENCE
   OAUTH + PKCE
   MARKET SCANNER
   CIRCULAR AI
   AI BOT
   MANUAL PAPER ENGINE
   TRADE HISTORY
   TAKE PROFIT / STOP LOSS
   MARTINGALE
   DARK / LIGHT MODE

   IMPORTANT:
   - PAPER TRADING ONLY
   - NO REAL TRADES ARE EXECUTED
   - REAL MODE is display/account selection only
   - Signals are analysis only and are NOT guaranteed
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

const MIN_STAKE = 0.25;

const STARTING_BALANCE = 1000;

const PAYOUT = {
  MATCHES: 8.5,
  DIFFERS: 0.09,
  OVER: 0.95,
  UNDER: 0.95,
  EVEN: 0.95,
  ODD: 0.95
};

const STORAGE = {
  balance: "krishwave_v73_balance",
  history: "krishwave_v73_history",
  theme: "krishwave_v73_theme",
  session: "krishwave_v73_session",
  account: "krishwave_v73_account",
  settings: "krishwave_v73_settings"
};

/* =========================================================
   GLOBAL STATE
   ========================================================= */

const state = {
  page: "analysisPage",

  engine: "manual",

  mode: "demo",

  selectedMarket: "R_10",

  selectedStrategy: "MATCHES",

  circularStrategy: "AUTO",

  manualTarget: 0,

  publicWs: null,

  authenticatedWs: null,

  publicConnected: false,

  authenticatedConnected: false,

  reconnectTimer: null,

  reconnectAttempts: 0,

  sessionId: "",

  account: null,

  backendConfig: null,

  balance: STARTING_BALANCE,

  history: [],

  activeTrades: [],

  markets: new Map(),

  runningBot: false,

  runningCircular: false,

  botTimer: null,

  circularTimer: null,

  circularPhase: "STOPPED",

  circularRemaining: 0,

  circularCycle: 0,

  botLastTrade: 0,

  martingaleLevel: 0,

  settings: {
    stake: 0.25,
    takeProfit: 0,
    stopLoss: 0,
    martingale: 2
  },

  stats: {
    wins: 0,
    losses: 0,
    profit: 0
  }
};

/* =========================================================
   HELPERS
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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round2(value) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function randomId(prefix = "KW") {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return "$" + round2(value).toFixed(2);
}

function formatPercent(value) {
  return safeNumber(value).toFixed(1) + "%";
}

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

/* =========================================================
   TOAST
   ========================================================= */

function showToast(message, type = "info") {
  let toast = $("toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;

  toast.className =
    "toast show " +
    (type || "info");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

/* =========================================================
   STORAGE
   ========================================================= */

function loadStorage() {
  try {
    const savedBalance =
      localStorage.getItem(STORAGE.balance);

    if (savedBalance !== null) {
      state.balance =
        safeNumber(
          JSON.parse(savedBalance),
          STARTING_BALANCE
        );
    }

    const savedHistory =
      localStorage.getItem(STORAGE.history);

    if (savedHistory) {
      const parsed =
        JSON.parse(savedHistory);

      if (Array.isArray(parsed)) {
        state.history = parsed;
      }
    }

    const savedTheme =
      localStorage.getItem(STORAGE.theme);

    if (savedTheme === "light") {
      document.documentElement.dataset.theme =
        "light";
    } else {
      document.documentElement.dataset.theme =
        "dark";
    }

    const savedSession =
      sessionStorage.getItem(STORAGE.session);

    if (savedSession) {
      state.sessionId = savedSession;
    }

    const savedAccount =
      localStorage.getItem(STORAGE.account);

    if (savedAccount) {
      try {
        state.account =
          JSON.parse(savedAccount);
      } catch {
        state.account = null;
      }
    }

    const savedSettings =
      localStorage.getItem(STORAGE.settings);

    if (savedSettings) {
      try {
        const settings =
          JSON.parse(savedSettings);

        state.settings = {
          ...state.settings,
          ...settings
        };
      } catch {}
    }
  } catch (error) {
    console.warn(
      "Storage load error",
      error
    );
  }

  calculateStats();
}

function saveStorage() {
  try {
    localStorage.setItem(
      STORAGE.balance,
      JSON.stringify(state.balance)
    );

    localStorage.setItem(
      STORAGE.history,
      JSON.stringify(state.history)
    );

    localStorage.setItem(
      STORAGE.settings,
      JSON.stringify(state.settings)
    );

    localStorage.setItem(
      STORAGE.theme,
      document.documentElement.dataset.theme ||
        "dark"
    );

    if (state.account) {
      localStorage.setItem(
        STORAGE.account,
        JSON.stringify(state.account)
      );
    }

    if (state.sessionId) {
      sessionStorage.setItem(
        STORAGE.session,
        state.sessionId
      );
    }
  } catch (error) {
    console.warn(
      "Storage save error",
      error
    );
  }
}

/* =========================================================
   MARKET INITIALIZATION
   ========================================================= */

function initializeMarkets() {
  MARKETS.forEach(symbol => {
    state.markets.set(symbol, {
      symbol,

      ticks: [],

      prices: [],

      digits: [],

      digitCounts: Array(10).fill(0),

      price: 0,

      lastDigit: null,

      previousDigit: null,

      pipSize: 2,

      confidence: 0,

      score: 0,

      signal: "WAITING",

      prediction: null,

      diversity: 0,

      updated: null
    });
  });
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {
  const navButtons =
    qsa(
      "[data-page], .nav-item, .nav-btn"
    );

  navButtons.forEach(button => {
    button.addEventListener(
      "click",
      event => {
        event.preventDefault();

        const page =
          button.dataset.page ||
          button.getAttribute(
            "data-target"
          );

        if (!page) return;

        updatePage(page);
      }
    );
  });
}

function updatePage(page) {
  const pages = qsa(".page");

  pages.forEach(section => {
    section.classList.remove(
      "active-page"
    );
  });

  const target =
    $(page);

  if (target) {
    target.classList.add(
      "active-page"
    );
  }

  const navItems =
    qsa(
      "[data-page], .nav-item, .nav-btn"
    );

  navItems.forEach(item => {
    const targetPage =
      item.dataset.page ||
      item.getAttribute(
        "data-target"
      );

    item.classList.toggle(
      "active",
      targetPage === page
    );
  });

  state.page = page;

  if (page === "historyPage") {
    renderHistory();
    renderHistoryStats();
  }

  if (page === "tradePage") {
    renderTradePage();
  }
}

/* =========================================================
   ENGINE TABS
   ========================================================= */

function setupEngineTabs() {
  const tabs =
    qsa(
      "[data-engine], .engine-tab"
    );

  tabs.forEach(tab => {
    tab.addEventListener(
      "click",
      event => {
        event.preventDefault();

        const engine =
          tab.dataset.engine ||
          tab.getAttribute(
            "data-engine"
          );

        if (!engine) return;

        setEngine(engine);
      }
    );
  });

  setEngine(state.engine);
}

function setEngine(engine) {
  if (
    ![
      "bot",
      "circular",
      "manual"
    ].includes(engine)
  ) {
    engine = "manual";
  }

  state.engine = engine;

  qsa(
    "[data-engine], .engine-tab"
  ).forEach(tab => {
    const value =
      tab.dataset.engine ||
      tab.getAttribute(
        "data-engine"
      );

    tab.classList.toggle(
      "active",
      value === engine
    );
  });

  const panels = {
    bot: [
      "botPanel",
      "aiBotPanel"
    ],
    circular: [
      "circularPanel",
      "circularAiPanel"
    ],
    manual: [
      "manualPanel"
    ]
  };

  [
    "botPanel",
    "aiBotPanel",
    "circularPanel",
    "circularAiPanel",
    "manualPanel"
  ].forEach(id => {
    const element = $(id);

    if (element) {
      element.classList.remove(
        "active-panel"
      );

      element.style.display = "none";
    }
  });

  (panels[engine] || []).forEach(id => {
    const element = $(id);

    if (element) {
      element.classList.add(
        "active-panel"
      );

      element.style.display = "";
    }
  });

  renderTradePage();
}

/* =========================================================
   THEME
   ========================================================= */

function setupTheme() {
  const buttons =
    qsa(
      "#themeToggle, [data-theme-toggle]"
    );

  buttons.forEach(button => {
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
          STORAGE.theme,
          next
        );

        updateThemeButton();
      }
    );
  });

  updateThemeButton();
}

function updateThemeButton() {
  const theme =
    document.documentElement.dataset.theme ||
    "dark";

  qsa(
    "#themeToggle, [data-theme-toggle]"
  ).forEach(button => {
    button.textContent =
      theme === "dark"
        ? "☀️"
        : "🌙";
  });
}

/* =========================================================
   DEMO / REAL DISPLAY MODE
   ========================================================= */

function setupModeButtons() {
  qsa(
    "[data-mode]"
  ).forEach(button => {
    button.addEventListener(
      "click",
      () => {
        const mode =
          button.dataset.mode;

        if (mode === "real") {
          openRealConfirmation();
          return;
        }

        setMode(mode);
      }
    );
  });

  updateModeUI();
}

function setMode(mode) {
  state.mode =
    mode === "real"
      ? "real"
      : "demo";

  updateModeUI();

  showToast(
    state.mode === "demo"
      ? "DEMO mode selected"
      : "REAL account display selected"
  );
}

function updateModeUI() {
  qsa(
    "[data-mode]"
  ).forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.mode ===
        state.mode
    );
  });

  const modeDisplay =
    $("accountModeDisplay");

  if (modeDisplay) {
    modeDisplay.textContent =
      state.mode.toUpperCase();
  }
}

/* =========================================================
   REAL CONFIRMATION
   ========================================================= */

function openRealConfirmation() {
  const modal =
    $("realModal") ||
    $("realModeModal");

  if (!modal) {
    const confirmed =
      window.confirm(
        "REAL mode is display/account selection only. KRISHWAVE does not execute real trades. Continue?"
      );

    if (confirmed) {
      setMode("real");
    }

    return;
  }

  modal.classList.add(
    "show",
    "active"
  );

  modal.style.display = "flex";
}

function closeRealConfirmation() {
  const modal =
    $("realModal") ||
    $("realModeModal");

  if (!modal) return;

  modal.classList.remove(
    "show",
    "active"
  );

  modal.style.display = "none";
}

function setupModal() {
  qsa(
    "[data-close-modal], #cancelReal, #realCancel"
  ).forEach(button => {
    button.addEventListener(
      "click",
      closeRealConfirmation
    );
  });

  qsa(
    "#confirmReal, #realConfirm"
  ).forEach(button => {
    button.addEventListener(
      "click",
      () => {
        closeRealConfirmation();
        setMode("real");
      }
    );
  });
}

/* =========================================================
   BUTTONS / CONTROLS
   ========================================================= */

function setupControls() {
  const connect =
    $("connectDeriv");

  if (connect) {
    connect.addEventListener(
      "click",
      connectDeriv
    );
  }

  const scan =
    $("scanMarkets") ||
    $("analysisScanBtn") ||
    $("scanBtn");

  if (scan) {
    scan.addEventListener(
      "click",
      scanMarkets
    );
  }

  const manualTrade =
    $("paperTrade") ||
    $("manualTrade") ||
    $("tradeNow");

  if (manualTrade) {
    manualTrade.addEventListener(
      "click",
      executeManualTrade
    );
  }

  const startBotButton =
    $("startBot") ||
    $("startAI");

  if (startBotButton) {
    startBotButton.addEventListener(
      "click",
      startBot
    );
  }

  const stopBotButton =
    $("stopBot") ||
    $("stopAI");

  if (stopBotButton) {
    stopBotButton.addEventListener(
      "click",
      stopBot
    );
  }

  const startCircular =
    $("startCircular") ||
    $("startCircularAI");

  if (startCircular) {
    startCircular.addEventListener(
      "click",
      startCircularAI
    );
  }

  const stopCircular =
    $("stopCircular") ||
    $("stopCircularAI");

  if (stopCircular) {
    stopCircular.addEventListener(
      "click",
      stopCircularAI
    );
  }

  const clearHistory =
    $("clearHistory");

  if (clearHistory) {
    clearHistory.addEventListener(
      "click",
      clearTradeHistory
    );
  }

  setupStrategyButtons();
  setupCircularStrategy();
  setupManualInputs();
}

/* =========================================================
   STRATEGY BUTTONS
   ========================================================= */

function setupStrategyButtons() {
  qsa(
    "[data-strategy]"
  ).forEach(button => {
    button.addEventListener(
      "click",
      () => {
        const strategy =
          button.dataset.strategy;

        if (
          !STRATEGIES.includes(
            strategy
          )
        ) {
          return;
        }

        state.selectedStrategy =
          strategy;

        qsa(
          "[data-strategy]"
        ).forEach(item => {
          item.classList.toggle(
            "active",
            item.dataset.strategy ===
              strategy
          );
        });

        const select =
          $("manualStrategy");

        if (select) {
          select.value =
            strategy;
        }

        updatePrediction();
      }
    );
  });
}

/* =========================================================
   CIRCULAR STRATEGY
   ========================================================= */

function setupCircularStrategy() {
  qsa(
    "[data-circular-strategy]"
  ).forEach(button => {
    button.addEventListener(
      "click",
      () => {
        state.circularStrategy =
          button.dataset.circularStrategy;

        qsa(
          "[data-circular-strategy]"
        ).forEach(item => {
          item.classList.toggle(
            "active",
            item.dataset
              .circularStrategy ===
              state.circularStrategy
          );
        });
      }
    );
  });
}

/* =========================================================
   MANUAL INPUTS
   ========================================================= */

function setupManualInputs() {
  const market =
    $("manualMarket");

  if (market) {
    populateMarketSelect(
      market
    );

    market.addEventListener(
      "change",
      () => {
        state.selectedMarket =
          market.value;

        updateAnalysis();
      }
    );
  }

  const strategy =
    $("manualStrategy");

  if (strategy) {
    strategy.innerHTML =
      STRATEGIES.map(
        item =>
          `<option value="${item}">${item}</option>`
      ).join("");

    strategy.value =
      state.selectedStrategy;

    strategy.addEventListener(
      "change",
      () => {
        state.selectedStrategy =
          strategy.value;

        updatePrediction();
      }
    );
  }

  const target =
    $("targetDigit") ||
    $("manualTarget");

  if (target) {
    target.value =
      state.manualTarget;

    target.addEventListener(
      "input",
      () => {
        state.manualTarget =
          clamp(
            parseInt(
              target.value,
              10
            ) || 0,
            0,
            9
          );
      }
    );
  }

  const stake =
    $("stakeInput") ||
    $("manualStake") ||
    $("stake");

  if (stake) {
    stake.value =
      state.settings.stake;

    stake.addEventListener(
      "input",
      () => {
        state.settings.stake =
          Math.max(
            MIN_STAKE,
            safeNumber(
              stake.value,
              MIN_STAKE
            )
          );

        saveStorage();
      }
    );
  }

  const tp =
    $("takeProfit");

  if (tp) {
    tp.value =
      state.settings.takeProfit;

    tp.addEventListener(
      "input",
      () => {
        state.settings.takeProfit =
          Math.max(
            0,
            safeNumber(
              tp.value,
              0
            )
          );

        saveStorage();
      }
    );
  }

  const sl =
    $("stopLoss");

  if (sl) {
    sl.value =
      state.settings.stopLoss;

    sl.addEventListener(
      "input",
      () => {
        state.settings.stopLoss =
          Math.max(
            0,
            safeNumber(
              sl.value,
              0
            )
          );

        saveStorage();
      }
    );
  }

  const martingale =
    $("martingale");

  if (martingale) {
    martingale.value =
      state.settings.martingale;

    martingale.addEventListener(
      "input",
      () => {
        state.settings.martingale =
          Math.max(
            1,
            safeNumber(
              martingale.value,
              2
            )
          );

        saveStorage();
      }
    );
  }
}

function populateMarketSelect(select) {
  select.innerHTML =
    MARKETS.map(
      symbol =>
        `<option value="${symbol}">${symbol}</option>`
    ).join("");

  select.value =
    state.selectedMarket;
}

/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);

async function init() {
  loadStorage();

  initializeMarkets();

  setupNavigation();

  setupEngineTabs();

  setupTheme();

  setupModeButtons();

  setupModal();

  setupControls();

  updatePage(state.page);

  updateAllUI();

  updateConnectionUI(
    "CONNECTING",
    "LIVE DATA CONNECTING..."
  );

  await loadBackendConfig();

  await checkExistingSession();

  connectPublicWebSocket();

  handleOAuthCallback();
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
        "Backend config request failed"
      );
    }

    const data =
      await response.json();

    if (data.success) {
      state.backendConfig =
        data;

      console.log(
        "Backend config loaded",
        data
      );
    }
  } catch (error) {
    console.warn(
      "Backend config unavailable:",
      error
    );

    updateConnectionUI(
      "OFFLINE",
      "BACKEND UNAVAILABLE"
    );
  }
}

/* =========================================================
   BACKEND REQUEST
   ========================================================= */

async function backendRequest(
  path,
  options = {}
) {
  const config = {
    method:
      options.method || "GET",
    headers: {
      "Content-Type":
        "application/json",
      ...(options.headers || {})
    }
  };

  if (options.body !== undefined) {
    config.body =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(
            options.body
          );
  }

  const response =
    await fetch(
      BACKEND_URL + path,
      config
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
        data.message ||
        `HTTP ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   OAUTH PKCE
   ========================================================= */

function randomVerifier() {
  const bytes =
    new Uint8Array(48);

  crypto.getRandomValues(bytes);

  return Array.from(
    bytes,
    byte =>
      String.fromCharCode(
        65 +
          (byte % 26)
      )
  ).join("");
}

async function sha256Base64URL(
  text
) {
  const data =
    new TextEncoder().encode(
      text
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  const bytes =
    new Uint8Array(digest);

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
    .replace(/=+$/, "");
}

async function connectDeriv() {
  try {
    if (!state.backendConfig) {
      await loadBackendConfig();
    }

    const clientId =
      state.backendConfig?.client_id ||
      "34khasPjsT0PCRR8X3Z70";

    const redirectUri =
      state.backendConfig?.redirect_uri ||
      "https://chrispusatale99-dot.github.io/KRISHWAVE/";

    const verifier =
      randomVerifier();

    const challenge =
      await sha256Base64URL(
        verifier
      );

    const oauthState =
      randomId("oauth");

    sessionStorage.setItem(
      "kw_code_verifier",
      verifier
    );

    sessionStorage.setItem(
      "kw_oauth_state",
      oauthState
    );

    const params =
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope:
          "trade account_manage application_read",
        state: oauthState,
        code_challenge: challenge,
        code_challenge_method: "S256"
      });

    const url =
      `${DERIV_AUTH_URL}?${params.toString()}`;

    showToast(
      "Opening Deriv login..."
    );

    window.location.href =
      url;
  } catch (error) {
    console.error(
      "OAuth error:",
      error
    );

    showToast(
      "Unable to start Deriv connection",
      "error"
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

  const error =
    params.get("error");

  if (error) {
    showToast(
      "Deriv login was cancelled",
      "error"
    );

    cleanOAuthUrl();

    return;
  }

  if (!code) {
    return;
  }

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
    !verifier ||
    returnedState !==
      savedState
  ) {
    showToast(
      "OAuth security check failed",
      "error"
    );

    cleanOAuthUrl();

    return;
  }

  try {
    updateConnectionUI(
      "CONNECTING",
      "AUTHENTICATING DERIV..."
    );

    const data =
      await backendRequest(
        "/api/oauth/exchange",
        {
          method: "POST",
          body: {
            code,
            code_verifier:
              verifier
          }
        }
      );

    if (!data.success) {
      throw new Error(
        data.error ||
          "OAuth exchange failed"
      );
    }

    state.sessionId =
      data.session_id ||
      data.sessionId ||
      "";

    if (!state.sessionId) {
      throw new Error(
        "No session returned"
      );
    }

    sessionStorage.setItem(
      STORAGE.session,
      state.sessionId
    );

    sessionStorage.removeItem(
      "kw_code_verifier"
    );

    sessionStorage.removeItem(
      "kw_oauth_state"
    );

    cleanOAuthUrl();

    showToast(
      "Deriv authenticated"
    );

    await loadAccounts();
  } catch (err) {
    console.error(
      "OAuth callback error:",
      err
    );

    updateConnectionUI(
      "FAILED",
      "DERIV CONNECTION FAILED"
    );

    showToast(
      err.message ||
        "Deriv authentication failed",
      "error"
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
   EXISTING SESSION
   ========================================================= */

async function checkExistingSession() {
  if (!state.sessionId) {
    return;
  }

  try {
    const data =
      await backendRequest(
        `/api/session?session_id=${encodeURIComponent(
          state.sessionId
        )}`
      );

    if (
      data.success &&
      data.authenticated
    ) {
      await loadAccounts();
    }
  } catch (error) {
    console.warn(
      "Existing session unavailable",
      error
    );

    state.sessionId = "";

    sessionStorage.removeItem(
      STORAGE.session
    );
  }
}

/* =========================================================
   ACCOUNTS
   ========================================================= */

async function loadAccounts() {
  if (!state.sessionId) {
    return;
  }

  try {
    updateConnectionUI(
      "CONNECTING",
      "LOADING DERIV ACCOUNT..."
    );

    const data =
      await backendRequest(
        `/api/accounts?session_id=${encodeURIComponent(
          state.sessionId
        )}`
      );

    if (
      !data.success ||
      !Array.isArray(
        data.accounts
      ) ||
      !data.accounts.length
    ) {
      throw new Error(
        "No Deriv accounts returned"
      );
    }

    const accounts =
      data.accounts;

    let selected =
      accounts.find(account => {
        const login =
          String(
            account.loginid ||
              account.account_id ||
              ""
          ).toUpperCase();

        return (
          login.startsWith("DOT") ||
          account.is_demo === true ||
          account.demo === true
        );
      });

    if (!selected) {
      selected =
        accounts[0];
    }

    state.account =
      selected;

    saveStorage();

    updateAccountUI();

    updateConnectionUI(
      "ONLINE",
      "DERIV ACCOUNT CONNECTED"
    );

    await connectAuthenticatedWebSocket(
      selected
    );
  } catch (error) {
    console.error(
      "Account loading error:",
      error
    );

    updateConnectionUI(
      "FAILED",
      "ACCOUNT CONNECTION FAILED"
    );

    showToast(
      error.message ||
        "Unable to load account",
      "error"
    );
  }
}

/* =========================================================
   AUTHENTICATED OPTIONS WEBSOCKET
   ========================================================= */

async function connectAuthenticatedWebSocket(
  account
) {
  if (!state.sessionId) {
    return;
  }

  const accountId =
    account?.loginid ||
    account?.account_id;

  if (!accountId) {
    return;
  }

  try {
    const response =
      await backendRequest(
        "/api/otp",
        {
          method: "POST",
          body: {
            session_id:
              state.sessionId,
            account_id:
              accountId
          }
        }
      );

    const websocketUrl =
      response.websocket_url ||
      response.data?.url ||
      response.data?.websocket_url ||
      response.url;

    if (
      !response.success ||
      !websocketUrl
    ) {
      throw new Error(
        response.error ||
          "Unable to obtain authenticated WebSocket"
      );
    }

    if (state.authenticatedWs) {
      try {
        state.authenticatedWs.close();
      } catch {}
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
        state.authenticatedConnected =
          true;

        console.log(
          "Authenticated Deriv WebSocket connected"
        );

        updateConnectionUI(
          "ONLINE",
          "DERIV LIVE"
        );

        sendAuthenticatedRequests();
      }
    );

    ws.addEventListener(
      "message",
      event => {
        try {
          const data =
            JSON.parse(
              event.data
            );

          handleAuthenticatedMessage(
            data
          );
        } catch (error) {
          console.warn(
            "Authenticated message parse error",
            error
          );
        }
      }
    );

    ws.addEventListener(
      "close",
      () => {
        state.authenticatedConnected =
          false;

        console.warn(
          "Authenticated WebSocket closed"
        );

        if (
          state.publicConnected
        ) {
          updateConnectionUI(
            "ONLINE",
            "LIVE MARKET DATA"
          );
        }
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

    state.authenticatedConnected =
      false;

    showToast(
      "Account connected, live account channel unavailable"
    );
  }
}

function sendAuthenticatedRequests() {
  if (
    !state.authenticatedWs ||
    state.authenticatedWs.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }

  try {
    state.authenticatedWs.send(
      JSON.stringify({
        active_symbols: "brief",
        req_id: 1001
      })
    );
  } catch {}
}

function handleAuthenticatedMessage(
  data
) {
  if (
    data?.balance?.balance !==
    undefined
  ) {
    const balance =
      safeNumber(
        data.balance.balance,
        null
      );

    if (
      balance !== null &&
      state.account
    ) {
      state.account.balance =
        balance;

      updateAccountUI();
    }
  }

  if (
    data?.authorize
  ) {
    updateAccountUI();
  }

  if (
    data?.error
  ) {
    console.warn(
      "Deriv account channel:",
      data.error
    );
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

  try {
    updateConnectionUI(
      "CONNECTING",
      "LIVE DATA CONNECTING..."
    );

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

        state.reconnectAttempts =
          0;

        updateConnectionUI(
          "ONLINE",
          "LIVE MARKET DATA"
        );

        subscribeToMarkets();

        showToast(
          "Live Deriv market data connected"
        );
      }
    );

    ws.addEventListener(
      "message",
      event => {
        try {
          const data =
            JSON.parse(
              event.data
            );

          handlePublicMessage(
            data
          );
        } catch (error) {
          console.warn(
            "Public WS parse error",
            error
          );
        }
      }
    );

    ws.addEventListener(
      "error",
      error => {
        console.warn(
          "Public WebSocket error",
          error
        );

        updateConnectionUI(
          "FAILED",
          "LIVE DATA ERROR"
        );
      }
    );

    ws.addEventListener(
      "close",
      () => {
        state.publicConnected =
          false;

        updateConnectionUI(
          "OFFLINE",
          "LIVE DATA DISCONNECTED"
        );

        schedulePublicReconnect();
      }
    );
  } catch (error) {
    console.error(
      "Public WebSocket failed:",
      error
    );

    state.publicConnected =
      false;

    updateConnectionUI(
      "FAILED",
      "LIVE DATA FAILED"
    );

    schedulePublicReconnect();
  }
}

function schedulePublicReconnect() {
  clearTimeout(
    state.reconnectTimer
  );

  const delay =
    Math.min(
      30000,
      2000 *
        Math.pow(
          2,
          state.reconnectAttempts
        )
    );

  state.reconnectAttempts++;

  state.reconnectTimer =
    setTimeout(
      connectPublicWebSocket,
      delay
    );
}

function subscribeToMarkets() {
  if (
    !state.publicWs ||
    state.publicWs.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }

  MARKETS.forEach(
    (symbol, index) => {
      try {
        state.publicWs.send(
          JSON.stringify({
            ticks_history:
              symbol,
            count: 100,
            end: "latest",
            style: "ticks",
            subscribe: 1,
            req_id:
              10000 + index
          })
        );
      } catch (error) {
        console.warn(
          "Subscription error",
          symbol,
          error
        );
      }
    }
  );
}

/* =========================================================
   PUBLIC MESSAGE HANDLING
   ========================================================= */

function handlePublicMessage(
  data
) {
  if (
    data?.error
  ) {
    console.warn(
      "Deriv public WS:",
      data.error
    );

    return;
  }

  if (
    data?.history
  ) {
    handleTickHistory(
      data
    );

    return;
  }

  if (
    data?.tick
  ) {
    handleLiveTick(
      data
    );
  }
}

/* =========================================================
   HISTORY TICKS
   ========================================================= */

function handleTickHistory(
  data
) {
  const symbol =
    data?.echo_req?.ticks_history ||
    data?.echo_req?.symbol ||
    data?.subscription?.symbol;

  if (!symbol) {
    return;
  }

  if (
    !state.markets.has(
      symbol
    )
  ) {
    return;
  }

  const market =
    state.markets.get(
      symbol
    );

  const prices =
    Array.isArray(
      data.history?.prices
    )
      ? data.history.prices
      : [];

  const times =
    Array.isArray(
      data.history?.times
    )
      ? data.history.times
      : [];

  prices.forEach(
    (price, index) => {
      processTick(
        symbol,
        price,
        times[index]
      );
    }
  );

  updateAnalysis();
}

/* =========================================================
   LIVE TICK
   ========================================================= */

function handleLiveTick(
  data
) {
  const tick =
    data.tick;

  const symbol =
    tick?.symbol ||
    data?.echo_req?.ticks_history ||
    data?.echo_req?.symbol;

  const quote =
    tick?.quote;

  if (
    !symbol ||
    quote === undefined
  ) {
    return;
  }

  processTick(
    symbol,
    quote,
    tick.epoch
  );

  updateAnalysis();
}

/* =========================================================
   PROCESS TICK
   ========================================================= */

function processTick(
  symbol,
  price,
  epoch
) {
  const market =
    state.markets.get(
      symbol
    );

  if (!market) {
    return;
  }

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

  const digit =
    extractLastDigit(
      numericPrice
    );

  market.previousDigit =
    market.lastDigit;

  market.lastDigit =
    digit;

  market.price =
    numericPrice;

  market.prices.push(
    numericPrice
  );

  market.digits.push(
    digit
  );

  market.ticks.push({
    price: numericPrice,
    digit,
    epoch:
      safeNumber(
        epoch,
        Date.now() / 1000
      )
  });

  if (
    market.prices.length >
    150
  ) {
    market.prices.shift();
  }

  if (
    market.digits.length >
    150
  ) {
    market.digits.shift();
  }

  if (
    market.ticks.length >
    150
  ) {
    market.ticks.shift();
  }

  market.digitCounts =
    Array(10).fill(0);

  market.digits.forEach(
    d => {
      if (
        d >= 0 &&
        d <= 9
      ) {
        market.digitCounts[d]++;
      }
    }
  );

  market.diversity =
    calculateDiversity(
      market.digitCounts
    );

  calculateMarketAnalysis(
    market
  );

  market.updated =
    Date.now();

  if (
    symbol ===
    state.selectedMarket
  ) {
    updatePrediction();
  }
}

/* =========================================================
   LAST DIGIT
   ========================================================= */

function extractLastDigit(
  price
) {
  const text =
    String(price);

  const decimal =
    text.split(".")[1];

  if (decimal) {
    return Number(
      decimal.slice(-1)
    );
  }

  return Number(
    text.slice(-1)
  );
}

/* =========================================================
   DIVERSITY
   ========================================================= */

function calculateDiversity(
  counts
) {
  const total =
    counts.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  if (!total) {
    return 0;
  }

  let entropy = 0;

  counts.forEach(
    count => {
      if (!count) return;

      const p =
        count / total;

      entropy -=
        p *
        Math.log2(p);
    }
  );

  return clamp(
    (entropy / 3.321928) *
      100,
    0,
    100
  );
}

/* =========================================================
   MARKET ANALYSIS
   ========================================================= */

function calculateMarketAnalysis(
  market
) {
  const digits =
    market.digits;

  if (
    digits.length <
    3
  ) {
    market.confidence = 0;
    market.score = 0;
    market.signal = "WAITING";
    market.prediction = null;

    return;
  }

  const total =
    digits.length;

  let maxDigit = 0;
  let maxCount = 0;

  market.digitCounts.forEach(
    (count, digit) => {
      if (
        count >
        maxCount
      ) {
        maxCount =
          count;

        maxDigit =
          digit;
      }
    }
  );

  const frequency =
    (maxCount /
      total) *
    100;

  const recent =
    digits.slice(
      -20
    );

  const recentCounts =
    Array(10).fill(0);

  recent.forEach(
    digit => {
      recentCounts[digit]++;
    }
  );

  let recentBest =
    0;

  let recentBestCount =
    0;

  recentCounts.forEach(
    (count, digit) => {
      if (
        count >
        recentBestCount
      ) {
        recentBestCount =
          count;

        recentBest =
          digit;
      }
    }
  );

  const recentFrequency =
    recent.length
      ? (recentBestCount /
          recent.length) *
        100
      : 0;

  const concentration =
    clamp(
      frequency,
      0,
      100
    );

  const recentConcentration =
    clamp(
      recentFrequency,
      0,
      100
    );

  const confidence =
    clamp(
      35 +
        concentration *
          0.4 +
        recentConcentration *
          0.4 -
        market.diversity *
          0.1,
      0,
      99
    );

  market.confidence =
    confidence;

  market.prediction =
    recentBest;

  market.score =
    clamp(
      confidence +
        recentConcentration *
          0.25,
      0,
      100
    );

  if (
    confidence >=
    75
  ) {
    market.signal =
      "STRONG";
  } else if (
    confidence >=
    60
  ) {
    market.signal =
      "MODERATE";
  } else if (
    confidence >=
    45
  ) {
    market.signal =
      "WEAK";
  } else {
    market.signal =
      "WAITING";
  }

  market.prediction =
    recentBest;
}

/* =========================================================
   BEST MARKET
   ========================================================= */

function getBestMarket() {
  const available =
    Array.from(
      state.markets.values()
    ).filter(
      market =>
        market.digits.length >=
        3
    );

  if (!available.length) {
    return null;
  }

  available.sort(
    (a, b) =>
      b.score -
      a.score
  );

  return available[0];
}

/* =========================================================
   SCAN MARKETS
   ========================================================= */

function scanMarkets() {
  const best =
    getBestMarket();

  if (!best) {
    showToast(
      "Waiting for enough market ticks"
    );

    return;
  }

  state.selectedMarket =
    best.symbol;

  updateManualMarket();

  updateAnalysis();

  showToast(
    `${best.symbol} selected • ${formatPercent(
      best.confidence
    )} confidence`
  );
}

/* =========================================================
   UPDATE MANUAL MARKET
   ========================================================= */

function updateManualMarket() {
  const select =
    $("manualMarket");

  if (select) {
    select.value =
      state.selectedMarket;
  }
}

/* =========================================================
   ANALYSIS UI
   ========================================================= */

function updateAnalysis() {
  const market =
    state.markets.get(
      state.selectedMarket
    );

  if (!market) {
    return;
  }

  setText(
    "activeMarket",
    market.symbol
  );

  setText(
    "activeMarketDisplay",
    market.symbol
  );

  setText(
    "livePrice",
    market.price
      ? market.price
      : "0.00"
  );

  setText(
    "priceDisplay",
    market.price
      ? market.price
      : "0.00"
  );

  setText(
    "tickCount",
    market.ticks.length
  );

  setText(
    "ticksDisplay",
    market.ticks.length
  );

  setText(
    "analysisConfidence",
    formatPercent(
      market.confidence
    )
  );

  setText(
    "aiConfidence",
    formatPercent(
      market.confidence
    )
  );

  setText(
    "marketSignal",
    market.signal
  );

  setText(
    "aiSignal",
    market.signal
  );

  setText(
    "prediction",
    market.prediction ===
      null
      ? "—"
      : market.prediction
  );

  setText(
    "predictedDigit",
    market.prediction ===
      null
      ? "—"
      : market.prediction
  );

  renderDigitGrid(
    market
  );

  renderScanner();

  updatePrediction();
}

function renderDigitGrid(
  market
) {
  const container =
    $("digitGrid") ||
    $("digitDistribution");

  if (!container) {
    return;
  }

  const total =
    market.digits.length;

  container.innerHTML =
    market.digitCounts
      .map(
        (count, digit) => {
          const percent =
            total
              ? (count /
                  total) *
                100
              : 0;

          return `
            <div class="digit-item">
              <div class="digit-number">
                ${digit}
              </div>
              <div class="digit-bar">
                <span style="width:${clamp(
                  percent,
                  0,
                  100
                )}%"></span>
              </div>
              <div class="digit-percent">
                ${percent.toFixed(
                  1
                )}%
              </div>
            </div>
          `;
        }
      )
      .join("");
}

function renderScanner() {
  const container =
    $("scannerList") ||
    $("marketScanner");

  if (!container) {
    return;
  }

  const markets =
    Array.from(
      state.markets.values()
    )
      .sort(
        (a, b) =>
          b.score -
          a.score
      )
      .slice(0, 10);

  container.innerHTML =
    markets
      .map(
        market => `
          <button
            class="scanner-card ${
              market.symbol ===
              state.selectedMarket
                ? "active"
                : ""
            }"
            data-scan-market="${escapeHTML(
              market.symbol
            )}"
          >
            <div>
              <strong>
                ${escapeHTML(
                  market.symbol
                )}
              </strong>
              <small>
                ${
                  market.signal
                }
              </small>
            </div>

            <div class="scanner-score">
              ${formatPercent(
                market.confidence
              )}
            </div>
          </button>
        `
      )
      .join("");

  qsa(
    "[data-scan-market]"
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          state.selectedMarket =
            button.dataset.scanMarket;

          updateManualMarket();

          updateAnalysis();
        }
      );
    }
  );
}

/* =========================================================
   PREDICTION
   ========================================================= */

function updatePrediction() {
  const market =
    state.markets.get(
      state.selectedMarket
    );

  if (!market) {
    return;
  }

  const strategy =
    state.selectedStrategy;

  let prediction =
    market.prediction;

  if (
    strategy ===
      "MATCHES" ||
    strategy ===
      "DIFFERS"
  ) {
    prediction =
      market.prediction;
  }

  setText(
    "predictionStrategy",
    strategy
  );

  setText(
    "predictionDigit",
    prediction ===
      null
      ? "—"
      : prediction
  );

  setText(
    "analysisPrediction",
    prediction ===
      null
      ? "—"
      : prediction
  );
}

/* =========================================================
   CONNECTION UI
   ========================================================= */

function updateConnectionUI(
  status,
  message
) {
  const statusElements =
    qsa(
      "#connectionStatus, .connection-status, [data-connection-status]"
    );

  statusElements.forEach(
    element => {
      element.textContent =
        status;
      element.dataset.status =
        status.toLowerCase();
    }
  );

  setText(
    "connectionMessage",
    message
  );

  setText(
    "connectionText",
    message
  );

  setText(
    "statusText",
    message
  );

  const dot =
    $("connectionDot");

  if (dot) {
    dot.dataset.status =
      status.toLowerCase();
  }
}

/* =========================================================
   ACCOUNT UI
   ========================================================= */

function updateAccountUI() {
  const account =
    state.account;

  if (!account) {
    return;
  }

  const loginId =
    account.loginid ||
    account.account_id ||
    "—";

  const currency =
    account.currency ||
    "USD";

  let balance =
    account.balance;

  if (
    balance ===
      undefined ||
    balance === null
  ) {
    balance =
      state.balance;
  }

  setText(
    "accountId",
    loginId
  );

  setText(
    "accountLogin",
    loginId
  );

  setText(
    "accountCurrency",
    currency
  );

  setText(
    "currencyDisplay",
    currency
  );

  setText(
    "accountBalance",
    formatMoney(
      balance
    )
  );

  setText(
    "derivBalance",
    formatMoney(
      balance
    )
  );

  setText(
    "paperBalance",
    formatMoney(
      state.balance
    )
  );

  updateModeUI();
}

/* =========================================================
   TRADE PAGE
   ========================================================= */

function renderTradePage() {
  updateBotUI();

  updateCircularUI();

  updateManualMarket();

  renderRecentTrades();
}

/* =========================================================
   BOT
   ========================================================= */

function startBot() {
  if (
    state.runningBot
  ) {
    return;
  }

  state.runningBot =
    true;

  setText(
    "botStatus",
    "RUNNING"
  );

  setText(
    "aiBotStatus",
    "RUNNING"
  );

  showToast(
    "AI BOT started"
  );

  runBotCycle();

  state.botTimer =
    setInterval(
      runBotCycle,
      3000
    );
}

function stopBot() {
  state.runningBot =
    false;

  clearInterval(
    state.botTimer
  );

  state.botTimer =
    null;

  setText(
    "botStatus",
    "STOPPED"
  );

  setText(
    "aiBotStatus",
    "STOPPED"
  );

  showToast(
    "AI BOT stopped"
  );
}

function runBotCycle() {
  if (
    !state.runningBot
  ) {
    return;
  }

  if (
    !canContinueTrading()
  ) {
    stopBot();
    return;
  }

  const best =
    getBestMarket();

  if (!best) {
    setText(
      "botStatus",
      "WAITING FOR DATA"
    );

    return;
  }

  const strategy =
    chooseBotStrategy(
      best
    );

  state.selectedMarket =
    best.symbol;

  state.selectedStrategy =
    strategy;

  updateManualMarket();

  const target =
    chooseTargetDigit(
      best
    );

  const stake =
    getCurrentStake();

  if (
    stake <
    MIN_STAKE
  ) {
    return;
  }

  if (
    state.balance <
    stake
  ) {
    showToast(
      "Insufficient paper balance",
      "error"
    );

    stopBot();

    return;
  }

  executePaperTrade({
    engine: "AI BOT",
    market: best.symbol,
    strategy,
    targetDigit: target,
    stake,
    confidence:
      best.confidence
  });
}

function chooseBotStrategy(
  market
) {
  const predicted =
    market.prediction;

  if (
    predicted ===
    null
  ) {
    return "DIFFERS";
  }

  if (
    predicted >= 6
  ) {
    return "MATCHES";
  }

  return "DIFFERS";
}

/* =========================================================
   CIRCULAR AI
   ========================================================= */

function startCircularAI() {
  if (
    state.runningCircular
  ) {
    return;
  }

  state.runningCircular =
    true;

  state.circularCycle =
    0;

  startCircularPhase(
    "ANALYZING",
    10
  );

  showToast(
    "Circular AI started"
  );
}

function stopCircularAI() {
  state.runningCircular =
    false;

  clearTimeout(
    state.circularTimer
  );

  state.circularTimer =
    null;

  state.circularPhase =
    "STOPPED";

  state.circularRemaining =
    0;

  updateCircularUI();

  showToast(
    "Circular AI stopped"
  );
}

function startCircularPhase(
  phase,
  seconds
) {
  if (
    !state.runningCircular
  ) {
    return;
  }

  state.circularPhase =
    phase;

  state.circularRemaining =
    seconds;

  updateCircularUI();

  circularCountdown();
}

function circularCountdown() {
  if (
    !state.runningCircular
  ) {
    return;
  }

  updateCircularUI();

  if (
    state.circularRemaining <=
    0
  ) {
    advanceCircularPhase();

    return;
  }

  state.circularTimer =
    setTimeout(
      () => {
        state.circularRemaining--;

        circularCountdown();
      },
      1000
    );
}

function advanceCircularPhase() {
  if (
    !state.runningCircular
  ) {
    return;
  }

  if (
    state.circularPhase ===
    "ANALYZING"
  ) {
    circularAnalyze();

    startCircularPhase(
      "TRADE WINDOW",
      5
    );

    return;
  }

  if (
    state.circularPhase ===
    "TRADE WINDOW"
  ) {
    startCircularPhase(
      "TRADE NOW",
      3
    );

    return;
  }

  if (
    state.circularPhase ===
    "TRADE NOW"
  ) {
    circularTrade();

    state.circularCycle++;

    startCircularPhase(
      "ANALYZING",
      10
    );
  }
}

function circularAnalyze() {
  const best =
    getBestMarket();

  if (!best) {
    showToast(
      "Circular AI waiting for market data"
    );

    return;
  }

  state.selectedMarket =
    best.symbol;

  updateManualMarket();

  updateAnalysis();

  setText(
    "circularMarket",
    best.symbol
  );

  setText(
    "circularPrediction",
    best.prediction ===
      null
      ? "—"
      : best.prediction
  );

  setText(
    "circularConfidence",
    formatPercent(
      best.confidence
    )
  );

  showToast(
    `Circular AI: ${best.symbol} selected`
  );
}

function circularTrade() {
  if (
    !state.runningCircular
  ) {
    return;
  }

  if (
    !canContinueTrading()
  ) {
    stopCircularAI();
    return;
  }

  const market =
    state.markets.get(
      state.selectedMarket
    );

  if (!market) {
    return;
  }

  if (
    market.digits.length <
    3
  ) {
    return;
  }

  let strategy =
    state.circularStrategy;

  if (
    !STRATEGIES.includes(
      strategy
    )
  ) {
    strategy =
      chooseCircularStrategy(
        market
      );
  }

  const target =
    chooseTargetDigit(
      market
    );

  const stake =
    getCurrentStake();

  executePaperTrade({
    engine:
      "CIRCULAR AI",
    market:
      market.symbol,
    strategy,
    targetDigit:
      target,
    stake,
    confidence:
      market.confidence
  });
}

function chooseCircularStrategy(
  market
) {
  const digit =
    market.prediction;

  if (
    digit ===
    null
  ) {
    return "DIFFERS";
  }

  if (
    digit >= 5
  ) {
    return "OVER";
  }

  return "UNDER";
}

function chooseTargetDigit(
  market
) {
  if (
    market.prediction !==
    null
  ) {
    return market.prediction;
  }

  return Math.floor(
    Math.random() * 10
  );
}

/* =========================================================
   CIRCULAR UI
   ========================================================= */

function updateCircularUI() {
  setText(
    "circularPhase",
    state.circularPhase
  );

  setText(
    "circularTimer",
    state.circularRemaining
  );

  setText(
    "circularCountdown",
    state.circularRemaining
  );

  setText(
    "circularStatus",
    state.runningCircular
      ? state.circularPhase
      : "STOPPED"
  );

  const progress =
    $("circularProgress");

  if (progress) {
    let total = 10;

    if (
      state.circularPhase ===
      "TRADE WINDOW"
    ) {
      total = 5;
    }

    if (
      state.circularPhase ===
      "TRADE NOW"
    ) {
      total = 3;
    }

    const percent =
      total
        ? ((total -
            state.circularRemaining) /
            total) *
          100
        : 0;

    progress.style.width =
      clamp(
        percent,
        0,
        100
      ) + "%";
  }
}

/* =========================================================
   MANUAL TRADE
   ========================================================= */

function executeManualTrade() {
  const market =
    $("manualMarket")?.value ||
    state.selectedMarket;

  const strategy =
    $("manualStrategy")?.value ||
    state.selectedStrategy;

  const target =
    clamp(
      parseInt(
        $(
          "targetDigit"
        )?.value ??
          state.manualTarget,
        10
      ) || 0,
      0,
      9
    );

  const stake =
    Math.max(
      MIN_STAKE,
      safeNumber(
        $(
          "stakeInput"
        )?.value ??
          state.settings.stake,
        MIN_STAKE
      )
    );

  state.selectedMarket =
    market;

  state.selectedStrategy =
    strategy;

  state.manualTarget =
    target;

  state.settings.stake =
    stake;

  saveStorage();

  executePaperTrade({
    engine: "MANUAL",
    market,
    strategy,
    targetDigit:
      target,
    stake
  });
}

/* =========================================================
   PAPER TRADE
   ========================================================= */

function executePaperTrade({
  engine,
  market,
  strategy,
  targetDigit = 0,
  stake,
  confidence = 0
}) {
  stake =
    Math.max(
      MIN_STAKE,
      safeNumber(
        stake,
        MIN_STAKE
      )
    );

  if (
    state.balance <
    stake
  ) {
    showToast(
      "Insufficient paper balance",
      "error"
    );

    return null;
  }

  const marketState =
    state.markets.get(
      market
    );

  if (!marketState) {
    showToast(
      "Market data unavailable",
      "error"
    );

    return null;
  }

  if (
    marketState.lastDigit ===
    null
  ) {
    showToast(
      "Waiting for market tick",
      "error"
    );

    return null;
  }

  const entryDigit =
    marketState.lastDigit;

  const won =
    evaluateStrategy(
      strategy,
      entryDigit,
      targetDigit
    );

  const payout =
    safeNumber(
      PAYOUT[strategy],
      0.95
    );

  const profit =
    won
      ? round2(
          stake *
          payout
        )
      : -round2(
          stake
        );

  state.balance =
    round2(
      state.balance +
        profit
    );

  const trade = {
    id: randomId("trade"),

    time:
      new Date().toISOString(),

    engine,

    market,

    strategy,

    targetDigit,

    entryDigit,

    stake,

    payout,

    profit,

    result:
      won
        ? "WIN"
        : "LOSS",

    confidence:
      safeNumber(
        confidence,
        marketState.confidence
      )
  };

  state.history.unshift(
    trade
  );

  if (
    state.history.length >
    500
  ) {
    state.history =
      state.history.slice(
        0,
        500
      );
  }

  if (won) {
    state.martingaleLevel =
      0;
  } else {
    state.martingaleLevel++;
  }

  calculateStats();

  saveStorage();

  renderRecentTrades();

  renderHistory();

  renderHistoryStats();

  updateBalanceUI();

  checkSessionLimits();

  showToast(
    `${engine}: ${
      won
        ? "WIN"
        : "LOSS"
    } ${formatMoney(
      Math.abs(
        profit
      )
    )}`,
    won
      ? "success"
      : "error"
  );

  return trade;
}

/* =========================================================
   STRATEGY EVALUATION
   ========================================================= */

function evaluateStrategy(
  strategy,
  digit,
  target
) {
  switch (
    strategy
  ) {
    case "MATCHES":
      return (
        digit ===
        target
      );

    case "DIFFERS":
      return (
        digit !==
        target
      );

    case "OVER":
      return (
        digit >
        4
      );

    case "UNDER":
      return (
        digit <
        5
      );

    case "EVEN":
      return (
        digit % 2 ===
        0
      );

    case "ODD":
      return (
        digit % 2 !==
        0
      );

    default:
      return false;
  }
}

/* =========================================================
   CURRENT STAKE
   ========================================================= */

function getCurrentStake() {
  const base =
    Math.max(
      MIN_STAKE,
      safeNumber(
        state.settings.stake,
        MIN_STAKE
      )
    );

  const multiplier =
    Math.max(
      1,
      safeNumber(
        state.settings.martingale,
        2
      )
    );

  const level =
    Math.max(
      0,
      state.martingaleLevel
    );

  return round2(
    base *
      Math.pow(
        multiplier,
        level
      )
  );
}

/* =========================================================
   TAKE PROFIT / STOP LOSS
   ========================================================= */

function calculateStats() {
  let wins = 0;
  let losses = 0;
  let profit = 0;

  state.history.forEach(
    trade => {
      if (
        trade.result ===
        "WIN"
      ) {
        wins++;
      }

      if (
        trade.result ===
        "LOSS"
      ) {
        losses++;
      }

      profit +=
        safeNumber(
          trade.profit
        );
    }
  );

  state.stats = {
    wins,
    losses,
    profit:
      round2(profit)
  };
}

function checkSessionLimits() {
  const tp =
    safeNumber(
      state.settings.takeProfit,
      0
    );

  const sl =
    safeNumber(
      state.settings.stopLoss,
      0
    );

  const profit =
    state.stats.profit;

  if (
    tp > 0 &&
    profit >= tp
  ) {
    stopBot();
    stopCircularAI();

    showToast(
      "Take profit reached"
    );

    return;
  }

  if (
    sl > 0 &&
    profit <=
      -Math.abs(sl)
  ) {
    stopBot();
    stopCircularAI();

    showToast(
      "Stop loss reached",
      "error"
    );
  }
}

/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {
  const container =
    $("historyList") ||
    $("tradeHistory") ||
    $("allTrades");

  if (!container) {
    return;
  }

  if (
    !state.history.length
  ) {
    container.innerHTML = `
      <div class="empty-state">
        <div>📊</div>
        <strong>No trades yet</strong>
        <p>
          Paper trades will appear here.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.history
      .map(
        trade => {
          const resultClass =
            trade.result ===
            "WIN"
              ? "win"
              : "loss";

          const sign =
            trade.profit >=
            0
              ? "+"
              : "";

          return `
            <div class="history-row ${resultClass}">
              <div class="history-main">
                <strong>
                  ${escapeHTML(
                    trade.market
                  )}
                </strong>

                <small>
                  ${escapeHTML(
                    trade.engine
                  )}
                  •
                  ${escapeHTML(
                    trade.strategy
                  )}
                </small>
              </div>

              <div class="history-middle">
                <span>
                  Digit:
                  ${
                    trade.entryDigit
                  }
                </span>

                <small>
                  Stake:
                  ${formatMoney(
                    trade.stake
                  )}
                </small>
              </div>

              <div class="history-result">
                <strong>
                  ${
                    trade.result
                  }
                </strong>

                <span>
                  ${sign}${formatMoney(
                    trade.profit
                  )}
                </span>
              </div>
            </div>
          `;
        }
      )
      .join("");
}

function renderRecentTrades() {
  const container =
    $("recentTrades") ||
    $("recentTradeList");

  if (!container) {
    return;
  }

  const recent =
    state.history.slice(
      0,
      5
    );

  if (!recent.length) {
    container.innerHTML = `
      <div class="empty-state">
        No recent paper trades.
      </div>
    `;

    return;
  }

  container.innerHTML =
    recent
      .map(
        trade => `
          <div class="recent-trade-row">
            <div>
              <strong>
                ${escapeHTML(
                  trade.market
                )}
              </strong>
              <small>
                ${escapeHTML(
                  trade.strategy
                )}
              </small>
            </div>

            <span class="${
              trade.result ===
              "WIN"
                ? "trade-win"
                : "trade-loss"
            }">
              ${
                trade.result
              }
              ${
                trade.profit >=
                0
                  ? "+"
                  : ""
              }${formatMoney(
                trade.profit
              )}
            </span>
          </div>
        `
      )
      .join("");
}

function renderHistoryStats() {
  calculateStats();

  const total =
    state.history.length;

  const winRate =
    total
      ? (state.stats.wins /
          total) *
        100
      : 0;

  setText(
    "totalTrades",
    total
  );

  setText(
    "wins",
    state.stats.wins
  );

  setText(
    "losses",
    state.stats.losses
  );

  setText(
    "netProfit",
    formatMoney(
      state.stats.profit
    )
  );

  setText(
    "winRate",
    formatPercent(
      winRate
    )
  );

  setText(
    "historyBalance",
    formatMoney(
      state.balance
    )
  );

  setText(
    "paperBalance",
    formatMoney(
      state.balance
    )
  );
}

function clearTradeHistory() {
  const confirmed =
    window.confirm(
      "Clear all paper trade history and reset the paper balance to $1000?"
    );

  if (!confirmed) {
    return;
  }

  state.history =
    [];

  state.balance =
    STARTING_BALANCE;

  state.martingaleLevel =
    0;

  calculateStats();

  saveStorage();

  renderHistory();

  renderHistoryStats();

  updateBalanceUI();

  showToast(
    "Paper history cleared"
  );
}

/* =========================================================
   BALANCE
   ========================================================= */

function updateBalanceUI() {
  setText(
    "paperBalance",
    formatMoney(
      state.balance
    )
  );

  setText(
    "paperBalanceDisplay",
    formatMoney(
      state.balance
    )
  );

  setText(
    "balanceDisplay",
    formatMoney(
      state.balance
    )
  );
}

/* =========================================================
   BOT UI
   ========================================================= */

function updateBotUI() {
  setText(
    "botStatus",
    state.runningBot
      ? "RUNNING"
      : "STOPPED"
  );

  setText(
    "aiBotStatus",
    state.runningBot
      ? "RUNNING"
      : "STOPPED"
  );

  setText(
    "botMarket",
    state.selectedMarket
  );

  setText(
    "botStrategy",
    state.selectedStrategy
  );
}

/* =========================================================
   ALL UI
   ========================================================= */

function updateAllUI() {
  updateAccountUI();

  updateBalanceUI();

  updateModeUI();

  updateAnalysis();

  updateBotUI();

  updateCircularUI();

  renderHistory();

  renderHistoryStats();

  renderRecentTrades();
}

/* =========================================================
   SET TEXT
   ========================================================= */

function setText(
  id,
  value
) {
  const element =
    $(id);

  if (element) {
    element.textContent =
      value ?? "";
  }
}

/* =========================================================
   CONNECTION BUTTON STATE
   ========================================================= */

function updateConnectButton() {
  const button =
    $("connectDeriv");

  if (!button) {
    return;
  }

  if (
    state.sessionId &&
    state.account
  ) {
    button.textContent =
      "DERIV CONNECTED";
  } else {
    button.textContent =
      "CONNECT DERIV";
  }
}

/* =========================================================
   KEYBOARD
   ========================================================= */

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Escape"
    ) {
      closeRealConfirmation();
    }

    if (
      event.key === "1"
    ) {
      updatePage(
        "analysisPage"
      );
    }

    if (
      event.key === "2"
    ) {
      updatePage(
        "tradePage"
      );
    }

    if (
      event.key === "3"
    ) {
      updatePage(
        "historyPage"
      );
    }
  }
);

/* =========================================================
   VISIBILITY
   ========================================================= */

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      document.visibilityState ===
      "visible"
    ) {
      if (
        !state.publicWs ||
        state.publicWs.readyState !==
          WebSocket.OPEN
      ) {
        connectPublicWebSocket();
      }
    }
  }
);

/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "beforeunload",
  () => {
    clearTimeout(
      state.reconnectTimer
    );

    clearTimeout(
      state.circularTimer
    );

    clearInterval(
      state.botTimer
    );

    try {
      if (
        state.publicWs
      ) {
        state.publicWs.close();
      }
    } catch {}

    try {
      if (
        state.authenticatedWs
      ) {
        state.authenticatedWs.close();
      }
    } catch {}
  }
);

/* =========================================================
   PERIODIC UI REFRESH
   ========================================================= */

setInterval(
  () => {
    updateAnalysis();

    updateBalanceUI();

    updateBotUI();

    updateCircularUI();

    if (
      state.page ===
      "historyPage"
    ) {
      renderHistoryStats();
    }
  },
  1000
);

/* =========================================================
   INITIAL CONNECTION BUTTON UPDATE
   ========================================================= */

setTimeout(
  updateConnectButton,
  500
);

/* =========================================================
   FINAL
   ========================================================= */

console.log(
  "KRISHWAVE AI BEAST V7.3 app.js loaded successfully."
);