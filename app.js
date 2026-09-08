/* =========================================================
   KRISHWAVE AI BEAST V6.1
   DERIV LIVE MARKET INTELLIGENCE + DEMO ACCOUNT

   PAPER / ANALYSIS ENGINE ONLY
   ---------------------------------------------------------
   10s ANALYSIS
   5s FIXED PREDICTION
   3s TRADE NOW
   REPEAT

   IMPORTANT:
   - NO REAL CONTRACT EXECUTION
   - DERIV DEMO ACCOUNT ONLY
   - MANUAL DIGIT NEVER AUTO-FILLED
========================================================= */

"use strict";

/* =========================================================
   CONFIG
========================================================= */

const DERIV_CLIENT_ID =
  "34khasPjsT0PCRR8X3Z70";

const REDIRECT_URI =
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const OAUTH_BACKEND =
  "https://krishwave-oauth.chrispusatale99.workers.dev";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const HISTORY_KEY =
  "KRISHWAVE_HISTORY";

const THEME_KEY =
  "KRISHWAVE_THEME";

const TOKEN_KEY =
  "KRISHWAVE_AUTH_TOKEN";

const STATE_KEY =
  "KRISHWAVE_OAUTH_STATE";

const VERIFIER_KEY =
  "KRISHWAVE_OAUTH_VERIFIER";

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
let selectedStrategy = "MATCHES";

let latestTicks = {};
let marketData = {};

let aiRunning = false;
let aiTimer = null;

let aiPhase = "idle";
let aiPhaseStarted = 0;
let aiPhaseDuration = 0;
let aiRemaining = 0;

let aiPrediction = null;
let aiPredictionType = null;
let aiPredictionMarket = null;
let aiPredictionConfidence = 0;

let currentAnalysis = null;

let paperTrading = false;

let history = [];

let oauthState = null;
let oauthVerifier = null;

let demoAccount = null;
let authToken = null;

let accountBalanceValue = null;
let accountCurrency = "USD";

let paperBalance = null;

let paperCycleTradeId = null;

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

  if (el) {
    el.textContent =
      value === undefined ||
      value === null
        ? ""
        : value;
  }
}

function setHTML(id, value) {
  const el = $(id);

  if (el) {
    el.innerHTML =
      value || "";
  }
}

function addClass(id, className) {
  const el = $(id);

  if (el) {
    el.classList.add(className);
  }
}

function removeClass(id, className) {
  const el = $(id);

  if (el) {
    el.classList.remove(className);
  }
}

function toggleClass(
  id,
  className,
  enabled
) {
  const el = $(id);

  if (el) {
    el.classList.toggle(
      className,
      Boolean(enabled)
    );
  }
}

/* =========================================================
   SAFE HTML
========================================================= */

function escapeHTML(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}

/* =========================================================
   STORAGE
========================================================= */

function saveHistory() {

  try {

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history)
    );

  } catch (error) {

    console.warn(
      "Unable to save history",
      error
    );

  }

}

function loadHistory() {

  try {

    const raw =
      localStorage.getItem(
        HISTORY_KEY
      );

    if (!raw) {

      history = [];

    } else {

      const parsed =
        JSON.parse(raw);

      history =
        Array.isArray(parsed)
          ? parsed
          : [];

    }

  } catch (error) {

    console.warn(
      "History load failed",
      error
    );

    history = [];

  }

  rebuildTradeStats();

}

/* =========================================================
   STATS
========================================================= */

function rebuildTradeStats() {

  tradeStats = {
    total: history.length,
    wins: 0,
    losses: 0,
    pending: 0
  };

  history.forEach(item => {

    const status =
      String(
        item.status || ""
      ).toUpperCase();

    if (status === "WIN") {

      tradeStats.wins++;

    } else if (
      status === "LOSS"
    ) {

      tradeStats.losses++;

    } else {

      tradeStats.pending++;

    }

  });

}

/* =========================================================
   BALANCE
========================================================= */

function renderBalance() {

  if (
    accountBalanceValue === null ||
    accountBalanceValue === undefined
  ) {
    return;
  }

  const value =
    Number(
      accountBalanceValue
    );

  if (!Number.isFinite(value)) {
    return;
  }

  const text =
    `${value.toFixed(2)} ${accountCurrency}`;

  /*
    Current index.html uses #balance.
    #accountBalance is also supported.
  */

  setText(
    "balance",
    text
  );

  setText(
    "accountBalance",
    text
  );

  setText(
    "accountMode",
    "DEMO"
  );

}

function setAccountBalance(
  value,
  currency = "USD"
) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return;
  }

  accountBalanceValue =
    number;

  accountCurrency =
    currency || "USD";

  if (
    paperBalance === null
  ) {

    paperBalance =
      number;

  }

  renderBalance();

}

/* =========================================================
   CONNECTION STATUS
========================================================= */

function setConnectionStatus(
  state,
  message = null
) {

  connected =
    Boolean(state);

  const text =
    message ||
    (
      connected
        ? "DERIV LIVE"
        : "OFFLINE"
    );

  setText(
    "connectionText",
    text
  );

  setText(
    "dataStatus",
    text
  );

  setText(
    "heroLiveText",
    text
  );

  [
    "connectionDot",
    "heroLiveDot"
  ].forEach(id => {

    const el =
      $(id);

    if (!el) return;

    el.classList.toggle(
      "online",
      connected
    );

    el.classList.toggle(
      "offline",
      !connected
    );

  });

}

/* =========================================================
   PUBLIC DERIV CONNECTION
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

    ws =
      new WebSocket(
        PUBLIC_WS
      );

    ws.onopen = () => {

      setConnectionStatus(
        true,
        "DERIV LIVE"
      );

      subscribeMarkets();

      updateMarketScanner();

    };

    ws.onmessage = event => {

      try {

        const data =
          JSON.parse(
            event.data
          );

        handleDerivMessage(
          data
        );

      } catch (error) {

        console.warn(
          "Public message parse error",
          error
        );

      }

    };

    ws.onerror = error => {

      console.warn(
        "Public WebSocket error",
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

      setTimeout(
        () => {

          if (
            !ws ||
            ws.readyState ===
              WebSocket.CLOSED
          ) {

            connectPublicDeriv();

          }

        },
        5000
      );

    };

  } catch (error) {

    console.error(
      "Public connection failed",
      error
    );

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
    ws.readyState !==
      WebSocket.OPEN
  ) {

    return;

  }

  MARKETS.forEach(
    symbol => {

      try {

        ws.send(
          JSON.stringify({
            ticks:
              symbol,
            subscribe:
              1
          })
        );

      } catch (error) {

        console.warn(
          "Subscription failed",
          symbol,
          error
        );

      }

    }
  );

}

/* =========================================================
   DERIV MESSAGE
========================================================= */

