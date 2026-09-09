/* =========================================================
   KRISHWAVE AI BEAST V7.0
   ---------------------------------------------------------
   DEMO / PAPER INTELLIGENCE ENGINE

   FEATURES
   - Deriv public tick data
   - Multi-market scanner
   - Digit extraction using pip precision
   - Statistical market scoring
   - Concentration analysis
   - Streak analysis
   - Agreement analysis
   - AI Bot
   - Circular AI 10 → 5 → 3 cycle
   - Manual engine
   - Multiple active paper trades
   - Take Profit
   - Stop Loss
   - Martingale progression
   - Full history
   - Amount Won
   - Payout
   - Profit/Loss
   - LocalStorage
   - Dark / Light mode

   IMPORTANT:
   THIS FILE DOES NOT EXECUTE REAL TRADES.
   ALL TRADES ARE PAPER SIMULATIONS.
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

const STORAGE_HISTORY = "krishwave_v7_history";
const STORAGE_BALANCE = "krishwave_v7_balance";
const STORAGE_THEME = "krishwave_theme";
const STORAGE_SETTINGS = "krishwave_v7_settings";

const INITIAL_BALANCE = 1000;
const MIN_STAKE = 0.35;

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

const STRATEGY_LABELS = {
  MATCHES: "Matches",
  DIFFERS: "Differs",
  OVER: "Over",
  UNDER: "Under",
  EVEN: "Even",
  ODD: "Odd"
};

/*
  Simulated paper payout model.

  These values are ONLY for the paper engine.
  They are NOT live Deriv payout rates.
*/
const PAPER_MULTIPLIERS = {
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

  connected: false,

  accessToken: null,

  accountId: null,

  currency: "USD",

  paperBalance: INITIAL_BALANCE,

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

  aiRunning: false,

  aiCycleToken: 0,

  circularRunning: false,

  circularToken: 0,

  publicWS: null,

  reconnectTimer: null,

  botTimer: null,

  circularTimer: null,

  lastBotDecision: null,

  lastCircularPrediction: null,

  botBaseStake: 10,

  botCurrentStake: 10,

  botMartingaleLevel: 0,

  botSessionStartProfit: 0,

  botTakeProfit: 50,

  botStopLoss: 100,

  circularSessionStartProfit: 0,

  circularTakeProfit: 50,

  circularStopLoss: 100

};

/* =========================================================
   HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function money(value) {
  const n = Number(value) || 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: state.currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
}

function formatMarketName(symbol) {
  return symbol || "UNKNOWN";
}

function strategyLabel(strategy) {
  return STRATEGY_LABELS[strategy] || strategy;
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/* =========================================================
   MARKET INITIALIZATION
========================================================= */

function buildInitialMarkets() {

  MARKETS.forEach(symbol => {

    state.markets[symbol] = {

      symbol,

      price: null,

      lastDigit: null,

      pipSize: null,

      digits: Array(10).fill(0),

      ticks: [],

      prices: [],

      updated: null,

      received: 0

    };

  });

}

/* =========================================================
   LOCAL STORAGE
========================================================= */

function loadHistory() {

  try {

    const raw = localStorage.getItem(STORAGE_HISTORY);

    if (raw) {

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {

        state.history = parsed;

      }

    }

  } catch (error) {

    console.error("History load failed", error);

    state.history = [];

  }

  try {

    const balance = Number(
      localStorage.getItem(STORAGE_BALANCE)
    );

    if (
      Number.isFinite(balance) &&
      balance >= 0
    ) {

      state.paperBalance = balance;

    }

  } catch (error) {

    state.paperBalance = INITIAL_BALANCE;

  }

  try {

    const settings = JSON.parse(
      localStorage.getItem(STORAGE_SETTINGS) || "{}"
    );

    if (settings.currency) {

      state.currency = settings.currency;

    }

    if (Array.isArray(settings.botStrategyPool)) {

      state.botStrategyPool =
        settings.botStrategyPool.length
          ? settings.botStrategyPool
          : ["MATCHES", "DIFFERS"];

    }

  } catch (error) {

    console.warn("Settings load failed");

  }

  recalculateHistoryTotals();

}

function saveHistory() {

  try {

    localStorage.setItem(
      STORAGE_HISTORY,
      JSON.stringify(state.history)
    );

  } catch (error) {

    console.error("Could not save history", error);

  }

}

function saveBalance() {

  try {

    localStorage.setItem(
      STORAGE_BALANCE,
      String(state.paperBalance)
    );

  } catch (error) {

    console.error("Could not save balance", error);

  }

}

function saveSettings() {

  try {

    localStorage.setItem(
      STORAGE_SETTINGS,
      JSON.stringify({
        currency: state.currency,
        botStrategyPool: state.botStrategyPool
      })
    );

  } catch (error) {

    console.error("Could not save settings", error);

  }

}

function recalculateHistoryTotals() {

  state.totalStake = state.history.reduce(
    (sum, trade) => sum + Number(trade.stake || 0),
    0
  );

  state.totalAmountWon = state.history.reduce(
    (sum, trade) => sum + Number(trade.amountWon || 0),
    0
  );

  state.totalProfit = state.history.reduce(
    (sum, trade) => sum + Number(trade.profit || 0),
    0
  );

}

/* =========================================================
   THEME
========================================================= */

function loadTheme() {

  const theme =
    localStorage.getItem(STORAGE_THEME);

  if (theme === "light") {

    document.body.classList.add("light");

    if ($("themeToggle")) {

      $("themeToggle").textContent = "🌙";

    }

  }

}

function bindTheme() {

  $("themeToggle")?.addEventListener(
    "click",
    () => {

      document.body.classList.toggle("light");

      const light =
        document.body.classList.contains("light");

      localStorage.setItem(
        STORAGE_THEME,
        light ? "light" : "dark"
      );

      $("themeToggle").textContent =
        light ? "🌙" : "☀️";

      updateChart();

    }
  );

}

/* =========================================================
   NAVIGATION
========================================================= */

function bindNavigation() {

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.addEventListener("click", () => {

        const page =
          button.dataset.page;

        document
          .querySelectorAll(".page")
          .forEach(section => {

            section.classList.remove("active");

          });

        $(page + "Page")?.classList.add("active");

        document
          .querySelectorAll(".nav-btn")
          .forEach(btn => {

            btn.classList.remove("active");

          });

        button.classList.add("active");

        if (page === "trade") {

          updateChart();
          renderDigitStats();
          renderActiveTrades();

        }

        if (page === "history") {

          renderHistory();

        }

      });

    });

}

