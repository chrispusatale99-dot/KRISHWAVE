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

let derivWS = null;

let liveTicks = {};
let tickHistory = {};
let digitStats = {};
let marketNames = {};
let marketMeta = {};

let ticksReceived = 0;
let connectedMarkets = 0;

let reconnectTimer = null;
let requestCounter = 1000;

/*
 * Track every history request.
 * This prevents the history response from
 * depending on echo_req being present.
 */
const historyRequests = {};

const MAX_HISTORY = 200;
const MIN_SAMPLE = 30;

/* =========================
   HELPERS
========================= */

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function decimalPlacesFromPip(pipSize) {
  const pip = Number(pipSize);

  if (!Number.isFinite(pip) || pip <= 0) {
    return null;
  }

  return Math.max(
    0,
    Math.round(-Math.log10(pip))
  );
}

function getLastDigit(quote, pipSize) {
  const number = Number(quote);

  if (!Number.isFinite(number)) {
    return null;
  }

  const precision =
    decimalPlacesFromPip(pipSize);

  if (precision !== null) {
    const formatted =
      number.toFixed(precision);

    const parts =
      formatted.split(".");

    const decimals =
      parts[1] || "";

    if (decimals.length > 0) {
      return Number(
        decimals.charAt(
          decimals.length - 1
        )
      );
    }

    return Number(
      formatted.slice(-1)
    );
  }

  const text = String(quote);

  const cleaned =
    text.replace(/[^0-9]/g, "");

  if (!cleaned) {
    return null;
  }

  return Number(
    cleaned.charAt(
      cleaned.length - 1
    )
  );
}

function formatQuote(quote) {
  if (
    quote === undefined ||
    quote === null
  ) {
    return "Waiting...";
  }

  return String(quote);
}

function resetMarketData(symbol) {
  tickHistory[symbol] = [];

  digitStats[symbol] = [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ];

  delete liveTicks[symbol];
}

function updateTickCounter() {
  /*
   * Supports several possible counter IDs
   * without breaking the page if one does
   * not exist.
   */

  const possibleCounters = [
    "#liveTicks",
    "#liveTickCount",
    "#ticksReceived",
    "#tickCount",
    "#totalTicks"
  ];

  possibleCounters.forEach(selector => {
    const element = $(selector);

    if (element) {
      element.textContent =
        String(ticksReceived);
    }
  });

  /*
   * Also supports:
   * <span data-live-ticks></span>
   */
  $$("[data-live-ticks]")
    .forEach(element => {
      element.textContent =
        String(ticksReceived);
    });
}

function updateConnectionCounters() {
  const possibleCounters = [
    "#connectedMarkets",
    "#marketCount",
    "#liveMarkets"
  ];

  possibleCounters.forEach(selector => {
    const element = $(selector);

    if (element) {
      element.textContent =
        String(connectedMarkets);
    }
  });

  $$("[data-live-markets]")
    .forEach(element => {
      element.textContent =
        String(connectedMarkets);
    });
}

function page(id) {
  $$(".page").forEach(x =>
    x.classList.add("hidden")
  );

  const target =
    $("#" + id);

  if (target) {
    target.classList.remove("hidden");
  }

  window.scrollTo(0, 0);
}

/* =========================
   ANALYSIS ENGINE
========================= */