function handleDerivMessage(
  data
) {

  if (!data) {
    return;
  }

  if (data.error) {

    console.warn(
      "Deriv public error",
      data.error
    );

    return;

  }

  if (
    data.msg_type === "tick" &&
    data.tick
  ) {

    processTick(
      data.tick
    );

  }

}

/* =========================================================
   PROCESS TICK
========================================================= */

function processTick(
  tick
) {

  const symbol =
    tick.symbol;

  if (!symbol) {
    return;
  }

  const quote =
    Number(
      tick.quote
    );

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

      lastDigit:
        null,

      lastQuote:
        null,

      updated:
        Date.now()

    };

  }

  const data =
    marketData[symbol];

  data.ticks.push(
    tick
  );

  data.digits.push(
    digit
  );

  data.quotes.push(
    quote
  );

  while (
    data.ticks.length >
    300
  ) {
    data.ticks.shift();
  }

  while (
    data.digits.length >
    300
  ) {
    data.digits.shift();
  }

  while (
    data.quotes.length >
    300
  ) {
    data.quotes.shift();
  }

  data.lastDigit =
    digit;

  data.lastQuote =
    quote;

  data.updated =
    Date.now();

  latestTicks[symbol] =
    tick;

  if (
    symbol ===
    selectedMarket
  ) {

    updateSelectedMarketUI();

  }

  settlePendingTrades(
    symbol,
    digit
  );

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

  const pip =
    Number(
      pipSize
    );

  if (
    Number.isInteger(pip) &&
    pip >= 0 &&
    pip <= 8
  ) {

    decimals =
      pip;

  }

  const fixed =
    Number(
      quote
    ).toFixed(
      decimals
    );

  const digits =
    fixed.replace(
      /\D/g,
      ""
    );

  if (!digits.length) {
    return 0;
  }

  return Number(
    digits[
      digits.length - 1
    ]
  );

}

/* =========================================================
   ANALYZE MARKET
========================================================= */

function analyzeMarket(
  symbol
) {

  const data =
    marketData[symbol];

  if (
    !data ||
    !Array.isArray(
      data.digits
    ) ||
    data.digits.length < 10
  ) {

    return {

      symbol,

      ready: false,

      score: 0,

      strength:
        "WAITING",

      stability: 0,

      concentration: 0,

      streak: 0,

      agreement: 0,

      lastDigit:
        data?.lastDigit ??
        null,

      even: 0,

      odd: 0,

      high: 0,

      low: 0,

      over: {},

      under: {},

      match: {},

      differ: {},

      prediction:
        null,

      predictionType:
        normalizeStrategy(
          selectedStrategy
        ),

      confidence: 0

    };

  }

  const digits =
    data.digits.slice(
      -100
    );

  const counts =
    Array(10).fill(0);

  digits.forEach(
    digit => {

      const d =
        Number(
          digit
        );

      if (
        Number.isInteger(d) &&
        d >= 0 &&
        d <= 9
      ) {

        counts[d]++;

      }

    }
  );

  const total =
    digits.length;

  let mostDigit = 0;

  for (
    let i = 1;
    i <= 9;
    i++
  ) {

    if (
      counts[i] >
      counts[mostDigit]
    ) {

      mostDigit =
        i;

    }

  }

  const concentration =
    Math.round(
      (
        counts[mostDigit] /
        total
      ) * 100
    );

  let evenCount = 0;

  digits.forEach(
    digit => {

      if (
        Number(digit) % 2 ===
        0
      ) {

        evenCount++;

      }

    }
  );

  const oddCount =
    total -
    evenCount;

  const even =
    Math.round(
      (
        evenCount /
        total
      ) * 100
    );

  const odd =
    Math.round(
      (
        oddCount /
        total
      ) * 100
    );

  let highCount = 0;

  digits.forEach(
    digit => {

      if (
        Number(digit) >= 5
      ) {

        highCount++;

      }

    }
  );

  const lowCount =
    total -
    highCount;

  const high =
    Math.round(
      (
        highCount /
        total
      ) * 100
    );

  const low =
    Math.round(
      (
        lowCount /
        total
      ) * 100
    );

  const over = {};
  const under = {};
  const match = {};
  const differ = {};

  for (
    let n = 0;
    n <= 9;
    n++
  ) {

    const matchCount =
      digits.filter(
        digit =>
          Number(digit) ===
          n
      ).length;

    match[n] =
      Math.round(
        (
          matchCount /
          total
        ) * 100
      );

    differ[n] =
      100 -
      match[n];

    over[n] =
      Math.round(
        (
          digits.filter(
            digit =>
              Number(digit) >
              n
          ).length /
          total
        ) * 100
      );

    under[n] =
      Math.round(
        (
          digits.filter(
            digit =>
              Number(digit) <
              n
          ).length /
          total
        ) * 100
      );

  }

  let streak = 1;

  const lastDigit =
    Number(
      digits[
        digits.length - 1
      ]
    );

  for (
    let i =
      digits.length - 2;
    i >= 0;
    i--
  ) {

    if (
      Number(
        digits[i]
      ) ===
      lastDigit
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
      Number(
        digits[i]
      ) !==
      Number(
        digits[i - 1]
      )
    ) {

      changes++;

    }

  }

  const stability =
    total > 1
      ? Math.round(
          (
            changes /
            (
              total - 1
            )
          ) * 100
        )
      : 0;

  /*
    Market score is an analytical
    ranking only. It is NOT a
    profitability guarantee.
  */

  const parityBalance =
    100 -
    Math.abs(
      even -
      odd
    );

  const highLowBalance =
    100 -
    Math.abs(
      high -
      low
    );

  const agreement =
    Math.round(
      (
        parityBalance +
        highLowBalance +
        concentration
      ) / 3
    );

  const score =
    calculateMarketScore({
      concentration,
      stability,
      agreement,
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
      getStrength(
        score
      ),

    stability,

    concentration,

    streak,

    agreement,

    lastDigit,

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

function calculateMarketScore({
  concentration,
  stability,
  agreement,
  streak
}) {

  let score = 50;

  score +=
    Math.min(
      concentration * 0.25,
      20
    );

  score +=
    Math.min(
      agreement * 0.20,
      20
    );

  score +=
    Math.min(
      streak * 2,
      10
    );

  score -=
    Math.min(
      stability * 0.10,
      10
    );

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        score
      )
    )
  );

}

