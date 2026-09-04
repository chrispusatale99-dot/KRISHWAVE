const markets = [
  ["R_10", "Volatility 10 Index"],
  ["R_10_1S", "Volatility 10 (1s)"],
  ["R_15_1S", "Volatility 15 (1s)"],
  ["R_25", "Volatility 25 Index"],
  ["R_25_1S", "Volatility 25 (1s)"],
  ["R_30_1S", "Volatility 30 (1s)"],
  ["R_50", "Volatility 50 Index"],
  ["R_50_1S", "Volatility 50 (1s)"],
  ["R_75", "Volatility 75 Index"],
  ["R_75_1S", "Volatility 75 (1s)"],
  ["R_90_1S", "Volatility 90 (1s)"],
  ["R_100", "Volatility 100 Index"],
  ["R_100_1S", "Volatility 100 (1s)"]
];

let selected = markets[0][0];

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);


// ==========================================
// PAGE NAVIGATION
// ==========================================

function page(id) {

  $$(".page").forEach(x => {
    x.classList.add("hidden");
  });

  const target = $("#" + id);

  if (target) {
    target.classList.remove("hidden");
  }

  scrollTo(0, 0);
}


// ==========================================
// DERIV LIVE DATA
// ==========================================

let derivWS = null;

let liveTicks = {};

let tickHistory = {};


// ==========================================
// NORMALIZE MARKET NAMES
// ==========================================

function normalizeName(name) {

  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

}


// ==========================================
// REAL-TICK ANALYSIS ENGINE
// ==========================================

function analyzeMarket(symbol) {

  const history = tickHistory[symbol] || [];


  // Need enough live ticks first

  if (history.length < 10) {

    return {
      confidence: 0,
      signal: "WAIT",
      reason: "Collecting live ticks"
    };

  }


  // Use latest 20 ticks

  const recent = history.slice(-20);

  let rises = 0;

  let falls = 0;


  // Compare each tick with the previous tick

  for (let i = 1; i < recent.length; i++) {

    if (recent[i].quote > recent[i - 1].quote) {
      rises++;
    }

    if (recent[i].quote < recent[i - 1].quote) {
      falls++;
    }

  }


  const totalMoves = rises + falls;


  // Market did not move

  if (totalMoves === 0) {

    return {
      confidence: 0,
      signal: "NO TRADE",
      reason: "Market is flat"
    };

  }


  // Calculate movement strength

  const riseStrength = Math.round(
    (rises / totalMoves) * 100
  );

  const fallStrength = Math.round(
    (falls / totalMoves) * 100
  );


  let direction;

  let strength;


  if (riseStrength > fallStrength) {

    direction = "RISE";
    strength = riseStrength;

  } else {

    direction = "FALL";
    strength = fallStrength;

  }


  // Calculate analysis confidence

  let confidence = Math.round(
    50 +
    Math.abs(riseStrength - fallStrength) * 0.7
  );


  // Keep confidence below 100

  confidence = Math.min(95, confidence);


  let signal;

  let reason;


  if (confidence >= 75) {

    signal = "TRADE";

    reason =
      direction +
      " momentum detected from " +
      recent.length +
      " live ticks";

  } else {

    signal = "NO TRADE";

    reason =
      "Weak " +
      direction.toLowerCase() +
      " momentum";

  }


  return {
    confidence: confidence,
    signal: signal,
    reason: reason,
    direction: direction,
    rises: rises,
    falls: falls
  };

}


// ==========================================
// MARKET DISPLAY
// ==========================================