function analyzeDigits(symbol) {
  const history =
    tickHistory[symbol] || [];

  if (
    history.length <
    MIN_SAMPLE
  ) {
    return {
      ready: false,
      signal: "WAIT",
      strategy: "--",
      confidence: 0,
      reason:
        "Collecting live ticks (" +
        history.length +
        "/" +
        MIN_SAMPLE +
        ")"
    };
  }

  const recent =
    history.slice(-100);

  const shortWindow =
    history.slice(-30);

  const pipSize =
    marketMeta[symbol]?.pip_size;

  const digits =
    recent
      .map(tick =>
        getLastDigit(
          tick.quote,
          pipSize
        )
      )
      .filter(
        digit =>
          Number.isInteger(digit) &&
          digit >= 0 &&
          digit <= 9
      );

  const shortDigits =
    shortWindow
      .map(tick =>
        getLastDigit(
          tick.quote,
          pipSize
        )
      )
      .filter(
        digit =>
          Number.isInteger(digit) &&
          digit >= 0 &&
          digit <= 9
      );

  if (
    digits.length <
    MIN_SAMPLE
  ) {
    return {
      ready: false,
      signal: "WAIT",
      strategy: "--",
      confidence: 0,
      reason:
        "Waiting for valid digit data"
    };
  }

  const total =
    digits.length;

  /* =====================
     DIGIT COUNTS
  ===================== */

  const counts = [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ];

  const shortCounts = [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0
  ];

  let even = 0;
  let odd = 0;
  let over = 0;
  let under = 0;

  digits.forEach(digit => {
    counts[digit]++;

    if (digit % 2 === 0) {
      even++;
    } else {
      odd++;
    }

    if (digit > 4) {
      over++;
    } else {
      under++;
    }
  });

  shortDigits.forEach(digit => {
    shortCounts[digit]++;
  });

  const evenPercent =
    Math.round(
      (even / total) * 100
    );

  const oddPercent =
    Math.round(
      (odd / total) * 100
    );

  const overPercent =
    Math.round(
      (over / total) * 100
    );

  const underPercent =
    Math.round(
      (under / total) * 100
    );

  /* =====================
     MOST COMMON DIGIT
  ===================== */

  let mostCommonDigit = 0;

  for (let i = 1; i <= 9; i++) {
    if (
      counts[i] >
      counts[mostCommonDigit]
    ) {
      mostCommonDigit = i;
    }
  }

  const matchPercent =
    Math.round(
      (counts[mostCommonDigit] /
        total) *
        100
    );

  const differPercent =
    100 - matchPercent;

  /* =====================
     RECENT DIGIT
  ===================== */

  let strongestRecentDigit = 0;

  for (let i = 1; i <= 9; i++) {
    if (
      shortCounts[i] >
      shortCounts[
        strongestRecentDigit
      ]
    ) {
      strongestRecentDigit = i;
    }
  }

  const recentDigitPercent =
    Math.round(
      (shortCounts[
        strongestRecentDigit
      ] /
        Math.max(
          shortDigits.length,
          1
        )) *
        100
    );

  /* =====================
     RISE / FALL
  ===================== */

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

    if (
      !Number.isFinite(
        previous
      ) ||
      !Number.isFinite(
        current
      )
    ) {
      continue;
    }

    if (
      current >
      previous
    ) {
      rises++;
    } else if (
      current <
      previous
    ) {
      falls++;
    }
  }

  const movement =
    rises + falls;

  let risePercent = 50;
  let fallPercent = 50;

  if (movement > 0) {
    risePercent =
      Math.round(
        (rises / movement) *
          100
      );

    fallPercent =
      Math.round(
        (falls / movement) *
          100
      );
  }

  /* =====================
     STREAK
  ===================== */

  let streakType = "";
  let streakLength = 0;

  if (recent.length >= 2) {
    let direction = null;

    for (
      let i =
        recent.length - 1;
      i > 0;
      i--
    ) {
      const current =
        Number(
          recent[i].quote
        );

      const previous =
        Number(
          recent[i - 1].quote
        );

      let currentDirection =
        null;

      if (
        current >
        previous
      ) {
        currentDirection =
          "RISE";
      } else if (
        current <
        previous
      ) {
        currentDirection =
          "FALL";
      }

      if (!currentDirection) {
        break;
      }

      if (!direction) {
        direction =
          currentDirection;

        streakLength = 1;
      } else if (
        direction ===
        currentDirection
      ) {
        streakLength++;
      } else {
        break;
      }
    }

    streakType =
      direction || "";
  }

  /* =====================
     CONSISTENCY
  ===================== */

  const maxDigitCount =
    Math.max(...counts);

  const minDigitCount =
    Math.min(...counts);

  const distributionSpread =
    maxDigitCount -
    minDigitCount;

  const consistencyScore =
    Math.max(
      0,
      Math.min(
        100,
        100 -
          distributionSpread *
            3
      )
    );

  /* =====================
     STRATEGY SCORES
  ===================== */

  const candidates = [];

  const evenStrength =
    Math.abs(
      evenPercent - 50
    ) * 2;

  const oddStrength =
    Math.abs(
      oddPercent - 50
    ) * 2;

  const overStrength =
    Math.abs(
      overPercent - 50
    ) * 2;

  const underStrength =
    Math.abs(
      underPercent - 50
    ) * 2;

  const matchStrength =
    Math.max(
      0,
      (matchPercent - 10) *
        2
    );

  const differStrength =
    Math.max(
      0,
      (differPercent - 50) *
        1.2
    );

  const riseStrength =
    Math.abs(
      risePercent - 50
    ) * 2;

  const fallStrength =
    Math.abs(
      fallPercent - 50
    ) * 2;

  candidates.push({
    name: "EVEN",
    strength: evenStrength,
    raw: evenPercent
  });

  candidates.push({
    name: "ODD",
    strength: oddStrength,
    raw: oddPercent
  });

  candidates.push({
    name: "OVER",
    strength: overStrength,
    raw: overPercent
  });

  candidates.push({
    name: "UNDER",
    strength: underStrength,
    raw: underPercent
  });

  candidates.push({
    name: "MATCH",
    strength: matchStrength,
    raw: matchPercent
  });

  candidates.push({
    name: "DIFFER",
    strength: differStrength,
    raw: differPercent
  });

  candidates.push({
    name: "RISE",
    strength: riseStrength,
    raw: risePercent
  });

  candidates.push({
    name: "FALL",
    strength: fallStrength,
    raw: fallPercent
  });

  candidates.sort(
    (a, b) =>
      b.strength -
      a.strength
  );

  const best =
    candidates[0];

  /* =====================
     CONFIDENCE
  ===================== */

  let confidence =
    Math.round(
      50 +
        best.strength *
          0.45 +
        consistencyScore *
          0.20
    );

  /* =====================
     AGREEMENT
  ===================== */

  if (
    best.name === "MATCH" &&
    strongestRecentDigit ===
      mostCommonDigit
  ) {
    confidence += 5;
  }

  if (
    best.name === "RISE" &&
    risePercent >= 60
  ) {
    confidence += 4;
  }

  if (
    best.name === "FALL" &&
    fallPercent >= 60
  ) {
    confidence += 4;
  }

  if (
    (
      best.name === "EVEN" &&
      strongestRecentDigit % 2 ===
        0
    ) ||
    (
      best.name === "ODD" &&
      strongestRecentDigit % 2 ===
        1
    )
  ) {
    confidence += 3;
  }

  if (
    best.name === "OVER" &&
    strongestRecentDigit > 4
  ) {
    confidence += 3;
  }

  if (
    best.name === "UNDER" &&
    strongestRecentDigit <= 4
  ) {
    confidence += 3;
  }

  confidence =
    Math.max(
      0,
      Math.min(
        95,
        confidence
      )
    );

  /* =====================
     TRADE FILTER
  ===================== */

  const sufficientSample =
    total >= MIN_SAMPLE;

  const strongEnough =
    confidence >= 68;

  const directionalEvidence =
    best.strength >= 12;

  let signal =
    "NO TRADE";

  if (
    sufficientSample &&
    strongEnough &&
    directionalEvidence
  ) {
    signal = "TRADE";
  }

  const reason =
    signal === "TRADE"
      ? best.name +
        " has the strongest multi-factor setup"
      : "Evidence is not strong enough for a trade";

  return {
    ready: true,
    signal,
    strategy:
      best.name,
    confidence,
    reason,

    lastDigit:
      digits[
        digits.length - 1
      ],

    evenPercent,
    oddPercent,
    overPercent,
    underPercent,
    matchPercent,
    differPercent,
    risePercent,
    fallPercent,

    mostCommonDigit,
    strongestRecentDigit,
    recentDigitPercent,

    consistencyScore,
    distributionSpread,

    streakType,
    streakLength,

    sampleSize: total,

    counts
  };
}

