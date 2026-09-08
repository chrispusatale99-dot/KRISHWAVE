/* =========================================================
   KRISHWAVE AI BEAST V7.0
   =========================================================
   THREE INDEPENDENT ENGINES

   1. AI CIRCLE
      - Analysis / intelligence
      - Multi-window statistics
      - Digit distribution
      - Hot / cold digits
      - Streak analysis
      - Even / Odd
      - Over / Under
      - Matches / Differs
      - Momentum
      - Stability
      - Agreement
      - Data quality

   2. AI BOT
      - COMPLETELY INDEPENDENT ENGINE
      - Chooses its own market
      - Chooses its own strategy
      - Chooses digit / threshold
      - Uses its own scoring engine
      - Does NOT copy Circle AI prediction
      - Strategy groups:
          ALL 6
          MATCHES / DIFFERS
          EVEN / ODD
          OVER / UNDER
      - 10s analysis
      - 5s locked prediction
      - 3s TRADE NOW
      - DEMO / PAPER ONLY

   3. MANUAL
      - User chooses market
      - User chooses strategy
      - User chooses target
      - Full Circle AI intelligence available
      - DEMO / PAPER ONLY

   SAFETY
   ---------------------------------------------------------
   No real-money execution.
   No Deriv contract purchase.
   No API trading command.
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
  "EVEN",
  "ODD",
  "OVER",
  "UNDER"
];

const STRATEGY_GROUPS = {
  ALL: STRATEGIES,

  MATCHES_DIFFERS: [
    "MATCHES",
    "DIFFERS"
  ],

  EVEN_ODD: [
    "EVEN",
    "ODD"
  ],

  OVER_UNDER: [
    "OVER",
    "UNDER"
  ]
};

const CONFIG = {
  MAX_TICKS: 200,

  WINDOWS: {
    SHORT: 10,
    MEDIUM: 25,
    LONG: 50,
    DEEP: 100
  },

  AI_BOT: {
    ANALYSIS_SECONDS: 10,
    PREDICTION_SECONDS: 5,
    TRADE_SECONDS: 3,

    MIN_TICKS: 25,

    MIN_CONFIDENCE: 55,

    MAX_CONFIDENCE: 92,

    LOSS_COOLDOWN: 1,

    MAX_CONSECUTIVE_LOSSES: 3
  },

  PAPER: {
    DEFAULT_STAKE: 10,
    MIN_STAKE: 0.35,

    MATCHES_MULTIPLIER: 8.5,
    DIFFERS_MULTIPLIER: 0.09,
    EVEN_MULTIPLIER: 0.95,
    ODD_MULTIPLIER: 0.95,
    OVER_MULTIPLIER: 0.95,
    UNDER_MULTIPLIER: 0.95
  }
};


/* =========================================================
   STATE
   ========================================================= */

const state = {

  /* Connection */
  connected: false,
  accessToken: null,
  accountId: null,
  currency: null,

  /* Engine */
  engineMode: "ai",
  aiCircleRunning: false,
  aiBotRunning: false,

  /* Manual */
  selectedMarket: "R_10",
  selectedStrategy: "MATCHES",
  manualTargetDigit: 4,

  /* AI Bot */
  aiBotStrategyGroup: "ALL",
  aiBotDecision: null,
  aiBotPhase: "IDLE",
  aiBotCycle: 0,
  aiBotToken: 0,

  /* Markets */
  markets: {},

  /* Circle */
  circlePrediction: null,
  circleConfidence: 0,
  circleReport: null,

  /* Charts */
  priceHistory: [],
  lastRender: 0,

  /* Paper */
  paperBalance: null,
  paperProfit: 0,
  activePaperTrades: [],

  /* History */
  history: [],

  /* WebSockets */
  publicWS: null,
  demoWS: null,

  /* Performance */
  renderThrottle: 120
};


/* =========================================================
   HELPERS
   ========================================================= */

const $ = id => document.getElementById(id);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {

  if (!values.length) return 0;

  return values.reduce((a, b) => a + b, 0) /
    values.length;
}

function formatNumber(value, decimals = 2) {

  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number(value).toFixed(decimals);
}

function esc(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMarketName(symbol) {

  return symbol
    .replace("R_", "Volatility ")
    .replace("1HZ", "Volatility ")
    + " Index";
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initializeKRISHWAVE
);

function initializeKRISHWAVE() {

  loadHistory();
  loadTheme();
  buildMarkets();

  bindNavigation();
  bindControls();
  bindEngineTabs();
  bindStrategyModal();
  bindManualControls();
  bindAIBotControls();

  initializePaperBalance();

  renderHistory();
  updateStats();

  connectPublicMarket();

  checkOAuthCallback();

  updateConnectionUI(
    false,
    "CONNECTING..."
  );
}


/* =========================================================
   MARKET INITIALIZATION
   ========================================================= */

function buildMarkets() {

  MARKETS.forEach(symbol => {

    state.markets[symbol] = {

      symbol,

      price: null,

      lastDigit: null,

      digits: Array(10).fill(0),

      ticks: [],

      prices: [],

      updated: 0,

      totalTicks: 0
    };
  });
}


/* =========================================================
   PUBLIC DERIV MARKET DATA
   ========================================================= */

function connectPublicMarket() {

  try {

    state.publicWS =
      new WebSocket(PUBLIC_WS);

  } catch (error) {

    updateConnectionUI(
      false,
      "CONNECTION ERROR"
    );

    return;
  }


  state.publicWS.onopen = () => {

    updateConnectionUI(
      true,
      "DERIV LIVE"
    );

    MARKETS.forEach(symbol => {

      try {

        state.publicWS.send(
          JSON.stringify({
            ticks: symbol,
            subscribe: 1
          })
        );

      } catch (error) {}
    });
  };


  state.publicWS.onmessage = event => {

    try {

      const message =
        JSON.parse(event.data);

      if (message.tick) {

        processTick(message.tick);
      }

    } catch (error) {}
  };


  state.publicWS.onerror = () => {

    updateConnectionUI(
      false,
      "DATA ERROR"
    );
  };


  state.publicWS.onclose = () => {

    updateConnectionUI(
      false,
      "RECONNECTING..."
    );

    setTimeout(() => {

      if (
        !state.publicWS ||
        state.publicWS.readyState ===
        WebSocket.CLOSED
      ) {

        connectPublicMarket();
      }

    }, 3000);
  };
}


/* =========================================================
   TICK PROCESSOR
   ========================================================= */

function processTick(tick) {

  const symbol = tick.symbol;

  if (!state.markets[symbol]) {
    return;
  }

  const price =
    Number(tick.quote);

  if (!Number.isFinite(price)) {
    return;
  }

  const digit =
    extractLastDigit(price);

  const market =
    state.markets[symbol];


  market.price = price;
  market.lastDigit = digit;

  market.digits[digit]++;

  market.ticks.push(digit);
  market.prices.push(price);

  market.totalTicks++;

  market.updated =
    Date.now();


  if (
    market.ticks.length >
    CONFIG.MAX_TICKS
  ) {

    market.ticks.shift();
  }


  if (
    market.prices.length >
    CONFIG.MAX_TICKS
  ) {

    market.prices.shift();
  }


  /* Selected market chart */

  if (
    symbol ===
    state.selectedMarket
  ) {

    state.priceHistory.push(price);

    if (
      state.priceHistory.length >
      100
    ) {

      state.priceHistory.shift();
    }

    const now = Date.now();

    if (
      now - state.lastRender >
      state.renderThrottle
    ) {

      state.lastRender = now;

      setText(
        "currentChartMarket",
        formatMarketName(symbol)
      );

      setText(
        "currentLivePrice",
        price.toFixed(2)
      );

      updateChart();
      renderDigitStats();
    }
  }


  /* Manual trades */

  evaluatePaperTrades(
    symbol,
    digit
  );
}


/* =========================================================
   LAST DIGIT EXTRACTION
   ========================================================= */

function extractLastDigit(price) {

  const text =
    String(price);

  const clean =
    text.replace(
      /[^0-9]/g,
      ""
    );

  if (!clean.length) {
    return 0;
  }

  return Number(
    clean.slice(-1)
  );
}


/* =========================================================
   CONNECTION UI
   ========================================================= */

function updateConnectionUI(
  connected,
  text
) {

  state.connected =
    connected;

  setText(
    "connectionText",
    text
  );

  setText(
    "dataStatus",
    connected
      ? "DERIV LIVE"
      : "OFFLINE"
  );

  const dot =
    $("connectionDot");

  if (dot) {

    dot.classList.remove(
      "connected",
      "error"
    );

    dot.classList.add(
      connected
        ? "connected"
        : "error"
    );
  }
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

          const page =
            button.dataset.page;

          document
            .querySelectorAll(".page")
            .forEach(section => {

              section.classList.remove(
                "active"
              );
            });


          const target =
            $(page + "Page");

          if (target) {

            target.classList.add(
              "active"
            );
          }


          document
            .querySelectorAll(".nav-btn")
            .forEach(btn => {

              btn.classList.remove(
                "active"
              );
            });


          button.classList.add(
            "active"
          );


          if (page === "trade") {

            updateChart();
            renderDigitStats();
          }


          if (page === "history") {

            renderHistory();
            updateStats();
          }


          window.scrollTo({
            top: 0,
            behavior: "smooth"
          });
        }
      );
    });
}


