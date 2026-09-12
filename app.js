/* =========================================================
   KRISHWAVE AI BEAST V7.1
   DERIV DEMO / REAL TRADING ENGINE
   ---------------------------------------------------------
   NO PAPER TRADING
   - Live Deriv market data
   - Authenticated Deriv trading
   - Proposal -> Buy -> Contract monitoring
   - DEMO / REAL mode confirmation
   - AI BOT
   - CIRCULAR AI
   - MANUAL TRADING
   - Local trade history of REAL Deriv results
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const CONFIG = {
  CLIENT_ID: "34khasPjsT0PCRR8X3Z70",

  REDIRECT_URI:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/",

  CLOUD_API:
    "https://krishwave2.chrispusatale99.workers.dev",

  PUBLIC_WS:
    "wss://api.derivws.com/trading/v1/options/ws/public",

  HISTORY_KEY:
    "krishwave_deriv_trade_history_v1",

  THEME_KEY:
    "krishwave_theme",

  DEFAULT_MARKET:
    "R_100",

  MAX_TICKS:
    250,

  ANALYSIS_TICKS:
    80,

  CYCLE_ANALYSIS_SECONDS:
    10,

  CYCLE_PREDICTION_SECONDS:
    5,

  CYCLE_TRADE_SECONDS:
    3,

  CYCLE_COOLDOWN_SECONDS:
    3
};


/* =========================================================
   MARKETS
   ========================================================= */

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


/* =========================================================
   STRATEGIES
   ========================================================= */

const STRATEGIES = [
  "MATCHES",
  "DIFFERS",
  "OVER",
  "UNDER",
  "EVEN",
  "ODD"
];


/* =========================================================
   APPLICATION STATE
   ========================================================= */

const state = {

  /* UI */
  currentPage: "analysis",
  currentTradeTab: "bot",

  /* Theme */
  lightMode: false,

  /* Connection */
  connectedToDeriv: false,
  publicSocket: null,
  authenticatedSocket: null,

  publicConnected: false,
  authenticatedConnected: false,

  reconnectTimer: null,

  /* OAuth/session */
  sessionToken: null,
  accountId: null,
  currency: "USD",
  derivBalance: 0,

  /* DEMO / REAL */
  tradingMode: "DEMO",
  realModeConfirmed: false,

  /* Market */
  selectedAnalysisMarket: CONFIG.DEFAULT_MARKET,

  ticks: {},

  prices: {},

  pipSizes: {},

  lastDigits: {},

  /* Analysis */
  analysis: {},

  scanner: [],

  /* Trading */
  botRunning: false,
  circularRunning: false,
  manualBusy: false,

  botTimer: null,
  circularTimer: null,

  botStrategyMode: "AUTO",

  botStrategies: [
    "MATCHES",
    "DIFFERS"
  ],

  circularStrategy: "AUTO",

  manualStrategy: "MATCHES",

  botStake: 1,
  circularStake: 1,
  manualStake: 1,

  botMartingale: 1,

  botCurrentStake: 1,

  /* Risk */
  botTakeProfit: 20,
  botStopLoss: 20,

  circularTakeProfit: 20,
  circularStopLoss: 20,

  manualTakeProfit: 20,
  manualStopLoss: 20,

  sessionProfit: 0,

  /* Deriv contracts */
  activeContracts: {},

  proposalRequests: {},

  requestId: 1000,

  /* History */
  history: [],

  stats: {
    total: 0,
    wins: 0,
    losses: 0,
    stake: 0,
    payout: 0,
    profit: 0
  },

  /* Circular AI */
  circularPhase: "IDLE",

  circularSeconds: 0,

  circularPrediction: null,

  circularStrategyDecision: null,

  circularLastTradeTick: null,

  /* Toast */
  toastTimer: null
};


/* =========================================================
   DOM
   ========================================================= */

const DOM = {};


function cacheDOM() {

  const ids = [
    "connectionDot",
    "connectionText",
    "modeBadge",
    "themeToggle",

    "accountId",
    "balanceDisplay",
    "currency",
    "connectDerivBtn",

    "dataStatus",

    "analysisPage",
    "analysisMarketSelect",
    "currentChartMarket",
    "currentLivePrice",
    "priceChartCanvas",
    "digitSampleCount",
    "lastDigit",
    "analysisConfidence",

    "aiStatus",
    "aiCircle",
    "aiCircleLabel",
    "aiCirclePrediction",
    "aiPrediction",
    "aiType",
    "analysisMsg",

    "aiMarket",
    "digitStatsGrid",

    "aiCircleStatus",
    "cycleAnalysis",
    "cycleTrade",
    "aiCircleTimer",
    "cycleCooldown",

    "startAI",
    "stopAI",

    "tradePage",

    "tabAiBot",
    "tabCircularAI",
    "tabManual",

    "aiBotPanel",
    "circularPanel",
    "manualPanel",

    "botStatusDash",
    "botSelectedMarket",
    "botScore",
    "aiPredictionLarge",
    "predictionConfidence",

    "botMarketSelect",
    "botStrategyTrigger",
    "botStrategyLabel",

    "stakeInput",
    "takeProfitInput",
    "stopLossInput",
    "martingaleInput",

    "startBotBtn",

    "circularStatusText",
    "circularMarketSelect",
    "circularStrategyTrigger",
    "circularStrategyLabel",

    "circularStakeInput",
    "circularTakeProfitInput",
    "circularStopLossInput",

    "startCircularTradeBtn",

    "manualStatusText",
    "manualMarketSelect",
    "manualStrategyTrigger",
    "manualSelectedStrategyLabel",

    "targetDigitContainer",
    "manualTargetDigitInput",

    "manualStakeInput",
    "manualTakeProfitInput",
    "manualStopLossInput",

    "placeTradeBtn",

    "paperTotal",
    "paperWins",
    "paperLosses",
    "paperAccuracy",

    "activeTradeCount",
    "activeTradesList",

    "historyPage",
    "clearLogsBtn",
    "historyTotalStake",
    "historyAmountWon",
    "historyNetProfit",

    "tradingStatusLabel",
    "sessionProfitDisplay",
    "totalProfitDisplay",

    "stopTradingBtn",

    "historyCardsList",

    "strategyModal",
    "closeStrategyModal",
    "strategyOptions",

    "botStrategyModal",
    "closeBotStrategyModal",
    "applyBotStrategies",

    "realConfirmModal",
    "cancelRealBtn",
    "confirmRealBtn",

    "toast",
    "toastMessage"
  ];

  ids.forEach(id => {
    DOM[id] = document.getElementById(id);
  });

}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", init);


function init() {

  cacheDOM();

  loadTheme();

  loadHistory();

  populateMarketSelectors();

  setupNavigation();

  setupTradeTabs();

  setupTheme();

  setupStrategyModals();

  setupTradingButtons();

  setupRiskInputs();

  setupModeControl();

  updateStrategyVisibility();

  updateAllUI();

  drawChart();

  connectPublicMarket();

  handleOAuthCallback();

  restoreCloudSession();

  window.addEventListener("resize", drawChart);

  setInterval(() => {

    updateAnalysis();

    updateChart();

  }, 1000);

}


/* =========================================================
   THEME
   ========================================================= */

function loadTheme() {

  const saved = localStorage.getItem(CONFIG.THEME_KEY);

  if (saved === "light") {

    state.lightMode = true;

    document.body.classList.add("light");

    if (DOM.themeToggle) {
      DOM.themeToggle.textContent = "🌙";
    }

  } else {

    state.lightMode = false;

    document.body.classList.remove("light");

    if (DOM.themeToggle) {
      DOM.themeToggle.textContent = "☀️";
    }
  }
}


function setupTheme() {

  if (!DOM.themeToggle) return;

  DOM.themeToggle.addEventListener("click", () => {

    state.lightMode = !state.lightMode;

    document.body.classList.toggle(
      "light",
      state.lightMode
    );

    localStorage.setItem(
      CONFIG.THEME_KEY,
      state.lightMode ? "light" : "dark"
    );

    DOM.themeToggle.textContent =
      state.lightMode ? "🌙" : "☀️";

    drawChart();

  });
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  document.querySelectorAll(".nav-item").forEach(btn => {

    btn.addEventListener("click", () => {

      const page = btn.dataset.page;

      if (!page) return;

      showPage(page);

    });

  });

}


