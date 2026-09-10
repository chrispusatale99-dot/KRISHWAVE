/* =========================================================
   KRISHWAVE AI BEAST V7.2
   DERIV LIVE MARKET INTELLIGENCE
   PAPER TRADING ENGINE
   ========================================================= */

"use strict";

/* =========================
   CONFIG
========================= */

const BACKEND_URL =
  "https://krishwave-production.up.railway.app";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

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
const START_BALANCE = 1000;

const STORAGE = {
  history: "krishwave_v72_history",
  balance: "krishwave_v72_balance",
  theme: "krishwave_v72_theme",
  settings: "krishwave_v72_settings"
};

/* =========================
   STATE
========================= */

const state = {
  backendConfig: null,

  sessionId: null,
  accountInfo: null,

  publicWs: null,
  authenticatedWs: null,

  publicConnected: false,
  authenticatedConnected: false,

  selectedMarket: "R_10",

  botStrategyPool: ["MATCHES", "DIFFERS"],

  currentPage: "analysis",
  currentEngine: "bot",

  manualStrategy: "MATCHES",
  circularStrategy: "MATCHES",

  paperBalance: START_BALANCE,

  history: [],
  activeTrades: [],

  markets: new Map(),

  botRunning: false,
  circularRunning: false,

  circularTimer: null,
  botTimer: null,

  circularStage: "idle",
  circularSeconds: 10,

  lastAI: null,

  mode: "demo",

  sessionNet: 0,

  tradeCounter: 0
};

/* =========================
   HELPERS
========================= */

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
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value) {
  return "$" + safeNumber(value).toFixed(2);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function now() {
  return new Date().toISOString();
}

function showToast(message) {
  const toast = $("toast");
  const text = $("toastMessage");

  if (!toast || !text) return;

  text.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE.history,
      JSON.stringify(state.history)
    );

    localStorage.setItem(
      STORAGE.balance,
      String(state.paperBalance)
    );

    localStorage.setItem(
      STORAGE.settings,
      JSON.stringify({
        selectedMarket: state.selectedMarket,
        botStrategyPool: state.botStrategyPool,
        manualStrategy: state.manualStrategy,
        circularStrategy: state.circularStrategy,
        mode: state.mode
      })
    );
  } catch (error) {
    console.warn("Storage error:", error);
  }
}

function loadState() {
  try {
    const history =
      JSON.parse(
        localStorage.getItem(STORAGE.history) || "[]"
      );

    if (Array.isArray(history)) {
      state.history = history;
    }

    const balance =
      Number(localStorage.getItem(STORAGE.balance));

    if (Number.isFinite(balance)) {
      state.paperBalance = balance;
    }

    const settings =
      JSON.parse(
        localStorage.getItem(STORAGE.settings) || "{}"
      );

    if (settings.selectedMarket) {
      state.selectedMarket = settings.selectedMarket;
    }

    if (Array.isArray(settings.botStrategyPool) &&
        settings.botStrategyPool.length) {
      state.botStrategyPool =
        settings.botStrategyPool;
    }

    if (settings.manualStrategy) {
      state.manualStrategy =
        settings.manualStrategy;
    }

    if (settings.circularStrategy) {
      state.circularStrategy =
        settings.circularStrategy;
    }

    if (settings.mode) {
      state.mode = settings.mode;
    }

  } catch (error) {
    console.warn("Load state error:", error);
  }
}

/* =========================
   MARKET STATE
========================= */

function createMarket(symbol) {
  if (!state.markets.has(symbol)) {
    state.markets.set(symbol, {
      symbol,
      prices: [],
      digits: [],
      counts: Array(10).fill(0),
      lastPrice: null,
      lastDigit: null,
      lastTickTime: null,
      pipSize: null,
      tickCount: 0
    });
  }

  return state.markets.get(symbol);
}

MARKETS.forEach(createMarket);

function extractQuote(message) {
  if (!message) return null;

  if (message.tick && message.tick.quote != null) {
    return {
      symbol: message.tick.symbol,
      quote: safeNumber(message.tick.quote),
      pip: message.tick.pip_size
    };
  }

  if (message.history) {
    return null;
  }

  return null;
}

function deriveDigit(quote, pipSize) {
  const text = String(quote);

  let decimals = 0;

  if (Number.isFinite(Number(pipSize)) && pipSize > 0) {
    decimals =
      Math.max(
        0,
        Math.round(
          -Math.log10(Number(pipSize))
        )
      );
  } else if (text.includes(".")) {
    decimals = text.split(".")[1].length;
  }

  const fixed =
    Number(quote).toFixed(
      clamp(decimals, 0, 8)
    );

  const digits = fixed.replace(/\D/g, "");

  if (!digits.length) {
    return Math.abs(
      Math.floor(Number(quote))
    ) % 10;
  }

  return Number(
    digits.charAt(digits.length - 1)
  );
}

function addTick(symbol, quote, pipSize) {
  if (!symbol || !MARKETS.includes(symbol)) {
    return;
  }

  const market = createMarket(symbol);

  const price = safeNumber(quote);

  if (!Number.isFinite(price)) return;

  const digit = deriveDigit(price, pipSize);

  market.pipSize = pipSize;
  market.lastPrice = price;
  market.lastDigit = digit;
  market.lastTickTime = Date.now();
  market.tickCount++;

  market.prices.push(price);
  market.digits.push(digit);
  market.counts[digit]++;

  if (market.prices.length > 120) {
    market.prices.shift();
  }

  if (market.digits.length > 120) {
    const oldDigit = market.digits.shift();

    if (
      Number.isInteger(oldDigit) &&
      market.counts[oldDigit] > 0
    ) {
      market.counts[oldDigit]--;
    }
  }

  if (market.symbol === state.selectedMarket) {
    renderSelectedMarket();
  }

  updateAI();

  settleTradesForMarket(symbol, digit);
}

/* =========================
   HISTORY BOOTSTRAP
========================= */

function processHistory(symbol, history) {
  if (!history) return;

  const prices =
    Array.isArray(history.prices)
      ? history.prices
      : [];

  const times =
    Array.isArray(history.times)
      ? history.times
      : [];

  const market = createMarket(symbol);

  for (let i = 0; i < prices.length; i++) {
    const price = safeNumber(prices[i]);

    if (!Number.isFinite(price)) continue;

    const digit = deriveDigit(
      price,
      market.pipSize
    );

    market.prices.push(price);
    market.digits.push(digit);
    market.counts[digit]++;
    market.lastPrice = price;
    market.lastDigit = digit;

    if (times[i]) {
      market.lastTickTime =
        Number(times[i]) * 1000;
    }
  }

  while (market.prices.length > 120) {
    market.prices.shift();
  }

  while (market.digits.length > 120) {
    const d = market.digits.shift();

    if (market.counts[d] > 0) {
      market.counts[d]--;
    }
  }

  renderSelectedMarket();
  updateAI();
}

