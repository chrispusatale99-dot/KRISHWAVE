/* =========================================================
KRISHWAVE AI BEAST V7.1
DERIV LIVE MARKET INTELLIGENCE + PAPER TRADING ENGINE

FRONTEND:
https://chrispusatale99-dot.github.io/KRISHWAVE/

OAUTH BACKEND:
https://krishwave-oauth.onrender.com

FEATURES

- Deriv public live market data
- Deriv OAuth through Render backend
- Demo / Real account selection
- Analysis / Trade / History
- AI market scanner
- Digit distribution
- Matches / Differs / Over / Under / Even / Odd
- AI BOT
- Circular AI
- Manual paper engine
- Amount won + net profit history
- Take profit / stop loss
- Martingale
- Local history persistence
- Dark / light mode

IMPORTANT

PAPER ENGINE IS DEFAULT.
REAL MODE REQUIRES EXPLICIT CONFIRMATION.
NO REAL TRADE IS EXECUTED BY THE PAPER ENGINE.
========================================================= */

/* =========================================================
CONFIG
========================================================= */

const BACKEND_URL = "https://krishwave-oauth.onrender.com";

const PUBLIC_WS =
"wss://api.derivws.com/trading/v1/options/ws/public";

const DERIV_AUTH_URL =
"https://auth.deriv.com/oauth2/auth";

const FALLBACK_CLIENT_ID =
"019f9f77-0282-7ee4-8c64-c0ac3e80dfad";

const FRONTEND_REDIRECT =
"https://chrispusatale99-dot.github.io/KRISHWAVE/";

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

const STRATEGIES = [
"MATCHES",
"DIFFERS",
"OVER",
"UNDER",
"EVEN",
"ODD"
];

const PAPER_START_BALANCE = 1000;

const MIN_STAKE = 0.25;

const PAYOUT = {
MATCHES: 8.5,
DIFFERS: 0.09,
OVER: 0.95,
UNDER: 0.95,
EVEN: 0.95,
ODD: 0.95
};

/* =========================================================
STATE
========================================================= */

const state = {

theme:
localStorage.getItem("krishwave_theme") ||
"dark",

page: "analysis",

engine: "ai",

accountMode: "demo",

sessionId:
sessionStorage.getItem("krishwave_session_id") ||
"",

oauthClientId: "",

oauthReady: false,

accountConnected: false,

selectedAccountId: "",

currency: "USD",

liveBalance: PAPER_START_BALANCE,

paperBalance:
Number(
localStorage.getItem("krishwave_paper_balance")
) || PAPER_START_BALANCE,

selectedMarket:
localStorage.getItem("krishwave_market") ||
"R_10",

selectedStrategy:
localStorage.getItem("krishwave_strategy") ||
"MATCHES",

botStrategies:
JSON.parse(
localStorage.getItem("krishwave_bot_strategies") ||
'["MATCHES","DIFFERS"]'
),

marketData: {},

currentPrediction: null,

aiTimer: null,

botTimer: null,

circularTradeTimer: null,

paperTradeCounter: 0,

history:
JSON.parse(
localStorage.getItem("krishwave_history") ||
"[]"
),

activeTrades: [],

totalStake: 0,

totalAmountWon: 0,

totalProfit: 0,

wins: 0,

losses: 0,

stopTrading: false,

circularRunning: false,

botRunning: false,

circularPhase: "ANALYZING",

circularRemaining: 10,

lastTickTime: 0,

publicSocket: null,

authSocket: null,

reconnectTimer: null,

publicReconnectAttempts: 0,

authReconnectAttempts: 0,

toastTimer: null,

modalTarget: "manual",

manualStrategy:
localStorage.getItem("krishwave_manual_strategy") ||
"MATCHES",

circularStrategy:
localStorage.getItem("krishwave_circular_strategy") ||
"MATCHES",

circularMarket:
localStorage.getItem("krishwave_circular_market") ||
"AUTO"

};

/* =========================================================
DOM HELPER
========================================================= */

const $ = (id) =>
document.getElementById(id);

const $$ = (selector) =>
Array.from(document.querySelectorAll(selector));

/* =========================================================
SAFE JSON
========================================================= */

function safeJSON(value, fallback) {
try {
return JSON.parse(value);
} catch {
return fallback;
}
}

/* =========================================================
INITIALIZE MARKET OBJECTS
========================================================= */

MARKETS.forEach((symbol) => {

state.marketData[symbol] = {

symbol,

ticks: [],

prices: [],

digits: [],

lastPrice: null,

lastDigit: null,

score: 0,

confidence: 0,

strategy: "MATCHES",

prediction: "--",

updated: 0

};

});

/* =========================================================
THEME
========================================================= */

function applyTheme() {

document.body.classList.toggle(
"light-theme",
state.theme === "light"
);

const button =
$("themeToggle");

if (button) {
button.textContent =
state.theme === "light"
? "🌙"
: "☀️";
}

}

function toggleTheme() {

state.theme =
state.theme === "light"
? "dark"
: "light";

localStorage.setItem(
"krishwave_theme",
state.theme
);

applyTheme();

}

/* =========================================================
TOAST
========================================================= */

function toast(message) {

const box = $("toast");

const text =
$("toastMessage");

if (!box || !text) return;

text.textContent = message;

box.classList.add("show");

clearTimeout(state.toastTimer);

state.toastTimer =
setTimeout(() => {
box.classList.remove("show");
}, 2800);

}

/* =========================================================
CONNECTION UI
========================================================= */

function setConnection(status, text) {

const dot =
$("connectionDot");

const label =
$("connectionText");

if (!dot || !label) return;

dot.className =
"status-dot " +
status;

label.textContent =
text;
}

/* =========================================================
DATA STATUS
========================================================= */

function setDataStatus(text) {

const el =
$("dataStatus");

if (el) {
el.textContent =
text;
}

}

/* =========================================================
PAGE NAVIGATION
========================================================= */

function showPage(page) {

state.page = page;

$$(".page").forEach((p) => {

p.classList.remove(
  "active-page"
);

});

const target =
page === "analysis"
? $("analysisPage")
: page === "trade"
? $("tradePage")
: $("historyPage");

if (target) {
target.classList.add(
"active-page"
);
}

$$(".nav-btn").forEach((btn) => {

btn.classList.toggle(
  "active",
  btn.dataset.page === page
);

});

}

/* =========================================================
ENGINE TABS
========================================================= */

function setEngine(engine) {

state.engine =
engine;

$$(".engine-tab").forEach(
(button) => {
button.classList.remove(
"active"
);
}
);

$$(".engine-panel").forEach(
(panel) => {
panel.classList.remove(
"active"
);
}
);

if (engine === "ai") {

$("tabAiBot")?.classList.add(
  "active"
);

$("aiBotPanel")?.classList.add(
  "active"
);

}

if (engine === "circular") {

$("tabCircularAI")?.classList.add(
  "active"
);

$("circularTradePanel")?.classList.add(
  "active"
);

}

if (engine === "manual") {

$("tabManual")?.classList.add(
  "active"
);

$("manualPanel")?.classList.add(
  "active"
);

}

}

/* =========================================================
MODE UI
========================================================= */

function updateModeUI() {

const badge =
$("modeBadge");

if (!badge) return;

if (state.accountMode === "real") {

badge.textContent =
  "REAL";

badge.className =
  "mode-badge real-mode";

} else {

badge.textContent =
  "DEMO / PAPER";

badge.className =
  "mode-badge demo-mode";

}

$("demoModeBtn")?.classList.toggle(
"active",
state.accountMode === "demo"
);

$("realModeBtn")?.classList.toggle(
"active",
state.accountMode === "real"
);

}

/* =========================================================
ACCOUNT DISPLAY
========================================================= */

