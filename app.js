/* =========================================================
   KRISHWAVE AI BEAST V5.9
   DERIV LIVE MARKET INTELLIGENCE + OAUTH

   IMPORTANT
   ---------------------------------------------------------
   - Analysis / paper-signal mode
   - Manual number remains manual
   - AI never auto-fills manual number
   - 10 sec analysis
   - 5 sec fixed prediction
   - 3 sec TRADE NOW
   - Then immediately starts a new analysis cycle
   - Deriv OAuth uses Cloudflare Worker backend
========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
========================================================= */

const DERIV_CLIENT_ID =
  "34khasPjsT0PCRR8X3Z70";

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
   STATE
========================================================= */

let ws = null;
let authWs = null;

let connected = false;
let authenticated = false;

let selectedMarket = "R_100";
let selectedStrategy = "OVER";

let latestTicks = {};
let marketData = {};

let aiRunning = false;
let aiTimer = null;
let aiPhase = "idle";
let aiRemaining = 0;

let aiPrediction = null;
let aiPredictionType = null;
let aiPredictionMarket = null;
let aiPredictionConfidence = 0;

let currentAnalysis = null;

let paperTrading = false;
let paperTimer = null;

let history = [];

let oauthState = null;
let oauthVerifier = null;

let demoAccount = null;
let authToken = null;

let tradeStats = {
  total: 0,
  wins: 0,
  losses: 0,
  pending: 0
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

function setHTML(id, value) {
  const el = $(id);
  if (el) el.innerHTML = value;
}

function show(id, visible = true) {
  const el = $(id);
  if (!el) return;

  el.style.display = visible ? "" : "none";
}

function addClass(id, className) {
  const el = $(id);
  if (el) el.classList.add(className);
}

function removeClass(id, className) {
  const el = $(id);
  if (el) el.classList.remove(className);
}

/* =========================================================
   LOCAL STORAGE
========================================================= */

function saveHistory() {
  try {
    localStorage.setItem(
      "KRISHWAVE_HISTORY",
      JSON.stringify(history)
    );
  } catch (e) {}
}

function loadHistory() {
  try {
    const raw =
      localStorage.getItem("KRISHWAVE_HISTORY");

    if (raw) {
      history = JSON.parse(raw);
    }
  } catch (e) {
    history = [];
  }
}

/* =========================================================
   CONNECTION STATUS
========================================================= */

function setConnectionStatus(
  connectedState,
  text = null
) {
  connected = connectedState;

  const message =
    text ||
    (connectedState
      ? "DERIV LIVE"
      : "CONNECTING...");

  setText("connectionText", message);
  setText("dataStatus", message);
  setText("heroLiveText", message);

  const dots = [
    "connectionDot",
    "heroLiveDot"
  ];

  dots.forEach(id => {
    const el = $(id);
    if (!el) return;

    el.classList.toggle(
      "online",
      connectedState
    );
  });
}

/* =========================================================
   PUBLIC DERIV WEBSOCKET
========================================================= */

function connectPublicDeriv() {
  try {
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
    }

    setConnectionStatus(
      false,
      "CONNECTING..."
    );

    ws = new WebSocket(PUBLIC_WS);

    ws.onopen = () => {
      setConnectionStatus(
        true,
        "DERIV LIVE"
      );

      subscribeMarkets();
    };

    ws.onmessage = event => {
      try {
        const data =
          JSON.parse(event.data);

        handleDerivMessage(data);
      } catch (error) {
        console.error(
          "Deriv message error",
          error
        );
      }
    };

    ws.onerror = error => {
      console.error(
        "Deriv websocket error",
        error
      );

      setConnectionStatus(
        false,
        "CONNECTION ERROR"
      );
    };

    ws.onclose = () => {
      setConnectionStatus(
        false,
        "RECONNECTING..."
      );

      setTimeout(() => {
        if (!ws ||
            ws.readyState === WebSocket.CLOSED) {
          connectPublicDeriv();
        }
      }, 5000);
    };

  } catch (error) {
    console.error(error);

    setConnectionStatus(
      false,
      "OFFLINE"
    );
  }
}

/* =========================================================
   SUBSCRIBE MARKETS
========================================================= */

