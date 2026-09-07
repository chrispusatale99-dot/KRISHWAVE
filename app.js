/* =========================================================
   KRISHWAVE V5.6
   LIVE DERIV MARKET INTELLIGENCE
   PAPER / ANALYSIS MODE

   AI CYCLE:
   10s ANALYSIS
   5s LOCK
   3s TRADE NOW
   REPEAT

   No real trading is performed.
========================================================= */

"use strict";

/* =========================
   CONFIG
========================= */

const DERIV_URLS = [
  "wss://ws.binaryws.com/websockets/v3",
  "wss://api.derivws.com/trading/v1/options/ws/public"
];

const MAX_MARKETS = 13;
const HISTORY_LIMIT = 150;
const STORAGE_KEY = "KRISHWAVE_V56_HISTORY";

const FALLBACK_MARKETS = [
  ["R_10", "Volatility 10 Index"],
  ["R_25", "Volatility 25 Index"],
  ["R_50", "Volatility 50 Index"],
  ["R_75", "Volatility 75 Index"],
  ["R_100", "Volatility 100 Index"],
  ["R_150", "Volatility 150 Index"],
  ["R_250", "Volatility 250 Index"],
  ["1HZ10V", "Volatility 10 (1s) Index"],
  ["1HZ25V", "Volatility 25 (1s) Index"],
  ["1HZ50V", "Volatility 50 (1s) Index"],
  ["1HZ75V", "Volatility 75 (1s) Index"],
  ["1HZ100V", "Volatility 100 (1s) Index"],
  ["1HZ150V", "Volatility 150 (1s) Index"]
];

/* =========================
   STATE
========================= */

let socket = null;
let socketUrlIndex = 0;
let socketOpened = false;
let reconnectTimer = null;
let connecting = false;

let requestId = 100;

const requests = new Map();

let markets = [];
const marketData = new Map();

let selectedMarket = null;
let selectedStrategy = "MATCHES";

let aiRunning = false;
let aiPhase = "idle";
let aiRemaining = 10;
let aiTimer = null;

let lockedPrediction = null;
let lastSignal = null;
let lastSignalId = null;

let paperRunning = false;
let accountMode = "DEMO";

let history = loadHistory();

/* =========================
   DOM
========================= */

const $ = id => document.getElementById(id);