function getStrength(
  score
) {

  if (
    score >= 85
  ) {
    return "EXTREME";
  }

  if (
    score >= 75
  ) {
    return "STRONG";
  }

  if (
    score >= 65
  ) {
    return "GOOD";
  }

  if (
    score >= 55
  ) {
    return "MODERATE";
  }

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

  const normalized =
    normalizeStrategy(
      strategy
    );

  if (!digits.length) {

    return {

      value:
        "--",

      type:
        normalized,

      confidence:
        0

    };

  }

  let value =
    null;

  let confidence =
    50;

  switch (
    normalized
  ) {

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

      /*
        For the Over strategy,
        choose the threshold with
        the strongest historical
        percentage.
      */

      let bestThreshold =
        0;

      let bestConfidence =
        over[0] || 0;

      for (
        let n = 1;
        n <= 8;
        n++
      ) {

        if (
          (over[n] || 0) >
          bestConfidence
        ) {

          bestThreshold =
            n;

          bestConfidence =
            over[n];

        }

      }

      value =
        bestThreshold;

      confidence =
        bestConfidence;

      break;

    }


    case "UNDER": {

      let bestThreshold =
        1;

      let bestConfidence =
        under[1] || 0;

      for (
        let n = 2;
        n <= 9;
        n++
      ) {

        if (
          (under[n] || 0) >
          bestConfidence
        ) {

          bestThreshold =
            n;

          bestConfidence =
            under[n];

        }

      }

      value =
        bestThreshold;

      confidence =
        bestConfidence;

      break;

    }


    case "MATCH": {

      let bestDigit =
        0;

      let bestConfidence =
        match[0] || 0;

      for (
        let n = 1;
        n <= 9;
        n++
      ) {

        if (
          (match[n] || 0) >
          bestConfidence
        ) {

          bestDigit =
            n;

          bestConfidence =
            match[n];

        }

      }

      value =
        bestDigit;

      confidence =
        bestConfidence;

      break;

    }


    case "DIFFER": {

      let bestDigit =
        0;

      let bestConfidence =
        differ[0] || 0;

      for (
        let n = 1;
        n <= 9;
        n++
      ) {

        if (
          (differ[n] || 0) >
          bestConfidence
        ) {

          bestDigit =
            n;

          bestConfidence =
            differ[n];

        }

      }

      value =
        bestDigit;

      confidence =
        bestConfidence;

      break;

    }


    default: {

      let bestDigit =
        0;

      for (
        let n = 1;
        n <= 9;
        n++
      ) {

        if (
          counts[n] >
          counts[bestDigit]
        ) {

          bestDigit =
            n;

        }

      }

      value =
        bestDigit;

      confidence =
        Math.round(
          (
            counts[bestDigit] /
            digits.length
          ) * 100
        );

    }

  }

  /*
    We cap displayed confidence.
    It is statistical confidence,
    NOT a guarantee.
  */

  confidence =
    Math.round(
      Math.max(
        50,
        Math.min(
          99,
          confidence
        )
      )
    );

  return {

    value,

    type:
      normalized,

    confidence

  };

}

/* =========================================================
   STRATEGY NORMALIZATION
========================================================= */

function normalizeStrategy(
  strategy
) {

  const value =
    String(
      strategy || ""
    )
      .trim()
      .toUpperCase();

  if (
    value === "MATCHES" ||
    value === "MATCH"
  ) {

    return "MATCH";

  }

  if (
    value === "DIFFERS" ||
    value === "DIFFER"
  ) {

    return "DIFFER";

  }

  return value;

}

/* =========================================================
   DISPLAY STRATEGY
========================================================= */

function displayStrategy(
  strategy
) {

  const normalized =
    normalizeStrategy(
      strategy
    );

  if (
    normalized ===
    "MATCH"
  ) {

    return "MATCHES";

  }

  if (
    normalized ===
    "DIFFER"
  ) {

    return "DIFFERS";

  }

  return normalized;

}

/* =========================================================
   BEST MARKET
========================================================= */

function findBestMarket() {

  let best =
    null;

  MARKETS.forEach(
    symbol => {

      const analysis =
        analyzeMarket(
          symbol
        );

      if (
        !analysis.ready
      ) {
        return;
      }

      if (
        !best ||
        analysis.score >
          best.score
      ) {

        best =
          analysis;

      }

    }
  );

  return best;

}

/* =========================================================
   SELECT MARKET
========================================================= */

function selectMarket(
  symbol
) {

  if (
    !MARKETS.includes(
      symbol
    )
  ) {

    return;

  }

  selectedMarket =
    symbol;

  const symbolInput =
    $("symbol");

  if (symbolInput) {

    symbolInput.value =
      symbol;

  }

  const data =
    marketData[symbol];

  if (data) {

    setText(
      "lastQuote",
      data.lastQuote
    );

    setText(
      "lastDigit",
      data.lastDigit
    );

  }

  setText(
    "tradeMarket",
    symbol
  );

  updateSelectedMarketUI();

}

/* =========================================================
   SELECTED MARKET UI
========================================================= */

function updateSelectedMarketUI() {

  const data =
    marketData[
      selectedMarket
    ];

  const analysis =
    analyzeMarket(
      selectedMarket
    );

  if (data) {

    setText(
      "lastQuote",
      data.lastQuote ??
        "--"
    );

    setText(
      "lastDigit",
      data.lastDigit ??
        "--"
    );

  }

  renderDigits(
    selectedMarket
  );

}