function subscribeMarkets() {
  if (
    !ws ||
    ws.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  MARKETS.forEach(symbol => {

    ws.send(
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

  if (!data) return;

  if (data.error) {
    console.warn(
      "Deriv API error:",
      data.error
    );
    return;
  }

  if (
    data.msg_type === "tick" &&
    data.tick
  ) {
    processTick(data.tick);
  }
}

/* =========================================================
   TICK PROCESSING
========================================================= */

function processTick(tick) {

  const symbol = tick.symbol;

  if (!symbol) return;

  const quote =
    Number(tick.quote);

  if (!Number.isFinite(quote)) {
    return;
  }

  const digit =
    getLastDigit(
      tick.quote,
      tick.pip_size
    );

  if (!marketData[symbol]) {

    marketData[symbol] = {
      symbol,
      ticks: [],
      digits: [],
      quotes: [],
      lastDigit: null,
      lastQuote: null,
      updated: Date.now()
    };

  }

  const data =
    marketData[symbol];

  data.ticks.push(tick);
  data.digits.push(digit);
  data.quotes.push(quote);

  if (data.ticks.length > 300) {
    data.ticks.shift();
  }

  if (data.digits.length > 300) {
    data.digits.shift();
  }

  if (data.quotes.length > 300) {
    data.quotes.shift();
  }

  data.lastDigit = digit;
  data.lastQuote = quote;
  data.updated = Date.now();

  latestTicks[symbol] = tick;

  if (symbol === selectedMarket) {
    updateSelectedMarketUI();
  }

  updateMarketScanner();
}

/* =========================================================
   LAST DIGIT
========================================================= */

function getLastDigit(
  quote,
  pipSize
) {

  let decimals = 2;

  if (
    Number.isInteger(pipSize) &&
    pipSize >= 0 &&
    pipSize <= 8
  ) {
    decimals = pipSize;
  }

  const fixed =
    Number(quote).toFixed(decimals);

  const digits =
    fixed.replace(
      /\D/g,
      ""
    );

  if (!digits.length) {
    return 0;
  }

  return Number(
    digits[digits.length - 1]
  );
}

/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket(symbol) {

  const data =
    marketData[symbol];

  if (!data ||
      !data.digits ||
      data.digits.length < 5) {

    return {
      symbol,
      ready: false,
      score: 0,
      strength: "WAITING",
      stability: 0,
      concentration: 0,
      streak: 0,
      agreement: 0,
      lastDigit: null,
      even: 0,
      odd: 0,
      high: 0,
      low: 0,
      over: {},
      under: {},
      match: {},
      differ: {},
      prediction: null,
      predictionType: selectedStrategy,
      confidence: 0
    };

  }

  const digits =
    data.digits.slice(-100);

  const counts =
    Array(10).fill(0);

  digits.forEach(d => {
    if (
      Number.isInteger(d) &&
      d >= 0 &&
      d <= 9
    ) {
      counts[d]++;
    }
  });

  const total =
    digits.length;

  let mostDigit = 0;

  for (let i = 1; i < 10; i++) {
    if (
      counts[i] >
      counts[mostDigit]
    ) {
      mostDigit = i;
    }
  }

  const concentration =
    total
      ? Math.round(
          (counts[mostDigit] / total) *
          100
        )
      : 0;

  let evenCount = 0;

  digits.forEach(d => {
    if (d % 2 === 0) {
      evenCount++;
    }
  });

  const oddCount =
    total - evenCount;

  const even =
    Math.round(
      (evenCount / total) * 100
    );

  const odd =
    Math.round(
      (oddCount / total) * 100
    );

  let highCount = 0;

  digits.forEach(d => {
    if (d >= 5) {
      highCount++;
    }
  });

  const lowCount =
    total - highCount;

  const high =
    Math.round(
      (highCount / total) * 100
    );

  const low =
    Math.round(
      (lowCount / total) * 100
    );

  const over = {};
  const under = {};

  for (let n = 0; n <= 9; n++) {

    const overCount =
      digits.filter(
        d => d > n
      ).length;

    const underCount =
      digits.filter(
        d => d < n
      ).length;

    over[n] =
      Math.round(
        (overCount / total) * 100
      );

    under[n] =
      Math.round(
        (underCount / total) * 100
      );

  }

  const match = {};
  const differ = {};

  for (let n = 0; n <= 9; n++) {

    const matchCount =
      digits.filter(
        d => d === n
      ).length;

    match[n] =
      Math.round(
        (matchCount / total) * 100
      );

    differ[n] =
      100 - match[n];

  }

  let streak = 1;

  const last =
    digits[digits.length - 1];

  for (
    let i = digits.length - 2;
    i >= 0;
    i--
  ) {

    if (
      digits[i] === last
    ) {
      streak++;
    } else {
      break;
    }

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

  const stability =
    total > 1
      ? Math.round(
          (changes /
            (total - 1)) *
          100
        )
      : 0;

  const parityAgreement =
    Math.abs(even - odd);

  const highLowAgreement =
    Math.abs(high - low);

  const agreement =
    Math.round(
      (
        parityAgreement +
        highLowAgreement +
        Math.min(
          concentration,
          100
        )
      ) / 3
    );

  const score =
    calculateMarketScore({
      concentration,
      stability,
      agreement,
      even,
      odd,
      high,
      low,
      streak
    });

  const prediction =
    makePrediction({
      digits,
      counts,
      even,
      odd,
      high,
      low,
      over,
      under,
      match,
      differ,
      strategy:
        selectedStrategy
    });

  return {
    symbol,
    ready: true,
    score,
    strength:
      getStrength(score),
    stability,
    concentration,
    streak,
    agreement,
    lastDigit: last,
    even,
    odd,
    high,
    low,
    over,
    under,
    match,
    differ,
    prediction:
      prediction.value,
    predictionType:
      prediction.type,
    confidence:
      prediction.confidence
  };
}

/* =========================================================
   MARKET SCORE
========================================================= */

function calculateMarketScore(obj) {

  let score = 50;

  score +=
    Math.min(
      obj.concentration,
      25
    );

  score +=
    Math.min(
      obj.agreement,
      15
    );

  score +=
    Math.min(
      obj.streak * 2,
      10
    );

  score -=
    Math.min(
      obj.stability * 0.1,
      10
    );

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(score)
    )
  );
}

/* =========================================================
   STRENGTH
========================================================= */

function getStrength(score) {

  if (score >= 85)
    return "EXTREME";

  if (score >= 75)
    return "STRONG";

  if (score >= 65)
    return "GOOD";

  if (score >= 55)
    return "MODERATE";

  return "WEAK";
}

/* =========================================================
   PREDICTION ENGINE
========================================================= */

function makePrediction({
  digits,
  counts,
  even,
  odd,
  high,
  low,
  over,
  under,
  match,
  differ,
  strategy
}) {

  if (!digits.length) {
    return {
      value: "--",
      type: strategy,
      confidence: 0
    };
  }

  let value = null;
  let confidence = 50;

  switch (strategy) {

    case "EVEN":
      value =
        even >= odd
          ? "EVEN"
          : "ODD";

      confidence =
        Math.max(
          even,
          odd
        );

      break;

    case "ODD":
      value =
        odd >= even
          ? "ODD"
          : "EVEN";

      confidence =
        Math.max(
          even,
          odd
        );

      break;

    case "HIGH":
      value =
        high >= low
          ? "HIGH"
          : "LOW";

      confidence =
        Math.max(
          high,
          low
        );

      break;

    case "LOW":
      value =
        low >= high
          ? "LOW"
          : "HIGH";

      confidence =
        Math.max(
          high,
          low
        );

      break;

    case "OVER": {

      let best =
        0;

      for (
        let n = 0;
        n <= 9;
        n++
      ) {

        if (
          over[n] >
          over[best]
        ) {
          best = n;
        }

      }

      value = best;
      confidence =
        over[best];

      break;
    }

    case "UNDER": {

      let best =
        9;

      for (
        let n = 0;
        n <= 9;
        n++
      ) {

        if (
          under[n] >
          under[best]
        ) {
          best = n;
        }

      }

      value = best;
      confidence =
        under[best];

      break;
    }

    case "MATCH": {

      let best =
        0;

      for (
        let n = 1;
        n <= 9;
        n++
      ) {

        if (
          match[n] >
          match[best]
        ) {
          best = n;
        }

      }

      value = best;
      confidence =
        match[best];

      break;
    }

    case "DIFFER": {

      let best =
        0;

      for (
        let n = 1;
        n <= 9;
        n++
      ) {

        if (
          differ[n] >
          differ[best]
        ) {
          best = n;
        }

      }

      value = best;
      confidence =
        differ[best];

      break;
    }

    default: {

      let best =
        0;

      for (
        let n = 1;
        n <= 9;
        n++
      ) {

        if (
          counts[n] >
          counts[best]
        ) {
          best = n;
        }

      }

      value =
        best;

      confidence =
        Math.round(
          (
            counts[best] /
            digits.length
          ) * 100
        );

    }

  }

  return {
    value,
    type: strategy,
    confidence:
      Math.min(
        99,
        Math.max(
          50,
          Math.round(
            confidence
          )
        )
      )
  };
}

/* =========================================================
   BEST MARKET
========================================================= */

function findBestMarket() {

  let best = null;

  MARKETS.forEach(symbol => {

    const analysis =
      analyzeMarket(symbol);

    if (!analysis.ready) {
      return;
    }

    if (
      !best ||
      analysis.score >
      best.score
    ) {
      best = analysis;
    }

  });

  return best;
}

/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigits(symbol) {

  const container =
    $("digits");

  if (!container) return;

  const data =
    marketData[symbol];

  if (!data ||
      !data.digits.length) {

    container.innerHTML =
      "<div>No tick data yet.</div>";

    return;
  }

  const digits =
    data.digits.slice(-100);

  const counts =
    Array(10).fill(0);

  digits.forEach(d => {
    counts[d]++;
  });

  const total =
    digits.length;

  let html = "";

  for (
    let i = 0;
    i <= 9;
    i++
  ) {

    const percent =
      Math.round(
        (counts[i] / total) *
        100
      );

    html += `
      <div class="digit-row">
        <div class="digit-number">${i}</div>
        <div class="digit-bar">
          <div
            class="digit-fill"
            style="width:${percent}%"
          ></div>
        </div>
        <div class="digit-percent">
          ${percent}%
        </div>
      </div>
    `;

  }

  container.innerHTML = html;
}

/* =========================================================
   SELECTED MARKET UI
========================================================= */

function updateSelectedMarketUI() {

  const analysis =
    analyzeMarket(
      selectedMarket
    );

  setText(
    "lastQuote",
    marketData[selectedMarket]?.lastQuote ??
      "--"
  );

  setText(
    "lastDigit",
    analysis.lastDigit ??
      "--"
  );

  renderDigits(
    selectedMarket
  );
}

/* =========================================================
   MARKET SCANNER
========================================================= */

function updateMarketScanner() {

  const container =
    $("markets");

  if (!container) return;

  let html = "";

  MARKETS.forEach(symbol => {

    const analysis =
      analyzeMarket(symbol);

    const good =
      analysis.ready &&
      analysis.score >= 65;

    html += `
      <div class="market-card ${
        good
          ? "market-good"
          : ""
      }"
      data-market="${symbol}">

        <div class="market-name">
          ${symbol}
        </div>

        <div class="market-score">
          ${
            analysis.ready
              ? analysis.score
              : "--"
          }
        </div>

        <div class="market-strength">
          ${
            analysis.ready
              ? analysis.strength
              : "WAITING"
          }
        </div>

        <div class="market-last">
          Last digit:
          ${
            analysis.lastDigit ??
            "--"
          }
        </div>

      </div>
    `;

  });

  container.innerHTML = html;

  document
    .querySelectorAll(
      ".market-card"
    )
    .forEach(card => {

      card.addEventListener(
        "click",
        () => {

          const symbol =
            card.dataset.market;

          if (!symbol) return;

          selectedMarket =
            symbol;

          const symbolInput =
            $("symbol");

          if (symbolInput) {
            symbolInput.value =
              symbol;
          }

          updateSelectedMarketUI();
          updateMarketScanner();

        }
      );

    });
}

/* =========================================================
   AI MARKET SCANNER
========================================================= */

function scanMarkets() {

  setText(
    "marketScanStatus",
    "SCANNING..."
  );

  const results =
    MARKETS
      .map(symbol =>
        analyzeMarket(symbol)
      )
      .filter(x =>
        x.ready
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const container =
    $("tradeMarkets");

  if (!container) {
    setText(
      "marketScanStatus",
      "SCAN COMPLETE"
    );
    return;
  }

  if (!results.length) {

    container.innerHTML =
      `<div class="empty-state">
        Waiting for live tick data...
      </div>`;

    setText(
      "marketScanStatus",
      "WAITING FOR DATA"
    );

    return;
  }

  let html = "";

  results.forEach((item, index) => {

    html += `
      <div
        class="trade-market-card ${
          index === 0
            ? "best-market"
            : ""
        }"
        data-market="${item.symbol}"
      >

        <div>
          <strong>
            ${item.symbol}
          </strong>

          <div>
            ${item.strength}
          </div>
        </div>

        <div>
          <strong>
            ${item.score}%
          </strong>

          <div>
            ${
              item.predictionType
            }:
            ${
              item.prediction
            }
          </div>
        </div>

      </div>
    `;

  });

  container.innerHTML =
    html;

  document
    .querySelectorAll(
      ".trade-market-card"
    )
    .forEach(card => {

      card.addEventListener(
        "click",
        () => {

          selectedMarket =
            card.dataset.market;

          const input =
            $("symbol");

          if (input) {
            input.value =
              selectedMarket;
          }

          updateSelectedMarketUI();

        }
      );

    });

  setText(
    "marketScanStatus",
    `${results.length} MARKETS SCANNED`
  );
}

/* =========================================================
   AI REPORT
========================================================= */

function renderAIReport(
  analysis
) {

  if (!analysis) return;

  setText(
    "reportMarket",
    analysis.symbol
  );

  setText(
    "reportScore",
    `${analysis.score}%`
  );

  setText(
    "reportStrength",
    analysis.strength
  );

  setText(
    "reportStability",
    `${analysis.stability}%`
  );

  setText(
    "reportConcentration",
    `${analysis.concentration}%`
  );

  setText(
    "reportStreak",
    `${analysis.streak}`
  );

  setText(
    "reportAgreement",
    `${analysis.agreement}%`
  );
}

/* =========================================================
   AI CIRCLE
========================================================= */

function updateAICircle(
  label,
  prediction,
  timer,
  status
) {

  setText(
    "aiCircleLabel",
    label
  );

  setText(
    "aiCirclePrediction",
    prediction
  );

  setText(
    "aiCircleTimer",
    timer
  );

  setText(
    "aiCircleStatus",
    status
  );
}

/* =========================================================
   AI STATUS
========================================================= */

function updateAIStatus(
  market,
  prediction,
  type,
  confidence
) {

  setText(
    "aiStatus",
    aiPhase.toUpperCase()
  );

  setText(
    "aiMarket",
    market || "--"
  );

  setText(
    "aiPrediction",
    prediction ?? "--"
  );

  setText(
    "aiType",
    type || "--"
  );

  setText(
    "analysisConfidence",
    confidence
      ? `${confidence}%`
      : "--"
  );
}

/* =========================================================
   AI CYCLE
========================================================= */

function startAICycle() {

  if (aiRunning) return;

  aiRunning = true;

  clearInterval(aiTimer);

  runAnalysisPhase();
}

/* =========================================================
   10 SECOND ANALYSIS
========================================================= */

function runAnalysisPhase() {

  if (!aiRunning) return;

  aiPhase =
    "analysis";

  aiRemaining =
    10;

  currentAnalysis =
    null;

  aiPrediction =
    null;

  aiPredictionType =
    null;

  aiPredictionMarket =
    null;

  aiPredictionConfidence =
    0;

  addClass(
    "aiCircle",
    "prediction-active"
  );

  removeClass(
    "aiCircle",
    "trade-now"
  );

  setText(
    "analysisMsg",
    "AI BEAST is analyzing live market data..."
  );

  setText(
    "cycleAnalysis",
    "10s"
  );

  setText(
    "cyclePrediction",
    "5s"
  );

  setText(
    "cycleTrade",
    "3s"
  );

  updateAICircle(
    "ANALYZING",
    "...",
    aiRemaining,
    "SCANNING LIVE TICKS"
  );

  updateAIStatus(
    "SCANNING",
    "--",
    "ANALYSIS",
    0
  );

  clearInterval(aiTimer);

  aiTimer =
    setInterval(
      () => {

        if (!aiRunning) {
          clearInterval(aiTimer);
          return;
        }

        aiRemaining--;

        updateAICircle(
          "ANALYZING",
          "...",
          aiRemaining,
          "SCANNING LIVE TICKS"
        );

        if (
          aiRemaining <= 0
        ) {

          clearInterval(aiTimer);

          finishAnalysisPhase();

        }

      },
      1000
    );
}

/* =========================================================
   FINISH ANALYSIS
========================================================= */

function finishAnalysisPhase() {

  if (!aiRunning) return;

  let best =
    findBestMarket();

  if (!best) {

    best =
      analyzeMarket(
        selectedMarket
      );

  }

  if (!best ||
      !best.ready) {

    setText(
      "analysisMsg",
      "Waiting for enough live tick data..."
    );

    setTimeout(() => {

      if (aiRunning) {
        runAnalysisPhase();
      }

    }, 1000);

    return;
  }

  currentAnalysis =
    best;

  aiPrediction =
    best.prediction;

  aiPredictionType =
    best.predictionType;

  aiPredictionMarket =
    best.symbol;

  aiPredictionConfidence =
    best.confidence;

  selectedMarket =
    best.symbol;

  const symbolInput =
    $("symbol");

  if (symbolInput) {
    symbolInput.value =
      selectedMarket;
  }

  renderAIReport(
    best
  );

  setText(
    "aiPredictionLarge",
    best.prediction
  );

  setText(
    "predictionConfidence",
    `${best.confidence}%`
  );

  setText(
    "tradePrediction",
    best.prediction
  );

  setText(
    "tradeMarket",
    best.symbol
  );

  setText(
    "tradeConfidence",
    `${best.confidence}%`
  );

  updateAIStatus(
    best.symbol,
    best.prediction,
    best.predictionType,
    best.confidence
  );

  setText(
    "analysisMsg",
    `Prediction locked: ${best.prediction}`
  );

  runPredictionPhase();

}

/* =========================================================
   5 SECOND PREDICTION
========================================================= */

function runPredictionPhase() {

  if (!aiRunning) return;

  aiPhase =
    "prediction";

  aiRemaining =
    5;

  removeClass(
    "aiCircle",
    "prediction-active"
  );

  updateAICircle(
    "PREDICTION",
    aiPrediction,
    aiRemaining,
    "LOCKED"
  );

  clearInterval(aiTimer);

  aiTimer =
    setInterval(
      () => {

        if (!aiRunning) {
          clearInterval(aiTimer);
          return;
        }

        aiRemaining--;

        updateAICircle(
          "PREDICTION",
          aiPrediction,
          aiRemaining,
          "LOCKED"
        );

        if (
          aiRemaining <= 0
        ) {

          clearInterval(aiTimer);

          runTradeNowPhase();

        }

      },
      1000
    );
}

/* =========================================================
   3 SECOND TRADE NOW
========================================================= */

function runTradeNowPhase() {

  if (!aiRunning) return;

  aiPhase =
    "trade-now";

  aiRemaining =
    3;

  addClass(
    "aiCircle",
    "trade-now"
  );

  setText(
    "entryStatus",
    "TRADE NOW"
  );

  setText(
    "tradeStatus",
    "TRADE NOW"
  );

  updateAICircle(
    "TRADE NOW",
    aiPrediction,
    aiRemaining,
    "ENTRY WINDOW"
  );

  setText(
    "analysisMsg",
    `TRADE NOW — ${aiPredictionMarket} — ${aiPredictionType} ${aiPrediction}`
  );

  clearInterval(aiTimer);

  aiTimer =
    setInterval(
      () => {

        if (!aiRunning) {
          clearInterval(aiTimer);
          return;
        }

        aiRemaining--;

        updateAICircle(
          "TRADE NOW",
          aiPrediction,
          aiRemaining,
          "ENTRY WINDOW"
        );

        if (
          aiRemaining <= 0
        ) {

          clearInterval(aiTimer);

          removeClass(
            "aiCircle",
            "trade-now"
          );

          if (paperTrading) {
            registerPaperSignal();
          }

          runAnalysisPhase();

        }

      },
      1000
    );
}

/* =========================================================
   STOP AI
========================================================= */

function stopAICycle() {

  aiRunning = false;

  clearInterval(aiTimer);

  aiPhase =
    "idle";

  aiRemaining =
    0;

  removeClass(
    "aiCircle",
    "prediction-active"
  );

  removeClass(
    "aiCircle",
    "trade-now"
  );

  updateAICircle(
    "AI READY",
    "--",
    "--",
    "STOPPED"
  );

  setText(
    "aiStatus",
    "STOPPED"
  );

  setText(
    "analysisMsg",
    "AI BEAST stopped."
  );

  setText(
    "entryStatus",
    "WAITING"
  );

  setText(
    "tradeStatus",
    "WAITING"
  );
}

/* =========================================================
   PAPER SIGNAL
========================================================= */

function registerPaperSignal() {

  if (
    !currentAnalysis
  ) return;

  const item = {

    id:
      Date.now(),

    time:
      new Date().toISOString(),

    market:
      currentAnalysis.symbol,

    strategy:
      currentAnalysis.predictionType,

    prediction:
      currentAnalysis.prediction,

    confidence:
      currentAnalysis.confidence,

    status:
      "PENDING"

  };

  history.unshift(item);

  if (
    history.length >
    100
  ) {
    history.pop();
  }

  tradeStats.total++;
  tradeStats.pending++;

  saveHistory();

  renderHistory();
  renderTradeStats();
}

/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

  const container =
    $("historyList");

  if (!container) return;

  if (!history.length) {

    container.innerHTML =
      `<div class="empty-state">
        No paper signals yet.
      </div>`;

    return;
  }

  let html = "";

  history.forEach(item => {

    html += `
      <div class="history-item">

        <div>
          <strong>
            ${item.market}
          </strong>

          <small>
            ${item.strategy}
          </small>
        </div>

        <div>
          <strong>
            ${item.prediction}
          </strong>

          <small>
            ${item.confidence}%
          </small>
        </div>

        <div>
          ${item.status}
        </div>

      </div>
    `;

  });

  container.innerHTML =
    html;
}

/* =========================================================
   TRADE STATS
========================================================= */

function renderTradeStats() {

  setText(
    "tradeTotal",
    tradeStats.total
  );

  setText(
    "tradeWins",
    tradeStats.wins
  );

  setText(
    "tradeLosses",
    tradeStats.losses
  );

  setText(
    "tradePending",
    tradeStats.pending
  );

  const settled =
    tradeStats.wins +
    tradeStats.losses;

  const accuracy =
    settled
      ? Math.round(
          (
            tradeStats.wins /
            settled
          ) * 100
        )
      : 0;

  setText(
    "tradeAccuracy",
    `${accuracy}%`
  );

  setText(
    "historyTotal",
    tradeStats.total
  );

  setText(
    "historyWins",
    tradeStats.wins
  );

  setText(
    "historyLosses",
    tradeStats.losses
  );

  setText(
    "historyPending",
    tradeStats.pending
  );

  setText(
    "historyAccuracy",
    `${accuracy}%`
  );
}

/* =========================================================
   CLEAR HISTORY
========================================================= */

function clearHistory() {

  history = [];

  tradeStats = {
    total: 0,
    wins: 0,
    losses: 0,
    pending: 0
  };

  saveHistory();

  renderHistory();
  renderTradeStats();
}

/* =========================================================
   PKCE
========================================================= */

function randomString(length = 64) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  let result = "";

  const values =
    new Uint8Array(length);

  crypto.getRandomValues(
    values
  );

  values.forEach(value => {

    result +=
      chars[
        value % chars.length
      ];

  });

  return result;
}

async function sha256(value) {

  const encoder =
    new TextEncoder();

  return crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value)
  );
}