/* =========================================================
   ENGINE TABS
========================================================= */

function bindEngineTabs() {

  const tabs = {

    tabAiBot: "ai",

    tabCircularAI: "circular",

    tabManual: "manual"

  };

  Object.entries(tabs).forEach(
    ([id, mode]) => {

      $(id)?.addEventListener(
        "click",
        () => {

          state.engineMode = mode;

          document
            .querySelectorAll(".engine-tab")
            .forEach(tab =>
              tab.classList.remove("active")
            );

          document
            .querySelectorAll(".engine-content")
            .forEach(content =>
              content.classList.remove("active")
            );

          $(id).classList.add("active");

          if (mode === "ai") {

            $("aiBotEngine")
              ?.classList.add("active");

          }

          if (mode === "circular") {

            $("circularEngine")
              ?.classList.add("active");

          }

          if (mode === "manual") {

            $("manualEngine")
              ?.classList.add("active");

          }

        }
      );

    }
  );

}

/* =========================================================
   MARKET SELECTORS
========================================================= */

function populateMarketSelectors() {

  const selectors = [
    $("manualMarketSelect"),
    $("circularMarketSelect")
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

    select.value = state.selectedMarket;

  });

}

function resetSelectedMarketView() {

  const market =
    state.markets[state.selectedMarket];

  state.priceHistory =
    market?.prices || [];

  setText(
    "currentChartMarket",
    state.selectedMarket
  );

  updateChart();
  renderDigitStats();

}

/* =========================================================
   PUBLIC DERIV TICK DATA
========================================================= */

function connectPublicMarket() {

  if (state.publicWS) {

    try {

      state.publicWS.close();

    } catch (e) {}

  }

  setConnectionState(
    false,
    "CONNECTING..."
  );

  try {

    const ws =
      new WebSocket(PUBLIC_WS);

    state.publicWS = ws;

    ws.addEventListener("open", () => {

      state.connected = true;

      setConnectionState(
        true,
        "LIVE DATA"
      );

      MARKETS.forEach(symbol => {

        try {

          ws.send(
            JSON.stringify({
              ticks: symbol,
              subscribe: 1
            })
          );

        } catch (error) {

          console.warn(
            "Subscription failed",
            symbol,
            error
          );

        }

      });

    });

    ws.addEventListener("message", event => {

      try {

        const msg =
          JSON.parse(event.data);

        if (msg.tick) {

          processTick(msg.tick);

        }

      } catch (error) {

        console.warn(
          "Tick parse error",
          error
        );

      }

    });

    ws.addEventListener("error", () => {

      setConnectionState(
        false,
        "DATA ERROR"
      );

    });

    ws.addEventListener("close", () => {

      state.connected = false;

      setConnectionState(
        false,
        "RECONNECTING"
      );

      clearTimeout(state.reconnectTimer);

      state.reconnectTimer =
        setTimeout(
          connectPublicMarket,
          3000
        );

    });

  } catch (error) {

    console.error(
      "WebSocket error",
      error
    );

    setConnectionState(
      false,
      "OFFLINE"
    );

  }

}

function setConnectionState(
  connected,
  text
) {

  const dot = $("connectionDot");

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
    "connectionText",
    text
  );

  setText(
    "dataStatus",
    connected
      ? "LIVE"
      : "OFFLINE"
  );

}

/* =========================================================
   DIGIT EXTRACTION
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
      Math.pow(10, -decimals);

  }

  const scaled =
    Math.round(
      quote / pipSize
    );

  return Math.abs(scaled) % 10;

}

/* =========================================================
   PROCESS TICKS
========================================================= */

function processTick(tick) {

  const symbol =
    tick.symbol;

  if (!symbol || !state.markets[symbol]) {

    return;

  }

  const price =
    Number(tick.quote);

  const digit =
    getLastDigitFromTick(tick);

  if (
    !Number.isFinite(price) ||
    digit === null
  ) {

    return;

  }

  const market =
    state.markets[symbol];

  market.price = price;

  market.lastDigit = digit;

  market.pipSize =
    Number(tick.pip_size) ||
    market.pipSize ||
    0.01;

  market.digits[digit]++;

  market.ticks.push({
    price,
    digit,
    epoch:
      Number(tick.epoch) ||
      Date.now() / 1000
  });

  market.prices.push(price);

  market.received++;

  market.updated =
    Date.now();

  if (market.ticks.length > 200) {

    market.ticks.shift();

  }

  if (market.prices.length > 100) {

    market.prices.shift();

  }

  if (
    symbol === state.selectedMarket
  ) {

    state.priceHistory =
      market.prices;

    setText(
      "currentLivePrice",
      formatPrice(
        price,
        getPriceDecimals(
          market.pipSize,
          price
        )
      )
    );

    updateChart();

    renderDigitStats();

  }

  evaluateActiveTrades(
    symbol,
    digit
  );

  updateAIIfRunning();

}

/* =========================================================
   PRICE HELPERS
========================================================= */

function getPriceDecimals(
  pipSize,
  price
) {

  const pip =
    Number(pipSize);

  if (
    Number.isFinite(pip) &&
    pip > 0
  ) {

    const text =
      pip.toFixed(12)
        .replace(/0+$/, "");

    if (text.includes(".")) {

      return text.split(".")[1].length;

    }

  }

  const stringPrice =
    String(price);

  return stringPrice.includes(".")
    ? stringPrice.split(".")[1].length
    : 2;

}

function formatPrice(price, decimals) {

  return Number(price)
    .toFixed(decimals || 2);

}

/* =========================================================
   CHART
========================================================= */