/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigits(
  symbol
) {

  const container =
    $("digits");

  if (!container) {
    return;
  }

  const data =
    marketData[symbol];

  if (
    !data ||
    !Array.isArray(
      data.digits
    ) ||
    !data.digits.length
  ) {

    container.innerHTML = `
      <div class="empty-state">
        Waiting for live tick data...
      </div>
    `;

    return;

  }

  const digits =
    data.digits.slice(
      -100
    );

  const counts =
    Array(10).fill(0);

  digits.forEach(
    digit => {

      const d =
        Number(
          digit
        );

      if (
        d >= 0 &&
        d <= 9
      ) {

        counts[d]++;

      }

    }
  );

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
        (
          counts[i] /
          total
        ) * 100
      );

    html += `
      <div class="digit-row">

        <div class="digit-number">
          ${i}
        </div>

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

  container.innerHTML =
    html;

}

/* =========================================================
   MAIN MARKET SCANNER
========================================================= */

function updateMarketScanner() {

  const container =
    $("markets");

  if (!container) {
    return;
  }

  let html = "";

  MARKETS.forEach(
    symbol => {

      const analysis =
        analyzeMarket(
          symbol
        );

      const good =
        analysis.ready &&
        analysis.score >=
          65;

      const active =
        symbol ===
        selectedMarket;

      html += `
        <div
          class="market-card
            ${good ? "market-good" : ""}
            ${active ? "selected-market" : ""}
          "
          data-market="${escapeHTML(symbol)}"
        >

          <div class="market-name">
            ${escapeHTML(symbol)}
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
                ? escapeHTML(
                    analysis.strength
                  )
                : "WAITING"
            }
          </div>

          <div class="market-last">
            Last digit:
            ${
              analysis.lastDigit !== null
                ? analysis.lastDigit
                : "--"
            }
          </div>

        </div>
      `;

    }
  );

  container.innerHTML =
    html;

  container
    .querySelectorAll(
      ".market-card"
    )
    .forEach(
      card => {

        card.onclick =
          () => {

            selectMarket(
              card.dataset.market
            );

          };

      }
    );

}

/* =========================================================
   TRADE MARKET SCANNER
========================================================= */

function scanMarkets() {

  const status =
    $("marketScanStatus");

  if (status) {

    status.textContent =
      "SCANNING ALL VOLATILITY MARKETS...";

  }

  const results =
    MARKETS
      .map(
        symbol =>
          analyzeMarket(
            symbol
          )
      )
      .filter(
        item =>
          item.ready
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const container =
    $("tradeMarkets");

  if (!container) {
    return;
  }

  if (!results.length) {

    container.innerHTML = `
      <div class="empty-state">
        Waiting for enough live tick data...
      </div>
    `;

    setText(
      "marketScanStatus",
      "WAITING FOR LIVE DATA"
    );

    return;

  }

  let html = "";

  results.forEach(
    (item, index) => {

      const strategy =
        displayStrategy(
          item.predictionType
        );

      html += `
        <div
          class="trade-market-card
            ${index === 0
              ? "best-market"
              : ""
            }
          "
          data-market="${escapeHTML(item.symbol)}"
        >

          <div>

            <strong>
              ${escapeHTML(item.symbol)}
            </strong>

            <div>
              ${escapeHTML(item.strength)}
            </div>

          </div>

          <div>

            <strong>
              ${item.score}%
            </strong>

            <div>
              ${escapeHTML(strategy)}:
              ${escapeHTML(item.prediction)}
            </div>

          </div>

        </div>
      `;

    }
  );

  container.innerHTML =
    html;

  container
    .querySelectorAll(
      ".trade-market-card"
    )
    .forEach(
      card => {

        card.onclick =
          () => {

            selectMarket(
              card.dataset.market
            );

            setText(
              "tradeMarket",
              selectedMarket
            );

          };

      }
    );

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

  if (!analysis) {
    return;
  }

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
    analysis.streak
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
    type
      ? displayStrategy(type)
      : "--"
  );

  setText(
    "analysisConfidence",
    confidence > 0
      ? `${confidence}%`
      : "--"
  );

}

/* =========================================================
   CYCLE STEP UI
========================================================= */

function updateCycleSteps() {

  [
    "cycleAnalysis",
    "cyclePrediction",
    "cycleTrade",
    "cycleCooldown"
  ].forEach(
    id =>
      removeClass(
        id,
        "active"
      )
  );

  if (
    aiPhase ===
    "analysis"
  ) {

    addClass(
      "cycleAnalysis",
      "active"
    );

  }

  else if (
    aiPhase ===
    "prediction"
  ) {

    addClass(
      "cyclePrediction",
      "active"
    );

  }

  else if (
    aiPhase ===
    "trade-now"
  ) {

    addClass(
      "cycleTrade",
      "active"
    );

  }

}

/* =========================================================
   EXACT PHASE TIMER
========================================================= */

function startPhaseTimer(
  durationSeconds,
  callback
) {

  clearInterval(
    aiTimer
  );

  aiPhaseStarted =
    performance.now();

  aiPhaseDuration =
    durationSeconds * 1000;

  aiRemaining =
    durationSeconds;

  function tick() {

    if (!aiRunning) {

      clearInterval(
        aiTimer
      );

      return;

    }

    const elapsed =
      performance.now() -
      aiPhaseStarted;

    const remainingMs =
      Math.max(
        0,
        aiPhaseDuration -
        elapsed
      );

    aiRemaining =
      Math.ceil(
        remainingMs /
        1000
      );

    callback(
      aiRemaining,
      remainingMs
    );

    if (
      remainingMs <= 0
    ) {

      clearInterval(
        aiTimer
      );

      callback(
        0,
        0
      );

      callback.phaseFinished =
        true;

      setTimeout(
        () => {

          if (aiRunning) {

            callback.onFinish
              ? callback.onFinish()
              : null;

          }

        },
        0
      );

    }

  }

  tick();

  aiTimer =
    setInterval(
      tick,
      100
    );

}

/* =========================================================
   START AI
========================================================= */

function startAICycle() {

  if (aiRunning) {
    return;
  }

  aiRunning =
    true;

  setText(
    "entryStatus",
    "ANALYZING"
  );

  setText(
    "tradeStatus",
    paperTrading
      ? "PAPER TRADING ON"
      : "WAITING"
  );

  runAnalysisPhase();

}

/* =========================================================
   10 SECOND ANALYSIS
========================================================= */

function runAnalysisPhase() {

  if (!aiRunning) {
    return;
  }

  aiPhase =
    "analysis";

  updateCycleSteps();

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

  removeClass(
    "aiCircle",
    "trade-now"
  );

  addClass(
    "aiCircle",
    "prediction-active"
  );

  setText(
    "entryStatus",
    "ANALYZING"
  );

  setText(
    "analysisMsg",
    "AI BEAST is analyzing live volatility markets..."
  );

  updateAICircle(
    "ANALYZING",
    "...",
    "10",
    "SCANNING LIVE TICKS"
  );

  updateAIStatus(
    "SCANNING",
    "--",
    "ANALYSIS",
    0
  );

  startPhaseTimer(
    10,
    (remaining) => {

      updateAICircle(
        "ANALYZING",
        "...",
        remaining,
        "SCANNING LIVE TICKS"
      );

      setText(
        "analysisConfidence",
        "--"
      );

    }
  );

  /*
    Attach completion to the timer
    through a separate exact timeout.
    The timeout is based on the same
    phase start timestamp.
  */

  setTimeout(
    () => {

      if (
        aiRunning &&
        aiPhase ===
          "analysis"
      ) {

        finishAnalysisPhase();

      }

    },
    10020
  );

}

/* =========================================================
   FINISH ANALYSIS
========================================================= */

function finishAnalysisPhase() {

  if (!aiRunning) {
    return;
  }

  if (
    aiPhase !==
    "analysis"
  ) {
    return;
  }

  clearInterval(
    aiTimer
  );

  let best =
    findBestMarket();

  /*
    If no market is ready,
    continue analysis rather
    than producing a fake signal.
  */

  if (
    !best ||
    !best.ready
  ) {

    setText(
      "analysisMsg",
      "Waiting for enough live tick data..."
    );

    setText(
      "aiStatus",
      "WAITING"
    );

    setTimeout(
      () => {

        if (aiRunning) {
          runAnalysisPhase();
        }

      },
      500
    );

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
      best.symbol;

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
    `CONFIDENCE: ${best.confidence}%`
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
    `Prediction locked: ${displayStrategy(best.predictionType)} ${best.prediction}`
  );

  runPredictionPhase();

}

/* =========================================================
   5 SECOND FIXED PREDICTION
========================================================= */

function runPredictionPhase() {

  if (!aiRunning) {
    return;
  }

  aiPhase =
    "prediction";

  updateCycleSteps();

  aiRemaining =
    5;

  removeClass(
    "aiCircle",
    "prediction-active"
  );

  removeClass(
    "aiCircle",
    "trade-now"
  );

  setText(
    "entryStatus",
    "PREDICTION LOCKED"
  );

  updateAICircle(
    "PREDICTION",
    aiPrediction,
    "5",
    "LOCKED"
  );

  /*
    Prediction is deliberately
    captured once and never
    recalculated during these 5s.
  */

  const lockedPrediction =
    aiPrediction;

  const lockedMarket =
    aiPredictionMarket;

  const lockedType =
    aiPredictionType;

  const lockedConfidence =
    aiPredictionConfidence;

  const started =
    performance.now();

  clearInterval(
    aiTimer
  );

  aiTimer =
    setInterval(
      () => {

        if (!aiRunning) {

          clearInterval(
            aiTimer
          );

          return;

        }

        const elapsed =
          performance.now() -
          started;

        const remaining =
          Math.max(
            0,
            Math.ceil(
              (
                5000 -
                elapsed
              ) / 1000
            )
          );

        setText(
          "aiPredictionLarge",
          lockedPrediction
        );

        setText(
          "predictionConfidence",
          `CONFIDENCE: ${lockedConfidence}%`
        );

        setText(
          "tradePrediction",
          lockedPrediction
        );

        setText(
          "tradeMarket",
          lockedMarket
        );

        setText(
          "tradeConfidence",
          `${lockedConfidence}%`
        );

        updateAICircle(
          "PREDICTION",
          lockedPrediction,
          remaining,
          "LOCKED"
        );

        if (
          elapsed >=
          5000
        ) {

          clearInterval(
            aiTimer
          );

          runTradeNowPhase();

        }

      },
      100
    );

}

/* =========================================================
   3 SECOND TRADE NOW
========================================================= */

function runTradeNowPhase() {

  if (!aiRunning) {
    return;
  }

  aiPhase =
    "trade-now";

  updateCycleSteps();

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
    paperTrading
      ? "PAPER TRADE WINDOW"
      : "TRADE NOW"
  );

  updateAICircle(
    "TRADE NOW",
    aiPrediction,
    "3",
    "ENTRY WINDOW"
  );

  setText(
    "analysisMsg",
    `TRADE NOW — ${aiPredictionMarket} — ${displayStrategy(aiPredictionType)} ${aiPrediction}`
  );

  /*
    Paper mode only.
  */

  if (
    paperTrading
  ) {

    paperCycleTradeId =
      createPaperTrade();

  }

  const started =
    performance.now();

  clearInterval(
    aiTimer
  );

  aiTimer =
    setInterval(
      () => {

        if (!aiRunning) {

          clearInterval(
            aiTimer
          );

          return;

        }

        const elapsed =
          performance.now() -
          started;

        const remaining =
          Math.max(
            0,
            Math.ceil(
              (
                3000 -
                elapsed
              ) / 1000
            )
          );

        updateAICircle(
          "TRADE NOW",
          aiPrediction,
          remaining,
          "ENTRY WINDOW"
        );

        if (
          elapsed >=
          3000
        ) {

          clearInterval(
            aiTimer
          );

          removeClass(
            "aiCircle",
            "trade-now"
          );

          if (aiRunning) {

            runAnalysisPhase();

          }

        }

      },
      100
    );

}

/* =========================================================
   STOP AI
========================================================= */

function stopAICycle() {

  aiRunning =
    false;

  clearInterval(
    aiTimer
  );

  aiTimer =
    null;

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

  updateCycleSteps();

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
    "entryStatus",
    "WAITING"
  );

  setText(
    "analysisMsg",
    "AI BEAST stopped."
  );

  if (!paperTrading) {

    setText(
      "tradeStatus",
      "WAITING"
    );

  }

}

/* =========================================================
   TRADE SETTINGS
========================================================= */

function getTradeSettings() {

  const stake =
    Number(
      $("stake")?.value
    );

  const takeProfit =
    Number(
      $("takeProfit")?.value
    );

  const stopLoss =
    Number(
      $("stopLoss")?.value
    );

  const martingaleValue =
    $("martingale")?.value ||
    "OFF";

  const multiplier =
    martingaleValue ===
      "OFF"
      ? 1
      : Number(
          martingaleValue
        );

  const manualRaw =
    $("manualNumber")?.value;

  const manualNumber =
    manualRaw ===
      "" ||
    manualRaw ===
      undefined
      ? null
      : Number(
          manualRaw
        );

  return {

    stake:
      Number.isFinite(
        stake
      ) &&
      stake > 0
        ? stake
        : 1,

    takeProfit:
      Number.isFinite(
        takeProfit
      )
        ? Math.max(
            0,
            takeProfit
          )
        : 0,

    stopLoss:
      Number.isFinite(
        stopLoss
      )
        ? Math.max(
            0,
            stopLoss
          )
        : 0,

    martingale:
      martingaleValue,

    multiplier:
      Number.isFinite(
        multiplier
      )
        ? multiplier
        : 1,

    manualNumber:
      Number.isInteger(
        manualNumber
      ) &&
      manualNumber >= 0 &&
      manualNumber <= 9
        ? manualNumber
        : null

  };

}

/* =========================================================
   CREATE PAPER TRADE
========================================================= */

function createPaperTrade() {

  if (!currentAnalysis) {
    return null;
  }

  const settings =
    getTradeSettings();

  const strategy =
    normalizeStrategy(
      selectedStrategy
    );

  const numericStrategy =
    [
      "MATCH",
      "DIFFER",
      "OVER",
      "UNDER"
    ].includes(
      strategy
    );

  /*
    These strategies require
    a manual number.
  */

  if (
    numericStrategy &&
    settings.manualNumber ===
      null
  ) {

    setText(
      "tradeStatus",
      "ENTER MANUAL NUMBER"
    );

    setText(
      "entryStatus",
      "NUMBER REQUIRED"
    );

    setText(
      "analysisMsg",
      `${displayStrategy(strategy)} requires your manual number 0–9. AI will not enter it.`
    );

    return null;

  }

  /*
    Make sure the paper balance
    has a starting value.
  */

  if (
    paperBalance === null &&
    accountBalanceValue !== null
  ) {

    paperBalance =
      accountBalanceValue;

  }

  const item = {

    id:
      Date.now() +
      Math.random(),

    time:
      new Date().toISOString(),

    market:
      currentAnalysis.symbol,

    strategy,

    prediction:
      currentAnalysis.prediction,

    manualNumber:
      settings.manualNumber,

    confidence:
      currentAnalysis.confidence,

    stake:
      settings.stake,

    takeProfit:
      settings.takeProfit,

    stopLoss:
      settings.stopLoss,

    martingale:
      settings.martingale,

    martingaleMultiplier:
      settings.multiplier,

    resultDigit:
      null,

    profit:
      0,

    status:
      "PENDING"

  };

  history.unshift(
    item
  );

  if (
    history.length >
    100
  ) {

    history.pop();

  }

  rebuildTradeStats();

  saveHistory();

  renderHistory();

  renderTradeStats();

  setText(
    "tradeStatus",
    "PAPER TRADE ACTIVE"
  );

  return item.id;

}

/* =========================================================
   SETTLE PENDING PAPER TRADES
========================================================= */

function settlePendingTrades(
  symbol,
  digit
) {

  let changed =
    false;

  history.forEach(
    item => {

      if (
        item.status !==
        "PENDING"
      ) {

        return;

      }

      if (
        item.market !==
        symbol
      ) {

        return;

      }

      /*
        Prevent the exact creation
        tick from immediately settling.
      */

      const created =
        Number(
          item.id
        );

      /*
        IDs include Math.random(),
        but still retain a millisecond
        timestamp as the integer part.
      */

      if (
        Date.now() -
          Math.floor(
            created
          ) <
        500
      ) {

        return;

      }

      const won =
        evaluatePaperResult(
          item,
          digit
        );

      item.resultDigit =
        digit;

      item.status =
        won
          ? "WIN"
          : "LOSS";

      item.profit =
        won
          ? calculatePaperProfit(
              item
            )
          : -Number(
              item.stake ||
              0
            );

      changed =
        true;

    }
  );

  if (!changed) {
    return;
  }

  rebuildTradeStats();

  saveHistory();

  renderHistory();

  renderTradeStats();

  enforcePaperRiskControls();

}

/* =========================================================
   PAPER RESULT
========================================================= */

function evaluatePaperResult(
  item,
  digit
) {

  const strategy =
    normalizeStrategy(
      item.strategy
    );

  const number =
    Number(
      item.manualNumber
    );

  switch (
    strategy
  ) {

    case "MATCH":

      return (
        digit ===
        number
      );

    case "DIFFER":

      return (
        digit !==
        number
      );

    case "OVER":

      return (
        digit >
        number
      );

    case "UNDER":

      return (
        digit <
        number
      );

    case "EVEN":

      return (
        digit % 2 ===
        0
      );

    case "ODD":

      return (
        digit % 2 !==
        0
      );

    default:

      return false;

  }

}

/* =========================================================
   PAPER PROFIT
========================================================= */

function calculatePaperProfit(
  item
) {

  const stake =
    Number(
      item.stake || 0
    );

  /*
    Simple simulation only.
    This is NOT Deriv's actual payout.
  */

  return Number(
    (
      stake *
      0.80
    ).toFixed(2)
  );

}

/* =========================================================
   PAPER RISK CONTROLS
========================================================= */

function calculatePaperNetProfit() {

  let total =
    0;

  history.forEach(
    item => {

      if (
        item.status ===
          "WIN" ||
        item.status ===
          "LOSS"
      ) {

        total +=
          Number(
            item.profit ||
            0
          );

      }

    }
  );

  return Number(
    total.toFixed(2)
  );

}

function enforcePaperRiskControls() {

  if (!paperTrading) {
    return;
  }

  const netProfit =
    calculatePaperNetProfit();

  const settings =
    getTradeSettings();

  if (
    settings.takeProfit >
      0 &&
    netProfit >=
      settings.takeProfit
  ) {

    stopPaperTrading(
      "TAKE PROFIT REACHED"
    );

    return;

  }

  if (
    settings.stopLoss >
      0 &&
    netProfit <=
      -settings.stopLoss
  ) {

    stopPaperTrading(
      "STOP LOSS REACHED"
    );

  }

}

/* =========================================================
   START PAPER TRADING
========================================================= */

function startPaperTrading() {

  const settings =
    getTradeSettings();

  if (
    !Number.isFinite(
      settings.stake
    ) ||
    settings.stake <=
      0
  ) {

    setText(
      "tradeStatus",
      "INVALID STAKE"
    );

    return;

  }

  paperTrading =
    true;

  if (
    paperBalance ===
      null &&
    accountBalanceValue !==
      null
  ) {

    paperBalance =
      accountBalanceValue;

  }

  setText(
    "tradeStatus",
    "PAPER TRADING ON"
  );

  setText(
    "entryStatus",
    "READY"
  );

  setText(
    "analysisMsg",
    `PAPER TRADING ON — Stake ${settings.stake} — Martingale ${settings.martingale}`
  );

}

/* =========================================================
   STOP PAPER TRADING
========================================================= */

function stopPaperTrading(
  reason = "STOPPED"
) {

  paperTrading =
    false;

  setText(
    "tradeStatus",
    reason
  );

  setText(
    "entryStatus",
    "STOPPED"
  );

}

/* =========================================================
   HISTORY RENDER
========================================================= */

function renderHistory() {

  const container =
    $("historyList");

  if (!container) {
    return;
  }

  if (!history.length) {

    container.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="empty-history"
        >
          No paper trades yet.
        </td>
      </tr>
    `;

    return;

  }

  let html = "";

  history.forEach(
    item => {

      const date =
        new Date(
          item.time
        );

      const time =
        Number.isNaN(
          date.getTime()
        )
          ? "--"
          : date.toLocaleTimeString();

      const strategy =
        displayStrategy(
          item.strategy
        );

      const prediction =
        item.prediction ??
        "--";

      const manual =
        item.manualNumber !==
            null &&
        item.manualNumber !==
            undefined
          ? ` / ${item.manualNumber}`
          : "";

      const resultDigit =
        item.resultDigit !==
            null &&
        item.resultDigit !==
            undefined
          ? item.resultDigit
          : "--";

      const status =
        String(
          item.status ||
          "PENDING"
        ).toUpperCase();

      html += `
        <tr>

          <td>
            ${escapeHTML(time)}
          </td>

          <td>
            ${escapeHTML(item.market)}
          </td>

          <td>
            ${escapeHTML(strategy)}
          </td>

          <td>
            ${escapeHTML(prediction)}
            ${escapeHTML(manual)}
          </td>

          <td>
            ${escapeHTML(resultDigit)}
          </td>

          <td>
            ${escapeHTML(status)}
          </td>

        </tr>
      `;

    }
  );

  container.innerHTML =
    html;

}