function base64UrlEncode(buffer) {

  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  bytes.forEach(byte => {
    binary +=
      String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function createPKCE() {

  oauthVerifier =
    randomString(64);

  const digest =
    await sha256(
      oauthVerifier
    );

  const challenge =
    base64UrlEncode(
      digest
    );

  return challenge;
}

/* =========================================================
   OAUTH LOGIN
========================================================= */

async function connectDeriv() {

  try {

    const challenge =
      await createPKCE();

    oauthState =
      randomString(32);

    sessionStorage.setItem(
      "KRISHWAVE_OAUTH_STATE",
      oauthState
    );

    sessionStorage.setItem(
      "KRISHWAVE_OAUTH_VERIFIER",
      oauthVerifier
    );

    const params =
      new URLSearchParams();

    params.set(
      "response_type",
      "code"
    );

    params.set(
      "client_id",
      DERIV_CLIENT_ID
    );

    params.set(
      "redirect_uri",
      REDIRECT_URI
    );

    params.set(
      "scope",
      "trade"
    );

    params.set(
      "state",
      oauthState
    );

    params.set(
      "code_challenge",
      challenge
    );

    params.set(
      "code_challenge_method",
      "S256"
    );

    const authURL =
      "https://auth.deriv.com/oauth2/auth?" +
      params.toString();

    console.log(
      "KRISHWAVE OAuth client:",
      DERIV_CLIENT_ID
    );

    window.location.href =
      authURL;

  } catch (error) {

    console.error(
      "OAuth start error",
      error
    );

    setText(
      "authStatus",
      "OAuth start failed"
    );

  }

}

/* =========================================================
   OAUTH CALLBACK
========================================================= */

async function handleOAuthCallback() {

  const url =
    new URL(
      window.location.href
    );

  const code =
    url.searchParams.get(
      "code"
    );

  const state =
    url.searchParams.get(
      "state"
    );

  const error =
    url.searchParams.get(
      "error"
    );

  if (error) {

    setText(
      "authStatus",
      `OAuth error: ${error}`
    );

    return;

  }

  if (!code) {
    return;
  }

  const savedState =
    sessionStorage.getItem(
      "KRISHWAVE_OAUTH_STATE"
    );

  const verifier =
    sessionStorage.getItem(
      "KRISHWAVE_OAUTH_VERIFIER"
    );

  if (
    !state ||
    !savedState ||
    state !== savedState
  ) {

    setText(
      "authStatus",
      "OAuth security check failed"
    );

    return;
  }

  if (!verifier) {

    setText(
      "authStatus",
      "PKCE verifier missing"
    );

    return;
  }

  setText(
    "authStatus",
    "Connecting to Deriv..."
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

    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data.error ||
        "OAuth exchange failed"
      );

    }

    authToken =
      data.access_token;

    authenticated =
      true;

    sessionStorage.setItem(
      "KRISHWAVE_AUTH_TOKEN",
      authToken
    );

    setText(
      "authStatus",
      "DERIV ACCOUNT CONNECTED"
    );

    cleanOAuthURL();

    await discoverDemoAccount();

  } catch (error) {

    console.error(
      "OAuth callback error",
      error
    );

    setText(
      "authStatus",
      error.message ||
      "Deriv connection failed"
    );

  }

}

/* =========================================================
   CLEAN CALLBACK URL
========================================================= */

function cleanOAuthURL() {

  try {

    const clean =
      window.location.origin +
      window.location.pathname;

    window.history.replaceState(
      {},
      document.title,
      clean
    );

  } catch (e) {}

}

/* =========================================================
   OPTIONS ACCOUNT DISCOVERY
========================================================= */

async function discoverDemoAccount() {

  if (!authToken) {
    return;
  }

  try {

    const response =
      await fetch(
        "https://api.derivws.com/trading/v1/options/accounts",
        {
          method: "GET",

          headers: {
            "Authorization":
              `Bearer ${authToken}`,
            "Accept":
              "application/json"
          }
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.message ||
        data.error ||
        "Unable to get accounts"
      );

    }

    const accounts =
      extractAccounts(data);

    const demo =
      accounts.find(
        account =>
          account.is_demo === true ||
          account.environment === "demo" ||
          account.type === "demo"
      ) ||
      accounts[0];

    if (!demo) {

      setText(
        "authStatus",
        "No Options account found"
      );

      return;
    }

    demoAccount =
      demo;

    setText(
      "derivAccountId",
      demo.account_id ||
      demo.id ||
      "--"
    );

    setText(
      "derivCurrency",
      demo.currency ||
      "--"
    );

    setText(
      "derivAuthConnection",
      "AUTHENTICATED"
    );

    await connectAuthenticatedDemo();

  } catch (error) {

    console.error(
      "Account discovery error",
      error
    );

    setText(
      "authStatus",
      error.message ||
      "Account discovery failed"
    );

  }

}

/* =========================================================
   ACCOUNT EXTRACTION
========================================================= */

function extractAccounts(data) {

  if (
    Array.isArray(data)
  ) {
    return data;
  }

  if (
    data &&
    Array.isArray(
      data.accounts
    )
  ) {
    return data.accounts;
  }

  if (
    data &&
    data.data &&
    Array.isArray(
      data.data.accounts
    )
  ) {
    return data.data.accounts;
  }

  if (
    data &&
    data.data &&
    Array.isArray(
      data.data
    )
  ) {
    return data.data;
  }

  return [];
}

/* =========================================================
   OTP
========================================================= */

async function requestDemoOTP(
  accountId
) {

  if (!authToken) {
    throw new Error(
      "Not authenticated"
    );
  }

  const response =
    await fetch(
      `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${authToken}`,
          "Accept":
            "application/json"
        }
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data.message ||
      data.error ||
      "OTP request failed"
    );

  }

  return data;
}