function updateChart() {

  const canvas =
    $("priceChartCanvas");

  if (!canvas) return;

  const rect =
    canvas.getBoundingClientRect();

  const width =
    Math.max(300, rect.width);

  const height = 230;

  const dpr =
    window.devicePixelRatio || 1;

  canvas.width =
    width * dpr;

  canvas.height =
    height * dpr;

  const ctx =
    canvas.getContext("2d");

  ctx.scale(dpr, dpr);

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const prices =
    state.priceHistory || [];

  if (prices.length < 2) {

    ctx.fillStyle =
      getComputedStyle(
        document.body
      ).getPropertyValue("--muted");

    ctx.font = "12px system-ui";

    ctx.fillText(
      "Waiting for live market ticks...",
      15,
      25
    );

    return;

  }

  const min =
    Math.min(...prices);

  const max =
    Math.max(...prices);

  const range =
    max - min || 1;

  const padding = 12;

  const accent =
    getComputedStyle(
      document.body
    ).getPropertyValue("--accent");

  ctx.beginPath();

  prices.forEach(
    (price, index) => {

      const x =
        padding +
        index *
        ((width - padding * 2) /
          (prices.length - 1));

      const y =
        height -
        padding -
        ((price - min) / range) *
        (height - padding * 2);

      if (index === 0) {

        ctx.moveTo(x, y);

      } else {

        ctx.lineTo(x, y);

      }

    }
  );

  ctx.strokeStyle =
    accent;

  ctx.lineWidth = 2;

  ctx.shadowBlur = 8;

  ctx.shadowColor = accent;

  ctx.stroke();

  ctx.shadowBlur = 0;

}

/* =========================================================
   DIGIT STATS
========================================================= */

function renderDigitStats() {

  const grid =
    $("digitStatsGrid");

  if (!grid) return;

  const market =
    state.markets[
      state.selectedMarket
    ];

  if (!market) return;

  const total =
    market.digits.reduce(
      (a, b) => a + b,
      0
    );

  setText(
    "digitSampleCount",
    `${total} TICKS`
  );

  if (!total) {

    grid.innerHTML =
      Array.from(
        { length: 10 },
        (_, digit) => `
          <div class="digit-box">
            <b>${digit}</b>
            <span>0%</span>
          </div>
        `
      ).join("");

    return;

  }

  const highest =
    Math.max(...market.digits);

  const lowest =
    Math.min(...market.digits);

  grid.innerHTML =
    market.digits
      .map((count, digit) => {

        const percentage =
          (count / total) * 100;

        let className =
          "digit-box";

        if (
          count === highest &&
          total >= 20
        ) {

          className += " hot";

        }

        if (
          count === lowest &&
          total >= 20
        ) {

          className += " cold";

        }

        return `
          <div class="${className}">
            <b>${digit}</b>
            <span>${percentage.toFixed(1)}%</span>
          </div>
        `;

      })
      .join("");

}

/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket(symbol) {

  const market =
    state.markets[symbol];

  if (
    !market ||
    market.ticks.length < 20
  ) {

    return null;

  }

  const recent =
    market.ticks.slice(-30);

  const counts =
    Array(10).fill(0);

  recent.forEach(
    tick => {
      counts[tick.digit]++;
    }
  );

  const total =
    recent.length;

  const percentages =
    counts.map(
      count =>
        count / total
    );

  let hottest = 0;
  let coldest = 0;

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

  const lastDigit =
    recent[recent.length - 1].digit;

  let streak = 1;

  for (
    let i = recent.length - 2;
    i >= 0;
    i--
  ) {

    if (
      recent[i].digit === lastDigit
    ) {

      streak++;

    } else {

      break;

    }

  }

  const evenCount =
    recent.filter(
      t => t.digit % 2 === 0
    ).length;

  const overCount =
    recent.filter(
      t => t.digit > 5
    ).length;

  const underCount =
    recent.filter(
      t => t.digit < 5
    ).length;

  const evenRate =
    evenCount / total;

  const overRate =
    overCount / total;

  const underRate =
    underCount / total;

  const concentration =
    Math.max(...percentages);

  const entropy =
    calculateEntropy(
      percentages
    );

  const stability =
    clamp(
      (1 - entropy) * 100,
      0,
      100
    );

  let score = 50;

  score +=
    Math.abs(
      evenRate - .5
    ) * 30;

  score +=
    Math.abs(
      overRate - .5
    ) * 25;

  score +=
    Math.min(
      streak * 2,
      12
    );

  score +=
    Math.min(
      Math.abs(
        concentration - .10
      ) * 30,
      10
    );

  score =
    clamp(score, 0, 100);

  let strength = "WEAK";

  if (score >= 75) {

    strength = "STRONG";

  } else if (score >= 62) {

    strength = "GOOD";

  } else if (score >= 52) {

    strength = "MODERATE";

  }

  const agreement =
    calculateAgreement(
      recent
    );

  return {

    symbol,

    counts,

    percentages,

    total,

    hottest,

    coldest,

    lastDigit,

    streak,

    evenRate,

    overRate,

    underRate,

    concentration,

    entropy,

    stability,

    score,

    strength,

    agreement

  };

}

/* =========================================================
   ENTROPY
========================================================= */

function calculateEntropy(
  percentages
) {

  let entropy = 0;

  percentages.forEach(
    p => {

      if (p > 0) {

        entropy -=
          p * Math.log2(p);

      }

    }
  );

  return entropy /
    Math.log2(10);

}

/* =========================================================
   AGREEMENT
========================================================= */

function calculateAgreement(
  recent
) {

  const last =
    recent.slice(-12);

  if (!last.length) {

    return 0;

  }

  const even =
    last.filter(
      t => t.digit % 2 === 0
    ).length /
    last.length;

  const directional =
    Math.max(
      last.filter(
        t => t.digit > 5
      ).length,

      last.filter(
        t => t.digit < 5
      ).length
    ) / last.length;

  const agreement =
    (
      Math.abs(even - .5) * 2 +
      Math.abs(directional - .5) * 2
    ) / 2;

  return clamp(
    agreement * 100,
    0,
    100
  );

}

/* =========================================================
   BEST MARKET
========================================================= */

function chooseBestMarket() {

  const analyses =
    MARKETS
      .map(symbol =>
        analyzeMarket(symbol)
      )
      .filter(Boolean);

  if (!analyses.length) {

    return null;

  }

  analyses.sort(
    (a, b) =>
      b.score - a.score
  );

  const top =
    analyses.slice(
      0,
      Math.min(3, analyses.length)
    );

  return top[
    Math.floor(
      Math.random() * top.length
    )
  ];

}

/* =========================================================
   BOT STRATEGY
========================================================= */

