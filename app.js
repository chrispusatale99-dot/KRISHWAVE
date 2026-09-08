/* =========================================================
   KRISHWAVE V5.8
   LIVE DERIV TICK ENGINE
   AI MARKET SCANNER
   10s ANALYSIS → 5s ENTRY → 3s COOLDOWN
   PAPER MODE ONLY
   ========================================================= */

const MARKETS = [
  ["Volatility 10", "R_10"],
  ["Volatility 25", "R_25"],
  ["Volatility 50", "R_50"],
  ["Volatility 75", "R_75"],
  ["Volatility 100", "R_100"],
  ["Volatility 10 (1s)", "1HZ10V"],
  ["Volatility 25 (1s)", "1HZ25V"],
  ["Volatility 50 (1s)", "1HZ50V"],
  ["Volatility 75 (1s)", "1HZ75V"],
  ["Volatility 100 (1s)", "1HZ100V"],
  ["Volatility 150 (1s)", "1HZ150V"],
  ["Volatility 250 (1s)", "1HZ250V"],
  ["Volatility 1000 (1s)", "1HZ1000V"]
];

const state = {
  socket: null,
  connected: false,
  aiRunning: false,
  trading: false,
  phase: "STOPPED",
  timer: 0,

  strategy: "MATCHES",
  market: null,
  prediction: null,
  confidence: 0,

  ticks: {},
  lastDigit: {},
  scores: {},

  history: JSON.parse(
    localStorage.getItem("krishwave_history") || "[]"
  ),

  wins: 0,
  losses: 0,
  pnl: 0,

  cycleTimer: null
};

/* =========================================================
   DOM
   ========================================================= */

const $ = id => document.getElementById(id);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* =========================================================
   DERIV CONNECTION
   ========================================================= */

function connectDeriv() {
  setText("connectionStatus", "CONNECTING...");

  const dot = $("statusDot");
  if (dot) dot.className = "status-dot";

  try {
    state.socket = new WebSocket(
      "wss://ws.derivws.com/websockets/v3?app_id=1089"
    );

    state.socket.onopen = () => {
      state.connected = true;

      setText("connectionStatus", "CONNECTED");

      if (dot) dot.className = "status-dot connected";

      subscribeMarkets();
    };

    state.socket.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        handleDerivMessage(data);
      } catch (err) {
        console.error("Message error:", err);
      }
    };

    state.socket.onerror = () => {
      state.connected = false;

      setText("connectionStatus", "CONNECTION ERROR");

      if (dot) dot.className = "status-dot error";
    };

    state.socket.onclose = () => {
      state.connected = false;

      setText("connectionStatus", "RECONNECTING...");

      if (dot) dot.className = "status-dot";

      setTimeout(connectDeriv, 3000);
    };

  } catch (err) {
    console.error(err);
    setTimeout(connectDeriv, 3000);
  }
}

/* =========================================================
   SUBSCRIBE TO ALL MARKETS
   ========================================================= */

function subscribeMarkets() {
  if (!state.socket || state.socket.readyState !== 1) return;

  MARKETS.forEach(([, symbol]) => {

    state.ticks[symbol] = [];

    state.socket.send(
      JSON.stringify({
        ticks: symbol,
        subscribe: 1
      })
    );

  });
}

/* =========================================================
   DERIV MESSAGE
   ========================================================= */

function handleDerivMessage(data) {

  if (!data.tick) return;

  const tick = data.tick;

  const symbol = tick.symbol;

  if (!state.ticks[symbol]) {
    state.ticks[symbol] = [];
  }

  const quote = safeNumber(tick.quote);

  const digits = String(
    tick.quote
  ).replace(".", "");

  const digit = Number(
    digits.slice(-1)
  );

  state.ticks[symbol].push({
    quote,
    digit,
    epoch: tick.epoch
  });

  if (state.ticks[symbol].length > 120) {
    state.ticks[symbol].shift();
  }

  state.lastDigit[symbol] = digit;

  updateMarketScores();
  updateScanner();
  updateDigits();

  if (
    state.market &&
    symbol === state.market
  ) {
    updateLiveMarket(symbol);
  }
}

/* =========================================================
   MARKET ANALYSIS
   ========================================================= */