/* =========================================================
   STATS RENDER
========================================================= */

function renderTradeStats() {

  rebuildTradeStats();

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

  const settled =
    tradeStats.wins +
    tradeStats.losses;

  const accuracy =
    settled >
      0
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

  const confirmed =
    window.confirm(
      "Clear all KRISHWAVE paper history?"
    );

  if (!confirmed) {
    return;
  }

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
   MANUAL NUMBER VISIBILITY
========================================================= */

function updateManualNumberVisibility() {

  const group =
    $("manualNumberGroup");

  if (!group) {
    return;
  }

  const strategy =
    normalizeStrategy(
      selectedStrategy
    );

  const needsNumber =
    [
      "MATCH",
      "DIFFER",
      "OVER",
      "UNDER"
    ].includes(
      strategy
    );

  group.style.display =
    needsNumber
      ? ""
      : "none";

}

/* =========================================================
   STRATEGY
========================================================= */

function setStrategy(
  strategy
) {

  if (!strategy) {
    return;
  }

  selectedStrategy =
    String(
      strategy
    )
      .trim()
      .toUpperCase();

  document
    .querySelectorAll(
      "[data-strategy]"
    )
    .forEach(
      button => {

        const buttonStrategy =
          String(
            button.dataset.strategy ||
            ""
          )
            .trim()
            .toUpperCase();

        const same =
          normalizeStrategy(
            buttonStrategy
          ) ===
          normalizeStrategy(
            selectedStrategy
          );

        button.classList.toggle(
          "active",
          same
        );

      }
    );

  const select =
    $("tradeStrategy");

  if (select) {

    select.value =
      selectedStrategy;

  }

  updateManualNumberVisibility();

  /*
    Do not touch manualNumber.
    It must remain completely manual.
  */

}

/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {

  document
    .querySelectorAll(
      "[data-page]"
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            const page =
              button.dataset.page;

            document
              .querySelectorAll(
                ".page"
              )
              .forEach(
                pageElement => {

                  /*
                    New index.html uses:
                    analysisPage
                    tradePage
                    historyPage
                  */

                  const target =
                    pageElement.id ===
                    `${page}Page`;

                  pageElement.classList.toggle(
                    "active",
                    target
                  );

                }
              );

            document
              .querySelectorAll(
                "[data-page]"
              )
              .forEach(
                navButton => {

                  navButton.classList.toggle(
                    "active",
                    navButton.dataset.page ===
                      page
                  );

                }
              );

            /*
              Refresh trade scanner when
              entering Trade page.
            */

            if (
              page ===
              "trade"
            ) {

              scanMarkets();

            }

          };

      }
    );

}