function chooseBotStrategy(
  analysis
) {

  const pool =
    state.botStrategyPool.length
      ? state.botStrategyPool
      : STRATEGIES;

  const scored =
    pool.map(strategy => {

      let score = 0;

      if (
        strategy === "MATCHES"
      ) {

        score =
          analysis.concentration * 100;

      }

      if (
        strategy === "DIFFERS"
      ) {

        score =
          (1 -
            analysis.concentration) *
          100;

      }

      if (
        strategy === "EVEN"
      ) {

        score =
          Math.abs(
            analysis.evenRate - .5
          ) * 100;

      }

      if (
        strategy === "ODD"
      ) {

        score =
          Math.abs(
            analysis.evenRate - .5
          ) * 100;

      }

      if (
        strategy === "OVER"
      ) {

        score =
          Math.abs(
            analysis.overRate - .5
          ) * 100;

      }

      if (
        strategy === "UNDER"
      ) {

        score =
          Math.abs(
            analysis.underRate - .5
          ) * 100;

      }

      score +=
        Math.random() * 10;

      return {
        strategy,
        score
      };

    });

  scored.sort(
    (a, b) =>
      b.score - a.score
  );

  return scored[0]?.strategy ||
    "MATCHES";

}

/* =========================================================
   PREDICTION
========================================================= */

function createPrediction(
  analysis,
  strategy
) {

  let prediction =
    analysis.hottest;

  if (
    strategy === "OVER"
  ) {

    prediction =
      analysis.hottest > 5
        ? analysis.hottest
        : 6;

  }

  if (
    strategy === "UNDER"
  ) {

    prediction =
      analysis.hottest < 5
        ? analysis.hottest
        : 4;

  }

  if (
    strategy === "EVEN" ||
    strategy === "ODD"
  ) {

    prediction =
      findBestParityDigit(
        analysis,
        strategy
      );

  }

  const confidence =
    clamp(
      50 +
      Math.abs(
        analysis.concentration - .10
      ) * 150 +
      analysis.score * .25 +
      Math.min(
        analysis.streak * 2,
        10
      ),
      50,
      95
    );

  return {

    prediction,

    confidence

  };

}

function findBestParityDigit(
  analysis,
  strategy
) {

  let bestDigit =
    strategy === "EVEN"
      ? 0
      : 1;

  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    const matching =
      strategy === "EVEN"
        ? digit % 2 === 0
        : digit % 2 !== 0;

    if (!matching) continue;

    if (
      analysis.counts[digit] >
      analysis.counts[bestDigit]
    ) {

      bestDigit = digit;

    }

  }

  return bestDigit;

}

/* =========================================================
   BOT DECISION
========================================================= */

function chooseBotDecision() {

  const analysis =
    chooseBestMarket();

  if (!analysis) {

    return null;

  }

  const strategy =
    chooseBotStrategy(
      analysis
    );

  const prediction =
    createPrediction(
      analysis,
      strategy
    );

  return {

    analysis,

    strategy,

    prediction:
      prediction.prediction,

    confidence:
      prediction.confidence

  };

}

/* =========================================================
   AI BOT CONTROLS
========================================================= */

function bindBotControls() {

  $("startBotBtn")
    ?.addEventListener(
      "click",
      () => {

        if (state.aiRunning) {

          stopAIBot();

        } else {

          startAIBot();

        }

      }
    );

  $("botStrategyTrigger")
    ?.addEventListener(
      "click",
      () => {

        $("botStrategyModal")
          ?.classList.add("open");

      }
    );

}

async function startAIBot() {

  if (state.aiRunning) return;

  const base =
    Number(
      $("stakeInput")?.value
    );

  if (
    !Number.isFinite(base) ||
    base < MIN_STAKE
  ) {

    alert(
      `Minimum paper stake is ${MIN_STAKE}.`
    );

    return;

  }

  state.aiRunning = true;

  state.aiCycleToken++;

  state.botBaseStake = base;

  state.botCurrentStake = base;

  state.botMartingaleLevel = 0;

  state.botSessionStartProfit =
    state.totalProfit;

  state.botTakeProfit =
    Number(
      $("takeProfitInput")?.value
    ) || 0;

  state.botStopLoss =
    Number(
      $("stopLossInput")?.value
    ) || 0;

  $("startBotBtn").textContent =
    "■ STOP TRADING BOT";

  setText(
    "botStatusDash",
    "AI BOT ACTIVE"
  );

  setText(
    "engineStatusText",
    "AI BOT SCANNING"
  );

  runAIBotLoop(
    state.aiCycleToken
  );

}

async function runAIBotLoop(token) {

  while (
    state.aiRunning &&
    token === state.aiCycleToken
  ) {

    if (
      shouldStopBotSession()
    ) {

      stopAIBot();

      break;

    }

    const decision =
      chooseBotDecision();

    if (!decision) {

      setText(
        "engineStatusText",
        "WAITING FOR 20+ TICKS"
      );

      await sleep(1500);

      continue;

    }

    state.lastBotDecision =
      decision;

    updateBotDisplay(
      decision
    );

    const trade =
      createPaperTrade({

        engine: "AI BOT",

        market:
          decision.analysis.symbol,

        strategy:
          decision.strategy,

        prediction:
          decision.prediction,

        stake:
          state.botCurrentStake,

        takeProfit:
          state.botTakeProfit,

        stopLoss:
          state.botStopLoss,

        martingaleLevel:
          state.botMartingaleLevel

      });

    if (!trade) {

      setText(
        "engineStatusText",
        "INSUFFICIENT PAPER BALANCE"
      );

      stopAIBot();

      break;

    }

    setText(
      "engineStatusText",
      `TRADE ACTIVE · LEVEL ${state.botMartingaleLevel}`
    );

    /*
      Wait for market ticks to resolve the trade.
      Multiple trades can remain active because
      the paper engine supports concurrent trades.
    */

    await sleep(5000);

    if (
      shouldStopBotSession()
    ) {

      stopAIBot();

      break;

    }

  }

}

function shouldStopBotSession() {

  const sessionProfit =
    state.totalProfit -
    state.botSessionStartProfit;

  if (
    state.botTakeProfit > 0 &&
    sessionProfit >=
      state.botTakeProfit
  ) {

    setText(
      "engineStatusText",
      "TAKE PROFIT REACHED"
    );

    return true;

  }

  if (
    state.botStopLoss > 0 &&
    sessionProfit <=
      -state.botStopLoss
  ) {

    setText(
      "engineStatusText",
      "STOP LOSS REACHED"
    );

    return true;

  }

  return false;

}