function showPage(page) {

  state.currentPage = page;

  document.querySelectorAll(".page").forEach(section => {
    section.classList.remove("active");
  });

  const target = document.getElementById(
    `${page}Page`
  );

  if (target) {
    target.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach(btn => {

    btn.classList.toggle(
      "active",
      btn.dataset.page === page
    );

  });

}


/* =========================================================
   TRADE TABS
   ========================================================= */

function setupTradeTabs() {

  if (DOM.tabAiBot) {

    DOM.tabAiBot.addEventListener(
      "click",
      () => switchTradeTab("bot")
    );

  }

  if (DOM.tabCircularAI) {

    DOM.tabCircularAI.addEventListener(
      "click",
      () => switchTradeTab("circular")
    );

  }

  if (DOM.tabManual) {

    DOM.tabManual.addEventListener(
      "click",
      () => switchTradeTab("manual")
    );

  }

}


function switchTradeTab(tab) {

  state.currentTradeTab = tab;

  const panels = {
    bot: DOM.aiBotPanel,
    circular: DOM.circularPanel,
    manual: DOM.manualPanel
  };

  const tabs = {
    bot: DOM.tabAiBot,
    circular: DOM.tabCircularAI,
    manual: DOM.tabManual
  };

  Object.values(panels).forEach(panel => {

    if (panel) {
      panel.classList.remove("active");
    }

  });

  Object.values(tabs).forEach(button => {

    if (button) {
      button.classList.remove("active");
    }

  });

  if (panels[tab]) {
    panels[tab].classList.add("active");
  }

  if (tabs[tab]) {
    tabs[tab].classList.add("active");
  }

}


/* =========================================================
   MARKET SELECTORS
   ========================================================= */

function populateMarketSelectors() {

  const selectors = [
    DOM.analysisMarketSelect,
    DOM.botMarketSelect,
    DOM.circularMarketSelect,
    DOM.manualMarketSelect
  ];

  selectors.forEach(select => {

    if (!select) return;

    select.innerHTML = "";

    MARKETS.forEach(symbol => {

      const option =
        document.createElement("option");

      option.value = symbol;
      option.textContent = symbol;

      select.appendChild(option);

    });

  });

  if (DOM.analysisMarketSelect) {
    DOM.analysisMarketSelect.value =
      state.selectedAnalysisMarket;
  }

  if (DOM.botMarketSelect) {
    DOM.botMarketSelect.value =
      CONFIG.DEFAULT_MARKET;
  }

  if (DOM.circularMarketSelect) {
    DOM.circularMarketSelect.value =
      CONFIG.DEFAULT_MARKET;
  }

  if (DOM.manualMarketSelect) {
    DOM.manualMarketSelect.value =
      CONFIG.DEFAULT_MARKET;
  }

  if (DOM.analysisMarketSelect) {

    DOM.analysisMarketSelect.addEventListener(
      "change",
      e => {

        state.selectedAnalysisMarket =
          e.target.value;

        updateAnalysis();

        drawChart();

      }
    );

  }

}


/* =========================================================
   STRATEGY MODALS
   ========================================================= */

function setupStrategyModals() {

  /* Normal strategy */

  if (DOM.strategyModal) {

    document.querySelectorAll(
      "#strategyOptions button"
    ).forEach(btn => {

      btn.addEventListener("click", () => {

        const strategy =
          btn.dataset.strategy;

        if (!strategy) return;

        state.manualStrategy = strategy;

        if (DOM.manualSelectedStrategyLabel) {
          DOM.manualSelectedStrategyLabel.textContent =
            strategy;
        }

        closeModal(DOM.strategyModal);

        updateStrategyVisibility();

      });

    });

  }


  if (DOM.manualStrategyTrigger) {

    DOM.manualStrategyTrigger.addEventListener(
      "click",
      () => openModal(DOM.strategyModal)
    );

  }


  if (DOM.closeStrategyModal) {

    DOM.closeStrategyModal.addEventListener(
      "click",
      () => closeModal(DOM.strategyModal)
    );

  }


  /* AI bot strategies */

  if (DOM.botStrategyTrigger) {

    DOM.botStrategyTrigger.addEventListener(
      "click",
      () => {

        syncBotStrategyChecks();

        openModal(DOM.botStrategyModal);

      }
    );

  }


  if (DOM.closeBotStrategyModal) {

    DOM.closeBotStrategyModal.addEventListener(
      "click",
      () => closeModal(DOM.botStrategyModal)
    );

  }


  if (DOM.applyBotStrategies) {

    DOM.applyBotStrategies.addEventListener(
      "click",
      applyBotStrategies
    );

  }


  /* Circular strategy */

  if (DOM.circularStrategyTrigger) {

    DOM.circularStrategyTrigger.addEventListener(
      "click",
      () => {

        openStrategyForCircular();

      }
    );

  }


  /* Clicking outside modal */

  document.querySelectorAll(".modal").forEach(modal => {

    modal.addEventListener("click", e => {

      if (e.target === modal) {
        closeModal(modal);
      }

    });

  });

}


function openStrategyForCircular() {

  if (!DOM.strategyOptions) return;

  DOM.strategyOptions
    .querySelectorAll("button")
    .forEach(btn => {

      btn.onclick = () => {

        const strategy =
          btn.dataset.strategy;

        state.circularStrategy = strategy;

        if (DOM.circularStrategyLabel) {
          DOM.circularStrategyLabel.textContent =
            strategy;
        }

        closeModal(DOM.strategyModal);

      };

    });

  openModal(DOM.strategyModal);

}


function applyBotStrategies() {

  const selected = [];

  document.querySelectorAll(
    ".bot-strategy-check:checked"
  ).forEach(input => {

    selected.push(input.value);

  });

  if (!selected.length) {

    showToast(
      "Select at least one AI BOT strategy."
    );

    return;

  }

  state.botStrategies = selected;

  state.botStrategyMode =
    selected.length === STRATEGIES.length
      ? "AUTO"
      : selected.join(" + ");

  if (DOM.botStrategyLabel) {

    DOM.botStrategyLabel.textContent =
      state.botStrategyMode;

  }

  closeModal(DOM.botStrategyModal);

}


function syncBotStrategyChecks() {

  document.querySelectorAll(
    ".bot-strategy-check"
  ).forEach(input => {

    input.checked =
      state.botStrategies.includes(
        input.value
      );

  });

}


function openModal(modal) {

  if (modal) {
    modal.classList.add("show");
  }

}


function closeModal(modal) {

  if (modal) {
    modal.classList.remove("show");
  }

}


/* =========================================================
   MODE CONTROL
   ========================================================= */

function setupModeControl() {

  /*
    The existing HTML uses #modeBadge.
    Tapping DEMO/REAL switches the requested mode.
  */

  if (!DOM.modeBadge) return;

  DOM.modeBadge.style.cursor = "pointer";

  DOM.modeBadge.title =
    "Tap to switch DEMO / REAL";

  DOM.modeBadge.addEventListener(
    "click",
    requestModeSwitch
  );

}


function requestModeSwitch() {

  if (state.tradingMode === "DEMO") {

    if (DOM.realConfirmModal) {
      openModal(DOM.realConfirmModal);
      return;
    }

    activateRealMode();

  } else {

    activateDemoMode();

  }

}


function activateDemoMode() {

  state.tradingMode = "DEMO";
  state.realModeConfirmed = false;

  updateModeUI();

  showToast("DEMO mode selected.");

}


function activateRealMode() {

  if (!state.connectedToDeriv) {

    showToast(
      "Connect your Deriv account first."
    );

    return;

  }

  state.tradingMode = "REAL";
  state.realModeConfirmed = true;

  closeModal(DOM.realConfirmModal);

  updateModeUI();

  showToast(
    "REAL mode selected. Trade carefully."
  );

}


function setupRealConfirmation() {

  if (DOM.cancelRealBtn) {

    DOM.cancelRealBtn.addEventListener(
      "click",
      () => {

        closeModal(
          DOM.realConfirmModal
        );

      }
    );

  }


  if (DOM.confirmRealBtn) {

    DOM.confirmRealBtn.addEventListener(
      "click",
      activateRealMode
    );

  }

}


/* =========================================================
   CONNECT BUTTON
   ========================================================= */

function setupTradingButtons() {

  setupRealConfirmation();

  if (DOM.connectDerivBtn) {

    DOM.connectDerivBtn.addEventListener(
      "click",
      startDerivLogin
    );

  }


  if (DOM.startBotBtn) {

    DOM.startBotBtn.addEventListener(
      toggleBot
    );

  }


  if (DOM.startAI) {

    DOM.startAI.addEventListener(
      toggleCircularAI
    );

  }


  if (DOM.stopAI) {

    DOM.stopAI.addEventListener(
      stopCircularAI
    );

  }


  if (DOM.startCircularTradeBtn) {

    DOM.startCircularTradeBtn.addEventListener(
      toggleCircularTrading
    );

  }


  if (DOM.placeTradeBtn) {

    DOM.placeTradeBtn.addEventListener(
      placeManualTrade
    );

  }


  if (DOM.stopTradingBtn) {

    DOM.stopTradingBtn.addEventListener(
      stopAllTrading
    );

  }


  if (DOM.clearLogsBtn) {

    DOM.clearLogsBtn.addEventListener(
      clearHistory
    );

  }

}


/* =========================================================
   RISK INPUTS
   ========================================================= */

function setupRiskInputs() {

  const bind = (
    element,
    callback
  ) => {

    if (!element) return;

    element.addEventListener(
      "change",
      callback
    );

  };


  bind(
    DOM.stakeInput,
    () => {
      state.botStake =
        safeNumber(DOM.stakeInput.value, 1);
      state.botCurrentStake =
        state.botStake;
    }
  );


  bind(
    DOM.takeProfitInput,
    () => {
      state.botTakeProfit =
        safeNumber(
          DOM.takeProfitInput.value,
          20
        );
    }
  );


  bind(
    DOM.stopLossInput,
    () => {
      state.botStopLoss =
        safeNumber(
          DOM.stopLossInput.value,
          20
        );
    }
  );


  bind(
    DOM.martingaleInput,
    () => {
      state.botMartingale =
        Math.max(
          1,
          safeNumber(
            DOM.martingaleInput.value,
            1
          )
        );
    }
  );


  bind(
    DOM.circularStakeInput,
    () => {
      state.circularStake =
        safeNumber(
          DOM.circularStakeInput.value,
          1
        );
    }
  );


  bind(
    DOM.circularTakeProfitInput,
    () => {
      state.circularTakeProfit =
        safeNumber(
          DOM.circularTakeProfitInput.value,
          20
        );
    }
  );


  bind(
    DOM.circularStopLossInput,
    () => {
      state.circularStopLoss =
        safeNumber(
          DOM.circularStopLossInput.value,
          20
        );
    }
  );


  bind(
    DOM.manualStakeInput,
    () => {
      state.manualStake =
        safeNumber(
          DOM.manualStakeInput.value,
          1
        );
    }
  );


  bind(
    DOM.manualTakeProfitInput,
    () => {
      state.manualTakeProfit =
        safeNumber(
          DOM.manualTakeProfitInput.value,
          20
        );
    }
  );


  bind(
    DOM.manualStopLossInput,
    () => {
      state.manualStopLoss =
        safeNumber(
          DOM.manualStopLossInput.value,
          20
        );
    }
  );


  if (DOM.manualTargetDigitInput) {

    DOM.manualTargetDigitInput.addEventListener(
      "input",
      () => {

        let value =
          parseInt(
            DOM.manualTargetDigitInput.value,
            10
          );

        if (!Number.isFinite(value)) {
          value = 5;
        }

        value =
          Math.max(
            0,
            Math.min(9, value)
          );

        DOM.manualTargetDigitInput.value =
          value;

      }
    );

  }

}


/* =========================================================
   STRATEGY VISIBILITY
   ========================================================= */

function updateStrategyVisibility() {

  if (!DOM.targetDigitContainer) {
    return;
  }

  const visible =
    state.manualStrategy === "MATCHES" ||
    state.manualStrategy === "DIFFERS";

  DOM.targetDigitContainer.style.display =
    visible ? "block" : "none";

}


/* =========================================================
   DERIV LOGIN
   ========================================================= */

function startDerivLogin() {

  /*
    PKCE OAuth login.
  */

  const verifier =
    generateCodeVerifier();

  const challenge =
    generateCodeChallenge(verifier);

  sessionStorage.setItem(
    "krishwave_pkce_verifier",
    verifier
  );

  const params =
    new URLSearchParams({

      app_id:
        CONFIG.CLIENT_ID,

      redirect_uri:
        CONFIG.REDIRECT_URI,

      response_type:
        "code",

      code_challenge:
        challenge,

      code_challenge_method:
        "S256",

      scope:
        "trade"

    });

  const url =
    "https://auth.deriv.com/oauth2/authorize?" +
    params.toString();

  window.location.href = url;

}


/* =========================================================
   PKCE
   ========================================================= */

function generateCodeVerifier() {

  const array =
    new Uint8Array(32);

  crypto.getRandomValues(array);

  return base64UrlEncode(array);

}


async function generateCodeChallenge(verifier) {

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


function base64UrlEncode(buffer) {

  let binary = "";

  buffer.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

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

  if (!code) return;

  const verifier =
    sessionStorage.getItem(
      "krishwave_pkce_verifier"
    );

  if (!verifier) {

    showToast(
      "OAuth verification data missing."
    );

    return;

  }

  setStatus(
    "Completing Deriv authentication..."
  );

  try {

    const response =
      await fetch(
        `${CONFIG.CLOUD_API}/api/oauth/exchange`,
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
              CONFIG.REDIRECT_URI,

            client_id:
              CONFIG.CLIENT_ID

          })
        }
      );

    if (!response.ok) {
      throw new Error(
        `OAuth exchange failed (${response.status})`
      );
    }

    const data =
      await response.json();

    if (data.token) {

      state.sessionToken =
        data.token;

    }

    if (data.sessionToken) {

      state.sessionToken =
        data.sessionToken;

    }

    sessionStorage.setItem(
      "krishwave_session",
      JSON.stringify(data)
    );

    window.history.replaceState(
      {},
      document.title,
      CONFIG.REDIRECT_URI
    );

    showToast(
      "Deriv account connected."
    );

    await restoreCloudSession();

  } catch (error) {

    console.error(
      "OAuth error:",
      error
    );

    showToast(
      "Deriv login failed. Check your OAuth Worker."
    );

  }

}


