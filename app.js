/* =========================================================
   KRISHWAVE AI BEAST V5.8
   COMPLETE APP ENGINE

   CYCLE:
   10 SEC ANALYSIS
        ↓
   PREDICTION APPEARS
        ↓
   5 SEC ENTRY WINDOW
        ↓
   TRADE NOW FOR 3 SEC
        ↓
   RESTART 10 SEC ANALYSIS

   PAPER / ANALYSIS MODE ONLY
   ========================================================= */

"use strict";

/* =========================================================
   DERIV
   ========================================================= */

const DERIV_WS =
  "wss://ws.derivws.com/websockets/v3?app_id=1089";

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

  phase: "IDLE",

  timer: 0,

  strategy: "MATCHES",

  market: "",

  prediction: null,

  confidence: 0,

  ticks: {},

  scores: {},

  scanRequested: false,

  cycleInterval: null,

  reconnectTimer: null,

  history: [],

  wins: 0,

  losses: 0

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

function setValue(id, value) {

  const el = $(id);

  if (el) {
    el.value = value;
  }

}

/* =========================================================
   CONNECTION UI
   ========================================================= */

function setConnection(status) {

  const dot = $("connectionDot");
  const text = $("connectionStatus");

  if (status === "connected") {

    state.connected = true;

    if (dot) {
      dot.className = "connection-dot connected";
    }

    if (text) {
      text.textContent = "LIVE";
    }

  } else if (status === "connecting") {

    state.connected = false;

    if (dot) {
      dot.className = "connection-dot";
    }

    if (text) {
      text.textContent = "CONNECTING...";
    }

  } else {

    state.connected = false;

    if (dot) {
      dot.className = "connection-dot disconnected";
    }

    if (text) {
      text.textContent = "OFFLINE";
    }

  }

}

/* =========================================================
   DERIV CONNECTION
   ========================================================= */

function connectDeriv() {

  clearTimeout(state.reconnectTimer);

  setConnection("connecting");

  try {

    state.socket = new WebSocket(DERIV_WS);

  } catch (error) {

    console.error(error);

    setConnection("offline");

    scheduleReconnect();

    return;
  }

  state.socket.onopen = function () {

    console.log("KRISHWAVE connected to Deriv");

    setConnection("connected");

    subscribeMarkets();

    setText(
      "analysisMsg",
      "Connected. Collecting live tick data..."
    );

  };

  state.socket.onmessage = function (event) {

    try {

      const data = JSON.parse(event.data);

      handleDerivMessage(data);

    } catch (error) {

      console.error(
        "Deriv message error:",
        error
      );

    }

  };

  state.socket.onerror = function (error) {

    console.error(
      "Deriv WebSocket error",
      error
    );

  };

  state.socket.onclose = function () {

    setConnection("offline");

    scheduleReconnect();

  };

}

function scheduleReconnect() {

  clearTimeout(state.reconnectTimer);

  state.reconnectTimer = setTimeout(
    connectDeriv,
    3000
  );

}

/* =========================================================
   SUBSCRIBE
   ========================================================= */

