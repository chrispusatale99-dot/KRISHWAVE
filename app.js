/* =========================================================
   KRISHWAVE AI BEAST V7.2
   DERIV LIVE MARKET INTELLIGENCE + PAPER TRADE ENGINE

   FEATURES
   ---------------------------------------------------------
   • Live Deriv public tick data
   • 15 volatility markets
   • Digit analysis 0–9
   • MATCHES / DIFFERS / OVER / UNDER / EVEN / ODD
   • AI market scanner
   • Circular AI: 10s ANALYZE → 5s LOCK → 3s TRADE NOW
   • AI BOT paper engine
   • Manual paper engine
   • Paper balance
   • Take profit / stop loss
   • Martingale
   • Complete trade history
   • Amount won
   • Net profit
   • Demo / Real protection
   • OAuth backend connection
   • Light / Dark mode

   IMPORTANT:
   NO REAL TRADES ARE EXECUTED BY THIS VERSION.
========================================================= */


/* =========================================================
   CONFIG
========================================================= */

const BACKEND_URL =
  "https://krishwave-oauth.onrender.com";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";


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


const MARKET_NAMES = {
  R_10: "Volatility 10",
  R_25: "Volatility 25",
  R_50: "Volatility 50",
  R_75: "Volatility 75",
  R_100: "Volatility 100",

  "1HZ10V": "Volatility 10 (1s)",
  "1HZ25V": "Volatility 25 (1s)",
  "1HZ30V": "Volatility 30 (1s)",
  "1HZ50V": "Volatility 50 (1s)",
  "1HZ75V": "Volatility 75 (1s)",
  "1HZ90V": "Volatility 90 (1s)",
  "1HZ100V": "Volatility 100 (1s)",
  "1HZ150V": "Volatility 150 (1s)",
  "1HZ250V": "Volatility 250 (1s)",
  "1HZ1000V": "Volatility 1000 (1s)"
};


const STRATEGIES = [
  "MATCHES",
  "DIFFERS",
  "OVER",
  "UNDER",
  "EVEN",
  "ODD"
];


/*
   These are PAPER assumptions only.
   They are not Deriv live payout quotes.
*/
const PAPER_MULTIPLIERS = {
  MATCHES: 8.5,
  DIFFERS: 0.09,
  OVER: 0.95,
  UNDER: 0.95,
  EVEN: 0.95,
  ODD: 0.95
};


const DEFAULT_PAPER_BALANCE = 1000;

const STORAGE = {
  history: "krishwave_v72_history",
  balance: "krishwave_v72_balance",
  theme: "krishwave_v72_theme"
};


/* =========================================================
   STATE
========================================================= */

const state = {

  page: "analysis",

  engine: "ai",

  theme:
    localStorage.getItem(STORAGE.theme) ||
    "dark",

  accountMode: "DEMO",

  connected: false,

  sessionId:
    localStorage.getItem("krishwave_session") ||
    null,

  account: null,

  currency: "USD",

  paperBalance:
    Number(
      localStorage.getItem(STORAGE.balance)
    ) || DEFAULT_PAPER_BALANCE,

  history:
    loadJSON(
      STORAGE.history,
      []
    ),

  activeTrades: [],

  totalTicks: 0,

  selectedMarket: "R_10",

  selectedStrategy: "MATCHES",

  botStrategyPool: [
    "MATCHES",
    "DIFFERS"
  ],

  markets: {},

  publicSocket: null,

  authenticatedSocket: null,

  reconnectTimer: null,

  publicReconnectAttempts: 0,

  circularRunning: false,

  circularStage: "READY",

  circularTimer: 0,

  circularPrediction: null,

  circularMarket: "R_10",

  circularStrategy: "MATCHES",

  circularInterval: null,

  circularNextTickTime: 0,

  botRunning: false,

  botInterval: null,

  botLastTrade: 0,

  scannerTimer: null,

  chartMarket: "R_10",

  chartHistory: [],

  manualStrategy: "MATCHES",

  pendingStrategyTarget: null,

  toastTimer: null,

  oauthState: null,

  oauthVerifier: null
};


/* =========================================================
   MARKET STATE
========================================================= */

function createMarketState(symbol){

  return {

    symbol,

    ticks: [],

    prices: [],

    digits: [],

    lastPrice: null,

    lastDigit: null,

    lastTime: 0,

    connected: false,

    tickCount: 0,

    distribution:
      Array(10).fill(0),

    stats: {

      even: 0,
      odd: 0,

      over: Array(10).fill(0),
      under: Array(10).fill(0),

      recentMatches: 0,
      recentDiffers: 0
    }
  };
}


MARKETS.forEach(
  symbol => {
    state.markets[symbol] =
      createMarketState(symbol);
  }
);


/* =========================================================
   DOM HELPER
========================================================= */

function $(id){

  return document.getElementById(id);
}


function all(selector){

  return Array.from(
    document.querySelectorAll(selector)
  );
}


/* =========================================================
   SAFE JSON
========================================================= */

function loadJSON(key, fallback){

  try{

    const value =
      localStorage.getItem(key);

    if(!value){
      return fallback;
    }

    const parsed =
      JSON.parse(value);

    return parsed;

  }catch(error){

    console.warn(
      "Storage read error",
      error
    );

    return fallback;
  }
}


function saveJSON(key, value){

  try{

    localStorage.setItem(
      key,
      JSON.stringify(value)
    );

  }catch(error){

    console.warn(
      "Storage save error",
      error
    );
  }
}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);


async function init(){

  applyTheme();

  populateMarketSelectors();

  setupNavigation();

  setupEngineTabs();

  setupStrategyControls();

  setupAccountControls();

  setupRiskControls();

  setupTradingControls();

  setupCircularControls();

  setupBotControls();

  setupHistoryControls();

  setupCanvasResize();

  renderDigitStats();

  renderStats();

  renderHistory();

  renderActiveTrades();

  updateBalanceDisplay();

  updateManualTargetVisibility();

  updateConnection(
    false,
    "Connecting..."
  );

  initializeMarketData();

  handleOAuthCallback();

  await loadBackendConfig();

  autoRestoreSession();

  startScannerLoop();

  updateAnalysis();

  drawChart();
}


/* =========================================================
   THEME
========================================================= */

function applyTheme(){

  document.body.classList.toggle(
    "light",
    state.theme === "light"
  );

  if($("themeToggle")){

    $("themeToggle").textContent =
      state.theme === "light"
        ? "🌙"
        : "☀️";
  }
}


function toggleTheme(){

  state.theme =
    state.theme === "dark"
      ? "light"
      : "dark";

  localStorage.setItem(
    STORAGE.theme,
    state.theme
  );

  applyTheme();
}


function setupTheme(){

  if($("themeToggle")){

    $("themeToggle")
      .addEventListener(
        "click",
        toggleTheme
      );
  }
}


/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation(){

  all(".nav-button")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          switchPage(
            button.dataset.page
          );
        }
      );
    });
}


function switchPage(page){

  const pages = {
    analysis: $("analysisPage"),
    trade: $("tradePage"),
    history: $("historyPage")
  };

  Object.entries(pages)
    .forEach(
      ([name, element]) => {

        if(!element) return;

        const active =
          name === page;

        element.classList.toggle(
          "active",
          active
        );

        element.hidden =
          !active;
      }
    );


  all(".nav-button")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });


  state.page = page;

  if(page === "history"){
    renderHistory();
    renderStats();
  }

  if(page === "trade"){
    renderActiveTrades();
    renderStats();
  }

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });
}


/* =========================================================
   ENGINE TABS
========================================================= */

function setupEngineTabs(){

  if($("tabAiBot")){

    $("tabAiBot")
      .addEventListener(
        "click",
        () => switchEngine("ai")
      );
  }


  if($("tabCircularAI")){

    $("tabCircularAI")
      .addEventListener(
        "click",
        () => switchEngine("circular")
      );
  }


  if($("tabManual")){

    $("tabManual")
      .addEventListener(
        "click",
        () => switchEngine("manual")
      );
  }
}


function switchEngine(engine){

  state.engine = engine;

  const panels = {
    ai: $("aiBotEngine"),
    circular: $("circularAIEngine"),
    manual: $("manualEngine")
  };


  Object.entries(panels)
    .forEach(
      ([name,panel]) => {

        if(!panel) return;

        panel.style.display =
          name === engine
            ? "block"
            : "none";
      }
    );


  all(".engine-tab")
    .forEach(button => {

      const isActive =
        (engine === "ai" &&
          button.id === "tabAiBot") ||

        (engine === "circular" &&
          button.id === "tabCircularAI") ||

        (engine === "manual" &&
          button.id === "tabManual");

      button.classList.toggle(
        "active",
        isActive
      );
    });


  const names = {
    ai: "AI BOT READY",
    circular: "CIRCULAR AI READY",
    manual: "MANUAL ENGINE READY"
  };


  if($("engineStatusText")){

    $("engineStatusText")
      .textContent =
        names[engine];
  }
}


/* =========================================================
   MARKET SELECTORS
========================================================= */