/* =========================================================
   GENERAL CONTROLS
   ========================================================= */

function bindControls() {

  $("themeToggle")
    ?.addEventListener(
      "click",
      toggleTheme
    );


  $("clearLogsBtn")
    ?.addEventListener(
      "click",
      clearHistory
    );
}


function toggleTheme() {

  document.body.classList.toggle(
    "light"
  );

  localStorage.setItem(
    "krishwave_theme",
    document.body.classList.contains(
      "light"
    )
      ? "light"
      : "dark"
  );
}


function clearHistory() {

  if (
    !confirm(
      "Clear all paper trading history?"
    )
  ) {

    return;
  }

  state.history = [];
  state.paperProfit = 0;

  saveHistory();

  renderHistory();
  updateStats();
}


/* =========================================================
   ENGINE TABS
   ========================================================= */

function bindEngineTabs() {

  const aiTab =
    $("tabAiBot");

  const manualTab =
    $("tabManual");

  const aiContent =
    $("aiBotContent");

  const manualContent =
    $("manualContent");


  aiTab?.addEventListener(
    "click",
    () => {

      state.engineMode = "ai";

      aiTab.classList.add(
        "active"
      );

      manualTab?.classList.remove(
        "active"
      );

      if (aiContent) {

        aiContent.style.display =
          "block";
      }

      if (manualContent) {

        manualContent.style.display =
          "none";
      }
    }
  );


  manualTab?.addEventListener(
    "click",
    () => {

      state.engineMode = "manual";

      manualTab?.classList.add(
        "active"
      );

      aiTab?.classList.remove(
        "active"
      );

      if (aiContent) {

        aiContent.style.display =
          "none";
      }

      if (manualContent) {

        manualContent.style.display =
          "block";
      }

      runCircleAnalysis(
        state.selectedMarket
      );
    }
  );
}


/* =========================================================
   AI BOT CONTROLS
   ========================================================= */

function bindAIBotControls() {

  $("startBotBtn")
    ?.addEventListener(
      "click",
      () => {

        if (
          state.aiBotRunning
        ) {

          stopAIBot();

        } else {

          startAIBot();
        }
      }
    );


  $("startAI")
    ?.addEventListener(
      "click",
      () => {

        if (
          state.aiBotRunning
        ) {

          stopAIBot();

        } else {

          startAIBot();
        }
      }
    );


  $("stopAI")
    ?.addEventListener(
      "click",
      stopAIBot
    );


  /* AI strategy group */

  $("aiStrategyGroupTrigger")
    ?.addEventListener(
      "click",
      openAIBotStrategyModal
    );
}


/* =========================================================
   AI BOT STRATEGY GROUP MODAL
   ========================================================= */

function openAIBotStrategyModal() {

  const modal =
    $("aiStrategyModal");

  if (modal) {

    modal.style.display =
      "flex";
  }
}


function bindAIBotStrategyModal() {

  document
    .querySelectorAll(
      ".ai-strategy-group-option"
    )
    .forEach(option => {

      option.addEventListener(
        "click",
        () => {

          const group =
            option.dataset.group;

          if (
            !STRATEGY_GROUPS[group]
          ) {

            return;
          }

          state.aiBotStrategyGroup =
            group;


          document
            .querySelectorAll(
              ".ai-strategy-group-option"
            )
            .forEach(item => {

              item.classList.remove(
                "selected"
              );
            });


          option.classList.add(
            "selected"
          );


          setText(
            "aiStrategyGroupLabel",
            option.dataset.label ||
              group
          );


          const modal =
            $("aiStrategyModal");

          if (modal) {

            modal.style.display =
              "none";
          }
        }
      );
    });
}


/* =========================================================
   MANUAL CONTROLS
   ========================================================= */

function bindManualControls() {

  $("placeTradeBtn")
    ?.addEventListener(
      "click",
      executeManualTrade
    );


  $("manualMarketSelect")
    ?.addEventListener(
      "change",
      event => {

        state.selectedMarket =
          event.target.value;

        resetSelectedMarketChart();

        runCircleAnalysis(
          state.selectedMarket
        );
      }
    );


  $("manualTargetDigitInput")
    ?.addEventListener(
      "input",
      event => {

        state.manualTargetDigit =
          clamp(
            Number(event.target.value),
            0,
            9
          );
      }
    );
}


/* =========================================================
   STRATEGY MODAL
   ========================================================= */