function updateBotDisplay(
  decision
) {

  setText(
    "botSelectedMarket",
    decision.analysis.symbol
  );

  setText(
    "botSelectedStrategy",
    strategyLabel(
      decision.strategy
    )
  );

  setText(
    "botSelectedScore",
    decision.analysis.score.toFixed(1)
  );

  setText(
    "botSelectedConfidence",
    `${decision.confidence.toFixed(1)}%`
  );

  setText(
    "aiMarket",
    decision.analysis.symbol
  );

  setText(
    "aiPrediction",
    `DIGIT ${decision.prediction}`
  );

  setText(
    "aiPredictionLarge",
    `DIGIT ${decision.prediction}`
  );

  setText(
    "analysisConfidence",
    `${decision.confidence.toFixed(1)}%`
  );

  setText(
    "predictionConfidence",
    ""
  );

  const bar =
    $("predictionConfidence");

  if (bar) {

    bar.style.width =
      `${decision.confidence}%`;

  }

  updateAnalysisReport(
    decision.analysis
  );

}

function stopAIBot() {

  state.aiRunning = false;

  state.aiCycleToken++;

  setText(
    "botStatusDash",
    "STANDBY"
  );

  setText(
    "engineStatusText",
    "AI BOT READY"
  );

  if ($("startBotBtn")) {

    $("startBotBtn").textContent =
      "▶ START AI BOT";

  }

}

/* =========================================================
   CIRCULAR AI
========================================================= */

function bindCircularControls() {

  $("startAI")
    ?.addEventListener(
      "click",
      () => {

        if (state.circularRunning) {

          stopCircularAI();

        } else {

          startCircularAI();

        }

      }
    );

  $("stopAI")
    ?.addEventListener(
      "click",
      stopCircularAI
    );

  $("startCircularTradeBtn")
    ?.addEventListener(
      "click",
      () => {

        if (state.circularRunning) {

          stopCircularAI();

        } else {

          startCircularAI();

        }

      }
    );

  $("circularMarketSelect")
    ?.addEventListener(
      "change",
      event => {

        state.selectedMarket =
          event.target.value;

        resetSelectedMarketView();

      }
    );

}

async function startCircularAI() {

  if (state.circularRunning) return;

  const stake =
    Number(
      $("circularStakeInput")?.value
    );

  if (
    !Number.isFinite(stake) ||
    stake < MIN_STAKE
  ) {

    alert(
      `Minimum paper stake is ${MIN_STAKE}.`
    );

    return;

  }

  state.circularRunning = true;

  state.circularToken++;

  state.circularSessionStartProfit =
    state.totalProfit;

  state.circularTakeProfit =
    Number(
      $("circularTakeProfitInput")?.value
    ) || 0;

  state.circularStopLoss =
    Number(
      $("circularStopLossInput")?.value
    ) || 0;

  updateCircularUI();

  circularCycle(
    state.circularToken
  );

}

async function circularCycle(token) {

  while (
    state.circularRunning &&
    token === state.circularToken
  ) {

    if (
      shouldStopCircularSession()
    ) {

      stopCircularAI();

      break;

    }

    activateCycle(
      "cycleAnalysis"
    );

    await countdown(
      10,
      token,
      "ANALYZING"
    );

    if (
      !state.circularRunning ||
      token !== state.circularToken
    ) {

      break;

    }

    const symbol =
      $("circularMarketSelect")
        ?.value ||
      state.selectedMarket;

    const analysis =
      analyzeMarket(symbol);

    if (!analysis) {

      setText(
        "circularStatusText",
        "WAITING FOR MORE TICKS"
      );

      await sleep(1000);

      continue;

    }

    activateCycle(
      "cyclePrediction"
    );

    const strategy =
      state.selectedStrategy;

    const prediction =
      createPrediction(
        analysis,
        strategy
      );

    state.lastCircularPrediction = {

      analysis,

      strategy,

      prediction:
        prediction.prediction,

      confidence:
        prediction.confidence

    };

    updateCircularReport(
      analysis,
      strategy,
      prediction
    );

    await countdown(
      5,
      token,
      "PREDICTING"
    );

    if (
      !state.circularRunning ||
      token !== state.circularToken
    ) {

      break;

    }

    activateCycle(
      "cycleTrade"
    );

    const trade =
      createPaperTrade({

        engine: "CIRCULAR AI",

        market: symbol,

        strategy,

        prediction:
          prediction.prediction,

        stake:
          Number(
            $("circularStakeInput")?.value
          ) || MIN_STAKE,

        takeProfit:
          state.circularTakeProfit,

        stopLoss:
          state.circularStopLoss

      });

    if (!trade) {

      setText(
        "circularStatusText",
        "INSUFFICIENT PAPER BALANCE"
      );

      stopCircularAI();

      break;

    }

    await countdown(
      3,
      token,
      "TRADE NOW"
    );

    activateCycle(
      "cycleCooldown"
    );

    await countdown(
      1,
      token,
      "COOLDOWN"
    );

  }

}

function shouldStopCircularSession() {

  const profit =
    state.totalProfit -
    state.circularSessionStartProfit;

  if (
    state.circularTakeProfit > 0 &&
    profit >=
      state.circularTakeProfit
  ) {

    return true;

  }

  if (
    state.circularStopLoss > 0 &&
    profit <=
      -state.circularStopLoss
  ) {

    return true;

  }

  return false;

}

function stopCircularAI() {

  state.circularRunning = false;

  state.circularToken++;

  resetCycleUI();

  updateCircularUI();

}

async function countdown(
  seconds,
  token,
  label
) {

  for (
    let i = seconds;
    i > 0;
    i--
  ) {

    if (
      !state.circularRunning ||
      token !== state.circularToken
    ) {

      return false;

    }

    setText(
      "aiCircleLabel",
      i
    );

    setText(
      "aiCirclePrediction",
      label
    );

    setText(
      "aiCircleTimer",
      `${i}s`
    );

    await sleep(1000);

  }

  return true;

}

function activateCycle(id) {

  document
    .querySelectorAll(".cycle-step")
    .forEach(step =>
      step.classList.remove("active")
    );

  $(id)?.classList.add("active");

}

function resetCycleUI() {

  document
    .querySelectorAll(".cycle-step")
    .forEach(step =>
      step.classList.remove("active")
    );

  $("cycleAnalysis")
    ?.classList.add("active");

  setText(
    "aiCircleLabel",
    "10"
  );

  setText(
    "aiCirclePrediction",
    "ANALYZE"
  );

  setText(
    "aiCircleTimer",
    "READY"
  );

  setText(
    "aiCircleStatus",
    "READY"
  );

}

