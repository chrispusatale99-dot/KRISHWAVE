/* =========================================================
   KRISHWAVE AI BEAST V7.0
   APP.JS
   ---------------------------------------------------------
   - Deriv OAuth / demo connection
   - Live Volatility Index tick data
   - AI BOT autonomous analysis
   - CIRCULAR AI 10 → 5 → 3 cycle
   - MANUAL trading
   - Strategy chosen shown in Analysis
   - Circular AI shown in Analysis
   - Paper/demo trading engine
   - Trade history
   - Amount won / profit
   - Take Profit / Stop Loss
   - Martingale
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const DERIV_CLIENT_ID = "34khasPjsT0PCRR8X3Z70";

const REDIRECT_URI =
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const OAUTH_BACKEND =
  "https://krishwave-oauth.chrispusatale99.workers.dev";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";


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

const STRATEGY_LABELS = {
  MATCHES: "Matches",
  DIFFERS: "Differs",
  OVER: "Over",
  UNDER: "Under",
  EVEN: "Even",
  ODD: "Odd"
};


/* =========================================================
   STORAGE
   ========================================================= */

const HISTORY_KEY = "krishwave_v7_history";
const BALANCE_KEY = "krishwave_v7_balance";
const THEME_KEY = "krishwave_theme";
const SETTINGS_KEY = "krishwave_v7_settings";


/* =========================================================
   STATE
   ========================================================= */

const state = {

  connected: false,

  accessToken: null,
  accountId: null,
  currency: "USD",

  paperBalance: 1000,

  engineMode: "ai",

  selectedMarket: "R_10",
  selectedStrategy: "MATCHES",

  botStrategyPool: [
    "MATCHES",
    "DIFFERS"
  ],

  markets: {},

  priceHistory: [],

  history: [],

  activeTrades: [],

  totalProfit: 0,
  totalAmountWon: 0,
  totalStake: 0,

  wins: 0,
  losses: 0,

  aiRunning: false,
  aiCycleToken: 0,

  circularRunning: false,
  circularToken: 0,

  publicWS: null,
  publicReconnectTimer: null,

  botTimer: null,
  circularTimer: null,

  lastBotDecision: null,
  lastCircularPrediction: null,

  botBaseStake: 10,
  botCurrentStake: 10,
  botMartingaleLevel: 0,

  botTakeProfit: 50,
  botStopLoss: 100,
  botSessionStartProfit: 0,

  circularTakeProfit: 50,
  circularStopLoss: 100,
  circularSessionStartProfit: 0,

  tradingStopped: false,

  sessionStartProfit: 0
};


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  loadStorage();

  bindNavigation();

  bindEngineTabs();

  bindTradingControls();

  bindStrategyControls();

  bindHistoryControls();

  bindTheme();

  handleOAuthCallback();

  updateAllUI();

  connectPublicMarketData();

});


/* =========================================================
   STORAGE
   ========================================================= */

function loadStorage() {

  try {

    const history =
      JSON.parse(localStorage.getItem(HISTORY_KEY));

    if (Array.isArray(history)) {
      state.history = history;
    }

  } catch {}

  const balance =
    Number(localStorage.getItem(BALANCE_KEY));

  if (Number.isFinite(balance)) {
    state.paperBalance = balance;
  }

  try {

    const settings =
      JSON.parse(localStorage.getItem(SETTINGS_KEY));

    if (settings) {

      if (Array.isArray(settings.botStrategyPool)) {
        state.botStrategyPool =
          settings.botStrategyPool;
      }

      if (settings.botBaseStake != null) {
        state.botBaseStake =
          Number(settings.botBaseStake);
      }

    }

  } catch {}

  rebuildStatistics();
}

function saveStorage() {

  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(state.history.slice(0, 300))
  );

  localStorage.setItem(
    BALANCE_KEY,
    String(state.paperBalance)
  );

  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      botStrategyPool:
        state.botStrategyPool,
      botBaseStake:
        state.botBaseStake
    })
  );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function bindNavigation() {

  document.querySelectorAll(".nav-btn").forEach(btn => {

    btn.addEventListener("click", () => {

      const page =
        btn.dataset.page;

      document.querySelectorAll(".page")
        .forEach(p => p.classList.remove("active"));

      const target =
        $(page + "Page");

      if (target) {
        target.classList.add("active");
      }

      document.querySelectorAll(".nav-btn")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

    });

  });

}


/* =========================================================
   ENGINE TABS
   ========================================================= */

function bindEngineTabs() {

  const ai = $("tabAiBot");
  const circular = $("tabCircularAI");
  const manual = $("tabManual");

  if (ai) {
    ai.addEventListener("click", () => {
      selectEngine("ai");
    });
  }

  if (circular) {
    circular.addEventListener("click", () => {
      selectEngine("circular");
    });
  }

  if (manual) {
    manual.addEventListener("click", () => {
      selectEngine("manual");
    });
  }

}

function selectEngine(engine) {

  if (engine === "ai") {

    state.engineMode = "ai";

    stopCircularAI(false);

    hide("circularPanel");
    hide("manualPanel");
    show("aiBotPanel");

    setText(
      "engineStatusText",
      "AI BOT SELECTED"
    );

  }

  else if (engine === "circular") {

    state.engineMode = "circular";

    stopAIBot(false);

    hide("aiBotPanel");
    hide("manualPanel");
    show("circularPanel");

    setText(
      "engineStatusText",
      "CIRCULAR AI SELECTED"
    );

  }

  else {

    state.engineMode = "manual";

    stopAIBot(false);
    stopCircularAI(false);

    hide("aiBotPanel");
    hide("circularPanel");
    show("manualPanel");

    setText(
      "engineStatusText",
      "MANUAL SELECTED"
    );

  }

  updateAnalysisColumn();
}


/* =========================================================
   TRADING CONTROLS
   ========================================================= */