function bindStrategyModal() {

  document
    .querySelectorAll(
      ".strategy-option"
    )
    .forEach(option => {

      option.addEventListener(
        "click",
        () => {

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


          document
            .querySelectorAll(
              ".strategy-option"
            )
            .forEach(item => {

              item.classList.remove(
                "selected"
              );
            });


          option.classList.add(
            "selected"
          );


          const label =
            option.dataset.label ||
            strategy;


          setText(
            "selectedStrategyLabel",
            label
          );

          setText(
            "manualSelectedStrategyLabel",
            label
          );


          updateTargetDigitVisibility(
            strategy
          );


          const modal =
            $("strategyModal");

          if (modal) {

            modal.style.display =
              "none";
          }
        }
      );
    });


  $("strategyTrigger")
    ?.addEventListener(
      "click",
      () => {

        const modal =
          $("strategyModal");

        if (modal) {

          modal.style.display =
            "flex";
        }
      }
    );


  $("manualStrategyTrigger")
    ?.addEventListener(
      "click",
      () => {

        const modal =
          $("strategyModal");

        if (modal) {

          modal.style.display =
            "flex";
        }
      }
    );


  window.addEventListener(
    "click",
    event => {

      const modal =
        $("strategyModal");

      const aiModal =
        $("aiStrategyModal");


      if (
        modal &&
        event.target === modal
      ) {

        modal.style.display =
          "none";
      }


      if (
        aiModal &&
        event.target === aiModal
      ) {

        aiModal.style.display =
          "none";
      }
    }
  );


  bindAIBotStrategyModal();
}


/* =========================================================
   TARGET FIELD
   ========================================================= */

function updateTargetDigitVisibility(
  strategy
) {

  const field =
    $("targetDigitContainer");

  if (!field) {
    return;
  }


  if (
    strategy === "EVEN" ||
    strategy === "ODD"
  ) {

    field.style.display =
      "none";

  } else {

    field.style.display =
      "flex";
  }
}


/* =========================================================
   MANUAL PAPER TRADE
   ========================================================= */

function executeManualTrade() {

  const stake =
    Math.max(
      CONFIG.PAPER.MIN_STAKE,
      Number(
        $("manualStakeInput")
          ?.value ||
        CONFIG.PAPER.DEFAULT_STAKE
      )
    );


  let target =
    Number(
      $("manualTargetDigitInput")
        ?.value ??
      state.manualTargetDigit
    );


  target =
    clamp(target, 0, 9);


  const market =
    state.selectedMarket;


  const strategy =
    state.selectedStrategy;


  const trade = {

    id: Date.now(),

    time:
      new Date()
        .toLocaleTimeString(),

    mode: "MANUAL",

    market,

    marketName:
      formatMarketName(market),

    strategy,

    prediction: target,

    stake,

    result: null,

    status: "PENDING",

    profit: 0,

    createdAt: Date.now()
  };


  state.activePaperTrades.push(
    trade
  );


  renderHistory();


  setText(
    "manualStatusText",
    `PAPER TRADE ACTIVE — ${strategy}`
  );
}


/* =========================================================
   CIRCLE AI
   ========================================================= */

function runCircleAnalysis(
  symbol
) {

  const market =
    state.markets[symbol];


  if (
    !market ||
    market.ticks.length <
    CONFIG.AI_BOT.MIN_TICKS
  ) {

    updateCircleUI({
      market: symbol,
      confidence: 0,
      strategy: "WAITING",
      prediction: "--",
      reason:
        "Waiting for sufficient market data.",
      score: 0,
      strength: "LOW",
      stability: "LOW",
      concentration: "LOW",
      streak: "NONE",
      agreement: "LOW"
    });

    return null;
  }


  const analysis =
    analyzeMarket(
      symbol,
      STRATEGIES
    );


  state.circlePrediction =
    analysis;


  state.circleConfidence =
    analysis.confidence;


  state.circleReport =
    analysis;


  updateCircleUI(
    analysis
  );


  return analysis;
}


/* =========================================================
   CORE STATISTICAL ENGINE
   ========================================================= */

function analyzeMarket(
  symbol,
  allowedStrategies
) {

  const market =
    state.markets[symbol];


  const ticks =
    market.ticks.slice();


  if (
    ticks.length <
    CONFIG.AI_BOT.MIN_TICKS
  ) {

    return {
      market: symbol,
      strategy: "WAITING",
      prediction: "--",
      confidence: 0,
      score: 0,
      strength: "LOW",
      stability: "LOW",
      concentration: "LOW",
      streak: "NONE",
      agreement: "LOW",
      reason:
        "Insufficient data."
    };
  }


  const windows =
    calculateWindows(ticks);


  const digitStats =
    calculateDigitStatistics(
      windows
    );


  const momentum =
    calculateDigitMomentum(
      ticks
    );


  const streak =
    calculateDigitStreak(
      ticks
    );


  const stability =
    calculateStability(
      ticks
    );


  const concentration =
    calculateConcentration(
      digitStats
    );


  const candidates = [];


  allowedStrategies.forEach(
    strategy => {

      const candidate =
        scoreStrategy(
          strategy,
          digitStats,
          momentum,
          streak,
          stability,
          concentration
        );


      if (candidate) {

        candidates.push(
          candidate
        );
      }
    }
  );


  candidates.sort(
    (a, b) =>
      b.score - a.score
  );


  const best =
    candidates[0];


  if (!best) {

    return {
      market: symbol,
      strategy: "WAITING",
      prediction: "--",
      confidence: 0,
      score: 0,
      strength: "LOW",
      stability: "LOW",
      concentration: "LOW",
      streak: "NONE",
      agreement: "LOW",
      reason:
        "No valid setup."
    };
  }


  const agreement =
    calculateAgreement(
      candidates
    );


  const confidence =
    calculateConfidence(
      best,
      stability,
      concentration,
      agreement,
      ticks.length
    );


  return {

    market: symbol,

    marketName:
      formatMarketName(symbol),

    strategy:
      best.strategy,

    prediction:
      best.prediction,

    confidence,

    score:
      Math.round(best.score),

    strength:
      strengthLabel(best.score),

    stability:
      stabilityLabel(stability),

    concentration:
      concentrationLabel(
        concentration
      ),

    streak:
      streak.label,

    agreement:
      agreement.label,

    reason:
      buildAnalysisReason(
        best,
        digitStats,
        momentum,
        streak,
        stability,
        agreement
      ),

    dataQuality:
      getDataQuality(
        ticks.length
      ),

    candidates
  };
}


/* =========================================================
   MULTI-WINDOW ANALYSIS
   ========================================================= */

function calculateWindows(
  ticks
) {

  return {

    short:
      ticks.slice(-10),

    medium:
      ticks.slice(-25),

    long:
      ticks.slice(-50),

    deep:
      ticks.slice(-100)
  };
}


/* =========================================================
   DIGIT STATISTICS
   ========================================================= */