function updateAccountDisplay() {

const account =
$("accountId");

const currency =
$("currency");

const balance =
$("balanceDisplay");

if (account) {

account.textContent =
  state.selectedAccountId ||
  "NOT CONNECTED";

}

if (currency) {

currency.textContent =
  state.currency ||
  "USD";

}

if (balance) {

const value =
  state.accountMode === "demo"
    ? state.paperBalance
    : state.liveBalance;

balance.textContent =
  formatMoney(value);

}

}

/* =========================================================
MONEY
========================================================= */

function formatMoney(value) {

const number =
Number(value) || 0;

return (
"$" +
number.toLocaleString(
"en-US",
{
minimumFractionDigits: 2,
maximumFractionDigits: 2
}
)
);

}

/* =========================================================
PUBLIC WEBSOCKET
========================================================= */

function connectPublicSocket() {

if (
state.publicSocket &&
(
state.publicSocket.readyState ===
WebSocket.OPEN ||
state.publicSocket.readyState ===
WebSocket.CONNECTING
)
) {
return;
}

setConnection(
"connecting",
"CONNECTING"
);

setDataStatus(
"Connecting to Deriv public market feed..."
);

try {

const ws =
  new WebSocket(
    PUBLIC_WS
  );

state.publicSocket =
  ws;

ws.onopen = () => {

  state.publicReconnectAttempts = 0;

  setConnection(
    "online",
    "LIVE"
  );

  setDataStatus(
    "Deriv live market feed connected"
  );

  subscribeAllMarkets();

  toast(
    "Deriv live data connected"
  );

};

ws.onmessage = (event) => {

  handlePublicMessage(
    event.data
  );

};

ws.onerror = () => {

  setConnection(
    "connecting",
    "RECONNECTING"
  );

  setDataStatus(
    "Market feed connection error..."
  );

};

ws.onclose = () => {

  setConnection(
    "connecting",
    "RECONNECTING"
  );

  setDataStatus(
    "Market feed disconnected — reconnecting..."
  );

  schedulePublicReconnect();

};

} catch (error) {

console.error(
  "Public WebSocket:",
  error
);

schedulePublicReconnect();

}

}

/* =========================================================
RECONNECT
========================================================= */

function schedulePublicReconnect() {

clearTimeout(
state.reconnectTimer
);

const attempt =
Math.min(
state.publicReconnectAttempts++,
6
);

const delay =
Math.min(
1000 *
Math.pow(
2,
attempt
),
15000
);

state.reconnectTimer =
setTimeout(
connectPublicSocket,
delay
);

}

/* =========================================================
SUBSCRIBE ALL
========================================================= */

function subscribeAllMarkets() {

if (
!state.publicSocket ||
state.publicSocket.readyState !==
WebSocket.OPEN
) {
return;
}

MARKETS.forEach(
(symbol) => {

  sendPublic({
    ticks_history: symbol,
    count: 80,
    end: "latest",
    style: "ticks",
    subscribe: 1
  });

}

);

}

/* =========================================================
SEND PUBLIC
========================================================= */

function sendPublic(payload) {

try {

state.publicSocket.send(
  JSON.stringify(payload)
);

} catch (error) {

console.warn(
  "Public send error:",
  error
);

}

}

/* =========================================================
PUBLIC MESSAGE
========================================================= */

function handlePublicMessage(raw) {

let data;

try {

data =
  typeof raw === "string"
    ? JSON.parse(raw)
    : raw;

} catch {

return;

}

if (
data.error
) {

console.warn(
  "Deriv public error:",
  data.error
);

return;

}

if (
data.history
) {

processHistory(
  data
);

return;

}

if (
data.tick
) {

processTick(
  data.tick
);

}

}

/* =========================================================
PROCESS HISTORY
========================================================= */

function processHistory(data) {

const symbol =
data.echo_req?.ticks_history ||
data.echo_req?.symbol;

if (
!symbol ||
!state.marketData[symbol]
) {
return;
}

const prices =
Array.isArray(
data.history?.prices
)
? data.history.prices
: [];

const times =
Array.isArray(
data.history?.times
)
? data.history.times
: [];

const market =
state.marketData[symbol];

market.prices =
prices
.map(Number)
.filter(Number.isFinite);

market.ticks = [];

for (
let i = 0;
i < market.prices.length;
i++
) {

const price =
  market.prices[i];

const digit =
  extractLastDigit(
    price
  );

market.ticks.push({
  price,
  digit,
  time:
    Number(times[i]) ||
    Date.now() / 1000
});

}

market.digits =
market.ticks.map(
(tick) =>
tick.digit
);

if (market.ticks.length) {

const last =
  market.ticks[
    market.ticks.length - 1
  ];

market.lastPrice =
  last.price;

market.lastDigit =
  last.digit;

market.updated =
  Date.now();

}

analyzeMarket(
symbol
);

renderAll();

}

/* =========================================================
PROCESS TICK
========================================================= */

function processTick(tick) {

const symbol =
tick.symbol;

if (
!symbol ||
!state.marketData[symbol]
) {
return;
}

const price =
Number(tick.quote);

if (
!Number.isFinite(price)
) {
return;
}

const market =
state.marketData[symbol];

const digit =
extractLastDigit(
price
);

market.lastPrice =
price;

market.lastDigit =
digit;

market.updated =
Date.now();

market.prices.push(
price
);

market.digits.push(
digit
);

market.ticks.push({
price,
digit,
time:
Number(tick.epoch) ||
Date.now() / 1000
});

if (
market.prices.length > 100
) {
market.prices.shift();
}

if (
market.digits.length > 100
) {
market.digits.shift();
}

if (
market.ticks.length > 100
) {
market.ticks.shift();
}

state.lastTickTime =
Date.now();

analyzeMarket(
symbol
);

updateCurrentMarketUI(
symbol
);

updatePredictionUI();

renderScanner();

renderDigits();

drawChart();

}

/* =========================================================
EXTRACT LAST DIGIT
========================================================= */

function extractLastDigit(price) {

const text =
String(price);

const clean =
text.replace(
/[^0-9]/g,
""
);

if (!clean) {
return 0;
}

return Number(
clean[
clean.length - 1
]
);

}

/* =========================================================
MARKET ANALYSIS
========================================================= */

function analyzeMarket(symbol) {

const market =
state.marketData[symbol];

if (
!market ||
market.digits.length < 5
) {
return;
}

const digits =
market.digits.slice(
-60
);

const counts =
Array(10).fill(0);

digits.forEach(
(digit) => {
if (
Number.isInteger(digit) &&
digit >= 0 &&
digit <= 9
) {
counts[digit]++;
}
}
);

const total =
digits.length;

const even =
digits.filter(
(d) => d % 2 === 0
).length;

const odd =
total - even;

const high =
digits.filter(
(d) => d >= 5
).length;

const low =
total - high;

let bestDigit = 0;

let bestCount = -1;

counts.forEach(
(count, digit) => {

  if (
    count >
    bestCount
  ) {

    bestCount =
      count;

    bestDigit =
      digit;

  }

}

);

const digitFrequency =
bestCount /
Math.max(
total,
1
);

const evenRate =
even /
Math.max(
total,
1
);

const oddRate =
odd /
Math.max(
total,
1
);

const highRate =
high /
Math.max(
total,
1
);

const lowRate =
low /
Math.max(
total,
1
);

const candidates = [];

candidates.push({

strategy:
  "MATCHES",

prediction:
  String(bestDigit),

confidence:
  clamp(
    45 +
    digitFrequency * 100,
    50,
    90
  )

});

candidates.push({

strategy:
  "DIFFERS",

prediction:
  String(
    bestDigit
  ),

confidence:
  clamp(
    55 +
    (1 -
      digitFrequency) *
      25,
    55,
    90
  )

});

candidates.push({

strategy:
  "EVEN",

prediction:
  "EVEN",

confidence:
  clamp(
    50 +
    Math.abs(
      evenRate -
      .5
    ) *
    100,
    50,
    88
  )

});

candidates.push({

strategy:
  "ODD",

prediction:
  "ODD",

confidence:
  clamp(
    50 +
    Math.abs(
      oddRate -
      .5
    ) *
    100,
    50,
    88
  )

});

candidates.push({

strategy:
  "OVER",

prediction:
  "5+",

confidence:
  clamp(
    50 +
    Math.abs(
      highRate -
      .5
    ) *
    100,
    50,
    88
  )

});

candidates.push({

strategy:
  "UNDER",

prediction:
  "0-4",

confidence:
  clamp(
    50 +
    Math.abs(
      lowRate -
      .5
    ) *
    100,
    50,
    88
  )

});

const best =
candidates
.slice()
.sort(
(a,b) =>
b.confidence -
a.confidence
)[0];

market.strategy =
best.strategy;

market.prediction =
best.prediction;

market.confidence =
Math.round(
best.confidence
);

market.score =
Math.round(
market.confidence +
Math.min(
15,
total / 8
)
);

}

