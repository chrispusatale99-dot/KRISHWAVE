/* =========================================================
   KRISHWAVE AI BEAST V7.0
   DEMO / PAPER MARKET INTELLIGENCE ENGINE

   IMPORTANT:
   - PAPER / DEMO ONLY
   - NO REAL TRADES ARE EXECUTED
   - AI BOT does NOT use Circular AI cycle
   - AI BOT: 3 sec analysis -> decision -> paper trade
   - Circular AI: only when explicitly selected
   - Manual: only when explicitly selected
========================================================= */


/* =========================================================
   CONFIG
========================================================= */

const DERIV_CLIENT_ID = "34khasPjsT0PCRR8X3Z70";

const REDIRECT_URI =
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";


/* =========================================================
   STORAGE
========================================================= */

const HISTORY_KEY = "krishwave_v7_history";
const BALANCE_KEY = "krishwave_v7_balance";
const THEME_KEY = "krishwave_theme";
const SETTINGS_KEY = "krishwave_v7_settings";


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
   SIMULATED PAPER PAYOUTS
   These are NOT live Deriv payout rates.
========================================================= */

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

  if (el) {
    el.textContent = value;
  }

}


function esc(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function clamp(value, min, max) {

  return Math.max(
    min,
    Math.min(max, value)
  );

}


function sleep(ms) {

  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });

}


function money(value) {

  const n = Number(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: state.currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(
    Number.isFinite(n) ? n : 0
  );

}


function formatMarketName(symbol) {

  return symbol || "—";

}


function strategyLabel(strategy) {

  return STRATEGY_LABELS[strategy] ||
    strategy ||
    "—";

}


/* =========================================================
   INITIAL MARKET STATE
========================================================= */

function buildInitialMarkets() {

  MARKETS.forEach(symbol => {

    state.markets[symbol] = {

      symbol,

      price: null,

      lastDigit: null,

      pipSize: null,

      digits: Array(10).fill(0),

      ticks: 0,

      prices: [],

      digitHistory: [],

      updated: 0,

      received: 0

    };

  });

}


/* =========================================================
   LOAD SETTINGS
========================================================= */

function loadSettings() {

  try {

    const raw =
      localStorage.getItem(SETTINGS_KEY);

    if (!raw) return;

    const settings =
      JSON.parse(raw);

    if (
      Array.isArray(settings.botStrategyPool) &&
      settings.botStrategyPool.length
    ) {

      state.botStrategyPool =
        settings.botStrategyPool.filter(
          x => STRATEGIES.includes(x)
        );

    }

    if (settings.selectedMarket &&
        MARKETS.includes(settings.selectedMarket)) {

      state.selectedMarket =
        settings.selectedMarket;

    }

    if (settings.selectedStrategy &&
        STRATEGIES.includes(settings.selectedStrategy)) {

      state.selectedStrategy =
        settings.selectedStrategy;

    }

  } catch (error) {

    console.warn(
      "Settings load error",
      error
    );

  }

}


function saveSettings() {

  try {

    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        botStrategyPool:
          state.botStrategyPool,
        selectedMarket:
          state.selectedMarket,
        selectedStrategy:
          state.selectedStrategy
      })
    );

  } catch (error) {

    console.warn(
      "Settings save error",
      error
    );

  }

}


/* =========================================================
   BALANCE
========================================================= */

function loadBalance() {

  try {

    const saved =
      Number(localStorage.getItem(BALANCE_KEY));

    if (
      Number.isFinite(saved) &&
      saved >= 0
    ) {

      state.paperBalance = saved;

    }

  } catch (error) {

    state.paperBalance = 1000;

  }

}


function saveBalance() {

  try {

    localStorage.setItem(
      BALANCE_KEY,
      String(state.paperBalance)
    );

  } catch (error) {

    console.warn(
      "Balance save error",
      error
    );

  }

}


function updateBalance() {

  setText(
    "balanceDisplay",
    money(state.paperBalance)
  );

}


/* =========================================================
   HISTORY
========================================================= */

function loadHistory() {

  try {

    const raw =
      localStorage.getItem(HISTORY_KEY);

    if (!raw) return;

    const data =
      JSON.parse(raw);

    if (!Array.isArray(data)) return;

    state.history = data;

    state.totalProfit = 0;
    state.totalAmountWon = 0;
    state.totalStake = 0;
    state.wins = 0;
    state.losses = 0;

    state.history.forEach(trade => {

      state.totalProfit +=
        Number(trade.profit) || 0;

      state.totalAmountWon +=
        Number(trade.amountWon) || 0;

      state.totalStake +=
        Number(trade.stake) || 0;

      if (trade.result === "WIN") {
        state.wins++;
      }

      if (trade.result === "LOSS") {
        state.losses++;
      }

    });

  } catch (error) {

    state.history = [];

  }

}


function saveHistory() {

  try {

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(
        state.history.slice(0, 500)
      )
    );

  } catch (error) {

    console.warn(
      "History save error",
      error
    );

  }

}


/* =========================================================
   THEME
========================================================= */

function loadTheme() {

  const theme =
    localStorage.getItem(THEME_KEY);

  if (theme === "light") {

    document.body.classList.add("light");

    setThemeIcon();

  }

}


function setThemeIcon() {

  const btn = $("themeToggle");

  if (!btn) return;

  btn.textContent =
    document.body.classList.contains("light")
      ? "☀"
      : "☾";

}


function bindTheme() {

  const btn = $("themeToggle");

  if (!btn) return;

  btn.addEventListener(
    "click",
    () => {

      document.body.classList.toggle("light");

      const theme =
        document.body.classList.contains("light")
          ? "light"
          : "dark";

      localStorage.setItem(
        THEME_KEY,
        theme
      );

      setThemeIcon();

      updateChart();

    }
  );

}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function showToast(message) {

  const toast = $("toast");

  const text = $("toastMessage");

  if (!toast || !text) return;

  text.textContent = message;

  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer =
    setTimeout(() => {

      toast.classList.remove("show");

    }, 2500);

}


/* =========================================================
   MARKET SELECTORS
========================================================= */

function populateMarketSelectors() {

  const selectors = [
    $("circularMarketSelect"),
    $("manualMarketSelect")
  ];

  selectors.forEach(select => {

    if (!select) return;

    select.innerHTML = "";

    MARKETS.forEach(symbol => {

      const option =
        document.createElement("option");

      option.value = symbol;

      option.textContent = symbol;

      if (
        symbol === state.selectedMarket
      ) {

        option.selected = true;

      }

      select.appendChild(option);

    });

  });

}


/* =========================================================
   NAVIGATION
========================================================= */

function bindNavigation() {

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const pageName =
            button.dataset.page;

          document
            .querySelectorAll(".page")
            .forEach(page => {

              page.classList.remove("active");

            });

          document
            .querySelectorAll(".nav-btn")
            .forEach(btn => {

              btn.classList.remove("active");

            });

          const page =
            $(
              pageName === "analysis"
                ? "analysisPage"
                : pageName === "trade"
                  ? "tradePage"
                  : "historyPage"
            );

          if (page) {
            page.classList.add("active");
          }

          button.classList.add("active");

          if (pageName === "analysis") {

            updateChart();
            renderDigitStats();

          }

          if (pageName === "history") {

            renderHistory();
            updateHistorySummary();

          }

        }
      );

    });

}


