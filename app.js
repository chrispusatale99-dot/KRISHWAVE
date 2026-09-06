/* =========================================================
KRISHWAVE V4
LIVE DERIV MARKET INTELLIGENCE ENGINE

V4 FEATURES

- Deriv public live market data
- 13 Volatility Index markets
- Market scanner
- Digit analysis
- Even / Odd
- High / Low
- Over / Under
- Match / Differ
- Rise / Fall
- AUTO strategy
- 10 second AI analysis
- 7 second entry countdown
- TRADE NOW signal
- Stake management
- Minimum stake: 0.25
- Take Profit
- Stop Loss
- Martingale multiplier
- Maximum Martingale steps
- Maximum stake protection
- Session P/L
- Reset Martingale
- Demo / Real account mode
- Explicit REAL trade confirmation
- Safe event interface for authenticated
  Deriv trading connection
- Dark / Light mode
- Horizontal digit distribution

IMPORTANT

Public market-data WebSocket is used for analysis.

No private API token/password is stored in this file.

Real authenticated order execution must use a secure
Deriv authentication flow.
========================================================= */

/* =========================================================
CONFIGURATION
========================================================= */

const CONFIG = {

WS_URL:
"wss://api.derivws.com/trading/v1/options/ws/public",

MAX_HISTORY:
200,

RECENT_WINDOW:
80,

MIN_SAMPLE:
30,

RECONNECT_DELAY:
3000,

WATCHDOG_MS:
15000,

ANALYSIS_SECONDS:
10,

COUNTDOWN_SECONDS:
7,

MAX_MARKETS:
13,

STRONG_EDGE:
6,

MAX_CONFIDENCE:
92,

/* -------------------------
TRADE MANAGEMENT
------------------------- */

MIN_STAKE:
0.25,

DEFAULT_STAKE:
0.25,

DEFAULT_TAKE_PROFIT:
5,

DEFAULT_STOP_LOSS:
-3,

DEFAULT_MARTINGALE_MULTIPLIER:
2,

DEFAULT_MAX_MARTINGALE_STEPS:
3,

DEFAULT_MAX_STAKE:
10,

REAL_CONFIRMATION_REQUIRED:
true

};

/* =========================================================
MARKETS
========================================================= */