/* =========================================================
BEST MARKET
========================================================= */

function getBestMarket() {

const available =
MARKETS
.map(
(symbol) =>
state.marketData[symbol]
)
.filter(
(market) =>
market &&
market.digits.length >= 5
);

if (!available.length) {
return null;
}

return (
available
.slice()
.sort(
(a,b) =>
b.score -
a.score
)[0]
);

}

/* =========================================================
CURRENT MARKET UI
========================================================= */

function updateCurrentMarketUI(
symbol
) {

const market =
state.marketData[symbol];

if (!market) return;

if ($("currentChartMarket")) {

$("currentChartMarket")
  .textContent =
  symbol;

}

if ($("currentLivePrice")) {

$("currentLivePrice")
  .textContent =
  market.lastPrice === null
    ? "--"
    : market.lastPrice;

}

}

/* =========================================================
PREDICTION UI
========================================================= */

function updatePredictionUI() {

const symbol =
state.selectedMarket;

const market =
state.marketData[symbol];

if (!market) return;

if ($("aiMarket")) {

$("aiMarket")
  .textContent =
  symbol;

}

if ($("aiPrediction")) {

$("aiPrediction")
  .textContent =
  market.prediction ||
  "--";

}

if ($("aiType")) {

$("aiType")
  .textContent =
  market.strategy ||
  "--";

}

if ($("analysisConfidence")) {

$("analysisConfidence")
  .textContent =
  `${market.confidence || 0}%`;

}

if ($("confidenceFill")) {

$("confidenceFill")
  .style.width =
  `${market.confidence || 0}%`;

}

if ($("analysisMsg")) {

$("analysisMsg")
  .textContent =
  market.digits.length < 5
    ? "Waiting for sufficient tick data..."
    : `AI analyzed ${market.digits.length} recent digits on ${symbol}.`;

}

if ($("botSelectedMarket")) {

$("botSelectedMarket")
  .textContent =
  symbol;

}

if ($("botSelectedStrategy")) {

$("botSelectedStrategy")
  .textContent =
  market.strategy;

}

if ($("botScore")) {

$("botScore")
  .textContent =
  market.score;

}

if ($("botConfidence")) {

$("botConfidence")
  .textContent =
  `${market.confidence}%`;

}

if ($("aiPredictionLarge")) {

$("aiPredictionLarge")
  .textContent =
  market.prediction ||
  "--";

}

if ($("predictionConfidence")) {

$("predictionConfidence")
  .textContent =
  `${market.confidence}% confidence`;

}

}

/* =========================================================
SCANNER
========================================================= */

function renderScanner() {

const grid =
$("marketScannerGrid");

if (!grid) return;

const ready =
MARKETS.filter(
(symbol) =>
state.marketData[symbol]
.digits.length >= 5
).length;

if ($("scannerMarketCount")) {

$("scannerMarketCount")
  .textContent =
  `${ready} MARKETS`;

}

grid.innerHTML =
MARKETS.map(
(symbol) => {

    const market =
      state.marketData[symbol];

    const selected =
      symbol ===
      state.selectedMarket;

    return `

      <button
        class="market-card ${selected ? "selected" : ""}"
        data-market="${symbol}"
        type="button"
      >

        <div class="market-card-top">

          <span class="market-name">
            ${symbol}
          </span>

          <span class="market-score">
            ${market.score || 0}
          </span>

        </div>

        <div class="market-price">
          ${
            market.lastPrice === null
              ? "--"
              : market.lastPrice
          }
        </div>

        <div class="market-strategy">
          ${market.strategy}
          •
          ${market.confidence || 0}%
        </div>

        <div class="market-confidence">
          <div
            class="market-confidence-fill"
            style="width:${market.confidence || 0}%"
          ></div>
        </div>

      </button>

    `;

  }
).join("");

$$(".market-card").forEach(
(button) => {

  button.onclick =
    () => {

      selectMarket(
        button.dataset.market
      );

    };

}

);

}

/* =========================================================
SELECT MARKET
========================================================= */

function selectMarket(symbol) {

if (
!state.marketData[symbol]
) {
return;
}

state.selectedMarket =
symbol;

localStorage.setItem(
"krishwave_market",
symbol
);

updateCurrentMarketUI(
symbol
);

updatePredictionUI();

renderScanner();

renderDigits();

drawChart();

updateCircularPreview();

toast(
"${symbol} selected"
);

}

/* =========================================================
SCAN MARKETS
========================================================= */

function scanBestMarket() {

const best =
getBestMarket();

if (!best) {

toast(
  "Waiting for more live tick data"
);

return;

}

selectMarket(
best.symbol
);

toast(
"AI selected ${best.symbol} • ${best.confidence}%"
);

}

/* =========================================================
DIGIT RENDER
========================================================= */

function renderDigits() {

const grid =
$("digitStatsGrid");

if (!grid) return;

const market =
state.marketData[
state.selectedMarket
];

if (!market) return;

const counts =
Array(10).fill(0);

market.digits.forEach(
(digit) => {

  if (
    digit >= 0 &&
    digit <= 9
  ) {
    counts[digit]++;
  }

}

);

const total =
market.digits.length;

if ($("digitSampleCount")) {

$("digitSampleCount")
  .textContent =
  `${total} TICKS`;

}

const max =
Math.max(
...counts,
1
);

grid.innerHTML =
counts.map(
(count,digit) => {

    const percent =
      total
        ? Math.round(
            count /
            total *
            100
          )
        : 0;

    const height =
      Math.max(
        4,
        count /
        max *
        30
      );

    return `

      <div class="digit-stat">

        <strong>${digit}</strong>

        <div class="digit-bar">
          <div
            class="digit-bar-fill"
            style="height:${height}px"
          ></div>
        </div>

        <span>
          ${count}
          •
          ${percent}%
        </span>

      </div>

    `;

  }
).join("");

}

/* =========================================================
CHART
========================================================= */

function drawChart() {

const canvas =
$("priceChartCanvas");

if (!canvas) return;

const market =
state.marketData[
state.selectedMarket
];

if (
!market ||
!market.prices.length
) {
return;
}

const rect =
canvas.getBoundingClientRect();

const width =
Math.max(
10,
rect.width
);

const height =
Math.max(
10,
rect.height
);

const dpr =
window.devicePixelRatio ||
1;

canvas.width =
width * dpr;

canvas.height =
height * dpr;

const ctx =
canvas.getContext(
"2d"
);

ctx.scale(
dpr,
dpr
);

ctx.clearRect(
0,
0,
width,
height
);

const values =
market.prices.slice(
-60
);

if (
values.length < 2
) {
return;
}

let min =
Math.min(
...values
);

let max =
Math.max(
...values
);

if (max === min) {

max += .00001;

min -= .00001;

}

const padding =
15;

ctx.beginPath();

values.forEach(
(value,index) => {

  const x =
    padding +
    index /
    (
      values.length -
      1
    ) *
    (
      width -
      padding * 2
    );

  const y =
    height -
    padding -
    (
      value -
      min
    ) /
    (
      max -
      min
    ) *
    (
      height -
      padding * 2
    );

  if (
    index === 0
  ) {
    ctx.moveTo(
      x,
      y
    );
  } else {
    ctx.lineTo(
      x,
      y
    );
  }

}

);

ctx.strokeStyle =
getComputedStyle(
document.body
).getPropertyValue(
"--accent"
);

ctx.lineWidth =
2;

ctx.stroke();

}