/* =========================
   PUBLIC WEBSOCKET
========================= */

function connectPublicWS() {
  if (
    state.publicWs &&
    (
      state.publicWs.readyState === WebSocket.OPEN ||
      state.publicWs.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  setConnection("connecting", "CONNECTING");

  try {
    state.publicWs =
      new WebSocket(PUBLIC_WS);

    state.publicWs.onopen = () => {
      state.publicConnected = true;

      setConnection(
        "online",
        "LIVE DATA"
      );

      $("dataStatus").textContent =
        "Live Deriv market feed connected.";

      subscribeMarkets();
    };

    state.publicWs.onmessage = event => {
      try {
        const message =
          JSON.parse(event.data);

        handlePublicMessage(message);
      } catch (error) {
        console.warn(
          "WebSocket parse error",
          error
        );
      }
    };

    state.publicWs.onerror = error => {
      console.warn(
        "Public WebSocket error",
        error
      );
    };

    state.publicWs.onclose = () => {
      state.publicConnected = false;

      setConnection(
        "offline",
        "RECONNECTING"
      );

      $("dataStatus").textContent =
        "Market feed disconnected. Reconnecting...";

      setTimeout(connectPublicWS, 2500);
    };

  } catch (error) {
    console.error(error);

    setTimeout(
      connectPublicWS,
      3000
    );
  }
}

function sendPublic(data) {
  if (
    state.publicWs &&
    state.publicWs.readyState === WebSocket.OPEN
  ) {
    state.publicWs.send(
      JSON.stringify(data)
    );
  }
}

function subscribeMarkets() {
  MARKETS.forEach(symbol => {

    sendPublic({
      ticks_history: symbol,
      count: 120,
      end: "latest",
      style: "ticks",
      subscribe: 1
    });

  });
}

function handlePublicMessage(message) {

  if (message.error) {
    console.warn(
      "Deriv public error:",
      message.error
    );
    return;
  }

  if (
    message.msg_type === "history" &&
    message.history
  ) {

    const symbol =
      message.echo_req &&
      message.echo_req.ticks_history;

    if (symbol) {
      processHistory(
        symbol,
        message.history
      );
    }

    return;
  }

  if (
    message.msg_type === "tick" &&
    message.tick
  ) {

    const tick =
      extractQuote(message);

    if (tick) {
      addTick(
        tick.symbol,
        tick.quote,
        tick.pip
      );
    }
  }
}

/* =========================
   CONNECTION UI
========================= */

function setConnection(type, text) {

  const dot = $("connectionDot");
  const label = $("connectionText");

  if (!dot || !label) return;

  dot.classList.remove(
    "online",
    "offline"
  );

  if (type === "online") {
    dot.classList.add("online");
  } else {
    dot.classList.add("offline");
  }

  label.textContent = text;
}

/* =========================
   RENDER MARKET
========================= */

function renderSelectedMarket() {

  const market =
    createMarket(
      state.selectedMarket
    );

  $("currentChartMarket").textContent =
    market.symbol;

  $("currentLivePrice").textContent =
    market.lastPrice == null
      ? "---"
      : market.lastPrice;

  $("digitSampleCount").textContent =
    market.digits.length;

  renderDigits(market);
  drawChart(market);
}

function renderDigits(market) {

  const grid =
    $("digitStatsGrid");

  if (!grid) return;

  const total =
    market.digits.length || 1;

  grid.innerHTML = "";

  market.counts.forEach(
    (count, digit) => {

      const percentage =
        (count / total) * 100;

      const item =
        document.createElement("div");

      item.className =
        "digit-stat";

      if (count === Math.max(...market.counts) &&
          count > 0) {
        item.classList.add("hot");
      }

      item.innerHTML = `
        <b>${digit}</b>
        <span>${percentage.toFixed(0)}%</span>
      `;

      grid.appendChild(item);
    }
  );
}

/* =========================
   CHART
========================= */

function drawChart(market) {

  const canvas =
    $("priceChartCanvas");

  if (!canvas) return;

  const rect =
    canvas.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio || 1;

  canvas.width =
    Math.max(1, rect.width * dpr);

  canvas.height =
    Math.max(1, rect.height * dpr);

  const ctx =
    canvas.getContext("2d");

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const prices =
    market.prices.slice(-80);

  if (prices.length < 2) {
    ctx.font = "11px Arial";
    ctx.fillStyle =
      getComputedStyle(
        document.body
      ).getPropertyValue("--muted");

    ctx.fillText(
      "Waiting for live ticks...",
      12,
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

  const padding = 10;

  ctx.beginPath();

  prices.forEach(
    (price, index) => {

      const x =
        padding +
        (
          index /
          (prices.length - 1)
        ) *
        (width - padding * 2);

      const y =
        height -
        padding -
        (
          (price - min) /
          range
        ) *
        (height - padding * 2);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

    }
  );

  ctx.strokeStyle =
    getComputedStyle(
      document.body
    ).getPropertyValue("--accent");

  ctx.lineWidth = 2;
  ctx.stroke();
}

/* =========================
   AI ENGINE
========================= */

function analyseMarket(symbol) {

  const market =
    createMarket(symbol);

  const digits =
    market.digits.slice(-60);

  if (digits.length < 10) {
    return {
      market: symbol,
      strategy: "WAIT",
      prediction: null,
      confidence: 0,
      score: 0,
      reason: "Waiting for more ticks."
    };
  }

  const counts =
    Array(10).fill(0);

  digits.forEach(
    d => counts[d]++
  );

  let hotDigit = 0;

  for (let d = 1; d < 10; d++) {
    if (counts[d] > counts[hotDigit]) {
      hotDigit = d;
    }
  }

  const total = digits.length;

  const digitConfidence =
    counts[hotDigit] / total;

  const evenCount =
    digits.filter(
      d => d % 2 === 0
    ).length;

  const oddCount =
    total - evenCount;

  const evenConfidence =
    Math.max(
      evenCount,
      oddCount
    ) / total;

  const recent =
    digits.slice(-15);

  const recentHot =
    recent.length
      ? recent.filter(
          d => d === hotDigit
        ).length /
        recent.length
      : 0;

  const marketScore =
    Math.round(
      (
        digitConfidence * .45 +
        recentHot * .25 +
        evenConfidence * .30
      ) * 100
    );

  let bestStrategy =
    "MATCHES";

  let prediction =
    hotDigit;

  let confidence =
    digitConfidence * 100;

  const pool =
    state.botStrategyPool.length
      ? state.botStrategyPool
      : ["MATCHES","DIFFERS"];

  const candidates = [];

  pool.forEach(strategy => {

    if (strategy === "MATCHES") {
      candidates.push({
        strategy,
        prediction: hotDigit,
        confidence:
          digitConfidence * 100
      });
    }

    if (strategy === "DIFFERS") {
      candidates.push({
        strategy,
        prediction: hotDigit,
        confidence:
          (1 - digitConfidence) * 100
      });
    }

    if (strategy === "EVEN") {
      candidates.push({
        strategy,
        prediction:
          evenCount >= oddCount
            ? "EVEN"
            : "ODD",
        confidence:
          evenConfidence * 100
      });
    }

    if (strategy === "ODD") {
      candidates.push({
        strategy,
        prediction:
          oddCount >= evenCount
            ? "ODD"
            : "EVEN",
        confidence:
          evenConfidence * 100
      });
    }

    if (strategy === "OVER") {
      const over =
        digits.filter(
          d => d > 4
        ).length / total;

      candidates.push({
        strategy,
        prediction: 4,
        confidence:
          Math.max(over,1-over) * 100
      });
    }

    if (strategy === "UNDER") {
      const under =
        digits.filter(
          d => d < 5
        ).length / total;

      candidates.push({
        strategy,
        prediction: 5,
        confidence:
          Math.max(under,1-under) * 100
      });
    }

  });

  candidates.sort(
    (a,b) =>
      b.confidence - a.confidence
  );

  if (candidates.length) {
    bestStrategy =
      candidates[0].strategy;

    prediction =
      candidates[0].prediction;

    confidence =
      candidates[0].confidence;
  }

  confidence =
    clamp(
      Math.round(confidence),
      1,
      99
    );

  return {
    market: symbol,
    strategy: bestStrategy,
    prediction,
    confidence,
    score: marketScore,
    reason:
      `Based on ${digits.length} recent digits.`
  };
}

function findBestMarket() {

  const results = [];

  MARKETS.forEach(symbol => {

    const result =
      analyseMarket(symbol);

    if (
      result.strategy !== "WAIT"
    ) {
      results.push(result);
    }

  });

  if (!results.length) {
    return analyseMarket(
      state.selectedMarket
    );
  }

  results.sort(
    (a,b) =>
      (
        b.confidence + b.score
      ) -
      (
        a.confidence + a.score
      )
  );

  return results[0];
}

function updateAI() {

  const result =
    findBestMarket();

  state.lastAI = result;

  if (!result) return;

  $("aiMarket").textContent =
    result.market;

  $("aiPrediction").textContent =
    result.prediction == null
      ? "---"
      : result.prediction;

  $("aiType").textContent =
    result.strategy;

  $("analysisConfidence").textContent =
    result.confidence + "%";

  $("aiStatus").textContent =
    result.strategy === "WAIT"
      ? "WAITING"
      : "SIGNAL";

  $("analysisMsg").textContent =
    result.reason;

  $("botSelectedMarket").textContent =
    result.market;

  $("botSelectedStrategy").textContent =
    result.strategy;

  $("botScore").textContent =
    result.score;

  $("botConfidence").textContent =
    result.confidence + "%";

  $("aiPredictionLarge").textContent =
    result.prediction == null
      ? "---"
      : result.prediction;

  $("predictionConfidence").textContent =
    result.confidence + "% confidence";

  $("botStrategyLabel").textContent =
    state.botStrategyPool.join(", ");

  if (
    result.market &&
    result.market !== state.selectedMarket
  ) {
    /* AI can identify another market,
       but Analysis chart remains user-selected. */
  }
}

/* =========================
   MARKET SCANNER
========================= */

function scanMarkets() {

  const result =
    findBestMarket();

  if (!result) {
    showToast(
      "Waiting for market data."
    );
    return;
  }

  state.selectedMarket =
    result.market;

  populateMarketSelectors();

  renderSelectedMarket();
  updateAI();

  showToast(
    `${result.market} selected • ${result.strategy} • ${result.confidence}%`
  );
}

/* =========================
   NAVIGATION
========================= */

function setupNavigation() {

  qsa(".nav-btn").forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const page =
          button.dataset.page;

        state.currentPage =
          page;

        qsa(".nav-btn").forEach(
          b => b.classList.remove("active")
        );

        button.classList.add("active");

        qsa(".page").forEach(
          p => p.classList.remove("active")
        );

        const target =
          $(
            page + "Page"
          );

        if (target) {
          target.classList.add("active");
        }

        if (page === "analysis") {
          renderSelectedMarket();
        }

        if (page === "history") {
          renderHistory();
        }

      }
    );

  });

}