function analyzeMarket(symbol) {
  return analyzeDigits(symbol);
}

/* =========================
   MARKET DISPLAY
========================= */

function renderMarkets(
  scan = false
) {
  const list =
    $("#marketList");

  if (!list) {
    return;
  }

  list.innerHTML =
    markets
      .map(market => {
        const analysis =
          scan
            ? analyzeMarket(
                market[0]
              )
            : {
                signal: "READY",
                confidence: null,
                reason:
                  "Waiting for live data"
              };

        return `
          <button
            class="market-item ${
              market[0] === selected
                ? "selected"
                : ""
            }"
            data-symbol="${escapeHTML(
              market[0]
            )}"
          >
            <div>
              <b>${escapeHTML(
                market[1]
              )}</b>

              <div class="market-meta">
                ${escapeHTML(
                  market[0]
                )} · ${escapeHTML(
                  analysis.reason
                )}
              </div>
            </div>

            <div class="market-signal">
              <span class="signal ${
                analysis.signal ===
                "TRADE"
                  ? "good"
                  : "wait"
              }">
                ${escapeHTML(
                  analysis.signal
                )}
              </span>

              ${
                analysis.confidence
                  ? `<div>${analysis.confidence}%</div>`
                  : ""
              }
            </div>
          </button>
        `;
      })
      .join("");

  $$(".market-item")
    .forEach(button => {
      button.onclick = () => {
        selected =
          button.dataset.symbol;

        renderMarkets(scan);
        updateSelectedMarketDisplay();
        updateSelectedAnalysis();
        updateDigitTable(
          selected
        );
      };
    });
}