/* =========================================================
   AUTHENTICATED DEMO WEBSOCKET
========================================================= */

async function connectAuthenticatedDemo() {

  if (
    !demoAccount ||
    !authToken
  ) {
    return;
  }

  const accountId =
    demoAccount.account_id ||
    demoAccount.id;

  if (!accountId) {
    return;
  }

  try {

    const otpResponse =
      await requestDemoOTP(
        accountId
      );

    const socketURL =
      extractOTPWebSocketURL(
        otpResponse
      );

    if (!socketURL) {

      console.warn(
        "No authenticated websocket URL returned",
        otpResponse
      );

      return;
    }

    if (authWs) {

      try {
        authWs.close();
      } catch (e) {}

    }

    authWs =
      new WebSocket(
        socketURL
      );

    authWs.onopen = () => {

      setText(
        "derivAuthConnection",
        "DEMO LIVE"
      );

      try {

        authWs.send(
          JSON.stringify({
            balance: 1,
            subscribe: 1
          })
        );

      } catch (e) {}

    };

    authWs.onmessage =
      event => {

        try {

          const data =
            JSON.parse(
              event.data
            );

          handleAuthenticatedMessage(
            data
          );

        } catch (e) {

          console.error(
            "Auth WS message error",
            e
          );

        }

      };

    authWs.onerror =
      error => {

        console.error(
          "Authenticated websocket error",
          error
        );

      };

    authWs.onclose =
      () => {

        setText(
          "derivAuthConnection",
          "DISCONNECTED"
        );

      };

  } catch (error) {

    console.error(
      "Authenticated demo connection error",
      error
    );

  }

}

