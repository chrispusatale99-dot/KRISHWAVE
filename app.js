/* =========================================================
   KRISHWAVE V3 — BEAST AI ENGINE
   Public Deriv Market Intelligence
   Analysis only — no automatic real-money execution
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     CONFIGURATION
     ========================================================= */

  const CONFIG = {
    WS_URL: "wss://api.derivws.com/trading/v1/options/ws/public",

    MAX_HISTORY: 200,
    RECENT_WINDOW: 80,
    MIN_SAMPLE: 30,

    RECONNECT_DELAY: 3000,
    WATCHDOG_MS: 15000,

    STRONG_EDGE: 5,
    HIGH_CONFIDENCE: 65,

    ANALYSIS_SECONDS: 10,
    COUNTDOWN_SECONDS: 7,

    MAX_MARKETS: 13
  };

  /* =========================================================
     MARKETS
     ========================================================= */

  const MARKET_DEFINITIONS = [
    {
      symbol: "R_10",
      name: "Volatility 10 Index"
    },
    {
      symbol: "R_10_1S",
      name: "Volatility 10 (1s) Index"
    },
    {
      symbol: "R_15_1S",
      name: "Volatility 15 (1s) Index"
    },
    {
      symbol: "R_25",
      name: "Volatility 25 Index"
    },
    {
      symbol: "R_25_1S",
      name: "Volatility 25 (1s) Index"
    },
    {
      symbol: "R_30_1S",
      name: "Volatility 30 (1s) Index"
    },
    {
      symbol: "R_50",
      name: "Volatility 50 Index"
    },
    {
      symbol: "R_50_1S",
      name: "Volatility 50 (1s) Index"
    },
    {
      symbol: "R_75",
      name: "Volatility 75 Index"
    },
    {
      symbol: "R_75_1S",
      name: "Volatility 75 (1s) Index"
    },
    {
      symbol: "R_90_1S",
      name: "Volatility 90 (1s) Index"
    },
    {
      symbol: "R_100",
      name: "Volatility 100 Index"
    },
    {
      symbol: "R_100_1S",
      name: "Volatility 100 (1s) Index"
    }
  ];

  /* =========================================================
     STATE
     ========================================================= */

  const state = {
    socket: null,

    connected: false,
    connecting: false,

    engineRunning: false,

    selectedSymbol: "R_10",
    strategy: "AUTO",
    targetDigit: null,

    markets: new Map(),

    requestId: 1,

    historyRequests: new Map(),

    subscriptions: new Map(),

    totalTicks: 0,

    lastTickTime: 0,

    reconnectTimer: null,

    watchdogTimer: null,

    scannerTimer: null,

    aiTimer: null,

    aiCountdownTimer: null,

    aiAnalysisRunning: false,

    aiPhase: "IDLE",

    aiRemaining: 0,

    pendingStrategy: null,

    intentionalClose: false,

    lastPrediction: null,

    strategyListenerReady: false,

    lastFooterMessage: ""
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

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* =========================================================
     FOOTER / STATUS
     ========================================================= */

  function updateFooter(message) {
    state.lastFooterMessage = message;

    const footer = $("footerStatus");

    if (footer) {
      footer.textContent = message;
    }
  }

  function setConnectionStatus(connected, message) {
    state.connected = connected;

    setText(
      "connectionText",
      connected ? "LIVE" : message || "CONNECTING"
    );

    setText(
      "heroStreamStatus",
      connected
        ? "MARKET STREAM LIVE"
        : message || "MARKET STREAM INITIALIZING"
    );

    const dot = $("heroConnectionDot");

    if (dot) {
      dot.classList.toggle("active", connected);
    }
  }

  /* =========================================================
     REQUEST ID
     ========================================================= */

  function nextRequestId() {
    state.requestId += 1;
    return state.requestId;
  }

  /* =========================================================
     MARKET OBJECT
     ========================================================= */

  function createMarket(definition) {
    return {
      symbol: definition.symbol,
      name: definition.name,

      pipSize: 0.01,

      ticks: [],

      quote: null,
      epoch: null,

      lastDigit: null,

      historyLoaded: false,
      subscribed: false,

      lastTickTime: 0
    };
  }

  function ensureMarket(symbol, name = symbol) {
    if (!state.markets.has(symbol)) {
      state.markets.set(symbol, {
        symbol,
        name,
        pipSize: 0.01,
        ticks: [],
        quote: null,
        epoch: null,
        lastDigit: null,
        historyLoaded: false,
        subscribed: false,
        lastTickTime: 0
      });
    }

    return state.markets.get(symbol);
  }

  /* =========================================================
     INITIALIZE MARKETS
     ========================================================= */

  function initializeMarkets() {
    MARKET_DEFINITIONS.forEach((definition) => {
      ensureMarket(definition.symbol, definition.name);
    });
  }

  /* =========================================================
     WEBSOCKET CONNECTION
     ========================================================= */

  function connectDeriv() {
    if (state.connecting) {
      return;
    }

    if (
      state.socket &&
      (
        state.socket.readyState === WebSocket.OPEN ||
        state.socket.readyState === WebSocket.CONNECTING
      )
    ) {
      return;
    }

    state.connecting = true;
    state.intentionalClose = false;

    setConnectionStatus(false, "CONNECTING");
    updateFooter("CONNECTING TO DERIV...");

    try {
      state.socket = new WebSocket(CONFIG.WS_URL);
    } catch (error) {
      state.connecting = false;

      console.error(error);

      setConnectionStatus(false, "CONNECTION ERROR");
      updateFooter("WEBSOCKET CONNECTION FAILED");

      scheduleReconnect();

      return;
    }

    state.socket.addEventListener("open", handleSocketOpen);

    state.socket.addEventListener("message", handleSocketMessage);

    state.socket.addEventListener("error", handleSocketError);

    state.socket.addEventListener("close", handleSocketClose);
  }

  function handleSocketOpen() {
    state.connected = true;
    state.connecting = false;

    setConnectionStatus(true, "LIVE");

    updateFooter("DERIV MARKET DATA CONNECTED");

    clearReconnectTimer();

    requestActiveSymbols();

    startWatchdog();
  }

  function handleSocketError(error) {
    console.warn("Deriv WebSocket error:", error);

    state.connecting = false;

    setConnectionStatus(false, "CONNECTION ERROR");

    updateFooter("DERIV CONNECTION ERROR");
  }

  function handleSocketClose() {
    state.connected = false;
    state.connecting = false;

    stopWatchdog();

    setConnectionStatus(false, "RECONNECTING");

    updateFooter("DERIV DISCONNECTED — RECONNECTING");

    if (!state.intentionalClose) {
      scheduleReconnect();
    }
  }

  function disconnectDeriv() {
    state.intentionalClose = true;

    clearReconnectTimer();

    stopWatchdog();

    if (state.socket) {
      try {
        state.socket.close();
      } catch (error) {
        console.warn(error);
      }
    }

    state.socket = null;
    state.connected = false;
    state.connecting = false;

    setConnectionStatus(false, "DISCONNECTED");

    updateFooter("DISCONNECTED");
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) {
      return;
    }

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;

      if (!state.intentionalClose) {
        connectDeriv();
      }
    }, CONFIG.RECONNECT_DELAY);
  }

  function clearReconnectTimer() {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }

  /* =========================================================
     SAFE SEND
     ========================================================= */

  function send(payload) {
    if (
      !state.socket ||
      state.socket.readyState !== WebSocket.OPEN
    ) {
      updateFooter("WAITING FOR DERIV CONNECTION");
      return false;
    }

    try {
      state.socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error("WebSocket send error:", error);

      updateFooter("REQUEST SEND ERROR");

      return false;
    }
  }

  /* =========================================================
     ACTIVE SYMBOLS
     ========================================================= */

  function requestActiveSymbols() {
    const id = nextRequestId();

    /*
      IMPORTANT:
      The new Deriv API removed product_type.
    */

    send({
      active_symbols: "brief",
      req_id: id
    });
  }

  function handleActiveSymbols(data) {
    if (!Array.isArray(data.active_symbols)) {
      updateFooter("NO ACTIVE SYMBOL DATA RECEIVED");
      return;
    }

    let matched = 0;

    data.active_symbols.forEach((item) => {
      const symbol =
        item.underlying_symbol ||
        item.symbol;

      if (!symbol) {
        return;
      }

      const definition = MARKET_DEFINITIONS.find(
        (market) => market.symbol === symbol
      );

      if (!definition) {
        return;
      }

      const market = ensureMarket(
        symbol,
        item.underlying_symbol_name ||
        item.display_name ||
        definition.name
      );

      market.name =
        item.underlying_symbol_name ||
        item.display_name ||
        definition.name;

      if (
        item.pip_size !== undefined &&
        item.pip_size !== null
      ) {
        const pip = Number(item.pip_size);

        if (Number.isFinite(pip) && pip > 0) {
          market.pipSize = pip;
        }
      }

      matched += 1;

      requestHistory(symbol);

      subscribeTicks(symbol);
    });

    setText("connectedMarkets", String(matched));

    renderMarketList();

    if (matched > 0) {
      updateFooter(
        `${matched} VOLATILITY MARKETS CONNECTED`
      );
    } else {
      updateFooter(
        "NO MATCHING VOLATILITY MARKETS FOUND"
      );
    }
  }

  /* =========================================================
     HISTORY
     ========================================================= */

  function requestHistory(symbol) {
    const id = nextRequestId();

    state.historyRequests.set(id, symbol);

    send({
      ticks_history: symbol,
      count: CONFIG.MAX_HISTORY,
      end: "latest",
      style: "ticks",
      req_id: id
    });
  }

  function handleHistory(data) {
    const symbol =
      data.echo_req?.ticks_history ||
      state.historyRequests.get(data.req_id);

    if (!symbol) {
      return;
    }

    const market = ensureMarket(symbol);

    if (
      data.pip_size !== undefined &&
      data.pip_size !== null
    ) {
      const pip = Number(data.pip_size);

      if (Number.isFinite(pip) && pip > 0) {
        market.pipSize = pip;
      }
    }

    const prices = Array.isArray(data.history?.prices)
      ? data.history.prices
      : Array.isArray(data.prices)
        ? data.prices
        : [];

    const times = Array.isArray(data.history?.times)
      ? data.history.times
      : Array.isArray(data.times)
        ? data.times
        : [];

    market.ticks = [];

    for (let i = 0; i < prices.length; i += 1) {
      const quote = Number(prices[i]);

      if (!Number.isFinite(quote)) {
        continue;
      }

      const epoch = Number(times[i]);

      market.ticks.push({
        quote,
        epoch: Number.isFinite(epoch)
          ? epoch
          : null
      });
    }

    if (market.ticks.length > CONFIG.MAX_HISTORY) {
      market.ticks =
        market.ticks.slice(-CONFIG.MAX_HISTORY);
    }

    market.historyLoaded = true;

    if (market.ticks.length) {
      const latest =
        market.ticks[market.ticks.length - 1];

      market.quote = latest.quote;
      market.epoch = latest.epoch;
      market.lastDigit = extractDigit(
        latest.quote,
        market.pipSize
      );
    }

    if (symbol === state.selectedSymbol) {
      renderSelectedMarket();
      updateAIFromCurrentMarket();
    }
  }

  /* =========================================================
     TICKS
     ========================================================= */

  function subscribeTicks(symbol) {
    const market = ensureMarket(symbol);

    if (market.subscribed) {
      return;
    }

    const id = nextRequestId();

    const sent = send({
      ticks: symbol,
      subscribe: 1,
      req_id: id
    });

    if (sent) {
      market.subscribed = true;
      state.subscriptions.set(id, symbol);
    }
  }

  function handleTick(data) {
    const tick = data.tick;

    if (!tick) {
      return;
    }

    const symbol = tick.symbol;

    if (!symbol) {
      return;
    }

    const market = ensureMarket(symbol);

    const quote = Number(tick.quote);

    if (!Number.isFinite(quote)) {
      return;
    }

    const epoch = Number(tick.epoch);

    market.quote = quote;

    market.epoch = Number.isFinite(epoch)
      ? epoch
      : Math.floor(Date.now() / 1000);

    market.lastDigit = extractDigit(
      quote,
      market.pipSize
    );

    market.lastTickTime = Date.now();

    market.ticks.push({
      quote,
      epoch: market.epoch
    });

    if (market.ticks.length > CONFIG.MAX_HISTORY) {
      market.ticks.shift();
    }

    state.totalTicks += 1;
    state.lastTickTime = Date.now();

    setText(
      "liveTicks",
      String(state.totalTicks)
    );

    if (symbol === state.selectedSymbol) {
      renderSelectedMarket();
      updateAIFromCurrentMarket();
    }
  }

  /* =========================================================
     MESSAGE HANDLER
     ========================================================= */

  function handleSocketMessage(event) {
    let data;

    try {
      data = JSON.parse(event.data);
    } catch (error) {
      console.warn(
        "Invalid Deriv message:",
        event.data
      );
      return;
    }

    /* New API error format */

    if (
      Array.isArray(data.errors) &&
      data.errors.length
    ) {
      const errorMessage =
        data.errors
          .map((error) =>
            error.message ||
            error.code ||
            "Unknown API error"
          )
          .join(" | ");

      console.error(
        "Deriv API errors:",
        data.errors
      );

      updateFooter(
        `DERIV API ERROR: ${errorMessage}`
      );

      return;
    }

    /* Legacy/single error compatibility */

    if (data.error) {
      const message =
        data.error.message ||
        data.error.code ||
        "Unknown API error";

      console.error(
        "Deriv API error:",
        data.error
      );

      updateFooter(
        `DERIV API ERROR: ${message}`
      );

      return;
    }

    switch (data.msg_type) {
      case "active_symbols":
        handleActiveSymbols(data);
        break;

      case "history":
        handleHistory(data);
        break;

      case "tick":
        handleTick(data);
        break;

      default:
        break;
    }
  }

  /* =========================================================
     WATCHDOG
     ========================================================= */

  function startWatchdog() {
    stopWatchdog();

    state.watchdogTimer = setInterval(() => {
      if (!state.connected) {
        return;
      }

      if (!state.lastTickTime) {
        return;
      }

      const age =
        Date.now() - state.lastTickTime;

      if (age > CONFIG.WATCHDOG_MS) {
        updateFooter(
          "MARKET STREAM QUIET — WAITING FOR TICKS"
        );
      }
    }, 5000);
  }

  function stopWatchdog() {
    if (state.watchdogTimer) {
      clearInterval(state.watchdogTimer);
      state.watchdogTimer = null;
    }
  }

  /* =========================================================
     DIGIT EXTRACTION
     ========================================================= */

  function extractDigit(quote, pipSize) {
    const value = Number(quote);

    if (!Number.isFinite(value)) {
      return null;
    }

    let decimals = 2;

    const pip = Number(pipSize);

    if (
      Number.isFinite(pip) &&
      pip > 0 &&
      pip < 1
    ) {
      decimals =
        Math.max(
          0,
          Math.ceil(
            -Math.log10(pip)
          )
        );
    }

    const fixed =
      value.toFixed(decimals);

    const parts = fixed.split(".");

    if (parts.length < 2) {
      return 0;
    }

    const decimalPart =
      parts[1];

    if (!decimalPart.length) {
      return 0;
    }

    return Number(
      decimalPart[
        decimalPart.length - 1
      ]
    );
  }

  /* =========================================================
     RECENT DATA
     ========================================================= */

  function getCurrentMarket() {
    return state.markets.get(
      state.selectedSymbol
    );
  }

  function getRecentTicks(
    market,
    size = CONFIG.RECENT_WINDOW
  ) {
    if (!market) {
      return [];
    }

    return market.ticks.slice(-size);
  }

  function getRecentDigits(
    market,
    size = CONFIG.RECENT_WINDOW
  ) {
    return getRecentTicks(
      market,
      size
    )
      .map((tick) =>
        extractDigit(
          tick.quote,
          market.pipSize
        )
      )
      .filter(
        (digit) =>
          Number.isInteger(digit) &&
          digit >= 0 &&
          digit <= 9
      );
  }

  /* =========================================================
     DIGIT FREQUENCY
     ========================================================= */

  function calculateDigitFrequencies(
    market
  ) {
    const digits =
      getRecentDigits(market);

    const counts =
      Array(10).fill(0);

    digits.forEach((digit) => {
      counts[digit] += 1;
    });

    const total = digits.length;

    const percentages =
      counts.map((count) =>
        total
          ? (count / total) * 100
          : 0
      );

    return {
      counts,
      percentages,
      total
    };
  }

  function getDominantDigit(market) {
    const stats =
      calculateDigitFrequencies(market);

    if (!stats.total) {
      return {
        digit: null,
        rate: 0
      };
    }

    let bestDigit = 0;
    let bestRate =
      stats.percentages[0];

    for (let digit = 1; digit < 10; digit += 1) {
      if (
        stats.percentages[digit] >
        bestRate
      ) {
        bestDigit = digit;
        bestRate =
          stats.percentages[digit];
      }
    }

    return {
      digit: bestDigit,
      rate: bestRate
    };
  }

  /* =========================================================
     EVEN / ODD
     ========================================================= */

  function calculateEvenOdd(market) {
    const digits =
      getRecentDigits(market);

    if (!digits.length) {
      return {
        even: 50,
        odd: 50
      };
    }

    const evenCount =
      digits.filter(
        (digit) => digit % 2 === 0
      ).length;

    const even =
      (evenCount / digits.length) * 100;

    return {
      even,
      odd: 100 - even
    };
  }

  /* =========================================================
     HIGH / LOW
     ========================================================= */

  function calculateHighLow(market) {
    const digits =
      getRecentDigits(market);

    if (!digits.length) {
      return {
        high: 50,
        low: 50
      };
    }

    const highCount =
      digits.filter(
        (digit) => digit >= 5
      ).length;

    const high =
      (highCount / digits.length) * 100;

    return {
      high,
      low: 100 - high
    };
  }

  /* =========================================================
     OVER / UNDER
     ========================================================= */

  function calculateOverUnder(
    market,
    target
  ) {
    const digits =
      getRecentDigits(market);

    if (!digits.length) {
      return {
        over: 50,
        under: 50
      };
    }

    const overCount =
      digits.filter(
        (digit) => digit > target
      ).length;

    const over =
      (overCount / digits.length) * 100;

    return {
      over,
      under: 100 - over
    };
  }

  /* =========================================================
     MATCH / DIFFER
     ========================================================= */

  function calculateMatchDiffer(
    market,
    target
  ) {
    const digits =
      getRecentDigits(market);

    if (!digits.length) {
      return {
        match: 10,
        differ: 90
      };
    }

    const matchCount =
      digits.filter(
        (digit) => digit === target
      ).length;

    const match =
      (matchCount / digits.length) * 100;

    return {
      match,
      differ: 100 - match
    };
  }

  /* =========================================================
     MOMENTUM
     ========================================================= */

  function calculateMomentum(market) {
    const ticks =
      getRecentTicks(market, 30);

    if (ticks.length < 5) {
      return {
        rise: 50,
        fall: 50,
        direction: "NEUTRAL",
        strength: 0
      };
    }

    const first =
      Number(ticks[0].quote);

    const last =
      Number(
        ticks[ticks.length - 1].quote
      );

    if (
      !Number.isFinite(first) ||
      !Number.isFinite(last)
    ) {
      return {
        rise: 50,
        fall: 50,
        direction: "NEUTRAL",
        strength: 0
      };
    }

    const difference =
      last - first;

    const absolute =
      Math.abs(difference);

    if (difference > 0) {
      const strength =
        Math.min(
          100,
          50 + absolute * 1000
        );

      return {
        rise: strength,
        fall: 100 - strength,
        direction: "RISE",
        strength
      };
    }

    if (difference < 0) {
      const strength =
        Math.min(
          100,
          50 + absolute * 1000
        );

      return {
        rise: 100 - strength,
        fall: strength,
        direction: "FALL",
        strength
      };
    }

    return {
      rise: 50,
      fall: 50,
      direction: "NEUTRAL",
      strength: 0
    };
  }

  /* =========================================================
     STREAK
     ========================================================= */

  function calculateStreak(market) {
    const digits =
      getRecentDigits(market, 30);

    if (!digits.length) {
      return {
        type: "—",
        length: 0
      };
    }

    const last =
      digits[digits.length - 1];

    let length = 1;

    for (
      let i = digits.length - 2;
      i >= 0;
      i -= 1
    ) {
      if (digits[i] === last) {
        length += 1;
      } else {
        break;
      }
    }

    return {
      type: String(last),
      length
    };
  }

  /* =========================================================
     STRATEGY ANALYSIS
     ========================================================= */

  function calculateStrategy(
    strategy,
    market,
    targetDigit
  ) {
    const frequencies =
      calculateDigitFrequencies(market);

    const evenOdd =
      calculateEvenOdd(market);

    const highLow =
      calculateHighLow(market);

    const momentum =
      calculateMomentum(market);

    const dominant =
      getDominantDigit(market);

    const digitTarget =
      targetDigit === null ||
      targetDigit === undefined
        ? dominant.digit
        : targetDigit;

    let result = {
      strategy,
      signal: "WAIT",
      target: null,
      probability: 0,
      confidence: 0,
      reason: "Insufficient evidence."
    };

    switch (strategy) {
      case "MATCH": {
        const match =
          calculateMatchDiffer(
            market,
            digitTarget
          );

        result.target =
          digitTarget;

        result.probability =
          match.match;

        result.signal =
          match.match >= 15
            ? `MATCH ${digitTarget}`
            : "WAIT";

        result.confidence =
          calculateConfidence(
            match.match,
            10,
            frequencies.total
          );

        result.reason =
          `Digit ${digitTarget} appears at ${match.match.toFixed(
            1
          )}% in the recent sample.`;

        break;
      }

      case "DIFFER": {
        const match =
          calculateMatchDiffer(
            market,
            digitTarget
          );

        result.target =
          digitTarget;

        result.probability =
          match.differ;

        result.signal =
          match.differ >= 90
            ? `DIFFER ${digitTarget}`
            : "WAIT";

        result.confidence =
          calculateConfidence(
            match.differ,
            90,
            frequencies.total
          );

        result.reason =
          `Digit ${digitTarget} is absent from approximately ${match.differ.toFixed(
            1
          )}% of the recent sample.`;

        break;
      }

      case "OVER": {
        const over =
          calculateOverUnder(
            market,
            digitTarget
          );

        result.target =
          digitTarget;

        result.probability =
          over.over;

        result.signal =
          over.over > 50
            ? `OVER ${digitTarget}`
            : "WAIT";

        result.confidence =
          calculateConfidence(
            over.over,
            50,
            frequencies.total
          );

        result.reason =
          `${over.over.toFixed(
            1
          )}% of recent digits are above ${digitTarget}.`;

        break;
      }

      case "UNDER": {
        const under =
          calculateOverUnder(
            market,
            digitTarget
          );

        result.target =
          digitTarget;

        result.probability =
          under.under;

        result.signal =
          under.under > 50
            ? `UNDER ${digitTarget}`
            : "WAIT";

        result.confidence =
          calculateConfidence(
            under.under,
            50,
            frequencies.total
          );

        result.reason =
          `${under.under.toFixed(
            1
          )}% of recent digits are below ${digitTarget}.`;

        break;
      }

      case "EVEN": {
        result.probability =
          evenOdd.even;

        result.signal =
          evenOdd.even > 50
            ? "EVEN"
            : "WAIT";

        result.confidence =
          calculateConfidence(
            evenOdd.even,
            50,
            frequencies.total
          );

        result.reason =
          `Even digits represent ${evenOdd.even.toFixed(
            1
          )}% of the recent sample.`;

        break;
      }

      case "ODD": {
        result.probability =
          evenOdd.odd;

        result.signal =
          evenOdd.odd > 50
            ? "ODD"
            : "WAIT";

        result.confidence =
          calculateConfidence(
            evenOdd.odd,
            50,
            frequencies.total
          );

        result.reason =
          `Odd digits represent ${evenOdd.odd.toFixed(
            1
          )}% of the recent sample.`;

        break;
      }

      case "HIGH": {
        result.probability =
          highLow.high;

        result.signal =
          highLow.high > 50
            ? "HIGH"
            : "WAIT";

        result.confidence =
          calculateConfidence(
            highLow.high,
            50,
            frequencies.total
          );

        result.reason =
          `High digits (5–9) represent ${highLow.high.toFixed(
            1
          )}% of the recent sample.`;

        break;
      }

      case "LOW": {
        result.probability =
          highLow.low;

        result.signal =
          highLow.low > 50
            ? "LOW"
            : "WAIT";

        result.confidence =
          calculateConfidence(
            highLow.low,
            50,
            frequencies.total
          );

        result.reason =
          `Low digits (0–4) represent ${highLow.low.toFixed(
            1
          )}% of the recent sample.`;

        break;
      }

      case "RISE": {
        result.probability =
          momentum.rise;

        result.signal =
          momentum.rise > 55
            ? "RISE"
            : "WAIT";

        result.confidence =
          calculateConfidence(
            momentum.rise,
            50,
            frequencies.total
          );

        result.reason =
          `Recent quote momentum is ${momentum.direction}.`;

        break;
      }

      case "FALL": {
        result.probability =
          momentum.fall;

        result.signal =
          momentum.fall > 55
            ? "FALL"
            : "WAIT";

        result.confidence =
          calculateConfidence(
            momentum.fall,
            50,
            frequencies.total
          );

        result.reason =
          `Recent quote momentum is ${momentum.direction}.`;

        break;
      }

      default:
        return calculateAutoStrategy(
          market
        );
    }

    return result;
  }

  /* =========================================================
     AUTO AI
     ========================================================= */

  function calculateAutoStrategy(market) {
    const dominant =
      getDominantDigit(market);

    const evenOdd =
      calculateEvenOdd(market);

    const highLow =
      calculateHighLow(market);

    const momentum =
      calculateMomentum(market);

    const candidates = [];

    const digit =
      dominant.digit;

    if (digit !== null) {
      const match =
        calculateMatchDiffer(
          market,
          digit
        );

      candidates.push({
        strategy: "MATCH",
        target: digit,
        probability: match.match,
        confidence:
          calculateConfidence(
            match.match,
            10,
            dominant.rate
              ? CONFIG.RECENT_WINDOW
              : 0
          ),
        signal:
          match.match >= 15
            ? `MATCH ${digit}`
            : "WAIT",
        reason:
          `Dominant digit ${digit} appears at ${match.match.toFixed(
            1
          )}%.`
      });

      candidates.push({
        strategy: "DIFFER",
        target: digit,
        probability: match.differ,
        confidence:
          calculateConfidence(
            match.differ,
            90,
            CONFIG.RECENT_WINDOW
          ),
        signal:
          match.differ >= 90
            ? `DIFFER ${digit}`
            : "WAIT",
        reason:
          `Digit ${digit} differs in ${match.differ.toFixed(
            1
          )}% of the sample.`
      });
    }

    candidates.push({
      strategy: "EVEN",
      probability: evenOdd.even,
      confidence:
        calculateConfidence(
          evenOdd.even,
          50,
          CONFIG.RECENT_WINDOW
        ),
      signal:
        evenOdd.even > 50
          ? "EVEN"
          : "WAIT",
      reason:
        `Even probability is ${evenOdd.even.toFixed(
          1
        )}%.`
    });

    candidates.push({
      strategy: "ODD",
      probability: evenOdd.odd,
      confidence:
        calculateConfidence(
          evenOdd.odd,
          50,
          CONFIG.RECENT_WINDOW
        ),
      signal:
        evenOdd.odd > 50
          ? "ODD"
          : "WAIT",
      reason:
        `Odd probability is ${evenOdd.odd.toFixed(
          1
        )}%.`
    });

    candidates.push({
      strategy: "HIGH",
      probability: highLow.high,
      confidence:
        calculateConfidence(
          highLow.high,
          50,
          CONFIG.RECENT_WINDOW
        ),
      signal:
        highLow.high > 50
          ? "HIGH"
          : "WAIT",
      reason:
        `High digits are ${highLow.high.toFixed(
          1
        )}% of the sample.`
    });

    candidates.push({
      strategy: "LOW",
      probability: highLow.low,
      confidence:
        calculateConfidence(
          highLow.low,
          50,
          CONFIG.RECENT_WINDOW
        ),
      signal:
        highLow.low > 50
          ? "LOW"
          : "WAIT",
      reason:
        `Low digits are ${highLow.low.toFixed(
          1
        )}% of the sample.`
    });

    candidates.push({
      strategy: "RISE",
      probability: momentum.rise,
      confidence:
        calculateConfidence(
          momentum.rise,
          50,
          CONFIG.RECENT_WINDOW
        ),
      signal:
        momentum.rise > 55
          ? "RISE"
          : "WAIT",
      reason:
        `Momentum currently points ${momentum.direction}.`
    });

    candidates.push({
      strategy: "FALL",
      probability: momentum.fall,
      confidence:
        calculateConfidence(
          momentum.fall,
          50,
          CONFIG.RECENT_WINDOW
        ),
      signal:
        momentum.fall > 55
          ? "FALL"
          : "WAIT",
      reason:
        `Momentum currently points ${momentum.direction}.`
    });

    const valid =
      candidates.filter(
        (candidate) =>
          candidate.signal !== "WAIT"
      );

    if (!valid.length) {
      return {
        strategy: "AUTO",
        signal: "WAIT",
        target: null,
        probability: 50,
        confidence: 0,
        reason:
          "No sufficiently strong statistical setup was detected."
      };
    }

    valid.sort(
      (a, b) =>
        b.confidence - a.confidence
    );

    const best =
      valid[0];

    return {
      strategy: "AUTO",
      signal: best.signal,
      target:
        best.target ?? null,
      probability:
        best.probability,
      confidence:
        best.confidence,
      reason:
        `AUTO selected ${best.strategy}. ${best.reason}`
    };
  }

  /* =========================================================
     CONFIDENCE
     ========================================================= */

  function calculateConfidence(
    probability,
    baseline,
    sample
  ) {
    if (!Number.isFinite(probability)) {
      return 0;
    }

    if (sample < CONFIG.MIN_SAMPLE) {
      return 0;
    }

    const edge =
      Math.abs(
        probability - baseline
      );

    /*
      Confidence is deliberately capped.
      It represents statistical strength,
      NOT a guarantee of outcome.
    */

    let confidence =
      50 + edge * 2;

    if (sample >= 80) {
      confidence += 5;
    } else if (sample >= 50) {
      confidence += 2;
    }

    confidence =
      Math.max(
        0,
        Math.min(95, confidence)
      );

    return confidence;
  }

  /* =========================================================
     AI CYCLE
     ========================================================= */

  function startAIAnalysisCycle() {
    stopAICycle();

    if (!state.engineRunning) {
      state.engineRunning = true;
    }

    const market =
      getCurrentMarket();

    if (!market) {
      resetAIStructure(
        "WAITING FOR MARKET"
      );

      return;
    }

    const sample =
      getRecentDigits(market).length;

    if (sample < CONFIG.MIN_SAMPLE) {
      state.aiPhase = "WAITING";

      setText(
        "engineState",
        "WAITING"
      );

      setText(
        "engineStateDetail",
        `${sample}/${CONFIG.MIN_SAMPLE} ticks`
      );

      setText(
        "engineStatus",
        "WAITING"
      );

      setText(
        "aiLiveIndicator",
        "WAITING"
      );

      setText(
        "aiCountdown",
        "—"
      );

      setText(
        "aiCircleStatus",
        "WAITING FOR DATA"
      );

      setText(
        "aiResultStatus",
        "WAITING"
      );

      setText(
        "aiResultMain",
        "Collecting market data..."
      );

      setText(
        "aiResultConfidence",
        "—"
      );

      updateFooter(
        `WAITING FOR DATA — ${sample}/${CONFIG.MIN_SAMPLE} TICKS`
      );

      return;
    }

    beginAnalysisPhase();
  }

  function beginAnalysisPhase() {
    stopAICycle();

    state.aiAnalysisRunning = true;
    state.aiPhase = "ANALYZING";
    state.aiRemaining =
      CONFIG.ANALYSIS_SECONDS;

    setText(
      "engineState",
      "ANALYZING"
    );

    setText(
      "engineStateDetail",
      "KRISHWAVE studying market"
    );

    setText(
      "engineStatus",
      "ANALYZING"
    );

    setText(
      "aiLiveIndicator",
      "ANALYZING"
    );

    setText(
      "aiCircleStatus",
      "MARKET ANALYSIS"
    );

    setText(
      "aiResultStatus",
      "AI ANALYZING"
    );

    setText(
      "aiResultMain",
      "Studying live tick pressure..."
    );

    setText(
      "aiResultConfidence",
      "—"
    );

    setText(
      "aiCountdown",
      String(CONFIG.ANALYSIS_SECONDS)
    );

    updateFooter(
      `AI ANALYSIS — ${CONFIG.ANALYSIS_SECONDS}s`
    );

    state.aiTimer = setInterval(() => {
      if (!state.engineRunning) {
        stopAICycle();
        return;
      }

      state.aiRemaining -= 1;

      setText(
        "aiCountdown",
        String(
          Math.max(
            0,
            state.aiRemaining
          )
        )
      );

      if (state.aiRemaining <= 0) {
        clearInterval(state.aiTimer);
        state.aiTimer = null;

        finishAnalysisPhase();
      }
    }, 1000);
  }

  function finishAnalysisPhase() {
    if (!state.engineRunning) {
      return;
    }

    const market =
      getCurrentMarket();

    if (!market) {
      startAIAnalysisCycle();
      return;
    }

    const prediction =
      state.strategy === "AUTO"
        ? calculateAutoStrategy(market)
        : calculateStrategy(
            state.strategy,
            market,
            state.targetDigit
          );

    state.lastPrediction =
      prediction;

    renderPrediction(prediction);

    /*
      Target found.
      Now start the 7-second entry window.
    */

    beginEntryCountdown(prediction);
  }

  function beginEntryCountdown(prediction) {
    if (!state.engineRunning) {
      return;
    }

    state.aiPhase = "COUNTDOWN";
    state.aiRemaining =
      CONFIG.COUNTDOWN_SECONDS;

    setText(
      "engineState",
      "ENTRY WINDOW"
    );

    setText(
      "engineStateDetail",
      prediction.signal
    );

    setText(
      "engineStatus",
      "COUNTDOWN"
    );

    setText(
      "aiLiveIndicator",
      "ENTRY"
    );

    setText(
      "aiCircleStatus",
      prediction.signal === "WAIT"
        ? "WEAK SIGNAL"
        : "ENTRY WINDOW"
    );

    setText(
      "aiCountdown",
      String(CONFIG.COUNTDOWN_SECONDS)
    );

    updateFooter(
      prediction.signal === "WAIT"
        ? "WEAK SIGNAL — WAIT"
        : `ENTRY WINDOW — ${prediction.signal}`
    );

    state.aiCountdownTimer =
      setInterval(() => {
        if (!state.engineRunning) {
          stopAICycle();
          return;
        }

        state.aiRemaining -= 1;

        setText(
          "aiCountdown",
          String(
            Math.max(
              0,
              state.aiRemaining
            )
          )
        );

        if (state.aiRemaining <= 0) {
          clearInterval(
            state.aiCountdownTimer
          );

          state.aiCountdownTimer = null;

          fireTradeNow(prediction);
        }
      }, 1000);
  }

  /* =========================================================
     TRADE NOW SIGNAL
     ========================================================= */

  function fireTradeNow(prediction) {
    if (!state.engineRunning) {
      return;
    }

    state.aiPhase = "TRADE_NOW";

    setText(
      "engineState",
      "TRADE NOW"
    );

    setText(
      "engineStateDetail",
      prediction.signal
    );

    setText(
      "engineStatus",
      "TRADE NOW"
    );

    setText(
      "aiLiveIndicator",
      "TRADE NOW"
    );

    setText(
      "aiCircleStatus",
      "TRADE NOW"
    );

    setText(
      "aiCountdown",
      "0"
    );

    if (prediction.signal === "WAIT") {
      setText(
        "aiResultStatus",
        "WAIT"
      );

      setText(
        "aiResultMain",
        "NO STRONG ENTRY"
      );

      updateFooter(
        "WAIT — NO STRONG ENTRY"
      );
    } else {
      setText(
        "aiResultStatus",
        "TRADE NOW"
      );

      setText(
        "aiResultMain",
        prediction.signal
      );

      updateFooter(
        `TRADE NOW — ${prediction.signal}`
      );
    }

    /*
      Small visual pause at exactly zero,
      then immediately begin another analysis cycle.
    */

    setTimeout(() => {
      if (!state.engineRunning) {
        return;
      }

      beginAnalysisPhase();
    }, 900);
  }

  /* =========================================================
     STOP AI
     ========================================================= */

  function stopAICycle() {
    if (state.aiTimer) {
      clearInterval(state.aiTimer);
      state.aiTimer = null;
    }

    if (state.aiCountdownTimer) {
      clearInterval(
        state.aiCountdownTimer
      );

      state.aiCountdownTimer = null;
    }

    state.aiAnalysisRunning = false;
  }

  /* =========================================================
     RESET AI STRUCTURE
     ========================================================= */

  function resetAIStructure(message) {
    stopAICycle();

    state.aiPhase = "IDLE";

    setText(
      "engineState",
      "READY"
    );

    setText(
      "engineStateDetail",
      message ||
        "Select a strategy to begin"
    );

    setText(
      "engineStatus",
      "READY"
    );

    setText(
      "aiLiveIndicator",
      "READY"
    );

    setText(
      "aiCountdown",
      "—"
    );

    setText(
      "aiCircleStatus",
      "SELECT STRATEGY"
    );

    setText(
      "aiResultStatus",
      "AI READY"
    );

    setText(
      "aiResultMain",
      message ||
        "Select a strategy to begin"
    );

    setText(
      "aiResultConfidence",
      "—"
    );
  }

  /* =========================================================
     RENDER PREDICTION
     ========================================================= */

  function renderPrediction(prediction) {
    if (!prediction) {
      return;
    }

    const signal =
      prediction.signal || "WAIT";

    const confidence =
      Number(prediction.confidence) || 0;

    setText(
      "analysisSignal",
      signal
    );

    setText(
      "analysisReason",
      prediction.reason ||
        "No explanation available."
    );

    setText(
      "analysisStrategy",
      getStrategyLabel(
        prediction
      )
    );

    setText(
      "analysisConfidence",
      confidence > 0
        ? `${confidence.toFixed(0)}%`
        : "—"
    );

    setText(
      "aiResultMain",
      signal
    );

    setText(
      "aiResultConfidence",
      confidence > 0
        ? `${confidence.toFixed(0)}%`
        : "—"
    );

    setText(
      "aiStructureStrategy",
      getStrategyLabel(
        prediction
      )
    );

    const market =
      getCurrentMarket();

    if (market) {
      const digit =
        market.lastDigit;

      setText(
        "aiStructureDigit",
        digit === null
          ? "—"
          : String(digit)
      );

      setText(
        "aiStructureSample",
        `${getRecentDigits(market).length} ticks`
      );

      const dominant =
        getDominantDigit(market);

      setText(
        "aiStructurePressure",
        dominant.digit === null
          ? "—"
          : `${dominant.digit} (${dominant.rate.toFixed(
              1
            )}%)`
      );

      setText(
        "aiStructureStrength",
        confidence >= CONFIG.HIGH_CONFIDENCE
          ? "STRONG"
          : confidence >= 55
            ? "MODERATE"
            : "WEAK"
      );
    }
  }

  function getStrategyLabel(prediction) {
    if (!prediction) {
      return "AUTO";
    }

    if (
      prediction.strategy === "MATCH" ||
      prediction.strategy === "DIFFER" ||
      prediction.strategy === "OVER" ||
      prediction.strategy === "UNDER"
    ) {
      if (
        prediction.target !== null &&
        prediction.target !== undefined
      ) {
        return `${prediction.strategy} ${prediction.target}`;
      }
    }

    return prediction.strategy || "AUTO";
  }

  /* =========================================================
     AI METRICS
     ========================================================= */

  function updateAIFromCurrentMarket() {
    const market =
      getCurrentMarket();

    if (!market) {
      return;
    }

    const digits =
      getRecentDigits(market);

    const frequencies =
      calculateDigitFrequencies(market);

    const evenOdd =
      calculateEvenOdd(market);

    const highLow =
      calculateHighLow(market);

    const dominant =
      getDominantDigit(market);

    setText(
      "sampleSize",
      String(digits.length)
    );

    setText(
      "dominantDigit",
      dominant.digit === null
        ? "—"
        : String(dominant.digit)
    );

    setText(
      "dominantDigitRate",
      dominant.digit === null
        ? "—"
        : `${dominant.rate.toFixed(1)}%`
    );

    setText(
      "evenPercent",
      `${evenOdd.even.toFixed(1)}%`
    );

    setText(
      "oddPercent",
      `${evenOdd.odd.toFixed(1)}%`
    );

    setText(
      "highPercent",
      `${highLow.high.toFixed(1)}%`
    );

    setText(
      "lowPercent",
      `${highLow.low.toFixed(1)}%`
    );

    /*
      Existing HTML has OVER/UNDER.
      We calculate these around digit 4
      as a neutral 0-9 midpoint.
    */

    const overUnder =
      calculateOverUnder(
        market,
        4
      );

    setText(
      "overPercent",
      `${overUnder.over.toFixed(1)}%`
    );

    setText(
      "underPercent",
      `${overUnder.under.toFixed(1)}%`
    );

    if (dominant.digit !== null) {
      const match =
        calculateMatchDiffer(
          market,
          dominant.digit
        );

      setText(
        "matchPercent",
        `${match.match.toFixed(1)}%`
      );

      setText(
        "differPercent",
        `${match.differ.toFixed(1)}%`
      );
    }

    const momentum =
      calculateMomentum(market);

    setText(
      "risePercent",
      `${momentum.rise.toFixed(1)}%`
    );

    setText(
      "fallPercent",
      `${momentum.fall.toFixed(1)}%`
    );

    renderDigitDistribution(
      frequencies
    );
  }

  /* =========================================================
     DIGIT DISTRIBUTION UI
     ========================================================= */

  function renderDigitDistribution(
    frequencies
  ) {
    for (let digit = 0; digit <= 9; digit += 1) {
      const fill =
        document.querySelector(
          `[data-fill-digit="${digit}"]`
        );

      const row =
        document.querySelector(
          `.digit-row[data-digit="${digit}"]`
        );

      if (fill) {
        fill.style.width =
          `${frequencies.percentages[digit]}%`;
      }

      if (row) {
        const strong =
          row.querySelector("strong");

        if (strong) {
          strong.textContent =
            `${frequencies.percentages[digit].toFixed(
              1
            )}%`;
        }
      }
    }
  }

  /* =========================================================
     MARKET RENDERING
     ========================================================= */

  function renderSelectedMarket() {
    const market =
      getCurrentMarket();

    if (!market) {
      return;
    }

    setText(
      "selectedMarketShort",
      market.symbol
    );

    setText(
      "selectedMarketCode",
      market.symbol
    );

    setText(
      "selectedMarketCodeLarge",
      market.symbol
    );

    setText(
      "selectedMarketName",
      market.name
    );

    setText(
      "aiStructureMarket",
      market.symbol
    );

    setText(
      "liveQuote",
      market.quote === null
        ? "—"
        : String(market.quote)
    );

    if (market.epoch) {
      const date =
        new Date(
          market.epoch * 1000
        );

      setText(
        "quoteTime",
        date.toLocaleTimeString()
      );
    }

    setText(
      "lastDigit",
      market.lastDigit === null
        ? "—"
        : String(market.lastDigit)
    );

    const streak =
      calculateStreak(market);

    setText(
      "streakValue",
      streak.length > 1
        ? `${streak.type} × ${streak.length}`
        : "—"
    );
  }

  function renderMarketList() {
    const container =
      $("marketList");

    if (!container) {
      return;
    }

    const markets =
      MARKET_DEFINITIONS
        .map((definition) =>
          state.markets.get(
            definition.symbol
          )
        )
        .filter(Boolean);

    container.innerHTML =
      markets
        .map((market) => {
          const active =
            market.symbol ===
            state.selectedSymbol;

          const quote =
            market.quote === null
              ? "—"
              : market.quote;

          return `
            <button
              type="button"
              class="market-item ${
                active ? "active" : ""
              }"
              data-symbol="${escapeHTML(
                market.symbol
              )}"
            >
              <span class="market-item-main">
                <strong>${escapeHTML(
                  market.name
                )}</strong>
                <small>${escapeHTML(
                  market.symbol
                )}</small>
              </span>

              <span class="market-item-quote">
                ${escapeHTML(quote)}
              </span>
            </button>
          `;
        })
        .join("");

    container
      .querySelectorAll(".market-item")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const symbol =
              button.dataset.symbol;

            selectMarket(symbol);
          }
        );
      });
  }

  /* =========================================================
     SELECT MARKET
     ========================================================= */

  function selectMarket(symbol) {
    if (!state.markets.has(symbol)) {
      return;
    }

    state.selectedSymbol =
      symbol;

    renderMarketList();
    renderSelectedMarket();
    updateAIFromCurrentMarket();

    setText(
      "analysisSignal",
      "WAITING"
    );

    setText(
      "analysisReason",
      `Selected ${symbol}. The AI will analyze the new market.`
    );

    if (state.engineRunning) {
      startAIAnalysisCycle();
    }

    updateFooter(
      `SELECTED MARKET — ${symbol}`
    );
  }

  /* =========================================================
     STRATEGY CONTROL
     ========================================================= */

  function setupStrategyButtons() {
    if (state.strategyListenerReady) {
      return;
    }

    const container =
      document.querySelector(
        ".strategy-options"
      );

    if (!container) {
      console.warn(
        "Strategy container not found."
      );

      return;
    }

    /*
      Event delegation makes the buttons
      reliable even if their contents change.
    */

    container.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            ".strategy-button"
          );

        if (!button) {
          return;
        }

        const strategy =
          button.dataset.strategy;

        if (!strategy) {
          return;
        }

        handleStrategySelection(
          strategy
        );
      }
    );

    state.strategyListenerReady = true;
  }

  function updateStrategyButtons() {
    document
      .querySelectorAll(
        ".strategy-button"
      )
      .forEach((button) => {
        const active =
          button.dataset.strategy ===
          state.strategy;

        button.classList.toggle(
          "active",
          active
        );
      });

    setText(
      "strategyCurrent",
      state.strategy === "MATCH" ||
      state.strategy === "DIFFER" ||
      state.strategy === "OVER" ||
      state.strategy === "UNDER"
        ? `${state.strategy} ${
            state.targetDigit ?? ""
          }`
        : state.strategy
    );

    setText(
      "analysisStrategy",
      state.strategy
    );

    setText(
      "aiStructureStrategy",
      state.strategy
    );
  }

  function handleStrategySelection(
    strategy
  ) {
    if (
      [
        "MATCH",
        "DIFFER",
        "OVER",
        "UNDER"
      ].includes(strategy)
    ) {
      openStrategyNumberModal(
        strategy
      );

      return;
    }

    state.strategy =
      strategy;

    state.targetDigit =
      null;

    updateStrategyButtons();

    updateFooter(
      `STRATEGY SELECTED — ${strategy}`
    );

    /*
      Start immediately if there is
      enough data. Otherwise show
      waiting status until data arrives.
    */

    startAIAnalysisCycle();
  }

  /* =========================================================
     STRATEGY NUMBER MODAL
     ========================================================= */

  function openStrategyNumberModal(
    strategy
  ) {
    state.pendingStrategy =
      strategy;

    const modal =
      $("strategyNumberModal");

    const title =
      $("strategyNumberTitle");

    const description =
      $("strategyNumberDescription");

    const input =
      $("strategyNumberInput");

    const error =
      $("strategyNumberError");

    if (!modal) {
      return;
    }

    if (title) {
      title.textContent =
        `Configure ${strategy}`;
    }

    if (description) {
      description.textContent =
        strategy === "MATCH"
          ? "KRISHWAVE will analyze the market and look for this target digit."
          : strategy === "DIFFER"
            ? "KRISHWAVE will analyze whether the selected digit is statistically avoided."
            : strategy === "OVER"
              ? "The AI will analyze digits above your selected number."
              : "The AI will analyze digits below your selected number.";
    }

    if (error) {
      error.textContent = "";
    }

    if (input) {
      input.value =
        state.targetDigit === null
          ? ""
          : String(
              state.targetDigit
            );
    }

    modal.hidden = false;

    setTimeout(() => {
      if (input) {
        input.focus();
      }
    }, 50);
  }

  function closeStrategyNumberModal() {
    const modal =
      $("strategyNumberModal");

    if (modal) {
      modal.hidden = true;
    }

    state.pendingStrategy =
      null;
  }

  function applyStrategyNumber() {
    const input =
      $("strategyNumberInput");

    const error =
      $("strategyNumberError");

    const value =
      Number(input?.value);

    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 9
    ) {
      if (error) {
        error.textContent =
          "Enter a whole number from 0 to 9.";
      }

      return;
    }

    if (!state.pendingStrategy) {
      closeStrategyNumberModal();
      return;
    }

    state.strategy =
      state.pendingStrategy;

    state.targetDigit =
      value;

    updateStrategyButtons();

    closeStrategyNumberModal();

    updateFooter(
      `${state.strategy} ${value} SELECTED`
    );

    startAIAnalysisCycle();
  }

  /* =========================================================
     START / STOP ENGINE
     ========================================================= */

  function startEngine() {
    if (state.engineRunning) {
      startAIAnalysisCycle();
      return;
    }

    state.engineRunning = true;

    setText(
      "tradingEngineStatus",
      "RUNNING"
    );

    setText(
      "lastTradeAction",
      "ANALYSIS ONLY"
    );

    updateFooter(
      `KRISHWAVE ENGINE STARTED — ${state.strategy}`
    );

    startAIAnalysisCycle();
  }

  function stopEngine() {
    state.engineRunning = false;

    stopAICycle();

    state.aiPhase = "IDLE";

    setText(
      "engineState",
      "STOPPED"
    );

    setText(
      "engineStateDetail",
      "AI engine stopped"
    );

    setText(
      "engineStatus",
      "STOPPED"
    );

    setText(
      "aiLiveIndicator",
      "STOPPED"
    );

    setText(
      "aiCountdown",
      "—"
    );

    setText(
      "aiCircleStatus",
      "ENGINE STOPPED"
    );

    setText(
      "aiResultStatus",
      "STOPPED"
    );

    setText(
      "aiResultMain",
      "Start AI Engine to continue"
    );

    setText(
      "tradingEngineStatus",
      "STOPPED"
    );

    updateFooter(
      "KRISHWAVE ENGINE STOPPED"
    );
  }

  /* =========================================================
     SCAN ALL
     ========================================================= */

  function scanAllMarkets() {
    const candidates = [];

    state.markets.forEach(
      (market) => {
        const digits =
          getRecentDigits(market);

        if (
          digits.length <
          CONFIG.MIN_SAMPLE
        ) {
          return;
        }

        const dominant =
          getDominantDigit(market);

        const evenOdd =
          calculateEvenOdd(market);

        const highLow =
          calculateHighLow(market);

        const momentum =
          calculateMomentum(market);

        const strength =
          Math.max(
            dominant.rate,
            evenOdd.even,
            evenOdd.odd,
            highLow.high,
            highLow.low,
            momentum.rise,
            momentum.fall
          );

        candidates.push({
          symbol: market.symbol,
          strength
        });
      }
    );

    if (!candidates.length) {
      updateFooter(
        "SCANNER WAITING FOR MORE DATA"
      );

      return;
    }

    candidates.sort(
      (a, b) =>
        b.strength - a.strength
    );

    const best =
      candidates[0];

    if (best) {
      selectMarket(
        best.symbol
      );

      updateFooter(
        `SCAN COMPLETE — ${best.symbol} SELECTED`
      );
    }
  }

  /* =========================================================
     ACCOUNT BUTTONS
     ========================================================= */

  function setupAccountControls() {
    const connect =
      $("connectDeriv");

    const disconnect =
      $("disconnectDeriv");

    if (connect) {
      connect.addEventListener(
        "click",
        () => {
          connectDeriv();
        }
      );
    }

    if (disconnect) {
      disconnect.addEventListener(
        "click",
        () => {
          disconnectDeriv();
        }
      );
    }
  }

  /* =========================================================
     ENGINE BUTTONS
     ========================================================= */

  function setupEngineControls() {
    const start =
      $("start");

    const stop =
      $("stop");

    const scan =
      $("scanAll");

    if (start) {
      start.addEventListener(
        "click",
        () => {
          startEngine();
        }
      );
    }

    if (stop) {
      stop.addEventListener(
        "click",
        () => {
          stopEngine();
        }
      );
    }

    if (scan) {
      scan.addEventListener(
        "click",
        () => {
          scanAllMarkets();

          if (!state.engineRunning) {
            startEngine();
          } else {
            startAIAnalysisCycle();
          }
        }
      );
    }
  }

  /* =========================================================
     MODAL CONTROLS
     ========================================================= */

  function setupStrategyModal() {
    const apply =
      $("applyStrategyNumber");

    const cancel =
      $("cancelStrategyNumber");

    const input =
      $("strategyNumberInput");

    const modal =
      $("strategyNumberModal");

    if (apply) {
      apply.addEventListener(
        "click",
        () => {
          applyStrategyNumber();
        }
      );
    }

    if (cancel) {
      cancel.addEventListener(
        "click",
        () => {
          closeStrategyNumberModal();
        }
      );
    }

    if (input) {
      input.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter"
          ) {
            applyStrategyNumber();
          }

          if (
            event.key === "Escape"
          ) {
            closeStrategyNumberModal();
          }
        }
      );
    }

    if (modal) {
      modal.addEventListener(
        "click",
        (event) => {
          if (
            event.target === modal
          ) {
            closeStrategyNumberModal();
          }
        }
      );
    }
  }

  /* =========================================================
     ACCOUNT MODE UI
     ========================================================= */

  function initializeAccountDisplay() {
    setText(
      "accountType",
      "DEMO"
    );

    setText(
      "tradingAccountMode",
      "DEMO"
    );

    setText(
      "tradingModeBadge",
      "ANALYSIS ONLY"
    );

    setText(
      "accountLoginStatus",
      "PUBLIC MARKET DATA"
    );

    setText(
      "accountStatus",
      "DEMO MODE"
    );
  }

  /* =========================================================
     INITIAL UI
     ========================================================= */

  function initializeUI() {
    initializeMarkets();

    setupStrategyButtons();

    setupEngineControls();

    setupAccountControls();

    setupStrategyModal();

    initializeAccountDisplay();

    updateStrategyButtons();

    renderMarketList();

    renderSelectedMarket();

    updateAIFromCurrentMarket();

    setText(
      "connectedMarkets",
      "0"
    );

    setText(
      "liveTicks",
      "0"
    );

    setText(
      "engineState",
      "READY"
    );

    setText(
      "engineStateDetail",
      "Select a strategy to begin"
    );

    setText(
      "tradingEngineStatus",
      "STOPPED"
    );

    setText(
      "lastTradeAction",
      "ANALYSIS ONLY"
    );

    updateFooter(
      "SYSTEM READY"
    );
  }

  /* =========================================================
     STARTUP
     ========================================================= */

  function initialize() {
    console.log(
      "KRISHWAVE V3 BEAST ENGINE INITIALIZING..."
    );

    initializeUI();

    /*
      Connect AFTER UI initialization.
      This prevents WebSocket errors from
      stopping the strategy controls.
    */

    setTimeout(() => {
      connectDeriv();
    }, 250);
  }

  /* =========================================================
     GLOBAL API
     ========================================================= */

  window.KRISHWAVE = {
    state,

    connect: connectDeriv,
    disconnect: disconnectDeriv,

    start: startEngine,
    stop: stopEngine,

    scan: scanAllMarkets,

    selectMarket,

    startAnalysis:
      startAIAnalysisCycle,

    calculateStrategy,

    calculateAutoStrategy
  };

  /* =========================================================
     BOOT
     ========================================================= */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

})();