/* =========================================================
CIRCULAR AI
========================================================= */

function resetCircularUI() {

state.circularPhase =
"ANALYZING";

state.circularRemaining =
10;

updateCircularUI();

}

function updateCircularUI() {

const label =
$("aiCircleLabel");

const prediction =
$("aiCirclePrediction");

const timer =
$("aiCircleTimer");

const status =
$("aiCircleStatus");

const circle =
$("aiCircle");

if (timer) {

timer.textContent =
  Math.max(
    0,
    state.circularRemaining
  );

}

if (label) {

label.textContent =
  state.circularPhase;

}

if (status) {

status.textContent =
  state.circularRunning
    ? state.circularPhase
    : "STOPPED";

status.className =
  "ai-status " +
  (
    state.circularRunning
      ? (
          state.circularPhase ===
          "TRADE NOW"
            ? "trade"
            : "running"
        )
      : "waiting"
  );

}

if (circle) {

circle.classList.toggle(
  "running",
  state.circularRunning
);

circle.classList.toggle(
  "trade-now",
  state.circularPhase ===
  "TRADE NOW"
);

}

if (prediction) {

prediction.textContent =
  state.currentPrediction
    ?.prediction ||
  "--";

}

$("cycleAnalysis")
?.classList.toggle(
"active",
state.circularPhase ===
"ANALYZING"
);

$("cyclePrediction")
?.classList.toggle(
"active",
state.circularPhase ===
"PREDICTION"
);

$("cycleCooldown")
?.classList.toggle(
"active",
state.circularPhase ===
"LOCK"
);

$("cycleTrade")
?.classList.toggle(
"active",
state.circularPhase ===
"TRADE NOW"
);

}

function updateCircularPreview() {

const market =
state.circularMarket === "AUTO"
? getBestMarket()
: state.marketData[
state.circularMarket
];

const symbol =
market?.symbol ||
state.selectedMarket;

const data =
state.marketData[symbol];

$("circularSelectedMarket")
&& (
$("circularSelectedMarket")
.textContent =
symbol
);

$("circularSelectedStrategy")
&& (
$("circularSelectedStrategy")
.textContent =
state.circularStrategy
);

$("circularSelectedPrediction")
&& (
$("circularSelectedPrediction")
.textContent =
data?.prediction ||
"--"
);

}

function startCircularAI() {

if (
state.circularRunning
) {

stopCircularAI();

return;

}

state.circularRunning =
true;

state.stopTrading =
false;

resetCircularUI();

$("startAI")
&& (
$("startAI").textContent =
"RUNNING — STOP CIRCULAR AI"
);

circularLoop();

toast(
"Circular AI started"
);

}

function stopCircularAI() {

state.circularRunning =
false;

clearTimeout(
state.circularTradeTimer
);

state.circularTradeTimer =
null;

resetCircularUI();

$("startAI")
&& (
$("startAI").textContent =
"START CIRCULAR AI"
);

toast(
"Circular AI stopped"
);

}

function circularLoop() {

if (
!state.circularRunning
) {
return;
}

const best =
state.circularMarket ===
"AUTO"
? getBestMarket()
: state.marketData[
state.circularMarket
];

if (
best
) {

state.currentPrediction =
  buildStrategyPrediction(
    best,
    state.circularStrategy
  );

state.currentPrediction.market =
  best.symbol;

}

state.circularPhase =
"ANALYZING";

state.circularRemaining =
10;

updateCircularUI();

clearTimeout(
state.circularTradeTimer
);

circularTick();

}

function circularTick() {

if (
!state.circularRunning
) {
return;
}

updateCircularUI();

if (
state.circularRemaining >
0
) {

state.circularRemaining--;

state.circularTradeTimer =
  setTimeout(
    circularTick,
    1000
  );

return;

}

if (
state.circularPhase ===
"ANALYZING"
) {

performCircularPrediction();

state.circularPhase =
  "PREDICTION";

state.circularRemaining =
  5;

updateCircularUI();

state.circularTradeTimer =
  setTimeout(
    circularTick,
    1000
  );

return;

}

if (
state.circularPhase ===
"PREDICTION"
) {

state.circularPhase =
  "LOCK";

state.circularRemaining =
  5;

updateCircularUI();

state.circularTradeTimer =
  setTimeout(
    circularTick,
    1000
  );

return;

}

if (
state.circularPhase ===
"LOCK"
) {

if (
  state.circularRemaining >
  0
) {

  state.circularRemaining--;

  state.circularTradeTimer =
    setTimeout(
      circularTick,
      1000
    );

  return;

}

state.circularPhase =
  "TRADE NOW";

state.circularRemaining =
  3;

updateCircularUI();

if (
  state.accountMode ===
  "demo"
) {

  executeCircularPaperTrade();

}

state.circularTradeTimer =
  setTimeout(
    circularTick,
    1000
  );

return;

}

if (
state.circularPhase ===
"TRADE NOW"
) {

if (
  state.circularRemaining >
  0
) {

  state.circularRemaining--;

  state.circularTradeTimer =
    setTimeout(
      circularTick,
      1000
    );

  return;

}

circularLoop();

}

}

function performCircularPrediction() {

const best =
state.circularMarket ===
"AUTO"
? getBestMarket()
: state.marketData[
state.circularMarket
];

if (!best) return;

const prediction =
buildStrategyPrediction(
best,
state.circularStrategy
);

prediction.market =
best.symbol;

state.currentPrediction =
prediction;

updateCircularPreview();

toast(
"AI prediction: ${prediction.strategy} ${prediction.prediction}"
);

}

function executeCircularPaperTrade() {

if (
!state.currentPrediction
) {
return;
}

const stake =
readStake(
$("circularStakeInput")
);

if (
state.paperBalance <
stake
) {

toast(
  "Insufficient paper balance"
);

return;

}

const market =
state.currentPrediction.market ||
state.selectedMarket;

const strategy =
state.currentPrediction.strategy;

const target =
state.currentPrediction.target;

createPaperTrade({
source:
"CIRCULAR AI",
market,
strategy,
target,
prediction:
state.currentPrediction.prediction,
stake
});

}

/* =========================================================
STRATEGY PREDICTION
========================================================= */

function buildStrategyPrediction(
market,
strategy
) {

const digits =
market?.digits ||
[];

const counts =
Array(10).fill(0);

digits
.slice(-60)
.forEach(
(digit) => {
if (
digit >= 0 &&
digit <= 9
) {
counts[digit]++;
}
}
);

let target =
0;

counts.forEach(
(count,digit) => {

  if (
    count >
    counts[target]
  ) {
    target =
      digit;
  }

}

);

if (
strategy ===
"MATCHES"
) {

return {
  strategy,
  prediction:
    String(target),
  target,
  confidence:
    market.confidence
};

}

if (
strategy ===
"DIFFERS"
) {

return {
  strategy,
  prediction:
    String(target),
  target,
  confidence:
    market.confidence
};

}

if (
strategy ===
"EVEN"
) {

return {
  strategy,
  prediction:
    "EVEN",
  target: null,
  confidence:
    market.confidence
};

}

if (
strategy ===
"ODD"
) {

return {
  strategy,
  prediction:
    "ODD",
  target: null,
  confidence:
    market.confidence
};

}

if (
strategy ===
"OVER"
) {

return {
  strategy,
  prediction:
    "5+",
  target: 4,
  confidence:
    market.confidence
};

}

return {

strategy:
  "UNDER",

prediction:
  "0-4",

target: 5,

confidence:
  market.confidence

};

}

/* =========================================================
AI BOT
========================================================= */