/* =========================
   ENGINE TABS
========================= */

function setupEngineTabs() {

  qsa(".engine-tab").forEach(tab => {

    tab.addEventListener(
      "click",
      () => {

        const engine =
          tab.dataset.engine;

        state.currentEngine =
          engine;

        qsa(".engine-tab").forEach(
          t => t.classList.remove("active")
        );

        tab.classList.add("active");

        qsa(".engine-panel").forEach(
          p => p.classList.remove("active")
        );

        const panel =
          $(
            engine + "Panel"
          );

        if (panel) {
          panel.classList.add("active");
        }

      }
    );

  });

}

/* =========================
   MARKET SELECTORS
========================= */

function populateMarketSelectors() {

  [
    $("circularMarketSelect"),
    $("manualMarketSelect")
  ].forEach(select => {

    if (!select) return;

    const old =
      select.value ||
      state.selectedMarket;

    select.innerHTML = "";

    MARKETS.forEach(symbol => {

      const option =
        document.createElement("option");

      option.value = symbol;
      option.textContent = symbol;

      if (symbol === old) {
        option.selected = true;
      }

      select.appendChild(option);

    });

  });
}

function setupMarketSelectors() {

  const circular =
    $("circularMarketSelect");

  const manual =
    $("manualMarketSelect");

  circular.addEventListener(
    "change",
    () => {
      state.selectedMarket =
        circular.value;

      renderSelectedMarket();
    }
  );

  manual.addEventListener(
    "change",
    () => {
      state.selectedMarket =
        manual.value;

      renderSelectedMarket();
    }
  );
}

/* =========================
   THEME
========================= */

function setupTheme() {

  const saved =
    localStorage.getItem(
      STORAGE.theme
    );

  if (saved === "light") {
    document.body.classList.add("light");
  }

  $("themeToggle").addEventListener(
    "click",
    () => {

      document.body.classList.toggle(
        "light"
      );

      localStorage.setItem(
        STORAGE.theme,
        document.body.classList.contains("light")
          ? "light"
          : "dark"
      );

      renderSelectedMarket();
    }
  );
}