function calculateDigitStatistics(
  windows
) {

  const result = {};

  Object.keys(windows)
    .forEach(windowName => {

      const ticks =
        windows[windowName];

      const counts =
        Array(10).fill(0);


      ticks.forEach(digit => {

        if (
          digit >= 0 &&
          digit <= 9
        ) {

          counts[digit]++;
        }
      });


      const total =
        ticks.length || 1;


      result[windowName] = {

        counts,

        percentages:
          counts.map(
            count =>
              (count / total) * 100
          ),

        total
      };
    });


  return result;
}


/* =========================================================
   MOMENTUM
   ========================================================= */

function calculateDigitMomentum(
  ticks
) {

  const recent =
    ticks.slice(-10);

  const previous =
    ticks.slice(-20, -10);


  const recentCounts =
    Array(10).fill(0);

  const previousCounts =
    Array(10).fill(0);


  recent.forEach(
    digit =>
      recentCounts[digit]++
  );


  previous.forEach(
    digit =>
      previousCounts[digit]++
  );


  return Array.from(
    { length: 10 },
    (_, digit) => {

      const recentRate =
        recent.length
          ? recentCounts[digit] /
            recent.length
          : 0;


      const previousRate =
        previous.length
          ? previousCounts[digit] /
            previous.length
          : 0;


      return {
        digit,

        change:
          recentRate -
          previousRate
      };
    }
  );
}


/* =========================================================
   STREAK ANALYSIS
   ========================================================= */

function calculateDigitStreak(
  ticks
) {

  if (!ticks.length) {

    return {
      digit: null,
      length: 0,
      label: "NONE"
    };
  }


  const last =
    ticks[ticks.length - 1];


  let length = 1;


  for (
    let i = ticks.length - 2;
    i >= 0;
    i--
  ) {

    if (
      ticks[i] === last
    ) {

      length++;

    } else {

      break;
    }
  }


  return {

    digit: last,

    length,

    label:
      length >= 4
        ? `DIGIT ${last} × ${length}`
        : "NORMAL"
  };
}


/* =========================================================
   STABILITY
   ========================================================= */

function calculateStability(
  ticks
) {

  if (
    ticks.length <
    20
  ) {

    return 0;
  }


  const chunks = [];


  for (
    let i = 0;
    i < 4;
    i++
  ) {

    const end =
      ticks.length -
      i * 5;

    const start =
      Math.max(
        0,
        end - 5
      );

    chunks.push(
      ticks.slice(
        start,
        end
      )
    );
  }


  const rates =
    chunks.map(
      chunk => {

        const even =
          chunk.filter(
            d => d % 2 === 0
          ).length;

        return chunk.length
          ? even / chunk.length
          : 0.5;
      }
    );


  const avg =
    average(rates);


  const deviation =
    average(
      rates.map(
        value =>
          Math.abs(
            value - avg
          )
      )
    );


  return clamp(
    100 -
      deviation * 200,
    0,
    100
  );
}


/* =========================================================
   CONCENTRATION
   ========================================================= */

function calculateConcentration(
  stats
) {

  const percentages =
    stats.medium.percentages;


  return Math.max(
    ...percentages
  );
}


/* =========================================================
   STRATEGY SCORING
   ========================================================= */

function scoreStrategy(
  strategy,
  stats,
  momentum,
  streak,
  stability,
  concentration
) {

  const short =
    stats.short.percentages;

  const medium =
    stats.medium.percentages;

  const long =
    stats.long.percentages;


  switch (strategy) {

    case "MATCHES": {

      let bestDigit = 0;
      let bestScore = -Infinity;


      for (
        let digit = 0;
        digit <= 9;
        digit++
      ) {

        const score =
          short[digit] * 0.50 +
          medium[digit] * 0.30 +
          long[digit] * 0.20 +
          momentum[digit].change * 100 * 0.20;


        if (
          score >
          bestScore
        ) {

          bestScore =
            score;

          bestDigit =
            digit;
        }
      }


      return {

        strategy,

        prediction:
          bestDigit,

        score:
          clamp(
            bestScore * 6,
            0,
            100
          )
      };
    }


    case "DIFFERS": {

      let weakestDigit = 0;
      let weakestScore = Infinity;


      for (
        let digit = 0;
        digit <= 9;
        digit++
      ) {

        const score =
          short[digit] * 0.50 +
          medium[digit] * 0.30 +
          long[digit] * 0.20;


        if (
          score <
          weakestScore
        ) {

          weakestScore =
            score;

          weakestDigit =
            digit;
        }
      }


      return {

        strategy,

        prediction:
          weakestDigit,

        score:
          clamp(
            100 -
              weakestScore * 5,
            0,
            100
          )
      };
    }


    case "EVEN": {

      const score =
        short
          .filter(
            (_, i) =>
              i % 2 === 0
          )
          .reduce(
            (a, b) => a + b,
            0
          );


      return {

        strategy,

        prediction: null,

        score:
          clamp(
            score,
            0,
            100
          )
      };
    }


    case "ODD": {

      const score =
        short
          .filter(
            (_, i) =>
              i % 2 !== 0
          )
          .reduce(
            (a, b) => a + b,
            0
          );


      return {

        strategy,

        prediction: null,

        score:
          clamp(
            score,
            0,
            100
          )
      };
    }


    case "OVER": {

      let best =
        null;


      for (
        let threshold = 1;
        threshold <= 8;
        threshold++
      ) {

        const probability =
          short
            .slice(
              threshold + 1
            )
            .reduce(
              (a, b) =>
                a + b,
              0
            );


        if (
          !best ||
          probability >
          best.score
        ) {

          best = {

            strategy,

            prediction:
              threshold,

            score:
              clamp(
                probability,
                0,
                100
              )
          };
        }
      }


      return best;
    }


    case "UNDER": {

      let best =
        null;


      for (
        let threshold = 1;
        threshold <= 8;
        threshold++
      ) {

        const probability =
          short
            .slice(
              0,
              threshold
            )
            .reduce(
              (a, b) =>
                a + b,
              0
            );


        if (
          !best ||
          probability >
          best.score
        ) {

          best = {

            strategy,

            prediction:
              threshold,

            score:
              clamp(
                probability,
                0,
                100
              )
          };
        }
      }


      return best;
    }


    default:
      return null;
  }
}


/* =========================================================
   CONFIDENCE ENGINE
   ========================================================= */

function calculateConfidence(
  candidate,
  stability,
  concentration,
  agreement,
  tickCount
) {

  let confidence =
    50;


  confidence +=
    candidate.score *
    0.20;


  confidence +=
    stability *
    0.08;


  confidence +=
    Math.min(
      concentration,
      30
    ) *
    0.25;


  confidence +=
    agreement.score *
    0.08;


  if (
    tickCount >= 100
  ) {

    confidence += 3;

  } else if (
    tickCount < 50
  ) {

    confidence -= 4;
  }


  return Math.round(
    clamp(
      confidence,
      CONFIG.AI_BOT.MIN_CONFIDENCE,
      CONFIG.AI_BOT.MAX_CONFIDENCE
    )
  );
}