function text(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   CONNECTION
========================= */

function setConnection(status, type = "offline") {

  text("connectionStatus", status);

  const dot = $("statusDot");

  if (!dot) return;

  dot.className = "status-dot " + type;
}

function connectDeriv() {

  if (connecting) return;

  connecting = true;

  clearTimeout(reconnectTimer);

  setConnection("CONNECTING...", "connecting");

  const url = DERIV_URLS[socketUrlIndex];

  try {

    if (socket) {
      try {
        socket.close();
      } catch (_) {}
    }

    socket = new WebSocket(url);

    socket.onopen = () => {

      connecting = false;
      socketOpened = true;

      setConnection("ONLINE • LIVE DATA", "online");

      text(
        "analysisMsg",
        "Connected to Deriv. Loading live Volatility markets..."
      );

      requestActiveSymbols();
    };

    socket.onmessage = event => {

      try {

        const data = JSON.parse(event.data);

        handleDerivMessage(data);

      } catch (error) {

        console.error("Message error:", error);

      }

    };

    socket.onerror = error => {

      console.warn("Deriv WebSocket error:", error);

      setConnection("CONNECTION ERROR", "offline");

      text(
        "analysisMsg",
        "Deriv connection error. Trying the backup connection..."
      );

    };

    socket.onclose = () => {

      socketOpened = false;
      connecting = false;

      setConnection("RECONNECTING...", "connecting");

      scheduleReconnect();

    };

  } catch (error) {

    connecting = false;

    console.error(error);

    setConnection("CONNECTION FAILED", "offline");

    scheduleReconnect();
  }
}

function scheduleReconnect() {

  clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(() => {

    /*
      First connection:
      legacy Deriv endpoint.

      If it repeatedly fails, switch to the
      current public Options endpoint.
    */

    if (!socketOpened) {

      socketUrlIndex++;

      if (socketUrlIndex >= DERIV_URLS.length) {
        socketUrlIndex = 0;
      }

    }

    connectDeriv();

  }, 5000);
}

function send(payload, type = null, extra = {}) {

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  const req_id = ++requestId;

  const message = {
    ...payload,
    req_id
  };

  requests.set(req_id, {
    type,
    ...extra
  });

  try {

    socket.send(JSON.stringify(message));

    return req_id;

  } catch (error) {

    console.error("Send failed:", error);

    return false;
  }
}

/* =========================
   ACTIVE SYMBOLS
========================= */

function requestActiveSymbols() {

  /*
    Legacy endpoint accepts product_type.
    Current endpoint does not require it.
  */

  const payload = {
    active_symbols: "brief"
  };

  if (socketUrlIndex === 0) {
    payload.product_type = "basic";
  }

  send(payload, "active_symbols");

  setTimeout(() => {

    if (markets.length === 0) {

      console.warn("No active symbols received. Using fallback list.");

      useFallbackMarkets();

    }

  }, 8000);
}

function handleActiveSymbols(data) {

  const source = Array.isArray(data.active_symbols)
    ? data.active_symbols
    : [];

  const found = [];
  const used = new Set();

  for (const item of source) {

    const symbol =
      item.underlying_symbol ||
      item.symbol ||
      "";

    const name =
      item.underlying_symbol_name ||
      item.display_name ||
      symbol;

    const combined = `${symbol} ${name}`.toLowerCase();

    const volatility =
      combined.includes("volatility") ||
      /^r_\d+$/i.test(symbol) ||
      /^1hz\d+v$/i.test(symbol);

    if (!volatility) continue;

    if (used.has(symbol)) continue;

    used.add(symbol);

    found.push({
      symbol,
      name
    });
  }

  /*
    Prefer normal Volatility symbols first,
    then 1-second symbols.
  */

  found.sort((a, b) => {

    const a1 = /1hz/i.test(a.symbol) ? 1 : 0;
    const b1 = /1hz/i.test(b.symbol) ? 1 : 0;

    if (a1 !== b1) return a1 - b1;

    return a.symbol.localeCompare(b.symbol);
  });

  if (found.length) {

    markets = found.slice(0, MAX_MARKETS);

    initializeMarkets();

  } else {

    useFallbackMarkets();

  }
}

function useFallbackMarkets() {

  markets = FALLBACK_MARKETS.map(([symbol, name]) => ({
    symbol,
    name
  }));

  initializeMarkets();
}

/* =========================
   MARKET INITIALIZATION
========================= */

function initializeMarkets() {

  marketData.clear();

  for (const market of markets) {

    marketData.set(market.symbol, {
      symbol: market.symbol,
      name: market.name,
      digits: [],
      prices: [],
      times: [],
      counts: Array(10).fill(0),
      score: 0,
      strength: "WAITING"
    });
  }

  selectedMarket = markets[0]?.symbol || null;

  populateMarketSelect();

  renderMarkets();

  subscribeMarkets();

  text(
    "analysisMsg",
    `${markets.length} Volatility markets loaded. Collecting live ticks...`
  );
}

/* =========================
   SUBSCRIBE
========================= */

function subscribeMarkets() {

  let index = 0;

  for (const market of markets) {

    /*
      Historical ticks
    */

    const historyReq = send(
      {
        ticks_history: market.symbol,
        count: 100,
        end: "latest",
        style: "ticks",
        subscribe: 0
      },
      "history",
      {
        symbol: market.symbol
      }
    );

    /*
      Live ticks
    */

    send(
      {
        ticks: market.symbol,
        subscribe: 1
      },
      "tick",
      {
        symbol: market.symbol
      }
    );

    index++;

    if (index >= MAX_MARKETS) break;
  }
}

/* =========================
   DERIV MESSAGE HANDLER
========================= */

function handleDerivMessage(data) {

  if (data.error) {

    console.error("Deriv API error:", data.error);

    text(
      "analysisMsg",
      `Deriv API: ${data.error.message || "Request failed"}`
    );

    return;
  }

  if (data.msg_type === "active_symbols") {

    handleActiveSymbols(data);

    return;
  }

  if (
    data.msg_type === "history" ||
    data.history
  ) {

    handleHistory(data);

    return;
  }

  if (
    data.msg_type === "tick" ||
    data.tick
  ) {

    handleTick(data);

    return;
  }
}

/* =========================
   HISTORY DATA
========================= */

function handleHistory(data) {

  const historyData = data.history;

  if (!historyData) return;

  let symbol = null;

  if (data.req_id && requests.has(data.req_id)) {

    symbol = requests.get(data.req_id).symbol;
    requests.delete(data.req_id);

  }

  symbol =
    symbol ||
    historyData.symbol ||
    data.echo_req?.ticks_history ||
    data.echo_req?.symbol;

  if (!symbol) return;

  const item = marketData.get(symbol);

  if (!item) return;

  const prices = Array.isArray(historyData.prices)
    ? historyData.prices
    : [];

  const times = Array.isArray(historyData.times)
    ? historyData.times
    : [];

  for (let i = 0; i < prices.length; i++) {

    addTick(
      symbol,
      prices[i],
      times[i] || Date.now() / 1000,
      false
    );
  }

  calculateMarket(item);

  renderMarkets();

  if (!selectedMarket) {
    selectedMarket = symbol;
  }

  updateAnalysisPreview();
}

/* =========================
   LIVE TICK
========================= */

function handleTick(data) {

  const tick = data.tick;

  if (!tick) return;

  const symbol = tick.symbol;

  if (!symbol) return;

  if (!marketData.has(symbol)) {

    /*
      Some Deriv responses can use
      underlying_symbol.
    */

    const alt = tick.underlying_symbol;

    if (!alt || !marketData.has(alt)) return;
  }

  const finalSymbol =
    marketData.has(symbol)
      ? symbol
      : tick.underlying_symbol;

  addTick(
    finalSymbol,
    tick.quote,
    tick.epoch,
    true
  );

  const item = marketData.get(finalSymbol);

  if (!item) return;

  calculateMarket(item);

  renderMarkets();

  updateAnalysisPreview();

  /*
    If AI is analyzing, keep collecting ticks.
    Prediction is only locked at the end
    of the 10-second analysis phase.
  */
}

/* =========================
   TICK PROCESSING
========================= */

function addTick(symbol, quote, epoch, live = true) {

  const item = marketData.get(symbol);

  if (!item) return;

  const number = Number(quote);

  if (!Number.isFinite(number)) return;

  const digit = getLastDigit(quote);

  item.prices.push(number);
  item.times.push(epoch);
  item.digits.push(digit);

  if (item.prices.length > HISTORY_LIMIT) {
    item.prices.shift();
    item.times.shift();
    item.digits.shift();
  }

  item.counts[digit]++;

  if (live) {

    /*
      Keep scanner responsive.
    */

    if (item.digits.length % 5 === 0) {
      calculateMarket(item);
    }
  }
}

function getLastDigit(value) {

  const stringValue = String(value);

  const decimalIndex = stringValue.indexOf(".");

  if (decimalIndex >= 0) {

    const decimals =
      stringValue.slice(decimalIndex + 1);

    const digitsOnly =
      decimals.replace(/\D/g, "");

    if (digitsOnly.length) {
      return Number(digitsOnly.at(-1));
    }
  }

  const clean =
    stringValue.replace(/\D/g, "");

  return Number(clean.at(-1) || 0);
}

/* =========================
   MARKET ANALYSIS
========================= */

function calculateMarket(item) {

  const digits = item.digits;

  if (digits.length < 10) {

    item.score = 0;
    item.strength = "WAITING";

    return;
  }

  const recent = digits.slice(-30);

  const counts = Array(10).fill(0);

  for (const digit of recent) {
    counts[digit]++;
  }

  const max = Math.max(...counts);

  const dominance =
    max / recent.length;

  const unique =
    new Set(recent).size;

  const diversity =
    unique / 10;

  let movement = 0;

  const prices =
    item.prices.slice(-30);

  for (let i = 1; i < prices.length; i++) {

    if (prices[i] !== prices[i - 1]) {
      movement++;
    }
  }

  const movementRate =
    prices.length > 1
      ? movement / (prices.length - 1)
      : 0;

  /*
    Statistical score.
    This is a ranking signal, not a guarantee.
  */

  let score =
    dominance * 60 +
    (1 - diversity) * 20 +
    movementRate * 20;

  score = Math.round(score * 100);

  score = Math.max(0, Math.min(99, score));

  item.score = score;

  if (score >= 70) {
    item.strength = "STRONG";
  } else if (score >= 45) {
    item.strength = "MEDIUM";
  } else {
    item.strength = "WEAK";
  }
}

/* =========================
   BEST MARKET
========================= */

function bestMarket() {

  const available = [...marketData.values()]
    .filter(item => item.digits.length >= 10)
    .sort((a, b) => b.score - a.score);

  return available[0] || null;
}

/* =========================
   PREDICTION
========================= */

function makePrediction(item, strategy) {

  if (!item || item.digits.length < 10) {
    return null;
  }

  const recent =
    item.digits.slice(-50);

  const counts =
    Array(10).fill(0);

  recent.forEach(d => counts[d]++);

  const strongestDigit =
    counts.indexOf(Math.max(...counts));

  const strongestFrequency =
    counts[strongestDigit] / recent.length;

  const evenCount =
    recent.filter(d => d % 2 === 0).length;

  const oddCount =
    recent.length - evenCount;

  let type = strategy;
  let digit = strongestDigit;
  let confidence = 0;

  if (strategy === "MATCHES") {

    confidence =
      strongestFrequency * 100;

  }

  else if (strategy === "DIFFERS") {

    confidence =
      (1 - strongestFrequency) * 100;

  }

  else if (strategy === "OVER") {

    const manual =
      Number($("number")?.value);

    const threshold =
      Number.isInteger(manual)
        ? manual
        : 4;

    const overCount =
      recent.filter(d => d > threshold).length;

    confidence =
      overCount / recent.length * 100;

  }

  else if (strategy === "UNDER") {

    const manual =
      Number($("number")?.value);

    const threshold =
      Number.isInteger(manual)
        ? manual
        : 5;

    const underCount =
      recent.filter(d => d < threshold).length;

    confidence =
      underCount / recent.length * 100;

  }

  else if (strategy === "EVEN") {

    digit =
      counts
        .map((count, d) => ({
          digit:d,
          count:d % 2 === 0 ? count : -1
        }))
        .sort((a,b) => b.count - a.count)[0].digit;

    confidence =
      evenCount / recent.length * 100;

  }

  else if (strategy === "ODD") {

    digit =
      counts
        .map((count, d) => ({
          digit:d,
          count:d % 2 !== 0 ? count : -1
        }))
        .sort((a,b) => b.count - a.count)[0].digit;

    confidence =
      oddCount / recent.length * 100;
  }

  confidence =
    Math.max(0, Math.min(99.9, confidence));

  return {
    market:item.symbol,
    marketName:item.name,
    strategy,
    type,
    digit,
    confidence:Number(confidence.toFixed(1)),
    score:item.score,
    created:Date.now()
  };
}

/* =========================
   ANALYSIS PREVIEW
========================= */

function updateAnalysisPreview() {

  const item =
    selectedMarket
      ? marketData.get(selectedMarket)
      : bestMarket();

  if (!item) return;

  text("aiMarket", item.name);
  text("analysisMarket", item.name);
  text("aiScore", item.score || "—");

  if (item.digits.length) {
    renderDigits(item);
  }

  if (!aiRunning) {

    text(
      "analysisText",
      `${item.digits.length} live/history ticks available.`
    );
  }
}

/* =========================
   LOCK PREDICTION
========================= */

function createLockedPrediction() {

  const item = bestMarket();

  if (!item) {

    text(
      "analysisMsg",
      "Waiting for enough live ticks to make a statistical prediction..."
    );

    return false;
  }

  /*
    Automatically choose strongest market.
  */

  selectedMarket = item.symbol;

  lockedPrediction =
    makePrediction(
      item,
      selectedStrategy
    );

  if (!lockedPrediction) return false;

  lastSignal = lockedPrediction;

  updatePredictionUI(
    item,
    lockedPrediction
  );

  return true;
}

/* =========================
   PREDICTION UI
========================= */

function updatePredictionUI(item, prediction) {

  if (!prediction) return;

  const digit =
    prediction.digit;

  const confidence =
    prediction.confidence;

  text("aiMarket", item.name);
  text("aiPrediction", digit);
  text("aiType", prediction.type);
  text("analysisPrediction", digit);
  text("analysisConfidence", `${confidence}%`);
  text("analysisConfidenceBox", `${confidence}%`);
  text("analysisMarket", item.name);
  text("analysisStrategy", prediction.strategy);

  text("tradePrediction", digit);
  text("tradeType", prediction.type);
  text("tradeConfidence", `${confidence}%`);

  text(
    "reason",
    `${item.name} selected as the strongest available market with score ${item.score}. The AI is using recent digit frequency and market movement statistics.`
  );

  text(
    "analysisText",
    `Prediction ${digit} is LOCKED. Confidence: ${confidence}%. The prediction will remain unchanged through the 5-second lock and TRADE NOW phase.`
  );

  updateTradePanel();
}

/* =========================
   AI CYCLE
========================= */

function startAI() {

  if (aiRunning) return;

  const available = bestMarket();

  if (!available) {

    text(
      "analysisMsg",
      "AI is waiting for live market ticks. Keep KRISHWAVE open for a few seconds."
    );

    return;
  }

  aiRunning = true;

  enterPhase("analysis", 10);
}

function stopAI() {

  aiRunning = false;

  clearInterval(aiTimer);

  aiTimer = null;

  aiPhase = "idle";

  aiRemaining = 10;

  lockedPrediction = null;

  text("aiCircleTimer", "10");
  text("aiCircleLabel", "ANALYSIS");
  text("aiCircleStatus", "AI STOPPED");

  const circle = $("aiCircle");

  if (circle) {
    circle.className = "ai-circle";
  }

  updateCycleCards(null);

  text(
    "analysisMsg",
    "AI stopped. Live market data remains connected."
  );
}

function enterPhase(phase, seconds) {

  clearInterval(aiTimer);

  aiPhase = phase;
  aiRemaining = seconds;

  if (phase === "analysis") {

    lockedPrediction = null;

    text(
      "analysisMsg",
      "AI is analysing live market data..."
    );

  }

  else if (phase === "lock") {

    const success =
      createLockedPrediction();

    if (!success) {

      enterPhase("analysis", 10);

      return;
    }

    text(
      "analysisMsg",
      "Prediction LOCKED. Enter your manual number now if required."
    );

  }

  else if (phase === "trade") {

    /*
      IMPORTANT:
      Do NOT recalculate prediction here.
      TRADE NOW uses the exact locked prediction.
    */

    if (lockedPrediction) {

      const item =
        marketData.get(
          lockedPrediction.market
        );

      if (item) {
        updatePredictionUI(
          item,
          lockedPrediction
        );
      }
    }

    text(
      "analysisMsg",
      "TRADE NOW — entry window active for 3 seconds."
    );

    recordSignal();
  }

  renderPhase();

  aiTimer =
    setInterval(() => {

      if (!aiRunning) return;

      /*
        Never display zero or negative values.
      */

      if (aiRemaining > 1) {

        aiRemaining--;

        renderPhase();

        return;
      }

      clearInterval(aiTimer);

      if (aiPhase === "analysis") {

        enterPhase("lock", 5);

      } else if (aiPhase === "lock") {

        enterPhase("trade", 3);

      } else if (aiPhase === "trade") {

        enterPhase("analysis", 10);

      }

    }, 1000);
}

function renderPhase() {

  let label = "ANALYSIS";

  if (aiPhase === "lock") {
    label = "LOCK";
  }

  if (aiPhase === "trade") {
    label = "TRADE NOW";
  }

  if (aiPhase === "idle") {
    label = "ANALYSIS";
  }

  text(
    "aiCircleTimer",
    aiRemaining
  );

  text(
    "aiCircleLabel",
    label
  );

  text(
    "aiCircleStatus",
    aiRunning
      ? `AI RUNNING • ${label}`
      : "AI STOPPED"
  );

  const circle =
    $("aiCircle");

  if (circle) {

    circle.className =
      "ai-circle";

    if (aiPhase === "lock") {
      circle.classList.add("locked");
    }

    if (aiPhase === "trade") {
      circle.classList.add("trade");
    }
  }

  updateCycleCards(aiPhase);
}

function updateCycleCards(active) {

  const ids = [
    "cycleAnalysis",
    "cyclePrediction",
    "cycleTrade",
    "cycleCooldown"
  ];

  ids.forEach(id => {

    const el = $(id);

    if (el) {
      el.classList.remove("active");
    }
  });

  if (active === "analysis") {
    $("cycleAnalysis")?.classList.add("active");
  }

  if (active === "lock") {
    $("cyclePrediction")?.classList.add("active");
  }

  if (active === "trade") {
    $("cycleTrade")?.classList.add("active");
    $("cycleCooldown")?.classList.add("active");
  }
}

/* =========================
   MARKET RENDERING
========================= */

function renderMarkets() {

  const container = $("markets");

  if (!container) return;

  if (!markets.length) {

    container.innerHTML =
      `<div class="message">Waiting for Volatility markets...</div>`;

    return;
  }

  const sorted =
    markets
      .map(m => marketData.get(m.symbol))
      .filter(Boolean)
      .sort((a,b) => b.score - a.score);

  container.innerHTML =
    sorted.map(item => {

      const selected =
        item.symbol === selectedMarket
          ? "selected"
          : "";

      const strengthClass =
        item.strength === "STRONG"
          ? "strength-strong"
          : item.strength === "MEDIUM"
            ? "strength-medium"
            : item.strength === "WEAK"
              ? "strength-weak"
              : "";

      return `
        <div
          class="market-card ${selected}"
          data-symbol="${escapeHTML(item.symbol)}"
        >
          <div>
            <strong>${escapeHTML(item.name)}</strong>
            <span>${escapeHTML(item.symbol)}</span>
          </div>

          <div>
            <span>SCORE</span>
            <strong>${item.score || "—"}</strong>
          </div>

          <div>
            <span>STRENGTH</span>
            <strong class="${strengthClass}">
              ${item.strength}
            </strong>
          </div>
        </div>
      `;

    }).join("");

  container
    .querySelectorAll(".market-card")
    .forEach(card => {

      card.addEventListener("click", () => {

        selectedMarket =
          card.dataset.symbol;

        renderMarkets();

        updateTradePanel();

        updateAnalysisPreview();
      });

    });
}

/* =========================
   DIGITS
========================= */

function renderDigits(item) {

  const container = $("digits");

  if (!container) return;

  const recent =
    item.digits.slice(-50);

  const counts =
    Array(10).fill(0);

  recent.forEach(d => counts[d]++);

  container.innerHTML =
    counts.map((count, digit) => {

      const percentage =
        recent.length
          ? ((count / recent.length) * 100).toFixed(0)
          : 0;

      return `
        <div class="digit">
          <strong>${digit}</strong>
          <span>${percentage}%</span>
        </div>
      `;

    }).join("");
}

/* =========================
   STRATEGIES
========================= */

function setStrategy(strategy) {

  selectedStrategy = strategy;

  document
    .querySelectorAll(".strategy")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.strategy === strategy
      );

    });

  const select =
    $("tradeStrategy");

  if (select) {
    select.value = strategy;
  }

  const manual =
    $("manualNumberGroup");

  /*
    Manual number required for:
    Matches, Differs, Over, Under.

    Even/Odd do not require a number.
  */

  if (
    strategy === "EVEN" ||
    strategy === "ODD"
  ) {

    if (manual) {
      manual.style.display = "none";
    }

  } else {

    if (manual) {
      manual.style.display = "block";
    }
  }

  if (aiRunning && aiPhase === "analysis") {

    text(
      "analysisMsg",
      `Strategy changed to ${strategy}. AI will lock a new prediction when analysis ends.`
    );
  }

  else if (!aiRunning) {

    const item = bestMarket();

    if (item) {

      const prediction =
        makePrediction(
          item,
          selectedStrategy
        );

      if (prediction) {
        updatePredictionUI(
          item,
          prediction
        );
      }
    }
  }
}

