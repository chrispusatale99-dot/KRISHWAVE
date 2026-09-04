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

  window.scrollTo(0, 0);
}


// ==========================================
// DERIV LIVE DATA
// ==========================================

let derivWS = null;

let liveTicks = {};

let tickHistory = {};


// ==========================================
// MARKET NAME NORMALIZER
// ==========================================

function normalizeName(name) {

  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

}


// ==========================================
// GET LAST DIGIT
// ==========================================

function getLastDigit(quote) {

  const text = String(quote);

  const digits = text.replace(/\D/g, "");

  if (!digits.length) {
    return null;
  }

  return Number(
    digits.charAt(digits.length - 1)
  );

}


// ==========================================
// DIGIT ANALYSIS
// ==========================================

function analyzeDigits(symbol) {

  const history =
    tickHistory[symbol] || [];


  if (history.length < 10) {

    return {

      ready: false,

      message: "Collecting live ticks",

      confidence: 0,

      signal: "WAIT"

    };

  }


  const recent =
    history.slice(-50);


  const digits = recent

    .map(tick =>
      getLastDigit(tick.quote)
    )

    .filter(digit =>
      digit !== null
    );


  if (digits.length < 10) {

    return {

      ready: false,

      message: "Waiting for digit data",

      confidence: 0,

      signal: "WAIT"

    };

  }


  // ========================================
  // EVEN / ODD
  // ========================================

  let even = 0;

  let odd = 0;


  digits.forEach(digit => {

    if (digit % 2 === 0) {
      even++;
    } else {
      odd++;
    }

  });


  const total =
    even + odd;


  const evenPercent =
    Math.round((even / total) * 100);


  const oddPercent =
    Math.round((odd / total) * 100);


  // ========================================
  // OVER / UNDER
  // ========================================

  let over = 0;

  let under = 0;


  digits.forEach(digit => {

    if (digit > 4) {
      over++;
    } else {
      under++;
    }

  });


  const overPercent =
    Math.round((over / total) * 100);


  const underPercent =
    Math.round((under / total) * 100);


  // ========================================
  // MATCH / DIFFER
  // ========================================

  const counts = [
    0,0,0,0,0,
    0,0,0,0,0
  ];


  digits.forEach(digit => {

    counts[digit]++;

  });


  let mostCommonDigit = 0;


  for (let i = 1; i < 10; i++) {

    if (
      counts[i] >
      counts[mostCommonDigit]
    ) {

      mostCommonDigit = i;

    }

  }


  const matchPercent =
    Math.round(
      (counts[mostCommonDigit] / total) * 100
    );


  const differPercent =
    100 - matchPercent;


  // ========================================
  // RISE / FALL
  // ========================================

  let rises = 0;

  let falls = 0;


  for (
    let i = 1;
    i < recent.length;
    i++
  ) {

    const previous =
      Number(
        recent[i - 1].quote
      );

    const current =
      Number(
        recent[i].quote
      );


    if (current > previous) {

      rises++;

    }


    if (current < previous) {

      falls++;

    }

  }


  const movementTotal =
    rises + falls;


  let risePercent = 50;

  let fallPercent = 50;


  if (movementTotal > 0) {

    risePercent =
      Math.round(
        (rises / movementTotal) * 100
      );

    fallPercent =
      Math.round(
        (falls / movementTotal) * 100
      );

  }


  // ========================================
  // FIND STRONGEST SETUP
  // ========================================

  const strategies = [

    {
      name: "EVEN",
      strength: evenPercent
    },

    {
      name: "ODD",
      strength: oddPercent
    },

    {
      name: "OVER",
      strength: overPercent
    },

    {
      name: "UNDER",
      strength: underPercent
    },

    {
      name: "MATCH",
      strength: matchPercent
    },

    {
      name: "DIFFER",
      strength: differPercent
    },

    {
      name: "RISE",
      strength: risePercent
    },

    {
      name: "FALL",
      strength: fallPercent
    }

  ];


  strategies.sort(
    (a, b) =>
      b.strength - a.strength
  );


  const best =
    strategies[0];


  // ========================================
  // ANALYSIS SCORE
  // ========================================

  let confidence =
    Math.round(
      best.strength
    );


  confidence =
    Math.min(
      95,
      confidence
    );


  let signal;


  if (confidence >= 70) {

    signal = "TRADE";

  } else {

    signal = "NO TRADE";

  }


  // ========================================
  // REASON
  // ========================================

  let reason;


  if (signal === "TRADE") {

    reason =
      best.name +
      " currently has the strongest recent pattern";

  } else {

    reason =
      "No sufficiently strong setup detected";

  }


  return {

    ready: true,

    signal: signal,

    strategy: best.name,

    confidence: confidence,

    reason: reason,

    lastDigit:
      digits[digits.length - 1],

    evenPercent: evenPercent,

    oddPercent: oddPercent,

    overPercent: overPercent,

    underPercent: underPercent,

    matchPercent: matchPercent,

    differPercent: differPercent,

    risePercent: risePercent,

    fallPercent: fallPercent,

    mostCommonDigit:
      mostCommonDigit,

    sampleSize:
      digits.length

  };

}