/* =========================================================
   OTP URL EXTRACTION
========================================================= */

function extractOTPWebSocketURL(
  data
) {

  const possible = [

    data?.websocket_url,

    data?.websocketUrl,

    data?.url,

    data?.data?.websocket_url,

    data?.data?.websocketUrl,

    data?.data?.url,

    data?.otp?.websocket_url,

    data?.otp?.websocketUrl,

    data?.otp?.url

  ];

  return possible.find(
    value =>
      typeof value ===
      "string" &&
      value.startsWith(
        "ws"
      )
  );
}

/* =========================================================
   AUTH MESSAGE
========================================================= */

function handleAuthenticatedMessage(
  data
) {

  if (!data) return;

  if (
    data.error
  ) {

    console.warn(
      "Authenticated API error:",
      data.error
    );

    return;
  }

  if (
    data.msg_type ===
    "balance"
  ) {

    const balance =
      data.balance;

    let value =
      balance?.balance;

    let currency =
      balance?.currency;

    if (
      value !== undefined
    ) {

      setText(
        "accountBalance",
        `${value} ${
          currency || ""
        }`
      );

      setText(
        "accountMode",
        "DEMO"
      );

    }

  }

}

/* =========================================================
   DISCONNECT DERIV
========================================================= */

function disconnectDeriv() {

  authToken =
    null;

  authenticated =
    false;

  demoAccount =
    null;

  sessionStorage.removeItem(
    "KRISHWAVE_AUTH_TOKEN"
  );

  sessionStorage.removeItem(
    "KRISHWAVE_OAUTH_STATE"
  );

  sessionStorage.removeItem(
    "KRISHWAVE_OAUTH_VERIFIER"
  );

  if (authWs) {

    try {
      authWs.close();
    } catch (e) {}

    authWs =
      null;
  }

  setText(
    "authStatus",
    "NOT CONNECTED"
  );

  setText(
    "derivAuthConnection",
    "DISCONNECTED"
  );

  setText(
    "derivAccountId",
    "--"
  );

}