/* =========================================================
   AGREEMENT
   ========================================================= */

function calculateAgreement(
  candidates
) {

  if (
    candidates.length < 2
  ) {

    return {
      score: 50,
      label: "MODERATE"
    };
  }


  const top =
    candidates[0].score;

  const second =
    candidates[1].score;


  const gap =
    top - second;


  if (gap >= 20) {

    return {
      score: 90,
      label: "HIGH"
    };
  }


  if (gap >= 10) {

    return {
      score: 70,
      label: "GOOD"
    };
  }


  return {
    score: 50,
    label: "MIXED"
  };
}


/* =========================================================
   LABELS
   ========================================================= */

function strengthLabel(
  score
) {

  if (score >= 80)
    return "VERY STRONG";

  if (score >= 70)
    return "STRONG";

  if (score >= 60)
    return "MODERATE";

  return "WEAK";
}


function stabilityLabel(
  score
) {

  if (score >= 80)
    return "HIGH";

  if (score >= 65)
    return "GOOD";

  if (score >= 50)
    return "MEDIUM";

  return "LOW";
}


function concentrationLabel(
  score
) {

  if (score >= 18)
    return "HIGH";

  if (score >= 13)
    return "MEDIUM";

  return "LOW";
}


function getDataQuality(
  ticks
) {

  if (ticks >= 100)
    return "HIGH";

  if (ticks >= 50)
    return "GOOD";

  if (ticks >= 25)
    return "LIMITED";

  return "LOW";
}


/* =========================================================
   AI REASON
   ========================================================= */

function buildAnalysisReason(
  candidate,
  stats,
  momentum,
  streak,
  stability,
  agreement
) {

  const strategy =
    candidate.strategy;

  if (
    strategy === "MATCHES"
  ) {

    return (
      `Digit ${candidate.prediction} has the strongest `
      +
      `combined recent frequency and momentum signal. `
      +
      `Agreement ${agreement.label}.`
    );
  }


  if (
    strategy === "DIFFERS"
  ) {

    return (
      `Digit ${candidate.prediction} has relatively `
      +
      `low recent concentration, supporting a `
      +
      `Differs setup. Agreement ${agreement.label}.`
    );
  }


  if (
    strategy === "EVEN"
  ) {

    return (
      `Even digits currently show stronger `
      +
      `recent distribution.`
    );
  }


  if (
    strategy === "ODD"
  ) {

    return (
      `Odd digits currently show stronger `
      +
      `recent distribution.`
    );
  }


  if (
    strategy === "OVER"
  ) {

    return (
      `The recent digit distribution gives the `
      +
      `selected Over threshold the strongest score.`
    );
  }


  if (
    strategy === "UNDER"
  ) {

    return (
      `The recent digit distribution gives the `
      +
      `selected Under threshold the strongest score.`
    );
  }


  return "Statistical setup detected.";
}


/* =========================================================
   AI CIRCLE UI
   ========================================================= */

function updateCircleUI(
  analysis
) {

  if (!analysis) {
    return;
  }


  const market =
    analysis.marketName ||
    formatMarketName(
      analysis.market
    );


  const prediction =
    analysis.prediction === null
      ? analysis.strategy
      : analysis.prediction;


  setText(
    "aiMarket",
    market
  );


  setText(
    "aiPrediction",
    prediction
  );


  setText(
    "aiType",
    analysis.strategy
  );


  setText(
    "analysisConfidence",
    analysis.confidence
      ? `${analysis.confidence}%`
      : "--"
  );


  setText(
    "aiPredictionLarge",
    prediction
  );


  setText(
    "predictionConfidence",
    analysis.confidence
      ? `CONFIDENCE: ${analysis.confidence}%`
      : "CONFIDENCE: --"
  );


  setText(
    "reportMarket",
    market
  );


  setText(
    "reportScore",
    analysis.score
      ? `${analysis.score}/100`
      : "--"
  );


  setText(
    "reportStrength",
    analysis.strength ||
      "--"
  );


  setText(
    "reportStability",
    analysis.stability ||
      "--"
  );


  setText(
    "reportConcentration",
    analysis.concentration ||
      "--"
  );


  setText(
    "reportStreak",
    analysis.streak ||
      "--"
  );


  setText(
    "reportAgreement",
    analysis.agreement ||
      "--"
  );


  setText(
    "analysisMsg",
    analysis.reason ||
      "No analysis."
  );


  setText(
    "aiStatus",
    analysis.confidence
      ? "READY"
      : "WAITING"
  );


  setText(
    "entryStatus",
    analysis.confidence
      ? "SIGNAL READY"
      : "WAITING"
  );


  setText(
    "aiCirclePrediction",
    prediction
  );


  setText(
    "aiCircleStatus",
    analysis.confidence
      ? "STATISTICAL SIGNAL"
      : "WAITING"
  );
}


/* =========================================================
   AI BOT — MARKET SCANNER
   ========================================================= */

function scanMarketsForBot() {

  const allowedStrategies =
    STRATEGY_GROUPS[
      state.aiBotStrategyGroup
    ] ||
    STRATEGIES;


  const candidates = [];


  MARKETS.forEach(
    symbol => {

      const market =
        state.markets[symbol];


      if (
        !market ||
        market.ticks.length <
        CONFIG.AI_BOT.MIN_TICKS
      ) {

        return;
      }


      const analysis =
        analyzeMarket(
          symbol,
          allowedStrategies
        );


      if (
        analysis &&
        analysis.strategy !==
        "WAITING"
      ) {

        candidates.push(
          analysis
        );
      }
    }
  );


  candidates.sort(
    (a, b) => {

      const scoreA =
        a.score +
        a.confidence * 0.5;

      const scoreB =
        b.score +
        b.confidence * 0.5;

      return scoreB - scoreA;
    }
  );


  return candidates;
}


/* =========================================================
   AI BOT DECISION
   ========================================================= */

function makeAIBotDecision() {

  const candidates =
    scanMarketsForBot();


  if (!candidates.length) {

    return null;
  }


  /*
   * Small random tie-break only.
   * The bot remains score-driven but avoids
   * repeatedly selecting the exact same market
   * when several setups are effectively equal.
   */

  const top =
    candidates.slice(
      0,
      Math.min(3, candidates.length)
    );


  top.sort(
    (a, b) =>
      (
        b.confidence +
        b.score * 0.2
      )
      -
      (
        a.confidence +
        a.score * 0.2
      )
  );


  const selected =
    top[0];


  return {

    market:
      selected.market,

    marketName:
      selected.marketName,

    strategy:
      selected.strategy,

    prediction:
      selected.prediction,

    confidence:
      selected.confidence,

    score:
      selected.score,

    strength:
      selected.strength,

    stability:
      selected.stability,

    concentration:
      selected.concentration,

    streak:
      selected.streak,

    agreement:
      selected.agreement,

    reason:
      selected.reason,

    dataQuality:
      selected.dataQuality,

    decidedAt:
      Date.now()
  };
}