/* =========================================================
   THEME
========================================================= */

function setupTheme() {

  const button =
    $("themeToggle");

  if (!button) {
    return;
  }

  const saved =
    localStorage.getItem(
      THEME_KEY
    );

  if (
    saved ===
    "light"
  ) {

    document.body.classList.add(
      "light"
    );

  }

  updateThemeIcon();

  button.onclick =
    () => {

      document.body.classList.toggle(
        "light"
      );

      localStorage.setItem(
        THEME_KEY,
        document.body.classList.contains(
          "light"
        )
          ? "light"
          : "dark"
      );

      updateThemeIcon();

    };

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
   DEMO MODE
========================================================= */

function setupDemoMode() {

  const demo =
    $("demoModeBtn");

  const real =
    $("realModeBtn");

  if (demo) {

    demo.onclick =
      () => {

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
          "authStatus",
          authenticated
            ? "DERIV DEMO CONNECTED"
            : "PAPER DEMO MODE"
        );

        renderBalance();

      };

  }

  /*
    REAL button is intentionally
    disabled from real execution.
  */

  if (real) {

    real.onclick =
      () => {

        demo?.classList.add(
          "active"
        );

        real.classList.remove(
          "active"
        );

        setText(
          "accountMode",
          "DEMO"
        );

        setText(
          "authStatus",
          "REAL TRADING DISABLED — DEMO ONLY"
        );

      };

  }

}