/* =========================
   STRATEGY MODAL
========================= */

let strategyTarget = "manual";

function openStrategyModal(target) {

  strategyTarget = target;

  const modal =
    $("strategyModal");

  const options =
    $("strategyOptions");

  options.innerHTML = "";

  const selected =
    target === "manual"
      ? state.manualStrategy
      : state.circularStrategy;

  STRATEGIES.forEach(strategy => {

    const button =
      document.createElement("button");

    button.type = "button";

    button.className =
      "strategy-option";

    if (strategy === selected) {
      button.classList.add("selected");
    }

    button.textContent =
      strategy;

    button.addEventListener(
      "click",
      () => {

        if (strategyTarget === "manual") {
          state.manualStrategy =
            strategy;

          $("manualStrategyTrigger")
            .textContent =
            strategy;

          $("manualSelectedStrategyLabel")
            .textContent =
            strategy;

          updateTargetVisibility();
        }

        if (strategyTarget === "circular") {
          state.circularStrategy =
            strategy;

          $("circularStrategyTrigger")
            .textContent =
            strategy;

          $("circularStrategyLabel")
            .textContent =
            strategy;
        }

        saveState();

        modal.classList.remove("show");

      }
    );

    options.appendChild(button);

  });

  modal.classList.add("show");
}

function updateTargetVisibility() {

  const container =
    $("targetDigitContainer");

  if (!container) return;

  const strategy =
    state.manualStrategy;

  container.style.display =
    (
      strategy === "MATCHES" ||
      strategy === "DIFFERS" ||
      strategy === "OVER" ||
      strategy === "UNDER"
    )
      ? "block"
      : "none";
}

/* =========================
   BOT STRATEGY MODAL
========================= */

function openBotStrategyModal() {

  qsa(".bot-strategy-check")
    .forEach(check => {

      check.checked =
        state.botStrategyPool.includes(
          check.value
        );

    });

  $("botStrategyModal")
    .classList.add("show");
}

function applyBotStrategies() {

  const selected =
    qsa(".bot-strategy-check")
      .filter(
        check => check.checked
      )
      .map(
        check => check.value
      );

  if (!selected.length) {
    showToast(
      "Select at least one strategy."
    );
    return;
  }

  state.botStrategyPool =
    selected;

  saveState();

  $("botStrategyModal")
    .classList.remove("show");

  updateAI();

  showToast(
    "AI strategies updated."
  );
}

/* =========================
   PAYOUT ENGINE
========================= */

function profitMultiplier(strategy) {

  if (strategy === "MATCHES") {
    return 8.5;
  }

  if (strategy === "DIFFERS") {
    return 0.09;
  }

  return 0.95;
}

function tradeWon(trade, exitDigit) {

  if (trade.strategy === "MATCHES") {
    return (
      exitDigit ===
      trade.targetDigit
    );
  }

  if (trade.strategy === "DIFFERS") {
    return (
      exitDigit !==
      trade.targetDigit
    );
  }

  if (trade.strategy === "OVER") {
    return (
      exitDigit >
      trade.targetDigit
    );
  }

  if (trade.strategy === "UNDER") {
    return (
      exitDigit <
      trade.targetDigit
    );
  }

  if (trade.strategy === "EVEN") {
    return exitDigit % 2 === 0;
  }

  if (trade.strategy === "ODD") {
    return exitDigit % 2 === 1;
  }

  return false;
}

/* =========================
   OPEN PAPER TRADE
========================= */

function openPaperTrade(options) {

  const stake =
    Math.max(
      MIN_STAKE,
      safeNumber(
        options.stake,
        MIN_STAKE
      )
    );

  if (stake > state.paperBalance) {
    showToast(
      "Insufficient paper balance."
    );
    return null;
  }

  const market =
    createMarket(
      options.market ||
      state.selectedMarket
    );

  if (market.lastDigit == null) {
    showToast(
      "Waiting for a live tick."
    );
    return null;
  }

  let target =
    options.targetDigit;

  if (
    target == null &&
    (
      options.strategy === "OVER"
    )
  ) {
    target = 4;
  }

  if (
    target == null &&
    (
      options.strategy === "UNDER"
    )
  ) {
    target = 5;
  }

  if (
    (
      options.strategy === "MATCHES" ||
      options.strategy === "DIFFERS"
    ) &&
    !Number.isInteger(
      Number(target)
    )
  ) {
    showToast(
      "Enter a target digit from 0 to 9."
    );
    return null;
  }

  if (target != null) {
    target =
      clamp(
        Number(target),
        0,
        9
      );
  }

  const trade = {
    id:
      "KW-" +
      Date.now() +
      "-" +
      (++state.tradeCounter),

    market:
      options.market ||
      state.selectedMarket,

    strategy:
      options.strategy,

    prediction:
      options.prediction,

    targetDigit:
      target,

    entryDigit:
      market.lastDigit,

    entryPrice:
      market.lastPrice,

    stake,

    source:
      options.source ||
      "MANUAL",

    createdAt:
      now(),

    takeProfit:
      safeNumber(
        options.takeProfit,
        0
      ),

    stopLoss:
      safeNumber(
        options.stopLoss,
        0
      ),

    martingale:
      safeNumber(
        options.martingale,
        1
      ),

    status:
      "OPEN"
  };

  state.paperBalance -= stake;

  state.activeTrades.push(
    trade
  );

  saveState();

  updateBalanceUI();
  renderActiveTrades();

  return trade;
}

/* =========================
   SETTLEMENT
========================= */

function settleTradesForMarket(
  symbol,
  exitDigit
) {

  const trades =
    state.activeTrades.filter(
      trade =>
        trade.market === symbol
    );

  trades.forEach(
    trade => settleTrade(
      trade,
      exitDigit
    )
  );
}

function settleTrade(
  trade,
  exitDigit
) {

  const index =
    state.activeTrades.indexOf(
      trade
    );

  if (index < 0) return;

  const won =
    tradeWon(
      trade,
      exitDigit
    );

  const profit =
    won
      ? trade.stake *
        profitMultiplier(
          trade.strategy
        )
      : -trade.stake;

  const amountWon =
    won
      ? trade.stake + profit
      : 0;

  state.paperBalance +=
    won
      ? amountWon
      : 0;

  state.sessionNet +=
    profit;

  const record = {
    ...trade,

    exitDigit,

    result:
      won
        ? "WIN"
        : "LOSS",

    amountWon,

    netProfit:
      profit,

    settledAt:
      now(),

    status:
      "CLOSED"
  };

  state.activeTrades.splice(
    index,
    1
  );

  state.history.unshift(
    record
  );

  if (state.history.length > 500) {
    state.history =
      state.history.slice(0,500);
  }

  saveState();

  updateBalanceUI();
  renderActiveTrades();
  renderHistory();
  updateStats();

  if (won) {
    showToast(
      `${trade.strategy} WIN +${money(profit)}`
    );
  } else {
    showToast(
      `${trade.strategy} LOSS -${money(trade.stake)}`
    );
  }

  checkTradingLimits();

  if (
    !won &&
    trade.source !== "MANUAL" &&
    trade.martingale > 1
  ) {
    scheduleMartingale(
      trade
    );
  }
}