/* =========================================================
   RESTORE CLOUD SESSION
   ========================================================= */

async function restoreCloudSession() {

  try {

    const response =
      await fetch(
        `${CONFIG.CLOUD_API}/api/session`,
        {
          method: "GET",
          credentials: "include"
        }
      );

    if (!response.ok) {
      return;
    }

    const data =
      await response.json();

    const account =
      data.account ||
      data;

    state.accountId =
      account.accountId ||
      account.loginid ||
      account.login_id ||
      data.accountId ||
      null;

    state.currency =
      account.currency ||
      data.currency ||
      "USD";

    if (
      account.balance !== undefined
    ) {

      state.derivBalance =
        Number(account.balance) || 0;

    }

    if (
      data.token ||
      data.sessionToken
    ) {

      state.sessionToken =
        data.token ||
        data.sessionToken;

    }

    if (state.accountId) {

      state.connectedToDeriv =
        true;

      updateAccountUI();

      await requestAuthenticatedWS();

      showToast(
        "DERIV ACCOUNT CONNECTED"
      );

    }

  } catch (error) {

    console.warn(
      "No cloud session:",
      error
    );

  }

}


/* =========================================================
   AUTHENTICATED WS
   ========================================================= */

async function requestAuthenticatedWS() {

  if (!state.accountId) {

    showToast(
      "No Deriv account ID found."
    );

    return;

  }

  try {

    const url =
      `${CONFIG.CLOUD_API}/api/otp?accountId=` +
      encodeURIComponent(
        state.accountId
      );

    const response =
      await fetch(
        url,
        {
          method: "GET",
          credentials: "include"
        }
      );

    if (!response.ok) {

      throw new Error(
        `OTP request failed (${response.status})`
      );

    }

    const data =
      await response.json();

    const wsUrl =
      data.wsUrl ||
      data.websocket ||
      data.url;

    if (!wsUrl) {

      throw new Error(
        "Worker did not return a WebSocket URL."
      );

    }

    connectAuthenticatedWS(wsUrl);

  } catch (error) {

    console.error(
      "Authenticated WS:",
      error
    );

    setStatus(
      "Deriv account connected, but trading socket could not start."
    );

  }

}


/* =========================================================
   AUTHENTICATED SOCKET
   ========================================================= */

function connectAuthenticatedWS(wsUrl) {

  if (state.authenticatedSocket) {

    try {
      state.authenticatedSocket.close();
    } catch (_) {}

  }

  const ws =
    new WebSocket(wsUrl);

  state.authenticatedSocket =
    ws;

  ws.addEventListener(
    "open",
    () => {

      state.authenticatedConnected =
        true;

      state.connectedToDeriv =
        true;

      updateConnectionUI();

      setStatus(
        "DERIV AUTHENTICATED • TRADING READY"
      );

      /*
        Request balance.
      */

      sendAuthenticated({
        balance: 1,
        subscribe: 1
      });

      /*
        Request account details.
      */

      sendAuthenticated({
        account_status: 1
      });

      showToast(
        "DERIV TRADING CONNECTION READY"
      );

    }
  );


  ws.addEventListener(
    "message",
    event => {

      let data;

      try {

        data =
          JSON.parse(event.data);

      } catch (_) {

        return;

      }

      handleAuthenticatedMessage(data);

    }
  );


  ws.addEventListener(
    "error",
    error => {

      console.error(
        "Authenticated WS error:",
        error
      );

      state.authenticatedConnected =
        false;

      updateConnectionUI();

    }
  );


  ws.addEventListener(
    "close",
    () => {

      state.authenticatedConnected =
        false;

      updateConnectionUI();

      setStatus(
        "Deriv trading connection closed."
      );

    }
  );

}


/* =========================================================
   AUTHENTICATED SEND
   ========================================================= */

function sendAuthenticated(payload) {

  if (
    !state.authenticatedSocket ||
    state.authenticatedSocket.readyState !==
      WebSocket.OPEN
  ) {

    return false;

  }

  const req =
    Object.assign(
      {},
      payload,
      {
        req_id:
          ++state.requestId
      }
    );

  try {

    state.authenticatedSocket.send(
      JSON.stringify(req)
    );

    return req.req_id;

  } catch (error) {

    console.error(
      "WS send failed:",
      error
    );

    return false;

  }

}


/* =========================================================
   AUTHENTICATED MESSAGE HANDLER
   ========================================================= */

function handleAuthenticatedMessage(data) {

  if (data.error) {

    console.error(
      "DERIV API ERROR:",
      data.error
    );

    handleDerivError(data);

    return;

  }


  /* Balance */

  if (
    data.msg_type === "balance" &&
    data.balance
  ) {

    const balance =
      Number(
        data.balance.balance
      );

    if (Number.isFinite(balance)) {

      state.derivBalance =
        balance;

      updateAccountUI();

    }

  }


  /* Account status */

  if (
    data.msg_type ===
      "account_status"
  ) {

    if (
      data.account_status &&
      data.account_status.currency
    ) {

      state.currency =
        data.account_status.currency;

      updateAccountUI();

    }

  }


  /* Proposal */

  if (
    data.msg_type === "proposal"
  ) {

    handleProposalResponse(data);

  }


  /* Buy */

  if (
    data.msg_type === "buy"
  ) {

    handleBuyResponse(data);

  }


  /* Contract */

  if (
    data.msg_type ===
      "proposal_open_contract"
  ) {

    handleContractUpdate(data);

  }

}


/* =========================================================
   DERIV ERROR
   ========================================================= */

function handleDerivError(data) {

  const message =
    data.error?.message ||
    "Deriv request failed.";

  const code =
    data.error?.code ||
    "";

  console.error(
    code,
    message
  );

  if (data.req_id) {

    const request =
      state.proposalRequests[
        data.req_id
      ];

    if (request) {

      delete state.proposalRequests[
        data.req_id
      ];

    }

  }

  showToast(
    message
  );

}


/* =========================================================
   PUBLIC MARKET WS
   ========================================================= */

function connectPublicMarket() {

  if (state.publicSocket) {

    try {
      state.publicSocket.close();
    } catch (_) {}

  }

  setStatus(
    "Connecting to Deriv market data..."
  );

  const ws =
    new WebSocket(
      CONFIG.PUBLIC_WS
    );

  state.publicSocket =
    ws;


  ws.addEventListener(
    "open",
    () => {

      state.publicConnected =
        true;

      updateConnectionUI();

      setStatus(
        "LIVE MARKET DATA • WAITING FOR TICKS"
      );

      subscribeAllMarkets();

    }
  );


  ws.addEventListener(
    "message",
    event => {

      let data;

      try {

        data =
          JSON.parse(event.data);

      } catch (_) {

        return;

      }

      handlePublicMessage(data);

    }
  );


  ws.addEventListener(
    "error",
    error => {

      console.error(
        "Public WS error:",
        error
      );

      state.publicConnected =
        false;

      updateConnectionUI();

      setStatus(
        "Market data connection error."
      );

    }
  );


  ws.addEventListener(
    "close",
    () => {

      state.publicConnected =
        false;

      updateConnectionUI();

      setStatus(
        "Market data disconnected. Reconnecting..."
      );

      clearTimeout(
        state.reconnectTimer
      );

      state.reconnectTimer =
        setTimeout(
          connectPublicMarket,
          4000
        );

    }
  );

}


/* =========================================================
   SUBSCRIBE ALL MARKETS
   ========================================================= */

function subscribeAllMarkets() {

  if (
    !state.publicSocket ||
    state.publicSocket.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }


  MARKETS.forEach(symbol => {

    try {

      state.publicSocket.send(
        JSON.stringify({

          ticks_history:
            symbol,

          count:
            CONFIG.MAX_TICKS,

          end:
            "latest",

          style:
            "ticks",

          subscribe:
            1

        })
      );

    } catch (error) {

      console.error(
        "Market subscribe:",
        error
      );

    }

  });

}


/* =========================================================
   PUBLIC MESSAGE
   ========================================================= */

function handlePublicMessage(data) {

  if (data.error) {

    console.warn(
      "Public market error:",
      data.error
    );

    return;

  }


  /* History */

  if (
    data.msg_type ===
      "history"
  ) {

    const symbol =
      data.echo_req?.ticks_history;

    if (!symbol) return;

    const prices =
      data.history?.prices || [];

    const times =
      data.history?.times || [];

    state.ticks[symbol] =
      prices.map(
        (price, index) => ({
          price:
            Number(price),

          time:
            Number(times[index]) ||
            Date.now() / 1000
        })
      ).slice(
        -CONFIG.MAX_TICKS
      );

    if (
      data.pip_size !== undefined
    ) {

      state.pipSizes[symbol] =
        Number(data.pip_size);

    }

    updateAnalysis();

    drawChart();

    return;

  }


  /* Live tick */

  if (
    data.msg_type ===
      "tick" &&
    data.tick
  ) {

    const symbol =
      data.tick.symbol;

    const quote =
      Number(data.tick.quote);

    if (!symbol || !Number.isFinite(quote)) {
      return;
    }


    if (!state.ticks[symbol]) {

      state.ticks[symbol] = [];

    }


    state.ticks[symbol].push({

      price: quote,

      time:
        Number(data.tick.epoch) ||
        Date.now() / 1000

    });


    if (
      state.ticks[symbol].length >
      CONFIG.MAX_TICKS
    ) {

      state.ticks[symbol].splice(
        0,
        state.ticks[symbol].length -
          CONFIG.MAX_TICKS
      );

    }


    if (
      data.tick.pip_size !== undefined
    ) {

      state.pipSizes[symbol] =
        Number(data.tick.pip_size);

    }


    state.prices[symbol] =
      quote;

    state.lastDigits[symbol] =
      getLastDigit(
        quote,
        state.pipSizes[symbol]
      );


    updateAnalysis();

    drawChart();

  }

}


/* =========================================================
   LAST DIGIT
   ========================================================= */

function getLastDigit(
  price,
  pipSize
) {

  if (!Number.isFinite(price)) {
    return null;
  }


  /*
    Deriv's pip size tells us the quote precision.
    This is more reliable than forcing 5 decimals.
  */

  if (
    Number.isFinite(pipSize) &&
    pipSize > 0
  ) {

    const decimals =
      Math.max(
        0,
        Math.round(
          -Math.log10(pipSize)
        )
      );

    const text =
      price.toFixed(decimals);

    const digits =
      text.replace(/\D/g, "");

    if (digits.length) {

      return Number(
        digits[digits.length - 1]
      );

    }

  }


  /*
    Fallback.
  */

  const text =
    String(price);

  const digits =
    text.replace(/\D/g, "");

  if (!digits.length) {
    return null;
  }

  return Number(
    digits[digits.length - 1]
  );

}