/* =========================================================
   BUTTON SETUP
========================================================= */

function setupButtons() {

  const connect =
    $("connectDerivBtn");

  if (connect) {

    connect.onclick =
      connectDeriv;

  }

  const disconnect =
    $("disconnectDerivBtn");

  if (disconnect) {

    disconnect.onclick =
      disconnectDeriv;

  }

  const startAI =
    $("startAI");

  if (startAI) {

    startAI.onclick =
      startAICycle;

  }

  const stopAI =
    $("stopAI");

  if (stopAI) {

    stopAI.onclick =
      stopAICycle;

  }

  const scan =
    $("scanMarketsBtn");

  if (scan) {

    scan.onclick =
      scanMarkets;

  }

  const clear =
    $("clearHistory");

  if (clear) {

    clear.onclick =
      clearHistory;

  }

  const startTrading =
    $("startTrading");

  if (startTrading) {

    startTrading.onclick =
      startPaperTrading;

  }

  const stopTrading =
    $("stopTrading");

  if (stopTrading) {

    stopTrading.onclick =
      stopPaperTrading;

  }

  document
    .querySelectorAll(
      "[data-strategy]"
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            setStrategy(
              button.dataset.strategy
            );

          };

      }
    );

  const tradeStrategy =
    $("tradeStrategy");

  if (tradeStrategy) {

    tradeStrategy.onchange =
      () => {

        setStrategy(
          tradeStrategy.value
        );

      };

  }

}

/* =========================================================
   SYMBOL
========================================================= */

function setupSymbolInput() {

  const input =
    $("symbol");

  if (!input) {
    return;
  }

  input.value =
    selectedMarket;

}

/* =========================================================
   PKCE
========================================================= */

function randomString(
  length = 64
) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  let result =
    "";

  const values =
    new Uint8Array(
      length
    );

  crypto.getRandomValues(
    values
  );

  values.forEach(
    value => {

      result +=
        chars[
          value %
          chars.length
        ];

    }
  );

  return result;

}

async function sha256(
  value
) {

  return crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      value
    )
  );

}

function base64UrlEncode(
  buffer
) {

  const bytes =
    new Uint8Array(
      buffer
    );

  let binary =
    "";

  bytes.forEach(
    byte => {

      binary +=
        String.fromCharCode(
          byte
        );

    }
  );

  return btoa(
    binary
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
      /=/g,
      ""
    );

}

async function createPKCE() {

  oauthVerifier =
    randomString(
      64
    );

  const digest =
    await sha256(
      oauthVerifier
    );

  return base64UrlEncode(
    digest
  );

}

/* =========================================================
   OAUTH LOGIN
========================================================= */

