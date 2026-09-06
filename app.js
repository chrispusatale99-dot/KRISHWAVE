/* =========================================================
   KRISHWAVE V4
   LIVE DERIV MARKET INTELLIGENCE ENGINE
   ANALYSIS ONLY

   FIXES:
   - Correct JavaScript template strings
   - Proper market scanner cards
   - Responsive card layout
   - Live tick / digit analysis
   - Even / Odd
   - High / Low
   - Over / Under
   - Match / Differ
   - Rise / Fall
   - Streak analysis
   - AUTO strategy
   - AI analysis every 10 seconds
   - 7 second entry countdown
   - TRADE NOW signal
   - Demo / Real UI mode
   - Risk controls
   - Martingale controls
   - Dark / Light theme support
   - Horizontal digit distribution
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     CONFIG
  ======================================================= */

  const CONFIG = {
    WS_URL:
      "wss://api.derivws.com/trading/v1/options/ws/public",

    MAX_HISTORY: 200,
    RECENT_WINDOW: 80,
    MIN_SAMPLE: 30,

    RECONNECT_DELAY: 3000,
    WATCHDOG_MS: 15000,

    AI_INTERVAL: 10000,
    COUNTDOWN_SECONDS: 7,

    DEFAULT_STAKE: 0.25,
    MIN_STAKE: 0.25,

    TAKE_PROFIT: 5,
    STOP_LOSS: -3,

    MARTINGALE_MULTIPLIER: 2,
    MAX_MARTINGALE_STEPS: 3,
    MAX_STAKE: 10,

    REAL_CONFIRMATION_REQUIRED: true,

    tradingEnabled:
      window.KRISHWAVE_CONFIG?.tradingEnabled === true
  };

  /* =======================================================
     MARKETS
  ======================================================= */

  const MARKETS = [
    {
      symbol: "R_10",
      name: "Volatility 10 Index",
      short: "V10"
    },
    {
      symbol: "R_10_1S",
      name: "Volatility 10 (1s) Index",
      short: "V10 1S"
    },
    {
      symbol: "R_15_1S",
      name: "Volatility 15 (1s) Index",
      short: "V15 1S"
    },
    {
      symbol: "R_25",
      name: "Volatility 25 Index",
      short: "V25"
    },
    {
      symbol: "R_25_1S",
      name: "Volatility 25 (1s) Index",
      short: "V25 1S"
    },
    {
      symbol: "R_30_1S",
      name: "Volatility 30 (1s) Index",
      short: "V30 1S"
    },
    {
      symbol: "R_50",
      name: "Volatility 50 Index",
      short: "V50"
    },
    {
      symbol: "R_50_1S",
      name: "Volatility 50 (1s) Index",
      short: "V50 1S"
    },
    {
      symbol: "R_75",
      name: "Volatility 75 Index",
      short: "V75"
    },
    {
      symbol: "R_75_1S",
      name: "Volatility 75 (1s) Index",
      short: "V75 1S"
    },
    {
      symbol: "R_90_1S",
      name: "Volatility 90 (1s) Index",
      short: "V90 1S"
    },
    {
      symbol: "R_100",
      name: "Volatility 100 Index",
      short: "V100"
    },
    {
      symbol: "R_100_1S",
      name: "Volatility 100 (1s) Index",
      short: "V100 1S"
    }
  ];

  const STRATEGIES = {
    AUTO: {
      key: "AUTO",
      name: "AUTO",
      icon: "⚡"
    },
    EVEN: {
      key: "EVEN",
      name: "Even",
      icon: "2"
    },
    ODD: {
      key: "ODD",
      name: "Odd",
      icon: "1"
    },
    HIGH: {
      key: "HIGH",
      name: "High",
      icon: "↑"
    },
    LOW: {
      key: "LOW",
      name: "Low",
      icon: "↓"
    },
    OVER: {
      key: "OVER",
      name: "Over",
      icon: ">"
    },
    UNDER: {
      key: "UNDER",
      name: "Under",
      icon: "<"
    },
    MATCH: {
      key: "MATCH",
      name: "Match",
      icon: "="
    },
    DIFFER: {
      key: "DIFFER",
      name: "Differ",
      icon: "≠"
    },
    RISE: {
      key: "RISE",
      name: "Rise",
      icon: "↗"
    },
    FALL: {
      key: "FALL",
      name: "Fall",
      icon: "↘"
    }
  };

  /* =======================================================
     STATE
  ======================================================= */

  const state = {
    socket: null,

    connected: false,
    connecting: false,

    reconnectTimer: null,
    watchdogTimer: null,

    lastMessageAt: 0,

    selectedSymbol:
      window.KRISHWAVE_CONFIG?.defaultSymbol ||
      "R_10",

    selectedStrategy: "AUTO",

    theme: "dark",

    accountMode:
      window.KRISHWAVE_CONFIG?.defaultAccount ||
      "demo",

    histories: {},

    marketData: {},

    subscribedSymbols: new Set(),

    aiRunning: false,
    aiTimer: null,
    countdownTimer: null,

    countdown: 0,

    currentAnalysis: null,

    lastTradeSignal: null,

    trade: {
      stake: CONFIG.DEFAULT_STAKE,
      takeProfit: CONFIG.TAKE_PROFIT,
      stopLoss: CONFIG.STOP_LOSS,

      martingaleMultiplier:
        CONFIG.MARTINGALE_MULTIPLIER,

      maxMartingaleSteps:
        CONFIG.MAX_MARTINGALE_STEPS,

      maxStake:
        CONFIG.MAX_STAKE,

      martingaleStep: 0,

      sessionPL: 0,

      tradeCount: 0,

      wins: 0,

      losses: 0,

      pending: false
    }
  };

  /* =======================================================
     INITIAL MARKET STATE
  ======================================================= */

  MARKETS.forEach((market) => {
    state.histories[market.symbol] = [];

    state.marketData[market.symbol] = {
      symbol: market.symbol,
      name: market.name,
      short: market.short,

      quote: null,
      digit: null,

      lastUpdate: 0,

      connected: false,

      analysis: null
    };
  });

  /* =======================================================
     DOM HELPERS
  ======================================================= */

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function setText(selector, value) {
    const el = $(selector);

    if (el) {
      el.textContent =
        value === undefined ||
        value === null
          ? "—"
          : String(value);
    }
  }

  function setHTML(selector, html) {
    const el = $(selector);

    if (el) {
      el.innerHTML = html;
    }
  }

  function show(selector, display = "") {
    const el = $(selector);

    if (el) {
      el.style.display = display;
    }
  }

  function hide(selector) {
    const el = $(selector);

    if (el) {
      el.style.display = "none";
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, decimals = 1) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    const factor = Math.pow(10, decimals);

    return Math.round(number * factor) / factor;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getMarket(symbol) {
    return (
      MARKETS.find(
        (market) => market.symbol === symbol
      ) || MARKETS[0]
    );
  }

  function getSelectedMarket() {
    return getMarket(state.selectedSymbol);
  }

  /* =======================================================
     V4 CARD STYLES
     =======================================================

     These styles are injected automatically so the scanner
     still displays correctly even when style.css is missing
     the V4 card classes.
  ======================================================= */

  function injectV4Styles() {
    if ($("#krishwave-v4-card-styles")) {
      return;
    }

    const style = document.createElement("style");

    style.id = "krishwave-v4-card-styles";

    style.textContent = `
      /* ==============================================
         KRISHWAVE V4 MARKET CARDS
      ============================================== */

      #marketScannerList {
        width: 100%;
        display: grid !important;
        grid-template-columns:
          repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
        align-items: stretch;
        box-sizing: border-box;
      }

      .market-card {
        position: relative;
        min-height: 175px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.10);
        background:
          linear-gradient(
            145deg,
            rgba(255,255,255,.08),
            rgba(255,255,255,.025)
          );
        box-shadow:
          0 10px 30px rgba(0,0,0,.18);
        overflow: hidden;
        cursor: pointer;
        transition:
          transform .18s ease,
          border-color .18s ease,
          box-shadow .18s ease;
        box-sizing: border-box;
      }

      .market-card:hover {
        transform: translateY(-3px);
        border-color: rgba(0,220,255,.55);
        box-shadow:
          0 14px 36px rgba(0,0,0,.25);
      }

      .market-card.selected {
        border-color: rgba(0,220,255,.85);
        box-shadow:
          0 0 0 1px rgba(0,220,255,.2),
          0 15px 38px rgba(0,0,0,.25);
      }

      .market-card::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        right: 0;
        height: 3px;
        background:
          linear-gradient(
            90deg,
            #00e5ff,
            #7c4dff,
            #00e5ff
          );
        opacity: .85;
      }

      .market-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 13px;
      }

      .market-card-name {
        font-size: 14px;
        font-weight: 800;
        line-height: 1.25;
        letter-spacing: .1px;
      }

      .market-card-symbol {
        margin-top: 4px;
        font-size: 11px;
        opacity: .58;
        font-weight: 600;
      }

      .market-live {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 8px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: .7px;
        text-transform: uppercase;
        background: rgba(0,220,140,.12);
        color: #27e59a;
        white-space: nowrap;
      }

      .live-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 9px currentColor;
        animation: kwPulse 1.2s infinite;
      }

      .market-card-signal {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(0,0,0,.13);
        margin-bottom: 12px;
      }

      .signal-label {
        font-size: 13px;
        font-weight: 900;
      }

      .signal-quality {
        font-size: 10px;
        font-weight: 800;
        opacity: .72;
        text-transform: uppercase;
      }

      .market-card-stats {
        display: grid;
        grid-template-columns:
          repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .market-card-stats > div {
        padding: 8px;
        border-radius: 10px;
        background: rgba(255,255,255,.045);
        min-width: 0;
      }

      .market-card-stats small {
        display: block;
        font-size: 9px;
        opacity: .52;
        margin-bottom: 3px;
      }

      .market-card-stats strong {
        display: block;
        font-size: 13px;
        font-weight: 900;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .market-card-rank {
        position: absolute;
        right: 12px;
        bottom: 10px;
        font-size: 9px;
        opacity: .35;
        font-weight: 900;
      }

      .market-card.signal-good {
        border-color: rgba(39,229,154,.38);
      }

      .market-card.signal-medium {
        border-color: rgba(255,190,60,.35);
      }

      .market-card.signal-weak {
        border-color: rgba(255,90,100,.25);
      }

      /* ==============================================
         AI STATUS
      ============================================== */

      #aiCircleStatus {
        transition:
          transform .2s ease,
          box-shadow .2s ease;
      }

      .kw-ai-active {
        animation: kwAiPulse 1s infinite;
      }

      @keyframes kwPulse {
        0%,100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: .45;
          transform: scale(.75);
        }
      }

      @keyframes kwAiPulse {
        0%,100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.04);
        }
      }

      /* ==============================================
         DIGIT DISTRIBUTION
      ============================================== */

      #krishwaveDigitGrid {
        width: 100%;
        display: grid;
        grid-template-columns:
          repeat(10, minmax(35px, 1fr));
        gap: 7px;
        margin-top: 10px;
      }

      .kw-digit-box {
        min-width: 0;
        padding: 9px 5px;
        text-align: center;
        border-radius: 10px;
        background: rgba(255,255,255,.045);
        border: 1px solid rgba(255,255,255,.06);
      }

      .kw-digit-number {
        font-size: 14px;
        font-weight: 900;
      }

      .kw-digit-bar {
        height: 4px;
        margin: 7px 0 5px;
        border-radius: 20px;
        overflow: hidden;
        background: rgba(255,255,255,.08);
      }

      .kw-digit-fill {
        height: 100%;
        border-radius: inherit;
        background: currentColor;
        transition: width .25s ease;
      }

      .kw-digit-percent {
        font-size: 9px;
        opacity: .65;
      }

      /* ==============================================
         MOBILE
      ============================================== */

      @media (max-width: 700px) {
        #marketScannerList {
          grid-template-columns: 1fr !important;
        }

        .market-card {
          min-height: 165px;
        }

        #krishwaveDigitGrid {
          grid-template-columns:
            repeat(5, minmax(35px, 1fr));
        }
      }

      @media (min-width: 701px) and (max-width: 1100px) {
        #marketScannerList {
          grid-template-columns:
            repeat(2, minmax(0, 1fr)) !important;
        }
      }

      /* ==============================================
         TRADING CONTROL CENTER
      ============================================== */

      .kw-trade-panel {
        display: grid;
        grid-template-columns:
          repeat(auto-fit, minmax(145px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }

      .kw-trade-stat {
        padding: 12px;
        border-radius: 13px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.035);
      }

      .kw-trade-stat-label {
        font-size: 9px;
        opacity: .55;
        text-transform: uppercase;
        letter-spacing: .5px;
      }

      .kw-trade-stat-value {
        margin-top: 4px;
        font-size: 16px;
        font-weight: 900;
      }

      /* Light mode */
      body.light .market-card,
      body[data-theme="light"] .market-card {
        background: rgba(255,255,255,.9);
        border-color: rgba(0,0,0,.09);
        box-shadow: 0 8px 25px rgba(0,0,0,.08);
      }

      body.light .market-card-signal,
      body[data-theme="light"] .market-card-signal {
        background: rgba(0,0,0,.04);
      }

      body.light .market-card-stats > div,
      body[data-theme="light"] .market-card-stats > div {
        background: rgba(0,0,0,.035);
      }
    `;

    document.head.appendChild(style);
  }

  /* =======================================================
     CONNECTION STATUS
  ======================================================= */

  function updateConnectionUI(status) {
    const connected =
      status === "connected";

    const connecting =
      status === "connecting";

    state.connected = connected;
    state.connecting = connecting;

    setText(
      "#accountStatus",
      connected
        ? "Connected"
        : connecting
        ? "Connecting…"
        : "Disconnected"
    );

    setText(
      "#engineStatus",
      connected
        ? "LIVE"
        : connecting
        ? "CONNECTING"
        : "OFFLINE"
    );

    setText(
      "#footerStatus",
      connected
        ? "Deriv live market stream connected"
        : connecting
        ? "Connecting to Deriv market stream…"
        : "Deriv market stream disconnected"
    );

    setText(
      "#connectedMarkets",
      Object.values(state.marketData)
        .filter((market) => market.connected)
        .length
    );

    $all(".status-dot").forEach((dot) => {
      dot.classList.toggle(
        "active",
        connected
      );
    });
  }

  /* =======================================================
     DERIV CONNECTION
  ======================================================= */

  function connect() {
    if (
      state.connecting ||
      state.connected
    ) {
      return;
    }

    clearTimeout(state.reconnectTimer);

    state.connecting = true;

    updateConnectionUI("connecting");

    try {
      state.socket = new WebSocket(
        CONFIG.WS_URL
      );
    } catch (error) {
      console.error(
        "KRISHWAVE WebSocket error:",
        error
      );

      state.connecting = false;

      updateConnectionUI("disconnected");

      scheduleReconnect();

      return;
    }

    state.socket.addEventListener(
      "open",
      onSocketOpen
    );

    state.socket.addEventListener(
      "message",
      onSocketMessage
    );

    state.socket.addEventListener(
      "error",
      onSocketError
    );

    state.socket.addEventListener(
      "close",
      onSocketClose
    );
  }

  function onSocketOpen() {
    state.connecting = false;
    state.connected = true;
    state.lastMessageAt = Date.now();

    updateConnectionUI("connected");

    subscribeAllMarkets();

    startWatchdog();

    setText(
      "#lastAction",
      "Live market stream connected"
    );
  }

  function onSocketError(error) {
    console.warn(
      "KRISHWAVE WebSocket error",
      error
    );

    setText(
      "#lastAction",
      "WebSocket connection error"
    );
  }

  function onSocketClose() {
    state.connected = false;
    state.connecting = false;

    updateConnectionUI("disconnected");

    stopWatchdog();

    MARKETS.forEach((market) => {
      state.marketData[
        market.symbol
      ].connected = false;
    });

    renderMarketScanner();

    scheduleReconnect();
  }

  function scheduleReconnect() {
    clearTimeout(
      state.reconnectTimer
    );

    state.reconnectTimer =
      setTimeout(() => {
        connect();
      }, CONFIG.RECONNECT_DELAY);
  }

  function disconnect() {
    clearTimeout(
      state.reconnectTimer
    );

    stopWatchdog();

    if (state.socket) {
      try {
        state.socket.close();
      } catch (_) {}
    }

    state.socket = null;
    state.connected = false;
    state.connecting = false;

    updateConnectionUI(
      "disconnected"
    );
  }

  /* =======================================================
     WATCHDOG
  ======================================================= */

  function startWatchdog() {
    stopWatchdog();

    state.watchdogTimer =
      setInterval(() => {
        if (!state.connected) {
          return;
        }

        const silentFor =
          Date.now() -
          state.lastMessageAt;

        if (
          silentFor >
          CONFIG.WATCHDOG_MS
        ) {
          console.warn(
            "KRISHWAVE stream watchdog triggered"
          );

          try {
            state.socket.close();
          } catch (_) {}
        }
      }, 5000);
  }

  function stopWatchdog() {
    clearInterval(
      state.watchdogTimer
    );

    state.watchdogTimer = null;
  }

  /* =======================================================
     SEND WEBSOCKET REQUEST
  ======================================================= */

  function sendSocket(payload) {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      return false;
    }

    try {
      state.socket.send(
        JSON.stringify(payload)
      );

      return true;
    } catch (error) {
      console.error(
        "KRISHWAVE send error:",
        error
      );

      return false;
    }
  }

  /* =======================================================
     SUBSCRIBE
  ======================================================= */

  function subscribeMarket(symbol) {
    if (
      state.subscribedSymbols.has(
        symbol
      )
    ) {
      return;
    }

    const sent = sendSocket({
      ticks: symbol,
      subscribe: 1
    });

    if (sent) {
      state.subscribedSymbols.add(
        symbol
      );
    }
  }

  function subscribeAllMarkets() {
    MARKETS.forEach((market) => {
      subscribeMarket(
        market.symbol
      );
    });
  }

  /* =======================================================
     MESSAGE HANDLER
  ======================================================= */

  function onSocketMessage(event) {
    state.lastMessageAt =
      Date.now();

    let data;

    try {
      data =
        JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (data.error) {
      console.warn(
        "Deriv API error:",
        data.error
      );

      setText(
        "#lastAction",
        data.error.message ||
          "Deriv API error"
      );

      return;
    }

    if (
      data.msg_type === "tick" &&
      data.tick
    ) {
      handleTick(data.tick);

      return;
    }

    if (
      data.msg_type === "proposal"
    ) {
      window.dispatchEvent(
        new CustomEvent(
          "krishwave:proposal-response",
          {
            detail: data
          }
        )
      );

      return;
    }

    if (
      data.msg_type === "buy"
    ) {
      window.dispatchEvent(
        new CustomEvent(
          "krishwave:buy-response",
          {
            detail: data
          }
        )
      );

      return;
    }

    if (
      data.msg_type ===
      "profit_table"
    ) {
      window.dispatchEvent(
        new CustomEvent(
          "krishwave:profit-table",
          {
            detail: data
          }
        )
      );

      return;
    }

    if (
      data.msg_type === "transaction"
    ) {
      window.dispatchEvent(
        new CustomEvent(
          "krishwave:trade-result",
          {
            detail: data
          }
        )
      );
    }
  }

  /* =======================================================
     TICK HANDLER
  ======================================================= */

  function handleTick(tick) {
    const symbol =
      tick.symbol;

    if (
      !state.histories[symbol]
    ) {
      state.histories[symbol] = [];
    }

    const quote =
      Number(tick.quote);

    if (!Number.isFinite(quote)) {
      return;
    }

    const digit =
      getLastDigit(
        quote,
        tick.pip_size
      );

    const history =
      state.histories[symbol];

    history.push({
      quote,
      digit,
      epoch:
        Number(tick.epoch) ||
        Math.floor(
          Date.now() / 1000
        )
    });

    while (
      history.length >
      CONFIG.MAX_HISTORY
    ) {
      history.shift();
    }

    const market =
      state.marketData[symbol];

    if (market) {
      market.quote = quote;
      market.digit = digit;
      market.lastUpdate =
        Date.now();
      market.connected = true;
    }

    if (
      symbol ===
      state.selectedSymbol
    ) {
      renderSelectedMarket();

      if (state.aiRunning) {
        updateAIFromLatestData();
      }
    }

    renderMarketScanner();

    renderDigitDistribution();

    renderProbabilities();
  }

  /* =======================================================
     LAST DIGIT
  ======================================================= */

  function getLastDigit(
    quote,
    pipSize
  ) {
    let decimals = 2;

    if (
      Number.isFinite(
        Number(pipSize)
      )
    ) {
      decimals =
        Number(pipSize);
    }

    const factor =
      Math.pow(10, decimals);

    const scaled =
      Math.round(
        Number(quote) * factor
      );

    return Math.abs(
      scaled % 10
    );
  }

  /* =======================================================
     DIGIT ANALYSIS
  ======================================================= */

  function getRecentHistory(
    symbol
  ) {
    const history =
      state.histories[symbol] ||
      [];

    return history.slice(
      -CONFIG.RECENT_WINDOW
    );
  }

  function digitCounts(history) {
    const counts =
      Array(10).fill(0);

    history.forEach((item) => {
      const digit =
        Number(item.digit);

      if (
        digit >= 0 &&
        digit <= 9
      ) {
        counts[digit]++;
      }
    });

    return counts;
  }

  function percentagesFromCounts(
    counts,
    total
  ) {
    return counts.map(
      (count) =>
        total
          ? (count / total) * 100
          : 0
    );
  }

  function analyzeDigits(
    symbol
  ) {
    const history =
      getRecentHistory(symbol);

    const total =
      history.length;

    const counts =
      digitCounts(history);

    const percentages =
      percentagesFromCounts(
        counts,
        total
      );

    const even =
      history.filter(
        (item) =>
          item.digit % 2 === 0
      ).length;

    const odd =
      total - even;

    const low =
      history.filter(
        (item) =>
          item.digit <= 4
      ).length;

    const high =
      total - low;

    const under5 =
      low;

    const over4 =
      high;

    const lastDigit =
      total
        ? history[
            total - 1
          ].digit
        : null;

    const dominantDigit =
      percentages.length
        ? percentages.indexOf(
            Math.max(
              ...percentages
            )
          )
        : null;

    const dominantRate =
      dominantDigit !== null
        ? percentages[
            dominantDigit
          ]
        : 0;

    return {
      history,
      total,
      counts,
      percentages,

      even,
      odd,

      low,
      high,

      under5,
      over4,

      lastDigit,

      dominantDigit,
      dominantRate
    };
  }

  /* =======================================================
     STREAK
  ======================================================= */

  function getStreak(
    history
  ) {
    if (!history.length) {
      return null;
    }

    const last =
      history[
        history.length - 1
      ].digit;

    let count = 0;

    for (
      let i =
        history.length - 1;
      i >= 0;
      i--
    ) {
      if (
        history[i].digit ===
        last
      ) {
        count++;
      } else {
        break;
      }
    }

    return {
      digit: last,
      count
    };
  }

  function getParityStreak(
    history
  ) {
    if (!history.length) {
      return null;
    }

    const lastEven =
      history[
        history.length - 1
      ].digit %
        2 ===
      0;

    let count = 0;

    for (
      let i =
        history.length - 1;
      i >= 0;
      i--
    ) {
      const even =
        history[i].digit %
          2 ===
        0;

      if (even === lastEven) {
        count++;
      } else {
        break;
      }
    }

    return {
      even: lastEven,
      count
    };
  }

  /* =======================================================
     MOMENTUM
  ======================================================= */

  function calculateMomentum(
    history
  ) {
    if (
      history.length <
      10
    ) {
      return {
        rise: 50,
        fall: 50,
        direction: "NEUTRAL"
      };
    }

    const recent =
      history.slice(-10);

    let rise = 0;
    let fall = 0;

    for (
      let i = 1;
      i < recent.length;
      i++
    ) {
      if (
        recent[i].quote >
        recent[i - 1].quote
      ) {
        rise++;
      } else if (
        recent[i].quote <
        recent[i - 1].quote
      ) {
        fall++;
      }
    }

    const total =
      rise + fall;

    if (!total) {
      return {
        rise: 50,
        fall: 50,
        direction: "NEUTRAL"
      };
    }

    const risePct =
      (rise / total) * 100;

    const fallPct =
      (fall / total) * 100;

    return {
      rise: risePct,
      fall: fallPct,

      direction:
        risePct > fallPct
          ? "RISE"
          : fallPct > risePct
          ? "FALL"
          : "NEUTRAL"
    };
  }

  /* =======================================================
     STRATEGY ANALYSIS
  ======================================================= */

  function analyzeStrategy(
    symbol,
    strategy
  ) {
    const data =
      analyzeDigits(symbol);

    const momentum =
      calculateMomentum(
        data.history
      );

    const streak =
      getStreak(
        data.history
      );

    const parityStreak =
      getParityStreak(
        data.history
      );

    if (
      data.total <
      CONFIG.MIN_SAMPLE
    ) {
      return {
        strategy,
        prediction: "WAIT",
        target: null,
        confidence: 0,
        edge: 0,
        quality: "BUILDING",
        reason:
          `Collecting data (${data.total}/${CONFIG.MIN_SAMPLE} ticks).`,
        sample: data.total,
        lastDigit:
          data.lastDigit,
        dominantDigit:
          data.dominantDigit,
        dominantRate:
          data.dominantRate,
        momentum,
        streak,
        parityStreak
      };
    }

    let prediction =
      "WAIT";

    let confidence = 50;

    let edge = 0;

    let target = null;

    let reason =
      "Market analysis ready.";

    switch (strategy) {
      case "EVEN": {
        const evenPct =
          (data.even /
            data.total) *
          100;

        const oddPct =
          100 - evenPct;

        prediction =
          evenPct >= oddPct
            ? "EVEN"
            : "ODD";

        confidence =
          Math.max(
            evenPct,
            oddPct
          );

        edge =
          Math.abs(
            evenPct - oddPct
          );

        reason =
          `Even/Odd distribution favors ${prediction}.`;

        break;
      }

      case "ODD": {
        const oddPct =
          (data.odd /
            data.total) *
          100;

        const evenPct =
          100 - oddPct;

        prediction =
          oddPct >= evenPct
            ? "ODD"
            : "EVEN";

        confidence =
          Math.max(
            oddPct,
            evenPct
          );

        edge =
          Math.abs(
            oddPct - evenPct
          );

        reason =
          `Parity pressure favors ${prediction}.`;

        break;
      }

      case "HIGH": {
        const highPct =
          (data.high /
            data.total) *
          100;

        const lowPct =
          100 - highPct;

        prediction =
          highPct >= lowPct
            ? "HIGH"
            : "LOW";

        confidence =
          Math.max(
            highPct,
            lowPct
          );

        edge =
          Math.abs(
            highPct - lowPct
          );

        reason =
          `Digit range distribution favors ${prediction}.`;

        break;
      }

      case "LOW": {
        const lowPct =
          (data.low /
            data.total) *
          100;

        const highPct =
          100 - lowPct;

        prediction =
          lowPct >= highPct
            ? "LOW"
            : "HIGH";

        confidence =
          Math.max(
            lowPct,
            highPct
          );

        edge =
          Math.abs(
            lowPct - highPct
          );

        reason =
          `Low/high digit pressure favors ${prediction}.`;

        break;
      }

      case "OVER": {
        const overPct =
          (data.over4 /
            data.total) *
          100;

        const underPct =
          100 - overPct;

        prediction =
          overPct >= underPct
            ? "OVER 4"
            : "UNDER 5";

        target = 4;

        confidence =
          Math.max(
            overPct,
            underPct
          );

        edge =
          Math.abs(
            overPct - underPct
          );

        reason =
          `Over/Under distribution favors ${prediction}.`;

        break;
      }

      case "UNDER": {
        const underPct =
          (data.under5 /
            data.total) *
          100;

        const overPct =
          100 - underPct;

        prediction =
          underPct >= overPct
            ? "UNDER 5"
            : "OVER 4";

        target = 5;

        confidence =
          Math.max(
            underPct,
            overPct
          );

        edge =
          Math.abs(
            underPct - overPct
          );

        reason =
          `Under/Over distribution favors ${prediction}.`;

        break;
      }

      case "MATCH": {
        target =
          data.dominantDigit;

        confidence =
          data.dominantRate;

        edge =
          data.dominantRate -
          10;

        prediction =
          target !== null
            ? `MATCH ${target}`
            : "WAIT";

        reason =
          target !== null
            ? `Digit ${target} has the strongest observed frequency.`
            : "No dominant digit yet.";

        break;
      }

      case "DIFFER": {
        target =
          data.dominantDigit;

        confidence =
          100 -
          data.dominantRate;

        edge =
          confidence - 90;

        prediction =
          target !== null
            ? `DIFFER ${target}`
            : "WAIT";

        reason =
          target !== null
            ? `Differ pressure is measured against digit ${target}.`
            : "No target digit available.";

        break;
      }

      case "RISE": {
        prediction =
          momentum.rise >=
          momentum.fall
            ? "RISE"
            : "FALL";

        confidence =
          Math.max(
            momentum.rise,
            momentum.fall
          );

        edge =
          Math.abs(
            momentum.rise -
              momentum.fall
          );

        reason =
          `Recent price movement favors ${prediction}.`;

        break;
      }

      case "FALL": {
        prediction =
          momentum.fall >=
          momentum.rise
            ? "FALL"
            : "RISE";

        confidence =
          Math.max(
            momentum.fall,
            momentum.rise
          );

        edge =
          Math.abs(
            momentum.fall -
              momentum.rise
          );

        reason =
          `Recent price movement favors ${prediction}.`;

        break;
      }

      default:
        return analyzeAuto(symbol);
    }

    confidence =
      clamp(
        confidence,
        0,
        99
      );

    edge =
      Math.max(
        0,
        round(edge)
      );

    let quality =
      "WEAK";

    if (
      confidence >= 70 &&
      edge >= 10
    ) {
      quality = "STRONG";
    } else if (
      confidence >= 58 &&
      edge >= 5
    ) {
      quality = "MEDIUM";
    }

    return {
      strategy,
      prediction,
      target,
      confidence:
        round(confidence),
      edge,
      quality,
      reason,
      sample:
        data.total,
      lastDigit:
        data.lastDigit,
      dominantDigit:
        data.dominantDigit,
      dominantRate:
        data.dominantRate,
      momentum,
      streak,
      parityStreak
    };
  }

  /* =======================================================
     AUTO STRATEGY
  ======================================================= */

  function analyzeAuto(
    symbol
  ) {
    const candidates = [
      analyzeStrategy(
        symbol,
        "EVEN"
      ),
      analyzeStrategy(
        symbol,
        "ODD"
      ),
      analyzeStrategy(
        symbol,
        "HIGH"
      ),
      analyzeStrategy(
        symbol,
        "LOW"
      ),
      analyzeStrategy(
        symbol,
        "OVER"
      ),
      analyzeStrategy(
        symbol,
        "UNDER"
      ),
      analyzeStrategy(
        symbol,
        "MATCH"
      ),
      analyzeStrategy(
        symbol,
        "DIFFER"
      ),
      analyzeStrategy(
        symbol,
        "RISE"
      ),
      analyzeStrategy(
        symbol,
        "FALL"
      )
    ].filter(
      (item) =>
        item.prediction !==
        "WAIT"
    );

    if (!candidates.length) {
      return {
        strategy: "AUTO",
        prediction: "WAIT",
        target: null,
        confidence: 0,
        edge: 0,
        quality: "BUILDING",
        reason:
          "Waiting for enough market data.",
        sample:
          state.histories[
            symbol
          ]?.length || 0,
        lastDigit:
          null,
        dominantDigit:
          null,
        dominantRate:
          0
      };
    }

    candidates.sort(
      (a, b) => {
        const scoreA =
          a.confidence +
          a.edge * 1.5;

        const scoreB =
          b.confidence +
          b.edge * 1.5;

        return (
          scoreB - scoreA
        );
      }
    );

    const best =
      candidates[0];

    return {
      ...best,
      strategy: "AUTO",
      reason:
        `AUTO selected ${best.strategy}: ${best.reason}`
    };
  }

  /* =======================================================
     SIGNAL SCORE
  ======================================================= */

  function signalScore(
    result
  ) {
    if (!result) {
      return 0;
    }

    return clamp(
      result.confidence +
        result.edge * 1.5,
      0,
      100
    );
  }

  function qualityClass(
    result
  ) {
    if (!result) {
      return "signal-weak";
    }

    const score =
      signalScore(result);

    if (score >= 75) {
      return "signal-good";
    }

    if (score >= 58) {
      return "signal-medium";
    }

    return "signal-weak";
  }

  /* =======================================================
     SELECT MARKET
  ======================================================= */

  function selectMarket(
    symbol
  ) {
    if (
      !state.histories[symbol]
    ) {
      return;
    }

    state.selectedSymbol =
      symbol;

    renderSelectedMarket();

    renderMarketScanner();

    renderDigitDistribution();

    renderProbabilities();

    updateAIFromLatestData();

    setText(
      "#lastAction",
      `Selected ${getMarket(symbol).name}`
    );

    $all(
      ".market-card"
    ).forEach((card) => {
      card.classList.toggle(
        "selected",
        card.dataset.symbol ===
          symbol
      );
    });
  }

  /* =======================================================
     SELECT STRATEGY
  ======================================================= */

  function selectStrategy(
    strategy
  ) {
    if (
      !STRATEGIES[strategy]
    ) {
      strategy = "AUTO";
    }

    state.selectedStrategy =
      strategy;

    const config =
      STRATEGIES[strategy];

    setText(
      "#strategyCurrentIcon",
      config.icon
    );

    setText(
      "#strategyCurrentName",
      config.name
    );

    setText(
      "#strategyCurrentButton",
      config.name
    );

    setText(
      "#strategyDisplay",
      config.name
    );

    $all(
      ".strategy-button"
    ).forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.strategy ===
          strategy
      );
    });

    renderSelectedMarket();

    renderMarketScanner();

    updateAIFromLatestData();
  }

  /* =======================================================
     RENDER SELECTED MARKET
  ======================================================= */

  function renderSelectedMarket() {
    const market =
      getSelectedMarket();

    const data =
      analyzeDigits(
        market.symbol
      );

    const result =
      state.selectedStrategy ===
      "AUTO"
        ? analyzeAuto(
            market.symbol
          )
        : analyzeStrategy(
            market.symbol,
            state.selectedStrategy
          );

    state.currentAnalysis =
      result;

    setText(
      "#selectedSymbol",
      market.symbol
    );

    setText(
      "#selectedMarketName",
      market.name
    );

    setText(
      "#selectedMarket",
      market.name
    );

    setText(
      "#marketCode",
      market.symbol
    );

    setText(
      "#selectedQuote",
      market.quote !== null
        ? market.quote
        : "—"
    );

    setText(
      "#quote",
      market.quote !== null
        ? market.quote
        : "—"
    );

    setText(
      "#selectedDigit",
      data.lastDigit !== null
        ? data.lastDigit
        : "—"
    );

    setText(
      "#lastDigit",
      data.lastDigit !== null
        ? data.lastDigit
        : "—"
    );

    setText(
      "#selectedSample",
      data.total
    );

    setText(
      "#sample",
      data.total
    );

    setText(
      "#liveTicks",
      data.total
    );

    setText(
      "#selectedEdge",
      result.edge !== undefined
        ? `${round(result.edge)}%`
        : "—"
    );

    setText(
      "#selectedQuality",
      result.quality || "—"
    );

    const streak =
      getStreak(
        data.history
      );

    setText(
      "#streak",
      streak
        ? `${streak.count} × ${streak.digit}`
        : "—"
    );

    renderAIResult(result);

    renderReasons(
      result,
      data
    );
  }

  /* =======================================================
     DIGIT DISTRIBUTION
  ======================================================= */

  function renderDigitDistribution() {
    const container =
      $("#krishwaveDigitGrid");

    const market =
      getSelectedMarket();

    const data =
      analyzeDigits(
        market.symbol
      );

    if (!container) {
      return;
    }

    const total =
      data.total;

    container.innerHTML =
      data.percentages
        .map(
          (percent, digit) => {
            const width =
              clamp(
                percent * 4,
                2,
                100
              );

            return `
              <div
                class="kw-digit-box"
                title="Digit ${digit}: ${round(percent)}%"
              >
                <div class="kw-digit-number">
                  ${digit}
                </div>

                <div class="kw-digit-bar">
                  <div
                    class="kw-digit-fill"
                    style="width:${width}%"
                  ></div>
                </div>

                <div class="kw-digit-percent">
                  ${round(percent)}%
                </div>
              </div>
            `;
          }
        )
        .join("");

    $all(
      "#digit0,#digit1,#digit2,#digit3,#digit4,#digit5,#digit6,#digit7,#digit8,#digit9"
    ).forEach((el) => {
      const digit =
        Number(
          el.id.replace(
            "digit",
            ""
          )
        );

      const percent =
        data.percentages[digit] ||
        0;

      setText(
        `#digit${digit}`,
        `${round(percent)}%`
      );
    });
  }

  /* =======================================================
     PROBABILITIES
  ======================================================= */

  function renderProbabilities() {
    const market =
      getSelectedMarket();

    const data =
      analyzeDigits(
        market.symbol
      );

    if (!data.total) {
      return;
    }

    const evenPct =
      (data.even /
        data.total) *
      100;

    const oddPct =
      (data.odd /
        data.total) *
      100;

    const highPct =
      (data.high /
        data.total) *
      100;

    const lowPct =
      (data.low /
        data.total) *
      100;

    const overPct =
      (data.over4 /
        data.total) *
      100;

    const underPct =
      (data.under5 /
        data.total) *
      100;

    const dominant =
      data.dominantRate;

    const differPct =
      100 -
      dominant;

    const momentum =
      calculateMomentum(
        data.history
      );

    setText(
      "#evenPercent",
      `${round(evenPct)}%`
    );

    setText(
      "#oddPercent",
      `${round(oddPct)}%`
    );

    setText(
      "#highPercent",
      `${round(highPct)}%`
    );

    setText(
      "#lowPercent",
      `${round(lowPct)}%`
    );

    setText(
      "#overPercent",
      `${round(overPct)}%`
    );

    setText(
      "#underPercent",
      `${round(underPct)}%`
    );

    setText(
      "#matchPercent",
      `${round(dominant)}%`
    );

    setText(
      "#differPercent",
      `${round(differPct)}%`
    );

    setText(
      "#risePercent",
      `${round(momentum.rise)}%`
    );

    setText(
      "#fallPercent",
      `${round(momentum.fall)}%`
    );
  }

  /* =======================================================
     AI RENDER
  ======================================================= */

  function renderAIResult(
    result
  ) {
    if (!result) {
      return;
    }

    const prediction =
      result.prediction ||
      "WAIT";

    const targetText =
      result.target !== null &&
      result.target !== undefined
        ? ` • ${result.target}`
        : "";

    setText(
      "#aiPrediction",
      prediction
    );

    setText(
      "#aiPredictionResult",
      prediction
    );

    setText(
      "#aiResultMain",
      `${prediction}${targetText}`
    );

    setText(
      "#aiResultConfidence",
      result.confidence
        ? `${result.confidence}%`
        : "—"
    );

    setText(
      "#aiConfidence",
      result.confidence
        ? `${result.confidence}%`
        : "—"
    );

    setText(
      "#aiTarget",
      result.target !== null &&
        result.target !== undefined
        ? result.target
        : "—"
    );

    setText(
      "#aiSample",
      result.sample || "—"
    );

    setText(
      "#aiEdge",
      result.edge !== undefined
        ? `${round(result.edge)}%`
        : "—"
    );

    setText(
      "#aiResultStatus",
      result.quality || "WAITING"
    );

    setText(
      "#aiReason",
      result.reason ||
        "Waiting for analysis."
    );

    setText(
      "#strategyDisplay",
      result.strategy ===
        "AUTO"
        ? state.selectedStrategy
        : result.strategy
    );

    const circle =
      $("#aiCircleStatus");

    if (circle) {
      circle.classList.toggle(
        "kw-ai-active",
        state.aiRunning
      );
    }
  }

  /* =======================================================
     REASONS
  ======================================================= */

  function renderReasons(
    result,
    data
  ) {
    if (!result) {
      return;
    }

    setText(
      "#reasonMarket",
      getSelectedMarket().name
    );

    setText(
      "#reasonStrategy",
      result.strategy
    );

    setText(
      "#reasonLastDigit",
      data.lastDigit !== null
        ? data.lastDigit
        : "—"
    );

    setText(
      "#reasonDigitPressure",
      data.dominantDigit !== null
        ? `${data.dominantDigit} (${round(data.dominantRate)}%)`
        : "—"
    );

    setText(
      "#reasonSignalStrength",
      `${round(signalScore(result))}%`
    );

    setText(
      "#reasonSample",
      data.total
    );

    setText(
      "#dominantDigit",
      data.dominantDigit !== null
        ? data.dominantDigit
        : "—"
    );

    setText(
      "#digitRate",
      data.dominantDigit !== null
        ? `${round(data.dominantRate)}%`
        : "—"
    );
  }

  /* =======================================================
     MARKET SCANNER
  ======================================================= */

  function renderMarketScanner() {
    const container =
      $("#marketScannerList");

    if (!container) {
      return;
    }

    const results =
      MARKETS.map(
        (market) => {
          const history =
            getRecentHistory(
              market.symbol
            );

          const result =
            state.selectedStrategy ===
            "AUTO"
              ? analyzeAuto(
                  market.symbol
                )
              : analyzeStrategy(
                  market.symbol,
                  state.selectedStrategy
                );

          const marketData =
            state.marketData[
              market.symbol
            ];

          return {
            market,
            result,
            marketData,
            sample:
              history.length,
            score:
              signalScore(result)
          };
        }
      );

    results.sort(
      (a, b) =>
        b.score - a.score
    );

    container.innerHTML =
      results
        .map(
          (item, index) => {
            const {
              market,
              result,
              marketData,
              sample
            } = item;

            const selected =
              market.symbol ===
              state.selectedSymbol;

            const live =
              marketData?.connected;

            const quality =
              result?.quality ||
              "BUILDING";

            const signal =
              result?.prediction ||
              "WAIT";

            const quote =
              marketData?.quote !==
                null &&
              marketData?.quote !==
                undefined
                ? marketData.quote
                : "—";

            const digit =
              marketData?.digit !==
                null &&
              marketData?.digit !==
                undefined
                ? marketData.digit
                : "—";

            return `
              <article
                class="
                  market-card
                  ${selected ? "selected" : ""}
                  ${qualityClass(result)}
                "
                data-symbol="${escapeHTML(
                  market.symbol
                )}"
                role="button"
                tabindex="0"
                aria-label="${escapeHTML(
                  market.name
                )}"
              >

                <div class="market-card-top">

                  <div>
                    <div class="market-card-name">
                      ${escapeHTML(
                        market.name
                      )}
                    </div>

                    <div class="market-card-symbol">
                      ${escapeHTML(
                        market.symbol
                      )}
                    </div>
                  </div>

                  <div class="market-live">
                    <span class="live-dot"></span>
                    ${live ? "LIVE" : "WAIT"}
                  </div>

                </div>

                <div class="market-card-signal">

                  <span class="signal-label">
                    ${escapeHTML(
                      signal
                    )}
                  </span>

                  <span class="signal-quality">
                    ${escapeHTML(
                      quality
                    )}
                  </span>

                </div>

                <div class="market-card-stats">

                  <div>
                    <small>QUOTE</small>
                    <strong>
                      ${escapeHTML(
                        quote
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>DIGIT</small>
                    <strong>
                      ${escapeHTML(
                        digit
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>CONFIDENCE</small>
                    <strong>
                      ${
                        result?.confidence
                          ? `${round(
                              result.confidence
                            )}%`
                          : "—"
                      }
                    </strong>
                  </div>

                </div>

                <div class="market-card-rank">
                  #${index + 1}
                </div>

              </article>
            `;
          }
        )
        .join("");

    $all(
      ".market-card"
    ).forEach((card) => {
      card.addEventListener(
        "click",
        () => {
          selectMarket(
            card.dataset.symbol
          );
        }
      );

      card.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key ===
              "Enter" ||
            event.key ===
              " "
          ) {
            event.preventDefault();

            selectMarket(
              card.dataset.symbol
            );
          }
        }
      );
    });

    setText(
      "#marketCount",
      MARKETS.length
    );

    setText(
      "#connectedMarkets",
      Object.values(
        state.marketData
      ).filter(
        (item) =>
          item.connected
      ).length
    );
  }

  /* =======================================================
     SCAN ALL
  ======================================================= */

  function scanAllMarkets() {
    renderMarketScanner();

    setText(
      "#lastAction",
      `Scanned ${MARKETS.length} Volatility Indices`
    );
  }

  /* =======================================================
     AI ENGINE
  ======================================================= */

  function startAIEngine() {
    if (state.aiRunning) {
      return;
    }

    state.aiRunning = true;

    setText(
      "#engineState",
      "AI RUNNING"
    );

    setText(
      "#aiCircleStatus",
      "AI"
    );

    setText(
      "#aiResultStatus",
      "SCANNING"
    );

    updateAIFromLatestData();

    clearInterval(
      state.aiTimer
    );

    state.aiTimer =
      setInterval(() => {
        updateAIFromLatestData();
      }, CONFIG.AI_INTERVAL);

    startEntryCountdown();

    setText(
      "#lastAction",
      "AI engine started"
    );
  }

  function stopAIEngine() {
    state.aiRunning = false;

    clearInterval(
      state.aiTimer
    );

    clearInterval(
      state.countdownTimer
    );

    state.aiTimer = null;
    state.countdownTimer =
      null;

    state.countdown = 0;

    setText(
      "#engineState",
      "AI STOPPED"
    );

    setText(
      "#aiCountdown",
      "—"
    );

    setText(
      "#aiResultStatus",
      "STOPPED"
    );

    const circle =
      $("#aiCircleStatus");

    if (circle) {
      circle.classList.remove(
        "kw-ai-active"
      );
    }

    setText(
      "#lastAction",
      "AI engine stopped"
    );
  }

  function updateAIFromLatestData() {
    const market =
      getSelectedMarket();

    const result =
      state.selectedStrategy ===
      "AUTO"
        ? analyzeAuto(
            market.symbol
          )
        : analyzeStrategy(
            market.symbol,
            state.selectedStrategy
          );

    state.currentAnalysis =
      result;

    renderAIResult(result);

    renderSelectedMarket();

    if (
      result &&
      result.prediction !==
        "WAIT"
    ) {
      state.lastTradeSignal =
        result;
    }

    if (
      state.aiRunning
    ) {
      startEntryCountdown();
    }
  }

  function startEntryCountdown() {
    clearInterval(
      state.countdownTimer
    );

    if (!state.aiRunning) {
      return;
    }

    state.countdown =
      CONFIG.COUNTDOWN_SECONDS;

    setText(
      "#aiCountdown",
      `${state.countdown}s`
    );

    state.countdownTimer =
      setInterval(() => {
        if (
          !state.aiRunning
        ) {
          clearInterval(
            state.countdownTimer
          );

          return;
        }

        state.countdown--;

        setText(
          "#aiCountdown",
          state.countdown > 0
            ? `${state.countdown}s`
            : "NOW"
        );

        if (
          state.countdown <=
          0
        ) {
          clearInterval(
            state.countdownTimer
          );

          fireTradeNow();

          if (
            state.aiRunning
          ) {
            startEntryCountdown();
          }
        }
      }, 1000);
  }

  /* =======================================================
     TRADE SIGNAL
  ======================================================= */

  function fireTradeNow() {
    const market =
      getSelectedMarket();

    const result =
      state.selectedStrategy ===
      "AUTO"
        ? analyzeAuto(
            market.symbol
          )
        : analyzeStrategy(
            market.symbol,
            state.selectedStrategy
          );

    state.lastTradeSignal =
      result;

    if (
      !result ||
      result.prediction ===
        "WAIT"
    ) {
      setText(
        "#lastAction",
        "TRADE NOW skipped — insufficient signal"
      );

      return;
    }

    if (
      result.confidence <
      55
    ) {
      setText(
        "#lastAction",
        "TRADE NOW skipped — confidence below threshold"
      );

      return;
    }

    setText(
      "#lastAction",
      `TRADE NOW: ${result.prediction}`
    );

    requestTrade(
      result
    );
  }

  /* =======================================================
     TRADE REQUEST
  ======================================================= */

  function requestTrade(
    analysis = state.currentAnalysis
  ) {
    if (!analysis) {
      return false;
    }

    if (
      !CONFIG.tradingEnabled
    ) {
      setText(
        "#tradePermissionStatus",
        "ANALYSIS ONLY"
      );

      window.dispatchEvent(
        new CustomEvent(
          "krishwave:trade-request",
          {
            detail: {
              enabled: false,
              analysis,
              accountMode:
                state.accountMode,
              stake:
                state.trade.stake
            }
          }
        )
      );

      return false;
    }

    if (
      state.trade.pending
    ) {
      return false;
    }

    if (
      checkRiskLimits()
    ) {
      return false;
    }

    if (
      state.accountMode ===
        "real" &&
      CONFIG.REAL_CONFIRMATION_REQUIRED
    ) {
      openRealConfirmation(
        analysis
      );

      return false;
    }

    dispatchTradeRequest(
      analysis
    );

    return true;
  }

  function dispatchTradeRequest(
    analysis
  ) {
    state.trade.pending =
      true;

    window.dispatchEvent(
      new CustomEvent(
        "krishwave:trade-request",
        {
          detail: {
            enabled: true,
            analysis,
            accountMode:
              state.accountMode,
            symbol:
              state.selectedSymbol,
            strategy:
              analysis.strategy,
            prediction:
              analysis.prediction,
            target:
              analysis.target,
            stake:
              state.trade.stake
          }
        }
      )
    );

    setText(
      "#tradePermissionStatus",
      "TRADE REQUESTED"
    );

    setText(
      "#lastAction",
      `Trade requested: ${analysis.prediction}`
    );
  }

  /* =======================================================
     REAL CONFIRMATION
  ======================================================= */

  function openRealConfirmation(
    analysis
  ) {
    setText(
      "#confirmMarket",
      getSelectedMarket().name
    );

    setText(
      "#confirmStrategy",
      analysis.strategy
    );

    setText(
      "#confirmStake",
      state.trade.stake
    );

    setText(
      "#confirmSignal",
      analysis.prediction
    );

    const modal =
      $("#realTradeModal");

    if (modal) {
      modal.style.display =
        "flex";
    }

    state.trade.pending =
      false;
  }

  function cancelRealTrade() {
    const modal =
      $("#realTradeModal");

    if (modal) {
      modal.style.display =
        "none";
    }

    state.trade.pending =
      false;

    setText(
      "#lastAction",
      "Real trade cancelled"
    );
  }

  function confirmRealTrade() {
    const modal =
      $("#realTradeModal");

    if (modal) {
      modal.style.display =
        "none";
    }

    if (
      !state.currentAnalysis
    ) {
      return;
    }

    dispatchTradeRequest(
      state.currentAnalysis
    );
  }

  /* =======================================================
     RISK MANAGEMENT
  ======================================================= */

  function checkRiskLimits() {
    if (
      state.trade.sessionPL >=
      state.trade.takeProfit
    ) {
      setText(
        "#tradePermissionStatus",
        "TAKE PROFIT REACHED"
      );

      return true;
    }

    if (
      state.trade.sessionPL <=
      state.trade.stopLoss
    ) {
      setText(
        "#tradePermissionStatus",
        "STOP LOSS REACHED"
      );

      return true;
    }

    if (
      state.trade.stake >
      state.trade.maxStake
    ) {
      state.trade.stake =
        state.trade.maxStake;

      updateTradeUI();

      return true;
    }

    if (
      state.trade.martingaleStep >
      state.trade.maxMartingaleSteps
    ) {
      setText(
        "#tradePermissionStatus",
        "MAX MARTINGALE STEP"
      );

      return true;
    }

    return false;
  }

  function processTradeResult(
    result
  ) {
    state.trade.pending =
      false;

    const profit =
      Number(
        result?.profit ??
          result?.amount ??
          0
      );

    if (
      profit > 0
    ) {
      recordTradeWin(
        profit
      );
    } else {
      recordTradeLoss(
        Math.abs(profit)
      );
    }

    updateSessionPL(
      profit
    );
  }

  function recordTradeWin(
    profit = 0
  ) {
    state.trade.wins++;

    state.trade.martingaleStep =
      0;

    state.trade.stake =
      CONFIG.DEFAULT_STAKE;

    setText(
      "#lastAction",
      `WIN +${round(profit, 2)}`
    );

    updateTradeUI();
  }

  function recordTradeLoss(
    loss = 0
  ) {
    state.trade.losses++;

    if (
      state.trade.martingaleStep <
      state.trade.maxMartingaleSteps
    ) {
      state.trade.martingaleStep++;

      state.trade.stake =
        Math.min(
          state.trade.stake *
            state.trade
              .martingaleMultiplier,
          state.trade.maxStake
        );
    }

    setText(
      "#lastAction",
      `LOSS -${round(loss, 2)}`
    );

    updateTradeUI();
  }

  function updateSessionPL(
    amount
  ) {
    const value =
      Number(amount) || 0;

    state.trade.sessionPL +=
      value;

    state.trade.tradeCount++;

    updateTradeUI();

    checkRiskLimits();
  }

  function resetMartingale() {
    state.trade.martingaleStep =
      0;

    state.trade.stake =
      CONFIG.DEFAULT_STAKE;

    updateTradeUI();

    setText(
      "#lastAction",
      "Martingale reset"
    );
  }

  /* =======================================================
     TRADE UI
  ======================================================= */

  function updateTradeUI() {
    setText(
      "#stakeAmount",
      state.trade.stake
    );

    setText(
      "#currentStakeDisplay",
      state.trade.stake
    );

    setText(
      "#takeProfit",
      state.trade.takeProfit
    );

    setText(
      "#stopLoss",
      state.trade.stopLoss
    );

    setText(
      "#martingaleMultiplier",
      state.trade
        .martingaleMultiplier
    );

    setText(
      "#maxMartingaleSteps",
      state.trade
        .maxMartingaleSteps
    );

    setText(
      "#maxStake",
      state.trade.maxStake
    );

    setText(
      "#martingaleStepDisplay",
      `${state.trade.martingaleStep} / ${state.trade.maxMartingaleSteps}`
    );

    setText(
      "#sessionProfitLoss",
      round(
        state.trade.sessionPL,
        2
      )
    );

    setText(
      "#tradeCount",
      state.trade.tradeCount
    );

    const tradeMode =
      state.accountMode ===
      "real"
        ? "REAL"
        : "DEMO";

    setText(
      "#tradeAccountMode",
      tradeMode
    );

    setText(
      "#accountMode",
      tradeMode
    );

    setText(
      "#accountTypeLabel",
      tradeMode
    );

    setText(
      "#tradePermissionStatus",
      CONFIG.tradingEnabled
        ? "TRADING ENABLED"
        : "ANALYSIS ONLY"
    );
  }

  /* =======================================================
     ACCOUNT MODE
  ======================================================= */

  function setAccountMode(
    mode
  ) {
    mode =
      String(mode)
        .toLowerCase();

    if (
      mode !== "real" &&
      mode !== "demo"
    ) {
      mode = "demo";
    }

    state.accountMode =
      mode;

    const isReal =
      mode === "real";

    const demo =
      $("#accountDemo");

    const real =
      $("#accountReal");

    if (demo) {
      demo.classList.toggle(
        "active",
        !isReal
      );
    }

    if (real) {
      real.classList.toggle(
        "active",
        isReal
      );
    }

    setText(
      "#accountTypeLabel",
      isReal
        ? "REAL"
        : "DEMO"
    );

    setText(
      "#tradeAccountMode",
      isReal
        ? "REAL"
        : "DEMO"
    );

    setText(
      "#accountMode",
      isReal
        ? "REAL"
        : "DEMO"
    );

    setText(
      "#accountModeStatus",
      isReal
        ? "Real Account"
        : "Demo Account"
    );

    setText(
      "#lastAction",
      `Account mode: ${
        isReal
          ? "REAL"
          : "DEMO"
      }`
    );

    updateTradeUI();
  }

  /* =======================================================
     THEME
  ======================================================= */

  function applyTheme(
    theme
  ) {
    theme =
      theme === "light"
        ? "light"
        : "dark";

    state.theme = theme;

    document.body.dataset.theme =
      theme;

    document.body.classList.toggle(
      "light",
      theme === "light"
    );

    document.body.classList.toggle(
      "dark",
      theme === "dark"
    );

    try {
      localStorage.setItem(
        "KRISHWAVE_THEME",
        theme
      );
    } catch (_) {}

    setText(
      "#lastAction",
      `Theme: ${theme}`
    );
  }

  function loadTheme() {
    let theme = "dark";

    try {
      theme =
        localStorage.getItem(
          "KRISHWAVE_THEME"
        ) || "dark";
    } catch (_) {}

    applyTheme(theme);
  }

  /* =======================================================
     INPUT SETTINGS
  ======================================================= */

  function bindTradeInputs() {
    const stake =
      $("#stakeAmount");

    if (stake) {
      stake.addEventListener(
        "input",
        () => {
          const value =
            Number(
              stake.value ??
                stake.textContent
            );

          if (
            Number.isFinite(value) &&
            value >=
              CONFIG.MIN_STAKE
          ) {
            state.trade.stake =
              Math.min(
                value,
                state.trade.maxStake
              );

            updateTradeUI();
          }
        }
      );
    }

    const takeProfit =
      $("#takeProfit");

    if (takeProfit) {
      takeProfit.addEventListener(
        "input",
        () => {
          const value =
            Number(
              takeProfit.value
            );

          if (
            Number.isFinite(value)
          ) {
            state.trade.takeProfit =
              value;
          }
        }
      );
    }

    const stopLoss =
      $("#stopLoss");

    if (stopLoss) {
      stopLoss.addEventListener(
        "input",
        () => {
          const value =
            Number(
              stopLoss.value
            );

          if (
            Number.isFinite(value)
          ) {
            state.trade.stopLoss =
              -Math.abs(value);
          }
        }
      );
    }

    const multiplier =
      $("#martingaleMultiplier");

    if (multiplier) {
      multiplier.addEventListener(
        "input",
        () => {
          const value =
            Number(
              multiplier.value
            );

          if (
            Number.isFinite(value) &&
            value >= 1
          ) {
            state.trade
              .martingaleMultiplier =
              value;
          }
        }
      );
    }

    const maxSteps =
      $("#maxMartingaleSteps");

    if (maxSteps) {
      maxSteps.addEventListener(
        "input",
        () => {
          const value =
            Number(
              maxSteps.value
            );

          if (
            Number.isFinite(value) &&
            value >= 0
          ) {
            state.trade
              .maxMartingaleSteps =
              Math.floor(value);
          }
        }
      );
    }

    const maxStake =
      $("#maxStake");

    if (maxStake) {
      maxStake.addEventListener(
        "input",
        () => {
          const value =
            Number(
              maxStake.value
            );

          if (
            Number.isFinite(value) &&
            value >=
              CONFIG.MIN_STAKE
          ) {
            state.trade.maxStake =
              value;
          }
        }
      );
    }
  }

  /* =======================================================
     BUTTON EVENTS
  ======================================================= */

  function bindEvents() {
    const scan =
      $("#scanAll");

    if (scan) {
      scan.addEventListener(
        "click",
        scanAllMarkets
      );
    }

    const start =
      $("#startAiEngine");

    if (start) {
      start.addEventListener(
        "click",
        startAIEngine
      );
    }

    const stop =
      $("#stopAiEngine");

    if (stop) {
      stop.addEventListener(
        "click",
        stopAIEngine
      );
    }

    const demo =
      $("#accountDemo");

    if (demo) {
      demo.addEventListener(
        "click",
        () =>
          setAccountMode(
            "demo"
          )
      );
    }

    const real =
      $("#accountReal");

    if (real) {
      real.addEventListener(
        "click",
        () =>
          setAccountMode(
            "real"
          )
      );
    }

    const connectButton =
      $("#connectAccount");

    if (connectButton) {
      connectButton.addEventListener(
        "click",
        connect
      );
    }

    const disconnectButton =
      $("#disconnectAccount");

    if (disconnectButton) {
      disconnectButton.addEventListener(
        "click",
        disconnect
      );
    }

    const reset =
      $("#resetMartingale");

    if (reset) {
      reset.addEventListener(
        "click",
        resetMartingale
      );
    }

    const tradeNow =
      $("#tradeNowButton");

    if (tradeNow) {
      tradeNow.addEventListener(
        "click",
        () =>
          requestTrade(
            state.currentAnalysis
          )
      );
    }

    const cancel =
      $("#cancelRealTrade");

    if (cancel) {
      cancel.addEventListener(
        "click",
        cancelRealTrade
      );
    }

    const confirm =
      $("#confirmRealTrade");

    if (confirm) {
      confirm.addEventListener(
        "click",
        confirmRealTrade
      );
    }

    $all(
      ".strategy-button"
    ).forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          selectStrategy(
            button.dataset
              .strategy
          );
        }
      );
    });

    const strategyButton =
      $("#strategyCurrentButton");

    if (strategyButton) {
      strategyButton.addEventListener(
        "click",
        () => {
          const menu =
            $("#strategyMenu");

          if (menu) {
            menu.classList.toggle(
              "open"
            );

            menu.style.display =
              menu.style.display ===
              "block"
                ? "none"
                : "block";
          }
        }
      );
    }

    bindTradeInputs();

    window.addEventListener(
      "krishwave:trade-result",
      (event) => {
        processTradeResult(
          event.detail || {}
        );
      }
    );

    window.addEventListener(
      "krishwave:real-trade-confirmed",
      (event) => {
        const analysis =
          event.detail ||
          state.currentAnalysis;

        if (analysis) {
          dispatchTradeRequest(
            analysis
          );
        }
      }
    );
  }

  /* =======================================================
     INITIAL RENDER
  ======================================================= */

  function initialize() {
    injectV4Styles();

    loadTheme();

    bindEvents();

    setAccountMode(
      state.accountMode
    );

    selectStrategy(
      state.selectedStrategy
    );

    updateTradeUI();

    renderMarketScanner();

    renderSelectedMarket();

    renderDigitDistribution();

    renderProbabilities();

    updateConnectionUI(
      "disconnected"
    );

    setText(
      "#marketCount",
      MARKETS.length
    );

    setText(
      "#connectedMarkets",
      "0"
    );

    setText(
      "#engineState",
      "READY"
    );

    setText(
      "#aiCountdown",
      "—"
    );

    setText(
      "#aiResultStatus",
      "READY"
    );

    connect();

    window.KRISHWAVE_READY =
      true;

    setText(
      "#lastAction",
      "KRISHWAVE V4 ready"
    );
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  window.KRISHWAVE = {
    state,
    config: CONFIG,
    markets: MARKETS,
    strategies: STRATEGIES,

    analyzeStrategy,
    analyzeAuto,
    analyzeDigits,

    selectMarket,
    selectStrategy,

    startAIEngine,
    stopAIEngine,

    scanAllMarkets,

    applyTheme,
    setAccountMode,

    requestTrade,
    processTradeResult,

    resetMartingale,

    recordTradeWin,
    recordTradeLoss,

    updateSessionPL,
    checkRiskLimits,

    connect,
    disconnect,

    getSelectedMarket
  };

  /* =======================================================
     START
  ======================================================= */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      {
        once: true
      }
    );
  } else {
    initialize();
  }

})();