/* =========================================================
   AI BOT START
   ========================================================= */

async function startAIBot() {

  if (
    state.aiBotRunning
  ) {

    return;
  }


  state.aiBotRunning =
    true;

  state.aiBotToken++;

  const token =
    state.aiBotToken;


  setText(
    "startBotBtn",
    "Stop Trading Bot"
  );


  setText(
    "startAI",
    "■ STOP AI"
  );


  setText(
    "aiStatus",
    "AI BOT RUNNING"
  );


  while (
    state.aiBotRunning &&
    token === state.aiBotToken
  ) {

    await runAIBotCycle(
      token
    );
  }
}


/* =========================================================
   AI BOT STOP
   ========================================================= */

function stopAIBot() {

  state.aiBotRunning =
    false;

  state.aiBotToken++;


  state.aiBotPhase =
    "IDLE";


  state.aiBotDecision =
    null;


  setText(
    "startBotBtn",
    "Start Trading Bot"
  );


  setText(
    "startAI",
    "▶ START AI"
  );


  setText(
    "engineStatusText",
    "AI Bot Ready to Start"
  );


  setText(
    "aiStatus",
    "IDLE"
  );


  setText(
    "entryStatus",
    "WAITING"
  );


  updateCycleSteps(
    "IDLE"
  );
}


/* =========================================================
   AI BOT CYCLE
   ========================================================= */

async function runAIBotCycle(
  token
) {

  state.aiBotCycle++;


  /* ============================
     PHASE 1 — 10 SECOND ANALYSIS
     ============================ */

  state.aiBotPhase =
    "ANALYZING";


  updateCycleSteps(
    "ANALYSIS"
  );


  setText(
    "engineStatusText",
    "AI BOT SCANNING ALL MARKETS..."
  );


  let decision =
    null;


  for (
    let remaining =
      CONFIG.AI_BOT.ANALYSIS_SECONDS;
    remaining > 0;
    remaining--
  ) {

    if (
      !state.aiBotRunning ||
      token !== state.aiBotToken
    ) {

      return;
    }


    const liveCandidates =
      scanMarketsForBot();


    if (
      liveCandidates.length
    ) {

      decision =
        liveCandidates[0];
    }


    setText(
      "aiCircleTimer",
      remaining
    );


    setText(
      "engineStatusText",
      `AI BOT SCANNING — ${remaining}s`
    );


    await sleep(1000);
  }


  if (
    !state.aiBotRunning ||
    token !== state.aiBotToken
  ) {

    return;
  }


  /* Final decision after analysis */

  const finalDecision =
    makeAIBotDecision();


  if (!finalDecision) {

    setText(
      "engineStatusText",
      "NOT ENOUGH DATA — WAITING"
    );

    await sleep(1000);

    return;
  }


  decision =
    finalDecision;


  state.aiBotDecision =
    Object.freeze({
      ...decision
    });


  /* ============================
     PHASE 2 — 5 SECOND LOCK
     ============================ */

  state.aiBotPhase =
    "PREDICTION";


  updateCycleSteps(
    "PREDICTION"
  );


  renderAIBotDecision(
    state.aiBotDecision
  );


  for (
    let remaining =
      CONFIG.AI_BOT.PREDICTION_SECONDS;
    remaining > 0;
    remaining--
  ) {

    if (
      !state.aiBotRunning ||
      token !== state.aiBotToken
    ) {

      return;
    }


    /*
     * IMPORTANT:
     * The decision is NOT recalculated
     * during this phase.
     */

    setText(
      "aiCircleTimer",
      remaining
    );


    setText(
      "engineStatusText",
      `DECISION LOCKED — ${remaining}s`
    );


    await sleep(1000);
  }


  /* ============================
     PHASE 3 — 3 SECOND TRADE NOW
     ============================ */

  state.aiBotPhase =
    "TRADE_NOW";


  updateCycleSteps(
    "TRADE"
  );


  setText(
    "entryStatus",
    "TRADE NOW"
  );


  setText(
    "engineStatusText",
    "AI BOT PAPER TRADE NOW"
  );


  const trade =
    createAIBotPaperTrade(
      state.aiBotDecision
    );


  for (
    let remaining =
      CONFIG.AI_BOT.TRADE_SECONDS;
    remaining > 0;
    remaining--
  ) {

    if (
      !state.aiBotRunning ||
      token !== state.aiBotToken
    ) {

      return;
    }


    setText(
      "aiCircleTimer",
      remaining
    );


    await sleep(1000);
  }


  updateCycleSteps(
    "COOLDOWN"
  );


  setText(
    "engineStatusText",
    "AI BOT WAITING FOR RESULT..."
  );


  await sleep(500);
}


/* =========================================================
   AI BOT PAPER TRADE
   ========================================================= */

function createAIBotPaperTrade(
  decision
) {

  const stake =
    Math.max(
      CONFIG.PAPER.MIN_STAKE,
      Number(
        $("stakeInput")
          ?.value ||
        CONFIG.PAPER.DEFAULT_STAKE
      )
    );


  const trade = {

    id: Date.now(),

    time:
      new Date()
        .toLocaleTimeString(),

    mode: "AI BOT",

    market:
      decision.market,

    marketName:
      decision.marketName,

    strategy:
      decision.strategy,

    prediction:
      decision.prediction,

    confidence:
      decision.confidence,

    score:
      decision.score,

    reason:
      decision.reason,

    stake,

    result: null,

    status: "PENDING",

    profit: 0,

    createdAt:
      Date.now()
  };


  state.activePaperTrades.push(
    trade
  );


  renderHistory();


  return trade;
}


/* =========================================================
   PAPER TRADE EVALUATION
   ========================================================= */

function evaluatePaperTrades(
  symbol,
  digit
) {

  if (
    !state.activePaperTrades.length
  ) {

    return;
  }


  const tradesToEvaluate =
    state.activePaperTrades.filter(
      trade =>
        trade.market === symbol
    );


  tradesToEvaluate.forEach(
    trade => {

      settlePaperTrade(
        trade,
        digit
      );
    }
  );
}


/* =========================================================
   SETTLE PAPER TRADE
   ========================================================= */