function subscribeMarkets() {

  if (
    !state.socket ||
    state.socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  MARKETS.forEach(function (market) {

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
   DERIV MESSAGE
   ========================================================= */

function handleDerivMessage(data) {

  if (!data) {
    return;
  }

  if (data.error) {

    console.warn(
      "Deriv API:",
      data.error.message
    );

    return;
  }

  if (!data.tick) {
    return;
  }

  const tick = data.tick;

  const symbol = tick.symbol;

  if (!symbol) {
    return;
  }

  if (!state.ticks[symbol]) {
    state.ticks[symbol] = [];
  }

  const quote = Number(tick.quote);

  if (!Number.isFinite(quote)) {
    return;
  }

  const digit = getLastDigit(
    tick.quote,
    symbol
  );

  state.ticks[symbol].push({
    quote: quote,
    digit: digit,
    epoch: tick.epoch || Date.now() / 1000
  });

  if (state.ticks[symbol].length > 200) {

    state.ticks[symbol].splice(
      0,
      state.ticks[symbol].length - 200
    );

  }

  if (!state.market) {

    state.market = symbol;

    setValue(
      "symbol",
      symbol
    );

  }

  updateMarketScores();

  if (
    state.market === symbol &&
    state.phase === "ANALYSIS"
  ) {

    updateDigits(symbol);

  }

}

/* =========================================================
   LAST DIGIT
   ========================================================= */

function getLastDigit(value, symbol) {

  const text = String(value);

  const clean = text.replace(
    /[^0-9]/g,
    ""
  );

  if (!clean.length) {
    return 0;
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

  const list = state.ticks[symbol] || [];

  if (list.length < 10) {

    return {
      symbol,
      score: 0,
      confidence: 0,
      strength: "WAITING",
      bestStrategy: "—",
      concentration: 0,
      stability: 0,
      streak: 0,
      agreement: "WAITING",
      counts: Array(10).fill(0)
    };

  }

  const recent =
    list.slice(-80);

  const counts =
    Array(10).fill(0);

  recent.forEach(function (item) {

    const d = Number(item.digit);

    if (
      Number.isInteger(d) &&
      d >= 0 &&
      d <= 9
    ) {

      counts[d]++;

    }

  });

  const total =
    recent.length;

  const percentages =
    counts.map(
      n => (n / total) * 100
    );

  const maxPercent =
    Math.max(...percentages);

  const minPercent =
    Math.min(...percentages);

  const maxDigit =
    percentages.indexOf(
      maxPercent
    );

  /* -------------------------
     CONCENTRATION
     ------------------------- */

  const concentration =
    maxPercent;

  /* -------------------------
     EVEN / ODD
     ------------------------- */

  const evenCount =
    recent.filter(
      x => x.digit % 2 === 0
    ).length;

  const oddCount =
    total - evenCount;

  const evenPercent =
    (evenCount / total) * 100;

  const oddPercent =
    (oddCount / total) * 100;

  /* -------------------------
     OVER / UNDER
     ------------------------- */

  const over5 =
    recent.filter(
      x => x.digit > 5
    ).length;

  const under5 =
    recent.filter(
      x => x.digit < 5
    ).length;

  const overPercent =
    (over5 / total) * 100;

  const underPercent =
    (under5 / total) * 100;

  /* -------------------------
     STREAK
     ------------------------- */

  let streak = 1;

  if (recent.length > 1) {

    const last =
      recent[recent.length - 1].digit;

    for (
      let i = recent.length - 2;
      i >= 0;
      i--
    ) {

      if (
        recent[i].digit === last
      ) {

        streak++;

      } else {

        break;

      }

    }

  }

  /* -------------------------
     STABILITY
     ------------------------- */

  const spread =
    maxPercent - minPercent;

  let stability =
    100 - Math.min(
      spread * 2,
      70
    );

  stability =
    Math.max(
      0,
      Math.min(
        100,
        stability
      )
    );

  /* -------------------------
     STRATEGY SCORES
     ------------------------- */

  const strategies = {

    MATCHES:
      maxPercent,

    DIFFERS:
      100 - minPercent,

    EVEN:
      evenPercent,

    ODD:
      oddPercent,

    OVER:
      overPercent,

    UNDER:
      underPercent

  };

  let bestStrategy =
    Object.keys(strategies).sort(
      (a, b) =>
        strategies[b] -
        strategies[a]
    )[0];

  let strategyStrength =
    strategies[bestStrategy];

  /* -------------------------
     OVERALL SCORE
     ------------------------- */

  let score =
    (
      strategyStrength * 0.45
      +
      concentration * 0.20
      +
      stability * 0.20
      +
      Math.min(streak * 5, 15) * 0.15
    );

  score =
    Math.max(
      0,
      Math.min(
        100,
        score
      )
    );

  let confidence =
    Math.round(
      Math.max(
        0,
        Math.min(
          99,
          score
        )
      )
    );

  let strength;

  if (score >= 75) {

    strength = "EXCELLENT";

  } else if (score >= 60) {

    strength = "GOOD";

  } else if (score >= 45) {

    strength = "FAIR";

  } else {

    strength = "WEAK";

  }

  /* -------------------------
     AGREEMENT
     ------------------------- */

  let agreement =
    "LOW";

  if (
    strategyStrength >= 70 &&
    stability >= 65
  ) {

    agreement = "STRONG";

  } else if (
    strategyStrength >= 58 &&
    stability >= 50
  ) {

    agreement = "MEDIUM";

  }

  return {

    symbol,
    score: Math.round(score),
    confidence,
    strength,
    bestStrategy,
    concentration:
      Math.round(concentration),
    stability:
      Math.round(stability),
    streak,
    agreement,
    counts,
    percentages,
    maxDigit

  };

}

/* =========================================================
   UPDATE ALL MARKET SCORES
   ========================================================= */

function updateMarketScores() {

  MARKETS.forEach(function (market) {

    state.scores[market.symbol] =
      analyzeMarket(
        market.symbol
      );

  });

  renderMarkets();

  if (
    state.scanRequested ||
    state.aiRunning
  ) {

    renderTradeMarkets();

  }

  updateBestMarket();

}

/* =========================================================
   BEST MARKET
   ========================================================= */

function getBestMarket() {

  const analyzed =
    MARKETS
      .map(
        m =>
          state.scores[m.symbol]
      )
      .filter(
        x =>
          x &&
          x.score > 0
      );

  if (!analyzed.length) {
    return null;
  }

  analyzed.sort(
    (a, b) =>
      b.score - a.score
  );

  return analyzed[0];

}

/* =========================================================
   UPDATE BEST MARKET
   ========================================================= */

function updateBestMarket() {

  const best =
    getBestMarket();

  if (!best) {

    setText(
      "aiMarket",
      "WAITING"
    );

    setText(
      "analysisConfidence",
      "0%"
    );

    return;

  }

  if (
    state.phase === "ANALYSIS" ||
    !state.market
  ) {

    state.market =
      best.symbol;

  }

  const current =
    state.scores[state.market] ||
    best;

  setText(
    "aiMarket",
    marketName(
      current.symbol
    )
  );

  setText(
    "analysisConfidence",
    current.confidence + "%"
  );

  updateReport(
    current
  );

}

/* =========================================================
   MARKET NAME
   ========================================================= */

function marketName(symbol) {

  const found =
    MARKETS.find(
      m =>
        m.symbol === symbol
    );

  return found
    ? found.name
    : symbol;

}

/* =========================================================
   REPORT
   ========================================================= */

function updateReport(data) {

  if (!data) {
    return;
  }

  setText(
    "reportMarket",
    marketName(
      data.symbol
    )
  );

  setText(
    "reportScore",
    data.score
  );

  setText(
    "reportStrength",
    data.strength
  );

  setText(
    "reportStability",
    data.stability + "%"
  );

  setText(
    "reportConcentration",
    data.concentration + "%"
  );

  setText(
    "reportStreak",
    data.streak
  );

  setText(
    "reportAgreement",
    data.agreement
  );

}

/* =========================================================
   MARKET CARDS
   ========================================================= */

function renderMarkets() {

  const container =
    $("markets");

  if (!container) {
    return;
  }

  let html = "";

  MARKETS.forEach(function (market) {

    const data =
      state.scores[market.symbol];

    if (
      !data ||
      data.score === 0
    ) {

      html += `
        <div class="market-card">
          <div class="market-head">
            <div>
              <div class="market-name">
                ${market.name}
              </div>
              <div class="market-symbol">
                ${market.symbol}
              </div>
            </div>

            <div class="market-score">
              —
            </div>
          </div>

          <div class="market-indicator fair">
            WAITING FOR DATA
          </div>
        </div>
      `;

      return;

    }

    const cls =
      data.score >= 60
        ? "good"
        : data.score >= 45
          ? "fair"
          : "weak";

    const indicator =
      data.score >= 60
        ? "GOOD MARKET"
        : data.score >= 45
          ? "FAIR MARKET"
          : "WEAK MARKET";

    html += `
      <div
        class="market-card ${
          state.market === market.symbol
            ? "selected"
            : ""
        }"
        onclick="selectMarket('${market.symbol}')"
      >

        <div class="market-head">

          <div>

            <div class="market-name">
              ${market.name}
            </div>

            <div class="market-symbol">
              ${market.symbol}
            </div>

          </div>

          <div class="market-score">
            ${data.score}
          </div>

        </div>

        <div class="market-meta">

          <span>
            BEST STRATEGY
            <strong>
              ${data.bestStrategy}
            </strong>
          </span>

          <span>
            CONFIDENCE
            <strong>
              ${data.confidence}%
            </strong>
          </span>

        </div>

        <div class="market-indicator ${cls}">
          ${indicator} — ${data.bestStrategy}
        </div>

      </div>
    `;

  });

  container.innerHTML =
    html;

}

/* =========================================================
   SCAN MARKETS BUTTON
   ========================================================= */

function scanMarkets() {

  state.scanRequested = true;

  setText(
    "marketScanStatus",
    "🔎 SCANNING ALL VOLATILITY MARKETS..."
  );

  renderTradeMarkets();

  updateMarketScores();

  setTimeout(
    function () {

      const available =
        MARKETS.filter(
          m =>
            (
              state.ticks[
                m.symbol
              ] || []
            ).length >= 10
        ).length;

      const best =
        getBestMarket();

      if (best) {

        setText(
          "marketScanStatus",
          `SCAN COMPLETE — ${available}/${MARKETS.length} markets ready. Best: ${marketName(best.symbol)}`
        );

      } else {

        setText(
          "marketScanStatus",
          `SCANNING — waiting for enough live ticks (${available}/${MARKETS.length} markets ready).`
        );

      }

      renderTradeMarkets();

    },
    250
  );

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

  let html = "";

  MARKETS.forEach(function (market) {

    const data =
      state.scores[market.symbol];

    const ticks =
      (
        state.ticks[
          market.symbol
        ] || []
      ).length;

    if (
      !data ||
      data.score === 0
    ) {

      html += `
        <div
          class="trade-market-card ${
            state.market === market.symbol
              ? "selected"
              : ""
          }"
          onclick="selectMarket('${market.symbol}')"
        >

          <div class="market-head">

            <div>

              <div class="market-name">
                ${market.name}
              </div>

              <div class="market-symbol">
                ${market.symbol}
              </div>

            </div>

            <div class="market-score">
              —
            </div>

          </div>

          <div class="market-meta">

            <span>
              LIVE TICKS
              <strong>${ticks}</strong>
            </span>

            <span>
              STRATEGY
              <strong>WAITING</strong>
            </span>

          </div>

          <div class="market-indicator fair">
            COLLECTING DATA
          </div>

        </div>
      `;

      return;

    }

    const cls =
      data.score >= 60
        ? "good"
        : data.score >= 45
          ? "fair"
          : "weak";

    const indicator =
      data.score >= 60
        ? `GOOD FOR ${data.bestStrategy}`
        : data.score >= 45
          ? `FAIR FOR ${data.bestStrategy}`
          : "WEAK SETUP";

    html += `
      <div
        class="trade-market-card ${
          state.market === market.symbol
            ? "selected"
            : ""
        }"
        onclick="selectMarket('${market.symbol}')"
      >

        <div class="market-head">

          <div>

            <div class="market-name">
              ${market.name}
            </div>

            <div class="market-symbol">
              ${market.symbol}
            </div>

          </div>

          <div class="market-score">
            ${data.score}
          </div>

        </div>

        <div class="market-meta">

          <span>
            BEST
            <strong>
              ${data.bestStrategy}
            </strong>
          </span>

          <span>
            CONFIDENCE
            <strong>
              ${data.confidence}%
            </strong>
          </span>

        </div>

        <div class="market-indicator ${cls}">
          ${indicator}
        </div>

      </div>
    `;

  });

  container.innerHTML =
    html;

}

/* =========================================================
   SELECT MARKET
   ========================================================= */

function selectMarket(symbol) {

  if (!symbol) {
    return;
  }

  state.market =
    symbol;

  setValue(
    "symbol",
    symbol
  );

  const data =
    state.scores[symbol];

  if (data) {

    setText(
      "tradeMarket",
      marketName(symbol)
    );

    setText(
      "tradeConfidence",
      data.confidence + "%"
    );

  }

  renderMarkets();

  renderTradeMarkets();

  updateDigits(symbol);

  setText(
    "analysisMsg",
    `${marketName(symbol)} selected for AI analysis.`
  );

}

/* =========================================================
   DIGIT DISTRIBUTION
   ========================================================= */

function updateDigits(symbol) {

  const container =
    $("digits");

  if (!container) {
    return;
  }

  const data =
    state.scores[symbol];

  if (
    !data ||
    !data.counts
  ) {

    container.innerHTML =
      `<div class="empty-state">
        Waiting for digits...
      </div>`;

    return;

  }

  const total =
    data.counts.reduce(
      (a, b) =>
        a + b,
      0
    );

  let html = "";

  data.counts.forEach(
    function (count, digit) {

      const percent =
        total
          ? (
              count /
              total *
              100
            )
          : 0;

      html += `
        <div class="digit-card">

          <div class="digit-number">
            ${digit}
          </div>

          <div class="digit-percent">
            ${percent.toFixed(1)}%
          </div>

          <div class="digit-bar">

            <div
              class="digit-bar-fill"
              style="width:${percent}%"
            ></div>

          </div>

        </div>
      `;

    }
  );

  container.innerHTML =
    html;

}

/* =========================================================
   STRATEGY
   ========================================================= */

function setStrategy(strategy) {

  state.strategy =
    strategy;

  document
    .querySelectorAll(
      ".strategy-btn"
    )
    .forEach(
      function (button) {

        button.classList.toggle(
          "active",
          button.dataset.strategy ===
            strategy
        );

      }
    );

  setValue(
    "tradeStrategy",
    strategy
  );

  updateManualField();

}

function updateManualField() {

  const group =
    $("manualNumberGroup");

  if (!group) {
    return;
  }

  const hide =
    state.strategy === "EVEN" ||
    state.strategy === "ODD";

  group.style.display =
    hide
      ? "none"
      : "block";

}

/* =========================================================
   CREATE PREDICTION
   ========================================================= */

function createPrediction(
  data,
  strategy
) {

  if (!data) {
    return null;
  }

  const counts =
    data.counts || [];

  if (
    strategy === "MATCHES"
  ) {

    let best =
      0;

    for (
      let i = 1;
      i < counts.length;
      i++
    ) {

      if (
        counts[i] >
        counts[best]
      ) {

        best = i;

      }

    }

    return best;

  }

  if (
    strategy === "DIFFERS"
  ) {

    let least =
      0;

    for (
      let i = 1;
      i < counts.length;
      i++
    ) {

      if (
        counts[i] <
        counts[least]
      ) {

        least = i;

      }

    }

    return least;

  }

  if (
    strategy === "EVEN"
  ) {

    return "EVEN";

  }

  if (
    strategy === "ODD"
  ) {

    return "ODD";

  }

  if (
    strategy === "OVER"
  ) {

    let digit =
      data.maxDigit;

    if (
      digit <= 5
    ) {

      digit = 6;

    }

    return digit;

  }

  if (
    strategy === "UNDER"
  ) {

    let digit =
      data.maxDigit;

    if (
      digit >= 5
    ) {

      digit = 4;

    }

    return digit;

  }

  return null;

}

/* =========================================================
   START AI
   ========================================================= */

function startAI() {

  if (state.aiRunning) {
    return;
  }

  state.aiRunning =
    true;

  state.phase =
    "ANALYSIS";

  state.prediction =
    null;

  document.body.classList.add(
    "ai-running"
  );

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
    "aiCircleTimer",
    "10"
  );

  setText(
    "aiCircleStatus",
    "SCANNING LIVE DATA"
  );

  setText(
    "entryStatus",
    "ANALYZING MARKET"
  );

  setText(
    "aiPredictionLarge",
    "—"
  );

  setText(
    "aiPrediction",
    "—"
  );

  setText(
    "aiType",
    state.strategy
  );

  setText(
    "tradeStatus",
    "ANALYZING"
  );

  activateCycle(
    "cycleAnalysis"
  );

  runAnalysisPhase();

}

/* =========================================================
   STOP AI
   ========================================================= */

function stopAI() {

  state.aiRunning =
    false;

  state.phase =
    "IDLE";

  clearInterval(
    state.cycleInterval
  );

  document.body.classList.remove(
    "ai-running",
    "prediction-active",
    "trade-now"
  );

  setText(
    "aiStatus",
    "STOPPED"
  );

  setText(
    "aiCircleLabel",
    "AI READY"
  );

  setText(
    "aiCirclePrediction",
    "—"
  );

  setText(
    "aiCircleTimer",
    "10"
  );

  setText(
    "aiCircleStatus",
    "PRESS START"
  );

  setText(
    "entryStatus",
    "WAITING FOR ANALYSIS"
  );

  setText(
    "tradeStatus",
    "WAITING"
  );

  activateCycle(
    "cycleAnalysis"
  );

}

/* =========================================================
   ANALYSIS PHASE
   ========================================================= */

function runAnalysisPhase() {

  if (!state.aiRunning) {
    return;
  }

  state.phase =
    "ANALYSIS";

  state.timer =
    10;

  state.prediction =
    null;

  document.body.classList.remove(
    "prediction-active",
    "trade-now"
  );

  document.body.classList.add(
    "ai-running"
  );

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

  setText(
    "entryStatus",
    "ANALYZING MARKET"
  );

  setText(
    "tradeStatus",
    "ANALYZING"
  );

  activateCycle(
    "cycleAnalysis"
  );

  runCountdown(
    10,
    function (remaining) {

      setText(
        "aiCircleTimer",
        remaining
      );

      setText(
        "entryStatus",
        `ANALYZING MARKET — ${remaining}s`
      );

    },
    function () {

      if (!state.aiRunning) {
        return;
      }

      /* EXACT END OF 10 SEC */
      lockPrediction();

    }
  );

}

/* =========================================================
   COUNTDOWN ENGINE
   ========================================================= */

function runCountdown(
  seconds,
  onTick,
  onComplete
) {

  clearInterval(
    state.cycleInterval
  );

  let remaining =
    seconds;

  state.timer =
    remaining;

  onTick(
    remaining
  );

  state.cycleInterval =
    setInterval(
      function () {

        if (!state.aiRunning) {

          clearInterval(
            state.cycleInterval
          );

          return;

        }

        remaining--;

        if (
          remaining > 0
        ) {

          state.timer =
            remaining;

          onTick(
            remaining
          );

        } else {

          clearInterval(
            state.cycleInterval
          );

          state.timer =
            0;

          onComplete();

        }

      },
      1000
    );

}

/* =========================================================
   LOCK PREDICTION
   ========================================================= */

function lockPrediction() {

  state.phase =
    "PREDICTION";

  document.body.classList.remove(
    "ai-running"
  );

  document.body.classList.add(
    "prediction-active"
  );

  const best =
    getBestMarket();

  if (best) {

    state.market =
      best.symbol;

  }

  const selected =
    state.scores[state.market] ||
    best;

  if (!selected) {

    state.prediction =
      null;

    setText(
      "aiCircleLabel",
      "NO DATA"
    );

    setText(
      "aiCirclePrediction",
      "—"
    );

    setText(
      "aiCircleTimer",
      "5"
    );

    setText(
      "aiCircleStatus",
      "WAITING FOR TICKS"
    );

    setText(
      "entryStatus",
      "WAITING FOR LIVE DATA"
    );

    setText(
      "tradeStatus",
      "NO SIGNAL"
    );

    runEntryPhase();

    return;

  }

  /* -------------------------------------------------------
     CHOOSE STRATEGY
     ------------------------------------------------------- */

  let strategy =
    state.strategy;

  /*
     If the selected strategy is weak,
     use the market's strongest strategy.
  */

  if (
    selected.confidence < 45 &&
    selected.bestStrategy &&
    selected.bestStrategy !== "—"
  ) {

    strategy =
      selected.bestStrategy;

  }

  const prediction =
    createPrediction(
      selected,
      strategy
    );

  state.prediction =
    prediction;

  state.confidence =
    selected.confidence;

  /* -------------------------------------------------------
     SHOW PREDICTION EXACTLY NOW
     ------------------------------------------------------- */

  setText(
    "aiStatus",
    "PREDICTION LOCKED"
  );

  setText(
    "aiMarket",
    marketName(
      selected.symbol
    )
  );

  setText(
    "aiPrediction",
    prediction
  );

  setText(
    "aiType",
    strategy
  );

  setText(
    "analysisConfidence",
    selected.confidence + "%"
  );

  setText(
    "aiPredictionLarge",
    prediction
  );

  setText(
    "predictionConfidence",
    `Confidence: ${selected.confidence}%`
  );

  setText(
    "entryStatus",
    "PREDICTION LOCKED — 5 SECOND WINDOW"
  );

  setText(
    "aiCircleLabel",
    "PREDICTION"
  );

  setText(
    "aiCirclePrediction",
    prediction
  );

  setText(
    "aiCircleTimer",
    "5"
  );

  setText(
    "aiCircleStatus",
    "NEXT 5 SECONDS"
  );

  setText(
    "tradePrediction",
    prediction
  );

  setText(
    "tradeMarket",
    marketName(
      selected.symbol
    )
  );

  setText(
    "tradeConfidence",
    selected.confidence + "%"
  );

  setText(
    "tradeStatus",
    "PREDICTION LOCKED"
  );

  activateCycle(
    "cyclePrediction"
  );

  setStrategy(
    strategy
  );

  updateDigits(
    selected.symbol
  );

  updateReport(
    selected
  );

  runEntryPhase();

}

/* =========================================================
   ENTRY / PREDICTION 5 SEC
   ========================================================= */

function runEntryPhase() {

  if (!state.aiRunning) {
    return;
  }

  state.phase =
    "PREDICTION";

  state.timer =
    5;

  runCountdown(
    5,

    function (remaining) {

      if (
        state.prediction !== null
      ) {

        setText(
          "aiCirclePrediction",
          state.prediction
        );

        setText(
          "aiPredictionLarge",
          state.prediction
        );

        setText(
          "aiCircleTimer",
          remaining
        );

        setText(
          "entryStatus",
          `ENTER / PREPARE — ${remaining}s`
        );

      }

    },

    function () {

      if (!state.aiRunning) {
        return;
      }

      tradeNow();

    }
  );

}

/* =========================================================
   TRADE NOW
   ========================================================= */

function tradeNow() {

  state.phase =
    "TRADE";

  state.timer =
    3;

  document.body.classList.remove(
    "prediction-active"
  );

  document.body.classList.add(
    "trade-now"
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
    "aiCirclePrediction",
    state.prediction !== null
      ? state.prediction
      : "—"
  );

  setText(
    "aiCircleTimer",
    "3"
  );

  setText(
    "aiCircleStatus",
    "SIGNAL WINDOW"
  );

  setText(
    "entryStatus",
    "TRADE NOW"
  );

  setText(
    "tradeStatus",
    "TRADE NOW"
  );

  activateCycle(
    "cycleTrade"
  );

  /*
     Paper signal only.
  */

  recordSignal();

  runCountdown(
    3,

    function (remaining) {

      setText(
        "aiCircleTimer",
        remaining
      );

      setText(
        "entryStatus",
        `TRADE NOW — ${remaining}s`
      );

    },

    function () {

      if (!state.aiRunning) {
        return;
      }

      restartCycle();

    }
  );

}

/* =========================================================
   RESTART
   ========================================================= */

function restartCycle() {

  document.body.classList.remove(
    "trade-now"
  );

  activateCycle(
    "cycleCooldown"
  );

  setText(
    "aiCircleLabel",
    "RESTARTING"
  );

  setText(
    "aiCirclePrediction",
    "—"
  );

  setText(
    "aiCircleTimer",
    "10"
  );

  setText(
    "aiCircleStatus",
    "NEW ANALYSIS"
  );

  setText(
    "entryStatus",
    "STARTING NEW 10 SECOND ANALYSIS"
  );

  setText(
    "tradeStatus",
    "RESTARTING"
  );

  /*
     Start next analysis immediately.
  */

  setTimeout(
    function () {

      if (
        state.aiRunning
      ) {

        runAnalysisPhase();

      }

    },
    50
  );

}

/* =========================================================
   CYCLE UI
   ========================================================= */

function activateCycle(id) {

  document
    .querySelectorAll(
      ".cycle-item"
    )
    .forEach(
      function (item) {

        item.classList.remove(
          "active"
        );

      }
    );

  const element =
    $(id);

  if (element) {

    element.classList.add(
      "active"
    );

  }

}

/* =========================================================
   PAPER SIGNAL
   ========================================================= */

function recordSignal() {

  if (
    state.prediction === null
  ) {
    return;
  }

  const record = {

    id:
      Date.now(),

    time:
      new Date().toLocaleTimeString(),

    symbol:
      state.market,

    strategy:
      state.strategy,

    prediction:
      state.prediction,

    result:
      "PENDING"

  };

  state.history.unshift(
    record
  );

  if (
    state.history.length > 100
  ) {

    state.history.pop();

  }

  saveHistory();

  renderHistory();

}

/* =========================================================
   HISTORY
   ========================================================= */

function loadHistory() {

  try {

    const saved =
      localStorage.getItem(
        "KRISHWAVE_HISTORY"
      );

    if (saved) {

      state.history =
        JSON.parse(
          saved
        );

    }

  } catch (error) {

    console.error(error);

    state.history = [];

  }

}

function saveHistory() {

  try {

    localStorage.setItem(
      "KRISHWAVE_HISTORY",
      JSON.stringify(
        state.history
      )
    );

  } catch (error) {

    console.error(error);

  }

}

function renderHistory() {

  const list =
    $("historyList");

  if (!list) {
    return;
  }

  if (
    !state.history.length
  ) {

    list.innerHTML = `
      <tr>
        <td
          colspan="5"
          style="text-align:center;color:var(--muted);"
        >
          No paper signals yet.
        </td>
      </tr>
    `;

    updateHistoryStats();

    return;

  }

  let html = "";

  state.history.forEach(
    function (item) {

      const resultClass =
        item.result === "WIN"
          ? "result-win"
          : item.result === "LOSS"
            ? "result-loss"
            : "result-pending";

      html += `
        <tr>

          <td>
            ${item.time}
          </td>

          <td>
            ${marketName(item.symbol)}
          </td>

          <td>
            ${item.strategy}
          </td>

          <td>
            ${item.prediction}
          </td>

          <td class="${resultClass}">
            ${item.result}
          </td>

        </tr>
      `;

    }
  );

  list.innerHTML =
    html;

  updateHistoryStats();

}

/* =========================================================
   HISTORY STATS
   ========================================================= */

function updateHistoryStats() {

  const total =
    state.history.length;

  const wins =
    state.history.filter(
      x =>
        x.result === "WIN"
    ).length;

  const losses =
    state.history.filter(
      x =>
        x.result === "LOSS"
    ).length;

  const pending =
    state.history.filter(
      x =>
        x.result === "PENDING"
    ).length;

  const completed =
    wins + losses;

  const accuracy =
    completed
      ? Math.round(
          wins /
          completed *
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
    accuracy + "%"
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
    accuracy + "%"
  );

}

function clearHistory() {

  if (
    !confirm(
      "Clear all KRISHWAVE paper history?"
    )
  ) {
    return;
  }

  state.history = [];

  saveHistory();

  renderHistory();

}

/* =========================================================
   NAVIGATION
   ========================================================= */

function showPage(page) {

  document
    .querySelectorAll(
      ".page"
    )
    .forEach(
      function (section) {

        section.classList.remove(
          "active"
        );

      }
    );

  const target =
    $(page + "Page");

  if (target) {

    target.classList.add(
      "active"
    );

  }

  document
    .querySelectorAll(
      ".nav-btn"
    )
    .forEach(
      function (button) {

        button.classList.toggle(
          "active",
          button.dataset.page ===
            page
        );

      }
    );

}

/* =========================================================
   THEME
   ========================================================= */

function setupTheme() {

  const saved =
    localStorage.getItem(
      "KRISHWAVE_THEME"
    );

  if (
    saved === "light"
  ) {

    document.body.classList.add(
      "light"
    );

  }

  updateThemeIcon();

}

function toggleTheme() {

  document.body.classList.toggle(
    "light"
  );

  const theme =
    document.body.classList.contains(
      "light"
    )
      ? "light"
      : "dark";

  localStorage.setItem(
    "KRISHWAVE_THEME",
    theme
  );

  updateThemeIcon();

}

function updateThemeIcon() {

  const button =
    $("themeToggle");

  if (!button) {
    return;
  }

  button.textContent =
    document.body.classList.contains(
      "light"
    )
      ? "🌙"
      : "☀️";

}

/* =========================================================
   ACCOUNT MODE UI
   ========================================================= */

function setupAccountMode() {

  const demo =
    $("demoBtn");

  const real =
    $("realBtn");

  if (demo) {

    demo.addEventListener(
      "click",
      function () {

        demo.classList.add(
          "active"
        );

        if (real) {
          real.classList.remove(
            "active"
          );
        }

        setText(
          "accountMode",
          "DEMO"
        );

        setText(
          "balance",
          "—"
        );

      }
    );

  }

  if (real) {

    real.addEventListener(
      "click",
      function () {

        real.classList.add(
          "active"
        );

        if (demo) {
          demo.classList.remove(
            "active"
          );
        }

        /*
           REAL button is display-only.
           No real account connection.
        */

        setText(
          "accountMode",
          "REAL"
        );

        setText(
          "balance",
          "—"
        );

      }
    );

  }

}

/* =========================================================
   PAPER TRADING
   ========================================================= */

function setupPaperTrading() {

  const start =
    $("startTrading");

  const stop =
    $("stopTrading");

  if (start) {

    start.addEventListener(
      "click",
      function () {

        state.trading =
          true;

        setText(
          "tradeStatus",
          "PAPER TRADING ACTIVE"
        );

      }
    );

  }

  if (stop) {

    stop.addEventListener(
      "click",
      function () {

        state.trading =
          false;

        setText(
          "tradeStatus",
          "PAPER TRADING STOPPED"
        );

      }
    );

  }

}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEvents() {

  const start =
    $("startAI");

  const stop =
    $("stopAI");

  const theme =
    $("themeToggle");

  const scan =
    $("scanMarketsBtn");

  const clear =
    $("clearHistory");

  if (start) {

    start.addEventListener(
      "click",
      startAI
    );

  }

  if (stop) {

    stop.addEventListener(
      "click",
      stopAI
    );

  }

  if (theme) {

    theme.addEventListener(
      "click",
      toggleTheme
    );

  }

  if (scan) {

    scan.addEventListener(
      "click",
      scanMarkets
    );

  }

  if (clear) {

    clear.addEventListener(
      "click",
      clearHistory
    );

  }

  document
    .querySelectorAll(
      ".nav-btn"
    )
    .forEach(
      function (button) {

        button.addEventListener(
          "click",
          function () {

            showPage(
              button.dataset.page
            );

          }
        );

      }
    );

  document
    .querySelectorAll(
      ".strategy-btn"
    )
    .forEach(
      function (button) {

        button.addEventListener(
          "click",
          function () {

            setStrategy(
              button.dataset.strategy
            );

          }
        );

      }
    );

  const tradeStrategy =
    $("tradeStrategy");

  if (tradeStrategy) {

    tradeStrategy.addEventListener(
      "change",
      function () {

        setStrategy(
          tradeStrategy.value
        );

      }
    );

  }

}

/* =========================================================
   INITIAL UI
   ========================================================= */

function initializeUI() {

  setText(
    "aiStatus",
    "STOPPED"
  );

  setText(
    "aiMarket",
    "WAITING"
  );

  setText(
    "aiPrediction",
    "—"
  );

  setText(
    "aiType",
    "MATCHES"
  );

  setText(
    "analysisConfidence",
    "0%"
  );

  setText(
    "aiCircleLabel",
    "AI READY"
  );

  setText(
    "aiCirclePrediction",
    "—"
  );

  setText(
    "aiCircleTimer",
    "10"
  );

  setText(
    "aiCircleStatus",
    "PRESS START"
  );

  setText(
    "aiPredictionLarge",
    "—"
  );

  setText(
    "predictionConfidence",
    "Confidence: 0%"
  );

  setText(
    "entryStatus",
    "WAITING FOR ANALYSIS"
  );

  setText(
    "tradePrediction",
    "—"
  );

  setText(
    "tradeMarket",
    "—"
  );

  setText(
    "tradeConfidence",
    "0%"
  );

  setText(
    "tradeStatus",
    "WAITING"
  );

  setText(
    "marketScanStatus",
    "Press SCAN MARKETS to analyze all markets."
  );

  renderMarkets();

  renderTradeMarkets();

  renderHistory();

  setStrategy(
    "MATCHES"
  );

}

/* =========================================================
   START APPLICATION
   ========================================================= */

function init() {

  loadHistory();

  initializeUI();

  setupTheme();

  setupEvents();

  setupAccountMode();

  setupPaperTrading();

  connectDeriv();

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

/* =========================================================
   RUN
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);