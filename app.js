/* =========================================================
   KRISHWAVE AI BEAST V5.8
   DERIV DEMO CONNECTION + AI MARKET ENGINE

   IMPORTANT
   ---------------------------------------------------------
   - Public market data uses Deriv public WebSocket
   - Demo account authentication uses OAuth 2.0
   - OAuth authorization-code exchange MUST be handled
     by a secure backend/serverless endpoint
   - No Deriv password is stored here
   - No Client Secret is stored here
   - AI prediction remains analysis/paper mode
========================================================= */


/* =========================================================
   CONFIGURATION
========================================================= */

const DERIV_CLIENT_ID =
  "019f9f77-0282-7ee4-8c64-c0ac3e80dfad";

const REDIRECT_URI =
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const DERIV_OAUTH_URL =
  "https://auth.deriv.com/oauth2/auth";

const DERIV_PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";


/* =========================================================
   MARKETS
========================================================= */

const MARKETS = [
  {
    symbol: "R_10",
    name: "Volatility 10"
  },
  {
    symbol: "R_25",
    name: "Volatility 25"
  },
  {
    symbol: "R_50",
    name: "Volatility 50"
  },
  {
    symbol: "R_75",
    name: "Volatility 75"
  },
  {
    symbol: "R_100",
    name: "Volatility 100"
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
  },
  {
    symbol: "1HZ250V",
    name: "Volatility 250 (1s)"
  },
  {
    symbol: "1HZ1000V",
    name: "Volatility 1000 (1s)"
  }
];


/* =========================================================
   STATE
========================================================= */

const state = {

  socket: null,

  connected: false,

  aiRunning: false,

  trading: false,

  phase: "idle",

  timer: 0,

  strategy: "MATCHES",

  market: "R_10",

  prediction: null,

  confidence: 0,

  ticks: {},

  scores: {},

  scanRequested: false,

  cycleTimer: null,

  reconnectTimer: null,

  history: [],

  wins: 0,

  losses: 0,

  demoConnected: false,

  accessToken: null,

  accountId: null,

  currency: null

};


/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function setText(id, value) {

  const element = $(id);

  if (element) {
    element.textContent = value;
  }

}


function setValue(id, value) {

  const element = $(id);

  if (element) {
    element.value = value;
  }

}


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(online) {

  const dot = $("connectionDot");
  const text = $("connectionText");
  const heroDot = $("heroLiveDot");

  if (dot) {

    dot.classList.toggle("online", online);
    dot.classList.toggle("offline", !online);

  }

  if (heroDot) {

    heroDot.classList.toggle("online", online);
    heroDot.classList.toggle("offline", !online);

  }

  setText(
    "connectionText",
    online ? "ONLINE" : "OFFLINE"
  );

  setText(
    "heroLiveText",
    online ? "LIVE" : "OFFLINE"
  );

}


/* =========================================================
   DERIV PUBLIC MARKET CONNECTION
========================================================= */

function connectDerivPublic() {

  if (
    state.socket &&
    state.socket.readyState === WebSocket.OPEN
  ) {
    return;
  }

  try {

    state.socket =
      new WebSocket(DERIV_PUBLIC_WS);

  } catch (error) {

    console.error(
      "Deriv WebSocket error:",
      error
    );

    updateConnectionUI(false);

    return;

  }


  state.socket.onopen = () => {

    state.connected = true;

    updateConnectionUI(true);

    setText(
      "dataStatus",
      "DERIV LIVE"
    );

    subscribeMarkets();

  };


  state.socket.onmessage = event => {

    try {

      const data =
        JSON.parse(event.data);

      handleDerivMessage(data);

    } catch (error) {

      console.error(
        "Invalid Deriv message:",
        error
      );

    }

  };


  state.socket.onerror = error => {

    console.error(
      "Deriv WebSocket error:",
      error
    );

    state.connected = false;

    updateConnectionUI(false);

  };


  state.socket.onclose = () => {

    state.connected = false;

    updateConnectionUI(false);

    scheduleReconnect();

  };

}


/* =========================================================
   RECONNECT
========================================================= */

function scheduleReconnect() {

  if (state.reconnectTimer) {
    return;
  }

  state.reconnectTimer =
    setTimeout(() => {

      state.reconnectTimer = null;

      connectDerivPublic();

    }, 3000);

}


/* =========================================================
   SUBSCRIBE TO MARKETS
========================================================= */

function subscribeMarkets() {

  if (
    !state.socket ||
    state.socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }


  MARKETS.forEach(market => {

    if (!state.ticks[market.symbol]) {

      state.ticks[market.symbol] = [];

    }


    state.socket.send(
      JSON.stringify({
        ticks: market.symbol,
        subscribe: 1
      })
    );

  });

}


/* =========================================================
   HANDLE DERIV MESSAGE
========================================================= */