// ==========================================
// MAIN MARKET ANALYSIS
// ==========================================

function analyzeMarket(symbol) {

  return analyzeDigits(symbol);

}


// ==========================================
// MARKET DISPLAY
// ==========================================

function renderMarkets(scan = false) {

  const marketList =
    $("#marketList");


  if (!marketList) {
    return;
  }


  marketList.innerHTML =
    markets.map(m => {

      const analysis =
        scan

        ? analyzeMarket(m[0])

        : {

            confidence: null,

            signal: "READY",

            reason:
              "Waiting for scan"

          };


      return `

        <button

          class="market-item ${
            m[0] === selected
              ? "selected"
              : ""
          }"

          data-symbol="${m[0]}"

        >

          <div>

            <b>${m[1]}</b>

            <div class="market-meta">

              ${m[0]} ·
              ${analysis.reason}

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

              ? `<div>
                  ${analysis.confidence}%
                </div>`

              : ""

            }

          </div>

        </button>

      `;

    }).join("");


  $$(".market-item").forEach(
    button => {

      button.onclick = () => {

        selected =
          button.dataset.symbol;

        renderMarkets(scan);

      };

    }
  );

}


// ==========================================
// INITIAL DISPLAY
// ==========================================

renderMarkets();


// ==========================================
// SCAN ALL
// ==========================================

const scanButton =
  $("#scanAll");


if (scanButton) {

  scanButton.onclick = () => {

    renderMarkets(true);


    const status =
      $("#engineStatus");


    if (status) {

      status.innerHTML =

        '<small>LIVE DIGIT AI</small>' +

        '<strong>SCANNED</strong>' +

        '<b>Analyzing recent live tick patterns</b>';

    }

  };

}


// ==========================================
// STRATEGY BUTTONS
// ==========================================

$$(".mode button").forEach(
  button => {

    button.onclick = () => {

      $$(".mode button")
        .forEach(item => {

          item.classList.remove(
            "active"
          );

        });


      button.classList.add(
        "active"
      );

    };

  }
);


// ==========================================
// START / STOP BOT
// ==========================================

function startBot() {

  const button =
    $("#start");


  if (!button) {
    return;
  }


  const running =
    button.dataset.running === "1";


  if (!running) {

    button.dataset.running = "1";

    button.textContent =
      "Stop Trading Bot";


    const status =
      $("#engineStatus");


    if (status) {

      status.innerHTML =

        '<small>BOT RUNNING</small>' +

        '<strong>LIVE</strong>' +

        '<b>Analyzing live digit patterns</b>';

    }

  } else {

    button.dataset.running = "0";

    button.textContent =
      "Start Trading Bot";


    const status =
      $("#engineStatus");


    if (status) {

      status.innerHTML =

        '<small>WAITING...</small>' +

        '<strong>--</strong>' +

        '<b>AI Engine Ready to Start</b>';

    }

  }

}


const startButton =
  $("#start");


if (startButton) {

  startButton.onclick =
    startBot;

}