function updateCircularUI() {

  const active =
    state.circularRunning;

  setText(
    "circularStatusText",
    active
      ? "CIRCULAR AI ACTIVE"
      : "CIRCULAR AI READY"
  );

  setText(
    "aiCircleStatus",
    active
      ? "ACTIVE"
      : "READY"
  );

  if ($("startAI")) {

    $("startAI").textContent =
      active
        ? "■ STOP CIRCULAR AI"
        : "START CIRCULAR AI";

  }

  if ($("startCircularTradeBtn")) {

    $("startCircularTradeBtn").textContent =
      active
        ? "■ STOP CIRCULAR AI"
        : "▶ START CIRCULAR AI";

  }

}

/* =========================================================
   CIRCULAR REPORT
========================================================= */

function updateCircularReport(
  analysis,
  strategy,
  prediction
) {

  setText(
    "aiStatus",
    "PREDICTION"
  );

  setText(
    "aiMarket",
    analysis.symbol
  );

  setText(
    "aiPrediction",
    `${strategyLabel(strategy)} · DIGIT ${prediction.prediction}`
  );

  setText(
    "aiType",
    strategyLabel(strategy)
  );

  setText(
    "aiPredictionLarge",
    `DIGIT ${prediction.prediction}`
  );

  setText(
    "analysisConfidence",
    `${prediction.confidence.toFixed(1)}%`
  );

  const bar =
    $("predictionConfidence");

  if (bar) {

    bar.style.width =
      `${prediction.confidence}%`;

  }

  updateAnalysisReport(
    analysis
  );

}

function updateAnalysisReport(
  analysis
) {

  if (!analysis) return;

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
    `${analysis.stability.toFixed(1)}%`
  );

  setText(
    "reportConcentration",
    `${(analysis.concentration * 100).toFixed(1)}%`
  );

  setText(
    "reportStreak",
    analysis.streak
  );

  setText(
    "reportAgreement",
    `${analysis.agreement.toFixed(1)}%`
  );

  setText(
    "analysisMsg",
    `${analysis.total} recent ticks analyzed`
  );

  setText(
    "entryStatus",
    analysis.score >= 62
      ? "FAVORABLE PAPER SIGNAL"
      : "WAIT / LOW STRENGTH"
  );

}

/* =========================================================
   MANUAL ENGINE
========================================================= */

function bindManualControls() {

  $("manualMarketSelect")
    ?.addEventListener(
      "change",
      event => {

        state.selectedMarket =
          event.target.value;

        resetSelectedMarketView();

      }
    );

  $("placeTradeBtn")
    ?.addEventListener(
      "click",
      executeManualTrade
    );

}

function executeManualTrade() {

  const market =
    $("manualMarketSelect")
      ?.value ||
    state.selectedMarket;

  const strategy =
    state.selectedStrategy;

  let prediction =
    Number(
      $("manualTargetDigitInput")?.value
    );

  if (!Number.isInteger(prediction)) {

    prediction = 5;

  }

  prediction =
    clamp(prediction, 0, 9);

  const stake =
    Number(
      $("manualStakeInput")?.value
    );

  if (
    !Number.isFinite(stake) ||
    stake < MIN_STAKE
  ) {

    alert(
      `Minimum paper stake is ${MIN_STAKE}.`
    );

    return;

  }

  const trade =
    createPaperTrade({

      engine: "MANUAL",

      market,

      strategy,

      prediction,

      stake,

      takeProfit:
        Number(
          $("manualTakeProfitInput")?.value
        ) || 0,

      stopLoss:
        Number(
          $("manualStopLossInput")?.value
        ) || 0

    });

  if (!trade) {

    setText(
      "manualStatusText",
      "INSUFFICIENT PAPER BALANCE"
    );

    return;

  }

  setText(
    "manualStatusText",
    `PAPER TRADE PLACED · ${market}`
  );

}

/* =========================================================
   STRATEGY MODAL
========================================================= */

function bindStrategyModal() {

  document
    .querySelectorAll(".strategy-option")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const strategy =
            button.dataset.strategy;

          state.selectedStrategy =
            strategy;

          setText(
            "circularStrategyTrigger",
            strategyLabel(strategy)
          );

          setText(
            "circularStrategyLabel",
            strategyLabel(strategy)
          );

          setText(
            "manualStrategyTrigger",
            strategyLabel(strategy)
          );

          setText(
            "manualSelectedStrategyLabel",
            strategyLabel(strategy)
          );

          updateTargetDigitVisibility();

          $("strategyModal")
            ?.classList.remove("open");

        }
      );

    });

  $("closeStrategyModal")
    ?.addEventListener(
      "click",
      () => {

        $("strategyModal")
          ?.classList.remove("open");

      }
    );

  $("circularStrategyTrigger")
    ?.addEventListener(
      "click",
      () => {

        $("strategyModal")
          ?.classList.add("open");

      }
    );

  $("manualStrategyTrigger")
    ?.addEventListener(
      "click",
      () => {

        $("strategyModal")
          ?.classList.add("open");

      }
    );

}

function updateTargetDigitVisibility() {

  const container =
    $("targetDigitContainer");

  if (!container) return;

  const hidden =
    state.selectedStrategy === "EVEN" ||
    state.selectedStrategy === "ODD";

  container.style.display =
    hidden ? "none" : "block";

}

/* =========================================================
   BOT STRATEGY MODAL
========================================================= */

function bindBotStrategyModal() {

  $("applyBotStrategies")
    ?.addEventListener(
      "click",
      () => {

        const selected =
          Array.from(
            document.querySelectorAll(
              ".bot-strategy-check:checked"
            )
          )
          .map(
            checkbox =>
              checkbox.value
          );

        if (!selected.length) {

          alert(
            "Select at least one strategy."
          );

          return;

        }

        state.botStrategyPool =
          selected;

        saveSettings();

        updateBotStrategyLabel();

        $("botStrategyModal")
          ?.classList.remove("open");

      }
    );

  $("closeBotStrategyModal")
    ?.addEventListener(
      "click",
      () => {

        $("botStrategyModal")
          ?.classList.remove("open");

      }
    );

  updateBotStrategyCheckboxes();

}

function updateBotStrategyCheckboxes() {

  document
    .querySelectorAll(".bot-strategy-check")
    .forEach(checkbox => {

      checkbox.checked =
        state.botStrategyPool
          .includes(
            checkbox.value
          );

    });

  updateBotStrategyLabel();

}

function updateBotStrategyLabel() {

  const names =
    state.botStrategyPool
      .map(
        strategyLabel
      );

  setText(
    "botStrategyTrigger",
    names.join(" + ")
  );

  setText(
    "botStrategyLabel",
    `${state.botStrategyPool.length} STRATEGIES`
  );

}