/* =========================================================
   ENGINE SWITCHING
========================================================= */

function bindEngineTabs() {

  const ai =
    $("tabAiBot");

  const circular =
    $("tabCircularAI");

  const manual =
    $("tabManual");

  if (ai) {

    ai.addEventListener(
      "click",
      () => {

        selectEngine("ai");

      }
    );

  }

  if (circular) {

    circular.addEventListener(
      "click",
      () => {

        selectEngine("circular");

      }
    );

  }

  if (manual) {

    manual.addEventListener(
      "click",
      () => {

        selectEngine("manual");

      }
    );

  }

}


function selectEngine(mode) {

  state.engineMode = mode;

  const aiPanel =
    $("aiBotPanel");

  const circularPanel =
    $("circularPanel");

  const manualPanel =
    $("manualPanel");

  const aiTab =
    $("tabAiBot");

  const circularTab =
    $("tabCircularAI");

  const manualTab =
    $("tabManual");

  [
    aiTab,
    circularTab,
    manualTab
  ].forEach(tab => {

    if (tab) {
      tab.classList.remove("active");
    }

  });


  if (aiPanel) {
    aiPanel.classList.add("hidden");
  }

  if (circularPanel) {
    circularPanel.classList.add("hidden");
  }

  if (manualPanel) {
    manualPanel.classList.add("hidden");
  }


  if (mode === "ai") {

    aiTab?.classList.add("active");

    aiPanel?.classList.remove("hidden");

    setText(
      "engineStatusText",
      state.aiRunning
        ? "AI BOT RUNNING"
        : "AI BOT READY"
    );

  }


  if (mode === "circular") {

    circularTab?.classList.add("active");

    circularPanel?.classList.remove("hidden");

    setText(
      "engineStatusText",
      state.circularRunning
        ? "CIRCULAR AI RUNNING"
        : "CIRCULAR AI READY"
    );

  }


  if (mode === "manual") {

    manualTab?.classList.add("active");

    manualPanel?.classList.remove("hidden");

    setText(
      "engineStatusText",
      "MANUAL READY"
    );

  }

}


/* =========================================================
   DIGIT EXTRACTION
========================================================= */