/* =========================
   MARTINGALE
========================= */

function scheduleMartingale(
  previousTrade
) {

  if (
    !state.botRunning &&
    !state.circularRunning
  ) {
    return;
  }

  setTimeout(
    () => {

      if (
        !state.botRunning &&
        !state.circularRunning
      ) {
        return;
      }

      const result =
        findBestMarket();

      if (!result ||
          result.strategy === "WAIT") {
        return;
      }

      const nextStake =
        previousTrade.stake *
        previousTrade.martingale;

      openPaperTrade({
        market:
          result.market,

        strategy:
          result.strategy,

        prediction:
          result.prediction,

        targetDigit:
          result.prediction,

        stake:
          nextStake,

        source:
          "MARTINGALE",

        takeProfit:
          previousTrade.takeProfit,

        stopLoss:
          previousTrade.stopLoss,

        martingale:
          previousTrade.martingale
      });

    },
    700
  );
}

/* =========================
   MANUAL TRADE
========================= */

function placeManualTrade() {

  const strategy =
    state.manualStrategy;

  let target =
    safeNumber(
      $("manualTargetDigitInput").value,
      5
    );

  if (
    (
      strategy === "MATCHES" ||
      strategy === "DIFFERS" ||
      strategy === "OVER" ||
      strategy === "UNDER"
    ) &&
    (
      target < 0 ||
      target > 9
    )
  ) {
    showToast(
      "Target digit must be 0 to 9."
    );
    return;
  }

  openPaperTrade({

    market:
      $("manualMarketSelect").value,

    strategy,

    prediction:
      strategy === "EVEN"
        ? "EVEN"
        : strategy === "ODD"
          ? "ODD"
          : target,

    targetDigit:
      target,

    stake:
      safeNumber(
        $("manualStakeInput").value,
        MIN_STAKE
      ),

    source:
      "MANUAL",

    takeProfit:
      safeNumber(
        $("manualTakeProfitInput").value
      ),

    stopLoss:
      safeNumber(
        $("manualStopLossInput").value
      ),

    martingale:
      1

  });

}

/* =========================
   AI BOT
========================= */

function startBot() {

  if (state.botRunning) {
    stopBot();
    return;
  }

  state.botRunning = true;

  $("startBotBtn").textContent =
    "STOP AI BOT";

  $("botStatusDash").textContent =
    "RUNNING";

  runBotCycle();

  state.botTimer =
    setInterval(
      runBotCycle,
      5000
    );

  showToast(
    "AI BOT started."
  );
}

function stopBot() {

  state.botRunning = false;

  clearInterval(
    state.botTimer
  );

  state.botTimer = null;

  $("startBotBtn").textContent =
    "START AI BOT";

  $("botStatusDash").textContent =
    "STOPPED";
}

function runBotCycle() {

  if (!state.botRunning) return;

  const result =
    findBestMarket();

  if (
    !result ||
    result.strategy === "WAIT"
  ) {
    return;
  }

  if (result.confidence < 52) {
    $("botStatusDash").textContent =
      "LOW CONFIDENCE";

    return;
  }

  $("botStatusDash").textContent =
    "SIGNAL";

  openPaperTrade({

    market:
      result.market,

    strategy:
      result.strategy,

    prediction:
      result.prediction,

    targetDigit:
      result.prediction,

    stake:
      safeNumber(
        $("stakeInput").value,
        MIN_STAKE
      ),

    source:
      "AI BOT",

    takeProfit:
      safeNumber(
        $("takeProfitInput").value
      ),

    stopLoss:
      safeNumber(
        $("stopLossInput").value
      ),

    martingale:
      Math.max(
        1,
        safeNumber(
          $("martingaleInput").value,
          1
        )
      )

  });
}

/* =========================
   CIRCULAR AI
========================= */

function startCircularAI() {

  if (state.circularRunning) {
    stopCircularAI();
    return;
  }

  state.circularRunning = true;

  state.circularStage =
    "analyzing";

  state.circularSeconds =
    10;

  runCircularTimer();

  state.circularTimer =
    setInterval(
      runCircularTimer,
      1000
    );

  $("circularStatusText").textContent =
    "RUNNING";

  showToast(
    "Circular AI started."
  );
}

function stopCircularAI() {

  state.circularRunning = false;

  clearInterval(
    state.circularTimer
  );

  state.circularTimer = null;

  state.circularStage =
    "idle";

  state.circularSeconds =
    10;

  renderCircularUI();

  $("circularStatusText").textContent =
    "STOPPED";
}

function runCircularTimer() {

  if (!state.circularRunning) {
    return;
  }

  if (
    state.circularStage ===
    "analyzing"
  ) {

    renderCircularUI();

    if (state.circularSeconds > 1) {
      state.circularSeconds--;
      return;
    }

    const result =
      findBestMarket();

    if (
      result &&
      result.strategy !== "WAIT"
    ) {
      state.lastAI = result;

      $("aiCirclePrediction").textContent =
        `${result.market} • ${result.strategy} • ${result.prediction}`;

      $("circularStatusText").textContent =
        `${result.strategy} ${result.confidence}%`;

      state.circularStage =
        "lock";

      state.circularSeconds =
        5;

      renderCircularUI();

      return;
    }

    state.circularSeconds =
      10;

    return;
  }

  if (
    state.circularStage ===
    "lock"
  ) {

    renderCircularUI();

    if (state.circularSeconds > 1) {
      state.circularSeconds--;
      return;
    }

    state.circularStage =
      "trade";

    state.circularSeconds =
      3;

    renderCircularUI();

    return;
  }

  if (
    state.circularStage ===
    "trade"
  ) {

    renderCircularUI();

    if (state.circularSeconds > 1) {
      state.circularSeconds--;
      return;
    }

    executeCircularTrade();

    state.circularStage =
      "analyzing";

    state.circularSeconds =
      10;

    renderCircularUI();
  }
}