/* =========================================================
   ANALYSIS
   ========================================================= */

function updateAnalysis() {

  const market =
    state.selectedAnalysisMarket;

  const ticks =
    state.ticks[market] || [];

  if (!ticks.length) {

    renderWaitingAnalysis();

    return;

  }


  const recent =
    ticks.slice(
      -CONFIG.ANALYSIS_TICKS
    );


  const digits =
    recent
      .map(tick =>
        getLastDigit(
          tick.price,
          state.pipSizes[market]
        )
      )
      .filter(
        digit =>
          Number.isInteger(digit)
      );


  if (!digits.length) {

    renderWaitingAnalysis();

    return;

  }


  const counts =
    Array(10).fill(0);

  digits.forEach(
    digit => counts[digit]++
  );


  const total =
    digits.length;


  let hottest =
    0;

  let coldest =
    0;


  for (
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      counts[i] >
      counts[hottest]
    ) {

      hottest = i;

    }


    if (
      counts[i] <
      counts[coldest]
    ) {

      coldest = i;

    }

  }


  const percentages =
    counts.map(
      count =>
        total
          ? (count / total) * 100
          : 0
    );


  const even =
    digits.filter(
      digit =>
        digit % 2 === 0
    ).length;


  const odd =
    total - even;


  const over =
    digits.filter(
      digit => digit >= 5
    ).length;


  const under =
    total - over;


  const hotRate =
    total
      ? percentages[hottest]
      : 0;


  const confidence =
    calculateConfidence(
      counts,
      total,
      hotRate
    );


  const score =
    Math.round(
      confidence
    );


  const prediction =
    choosePrediction(
      counts,
      percentages,
      hottest,
      coldest,
      even,
      odd,
      over,
      under
    );


  state.analysis[market] = {

    market,

    counts,

    percentages,

    total,

    hottest,

    coldest,

    even,

    odd,

    over,

    under,

    confidence,

    score,

    prediction,

    lastDigit:
      digits[digits.length - 1]

  };


  renderAnalysis(
    state.analysis[market]
  );

  updateScanner();

  updateAIStatus();

}


/* =========================================================
   WAITING ANALYSIS
   ========================================================= */

function renderWaitingAnalysis() {

  if (DOM.currentChartMarket) {
    DOM.currentChartMarket.textContent =
      state.selectedAnalysisMarket;
  }

  if (DOM.aiMarket) {
    DOM.aiMarket.textContent =
      state.selectedAnalysisMarket;
  }

  if (DOM.aiStatus) {
    DOM.aiStatus.textContent =
      "AI WAITING";
  }

  if (DOM.aiPrediction) {
    DOM.aiPrediction.textContent =
      "WAITING";
  }

  if (DOM.aiCirclePrediction) {
    DOM.aiCirclePrediction.textContent =
      "--";
  }

  if (DOM.analysisConfidence) {
    DOM.analysisConfidence.textContent =
      "0%";
  }

  if (DOM.digitSampleCount) {
    DOM.digitSampleCount.textContent =
      "0";
  }

  if (DOM.lastDigit) {
    DOM.lastDigit.textContent =
      "-";
  }

}


/* =========================================================
   CONFIDENCE
   ========================================================= */

function calculateConfidence(
  counts,
  total,
  hotRate
) {

  if (!total) return 0;


  const average =
    total / 10;


  const max =
    Math.max(...counts);


  const deviation =
    average
      ? ((max - average) /
          average) * 100
      : 0;


  const sampleFactor =
    Math.min(
      25,
      total / 4
    );


  let confidence =
    48 +
    deviation * 0.7 +
    sampleFactor * 0.25;


  if (hotRate > 18) {
    confidence += 5;
  }


  return Math.max(
    40,
    Math.min(
      97,
      Math.round(confidence)
    )
  );

}


/* =========================================================
   PREDICTION
   ========================================================= */

function choosePrediction(
  counts,
  percentages,
  hottest,
  coldest,
  even,
  odd,
  over,
  under
) {

  const total =
    counts.reduce(
      (a, b) => a + b,
      0
    );

  if (!total) {
    return {
      strategy: "MATCHES",
      target: hottest,
      text: `MATCH ${hottest}`
    };
  }


  const evenRate =
    even / total;

  const oddRate =
    odd / total;

  const overRate =
    over / total;

  const underRate =
    under / total;


  const candidates = [

    {
      strategy: "MATCHES",
      strength:
        percentages[hottest],
      target:
        hottest
    },

    {
      strategy: "DIFFERS",
      strength:
        100 -
        percentages[hottest],
      target:
        hottest
    },

    {
      strategy: "EVEN",
      strength:
        Math.abs(
          evenRate - 0.5
        ) * 100,
      target:
        null
    },

    {
      strategy: "ODD",
      strength:
        Math.abs(
          oddRate - 0.5
        ) * 100,
      target:
        null
    },

    {
      strategy: "OVER",
      strength:
        Math.abs(
          overRate - 0.5
        ) * 100,
      target:
        null
    },

    {
      strategy: "UNDER",
      strength:
        Math.abs(
          underRate - 0.5
        ) * 100,
      target:
        null
    }

  ];


  /*
    MATCHES / DIFFERS are given stronger priority
    because digit contracts are naturally target-based.
  */

  candidates.sort(
    (a, b) =>
      b.strength - a.strength
  );


  const selected =
    candidates[0];


  return {

    strategy:
      selected.strategy,

    target:
      selected.target,

    text:
      formatPrediction(
        selected
      )

  };

}


function formatPrediction(
  prediction
) {

  switch (
    prediction.strategy
  ) {

    case "MATCHES":
      return `MATCH ${prediction.target}`;

    case "DIFFERS":
      return `DIFFER ${prediction.target}`;

    case "OVER":
      return "OVER 4";

    case "UNDER":
      return "UNDER 5";

    case "EVEN":
      return "EVEN";

    case "ODD":
      return "ODD";

    default:
      return "WAITING";

  }

}


/* =========================================================
   RENDER ANALYSIS
   ========================================================= */

function renderAnalysis(
  analysis
) {

  if (!analysis) return;


  if (DOM.currentChartMarket) {
    DOM.currentChartMarket.textContent =
      analysis.market;
  }

  if (DOM.aiMarket) {
    DOM.aiMarket.textContent =
      analysis.market;
  }


  const currentPrice =
    state.prices[
      analysis.market
    ];


  if (
    DOM.currentLivePrice &&
    Number.isFinite(currentPrice)
  ) {

    DOM.currentLivePrice.textContent =
      formatPrice(
        currentPrice
      );

  }


  if (DOM.digitSampleCount) {
    DOM.digitSampleCount.textContent =
      analysis.total;
  }


  if (DOM.lastDigit) {

    DOM.lastDigit.textContent =
      analysis.lastDigit ??
      "-";

  }


  if (DOM.analysisConfidence) {

    DOM.analysisConfidence.textContent =
      `${analysis.confidence}%`;

  }


  if (DOM.aiPrediction) {

    DOM.aiPrediction.textContent =
      analysis.prediction.text;

  }


  if (DOM.aiCirclePrediction) {

    DOM.aiCirclePrediction.textContent =
      analysis.prediction.target ??
      analysis.prediction.strategy;

  }


  if (DOM.aiPredictionLarge) {

    DOM.aiPredictionLarge.textContent =
      analysis.prediction.text;

  }


  if (DOM.predictionConfidence) {

    DOM.predictionConfidence.textContent =
      `${analysis.confidence}% confidence`;

  }


  if (DOM.botScore) {

    DOM.botScore.textContent =
      analysis.score;

  }


  if (DOM.aiStatus) {

    DOM.aiStatus.textContent =
      `AI ${analysis.confidence}%`;

  }


  if (DOM.analysisMsg) {

    DOM.analysisMsg.textContent =
      `${analysis.market}: ${analysis.prediction.text} • ${analysis.confidence}% confidence`;

  }


  if (DOM.aiType) {

    DOM.aiType.textContent =
      "DERIV DIGIT CONTRACT";

  }


  renderDigitDistribution(
    analysis
  );

}


/* =========================================================
   DIGIT DISTRIBUTION
   ========================================================= */

function renderDigitDistribution(
  analysis
) {

  if (!DOM.digitStatsGrid) return;


  DOM.digitStatsGrid.innerHTML = "";


  const max =
    Math.max(
      1,
      ...analysis.counts
    );


  analysis.counts.forEach(
    (count, digit) => {

      const cell =
        document.createElement(
          "div"
        );

      cell.className =
        "digit-cell";


      const percent =
        analysis.total
          ? (
              count /
              analysis.total
            ) * 100
          : 0;


      cell.innerHTML = `
        <strong>${digit}</strong>
        <span>${count} • ${percent.toFixed(1)}%</span>
        <div class="digit-bar"
             style="width:${Math.max(
               4,
               (count / max) * 100
             )}%">
        </div>
      `;


      DOM.digitStatsGrid.appendChild(
        cell
      );

    }
  );

}


/* =========================================================
   SCANNER
   ========================================================= */

function updateScanner() {

  const scanner =
    MARKETS
      .map(
        market =>
          state.analysis[market]
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.score - a.score
      );


  state.scanner =
    scanner;

}


/* =========================================================
   AI STATUS
   ========================================================= */

function updateAIStatus() {

  const analysis =
    state.analysis[
      state.selectedAnalysisMarket
    ];

  if (!analysis) return;


  if (DOM.aiCircleLabel) {

    DOM.aiCircleLabel.textContent =
      "AI";

  }

}


/* =========================================================
   CHART
   ========================================================= */

