/* =========================================================
   KRISHWAVE V5.1
   LIVE DERIV MARKET INTELLIGENCE + PAPER TRADE ENGINE

   FEATURES
   ---------------------------------------------------------
   - Live Deriv public tick data
   - 13 Volatility markets
   - Digit distribution
   - Matches / Differs
   - Over / Under
   - Even / Odd
   - Statistical AI analysis
   - Circular AI
   - 10 second analysis
   - 5 second prediction lock
   - TRADE NOW signal
   - 3 second cooldown
   - Manual number entry
   - AI never fills manual number
   - Paper trading only
   - Trade page
   - History page
   - LocalStorage history
   - Win / loss / P/L statistics
   ========================================================= */


/* =========================================================
   DERIV CONNECTION
   ========================================================= */

const WS_PRIMARY =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const WS_FALLBACK =
  "wss://ws.binaryws.com/websockets/v3";


/* =========================================================
   MARKETS
   ========================================================= */

const MARKETS = [
  {
    symbol: "R_10",
    name: "Volatility 10 Index"
  },
  {
    symbol: "R_25",
    name: "Volatility 25 Index"
  },
  {
    symbol: "R_50",
    name: "Volatility 50 Index"
  },
  {
    symbol: "R_75",
    name: "Volatility 75 Index"
  },
  {
    symbol: "R_100",
    name: "Volatility 100 Index"
  },
  {
    symbol: "R_150",
    name: "Volatility 150 Index"
  },
  {
    symbol: "R_250",
    name: "Volatility 250 Index"
  },
  {
    symbol: "1HZ10V",
    name: "Volatility 10 (1s)"
  },
  {
    symbol: "1HZ25V",
    name: "Volatility 25 (1s)"
  },
  {
    symbol: "1HZ50V",
    name: "Volatility 50 (1s)"
  },
  {
    symbol: "1HZ75V",
    name: "Volatility 75 (1s)"
  },
  {
    symbol: "1HZ100V",
    name: "Volatility 100 (1s)"
  },
  {
    symbol: "1HZ150V",
    name: "Volatility 150 (1s)"
  }
];


const STRATEGIES = [
  "Matches",
  "Differs",
  "Over",
  "Under",
  "Even",
  "Odd"
];


/* =========================================================
   STATE
   ========================================================= */

let ws = null;
let wsEndpoint = WS_PRIMARY;

let reconnectTimer = null;
let reconnectAttempts = 0;

let sym = "R_10";

let selectedStrategy = "Matches";

let hist = [];
let digitCounts = Array(10).fill(0);

let totalTicks = 0;
let receivedData = false;

let lastQuote = null;
let lastDigit = null;

let aiPrediction = null;
let aiConfidence = 0;
let aiScore = 0;
let aiType = "—";
let aiReason = "";

let predictionLocked = false;

let cycleRunning = false;
let cycleTimer = null;

let cyclePhase = "ANALYSIS";
let secondsLeft = 10;

let paperTrading = false;

let waitingForTradeResult = false;

let tradeStake = 1;
let currentTradeStake = 1;

let wins = 0;
let losses = 0;
let totalTrades = 0;
let profitLoss = 0;


/* =========================================================
   DOM HELPER
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


function show(id, visible = true) {
  const el = $(id);

  if (el) {
    el.style.display = visible ? "" : "none";
  }
}


/* =========================================================
   LOCAL STORAGE
   ========================================================= */

const HISTORY_KEY = "KRISHWAVE_HISTORY_V5_1";


function loadHistory() {

  try {

    const saved = localStorage.getItem(HISTORY_KEY);

    hist = saved ? JSON.parse(saved) : [];

  } catch (error) {

    console.error("History load error:", error);

    hist = [];
  }

  calculateStats();
  renderHistory();
  updateStatsUI();
}


function saveHistory() {

  try {

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(hist)
    );

  } catch (error) {

    console.error("History save error:", error);
  }
}


/* =========================================================
   STATISTICS
   ========================================================= */

function calculateStats() {

  totalTrades = hist.length;

  wins = hist.filter(
    item => item.result === "WIN"
  ).length;

  losses = hist.filter(
    item => item.result === "LOSS"
  ).length;

  profitLoss = hist.reduce(
    (sum, item) => sum + Number(item.pl || 0),
    0
  );
}