/* =========================================================
   PAPER TRADE CREATION
========================================================= */

function createPaperTrade(config) {

  const stake =
    Number(config.stake);

  if (
    !Number.isFinite(stake) ||
    stake < MIN_STAKE
  ) {

    return null;

  }

  if (
    state.paperBalance < stake
  ) {

    setText(
      "engineStatusText",
      "INSUFFICIENT PAPER BALANCE"
    );

    return null;

  }

  state.paperBalance -= stake;

  const trade = {

    id:
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    time:
      new Date()
        .toLocaleTimeString(),

    timestamp:
      Date.now(),

    engine:
      config.engine ||
      "MANUAL",

    market:
      config.market,

    strategy:
      config.strategy,

    prediction:
      Number.isInteger(
        config.prediction
      )
        ? config.prediction
        : 5,

    stake,

    takeProfit:
      Number(
        config.takeProfit || 0
      ),

    stopLoss:
      Number(
        config.stopLoss || 0
      ),

    resultDigit:
      null,

    result:
      null,

    status:
      "PENDING",

    amountWon:
      0,

    payout:
      0,

    profit:
      0,

    martingaleLevel:
      Number(
        config.martingaleLevel || 0
      )

  };

  state.activeTrades.push(
    trade
  );

  saveBalance();

  renderActiveTrades();

  updateBalance();

  return trade;

}

/* =========================================================
   ACTIVE TRADE EVALUATION
========================================================= */

function evaluateActiveTrades(
  symbol,
  digit
) {

  const pending =
    state.activeTrades.filter(
      trade =>
        trade.status === "PENDING" &&
        trade.market === symbol
    );

  pending.forEach(
    trade => {

      const result =
        evaluateStrategy(
          trade.strategy,
          digit,
          trade.prediction
        );

      settlePaperTrade(
        trade,
        result,
        digit
      );

    }
  );

}

function evaluateStrategy(
  strategy,
  digit,
  prediction
) {

  switch (strategy) {

    case "MATCHES":
      return digit === prediction;

    case "DIFFERS":
      return digit !== prediction;

    case "EVEN":
      return digit % 2 === 0;

    case "ODD":
      return digit % 2 !== 0;

    case "OVER":
      return digit > prediction;

    case "UNDER":
      return digit < prediction;

    default:
      return false;

  }

}

/* =========================================================
   SETTLE PAPER TRADE
========================================================= */

function settlePaperTrade(
  trade,
  win,
  resultDigit
) {

  if (
    !trade ||
    trade.status !== "PENDING"
  ) {

    return;

  }

  trade.resultDigit =
    resultDigit;

  trade.status =
    win ? "WON" : "LOST";

  trade.result =
    win ? "WIN" : "LOSS";

  if (win) {

    /*
      Payout includes the returned stake.
      Profit is payout minus stake.
    */

    const multiplier =
      getPayoutMultiplier(
        trade.strategy
      );

    const payout =
      trade.stake * multiplier;

    trade.payout =
      payout;

    trade.amountWon =
      payout;

    trade.profit =
      payout - trade.stake;

    state.paperBalance +=
      payout;

  } else {

    trade.payout = 0;

    trade.amountWon = 0;

    trade.profit =
      -trade.stake;

  }

  /*
    Move completed trade into history.
  */

  state.activeTrades =
    state.activeTrades.filter(
      item =>
        item.id !== trade.id
    );

  state.history.unshift({
    ...trade,
    settledAt:
      new Date()
        .toLocaleTimeString()
  });

  recalculateHistoryTotals();

  saveHistory();

  saveBalance();

  updateBalance();

  updateStats();

  renderActiveTrades();

  renderHistory();

  /*
    Martingale:
    - Loss increases next AI Bot stake.
    - Win resets to base stake.
  */

  if (
    trade.engine === "AI BOT"
  ) {

    if (win) {

      state.botCurrentStake =
        state.botBaseStake;

      state.botMartingaleLevel =
        0;

    } else {

      const factor =
        Number(
          $("martingaleInput")?.value
        ) || 1;

      state.botMartingaleLevel++;

      state.botCurrentStake =
        state.botCurrentStake *
        Math.max(1, factor);

      /*
        Safety cap for paper mode:
        never make next stake larger than
        available balance.
      */

      state.botCurrentStake =
        Math.min(
          state.botCurrentStake,
          Math.max(
            MIN_STAKE,
            state.paperBalance
          )
        );

    }

    setText(
      "engineStatusText",
      win
        ? "AI BOT WIN · STAKE RESET"
        : `AI BOT LOSS · NEXT LEVEL ${state.botMartingaleLevel}`
    );

  }

}

/* =========================================================
   PAPER PAYOUT
========================================================= */

function getPayoutMultiplier(
  strategy
) {

  return (
    PAPER_MULTIPLIERS[strategy] ||
    0
  );

}

/* =========================================================
   ACTIVE TRADE DISPLAY
========================================================= */

function renderActiveTrades() {

  const container =
    $("activeTradesList");

  if (!container) return;

  setText(
    "activeTradeCount",
    `${state.activeTrades.length} ACTIVE`
  );

  if (!state.activeTrades.length) {

    container.innerHTML = `
      <div class="empty-state">
        No active paper trades.
      </div>
    `;

    return;

  }

  container.innerHTML =
    state.activeTrades
      .slice()
      .reverse()
      .map(trade => `

        <div class="trade-item">

          <div class="trade-top">

            <div>
              <div class="trade-market">
                ${esc(trade.market)}
              </div>

              <small>
                ${esc(trade.engine)}
              </small>
            </div>

            <span class="trade-status">
              WAITING FOR TICK
            </span>

          </div>

          <div class="trade-meta">

            <div>
              <span>STRATEGY</span>
              <strong>
                ${esc(
                  strategyLabel(
                    trade.strategy
                  )
                )}
              </strong>
            </div>

            <div>
              <span>PREDICTION</span>
              <strong>
                DIGIT ${esc(trade.prediction)}
              </strong>
            </div>

            <div>
              <span>STAKE</span>
              <strong>
                ${money(trade.stake)}
              </strong>
            </div>

            <div>
              <span>LEVEL</span>
              <strong>
                ${trade.martingaleLevel}
              </strong>
            </div>

          </div>

        </div>

      `)
      .join("");

}