function populateMarketSelectors(){

  const selectors = [
    $("circularMarketSelect"),
    $("manualMarketSelect")
  ];

  selectors.forEach(select => {

    if(!select) return;

    select.innerHTML = "";

    MARKETS.forEach(symbol => {

      const option =
        document.createElement("option");

      option.value = symbol;

      option.textContent =
        MARKET_NAMES[symbol] ||
        symbol;

      select.appendChild(option);
    });
  });


  if($("circularMarketSelect")){

    $("circularMarketSelect").value =
      state.circularMarket;
  }


  if($("manualMarketSelect")){

    $("manualMarketSelect").value =
      state.selectedMarket;
  }
}


/* =========================================================
   MARKET DATA
========================================================= */

function initializeMarketData(){

  openPublicSocket();
}


function openPublicSocket(){

  try{

    if(
      state.publicSocket &&
      (
        state.publicSocket.readyState ===
          WebSocket.OPEN ||

        state.publicSocket.readyState ===
          WebSocket.CONNECTING
      )
    ){

      return;
    }


    updateConnection(
      false,
      "Connecting live data..."
    );


    const ws =
      new WebSocket(
        PUBLIC_WS
      );

    state.publicSocket = ws;


    ws.onopen = () => {

      state.publicReconnectAttempts = 0;

      updateConnection(
        true,
        "LIVE DATA"
      );

      updateDataStatus(
        "Live Deriv market feed connected"
      );


      requestMarketHistory(ws);

      subscribeMarkets(ws);
    };


    ws.onmessage = event => {

      try{

        const message =
          JSON.parse(
            event.data
          );

        handlePublicMessage(
          message
        );

      }catch(error){

        console.warn(
          "WebSocket parse error",
          error
        );
      }
    };


    ws.onerror = error => {

      console.warn(
        "Public WebSocket error",
        error
      );

      updateConnection(
        false,
        "Connection error"
      );
    };


    ws.onclose = () => {

      updateConnection(
        false,
        "Reconnecting..."
      );

      schedulePublicReconnect();
    };

  }catch(error){

    console.error(
      "WebSocket open error",
      error
    );

    schedulePublicReconnect();
  }
}


/* =========================================================
   HISTORY REQUEST
========================================================= */

function requestMarketHistory(ws){

  MARKETS.forEach(
    (symbol,index) => {

      setTimeout(
        () => {

          if(
            ws.readyState !==
            WebSocket.OPEN
          ){
            return;
          }


          const request = {

            ticks_history: symbol,

            count: 120,

            end: "latest",

            style: "ticks",

            req_id:
              1000 + index
          };


          ws.send(
            JSON.stringify(
              request
            )
          );

        },
        index * 80
      );
    }
  );
}


/* =========================================================
   LIVE SUBSCRIPTIONS
========================================================= */

function subscribeMarkets(ws){

  MARKETS.forEach(
    (symbol,index) => {

      setTimeout(
        () => {

          if(
            ws.readyState !==
            WebSocket.OPEN
          ){
            return;
          }


          const request = {

            ticks: symbol,

            subscribe: 1,

            req_id:
              2000 + index
          };


          ws.send(
            JSON.stringify(
              request
            )
          );

        },
        index * 100
      );
    }
  );
}


/* =========================================================
   PUBLIC MESSAGE
========================================================= */

function handlePublicMessage(message){

  if(
    message.history &&
    message.echo_req &&
    message.echo_req.ticks_history
  ){

    const symbol =
      message.echo_req.ticks_history;

    processHistoryResponse(
      symbol,
      message
    );

    return;
  }


  if(
    message.tick &&
    message.tick.symbol
  ){

    processTick(
      message.tick
    );

    return;
  }


  if(message.error){

    console.warn(
      "Deriv error:",
      message.error
    );
  }
}


/* =========================================================
   HISTORY RESPONSE
========================================================= */

function processHistoryResponse(
  symbol,
  message
){

  if(!state.markets[symbol]){
    return;
  }


  const market =
    state.markets[symbol];


  const prices =
    Array.isArray(
      message.history?.prices
    )
      ? message.history.prices
      : [];


  const times =
    Array.isArray(
      message.history?.times
    )
      ? message.history.times
      : [];


  prices.forEach(
    (price,index) => {

      processPrice(
        symbol,
        price,
        times[index] ||
          Date.now() / 1000,
        false
      );
    }
  );


  market.connected = true;


  updateDataStatus(
    `${connectedMarketCount()} markets live`
  );


  updateAnalysis();

  drawChart();
}


/* =========================================================
   TICK PROCESSING
========================================================= */

function processTick(
  tick,
  live = true
){

  const symbol =
    tick.symbol;

  const quote =
    Number(tick.quote);

  if(
    !symbol ||
    !Number.isFinite(quote) ||
    !state.markets[symbol]
  ){

    return;
  }


  processPrice(
    symbol,
    quote,
    Number(
      tick.epoch ||
      Date.now()/1000
    ),
    live
  );
}


function processPrice(
  symbol,
  price,
  epoch,
  live
){

  const market =
    state.markets[symbol];


  if(!market){
    return;
  }


  const digit =
    extractLastDigit(
      price,
      symbol
    );


  market.lastPrice =
    price;

  market.lastDigit =
    digit;

  market.lastTime =
    epoch;

  market.connected =
    true;

  market.tickCount++;


  market.prices.push(price);

  market.digits.push(digit);

  market.ticks.push({
    price,
    digit,
    epoch
  });


  if(
    market.prices.length >
    160
  ){

    market.prices.shift();
  }


  if(
    market.digits.length >
    160
  ){

    market.digits.shift();
  }


  if(
    market.ticks.length >
    160
  ){

    market.ticks.shift();
  }


  market.distribution[digit]++;


  /*
     Keep distribution based on
     the latest 100 digits.
  */

  if(
    market.digits.length > 100
  ){

    const old =
      market.digits[
        market.digits.length - 101
      ];

    if(
      Number.isInteger(old)
    ){

      market.distribution[old] =
        Math.max(
          0,
          market.distribution[old] - 1
        );
    }
  }


  state.totalTicks++;


  /*
     Set chart market automatically
     to currently selected market.
  */

  if(
    symbol === state.chartMarket
  ){

    state.chartHistory =
      market.prices.slice(-80);
  }


  /*
     Set selected market price.
  */

  if(
    symbol === state.selectedMarket
  ){

    updateCurrentPrice();
  }


  /*
     Active paper trades settle
     against live ticks.
  */

  if(live){

    settleActiveTrades(
      symbol,
      digit
    );
  }


  updateAnalysis();

  renderDigitStats();

  renderActiveTrades();

  renderStats();

  updateBalanceDisplay();

  drawChart();
}


/* =========================================================
   DIGIT EXTRACTION
========================================================= */

function extractLastDigit(
  price,
  symbol
){

  /*
     Deriv quote precision can vary.

     Convert to string and use
     the final numerical digit.
  */

  const text =
    String(price);

  const digits =
    text.replace(
      /[^0-9]/g,
      ""
    );


  if(!digits.length){

    return 0;
  }


  return Number(
    digits[
      digits.length - 1
    ]
  );
}


/* =========================================================
   CURRENT PRICE
========================================================= */

function updateCurrentPrice(){

  const market =
    state.markets[
      state.chartMarket
    ];

  if(!market){
    return;
  }


  if($("currentLivePrice")){

    $("currentLivePrice")
      .textContent =
        market.lastPrice === null
          ? "--"
          : formatPrice(
              market.lastPrice
            );
  }


  if($("currentChartMarket")){

    $("currentChartMarket")
      .textContent =
        MARKET_NAMES[
          state.chartMarket
        ] ||
        state.chartMarket;
  }
}


/* =========================================================
   DIGIT STATISTICS
========================================================= */

function renderDigitStats(){

  const container =
    $("digitStatsGrid");

  if(!container){
    return;
  }


  const market =
    state.markets[
      state.chartMarket
    ];


  if(!market){

    container.innerHTML = "";

    return;
  }


  const digits =
    market.digits.slice(-100);


  const counts =
    Array(10).fill(0);


  digits.forEach(
    digit => {

      if(
        Number.isInteger(digit) &&
        digit >= 0 &&
        digit <= 9
      ){

        counts[digit]++;
      }
    }
  );


  const total =
    digits.length;


  container.innerHTML = "";


  counts.forEach(
    (count,digit) => {

      const percentage =
        total
          ? (
              count /
              total *
              100
            )
              .toFixed(1)
          : "0.0";


      const item =
        document.createElement(
          "div"
        );

      item.className =
        "digit-stat";


      if(
        total &&
        count ===
          Math.max(...counts)
      ){

        item.classList.add(
          "hot"
        );
      }


      item.innerHTML = `

        <div class="digit">
          ${digit}
        </div>

        <div class="percent">
          ${percentage}%
        </div>

        <div class="count">
          ${count}
        </div>

      `;


      container.appendChild(
        item
      );
    }
  );


  if($("digitSampleCount")){

    $("digitSampleCount")
      .textContent =
        `${total} ticks`;
  }
}


/* =========================================================
   PREDICTION ENGINE
========================================================= */