function updateStatsUI() {

  const winRate =
    totalTrades > 0
      ? ((wins / totalTrades) * 100).toFixed(1)
      : "0.0";

  setText("tradeTotal", totalTrades);
  setText("tradeWins", wins);
  setText("tradeLosses", losses);
  setText("tradeWinRate", winRate + "%");
  setText("tradePL", profitLoss.toFixed(2));

  setText("historyTotal", totalTrades);
  setText("historyWins", wins);
  setText("historyLosses", losses);
  setText("historyWinRate", winRate + "%");
  setText("historyPL", profitLoss.toFixed(2));
}


/* =========================================================
   HISTORY
   ========================================================= */

function addHistory(record) {

  hist.unshift(record);

  if (hist.length > 500) {
    hist = hist.slice(0, 500);
  }

  saveHistory();

  calculateStats();
  renderHistory();
  updateStatsUI();
}


function renderHistory() {

  const body = $("historyList");

  if (!body) return;

  if (!hist.length) {

    body.innerHTML = `
      <tr>
        <td colspan="6" class="empty-history">
          No paper trades yet.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML = hist.map(item => {

    const pl =
      Number(item.pl || 0).toFixed(2);

    const resultClass =
      item.result === "WIN"
        ? "win"
        : "loss";

    return `
      <tr>
        <td>${item.time || "—"}</td>
        <td>${item.market || "—"}</td>
        <td>${item.strategy || "—"}</td>
        <td>${item.number ?? "—"}</td>
        <td class="${resultClass}">
          ${item.result || "—"}
        </td>
        <td>${pl}</td>
      </tr>
    `;

  }).join("");
}


function clearHistory() {

  if (!confirm(
    "Clear all KRISHWAVE paper trading history?"
  )) {
    return;
  }

  hist = [];

  saveHistory();

  calculateStats();
  renderHistory();
  updateStatsUI();
}


/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function setupNavigation() {

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.addEventListener("click", () => {

        const target =
          button.dataset.page;

        document
          .querySelectorAll(".nav-btn")
          .forEach(btn => {
            btn.classList.remove("active");
          });

        button.classList.add("active");

        document
          .querySelectorAll(".page")
          .forEach(page => {
            page.classList.remove("active-page");
          });

        const page = $(target);

        if (page) {
          page.classList.add("active-page");
        }

      });

    });
}


/* =========================================================
   STRATEGIES
   ========================================================= */

function buildStrategies() {

  const container = $("strategies");

  if (!container) return;

  container.innerHTML = "";

  STRATEGIES.forEach(strategy => {

    const button =
      document.createElement("button");

    button.className = "strategy-btn";

    if (strategy === selectedStrategy) {
      button.classList.add("active");
    }

    button.textContent = strategy;

    button.dataset.strategy = strategy;

    button.addEventListener(
      "click",
      () => chooseStrategy(strategy)
    );

    container.appendChild(button);
  });


  const tradeStrategy =
    $("tradeStrategy");

  if (tradeStrategy) {

    tradeStrategy.value =
      selectedStrategy;

    tradeStrategy.addEventListener(
      "change",
      event => {

        chooseStrategy(
          event.target.value
        );

      }
    );
  }
}


function chooseStrategy(strategy) {

  if (!STRATEGIES.includes(strategy)) {
    return;
  }

  selectedStrategy = strategy;

  setText(
    "strategy",
    selectedStrategy
  );

  setText(
    "analysisStrategy",
    selectedStrategy
  );


  const tradeStrategy =
    $("tradeStrategy");

  if (
    tradeStrategy &&
    tradeStrategy.value !== selectedStrategy
  ) {
    tradeStrategy.value =
      selectedStrategy;
  }


  document
    .querySelectorAll(".strategy-btn")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.strategy ===
        selectedStrategy
      );

    });


  updateManualNumberUI();

  analyzeMarket();
  updateAIUI();
}


/* =========================================================
   MANUAL NUMBER
   ========================================================= */

function updateManualNumberUI() {

  const group =
    $("manualNumberGroup");

  const input =
    $("number");

  const title =
    $("manualTitle");

  const note =
    $("manual");

  if (!group || !input) {
    return;
  }


  if (
    selectedStrategy === "Even" ||
    selectedStrategy === "Odd"
  ) {

    group.style.opacity = "0.55";

    input.disabled = true;

    input.value = "";

    if (title) {
      title.textContent =
        "NUMBER NOT REQUIRED";
    }

    if (note) {
      note.textContent =
        "Even/Odd uses the AI signal automatically.";
    }

  } else {

    group.style.opacity = "1";

    input.disabled = false;

    if (title) {

      if (
        selectedStrategy === "Over" ||
        selectedStrategy === "Under"
      ) {
        title.textContent =
          "MANUAL THRESHOLD";
      } else {
        title.textContent =
          "MANUAL NUMBER";
      }

    }

    if (note) {
      note.textContent =
        "Enter your own number. AI will NOT fill this field.";
    }
  }
}


function getManualNumber() {

  if (
    selectedStrategy === "Even" ||
    selectedStrategy === "Odd"
  ) {
    return null;
  }

  const input = $("number");

  if (!input) {
    return null;
  }

  const value =
    Number(input.value);

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 9
  ) {
    return null;
  }

  return Math.floor(value);
}


/* =========================================================
   MARKETS
   ========================================================= */

function buildMarkets() {

  const container = $("markets");

  if (!container) return;

  container.innerHTML = "";

  MARKETS.forEach(market => {

    const button =
      document.createElement("button");

    button.className = "market-card";

    if (market.symbol === sym) {
      button.classList.add("active");
    }

    button.innerHTML = `
      <strong>${market.name}</strong>
      <span>${market.symbol}</span>
    `;

    button.addEventListener(
      "click",
      () => selectMarket(market.symbol)
    );

    container.appendChild(button);
  });
}


function selectMarket(symbol) {

  const market =
    MARKETS.find(
      item => item.symbol === symbol
    );

  if (!market) return;

  sym = market.symbol;

  setText("mname", market.name);
  setText("sym", market.symbol);

  const symbolSelect =
    $("symbol");

  if (
    symbolSelect &&
    symbolSelect.value !== sym
  ) {
    symbolSelect.value = sym;
  }


  document
    .querySelectorAll(".market-card")
    .forEach(card => {

      card.classList.toggle(
        "active",
        card.textContent.includes(sym)
      );

    });


  hist = [];

  digitCounts =
    Array(10).fill(0);

  totalTicks = 0;

  lastQuote = null;
  lastDigit = null;

  updateMarketLabels();
  renderDigits();
  updateAIUI();

  subscribeMarket();
}


function setupMarketSelector() {

  const selector =
    $("symbol");

  if (!selector) return;

  selector.addEventListener(
    "change",
    event => {
      selectMarket(event.target.value);
    }
  );
}


/* =========================================================
   DIGIT EXTRACTION
   ========================================================= */

function getLastDigit(quote) {

  const text =
    String(quote);

  const digits =
    text.replace(
      /[^0-9]/g,
      ""
    );

  if (!digits.length) {
    return null;
  }

  return Number(
    digits[digits.length - 1]
  );
}


/* =========================================================
   TICK PROCESSING
   ========================================================= */

function processTick(tick) {

  if (!tick) return;

  const quote =
    Number(tick.quote);

  if (!Number.isFinite(quote)) {
    return;
  }


  const digit =
    getLastDigit(quote);

  if (digit === null) {
    return;
  }


  lastQuote = quote;
  lastDigit = digit;

  totalTicks++;

  digitCounts[digit]++;


  if (hist.length >= 1000) {
    hist.shift();
  }

  hist.push({
    digit,
    quote,
    epoch:
      Number(tick.epoch) ||
      Math.floor(Date.now() / 1000)
  });


  setText(
    "last",
    quote
  );

  setText(
    "ticks",
    totalTicks
  );


  renderDigits();

  updateMarketLabels();

  analyzeMarket();

  updateAIUI();


  /* -----------------------------------------------
     PAPER TRADE RESULT
     Evaluate the FIRST new tick after TRADE NOW.
     ----------------------------------------------- */

  if (
    waitingForTradeResult &&
    paperTrading
  ) {

    waitingForTradeResult = false;

    evaluatePaperTrade(digit);
  }
}


/* =========================================================
   DIGIT DISTRIBUTION
   ========================================================= */

function renderDigits() {

  const container =
    $("digits");

  if (!container) return;

  const total =
    digitCounts.reduce(
      (a, b) => a + b,
      0
    );


  container.innerHTML =
    digitCounts.map(
      (count, digit) => {

        const percent =
          total > 0
            ? ((count / total) * 100)
                .toFixed(1)
            : "0.0";

        return `
          <div class="digit-card">
            <strong>${digit}</strong>
            <span>${percent}%</span>
            <small>${count}</small>
          </div>
        `;

      }
    ).join("");


  if (total > 0) {

    let hotDigit = 0;

    for (
      let i = 1;
      i < digitCounts.length;
      i++
    ) {

      if (
        digitCounts[i] >
        digitCounts[hotDigit]
      ) {
        hotDigit = i;
      }

    }

    setText(
      "hot",
      hotDigit
    );
  }
}


/* =========================================================
   MARKET LABELS
   ========================================================= */

function updateMarketLabels() {

  const market =
    MARKETS.find(
      item => item.symbol === sym
    );

  if (!market) return;

  setText(
    "mname",
    market.name
  );

  setText(
    "sym",
    market.symbol
  );
}


/* =========================================================
   AI STATISTICS
   ========================================================= */

function getRecentDigits(count) {

  return hist
    .slice(-count)
    .map(item => item.digit);
}


function frequencyScore(digits) {

  if (!digits.length) {
    return {
      digit: null,
      confidence: 0
    };
  }


  const counts =
    Array(10).fill(0);

  digits.forEach(digit => {
    counts[digit]++;
  });


  let bestDigit = 0;

  for (
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      counts[i] >
      counts[bestDigit]
    ) {
      bestDigit = i;
    }

  }


  const percentage =
    counts[bestDigit] /
    digits.length;


  return {
    digit: bestDigit,
    confidence: percentage * 100
  };
}


/* =========================================================
   STRATEGY ANALYSIS
   ========================================================= */

function analyzeMarket() {

  const digits =
    getRecentDigits(120);

  if (digits.length < 10) {

    aiPrediction = null;
    aiConfidence = 0;
    aiScore = 0;
    aiType = "WAITING";

    aiReason =
      "Collecting more live tick data.";

    return;
  }


  const recent20 =
    getRecentDigits(20);

  const recent50 =
    getRecentDigits(50);

  const recent100 =
    getRecentDigits(100);


  const shortStats =
    frequencyScore(recent20);

  const mediumStats =
    frequencyScore(recent50);

  const longStats =
    frequencyScore(recent100);


  /* -----------------------------------------------
     Weighted digit scoring
     ----------------------------------------------- */

  const scores =
    Array(10).fill(0);

  for (let digit = 0; digit < 10; digit++) {

    const shortCount =
      recent20.filter(
        d => d === digit
      ).length;

    const mediumCount =
      recent50.filter(
        d => d === digit
      ).length;

    const longCount =
      recent100.filter(
        d => d === digit
      ).length;


    scores[digit] =
      (shortCount * 0.50) +
      (mediumCount * 0.30) +
      (longCount * 0.20);
  }


  let bestDigit = 0;

  for (
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      scores[i] >
      scores[bestDigit]
    ) {
      bestDigit = i;
    }

  }


  const totalScore =
    scores.reduce(
      (a, b) => a + b,
      0
    );


  let digitConfidence =
    totalScore > 0
      ? (
          scores[bestDigit] /
          totalScore
        ) * 100
      : 0;


  /* -----------------------------------------------
     Stability calculation
     ----------------------------------------------- */

  const stability =
    calculateStability(
      recent20
    );


  digitConfidence =
    Math.min(
      96,
      digitConfidence * 0.75 +
      stability * 0.25
    );


  aiPrediction = bestDigit;

  aiConfidence =
    Math.round(
      digitConfidence
    );


  aiScore =
    Math.round(
      Math.min(
        100,
        aiConfidence
      )
    );


  /* -----------------------------------------------
     Strategy
     ----------------------------------------------- */

  if (
    selectedStrategy === "Matches"
  ) {

    aiType = "MATCH";

    aiReason =
      `Digit ${bestDigit} has the strongest weighted frequency across recent ticks.`;

  }

  else if (
    selectedStrategy === "Differs"
  ) {

    aiType = "DIFFER";

    aiReason =
      `Digit ${bestDigit} is the strongest recent digit, so other digits receive the differs signal.`;

  }

  else if (
    selectedStrategy === "Over"
  ) {

    const high =
      digits.filter(
        d => d > 4
      ).length;

    const low =
      digits.filter(
        d => d <= 4
      ).length;

    aiType =
      high >= low
        ? "OVER 4"
        : "UNDER 5";

    aiReason =
      `Recent high/low digit balance: ${high} high versus ${low} low.`;

  }

  else if (
    selectedStrategy === "Under"
  ) {

    const low =
      digits.filter(
        d => d < 5
      ).length;

    const high =
      digits.filter(
        d => d >= 5
      ).length;

    aiType =
      low >= high
        ? "UNDER 5"
        : "OVER 4";

    aiReason =
      `Recent low/high digit balance: ${low} low versus ${high} high.`;

  }

  else if (
    selectedStrategy === "Even"
  ) {

    const even =
      digits.filter(
        d => d % 2 === 0
      ).length;

    const odd =
      digits.length - even;

    aiType =
      even >= odd
        ? "EVEN"
        : "ODD";

    aiReason =
      `Recent parity balance: ${even} even versus ${odd} odd.`;

  }

  else if (
    selectedStrategy === "Odd"
  ) {

    const odd =
      digits.filter(
        d => d % 2 !== 0
      ).length;

    const even =
      digits.length - odd;

    aiType =
      odd >= even
        ? "ODD"
        : "EVEN";

    aiReason =
      `Recent parity balance: ${odd} odd versus ${even} even.`;
  }
}


/* =========================================================
   STABILITY
   ========================================================= */

function calculateStability(digits) {

  if (digits.length < 5) {
    return 0;
  }


  let changes = 0;

  for (
    let i = 1;
    i < digits.length;
    i++
  ) {

    if (
      digits[i] !==
      digits[i - 1]
    ) {
      changes++;
    }

  }


  const changeRate =
    changes /
    (digits.length - 1);


  return Math.max(
    0,
    Math.min(
      100,
      100 -
      Math.abs(
        changeRate - 0.8
      ) * 100
    )
  );
}


/* =========================================================
   AI UI
   ========================================================= */

function updateAIUI() {

  if (
    aiPrediction === null
  ) {

    setText(
      "aiPrediction",
      "—"
    );

    setText(
      "analysisPrediction",
      "—"
    );

    setText(
      "tradePrediction",
      "—"
    );

    setText(
      "analysisConfidence",
      "—"
    );

    setText(
      "analysisConfidenceBox",
      "—"
    );

    setText(
      "tradeConfidence",
      "—"
    );

    setText(
      "aiType",
      "WAITING"
    );

    setText(
      "tradeType",
      "—"
    );

    setText(
      "aiScore",
      "—"
    );

    setText(
      "score",
      "—"
    );

    setText(
      "reason",
      aiReason
    );

    setText(
      "analysisText",
      "Collecting live ticks..."
    );

    return;
  }


  setText(
    "aiPrediction",
    aiPrediction
  );

  setText(
    "analysisPrediction",
    aiPrediction
  );

  setText(
    "tradePrediction",
    aiPrediction
  );


  setText(
    "analysisConfidence",
    aiConfidence + "%"
  );

  setText(
    "analysisConfidenceBox",
    aiConfidence + "%"
  );

  setText(
    "tradeConfidence",
    aiConfidence + "%"
  );


  setText(
    "aiType",
    aiType
  );

  setText(
    "tradeType",
    aiType
  );


  setText(
    "aiScore",
    aiScore
  );

  setText(
    "score",
    aiScore
  );


  setText(
    "reason",
    aiReason
  );


  setText(
    "analysisText",
    `AI analysed ${totalTicks} live ticks using weighted recent digit frequency, parity balance, high/low distribution and stability. Current statistical confidence: ${aiConfidence}%.`
  );
}


/* =========================================================
   CIRCULAR AI
   ========================================================= */

function updateCircularAI() {

  const circle =
    $("aiCircle");

  if (!circle) return;


  let totalSeconds = 10;

  if (
    cyclePhase === "PREDICTION"
  ) {
    totalSeconds = 5;
  }

  else if (
    cyclePhase === "COOLDOWN"
  ) {
    totalSeconds = 3;
  }


  const elapsed =
    totalSeconds -
    secondsLeft;


  const percent =
    Math.max(
      0,
      Math.min(
        100,
        (elapsed /
          totalSeconds) *
          100
      )
    );


  circle.style.setProperty(
    "--progress",
    percent + "%"
  );


  setText(
    "aiCircleTimer",
    secondsLeft
  );


  setText(
    "aiCircleStatus",
    cyclePhase
  );


  if (
    cyclePhase === "PREDICTION"
  ) {

    setText(
      "aiCirclePrediction",
      "🔒 Prediction locked"
    );

  }

  else if (
    cyclePhase === "TRADE"
  ) {

    setText(
      "aiCirclePrediction",
      "⚡ TRADE NOW"
    );

  }

  else if (
    cyclePhase === "COOLDOWN"
  ) {

    setText(
      "aiCirclePrediction",
      "⏸ Cooldown"
    );

  }

  else {

    setText(
      "aiCirclePrediction",
      "AI analysing market..."
    );
  }
}


/* =========================================================
   CYCLE UI
   ========================================================= */

function updateCycleUI() {

  setText(
    "phase",
    cyclePhase
  );


  if (
    cyclePhase === "ANALYSIS"
  ) {

    setText(
      "analysisMsg",
      `AI analysing market... ${secondsLeft}s`
    );

  }

  else if (
    cyclePhase === "PREDICTION"
  ) {

    setText(
      "analysisMsg",
      `Prediction locked. ${secondsLeft}s remaining.`
    );

  }

  else if (
    cyclePhase === "TRADE"
  ) {

    setText(
      "analysisMsg",
      "⚡ TRADE NOW — waiting for next tick result."
    );

  }

  else if (
    cyclePhase === "COOLDOWN"
  ) {

    setText(
      "analysisMsg",
      `Cooldown active... ${secondsLeft}s`
    );
  }


  updateCircularAI();
}


/* =========================================================
   AI CYCLE
   ========================================================= */

function startAnalysisPhase() {

  cyclePhase = "ANALYSIS";

  secondsLeft = 10;

  predictionLocked = false;

  updateCycleUI();
}


function startPredictionPhase() {

  cyclePhase = "PREDICTION";

  secondsLeft = 5;

  predictionLocked = true;

  analyzeMarket();

  updateAIUI();

  updateCycleUI();
}


function startTradePhase() {

  cyclePhase = "TRADE";

  secondsLeft = 0;

  predictionLocked = true;

  waitingForTradeResult =
    paperTrading;

  if (paperTrading) {

    setText(
      "tradeStatus",
      "WAITING FOR RESULT"
    );

  }

  updateCycleUI();
}


function startCooldownPhase() {

  cyclePhase = "COOLDOWN";

  secondsLeft = 3;

  predictionLocked = false;

  updateCycleUI();
}


function runCycleTick() {

  if (!cycleRunning) {
    return;
  }


  secondsLeft--;


  if (
    cyclePhase === "ANALYSIS" &&
    secondsLeft <= 0
  ) {

    startPredictionPhase();

  }

  else if (
    cyclePhase === "PREDICTION" &&
    secondsLeft <= 0
  ) {

    startTradePhase();

  }

  else if (
    cyclePhase === "COOLDOWN" &&
    secondsLeft <= 0
  ) {

    startAnalysisPhase();
  }


  updateCycleUI();
}


function startAICycle() {

  if (cycleRunning) {
    return;
  }

  cycleRunning = true;

  startAnalysisPhase();

  cycleTimer =
    setInterval(
      runCycleTick,
      1000
    );
}


function stopAICycle() {

  cycleRunning = false;

  if (cycleTimer) {

    clearInterval(
      cycleTimer
    );

    cycleTimer = null;
  }


  predictionLocked = false;

  cyclePhase = "STOPPED";

  secondsLeft = 0;

  updateCycleUI();
}


/* =========================================================
   PAPER TRADING
   ========================================================= */

function startTrading() {

  paperTrading = true;

  setText(
    "tradeStatus",
    "TRADING"
  );


  if (!cycleRunning) {
    startAICycle();
  }
}


function stopTrading() {

  paperTrading = false;

  waitingForTradeResult = false;

  setText(
    "tradeStatus",
    "STOPPED"
  );


  stopAICycle();
}


function getTradeNumber() {

  if (
    selectedStrategy === "Even" ||
    selectedStrategy === "Odd"
  ) {
    return aiPrediction;
  }


  const manual =
    getManualNumber();


  /*
     IMPORTANT:
     AI DOES NOT WRITE INTO THE INPUT.

     If user did not enter a number,
     no trade is evaluated.
  */

  return manual;
}


/* =========================================================
   PAPER TRADE EVALUATION
   ========================================================= */

function evaluatePaperTrade(resultDigit) {

  if (!paperTrading) {
    return;
  }


  const manual =
    getTradeNumber();


  /*
     Require a manual number for:
     Matches
     Differs
     Over
     Under
  */

  if (
    manual === null &&
    selectedStrategy !== "Even" &&
    selectedStrategy !== "Odd"
  ) {

    setText(
      "tradeStatus",
      "NUMBER REQUIRED"
    );

    return;
  }


  let won = false;

  let tradeNumber =
    manual;


  if (
    selectedStrategy === "Matches"
  ) {

    won =
      resultDigit === manual;
  }


  else if (
    selectedStrategy === "Differs"
  ) {

    won =
      resultDigit !== manual;
  }


  else if (
    selectedStrategy === "Over"
  ) {

    won =
      resultDigit > manual;
  }


  else if (
    selectedStrategy === "Under"
  ) {

    won =
      resultDigit < manual;
  }


  else if (
    selectedStrategy === "Even"
  ) {

    tradeNumber = "EVEN";

    won =
      resultDigit % 2 === 0;
  }


  else if (
    selectedStrategy === "Odd"
  ) {

    tradeNumber = "ODD";

    won =
      resultDigit % 2 !== 0;
  }


  const stakeInput =
    $("stake");

  const configuredStake =
    stakeInput
      ? Number(stakeInput.value)
      : 1;


  tradeStake =
    Number.isFinite(
      configuredStake
    ) &&
    configuredStake > 0
      ? configuredStake
      : 1;


  let pl;


  /*
     Simple paper model:
     WIN = +stake
     LOSS = -stake

     This is only a statistical paper
     simulation and is NOT Deriv payout
     calculation.
  */

  if (won) {

    pl =
      currentTradeStake;

  } else {

    pl =
      -currentTradeStake;
  }


  const now =
    new Date();


  const time =
    now.toLocaleTimeString();


  const market =
    MARKETS.find(
      item => item.symbol === sym
    );


  addHistory({

    time,

    market:
      market
        ? market.name
        : sym,

    symbol: sym,

    strategy:
      selectedStrategy,

    number:
      tradeNumber,

    result:
      won
        ? "WIN"
        : "LOSS",

    digit:
      resultDigit,

    pl

  });


  setText(
    "tradeStatus",
    won
      ? "WIN"
      : "LOSS"
  );


  /* -----------------------------------------------
     MARTINGALE
     ----------------------------------------------- */

  const martingale =
    $("martingale");


  const multiplier =
    martingale
      ? Number(martingale.value)
      : 1;


  if (!won && multiplier > 1) {

    currentTradeStake =
      currentTradeStake *
      multiplier;

  } else {

    currentTradeStake =
      tradeStake;
  }
}


/* =========================================================
   START / STOP BUTTONS
   ========================================================= */

function setupTradingControls() {

  const start =
    $("startTrading");

  const stop =
    $("stopTrading");


  if (start) {

    start.addEventListener(
      "click",
      () => {

        currentTradeStake =
          Number(
            $("stake")?.value
          ) || 1;

        startTrading();

      }
    );
  }


  if (stop) {

    stop.addEventListener(
      "click",
      () => {
        stopTrading();
      }
    );
  }


  const clear =
    $("clearHistory");

  if (clear) {

    clear.addEventListener(
      "click",
      clearHistory
    );
  }
}


/* =========================================================
   DERIV WEBSOCKET
   ========================================================= */

function connect(endpoint = WS_PRIMARY) {

  if (ws) {

    try {
      ws.close();
    } catch (error) {}
  }


  wsEndpoint = endpoint;

  setConnection(
    false,
    "CONNECTING"
  );


  try {

    ws =
      new WebSocket(
        wsEndpoint
      );

  } catch (error) {

    console.error(error);

    fallbackEndpoint();

    return;
  }


  ws.onopen = () => {

    reconnectAttempts = 0;

    receivedData = true;

    setConnection(
      true,
      "ONLINE"
    );


    requestHistory();

    subscribeMarket();

    startAICycle();
  };


  ws.onmessage = event => {

    try {

      const data =
        JSON.parse(
          event.data
        );


      handleMessage(data);

    } catch (error) {

      console.error(
        "Message parse error:",
        error
      );
    }
  };


  ws.onerror = error => {

    console.error(
      "WebSocket error:",
      error
    );

    setConnection(
      false,
      "ERROR"
    );
  };


  ws.onclose = () => {

    setConnection(
      false,
      "OFFLINE"
    );

    scheduleReconnect();
  };
}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function setConnection(
  online,
  text
) {

  setText(
    "conn",
    text
  );


  const dot =
    $("connDot");

  if (dot) {

    dot.classList.toggle(
      "online",
      online
    );
  }
}


/* =========================================================
   DERIV MESSAGE HANDLER
   ========================================================= */

function handleMessage(data) {

  if (
    data.msg_type === "tick" &&
    data.tick
  ) {

    processTick(
      data.tick
    );

    return;
  }


  if (
    data.msg_type === "history"
  ) {

    processHistory(
      data
    );

    return;
  }


  if (data.error) {

    console.error(
      "Deriv error:",
      data.error
    );

    setText(
      "error",
      data.error.message ||
      "Deriv connection error"
    );

  }
}


/* =========================================================
   HISTORICAL DATA
   ========================================================= */

function requestHistory() {

  send({

    ticks_history: sym,

    count: 100,

    end: "latest",

    style: "ticks",

    req_id: 100

  });
}


function processHistory(data) {

  if (
    !data.history ||
    !data.history.prices
  ) {
    return;
  }


  const prices =
    data.history.prices;

  const times =
    data.history.times ||
    [];


  prices.forEach(
    (price, index) => {

      const quote =
        Number(price);

      const digit =
        getLastDigit(
          quote
        );

      if (digit === null) {
        return;
      }


      hist.push({

        digit,

        quote,

        epoch:
          Number(times[index]) ||
          0

      });


      digitCounts[digit]++;
    }
  );


  totalTicks =
    hist.length;


  if (hist.length > 500) {

    hist =
      hist.slice(-500);
  }


  renderDigits();

  updateMarketLabels();

  analyzeMarket();

  updateAIUI();
}


/* =========================================================
   SUBSCRIBE
   ========================================================= */

function subscribeMarket() {

  if (
    !ws ||
    ws.readyState !== WebSocket.OPEN
  ) {
    return;
  }


  send({

    ticks: sym,

    subscribe: 1,

    req_id: 2

  });
}


/* =========================================================
   SEND
   ========================================================= */

function send(payload) {

  if (
    ws &&
    ws.readyState ===
    WebSocket.OPEN
  ) {

    ws.send(
      JSON.stringify(payload)
    );

  }
}


/* =========================================================
   FALLBACK
   ========================================================= */

function fallbackEndpoint() {

  if (
    wsEndpoint === WS_PRIMARY
  ) {

    wsEndpoint =
      WS_FALLBACK;

    connect(
      WS_FALLBACK
    );

  } else {

    scheduleReconnect();
  }
}


/* =========================================================
   RECONNECT
   ========================================================= */

function scheduleReconnect() {

  if (reconnectTimer) {
    return;
  }


  reconnectAttempts++;


  const delay =
    Math.min(
      15000,
      1000 *
      Math.pow(
        2,
        Math.min(
          reconnectAttempts,
          4
        )
      )
    );


  reconnectTimer =
    setTimeout(
      () => {

        reconnectTimer = null;

        connect(
          wsEndpoint
        );

      },
      delay
    );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

function initialize() {

  setupNavigation();

  setupTradingControls();

  setupMarketSelector();

  buildStrategies();

  buildMarkets();

  loadHistory();

  updateManualNumberUI();

  updateMarketLabels();

  renderDigits();

  updateAIUI();

  updateCycleUI();

  setText(
    "tradeStatus",
    "STOPPED"
  );


  /*
     Start public Deriv market data.
     No account token is used.
  */

  connect(
    WS_PRIMARY
  );
}


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initialize
);