function renderMarkets(scan = false) {

  const marketList = $("#marketList");

  if (!marketList) {
    return;
  }


  marketList.innerHTML = markets.map(m => {

    const analysis = scan

      ? analyzeMarket(m[0])

      : {
          confidence: null,
          signal: "READY",
          reason: "Waiting for scan"
        };


    return `
      <button
        class="market-item ${m[0] === selected ? "selected" : ""}"
        data-symbol="${m[0]}"
      >

        <div>

          <b>${m[1]}</b>

          <div class="market-meta">
            ${m[0]} · ${analysis.reason}
          </div>

        </div>


        <div class="market-signal">

          <span class="signal ${
            analysis.signal === "TRADE"
              ? "good"
              : "wait"
          }">

            ${analysis.signal}

          </span>


          ${
            analysis.confidence
              ? `<div>${analysis.confidence}%</div>`
              : ""
          }

        </div>

      </button>
    `;

  }).join("");


  // Market selection

  $$(".market-item").forEach(button => {

    button.onclick = () => {

      selected = button.dataset.symbol;

      renderMarkets(scan);

    };

  });

}


// ==========================================
// INITIAL MARKET DISPLAY
// ==========================================

renderMarkets();


// ==========================================
// SCAN ALL MARKETS
// ==========================================

const scanButton = $("#scanAll");

if (scanButton) {

  scanButton.onclick = () => {

    renderMarkets(true);


    const status = $("#engineStatus");

    if (status) {

      status.innerHTML =
        '<small>LIVE AI ANALYSIS</small>' +
        '<strong>SCANNED</strong>' +
        '<b>Analyzing recent Deriv tick data</b>';

    }

  };

}


// ==========================================
// STRATEGY / MODE BUTTONS
// ==========================================

$$(".mode button").forEach(button => {

  button.onclick = () => {

    $$(".mode button").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");

  };

});


// ==========================================
// START / STOP BOT
// ==========================================

function startBot() {

  const button = $("#start");

  if (!button) {
    return;
  }


  const running =
    button.dataset.running === "1";


  if (!running) {

    button.dataset.running = "1";

    button.textContent =
      "Stop Trading Bot";


    const status = $("#engineStatus");

    if (status) {

      status.innerHTML =
        '<small>BOT RUNNING</small>' +
        '<strong>LIVE</strong>' +
        '<b>Analyzing live market data</b>';

    }

  } else {

    button.dataset.running = "0";

    button.textContent =
      "Start Trading Bot";


    const status = $("#engineStatus");

    if (status) {

      status.innerHTML =
        '<small>WAITING...</small>' +
        '<strong>--</strong>' +
        '<b>AI Engine Ready to Start</b>';

    }

  }

}


const startButton = $("#start");

if (startButton) {
  startButton.onclick = startBot;
}


// ==========================================
// ACCOUNT TYPE
// ==========================================

const accountSelector = $("#account");

if (accountSelector) {

  accountSelector.onchange = event => {

    const type = $("#ptype");

    if (type) {
      type.textContent = event.target.value;
    }

  };

}


// ==========================================
// CONNECT TO DERIV
// ==========================================