/* =========================================================
   RESTORE SESSION
========================================================= */

function restoreSession() {

  try {

    const token =
      sessionStorage.getItem(
        "KRISHWAVE_AUTH_TOKEN"
      );

    if (token) {

      authToken =
        token;

      authenticated =
        true;

      setText(
        "authStatus",
        "SESSION ACTIVE"
      );

    }

  } catch (e) {}

}

/* =========================================================
   STRATEGY SELECTION
========================================================= */

function setStrategy(
  strategy
) {

  if (!strategy) return;

  selectedStrategy =
    strategy.toUpperCase();

  document
    .querySelectorAll(
      "[data-strategy]"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.strategy
          ?.toUpperCase() ===
        selectedStrategy
      );

    });

  const tradeStrategy =
    $("tradeStrategy");

  if (tradeStrategy) {
    tradeStrategy.value =
      selectedStrategy;
  }

  updateSelectedMarketUI();
}

/* =========================================================
   TRADE FORM
========================================================= */

function updateManualNumberVisibility() {

  const group =
    $("manualNumberGroup");

  if (!group) return;

  const needsNumber =
    [
      "MATCH",
      "DIFFER",
      "OVER",
      "UNDER"
    ].includes(
      selectedStrategy
    );

  group.style.display =
    needsNumber
      ? ""
      : "none";
}