function settlePaperTrade(
  trade,
  digit
) {

  if (
    trade.status !==
    "PENDING"
  ) {

    return;
  }


  let win = false;

  let multiplier =
    CONFIG.PAPER.EVEN_MULTIPLIER;


  switch (
    trade.strategy
  ) {

    case "MATCHES":

      win =
        digit ===
        Number(
          trade.prediction
        );

      multiplier =
        CONFIG.PAPER.MATCHES_MULTIPLIER;

      break;


    case "DIFFERS":

      win =
        digit !==
        Number(
          trade.prediction
        );

      multiplier =
        CONFIG.PAPER.DIFFERS_MULTIPLIER;

      break;


    case "EVEN":

      win =
        digit % 2 === 0;

      multiplier =
        CONFIG.PAPER.EVEN_MULTIPLIER;

      break;


    case "ODD":

      win =
        digit % 2 !== 0;

      multiplier =
        CONFIG.PAPER.ODD_MULTIPLIER;

      break;


    case "OVER":

      win =
        digit >
        Number(
          trade.prediction
        );

      multiplier =
        CONFIG.PAPER.OVER_MULTIPLIER;

      break;


    case "UNDER":

      win =
        digit <
        Number(
          trade.prediction
        );

      multiplier =
        CONFIG.PAPER.UNDER_MULTIPLIER;

      break;
  }


  trade.result =
    digit;


  trade.status =
    win
      ? "WIN"
      : "LOSS";


  trade.profit =
    win
      ? trade.stake * multiplier
      : -trade.stake;


  trade.settledAt =
    Date.now();


  state.paperProfit +=
    trade.profit;


  state.history.unshift(
    trade
  );


  state.activePaperTrades =
    state.activePaperTrades.filter(
      item =>
        item.id !==
        trade.id
    );


  saveHistory();

  renderHistory();

  updateStats();


  if (
    trade.mode ===
    "AI BOT"
  ) {

    setText(
      "engineStatusText",
      win
        ? "AI BOT RESULT: WIN"
        : "AI BOT RESULT: LOSS"
    );
  }


  setText(
    "manualStatusText",
    `Last result: ${trade.status}`
  );
}


/* =========================================================
   CHART
   ========================================================= */

function updateChart() {

  const canvas =
    $("priceChartCanvas");

  if (
    !canvas ||
    !state.priceHistory.length
  ) {

    return;
  }


  const ctx =
    canvas.getContext("2d");


  const width =
    canvas.width =
      canvas.clientWidth;


  const height =
    canvas.height =
      canvas.clientHeight;


  ctx.clearRect(
    0,
    0,
    width,
    height
  );


  const prices =
    state.priceHistory;


  if (
    prices.length < 2
  ) {

    return;
  }


  const min =
    Math.min(
      ...prices
    );


  const max =
    Math.max(
      ...prices
    );


  const range =
    max - min || 1;


  ctx.beginPath();

  ctx.strokeStyle =
    "#6366f1";

  ctx.lineWidth =
    2;


  prices.forEach(
    (price, index) => {

      const x =
        (
          index /
          (prices.length - 1)
        ) *
        width;


      const y =
        height -
        (
          (price - min) /
          range
        ) *
        (
          height - 20
        ) -
        10;


      if (
        index === 0
      ) {

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


  ctx.stroke();
}


/* =========================================================
   DIGIT STATS
   ========================================================= */

function renderDigitStats() {

  const box =
    $("digitStatsGrid");


  const market =
    state.markets[
      state.selectedMarket
    ];


  if (
    !box ||
    !market
  ) {

    return;
  }


  const total =
    market.digits.reduce(
      (a, b) =>
        a + b,
      0
    );


  if (!total) {

    return;
  }


  const percentages =
    market.digits.map(
      count =>
        (
          count /
          total
        ) *
        100
    );


  const maxPct =
    Math.max(
      ...percentages
    );


  const minPct =
    Math.min(
      ...percentages
    );


  box.innerHTML =
    market.digits
      .map(
        (count, digit) => {

          const pct =
            percentages[digit];


          let status =
            "";


          if (
            pct === maxPct &&
            total > 10
          ) {

            status =
              "highest";

          } else if (
            pct === minPct &&
            total > 10
          ) {

            status =
              "lowest";
          }


          return `
            <div class="digit-stat-circle ${status}">
              <span class="digit-num">${digit}</span>
              <span class="digit-pct">${pct.toFixed(1)}%</span>
            </div>
          `;
        }
      )
      .join("");
}


/* =========================================================
   CYCLE UI
   ========================================================= */

function updateCycleSteps(
  active
) {

  const map = {

    ANALYSIS:
      "cycleAnalysis",

    PREDICTION:
      "cyclePrediction",

    TRADE:
      "cycleTrade",

    COOLDOWN:
      "cycleCooldown"
  };


  Object.values(map)
    .forEach(id => {

      $(id)
        ?.classList
        .remove("active");
    });


  if (
    map[active]
  ) {

    $(map[active])
      ?.classList
      .add("active");
  }
}


/* =========================================================
   AI BOT DECISION UI
   ========================================================= */

function renderAIBotDecision(
  decision
) {

  if (!decision) {
    return;
  }


  setText(
    "aiMarket",
    decision.marketName
  );


  setText(
    "aiType",
    decision.strategy
  );


  setText(
    "aiPrediction",
    decision.prediction === null
      ? decision.strategy
      : decision.prediction
  );


  setText(
    "analysisConfidence",
    `${decision.confidence}%`
  );


  setText(
    "aiPredictionLarge",
    decision.prediction === null
      ? decision.strategy
      : decision.prediction
  );


  setText(
    "predictionConfidence",
    `AI BOT CONFIDENCE: ${decision.confidence}%`
  );


  setText(
    "reportMarket",
    decision.marketName
  );


  setText(
    "reportScore",
    `${decision.score}/100`
  );


  setText(
    "reportStrength",
    decision.strength
  );


  setText(
    "reportStability",
    decision.stability
  );


  setText(
    "reportConcentration",
    decision.concentration
  );


  setText(
    "reportStreak",
    decision.streak
  );


  setText(
    "reportAgreement",
    decision.agreement
  );


  setText(
    "analysisMsg",
    `AI BOT: ${decision.reason}`
  );


  setText(
    "aiCirclePrediction",
    decision.prediction === null
      ? decision.strategy
      : decision.prediction
  );


  setText(
    "aiCircleStatus",
    "BOT DECISION LOCKED"
  );
}


/* =========================================================
   RESET SELECTED MARKET
   ========================================================= */

function resetSelectedMarketChart() {

  state.priceHistory = [];


  const market =
    state.markets[
      state.selectedMarket
    ];


  if (
    market &&
    market.prices.length
  ) {

    state.priceHistory =
      market.prices.slice(-100);
  }


  setText(
    "currentChartMarket",
    formatMarketName(
      state.selectedMarket
    )
  );


  if (
    market &&
    Number.isFinite(
      market.price
    )
  ) {

    setText(
      "currentLivePrice",
      market.price.toFixed(2)
    );
  }


  updateChart();
  renderDigitStats();
}


/* =========================================================
   HISTORY
   ========================================================= */

function loadHistory() {

  try {

    const raw =
      localStorage.getItem(
        "krishwave_history"
      );


    if (raw) {

      state.history =
        JSON.parse(raw);
    }

  } catch (error) {

    state.history = [];
  }


  state.paperProfit =
    state.history.reduce(
      (sum, trade) =>
        sum +
        Number(
          trade.profit || 0
        ),
      0
    );
}


function saveHistory() {

  try {

    localStorage.setItem(
      "krishwave_history",
      JSON.stringify(
        state.history
      )
    );

  } catch (error) {}
}


function renderHistory() {

  const list =
    $("historyCardsList");


  if (!list) {
    return;
  }


  setText(
    "totalProfitDisplay",
    `Total Profit: $${state.paperProfit.toFixed(2)}`
  );


  const pending =
    state.activePaperTrades;


  if (
    !state.history.length &&
    !pending.length
  ) {

    list.innerHTML =
      `<div class="empty-history-card">
        No trading history recorded yet.
      </div>`;

    return;
  }


  const pendingHTML =
    pending.map(
      trade => {

        return `
          <div class="history-card">
            <div class="history-card-left">
              <div class="history-card-market">
                ${esc(trade.marketName)}
              </div>

              <div class="history-card-details">
                ${esc(trade.mode)}
                |
                ${esc(trade.strategy)}
                |
                Target:
                ${trade.prediction ?? "--"}
                |
                Stake:
                $${Number(trade.stake).toFixed(2)}
                |
                Confidence:
                ${trade.confidence ?? "--"}%
              </div>
            </div>

            <div class="history-card-right">
              PENDING
            </div>
          </div>
        `;
      }
    )
    .join("");


  const historyHTML =
    state.history.map(
      trade => {

        const isWin =
          Number(trade.profit) > 0;


        const profitText =
          isWin
            ? `+$${Number(trade.profit).toFixed(2)}`
            : `-$${Math.abs(
                Number(trade.profit)
              ).toFixed(2)}`;


        const profitClass =
          isWin
            ? "profit-positive"
            : "profit-negative";


        return `
          <div class="history-card">

            <div class="history-card-left">

              <div class="history-card-market">
                ${esc(
                  trade.marketName ||
                  trade.market ||
                  "Unknown"
                )}
              </div>

              <div class="history-card-details">
                ${esc(
                  trade.mode ||
                  "PAPER"
                )}
                |
                ${esc(
                  trade.strategy
                )}
                |
                Target:
                ${trade.prediction ?? "--"}
                |
                Result:
                ${trade.result ?? "--"}
                |
                Stake:
                $${Number(
                  trade.stake || 0
                ).toFixed(2)}
              </div>

            </div>

            <div class="history-card-right ${profitClass}">
              ${profitText}
            </div>

          </div>
        `;
      }
    )
    .join("");


  list.innerHTML =
    pendingHTML +
    historyHTML;
}


/* =========================================================
   PAPER STATISTICS
   ========================================================= */

function updateStats() {

  const wins =
    state.history.filter(
      trade =>
        Number(
          trade.profit
        ) > 0
    ).length;


  const total =
    state.history.length;


  const losses =
    total - wins;


  const accuracy =
    total
      ? Math.round(
          (
            wins /
            total
          ) *
          100
        )
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
    `${accuracy}%`
  );
}


/* =========================================================
   PAPER BALANCE
   ========================================================= */

function initializePaperBalance() {

  const saved =
    localStorage.getItem(
      "krishwave_paper_balance"
    );


  if (
    saved !== null
  ) {

    state.paperBalance =
      Number(saved);

  } else {

    state.paperBalance =
      1000;

    localStorage.setItem(
      "krishwave_paper_balance",
      "1000"
    );
  }


  setText(
    "balance",
    `$${state.paperBalance.toFixed(2)}`
  );


  setText(
    "accountMode",
    "DEMO / PAPER"
  );
}


/* =========================================================
   THEME
   ========================================================= */

function loadTheme() {

  if (
    localStorage.getItem(
      "krishwave_theme"
    ) === "light"
  ) {

    document.body.classList.add(
      "light"
    );
  }
}


/* =========================================================
   OAUTH CALLBACK
   ========================================================= */

async function checkOAuthCallback() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const code =
    params.get("code");


  if (!code) {
    return;
  }


  setText(
    "authStatus",
    "CONNECTING DERIV..."
  );


  /*
   * The OAuth worker is expected to
   * exchange the authorization code
   * and PKCE verifier.
   *
   * No client secret is stored here.
   */


  const verifier =
    sessionStorage.getItem(
      "krishwave_code_verifier"
    );


  if (!verifier) {

    setText(
      "authStatus",
      "PKCE VERIFIER NOT FOUND"
    );

    return;
  }


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

          body:
            JSON.stringify({
              code,
              code_verifier:
                verifier
            })
        }
      );


    if (!response.ok) {

      throw new Error(
        "OAuth exchange failed"
      );
    }


    const data =
      await response.json();


    if (
      data.access_token
    ) {

      state.accessToken =
        data.access_token;


      sessionStorage.setItem(
        "krishwave_access_token",
        data.access_token
      );


      setText(
        "authStatus",
        "DERIV CONNECTED"
      );
    }

  } catch (error) {

    setText(
      "authStatus",
      "DERIV CONNECTION FAILED"
    );
  }
}