/* =========================
   SELECTED MARKET
========================= */

function updateSelectedMarketDisplay() {
  const market =
    markets.find(
      item =>
        item[0] === selected
    );

  const name =
    $("#selectedMarketName");

  const quote =
    $("#liveQuote");

  if (
    name &&
    market
  ) {
    name.textContent =
      market[1];
  }

  if (quote) {
    const live =
      liveTicks[selected];

    quote.textContent =
      live
        ? formatQuote(
            live.quote
          )
        : "Waiting...";
  }
}

/* =========================
   ENGINE STATUS
========================= */

function updateSelectedAnalysis() {
  const analysis =
    analyzeMarket(selected);

  const status =
    $("#engineStatus");

  if (!status) {
    return;
  }

  if (!analysis.ready) {
    status.innerHTML =
      "<small>LIVE DATA</small>" +
      "<strong>WAIT</strong>" +
      "<b>" +
      escapeHTML(
        analysis.reason
      ) +
      "</b>";

    return;
  }

  status.innerHTML =
    "<small>LIVE DIGIT ANALYSIS</small>" +
    "<strong>" +
    escapeHTML(
      analysis.strategy
    ) +
    "</strong>" +
    "<b>" +
    escapeHTML(
      String(
        analysis.confidence
      )
    ) +
    "% analysis score · Last digit " +
    escapeHTML(
      String(
        analysis.lastDigit
      )
    ) +
    " · Sample " +
    escapeHTML(
      String(
        analysis.sampleSize
      )
    ) +
    "</b>";
}

/* =========================
   DIGIT TABLE
========================= */

function updateDigitTable(
  symbol
) {
  const stats =
    digitStats[symbol];

  if (!stats) {
    return;
  }

  const total =
    stats.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  for (
    let i = 0;
    i <= 9;
    i++
  ) {
    const element =
      document.querySelector(
        `[data-digit="${i}"]`
      );

    if (element) {
      const percent =
        total > 0
          ? (
              (stats[i] /
                total) *
              100
            ).toFixed(1)
          : "0.0";

      element.textContent =
        percent + "%";
    }
  }
}