function handleDerivMessage(data) {

  if (!data) {
    return;
  }


  if (
    data.error
  ) {

    console.warn(
      "Deriv error:",
      data.error
    );

    return;

  }


  if (
    data.msg_type !== "tick" ||
    !data.tick
  ) {

    return;

  }


  const symbol =
    data.tick.symbol;

  if (!symbol) {
    return;
  }


  const quote =
    data.tick.quote;

  const digit =
    getLastDigit(quote);


  if (
    !Number.isFinite(digit)
  ) {
    return;
  }


  if (!state.ticks[symbol]) {

    state.ticks[symbol] = [];

  }


  state.ticks[symbol].push({

    digit,

    quote,

    epoch:
      data.tick.epoch ||
      Date.now() / 1000

  });


  if (
    state.ticks[symbol].length > 300
  ) {

    state.ticks[symbol] =
      state.ticks[symbol].slice(-300);

  }


  updateDigits();


  if (
    state.aiRunning &&
    state.phase === "analysis"
  ) {

    analyzeAllMarkets();

  }

}


/* =========================================================
   LAST DIGIT
========================================================= */

function getLastDigit(quote) {

  if (
    quote === null ||
    quote === undefined
  ) {
    return null;
  }


  const stringValue =
    String(quote);


  const clean =
    stringValue.replace(
      /\D/g,
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


/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket(symbol) {

  const data =
    state.ticks[symbol] || [];


  if (data.length < 5) {

    return {

      symbol,

      score: 0,

      confidence: 0,

      strength: "WAIT",

      stability: 0,

      concentration: 0,

      streak: 0,

      bestStrategy: "MATCHES",

      agreement: 0,

      counts:
        Array(10).fill(0)

    };

  }


  const recent =
    data.slice(-100);


  const counts =
    Array(10).fill(0);


  recent.forEach(item => {

    if (
      Number.isInteger(item.digit)
    ) {

      counts[item.digit]++;

    }

  });


  const total =
    recent.length;


  const percentages =
    counts.map(
      count =>
        (count / total) * 100
    );


  const maxCount =
    Math.max(...counts);


  const minCount =
    Math.min(...counts);


  const maxDigit =
    counts.indexOf(maxCount);


  const minDigit =
    counts.indexOf(minCount);


  const concentration =
    (maxCount / total) * 100;


  const mean =
    counts.reduce(
      (a, b) => a + b,
      0
    ) / 10;


  const variance =
    counts.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - mean,
          2
        ),
      0
    ) / 10;


  const stability =
    Math.max(
      0,
      Math.min(
        100,
        100 -
        Math.sqrt(variance) * 5
      )
    );


  const lastDigit =
    recent[
      recent.length - 1
    ].digit;


  let streak = 0;


  for (
    let i = recent.length - 1;
    i >= 0;
    i--
  ) {

    if (
      recent[i].digit ===
      lastDigit
    ) {

      streak++;

    } else {

      break;

    }

  }


  let even = 0;
  let odd = 0;
  let over = 0;
  let under = 0;


  recent.forEach(item => {

    if (
      item.digit % 2 === 0
    ) {

      even++;

    } else {

      odd++;

    }


    if (
      item.digit > 5
    ) {

      over++;

    } else {

      under++;

    }

  });


  const evenScore =
    (even / total) * 100;

  const oddScore =
    (odd / total) * 100;

  const overScore =
    (over / total) * 100;

  const underScore =
    (under / total) * 100;


  const strategies = {

    MATCHES:
      concentration,

    DIFFERS:
      Math.max(
        0,
        100 - concentration
      ),

    EVEN:
      Math.max(
        evenScore,
        100 - evenScore
      ),

    ODD:
      Math.max(
        oddScore,
        100 - oddScore
      ),

    OVER:
      Math.max(
        overScore,
        100 - overScore
      ),

    UNDER:
      Math.max(
        underScore,
        100 - underScore
      )

  };


  const bestStrategy =
    Object.keys(strategies)
      .sort(
        (a, b) =>
          strategies[b] -
          strategies[a]
      )[0];


  const bestStrategyScore =
    strategies[bestStrategy];


  const agreement =
    Math.min(
      100,
      Math.round(
        (
          bestStrategyScore +
          concentration +
          stability
        ) / 3
      )
    );


  const score =
    Math.round(
      (
        bestStrategyScore * 0.45 +
        concentration * 0.25 +
        stability * 0.20 +
        Math.min(streak * 5, 10)
      )
    );


  const confidence =
    Math.round(
      Math.min(
        99,
        Math.max(
          0,
          score * 0.85 +
          agreement * 0.15
        )
      )
    );


  let strength = "WEAK";


  if (score >= 75) {

    strength = "STRONG";

  } else if (score >= 60) {

    strength = "GOOD";

  } else if (score >= 45) {

    strength = "FAIR";

  }


  return {

    symbol,

    score,

    confidence,

    strength,

    stability:
      Math.round(stability),

    concentration:
      Math.round(concentration),

    streak,

    bestStrategy,

    agreement,

    maxDigit,

    minDigit,

    percentages,

    counts,

    evenScore,

    oddScore,

    overScore,

    underScore

  };

}