function generatePrediction(
  symbol,
  strategy = null
){

  const market =
    state.markets[symbol];


  if(
    !market ||
    market.digits.length < 10
  ){

    return {

      strategy:
        strategy ||
        "MATCHES",

      prediction: null,

      confidence: 0,

      score: 0,

      reason:
        "Waiting for more tick data."
    };
  }


  const digits =
    market.digits.slice(-60);


  const counts =
    Array(10).fill(0);


  digits.forEach(
    d => {

      if(
        Number.isInteger(d)
      ){

        counts[d]++;
      }
    }
  );


  const total =
    digits.length;


  const sorted =
    counts
      .map(
        (count,digit) => ({
          digit,
          count
        })
      )
      .sort(
        (a,b) =>
          b.count -
          a.count
      );


  const hottest =
    sorted[0];


  const second =
    sorted[1] ||
    {
      digit:0,
      count:0
    };


  const even =
    digits.filter(
      d => d % 2 === 0
    ).length;


  const odd =
    total - even;


  const evenRate =
    even / total;


  const oddRate =
    odd / total;


  let chosen =
    strategy ||
    chooseBestStrategy(
      market
    );


  let prediction;

  let confidence;

  let reason;


  switch(chosen){

    case "MATCHES":{

      prediction =
        hottest.digit;

      const base =
        hottest.count /
        total;

      confidence =
        clamp(
          50 +
          base * 80,
          50,
          92
        );

      reason =
        `Digit ${prediction} has the strongest recent frequency.`;

      break;
    }


    case "DIFFERS":{

      prediction =
        hottest.digit;

      const matchRate =
        hottest.count /
        total;

      confidence =
        clamp(
          65 +
          (1 - matchRate) * 25,
          60,
          91
        );

      reason =
        `Recent digits are broadly distributed, favoring a differ signal.`;

      break;
    }


    case "EVEN":{

      prediction =
        evenRate >= .5
          ? "EVEN"
          : "ODD";

      confidence =
        clamp(
          50 +
          Math.abs(
            evenRate - .5
          ) * 100,
          50,
          88
        );

      reason =
        `Recent even/odd balance is ${(
          evenRate * 100
        ).toFixed(1)}% even.`;

      break;
    }


    case "ODD":{

      prediction =
        oddRate >= .5
          ? "ODD"
          : "EVEN";

      confidence =
        clamp(
          50 +
          Math.abs(
            oddRate - .5
          ) * 100,
          50,
          88
        );

      reason =
        `Recent odd/even balance is ${(
          oddRate * 100
        ).toFixed(1)}% odd.`;

      break;
    }


    case "OVER":{

      const high =
        digits.filter(
          d => d >= 5
        ).length /
        total;

      prediction =
        high >= .5
          ? "OVER 4"
          : "UNDER 5";

      confidence =
        clamp(
          50 +
          Math.abs(
            high - .5
          ) * 100,
          50,
          88
        );

      reason =
        `High digits currently represent ${(high*100).toFixed(1)}% of recent ticks.`;

      break;
    }


    case "UNDER":{

      const low =
        digits.filter(
          d => d <= 4
        ).length /
        total;

      prediction =
        low >= .5
          ? "UNDER 5"
          : "OVER 4";

      confidence =
        clamp(
          50 +
          Math.abs(
            low - .5
          ) * 100,
          50,
          88
        );

      reason =
        `Low digits currently represent ${(low*100).toFixed(1)}% of recent ticks.`;

      break;
    }


    default:{

      chosen =
        "MATCHES";

      prediction =
        hottest.digit;

      confidence =
        60;

      reason =
        "Default digit signal.";
    }
  }


  return {

    strategy: chosen,

    prediction,

    confidence:
      Math.round(
        confidence
      ),

    score:
      Math.round(
        confidence * .92
      ),

    reason,

    hottestDigit:
      hottest.digit,

    hottestCount:
      hottest.count,

    secondDigit:
      second.digit
  };
}


/* =========================================================
   BEST STRATEGY
========================================================= */

function chooseBestStrategy(
  market
){

  const digits =
    market.digits.slice(-60);


  if(
    digits.length < 10
  ){

    return "MATCHES";
  }


  const counts =
    Array(10).fill(0);


  digits.forEach(
    d => counts[d]++
  );


  const total =
    digits.length;


  const max =
    Math.max(...counts);


  const min =
    Math.min(...counts);


  const spread =
    (max - min) /
    Math.max(1,total);


  const evenRate =
    digits.filter(
      d => d % 2 === 0
    ).length /
    total;


  const parityEdge =
    Math.abs(
      evenRate - .5
    );


  if(
    parityEdge > .12
  ){

    return evenRate > .5
      ? "EVEN"
      : "ODD";
  }


  if(
    spread > .08
  ){

    return "MATCHES";
  }


  return "DIFFERS";
}


/* =========================================================
   MARKET SCANNER
========================================================= */

function runMarketScanner(){

  let best = null;


  const strategies =
    state.botStrategyPool.length
      ? state.botStrategyPool
      : STRATEGIES;


  MARKETS.forEach(
    symbol => {

      const market =
        state.markets[symbol];


      if(
        !market ||
        market.digits.length < 10
      ){

        return;
      }


      strategies.forEach(
        strategy => {

          const prediction =
            generatePrediction(
              symbol,
              strategy
            );


          if(
            !prediction.prediction
          ){

            return;
          }


          /*
             Score rewards confidence
             plus data availability.
          */

          const dataBonus =
            Math.min(
              10,
              market.digits.length /
              10
            );


          const score =
            prediction.confidence +
            dataBonus;


          if(
            !best ||
            score > best.score
          ){

            best = {

              symbol,

              strategy,

              prediction:
                prediction.prediction,

              confidence:
                prediction.confidence,

              score:

                Math.round(
                  score
                ),

              reason:
                prediction.reason
            };
          }
        }
      );
    }
  );


  if(!best){

    return null;
  }


  state.selectedMarket =
    best.symbol;

  state.selectedStrategy =
    best.strategy;


  updateAIElements(
    best
  );


  return best;
}


function updateAIElements(
  signal
){

  if(!signal){
    return;
  }


  if($("aiMarket")){

    $("aiMarket")
      .textContent =
        MARKET_NAMES[
          signal.symbol
        ] ||
        signal.symbol;
  }


  if($("aiType")){

    $("aiType")
      .textContent =
        prettyStrategy(
          signal.strategy
        );
  }


  if($("aiPrediction")){

    $("aiPrediction")
      .textContent =
        signal.prediction;
  }


  if($("analysisConfidence")){

    $("analysisConfidence")
      .textContent =
        `${signal.confidence}%`;
  }


  if($("analysisMsg")){

    $("analysisMsg")
      .textContent =
        signal.reason;
  }


  if($("botSelectedMarket")){

    $("botSelectedMarket")
      .textContent =
        MARKET_NAMES[
          signal.symbol
        ] ||
        signal.symbol;
  }


  if($("botSelectedStrategy")){

    $("botSelectedStrategy")
      .textContent =
        prettyStrategy(
          signal.strategy
        );
  }


  if($("botScore")){

    $("botScore")
      .textContent =
        signal.score;
  }


  if($("botConfidence")){

    $("botConfidence")
      .textContent =
        `${signal.confidence}%`;
  }


  if($("aiPredictionLarge")){

    $("aiPredictionLarge")
      .textContent =
        signal.prediction;
  }


  if($("predictionConfidence")){

    $("predictionConfidence")
      .textContent =
        `${signal.confidence}%`;
  }


  state.chartMarket =
    signal.symbol;


  updateCurrentPrice();

  renderDigitStats();

  drawChart();
}


/* =========================================================
   ANALYSIS UPDATE
========================================================= */

function updateAnalysis(){

  const best =
    runMarketScanner();


  if(!best){

    if($("aiStatus")){

      $("aiStatus")
        .textContent =
          "AI ANALYZING";
    }

    if($("aiMarket")){

      $("aiMarket")
        .textContent =
          "SCANNING...";
    }

    if($("aiType")){

      $("aiType")
        .textContent =
          "--";
    }

    if($("aiPrediction")){

      $("aiPrediction")
        .textContent =
          "WAIT";
    }

    if($("analysisConfidence")){

      $("analysisConfidence")
        .textContent =
          "--";
    }

    updateCurrentPrice();

    return;
  }


  if($("aiStatus")){

    $("aiStatus")
      .textContent =
        "AI SIGNAL READY";
  }
}


/* =========================================================
   SCANNER LOOP
========================================================= */

function startScannerLoop(){

  if(state.scannerTimer){

    clearInterval(
      state.scannerTimer
    );
  }


  state.scannerTimer =
    setInterval(
      () => {

        updateAnalysis();

      },
      3000
    );
}


/* =========================================================
   CHART
========================================================= */

function setupCanvasResize(){

  window.addEventListener(
    "resize",
    drawChart
  );
}