/* =========================================================
   PAPER TRADING TOGGLE
========================================================= */

function startPaperTrading() {

  paperTrading =
    true;

  setText(
    "tradeStatus",
    "PAPER MODE"
  );

}

function stopPaperTrading() {

  paperTrading =
    false;

  setText(
    "tradeStatus",
    "STOPPED"
  );
}

/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {

  document
    .querySelectorAll(
      "[data-page]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const page =
            button.dataset.page;

          if (!page) return;

          document
            .querySelectorAll(
              ".page"
            )
            .forEach(el => {

              el.classList.toggle(
                "active",
                el.id ===
                page
              );

            });

          document
            .querySelectorAll(
              "[data-page]"
            )
            .forEach(el => {

              el.classList.toggle(
                "active",
                el.dataset.page ===
                page
              );

            });

        }
      );

    });

}

/* =========================================================
   THEME
========================================================= */

function setupTheme() {

  const button =
    $("themeToggle");

  if (!button) return;

  const saved =
    localStorage.getItem(
      "KRISHWAVE_THEME"
    );

  if (saved === "light") {

    document.body.classList.add(
      "light"
    );

  }

  button.addEventListener(
    "click",
    () => {

      document.body.classList.toggle(
        "light"
      );

      localStorage.setItem(
        "KRISHWAVE_THEME",
        document.body.classList.contains(
          "light"
        )
          ? "light"
          : "dark"
      );

    }
  );

}