/* =========================
   TRADE PANEL
========================= */

function populateMarketSelect() {

  const select = $("symbol");

  if (!select) return;

  select.innerHTML =
    markets.map(m => `
      <option value="${escapeHTML(m.symbol)}">
        ${escapeHTML(m.name)}
      </option>
    `).join("");

  if (selectedMarket) {
    select.value = selectedMarket;
  }
}

function updateTradePanel() {

  const select =
    $("symbol");

  if (select && selectedMarket) {
    select.value = selectedMarket;
  }

  const item =
    selectedMarket
      ? marketData.get(selectedMarket)
      : bestMarket();

  if (!item) {

    text(
      "tradeStatus",
      "WAITING FOR LIVE DATA"
    );

    return;
  }

  if (!lastSignal) {

    text(
      "tradePrediction",
      "WAITING"
    );

    text(
      "tradeStatus",
      `${item.name} selected • Waiting for AI signal`
    );

  } else {

    text(
      "tradePrediction",
      lastSignal.digit
    );

    text(
      "tradeStatus",
      `${lastSignal.strategy} • ${lastSignal.confidence}% confidence`
    );
  }
}

/* =========================
   PAPER TRADING
========================= */

function startTrading() {

  paperRunning = true;

  text(
    "tradeStatus",
    "PAPER TRADING ACTIVE"
  );
}