function drawChart(){

  const canvas =
    $("priceChartCanvas");

  if(!canvas){
    return;
  }


  const market =
    state.markets[
      state.chartMarket
    ];


  const prices =
    market
      ? market.prices.slice(-80)
      : [];


  const rect =
    canvas.getBoundingClientRect();


  if(
    rect.width <= 0 ||
    rect.height <= 0
  ){

    return;
  }


  const dpr =
    window.devicePixelRatio ||
    1;


  canvas.width =
    rect.width * dpr;

  canvas.height =
    rect.height * dpr;


  const ctx =
    canvas.getContext("2d");


  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );


  const width =
    rect.width;

  const height =
    rect.height;


  ctx.clearRect(
    0,
    0,
    width,
    height
  );


  /*
     Grid
  */

  ctx.strokeStyle =
    getCSS("--line");

  ctx.lineWidth = 1;


  for(
    let i=1;
    i<5;
    i++
  ){

    const y =
      height *
      i / 5;

    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      width,
      y
    );

    ctx.stroke();
  }


  if(prices.length < 2){

    ctx.fillStyle =
      getCSS("--muted");

    ctx.font =
      "11px system-ui";

    ctx.textAlign =
      "center";

    ctx.fillText(
      "Waiting for live price data...",
      width / 2,
      height / 2
    );

    return;
  }


  let min =
    Math.min(...prices);

  let max =
    Math.max(...prices);


  if(
    min === max
  ){

    min -= .5;
    max += .5;
  }


  const padding =
    12;


  ctx.beginPath();


  prices.forEach(
    (price,index) => {

      const x =
        padding +
        (
          index /
          (prices.length - 1)
        ) *
        (
          width -
          padding * 2
        );


      const y =
        height -
        padding -
        (
          (price - min) /
          (max - min)
        ) *
        (
          height -
          padding * 2
        );


      if(index === 0){

        ctx.moveTo(
          x,
          y
        );

      }else{

        ctx.lineTo(
          x,
          y
        );
      }
    }
  );


  ctx.strokeStyle =
    getCSS("--accent");

  ctx.lineWidth = 2;

  ctx.stroke();


  /*
     Latest point
  */

  const latest =
    prices[
      prices.length - 1
    ];


  const lx =
    width -
    padding;


  const ly =
    height -
    padding -
    (
      (latest - min) /
      (max - min)
    ) *
    (
      height -
      padding * 2
    );


  ctx.beginPath();

  ctx.arc(
    lx,
    ly,
    4,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    getCSS("--green");

  ctx.fill();
}


/* =========================================================
   CIRCULAR AI
========================================================= */

function setupCircularControls(){

  if($("startAI")){

    $("startAI")
      .addEventListener(
        "click",
        startCircularAI
      );
  }


  if($("stopAI")){

    $("stopAI")
      .addEventListener(
        "click",
        stopCircularAI
      );
  }


  if($("startCircularTradeBtn")){

    $("startCircularTradeBtn")
      .addEventListener(
        "click",
        startCircularAI
      );
  }


  if($("circularMarketSelect")){

    $("circularMarketSelect")
      .addEventListener(
        "change",
        event => {

          state.circularMarket =
            event.target.value;
        }
      );
  }
}


function startCircularAI(){

  if(state.circularRunning){

    showToast(
      "Circular AI is already running."
    );

    return;
  }


  state.circularRunning = true;

  state.circularStage =
    "ANALYZING";

  state.circularTimer =
    10;

  state.circularPrediction =
    null;


  updateCircularUI();

  showToast(
    "Circular AI started."
  );


  if(state.circularInterval){

    clearInterval(
      state.circularInterval
    );
  }


  state.circularNextTickTime =
    Date.now() + 1000;


  state.circularInterval =
    setInterval(
      circularLoop,
      100
    );
}


function stopCircularAI(){

  state.circularRunning =
    false;

  state.circularStage =
    "STOPPED";

  state.circularTimer =
    0;

  state.circularPrediction =
    null;


  if(state.circularInterval){

    clearInterval(
      state.circularInterval
    );

    state.circularInterval =
      null;
  }


  updateCircularUI();

  showToast(
    "Circular AI stopped."
  );
}


/*
   EXACT CYCLE:

   ANALYZING = 10 seconds
   LOCK      = 5 seconds
   TRADE NOW = 3 seconds
   ANALYZING = repeat
*/

function circularLoop(){

  if(!state.circularRunning){

    return;
  }


  const now =
    Date.now();


  if(
    now <
    state.circularNextTickTime
  ){

    updateCircularUI();

    return;
  }


  /*
     One-second step.
  */

  state.circularNextTickTime =
    now + 1000;


  if(
    state.circularStage ===
    "ANALYZING"
  ){

    if(
      state.circularTimer > 0
    ){

      state.circularTimer--;
    }


    /*
       EXACT END OF 10 SECONDS
    */

    if(
      state.circularTimer === 0
    ){

      createCircularPrediction();

      state.circularStage =
        "LOCK";

      state.circularTimer =
        5;
    }

  }

  else if(
    state.circularStage ===
    "LOCK"
  ){

    if(
      state.circularTimer > 0
    ){

      state.circularTimer--;
    }


    if(
      state.circularTimer === 0
    ){

      state.circularStage =
        "TRADE NOW";

      state.circularTimer =
        3;


      /*
         Paper trade is opened
         exactly when TRADE NOW
         begins.
      */

      executeCircularPaperTrade();
    }

  }

  else if(
    state.circularStage ===
    "TRADE NOW"
  ){

    if(
      state.circularTimer > 0
    ){

      state.circularTimer--;
    }


    if(
      state.circularTimer === 0
    ){

      state.circularStage =
        "ANALYZING";

      state.circularTimer =
        10;

      state.circularPrediction =
        null;
    }
  }


  updateCircularUI();
}


function createCircularPrediction(){

  const best =
    runMarketScanner();


  if(!best){

    state.circularMarket =
      state.selectedMarket;

    state.circularStrategy =
      state.selectedStrategy;

    state.circularPrediction =
      "WAIT";

    return;
  }


  state.circularMarket =
    best.symbol;

  state.circularStrategy =
    best.strategy;

  state.circularPrediction =
    best.prediction;


  /*
     Important:
     Circular AI DOES NOT modify
     the manual target digit.
  */

  updateCircularUI();
}


function executeCircularPaperTrade(){

  if(
    !state.circularPrediction ||
    state.circularPrediction ===
      "WAIT"
  ){

    return;
  }


  const market =
    state.markets[
      state.circularMarket
    ];


  if(
    !market ||
    market.lastDigit === null
  ){

    return;
  }


  const stake =
    getNumberInput(
      "circularStakeInput",
      .25
    );


  const strategy =
    state.circularStrategy;


  const prediction =
    state.circularPrediction;


  openPaperTrade({

    market:
      state.circularMarket,

    strategy,

    prediction,

    targetDigit:
      getTargetFromPrediction(
        strategy,
        prediction
      ),

    stake,

    source:
      "CIRCULAR",

    takeProfit:
      getNumberInput(
        "circularTakeProfitInput",
        0
      ),

    stopLoss:
      getNumberInput(
        "circularStopLossInput",
        0
      )
  });
}


function updateCircularUI(){

  const running =
    state.circularRunning;


  const stage =
    state.circularStage;


  const timer =
    Math.max(
      0,
      Number(
        state.circularTimer
      ) || 0
    );


  const circles =
    [
      $("aiCircle")
    ];


  circles.forEach(
    circle => {

      if(!circle) return;

      circle.classList.remove(
        "analyzing",
        "lock",
        "trade-now",
        "stopped"
      );


      if(!running){

        circle.classList.add(
          "stopped"
        );

      }else if(
        stage === "ANALYZING"
      ){

        circle.classList.add(
          "analyzing"
        );

      }else if(
        stage === "LOCK"
      ){

        circle.classList.add(
          "lock"
        );

      }else if(
        stage === "TRADE NOW"
      ){

        circle.classList.add(
          "trade-now"
        );
      }
    }
  );


  if($("aiCircleTimer")){

    $("aiCircleTimer")
      .textContent =
        running
          ? timer
          : "0";
  }


  if($("aiCircleLabel")){

    $("aiCircleLabel")
      .textContent =
        running
          ? stage
          : "READY";
  }


  if($("aiCirclePrediction")){

    $("aiCirclePrediction")
      .textContent =
        state.circularPrediction ||
        "WAIT";
  }


  if($("cycleAnalysis")){

    $("cycleAnalysis")
      .textContent =
        stage === "ANALYZING"
          ? `${timer}s`
          : "DONE";
  }


  if($("cycleTrade")){

    $("cycleTrade")
      .textContent =
        stage === "TRADE NOW"
          ? `${timer}s`
          : stage === "LOCK"
            ? "LOCKED"
            : "WAIT";
  }


  if($("cycleCooldown")){

    $("cycleCooldown")
      .textContent =
        running
          ? `${timer}s`
          : "--";
  }


  const status =
    running
      ? `${stage} • ${
          MARKET_NAMES[
            state.circularMarket
          ] ||
          state.circularMarket
        } • ${
          prettyStrategy(
            state.circularStrategy
          )
        }`
      : "CIRCULAR AI READY";


  /*
     There are two elements with
     this ID in the supplied HTML.
     update both safely.
  */

  document
    .querySelectorAll(
      "#circularStatusText"
    )
    .forEach(
      element => {

        element.textContent =
          status;
      }
    );


  if($("circularMarketSelect")){

    $("circularMarketSelect")
      .value =
        state.circularMarket;
  }


  if($("circularStrategyLabel")){

    $("circularStrategyLabel")
      .textContent =
        prettyStrategy(
          state.circularStrategy
        );
  }
}


/* =========================================================
   MANUAL STRATEGY
========================================================= */