function analyzeMarket(symbol) {

  const data = state.ticks[symbol] || [];

  if (data.length < 10) {
    return {
      score: 0,
      confidence: 0,
      digit: null,
      strength: "WAITING",
      stability: 0,
      concentration: 0,
      streak: 0,
      bestStrategy: "WAIT"
    };
  }

  const recent = data.slice(-60);
  const counts = Array(10).fill(0);

  recent.forEach(x => {
    if (
      Number.isInteger(x.digit) &&
      x.digit >= 0 &&
      x.digit <= 9
    ) {
      counts[x.digit]++;
    }
  });

  const total = recent.length;

  let maxDigit = 0;

  for (let i = 1; i < 10; i++) {
    if (counts[i] > counts[maxDigit]) {
      maxDigit = i;
    }
  }

  const concentration =
    (counts[maxDigit] / total) * 100;

  const expected = 10;

  const deviation =
    Math.abs(concentration - expected);

  const stability =
    Math.max(
      0,
      Math.min(
        100,
        100 - Math.abs(
          50 - concentration
        )
      )
    );

  let streak = 0;

  for (
    let i = recent.length - 1;
    i >= 0;
    i--
  ) {
    if (recent[i].digit === maxDigit) {
      streak++;
    } else {
      break;
    }
  }

  const even =
    recent.filter(x => x.digit % 2 === 0)
      .length / total * 100;

  const odd = 100 - even;

  const high =
    recent.filter(x => x.digit >= 5)
      .length / total * 100;

  const low = 100 - high;

  const candidates = [
    ["MATCHES", concentration],
    ["DIFFERS", 100 - concentration],
    ["EVEN", Math.max(even, odd)],
    ["ODD", Math.max(even, odd)],
    ["OVER", Math.max(high, low)],
    ["UNDER", Math.max(high, low)]
  ];

  candidates.sort((a, b) => b[1] - a[1]);

  const bestStrategy = candidates[0][0];

  const confidence = Math.round(
    Math.min(
      99,
      50 +
      deviation * 0.7 +
      Math.min(streak * 3, 15)
    )
  );

  const score = Math.round(
    confidence * 0.7 +
    stability * 0.2 +
    Math.min(streak * 2, 10)
  );

  let strength = "WEAK";

  if (score >= 85) strength = "EXCELLENT";
  else if (score >= 75) strength = "STRONG";
  else if (score >= 65) strength = "GOOD";
  else if (score >= 55) strength = "FAIR";

  return {
    score,
    confidence,
    digit: maxDigit,
    strength,
    stability: Math.round(stability),
    concentration: Math.round(concentration),
    streak,
    bestStrategy
  };
}

/* =========================================================
   SCORE ALL MARKETS
   ========================================================= */