function startBot() {

if (
state.botRunning
) {

stopBot();

return;

}

state.botRunning =
true;

state.stopTrading =
false;

$("botStatusDash")
&& (
$("botStatusDash").textContent =
"RUNNING"
);

$("botStatusDash")
?.classList.add(
"running"
);

$("startBotBtn")
&& (
$("startBotBtn").textContent =
"STOP AI BOT"
);

runBotCycle();

toast(
"AI Bot started"
);

}

function stopBot() {

state.botRunning =
false;

clearTimeout(
state.botTimer
);

state.botTimer =
null;

$("botStatusDash")
&& (
$("botStatusDash").textContent =
"STOPPED"
);

$("botStatusDash")
?.classList.remove(
"running"
);

$("startBotBtn")
&& (
$("startBotBtn").textContent =
"START AI BOT"
);

}

function runBotCycle() {

if (
!state.botRunning
) {
return;
}

const best =
getBestMarket();

if (!best) {

state.botTimer =
  setTimeout(
    runBotCycle,
    3000
  );

return;

}

selectMarket(
best.symbol
);

const strategies =
state.botStrategies.length
? state.botStrategies
: ["MATCHES","DIFFERS"];

const strategy =
chooseBotStrategy(
best,
strategies
);

const prediction =
buildStrategyPrediction(
best,
strategy
);

$("botSelectedStrategy")
&& (
$("botSelectedStrategy")
.textContent =
strategy
);

$("aiPredictionLarge")
&& (
$("aiPredictionLarge")
.textContent =
prediction.prediction
);

if (
state.accountMode ===
"demo"
) {

const stake =
  readStake(
    $("stakeInput")
  );

if (
  state.paperBalance >=
  stake
) {

  createPaperTrade({
    source:
      "AI BOT",
    market:
      best.symbol,
    strategy,
    target:
      prediction.target,
    prediction:
      prediction.prediction,
    stake
  });

} else {

  toast(
    "AI Bot stopped: insufficient balance"
  );

  stopBot();

  return;

}

}

state.botTimer =
setTimeout(
runBotCycle,
10000
);

}

function chooseBotStrategy(
market,
strategies
) {

const allowed =
strategies.filter(
(strategy) =>
STRATEGIES.includes(
strategy
)
);

if (!allowed.length) {
return "MATCHES";
}

const ranked =
allowed.map(
(strategy) => {

    const prediction =
      buildStrategyPrediction(
        market,
        strategy
      );

    return {
      strategy,
      confidence:
        prediction.confidence ||
        0
    };

  }
);

ranked.sort(
(a,b) =>
b.confidence -
a.confidence
);

return ranked[0].strategy;

}

/* =========================================================
PAPER TRADING
========================================================= */

function readStake(input) {

const value =
Number(
input?.value
);

if (
!Number.isFinite(value) ||
value <
MIN_STAKE
) {

if (input) {
  input.value =
    MIN_STAKE;
}

return MIN_STAKE;

}

return Math.round(
value * 100
) / 100;

}

function createPaperTrade({
source,
market,
strategy,
target,
prediction,
stake
}) {

if (
state.paperBalance <
stake
) {

toast(
  "Insufficient paper balance"
);

return;

}

const trade = {

id:
  ++state.paperTradeCounter,

time:
  Date.now(),

source,

market,

strategy,

target,

prediction,

stake,

status:
  "ACTIVE",

amountWon:
  0,

profit:
  0

};

state.paperBalance -=
stake;

state.activeTrades.unshift(
trade
);

state.totalStake +=
stake;

renderActiveTrades();

updateAccountDisplay();

setTimeout(
() => settlePaperTrade(
trade
),
2500
);

}

function settlePaperTrade(
trade
) {

const market =
state.marketData[
trade.market
];

if (!market) {

setTimeout(
  () =>
    settlePaperTrade(
      trade
    ),
  1000
);

return;

}

const digit =
market.lastDigit;

const won =
evaluateTrade(
trade,
digit
);

let amountWon =
0;

let profit =
-trade.stake;

if (won) {

amountWon =
  trade.stake +
  trade.stake *
  (
    PAYOUT[
      trade.strategy
    ] ||
    .95
  );

profit =
  amountWon -
  trade.stake;

state.paperBalance +=
  amountWon;

state.wins++;

} else {

state.losses++;

}

trade.status =
won
? "WON"
: "LOST";

trade.resultDigit =
digit;

trade.amountWon =
amountWon;

trade.profit =
profit;

state.totalAmountWon +=
amountWon;

state.totalProfit +=
profit;

state.activeTrades =
state.activeTrades.filter(
(item) =>
item.id !==
trade.id
);

state.history.unshift(
{
...trade
}
);

if (
state.history.length >
300
) {

state.history =
  state.history.slice(
    0,
    300
  );

}

saveState();

renderAll();

toast(
won
? "TRADE WON +${formatMoney(profit)}"
: "TRADE LOST ${formatMoney(profit)}"
);

}

function evaluateTrade(
trade,
digit
) {

if (
!Number.isFinite(digit)
) {
return false;
}

if (
trade.strategy ===
"MATCHES"
) {

return (
  digit ===
  Number(
    trade.target
  )
);

}

if (
trade.strategy ===
"DIFFERS"
) {

return (
  digit !==
  Number(
    trade.target
  )
);

}

if (
trade.strategy ===
"EVEN"
) {

return digit % 2 === 0;

}

if (
trade.strategy ===
"ODD"
) {

return digit % 2 !== 0;

}

if (
trade.strategy ===
"OVER"
) {

return digit > 4;

}

if (
trade.strategy ===
"UNDER"
) {

return digit < 5;

}

return false;

}

/* =========================================================
MANUAL TRADE
========================================================= */

function placeManualTrade() {

if (
state.accountMode !==
"demo"
) {

toast(
  "Real trading requires authenticated execution"
);

return;

}

const market =
$("manualMarketSelect")
?.value ||
state.selectedMarket;

const strategy =
state.manualStrategy;

let target =
null;

if (
strategy ===
"MATCHES" ||
strategy ===
"DIFFERS"
) {

target =
  Number(
    $("manualTargetDigitInput")
      ?.value
  );

if (
  !Number.isInteger(
    target
  ) ||
  target < 0 ||
  target > 9
) {

  toast(
    "Enter a target digit from 0 to 9"
  );

  return;

}

}

const stake =
readStake(
$("manualStakeInput")
);

createPaperTrade({

source:
  "MANUAL",

market,

strategy,

target,

prediction:
  strategy ===
  "MATCHES" ||
  strategy ===
  "DIFFERS"
    ? String(target)
    : strategy,

stake

});

}

/* =========================================================
HISTORY
========================================================= */

function renderHistory() {

const list =
$("historyCardsList");

if (!list) return;

if (
$("historyCount")
) {

$("historyCount")
  .textContent =
  `${state.history.length} TRADES`;

}

if (
!state.history.length
) {

list.innerHTML =
  `
    <div class="empty-state">
      No trades recorded yet.
    </div>
  `;

return;

}

list.innerHTML =
state.history.map(
(trade) => {

    const win =
      trade.status ===
      "WON";

    return `

      <div
        class="history-card ${
          win
            ? "history-win"
            : "history-loss"
        }"
      >

        <div class="history-card-top">

          <div>
            <strong>
              ${trade.source}
            </strong>

            <div class="small-label">
              ${trade.market}
              •
              ${trade.strategy}
            </div>
          </div>

          <span
            class="history-result ${
              win
                ? "win"
                : "loss"
            }"
          >
            ${
              win
                ? "WON"
                : "LOST"
            }
          </span>

        </div>

        <div class="history-card-grid">

          <div>
            <span>TIME</span>
            <strong>
              ${formatTime(
                trade.time
              )}
            </strong>
          </div>

          <div>
            <span>PREDICTION</span>
            <strong>
              ${trade.prediction ?? "--"}
            </strong>
          </div>

          <div>
            <span>RESULT</span>
            <strong>
              ${trade.resultDigit ?? "--"}
            </strong>
          </div>

          <div>
            <span>STAKE</span>
            <strong>
              ${formatMoney(
                trade.stake
              )}
            </strong>
          </div>

          <div>
            <span>AMOUNT WON</span>
            <strong class="${
              win
                ? "history-profit"
                : ""
            }">
              ${formatMoney(
                trade.amountWon
              )}
            </strong>
          </div>

          <div>
            <span>NET PROFIT</span>
            <strong class="${
              trade.profit >= 0
                ? "history-profit"
                : "history-loss-value"
            }">
              ${
                trade.profit >= 0
                  ? "+"
                  : ""
              }${formatMoney(
                trade.profit
              )}
            </strong>
          </div>

        </div>

      </div>

    `;

  }
).join("");

}