/* =========================================================
   DEMO MODE BUTTON
========================================================= */

function setupDemoMode() {

  const button =
    $("demoModeBtn");

  if (!button) return;

  button.addEventListener(
    "click",
    () => {

      setText(
        "accountMode",
        "DEMO"
      );

      setText(
        "authStatus",
        authenticated
          ? "DERIV DEMO CONNECTED"
          : "PAPER DEMO MODE"
      );

    }
  );

}

/* =========================================================
   BUTTONS
========================================================= */

function setupButtons() {

  const connect =
    $("connectDerivBtn");

  if (connect) {

    connect.addEventListener(
      "click",
      connectDeriv
    );

  }

  const disconnect =
    $("disconnectDerivBtn");

  if (disconnect) {

    disconnect.addEventListener(
      "click",
      disconnectDeriv
    );

  }

  const startAI =
    $("startAI");

  if (startAI) {

    startAI.addEventListener(
      "click",
      startAICycle
    );

  }

  const stopAI =
    $("stopAI");

  if (stopAI) {

    stopAI.addEventListener(
      "click",
      stopAICycle
    );

  }

  const scan =
    $("scanMarketsBtn");

  if (scan) {

    scan.addEventListener(
      "click",
      scanMarkets
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

  const startTrading =
    $("startTrading");

  if (startTrading) {

    startTrading.addEventListener(
      "click",
      () => {

        startPaperTrading();

        setText(
          "entryStatus",
          "PAPER ACTIVE"
        );

      }
    );

  }

  const stopTrading =
    $("stopTrading");

  if (stopTrading) {

    stopTrading.addEventListener(
      "click",
      () => {

        stopPaperTrading();

        setText(
          "entryStatus",
          "STOPPED"
        );

      }
    );

  }

  document
    .querySelectorAll(
      "[data-strategy]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          setStrategy(
            button.dataset.strategy
          );

          updateManualNumberVisibility();

        }
      );

    });

  const tradeStrategy =
    $("tradeStrategy");

  if (tradeStrategy) {

    tradeStrategy.addEventListener(
      "change",
      () => {

        setStrategy(
          tradeStrategy.value
        );

        updateManualNumberVisibility();

      }
    );

  }

}

/* =========================================================
   SYMBOL INPUT
========================================================= */

function setupSymbolInput() {

  const input =
    $("symbol");

  if (!input) return;

  input.value =
    selectedMarket;

  input.addEventListener(
    "change",
    () => {

      const value =
        input.value
          .trim()
          .toUpperCase();

      if (
        MARKETS.includes(
          value
        )
      ) {

        selectedMarket =
          value;

        updateSelectedMarketUI();

      } else {

        input.value =
          selectedMarket;

      }

    }
  );

}

/* =========================================================
   INITIAL UI
========================================================= */

function initializeUI() {

  setText(
    "accountMode",
    "DEMO"
  );

  setText(
    "accountBalance",
    "--"
  );

  setText(
    "authStatus",
    "NOT CONNECTED"
  );

  setText(
    "derivAuthConnection",
    "DISCONNECTED"
  );

  setText(
    "derivAccountId",
    "--"
  );

  setText(
    "derivCurrency",
    "--"
  );

  setText(
    "tradeMarket",
    selectedMarket
  );

  setText(
    "tradeStatus",
    "WAITING"
  );

  setText(
    "entryStatus",
    "WAITING"
  );

  updateAICircle(
    "AI READY",
    "--",
    "--",
    "WAITING"
  );

  updateAIStatus(
    "WAITING",
    "--",
    "--",
    0
  );

  updateManualNumberVisibility();

  renderHistory();

  renderTradeStats();

  updateMarketScanner();

}

/* =========================================================
   CALLBACK + STARTUP
========================================================= */

async function initKRISHWAVE() {

  loadHistory();

  initializeUI();

  setupNavigation();

  setupTheme();

  setupDemoMode();

  setupButtons();

  setupSymbolInput();

  restoreSession();

  await handleOAuthCallback();

  connectPublicDeriv();

  setInterval(
    () => {
      updateMarketScanner();
    },
    3000
  );

}

/* =========================================================
   GLOBAL FUNCTIONS
   Useful for HTML onclick=""
========================================================= */

window.connectDeriv =
  connectDeriv;

window.disconnectDeriv =
  disconnectDeriv;

window.startAICycle =
  startAICycle;

window.stopAICycle =
  stopAICycle;

window.scanMarkets =
  scanMarkets;

window.clearHistory =
  clearHistory;

window.setStrategy =
  setStrategy;

/* =========================================================
   START
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initKRISHWAVE
  );

} else {

  initKRISHWAVE();

}