/* =========================================================
   ANALYZE ALL MARKETS
========================================================= */

function analyzeAllMarkets() {

  state.scores = {};


  MARKETS.forEach(market => {

    state.scores[
      market.symbol
    ] =
      analyzeMarket(
        market.symbol
      );

  });


  renderMarkets();

  renderTradeMarkets();

  updateAIReport();

}


/* =========================================================
   MARKET RANKING
========================================================= */

function rankedMarkets() {

  return MARKETS
    .map(market => {

      return (
        state.scores[
          market.symbol
        ] || analyzeMarket(
          market.symbol
        )
      );

    })
    .sort(
      (a, b) =>
        b.score - a.score
    );

}


/* =========================================================
   ANALYSIS MARKET CARDS
========================================================= */

function renderMarkets() {

  const container =
    $("markets");

  if (!container) {
    return;
  }


  const ranked =
    rankedMarkets();


  if (!ranked.length) {

    container.innerHTML =
      '<div class="empty-state">Waiting for market data...</div>';

    return;

  }


  container.innerHTML =
    ranked.map(result => {

      const market =
        MARKETS.find(
          m =>
            m.symbol ===
            result.symbol
        );


      return `
        <div class="market-card">

          <div class="market-name">
            ${market ? market.name : result.symbol}
          </div>

          <div class="market-score">
            ${result.score}
          </div>

          <div class="market-meta">

            <span>
              ${result.strength}
            </span>

            <span>
              ${result.confidence}%
            </span>

          </div>

          <div class="market-meta">

            <span>
              BEST:
            </span>

            <strong>
              ${result.bestStrategy}
            </strong>

          </div>

        </div>
      `;

    }).join("");

}


/* =========================================================
   TRADE MARKET SCANNER
========================================================= */

function scanMarkets() {

  state.scanRequested = true;

  setText(
    "marketScanStatus",
    "🔎 Scanning all volatility markets..."
  );


  const button =
    $("scanMarketsBtn");


  if (button) {

    button.disabled = true;

    button.classList.add(
      "scanning"
    );

  }


  analyzeAllMarkets();


  setTimeout(() => {

    const ranked =
      rankedMarkets();


    const ready =
      ranked.filter(
        item =>
          item.score >= 45
      ).length;


    setText(
      "marketScanStatus",
      `SCAN COMPLETE — ${ready}/${MARKETS.length} markets currently show usable statistical strength.`
    );


    if (button) {

      button.disabled = false;

      button.classList.remove(
        "scanning"
      );

    }

  }, 1000);

}


/* =========================================================
   TRADE MARKET CARDS
========================================================= */

function renderTradeMarkets() {

  const container =
    $("tradeMarkets");

  if (!container) {
    return;
  }


  const ranked =
    rankedMarkets();


  container.innerHTML =
    ranked.map(result => {

      const market =
        MARKETS.find(
          m =>
            m.symbol ===
            result.symbol
        );


      let indicator =
        "WEAK";

      let indicatorClass =
        "weak";


      if (
        result.score >= 70
      ) {

        indicator =
          `GOOD FOR ${result.bestStrategy}`;

        indicatorClass =
          "good";

      } else if (
        result.score >= 50
      ) {

        indicator =
          `WATCH ${result.bestStrategy}`;

        indicatorClass =
          "medium";

      }


      const selected =
        state.market ===
        result.symbol
          ? "selected"
          : "";


      return `
        <div
          class="trade-market-card ${selected}"
          data-symbol="${result.symbol}"
          onclick="selectMarket('${result.symbol}')"
        >

          <div class="trade-market-name">
            ${market ? market.name : result.symbol}
          </div>

          <div class="trade-market-symbol">
            ${result.symbol}
          </div>

          <div class="trade-market-score">
            ${result.score}
          </div>

          <div class="trade-market-strategy">
            AI: ${result.bestStrategy}
          </div>

          <div class="trade-market-strategy">
            Confidence: ${result.confidence}%
          </div>

          <span
            class="market-indicator ${indicatorClass}"
          >
            ${indicator}
          </span>

        </div>
      `;

    }).join("");

}


/* =========================================================
   SELECT MARKET
========================================================= */

function selectMarket(symbol) {

  const market =
    MARKETS.find(
      item =>
        item.symbol === symbol
    );


  if (!market) {
    return;
  }


  state.market =
    symbol;


  setValue(
    "symbol",
    symbol
  );


  const result =
    state.scores[
      symbol
    ] ||
    analyzeMarket(
      symbol
    );


  if (
    result &&
    result.bestStrategy
  ) {

    setText(
      "tradeMarket",
      market.name
    );

  }


  renderTradeMarkets();

}