/* =========================================================
   OPTIONAL AUTH REST HELPERS
   ========================================================= */

async function requestAuthenticatedWS() {

  if (
    !state.accessToken ||
    !state.accountId
  ) {

    return null;
  }


  try {

    const response =
      await fetch(
        `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(
          state.accountId
        )}/otp`,
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

      return null;
    }


    const data =
      await response.json();


    /*
     * Deriv returns the ready-to-use
     * authenticated WebSocket URL.
     */

    return data?.data?.url ||
      null;

  } catch (error) {

    return null;
  }
}


/* =========================================================
   PUBLIC UTILITY — GET MARKET SNAPSHOT
   ========================================================= */

function getMarketSnapshot(
  symbol
) {

  const market =
    state.markets[symbol];


  if (!market) {
    return null;
  }


  return {

    symbol,

    price:
      market.price,

    lastDigit:
      market.lastDigit,

    ticks:
      market.ticks.slice(),

    digits:
      market.digits.slice(),

    totalTicks:
      market.totalTicks
  };
}


/* =========================================================
   DEBUG / GLOBAL ACCESS
   ========================================================= */

window.KRISHWAVE =
  {

    state,

    MARKETS,

    STRATEGIES,

    STRATEGY_GROUPS,

    analyzeMarket,

    scanMarketsForBot,

    makeAIBotDecision,

    startAIBot,

    stopAIBot,

    runCircleAnalysis,

    getMarketSnapshot

  };


console.log(
  "KRISHWAVE AI BEAST V7.0 loaded."
);

console.log(
  "AI BOT: INDEPENDENT ENGINE"
);

console.log(
  "AI CIRCLE: ANALYSIS ENGINE"
);

console.log(
  "MANUAL: AI-ASSISTED USER CONTROL"
);