function drawChart() {

  const canvas =
    DOM.priceChartCanvas;

  if (!canvas) return;


  const rect =
    canvas.getBoundingClientRect();


  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return;
  }


  const ratio =
    window.devicePixelRatio ||
    1;


  canvas.width =
    rect.width * ratio;

  canvas.height =
    rect.height * ratio;


  const ctx =
    canvas.getContext("2d");

  ctx.setTransform(
    ratio,
    0,
    0,
    ratio,
    0,
    0
  );


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


  const market =
    state.selectedAnalysisMarket;


  const ticks =
    state.ticks[market] || [];


  if (ticks.length < 2) {

    ctx.fillStyle =
      getCssVar("--muted");

    ctx.font =
      "11px system-ui";

    ctx.fillText(
      "Waiting for market data...",
      15,
      25
    );

    return;

  }


  const values =
    ticks
      .slice(-80)
      .map(
        tick =>
          tick.price
      );


  const min =
    Math.min(...values);

  const max =
    Math.max(...values);


  const range =
    max - min ||
    1;


  ctx.strokeStyle =
    getCssVar("--line");

  ctx.lineWidth = 1;


  for (
    let i = 1;
    i < 4;
    i++
  ) {

    const y =
      (height / 4) * i;

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


  ctx.beginPath();


  values.forEach(
    (value, index) => {

      const x =
        values.length <= 1
          ? 0
          : (
              index /
              (values.length - 1)
            ) * width;


      const y =
        height -
        (
          (value - min) /
          range
        ) *
        (height - 20) -
        10;


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
    getCssVar("--accent");

  ctx.lineWidth = 2;

  ctx.stroke();

}


/* =========================================================
   CHART UPDATE
   ========================================================= */

function updateChart() {

  const market =
    state.selectedAnalysisMarket;

  const price =
    state.prices[market];


  if (
    DOM.currentLivePrice &&
    Number.isFinite(price)
  ) {

    DOM.currentLivePrice.textContent =
      formatPrice(price);

  }


  drawChart();

}


/* =========================================================
   FORMAT PRICE
   ========================================================= */

function formatPrice(price) {

  if (!Number.isFinite(price)) {
    return "0.00000";
  }


  const pip =
    state.pipSizes[
      state.selectedAnalysisMarket
    ];


  if (
    Number.isFinite(pip) &&
    pip > 0
  ) {

    const decimals =
      Math.max(
        0,
        Math.round(
          -Math.log10(pip)
        )
      );

    return price.toFixed(
      decimals
    );

  }


  return price.toFixed(5);

}


/* =========================================================
   AI BOT
   ========================================================= */

function toggleBot() {

  if (state.botRunning) {

    stopBot();

  } else {

    startBot();

  }

}


function startBot() {

  if (!ensureTradingReady()) {
    return;
  }


  if (
    !state.botStrategies.length
  ) {

    showToast(
      "Select at least one AI BOT strategy."
    );

    return;

  }


  state.botRunning =
    true;


  state.botStake =
    safeNumber(
      DOM.stakeInput?.value,
      1
    );


  state.botCurrentStake =
    state.botStake;


  state.botTakeProfit =
    safeNumber(
      DOM.takeProfitInput?.value,
      20
    );


  state.botStopLoss =
    safeNumber(
      DOM.stopLossInput?.value,
      20
    );


  state.botMartingale =
    Math.max(
      1,
      safeNumber(
        DOM.martingaleInput?.value,
        1
      )
    );


  if (DOM.startBotBtn) {

    DOM.startBotBtn.textContent =
      "STOP AI BOT";

  }


  if (DOM.botStatusDash) {

    DOM.botStatusDash.textContent =
      "RUNNING";

  }


  showToast(
    `AI BOT STARTED • ${state.tradingMode}`
  );


  runBotCycle();

}


function stopBot() {

  state.botRunning =
    false;


  clearTimeout(
    state.botTimer
  );


  if (DOM.startBotBtn) {

    DOM.startBotBtn.textContent =
      "START AI BOT";

  }


  if (DOM.botStatusDash) {

    DOM.botStatusDash.textContent =
      "STOPPED";

  }


  showToast(
    "AI BOT STOPPED"
  );

}


function runBotCycle() {

  if (!state.botRunning) {
    return;
  }


  if (
    shouldStopTrading(
      state.botTakeProfit,
      state.botStopLoss
    )
  ) {

    stopBot();

    return;

  }


  const market =
    DOM.botMarketSelect?.value ||
    CONFIG.DEFAULT_MARKET;


  const analysis =
    state.analysis[market];


  if (!analysis) {

    state.botTimer =
      setTimeout(
        runBotCycle,
        1500
      );

    return;

  }


  if (
    hasActiveContractFromEngine(
      "BOT"
    )
  ) {

    state.botTimer =
      setTimeout(
        runBotCycle,
        1000
      );

    return;

  }


  const decision =
    chooseBotStrategy(
      analysis
    );


  if (!decision) {

    state.botTimer =
      setTimeout(
        runBotCycle,
        1000
      );

    return;

  }


  if (DOM.botSelectedMarket) {

    DOM.botSelectedMarket.textContent =
      market;

  }


  if (DOM.aiPredictionLarge) {

    DOM.aiPredictionLarge.textContent =
      formatPrediction(
        decision
      );

  }


  if (DOM.predictionConfidence) {

    DOM.predictionConfidence.textContent =
      `${analysis.confidence}% confidence`;

  }


  const stake =
    clampStake(
      state.botCurrentStake
    );


  placeDerivTrade({

    engine:
      "BOT",

    market,

    strategy:
      decision.strategy,

    target:
      decision.target,

    stake,

    takeProfit:
      state.botTakeProfit,

    stopLoss:
      state.botStopLoss,

    martingale:
      state.botMartingale

  });


  state.botTimer =
    setTimeout(
      runBotCycle,
      3000
    );

}


/* =========================================================
   BOT STRATEGY
   ========================================================= */

function chooseBotStrategy(
  analysis
) {

  const allowed =
    state.botStrategies;


  if (
    state.botStrategyMode === "AUTO" ||
    allowed.length === STRATEGIES.length
  ) {

    return {

      strategy:
        analysis.prediction.strategy,

      target:
        analysis.prediction.target

    };

  }


  const candidates =
    allowed
      .map(
        strategy =>
          buildStrategyDecision(
            strategy,
            analysis
          )
      )
      .filter(Boolean);


  if (!candidates.length) {
    return null;
  }


  candidates.sort(
    (a, b) =>
      b.strength -
      a.strength
  );


  return candidates[0];

}


function buildStrategyDecision(
  strategy,
  analysis
) {

  const total =
    analysis.total;


  if (!total) return null;


  switch (strategy) {

    case "MATCHES":

      return {

        strategy,
        target:
          analysis.hottest,

        strength:
          analysis.percentages[
            analysis.hottest
          ]

      };


    case "DIFFERS":

      return {

        strategy,
        target:
          analysis.hottest,

        strength:
          100 -
          analysis.percentages[
            analysis.hottest
          ]

      };


    case "OVER":

      return {

        strategy,
        target:
          4,

        strength:
          Math.abs(
            analysis.over /
            total -
            0.5
          ) * 100

      };


    case "UNDER":

      return {

        strategy,
        target:
          5,

        strength:
          Math.abs(
            analysis.under /
            total -
            0.5
          ) * 100

      };


    case "EVEN":

      return {

        strategy,
        target:
          null,

        strength:
          Math.abs(
            analysis.even /
            total -
            0.5
          ) * 100

      };


    case "ODD":

      return {

        strategy,
        target:
          null,

        strength:
          Math.abs(
            analysis.odd /
            total -
            0.5
          ) * 100

      };


    default:
      return null;

  }

}


/* =========================================================
   CIRCULAR AI
   ========================================================= */

function toggleCircularAI() {

  if (state.circularRunning) {

    stopCircularAI();

  } else {

    startCircularAI();

  }

}


function startCircularAI() {

  if (!ensureTradingReady()) {
    return;
  }


  state.circularRunning =
    true;


  state.circularPhase =
    "ANALYSIS";


  state.circularSeconds =
    CONFIG.CYCLE_ANALYSIS_SECONDS;


  if (DOM.startAI) {

    DOM.startAI.textContent =
      "CIRCULAR AI RUNNING";

  }


  if (DOM.aiCircleStatus) {

    DOM.aiCircleStatus.textContent =
      "RUNNING";

  }


  showToast(
    `CIRCULAR AI STARTED • ${state.tradingMode}`
  );


  runCircularPhase();

}


function stopCircularAI() {

  state.circularRunning =
    false;


  clearTimeout(
    state.circularTimer
  );


  state.circularPhase =
    "IDLE";


  state.circularSeconds =
    0;


  if (DOM.startAI) {

    DOM.startAI.textContent =
      "START CIRCULAR AI";

  }


  if (DOM.aiCircleStatus) {

    DOM.aiCircleStatus.textContent =
      "IDLE";

  }


  if (DOM.circularStatusText) {

    DOM.circularStatusText.textContent =
      "READY";

  }


  if (DOM.aiCircleTimer) {

    DOM.aiCircleTimer.textContent =
      "--";

  }


  showToast(
    "CIRCULAR AI STOPPED"
  );

}


function runCircularPhase() {

  if (!state.circularRunning) {
    return;
  }


  if (
    shouldStopTrading(
      state.circularTakeProfit,
      state.circularStopLoss
    )
  ) {

    stopCircularAI();

    return;

  }


  switch (
    state.circularPhase
  ) {

    case "ANALYSIS":

      circularAnalysisPhase();

      break;


    case "PREDICTION":

      circularPredictionPhase();

      break;


    case "TRADE":

      circularTradePhase();

      break;


    case "COOLDOWN":

      circularCooldownPhase();

      break;


    default:

      state.circularPhase =
        "ANALYSIS";

      state.circularSeconds =
        CONFIG.CYCLE_ANALYSIS_SECONDS;

      runCircularPhase();

  }

}


/* =========================================================
   CIRCULAR ANALYSIS
   ========================================================= */

function circularAnalysisPhase() {

  const market =
    DOM.circularMarketSelect?.value ||
    CONFIG.DEFAULT_MARKET;


  const analysis =
    state.analysis[market];


  if (!analysis) {

    state.circularSeconds = 2;

    if (DOM.circularStatusText) {
      DOM.circularStatusText.textContent =
        "WAITING";
    }

    scheduleCircularSecond();

    return;

  }


  state.circularSeconds =
    CONFIG.CYCLE_ANALYSIS_SECONDS;


  state.circularPhase =
    "ANALYSIS";


  if (DOM.cycleAnalysis) {

    DOM.cycleAnalysis.textContent =
      "ANALYZING";

  }


  if (DOM.cycleTrade) {

    DOM.cycleTrade.textContent =
      "WAITING";

  }


  if (DOM.circularStatusText) {

    DOM.circularStatusText.textContent =
      "ANALYZING";

  }


  if (DOM.aiCircleStatus) {

    DOM.aiCircleStatus.textContent =
      "ANALYSIS";

  }


  scheduleCircularSecond();

}


function circularPredictionPhase() {

  const market =
    DOM.circularMarketSelect?.value ||
    CONFIG.DEFAULT_MARKET;


  const analysis =
    state.analysis[market];


  if (!analysis) {

    state.circularPhase =
      "ANALYSIS";

    state.circularSeconds =
      2;

    scheduleCircularSecond();

    return;

  }


  const decision =
    getCircularDecision(
      analysis
    );


  state.circularPrediction =
    decision;


  state.circularStrategyDecision =
    decision;


  if (DOM.aiCirclePrediction) {

    DOM.aiCirclePrediction.textContent =
      decision.target ??
      decision.strategy;

  }


  if (DOM.aiPrediction) {

    DOM.aiPrediction.textContent =
      formatPrediction(
        decision
      );

  }


  if (DOM.aiPredictionLarge) {

    DOM.aiPredictionLarge.textContent =
      formatPrediction(
        decision
      );

  }


  if (DOM.analysisMsg) {

    DOM.analysisMsg.textContent =
      `NEXT: ${formatPrediction(
        decision
      )} • ${analysis.confidence}% confidence`;

  }


  if (DOM.cycleAnalysis) {

    DOM.cycleAnalysis.textContent =
      "PREDICTED";

  }


  if (DOM.circularStatusText) {

    DOM.circularStatusText.textContent =
      "PREDICTED";

  }


  state.circularSeconds =
    CONFIG.CYCLE_PREDICTION_SECONDS;

  state.circularPhase =
    "PREDICTION";


  scheduleCircularSecond();

}


function circularTradePhase() {

  const market =
    DOM.circularMarketSelect?.value ||
    CONFIG.DEFAULT_MARKET;


  const analysis =
    state.analysis[market];


  if (!analysis) {

    restartCircularAnalysis();

    return;

  }


  const decision =
    state.circularStrategyDecision ||
    getCircularDecision(
      analysis
    );


  if (DOM.cycleTrade) {

    DOM.cycleTrade.textContent =
      "TRADE NOW";

  }


  if (DOM.circularStatusText) {

    DOM.circularStatusText.textContent =
      "TRADE NOW";

  }


  /*
    Only one trade per circular cycle.
  */

  if (
    state.circularLastTradeTick !==
    getLatestTickKey(market)
  ) {

    state.circularLastTradeTick =
      getLatestTickKey(market);


    placeDerivTrade({

      engine:
        "CIRCULAR",

      market,

      strategy:
        decision.strategy,

      target:
        decision.target,

      stake:
        clampStake(
          state.circularStake
        ),

      takeProfit:
        state.circularTakeProfit,

      stopLoss:
        state.circularStopLoss

    });

  }


  state.circularSeconds =
    CONFIG.CYCLE_TRADE_SECONDS;


  state.circularPhase =
    "TRADE";


  scheduleCircularSecond();

}


function circularCooldownPhase() {

  if (DOM.cycleTrade) {

    DOM.cycleTrade.textContent =
      "COOLDOWN";

  }


  if (DOM.circularStatusText) {

    DOM.circularStatusText.textContent =
      "COOLDOWN";

  }


  if (DOM.cycleCooldown) {

    DOM.cycleCooldown.textContent =
      state.circularSeconds;

  }


  state.circularPhase =
    "COOLDOWN";


  scheduleCircularSecond();

}


function scheduleCircularSecond() {

  clearTimeout(
    state.circularTimer
  );


  if (!state.circularRunning) {
    return;
  }


  if (DOM.aiCircleTimer) {

    DOM.aiCircleTimer.textContent =
      `${state.circularSeconds}s`;

  }


  if (DOM.cycleCooldown) {

    DOM.cycleCooldown.textContent =
      state.circularPhase === "COOLDOWN"
        ? state.circularSeconds
        : "0";

  }


  state.circularTimer =
    setTimeout(
      () => {

        state.circularSeconds--;


        if (
          state.circularSeconds > 0
        ) {

          scheduleCircularSecond();

          return;

        }


        advanceCircularPhase();

      },
      1000
    );

}


function advanceCircularPhase() {

  if (!state.circularRunning) {
    return;
  }


  if (
    state.circularPhase ===
    "ANALYSIS"
  ) {

    state.circularPhase =
      "PREDICTION";

    circularPredictionPhase();

    return;

  }


  if (
    state.circularPhase ===
    "PREDICTION"
  ) {

    state.circularPhase =
      "TRADE";

    state.circularSeconds =
      CONFIG.CYCLE_TRADE_SECONDS;

    circularTradePhase();

    return;

  }


  if (
    state.circularPhase ===
    "TRADE"
  ) {

    state.circularPhase =
      "COOLDOWN";

    state.circularSeconds =
      CONFIG.CYCLE_COOLDOWN_SECONDS;

    circularCooldownPhase();

    return;

  }


  if (
    state.circularPhase ===
    "COOLDOWN"
  ) {

    restartCircularAnalysis();

  }

}


function restartCircularAnalysis() {

  state.circularPhase =
    "ANALYSIS";

  state.circularSeconds =
    CONFIG.CYCLE_ANALYSIS_SECONDS;

  state.circularStrategyDecision =
    null;

  if (DOM.cycleAnalysis) {

    DOM.cycleAnalysis.textContent =
      "ANALYZING";

  }

  scheduleCircularSecond();

}


function getCircularDecision(
  analysis
) {

  const requested =
    DOM.circularStrategyLabel?.textContent ||
    "AUTO";


  if (
    requested &&
    requested !== "AUTO" &&
    STRATEGIES.includes(
      requested
    )
  ) {

    return buildStrategyDecision(
      requested,
      analysis
    );

  }


  return {

    strategy:
      analysis.prediction.strategy,

    target:
      analysis.prediction.target,

    strength:
      analysis.confidence

  };

}


/* =========================================================
   CIRCULAR TRADING BUTTON
   ========================================================= */

function toggleCircularTrading() {

  if (
    state.circularRunning
  ) {

    stopCircularAI();

  } else {

    startCircularAI();

  }

}


/* =========================================================
   MANUAL TRADE
   ========================================================= */

function placeManualTrade() {

  if (
    state.manualBusy
  ) {

    return;

  }


  if (!ensureTradingReady()) {
    return;
  }


  const market =
    DOM.manualMarketSelect?.value ||
    CONFIG.DEFAULT_MARKET;


  const strategy =
    state.manualStrategy;


  let target = null;


  if (
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
  ) {

    target =
      parseInt(
        DOM.manualTargetDigitInput?.value,
        10
      );


    if (
      !Number.isInteger(target) ||
      target < 0 ||
      target > 9
    ) {

      showToast(
        "Target digit must be 0-9."
      );

      return;

    }

  }


  const stake =
    clampStake(
      safeNumber(
        DOM.manualStakeInput?.value,
        1
      )
    );


  const takeProfit =
    safeNumber(
      DOM.manualTakeProfitInput?.value,
      20
    );


  const stopLoss =
    safeNumber(
      DOM.manualStopLossInput?.value,
      20
    );


  state.manualBusy =
    true;


  if (DOM.placeTradeBtn) {

    DOM.placeTradeBtn.disabled =
      true;

    DOM.placeTradeBtn.textContent =
      "SENDING...";

  }


  placeDerivTrade({

    engine:
      "MANUAL",

    market,

    strategy,

    target,

    stake,

    takeProfit,

    stopLoss

  }).finally(() => {

    setTimeout(
      () => {

        state.manualBusy =
          false;

        if (DOM.placeTradeBtn) {

          DOM.placeTradeBtn.disabled =
            false;

          DOM.placeTradeBtn.textContent =
            state.tradingMode === "REAL"
              ? "PLACE REAL TRADE"
              : "PLACE DEMO TRADE";

        }

      },
      800
    );

  });

}


/* =========================================================
   DERIV TRADE ENGINE
   ========================================================= */

async function placeDerivTrade({
  engine,
  market,
  strategy,
  target,
  stake,
  takeProfit,
  stopLoss,
  martingale
}) {

  if (!ensureTradingReady()) {
    return false;
  }


  if (
    state.tradingMode === "REAL" &&
    !state.realModeConfirmed
  ) {

    showToast(
      "REAL trading confirmation required."
    );

    return false;

  }


  if (
    !MARKETS.includes(
      market
    )
  ) {

    showToast(
      "Invalid market."
    );

    return false;

  }


  const amount =
    clampStake(stake);


  if (
    amount > state.derivBalance &&
    state.derivBalance > 0
  ) {

    showToast(
      "Insufficient Deriv balance."
    );

    return false;

  }


  /*
    One active contract per engine.
  */

  if (
    hasActiveContractFromEngine(
      engine
    )
  ) {

    return false;

  }


  const proposal =
    buildProposal({
      market,
      strategy,
      target,
      amount
    });


  if (!proposal) {

    showToast(
      "Unable to build Deriv contract."
    );

    return false;

  }


  const reqId =
    sendAuthenticated(
      proposal
    );


  if (!reqId) {

    showToast(
      "Deriv trading socket is not ready."
    );

    return false;

  }


  state.proposalRequests[
    reqId
  ] = {

    engine,

    market,

    strategy,

    target,

    amount,

    takeProfit,

    stopLoss,

    martingale:

      martingale ||
      state.botMartingale ||
      1,

    createdAt:
      Date.now()

  };


  showToast(
    `${engine} • ${strategy} • ${market}`
  );


  return true;

}


/* =========================================================
   BUILD DERIV PROPOSAL
   ========================================================= */

function buildProposal({
  market,
  strategy,
  target,
  amount
}) {

  let contractType =
    null;

  let barrier =
    undefined;


  switch (strategy) {

    case "MATCHES":

      contractType =
        "DIGITMATCH";

      barrier =
        normalizeTarget(
          target,
          market
        );

      break;


    case "DIFFERS":

      contractType =
        "DIGITDIFF";

      barrier =
        normalizeTarget(
          target,
          market
        );

      break;


    case "OVER":

      contractType =
        "DIGITOVER";

      /*
        OVER 4 = digits 5-9.
      */

      barrier = 4;

      break;


    case "UNDER":

      contractType =
        "DIGITUNDER";

      /*
        UNDER 5 = digits 0-4.
      */

      barrier = 5;

      break;


    case "EVEN":

      contractType =
        "DIGITEVEN";

      break;


    case "ODD":

      contractType =
        "DIGITODD";

      break;


    default:

      return null;

  }


  const payload = {

    proposal: 1,

    amount,

    basis:
      "stake",

    contract_type:
      contractType,

    currency:
      state.currency || "USD",

    duration:
      1,

    duration_unit:
      "t",

    symbol:
      market

  };


  if (
    barrier !== undefined
  ) {

    payload.barrier =
      String(barrier);

  }


  return payload;

}


/* =========================================================
   TARGET DIGIT
   ========================================================= */

function normalizeTarget(
  target,
  market
) {

  if (
    Number.isInteger(target) &&
    target >= 0 &&
    target <= 9
  ) {

    return target;

  }


  const analysis =
    state.analysis[market];


  if (
    analysis &&
    Number.isInteger(
      analysis.hottest
    )
  ) {

    return analysis.hottest;

  }


  return 5;

}


/* =========================================================
   PROPOSAL RESPONSE
   ========================================================= */

function handleProposalResponse(
  data
) {

  const request =
    state.proposalRequests[
      data.req_id
    ];


  if (!request) {

    console.warn(
      "Unknown proposal:",
      data
    );

    return;

  }


  delete state.proposalRequests[
    data.req_id
  ];


  const proposal =
    data.proposal;


  if (!proposal) {

    showToast(
      "Deriv returned an invalid proposal."
    );

    return;

  }


  const proposalId =
    proposal.id;


  const askPrice =
    Number(
      proposal.ask_price
    );


  if (
    !proposalId ||
    !Number.isFinite(
      askPrice
    )
  ) {

    showToast(
      "Invalid Deriv proposal."
    );

    return;

  }


  /*
    Immediately buy the proposal.
  */

  const buyReqId =
    sendAuthenticated({

      buy:
        proposalId,

      price:
        askPrice

    });


  if (!buyReqId) {

    showToast(
      "Unable to send Deriv BUY request."
    );

    return;

  }


  state.proposalRequests[
    buyReqId
  ] = {

    type:
      "BUY",

    ...request,

    proposalId,

    askPrice,

    payout:
      Number(
        proposal.payout
      ) || 0

  };


  showToast(
    `PROPOSAL ACCEPTED • BUYING ${request.strategy}`
  );

}


/* =========================================================
   BUY RESPONSE
   ========================================================= */

function handleBuyResponse(
  data
) {

  const request =
    state.proposalRequests[
      data.req_id
    ];


  if (!request) {

    console.warn(
      "Unknown buy response:",
      data
    );

    return;

  }


  delete state.proposalRequests[
    data.req_id
  ];


  const buy =
    data.buy;


  if (!buy) {

    showToast(
      "Deriv BUY response was invalid."
    );

    return;

  }


  const contractId =
    buy.contract_id;


  if (!contractId) {

    showToast(
      "No contract ID returned."
    );

    return;

  }


  const contract = {

    contractId,

    engine:
      request.engine,

    market:
      request.market,

    strategy:
      request.strategy,

    target:
      request.target,

    stake:
      Number(
        buy.buy_price
      ) ||
      request.amount,

    buyPrice:
      Number(
        buy.buy_price
      ) ||
      request.amount,

    payout:
      Number(
        buy.payout
      ) ||
      request.payout ||
      0,

    takeProfit:
      request.takeProfit,

    stopLoss:
      request.stopLoss,

    martingale:
      request.martingale,

    openedAt:
      Date.now(),

    status:
      "OPEN",

    subscription:
      null

  };


  state.activeContracts[
    contractId
  ] = contract;


  /*
    Subscribe to live contract.
  */

  const reqId =
    sendAuthenticated({

      proposal_open_contract:
        1,

      contract_id:
        contractId,

      subscribe:
        1

    });


  contract.monitorRequestId =
    reqId;


  updateActiveTradesUI();


  showToast(
    `TRADE OPEN • ${request.strategy} • ${request.market}`
  );


  updateAccountBalanceFromBuy(
    contract
  );

}


/* =========================================================
   CONTRACT UPDATE
   ========================================================= */

function handleContractUpdate(
  data
) {

  const poc =
    data.proposal_open_contract;


  if (!poc) return;


  const contractId =
    String(
      poc.contract_id ||
      poc.id ||
      ""
    );


  if (!contractId) return;


  const contract =
    state.activeContracts[
      contractId
    ];


  if (!contract) {

    return;

  }


  if (
    poc.status
  ) {

    contract.status =
      String(
        poc.status
      ).toUpperCase();

  }


  if (
    poc.profit !== undefined
  ) {

    contract.currentProfit =
      Number(
        poc.profit
      ) || 0;

  }


  if (
    poc.payout !== undefined
  ) {

    contract.payout =
      Number(
        poc.payout
      ) || 0;

  }


  contract.currentSpot =
    poc.current_spot;

  contract.exitTick =
    poc.exit_tick;

  contract.exitTickDisplay =
    poc.exit_tick_display_value;

  contract.isSold =
    Boolean(
      poc.is_sold
    );


  updateActiveTradesUI();


  /*
    A contract is completed when is_sold is true
    or status indicates sold/expired/won/lost.
  */

  const finished =
    contract.isSold ||
    [
      "SOLD",
      "WON",
      "LOST",
      "EXPIRED"
    ].includes(
      contract.status
    );


  if (finished) {

    finishContract(
      contract,
      poc
    );

  }

}


/* =========================================================
   FINISH CONTRACT
   ========================================================= */

function finishContract(
  contract,
  poc
) {

  if (
    contract.finished
  ) {
    return;
  }


  contract.finished =
    true;


  const profit =
    Number(
      poc.profit
    );


  const finalProfit =
    Number.isFinite(profit)
      ? profit
      : (
          Number(
            poc.payout
          ) -
          Number(
            contract.buyPrice
          )
        );


  const result =
    finalProfit > 0
      ? "WIN"
      : "LOSS";


  const exitDigit =
    getLastDigitFromContract(
      poc,
      contract.market
    );


  const record = {

    id:
      contract.contractId,

    time:
      Date.now(),

    contractId:
      contract.contractId,

    engine:
      contract.engine,

    mode:
      state.tradingMode,

    accountId:
      state.accountId,

    market:
      contract.market,

    strategy:
      contract.strategy,

    target:
      contract.target,

    stake:
      Number(
        contract.buyPrice
      ) || 0,

    payout:
      Number(
        poc.payout
      ) || 0,

    profit:
      finalProfit,

    result,

    entryDigit:
      contract.entryDigit ??
      null,

    exitDigit,

    status:
      contract.status,

    exitTick:
      poc.exit_tick,

    createdAt:
      contract.openedAt,

    completedAt:
      Date.now()

  };


  state.history.unshift(
    record
  );


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

  updateStats();


  /*
    AI BOT martingale.
  */

  if (
    contract.engine === "BOT"
  ) {

    if (result === "LOSS") {

      state.botCurrentStake =
        clampStake(
          contract.buyPrice *
          (
            contract.martingale ||
            1
          )
        );

    } else {

      state.botCurrentStake =
        clampStake(
          state.botStake
        );

    }

  }


  delete state.activeContracts[
    contract.contractId
  ];


  updateActiveTradesUI();

  updateAllUI();


  showToast(
    `${result} • ${formatMoney(
      finalProfit
    )}`
  );


  /*
    Risk management is checked after settlement.
  */

  if (
    shouldStopTrading(
      contract.takeProfit,
      contract.stopLoss
    )
  ) {

    stopAllTrading();

  }

}


/* =========================================================
   EXIT DIGIT
   ========================================================= */

function getLastDigitFromContract(
  poc,
  market
) {

  const candidates = [

    poc.exit_tick_display_value,

    poc.exit_tick,

    poc.current_spot

  ];


  for (
    const value of candidates
  ) {

    if (
      value !== undefined &&
      value !== null
    ) {

      const digit =
        getLastDigit(
          Number(value),
          state.pipSizes[market]
        );

      if (
        Number.isInteger(digit)
      ) {

        return digit;

      }

    }

  }


  return null;

}


/* =========================================================
   ACTIVE CONTRACT ENGINE
   ========================================================= */

function hasActiveContractFromEngine(
  engine
) {

  return Object.values(
    state.activeContracts
  ).some(
    contract =>
      contract.engine === engine &&
      !contract.finished
  );

}


/* =========================================================
   BALANCE AFTER BUY
   ========================================================= */

function updateAccountBalanceFromBuy(
  contract
) {

  /*
    Do not calculate a fake balance.
    Ask Deriv for the actual balance.
  */

  sendAuthenticated({
    balance: 1,
    subscribe: 1
  });

}


/* =========================================================
   TRADING READY
   ========================================================= */

function ensureTradingReady() {

  if (!state.connectedToDeriv) {

    showToast(
      "Connect your Deriv account first."
    );

    return false;

  }


  if (
    !state.authenticatedConnected
  ) {

    showToast(
      "Deriv trading connection is not ready."
    );

    return false;

  }


  if (
    state.tradingMode === "REAL" &&
    !state.realModeConfirmed
  ) {

    openModal(
      DOM.realConfirmModal
    );

    return false;

  }


  return true;

}


/* =========================================================
   RISK MANAGEMENT
   ========================================================= */

function shouldStopTrading(
  takeProfit,
  stopLoss
) {

  const profit =
    Number(
      state.sessionProfit
    ) || 0;


  const tp =
    Number(
      takeProfit
    ) || 0;


  const sl =
    Number(
      stopLoss
    ) || 0;


  if (
    tp > 0 &&
    profit >= tp
  ) {

    showToast(
      `TAKE PROFIT REACHED: ${formatMoney(
        profit
      )}`
    );

    return true;

  }


  if (
    sl > 0 &&
    profit <= -Math.abs(sl)
  ) {

    showToast(
      `STOP LOSS REACHED: ${formatMoney(
        profit
      )}`
    );

    return true;

  }


  return false;

}


/* =========================================================
   STOP ALL TRADING
   ========================================================= */

function stopAllTrading() {

  stopBot();

  stopCircularAI();


  if (DOM.manualStatusText) {

    DOM.manualStatusText.textContent =
      "STOPPED";

  }


  showToast(
    "ALL AUTOMATIC TRADING STOPPED"
  );

}


/* =========================================================
   HISTORY
   ========================================================= */

function loadHistory() {

  try {

    const saved =
      localStorage.getItem(
        CONFIG.HISTORY_KEY
      );


    if (saved) {

      const parsed =
        JSON.parse(saved);

      if (Array.isArray(parsed)) {

        state.history =
          parsed;

      }

    }

  } catch (error) {

    console.warn(
      "History load failed:",
      error
    );

    state.history = [];

  }


  updateStats();

}


function saveHistory() {

  try {

    localStorage.setItem(
      CONFIG.HISTORY_KEY,
      JSON.stringify(
        state.history
      )
    );

  } catch (error) {

    console.warn(
      "History save failed:",
      error
    );

  }

}


function clearHistory() {

  if (!state.history.length) {

    showToast(
      "History is already empty."
    );

    return;

  }


  const ok =
    window.confirm(
      "Clear the local KRISHWAVE trade history?"
    );


  if (!ok) return;


  state.history = [];

  saveHistory();

  updateStats();

  showToast(
    "Local trade history cleared."
  );

}


/* =========================================================
   STATS
   ========================================================= */

function updateStats() {

  const history =
    state.history;


  const total =
    history.length;


  const wins =
    history.filter(
      item =>
        item.result === "WIN"
    ).length;


  const losses =
    history.filter(
      item =>
        item.result === "LOSS"
    ).length;


  const stake =
    history.reduce(
      (sum, item) =>
        sum +
        Number(item.stake || 0),
      0
    );


  const payout =
    history.reduce(
      (sum, item) =>
        sum +
        Number(item.payout || 0),
      0
    );


  const profit =
    history.reduce(
      (sum, item) =>
        sum +
        Number(item.profit || 0),
      0
    );


  state.stats = {

    total,

    wins,

    losses,

    stake,

    payout,

    profit

  };


  state.sessionProfit =
    profit;


  renderStats();

}


function renderStats() {

  const {
    total,
    wins,
    losses,
    stake,
    payout,
    profit
  } = state.stats;


  const accuracy =
    total
      ? Math.round(
          (wins / total) *
          100
        )
      : 0;


  /*
    Existing HTML calls these "paper..."
    We reuse the IDs so the current UI
    does not break. They now represent
    actual Deriv completed trades.
  */

  if (DOM.paperTotal) {

    DOM.paperTotal.textContent =
      total;

  }


  if (DOM.paperWins) {

    DOM.paperWins.textContent =
      wins;

  }


  if (DOM.paperLosses) {

    DOM.paperLosses.textContent =
      losses;

  }


  if (DOM.paperAccuracy) {

    DOM.paperAccuracy.textContent =
      `${accuracy}%`;

  }


  if (DOM.historyTotalStake) {

    DOM.historyTotalStake.textContent =
      formatMoney(
        stake
      );

  }


  if (DOM.historyAmountWon) {

    DOM.historyAmountWon.textContent =
      formatMoney(
        payout
      );

  }


  if (DOM.historyNetProfit) {

    DOM.historyNetProfit.textContent =
      formatMoney(
        profit
      );

    DOM.historyNetProfit.classList.toggle(
      "positive",
      profit > 0
    );

    DOM.historyNetProfit.classList.toggle(
      "negative",
      profit < 0
    );

  }


  if (DOM.sessionProfitDisplay) {

    DOM.sessionProfitDisplay.textContent =
      formatMoney(
        profit
      );

  }


  if (DOM.totalProfitDisplay) {

    DOM.totalProfitDisplay.textContent =
      formatMoney(
        profit
      );

    DOM.totalProfitDisplay.classList.toggle(
      "positive",
      profit > 0
    );

    DOM.totalProfitDisplay.classList.toggle(
      "negative",
      profit < 0
    );

  }


  renderHistoryCards();

}


/* =========================================================
   HISTORY CARDS
   ========================================================= */

function renderHistoryCards() {

  if (!DOM.historyCardsList) {
    return;
  }


  if (!state.history.length) {

    DOM.historyCardsList.innerHTML = `
      <div class="history-card">
        <div class="history-top">
          <strong>NO COMPLETED TRADES</strong>
          <span class="result">---</span>
        </div>

        <div class="history-details">
          <div>
            <span>STATUS</span>
            <strong>WAITING</strong>
          </div>

          <div>
            <span>ACCOUNT</span>
            <strong>DERIV</strong>
          </div>

          <div>
            <span>MODE</span>
            <strong>${state.tradingMode}</strong>
          </div>

          <div>
            <span>ENGINE</span>
            <strong>READY</strong>
          </div>
        </div>
      </div>
    `;

    return;

  }


  DOM.historyCardsList.innerHTML =
    state.history
      .slice(0, 100)
      .map(
        item =>
          createHistoryCard(
            item
          )
      )
      .join("");

}


function createHistoryCard(
  item
) {

  const win =
    item.result === "WIN";


  const date =
    new Date(
      item.completedAt ||
      item.time ||
      Date.now()
    );


  return `
    <div class="history-card ${
      win
        ? "history-win"
        : "history-loss"
    }">

      <div class="history-top">

        <strong>
          ${escapeHtml(
            item.market || "-"
          )}
          •
          ${escapeHtml(
            item.strategy || "-"
          )}
        </strong>

        <span class="result">
          ${item.result}
          ${formatMoney(
            Number(item.profit || 0)
          )}
        </span>

      </div>

      <div class="history-details">

        <div>
          <span>ENGINE</span>
          <strong>
            ${escapeHtml(
              item.engine || "-"
            )}
          </strong>
        </div>

        <div>
          <span>MODE</span>
          <strong>
            ${escapeHtml(
              item.mode || "-"
            )}
          </strong>
        </div>

        <div>
          <span>STAKE</span>
          <strong>
            ${formatMoney(
              Number(item.stake || 0)
            )}
          </strong>
        </div>

        <div>
          <span>PAYOUT</span>
          <strong>
            ${formatMoney(
              Number(item.payout || 0)
            )}
          </strong>
        </div>

        <div>
          <span>ENTRY</span>
          <strong>
            ${
              item.entryDigit ??
              "-"
            }
          </strong>
        </div>

        <div>
          <span>EXIT</span>
          <strong>
            ${
              item.exitDigit ??
              "-"
            }
          </strong>
        </div>

        <div>
          <span>CONTRACT</span>
          <strong>
            ${escapeHtml(
              String(
                item.contractId ||
                "-"
              ).slice(0, 12)
            )}
          </strong>
        </div>

        <div>
          <span>TIME</span>
          <strong>
            ${date.toLocaleTimeString()}
          </strong>
        </div>

      </div>

    </div>
  `;

}


/* =========================================================
   ACTIVE TRADES UI
   ========================================================= */

function updateActiveTradesUI() {

  const contracts =
    Object.values(
      state.activeContracts
    ).filter(
      contract =>
        !contract.finished
    );


  if (DOM.activeTradeCount) {

    DOM.activeTradeCount.textContent =
      contracts.length;

  }


  if (!DOM.activeTradesList) {
    return;
  }


  if (!contracts.length) {

    DOM.activeTradesList.innerHTML =
      `
        <div class="active-trade">
          <div>
            <strong>NO ACTIVE TRADES</strong>
            <small>Waiting for Deriv contracts</small>
          </div>

          <strong>—</strong>
        </div>
      `;

    return;

  }


  DOM.activeTradesList.innerHTML =
    contracts
      .map(
        contract => `

          <div class="active-trade">

            <div>

              <strong>
                ${escapeHtml(
                  contract.market
                )}
                •
                ${escapeHtml(
                  contract.strategy
                )}
              </strong>

              <small>
                ${escapeHtml(
                  contract.engine
                )}
                •
                ${escapeHtml(
                  contract.status
                )}
              </small>

            </div>

            <div>

              <strong>
                ${formatMoney(
                  Number(
                    contract.currentProfit ||
                    0
                  )
                )}
              </strong>

              <small>
                ${escapeHtml(
                  String(
                    contract.contractId
                  ).slice(0, 12)
                )}
              </small>

            </div>

          </div>
        `
      )
      .join("");

}


/* =========================================================
   UI UPDATE
   ========================================================= */

function updateAllUI() {

  updateModeUI();

  updateConnectionUI();

  updateAccountUI();

  updateStats();

  updateActiveTradesUI();


  if (DOM.botSelectedMarket) {

    DOM.botSelectedMarket.textContent =
      DOM.botMarketSelect?.value ||
      CONFIG.DEFAULT_MARKET;

  }


  if (DOM.manualStatusText) {

    DOM.manualStatusText.textContent =
      state.connectedToDeriv
        ? "READY"
        : "CONNECT DERIV";

  }


  if (DOM.tradingStatusLabel) {

    DOM.tradingStatusLabel.textContent =
      `${state.tradingMode} SESSION`;

  }


  if (DOM.engineStatusText) {

    DOM.engineStatusText.textContent =
      state.authenticatedConnected
        ? `${state.tradingMode} LIVE`
        : "DISCONNECTED";

  }


  updatePlaceButton();

}


/* =========================================================
   CONNECTION UI
   ========================================================= */

function updateConnectionUI() {

  const online =
    state.publicConnected ||
    state.authenticatedConnected;


  if (DOM.connectionDot) {

    DOM.connectionDot.classList.toggle(
      "online",
      online
    );

    DOM.connectionDot.classList.toggle(
      "offline",
      !online
    );

  }


  if (DOM.connectionText) {

    if (
      state.authenticatedConnected
    ) {

      DOM.connectionText.textContent =
        "LIVE";

    } else if (
      state.publicConnected
    ) {

      DOM.connectionText.textContent =
        "MARKET";

    } else {

      DOM.connectionText.textContent =
        "OFFLINE";

    }

  }


  if (DOM.connectDerivBtn) {

    DOM.connectDerivBtn.textContent =
      state.connectedToDeriv
        ? "DERIV CONNECTED"
        : "CONNECT DERIV";

  }

}


/* =========================================================
   MODE UI
   ========================================================= */

function updateModeUI() {

  if (DOM.modeBadge) {

    DOM.modeBadge.textContent =
      state.tradingMode;

    DOM.modeBadge.classList.toggle(
      "demo-mode",
      state.tradingMode === "DEMO"
    );

    DOM.modeBadge.classList.toggle(
      "real-mode",
      state.tradingMode === "REAL"
    );

  }


  if (DOM.tradingStatusLabel) {

    DOM.tradingStatusLabel.textContent =
      `${state.tradingMode} SESSION`;

  }


  updatePlaceButton();

}


function updatePlaceButton() {

  if (!DOM.placeTradeBtn) {
    return;
  }


  DOM.placeTradeBtn.textContent =
    state.tradingMode === "REAL"
      ? "PLACE REAL TRADE"
      : "PLACE DEMO TRADE";

}


/* =========================================================
   ACCOUNT UI
   ========================================================= */

function updateAccountUI() {

  if (DOM.accountId) {

    DOM.accountId.textContent =
      state.accountId ||
      "Not connected";

  }


  if (DOM.balanceDisplay) {

    DOM.balanceDisplay.textContent =
      formatMoney(
        state.derivBalance
      );

  }


  if (DOM.currency) {

    DOM.currency.textContent =
      state.currency ||
      "USD";

  }

}


/* =========================================================
   STATUS
   ========================================================= */

function setStatus(message) {

  if (DOM.dataStatus) {

    DOM.dataStatus.textContent =
      message;

  }

}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message) {

  if (
    !DOM.toast ||
    !DOM.toastMessage
  ) {

    return;

  }


  DOM.toastMessage.textContent =
    message;


  DOM.toast.classList.add(
    "show"
  );


  clearTimeout(
    state.toastTimer
  );


  state.toastTimer =
    setTimeout(
      () => {

        DOM.toast.classList.remove(
          "show"
        );

      },
      3000
    );

}


/* =========================================================
   UTILITIES
   ========================================================= */

function safeNumber(
  value,
  fallback = 0
) {

  const number =
    Number(value);


  return Number.isFinite(number)
    ? number
    : fallback;

}


function clampStake(
  amount
) {

  const value =
    safeNumber(
      amount,
      0.35
    );


  /*
    Current HTML minimum is 0.35.
    Deriv account balance is checked
    before sending the proposal.
  */

  return Math.max(
    0.35,
    Number(
      value.toFixed(2)
    )
  );

}


function formatMoney(
  value
) {

  const number =
    Number(value) || 0;


  const currency =
    state.currency ||
    "USD";


  try {

    return new Intl.NumberFormat(
      undefined,
      {
        style:
          "currency",

        currency,

        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2
      }
    ).format(number);

  } catch (_) {

    return `${currency} ${number.toFixed(2)}`;

  }

}


function getLatestTickKey(
  market
) {

  const ticks =
    state.ticks[market] || [];


  if (!ticks.length) {
    return null;
  }


  const last =
    ticks[ticks.length - 1];


  return `${last.time}-${last.price}`;

}


function getCssVar(
  name
) {

  return getComputedStyle(
    document.body
  ).getPropertyValue(
    name
  ).trim();

}


function escapeHtml(
  value
) {

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
   INITIAL DEFAULT UI
   ========================================================= */

window.addEventListener(
  "load",
  () => {

    if (DOM.manualSelectedStrategyLabel) {

      DOM.manualSelectedStrategyLabel.textContent =
        state.manualStrategy;

    }


    if (DOM.botStrategyLabel) {

      DOM.botStrategyLabel.textContent =
        "MATCHES + DIFFERS";

    }


    if (DOM.circularStrategyLabel) {

      DOM.circularStrategyLabel.textContent =
        "AUTO";

    }


    updateStrategyVisibility();

    updateModeUI();

  }
);


/* =========================================================
   SAFETY: STOP ENGINES WHEN PAGE IS HIDDEN
   ---------------------------------------------------------
   We do NOT automatically place trades when the browser
   is hidden/reloaded. Existing Deriv contracts continue
   on Deriv's server and will still settle normally.
   ========================================================= */

document.addEventListener(
  "visibilitychange",
  () => {

    if (
      document.hidden
    ) {

      /*
        Do not kill an already purchased contract.
        Only stop automatic NEW entries.
      */

      if (state.botRunning) {
        stopBot();
      }

      if (state.circularRunning) {
        stopCircularAI();
      }

    }

  }
);


/* =========================================================
   BEFORE UNLOAD
   ========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    /*
      Stop creating new contracts when leaving.
      Deriv continues monitoring already purchased
      contracts on its own server.
    */

    state.botRunning =
      false;

    state.circularRunning =
      false;

  }
);


/* =========================================================
   END KRISHWAVE AI BEAST
   ========================================================= */