const MARKETS = [

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
APPLICATION STATE
========================================================= */

const state = {

ws:
null,

connected:
false,

selectedSymbol:
"R_10",

selectedStrategy:
"AUTO",

targetDigit:
null,

markets:
{},

requestId:
1,

pendingHistory:
new Set(),

subscriptions:
new Set(),

liveTicks:
0,

lastTickTime:
0,

reconnectTimer:
null,

watchdogTimer:
null,

aiTimer:
null,

aiPhase:
"READY",

aiSeconds:
CONFIG.ANALYSIS_SECONDS,

running:
false,

tradeCount:
0,

lastAction:
"READY",

scanResults:
[],

theme:
"dark",

/* -------------------------
ACCOUNT
------------------------- */

accountMode:
"demo",

accountConnected:
false,

accountId:
null,

accountBalance:
null,

accountCurrency:
null,

/* -------------------------
TRADE ENGINE
------------------------- */

trade:

{

  stake:
    CONFIG.DEFAULT_STAKE,

  currentStake:
    CONFIG.DEFAULT_STAKE,

  takeProfit:
    CONFIG.DEFAULT_TAKE_PROFIT,

  stopLoss:
    CONFIG.DEFAULT_STOP_LOSS,

  martingaleMultiplier:
    CONFIG.DEFAULT_MARTINGALE_MULTIPLIER,

  maxMartingaleSteps:
    CONFIG.DEFAULT_MAX_MARTINGALE_STEPS,

  maxStake:
    CONFIG.DEFAULT_MAX_STAKE,

  martingaleStep:
    0,

  sessionPL:
    0,

  sessionTrades:
    0,

  sessionWins:
    0,

  sessionLosses:
    0,

  tradingStopped:
    false,

  lastResult:
    null,

  pendingTrade:
    false

}

};

/* =========================================================
DOM HELPERS
========================================================= */

function $(selector) {

return document.querySelector(
selector
);

}

function setText(
selector,
value
) {

const element =
$(selector);

if (element) {

element.textContent =
  value;

}

}

function setHTML(
selector,
value
) {

const element =
$(selector);

if (element) {

element.innerHTML =
  value;

}

}

function clamp(
value,
min,
max
) {

return Math.max(
min,
Math.min(
max,
value
)
);

}

function round(
value,
decimals = 1
) {

const factor =
Math.pow(
10,
decimals
);

return Math.round(
value * factor
) / factor;

}

function money(
value
) {

const number =
Number(value);

if (
!Number.isFinite(
number
)
) {

return "0.00";

}

return number.toFixed(
2
);

}

/* =========================================================
THEME ENGINE
========================================================= */

function applyTheme(
theme
) {

const body =
document.body;

if (!body) return;

const isLight =
theme === "light";

body.classList.toggle(
"light-mode",
isLight
);

state.theme =
isLight
? "light"
: "dark";

try {

localStorage.setItem(
  "krishwave-theme",
  state.theme
);

} catch (_) {}

updateThemeButton();

}

function getSavedTheme() {

try {

const saved =
  localStorage.getItem(
    "krishwave-theme"
  );

if (
  saved === "light" ||
  saved === "dark"
) {

  return saved;

}

} catch (_) {}

return "dark";

}

function updateThemeButton() {

const button =
$("#themeToggle");

if (!button) return;

const isLight =
state.theme ===
"light";

button.textContent =
isLight
? "☀️ Light"
: "🌙 Dark";

button.setAttribute(
"aria-label",
isLight
? "Switch to dark mode"
: "Switch to light mode"
);

button.setAttribute(
"aria-pressed",
isLight
? "true"
: "false"
);

button.style.marginLeft =
"auto";

button.style.flexShrink =
"0";

button.style.display =
"inline-flex";

button.style.alignItems =
"center";

button.style.justifyContent =
"center";

button.style.position =
"relative";

button.style.zIndex =
"50";

button.style.cursor =
"pointer";

}

function setupThemeToggle() {

const button =
$("#themeToggle");

if (!button) return;

if (
button.dataset.themeReady ===
"true"
) {

updateThemeButton();

return;

}

button.dataset.themeReady =
"true";

applyTheme(
getSavedTheme()
);

button.addEventListener(
"click",
event => {

  event.preventDefault();

  event.stopPropagation();

  const nextTheme =
    state.theme ===
    "light"
      ? "dark"
      : "light";

  applyTheme(
    nextTheme
  );

}

);

}

/* =========================================================
HEADER
========================================================= */

function setupHeaderLayout() {

const header =
document.querySelector(
".topbar"
);

if (!header) return;

header.style.display =
"flex";

header.style.alignItems =
"center";

header.style.width =
"100%";

const button =
$("#themeToggle");

if (button) {

button.style.marginLeft =
  "auto";

}

}

/* =========================================================
HORIZONTAL DIGITS
========================================================= */

function setupDigitDistributionLayout() {

const grid =
document.querySelector(
".digit-grid"
);

if (!grid) return;

grid.style.display =
"grid";

grid.style.gridTemplateColumns =
"repeat(10, minmax(45px, 1fr))";

grid.style.gap =
"8px";

grid.style.width =
"100%";

grid.style.overflowX =
"auto";

grid.style.overflowY =
"hidden";

grid.style.paddingBottom =
"8px";

grid.style.alignItems =
"stretch";

Array.from(
grid.children
).forEach(
item => {

  item.style.minWidth =
    "45px";

  item.style.width =
    "auto";

  item.style.flexShrink =
    "0";

}

);

}

/* =========================================================
MARKET HELPERS
========================================================= */

function getMarket(
symbol
) {

if (
!state.markets[
symbol
]
) {

const definition =
  MARKETS.find(
    item =>
      item.symbol ===
      symbol
  ) || {

    symbol,

    name:
      symbol

  };

state.markets[
  symbol
] = {

  ...definition,

  history:
    [],

  lastQuote:
    null,

  lastDigit:
    null,

  pipSize:
    2,

  lastTickTime:
    0,

  sample:
    0,

  digitRates:
    [],

  evenOdd:
    null,

  highLow:
    null,

  overUnder:
    null,

  matchDiffer:
    null,

  momentum:
    null,

  streak:
    null,

  auto:
    null

};

}

return state.markets[
symbol
];

}

function getMarketHistory(
symbol
) {

return getMarket(
symbol
).history || [];

}

/* =========================================================
DERIV CONNECTION
========================================================= */

function connectWebSocket() {

clearTimeout(
state.reconnectTimer
);

updateConnectionUI(
"CONNECTING"
);

try {

state.ws =
  new WebSocket(
    CONFIG.WS_URL
  );

} catch (error) {

console.error(
  error
);

scheduleReconnect();

return;

}

state.ws.addEventListener(
"open",
() => {

  state.connected =
    true;

  updateConnectionUI(
    "CONNECTED"
  );

  state.subscriptions.clear();

  requestActiveSymbols();

  clearInterval(
    state.watchdogTimer
  );

  state.watchdogTimer =
    setInterval(
      () => {

        const age =
          Date.now() -
          state.lastTickTime;

        if (
          state.lastTickTime &&
          age >
            CONFIG.WATCHDOG_MS
        ) {

          updateConnectionUI(
            "RECONNECTING"
          );

          reconnectWebSocket();

        }

      },
      5000
    );

}

);

state.ws.addEventListener(
"message",
event => {

  handleMessage(
    event.data
  );

}

);

state.ws.addEventListener(
"error",
error => {

  console.error(
    "WebSocket error:",
    error
  );

  updateConnectionUI(
    "ERROR"
  );

}

);

state.ws.addEventListener(
"close",
() => {

  state.connected =
    false;

  state.subscriptions.clear();

  updateConnectionUI(
    "DISCONNECTED"
  );

  scheduleReconnect();

}

);

}

function reconnectWebSocket() {

try {

if (state.ws) {

  state.ws.close();

}

} catch (_) {}

state.connected =
false;

state.subscriptions.clear();

scheduleReconnect();

}

function scheduleReconnect() {

clearTimeout(
state.reconnectTimer
);

state.reconnectTimer =
setTimeout(
() => {

    connectWebSocket();

  },
  CONFIG.RECONNECT_DELAY
);

}

function send(
payload
) {

if (
!state.ws ||
state.ws.readyState !==
WebSocket.OPEN
) {

return false;

}

try {

state.ws.send(
  JSON.stringify(
    payload
  )
);

return true;

} catch (error) {

console.error(
  error
);

return false;

}

}

function nextRequestId() {

return state.requestId++;

}

/* =========================================================
ACTIVE SYMBOLS
========================================================= */

function requestActiveSymbols() {

const id =
nextRequestId();

send({

active_symbols:
  "brief",

req_id:
  id

});

}

/* =========================================================
MESSAGE ROUTER
========================================================= */

function handleMessage(
raw
) {

let data;

try {

data =
  JSON.parse(
    raw
  );

} catch (_) {

return;

}

if (data.error) {

console.warn(
  "Deriv error:",
  data.error
);

return;

}

if (
Array.isArray(
data.errors
) &&
data.errors.length
) {

console.warn(
  "Deriv errors:",
  data.errors
);

return;

}

if (
data.active_symbols
) {

handleActiveSymbols(
  data.active_symbols
);

}

if (
data.history
) {

handleHistory(
  data
);

}

if (
data.tick
) {

handleTick(
  data.tick
);

}

/*

* Future authenticated
* trading messages can be
* handled here without
* exposing credentials.
  */

if (
data.proposal
) {

handleProposalResponse(
  data
);

}

if (
data.buy
) {

handleBuyResponse(
  data
);

}

if (
data.profit_table
) {

handleProfitTable(
  data
);

}

}

/* =========================================================
ACTIVE SYMBOL PARSING
========================================================= */

function handleActiveSymbols(
symbols
) {

const available =
new Set();

symbols.forEach(
item => {

  const symbol =
    item.underlying_symbol ||
    item.symbol;

  if (!symbol) return;

  available.add(
    symbol
  );

  const market =
    getMarket(
      symbol
    );

  market.name =
    item.underlying_symbol_name ||
    item.display_name ||
    market.name;

  market.pipSize =
    Number.isFinite(
      Number(
        item.pip_size
      )
    )
      ? Number(
          item.pip_size
        )
      : Number.isFinite(
          Number(
            item.pip
          )
        )
        ? Number(
            item.pip
          )
        : market.pipSize;

}

);

const requested =
MARKETS.filter(
item =>
available.has(
item.symbol
)
);

const list =
requested.length
? requested
: MARKETS;

list
.slice(
0,
CONFIG.MAX_MARKETS
)
.forEach(
item => {

    const market =
      getMarket(
        item.symbol
      );

    if (
      !market.history.length
    ) {

      requestHistory(
        item.symbol
      );

    }

    if (
      !state.subscriptions.has(
        item.symbol
      )
    ) {

      subscribeTicks(
        item.symbol
      );

    }

  }
);

renderMarketScanner();

}

/* =========================================================
HISTORY
========================================================= */

function requestHistory(
symbol
) {

if (
state.pendingHistory.has(
symbol
)
) {

return;

}

state.pendingHistory.add(
symbol
);

const id =
nextRequestId();

const sent =
send({

  ticks_history:
    symbol,

  count:
    CONFIG.MAX_HISTORY,

  end:
    "latest",

  style:
    "ticks",

  req_id:
    id

});

if (!sent) {

state.pendingHistory.delete(
  symbol
);

}

}

function handleHistory(
data
) {

const symbol =
data.echo_req?.ticks_history;

if (!symbol) return;

const market =
getMarket(
symbol
);

const prices =
data.history?.prices ||
[];

const times =
data.history?.times ||
[];

const history =
[];

prices.forEach(
(price, index) => {

  const numeric =
    Number(
      price
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {

    return;

  }


  history.push({

    quote:
      numeric,

    time:
      times[index]
        ? Number(
            times[index]
          ) * 1000
        : Date.now()

  });

}

);

market.history =
history.slice(
-CONFIG.MAX_HISTORY
);

state.pendingHistory.delete(
symbol
);

updateMarketDerivedData(
symbol
);

if (
symbol ===
state.selectedSymbol
) {

renderSelectedMarket();

renderDigitDistribution();

renderProbabilities();

renderAI();

}

renderMarketScanner();

}

/* =========================================================
LIVE TICKS
========================================================= */

function subscribeTicks(
symbol
) {

const id =
nextRequestId();

const sent =
send({

  ticks:
    symbol,

  subscribe:
    1,

  req_id:
    id

});

if (sent) {

state.subscriptions.add(
  symbol
);

}

}

function handleTick(
tick
) {

const symbol =
tick.symbol ||
tick.echo_req?.ticks;

if (!symbol) return;

const quote =
Number(
tick.quote
);

if (
!Number.isFinite(
quote
)
) {

return;

}

const market =
getMarket(
symbol
);

market.lastQuote =
quote;

market.lastTickTime =
Date.now();

market.history.push({

quote,

time:
  tick.epoch
    ? Number(
        tick.epoch
      ) * 1000
    : Date.now()

});

if (
market.history.length >
CONFIG.MAX_HISTORY
) {

market.history.shift();

}

market.lastDigit =
extractLastDigit(
quote,
market.pipSize
);

state.liveTicks++;

state.lastTickTime =
Date.now();

updateMarketDerivedData(
symbol
);

if (
symbol ===
state.selectedSymbol
) {

renderSelectedMarket();

renderDigitDistribution();

renderProbabilities();

renderAI();

}

renderMarketScanner();

}

/* =========================================================
DIGIT ENGINE
========================================================= */

function extractLastDigit(
quote,
pipSize = 2
) {

const decimals =
clamp(
Math.round(
Number(
pipSize
)
),
0,
8
);

const factor =
Math.pow(
10,
decimals
);

const scaled =
Math.round(
Math.abs(
Number(
quote
)
) *
factor
);

return scaled % 10;

}

function getDigits(
symbol
) {

const market =
getMarket(
symbol
);

return market.history

.slice(
  -CONFIG.RECENT_WINDOW
)

.map(
  item =>
    extractLastDigit(
      item.quote,
      market.pipSize
    )
)

.filter(
  digit =>
    Number.isInteger(
      digit
    ) &&
    digit >= 0 &&
    digit <= 9
);

}

function getDigitCounts(
symbol
) {

const counts =
Array(10).fill(0);

const digits =
getDigits(
symbol
);

digits.forEach(
digit => {

  counts[digit]++;

}

);

return counts;

}

function getDigitRates(
symbol
) {

const counts =
getDigitCounts(
symbol
);

const total =
counts.reduce(
(a, b) =>
a + b,
0
);

if (!total) {

return Array(
  10
).fill(0);

}

return counts.map(
count =>
(
count /
total
) * 100
);

}

function getRecentDigitPressure(
symbol,
digit
) {

const digits =
getDigits(
symbol
);

if (!digits.length) {

return 0;

}

const recent =
digits.slice(
-30
);

const hits =
recent.filter(
item =>
item === digit
).length;

return (
hits /
recent.length
) * 100;

}

/* =========================================================
EVEN / ODD
========================================================= */

function analyzeEvenOdd(
symbol
) {

const digits =
getDigits(
symbol
);

if (!digits.length) {

return {

  even:
    50,

  odd:
    50

};

}

const even =
digits.filter(
d =>
d % 2 === 0
).length /
digits.length *
100;

return {

even,

odd:
  100 - even

};

}

/* =========================================================
HIGH / LOW
========================================================= */

function analyzeHighLow(
symbol
) {

const digits =
getDigits(
symbol
);

if (!digits.length) {

return {

  high:
    50,

  low:
    50

};

}

const high =
digits.filter(
d =>
d >= 5
).length /
digits.length *
100;

return {

high,

low:
  100 - high

};

}

/* =========================================================
OVER / UNDER
========================================================= */

function analyzeOverUnder(
symbol
) {

const digits =
getDigits(
symbol
);

if (!digits.length) {

return {

  over: {

    threshold:
      5,

    probability:
      50

  },

  under: {

    threshold:
      5,

    probability:
      50

  }

};

}

let bestOver =
null;

let bestUnder =
null;

for (
let threshold = 1;
threshold <= 8;
threshold++
) {

const over =
  digits.filter(
    d =>
      d >
      threshold
  ).length /
  digits.length *
  100;


const under =
  digits.filter(
    d =>
      d <
      threshold
  ).length /
  digits.length *
  100;


const overScore =
  Math.abs(
    over -
    50
  ) -
  Math.abs(
    threshold -
    5
  ) * 1.5;


const underScore =
  Math.abs(
    under -
    50
  ) -
  Math.abs(
    threshold -
    5
  ) * 1.5;


if (
  !bestOver ||
  overScore >
    bestOver.score
) {

  bestOver = {

    threshold,

    probability:
      over,

    score:
      overScore

  };

}


if (
  !bestUnder ||
  underScore >
    bestUnder.score
) {

  bestUnder = {

    threshold,

    probability:
      under,

    score:
      underScore

  };

}

}

return {

over:
  bestOver,

under:
  bestUnder

};

}

/* =========================================================
MATCH / DIFFER
========================================================= */

function analyzeMatchDiffer(
symbol
) {

const rates =
getDigitRates(
symbol
);

let targetDigit =
0;

rates.forEach(
(
rate,
digit
) => {

  if (
    rate >
    rates[targetDigit]
  ) {

    targetDigit =
      digit;

  }

}

);

const match =
rates[
targetDigit
] || 0;

return {

targetDigit,

match,

differ:
  100 - match

};

}

/* =========================================================
MOMENTUM
========================================================= */

function analyzeMomentum(
symbol
) {

const market =
getMarket(
symbol
);

const history =
market.history.slice(
-CONFIG.RECENT_WINDOW
);

if (
history.length <
10
) {

return {

  rise:
    50,

  fall:
    50

};

}

let rises =
0;

let falls =
0;

for (
let i = 1;
i < history.length;
i++
) {

if (
  history[i].quote >
  history[i - 1].quote
) {

  rises++;

} else if (
  history[i].quote <
  history[i - 1].quote
) {

  falls++;

}

}

const total =
rises +
falls;

if (!total) {

return {

  rise:
    50,

  fall:
    50

};

}

const rise =
(
rises /
total
) * 100;

return {

rise,

fall:
  100 - rise

};

}

/* =========================================================
STREAK
========================================================= */

function calculateStreak(
symbol
) {

const digits =
getDigits(
symbol
);

if (!digits.length) {

return null;

}

const last =
digits[
digits.length - 1
];

let streak =
0;

for (
let i =
digits.length - 1;
i >= 0;
i--
) {

if (
  digits[i] ===
  last
) {

  streak++;

} else {

  break;

}

}

return {

digit:
  last,

count:
  streak

};

}

/* =========================================================
SIGNAL QUALITY
========================================================= */

function getSignalQuality(
edge,
sample
) {

if (
sample <
CONFIG.MIN_SAMPLE
) {

return "WAIT";

}

if (
edge >=
CONFIG.STRONG_EDGE +
4
) {

return "STRONG";

}

if (
edge >=
CONFIG.STRONG_EDGE
) {

return "WATCH";

}

return "WEAK";

}

function confidenceFromProbability(
probability,
sample,
extraPressure = 0
) {

const edge =
Math.abs(
probability -
50
);

const sampleFactor =
clamp(
sample /
CONFIG.RECENT_WINDOW,
0,
1
);

const pressureFactor =
clamp(
Math.abs(
extraPressure
) /
20,
0,
1
);

let confidence =
50 +
edge * 0.8 +
sampleFactor * 8 +
pressureFactor * 4;

confidence =
clamp(
confidence,
50,
CONFIG.MAX_CONFIDENCE
);

return round(
confidence
);

}

/* =========================================================
STRATEGY ANALYSIS
========================================================= */

function analyzeStrategy(
symbol,
strategy =
state.selectedStrategy
) {

const digits =
getDigits(
symbol
);

const sample =
digits.length;

if (
sample <
CONFIG.MIN_SAMPLE
) {

return {

  strategy,

  label:
    "WAIT",

  target:
    null,

  confidence:
    0,

  probability:
    50,

  edge:
    0,

  quality:
    "WAIT",

  sample,

  reason:
    `Need at least ${CONFIG.MIN_SAMPLE} recent ticks.`

};

}

const evenOdd =
analyzeEvenOdd(
symbol
);

const highLow =
analyzeHighLow(
symbol
);

const overUnder =
analyzeOverUnder(
symbol
);

const matchDiffer =
analyzeMatchDiffer(
symbol
);

const momentum =
analyzeMomentum(
symbol
);

let selected;

switch (
strategy
) {

case "EVEN":

  selected = {

    label:
      "EVEN",

    target:
      null,

    probability:
      evenOdd.even,

    reason:
      "Recent digit distribution favors EVEN."

  };

  break;


case "ODD":

  selected = {

    label:
      "ODD",

    target:
      null,

    probability:
      evenOdd.odd,

    reason:
      "Recent digit distribution favors ODD."

  };

  break;


case "HIGH":

  selected = {

    label:
      "HIGH",

    target:
      null,

    probability:
      highLow.high,

    reason:
      "Digits 5–9 currently have the stronger share."

  };

  break;


case "LOW":

  selected = {

    label:
      "LOW",

    target:
      null,

    probability:
      highLow.low,

    reason:
      "Digits 0–4 currently have the stronger share."

  };

  break;


case "OVER":

  selected = {

    label:
      "OVER",

    target:
      overUnder.over.threshold,

    probability:
      overUnder.over.probability,

    reason:
      `AI selected OVER ${overUnder.over.threshold} from the recent digit distribution.`

  };

  break;


case "UNDER":

  selected = {

    label:
      "UNDER",

    target:
      overUnder.under.threshold,

    probability:
      overUnder.under.probability,

    reason:
      `AI selected UNDER ${overUnder.under.threshold} from the recent digit distribution.`

  };

  break;


case "MATCH":

  selected = {

    label:
      "MATCH",

    target:
      matchDiffer.targetDigit,

    probability:
      matchDiffer.match,

    reason:
      `Digit ${matchDiffer.targetDigit} has the highest observed recent frequency.`

  };

  break;


case "DIFFER":

  selected = {

    label:
      "DIFFER",

    target:
      matchDiffer.targetDigit,

    probability:
      matchDiffer.differ,

    reason:
      `AI targets DIFFER from digit ${matchDiffer.targetDigit}.`

  };

  break;


case "RISE":

  selected = {

    label:
      "RISE",

    target:
      null,

    probability:
      momentum.rise,

    reason:
      "Recent quote movement is being evaluated for upward momentum."

  };

  break;


case "FALL":

  selected = {

    label:
      "FALL",

    target:
      null,

    probability:
      momentum.fall,

    reason:
      "Recent quote movement is being evaluated for downward momentum."

  };

  break;


default:

  return analyzeAuto(
    symbol
  );

}

const edge =
Math.abs(
selected.probability -
50
);

const pressure =
selected.target !==
null

  ? getRecentDigitPressure(
      symbol,
      selected.target
    ) -
    10

  : 0;

const confidence =
confidenceFromProbability(
selected.probability,
sample,
pressure
);

const quality =
getSignalQuality(
edge,
sample
);

return {

strategy:
  selected.label,

label:
  selected.label,

target:
  selected.target,

probability:
  selected.probability,

confidence,

edge,

quality,

sample,

reason:
  selected.reason

};

}

/* =========================================================
AUTO
========================================================= */

function analyzeAuto(
symbol
) {

const strategies = [

"EVEN",
"ODD",
"HIGH",
"LOW",
"OVER",
"UNDER",
"MATCH",
"DIFFER",
"RISE",
"FALL"

];

const results =
strategies

  .map(
    strategy =>
      analyzeStrategy(
        symbol,
        strategy
      )
  )

  .filter(
    result =>
      result.sample >=
      CONFIG.MIN_SAMPLE
  );

if (!results.length) {

return {

  strategy:
    "AUTO",

  label:
    "WAIT",

  target:
    null,

  probability:
    50,

  confidence:
    0,

  edge:
    0,

  quality:
    "WAIT",

  sample:
    getDigits(
      symbol
    ).length,

  reason:
    `Waiting for at least ${CONFIG.MIN_SAMPLE} recent ticks.`

};

}

results.sort(
(a, b) => {

  const scoreA =
    a.edge +
    a.confidence *
    0.12;


  const scoreB =
    b.edge +
    b.confidence *
    0.12;


  return scoreB -
    scoreA;

}

);

const best =
results[0];

return {

...best,

strategy:
  best.label,

reason:
  `AUTO selected ${best.label}` +
  (
    best.target !==
    null
      ? ` ${best.target}`
      : ""
  ) +
  ` as the strongest current statistical setup.`

};

}

/* =========================================================
DERIVED MARKET DATA
========================================================= */

function updateMarketDerivedData(
symbol
) {

const market =
getMarket(
symbol
);

const digits =
getDigits(
symbol
);

market.sample =
digits.length;

market.lastDigit =
digits.length
? digits[
digits.length - 1
]
: null;

market.digitRates =
getDigitRates(
symbol
);

market.evenOdd =
analyzeEvenOdd(
symbol
);

market.highLow =
analyzeHighLow(
symbol
);

market.overUnder =
analyzeOverUnder(
symbol
);

market.matchDiffer =
analyzeMatchDiffer(
symbol
);

market.momentum =
analyzeMomentum(
symbol
);

market.streak =
calculateStreak(
symbol
);

market.auto =
analyzeAuto(
symbol
);

}

/* =========================================================
SELECTED MARKET RENDER
========================================================= */

function renderSelectedMarket() {

const market =
getMarket(
state.selectedSymbol
);

/*

* Support both old and new
* possible HTML IDs.
  */

setText(
"#selectedSymbol",
market.symbol
);

setText(
"#selectedMarketName",
market.name ||
"Volatility Market"
);

setText(
"#selectedQuote",
market.lastQuote !==
null
? market.lastQuote
: "—"
);

setText(
"#selectedDigit",
market.lastDigit !==
null
? market.lastDigit
: "—"
);

setText(
"#selectedSample",
market.sample ||
0
);

const result =
state.selectedStrategy ===
"AUTO"

  ? analyzeAuto(
      state.selectedSymbol
    )

  : analyzeStrategy(
      state.selectedSymbol,
      state.selectedStrategy
    );

setText(
"#selectedEdge",
result.edge
? "${round(result.edge)}%"
: "—"
);

setText(
"#selectedQuality",
result.quality ||
"WAIT"
);

/*

* Legacy IDs.
  */

setText(
"#selectedMarket",
market.name ||
"Volatility Market"
);

setText(
"#marketCode",
market.symbol
);

setText(
"#quote",
market.lastQuote !==
null
? market.lastQuote
: "—"
);

setText(
"#lastDigit",
market.lastDigit !==
null
? market.lastDigit
: "—"
);

setText(
"#sample",
market.sample ||
0
);

const streak =
market.streak;

setText(
"#streak",
streak
? "${streak.count} × ${streak.digit}"
: "—"
);

setText(
"#liveTicks",
state.liveTicks
);

/*

* Live stream IDs.
  */

setText(
"#liveSymbol",
market.symbol
);

setText(
"#streamQuote",
market.lastQuote !==
null
? market.lastQuote
: "—"
);

setText(
"#streamDigit",
market.lastDigit !==
null
? market.lastDigit
: "—"
);

}

/* =========================================================
DIGIT DISTRIBUTION
========================================================= */

function renderDigitDistribution() {

setupDigitDistributionLayout();

const rates =
getDigitRates(
state.selectedSymbol
);

rates.forEach(
(
rate,
digit
) => {

  setText(
    `#digit${digit}`,
    `${round(rate)}%`
  );


  const item =
    document.querySelector(
      `#digit${digit}`
    );


  if (!item) return;


  const parent =
    item.closest(
      ".digit-item"
    );


  const bar =
    parent?.querySelector(
      ".digit-bar span"
    );


  if (bar) {

    bar.style.width =
      `${clamp(
        rate,
        0,
        100
      )}%`;

  }

}

);

}

/* =========================================================
PROBABILITIES
========================================================= */

function renderProbabilities() {

const symbol =
state.selectedSymbol;

const evenOdd =
analyzeEvenOdd(
symbol
);

const highLow =
analyzeHighLow(
symbol
);

const overUnder =
analyzeOverUnder(
symbol
);

const matchDiffer =
analyzeMatchDiffer(
symbol
);

const momentum =
analyzeMomentum(
symbol
);

setText(
"#evenPercent",
"${round( evenOdd.even )}%"
);

setText(
"#oddPercent",
"${round( evenOdd.odd )}%"
);

setText(
"#highPercent",
"${round( highLow.high )}%"
);

setText(
"#lowPercent",
"${round( highLow.low )}%"
);

setText(
"#overPercent",
"${round( overUnder.over.probability )}%"
);

setText(
"#underPercent",
"${round( overUnder.under.probability )}%"
);

setText(
"#matchPercent",
"${round( matchDiffer.match )}%"
);

setText(
"#differPercent",
"${round( matchDiffer.differ )}%"
);

setText(
"#risePercent",
"${round( momentum.rise )}%"
);

setText(
"#fallPercent",
"${round( momentum.fall )}%"
);

}

/* =========================================================
AI RENDER
========================================================= */

function renderAI() {

const symbol =
state.selectedSymbol;

const result =
state.selectedStrategy ===
"AUTO"

  ? analyzeAuto(
      symbol
    )

  : analyzeStrategy(
      symbol,
      state.selectedStrategy
    );

const market =
getMarket(
symbol
);

const targetText =
result.target !==
null
? " • ${result.target}"
: "";

const prediction =
result.label ===
"WAIT"

  ? "WAITING"

  : `${result.label}${targetText}`;

setText(
"#aiPrediction",
prediction
);

setText(
"#strategyDisplay",
result.label
);

setText(
"#aiConfidence",
result.confidence
? "${result.confidence}%"
: "—"
);

setText(
"#aiTarget",
result.target !==
null
? result.target
: "—"
);

setText(
"#aiSample",
result.sample ||
0
);

setText(
"#aiEdge",
result.edge
? "${round( result.edge )}%"
: "—"
);

setText(
"#dominantDigit",
market.lastDigit !==
null
? market.lastDigit
: "—"
);

const dominantRate =
market.lastDigit !==
null

  ? market.digitRates?.[
      market.lastDigit
    ] || 0

  : 0;

setText(
"#digitRate",
market.lastDigit !==
null
? "${round( dominantRate )}%"
: "—"
);

setText(
"#aiReason",
result.reason
);

setText(
"#aiPredictionResult",
prediction
);

setText(
"#aiResultStatus",
result.quality
);

setText(
"#aiResultMain",
prediction
);

setText(
"#aiResultConfidence",
result.confidence
? "${result.confidence}%"
: "—"
);

setText(
"#reasonMarket",
market.name ||
symbol
);

setText(
"#reasonStrategy",
result.label
);

setText(
"#reasonLastDigit",
market.lastDigit !==
null
? market.lastDigit
: "—"
);

setText(
"#reasonDigitPressure",
market.lastDigit !==
null
? "${round( dominantRate )}%"
: "—"
);

setText(
"#reasonSignalStrength",
result.quality
);

setText(
"#reasonSample",
market.sample ||
0
);

renderCircle(
result
);

}

/* =========================================================
AI CIRCLE
========================================================= */

function renderCircle(
result
) {

setText(
"#aiCountdown",
state.aiSeconds
);

setText(
"#aiCircleStatus",
state.aiPhase
);

const target =
result?.target !==
null &&
result?.target !==
undefined

  ? ` ${result.target}`

  : "";

setText(
"#aiPredictionResult",
result
? "${result.label}${target}"
: "WAITING"
);

setText(
"#aiResultStatus",
result?.quality ||
"WAIT"
);

setText(
"#aiResultMain",
result
? "${result.label}${target}"
: "WAITING"
);

setText(
"#aiResultConfidence",
result?.confidence
? "${result.confidence}% CONFIDENCE"
: "—"
);

}

/* =========================================================
MARKET SCANNER
========================================================= */

function getScannerResults() {

const availableMarkets =
Object.values(
state.markets
);

return availableMarkets

.filter(
  market =>
    market.history &&
    market.history.length
)

.map(
  market => {

    updateMarketDerivedData(
      market.symbol
    );


    const result =
      market.auto ||
      analyzeAuto(
        market.symbol
      );


    return {

      symbol:
        market.symbol,

      name:
        market.name,

      lastDigit:
        market.lastDigit,

      sample:
        market.sample ||
        0,

      result

    };

  }
)

.sort(
  (
    a,
    b
  ) => {

    const scoreA =
      a.result.edge +
      a.result.confidence *
      0.1;


    const scoreB =
      b.result.edge +
      b.result.confidence *
      0.1;


    return scoreB -
      scoreA;

  }
);

}

function renderMarketScanner() {

const results =
getScannerResults();

state.scanResults =
results;

const container =
$("#marketScannerList") ||
$("#marketList") ||
document.querySelector(
".market-list"
) ||
document.querySelector(
".scanner-grid"
);

if (!container) {

return;

}

container.innerHTML =
"";

results.forEach(
(
item,
index
) => {

  const result =
    item.result;


  const target =
    result.target !==
      null &&
    result.target !==
      undefined

      ? ` • ${result.target}`

      : "";


  const signal =
    result.label ===
      "WAIT"

      ? "WAIT"

      : `${result.label}${target}`;


  const card =
    document.createElement(
      "div"
    );


  card.className =
    "market-card" +
    (
      item.symbol ===
      state.selectedSymbol
        ? " selected"
        : ""
    );


  card.dataset.symbol =
    item.symbol;


  card.innerHTML = `

    <div class="market-card-top">

      <div>

        <div class="market-card-name">

          ${escapeHTML(
            item.name
          )}

        </div>

        <div class="market-card-symbol">

          ${escapeHTML(
            item.symbol
          )}

        </div>

      </div>

      <div class="market-live">

        <span class="live-dot"></span>

        LIVE

      </div>

    </div>


    <div class="market-card-signal">

      <span class="signal-label">

        ${escapeHTML(
          signal
        )}

      </span>

      <span class="signal-quality ${String(
        result.quality
      ).toLowerCase()}">

        ${escapeHTML(
          result.quality
        )}

      </span>

    </div>


    <div class="market-card-stats">

      <div>

        <span>LAST DIGIT</span>

        <strong>
          ${item.lastDigit ?? "—"}
        </strong>

      </div>


      <div>

        <span>SAMPLE</span>

        <strong>
          ${item.sample}
        </strong>

      </div>


      <div>

        <span>CONFIDENCE</span>

        <strong>
          ${
            result.confidence
              ? `${result.confidence}%`
              : "—"
          }
        </strong>

      </div>

    </div>


    <div class="market-card-rank">

      RANK #${index + 1}

    </div>

  `;


  card.addEventListener(
    "click",
    () => {

      selectMarket(
        item.symbol
      );

    }
  );


  container.appendChild(
    card
  );

}

);

setText(
"#marketCount",
results.length
);

setText(
"#connectedMarkets",
results.length
);

}

/* =========================================================
HTML SAFETY
========================================================= */

function escapeHTML(
value
) {

return String(
value ?? ""
)

.replaceAll(
  "&",
  "&amp;"
)

.replaceAll(
  "<",
  "&lt;"
)

.replaceAll(
  ">",
  "&gt;"
)

.replaceAll(
  '"',
  "&quot;"
)

.replaceAll(
  "'",
  "&#039;"
);

}

/* =========================================================
MARKET SELECTION
========================================================= */

function selectMarket(
symbol
) {

if (!symbol) return;

state.selectedSymbol =
symbol;

getMarket(
symbol
);

updateMarketDerivedData(
symbol
);

renderSelectedMarket();

renderDigitDistribution();

renderProbabilities();

renderAI();

renderMarketScanner();

}

/* =========================================================
STRATEGY SELECTION
========================================================= */

function handleStrategySelection(
strategy
) {

state.selectedStrategy =
strategy ||
"AUTO";

state.targetDigit =
null;

document
.querySelectorAll(
".strategy-button"
)
.forEach(
button => {

    button.classList.toggle(
      "active",
      button.dataset.strategy ===
        state.selectedStrategy
    );

  }
);

/*

* Keep the new index.html
* strategy display synchronized.
  */

const currentName =
$("#strategyCurrentName");

const currentIcon =
$("#strategyCurrentIcon");

const meta = {

AUTO: {
  icon:
    "A",
  name:
    "AUTO"
},

EVEN: {
  icon:
    "E",
  name:
    "EVEN"
},

ODD: {
  icon:
    "O",
  name:
    "ODD"
},

HIGH: {
  icon:
    "H",
  name:
    "HIGH"
},

LOW: {
  icon:
    "L",
  name:
    "LOW"
},

OVER: {
  icon:
    ">",
  name:
    "OVER"
},

UNDER: {
  icon:
    "<",
  name:
    "UNDER"
},

MATCH: {
  icon:
    "M",
  name:
    "MATCH"
},

DIFFER: {
  icon:
    "D",
  name:
    "DIFFER"
},

RISE: {
  icon:
    "↗",
  name:
    "RISE"
},

FALL: {
  icon:
    "↘",
  name:
    "FALL"
}

};

const selected =
meta[
state.selectedStrategy
] ||
meta.AUTO;

if (currentIcon) {

currentIcon.textContent =
  selected.icon;

}

if (currentName) {

currentName.textContent =
  selected.name;

}

window.KRISHWAVE_SELECTED_STRATEGY =
state.selectedStrategy;

renderAI();

if (state.running) {

beginAnalysisPhase();

}

}

/* =========================================================
AI ENGINE
========================================================= */

function startAIEngine() {

if (state.running) {

return;

}

state.running =
true;

state.tradeCount =
0;

state.lastAction =
"ANALYZING";

setText(
"#engineStatus",
"RUNNING"
);

beginAnalysisPhase();

}

function stopAIEngine() {

state.running =
false;

clearTimeout(
state.aiTimer
);

state.aiTimer =
null;

state.aiPhase =
"STOPPED";

state.aiSeconds =
CONFIG.ANALYSIS_SECONDS;

state.lastAction =
"STOPPED";

setText(
"#engineStatus",
"STOPPED"
);

renderAI();

setText(
"#aiCircleStatus",
"STOPPED"
);

setText(
"#aiCountdown",
CONFIG.ANALYSIS_SECONDS
);

setText(
"#lastAction",
"STOPPED"
);

}

function beginAnalysisPhase() {

if (!state.running) {

return;

}

clearTimeout(
state.aiTimer
);

state.aiPhase =
"ANALYZING";

state.aiSeconds =
CONFIG.ANALYSIS_SECONDS;

state.lastAction =
"ANALYZING MARKET";

updateTradingStatus();

runAnalysisCountdown();

}

function runAnalysisCountdown() {

if (!state.running) {

return;

}

const result =
state.selectedStrategy ===
"AUTO"

  ? analyzeAuto(
      state.selectedSymbol
    )

  : analyzeStrategy(
      state.selectedSymbol,
      state.selectedStrategy
    );

renderCircle(
result
);

if (
state.aiSeconds <=
0
) {

finishAnalysisPhase();

return;

}

state.aiSeconds--;

state.aiTimer =
setTimeout(
runAnalysisCountdown,
1000
);

}

function finishAnalysisPhase() {

if (!state.running) {

return;

}

const result =
state.selectedStrategy ===
"AUTO"

  ? analyzeAuto(
      state.selectedSymbol
    )

  : analyzeStrategy(
      state.selectedSymbol,
      state.selectedStrategy
    );

if (
result.quality ===
"WAIT" ||
result.quality ===
"WEAK"
) {

state.aiPhase =
  "WAIT";


state.aiSeconds =
  CONFIG.ANALYSIS_SECONDS;


state.lastAction =
  "WAITING FOR STRONG SETUP";


renderCircle(
  result
);


updateTradingStatus();


state.aiTimer =
  setTimeout(
    beginAnalysisPhase,
    1000
  );


return;

}

/*

* Risk protection check.
  */

if (
state.trade.tradingStopped
) {

state.aiPhase =
  "STOPPED";


state.lastAction =
  "RISK LIMIT";


updateTradingStatus();


return;

}

beginEntryCountdown(
result
);

}

function beginEntryCountdown(
result
) {

if (!state.running) {

return;

}

state.aiPhase =
"ENTRY";

state.aiSeconds =
CONFIG.COUNTDOWN_SECONDS;

state.lastAction =
"PREPARE ENTRY";

updateTradingStatus();

runEntryCountdown(
result
);

}

function runEntryCountdown(
result
) {

if (!state.running) {

return;

}

if (
state.trade.tradingStopped
) {

stopAIEngine();

return;

}

renderCircle(
result
);

if (
state.aiSeconds <=
0
) {

fireTradeNow(
  result
);

return;

}

state.aiSeconds--;

state.aiTimer =
setTimeout(
() =>
runEntryCountdown(
result
),
1000
);

}

/* =========================================================
TRADE SIGNAL
========================================================= */

function fireTradeNow(
result
) {

if (!state.running) {

return;

}

if (
state.trade.tradingStopped
) {

state.lastAction =
  "RISK LIMIT";

updateTradingStatus();

return;

}

state.aiPhase =
"TRADE NOW";

state.lastAction =
"TRADE NOW";

state.tradeCount++;

/*

* Send the request into the
* trade management layer.
  */

requestTrade(
result,
"ai"
);

renderCircle(
result
);

updateTradingStatus();

/*

* Continue the AI loop only
* if trading has not been
* stopped by risk protection.
  */

if (
!state.trade.tradingStopped
) {

state.aiTimer =
  setTimeout(
    beginAnalysisPhase,
    900
  );

}

}

/* =========================================================
TRADE SETTINGS
========================================================= */

function readTradeSettings() {

const ui =
window.KRISHWAVE_TRADE_UI;

if (
ui &&
typeof ui.getSettings ===
"function"
) {

const settings =
  ui.getSettings();


state.trade.stake =
  normalizeStake(
    settings.stake
  );


state.trade.currentStake =
  normalizeStake(
    settings.currentStake
  );


state.trade.takeProfit =
  normalizeTakeProfit(
    settings.takeProfit
  );


state.trade.stopLoss =
  normalizeStopLoss(
    settings.stopLoss
  );


state.trade.martingaleMultiplier =
  normalizeMultiplier(
    settings.martingaleMultiplier
  );


state.trade.maxMartingaleSteps =
  normalizeSteps(
    settings.maxMartingaleSteps
  );


state.trade.maxStake =
  normalizeMaxStake(
    settings.maxStake
  );


state.trade.martingaleStep =
  normalizeSteps(
    settings.martingaleStep
  );


return;

}

/*

* Fallback direct DOM reading.
  */

const stake =
$("#stakeAmount");

const tp =
$("#takeProfit");

const sl =
$("#stopLoss");

const multiplier =
$("#martingaleMultiplier");

const maxSteps =
$("#maxMartingaleSteps");

const maxStake =
$("#maxStake");

state.trade.stake =
normalizeStake(
Number(
stake?.value ||
CONFIG.DEFAULT_STAKE
)
);

state.trade.takeProfit =
normalizeTakeProfit(
Number(
tp?.value ||
CONFIG.DEFAULT_TAKE_PROFIT
)
);

state.trade.stopLoss =
normalizeStopLoss(
Number(
sl?.value ||
CONFIG.DEFAULT_STOP_LOSS
)
);

state.trade.martingaleMultiplier =
normalizeMultiplier(
Number(
multiplier?.value ||
CONFIG.DEFAULT_MARTINGALE_MULTIPLIER
)
);

state.trade.maxMartingaleSteps =
normalizeSteps(
Number(
maxSteps?.value ||
CONFIG.DEFAULT_MAX_MARTINGALE_STEPS
)
);

state.trade.maxStake =
normalizeMaxStake(
Number(
maxStake?.value ||
CONFIG.DEFAULT_MAX_STAKE
)
);

state.trade.currentStake =
clamp(
state.trade.currentStake ||
state.trade.stake,
CONFIG.MIN_STAKE,
state.trade.maxStake
);

}

function normalizeStake(
value
) {

const number =
Number(value);

if (
!Number.isFinite(
number
)
) {

return CONFIG.MIN_STAKE;

}

return Math.max(
CONFIG.MIN_STAKE,
number
);

}

function normalizeTakeProfit(
value
) {

const number =
Number(value);

if (
!Number.isFinite(
number
)
) {

return CONFIG.DEFAULT_TAKE_PROFIT;

}

return Math.max(
0,
number
);

}

function normalizeStopLoss(
value
) {

const number =
Number(value);

if (
!Number.isFinite(
number
)
) {

return CONFIG.DEFAULT_STOP_LOSS;

}

/*

* Store Stop Loss as a
* negative session P/L value.
  */

return number > 0
? -number
: number;

}

function normalizeMultiplier(
value
) {

const number =
Number(value);

if (
!Number.isFinite(
number
)
) {

return CONFIG.DEFAULT_MARTINGALE_MULTIPLIER;

}

return Math.max(
1,
number
);

}

function normalizeSteps(
value
) {

const number =
Number(value);

if (
!Number.isFinite(
number
)
) {

return 0;

}

return Math.max(
0,
Math.floor(
number
)
);

}

function normalizeMaxStake(
value
) {

const number =
Number(value);

if (
!Number.isFinite(
number
)
) {

return CONFIG.DEFAULT_MAX_STAKE;

}

return Math.max(
CONFIG.MIN_STAKE,
number
);

}

/* =========================================================
TRADE MANAGEMENT DISPLAY
========================================================= */

function updateTradeManagementUI() {

readTradeSettings();

/*

* Make sure current stake
* always respects protection.
  */

state.trade.currentStake =
clamp(
normalizeStake(
state.trade.currentStake
),
CONFIG.MIN_STAKE,
state.trade.maxStake
);

setText(
"#currentStakeDisplay",
money(
state.trade.currentStake
)
);

setText(
"#sessionProfitLoss",
money(
state.trade.sessionPL
)
);

setText(
"#martingaleStepDisplay",
"${state.trade.martingaleStep} / ${state.trade.maxMartingaleSteps}"
);

const accountLabel =
state.accountMode ===
"real"

  ? "REAL ACCOUNT"

  : "DEMO ACCOUNT";

setText(
"#tradeAccountMode",
accountLabel
);

const permission =
state.accountMode ===
"real"

  ? (
      state.accountConnected
        ? "CONFIRM REQUIRED"
        : "CONNECT ACCOUNT"
    )

  : "DEMO READY";

setText(
"#tradePermissionStatus",
permission
);

/*

* Color class.
  */

const accountElement =
$("#tradeAccountMode");

if (accountElement) {

accountElement.classList.toggle(
  "real-mode",
  state.accountMode ===
    "real"
);

accountElement.classList.toggle(
  "demo-mode",
  state.accountMode !==
    "real"
);

}

}

/* =========================================================
MARTINGALE
========================================================= */

function resetMartingale() {

readTradeSettings();

state.trade.martingaleStep =
0;

state.trade.currentStake =
clamp(
state.trade.stake,
CONFIG.MIN_STAKE,
state.trade.maxStake
);

state.trade.lastResult =
null;

state.trade.tradingStopped =
false;

const ui =
window.KRISHWAVE_TRADE_UI;

if (
ui &&
typeof ui.reset ===
"function"
) {

ui.reset();

}

updateTradeManagementUI();

state.lastAction =
"MARTINGALE RESET";

updateTradingStatus();

}

function applyMartingaleAfterLoss() {

readTradeSettings();

if (
state.trade.martingaleStep >=
state.trade.maxMartingaleSteps
) {

state.trade.tradingStopped =
  true;


state.lastAction =
  "MAX MARTINGALE STEP";


updateTradeManagementUI();

updateTradingStatus();

return false;

}

const nextStake =
state.trade.currentStake *
state.trade.martingaleMultiplier;

const protectedStake =
Math.min(
nextStake,
state.trade.maxStake
);

state.trade.martingaleStep++;

state.trade.currentStake =
Math.max(
CONFIG.MIN_STAKE,
protectedStake
);

const ui =
window.KRISHWAVE_TRADE_UI;

if (
ui &&
typeof ui.onLoss ===
"function"
) {

/*
 * The UI has its own
 * protection layer.
 */

ui.onLoss();

}

updateTradeManagementUI();

if (
state.trade.currentStake >=
state.trade.maxStake
) {

state.lastAction =
  "MAX STAKE PROTECTION";

}

return true;

}

function applyWinReset() {

state.trade.martingaleStep =
0;

state.trade.currentStake =
clamp(
state.trade.stake,
CONFIG.MIN_STAKE,
state.trade.maxStake
);

const ui =
window.KRISHWAVE_TRADE_UI;

if (
ui &&
typeof ui.onWin ===
"function"
) {

ui.onWin();

}

updateTradeManagementUI();

}

/* =========================================================
SESSION P/L
========================================================= */

function updateSessionPL(
profit
) {

const value =
Number(profit);

if (
!Number.isFinite(
value
)
) {

return;

}

state.trade.sessionPL +=
value;

state.trade.sessionPL =
round(
state.trade.sessionPL,
2
);

updateTradeManagementUI();

checkRiskLimits();

}

function checkRiskLimits() {

readTradeSettings();

/*

* TAKE PROFIT
  */

if (
state.trade.takeProfit >
0 &&
state.trade.sessionPL >=
state.trade.takeProfit
) {

state.trade.tradingStopped =
  true;


state.lastAction =
  "TAKE PROFIT REACHED";


state.aiPhase =
  "TP STOP";


clearTimeout(
  state.aiTimer
);


updateTradingStatus();


return true;

}

/*

* STOP LOSS
  */

if (
state.trade.stopLoss <
0 &&
state.trade.sessionPL <=
state.trade.stopLoss
) {

state.trade.tradingStopped =
  true;


state.lastAction =
  "STOP LOSS REACHED";


state.aiPhase =
  "SL STOP";


clearTimeout(
  state.aiTimer
);


updateTradingStatus();


return true;

}

return false;

}

/* =========================================================
RECORD WIN
========================================================= */

function recordTradeWin(
profit
) {

state.trade.sessionTrades++;

state.trade.sessionWins++;

state.trade.lastResult =
"WIN";

updateSessionPL(
profit
);

applyWinReset();

state.trade.pendingTrade =
false;

state.lastAction =
"TRADE WON";

updateTradingStatus();

}

/* =========================================================
RECORD LOSS
========================================================= */

function recordTradeLoss(
loss
) {

state.trade.sessionTrades++;

state.trade.sessionLosses++;

state.trade.lastResult =
"LOSS";

updateSessionPL(
-Math.abs(
Number(loss)
)
);

const continued =
applyMartingaleAfterLoss();

state.trade.pendingTrade =
false;

state.lastAction =
continued
? "LOSS → MARTINGALE"
: "LOSS → PROTECTION";

updateTradingStatus();

}

/* =========================================================
ACCOUNT MODE
========================================================= */

function setAccountMode(
mode
) {

const normalized =
String(
mode ||
"demo"
).toLowerCase();

state.accountMode =
normalized ===
"real"
? "real"
: "demo";

/*

* Synchronize body.
  */

document.body.dataset.accountMode =
state.accountMode;

/*

* Synchronize account cards.
  */

const demo =
$("#accountDemo");

const real =
$("#accountReal");

if (demo) {

demo.classList.toggle(
  "active",
  state.accountMode ===
    "demo"
);

}

if (real) {

real.classList.toggle(
  "active",
  state.accountMode ===
    "real"
);

}

setText(
"#accountTypeLabel",
state.accountMode.toUpperCase()
);

setText(
"#accountMode",
state.accountMode.toUpperCase()
);

setText(
"#accountModeStatus",
state.accountMode.toUpperCase()
);

updateTradeManagementUI();

}

function setupAccountControls() {

const demo =
$("#accountDemo");

const real =
$("#accountReal");

if (demo) {

demo.addEventListener(
  "click",
  () => {

    setAccountMode(
      "demo"
    );

  }
);

}

if (real) {

real.addEventListener(
  "click",
  () => {

    setAccountMode(
      "real"
    );

  }
);

}

/*

* Legacy data-account support.
  */

document
.querySelectorAll(
"[data-account]"
)
.forEach(
button => {

    button.addEventListener(
      "click",
      () => {

        setAccountMode(
          button.dataset
            .account
        );

      }
    );

  }
);

}

/* =========================================================
TRADE REQUEST
========================================================= */

function requestTrade(
result,
source = "manual"
) {

readTradeSettings();

if (
state.trade.tradingStopped
) {

state.lastAction =
  "TRADING STOPPED";


updateTradingStatus();

return false;

}

if (
state.trade.pendingTrade
) {

state.lastAction =
  "TRADE ALREADY PENDING";


updateTradingStatus();

return false;

}

if (
!result ||
result.label ===
"WAIT"
) {

state.lastAction =
  "NO VALID SIGNAL";


updateTradingStatus();

return false;

}

const tradeData = {

accountType:
  state.accountMode,

symbol:
  state.selectedSymbol,

strategy:
  result.label,

target:
  result.target,

confidence:
  result.confidence,

probability:
  result.probability,

edge:
  result.edge,

stake:
  state.trade.currentStake,

takeProfit:
  state.trade.takeProfit,

stopLoss:
  state.trade.stopLoss,

martingaleMultiplier:
  state.trade.martingaleMultiplier,

martingaleStep:
  state.trade.martingaleStep,

maxMartingaleSteps:
  state.trade.maxMartingaleSteps,

maxStake:
  state.trade.maxStake,

source

};

/*

* REAL ACCOUNT
* 
* Never bypass the confirmation
* window.
  */

if (
state.accountMode ===
"real"
) {

state.trade.pendingTrade =
  false;


openRealTradeConfirmation(
  tradeData
);


return true;

}

/*

* DEMO
  */

state.trade.pendingTrade =
true;

dispatchTradeRequest(
tradeData
);

return true;

}

/* =========================================================
REAL TRADE CONFIRMATION
========================================================= */

function openRealTradeConfirmation(
tradeData
) {

const modal =
$("#realTradeModal");

if (!modal) {

console.warn(
  "REAL confirmation modal not found."
);

return;

}

setText(
"#confirmMarket",
tradeData.symbol
);

setText(
"#confirmStrategy",
tradeData.strategy +
(
tradeData.target !==
null &&
tradeData.target !==
undefined

      ? ` ${tradeData.target}`

      : ""
  )

);

setText(
"#confirmStake",
money(
tradeData.stake
)
);

setText(
"#confirmSignal",
tradeData.strategy
);

/*

* Save only the pending
* trade information in memory.
  */

state.trade.pendingTrade =
tradeData;

modal.classList.add(
"open"
);

modal.setAttribute(
"aria-hidden",
"false"
);

const cancel =
$("#cancelRealTrade");

if (cancel) {

cancel.focus();

}

}

/* =========================================================
CLOSE REAL CONFIRMATION
========================================================= */

function closeRealTradeConfirmation() {

const modal =
$("#realTradeModal");

if (!modal) return;

modal.classList.remove(
"open"
);

modal.setAttribute(
"aria-hidden",
"true"
);

}

/* =========================================================
CONFIRM REAL TRADE
========================================================= */

function confirmRealTrade() {

const pending =
state.trade.pendingTrade;

if (
!pending ||
typeof pending !==
"object"
) {

closeRealTradeConfirmation();

return;

}

/*

* Explicit user confirmation
* has now happened.
  */

state.trade.pendingTrade =
true;

closeRealTradeConfirmation();

dispatchRealTradeConfirmed(
pending
);

}

/* =========================================================
DISPATCH TRADE REQUEST
========================================================= */

function dispatchTradeRequest(
tradeData
) {

/*

* Notify any future trading
* adapter.
  */

document.dispatchEvent(
new CustomEvent(
"krishwave:trade-request",
{
detail:
tradeData
}
)
);

/*

* Demo mode currently does
* not fake a win/loss.
* 
* The authenticated trading
* adapter should report the
* actual contract result.
  */

state.lastAction =
"DEMO TRADE REQUEST";

updateTradingStatus();

/*

* Keep UI responsive.
  */

setTimeout(
() => {

  if (
    state.trade.pendingTrade &&
    state.accountMode ===
      "demo"
  ) {

    state.trade.pendingTrade =
      false;

    state.lastAction =
      "DEMO REQUEST SENT";

    updateTradingStatus();

  }

},
3000

);

}

/* =========================================================
DISPATCH REAL TRADE
========================================================= */

function dispatchRealTradeConfirmed(
tradeData
) {

document.dispatchEvent(
new CustomEvent(
"krishwave:real-trade-confirmed",
{
detail:
tradeData
}
)
);

state.lastAction =
"REAL TRADE CONFIRMED";

updateTradingStatus();

}

/* =========================================================
PROPOSAL RESPONSE
========================================================= */

function handleProposalResponse(
data
) {

/*

* This is intentionally
* generic.
* 
* A secure authenticated
* trading adapter can listen
* for proposal responses and
* continue to buy.
  */

document.dispatchEvent(
new CustomEvent(
"krishwave:proposal-response",
{
detail:
data
}
)
);

}

/* =========================================================
BUY RESPONSE
========================================================= */

function handleBuyResponse(
data
) {

document.dispatchEvent(
new CustomEvent(
"krishwave:buy-response",
{
detail:
data
}
)
);

/*

* Do not assume a win here.
* 
* Actual contract settlement
* must be received before
* recording P/L.
  */

}

/* =========================================================
PROFIT TABLE
========================================================= */

function handleProfitTable(
data
) {

document.dispatchEvent(
new CustomEvent(
"krishwave:profit-table",
{
detail:
data
}
)
);

}

/* =========================================================
PUBLIC TRADE RESULT API
========================================================= */

function processTradeResult(
result
) {

if (!result) return;

const status =
String(
result.status ||
result.result ||
""
).toLowerCase();

const profit =
Number(
result.profit
);

if (
status ===
"won" ||
status ===
"win"
) {

recordTradeWin(
  Number.isFinite(
    profit
  )
    ? profit
    : 0
);


return;

}

if (
status ===
"lost" ||
status ===
"loss"
) {

recordTradeLoss(
  Number.isFinite(
    profit
  )
    ? Math.abs(
        profit
      )
    : state.trade.currentStake
);


return;

}

/*

* If a numeric profit is
* provided, use its sign.
  */

if (
Number.isFinite(
profit
)
) {

if (
  profit > 0
) {

  recordTradeWin(
    profit
  );

} else if (
  profit < 0
) {

  recordTradeLoss(
    Math.abs(
      profit
    )
  );

}

}

}

/* =========================================================
TRADE CONTROL EVENTS
========================================================= */

function setupTradeControls() {

const tradeNow =
$("#tradeNowButton");

const reset =
$("#resetMartingale");

const cancel =
$("#cancelRealTrade");

const confirm =
$("#confirmRealTrade");

if (tradeNow) {

tradeNow.addEventListener(
  "click",
  () => {

    readTradeSettings();


    const result =
      state.selectedStrategy ===
      "AUTO"

        ? analyzeAuto(
            state.selectedSymbol
          )

        : analyzeStrategy(
            state.selectedSymbol,
            state.selectedStrategy
          );


    requestTrade(
      result,
      "manual"
    );

  }
);

}

if (reset) {

reset.addEventListener(
  "click",
  resetMartingale
);

}

if (cancel) {

cancel.addEventListener(
  "click",
  () => {

    state.trade.pendingTrade =
      false;

    closeRealTradeConfirmation();


    state.lastAction =
      "TRADE CANCELLED";


    updateTradingStatus();

  }
);

}

if (confirm) {

confirm.addEventListener(
  "click",
  confirmRealTrade
);

}

/*

* Close modal by clicking
* outside the dialog.
  */

const modal =
$("#realTradeModal");

if (modal) {

modal.addEventListener(
  "click",
  event => {

    if (
      event.target ===
      modal
    ) {

      state.trade.pendingTrade =
        false;

      closeRealTradeConfirmation();

    }

  }
);

}

document.addEventListener(
"keydown",
event => {

  if (
    event.key ===
      "Escape" &&
    modal &&
    modal.classList.contains(
      "open"
    )
  ) {

    state.trade.pendingTrade =
      false;

    closeRealTradeConfirmation();

  }

}

);

/*

* Allow external authenticated
* trading code to report results.
  */

document.addEventListener(
"krishwave:trade-result",
event => {

  processTradeResult(
    event.detail
  );

}

);

/*

* Keep the trade settings
* synchronized.
  */

[
"#stakeAmount",
"#takeProfit",
"#stopLoss",
"#martingaleMultiplier",
"#maxMartingaleSteps",
"#maxStake"

].forEach(
selector => {

  const element =
    $(selector);

  if (!element) return;


  element.addEventListener(
    "change",
    () => {

      readTradeSettings();

      updateTradeManagementUI();

    }
  );


  element.addEventListener(
    "input",
    () => {

      readTradeSettings();

      updateTradeManagementUI();

    }
  );

}

);

}

/* =========================================================
SCAN ALL
========================================================= */

function scanAllMarkets() {

MARKETS.forEach(
item => {

  if (
    !state.markets[
      item.symbol
    ]
  ) {

    getMarket(
      item.symbol
    );

  }


  if (
    !state.markets[
      item.symbol
    ].history.length
  ) {

    requestHistory(
      item.symbol
    );

  }


  if (
    !state.subscriptions.has(
      item.symbol
    )
  ) {

    subscribeTicks(
      item.symbol
    );

  }

}

);

renderMarketScanner();

}

/* =========================================================
STRATEGY BUTTONS
========================================================= */

function setupStrategyControls() {

const container =
document.querySelector(
".strategy-options"
);

if (!container) {

return;

}

/*

* The inline index.html
* already has strategy
* button listeners.
* 
* This listener ensures
* app state also receives
* the selection.
  */

container.addEventListener(
"click",
event => {

  const button =
    event.target.closest(
      ".strategy-button"
    );


  if (!button) {

    return;

  }


  const strategy =
    button.dataset
      .strategy;


  if (!strategy) {

    return;

  }


  handleStrategySelection(
    strategy
  );

}

);

}

/* =========================================================
MARKET CARD DELEGATION
========================================================= */

function setupMarketSelectionDelegation() {

document.addEventListener(
"click",
event => {

  const card =
    event.target.closest(
      ".market-card"
    );


  if (!card) {

    return;

  }


  const symbol =
    card.dataset.symbol;


  if (symbol) {

    selectMarket(
      symbol
    );

  }

}

);

}

/* =========================================================
TRADING STATUS
========================================================= */

function updateTradingStatus() {

setText(
"#engineStatus",
state.running
? "RUNNING"
: "STOPPED"
);

setText(
"#lastAction",
state.lastAction
);

setText(
"#tradeCount",
state.tradeCount
);

setText(
"#accountMode",
state.accountMode.toUpperCase()
);

setText(
"#accountModeStatus",
state.accountMode.toUpperCase()
);

setText(
"#engineState",
state.running
? state.aiPhase
: "READY"
);

updateTradeManagementUI();

}

/* =========================================================
CONNECTION UI
========================================================= */

function updateConnectionUI(
status
) {

const statusElement =
$("#connectionStatus");

if (statusElement) {

statusElement.textContent =
  status ===
    "CONNECTED"

    ? "LIVE"

    : status;

}

setText(
"#footerStatus",
status ===
"CONNECTED"
? "LIVE DATA CONNECTED"
: status
);

/*

* Do not overwrite engine
* state with connection state.
  */

const dot =
document.querySelector(
".status-dot"
);

if (dot) {

dot.classList.toggle(
  "connected",
  status ===
    "CONNECTED"
);

}

}

/* =========================================================
INITIALIZATION
========================================================= */

function initialize() {

/*

* VISUAL
  */

setupThemeToggle();

setupHeaderLayout();

setupDigitDistributionLayout();

/*

* APP CONTROLS
  */

setupStrategyControls();

setupAccountControls();

setupMarketSelectionDelegation();

setupTradeControls();

/*

* AI
  */

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

/*

* Scanner
  */

const scan =
$("#scanAll");

if (scan) {

scan.addEventListener(
  "click",
  scanAllMarkets
);

}

/*

* Initial market
  */

getMarket(
state.selectedSymbol
);

renderSelectedMarket();

renderDigitDistribution();

renderProbabilities();

renderAI();

/*

* Trade defaults
  */

setAccountMode(
"demo"
);

readTradeSettings();

updateTradeManagementUI();

updateTradingStatus();

/*

* LIVE DATA
  */

connectWebSocket();

/*

* Periodic UI synchronization.
  */

setInterval(
() => {

  Object.keys(
    state.markets
  ).forEach(
    symbol => {

      updateMarketDerivedData(
        symbol
      );

    }
  );


  setupHeaderLayout();

  setupDigitDistributionLayout();

  updateThemeButton();

  renderSelectedMarket();

  renderDigitDistribution();

  renderProbabilities();

  renderAI();

  renderMarketScanner();

  updateTradeManagementUI();

  updateTradingStatus();

},
2000

);

}

/* =========================================================
START
========================================================= */

document.addEventListener(
"DOMContentLoaded",
initialize
);

/* =========================================================
PUBLIC KRISHWAVE API
========================================================= */

window.KRISHWAVE = {

state,

config:
CONFIG,

markets:
MARKETS,

analyzeStrategy,

analyzeAuto,

selectMarket,

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

checkRiskLimits

};

/* =========================================================
END KRISHWAVE V4
========================================================= */