function setupStrategyControls(){

  /*
     Manual strategy buttons
  */

  if($("manualStrategyTrigger")){

    $("manualStrategyTrigger")
      .addEventListener(
        "click",
        () => openStrategyModal(
          "manual"
        )
      );
  }


  if($("circularStrategyTrigger")){

    $("circularStrategyTrigger")
      .addEventListener(
        "click",
        () => openStrategyModal(
          "circular"
        )
      );
  }


  if($("closeStrategyModal")){

    $("closeStrategyModal")
      .addEventListener(
        "click",
        closeStrategyModal
      );
  }


  all(
    "#strategyOptions button"
  )
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const strategy =
            button.dataset.strategy;


          if(
            state.pendingStrategyTarget ===
            "circular"
          ){

            state.circularStrategy =
              strategy;

            if(
              $("circularStrategyLabel")
            ){

              $("circularStrategyLabel")
                .textContent =
                  prettyStrategy(
                    strategy
                  );
            }

          }else{

            state.manualStrategy =
              strategy;

            if(
              $("manualSelectedStrategyLabel")
            ){

              $("manualSelectedStrategyLabel")
                .textContent =
                  prettyStrategy(
                    strategy
                  );
            }

            updateManualTargetVisibility();
          }


          closeStrategyModal();
        }
      );
    }
  );
}


function openStrategyModal(target){

  state.pendingStrategyTarget =
    target;


  const modal =
    $("strategyModal");


  if(!modal){
    return;
  }


  modal.hidden = false;

  modal.classList.add(
    "show"
  );


  const current =
    target === "circular"
      ? state.circularStrategy
      : state.manualStrategy;


  all(
    "#strategyOptions button"
  )
  .forEach(
    button => {

      button.classList.toggle(
        "selected",
        button.dataset.strategy ===
          current
      );
    }
  );
}


function closeStrategyModal(){

  const modal =
    $("strategyModal");


  if(!modal){
    return;
  }


  modal.classList.remove(
    "show"
  );

  modal.hidden = true;
}


/* =========================================================
   MANUAL TARGET VISIBILITY
========================================================= */

function updateManualTargetVisibility(){

  const container =
    $("targetDigitContainer");


  if(!container){
    return;
  }


  const required =
    [
      "MATCHES",
      "DIFFERS",
      "OVER",
      "UNDER"
    ]
      .includes(
        state.manualStrategy
      );


  container.style.display =
    required
      ? "block"
      : "none";
}


/* =========================================================
   BOT STRATEGY MODAL
========================================================= */

function setupBotControls(){

  if($("botStrategyTrigger")){

    $("botStrategyTrigger")
      .addEventListener(
        "click",
        openBotStrategyModal
      );
  }


  if($("closeBotStrategyModal")){

    $("closeBotStrategyModal")
      .addEventListener(
        "click",
        closeBotStrategyModal
      );
  }


  if($("applyBotStrategies")){

    $("applyBotStrategies")
      .addEventListener(
        "click",
        applyBotStrategies
      );
  }


  if($("startBotBtn")){

    $("startBotBtn")
      .addEventListener(
        "click",
        toggleBot
      );
  }
}


function openBotStrategyModal(){

  const modal =
    $("botStrategyModal");


  if(!modal){
    return;
  }


  all(
    ".bot-strategy-check"
  )
  .forEach(
    checkbox => {

      checkbox.checked =
        state.botStrategyPool
          .includes(
            checkbox.value
          );
    }
  );


  modal.hidden = false;

  modal.classList.add(
    "show"
  );
}


function closeBotStrategyModal(){

  const modal =
    $("botStrategyModal");


  if(!modal){
    return;
  }


  modal.hidden = true;

  modal.classList.remove(
    "show"
  );
}


function applyBotStrategies(){

  const selected =
    all(
      ".bot-strategy-check:checked"
    )
      .map(
        checkbox =>
          checkbox.value
      );


  if(!selected.length){

    showToast(
      "Select at least one AI strategy."
    );

    return;
  }


  state.botStrategyPool =
    selected;


  if($("botStrategyLabel")){

    $("botStrategyLabel")
      .textContent =
        selected
          .map(
            prettyStrategy
          )
          .join(" • ");
  }


  closeBotStrategyModal();

  updateAnalysis();

  showToast(
    "AI Bot strategy pool updated."
  );
}


/* =========================================================
   AI BOT
========================================================= */

function toggleBot(){

  if(state.botRunning){

    stopBot();

  }else{

    startBot();
  }
}


function startBot(){

  if(
    !state.botStrategyPool.length
  ){

    showToast(
      "Choose at least one bot strategy."
    );

    return;
  }


  state.botRunning = true;

  state.botLastTrade = 0;


  if($("startBotBtn")){

    $("startBotBtn")
      .textContent =
        "STOP AI BOT";
  }


  if($("botStatusDash")){

    $("botStatusDash")
      .textContent =
        "AI BOT RUNNING";
  }


  if($("engineStatusText")){

    $("engineStatusText")
      .textContent =
        "AI BOT RUNNING";
  }


  runBotCycle();


  state.botInterval =
    setInterval(
      runBotCycle,
      5000
    );


  showToast(
    "AI Bot started in PAPER mode."
  );
}


function stopBot(){

  state.botRunning = false;


  if(state.botInterval){

    clearInterval(
      state.botInterval
    );

    state.botInterval = null;
  }


  if($("startBotBtn")){

    $("startBotBtn")
      .textContent =
        "START AI BOT";
  }


  if($("botStatusDash")){

    $("botStatusDash")
      .textContent =
        "AI BOT READY";
  }


  showToast(
    "AI Bot stopped."
  );
}


function runBotCycle(){

  if(!state.botRunning){
    return;
  }


  const signal =
    runMarketScanner();


  if(!signal){

    return;
  }


  /*
     Avoid over-trading weak signals.
  */

  if(
    signal.confidence < 55
  ){

    return;
  }


  const now =
    Date.now();


  if(
    now -
    state.botLastTrade <
    4500
  ){

    return;
  }


  state.botLastTrade =
    now;


  const stake =
    getNumberInput(
      "stakeInput",
      .25
    );


  openPaperTrade({

    market:
      signal.symbol,

    strategy:
      signal.strategy,

    prediction:
      signal.prediction,

    targetDigit:
      getTargetFromPrediction(
        signal.strategy,
        signal.prediction
      ),

    stake,

    source:
      "AI BOT",

    takeProfit:
      getNumberInput(
        "takeProfitInput",
        0
      ),

    stopLoss:
      getNumberInput(
        "stopLossInput",
        0
      )
  });
}


/* =========================================================
   MANUAL ENGINE
========================================================= */

function setupTradingControls(){

  if($("manualMarketSelect")){

    $("manualMarketSelect")
      .addEventListener(
        "change",
        event => {

          state.selectedMarket =
            event.target.value;
        }
      );
  }


  if($("placeTradeBtn")){

    $("placeTradeBtn")
      .addEventListener(
        "click",
        placeManualTrade
      );
  }


  if($("stopTradingBtn")){

    $("stopTradingBtn")
      .addEventListener(
        "click",
        stopAllEngines
      );
  }
}


function placeManualTrade(){

  const market =
    $("manualMarketSelect")
      ? $("manualMarketSelect").value
      : state.selectedMarket;


  const strategy =
    state.manualStrategy;


  const needsDigit =
    [
      "MATCHES",
      "DIFFERS",
      "OVER",
      "UNDER"
    ]
      .includes(
        strategy
      );


  let targetDigit =
    null;


  if(needsDigit){

    const input =
      $("manualTargetDigitInput");


    targetDigit =
      Number(
        input?.value
      );


    if(
      !Number.isInteger(
        targetDigit
      ) ||
      targetDigit < 0 ||
      targetDigit > 9
    ){

      showToast(
        "Enter a target digit from 0 to 9."
      );

      return;
    }
  }


  const stake =
    getNumberInput(
      "manualStakeInput",
      .25
    );


  openPaperTrade({

    market,

    strategy,

    prediction:
      strategy === "MATCHES" ||
      strategy === "DIFFERS" ||
      strategy === "OVER" ||
      strategy === "UNDER"
        ? targetDigit
        : prettyStrategy(
            strategy
          ),

    targetDigit,

    stake,

    source:
      "MANUAL",

    takeProfit:
      getNumberInput(
        "manualTakeProfitInput",
        0
      ),

    stopLoss:
      getNumberInput(
        "manualStopLossInput",
        0
      )
  });
}


/* =========================================================
   PAPER TRADE
========================================================= */

function openPaperTrade(config){

  const stake =
    Math.max(
      .25,
      Number(
        config.stake
      ) || .25
    );


  if(
    state.paperBalance <
    stake
  ){

    showToast(
      "Insufficient paper balance."
    );

    return null;
  }


  const market =
    state.markets[
      config.market
    ];


  if(
    !market ||
    market.lastDigit === null
  ){

    showToast(
      "Waiting for live digit data."
    );

    return null;
  }


  const trade = {

    id:
      createId(),

    market:
      config.market,

    strategy:
      config.strategy,

    prediction:
      config.prediction,

    targetDigit:
      config.targetDigit,

    entryDigit:
      market.lastDigit,

    exitDigit:
      null,

    entryPrice:
      market.lastPrice,

    exitPrice:
      null,

    stake,

    source:
      config.source ||
      "MANUAL",

    takeProfit:
      Number(
        config.takeProfit
      ) || 0,

    stopLoss:
      Number(
        config.stopLoss
      ) || 0,

    status:
      "ACTIVE",

    result:
      "PENDING",

    amountWon:
      0,

    netProfit:
      0,

    openedAt:
      Date.now(),

    closedAt:
      null
  };


  /*
     Reserve the stake from paper balance.
  */

  state.paperBalance -=
    stake;


  state.activeTrades.push(
    trade
  );


  updateBalanceDisplay();

  renderActiveTrades();

  renderStats();


  showToast(
    `${trade.source}: Paper trade opened`
  );


  return trade;
}