function stopTrading() {

  paperRunning = false;

  text(
    "tradeStatus",
    "PAPER TRADING STOPPED"
  );
}

/* =========================
   HISTORY
========================= */

function loadHistory() {

  try {

    const saved =
      localStorage.getItem(STORAGE_KEY);

    return saved
      ? JSON.parse(saved)
      : [];

  } catch (_) {

    return [];
  }
}

function saveHistory() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(history.slice(0,100))
  );
}

function recordSignal() {

  if (!lockedPrediction) return;

  const id =
    `${lockedPrediction.created}-${lockedPrediction.market}-${lockedPrediction.strategy}`;

  if (lastSignalId === id) return;

  lastSignalId = id;

  const entry = {

    id,

    time:
      new Date().toLocaleTimeString(),

    market:
      lockedPrediction.market,

    strategy:
      lockedPrediction.strategy,

    number:
      lockedPrediction.digit,

    result:
      "SIGNAL",

    pl:
      0

  };

  history.unshift(entry);

  history =
    history.slice(0,100);

  saveHistory();

  renderHistory();

  /*
    History shows the AI signal.
    It does NOT falsely claim that a real trade happened.
  */
}

function renderHistory() {

  const tbody =
    $("historyList");

  if (!tbody) return;

  if (!history.length) {

    tbody.innerHTML =
      `<tr><td colspan="6">No signals yet.</td></tr>`;

  } else {

    tbody.innerHTML =
      history.map(item => {

        let resultClass =
          "result-signal";

        if (item.result === "WIN") {
          resultClass = "result-win";
        }

        if (item.result === "LOSS") {
          resultClass = "result-loss";
        }

        return `
          <tr>
            <td>${escapeHTML(item.time)}</td>
            <td>${escapeHTML(item.market)}</td>
            <td>${escapeHTML(item.strategy)}</td>
            <td>${escapeHTML(item.number)}</td>
            <td class="${resultClass}">
              ${escapeHTML(item.result)}
            </td>
            <td>${Number(item.pl || 0).toFixed(2)}</td>
          </tr>
        `;

      }).join("");
  }

  const total =
    history.length;

  const wins =
    history.filter(x => x.result === "WIN").length;

  const losses =
    history.filter(x => x.result === "LOSS").length;

  const pl =
    history.reduce(
      (sum, x) => sum + Number(x.pl || 0),
      0
    );

  const resolved =
    wins + losses;

  const winRate =
    resolved
      ? ((wins / resolved) * 100).toFixed(1)
      : "0.0";

  text("historyTotal", total);
  text("historyWins", wins);
  text("historyLosses", losses);
  text("historyWinRate", `${winRate}%`);
  text("historyPL", pl.toFixed(2));

  text("tradeTotal", total);
  text("tradeWins", wins);
  text("tradeLosses", losses);
  text("tradeWinRate", `${winRate}%`);
  text("tradePL", pl.toFixed(2));
}