// ==========================================
// ACCOUNT TYPE
// ==========================================

const accountSelector =
  $("#account");


if (accountSelector) {

  accountSelector.onchange =
    event => {

      const type =
        $("#ptype");


      if (type) {

        type.textContent =
          event.target.value;

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


  derivWS =
    new WebSocket(
      "wss://api.derivws.com/trading/v1/options/ws/public"
    );


  // ========================================
  // CONNECTION OPEN
  // ========================================

  derivWS.onopen = () => {

    console.log(
      "KRISHWAVE: Connected to Deriv"
    );


    const status =
      $("#engineStatus");


    if (status) {

      status.innerHTML =

        '<small>DERIV CONNECTION</small>' +

        '<strong>CONNECTED</strong>' +

        '<b>Loading active markets...</b>';

    }


    derivWS.send(

      JSON.stringify({

        active_symbols:
          "brief",

        req_id: 1

      })

    );

  };


  // ========================================
  // DERIV MESSAGE
  // ========================================

  derivWS.onmessage =
    event => {

      let data;


      try {

        data =
          JSON.parse(
            event.data
          );

      } catch (error) {

        console.error(
          "Invalid Deriv message",
          error
        );

        return;

      }


      // ====================================
      // ACTIVE SYMBOLS
      // ====================================

      if (
        data.msg_type ===
        "active_symbols"
      ) {

        const active =
          data.active_symbols || [];


        const byName =
          new Map();


        active.forEach(
          symbol => {

            const name =
              normalizeName(
                symbol
                  .underlying_symbol_name
              );


            const id =
              symbol
                .underlying_symbol;


            if (name && id) {

              byName.set(
                name,
                id
              );

            }

          }
        );


        let connectedMarkets = 0;


        markets.forEach(
          (market, index) => {

            const marketName =
              normalizeName(
                market[1]
              );


            const realSymbol =
              byName.get(
                marketName
              );


            if (realSymbol) {

              markets[index][0] =
                realSymbol;


              connectedMarkets++;


              derivWS.send(

                JSON.stringify({

                  ticks:
                    realSymbol,

                  subscribe:
                    1,

                  req_id:
                    100 + index

                })

              );


              console.log(

                "KRISHWAVE SUBSCRIBED:",

                market[1],

                realSymbol

              );

            } else {

              console.warn(

                "MARKET NOT FOUND:",

                market[1]

              );

            }

          }
        );


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


      // ====================================
      // LIVE TICK
      // ====================================

      if (

        data.msg_type === "tick" &&
        data.tick

      ) {

        const symbol =
          data.tick.symbol;


        const quote =
          Number(
            data.tick.quote
          );


        if (
          !Number.isFinite(
            quote
          )
        ) {

          return;

        }


        // Store latest tick

        liveTicks[symbol] = {

          quote: quote,

          epoch:
            data.tick.epoch

        };


        // Create history

        if (
          !tickHistory[symbol]
        ) {

          tickHistory[symbol] = [];

        }


        // Store tick

        tickHistory[symbol].push({

          quote: quote,

          epoch:
            data.tick.epoch

        });


        // Keep latest 100

        if (
          tickHistory[symbol]
            .length > 100
        ) {

          tickHistory[symbol]
            .shift();

        }


        console.log(

          "KRISHWAVE LIVE TICK:",

          symbol,

          quote

        );


        // =================================
        // LIVE SELECTED MARKET ANALYSIS
        // =================================

        if (
          symbol === selected
        ) {

          const analysis =
            analyzeMarket(
              symbol
            );


          if (
            analysis.ready
          ) {

            const status =
              $("#engineStatus");


            if (status) {

              status.innerHTML =

                '<small>LIVE DIGIT ANALYSIS</small>' +

                '<strong>' +

                analysis.strategy +

                '</strong>' +

                '<b>' +

                analysis.confidence +

                '% analysis score · Last digit ' +

                analysis.lastDigit +

                '</b>';

            }

          }

        }

      }


      // ====================================
      // API ERROR
      // ====================================

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

            (
              data.error.message ||
              "API error"
            ) +

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