function executeCircularTrade() {

  const result =
    state.lastAI ||
    findBestMarket();

  if (
    !result ||
    result.strategy === "WAIT"
  ) {
    return;
  }

  openPaperTrade({

    market:
      result.market,

    strategy:
      result.strategy,

    prediction:
      result.prediction,

    targetDigit:
      result.prediction,

    stake:
      safeNumber(
        $("circularStakeInput").value,
        MIN_STAKE
      ),

    source:
      "CIRCULAR AI",

    takeProfit:
      safeNumber(
        $("circularTakeProfitInput").value
      ),

    stopLoss:
      safeNumber(
        $("circularStopLossInput").value
      ),

    martingale:
      1

  });
}

function renderCircularUI() {

  const circle =
    $("aiCircle");

  const label =
    $("aiCircleLabel");

  const timer =
    $("aiCircleTimer");

  const cooldown =
    $("cycleCooldown");

  const analysis =
    $("cycleAnalysis");

  const trade =
    $("cycleTrade");

  circle.classList.remove(
    "stage-idle",
    "stage-analyzing",
    "stage-prediction",
    "stage-lock",
    "stage-trade"
  );

  analysis.classList.remove(
    "active"
  );

  trade.classList.remove(
    "active"
  );

  if (
    state.circularStage ===
    "idle"
  ) {

    circle.classList.add(
      "stage-idle"
    );

    label.textContent =
      "READY";

    timer.textContent =
      "10";

    cooldown.textContent =
      "Circular AI is stopped.";

    return;
  }

  if (
    state.circularStage ===
    "analyzing"
  ) {

    circle.classList.add(
      "stage-analyzing"
    );

    label.textContent =
      "ANALYZING";

    timer.textContent =
      String(
        Math.max(
          0,
          state.circularSeconds
        )
      );

    analysis.classList.add(
      "active"
    );

    cooldown.textContent =
      "AI is analysing the highest-confidence market.";

    return;
  }

  if (
    state.circularStage ===
    "lock"
  ) {

    circle.classList.add(
      "stage-lock"
    );

    label.textContent =
      "LOCK";

    timer.textContent =
      String(
        Math.max(
          0,
          state.circularSeconds
        )
      );

    cooldown.textContent =
      "Prediction locked. Preparing trade signal.";

    return;
  }

  if (
    state.circularStage ===
    "trade"
  ) {

    circle.classList.add(
      "stage-trade"
    );

    label.textContent =
      "TRADE NOW";

    timer.textContent =
      String(
        Math.max(
          0,
          state.circularSeconds
        )
      );

    trade.classList.add(
      "active"
    );

    cooldown.textContent =
      "PAPER TRADE SIGNAL ACTIVE.";

  }
}

/* =========================
   LIMITS
========================= */

function checkTradingLimits() {

  const limits = [];

  if (state.currentEngine === "bot") {
    limits.push({
      take:
        safeNumber(
          $("takeProfitInput").value
        ),
      stop:
        safeNumber(
          $("stopLossInput").value
        )
    });
  }

  if (state.currentEngine === "circular") {
    limits.push({
      take:
        safeNumber(
          $("circularTakeProfitInput").value
        ),
      stop:
        safeNumber(
          $("circularStopLossInput").value
        )
    });
  }

  if (!limits.length) return;

  const limit =
    limits[0];

  if (
    limit.take > 0 &&
    state.sessionNet >= limit.take
  ) {
    stopAllAutoTrading();

    showToast(
      "Take profit reached."
    );
  }

  if (
    limit.stop > 0 &&
    state.sessionNet <= -limit.stop
  ) {
    stopAllAutoTrading();

    showToast(
      "Stop loss reached."
    );
  }
}

function stopAllAutoTrading() {

  stopBot();
  stopCircularAI();

  $("circularStatusText").textContent =
    "STOPPED";

  $("botStatusDash").textContent =
    "STOPPED";
}

/* =========================
   ACTIVE TRADES
========================= */

function renderActiveTrades() {

  const list =
    $("activeTradesList");

  $("activeTradeCount").textContent =
    state.activeTrades.length;

  if (!state.activeTrades.length) {

    list.innerHTML =
      `<div class="empty-state">
        No active trades.
      </div>`;

    return;
  }

  list.innerHTML =
    state.activeTrades.map(
      trade => `

        <div class="active-trade-card">

          <div class="trade-top">
            <strong>
              ${escapeHTML(trade.market)}
            </strong>

            <strong>
              ${escapeHTML(trade.strategy)}
            </strong>
          </div>

          <div class="trade-meta">

            <div>
              <span>Entry</span>
              <b>${trade.entryDigit}</b>
            </div>

            <div>
              <span>Target</span>
              <b>
                ${
                  trade.targetDigit == null
                    ? "-"
                    : trade.targetDigit
                }
              </b>
            </div>

            <div>
              <span>Stake</span>
              <b>${money(trade.stake)}</b>
            </div>

            <div>
              <span>Source</span>
              <b>${escapeHTML(trade.source)}</b>
            </div>

          </div>

        </div>
      `
    ).join("");
}

/* =========================
   STATISTICS
========================= */

function updateStats() {

  const total =
    state.history.length;

  const wins =
    state.history.filter(
      x => x.result === "WIN"
    ).length;

  const losses =
    state.history.filter(
      x => x.result === "LOSS"
    ).length;

  const accuracy =
    total
      ? (wins / total) * 100
      : 0;

  $("paperTotal").textContent =
    total;

  $("paperWins").textContent =
    wins;

  $("paperLosses").textContent =
    losses;

  $("paperAccuracy").textContent =
    accuracy.toFixed(1) + "%";

  $("sessionProfitDisplay").textContent =
    money(state.sessionNet);

  $("sessionProfitDisplay")
    .classList.toggle(
      "positive",
      state.sessionNet > 0
    );

  $("sessionProfitDisplay")
    .classList.toggle(
      "negative",
      state.sessionNet < 0
    );
}

/* =========================
   HISTORY
========================= */