function updateMarketScores() {

  MARKETS.forEach(([, symbol]) => {
    state.scores[symbol] =
      analyzeMarket(symbol);
  });

  const ranked = MARKETS
    .map(([, symbol]) => ({
      symbol,
      ...state.scores[symbol]
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length) {

    const best = ranked[0];

    state.market = best.symbol;

    updateBestMarket(best);
  }
}

/* =========================================================
   BEST MARKET DISPLAY
   ========================================================= */

function updateBestMarket(best) {

  setText(
    "aiMarket",
    best.symbol
  );

  setText(
    "analysisConfidence",
    `${best.confidence}%`
  );

  setText(
    "reportMarket",
    best.symbol
  );

  setText(
    "reportScore",
    best.score
  );

  setText(
    "reportStrength",
    best.strength
  );

  setText(
    "reportStability",
    `${best.stability}%`
  );

  setText(
    "reportConcentration",
    `${best.concentration}%`
  );

  setText(
    "reportStreak",
    best.streak
  );

  setText(
    "reportAgreement",
    best.bestStrategy
  );
}

/* =========================================================
   SCANNER
   ========================================================= */

function updateScanner() {

  const container = $("markets");

  if (!container) return;

  const ranked = MARKETS
    .map(([name, symbol]) => ({
      name,
      symbol,
      ...(state.scores[symbol] ||
        analyzeMarket(symbol))
    }))
    .sort((a, b) =>
      safeNumber(b.score) -
      safeNumber(a.score)
    );

  if (!ranked.some(x => x.score > 0)) {
    container.innerHTML =
      `<div class="empty">
        Waiting for live market ticks...
      </div>`;
    return;
  }

  container.innerHTML =
    ranked.map(market => {

      let indicator = "🔴 WEAK";

      if (market.score >= 85)
        indicator = "🔥 EXCELLENT";

      else if (market.score >= 75)
        indicator = "🟢 STRONG";

      else if (market.score >= 65)
        indicator = "🟡 GOOD";

      else if (market.score >= 55)
        indicator = "🔵 FAIR";

      return `
        <div
          class="market-card ${
            market.symbol === state.market
              ? "selected"
              : ""
          }"
          onclick="selectMarket('${market.symbol}')"
        >

          <div class="market-top">
            <strong>${market.name}</strong>
            <span>${market.symbol}</span>
          </div>

          <div class="market-score">
            ${market.score || 0}%
          </div>

          <div class="market-strength">
            ${indicator}
          </div>

          <div class="market-meta">
            <span>
              ${market.bestStrategy || "WAIT"}
            </span>

            <span>
              ${market.confidence || 0}% CONF
            </span>
          </div>

        </div>
      `;
    }).join("");
}

/* =========================================================
   TRADE PAGE MARKET CARDS
   ========================================================= */

function updateTradeMarkets() {

  const box =
    $("tradeMarkets");

  if (!box) return;

  const ranked = MARKETS
    .map(([name, symbol]) => ({
      name,
      symbol,
      ...(state.scores[symbol] ||
        analyzeMarket(symbol))
    }))
    .sort((a, b) =>
      safeNumber(b.score) -
      safeNumber(a.score)
    );

  box.innerHTML = ranked.map(m => {

    let indicator = "WAITING";

    if (m.score >= 85)
      indicator = "🔥 EXCELLENT";

    else if (m.score >= 75)
      indicator = "🟢 GOOD";

    else if (m.score >= 60)
      indicator = "🟡 FAIR";

    else if (m.score > 0)
      indicator = "🔴 WEAK";

    return `
      <div
        class="trade-market-card ${
          m.symbol === state.market
            ? "selected"
            : ""
        }"
        onclick="selectMarket('${m.symbol}')"
      >

        <div class="trade-market-name">
          ${m.name}
        </div>

        <div class="trade-market-symbol">
          ${m.symbol}
        </div>

        <div class="trade-market-score">
          ${m.score || 0}%
        </div>

        <div class="trade-market-best">
          ${m.bestStrategy || "WAIT"}
        </div>

        <div class="trade-market-indicator">
          ${indicator}
        </div>

      </div>
    `;
  }).join("");
}

/* =========================================================
   SELECT MARKET
   ========================================================= */

function selectMarket(symbol) {

  state.market = symbol;

  const score =
    state.scores[symbol] ||
    analyzeMarket(symbol);

  state.scores[symbol] = score;

  setText(
    "symbol",
    symbol
  );

  const input = $("symbol");

  if (input) {
    input.value = symbol;
  }

  setText(
    "aiMarket",
    symbol
  );

  setText(
    "reportMarket",
    symbol
  );

  updateScanner();
  updateTradeMarkets();
}

/* =========================================================
   DIGIT DISTRIBUTION
   ========================================================= */

function updateDigits() {

  const container =
    $("digits");

  if (!container) return;

  const symbol =
    state.market;

  const data =
    state.ticks[symbol] || [];

  if (data.length < 1) {

    container.innerHTML =
      `<div class="empty">
        Waiting for digits...
      </div>`;

    return;
  }

  const recent =
    data.slice(-60);

  const counts =
    Array(10).fill(0);

  recent.forEach(x => {
    counts[x.digit]++;
  });

  container.innerHTML =
    counts.map((count, digit) => {

      const percent =
        Math.round(
          count / recent.length * 100
        );

      return `
        <div class="digit-card">

          <div class="digit-number">
            ${digit}
          </div>

          <div class="digit-count">
            ${count}
          </div>

          <div class="digit-percent">
            ${percent}%
          </div>

        </div>
      `;

    }).join("");
}

/* =========================================================
   LIVE MARKET
   ========================================================= */

function updateLiveMarket(symbol) {

  const data =
    state.ticks[symbol] || [];

  setText(
    "analysisMsg",
    `${symbol}: ${data.length} live ticks collected.`
  );
}

/* =========================================================
   STRATEGY
   ========================================================= */

function setStrategy(strategy) {

  state.strategy = strategy;

  document
    .querySelectorAll(".strategy-btn")
    .forEach(btn => {

      btn.classList.toggle(
        "active",
        btn.dataset.strategy === strategy
      );

    });

  const select =
    $("tradeStrategy");

  if (select) {
    select.value = strategy;
  }

  setText(
    "aiType",
    strategy
  );

  setText(
    "tradeType",
    strategy
  );

  updateManualField();

  if (state.aiRunning) {
    setText(
      "analysisMsg",
      `AI strategy changed to ${strategy}.`
    );
  }
}

function updateManualField() {

  const group =
    $("manualNumberGroup");

  if (!group) return;

  const needsNumber =
    ["MATCHES", "DIFFERS", "OVER", "UNDER"]
      .includes(state.strategy);

  group.style.display =
    needsNumber ? "block" : "none";
}

/* =========================================================
   PREDICTION
   ========================================================= */

function createPrediction() {

  const symbol =
    state.market;

  if (!symbol) return null;

  const analysis =
    state.scores[symbol] ||
    analyzeMarket(symbol);

  if (analysis.digit === null)
    return null;

  let prediction =
    analysis.digit;

  if (state.strategy === "EVEN") {

    prediction =
      analysis.digit % 2 === 0
        ? "EVEN"
        : "ODD";
  }

  else if (state.strategy === "ODD") {

    prediction =
      analysis.digit % 2 === 1
        ? "ODD"
        : "EVEN";
  }

  state.prediction = prediction;
  state.confidence =
    analysis.confidence;

  return prediction;
}

/* =========================================================
   CYCLE
   ========================================================= */

function startAI() {

  if (state.aiRunning) return;

  state.aiRunning = true;

  runAnalysisPhase();
}

function stopAI() {

  state.aiRunning = false;

  clearInterval(
    state.cycleTimer
  );

  state.phase = "STOPPED";

  setText(
    "aiCircleTimer",
    "—"
  );

  setText(
    "aiCircleLabel",
    "AI STOPPED"
  );

  setText(
    "aiCircleStatus",
    "AI STOPPED"
  );

  setText(
    "cycleAnalysis",
    "STOP"
  );

  setText(
    "cyclePrediction",
    "WAIT"
  );

  setText(
    "cycleTrade",
    "WAIT"
  );

  setText(
    "cycleCooldown",
    "READY"
  );
}

/* =========================================================
   10 SECOND ANALYSIS
   ========================================================= */

function runAnalysisPhase() {

  if (!state.aiRunning) return;

  clearInterval(
    state.cycleTimer
  );

  state.phase = "ANALYSIS";
  state.timer = 10;

  setText(
    "aiCircleLabel",
    "ANALYZING"
  );

  setText(
    "aiCircleStatus",
    "SCANNING BEST MARKET"
  );

  setText(
    "cycleTrade",
    "WAIT"
  );

  setText(
    "cycleCooldown",
    "READY"
  );

  tickAnalysis();
}

/* =========================================================
   ANALYSIS TIMER
   ========================================================= */

function tickAnalysis() {

  if (!state.aiRunning) return;

  setText(
    "aiCircleTimer",
    state.timer
  );

  setText(
    "cycleAnalysis",
    `${state.timer}s`
  );

  if (state.timer <= 0) {

    clearInterval(
      state.cycleTimer
    );

    lockPrediction();

    return;
  }

  state.timer--;

  state.cycleTimer =
    setTimeout(
      tickAnalysis,
      1000
    );
}

/* =========================================================
   LOCK PREDICTION
   ========================================================= */

function lockPrediction() {

  if (!state.aiRunning) return;

  const prediction =
    createPrediction();

  if (
    prediction === null ||
    prediction === undefined
  ) {

    setText(
      "aiCircleStatus",
      "NOT ENOUGH TICKS"
    );

    setText(
      "analysisMsg",
      "Collecting more live ticks before prediction."
    );

    setTimeout(
      runAnalysisPhase,
      1000
    );

    return;
  }

  setText(
    "aiPrediction",
    prediction
  );

  setText(
    "tradePrediction",
    prediction
  );

  setText(
    "analysisConfidence",
    `${state.confidence}%`
  );

  setText(
    "tradeConfidence",
    `${state.confidence}%`
  );

  setText(
    "aiCircleLabel",
    "PREDICTION LOCKED"
  );

  setText(
    "aiCircleStatus",
    "5 SECOND ENTRY WINDOW"
  );

  setText(
    "cyclePrediction",
    `${prediction}`
  );

  runEntryPhase();
}

/* =========================================================
   5 SECOND ENTRY
   ========================================================= */

function runEntryPhase() {

  if (!state.aiRunning) return;

  state.phase = "ENTRY";
  state.timer = 5;

  setText(
    "cycleTrade",
    "ENTRY"
  );

  tickEntry();
}

function tickEntry() {

  if (!state.aiRunning) return;

  setText(
    "aiCircleTimer",
    state.timer
  );

  setText(
    "cyclePrediction",
    `${state.prediction} • ${state.timer}s`
  );

  if (state.timer <= 0) {

    clearInterval(
      state.cycleTimer
    );

    tradeNow();

    return;
  }

  state.timer--;

  state.cycleTimer =
    setTimeout(
      tickEntry,
      1000
    );
}

/* =========================================================
   TRADE NOW
   ========================================================= */

function tradeNow() {

  if (!state.aiRunning) return;

  state.phase = "TRADE";

  setText(
    "aiCircleTimer",
    "GO"
  );

  setText(
    "aiCircleLabel",
    "TRADE NOW"
  );

  setText(
    "aiCircleStatus",
    `${state.market || "MARKET"} • ${state.prediction}`
  );

  setText(
    "cycleTrade",
    "TRADE NOW"
  );

  setText(
    "analysisMsg",
    "AI entry window ended. Paper signal recorded."
  );

  recordSignal();

  runCooldown();
}

/* =========================================================
   3 SECOND COOLDOWN
   ========================================================= */

function runCooldown() {

  if (!state.aiRunning) return;

  state.phase = "COOLDOWN";
  state.timer = 3;

  tickCooldown();
}

function tickCooldown() {

  if (!state.aiRunning) return;

  setText(
    "aiCircleTimer",
    state.timer
  );

  setText(
    "aiCircleLabel",
    "COOLDOWN"
  );

  setText(
    "aiCircleStatus",
    "NEXT ANALYSIS SOON"
  );

  setText(
    "cycleCooldown",
    `${state.timer}s`
  );

  if (state.timer <= 0) {

    clearInterval(
      state.cycleTimer
    );

    runAnalysisPhase();

    return;
  }

  state.timer--;

  state.cycleTimer =
    setTimeout(
      tickCooldown,
      1000
    );
}

/* =========================================================
   PAPER HISTORY
   ========================================================= */

function recordSignal() {

  const item = {
    time: new Date().toLocaleTimeString(),
    market: state.market || "—",
    strategy: state.strategy,
    prediction: state.prediction,
    confidence: state.confidence,
    result: "PENDING",
    mode: "PAPER"
  };

  state.history.unshift(item);

  if (state.history.length > 100) {
    state.history.pop();
  }

  localStorage.setItem(
    "krishwave_history",
    JSON.stringify(state.history)
  );

  renderHistory();
}

/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {

  const body =
    $("historyList");

  if (!body) return;

  if (!state.history.length) {

    body.innerHTML =
      `<tr>
        <td colspan="7">
          No history yet
        </td>
      </tr>`;

  } else {

    body.innerHTML =
      state.history.map(item => `
        <tr>

          <td>${item.time}</td>

          <td>${item.market}</td>

          <td>${item.strategy}</td>

          <td>${item.prediction}</td>

          <td>${item.confidence}%</td>

          <td>${item.result}</td>

          <td>${item.mode}</td>

        </tr>
      `).join("");
  }

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

  const pending =
    state.history.filter(
      x => x.result === "PENDING"
    ).length;

  const accuracy =
    wins + losses
      ? Math.round(
          wins /
          (wins + losses) *
          100
        )
      : 0;

  setText(
    "historyTotal",
    total
  );

  setText(
    "historyWins",
    wins
  );

  setText(
    "historyLosses",
    losses
  );

  setText(
    "historyPending",
    pending
  );

  setText(
    "historyAccuracy",
    `${accuracy}%`
  );

  setText(
    "tradeTotal",
    total
  );

  setText(
    "tradeWins",
    wins
  );

  setText(
    "tradeLosses",
    losses
  );

  setText(
    "tradeAccuracy",
    `${accuracy}%`
  );
}

/* =========================================================
   CLEAR HISTORY
   ========================================================= */

function clearHistory() {

  state.history = [];

  localStorage.removeItem(
    "krishwave_history"
  );

  renderHistory();
}

/* =========================================================
   PAPER TRADING BUTTONS
   ========================================================= */

function startTrading() {

  state.trading = true;

  setText(
    "tradeStatus",
    "PAPER TRADING ACTIVE"
  );
}

function stopTrading() {

  state.trading = false;

  setText(
    "tradeStatus",
    "PAPER TRADING STOPPED"
  );
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  document
    .querySelectorAll(".nav-btn")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => {

          const page =
            btn.dataset.page;

          document
            .querySelectorAll(".nav-btn")
            .forEach(x =>
              x.classList.remove("active")
            );

          btn.classList.add("active");

          document
            .querySelectorAll(".page")
            .forEach(x =>
              x.classList.remove("active")
            );

          const target =
            $(`${page}Page`);

          if (target) {
            target.classList.add("active");
          }

          if (page === "trade") {
            updateTradeMarkets();
          }

        }
      );

    });
}