/* =========================
   LOAD HISTORY
========================= */

function requestHistory(
  symbol,
  index
) {
  if (
    !derivWS ||
    derivWS.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }

  const reqId =
    requestCounter++ + index;

  historyRequests[reqId] =
    symbol;

  derivWS.send(
    JSON.stringify({
      ticks_history:
        symbol,
      end: "latest",
      count:
        MAX_HISTORY,
      style: "ticks",
      subscribe: 0,
      req_id:
        reqId
    })
  );
}

/* =========================
   SUBSCRIBE LIVE TICKS
========================= */

function subscribeTick(
  symbol,
  index
) {
  if (
    !derivWS ||
    derivWS.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }

  derivWS.send(
    JSON.stringify({
      ticks:
        symbol,
      subscribe: 1,
      req_id:
        5000 + index
    })
  );
}

/* =========================
   CONNECT DERIV
========================= */

function connectDeriv() {
  if (
    derivWS &&
    (
      derivWS.readyState ===
        WebSocket.OPEN ||
      derivWS.readyState ===
        WebSocket.CONNECTING
    )
  ) {
    return;
  }

  console.log(
    "KRISHWAVE V2.6: Connecting..."
  );

  connectedMarkets = 0;
  updateConnectionCounters();

  const status =
    $("#engineStatus");

  if (status) {
    status.innerHTML =
      "<small>DERIV CONNECTION</small>" +
      "<strong>CONNECTING</strong>" +
      "<b>Connecting to live market data...</b>";
  }

  derivWS =
    new WebSocket(
      "wss://api.derivws.com/trading/v1/options/ws/public"
    );

  derivWS.onopen = () => {
    console.log(
      "KRISHWAVE V2.6: Connected"
    );

    if (status) {
      status.innerHTML =
        "<small>DERIV CONNECTION</small>" +
        "<strong>CONNECTED</strong>" +
        "<b>Discovering live volatility markets...</b>";
    }

    derivWS.send(
      JSON.stringify({
        active_symbols:
          "brief",
        req_id: 1
      })
    );
  };

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
          "KRISHWAVE: Invalid JSON",
          error
        );

        return;
      }

      /* =====================
         ACTIVE SYMBOLS
      ===================== */

      if (
        data.msg_type ===
        "active_symbols"
      ) {
        const active =
          data.active_symbols ||
          [];

        marketNames = {};
        marketMeta = {};

        active.forEach(
          symbol => {
            const name =
              normalizeName(
                symbol.underlying_symbol_name
              );

            const id =
              symbol.underlying_symbol;

            if (
              name &&
              id
            ) {
              marketNames[
                name
              ] = id;

              marketMeta[
                id
              ] = {
                pip_size:
                  symbol.pip_size,
                name:
                  symbol.underlying_symbol_name
              };
            }
          }
        );

        connectedMarkets = 0;

        markets.forEach(
          (
            market,
            index
          ) => {
            const wantedName =
              normalizeName(
                market[1]
              );

            const realSymbol =
              marketNames[
                wantedName
              ];

            if (!realSymbol) {
              console.warn(
                "KRISHWAVE: Market not found:",
                market[1]
              );

              return;
            }

            /*
             * Replace the temporary symbol
             * with Deriv's actual current symbol.
             */
            market[0] =
              realSymbol;

            resetMarketData(
              realSymbol
            );

            requestHistory(
              realSymbol,
              index
            );

            subscribeTick(
              realSymbol,
              index
            );

            connectedMarkets++;

            console.log(
              "KRISHWAVE:",
              market[1],
              "→",
              realSymbol,
              "pip:",
              marketMeta[
                realSymbol
              ]?.pip_size
            );
          }
        );

        updateConnectionCounters();

        renderMarkets(false);
        updateSelectedMarketDisplay();

        if (status) {
          status.innerHTML =
            "<small>DERIV CONNECTION</small>" +
            "<strong>LIVE</strong>" +
            "<b>" +
            connectedMarkets +
            " markets connected · Waiting for ticks...</b>";
        }

        return;
      }

      /* =====================
         HISTORICAL TICKS
      ===================== */

      if (
        data.msg_type ===
          "history" &&
        data.history
      ) {
        const reqId =
          data.echo_req?.req_id;

        let symbol =
          reqId !== undefined
            ? historyRequests[
                reqId
              ]
            : null;

        /*
         * Fallback to echo_req symbol
         * if available.
         */
        if (!symbol) {
          symbol =
            data.echo_req
              ?.ticks_history;
        }

        if (!symbol) {
          console.warn(
            "KRISHWAVE: History response has no symbol"
          );

          return;
        }

        const prices =
          data.history.prices ||
          [];

        const times =
          data.history.times ||
          [];

        const pipSize =
          data.pip_size ||
          marketMeta[
            symbol
          ]?.pip_size;

        tickHistory[
          symbol
        ] = [];

        digitStats[
          symbol
        ] = [
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0
        ];

        prices.forEach(
          (
            price,
            index
          ) => {
            const item = {
              quote:
                price,
              epoch:
                times[index] ||
                0
            };

            tickHistory[
              symbol
            ].push(item);

            const digit =
              getLastDigit(
                price,
                pipSize
              );

            if (
              Number.isInteger(
                digit
              ) &&
              digit >= 0 &&
              digit <= 9
            ) {
              digitStats[
                symbol
              ][digit]++;
            }
          }
        );

        if (
          tickHistory[
            symbol
          ].length >
          MAX_HISTORY
        ) {
          tickHistory[
            symbol
          ] =
            tickHistory[
              symbol
            ].slice(
              -MAX_HISTORY
            );
        }

        updateDigitTable(
          symbol
        );

        if (
          symbol ===
          selected
        ) {
          updateSelectedMarketDisplay();
          updateSelectedAnalysis();
        }

        renderMarkets(true);

        console.log(
          "KRISHWAVE HISTORY:",
          symbol,
          prices.length,
          "ticks loaded"
        );

        return;
      }

      /* =====================
         LIVE TICK
      ===================== */

      if (
        data.msg_type ===
          "tick" &&
        data.tick
      ) {
        const symbol =
          data.tick.symbol;

        const quote =
          data.tick.quote;

        if (
          !symbol ||
          quote ===
            undefined ||
          quote ===
            null
        ) {
          return;
        }

        ticksReceived++;

        updateTickCounter();

        /*
         * Store the latest quote.
         */
        liveTicks[
          symbol
        ] = {
          quote:
            quote,
          epoch:
            data.tick.epoch
        };

        /*
         * Make sure history exists.
         */
        if (
          !tickHistory[
            symbol
          ]
        ) {
          tickHistory[
            symbol
          ] = [];
        }

        /*
         * Add live tick.
         */
        tickHistory[
          symbol
        ].push({
          quote:
            quote,
          epoch:
            data.tick.epoch
        });

        /*
         * Keep maximum history.
         */
        if (
          tickHistory[
            symbol
          ].length >
          MAX_HISTORY
        ) {
          tickHistory[
            symbol
          ].shift();
        }

        /*
         * Get pip precision.
         */
        const pipSize =
          marketMeta[
            symbol
          ]?.pip_size;

        /*
         * Rebuild digit statistics
         * from the latest 100 ticks.
         */
        const recent =
          tickHistory[
            symbol
          ].slice(-100);

        digitStats[
          symbol
        ] = [
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0
        ];

        recent.forEach(
          tick => {
            const digit =
              getLastDigit(
                tick.quote,
                pipSize
              );

            if (
              Number.isInteger(
                digit
              ) &&
              digit >= 0 &&
              digit <= 9
            ) {
              digitStats[
                symbol
              ][digit]++;
            }
          }
        );

        /*
         * Update digit table immediately.
         */
        updateDigitTable(
          symbol
        );

        /*
         * Update selected market
         * immediately.
         */
        if (
          symbol ===
          selected
        ) {
          updateSelectedMarketDisplay();
          updateSelectedAnalysis();
        }

        /*
         * Refresh market cards
         * every 5 ticks.
         */
        if (
          ticksReceived % 5 ===
          0
        ) {
          renderMarkets(true);
        }

        console.log(
          "KRISHWAVE TICK:",
          symbol,
          quote,
          "digit:",
          getLastDigit(
            quote,
            pipSize
          ),
          "total:",
          ticksReceived
        );

        return;
      }

      /* =====================
         API ERROR
      ===================== */

      if (data.error) {
        console.error(
          "KRISHWAVE DERIV ERROR:",
          data.error
        );

        if (status) {
          status.innerHTML =
            "<small>DERIV API</small>" +
            "<strong>ERROR</strong>" +
            "<b>" +
            escapeHTML(
              data.error.message ||
                "API error"
            ) +
            "</b>";
        }
      }
    };

  /* =====================
     WEBSOCKET ERROR
  ===================== */

  derivWS.onerror =
    error => {
      console.error(
        "KRISHWAVE WebSocket error:",
        error
      );

      const status =
        $("#engineStatus");

      if (status) {
        status.innerHTML =
          "<small>DERIV CONNECTION</small>" +
          "<strong>ERROR</strong>" +
          "<b>Unable to connect to live data</b>";
      }
    };

  /* =====================
     WEBSOCKET CLOSE
  ===================== */

  derivWS.onclose =
    () => {
      console.warn(
        "KRISHWAVE: Connection closed"
      );

      const status =
        $("#engineStatus");

      if (status) {
        status.innerHTML =
          "<small>DERIV CONNECTION</small>" +
          "<strong>OFFLINE</strong>" +
          "<b>Reconnecting...</b>";
      }

      if (
        reconnectTimer
      ) {
        clearTimeout(
          reconnectTimer
        );
      }

      reconnectTimer =
        setTimeout(
          () => {
            connectDeriv();
          },
          5000
        );
    };
}