/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

  const container =
    $("historyCardsList");

  if (!container) return;

  if (!state.history.length) {

    container.innerHTML = `
      <div class="empty-state">
        No completed trades yet.
      </div>
    `;

    updateHistorySummary();

    return;

  }

  container.innerHTML =
    state.history
      .map(trade => {

        const profit =
          Number(trade.profit || 0);

        const profitClass =
          profit >= 0
            ? "profit-win"
            : "profit-loss";

        return `

          <div class="history-item">

            <div class="history-top">

              <div>

                <div class="history-market">
                  ${esc(trade.market)}
                </div>

                <small>
                  ${esc(trade.engine)}
                  · ${esc(trade.time)}
                </small>

              </div>

              <strong class="${profitClass}">
                ${profit >= 0 ? "+" : ""}
                ${money(profit)}
              </strong>

            </div>

            <div class="history-meta">

              <div>
                <span>STRATEGY</span>
                <strong>
                  ${esc(
                    strategyLabel(
                      trade.strategy
                    )
                  )}
                </strong>
              </div>

              <div>
                <span>PREDICTION</span>
                <strong>
                  DIGIT ${esc(
                    trade.prediction
                  )}
                </strong>
              </div>

              <div>
                <span>RESULT</span>
                <strong>
                  DIGIT ${esc(
                    trade.resultDigit
                  )}
                </strong>
              </div>

              <div>
                <span>STATUS</span>
                <strong>
                  ${esc(trade.status)}
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
                <strong class="amount-won">
                  ${money(trade.amountWon)}
                </strong>
              </div>

              <div>
                <span>PAYOUT</span>
                <strong>
                  ${money(trade.payout)}
                </strong>
              </div>

              <div>
                <span>PROFIT / LOSS</span>
                <strong class="${profitClass}">
                  ${profit >= 0 ? "+" : ""}
                  ${money(profit)}
                </strong>
              </div>

            </div>

          </div>

        `;

      })
      .join("");

  updateHistorySummary();

}

function updateHistorySummary() {

  recalculateHistoryTotals();

  setText(
    "historyTotalStake",
    money(state.totalStake)
  );

  setText(
    "historyAmountWon",
    money(state.totalAmountWon)
  );

  setText(
    "historyNetProfit",
    money(state.totalProfit)
  );

  setText(
    "totalProfitDisplay",
    money(state.totalProfit)
  );

}

function bindClearHistory() {

  $("clearLogsBtn")
    ?.addEventListener(
      "click",
      () => {

        if (!state.history.length) {

          return;

        }

        const confirmed =
          confirm(
            "Clear all completed paper trade history?"
          );

        if (!confirmed) return;

        state.history = [];

        recalculateHistoryTotals();

        saveHistory();

        renderHistory();

        updateStats();

      }
    );

}

/* =========================================================
   STATISTICS
========================================================= */

function updateStats() {

  const total =
    state.history.length;

  const wins =
    state.history.filter(
      trade =>
        trade.status === "WON"
    ).length;

  const losses =
    state.history.filter(
      trade =>
        trade.status === "LOST"
    ).length;

  const accuracy =
    total
      ? (wins / total) * 100
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

  updateHistorySummary();

}

/* =========================================================
   BALANCE
========================================================= */

function updateBalance() {

  setText(
    "balanceDisplay",
    money(state.paperBalance)
  );

}

/* =========================================================
   AI LIVE UPDATE
========================================================= */

function updateAIIfRunning() {

  if (
    state.aiRunning &&
    state.lastBotDecision
  ) {

    updateBotDisplay(
      state.lastBotDecision
    );

  }

}

/* =========================================================
   OAUTH / ACCOUNT CONNECTION
========================================================= */

function checkOAuthCallback() {

  /*
    V7 remains PAPER mode.
    We only detect whether the page received
    an OAuth-style callback parameter.

    No trading API calls are made here.
  */

  const params =
    new URLSearchParams(
      window.location.search
    );

  const token =
    params.get("token") ||
    params.get("access_token");

  const account =
    params.get("account") ||
    params.get("account_id");

  if (token) {

    state.accessToken =
      token;

    state.connected = true;

    if (account) {

      state.accountId =
        account;

      if ($("accountId")) {

        $("accountId").value =
          account;

      }

    }

    setText(
      "accountConnection",
      "Authorization detected · PAPER mode"
    );

  }

}

/* =========================================================
   CONNECT BUTTON
========================================================= */

function bindConnectionButton() {

  $("connectDerivBtn")
    ?.addEventListener(
      "click",
      () => {

        /*
          We deliberately do not execute trades.
          The button provides account connection
          information only.
        */

        setText(
          "accountConnection",
          "KRISHWAVE is running in DEMO/PAPER mode. No real trades are sent."
        );

      }
    );

}

/* =========================================================
   CURRENCY
========================================================= */

function bindCurrency() {

  const select =
    $("currency");

  if (!select) return;

  select.value =
    state.currency;

  select.addEventListener(
    "change",
    event => {

      state.currency =
        event.target.value;

      saveSettings();

      updateBalance();

      renderHistory();

      renderActiveTrades();

    }
  );

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
   CLOSE MODALS WHEN CLICKING OUTSIDE
========================================================= */

document.addEventListener(
  "click",
  event => {

    if (
      event.target.classList.contains(
        "modal"
      )
    ) {

      event.target.classList.remove(
        "open"
      );

    }

  }
);

/* =========================================================
   DOM READY
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadTheme();

    loadHistory();

    buildInitialMarkets();

    populateMarketSelectors();

    bindNavigation();

    bindTheme();

    bindEngineTabs();

    bindBotControls();

    bindManualControls();

    bindCircularControls();

    bindStrategyModal();

    bindBotStrategyModal();

    bindClearHistory();

    bindConnectionButton();

    bindCurrency();

    checkOAuthCallback();

    renderHistory();

    renderActiveTrades();

    updateStats();

    updateBalance();

    updateConnectionUI();

    updateTargetDigitVisibility();

    updateBotStrategyCheckboxes();

    connectPublicMarket();

    resetSelectedMarketView();

  }
);

/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI() {

  setText(
    "accountConnection",
    state.connected
      ? "Public market data connected · PAPER mode"
      : "Paper account active"
  );

  setText(
    "dataStatus",
    state.connected
      ? "LIVE"
      : "CONNECTING"
  );

}

/* =========================================================
   INITIAL FALLBACK DATA
   ---------------------------------------------------------
   If public market data is unavailable for a while,
   the interface remains usable in paper mode.

   We do NOT fabricate market ticks here.
========================================================= */