function renderHistory() {

  const list =
    $("historyCardsList");

  const totalStake =
    state.history.reduce(
      (sum, item) =>
        sum + safeNumber(item.stake),
      0
    );

  const amountWon =
    state.history.reduce(
      (sum, item) =>
        sum + safeNumber(item.amountWon),
      0
    );

  const net =
    state.history.reduce(
      (sum, item) =>
        sum + safeNumber(item.netProfit),
      0
    );

  $("historyTotalStake").textContent =
    money(totalStake);

  $("historyAmountWon").textContent =
    money(amountWon);

  $("historyNetProfit").textContent =
    money(net);

  $("historyNetProfit")
    .classList.toggle(
      "positive",
      net > 0
    );

  $("historyNetProfit")
    .classList.toggle(
      "negative",
      net < 0
    );

  if (!state.history.length) {

    list.innerHTML =
      `<div class="empty-state">
        No trades recorded yet.
      </div>`;

    return;
  }

  list.innerHTML =
    state.history.map(
      trade => {

        const time =
          new Date(
            trade.settledAt ||
            trade.createdAt
          ).toLocaleString();

        return `

          <div class="history-card ${
            trade.result === "WIN"
              ? "history-win"
              : "history-loss"
          }">

            <div class="history-top">

              <strong>
                ${escapeHTML(trade.market)}
              </strong>

              <strong class="${
                trade.result === "WIN"
                  ? "positive"
                  : "negative"
              }">
                ${escapeHTML(trade.result)}
              </strong>

            </div>

            <div class="history-meta">

              <div>
                <span>Strategy</span>
                <b>${escapeHTML(trade.strategy)}</b>
              </div>

              <div>
                <span>Source</span>
                <b>${escapeHTML(trade.source)}</b>
              </div>

              <div>
                <span>Prediction</span>
                <b>${trade.prediction ?? "-"}</b>
              </div>

              <div>
                <span>Target</span>
                <b>${trade.targetDigit ?? "-"}</b>
              </div>

              <div>
                <span>Entry</span>
                <b>${trade.entryDigit ?? "-"}</b>
              </div>

              <div>
                <span>Exit</span>
                <b>${trade.exitDigit ?? "-"}</b>
              </div>

              <div>
                <span>Stake</span>
                <b>${money(trade.stake)}</b>
              </div>

              <div>
                <span>Amount Won</span>
                <b>${money(trade.amountWon)}</b>
              </div>

              <div>
                <span>Net Profit</span>
                <b class="${
                  trade.netProfit >= 0
                    ? "positive"
                    : "negative"
                }">
                  ${money(trade.netProfit)}
                </b>
              </div>

              <div>
                <span>Time</span>
                <b>${escapeHTML(time)}</b>
              </div>

            </div>

          </div>
        `;
      }
    ).join("");
}

/* =========================
   BALANCE
========================= */

function updateBalanceUI() {

  const account =
    state.accountInfo;

  if (
    account &&
    account.balance != null
  ) {
    $("balanceDisplay").textContent =
      `${safeNumber(account.balance).toFixed(2)} ${account.currency || ""}`;
  } else {
    $("balanceDisplay").textContent =
      money(state.paperBalance);
  }

  $("currency").textContent =
    account &&
    account.currency
      ? account.currency
      : "USD";

  $("accountId").textContent =
    account &&
    (
      account.id ||
      account.loginid ||
      account.account_id
    )
      ? (
          account.id ||
          account.loginid ||
          account.account_id
        )
      : "Not connected";
}

/* =========================
   DERIV OAUTH
========================= */

function randomString(length = 64) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const array =
    new Uint8Array(length);

  crypto.getRandomValues(array);

  return Array.from(array)
    .map(
      n => chars[n % chars.length]
    )
    .join("");
}

function base64Url(buffer) {

  let binary = "";

  const bytes =
    new Uint8Array(buffer);

  bytes.forEach(
    byte => {
      binary += String.fromCharCode(byte);
    }
  );

  return btoa(binary)
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/,"");
}

async function createChallenge(verifier) {

  const data =
    new TextEncoder()
      .encode(verifier);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return base64Url(hash);
}

async function startOAuth() {

  try {

    const config =
      await getBackendConfig();

    if (!config || !config.client_id) {
      throw new Error(
        "Backend configuration unavailable."
      );
    }

    const verifier =
      randomString(64);

    const stateValue =
      randomString(32);

    const challenge =
      await createChallenge(
        verifier
      );

    sessionStorage.setItem(
      "kw_pkce_verifier",
      verifier
    );

    sessionStorage.setItem(
      "kw_oauth_state",
      stateValue
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
      "read"
    );

    params.set(
      "state",
      stateValue
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
      "https://auth.deriv.com/oauth2/auth?" +
      params.toString();

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "OAuth startup failed."
    );
  }
}

async function getBackendConfig() {

  if (state.backendConfig) {
    return state.backendConfig;
  }

  const response =
    await fetch(
      `${BACKEND_URL}/api/config`
    );

  if (!response.ok) {
    throw new Error(
      "KRISHWAVE backend is unavailable."
    );
  }

  state.backendConfig =
    await response.json();

  return state.backendConfig;
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

  if (!code) {
    return;
  }

  const savedState =
    sessionStorage.getItem(
      "kw_oauth_state"
    );

  const verifier =
    sessionStorage.getItem(
      "kw_pkce_verifier"
    );

  if (
    !savedState ||
    savedState !== returnedState
  ) {
    showToast(
      "OAuth security state mismatch."
    );
    return;
  }

  if (!verifier) {
    showToast(
      "PKCE verifier missing."
    );
    return;
  }

  try {

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

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
        "OAuth exchange failed."
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
      "kw_pkce_verifier"
    );

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );

    await loadAccounts();

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Deriv connection failed."
    );
  }
}

/* =========================
   ACCOUNTS
========================= */

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
        "Could not load accounts."
      );
    }

    const accounts =
      Array.isArray(data.accounts)
        ? data.accounts
        : [];

    const demo =
      accounts.find(
        account =>
          String(
            account.is_virtual ??
            account.virtual ??
            ""
          ).toLowerCase() ===
          "true"
      ) ||
      accounts.find(
        account =>
          String(
            account.loginid ||
            account.id ||
            ""
          ).startsWith("VRTC")
      ) ||
      accounts[0];

    state.accountInfo =
      demo || null;

    updateBalanceUI();

    if (demo) {
      await connectAuthenticatedAccount(
        demo
      );
    }

    showToast(
      "Deriv account connected."
    );

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Account loading failed."
    );
  }
}

/* =========================
   AUTHENTICATED WS
========================= */

async function connectAuthenticatedAccount(
  account
) {

  if (!state.sessionId) return;

  const accountId =
    account.loginid ||
    account.id ||
    account.account_id;

  if (!accountId) {
    showToast(
      "Deriv account ID unavailable."
    );
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
      !data.success
    ) {
      throw new Error(
        data.error ||
        "Could not authenticate WebSocket."
      );
    }

    if (!data.websocket_url) {
      throw new Error(
        "Deriv did not provide WebSocket URL."
      );
    }

    if (
      state.authenticatedWs
    ) {
      try {
        state.authenticatedWs.close();
      } catch (_) {}
    }

    state.authenticatedWs =
      new WebSocket(
        data.websocket_url
      );

    state.authenticatedWs.onopen =
      () => {

        state.authenticatedConnected =
          true;

        showToast(
          "Authenticated Deriv connection ready."
        );

        requestAccountBalance();

      };

    state.authenticatedWs.onmessage =
      event => {

        try {

          const message =
            JSON.parse(
              event.data
            );

          handleAuthenticatedMessage(
            message
          );

        } catch (error) {
          console.warn(error);
        }

      };

    state.authenticatedWs.onclose =
      () => {

        state.authenticatedConnected =
          false;

      };

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Authenticated connection failed."
    );
  }
}