/* =========================================================
   SETTLEMENT
========================================================= */

function settleActiveTrades(
  symbol,
  exitDigit
){

  const trades =
    state.activeTrades.filter(
      trade =>
        trade.market === symbol &&
        trade.status === "ACTIVE"
    );


  if(!trades.length){
    return;
  }


  const market =
    state.markets[symbol];


  trades.forEach(
    trade => {

      const won =
        evaluateTrade(
          trade,
          exitDigit
        );


      trade.exitDigit =
        exitDigit;

      trade.exitPrice =
        market.lastPrice;

      trade.closedAt =
        Date.now();

      trade.status =
        won
          ? "WON"
          : "LOST";

      trade.result =
        won
          ? "WIN"
          : "LOSS";


      if(won){

        const multiplier =
          PAPER_MULTIPLIERS[
            trade.strategy
          ] ||
          .95;


        /*
           For paper accounting:

           amountWon =
             stake + profit

           netProfit =
             amountWon - stake
        */

        const profit =
          trade.stake *
          multiplier;


        trade.amountWon =
          trade.stake +
          profit;


        trade.netProfit =
          profit;


        state.paperBalance +=
          trade.amountWon;

      }else{

        trade.amountWon =
          0;

        trade.netProfit =
          -trade.stake;
      }


      state.history.unshift(
        {
          ...trade
        }
      );


      /*
         Keep history manageable.
      */

      if(
        state.history.length >
        500
      ){

        state.history =
          state.history.slice(
            0,
            500
          );
      }
    }
  );


  state.activeTrades =
    state.activeTrades.filter(
      trade =>
        trade.status === "ACTIVE"
    );


  saveJSON(
    STORAGE.history,
    state.history
  );


  saveJSON(
    STORAGE.balance,
    state.paperBalance
  );


  renderHistory();

  renderActiveTrades();

  renderStats();

  updateBalanceDisplay();
}


/* =========================================================
   EVALUATE TRADE
========================================================= */

function evaluateTrade(
  trade,
  exitDigit
){

  switch(
    trade.strategy
  ){

    case "MATCHES":

      return (
        Number(
          exitDigit
        ) ===
        Number(
          trade.targetDigit
        )
      );


    case "DIFFERS":

      return (
        Number(
          exitDigit
        ) !==
        Number(
          trade.targetDigit
        )
      );


    case "OVER":

      return (
        Number(
          exitDigit
        ) >
        Number(
          trade.targetDigit
        )
      );


    case "UNDER":

      return (
        Number(
          exitDigit
        ) <
        Number(
          trade.targetDigit
        )
      );


    case "EVEN":

      return (
        Number(
          exitDigit
        ) % 2 === 0
      );


    case "ODD":

      return (
        Number(
          exitDigit
        ) % 2 === 1
      );


    default:

      return false;
  }
}


/* =========================================================
   TARGET FROM AI PREDICTION
========================================================= */

function getTargetFromPrediction(
  strategy,
  prediction
){

  if(
    [
      "MATCHES",
      "DIFFERS"
    ]
      .includes(
        strategy
      )
  ){

    const number =
      Number(
        prediction
      );

    return Number.isInteger(
      number
    )
      ? number
      : null;
  }


  if(strategy === "OVER"){

    return 4;
  }


  if(strategy === "UNDER"){

    return 5;
  }


  return null;
}


/* =========================================================
   RISK CONTROLS
========================================================= */

function setupRiskControls(){

  [
    "stakeInput",
    "takeProfitInput",
    "stopLossInput",
    "martingaleInput",
    "circularStakeInput",
    "circularTakeProfitInput",
    "circularStopLossInput",
    "manualStakeInput",
    "manualTakeProfitInput",
    "manualStopLossInput"
  ]
  .forEach(
    id => {

      const element =
        $(id);

      if(!element){
        return;
      }


      element.addEventListener(
        "change",
        () => {

          let value =
            Number(
              element.value
            );


          if(
            id.includes(
              "Stake"
            ) ||
            id === "stakeInput"
          ){

            if(
              !Number.isFinite(value) ||
              value < .25
            ){

              element.value =
                ".25";
            }
          }
        }
      );
    }
  );
}


/* =========================================================
   STAKE INPUT
========================================================= */

function getNumberInput(
  id,
  fallback
){

  const element =
    $(id);


  if(!element){
    return fallback;
  }


  const value =
    Number(
      element.value
    );


  if(
    !Number.isFinite(value)
  ){

    return fallback;
  }


  return value;
}


/* =========================================================
   STATS
========================================================= */

function renderStats(){

  const total =
    state.history.length;


  const wins =
    state.history.filter(
      trade =>
        trade.result ===
        "WIN"
    ).length;


  const losses =
    state.history.filter(
      trade =>
        trade.result ===
        "LOSS"
    ).length;


  const accuracy =
    total
      ? (
          wins /
          total *
          100
        )
          .toFixed(1)
      : "0.0";


  if($("paperTotal")){

    $("paperTotal")
      .textContent =
        total;
  }


  if($("paperWins")){

    $("paperWins")
      .textContent =
        wins;
  }


  if($("paperLosses")){

    $("paperLosses")
      .textContent =
        losses;
  }


  if($("paperAccuracy")){

    $("paperAccuracy")
      .textContent =
        `${accuracy}%`;
  }


  if($("activeTradeCount")){

    $("activeTradeCount")
      .textContent =
        state.activeTrades.length;
  }


  const totalStake =
    state.history.reduce(
      (
        total,
        trade
      ) =>
        total +
        Number(
          trade.stake
        ),
      0
    );


  const amountWon =
    state.history.reduce(
      (
        total,
        trade
      ) =>
        total +
        Number(
          trade.amountWon
        ),
      0
    );


  const netProfit =
    state.history.reduce(
      (
        total,
        trade
      ) =>
        total +
        Number(
          trade.netProfit
        ),
      0
    );


  if($("historyTotalStake")){

    $("historyTotalStake")
      .textContent =
        money(
          totalStake
        );
  }


  if($("historyAmountWon")){

    $("historyAmountWon")
      .textContent =
        money(
          amountWon
        );
  }


  if($("historyNetProfit")){

    $("historyNetProfit")
      .textContent =
        signedMoney(
          netProfit
        );


    $("historyNetProfit")
      .classList.toggle(
        "positive",
        netProfit >= 0
      );

    $("historyNetProfit")
      .classList.toggle(
        "negative",
        netProfit < 0
      );
  }


  if($("sessionProfitDisplay")){

    $("sessionProfitDisplay")
      .textContent =
        signedMoney(
          netProfit
        );


    $("sessionProfitDisplay")
      .classList.toggle(
        "positive",
        netProfit >= 0
      );

    $("sessionProfitDisplay")
      .classList.toggle(
        "negative",
        netProfit < 0
      );
  }
}


/* =========================================================
   HISTORY RENDER
========================================================= */