function bindTradingControls() {

  const startBot =
    $("startBotBtn") || $("startAI");

  if (startBot) {
    startBot.addEventListener(
      "click",
      startAIBot
    );
  }

  const stopBot =
    $("stopAI");

  if (stopBot) {
    stopBot.addEventListener(
      "click",
      () => stopAIBot(true)
    );
  }

  const circularStart =
    $("startCircularTradeBtn");

  if (circularStart) {
    circularStart.addEventListener(
      "click",
      startCircularAI
    );
  }

  const manualTrade =
    $("placeTradeBtn");

  if (manualTrade) {
    manualTrade.addEventListener(
      "click",
      executeManualTrade
    );
  }

  const stopAll =
    $("stopTradingBtn");

  if (stopAll) {
    stopAll.addEventListener(
      "click",
      stopAllTrading
    );
  }

}


/* =========================================================
   STRATEGY CONTROLS
   ========================================================= */

function bindStrategyControls() {

  document.querySelectorAll(".strategy-option")
    .forEach(option => {

      option.addEventListener("click", () => {

        const strategy =
          option.dataset.strategy;

        if (!strategy) return;

        state.selectedStrategy =
          strategy;

        updateStrategyLabels();

        updateAnalysisColumn();

      });

    });


  document.querySelectorAll(".bot-strategy-check")
    .forEach(check => {

      check.addEventListener("change", () => {

        const strategy =
          check.value ||
          check.dataset.strategy;

        if (!strategy) return;

        if (check.checked) {

          if (!state.botStrategyPool.includes(strategy)) {
            state.botStrategyPool.push(strategy);
          }

        } else {

          state.botStrategyPool =
            state.botStrategyPool.filter(
              s => s !== strategy
            );

        }

        if (
          state.botStrategyPool.length === 0
        ) {
          state.botStrategyPool = [
            "MATCHES"
          ];
        }

        saveStorage();

      });

    });


  const apply =
    $("applyBotStrategies");

  if (apply) {

    apply.addEventListener("click", () => {

      hide("botStrategyModal");

      setText(
        "botStrategyLabel",
        state.botStrategyPool
          .map(s => STRATEGY_LABELS[s])
          .join(" • ")
      );

      updateAnalysisColumn();

    });

  }


  const close =
    $("closeStrategyModal");

  if (close) {
    close.addEventListener(
      "click",
      () => hide("strategyModal")
    );
  }


  const closeBot =
    $("closeBotStrategyModal");

  if (closeBot) {
    closeBot.addEventListener(
      "click",
      () => hide("botStrategyModal")
    );
  }

}


function updateStrategyLabels() {

  setText(
    "botStrategyLabel",
    state.botStrategyPool
      .map(s => STRATEGY_LABELS[s])
      .join(" • ")
  );

  setText(
    "manualSelectedStrategyLabel",
    STRATEGY_LABELS[state.selectedStrategy] ||
    state.selectedStrategy
  );

  setText(
    "circularStrategyLabel",
    STRATEGY_LABELS[state.selectedStrategy] ||
    state.selectedStrategy
  );

}


/* =========================================================
   HISTORY CONTROLS
   ========================================================= */

function bindHistoryControls() {

  const clear =
    $("clearLogsBtn");

  if (clear) {

    clear.addEventListener("click", () => {

      if (
        !confirm(
          "Clear KRISHWAVE trade history?"
        )
      ) return;

      state.history = [];

      rebuildStatistics();

      saveStorage();

      renderHistory();

      updateAllUI();

    });

  }

}


/* =========================================================
   THEME
   ========================================================= */

function bindTheme() {

  const saved =
    localStorage.getItem(THEME_KEY);

  if (saved === "light") {
    document.body.classList.add("light");
  }

  document.querySelectorAll(
    "[data-theme], #themeToggle, #themeBtn"
  ).forEach(btn => {

    btn.addEventListener("click", () => {

      document.body.classList.toggle("light");

      localStorage.setItem(
        THEME_KEY,
        document.body.classList.contains("light")
          ? "light"
          : "dark"
      );

    });

  });

}


/* =========================================================
   OAUTH
   ========================================================= */

function randomString(length = 64) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  let result = "";

  const array =
    new Uint8Array(length);

  crypto.getRandomValues(array);

  for (let i = 0; i < length; i++) {
    result += chars[
      array[i] % chars.length
    ];
  }

  return result;
}