function requestAccountBalance() {

  if (
    !state.authenticatedWs ||
    state.authenticatedWs.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }

  state.authenticatedWs.send(
    JSON.stringify({
      balance: 1,
      subscribe: 1
    })
  );
}

function handleAuthenticatedMessage(
  message
) {

  if (message.error) {
    console.warn(
      "Authenticated Deriv error:",
      message.error
    );
    return;
  }

  if (
    message.msg_type === "balance" &&
    message.balance
  ) {

    const b =
      message.balance;

    state.accountInfo = {
      ...state.accountInfo,
      balance:
        safeNumber(b.balance),
      currency:
        b.currency ||
        state.accountInfo.currency,
      loginid:
        b.loginid ||
        state.accountInfo.loginid
    };

    updateBalanceUI();
  }
}

/* =========================
   MODE
========================= */

function setMode(mode) {

  state.mode = mode;

  $("demoModeBtn")
    .classList.toggle(
      "active",
      mode === "demo"
    );

  $("realModeBtn")
    .classList.toggle(
      "active",
      mode === "real"
    );

  const banner =
    $("tradingStatusLabel");

  banner.classList.remove(
    "demo-mode",
    "real-mode"
  );

  if (mode === "demo") {

    banner.classList.add(
      "demo-mode"
    );

    banner.textContent =
      "DEMO ACCOUNT • PAPER EXECUTION";

  } else {

    banner.classList.add(
      "real-mode"
    );

    banner.textContent =
      "REAL ACCOUNT SELECTED • PAPER EXECUTION ONLY";

  }

  saveState();

  updateBalanceUI();
}

/* =========================
   REAL MODE
========================= */

function requestRealMode() {

  $("realConfirmModal")
    .classList.add("show");
}

function confirmRealMode() {

  $("realConfirmModal")
    .classList.remove("show");

  setMode("real");

  showToast(
    "Real account selected. Paper execution remains active."
  );
}

/* =========================
   CLEAR HISTORY
========================= */

function clearHistory() {

  const ok =
    window.confirm(
      "Clear all KRISHWAVE paper-trade history?"
    );

  if (!ok) return;

  state.history = [];

  state.sessionNet = 0;

  saveState();

  renderHistory();
  updateStats();

  showToast(
    "History cleared."
  );
}

/* =========================
   ESCAPE HTML
========================= */

function escapeHTML(value) {

  return String(
    value == null
      ? ""
      : value
  )
  .replace(/&/g,"&amp;")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;")
  .replace(/'/g,"&#039;");
}

/* =========================
   EVENTS
========================= */

function setupEvents() {

  $("analysisScanBtn")
    .addEventListener(
      "click",
      scanMarkets
    );

  $("startAI")
    .addEventListener(
      "click",
      startCircularAI
    );

  $("stopAI")
    .addEventListener(
      "click",
      stopCircularAI
    );

  $("startBotBtn")
    .addEventListener(
      "click",
      startBot
    );

  $("startCircularTradeBtn")
    .addEventListener(
      "click",
      startCircularAI
    );

  $("placeTradeBtn")
    .addEventListener(
      "click",
      placeManualTrade
    );

  $("stopTradingBtn")
    .addEventListener(
      "click",
      stopAllAutoTrading
    );

  $("clearLogsBtn")
    .addEventListener(
      "click",
      clearHistory
    );

  $("botStrategyTrigger")
    .addEventListener(
      "click",
      openBotStrategyModal
    );

  $("applyBotStrategies")
    .addEventListener(
      "click",
      applyBotStrategies
    );

  $("manualStrategyTrigger")
    .addEventListener(
      "click",
      () =>
        openStrategyModal("manual")
    );

  $("circularStrategyTrigger")
    .addEventListener(
      "click",
      () =>
        openStrategyModal("circular")
    );

  $("closeStrategyModal")
    .addEventListener(
      "click",
      () =>
        $("strategyModal")
          .classList.remove("show")
    );

  $("closeBotStrategyModal")
    .addEventListener(
      "click",
      () =>
        $("botStrategyModal")
          .classList.remove("show")
    );

  $("demoModeBtn")
    .addEventListener(
      "click",
      () =>
        setMode("demo")
    );

  $("realModeBtn")
    .addEventListener(
      "click",
      requestRealMode
    );

  $("confirmRealBtn")
    .addEventListener(
      "click",
      confirmRealMode
    );

  $("cancelRealBtn")
    .addEventListener(
      "click",
      () =>
        $("realConfirmModal")
          .classList.remove("show")
    );

  $("connectDerivBtn")
    .addEventListener(
      "click",
      startOAuth
    );

  setupNavigation();
  setupEngineTabs();
  setupMarketSelectors();
  setupTheme();
}

/* =========================
   INIT
========================= */

async function init() {

  loadState();

  populateMarketSelectors();

  $("manualStrategyTrigger")
    .textContent =
    state.manualStrategy;

  $("manualSelectedStrategyLabel")
    .textContent =
    state.manualStrategy;

  $("circularStrategyTrigger")
    .textContent =
    state.circularStrategy;

  $("circularStrategyLabel")
    .textContent =
    state.circularStrategy;

  updateTargetVisibility();

  setMode(
    state.mode === "real"
      ? "real"
      : "demo"
  );

  renderSelectedMarket();
  renderCircularUI();
  renderActiveTrades();
  renderHistory();
  updateStats();
  updateBalanceUI();

  setupEvents();

  try {
    await getBackendConfig();

    $("dataStatus").textContent =
      "KRISHWAVE backend online • starting live data.";

  } catch (error) {

    console.warn(
      "Backend config unavailable:",
      error
    );

    $("dataStatus").textContent =
      "Backend unavailable. Live public data will continue if possible.";
  }

  await handleOAuthCallback();

  const savedSession =
    sessionStorage.getItem(
      "kw_session_id"
    );

  if (
    !state.sessionId &&
    savedSession
  ) {
    state.sessionId =
      savedSession;

    loadAccounts();
  }

  connectPublicWS();

  setInterval(
    updateAI,
    1500
  );

  window.addEventListener(
    "resize",
    () =>
      drawChart(
        createMarket(
          state.selectedMarket
        )
      )
  );
}

document.addEventListener(
  "DOMContentLoaded",
  init
);