function renderHistory(){

  const container =
    $("historyCardsList");


  if(!container){
    return;
  }


  if(!state.history.length){

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          📊
        </div>

        <strong>
          No trading history yet
        </strong>

        <p>
          Completed paper trades will
          appear here.
        </p>

      </div>

    `;

    return;
  }


  container.innerHTML = "";


  state.history.forEach(
    trade => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "history-card " +
        (
          trade.result ===
          "WIN"
            ? "history-win"
            : "history-loss"
        );


      const target =
        trade.targetDigit === null ||
        trade.targetDigit === undefined
          ? "--"
          : trade.targetDigit;


      card.innerHTML = `

        <div class="history-top">

          <div>

            <div class="history-market">
              ${
                MARKET_NAMES[
                  trade.market
                ] ||
                trade.market
              }
            </div>

            <div class="history-time">
              ${formatDate(
                trade.closedAt ||
                trade.openedAt
              )}
            </div>

          </div>


          <div class="history-result">

            ${
              trade.result ===
              "WIN"
                ? "WIN"
                : "LOSS"
            }

          </div>

        </div>


        <div class="history-grid">

          <div class="history-item">

            <span>STRATEGY</span>

            <strong>
              ${prettyStrategy(
                trade.strategy
              )}
            </strong>

          </div>


          <div class="history-item">

            <span>PREDICTION</span>

            <strong>
              ${
                trade.prediction ??
                "--"
              }
            </strong>

          </div>


          <div class="history-item">

            <span>TARGET</span>

            <strong>
              ${target}
            </strong>

          </div>


          <div class="history-item">

            <span>ENTRY DIGIT</span>

            <strong>
              ${
                trade.entryDigit ??
                "--"
              }
            </strong>

          </div>


          <div class="history-item">

            <span>EXIT DIGIT</span>

            <strong>
              ${
                trade.exitDigit ??
                "--"
              }
            </strong>

          </div>


          <div class="history-item">

            <span>STAKE</span>

            <strong>
              ${money(
                trade.stake
              )}
            </strong>

          </div>


          <div class="history-item">

            <span>AMOUNT WON</span>

            <strong class="positive">
              ${money(
                trade.amountWon
              )}
            </strong>

          </div>


          <div class="history-item">

            <span>NET PROFIT</span>

            <strong class="${
              Number(
                trade.netProfit
              ) >= 0
                ? "positive"
                : "negative"
            }">

              ${signedMoney(
                trade.netProfit
              )}

            </strong>

          </div>


          <div class="history-item">

            <span>STATUS</span>

            <strong>
              ${trade.result}
            </strong>

          </div>

        </div>


        <div class="history-bottom">

          <div class="history-source">
            SOURCE: ${
              trade.source ||
              "MANUAL"
            }
          </div>

          <div class="history-profit ${
            Number(
              trade.netProfit
            ) >= 0
              ? "positive"
              : "negative"
          }">

            ${
              Number(
                trade.netProfit
              ) >= 0
                ? "+"
                : ""
            }${
              Number(
                trade.netProfit
              ).toFixed(2)
            }

          </div>

        </div>

      `;


      container.appendChild(
        card
      );
    }
  );
}


/* =========================================================
   ACTIVE TRADES
========================================================= */

function renderActiveTrades(){

  const container =
    $("activeTradesList");


  if(!container){
    return;
  }


  if(
    !state.activeTrades.length
  ){

    container.innerHTML = `

      <div class="empty-state">
        No active paper trades
      </div>

    `;

    return;
  }


  container.innerHTML = "";


  state.activeTrades.forEach(
    trade => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "active-trade-card";


      card.innerHTML = `

        <div class="active-trade-top">

          <div>

            <div class="active-trade-market">
              ${
                MARKET_NAMES[
                  trade.market
                ] ||
                trade.market
              }
            </div>

            <div class="active-trade-source">
              ${
                trade.source
              }
            </div>

          </div>


          <div class="active-trade-source">
            ACTIVE
          </div>

        </div>


        <div class="active-trade-grid">

          <div>

            <span>STRATEGY</span>

            <strong>
              ${prettyStrategy(
                trade.strategy
              )}
            </strong>

          </div>


          <div>

            <span>PREDICTION</span>

            <strong>
              ${
                trade.prediction ??
                "--"
              }
            </strong>

          </div>


          <div>

            <span>ENTRY</span>

            <strong>
              ${
                trade.entryDigit ??
                "--"
              }
            </strong>

          </div>


          <div>

            <span>STAKE</span>

            <strong>
              ${money(
                trade.stake
              )}
            </strong>

          </div>


          <div>

            <span>TARGET</span>

            <strong>
              ${
                trade.targetDigit ??
                "--"
              }
            </strong>

          </div>


          <div>

            <span>WAITING</span>

            <strong>
              NEXT TICK
            </strong>

          </div>

        </div>

      `;


      container.appendChild(
        card
      );
    }
  );
}


/* =========================================================
   HISTORY CONTROLS
========================================================= */

function setupHistoryControls(){

  if($("clearLogsBtn")){

    $("clearLogsBtn")
      .addEventListener(
        "click",
        clearHistory
      );
  }
}


function clearHistory(){

  if(!state.history.length){

    showToast(
      "History is already empty."
    );

    return;
  }


  const confirmed =
    window.confirm(
      "Clear all completed paper trade history?"
    );


  if(!confirmed){
    return;
  }


  state.history = [];


  saveJSON(
    STORAGE.history,
    state.history
  );


  renderHistory();

  renderStats();

  showToast(
    "Trading history cleared."
  );
}


/* =========================================================
   STOP EVERYTHING
========================================================= */

function stopAllEngines(){

  stopBot();

  stopCircularAI();

  showToast(
    "All trading engines stopped."
  );
}


/* =========================================================
   ACCOUNT CONTROLS
========================================================= */

function setupAccountControls(){

  setupTheme();


  if($("connectDerivBtn")){

    $("connectDerivBtn")
      .addEventListener(
        "click",
        connectDeriv
      );
  }


  if($("demoModeBtn")){

    $("demoModeBtn")
      .addEventListener(
        "click",
        () => {

          setDemoMode();

          closeRealModal();
        }
      );
  }


  if($("realModeBtn")){

    $("realModeBtn")
      .addEventListener(
        "click",
        openRealModal
      );
  }


  if($("cancelRealBtn")){

    $("cancelRealBtn")
      .addEventListener(
        "click",
        closeRealModal
      );
  }


  if($("confirmRealBtn")){

    $("confirmRealBtn")
      .addEventListener(
        "click",
        confirmRealMode
      );
  }
}


function setDemoMode(){

  state.accountMode =
    "DEMO";

  document.body.classList.remove(
    "real-mode"
  );


  updateModeBadge();

  showToast(
    "DEMO / PAPER mode active."
  );
}


function openRealModal(){

  const modal =
    $("realConfirmModal");


  if(!modal){
    return;
  }


  modal.hidden = false;

  modal.classList.add(
    "show"
  );
}


function closeRealModal(){

  const modal =
    $("realConfirmModal");


  if(!modal){
    return;
  }


  modal.hidden = true;

  modal.classList.remove(
    "show"
  );
}


function confirmRealMode(){

  /*
     Real execution is intentionally
     disabled in V7.2.
  */

  state.accountMode =
    "REAL";


  document.body.classList.add(
    "real-mode"
  );


  updateModeBadge();

  closeRealModal();


  showToast(
    "REAL account selected, but real-money execution is disabled in V7.2. Paper mode remains active."
  );
}


function updateModeBadge(){

  const badge =
    document.querySelector(
      ".mode-badge"
    );


  if(!badge){
    return;
  }


  badge.textContent =
    state.accountMode;


  badge.classList.toggle(
    "demo-mode",
    state.accountMode ===
      "DEMO"
  );


  badge.classList.toggle(
    "real-mode",
    state.accountMode ===
      "REAL"
  );
}


/* =========================================================
   BACKEND CONFIG
========================================================= */

let backendConfig = {

  client_id: null,

  redirect_uri:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/"
};


async function loadBackendConfig(){

  try{

    const response =
      await fetch(
        `${BACKEND_URL}/api/config`,
        {
          method:"GET",
          headers:{
            "Accept":
              "application/json"
          }
        }
      );


    if(!response.ok){

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    if(data.success){

      backendConfig =
        {
          ...backendConfig,
          ...data
        };
    }


  }catch(error){

    console.warn(
      "Backend config unavailable:",
      error
    );


    updateDataStatus(
      "Market data active • OAuth backend waking or unavailable"
    );
  }
}


/* =========================================================
   OAUTH
========================================================= */

async function connectDeriv(){

  try{

    await loadBackendConfig();


    if(
      !backendConfig.client_id
    ){

      showToast(
        "Deriv OAuth configuration unavailable."
      );

      return;
    }


    const verifier =
      generateCodeVerifier();


    const challenge =
      await generateCodeChallenge(
        verifier
      );


    const oauthState =
      randomString(
        32
      );


    state.oauthVerifier =
      verifier;

    state.oauthState =
      oauthState;


    sessionStorage.setItem(
      "krishwave_oauth_verifier",
      verifier
    );

    sessionStorage.setItem(
      "krishwave_oauth_state",
      oauthState
    );


    const params =
      new URLSearchParams({

        client_id:
          backendConfig.client_id,

        response_type:
          "code",

        scope:
          "read",

        redirect_uri:
          backendConfig.redirect_uri,

        code_challenge:
          challenge,

        code_challenge_method:
          "S256",

        state:
          oauthState
      });


    const url =
      "https://auth.deriv.com/oauth2/auth?" +
      params.toString();


    window.location.href =
      url;

  }catch(error){

    console.error(
      "OAuth start error",
      error
    );

    showToast(
      "Unable to start Deriv login."
    );
  }
}


/* =========================================================
   OAUTH CALLBACK
========================================================= */

async function handleOAuthCallback(){

  const params =
    new URLSearchParams(
      window.location.search
    );


  const code =
    params.get("code");


  const returnedState =
    params.get("state");


  const oauthError =
    params.get("error");


  if(oauthError){

    showToast(
      `Deriv login cancelled: ${oauthError}`
    );

    cleanOAuthUrl();

    return;
  }


  if(!code){

    return;
  }


  const savedState =
    sessionStorage.getItem(
      "krishwave_oauth_state"
    );


  const verifier =
    sessionStorage.getItem(
      "krishwave_oauth_verifier"
    );


  if(
    !returnedState ||
    !savedState ||
    returnedState !== savedState
  ){

    showToast(
      "OAuth security state mismatch."
    );

    cleanOAuthUrl();

    return;
  }


  if(!verifier){

    showToast(
      "OAuth verifier missing."
    );

    cleanOAuthUrl();

    return;
  }


  showToast(
    "Completing Deriv connection..."
  );


  try{

    const response =
      await fetch(
        `${BACKEND_URL}/api/oauth/exchange`,
        {
          method:"POST",

          headers:{
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


    if(
      !response.ok ||
      !data.success
    ){

      throw new Error(
        data.error ||
        "OAuth exchange failed"
      );
    }


    state.sessionId =
      data.session_id;


    localStorage.setItem(
      "krishwave_session",
      state.sessionId
    );


    sessionStorage.removeItem(
      "krishwave_oauth_state"
    );

    sessionStorage.removeItem(
      "krishwave_oauth_verifier"
    );


    cleanOAuthUrl();


    showToast(
      "Deriv account connected."
    );


    await loadAccounts();

  }catch(error){

    console.error(
      "OAuth callback error",
      error
    );

    showToast(
      error.message ||
      "Deriv connection failed."
    );
  }
}


function cleanOAuthUrl(){

  const clean =
    window.location.origin +
    window.location.pathname;


  window.history.replaceState(
    {},
    document.title,
    clean
  );
}


/* =========================================================
   ACCOUNT LOADING
========================================================= */

async function autoRestoreSession(){

  if(!state.sessionId){
    return;
  }


  await loadAccounts();
}


async function loadAccounts(){

  if(!state.sessionId){

    return;
  }


  try{

    const response =
      await fetch(
        `${BACKEND_URL}/api/accounts`,
        {
          method:"POST",

          headers:{
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


    if(
      response.status ===
      401
    ){

      localStorage.removeItem(
        "krishwave_session"
      );

      state.sessionId =
        null;

      showToast(
        "Deriv session expired. Please reconnect."
      );

      return;
    }


    if(
      !response.ok ||
      !data.success
    ){

      throw new Error(
        data.error ||
        "Unable to load accounts"
      );
    }


    const accounts =
      Array.isArray(
        data.accounts
      )
        ? data.accounts
        : [];


    /*
       Prefer demo account.
    */

    const demo =
      accounts.find(
        account =>
          isDemoAccount(
            account
          )
      );


    const account =
      demo ||
      accounts[0];


    if(account){

      state.account =
        account;


      state.connected =
        true;


      state.currency =
        account.currency ||
        account.currency_code ||
        "USD";


      updateAccountUI();

      await getAuthenticatedSocket(
        account
      );
    }


  }catch(error){

    console.error(
      "Account loading error",
      error
    );

    showToast(
      "Could not retrieve Deriv accounts."
    );
  }
}


/* =========================================================
   ACCOUNT UI
========================================================= */

function updateAccountUI(){

  const account =
    state.account;


  if(!account){
    return;
  }


  const id =
    account.account_id ||
    account.loginid ||
    account.id ||
    "CONNECTED";


  const currency =
    account.currency ||
    account.currency_code ||
    "USD";


  const balance =
    Number(
      account.balance
    );


  if($("accountId")){

    $("accountId")
      .textContent =
        id;
  }


  if($("currency")){

    $("currency")
      .textContent =
        currency;
  }


  /*
     Paper balance stays separate
     from real Deriv balance.
  */

  state.currency =
    currency;


  if($("dataStatus")){

    $("dataStatus")
      .textContent =
        "Deriv account connected • PAPER trading active";
  }


  updateConnection(
    true,
    "DERIV CONNECTED"
  );
}


/* =========================================================
   AUTHENTICATED WEBSOCKET
========================================================= */

async function getAuthenticatedSocket(
  account
){

  const accountId =
    account.account_id ||
    account.loginid ||
    account.id;


  if(!accountId){

    return;
  }


  try{

    const response =
      await fetch(
        `${BACKEND_URL}/api/otp`,
        {
          method:"POST",

          headers:{
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


    if(
      !response.ok ||
      !data.success
    ){

      throw new Error(
        data.error ||
        "OTP request failed"
      );
    }


    if(
      !data.websocket_url
    ){

      throw new Error(
        "No authenticated WebSocket URL returned."
      );
    }


    openAuthenticatedSocket(
      data.websocket_url
    );

  }catch(error){

    console.warn(
      "Authenticated WebSocket error:",
      error
    );
  }
}


/* =========================================================
   AUTHENTICATED WS
========================================================= */

function openAuthenticatedSocket(
  url
){

  try{

    if(
      state.authenticatedSocket
    ){

      try{
        state.authenticatedSocket.close();
      }catch{}
    }


    const ws =
      new WebSocket(
        url
      );


    state.authenticatedSocket =
      ws;


    ws.onopen = () => {

      console.log(
        "Authenticated Deriv WebSocket connected"
      );
    };


    ws.onmessage = event => {

      try{

        const message =
          JSON.parse(
            event.data
          );

        console.log(
          "Authenticated Deriv message:",
          message
        );

      }catch{}
    };


    ws.onclose = () => {

      console.log(
        "Authenticated WebSocket closed"
      );
    };


    ws.onerror = error => {

      console.warn(
        "Authenticated WebSocket error",
        error
      );
    };

  }catch(error){

    console.warn(
      "Authenticated socket error",
      error
    );
  }
}


/* =========================================================
   PUBLIC RECONNECT
========================================================= */

function schedulePublicReconnect(){

  if(state.reconnectTimer){

    return;
  }


  state.publicReconnectAttempts++;


  const delay =
    Math.min(
      30000,
      1500 *
      Math.pow(
        1.4,
        Math.min(
          8,
          state.publicReconnectAttempts
        )
      )
    );


  state.reconnectTimer =
    setTimeout(
      () => {

        state.reconnectTimer =
          null;

        openPublicSocket();

      },
      delay
    );
}


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnection(
  online,
  text
){

  const dot =
    $("connectionDot");


  const label =
    $("connectionText");


  if(dot){

    dot.classList.remove(
      "online",
      "offline",
      "connecting"
    );


    dot.classList.add(
      online
        ? "online"
        : "offline"
    );
  }


  if(label){

    label.textContent =
      text;
  }
}


function updateDataStatus(
  text
){

  if($("dataStatus")){

    $("dataStatus")
      .textContent =
        text;
  }
}


function connectedMarketCount(){

  return MARKETS.filter(
    symbol =>
      state.markets[
        symbol
      ]?.connected
  ).length;
}


/* =========================================================
   BALANCE
========================================================= */

function updateBalanceDisplay(){

  if($("balanceDisplay")){

    $("balanceDisplay")
      .textContent =
        money(
          state.paperBalance
        );
  }
}


/* =========================================================
   UTILITY
========================================================= */

function clamp(
  value,
  min,
  max
){

  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}


function formatPrice(
  value
){

  const number =
    Number(value);


  if(
    !Number.isFinite(
      number
    )
  ){

    return "--";
  }


  return number.toFixed(
    2
  );
}


function money(
  value
){

  return `$${Number(
    value || 0
  ).toFixed(2)}`;
}


function signedMoney(
  value
){

  const number =
    Number(value || 0);


  return `${
    number >= 0
      ? "+"
      : ""
  }$${number.toFixed(2)}`;
}


function prettyStrategy(
  strategy
){

  const names = {

    MATCHES:
      "Matches",

    DIFFERS:
      "Differs",

    OVER:
      "Over",

    UNDER:
      "Under",

    EVEN:
      "Even",

    ODD:
      "Odd"
  };


  return (
    names[
      strategy
    ] ||
    strategy ||
    "--"
  );
}


function formatDate(
  timestamp
){

  if(!timestamp){

    return "--";
  }


  const date =
    new Date(
      timestamp
    );


  if(
    Number.isNaN(
      date.getTime()
    )
  ){

    return "--";
  }


  return date.toLocaleString(
    undefined,
    {
      month:"short",
      day:"numeric",
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit"
    }
  );
}


function createId(){

  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2,8)
  );
}


function randomString(
  length
){

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";


  let result = "";


  for(
    let i=0;
    i<length;
    i++
  ){

    result +=
      chars[
        Math.floor(
          Math.random() *
          chars.length
        )
      ];
  }


  return result;
}


/* =========================================================
   PKCE
========================================================= */

function generateCodeVerifier(){

  const array =
    new Uint8Array(32);


  crypto.getRandomValues(
    array
  );


  return base64UrlEncode(
    array
  );
}


async function generateCodeChallenge(
  verifier
){

  const data =
    new TextEncoder()
      .encode(
        verifier
      );


  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );


  return base64UrlEncode(
    new Uint8Array(
      digest
    )
  );
}


function base64UrlEncode(
  bytes
){

  let binary = "";


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
      /=+$/,
      ""
    );
}


/* =========================================================
   CSS VARIABLE
========================================================= */

function getCSS(
  variable
){

  return getComputedStyle(
    document.documentElement
  )
    .getPropertyValue(
      variable
    )
    .trim();
}


/* =========================================================
   TOAST
========================================================= */

function showToast(
  message
){

  const toast =
    $("toast");


  const text =
    $("toastMessage");


  if(
    !toast ||
    !text
  ){

    return;
  }


  text.textContent =
    message;


  toast.classList.add(
    "show"
  );


  if(state.toastTimer){

    clearTimeout(
      state.toastTimer
    );
  }


  state.toastTimer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      3000
    );
}


/* =========================================================
   DEMO PAPER NOTICE
========================================================= */

console.log(
  "%cKRISHWAVE AI BEAST V7.2",
  "font-size:20px;font-weight:bold"
);

console.log(
  "Demo/Paper Intelligence Engine loaded."
);

console.log(
  "NO REAL TRADES ARE EXECUTED."
);


/* =========================================================
   END V7.2
========================================================= */