/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function updateDigits() {

  const container =
    $("digits");

  if (!container) {
    return;
  }


  const data =
    state.ticks[
      state.market
    ] || [];


  const recent =
    data.slice(-100);


  if (!recent.length) {

    container.innerHTML =
      '<div class="empty-state">Waiting for digits...</div>';

    return;

  }


  const counts =
    Array(10).fill(0);


  recent.forEach(item => {

    counts[
      item.digit
    ]++;

  });


  container.innerHTML =
    counts.map(
      (count, digit) => {

        const percentage =
          Math.round(
            (count /
              recent.length) *
              100
          );


        return `
          <div class="digit-card">

            <strong>
              ${digit}
            </strong>

            <span>
              ${percentage}%
            </span>

          </div>
        `;

      }
    ).join("");

}


/* =========================================================
   STRATEGY SELECTION
========================================================= */

function setStrategy(strategy) {

  state.strategy =
    strategy;


  document
    .querySelectorAll(
      ".strategy-btn"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.strategy ===
        strategy
      );

    });


  setValue(
    "tradeStrategy",
    strategy
  );


  updateManualField();

}


/* =========================================================
   MANUAL FIELD
========================================================= */

function updateManualField() {

  const group =
    $("manualNumberGroup");


  if (!group) {
    return;
  }


  const hidden =
    state.strategy === "EVEN" ||
    state.strategy === "ODD";


  group.style.display =
    hidden
      ? "none"
      : "block";

}


/* =========================================================
   CREATE PREDICTION
========================================================= */

function createPrediction(
  result,
  strategy
) {

  if (!result) {
    return null;
  }


  switch (strategy) {

    case "MATCHES":

      return String(
        result.maxDigit
      );


    case "DIFFERS":

      return String(
        result.minDigit
      );


    case "EVEN":

      return "EVEN";


    case "ODD":

      return "ODD";


    case "OVER":

      return String(
        Math.max(
          6,
          result.maxDigit
        )
      );


    case "UNDER":

      return String(
        Math.min(
          4,
          result.minDigit
        )
      );


    default:

      return null;

  }

}


/* =========================================================
   BEST MARKET
========================================================= */

function getBestMarket() {

  const ranked =
    rankedMarkets();


  if (!ranked.length) {
    return null;
  }


  return ranked[0];

}


/* =========================================================
   AI REPORT
========================================================= */

function updateAIReport() {

  const result =
    state.scores[
      state.market
    ];


  if (!result) {
    return;
  }


  setText(
    "reportMarket",
    state.market
  );

  setText(
    "reportScore",
    result.score
  );

  setText(
    "reportStrength",
    result.strength
  );

  setText(
    "reportStability",
    `${result.stability}%`
  );

  setText(
    "reportConcentration",
    `${result.concentration}%`
  );

  setText(
    "reportStreak",
    result.streak
  );

  setText(
    "reportAgreement",
    `${result.agreement}%`
  );

}


/* =========================================================
   CYCLE UI
========================================================= */

function setCyclePhase(
  phase
) {

  document
    .querySelectorAll(
      ".cycle-step"
    )
    .forEach(
      element =>
        element.classList.remove(
          "active"
        )
    );


  if (phase === "analysis") {

    $("cycleAnalysis")
      ?.classList.add(
        "active"
      );

  }


  if (phase === "prediction") {

    $("cyclePrediction")
      ?.classList.add(
        "active"
      );

  }


  if (phase === "trade") {

    $("cycleTrade")
      ?.classList.add(
        "active"
      );

  }


  if (phase === "cooldown") {

    $("cycleCooldown")
      ?.classList.add(
        "active"
      );

  }

}


/* =========================================================
   COUNTDOWN
========================================================= */

function runCountdown(
  seconds,
  callback
) {

  state.timer =
    seconds;


  setText(
    "aiCircleTimer",
    state.timer
  );


  const interval =
    setInterval(() => {

      if (
        !state.aiRunning
      ) {

        clearInterval(
          interval
        );

        return;

      }


      state.timer--;


      if (
        state.timer <= 0
      ) {

        clearInterval(
          interval
        );

        state.timer = 0;

        callback();

        return;

      }


      setText(
        "aiCircleTimer",
        state.timer
      );

    }, 1000);

}


/* =========================================================
   START AI
========================================================= */

function startAI() {

  if (state.aiRunning) {
    return;
  }


  state.aiRunning = true;

  state.phase =
    "analysis";


  setText(
    "aiStatus",
    "ANALYZING"
  );

  setText(
    "aiCircleLabel",
    "ANALYZING MARKET"
  );

  setText(
    "aiCirclePrediction",
    "—"
  );

  setText(
    "aiCircleStatus",
    "SCANNING"
  );


  $("aiCircle")
    ?.classList.remove(
      "prediction-active",
      "trade-now"
    );


  runAnalysisPhase();

}


/* =========================================================
   ANALYSIS PHASE
========================================================= */

function runAnalysisPhase() {

  if (!state.aiRunning) {
    return;
  }


  state.phase =
    "analysis";


  setCyclePhase(
    "analysis"
  );


  setText(
    "entryStatus",
    "ANALYSIS"
  );

  setText(
    "tradeStatus",
    "SCANNING"
  );


  analyzeAllMarkets();


  runCountdown(
    10,
    lockPrediction
  );

}