async function sha256Base64Url(text) {

  const data =
    new TextEncoder().encode(text);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  const bytes =
    new Uint8Array(hash);

  let binary = "";

  bytes.forEach(
    b => binary += String.fromCharCode(b)
  );

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


async function connectDeriv() {

  const verifier =
    randomString();

  const challenge =
    await sha256Base64Url(verifier);

  const stateValue =
    randomString(32);

  sessionStorage.setItem(
    "krishwave_code_verifier",
    verifier
  );

  sessionStorage.setItem(
    "krishwave_oauth_state",
    stateValue
  );

  const url =
    new URL(
      "https://auth.deriv.com/oauth2/auth"
    );

  url.searchParams.set(
    "response_type",
    "code"
  );

  url.searchParams.set(
    "client_id",
    DERIV_CLIENT_ID
  );

  url.searchParams.set(
    "redirect_uri",
    REDIRECT_URI
  );

  url.searchParams.set(
    "scope",
    "trade"
  );

  url.searchParams.set(
    "state",
    stateValue
  );

  url.searchParams.set(
    "code_challenge",
    challenge
  );

  url.searchParams.set(
    "code_challenge_method",
    "S256"
  );

  window.location.href =
    url.toString();
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

  if (!code) return;

  const savedState =
    sessionStorage.getItem(
      "krishwave_oauth_state"
    );

  if (
    savedState &&
    returnedState &&
    savedState !== returnedState
  ) {

    console.error(
      "OAuth state mismatch"
    );

    return;
  }

  const verifier =
    sessionStorage.getItem(
      "krishwave_code_verifier"
    );

  if (!verifier) {
    console.error(
      "Missing PKCE verifier"
    );
    return;
  }

  setConnectionStatus(
    "CONNECTING",
    false
  );

  try {

    const response =
      await fetch(
        OAUTH_BACKEND,
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

    if (!data.success) {
      throw new Error(
        data.error ||
        "OAuth connection failed"
      );
    }

    state.accessToken =
      data.access_token;

    state.connected = true;

    sessionStorage.removeItem(
      "krishwave_code_verifier"
    );

    sessionStorage.removeItem(
      "krishwave_oauth_state"
    );

    window.history.replaceState(
      {},
      document.title,
      REDIRECT_URI
    );

    await loadDerivAccount();

    setConnectionStatus(
      "CONNECTED",
      true
    );

  } catch (error) {

    console.error(error);

    state.connected = false;

    setConnectionStatus(
      "CONNECTION FAILED",
      false
    );

  }

}


async function loadDerivAccount() {

  if (!state.accessToken) return;

  try {

    const response =
      await fetch(
        "https://api.derivws.com/trading/v1/options/accounts",
        {
          headers: {
            Authorization:
              `Bearer ${state.accessToken}`
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        "Account request failed"
      );
    }

    const data =
      await response.json();

    const accounts =
      data.data ||
      data.accounts ||
      [];

    if (!Array.isArray(accounts)) {
      return;
    }

    /*
     * Prefer DEMO account.
     */

    let demo =
      accounts.find(
        account =>
          String(
            account.account_type ||
            account.type ||
            ""
          ).toLowerCase() === "demo"
      );

    if (!demo) {

      demo =
        accounts.find(
          account =>
            String(
              account.id ||
              account.account_id ||
              ""
            ).startsWith("VRTC")
        );

    }

    const selected =
      demo || accounts[0];

    if (selected) {

      state.accountId =
        selected.id ||
        selected.account_id ||
        null;

      state.currency =
        selected.currency ||
        state.currency;

    }

    setText(
      "accountId",
      state.accountId ||
      "DEMO"
    );

    setText(
      "currency",
      state.currency
    );

    await getAuthenticatedSocket();

  } catch (error) {

    console.error(
      "Account load error:",
      error
    );

    /*
     * Public data continues even if
     * authenticated account data fails.
     */

  }

}


async function getAuthenticatedSocket() {

  if (
    !state.accessToken ||
    !state.accountId
  ) {
    return;
  }

  try {

    const response =
      await fetch(
        `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(state.accountId)}/otp`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${state.accessToken}`,

            "Content-Type":
              "application/json"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        "Authenticated OTP request failed"
      );
    }

    const data =
      await response.json();

    const websocketUrl =
      data.data?.ws_url ||
      data.ws_url ||
      data.data?.websocket_url;

    if (websocketUrl) {
      console.log(
        "Authenticated demo WebSocket ready"
      );
    }

  } catch (error) {

    console.warn(
      "Authenticated WebSocket:",
      error
    );

  }

}


/* =========================================================
   CONNECTION UI
   ========================================================= */

function setConnectionStatus(
  text,
  connected
) {

  setText(
    "connectionText",
    text
  );

  const dot =
    $("connectionDot");

  if (dot) {

    dot.classList.toggle(
      "connected",
      connected
    );

  }

  const btn =
    $("connectDerivBtn");

  if (btn) {

    btn.textContent =
      connected
        ? "DERIV CONNECTED"
        : "CONNECT DERIV";

    if (connected) {
      btn.classList.add("connected");
    } else {
      btn.classList.remove("connected");
    }

  }

}


/* =========================================================
   PUBLIC LIVE DATA
   ========================================================= */

function connectPublicMarketData() {

  if (state.publicWS) {

    try {
      state.publicWS.close();
    } catch {}

  }

  setText(
    "dataStatus",
    "CONNECTING LIVE DATA..."
  );

  const ws =
    new WebSocket(PUBLIC_WS);

  state.publicWS = ws;

  ws.onopen = () => {

    setText(
      "dataStatus",
      "LIVE DERIV DATA"
    );

    MARKETS.forEach(symbol => {

      try {

        ws.send(
          JSON.stringify({
            ticks: symbol,
            subscribe: 1
          })
        );

      } catch {}

    });

  };


  ws.onmessage = event => {

    try {

      const msg =
        JSON.parse(event.data);

      if (msg.tick) {

        processTick(
          msg.tick
        );

      }

    } catch (error) {

      console.warn(
        "Tick parse error",
        error
      );

    }

  };


  ws.onerror = () => {

    setText(
      "dataStatus",
      "DATA ERROR"
    );

  };


  ws.onclose = () => {

    setText(
      "dataStatus",
      "RECONNECTING..."
    );

    clearTimeout(
      state.publicReconnectTimer
    );

    state.publicReconnectTimer =
      setTimeout(
        connectPublicMarketData,
        3000
      );

  };

}


function processTick(tick) {

  const symbol =
    tick.symbol;

  if (!symbol) return;

  if (!state.markets[symbol]) {

    state.markets[symbol] = {
      ticks: [],
      prices: [],
      lastTick: null
    };

  }

  const market =
    state.markets[symbol];

  const digit =
    getLastDigitFromTick(tick);

  const quote =
    Number(tick.quote);

  market.lastTick = tick;

  if (Number.isFinite(quote)) {

    market.prices.push(quote);

    if (market.prices.length > 100) {
      market.prices.shift();
    }

  }

  if (digit !== null) {

    market.ticks.push(digit);

    if (market.ticks.length > 100) {
      market.ticks.shift();
    }

  }

  if (
    symbol === state.selectedMarket
  ) {

    updateSelectedMarketUI();

  }

  settlePendingTrades(
    symbol,
    digit
  );

  updateAnalysisColumn();

}


/* =========================================================
   LAST DIGIT
   ========================================================= */

function getLastDigitFromTick(tick) {

  const quote =
    Number(tick.quote);

  if (!Number.isFinite(quote)) {
    return null;
  }

  let pipSize =
    Number(tick.pip_size);

  if (
    !Number.isFinite(pipSize) ||
    pipSize <= 0
  ) {

    const quoteString =
      String(tick.quote);

    const decimals =
      quoteString.includes(".")
        ? quoteString.split(".")[1].length
        : 0;

    pipSize =
      Math.pow(
        10,
        -decimals
      );

  }

  const scaled =
    Math.round(
      quote / pipSize
    );

  return Math.abs(scaled) % 10;
}


/* =========================================================
   MARKET ANALYSIS
   ========================================================= */

function calculateEntropy(counts, total) {

  if (!total) return 1;

  let entropy = 0;

  counts.forEach(count => {

    if (!count) return;

    const p =
      count / total;

    entropy -=
      p * Math.log2(p);

  });

  return entropy /
    Math.log2(10);
}


function analyzeMarket(symbol) {

  const market =
    state.markets[symbol];

  if (
    !market ||
    market.ticks.length < 20
  ) {

    return null;

  }

  const ticks =
    market.ticks.slice(-30);

  const counts =
    Array(10).fill(0);

  ticks.forEach(
    d => counts[d]++
  );

  const total =
    ticks.length;

  const percentages =
    counts.map(
      c => (c / total) * 100
    );

  let hottestDigit = 0;
  let coldestDigit = 0;

  for (let i = 1; i < 10; i++) {

    if (
      counts[i] >
      counts[hottestDigit]
    ) {
      hottestDigit = i;
    }

    if (
      counts[i] <
      counts[coldestDigit]
    ) {
      coldestDigit = i;
    }

  }

  const evenCount =
    ticks.filter(
      d => d % 2 === 0
    ).length;

  const overCount =
    ticks.filter(
      d => d > 5
    ).length;

  const underCount =
    ticks.filter(
      d => d < 5
    ).length;

  const evenRate =
    evenCount / total;

  const overRate =
    overCount / total;

  const underRate =
    underCount / total;

  const concentration =
    Math.max(
      ...percentages
    ) / 100;

  let streak = 1;

  const last =
    ticks[ticks.length - 1];

  for (
    let i = ticks.length - 2;
    i >= 0;
    i--
  ) {

    if (ticks[i] === last) {
      streak++;
    } else {
      break;
    }

  }

  const entropy =
    calculateEntropy(
      counts,
      total
    );

  const stability =
    1 - entropy;

  let score = 50;

  score +=
    Math.abs(
      evenRate - 0.5
    ) * 30;

  score +=
    Math.abs(
      overRate - 0.5
    ) * 25;

  score +=
    Math.min(
      streak * 2,
      12
    );

  score +=
    Math.min(
      Math.abs(
        concentration - 0.10
      ) * 30,
      15
    );

  score =
    Math.max(
      0,
      Math.min(
        100,
        score
      )
    );

  const agreement =
    calculateAgreement(
      ticks
    );

  let strength =
    "WEAK";

  if (score >= 75) {
    strength = "STRONG";
  } else if (score >= 62) {
    strength = "GOOD";
  } else if (score >= 52) {
    strength = "MODERATE";
  }

  return {

    symbol,

    ticks,

    counts,

    percentages,

    total,

    lastDigit: last,

    hottestDigit,

    coldestDigit,

    evenRate,

    overRate,

    underRate,

    concentration,

    streak,

    entropy,

    stability,

    score,

    strength,

    agreement

  };

}


function calculateAgreement(ticks) {

  const recent =
    ticks.slice(-12);

  if (!recent.length) {
    return 0.5;
  }

  const even =
    recent.filter(
      d => d % 2 === 0
    ).length /
    recent.length;

  const directional =
    Math.max(
      recent.filter(d => d > 5).length,
      recent.filter(d => d < 5).length
    ) /
    recent.length;

  return Math.min(
    1,
    (
      Math.abs(even - 0.5) +
      Math.abs(directional - 0.5)
    ) / 1.5 +
    0.5
  );

}


/* =========================================================
   BEST MARKET
   ========================================================= */

function chooseBestMarket() {

  const analyses =
    MARKETS
      .map(analyzeMarket)
      .filter(Boolean);

  if (!analyses.length) {
    return null;
  }

  analyses.sort(
    (a, b) =>
      (
        b.score +
        b.agreement * 20
      ) -
      (
        a.score +
        a.agreement * 20
      )
  );

  return analyses[0];
}


/* =========================================================
   AI STRATEGY
   ========================================================= */

function chooseBotStrategy(
  analysis
) {

  const pool =
    state.botStrategyPool.length
      ? state.botStrategyPool
      : ["MATCHES"];

  const scores = {};

  pool.forEach(strategy => {

    let score =
      analysis.agreement * 25;

    switch (strategy) {

      case "MATCHES":

        score +=
          analysis.concentration * 100;

        break;

      case "DIFFERS":

        score +=
          (1 -
            analysis.concentration) *
          100;

        break;

      case "EVEN":

      case "ODD":

        score +=
          Math.abs(
            analysis.evenRate - 0.5
          ) * 100;

        break;

      case "OVER":

        score +=
          Math.abs(
            analysis.overRate - 0.5
          ) * 100;

        break;

      case "UNDER":

        score +=
          Math.abs(
            analysis.underRate - 0.5
          ) * 100;

        break;

    }

    scores[strategy] =
      score;

  });

  return pool.reduce(
    (best, strategy) =>
      scores[strategy] >
      scores[best]
        ? strategy
        : best,
    pool[0]
  );

}


/* =========================================================
   PREDICTION
   ========================================================= */

function createPrediction(
  analysis,
  strategy
) {

  let digit =
    analysis.hottestDigit;

  switch (strategy) {

    case "MATCHES":

      digit =
        analysis.hottestDigit;

      break;

    case "DIFFERS":

      digit =
        analysis.hottestDigit;

      break;

    case "OVER":

      digit =
        analysis.hottestDigit > 5
          ? analysis.hottestDigit
          : 6;

      break;

    case "UNDER":

      digit =
        analysis.hottestDigit < 5
          ? analysis.hottestDigit
          : 4;

      break;

    case "EVEN":

      digit =
        findBestParityDigit(
          analysis,
          true
        );

      break;

    case "ODD":

      digit =
        findBestParityDigit(
          analysis,
          false
        );

      break;

  }

  const confidence =
    Math.max(
      50,
      Math.min(
        95,
        50 +
        Math.abs(
          analysis.concentration -
          0.10
        ) * 1.5 +
        analysis.score * 0.25 +
        Math.min(
          analysis.streak * 1.5,
          10
        )
      )
    );

  return {

    strategy,

    digit,

    confidence,

    text:
      `${STRATEGY_LABELS[strategy]} ${digit}`

  };

}


function findBestParityDigit(
  analysis,
  even
) {

  let best =
    even ? 0 : 1;

  for (let d = 0; d < 10; d++) {

    if (
      d % 2 ===
      (even ? 0 : 1)
    ) {

      if (
        analysis.counts[d] >
        analysis.counts[best]
      ) {
        best = d;
      }

    }

  }

  return best;

}


/* =========================================================
   AI BOT
   ========================================================= */

async function startAIBot() {

  if (state.aiRunning) return;

  stopCircularAI(false);

  state.engineMode = "ai";
  state.aiRunning = true;
  state.tradingStopped = false;

  state.botBaseStake =
    readNumber(
      "stakeInput",
      state.botBaseStake || 10
    );

  state.botCurrentStake =
    state.botBaseStake;

  state.botMartingaleLevel = 0;

  state.botTakeProfit =
    readNumber(
      "takeProfitInput",
      50
    );

  state.botStopLoss =
    readNumber(
      "stopLossInput",
      100
    );

  state.botSessionStartProfit =
    state.totalProfit;

  state.aiCycleToken++;

  const token =
    state.aiCycleToken;

  setText(
    "botStatusDash",
    "AI BOT RUNNING"
  );

  setText(
    "engineStatusText",
    "AI BOT — AUTONOMOUS"
  );

  updateAnalysisColumn();

  aiBotLoop(token);

}


async function aiBotLoop(token) {

  while (
    state.aiRunning &&
    token === state.aiCycleToken &&
    !state.tradingStopped
  ) {

    setText(
      "aiStatus",
      "ANALYZING..."
    );

    setText(
      "botStatusDash",
      "ANALYZING — 3 SEC"
    );

    updateAnalysisColumn();

    await countdown(
      3,
      "aiStatus"
    );

    if (
      !state.aiRunning ||
      token !== state.aiCycleToken
    ) {
      break;
    }

    const analysis =
      chooseBestMarket();

    if (!analysis) {

      setText(
        "aiStatus",
        "COLLECTING DATA"
      );

      await sleep(1500);

      continue;
    }

    state.selectedMarket =
      analysis.symbol;

    const strategy =
      chooseBotStrategy(
        analysis
      );

    const prediction =
      createPrediction(
        analysis,
        strategy
      );

    state.lastBotDecision = {

      engine: "AI BOT",

      market:
        analysis.symbol,

      strategy,

      prediction:
        prediction.digit,

      confidence:
        prediction.confidence,

      score:
        analysis.score,

      time:
        Date.now()

    };

    updateAIDisplay(
      analysis,
      prediction
    );

    updateAnalysisColumn();

    /*
     * IMPORTANT:
     * AI BOT trades immediately
     * after the 3-second analysis.
     */

    createPaperTrade({

      engine: "AI BOT",

      market:
        analysis.symbol,

      strategy,

      prediction:
        prediction.digit,

      confidence:
        prediction.confidence,

      stake:
        state.botCurrentStake,

      takeProfit:
        state.botTakeProfit,

      stopLoss:
        state.botStopLoss,

      martingaleLevel:
        state.botMartingaleLevel

    });

    updateAnalysisColumn();

    await sleep(1800);

    if (
      checkSessionLimit(
        "bot"
      )
    ) {
      break;
    }

  }

}


/* =========================================================
   STOP AI BOT
   ========================================================= */

function stopAIBot(update = true) {

  state.aiRunning = false;

  state.aiCycleToken++;

  if (state.botTimer) {

    clearTimeout(
      state.botTimer
    );

    state.botTimer = null;

  }

  setText(
    "botStatusDash",
    "AI BOT STANDBY"
  );

  if (update) {
    updateAnalysisColumn();
  }

}


/* =========================================================
   CIRCULAR AI
   ========================================================= */

async function startCircularAI() {

  if (state.circularRunning) {
    return;
  }

  stopAIBot(false);

  state.engineMode =
    "circular";

  state.circularRunning =
    true;

  state.tradingStopped =
    false;

  state.circularTakeProfit =
    readNumber(
      "circularTakeProfitInput",
      50
    );

  state.circularStopLoss =
    readNumber(
      "circularStopLossInput",
      100
    );

  state.circularSessionStartProfit =
    state.totalProfit;

  state.circularToken++;

  const token =
    state.circularToken;

  setText(
    "circularStatusText",
    "CIRCULAR AI RUNNING"
  );

  setText(
    "engineStatusText",
    "CIRCULAR AI — 10 → 5 → 3"
  );

  updateAnalysisColumn();

  circularLoop(token);

}


async function circularLoop(token) {

  while (
    state.circularRunning &&
    token === state.circularToken &&
    !state.tradingStopped
  ) {

    const market =
      getCircularMarket();

    if (!market) {

      setText(
        "circularStatusText",
        "COLLECTING DATA"
      );

      await sleep(1500);

      continue;
    }

    state.selectedMarket =
      market.symbol;

    /*
     * PHASE 1
     * 10 SECOND ANALYSIS
     */

    setText(
      "circularStatusText",
      "ANALYSIS — 10 SEC"
    );

    setText(
      "cycleAnalysis",
      "10"
    );

    updateCircularAnalysis(
      market,
      "ANALYSIS",
      10
    );

    await countdown(
      10,
      "aiCircleTimer"
    );

    if (
      !state.circularRunning ||
      token !== state.circularToken
    ) {
      break;
    }

    /*
     * PHASE 2
     * 5 SECOND PREDICTION
     */

    const strategy =
      chooseBotStrategy(
        market
      );

    const prediction =
      createPrediction(
        market,
        strategy
      );

    state.lastCircularPrediction = {

      market:
        market.symbol,

      strategy,

      prediction:
        prediction.digit,

      confidence:
        prediction.confidence

    };

    setText(
      "circularStatusText",
      "PREDICTION — 5 SEC"
    );

    updateCircularAnalysis(
      market,
      "PREDICTION",
      5,
      strategy,
      prediction
    );

    await countdown(
      5,
      "aiCircleTimer"
    );

    if (
      !state.circularRunning ||
      token !== state.circularToken
    ) {
      break;
    }

    /*
     * PHASE 3
     * 3 SECOND TRADE NOW
     */

    setText(
      "circularStatusText",
      "TRADE NOW — 3 SEC"
    );

    updateCircularAnalysis(
      market,
      "TRADE NOW",
      3,
      strategy,
      prediction
    );

    await countdown(
      3,
      "aiCircleTimer"
    );

    if (
      !state.circularRunning ||
      token !== state.circularToken
    ) {
      break;
    }

    const stake =
      readNumber(
        "circularStakeInput",
        10
      );

    createPaperTrade({

      engine:
        "CIRCULAR AI",

      market:
        market.symbol,

      strategy,

      prediction:
        prediction.digit,

      confidence:
        prediction.confidence,

      stake,

      takeProfit:
        state.circularTakeProfit,

      stopLoss:
        state.circularStopLoss,

      martingaleLevel:
        0

    });

    updateAnalysisColumn();

    setText(
      "circularStatusText",
      "COOLDOWN"
    );

    setText(
      "cycleCooldown",
      "WAIT"
    );

    await sleep(3000);

    if (
      checkSessionLimit(
        "circular"
      )
    ) {
      break;
    }

  }

}


function getCircularMarket() {

  const selected =
    $("circularMarketSelect")?.value;

  if (
    selected &&
    state.markets[selected]
  ) {

    const analysis =
      analyzeMarket(selected);

    if (analysis) {
      return analysis;
    }

  }

  return chooseBestMarket();

}


/* =========================================================
   STOP CIRCULAR
   ========================================================= */

function stopCircularAI(
  update = true
) {

  state.circularRunning =
    false;

  state.circularToken++;

  if (state.circularTimer) {

    clearTimeout(
      state.circularTimer
    );

    state.circularTimer = null;

  }

  setText(
    "circularStatusText",
    "CIRCULAR AI STANDBY"
  );

  if (update) {
    updateAnalysisColumn();
  }

}


/* =========================================================
   MANUAL TRADE
   ========================================================= */

function executeManualTrade() {

  stopAIBot(false);
  stopCircularAI(false);

  state.engineMode =
    "manual";

  state.tradingStopped =
    false;

  const market =
    $("manualMarketSelect")?.value ||
    state.selectedMarket;

  const strategy =
    state.selectedStrategy;

  const stake =
    readNumber(
      "manualStakeInput",
      10
    );

  const targetDigit =
    readNumber(
      "manualTargetDigitInput",
      5
    );

  const takeProfit =
    readNumber(
      "manualTakeProfitInput",
      50
    );

  const stopLoss =
    readNumber(
      "manualStopLossInput",
      100
    );

  state.selectedMarket =
    market;

  createPaperTrade({

    engine: "MANUAL",

    market,

    strategy,

    prediction:
      targetDigit,

    confidence: null,

    stake,

    takeProfit,

    stopLoss,

    martingaleLevel: 0

  });

  setText(
    "manualStatusText",
    "TRADE PLACED"
  );

  updateAnalysisColumn();

}


/* =========================================================
   COUNTDOWN
   ========================================================= */

async function countdown(
  seconds,
  elementId
) {

  for (
    let i = seconds;
    i > 0;
    i--
  ) {

    setText(
      elementId,
      String(i)
    );

    await sleep(1000);

  }

  setText(
    elementId,
    "0"
  );

}


/* =========================================================
   PAPER TRADE
   ========================================================= */

function createPaperTrade(data) {

  if (
    !Number.isFinite(
      Number(data.stake)
    ) ||
    Number(data.stake) <= 0
  ) {
    return;
  }

  const stake =
    Number(data.stake);

  if (
    stake >
    state.paperBalance
  ) {

    setText(
      "analysisMsg",
      "Insufficient demo/paper balance."
    );

    return;

  }

  state.paperBalance -=
    stake;

  const now =
    new Date();

  const trade = {

    id:
      "KW-" +
      Date.now() +
      "-" +
      Math.random()
        .toString(36)
        .slice(2, 7),

    timestamp:
      Date.now(),

    time:
      now.toLocaleTimeString(),

    engine:
      data.engine,

    market:
      data.market,

    strategy:
      data.strategy,

    prediction:
      data.prediction,

    confidence:
      data.confidence,

    stake,

    takeProfit:
      data.takeProfit,

    stopLoss:
      data.stopLoss,

    martingaleLevel:
      data.martingaleLevel || 0,

    result: null,

    resultDigit: null,

    status: "PENDING",

    amountWon: 0,

    payout: 0,

    profit: 0

  };

  state.activeTrades.push(
    trade
  );

  state.totalStake +=
    stake;

  renderActiveTrades();

  updateBalanceUI();

  saveStorage();

}


/* =========================================================
   SETTLE TRADES
   ========================================================= */

function settlePendingTrades(
  symbol,
  digit
) {

  if (digit === null) {
    return;
  }

  const pending =
    state.activeTrades.filter(
      trade =>
        trade.market === symbol &&
        trade.status === "PENDING"
    );

  if (!pending.length) {
    return;
  }

  pending.forEach(
    trade => {

      const won =
        evaluateTrade(
          trade,
          digit
        );

      settleTrade(
        trade,
        digit,
        won
      );

    }
  );

  updateAllUI();

}


/* =========================================================
   EVALUATE
   ========================================================= */

function evaluateTrade(
  trade,
  digit
) {

  switch (
    trade.strategy
  ) {

    case "MATCHES":
      return digit ===
        Number(trade.prediction);

    case "DIFFERS":
      return digit !==
        Number(trade.prediction);

    case "EVEN":
      return digit % 2 === 0;

    case "ODD":
      return digit % 2 !== 0;

    case "OVER":
      return digit >
        Number(trade.prediction);

    case "UNDER":
      return digit <
        Number(trade.prediction);

    default:
      return false;

  }

}


/* =========================================================
   SETTLE TRADE
   ========================================================= */

function settleTrade(
  trade,
  digit,
  won
) {

  trade.resultDigit =
    digit;

  trade.result =
    won
      ? "WIN"
      : "LOSS";

  trade.status =
    won
      ? "WON"
      : "LOST";

  if (won) {

    const multiplier =
      getPaperMultiplier(
        trade.strategy
      );

    const payout =
      trade.stake *
      multiplier;

    const profit =
      payout -
      trade.stake;

    trade.payout =
      payout;

    trade.amountWon =
      payout;

    trade.profit =
      profit;

    state.paperBalance +=
      payout;

    state.totalAmountWon +=
      payout;

    state.totalProfit +=
      profit;

    state.wins++;

    if (
      trade.engine === "AI BOT"
    ) {

      state.botCurrentStake =
        state.botBaseStake;

      state.botMartingaleLevel = 0;

    }

  } else {

    trade.payout = 0;

    trade.amountWon = 0;

    trade.profit =
      -trade.stake;

    state.totalProfit -=
      trade.stake;

    state.losses++;

    if (
      trade.engine === "AI BOT"
    ) {

      state.botMartingaleLevel++;

      state.botCurrentStake =
        Math.min(
          state.botBaseStake *
          Math.pow(
            2.1,
            state.botMartingaleLevel
          ),
          Math.max(
            state.botBaseStake,
            state.paperBalance
          )
        );

    }

  }

  state.activeTrades =
    state.activeTrades.filter(
      t => t.id !== trade.id
    );

  state.history.unshift(
    trade
  );

  state.history =
    state.history.slice(0, 300);

  rebuildStatistics();

  saveStorage();

  renderHistory();

  renderActiveTrades();

  updateBalanceUI();

}


/* =========================================================
   PAPER MULTIPLIERS
   =========================================================
   Simulation only.
   These are NOT live Deriv payout rates.
   ========================================================= */

function getPaperMultiplier(
  strategy
) {

  switch (strategy) {

    case "MATCHES":
      return 8.5;

    case "DIFFERS":
      return 0.09;

    case "EVEN":
    case "ODD":
    case "OVER":
    case "UNDER":
      return 0.95;

    default:
      return 0.95;

  }

}


/* =========================================================
   SESSION LIMITS
   ========================================================= */

function checkSessionLimit(
  engine
) {

  const baseline =
    engine === "bot"
      ? state.botSessionStartProfit
      : state.circularSessionStartProfit;

  const profit =
    state.totalProfit -
    baseline;

  const takeProfit =
    engine === "bot"
      ? state.botTakeProfit
      : state.circularTakeProfit;

  const stopLoss =
    engine === "bot"
      ? state.botStopLoss
      : state.circularStopLoss;

  if (
    takeProfit > 0 &&
    profit >= takeProfit
  ) {

    if (engine === "bot") {
      stopAIBot(false);
    } else {
      stopCircularAI(false);
    }

    setText(
      "analysisMsg",
      `${engine.toUpperCase()} TAKE PROFIT reached.`
    );

    updateAnalysisColumn();

    return true;

  }

  if (
    stopLoss > 0 &&
    profit <= -stopLoss
  ) {

    if (engine === "bot") {
      stopAIBot(false);
    } else {
      stopCircularAI(false);
    }

    setText(
      "analysisMsg",
      `${engine.toUpperCase()} STOP LOSS reached.`
    );

    updateAnalysisColumn();

    return true;

  }

  return false;

}


/* =========================================================
   STOP ALL TRADING
   ========================================================= */

function stopAllTrading() {

  state.tradingStopped =
    true;

  stopAIBot(false);

  stopCircularAI(false);

  setText(
    "tradingStatusLabel",
    "STOPPED"
  );

  setText(
    "engineStatusText",
    "ALL TRADING STOPPED"
  );

  setText(
    "analysisMsg",
    "KRISHWAVE trading engines stopped."
  );

  updateAnalysisColumn();

}


/* =========================================================
   AI DISPLAY
   ========================================================= */

function updateAIDisplay(
  analysis,
  prediction
) {

  setText(
    "aiStatus",
    "AI BOT READY"
  );

  setText(
    "aiMarket",
    analysis.symbol
  );

  setText(
    "aiPrediction",
    prediction.digit
  );

  setText(
    "aiType",
    STRATEGY_LABELS[
      prediction.strategy
    ]
  );

  setText(
    "analysisConfidence",
    `${prediction.confidence.toFixed(1)}%`
  );

  setText(
    "aiPredictionLarge",
    prediction.digit
  );

  setText(
    "predictionConfidence",
    `${prediction.confidence.toFixed(1)}%`
  );

  setText(
    "reportMarket",
    analysis.symbol
  );

  setText(
    "reportScore",
    analysis.score.toFixed(1)
  );

  setText(
    "reportStrength",
    analysis.strength
  );

  setText(
    "reportStability",
    `${(
      analysis.stability * 100
    ).toFixed(1)}%`
  );

  setText(
    "reportConcentration",
    `${(
      analysis.concentration * 100
    ).toFixed(1)}%`
  );

  setText(
    "reportStreak",
    String(analysis.streak)
  );

  setText(
    "reportAgreement",
    `${(
      analysis.agreement * 100
    ).toFixed(1)}%`
  );

}


/* =========================================================
   CIRCULAR DISPLAY
   ========================================================= */

function updateCircularAnalysis(
  analysis,
  phase,
  timer,
  strategy = null,
  prediction = null
) {

  setText(
    "aiCircleLabel",
    "CIRCULAR AI"
  );

  setText(
    "aiCircleStatus",
    phase
  );

  setText(
    "aiCircleTimer",
    String(timer)
  );

  setText(
    "aiCirclePrediction",
    prediction
      ? String(prediction.digit)
      : "--"
  );

  setText(
    "cycleAnalysis",
    phase
  );

  setText(
    "cyclePrediction",
    prediction
      ? String(prediction.digit)
      : "--"
  );

  setText(
    "cycleTrade",
    phase === "TRADE NOW"
      ? "TRADE NOW"
      : "--"
  );

  /*
   * New/important analysis values.
   */

  setText(
    "circularAnalysisMarket",
    analysis.symbol
  );

  setText(
    "circularAnalysisStrategy",
    strategy
      ? STRATEGY_LABELS[strategy]
      : "SELECTING..."
  );

  setText(
    "circularAnalysisPrediction",
    prediction
      ? String(prediction.digit)
      : "--"
  );

  setText(
    "circularAnalysisConfidence",
    prediction
      ? `${prediction.confidence.toFixed(1)}%`
      : "--"
  );

}


/* =========================================================
   ANALYSIS COLUMN
   =========================================================
   THIS IS THE IMPORTANT FIX:
   Circular AI + Strategy Chosen are explicitly
   pushed into the Analysis column.
   ========================================================= */

function updateAnalysisColumn() {

  const bot =
    state.lastBotDecision;

  const circular =
    state.lastCircularPrediction;

  /*
   * Current engine
   */

  let engineText =
    "AI BOT";

  if (
    state.engineMode === "circular"
  ) {
    engineText =
      "CIRCULAR AI";
  }

  if (
    state.engineMode === "manual"
  ) {
    engineText =
      "MANUAL";
  }

  setText(
    "analysisEngine",
    engineText
  );

  /*
   * AI BOT
   */

  if (bot) {

    setText(
      "analysisBotMarket",
      bot.market
    );

    setText(
      "analysisBotStrategy",
      STRATEGY_LABELS[
        bot.strategy
      ] || bot.strategy
    );

    setText(
      "analysisBotPrediction",
      String(bot.prediction)
    );

    setText(
      "analysisBotConfidence",
      `${Number(
        bot.confidence
      ).toFixed(1)}%`
    );

  } else {

    setText(
      "analysisBotMarket",
      "--"
    );

    setText(
      "analysisBotStrategy",
      "WAITING"
    );

    setText(
      "analysisBotPrediction",
      "--"
    );

    setText(
      "analysisBotConfidence",
      "--"
    );

  }


  /*
   * CIRCULAR AI
   */

  if (circular) {

    setText(
      "analysisCircularStatus",
      state.circularRunning
        ? "RUNNING"
        : "LAST RESULT"
    );

    setText(
      "analysisCircularMarket",
      circular.market ||
      "--"
    );

    setText(
      "analysisCircularStrategy",
      STRATEGY_LABELS[
        circular.strategy
      ] ||
      circular.strategy ||
      "--"
    );

    setText(
      "analysisCircularPrediction",
      circular.prediction != null
        ? String(
            circular.prediction
          )
        : "--"
    );

    setText(
      "analysisCircularConfidence",
      circular.confidence != null
        ? `${Number(
            circular.confidence
          ).toFixed(1)}%`
        : "--"
    );

  } else {

    setText(
      "analysisCircularStatus",
      state.circularRunning
        ? "RUNNING"
        : "STANDBY"
    );

    setText(
      "analysisCircularMarket",
      "--"
    );

    setText(
      "analysisCircularStrategy",
      "WAITING"
    );

    setText(
      "analysisCircularPrediction",
      "--"
    );

    setText(
      "analysisCircularConfidence",
      "--"
    );

  }


  /*
   * CURRENT STRATEGY CHOSEN
   */

  let chosenStrategy =
    state.selectedStrategy;

  if (
    state.engineMode === "ai" &&
    bot
  ) {

    chosenStrategy =
      bot.strategy;

  }

  if (
    state.engineMode === "circular" &&
    circular
  ) {

    chosenStrategy =
      circular.strategy;

  }

  setText(
    "analysisStrategyChosen",
    STRATEGY_LABELS[
      chosenStrategy
    ] ||
    chosenStrategy ||
    "--"
  );


  /*
   * Current market
   */

  let currentMarket =
    state.selectedMarket;

  if (
    state.engineMode === "ai" &&
    bot
  ) {
    currentMarket =
      bot.market;
  }

  if (
    state.engineMode === "circular" &&
    circular
  ) {
    currentMarket =
      circular.market;
  }

  setText(
    "analysisCurrentMarket",
    currentMarket ||
    "--"
  );


  /*
   * Prediction
   */

  let currentPrediction =
    "--";

  if (
    state.engineMode === "ai" &&
    bot
  ) {

    currentPrediction =
      bot.prediction;

  } else if (
    state.engineMode === "circular" &&
    circular
  ) {

    currentPrediction =
      circular.prediction;

  }

  setText(
    "analysisCurrentPrediction",
    String(
      currentPrediction
    )
  );


  /*
   * Confidence
   */

  let currentConfidence =
    "--";

  if (
    state.engineMode === "ai" &&
    bot
  ) {

    currentConfidence =
      `${Number(
        bot.confidence
      ).toFixed(1)}%`;

  } else if (
    state.engineMode === "circular" &&
    circular
  ) {

    currentConfidence =
      `${Number(
        circular.confidence
      ).toFixed(1)}%`;

  }

  setText(
    "analysisCurrentConfidence",
    currentConfidence
  );


  /*
   * Status
   */

  if (state.tradingStopped) {

    setText(
      "analysisMsg",
      "TRADING STOPPED"
    );

  } else if (state.aiRunning) {

    setText(
      "analysisMsg",
      "AI BOT autonomously selecting market + strategy."
    );

  } else if (
    state.circularRunning
  ) {

    setText(
      "analysisMsg",
      "Circular AI running 10 → 5 → 3 cycle."
    );

  } else if (
    state.engineMode === "manual"
  ) {

    setText(
      "analysisMsg",
      "Manual trading mode."
    );

  }

}


/* =========================================================
   SELECTED MARKET UI
   ========================================================= */

function updateSelectedMarketUI() {

  const analysis =
    analyzeMarket(
      state.selectedMarket
    );

  if (!analysis) {
    return;
  }

  setText(
    "currentChartMarket",
    analysis.symbol
  );

  setText(
    "currentLivePrice",
    formatLatestPrice(
      analysis.symbol
    )
  );

  setText(
    "digitSampleCount",
    String(
      analysis.total
    )
  );

  const grid =
    $("digitStatsGrid");

  if (grid) {

    grid.innerHTML =
      analysis.percentages
        .map(
          (percentage, digit) =>
            `
            <div class="digit-stat">
              <span>${digit}</span>
              <b>${percentage.toFixed(1)}%</b>
            </div>
            `
        )
        .join("");

  }

}


function formatLatestPrice(
  symbol
) {

  const price =
    state.markets[
      symbol
    ]?.prices?.at(-1);

  if (
    !Number.isFinite(price)
  ) {
    return "--";
  }

  return price.toFixed(2);

}


/* =========================================================
   ACTIVE TRADES
   ========================================================= */

function renderActiveTrades() {

 