function clearHistory() {

  if (
    !confirm(
      "Clear KRISHWAVE history?"
    )
  ) return;

  history = [];

  localStorage.removeItem(
    STORAGE_KEY
  );

  renderHistory();
}

/* =========================
   NAVIGATION
========================= */

function showPage(page) {

  const pages = {
    analysis: "analysisPage",
    trade: "tradePage",
    history: "historyPage"
  };

  /*
    Also accept old page IDs.
    This fixes the previous navigation bug.
  */

  const normalized =
    page === "analysisPage"
      ? "analysis"
      : page === "tradePage"
        ? "trade"
        : page === "historyPage"
          ? "history"
          : page;

  Object.values(pages)
    .forEach(id => {

      const el = $(id);

      if (el) {
        el.classList.remove(
          "active-page"
        );
      }
    });

  const target =
    $(pages[normalized]);

  if (target) {
    target.classList.add(
      "active-page"
    );
  }

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === normalized
      );

    });

  if (normalized === "trade") {
    updateTradePanel();
  }

  if (normalized === "history") {
    renderHistory();
  }
}

/* =========================
   ACCOUNT MODE
========================= */

function setAccountMode(mode) {

  accountMode = mode;

  text(
    "accountMode",
    mode
  );

  $("demoBtn")
    ?.classList.toggle(
      "active",
      mode === "DEMO"
    );

  $("realBtn")
    ?.classList.toggle(
      "active",
      mode === "REAL"
    );

  /*
    Public market data does not expose
    account balances.
  */

  text(
    "balance",
    "—"
  );

  if (mode === "REAL") {

    text(
      "analysisMsg",
      "REAL selected. Account authentication is required for a real balance/trading connection."
    );

  } else {

    text(
      "analysisMsg",
      "DEMO selected. Live public market data is active."
    );
  }
}