function updateHistorySummary() {

const totalProfit =
state.history.reduce(
(sum,trade) =>
sum +
Number(
trade.profit
),
0
);

const totalStake =
state.history.reduce(
(sum,trade) =>
sum +
Number(
trade.stake
),
0
);

const amountWon =
state.history.reduce(
(sum,trade) =>
sum +
Number(
trade.amountWon
),
0
);

if (
$("totalProfitDisplay")
) {

$("totalProfitDisplay")
  .textContent =
  formatMoney(
    totalProfit
  );

}

if (
$("historyTotalStake")
) {

$("historyTotalStake")
  .textContent =
  formatMoney(
    totalStake
  );

}

if (
$("historyAmountWon")
) {

$("historyAmountWon")
  .textContent =
  formatMoney(
    amountWon
  );

}

if (
$("historyNetProfit")
) {

$("historyNetProfit")
  .textContent =
  formatMoney(
    totalProfit
  );

}

if (
$("sessionProfitDisplay")
) {

$("sessionProfitDisplay")
  .textContent =
  formatMoney(
    totalProfit
  );

}

}

/* =========================================================
ACTIVE TRADES
========================================================= */

function renderActiveTrades() {

const list =
$("activeTradesList");

if (!list) return;

if (
$("activeTradeCount")
) {

$("activeTradeCount")
  .textContent =
  state.activeTrades.length;

}

if (
!state.activeTrades.length
) {

list.innerHTML =
  `
    <div class="empty-state">
      No active paper trades.
    </div>
  `;

return;

}

list.innerHTML =
state.activeTrades.map(
(trade) => `

    <div class="active-trade-card">

      <div>
        <span>ENGINE</span>
        <strong>${trade.source}</strong>
      </div>

      <div>
        <span>MARKET</span>
        <strong>${trade.market}</strong>
      </div>

      <div>
        <span>STRATEGY</span>
        <strong>${trade.strategy}</strong>
      </div>

      <div>
        <span>STAKE</span>
        <strong>${formatMoney(
          trade.stake
        )}</strong>
      </div>

    </div>

  `
).join("");

}

/* =========================================================
STATS
========================================================= */

function updateStats() {

const total =
state.wins +
state.losses;

const accuracy =
total
? Math.round(
state.wins /
total *
100
)
: 0;

$("paperTotal")
&& (
$("paperTotal")
.textContent =
total
);

$("paperWins")
&& (
$("paperWins")
.textContent =
state.wins
);

$("paperLosses")
&& (
$("paperLosses")
.textContent =
state.losses
);

$("paperAccuracy")
&& (
$("paperAccuracy")
.textContent =
"${accuracy}%"
);

}

/* =========================================================
FORMAT TIME
========================================================= */

function formatTime(
timestamp
) {

try {

return new Date(
  timestamp
).toLocaleTimeString(
  [],
  {
    hour:
      "2-digit",
    minute:
      "2-digit",
    second:
      "2-digit"
  }
);

} catch {

return "--";

}

}

/* =========================================================
SAVE STATE
========================================================= */

function saveState() {

localStorage.setItem(
"krishwave_history",
JSON.stringify(
state.history
)
);

localStorage.setItem(
"krishwave_paper_balance",
String(
state.paperBalance
)
);

localStorage.setItem(
"krishwave_manual_strategy",
state.manualStrategy
);

localStorage.setItem(
"krishwave_circular_strategy",
state.circularStrategy
);

localStorage.setItem(
"krishwave_circular_market",
state.circularMarket
);

localStorage.setItem(
"krishwave_bot_strategies",
JSON.stringify(
state.botStrategies
)
);

}

/* =========================================================
RESTORE STATISTICS
========================================================= */

function restoreStatistics() {

state.wins =
state.history.filter(
(trade) =>
trade.status ===
"WON"
).length;

state.losses =
state.history.filter(
(trade) =>
trade.status ===
"LOST"
).length;

state.totalProfit =
state.history.reduce(
(sum,trade) =>
sum +
Number(
trade.profit
),
0
);

state.totalStake =
state.history.reduce(
(sum,trade) =>
sum +
Number(
trade.stake
),
0
);

state.totalAmountWon =
state.history.reduce(
(sum,trade) =>
sum +
Number(
trade.amountWon
),
0
);

}

/* =========================================================
STRATEGY MODAL
========================================================= */

function openStrategyModal(
target
) {

state.modalTarget =
target;

$("strategyModal")
?.classList.add(
"show"
);

$$(".strategy-option")
.forEach(
(button) => {

    const strategy =
      button.dataset.strategy;

    let selected =
      false;

    if (
      target ===
      "manual"
    ) {

      selected =
        strategy ===
        state.manualStrategy;

    }

    if (
      target ===
      "circular"
    ) {

      selected =
        strategy ===
        state.circularStrategy;

    }

    button.classList.toggle(
      "selected",
      selected
    );

  }
);

}

function closeStrategyModal() {

$("strategyModal")
?.classList.remove(
"show"
);

}

/* =========================================================
BOT STRATEGY MODAL
========================================================= */

function openBotStrategyModal() {

$("botStrategyModal")
?.classList.add(
"show"
);

$$(".bot-strategy-check")
.forEach(
(checkbox) => {

    checkbox.checked =
      state.botStrategies.includes(
        checkbox.value
      );

  }
);

}

function closeBotStrategyModal() {

$("botStrategyModal")
?.classList.remove(
"show"
);

}

function applyBotStrategies() {

const selected =
$$(".bot-strategy-check")
.filter(
(checkbox) =>
checkbox.checked
)
.map(
(checkbox) =>
checkbox.value
);

if (!selected.length) {

toast(
  "Select at least one strategy"
);

return;

}

state.botStrategies =
selected;

saveState();

updateBotStrategyLabel();

closeBotStrategyModal();

toast(
"AI Bot strategies updated"
);

}

function updateBotStrategyLabel() {

const text =
state.botStrategies.join(
" + "
);

$("botStrategyLabel")
&& (
$("botStrategyLabel")
.textContent =
text
);

}

/* =========================================================
TARGET DIGIT VISIBILITY
========================================================= */

function updateTargetDigitVisibility() {

const show =
state.manualStrategy ===
"MATCHES" ||
state.manualStrategy ===
"DIFFERS";

const box =
$("targetDigitContainer");

if (!box) return;

box.style.display =
show
? "block"
: "none";

}

/* =========================================================
ACCOUNT / OAUTH
========================================================= */

async function loadBackendConfig() {

try {

const response =
  await fetch(
    `${BACKEND_URL}/api/config`,
    {
      method:
        "GET"
    }
  );

const data =
  await response.json();

if (
  data?.success &&
  data.client_id
) {

  state.oauthClientId =
    data.client_id;

  state.oauthReady =
    true;

} else {

  state.oauthClientId =
    FALLBACK_CLIENT_ID;

}

} catch (error) {

console.warn(
  "Backend config unavailable:",
  error
);

state.oauthClientId =
  FALLBACK_CLIENT_ID;

}

}

/* =========================================================
PKCE
========================================================= */