async function connectDeriv() {

  try {

    const challenge =
      await createPKCE();

    oauthState =
      randomString(
        32
      );

    sessionStorage.setItem(
      STATE_KEY,
      oauthState
    );

    sessionStorage.setItem(
      VERIFIER_KEY,
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

    window.location.href =
      "https://auth.deriv.com/oauth2/auth?" +
      params.toString();

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

    cleanOAuthURL();

    return;

  }

  if (!code) {
    return;
  }

  const savedState =
    sessionStorage.getItem(
      STATE_KEY
    );

  const verifier =
    sessionStorage.getItem(
      VERIFIER_KEY
    );

  if (
    !state ||
    !savedState ||
    state !==
      savedState
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
    "CONNECTING TO DERIV..."
  );

  try {

    const response =
      await fetch(
        OAUTH_BACKEND,
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

    if (authToken) {

      sessionStorage.setItem(
        TOKEN_KEY,
        authToken
      );

    }

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
   CLEAN OAUTH URL
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

  } catch (error) {}

}

/* =========================================================
   DISCOVER DEMO ACCOUNT
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

          headers: {

            Authorization:
              `Bearer ${authToken}`,

            Accept:
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
      extractAccounts(
        data
      );

    /*
      Prefer demo account.
    */

    const demo =
      accounts.find(
        account =>
          account.is_demo ===
            true ||
          String(
            account.environment ||
            ""
          ).toLowerCase() ===
            "demo" ||
          String(
            account.type ||
            ""
          ).toLowerCase() ===
            "demo"
      ) ||
      accounts[0];

    if (!demo) {

      setText(
        "authStatus",
        "NO OPTIONS ACCOUNT FOUND"
      );

      return;

    }

    demoAccount =
      demo;

    const accountId =
      demo.account_id ||
      demo.accountId ||
      demo.id ||
      "--";

    const currency =
      demo.currency ||
      "USD";

    setText(
      "derivAccountId",
      accountId
    );

    setText(
      "derivCurrency",
      currency
    );

    setText(
      "derivAuthConnection",
      "AUTHENTICATED"
    );

    setText(
      "authStatus",
      "DERIV DEMO CONNECTED"
    );

    const disconnect =
      $("disconnectDerivBtn");

    if (disconnect) {

      disconnect.style.display =
        "";

    }

    const connect =
      $("connectDerivBtn");

    if (connect) {

      connect.style.display =
        "none";

    }

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
   EXTRACT ACCOUNTS
========================================================= */

function extractAccounts(
  data
) {

  if (
    Array.isArray(data)
  ) {

    return data;

  }

  if (
    Array.isArray(
      data?.accounts
    )
  ) {

    return data.accounts;

  }

  if (
    Array.isArray(
      data?.data?.accounts
    )
  ) {

    return data.data.accounts;

  }

  if (
    Array.isArray(
      data?.data
    )
  ) {

    return data.data;

  }

  return [];

}

/* =========================================================
   REQUEST OTP
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

        method:
          "POST",

        headers: {

          Authorization:
            `Bearer ${authToken}`,

          Accept:
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
   CONNECT AUTHENTICATED DEMO
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
    demoAccount.accountId ||
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
        "No authenticated WebSocket URL",
        otpResponse
      );

      setText(
        "derivAuthConnection",
        "AUTHENTICATED"
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

    authWs.onopen =
      () => {

        setText(
          "derivAuthConnection",
          "DEMO LIVE"
        );

        setText(
          "authStatus",
          "DERIV DEMO CONNECTED"
        );

        try {

          authWs.send(
            JSON.stringify({
              balance:
                1,
              subscribe:
                1
            })
          );

        } catch (error) {

          console.warn(
            "Balance subscription failed",
            error
          );

        }

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

        } catch (error) {

          console.warn(
            "Authenticated message parse error",
            error
          );

        }

      };

    authWs.onerror =
      error => {

        console.warn(
          "Authenticated WebSocket error",
          error
        );

        setText(
          "derivAuthConnection",
          "CONNECTION ERROR"
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
      "Authenticated connection error",
      error
    );

    setText(
      "derivAuthConnection",
      "AUTH ERROR"
    );

  }

}

/* =========================================================
   EXTRACT OTP WEBSOCKET URL
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
   AUTHENTICATED MESSAGE
========================================================= */

function handleAuthenticatedMessage(
  data
) {

  if (!data) {
    return;
  }

  if (data.error) {

    console.warn(
      "Authenticated API error",
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

    const value =
      balance?.balance;

    const currency =
      balance?.currency ||
      demoAccount?.currency ||
      "USD";

    if (
      value !==
      undefined
    ) {

      setAccountBalance(
        value,
        currency
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

  accountBalanceValue =
    null;

  paperBalance =
    null;

  sessionStorage.removeItem(
    TOKEN_KEY
  );

  sessionStorage.removeItem(
    STATE_KEY
  );

  sessionStorage.removeItem(
    VERIFIER_KEY
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

  setText(
    "derivCurrency",
    "--"
  );

  setText(
    "balance",
    "—"
  );

  setText(
    "accountBalance",
    "—"
  );

  const connect =
    $("connectDerivBtn");

  if (connect) {

    connect.style.display =
      "";

  }

  const disconnect =
    $("disconnectDerivBtn");

  if (disconnect) {

    disconnect.style.display =
      "none";

  }

}

/* =========================================================
   RESTORE SESSION
========================================================= */

async function restoreSession() {

  try {

    const token =
      sessionStorage.getItem(
        TOKEN_KEY
      );

    if (!token) {
      return;
    }

    authToken =
      token;

    authenticated =
      true;

    setText(
      "authStatus",
      "RESTORING DERIV SESSION..."
    );

    await discoverDemoAccount();

  } catch (error) {

    console.warn(
      "Session restore failed",
      error
    );

    sessionStorage.removeItem(
      TOKEN_KEY
    );

    authToken =
      null;

    authenticated =
      false;

  }

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
    "balance",
    "—"
  );

  setText(
    "accountBalance",
    "—"
  );

  setText(
    "dataStatus",
    "CONNECTING..."
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
    "—"
  );

  setText(
    "derivCurrency",
    "—"
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

  setText(
    "aiPredictionLarge",
    "--"
  );

  setText(
    "predictionConfidence",
    "CONFIDENCE: --"
  );

  setText(
    "tradePrediction",
    "--"
  );

  setText(
    "tradeConfidence",
    "--"
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

  updateCycleSteps();

  setStrategy(
    selectedStrategy
  );

  renderHistory();

  renderTradeStats();

  updateMarketScanner();

  updateManualNumberVisibility();

}

/* =========================================================
   STARTUP
========================================================= */

async function initKRISHWAVE() {

  loadHistory();

  initializeUI();

  setupNavigation();

  setupTheme();

  setupDemoMode();

  setupButtons();

  setupSymbolInput();

  await handleOAuthCallback();

  if (!authenticated) {

    await restoreSession();

  }

  connectPublicDeriv();

  /*
    Keep scanner fresh without
    affecting the fixed prediction.
  */

  setInterval(
    () => {

      updateMarketScanner();

      if (
        selectedMarket
      ) {

        renderDigits(
          selectedMarket
        );

      }

    },
    3000
  );

}

/* =========================================================
   GLOBAL FUNCTIONS
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

window.startPaperTrading =
  startPaperTrading;

window.stopPaperTrading =
  stopPaperTrading;

window.selectMarket =
  selectMarket;

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