/* =========================================================
   LOCK PREDICTION
========================================================= */

function lockPrediction() {

  if (!state.aiRunning) {
    return;
  }


  const best =
    getBestMarket();


  if (!best) {

    restartCycle();

    return;

  }


  state.market =
    best.symbol;


  const strategy =
    state.strategy;


  const prediction =
    createPrediction(
      best,
      strategy
    );


  state.prediction =
    prediction;


  state.confidence =
    best.confidence;


  state.phase =
    "prediction";


  setCyclePhase(
    "prediction"
  );


  setText(
    "aiStatus",
    "PREDICTION LOCKED"
  );

  setText(
    "aiMarket",
    best.symbol
  );

  setText(
    "aiPrediction",
    prediction || "WAIT"
  );

  setText(
    "aiType",
    strategy
  );

  setText(
    "analysisConfidence",
    `${best.confidence}%`
  );


  setText(
    "aiPredictionLarge",
    prediction || "WAIT"
  );

  setText(
    "predictionConfidence",
    `${best.confidence}%`
  );

  setText(
    "entryStatus",
    "LOCKED 5s"
  );


  setText(
    "tradePrediction",
    prediction || "WAIT"
  );

  setText(
    "tradeMarket",
    best.symbol
  );

  setText(
    "tradeConfidence",
    `${best.confidence}%`
  );

  setText(
    "tradeStatus",
    "LOCKED"
  );


  setText(
    "aiCircleLabel",
    "PREDICTION"
  );

  setText(
    "aiCirclePrediction",
    prediction || "—"
  );

  setText(
    "aiCircleStatus",
    "LOCKED"
  );


  $("aiCircle")
    ?.classList.add(
      "prediction-active"
    );


  setValue(
    "symbol",
    best.symbol
  );


  updateAIReport();


  runEntryPhase();

}


/* =========================================================
   5 SECOND PREDICTION WINDOW
========================================================= */

function runEntryPhase() {

  if (!state.aiRunning) {
    return;
  }


  state.phase =
    "prediction";


  runCountdown(
    5,
    tradeNow
  );

}


/* =========================================================
   TRADE NOW
========================================================= */

function tradeNow() {

  if (!state.aiRunning) {
    return;
  }


  state.phase =
    "trade";


  setCyclePhase(
    "trade"
  );


  setText(
    "aiStatus",
    "TRADE NOW"
  );

  setText(
    "aiCircleLabel",
    "TRADE NOW"
  );

  setText(
    "aiCircleStatus",
    "SIGNAL READY"
  );

  setText(
    "entryStatus",
    "TRADE NOW"
  );

  setText(
    "tradeStatus",
    "TRADE NOW"
  );


  $("aiCircle")
    ?.classList.remove(
      "prediction-active"
    );

  $("aiCircle")
    ?.classList.add(
      "trade-now"
    );


  recordPaperSignal();


  runCountdown(
    3,
    restartCycle
  );

}


/* =========================================================
   RESTART
========================================================= */

function restartCycle() {

  if (!state.aiRunning) {
    return;
  }


  state.phase =
    "cooldown";


  setCyclePhase(
    "cooldown"
  );


  $("aiCircle")
    ?.classList.remove(
      "trade-now"
    );


  setTimeout(() => {

    if (
      state.aiRunning
    ) {

      runAnalysisPhase();

    }

  }, 50);

}


/* =========================================================
   STOP AI
========================================================= */

function stopAI() {

  state.aiRunning =
    false;


  state.phase =
    "idle";


  setText(
    "aiStatus",
    "STOPPED"
  );

  setText(
    "aiCircleLabel",
    "AI ANALYSIS"
  );

  setText(
    "aiCircleStatus",
    "STOPPED"
  );

  setText(
    "aiCircleTimer",
    "—"
  );


  $("aiCircle")
    ?.classList.remove(
      "prediction-active",
      "trade-now"
    );


  setCyclePhase(
    "cooldown"
  );

}


/* =========================================================
   PAPER SIGNAL
========================================================= */

function recordPaperSignal() {

  const signal = {

    id:
      Date.now(),

    time:
      new Date()
        .toLocaleTimeString(),

    market:
      state.market,

    strategy:
      state.strategy,

    prediction:
      state.prediction,

    confidence:
      state.confidence,

    result:
      "PENDING"

  };


  state.history.unshift(
    signal
  );


  if (
    state.history.length > 100
  ) {

    state.history =
      state.history.slice(
        0,
        100
      );

  }


  saveHistory();

  renderHistory();

}


/* =========================================================
   HISTORY
========================================================= */

function saveHistory() {

  try {

    localStorage.setItem(
      "krishwave_history",
      JSON.stringify(
        state.history
      )
    );

  } catch (error) {

    console.warn(
      "Could not save history",
      error
    );

  }

}