function randomString(
length = 64
) {

const bytes =
new Uint8Array(
length
);

crypto.getRandomValues(
bytes
);

return Array
.from(bytes)
.map(
(byte) =>
String.fromCharCode(
65 +
byte %
26
)
)
.join("");

}

function base64UrlEncode(
buffer
) {

const bytes =
new Uint8Array(
buffer
);

let binary = "";

bytes.forEach(
(byte) => {
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
/+/g,
"-"
)
.replace(
///g,
"_"
)
.replace(
/=+$/,
""
);

}

async function sha256(
value
) {

const data =
new TextEncoder()
.encode(
value
);

return crypto.subtle.digest(
"SHA-256",
data
);

}

async function createPKCE() {

const verifier =
randomString(
64
);

const digest =
await sha256(
verifier
);

const challenge =
base64UrlEncode(
digest
);

return {
verifier,
challenge
};

}

/* =========================================================
START DERIV OAUTH
========================================================= */

async function connectDeriv() {

await loadBackendConfig();

const {
verifier,
challenge
} =
await createPKCE();

const stateValue =
randomString(
32
);

sessionStorage.setItem(
"krishwave_pkce_verifier",
verifier
);

sessionStorage.setItem(
"krishwave_oauth_state",
stateValue
);

const params =
new URLSearchParams();

params.set(
"response_type",
"code"
);

params.set(
"client_id",
state.oauthClientId ||
FALLBACK_CLIENT_ID
);

params.set(
"redirect_uri",
FRONTEND_REDIRECT
);

params.set(
"scope",
"trade"
);

params.set(
"state",
stateValue
);

params.set(
"code_challenge",
challenge
);

params.set(
"code_challenge_method",
"S256"
);

toast(
"Opening Deriv authorization..."
);

window.location.href =
"${DERIV_AUTH_URL}?${params.toString()}";

}

/* =========================================================
HANDLE OAUTH CALLBACK
========================================================= */

async function handleOAuthCallback() {

const params =
new URLSearchParams(
window.location.search
);

const code =
params.get(
"code"
);

const returnedState =
params.get(
"state"
);

const error =
params.get(
"error"
);

if (error) {

toast(
  `Deriv authorization failed: ${error}`
);

cleanUrl();

return;

}

if (!code) {
return;
}

const savedState =
sessionStorage.getItem(
"krishwave_oauth_state"
);

const verifier =
sessionStorage.getItem(
"krishwave_pkce_verifier"
);

if (
!savedState ||
savedState !==
returnedState
) {

toast(
  "OAuth security check failed"
);

cleanUrl();

return;

}

if (!verifier) {

toast(
  "PKCE verifier missing"
);

cleanUrl();

return;

}

setConnection(
"connecting",
"AUTHENTICATING"
);

setDataStatus(
"Completing secure Deriv login..."
);

try {

const response =
  await fetch(
    `${BACKEND_URL}/api/oauth/exchange`,
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
  !data.success ||
  !data.session_id
) {

  throw new Error(
    data.error ||
    "OAuth exchange failed"
  );

}

state.sessionId =
  data.session_id;

sessionStorage.setItem(
  "krishwave_session_id",
  state.sessionId
);

sessionStorage.removeItem(
  "krishwave_pkce_verifier"
);

sessionStorage.removeItem(
  "krishwave_oauth_state"
);

cleanUrl();

toast(
  "Deriv account connected"
);

await loadAccounts();

} catch (error) {

console.error(
  "OAuth callback:",
  error
);

toast(
  error.message ||
  "Unable to connect Deriv"
);

setConnection(
  "offline",
  "OFFLINE"
);

setDataStatus(
  "Deriv authorization failed"
);

}

}

function cleanUrl() {

try {

const clean =
  window.location.origin +
  window.location.pathname;

window.history.replaceState(
  {},
  document.title,
  clean
);

} catch {}

}

/* =========================================================
LOAD ACCOUNTS
========================================================= */

async function loadAccounts() {

if (!state.sessionId) {

toast(
  "No Deriv session found"
);

return;

}

try {

const response =
  await fetch(
    `${BACKEND_URL}/api/accounts`,
    {
      method:
        "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body:
        JSON.stringify({
          session_id:
            state.sessionId
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
    "Unable to retrieve accounts"
  );

}

const accounts =
  Array.isArray(
    data.accounts
  )
    ? data.accounts
    : [];

if (!accounts.length) {

  toast(
    "No Deriv accounts returned"
  );

  return;

}

state.accountConnected =
  true;

const demo =
  accounts.find(
    (account) =>
      isDemoAccount(
        account
      )
  );

const real =
  accounts.find(
    (account) =>
      !isDemoAccount(
        account
      )
  );

const chosen =
  state.accountMode ===
  "real"
    ? (
        real ||
        demo ||
        accounts[0]
      )
    : (
        demo ||
        accounts[0]
      );

applyAccount(
  chosen
);

setConnection(
  "online",
  "DERIV LIVE"
);

setDataStatus(
  "Deriv account connected • live market feed active"
);

toast(
  "Deriv account loaded"
);

if (
  chosen
) {

  await connectAuthenticatedAccount(
    chosen
  );

}

} catch (error) {

console.error(
  "Accounts:",
  error
);

toast(
  error.message ||
  "Unable to load Deriv accounts"
);

}

}

/* =========================================================
DEMO DETECTION
========================================================= */

function isDemoAccount(
account
) {

const text =
JSON.stringify(
account
).toLowerCase();

return (
text.includes(
"demo"
) ||
text.includes(
"virtual"
) ||
text.includes(
"paper"
)
);

}

/* =========================================================
APPLY ACCOUNT
========================================================= */

function applyAccount(
account
) {

if (!account) return;

state.selectedAccountId =
account.id ||
account.account_id ||
account.loginid ||
"";

state.currency =
account.currency ||
account.currency_code ||
"USD";

const balance =
Number(
account.balance
);

if (
Number.isFinite(balance)
) {

state.liveBalance =
  balance;

}

updateAccountDisplay();

}

/* =========================================================
AUTHENTICATED WEBSOCKET
========================================================= */

async function connectAuthenticatedAccount(
account
) {

if (!state.sessionId) {
return;
}

const accountId =
account.id ||
account.account_id ||
account.loginid;

if (!accountId) {
return;
}

try {

const response =
  await fetch(
    `${BACKEND_URL}/api/otp`,
    {
      method:
        "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body:
        JSON.stringify({
          session_id:
            state.sessionId,
          account_id:
            accountId
        })
    }
  );

const data =
  await response.json();

if (
  !response.ok ||
  !data.success ||
  !data.websocket_url
) {

  throw new Error(
    data.error ||
    "Unable to authenticate WebSocket"
  );

}

openAuthenticatedSocket(
  data.websocket_url
);

} catch (error) {

console.warn(
  "Authenticated WebSocket:",
  error
);

toast(
  "Account connected; authenticated feed unavailable"
);

}

}

/* =========================================================
AUTH WS
========================================================= */

function openAuthenticatedSocket(
url
) {

try {

if (
  state.authSocket
) {

  try {
    state.authSocket.close();
  } catch {}

}

const ws =
  new WebSocket(
    url
  );

state.authSocket =
  ws;

ws.onopen =
  () => {

    state.authReconnectAttempts =
      0;

    sendAuth({
      balance: 1,
      subscribe: 1
    });

    setDataStatus(
      "Authenticated Deriv account feed connected"
    );

  };

ws.onmessage =
  (event) => {

    handleAuthMessage(
      event.data
    );

  };

ws.onerror =
  (error) => {

    console.warn(
      "Auth WS error:",
      error
    );

  };

ws.onclose =
  () => {

    state.authSocket =
      null;

  };

} catch (error) {

console.warn(
  "Auth socket:",
  error
);

}

}

/* =========================================================
SEND AUTH
========================================================= */

function sendAuth(payload) {

if (
state.authSocket &&
state.authSocket.readyState ===
WebSocket.OPEN
) {

try {

  state.authSocket.send(
    JSON.stringify(
      payload
    )
  );

} catch {}

}

}

/* =========================================================
AUTH MESSAGE
========================================================= */

function handleAuthMessage(
raw
) {

let data;

try {

data =
  JSON.parse(
    raw
  );

} catch {

return;

}

if (
data.error
) {

console.warn(
  "Authenticated Deriv error:",
  data.error
);

return;

}

if (
data.balance
) {

const value =
  Number(
    data.balance.balance
  );

if (
  Number.isFinite(
    value
  )
) {

  state.liveBalance =
    value;

  if (
    state.accountMode ===
    "real"
  ) {

    updateAccountDisplay();

  }

}

}

}

/* =========================================================
REAL MODE
========================================================= */

function requestRealMode() {

$("realConfirmModal")
?.classList.add(
"show"
);

}

function cancelRealMode() {

$("realConfirmModal")
?.classList.remove(
"show"
);

}

async function confirmRealMode() {

$("realConfirmModal")
?.classList.remove(
"show"
);

state.accountMode =
"real";

updateModeUI();

if (
state.sessionId
) {

await loadAccounts();

} else {

toast(
  "Connect Deriv first to use a real account"
);

state.accountMode =
  "demo";

updateModeUI();

}

}

/* =========================================================
DEMO MODE
========================================================= */

async function useDemoMode() {

state.accountMode =
"demo";

updateModeUI();

updateAccountDisplay();

if (
state.sessionId
) {

await loadAccounts();

}

toast(
"Demo / Paper mode active"
);

}

/* =========================================================
STOP ALL
========================================================= */

function stopAllTrading() {

state.stopTrading =
true;

stopBot();

stopCircularAI();

$("tradingStatusLabel")
&& (
$("tradingStatusLabel")
.textContent =
"STOPPED"
);

toast(
"All trading engines stopped"
);

}

/* =========================================================
CLEAR HISTORY
========================================================= */

function clearHistory() {

const okay =
window.confirm(
"Clear all KRISHWAVE trade history?"
);

if (!okay) {
return;
}

state.history =
[];

state.wins =
0;

state.losses =
0;

state.totalProfit =
0;

state.totalStake =
0;

state.totalAmountWon =
0;

saveState();

renderAll();

toast(
"Trade history cleared"
);

}

/* =========================================================
EVENT LISTENERS
========================================================= */

function setupEvents() {

$("themeToggle")
?.addEventListener(
"click",
toggleTheme
);

$("connectDerivBtn")
?.addEventListener(
"click",
connectDeriv
);

$("demoModeBtn")
?.addEventListener(
"click",
useDemoMode
);

$("realModeBtn")
?.addEventListener(
"click",
requestRealMode
);

$("confirmRealBtn")
?.addEventListener(
"click",
confirmRealMode
);

$("cancelRealBtn")
?.addEventListener(
"click",
cancelRealMode
);

$("scanMarketsBtn")
?.addEventListener(
"click",
scanBestMarket
);

$("startAI")
?.addEventListener(
"click",
startCircularAI
);

$("stopAI")
?.addEventListener(
"click",
stopCircularAI
);

$("tabAiBot")
?.addEventListener(
"click",
() =>
setEngine(
"ai"
)
);

$("tabCircularAI")
?.addEventListener(
"click",
() =>
setEngine(
"circular"
)
);

$("tabManual")
?.addEventListener(
"click",
() =>
setEngine(
"manual"
)
);

$("startBotBtn")
?.addEventListener(
"click",
startBot
);

$("startCircularTradeBtn")
?.addEventListener(
"click",
() => {

    if (
      !state.circularRunning
    ) {

      startCircularAI();

    }

    setEngine(
      "circular"
    );

  }
);

$("placeTradeBtn")
?.addEventListener(
"click",
placeManualTrade
);

$("botStrategyTrigger")
?.addEventListener(
"click",
openBotStrategyModal
);

$("closeBotStrategyModal")
?.addEventListener(
"click",
closeBotStrategyModal
);

$("applyBotStrategies")
?.addEventListener(
"click",
applyBotStrategies
);

$("circularStrategyTrigger")
?.addEventListener(
"click",
() =>
openStrategyModal(
"circular"
)
);

$("manualStrategyTrigger")
?.addEventListener(
"click",
() =>
openStrategyModal(
"manual"
)
);

$("closeStrategyModal")
?.addEventListener(
"click",
closeStrategyModal
);

$$(".strategy-option")
.forEach(
(button) => {

    button.addEventListener(
      "click",
      () => {

        const strategy =
          button.dataset.strategy;

        if (
          state.modalTarget ===
          "manual"
        ) {

          state.manualStrategy =
            strategy;

          $("manualSelectedStrategyLabel")
            && (
              $("manualSelectedStrategyLabel")
                .textContent =
                strategy
            );

          updateTargetDigitVisibility();

          saveState();

        }

        if (
          state.modalTarget ===
          "circular"
        ) {

          state.circularStrategy =
            strategy;

          $("circularStrategyLabel")
            && (
              $("circularStrategyLabel")
                .textContent =
                strategy
            );

          updateCircularPreview();

          saveState();

        }

        closeStrategyModal();

      }
    );

  }
);

$("manualMarketSelect")
?.addEventListener(
"change",
(event) => {

    selectMarket(
      event.target.value
    );

  }
);

$("circularMarketSelect")
?.addEventListener(
"change",
(event) => {

    state.circularMarket =
      event.target.value;

    saveState();

    updateCircularPreview();

  }
);

$("clearLogsBtn")
?.addEventListener(
"click",
clearHistory
);

$("stopTradingBtn")
?.addEventListener(
"click",
stopAllTrading
);

$$(".nav-btn")
.forEach(
(button) => {

    button.addEventListener(
      "click",
      () => {

        showPage(
          button.dataset.page
        );

      }
    );

  }
);

window.addEventListener(
"resize",
() => {

  drawChart();

}

);

}

/* =========================================================
POPULATE MARKET SELECTORS
========================================================= */

function populateMarketSelectors() {

const manual =
$("manualMarketSelect");

const circular =
$("circularMarketSelect");

if (manual) {

manual.innerHTML =
  MARKETS.map(
    (symbol) =>
      `<option value="${symbol}">
        ${symbol}
      </option>`
  ).join("");

manual.value =
  state.selectedMarket;

}

if (circular) {

circular.innerHTML =
  `
    <option value="AUTO">
      AUTO — BEST MARKET
    </option>
  ` +
  MARKETS.map(
    (symbol) =>
      `<option value="${symbol}">
        ${symbol}
      </option>`
  ).join("");

circular.value =
  state.circularMarket;

}

}

/* =========================================================
INITIAL RENDER
========================================================= */

function renderAll() {

updateModeUI();

updateAccountDisplay();

renderScanner();

renderDigits();

updatePredictionUI();

updateCircularPreview();

renderActiveTrades();

renderHistory();

updateHistorySummary();

updateStats();

updateCircularUI();

updateBotStrategyLabel();

updateTargetDigitVisibility();

updateCurrentMarketUI(
state.selectedMarket
);

drawChart();

}

/* =========================================================
STARTUP
========================================================= */

async function init() {

applyTheme();

restoreStatistics();

populateMarketSelectors();

setupEvents();

renderAll();

showPage(
"analysis"
);

setConnection(
"connecting",
"CONNECTING"
);

setDataStatus(
"Starting KRISHWAVE AI BEAST..."
);

await handleOAuthCallback();

await loadBackendConfig();

connectPublicSocket();

setTimeout(
() => {

  if (
    state.sessionId
  ) {

    loadAccounts();

  }

},
500

);

setTimeout(
() => {

  const best =
    getBestMarket();

  if (best) {

    selectMarket(
      best.symbol
    );

  }

},
5000

);

}

/* =========================================================
START
========================================================= */

if (
document.readyState ===
"loading"
) {

document.addEventListener(
"DOMContentLoaded",
init
);

} else {

init();

}