function getLastDigitFromTick(tick) {

  const quote =
    Number(tick?.quote);

  if (!Number.isFinite(quote)) {
    return null;
  }

  let pipSize =
    Number(tick?.pip_size);

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
   PUBLIC MARKET CONNECTION
========================================================= */

function connectPublicMarket() {

  clearTimeout(
    state.publicReconnectTimer
  );

  try {

    if (state.publicWS) {

      try {
        state.publicWS.close();
      } catch (_) {}

    }

    updateConnectionStatus(
      "CONNECTING",
      "loading"
    );

    const ws =
      new WebSocket(PUBLIC_WS);

    state.publicWS = ws;


    ws.addEventListener(
      "open",
      () => {

        state.connected = true;

        updateConnectionStatus(
          "LIVE DATA",
          "online"
        );

        setText(
          "dataStatus",
          "LIVE MARKET DATA"
        );

        MARKETS.forEach(symbol => {

          try {

            ws.send(
              JSON.stringify({
                ticks: symbol,
                subscribe: 1
              })
            );

          } catch (_) {}

        });

        showToast(
          "Live market data connected"
        );

      }
    );


    ws.addEventListener(
      "message",
      event => {

        try {

          const message =
            JSON.parse(event.data);

          if (message.tick) {

            processTick(
              message.tick
            );

          }

        } catch (error) {

          console.warn(
            "Tick parse error",
            error
          );

        }

      }
    );


    ws.addEventListener(
      "error",
      () => {

        state.connected = false;

        updateConnectionStatus(
          "DATA ERROR",
          "offline"
        );

      }
    );


    ws.addEventListener(
      "close",
      () => {

        state.connected = false;

        updateConnectionStatus(
          "RECONNECTING",
          "loading"
        );

        setText(
          "dataStatus",
          "RECONNECTING..."
        );

        state.publicReconnectTimer =
          setTimeout(
            connectPublicMarket,
            3000
          );

      }
    );

  } catch (error) {

    state.connected = false;

    updateConnectionStatus(
      "OFFLINE",
      "offline"
    );

    state.publicReconnectTimer =
      setTimeout(
        connectPublicMarket,
        3000
      );

  }

}


function updateConnectionStatus(
  text,
  mode
) {

  setText(
    "connectionText",
    text
  );

  const dot =
    $("connectionDot");

  if (!dot) return;

  dot.classList.remove(
    "online",
    "offline",
    "loading"
  );

  dot.classList.add(mode);

}


/* =========================================================
   PROCESS TICK
========================================================= */

function processTick(tick) {

  const symbol =
    tick?.symbol;

  if (
    !symbol ||
    !state.markets[symbol]
  ) {
    return;
  }

  const price =
    Number(tick.quote);

  if (!Number.isFinite(price)) {
    return;
  }

  const digit =
    getLastDigitFromTick(tick);

  if (digit === null) {
    return;
  }

  const market =
    state.markets[symbol];

  market.price = price;

  market.lastDigit = digit;

  market.pipSize =
    Number(tick.pip_size) || market.pipSize;

  market.ticks++;

  market.received++;

  market.updated =
    Date.now();

  market.digits[digit]++;

  market.digitHistory.push(digit);

  if (market.digitHistory.length > 200) {
    market.digitHistory.shift();
  }

  market.prices.push(price);

  if (market.prices.length > 100) {
    market.prices.shift();
  }


  if (symbol === state.selectedMarket) {

    state.priceHistory =
      market.prices.slice();

    setText(
      "currentLivePrice",
      formatPrice(price)
    );

    setText(
      "currentChartMarket",
      symbol
    );

    setText(
      "digitSampleCount",
      market.digitHistory.length
    );

    updateChart();

    renderDigitStats();

    updateAnalysisPanel();

  }


  evaluateActiveTrades(
    symbol,
    digit
  );

  renderActiveTrades();

}


/* =========================================================
   PRICE FORMAT
========================================================= */

function getPriceDecimals(price) {

  const n = Number(price);

  if (!Number.isFinite(n)) {
    return 2;
  }

  const text =
    String(n);

  if (!text.includes(".")) {
    return 2;
  }

  return clamp(
    text.split(".")[1].length,
    0,
    8
  );

}


function formatPrice(price) {

  const n =
    Number(price);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toFixed(
    getPriceDecimals(n)
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

  const rect =
    canvas.getBoundingClientRect();

  const width =
    Math.max(
      300,
      Math.floor(rect.width)
    );

  const height =
    Math.max(
      120,
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
    state.priceHistory;

  if (
    !Array.isArray(values) ||
    values.length < 2
  ) {

    ctx.fillStyle =
      getComputedStyle(document.body)
        .getPropertyValue("--muted");

    ctx.font = "11px system-ui";

    ctx.fillText(
      "Waiting for market data...",
      12,
      height / 2
    );

    return;

  }


  const min =
    Math.min(...values);

  const max =
    Math.max(...values);

  const range =
    Math.max(
      max - min,
      0.00000001
    );

  const padding = 14;


  ctx.beginPath();

  values.forEach(
    (value, index) => {

      const x =
        padding +
        (index /
          (values.length - 1)) *
        (width - padding * 2);

      const y =
        height -
        padding -
        ((value - min) / range) *
        (height - padding * 2);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

    }
  );


  ctx.strokeStyle =
    getComputedStyle(document.body)
      .getPropertyValue("--accent");

  ctx.lineWidth = 2;

  ctx.stroke();


  const last =
    values[values.length - 1];

  const lastX =
    width - padding;

  const lastY =
    height -
    padding -
    ((last - min) / range) *
    (height - padding * 2);


  ctx.beginPath();

  ctx.arc(
    lastX,
    lastY,
    3,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    getComputedStyle(document.body)
      .getPropertyValue("--accent");

  ctx.fill();

}


/* =========================================================
   DIGIT STATS
========================================================= */

function renderDigitStats() {

  const container =
    $("digitStatsGrid");

  if (!container) return;

  const market =
    state.markets[state.selectedMarket];

  if (!market) return;

  const total =
    market.digitHistory.length;

  if (!total) {

    container.innerHTML = "";

    for (let i = 0; i < 10; i++) {

      container.innerHTML += `
        <div class="digit-item">
          <span class="digit-number">${i}</span>
          <span class="digit-percent">0%</span>
          <div class="digit-bar">
            <span style="width:0%"></span>
          </div>
        </div>
      `;

    }

    return;
  }


  const percentages =
    market.digits.map(
      count =>
        (count / total) * 100
    );

  const max =
    Math.max(...percentages);

  const min =
    Math.min(...percentages);


  container.innerHTML =
    percentages.map(
      (percent, digit) => {

        const isHot =
          total >= 20 &&
          percent === max;

        const isCold =
          total >= 20 &&
          percent === min;

        return `
          <div class="digit-item
            ${isHot ? "hot" : ""}
            ${isCold ? "cold" : ""}
          ">

            <span class="digit-number">
              ${digit}
            </span>

            <span class="digit-percent">
              ${percent.toFixed(1)}%
            </span>

            <div class="digit-bar">
              <span style="width:${clamp(
                percent * 10,
                0,
                100
              )}%"></span>
            </div>

          </div>
        `;

      }
    ).join("");

}


/* =========================================================
   ENTROPY
========================================================= */

function calculateEntropy(
  digits
) {

  const total =
    digits.reduce(
      (sum, n) => sum + n,
      0
    );

  if (!total) return 1;

  let entropy = 0;

  digits.forEach(
    count => {

      if (!count) return;

      const p =
        count / total;

      entropy -=
        p * Math.log2(p);

    }
  );

  return clamp(
    entropy / Math.log2(10),
    0,
    1
  );

}


/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket(symbol) {

  const market =
    state.markets[symbol];

  if (!market) {
    return null;
  }

  const recent =
    market.digitHistory.slice(-30);

  if (recent.length < 20) {
    return null;
  }


  const counts =
    Array(10).fill(0);

  recent.forEach(
    digit => {
      counts[digit]++;
    }
  );


  const total =
    recent.length;

  const percentages =
    counts.map(
      n => n / total
    );


  let hottest =
    0;

  let coldest =
    0;


  for (let i = 1; i < 10; i++) {

    if (
      percentages[i] >
      percentages[hottest]
    ) {
      hottest = i;
    }

    if (
      percentages[i] <
      percentages[coldest]
    ) {
      coldest = i;
    }

  }


  let streak = 1;

  const last =
    recent[recent.length - 1];


  for (
    let i = recent.length - 2;
    i >= 0;
    i--
  ) {

    if (recent[i] === last) {

      streak++;

    } else {

      break;

    }

  }


  const evenCount =
    recent.filter(
      d => d % 2 === 0
    ).length;

  const overCount =
    recent.filter(
      d => d > 5
    ).length;

  const underCount =
    recent.filter(
      d => d < 5
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
    calculateEntropy(counts);

  const stability =
    1 - entropy;


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
    Math.abs(
      concentration - .10
    ) * 30;


  score =
    clamp(
      score,
      0,
      100
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


  const agreement =
    calculateAgreement(recent);


  return {

    symbol,

    sampleSize: total,

    counts,

    percentages,

    hottest,

    coldest,

    lastDigit: last,

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
   AGREEMENT
========================================================= */

function calculateAgreement(
  recent
) {

  const data =
    recent.slice(-12);

  if (!data.length) {
    return 0;
  }


  const even =
    data.filter(
      d => d % 2 === 0
    ).length /
    data.length;


  const over =
    data.filter(
      d => d > 5
    ).length /
    data.length;


  const under =
    data.filter(
      d => d < 5
    ).length /
    data.length;


  const parityAgreement =
    Math.abs(
      even - .5
    ) * 2;


  const directionAgreement =
    Math.abs(
      Math.max(over, under) - .5
    ) * 2;


  return clamp(
    (
      parityAgreement +
      directionAgreement
    ) / 2,
    0,
    1
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
      (b.score + b.agreement * 8) -
      (a.score + a.agreement * 8)
  );


  return analyses[0];

}


/* =========================================================
   BOT STRATEGY SELECTION
========================================================= */

function chooseBotStrategy(
  analysis
) {

  const pool =
    state.botStrategyPool.filter(
      strategy =>
        STRATEGIES.includes(strategy)
    );


  if (!pool.length) {

    return "MATCHES";

  }


  const scores =
    pool.map(
      strategy => {

        let score = 50;


        if (
          strategy === "MATCHES"
        ) {

          score +=
            analysis.concentration * 100;

          score +=
            analysis.streak * 2;

        }


        if (
          strategy === "DIFFERS"
        ) {

          score +=
            (1 -
              analysis.concentration) *
            70;

        }


        if (
          strategy === "EVEN"
        ) {

          score +=
            Math.abs(
              analysis.evenRate - .5
            ) * 100;

        }


        if (
          strategy === "ODD"
        ) {

          score +=
            Math.abs(
              analysis.evenRate - .5
            ) * 100;

        }


        if (
          strategy === "OVER"
        ) {

          score +=
            Math.abs(
              analysis.overRate - .5
            ) * 90;

        }


        if (
          strategy === "UNDER"
        ) {

          score +=
            Math.abs(
              analysis.underRate - .5
            ) * 90;

        }


        score +=
          analysis.agreement * 10;


        return {
          strategy,
          score
        };

      }
    );


  scores.sort(
    (a, b) =>
      b.score - a.score
  );


  return scores[0].strategy;

}


/* =========================================================
   PARITY DIGIT
========================================================= */

function findBestParityDigit(
  analysis,
  parity
) {

  let best =
    parity === "EVEN"
      ? 0
      : 1;

  let bestCount = -1;


  for (let digit = 0; digit < 10; digit++) {

    const isEven =
      digit % 2 === 0;

    if (
      (parity === "EVEN" && !isEven) ||
      (parity === "ODD" && isEven)
    ) {
      continue;
    }


    if (
      analysis.counts[digit] >
      bestCount
    ) {

      best =
        digit;

      bestCount =
        analysis.counts[digit];

    }

  }


  return best;

}


/* =========================================================
   PREDICTION
========================================================= */

function createPrediction(
  analysis,
  strategy
) {

  let target =
    analysis.hottest;


  if (
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
  ) {

    target =
      analysis.hottest;

  }


  if (strategy === "OVER") {

    target =
      analysis.hottest > 5
        ? analysis.hottest
        : 6;

  }


  if (strategy === "UNDER") {

    target =
      analysis.hottest < 5
        ? analysis.hottest
        : 4;

  }


  if (strategy === "EVEN") {

    target =
      findBestParityDigit(
        analysis,
        "EVEN"
      );

  }


  if (strategy === "ODD") {

    target =
      findBestParityDigit(
        analysis,
        "ODD"
      );

  }


  const confidence =
    clamp(
      50 +
      analysis.concentration * 100 * .15 +
      analysis.score * .25 +
      analysis.streak * 1.2 +
      analysis.agreement * 8,
      50,
      95
    );


  return {

    strategy,

    target,

    confidence:

      Math.round(confidence)

  };

}


/* =========================================================
   ANALYSIS PAGE
========================================================= */

function updateAnalysisPanel() {

  const analysis =
    analyzeMarket(
      state.selectedMarket
    );


  if (!analysis) {

    setText(
      "aiStatus",
      "COLLECTING"
    );

    setText(
      "aiMarket",
      state.selectedMarket
    );

    setText(
      "aiPrediction",
      "WAITING"
    );

    setText(
      "aiType",
      "Need 20+ ticks"
    );

    setText(
      "analysisConfidence",
      "—%"
    );

    setText(
      "analysisMsg",
      "Collecting enough market data..."
    );

    return;
  }


  const strategy =
    state.engineMode === "ai" &&
    state.botStrategyPool.length
      ? chooseBotStrategy(analysis)
      : "MATCHES";


  const prediction =
    createPrediction(
      analysis,
      strategy
    );


  setText(
    "aiStatus",
    analysis.strength
  );

  setText(
    "aiMarket",
    analysis.symbol
  );

  setText(
    "aiPrediction",
    prediction.target
  );

  setText(
    "aiType",
    strategyLabel(strategy)
  );

  setText(
    "analysisConfidence",
    `${prediction.confidence}%`
  );

  setText(
    "analysisMsg",
    `${analysis.strength} market score ${analysis.score.toFixed(1)} • ` +
    `agreement ${(analysis.agreement * 100).toFixed(0)}%`
  );

}


/* =========================================================
   BOT CONTROLS
========================================================= */

function bindBotControls() {

  const start =
    $("startBotBtn");

  const strategy =
    $("botStrategyTrigger");


  start?.addEventListener(
    "click",
    () => {

      if (state.aiRunning) {

        stopAIBot(
          "AI BOT stopped"
        );

      } else {

        startAIBot();

      }

    }
  );


  strategy?.addEventListener(
    "click",
    () => {

      openBotStrategyModal();

    }
  );

}


/* =========================================================
   BOT STRATEGY MODAL
========================================================= */

function bindBotStrategyModal() {

  $("closeBotStrategyModal")
    ?.addEventListener(
      "click",
      closeBotStrategyModal
    );


  $("applyBotStrategies")
    ?.addEventListener(
      "click",
      applyBotStrategyPool
    );


  document
    .querySelectorAll(
      ".bot-strategy-check"
    )
    .forEach(check => {

      check.addEventListener(
        "change",
        () => {

          const checked =
            document.querySelectorAll(
              ".bot-strategy-check:checked"
            );

          if (!checked.length) {

            check.checked = true;

            showToast(
              "At least one strategy is required"
            );

          }

        }
      );

    });

}


function openBotStrategyModal() {

  const modal =
    $("botStrategyModal");

  if (!modal) return;

  document
    .querySelectorAll(
      ".bot-strategy-check"
    )
    .forEach(check => {

      check.checked =
        state.botStrategyPool.includes(
          check.value
        );

    });


  modal.classList.remove(
    "hidden"
  );

}


function closeBotStrategyModal() {

  $("botStrategyModal")
    ?.classList.add("hidden");

}


function applyBotStrategyPool() {

  const selected =
    Array.from(
      document.querySelectorAll(
        ".bot-strategy-check:checked"
      )
    ).map(
      input => input.value
    );


  if (!selected.length) {

    showToast(
      "Select at least one strategy"
    );

    return;

  }


  state.botStrategyPool =
    selected;

  saveSettings();

  setText(
    "botStrategyLabel",
    selected
      .map(strategyLabel)
      .join(" + ")
  );

  closeBotStrategyModal();

  showToast(
    "AI strategy pool updated"
  );

}


/* =========================================================
   3 SECOND AI BOT ANALYSIS
========================================================= */

async function countdownAIBot(
  token
) {

  for (
    let seconds = 3;
    seconds >= 1;
    seconds--
  ) {

    if (
      !state.aiRunning ||
      token !== state.aiCycleToken
    ) {

      return false;

    }


    setText(
      "botStatusDash",
      `ANALYZING ${seconds}`
    );

    setText(
      "engineStatusText",
      `AI ANALYZING ${seconds}s`
    );

    setText(
      "aiStatus",
      `ANALYZING ${seconds}`
    );


    await sleep(1000);

  }


  return (
    state.aiRunning &&
    token === state.aiCycleToken
  );

}


/* =========================================================
   AI BOT START
========================================================= */

function startAIBot() {

  if (state.tradingStopped) {

    state.tradingStopped = false;

    updateTradingStopUI();

  }


  if (state.circularRunning) {

    stopCircularAI(
      "Circular AI stopped — AI BOT selected"
    );

  }


  if (state.aiRunning) {
    return;
  }


  const stake =
    Number(
      $("stakeInput")?.value
    );


  if (
    !Number.isFinite(stake) ||
    stake < .35
  ) {

    showToast(
      "Minimum stake is 0.35"
    );

    return;

  }


  state.botBaseStake =
    stake;

  state.botCurrentStake =
    stake;

  state.botMartingaleLevel =
    0;


  state.botTakeProfit =
    Math.max(
      0,
      Number(
        $("takeProfitInput")?.value
      ) || 0
    );


  state.botStopLoss =
    Math.max(
      0,
      Number(
        $("stopLossInput")?.value
      ) || 0
    );


  state.botSessionStartProfit =
    state.totalProfit;


  state.aiRunning =
    true;

  state.aiCycleToken++;


  setText(
    "botStatusDash",
    "STARTING"
  );

  setText(
    "engineStatusText",
    "AI BOT RUNNING"
  );

  showToast(
    "AI BOT started — 3 second analysis"
  );


  updateBotButton();

  runAIBotLoop(
    state.aiCycleToken
  );

}


/* =========================================================
   AI BOT LOOP
========================================================= */

async function runAIBotLoop(
  token
) {

  while (
    state.aiRunning &&
    token === state.aiCycleToken
  ) {

    if (state.tradingStopped) {

      break;

    }


    if (
      checkBotSessionLimits()
    ) {

      break;

    }


    const ready =
      await countdownAIBot(token);


    if (!ready) {
      break;
    }


    if (
      state.tradingStopped ||
      !state.aiRunning ||
      token !== state.aiCycleToken
    ) {

      break;

    }


    /* -----------------------------------------------
       NOW AI CHOOSES THE MARKET
    ------------------------------------------------ */

    const analysis =
      chooseBestMarket();


    if (!analysis) {

      setText(
        "botStatusDash",
        "COLLECTING"
      );

      setText(
        "engineStatusText",
        "WAITING FOR MARKET DATA"
      );

      setText(
        "analysisMsg",
        "AI BOT is waiting for enough tick data..."
      );

      await sleep(1000);

      continue;

    }


    const market =
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


    state.selectedMarket =
      market;


    saveSettings();


    const decision = {

      market,

      strategy,

      target:
        prediction.target,

      confidence:
        prediction.confidence,

      score:
        analysis.score,

      strength:
        analysis.strength,

      time:
        Date.now()

    };


    state.lastBotDecision =
      decision;


    updateBotDecisionUI(
      analysis,
      prediction
    );


    /* -----------------------------------------------
       PAPER TRADE IMMEDIATELY AFTER 3 SEC ANALYSIS
    ------------------------------------------------ */

    const trade =
      createPaperTrade({

        engine: "AI BOT",

        market,

        strategy,

        prediction:
          prediction.target,

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
        "botStatusDash",
        "NO BALANCE"
      );

      await sleep(1200);

      continue;

    }


    setText(
      "botStatusDash",
      "TRADE OPEN"
    );


    await sleep(700);


    if (
      state.aiRunning &&
      token === state.aiCycleToken
    ) {

      setText(
        "botStatusDash",
        "SCANNING"
      );

    }

  }


  if (
    token === state.aiCycleToken
  ) {

    state.aiRunning =
      false;

    updateBotButton();

    if (!state.tradingStopped) {

      setText(
        "botStatusDash",
        "STOPPED"
      );

    }

  }

}


/* =========================================================
   BOT DECISION UI
========================================================= */

function updateBotDecisionUI(
  analysis,
  prediction
) {

  setText(
    "botSelectedMarket",
    analysis.symbol
  );

  setText(
    "botSelectedStrategy",
    strategyLabel(
      prediction.strategy
    )
  );

  setText(
    "botScore",
    analysis.score.toFixed(1)
  );

  setText(
    "botConfidence",
    `${prediction.confidence}%`
  );

  setText(
    "aiPredictionLarge",
    prediction.target
  );

  setText(
    "predictionConfidence",
    `${prediction.confidence}%`
  );

  setText(
    "aiStatus",
    "AI DECISION"
  );

  setText(
    "aiMarket",
    analysis.symbol
  );

  setText(
    "aiPrediction",
    prediction.target
  );

  setText(
    "aiType",
    strategyLabel(
      prediction.strategy
    )
  );

  setText(
    "analysisConfidence",
    `${prediction.confidence}%`
  );

  setText(
    "analysisMsg",
    `${analysis.strength} • ` +
    `Score ${analysis.score.toFixed(1)} • ` +
    `Agreement ${(analysis.agreement * 100).toFixed(0)}%`
  );

}


/* =========================================================
   STOP AI BOT
========================================================= */

function stopAIBot(
  reason = "AI BOT stopped"
) {

  state.aiRunning =
    false;

  state.aiCycleToken++;

  clearTimeout(
    state.botTimer
  );

  state.botTimer = null;

  setText(
    "botStatusDash",
    "STOPPED"
  );

  setText(
    "engineStatusText",
    "AI BOT STOPPED"
  );

  updateBotButton();

  showToast(reason);

}


/* =========================================================
   BOT BUTTON
========================================================= */

function updateBotButton() {

  const button =
    $("startBotBtn");

  if (!button) return;

  if (state.aiRunning) {

    button.innerHTML =
      "<span>■</span> STOP BOT";

    button.style.background =
      "var(--red)";

    button.style.color =
      "#fff";

  } else {

    button.innerHTML =
      "<span>▶</span> START BOT";

    button.style.background =
      "";

    button.style.color =
      "";

  }

}


/* =========================================================
   BOT SESSION LIMITS
========================================================= */

function getBotSessionProfit() {

  return (
    state.totalProfit -
    state.botSessionStartProfit
  );

}


function checkBotSessionLimits() {

  const sessionProfit =
    getBotSessionProfit();


  if (
    state.botTakeProfit > 0 &&
    sessionProfit >=
      state.botTakeProfit
  ) {

    stopAIBot(
      `Take profit reached: ${money(sessionProfit)}`
    );

    return true;

  }


  if (
    state.botStopLoss > 0 &&
    sessionProfit <=
      -state.botStopLoss
  ) {

    stopAIBot(
      `Stop loss reached: ${money(sessionProfit)}`
    );

    return true;

  }


  return false;

}


/* =========================================================
   CIRCULAR CONTROLS
========================================================= */

function bindCircularControls() {

  $("startCircularTradeBtn")
    ?.addEventListener(
      "click",
      () => {

        if (state.circularRunning) {

          stopCircularAI(
            "Circular AI stopped"
          );

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

        saveSettings();

      }
    );


  $("circularStrategyTrigger")
    ?.addEventListener(
      "click",
      () => {

        openStrategyModal(
          "circular"
        );

      }
    );

}


/* =========================================================
   CIRCULAR START
========================================================= */

function startCircularAI() {

  if (state.tradingStopped) {

    state.tradingStopped = false;

    updateTradingStopUI();

  }


  if (state.aiRunning) {

    stopAIBot(
      "AI BOT stopped — Circular AI selected"
    );

  }


  const stake =
    Number(
      $("circularStakeInput")?.value
    );


  if (
    !Number.isFinite(stake) ||
    stake < .35
  ) {

    showToast(
      "Minimum stake is 0.35"
    );

    return;

  }


  state.circularTakeProfit =
    Math.max(
      0,
      Number(
        $("circularTakeProfitInput")?.value
      ) || 0
    );


  state.circularStopLoss =
    Math.max(
      0,
      Number(
        $("circularStopLossInput")?.value
      ) || 0
    );


  state.circularSessionStartProfit =
    state.totalProfit;


  state.circularRunning =
    true;

  state.circularToken++;


  setText(
    "circularStatusText",
    "RUNNING"
  );

  setText(
    "engineStatusText",
    "CIRCULAR AI RUNNING"
  );


  runCircularCycle(
    state.circularToken
  );

}


/* =========================================================
   CIRCULAR CYCLE
========================================================= */

async function runCircularCycle(
  token
) {

  while (
    state.circularRunning &&
    token === state.circularToken
  ) {

    if (
      checkCircularLimits()
    ) {
      break;
    }


    /* -----------------------------------------------
       PHASE 1 — 10 SEC ANALYSIS
    ------------------------------------------------ */

    for (
      let sec = 10;
      sec >= 1;
      sec--
    ) {

      if (
        !state.circularRunning ||
        token !== state.circularToken
      ) {

        return;

      }

      setText(
        "aiCircle",
        sec
      );

      setText(
        "aiCircleLabel",
        "ANALYSIS"
      );

      setText(
        "aiCircleTimer",
        sec
      );

      setText(
        "aiCircleStatus",
        "ANALYZING"
      );

      setText(
        "cycleAnalysis",
        `Analyzing ${sec}s`
      );

      await sleep(1000);

    }


    const analysis =
      analyzeMarket(
        state.selectedMarket
      );


    if (!analysis) {

      setText(
        "cycleAnalysis",
        "Collecting data"
      );

      await sleep(1000);

      continue;

    }


    const strategy =
      state.selectedStrategy;


    const prediction =
      createPrediction(
        analysis,
        strategy
      );


    state.lastCircularPrediction =
      prediction;


    setText(
      "aiCirclePrediction",
      prediction.target
    );


    /* -----------------------------------------------
       PHASE 2 — 5 SEC PREDICTION
    ------------------------------------------------ */

    for (
      let sec = 5;
      sec >= 1;
      sec--
    ) {

      if (
        !state.circularRunning ||
        token !== state.circularToken
      ) {

        return;

      }

      setText(
        "aiCircle",
        sec
      );

      setText(
        "aiCircleLabel",
        "PREDICTION"
      );

      setText(
        "aiCircleTimer",
        sec
      );

      setText(
        "cycleAnalysis",
        strategyLabel(strategy)
      );

      await sleep(1000);

    }


    /* -----------------------------------------------
       PHASE 3 — 3 SEC ENTRY
    ------------------------------------------------ */

    for (
      let sec = 3;
      sec >= 1;
      sec--
    ) {

      if (
        !state.circularRunning ||
        token !== state.circularToken
      ) {

        return;

      }

      setText(
        "aiCircle",
        sec
      );

      setText(
        "aiCircleLabel",
        "TRADE"
      );

      setText(
        "aiCircleTimer",
        sec
      );

      setText(
        "cycleTrade",
        "TRADE NOW"
      );

      await sleep(1000);

    }


    const stake =
      Number(
        $("circularStakeInput")?.value
      );


    createPaperTrade({

      engine: "CIRCULAR AI",

      market:
        state.selectedMarket,

      strategy,

      prediction:
        prediction.target,

      stake,

      takeProfit:
        state.circularTakeProfit,

      stopLoss:
        state.circularStopLoss

    });


    setText(
      "cycleTrade",
      "TRADE PLACED"
    );


    /* -----------------------------------------------
       COOLDOWN
    ------------------------------------------------ */

    for (
      let sec = 3;
      sec >= 1;
      sec--
    ) {

      if (
        !state.circularRunning ||
        token !== state.circularToken
      ) {

        return;

      }

      setText(
        "aiCircle",
        sec
      );

      setText(
        "aiCircleLabel",
        "COOLDOWN"
      );

      setText(
        "cycleCooldown",
        `Next cycle ${sec}s`
      );

      await sleep(1000);

    }

  }

}


/* =========================================================
   CIRCULAR LIMITS
========================================================= */

function checkCircularLimits() {

  const sessionProfit =
    state.totalProfit -
    state.circularSessionStartProfit;


  if (
    state.circularTakeProfit > 0 &&
    sessionProfit >=
      state.circularTakeProfit
  ) {

    stopCircularAI(
      `Circular take profit reached: ${money(sessionProfit)}`
    );

    return true;

  }


  if (
    state.circularStopLoss > 0 &&
    sessionProfit <=
      -state.circularStopLoss
  ) {

    stopCircularAI(
      `Circular stop loss reached: ${money(sessionProfit)}`
    );

    return true;

  }


  return false;

}


/* =========================================================
   STOP CIRCULAR
========================================================= */

function stopCircularAI(
  reason = "Circular AI stopped"
) {

  state.circularRunning =
    false;

  state.circularToken++;

  clearTimeout(
    state.circularTimer
  );

  state.circularTimer = null;

  setText(
    "circularStatusText",
    "STOPPED"
  );

  setText(
    "aiCircleStatus",
    "STOPPED"
  );

  setText(
    "cycleTrade",
    "STOPPED"
  );

  showToast(reason);

}


/* =========================================================
   MANUAL CONTROLS
========================================================= */

function bindManualControls() {

  $("manualMarketSelect")
    ?.addEventListener(
      "change",
      event => {

        state.selectedMarket =
          event.target.value;

        saveSettings();

      }
    );


  $("manualStrategyTrigger")
    ?.addEventListener(
      "click",
      () => {

        openStrategyModal(
          "manual"
        );

      }
    );


  $("placeTradeBtn")
    ?.addEventListener(
      "click",
      executeManualTrade
    );


  updateTargetDigitVisibility();

}


/* =========================================================
   STRATEGY MODAL
========================================================= */

let strategyModalTarget =
  "manual";


function bindStrategyModal() {

  $("closeStrategyModal")
    ?.addEventListener(
      "click",
      () => {

        $("strategyModal")
          ?.classList.add("hidden");

      }
    );


  document
    .querySelectorAll(
      ".strategy-option"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const strategy =
            button.dataset.strategy;

          if (!STRATEGIES.includes(strategy)) {
            return;
          }


          if (
            strategyModalTarget ===
            "manual"
          ) {

            state.selectedStrategy =
              strategy;

            setText(
              "manualSelectedStrategyLabel",
              strategyLabel(strategy)
            );

            updateTargetDigitVisibility();

          }


          if (
            strategyModalTarget ===
            "circular"
          ) {

            state.selectedStrategy =
              strategy;

            setText(
              "circularStrategyLabel",
              strategyLabel(strategy)
            );

          }


          saveSettings();

          $("strategyModal")
            ?.classList.add("hidden");

        }
      );

    });

}


function openStrategyModal(
  target
) {

  strategyModalTarget =
    target;

  $("strategyModal")
    ?.classList.remove("hidden");

}


/* =========================================================
   TARGET DIGIT
========================================================= */

function updateTargetDigitVisibility() {

  const container =
    $("targetDigitContainer");

  if (!container) return;

  const strategy =
    state.selectedStrategy;

  if (
    strategy === "EVEN" ||
    strategy === "ODD"
  ) {

    container.classList.add(
      "hidden"
    );

  } else {

    container.classList.remove(
      "hidden"
    );

  }

}


/* =========================================================
   MANUAL TRADE
========================================================= */

function executeManualTrade() {

  if (state.tradingStopped) {

    showToast(
      "Trading is stopped"
    );

    return;

  }


  const market =
    $("manualMarketSelect")?.value ||
    state.selectedMarket;


  const strategy =
    state.selectedStrategy;


  const stake =
    Number(
      $("manualStakeInput")?.value
    );


  let target =
    Number(
      $("manualTargetDigitInput")?.value
    );


  if (
    !Number.isFinite(stake) ||
    stake < .35
  ) {

    showToast(
      "Minimum stake is 0.35"
    );

    return;

  }


  if (
    strategy !== "EVEN" &&
    strategy !== "ODD"
  ) {

    if (
      !Number.isInteger(target) ||
      target < 0 ||
      target > 9
    ) {

      showToast(
        "Target must be 0 to 9"
      );

      return;

    }

  }


  if (
    strategy === "EVEN" ||
    strategy === "ODD"
  ) {

    target =
      strategy === "EVEN"
        ? 0
        : 1;

  }


  const takeProfit =
    Math.max(
      0,
      Number(
        $("manualTakeProfitInput")?.value
      ) || 0
    );


  const stopLoss =
    Math.max(
      0,
      Number(
        $("manualStopLossInput")?.value
      ) || 0
    );


  const trade =
    createPaperTrade({

      engine: "MANUAL",

      market,

      strategy,

      prediction:
        target,

      stake,

      takeProfit,

      stopLoss

    });


  if (trade) {

    setText(
      "manualStatusText",
      "TRADE OPEN"
    );

    showToast(
      "Manual paper trade placed"
    );

  }

}


/* =========================================================
   PAPER TRADE CREATION
========================================================= */

function createPaperTrade(config) {

  if (state.tradingStopped) {

    showToast(
      "Trading is stopped"
    );

    return null;

  }


  const stake =
    Number(config.stake);


  if (
    !Number.isFinite(stake) ||
    stake < .35
  ) {

    showToast(
      "Invalid stake"
    );

    return null;

  }


  if (
    state.paperBalance <
    stake
  ) {

    showToast(
      "Insufficient paper balance"
    );

    return null;

  }


  state.paperBalance -=
    stake;


  const trade = {

    id:
      `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    timestamp:
      Date.now(),

    time:
      new Date().toLocaleString(),

    engine:
      config.engine || "MANUAL",

    market:
      config.market,

    strategy:
      config.strategy,

    prediction:
      Number(config.prediction),

    stake,

    takeProfit:
      Number(config.takeProfit) || 0,

    stopLoss:
      Number(config.stopLoss) || 0,

    martingaleLevel:
      Number(config.martingaleLevel) || 0,

    result:
      null,

    resultDigit:
      null,

    status:
      "PENDING",

    amountWon:
      0,

    payout:
      0,

    profit:
      0

  };


  state.activeTrades.push(
    trade
  );


  updateBalance();

  renderActiveTrades();

  return trade;

}


/* =========================================================
   TRADE EVALUATION
========================================================= */

function evaluateActiveTrades(
  symbol,
  digit
) {

  const trades =
    state.activeTrades.filter(
      trade =>
        trade.market === symbol &&
        trade.status === "PENDING"
    );


  trades.forEach(
    trade => {

      const win =
        evaluateStrategy(
          trade.strategy,
          digit,
          trade.prediction
        );


      settlePaperTrade(
        trade,
        win,
        digit
      );

    }
  );

}


/* =========================================================
   STRATEGY RESULT
========================================================= */

function evaluateStrategy(
  strategy,
  digit,
  target
) {

  switch (strategy) {

    case "MATCHES":
      return digit === target;

    case "DIFFERS":
      return digit !== target;

    case "EVEN":
      return digit % 2 === 0;

    case "ODD":
      return digit % 2 !== 0;

    case "OVER":
      return digit > target;

    case "UNDER":
      return digit < target;

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


  trade.status =
    win
      ? "WIN"
      : "LOSS";


  trade.result =
    trade.status;


  trade.resultDigit =
    resultDigit;


  const multiplier =
    PAPER_MULTIPLIERS[
      trade.strategy
    ] || 0;


  if (win) {

    trade.payout =
      trade.stake *
      multiplier;


    trade.amountWon =
      trade.payout;


    trade.profit =
      trade.payout -
      trade.stake;


    state.paperBalance +=
      trade.payout;


    state.wins++;


  } else {

    trade.payout = 0;

    trade.amountWon = 0;

    trade.profit =
      -trade.stake;

    state.losses++;

  }


  state.totalStake +=
    trade.stake;


  state.totalAmountWon +=
    trade.amountWon;


  state.totalProfit +=
    trade.profit;


  state.history.unshift(
    {
      ...trade
    }
  );


  state.activeTrades =
    state.activeTrades.filter(
      item =>
        item.id !== trade.id
    );


  saveHistory();

  saveBalance();

  updateBalance();

  updateStats();

  renderHistory();

  updateHistorySummary();

  renderActiveTrades();


  /* -----------------------------------------------
     MARTINGALE
  ------------------------------------------------ */

  if (
    trade.engine === "AI BOT"
  ) {

    handleBotSettlement(
      trade
    );

  }


  checkBotSessionLimits();

  checkCircularLimits();


  setText(
    "sessionProfitDisplay",
    money(
      state.totalProfit -
      state.sessionStartProfit
    )
  );

}


/* =========================================================
   AI BOT MARTINGALE
========================================================= */

function handleBotSettlement(
  trade
) {

  if (
    trade.result === "WIN"
  ) {

    state.botCurrentStake =
      state.botBaseStake;

    state.botMartingaleLevel =
      0;

  } else {

    const factor =
      Math.max(
        1,
        Number(
          $("martingaleInput")?.value
        ) || 1
      );


    state.botMartingaleLevel++;


    let nextStake =
      state.botCurrentStake *
      factor;


    const maximum =
      state.botBaseStake *
      32;


    nextStake =
      Math.min(
        nextStake,
        maximum,
        Math.max(
          state.paperBalance,
          state.botBaseStake
        )
      );


    state.botCurrentStake =
      Math.max(
        .35,
        nextStake
      );

  }

}


/* =========================================================
   ACTIVE TRADES UI
========================================================= */

function renderActiveTrades() {

  const container =
    $("activeTradesList");

  if (!container) return;


  setText(
    "activeTradeCount",
    state.activeTrades.length
  );


  if (!state.activeTrades.length) {

    container.innerHTML = `
      <div class="empty-state">
        No active paper trades
      </div>
    `;

    return;

  }


  container.innerHTML =
    state.activeTrades
      .map(
        trade => `
          <div class="active-trade">

            <div>
              <small>ENGINE</small>
              <strong>${esc(
                trade.engine
              )}</strong>
            </div>

            <div>
              <small>MARKET</small>
              <strong>${esc(
                trade.market
              )}</strong>
            </div>

            <div>
              <small>STAKE</small>
              <strong>${money(
                trade.stake
              )}</strong>
            </div>

            <div>
              <small>STATUS</small>
              <strong class="trade-pending">
                PENDING
              </strong>
            </div>

          </div>
        `
      )
      .join("");

}


/* =========================================================
   HISTORY UI
========================================================= */

function renderHistory() {

  const container =
    $("historyCardsList");

  if (!container) return;


  if (!state.history.length) {

    container.innerHTML = `
      <div class="empty-state">
        No completed paper trades yet.
      </div>
    `;

    return;

  }


  container.innerHTML =
    state.history
      .slice(0, 100)
      .map(
        trade => {

          const win =
            trade.result === "WIN";

          return `
            <div class="history-item">

              <div class="
                history-icon
                ${win ? "win" : "loss"}
              ">
                ${win ? "✓" : "×"}
              </div>


              <div class="history-main">

                <strong>
                  ${esc(trade.market)}
                </strong>

                <small>
                  ${esc(trade.engine)}
                  • ${esc(
                    strategyLabel(
                      trade.strategy
                    )
                  )}
                </small>

              </div>


              <div class="history-column">

                <strong>
                  ${money(trade.stake)}
                </strong>

                <small>
                  STAKE
                </small>

              </div>


              <div class="history-column">

                <strong>
                  ${money(
                    trade.amountWon
                  )}
                </strong>

                <small>
                  AMOUNT WON
                </small>

              </div>


              <div class="history-column">

                <strong>
                  DIGIT ${esc(
                    trade.resultDigit
                  )}
                </strong>

                <small>
                  ${esc(trade.time)}
                </small>

              </div>


              <div class="
                history-profit
                ${win ? "win" : "loss"}
              ">

                <strong>
                  ${win ? "+" : ""}
                  ${money(trade.profit)}
                </strong>

                <small>
                  ${esc(trade.result)}
                </small>

              </div>

            </div>
          `;

        }
      )
      .join("");

}


/* =========================================================
   HISTORY SUMMARY
========================================================= */

function updateHistorySummary() {

  setText(
    "totalProfitDisplay",
    money(state.totalProfit)
  );

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


  const sessionProfit =
    state.totalProfit -
    state.sessionStartProfit;


  setText(
    "sessionProfitDisplay",
    money(sessionProfit)
  );

}


/* =========================================================
   STATS
========================================================= */

function updateStats() {

  const total =
    state.wins +
    state.losses;


  const accuracy =
    total
      ? (state.wins / total) * 100
      : 0;


  setText(
    "paperTotal",
    total
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
    `${accuracy.toFixed(1)}%`
  );

}


/* =========================================================
   STOP TRADING BUTTON
========================================================= */

function bindStopTrading() {

  $("stopTradingBtn")
    ?.addEventListener(
      "click",
      () => {

        stopAllTrading();

      }
    );

}


/* =========================================================
   STOP ALL TRADING
========================================================= */

function stopAllTrading() {

  const wasRunning =
    state.aiRunning ||
    state.circularRunning ||
    state.activeTrades.length > 0;


  state.tradingStopped =
    true;


  /* -----------------------------------------------
     STOP AI BOT
  ------------------------------------------------ */

  state.aiRunning =
    false;

  state.aiCycleToken++;


  clearTimeout(
    state.botTimer
  );

  state.botTimer = null;


  /* -----------------------------------------------
     STOP CIRCULAR AI
  ------------------------------------------------ */

  state.circularRunning =
    false;

  state.circularToken++;


  clearTimeout(
    state.circularTimer
  );

  state.circularTimer = null;


  setText(
    "botStatusDash",
    "STOPPED"
  );

  setText(
    "circularStatusText",
    "STOPPED"
  );

  setText(
    "aiCircleStatus",
    "STOPPED"
  );

  setText(
    "cycleTrade",
    "STOPPED"
  );

  setText(
    "engineStatusText",
    "TRADING STOPPED"
  );


  updateBotButton();

  updateTradingStopUI();


  if (wasRunning) {

    showToast(
      "ALL TRADING STOPPED"
    );

  } else {

    showToast(
      "Trading is already stopped"
    );

  }

}


/* =========================================================
   STOP UI
========================================================= */

function updateTradingStopUI() {

  const button =
    $("stopTradingBtn");

  const label =
    $("tradingStatusLabel");


  if (
    state.tradingStopped
  ) {

    if (button) {

      button.classList.add(
        "stopped"
      );

      button.textContent =
        "✓ TRADING STOPPED";

    }


    setText(
      "tradingStatusLabel",
      "TRADING STOPPED"
    );

  } else {

    if (button) {

      button.classList.remove(
        "stopped"
      );

      button.textContent =
        "🛑 STOP TRADING";

    }


    setText(
      "tradingStatusLabel",
      "TRADING ACTIVE"
    );

  }

}


/* =========================================================
   CLEAR HISTORY
========================================================= */

function bindClearHistory() {

  $("clearLogsBtn")
    ?.addEventListener(
      "click",
      () => {

        if (!state.history.length) {

          showToast(
            "History is already empty"
          );

          return;

        }


        const confirmed =
          confirm(
            "Clear completed trade history? Your paper balance will not be reset."
          );


        if (!confirmed) {
          return;
        }


        state.history = [];

        state.totalProfit = 0;

        state.totalAmountWon = 0;

        state.totalStake = 0;

        state.wins = 0;

        state.losses = 0;

        state.sessionStartProfit =
          0;

        saveHistory();

        updateStats();

        renderHistory();

        updateHistorySummary();

        showToast(
          "History cleared"
        );

      }
    );

}


/* =========================================================
   OAUTH CALLBACK
   Safe placeholder:
   no secret tokens are stored in localStorage.
========================================================= */

function checkOAuthCallback() {

  try {

    const url =
      new URL(
        window.location.href
      );


    const code =
      url.searchParams.get("code");


    const token =
      url.searchParams.get("token");


    if (code) {

      setText(
        "dataStatus",
        "DEMO CONNECTION READY"
      );

      showToast(
        "Connection callback received"
      );

      window.history.replaceState(
        {},
        document.title,
        REDIRECT_URI
      );

    }


    if (token) {

      /*
        Deliberately do not store
        access tokens in localStorage.

        This V7 build remains
        DEMO / PAPER only.
      */

      showToast(
        "Real trading remains disabled"
      );

      window.history.replaceState(
        {},
        document.title,
        REDIRECT_URI
      );

    }

  } catch (error) {

    console.warn(
      "OAuth callback check failed",
      error
    );

  }

}


/* =========================================================
   DERIV BUTTON
========================================================= */

function bindDerivButton() {

  $("connectDerivBtn")
    ?.addEventListener(
      "click",
      () => {

        showToast(
          "Demo/Paper mode active — real trading disabled"
        );

      }
    );

}


/* =========================================================
   MARKET SELECTION
========================================================= */

function bindMarketSelection() {

  $("manualMarketSelect")
    ?.addEventListener(
      "change",
      event => {

        state.selectedMarket =
          event.target.value;

        saveSettings();

      }
    );


  $("circularMarketSelect")
    ?.addEventListener(
      "change",
      event => {

        state.selectedMarket =
          event.target.value;

        saveSettings();

      }
    );

}


/* =========================================================
   SELECTED MARKET SYNC
========================================================= */

function syncMarketSelectors() {

  if ($("manualMarketSelect")) {

    $("manualMarketSelect").value =
      state.selectedMarket;

  }

  if ($("circularMarketSelect")) {

    $("circularMarketSelect").value =
      state.selectedMarket;

  }

}


/* =========================================================
   WINDOW RESIZE
========================================================= */

function bindResize() {

  window.addEventListener(
    "resize",
    () => {

      updateChart();

    }
  );

}


/* =========================================================
   INITIALISE
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadTheme();

    loadSettings();

    loadBalance();

    buildInitialMarkets();

    populateMarketSelectors();

    syncMarketSelectors();

    bindNavigation();

    bindTheme();

    bindEngineTabs();

    bindBotControls();

    bindManualControls();

    bindCircularControls();

    bindStrategyModal();

    bindBotStrategyModal();

    bindClearHistory();

    bindStopTrading();

    bindDerivButton();

    bindMarketSelection();

    bindResize();


    /* -----------------------------------------------
       INITIAL UI
    ------------------------------------------------ */

    setText(
      "botStrategyLabel",
      state.botStrategyPool
        .map(strategyLabel)
        .join(" + ")
    );


    setText(
      "manualSelectedStrategyLabel",
      strategyLabel(
        state.selectedStrategy
      )
    );


    setText(
      "circularStrategyLabel",
      strategyLabel(
        state.selectedStrategy
      )
    );


    updateTargetDigitVisibility();

    renderHistory();

    renderActiveTrades();

    updateStats();

    updateBalance();

    updateHistorySummary();

    updateTradingStopUI();

    updateConnectionStatus(
      "CONNECTING",
      "loading"
    );


    selectEngine(
      "ai"
    );


    connectPublicMarket();

    checkOAuthCallback();

  }
);