/* =========================
   SCAN ALL
========================= */

const scanButton =
  $("#scanAll");

if (scanButton) {
  scanButton.onclick =
    () => {
      renderMarkets(true);
      updateSelectedAnalysis();
    };
}

/* =========================
   MODE BUTTONS
========================= */

$$(".mode button")
  .forEach(button => {
    button.onclick =
      () => {
        $$(".mode button")
          .forEach(item =>
            item.classList.remove(
              "active"
            )
          );

        button.classList.add(
          "active"
        );
      };
  });

/* =========================
   START / STOP BOT
========================= */

function startBot() {
  const button =
    $("#start");

  if (!button) {
    return;
  }

  const running =
    button.dataset.running ===
    "1";

  if (!running) {
    button.dataset.running =
      "1";

    button.textContent =
      "Stop Trading Bot";

    const status =
      $("#engineStatus");

    if (status) {
      status.innerHTML =
        "<small>ANALYSIS BOT</small>" +
        "<strong>RUNNING</strong>" +
        "<b>Monitoring live market data</b>";
    }
  } else {
    button.dataset.running =
      "0";

    button.textContent =
      "Start Trading Bot";

    updateSelectedAnalysis();
  }
}

const startButton =
  $("#start");

if (startButton) {
  startButton.onclick =
    startBot;
}

/* =========================
   ACCOUNT TYPE
========================= */

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

/* =========================
   INITIAL DISPLAY
========================= */

renderMarkets(false);
updateSelectedMarketDisplay();
updateSelectedAnalysis();
updateTickCounter();
updateConnectionCounters();

connectDeriv();