function connectDeriv() {

  console.log(
    "KRISHWAVE: Connecting to Deriv..."
  );


  derivWS = new WebSocket(
    "wss://api.derivws.com/trading/v1/options/ws/public"
  );


  // ========================================
  // CONNECTION OPEN
  // ========================================

  derivWS.onopen = () => {

    console.log(
      "KRISHWAVE: Connected to Deriv"
    );


    const status = $("#engineStatus");

    if (status) {

      status.innerHTML =
        '<small>DERIV CONNECTION</small>' +
        '<strong>CONNECTED</strong>' +
        '<b>Loading active markets...</b>';

    }


    // Ask Deriv for currently active markets

    derivWS.send(
      JSON.stringify({
        active_symbols: "brief",
        req_id: 1
      })
    );

  };


  // ========================================
  // RECEIVE DERIV MESSAGES
  // ========================================

  derivWS.onmessage = event => {

    let data;


    try {

      data = JSON.parse(event.data);

    } catch (error) {

      console.error(
        "KRISHWAVE: Invalid Deriv message",
        error
      );

      return;

    }


    // ======================================
    // ACTIVE SYMBOLS RESPONSE
    // ======================================

    if (data.msg_type === "active_symbols") {

      const active =
        data.active_symbols || [];


      const byName = new Map();


      // Build current Deriv symbol map

      active.forEach(symbol => {

        const name =
          normalizeName(
            symbol.underlying_symbol_name
          );

        const id =
          symbol.underlying_symbol;


        if (name && id) {

          byName.set(name, id);

        }

      });


      let connectedMarkets = 0;


      // Subscribe to our 13 Volatility markets

      markets.forEach((market, index) => {

        const marketName =
          normalizeName(market[1]);


        const realSymbol =
          byName.get(marketName);


        if (realSymbol) {

          // Replace old symbol with current Deriv symbol

          markets[index][0] =
            realSymbol;


          connectedMarkets++;


          // Subscribe to live ticks

          derivWS.send(
            JSON.stringify({

              ticks: realSymbol,

              subscribe: 1,

              req_id: 100 + index

            })
          );


          console.log(
            "KRISHWAVE SUBSCRIBED:",
            market[1],
            realSymbol
          );

        } else {

          console.warn(
            "KRISHWAVE MARKET NOT FOUND:",
            market[1]
          );

        }

      });


      // Update connection status

      const status =
        $("#engineStatus");


      if (status) {

        status.innerHTML =
          '<small>DERIV CONNECTION</small>' +
          '<strong>LIVE</strong>' +
          '<b>' +
          connectedMarkets +
          ' markets receiving live ticks</b>';

      }


      return;

    }


    // ======================================
    // LIVE TICK RESPONSE
    // ======================================

    if (
      data.msg_type === "tick" &&
      data.tick
    ) {

      const symbol =
        data.tick.symbol;


      const quote =
        Number(data.tick.quote);


      if (!Number.isFinite(quote)) {

        return;

      }


      // Store latest tick

      liveTicks[symbol] = {

        quote: quote,

        epoch: data.tick.epoch

      };


      // Create history if necessary

      if (!tickHistory[symbol]) {

        tickHistory[symbol] = [];

      }


      // Add live tick

      tickHistory[symbol].push({

        quote: quote,

        epoch: data.tick.epoch

      });


      // Keep latest 100 ticks

      if (
        tickHistory[symbol].length > 100
      ) {

        tickHistory[symbol].shift();

      }


      console.log(
        "KRISHWAVE LIVE TICK:",
        symbol,
        quote
      );


      // Analyze selected market when enough data exists

      if (symbol === selected) {

        const analysis =
          analyzeMarket(symbol);


        if (
          analysis.confidence > 0
        ) {

          const status =
            $("#engineStatus");


          if (status) {

            status.innerHTML =
              '<small>LIVE ANALYSIS</small>' +
              '<strong>' +
              analysis.direction +
              '</strong>' +
              '<b>' +
              analysis.confidence +
              '% analysis strength</b>';

          }

        }

      }

    }


    // ======================================
    // DERIV API ERROR
    // ======================================

    if (data.error) {

      console.error(
        "DERIV API ERROR:",
        data.error
      );


      const status =
        $("#engineStatus");


      if (status) {

        status.innerHTML =
          '<small>DERIV API</small>' +
          '<strong>ERROR</strong>' +
          '<b>' +
          (data.error.message || "API error") +
          '</b>';

      }

    }

  };


  // ========================================
  // CONNECTION ERROR
  // ========================================

  derivWS.onerror = () => {

    console.error(
      "KRISHWAVE: Deriv connection error"
    );


    const status =
      $("#engineStatus");


    if (status) {

      status.innerHTML =
        '<small>DERIV CONNECTION</small>' +
        '<strong>ERROR</strong>' +
        '<b>Connection problem</b>';

    }

  };


  // ========================================
  // CONNECTION CLOSED
  // ========================================

  derivWS.onclose = () => {

    console.log(
      "KRISHWAVE: Deriv connection closed"
    );


    const status =
      $("#engineStatus");


    if (status) {

      status.innerHTML =
        '<small>DERIV CONNECTION</small>' +
        '<strong>OFFLINE</strong>' +
        '<b>Connection closed</b>';

    }

  };

}


// ==========================================
// START DERIV LIVE CONNECTION
// ==========================================

connectDeriv();