function loadHistory() {

  try {

    const saved =
      localStorage.getItem(
        "krishwave_history"
      );


    if (saved) {

      state.history =
        JSON.parse(
          saved
        );

    }

  } catch (error) {

    state.history = [];

  }

}


function renderHistory() {

  const list =
    $("historyList");

  if (!list) {
    return;
  }


  if (!state.history.length) {

    list.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="empty-history"
        >
          No signals yet.
        </td>
      </tr>
    `;

    updateHistoryStats();

    return;

  }


  list.innerHTML =
    state.history.map(
      item => {

        return `
          <tr>

            <td>
              ${item.time}
            </td>

            <td>
              ${item.market}
            </td>

            <td>
              ${item.strategy}
            </td>

            <td>
              ${item.prediction}
            </td>

            <td>
              ${item.confidence}%
            </td>

            <td>
              ${item.result}
            </td>

          </tr>
        `;

      }
    ).join("");


  updateHistoryStats();

}


function updateHistoryStats() {

  const total =
    state.history.length;


  const wins =
    state.history.filter(
      x =>
        x.result ===
        "WIN"
    ).length;


  const losses =
    state.history.filter(
      x =>
        x.result ===
        "LOSS"
    ).length;


  const pending =
    state.history.filter(
      x =>
        x.result ===
        "PENDING"
    ).length;


  const settled =
    wins + losses;


  const accuracy =
    settled
      ? Math.round(
          (wins / settled) *
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

  if (
    !confirm(
      "Clear all KRISHWAVE history?"
    )
  ) {

    return;

  }


  state.history = [];

  saveHistory();

  renderHistory();

}


/* =========================================================
   PAGE NAVIGATION
========================================================= */

function showPage(page) {

  document
    .querySelectorAll(
      ".page"
    )
    .forEach(section => {

      section.classList.remove(
        "active"
      );

    });


  const target =
    $(
      `page-${page}`
    );


  if (target) {

    target.classList.add(
      "active"
    );

  }


  document
    .querySelectorAll(
      ".nav-btn"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page ===
        page
      );

    });


  if (
    page === "trade"
  ) {

    renderTradeMarkets();

  }


  if (
    page === "history"
  ) {

    renderHistory();

  }

}


/* =========================================================
   THEME
========================================================= */

function toggleTheme() {

  document.body.classList.toggle(
    "light"
  );


  const light =
    document.body.classList.contains(
      "light"
    );


  localStorage.setItem(
    "krishwave_theme",
    light
      ? "light"
      : "dark"
  );


  setText(
    "themeToggle",
    light
      ? "☀️"
      : "🌙"
  );

}


function loadTheme() {

  const theme =
    localStorage.getItem(
      "krishwave_theme"
    );


  if (
    theme === "light"
  ) {

    document.body.classList.add(
      "light"
    );

    setText(
      "themeToggle",
      "☀️"
    );

  }

}


/* =========================================================
   DEMO / REAL UI
========================================================= */

function setAccountMode(
  mode
) {

  const real =
    mode === "REAL";


  setText(
    "accountMode",
    mode
  );


  if (
    real
  ) {

    setText(
      "balance",
      "—"
    );

    setText(
      "authStatus",
      "REAL MODE DISABLED"
    );

    return;

  }


  if (
    state.demoConnected
  ) {

    setText(
      "authStatus",
      "DEMO CONNECTED"
    );

  } else {

    setText(
      "authStatus",
      "NOT CONNECTED"
    );

  }

}


/* =========================================================
   OAUTH PKCE
========================================================= */

function generateRandomString(
  length = 64
) {

  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";


  const values =
    new Uint8Array(
      length
    );


  crypto.getRandomValues(
    values
  );


  return Array
    .from(values)
    .map(
      value =>
        characters[
          value %
          characters.length
        ]
    )
    .join("");

}


async function generateCodeChallenge(
  verifier
) {

  const data =
    new TextEncoder()
      .encode(
        verifier
      );


  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );


  return btoa(
    String.fromCharCode(
      ...new Uint8Array(
        digest
      )
    )
  )
    .replace(
      /\+/g,
      "-"
    )
    .replace(
      /\//g,
      "_"
    )
    .replace(
      /=+$/,
      ""
    );

}


/* =========================================================
   CONNECT DERIV
========================================================= */

async function connectDerivAccount() {

  try {

    const verifier =
      generateRandomString(
        64
      );


    const stateValue =
      generateRandomString(
        32
      );


    const challenge =
      await generateCodeChallenge(
        verifier
      );


    sessionStorage.setItem(
      "krishwave_pkce_verifier",
      verifier
    );


    sessionStorage.setItem(
      "krishwave_oauth_state",
      stateValue
    );


    const params =
      new URLSearchParams({

        response_type:
          "code",

        client_id:
          DERIV_CLIENT_ID,

        redirect_uri:
          REDIRECT_URI,

        scope:
          "trade",

        state:
          stateValue,

        code_challenge:
          challenge,

        code_challenge_method:
          "S256"

      });


    window.location.href =
      `${DERIV_OAUTH_URL}?${params.toString()}`;

  } catch (error) {

    console.error(
      "OAuth start error:",
      error
    );

    setText(
      "authStatus",
      "AUTH START FAILED"
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
    params.get(
      "code"
    );


  const returnedState =
    params.get(
      "state"
    );


  const error =
    params.get(
      "error"
    );


  if (error) {

    console.error(
      "Deriv OAuth error:",
      error
    );


    setText(
      "authStatus",
      "AUTHORIZATION CANCELLED"
    );


    cleanOAuthURL();

    return;

  }


  if (
    !code
  ) {

    return;

  }


  const savedState =
    sessionStorage.getItem(
      "krishwave_oauth_state"
    );


  const verifier =
    sessionStorage.getItem(
      "krishwave_pkce_verifier"
    );


  if (
    !savedState ||
    !verifier ||
    returnedState !==
      savedState
  ) {

    console.error(
      "OAuth state verification failed."
    );


    setText(
      "authStatus",
      "SECURITY CHECK FAILED"
    );


    return;

  }


  /*
    IMPORTANT:

    Deriv's current documentation requires
    authorization-code -> access-token exchange
    to be performed by a backend.

    Therefore this frontend calls:

      /api/deriv/oauth/token

    Your GitHub Pages site alone cannot provide
    that secure backend endpoint.
  */

  setText(
    "authStatus",
    "AUTH CODE RECEIVED"
  );


  try {

    const response =
      await fetch(
        "/api/deriv/oauth/token",
        {

          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              code,

              code_verifier:
                verifier,

              redirect_uri:
                REDIRECT_URI

            })

        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        `Token endpoint returned ${response.status}`
      );

    }


    const result =
      await response.json();


    if (
      !result.access_token
    ) {

      throw new Error(
        "No access token returned."
      );

    }


    state.accessToken =
      result.access_token;


    sessionStorage.removeItem(
      "krishwave_pkce_verifier"
    );


    sessionStorage.removeItem(
      "krishwave_oauth_state"
    );


    await loadDemoAccount();


    cleanOAuthURL();

  } catch (error) {

    console.error(
      "Token exchange failed:",
      error
    );


    setText(
      "authStatus",
      "BACKEND CONNECTION REQUIRED"
    );

  }

}


/* =========================================================
   LOAD DEMO ACCOUNT
========================================================= */

async function loadDemoAccount() {

  if (
    !state.accessToken
  ) {

    return;

  }


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


    if (
      !response.ok
    ) {

      throw new Error(
        `Account request failed: ${response.status}`
      );

    }


    const result =
      await response.json();


    const accounts =
      result.data ||
      result.accounts ||
      [];


    const demo =
      accounts.find(
        account =>
          account.account_type ===
          "demo"
      );


    if (!demo) {

      setText(
        "authStatus",
        "NO DEMO OPTIONS ACCOUNT"
      );

      return;

    }


    state.demoConnected =
      true;


    state.accountId =
      demo.account_id ||
      demo.id;


    state.currency =
      demo.currency ||
      "USD";


    setText(
      "authStatus",
      "DEMO CONNECTED"
    );


    setText(
      "derivAccountId",
      state.accountId
    );


    setText(
      "derivCurrency",
      state.currency
    );


    setText(
      "derivAuthConnection",
      "AUTHENTICATED"
    );


    setText(
      "accountMode",
      "DEMO"
    );


    connectAuthenticatedDemo();

  } catch (error) {

    console.error(
      "Demo account error:",
      error
    );


    setText(
      "authStatus",
      "DEMO CONNECTION FAILED"
    );

  }

}


/* =========================================================
   AUTHENTICATED DEMO WEBSOCKET
========================================================= */

async function connectAuthenticatedDemo() {

  if (
    !state.accessToken ||
    !state.accountId
  ) {

    return;

  }


  try {

    const response =
      await fetch(
        `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(
          state.accountId
        )}/otp`,
        {

          method:
            "POST",

          headers: {

            Authorization:
              `Bearer ${state.accessToken}`

          }

        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        `OTP request failed: ${response.status}`
      );

    }


    const result =
      await response.json();


    const wsUrl =
      result?.data?.url;


    if (!wsUrl) {

      throw new Error(
        "No authenticated WebSocket URL returned."
      );

    }


    /*
      The OTP is short-lived and one-use.
      Connect immediately.
    */

    const demoSocket =
      new WebSocket(
        wsUrl
      );


    demoSocket.onopen = () => {

      console.log(
        "Authenticated Deriv Demo WebSocket connected."
      );


      setText(
        "derivAuthConnection",
        "DEMO ONLINE"
      );


      setText(
        "authStatus",
        "DEMO CONNECTED"
      );


      requestDemoBalance(
        demoSocket
      );

    };


    demoSocket.onmessage =
      event => {

        try {

          const data =
            JSON.parse(
              event.data
            );


          handleDemoMessage(
            data
          );

        } catch (error) {

          console.error(
            "Demo message error:",
            error
          );

        }

      };


    demoSocket.onerror =
      error => {

        console.error(
          "Authenticated demo socket error:",
          error
        );


        setText(
          "derivAuthConnection",
          "DEMO ERROR"
        );

      };


    demoSocket.onclose = () => {

      setText(
        "derivAuthConnection",
        "DEMO OFFLINE"
      );

    };


    state.demoSocket =
      demoSocket;

  } catch (error) {

    console.error(
      "Authenticated demo connection failed:",
      error
    );


    setText(
      "derivAuthConnection",
      "AUTH FAILED"
    );

  }

}


/* =========================================================
   DEMO BALANCE
========================================================= */

function requestDemoBalance(
  socket
) {

  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {

    return;

  }


  /*
    The authenticated Options WebSocket
    can receive account-scoped information.

    Request syntax may depend on the current
    Options WebSocket schema.
  */

  try {

    socket.send(
      JSON.stringify({

        balance: 1,

        subscribe: 1

      })
    );

  } catch (error) {

    console.error(
      "Balance request failed:",
      error
    );

  }

}


/* =========================================================
   HANDLE DEMO MESSAGE
========================================================= */

function handleDemoMessage(
  data
) {

  if (!data) {
    return;
  }


  if (
    data.error
  ) {

    console.error(
      "Demo API error:",
      data.error
    );

    return;

  }


  if (
    data.balance
  ) {

    const balance =
      data.balance.balance;


    const currency =
      data.balance.currency ||
      state.currency ||
      "";


    if (
      balance !==
      undefined
    ) {

      setText(
        "balance",
        `${Number(balance).toFixed(2)} ${currency}`
      );

    }

  }

}


/* =========================================================
   CLEAN OAUTH URL
========================================================= */

function cleanOAuthURL() {

  const cleanURL =
    window.location.origin +
    window.location.pathname;


  window.history.replaceState(
    {},
    document.title,
    cleanURL
  );

}


/* =========================================================
   DISCONNECT DEMO
========================================================= */

function disconnectDeriv() {

  state.demoConnected =
    false;

  state.accessToken =
    null;

  state.accountId =
    null;

  state.currency =
    null;


  if (
    state.demoSocket
  ) {

    try {

      state.demoSocket.close();

    } catch (error) {}

  }


  sessionStorage.removeItem(
    "krishwave_access_token"
  );


  setText(
    "authStatus",
    "NOT CONNECTED"
  );

  setText(
    "derivAccountId",
    "—"
  );

  setText(
    "derivCurrency",
    "—"
  );

  setText(
    "derivAuthConnection",
    "OFFLINE"
  );

  setText(
    "balance",
    "—"
  );

}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEvents() {


  $("startAI")
    ?.addEventListener(
      "click",
      startAI
    );


  $("stopAI")
    ?.addEventListener(
      "click",
      stopAI
    );


  $("scanMarketsBtn")
    ?.addEventListener(
      "click",
      scanMarkets
    );


  $("clearHistory")
    ?.addEventListener(
      "click",
      clearHistory
    );


  $("themeToggle")
    ?.addEventListener(
      "click",
      toggleTheme
    );


  $("connectDerivBtn")
    ?.addEventListener(
      "click",
      connectDerivAccount
    );


  $("disconnectDerivBtn")
    ?.addEventListener(
      "click",
      disconnectDeriv
    );


  $("demoModeBtn")
    ?.addEventListener(
      "click",
      () => {

        setAccountMode(
          "DEMO"
        );

      }
    );


  $("realModeBtn")
    ?.addEventListener(
      "click",
      () => {

        setAccountMode(
          "REAL"
        );

      }
    );


  $("tradeStrategy")
    ?.addEventListener(
      "change",
      event => {

        setStrategy(
          event.target.value
        );

      }
    );


  document
    .querySelectorAll(
      ".strategy-btn"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          setStrategy(
            button.dataset.strategy
          );

        }
      );

    });


  document
    .querySelectorAll(
      ".nav-btn"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          showPage(
            button.dataset.page
          );

        }
      );

    });

}


/* =========================================================
   INITIALIZATION
========================================================= */

async function init() {

  loadTheme();

  loadHistory();

  renderHistory();

  setupEvents();

  setStrategy(
    "MATCHES"
  );

  setAccountMode(
    "DEMO"
  );

  connectDerivPublic();

  /*
    Check whether Deriv redirected the
    browser back with an OAuth code.
  */

  await handleOAuthCallback();

}


/* =========================================================
   GLOBAL FUNCTIONS
========================================================= */

window.startAI =
  startAI;

window.stopAI =
  stopAI;

window.showPage =
  showPage;

window.selectMarket =
  selectMarket;

window.clearHistory =
  clearHistory;

window.scanMarkets =
  scanMarkets;

window.connectDeriv =
  connectDerivAccount;

window.disconnectDeriv =
  disconnectDeriv;


/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);