/* =========================
   THEME
========================= */

function toggleTheme() {

  document.body.classList.toggle(
    "light"
  );

  const light =
    document.body.classList.contains(
      "light"
    );

  localStorage.setItem(
    "KRISHWAVE_THEME",
    light
      ? "light"
      : "dark"
  );

  text(
    "themeToggle",
    light ? "🌙" : "☀️"
  );
}

function loadTheme() {

  const saved =
    localStorage.getItem(
      "KRISHWAVE_THEME"
    );

  if (saved === "light") {

    document.body.classList.add(
      "light"
    );

    text(
      "themeToggle",
      "🌙"
    );
  }
}

/* =========================
   EVENTS
========================= */

function setupEvents() {

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => showPage(
          button.dataset.page
        )
      );

    });

  document
    .querySelectorAll(".strategy")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => setStrategy(
          button.dataset.strategy
        )
      );

    });

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

  $("startTrading")
    ?.addEventListener(
      "click",
      startTrading
    );

  $("stopTrading")
    ?.addEventListener(
      "click",
      stopTrading
    );

  $("clearHistory")
    ?.addEventListener(
      "click",
      clearHistory
    );

  $("scan")
    ?.addEventListener(
      "click",
      () => {

        renderMarkets();

        updateAnalysisPreview();

        text(
          "analysisMsg",
          "Volatility scanner refreshed."
        );
      }
    );

  $("demoBtn")
    ?.addEventListener(
      "click",
      () => setAccountMode("DEMO")
    );

  $("realBtn")
    ?.addEventListener(
      "click",
      () => setAccountMode("REAL")
    );

  $("themeToggle")
    ?.addEventListener(
      "click",
      toggleTheme
    );

  $("symbol")
    ?.addEventListener(
      "change",
      event => {

        selectedMarket =
          event.target.value;

        renderMarkets();

        updateAnalysisPreview();

        updateTradePanel();
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
}

/* =========================
   GLOBAL ERROR DISPLAY
========================= */

window.addEventListener(
  "error",
  event => {

    console.error(
      "KRISHWAVE ERROR:",
      event.error
    );

    text(
      "analysisMsg",
      `KRISHWAVE error: ${event.message}`
    );
  }
);

/* =========================
   START
========================= */

function init() {

  loadTheme();

  setupEvents();

  renderHistory();

  setStrategy(
    selectedStrategy
  );

  setConnection(
    "CONNECTING...",
    "connecting"
  );

  /*
    Give the page a moment to render
    before opening WebSocket.
  */

  setTimeout(
    connectDeriv,
    500
  );
}

init();