/* =========================================================
   THEME
   ========================================================= */

function setupTheme() {

  const btn =
    $("themeToggle");

  if (!btn) return;

  const saved =
    localStorage.getItem(
      "krishwave_theme"
    );

  if (saved === "light") {
    document.body.classList.add("light");
    btn.textContent = "🌙";
  }

  btn.addEventListener(
    "click",
    () => {

      document.body.classList.toggle(
        "light"
      );

      const light =
        document.body.classList.contains(
          "light"
        );

      localStorage.setItem(
        "krishwave_theme",
        light ? "light" : "dark"
      );

      btn.textContent =
        light ? "🌙" : "☀️";
    }
  );
}

/* =========================================================
   STRATEGY BUTTONS
   ========================================================= */

function setupStrategies() {

  document
    .querySelectorAll(".strategy-btn")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => {
          setStrategy(
            btn.dataset.strategy
          );
        }
      );

    });

  const select =
    $("tradeStrategy");

  if (select) {

    select.addEventListener(
      "change",
      e => {
        setStrategy(
          e.target.value
        );
      }
    );
  }
}

/* =========================================================
   BUTTON SETUP
   ========================================================= */

function setupButtons() {

  $("startAI")?.addEventListener(
    "click",
    startAI
  );

  $("stopAI")?.addEventListener(
    "click",
    stopAI
  );

  $("startTrading")?.addEventListener(
    "click",
    startTrading
  );

  $("stopTrading")?.addEventListener(
    "click",
    stopTrading
  );

  $("clearHistory")?.addEventListener(
    "click",
    clearHistory
  );

  $("demoBtn")?.addEventListener(
    "click",
    () => setText("accountMode", "DEMO")
  );

  $("realBtn")?.addEventListener(
    "click",
    () => setText("accountMode", "REAL")
  );
}

/* =========================================================
   INIT
   ========================================================= */

function init() {

  updateManualField();
  renderHistory();

  setupNavigation();
  setupTheme();
  setupStrategies();
  setupButtons();

  updateScanner();
  updateTradeMarkets();

  connectDeriv();

  setText(
    "aiCircleTimer",
    "10"
  );

  setText(
    "aiCircleLabel",
    "AI STOPPED"
  );

  setText(
    "aiCircleStatus",
    "PRESS START AI"
  );
}

document.addEventListener(
  "DOMContentLoaded",
  init
);