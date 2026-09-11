"use strict";

/* =========================================================
   KRISHWAVE AI BEAST V9.3
   DEMO / PAPER MARKET INTELLIGENCE ENGINE

   IMPORTANT:
   - NO REAL TRADES ARE EXECUTED.
   - All trades are paper trades.
   - Deriv public market data is used for analysis.
   - Deriv OAuth is optional and only displays account data.
   ========================================================= */

const CONFIG = {

  VERSION: "9.3",

  CLIENT_ID: "34khasPjsT0PCRR8X3Z70",

  REDIRECT_URI:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/",

  CLOUD_API:
    "https://krishwave2.chrispusatale99.workers.dev",

  PUBLIC_WS:
    "wss://api.derivws.com/trading/v1/options/ws/public",

  MARKETS: [
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
  ],

  MAX_TICKS: 250,

  MIN_ANALYSIS_TICKS: 20,

  ANALYSIS_WINDOW: 60,

  BOT_INTERVAL_MS: 3000,

  CIRCULAR_ANALYSIS_SECONDS: 10,
  CIRCULAR_PREDICT_SECONDS: 5,
  CIRCULAR_TRADE_SECONDS: 3,
  CIRCULAR_COOLDOWN_SECONDS: 3,

  START_PAPER_BALANCE: 1000,

  MIN_STAKE: 0.25,

  MAX_ACTIVE_TRADES: 10,

  BOT_MIN_CONFIDENCE: 60,

  PAYOUT: {
    MATCHES: 8.5,
    DIFFERS: 0.09,
    OVER: 0.95,
    UNDER: 0.95,
    EVEN: 0.95,
    ODD: 0.95
  }

};

/* =========================================================
   STATE
   ========================================================= */

const state = {

  publicWs: null,

  authWs: null,

  reconnectTimer: null,

  sessionToken:
    sessionStorage.getItem(
      "krishwave_cloud_session"
    ) || null,

  accountId: null,

  currency: "USD",

  derivBalance: 0,

  paperBalance: CONFIG.START_PAPER_BALANCE,

  currentMarket: "R_100",

  ticks: {},

  chartPrices: [],

  lastDigit: null,

  manualStrategy: "MATCHES",

  circularStrategy: "AUTO",

  botStrategies: [
    "MATCHES",
    "DIFFERS"
  ],

  botRunning: false,

  circularRunning: false,

  circularPhase: "IDLE",

  circularTimer: null,

  botTimer: null,

  tradeCounter: 0,

  activeTrades: [],

  paperTrades: [],

  stats: {
    total: 0,
    wins: 0,
    losses: 0,
    stake: 0,
    won: 0,
    profit: 0
  },

  sessionProfit: 0,

  martingaleLevel: 0,

  theme: "dark"

};

/* =========================================================
   DOM
   ========================================================= */

const $ = id =>
  document.getElementById(id);

const els = {};

/* =========================================================
   INIT
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);

function init(){

  cacheDOM();

  populateMarkets();

  loadPaperState();

  setupNavigation();

  setupTabs();

  setupStrategyControls();

  setupButtons();

  setupTheme();

  updateAllUI();

  connectPublicMarket();

  handleOAuthCallback();

  if(state.sessionToken){

    restoreCloudSession();

  }

  window.setTimeout(
    drawChart,
    100
  );

}

/* =========================================================
   DOM CACHE
   ========================================================= */

function cacheDOM(){

  const ids = [

    "connectionDot",
    "connectionText",
    "modeBadge",

    "accountId",
    "currency",
    "balanceDisplay",
    "connectDerivBtn",
    "dataStatus",

    "analysisPage",
    "tradePage",
    "historyPage",

    "analysisMarketSelect",
    "currentChartMarket",
    "currentLivePrice",
    "priceChartCanvas",

    "digitSampleCount",
    "lastDigit",
    "analysisConfidence",
    "marketDirection",

    "aiStatus",
    "aiCircle",
    "aiCircleLabel",
    "aiCirclePrediction",
    "aiPrediction",
    "aiType",
    "analysisMsg",
    "aiMarket",
    "digitStatsGrid",

    "scannerMarket",
    "marketStrength",
    "marketDirectionLarge",
    "marketMomentum",
    "marketVolatility",
    "marketPOC",
    "marketSignal",

    "aiCircleStatus",
    "cycleAnalysis",
    "cycleTrade",
    "aiCircleTimer",
    "cycleCooldown",

    "startAI",
    "stopAI",

    "tabAiBot",
    "tabCircularAI",
    "tabManual",

    "aiBotPanel",
    "circularPanel",
    "manualPanel",

    "engineStatusText",

    "botStatusDash",
    "botSelectedMarket",
    "botSelectedStrategy",
    "botScore",
    "aiPredictionLarge",
    "predictionConfidence",

    "botMarketSelect",
    "botStrategyTrigger",
    "botStrategyLabel",
    "stakeInput",
    "takeProfitInput",
    "stopLossInput",
    "martingaleInput",
    "startBotBtn",

    "circularStatusText",
    "circularMarketSelect",
    "circularStrategyTrigger",
    "circularStrategyLabel",
    "circularStakeInput",
    "circularTakeProfitInput",
    "circularStopLossInput",
    "startCircularTradeBtn",

    "manualStatusText",
    "manualMarketSelect",
    "manualStrategyTrigger",
    "manualSelectedStrategyLabel",
    "targetDigitContainer",
    "manualTargetDigitInput",
    "manualStakeInput",
    "manualTakeProfitInput",
    "manualStopLossInput",
    "placeTradeBtn",

    "paperTotal",
    "paperWins",
    "paperLosses",
    "paperAccuracy",

    "activeTradeCount",
    "activeTradesList",

    "clearLogsBtn",
    "tradingStatusLabel",
    "sessionProfitDisplay",
    "stopTradingBtn",
    "totalProfitDisplay",

    "historyTotalStake",
    "historyAmountWon",
    "historyNetProfit",
    "historyCardsList",

    "strategyModal",
    "closeStrategyModal",
    "strategyOptions",

    "botStrategyModal",
    "closeBotStrategyModal",
    "applyBotStrategies",

    "realConfirmModal",
    "confirmRealBtn",
    "cancelRealBtn",

    "themeToggle",

    "toast",
    "toastMessage"

  ];

  ids.forEach(
    id => {
      els[id] = $(id);
    }
  );

}

/* =========================================================
   MARKETS
   ========================================================= */

function populateMarkets(){

  const selects = [
    els.analysisMarketSelect,
    els.botMarketSelect,
    els.circularMarketSelect,
    els.manualMarketSelect
  ];

  selects.forEach(select => {

    if(!select) return;

    select.innerHTML = "";

    CONFIG.MARKETS.forEach(
      symbol => {

        const option =
          document.createElement(
            "option"
          );

        option.value = symbol;

        option.textContent = symbol;

        if(
          symbol ===
          state.currentMarket
        ){

          option.selected = true;

        }

        select.appendChild(
          option
        );

      }
    );

  });

}

/* =========================================================
   PUBLIC MARKET
   ========================================================= */

function connectPublicMarket(){

  setConnection(
    false,
    "CONNECTING"
  );

  try{

    state.publicWs =
      new WebSocket(
        CONFIG.PUBLIC_WS
      );

    state.publicWs.onopen =
      () => {

        setConnection(
          true,
          "LIVE"
        );

        updateStatus(
          "Deriv public market feed connected."
        );

        subscribeMarket(
          state.currentMarket
        );

      };

    state.publicWs.onmessage =
      event => {

        let data;

        try{

          data =
            JSON.parse(
              event.data
            );

        }catch{

          return;

        }

        processPublicMessage(
          data
        );

      };

    state.publicWs.onerror =
      () => {

        setConnection(
          false,
          "ERROR"
        );

        updateStatus(
          "Deriv market feed error."
        );

      };

    state.publicWs.onclose =
      () => {

        setConnection(
          false,
          "OFFLINE"
        );

        updateStatus(
          "Deriv market feed disconnected. Reconnecting..."
        );

        scheduleReconnect();

      };

  }catch(error){

    console.error(error);

    setConnection(
      false,
      "ERROR"
    );

    scheduleReconnect();

  }

}

function scheduleReconnect(){

  if(state.reconnectTimer)
    return;

  state.reconnectTimer =
    setTimeout(
      () => {

        state.reconnectTimer =
          null;

        connectPublicMarket();

      },
      3000
    );

}

function sendPublic(payload){

  if(
    state.publicWs &&
    state.publicWs.readyState ===
      WebSocket.OPEN
  ){

    state.publicWs.send(
      JSON.stringify(payload)
    );

  }

}

function subscribeMarket(symbol){

  if(
    !CONFIG.MARKETS.includes(
      symbol
    )
  ){

    return;

  }

  state.currentMarket =
    symbol;

  resetMarketState(
    symbol
  );

  syncMarketSelectors();

  els.currentChartMarket.textContent =
    symbol;

  els.aiMarket.textContent =
    symbol;

  els.scannerMarket.textContent =
    symbol;

  els.botSelectedMarket.textContent =
    symbol;

  updateStatus(
    `Analyzing ${symbol}...`
  );

  sendPublic({

    ticks: symbol,

    subscribe: 1,

    req_id: 200

  });

  sendPublic({

    ticks_history: symbol,

    count: CONFIG.MAX_TICKS,

    end: "latest",

    style: "ticks",

    req_id: 201

  });

}

function processPublicMessage(data){

  if(data.error){

    updateStatus(
      data.error.message ||
      "Deriv API error."
    );

    return;

  }

  if(data.msg_type === "tick"){

    const tick =
      data.tick;

    if(!tick)
      return;

    const symbol =
      tick.symbol ||
      state.currentMarket;

    addTick(
      symbol,
      Number(tick.quote),
      Number(
        tick.epoch ||
        Date.now()/1000
      )
    );

  }

  if(data.msg_type === "history"){

    processHistoryData(
      data
    );

  }

}

function processHistoryData(data){

  const prices =
    data.history?.prices ||
    [];

  const times =
    data.history?.times ||
    [];

  const symbol =
    data.echo_req?.ticks_history ||
    state.currentMarket;

  state.ticks[symbol] = [];

  prices.forEach(
    (price,index) => {

      addTick(
        symbol,
        Number(price),
        Number(
          times[index] ||
          Date.now()/1000
        ),
        false
      );

    }
  );

  if(
    symbol === state.currentMarket
  ){

    rebuildChartData();

    updateAnalysis();

    drawChart();

  }

}

/* =========================================================
   TICKS
   ========================================================= */

function resetMarketState(symbol){

  if(!state.ticks[symbol]){

    state.ticks[symbol] = [];

  }

  state.chartPrices = [];

  state.lastDigit = null;

}

function addTick(
  symbol,
  price,
  epoch,
  redraw = true
){

  if(
    !Number.isFinite(price)
  ){

    return;

  }

  if(!state.ticks[symbol]){

    state.ticks[symbol] = [];

  }

  const tick = {

    price,

    epoch,

    digit:
      getLastDigit(price)

  };

  state.ticks[symbol].push(
    tick
  );

  while(
    state.ticks[symbol].length >
    CONFIG.MAX_TICKS
  ){

    state.ticks[symbol].shift();

  }

  if(
    symbol === state.currentMarket
  ){

    state.lastDigit =
      tick.digit;

    state.chartPrices.push(
      price
    );

    while(
      state.chartPrices.length >
      100
    ){

      state.chartPrices.shift();

    }

    els.currentLivePrice.textContent =
      formatPrice(price);

    els.digitSampleCount.textContent =
      state.ticks[symbol].length;

    els.lastDigit.textContent =
      tick.digit;

    if(redraw){

      updateAnalysis();

      drawChart();

    }

  }

  settlePaperTrades(
    symbol,
    tick
  );

}

function rebuildChartData(){

  const list =
    state.ticks[
      state.currentMarket
    ] || [];

  state.chartPrices =
    list
      .slice(-100)
      .map(
        t => t.price
      );

}

function getLastDigit(price){

  const text =
    Number(price)
      .toFixed(5)
      .replace(
        ".",
        ""
      );

  return Number(
    text.charAt(
      text.length - 1
    )
  );

}

function formatPrice(price){

  return Number(price)
    .toFixed(5);

}

/* =========================================================
   ANALYSIS
   ========================================================= */

function updateAnalysis(){

  const list =
    state.ticks[
      state.currentMarket
    ] || [];

  if(
    list.length <
    CONFIG.MIN_ANALYSIS_TICKS
  ){

    els.aiStatus.textContent =
      "COLLECTING DATA";

    els.aiPrediction.textContent =
      "WAITING";

    els.aiCirclePrediction.textContent =
      "--";

    els.analysisConfidence.textContent =
      "0%";

    els.marketDirection.textContent =
      "WAIT";

    els.marketStrength.textContent =
      "WAITING";

    els.marketDirectionLarge.textContent =
      "WAITING";

    els.marketMomentum.textContent =
      "WAITING";

    els.marketVolatility.textContent =
      "WAITING";

    els.marketPOC.textContent =
      "-";

    els.marketSignal.textContent =
      "WAITING";

    return;

  }

  const digits =
    list.map(
      t => t.digit
    );

  const analysis =
    analyzeMarket(
      list
    );

  renderDigitStats(
    analysis.counts,
    digits.length
  );

  els.aiStatus.textContent =
    "AI ANALYSIS ACTIVE";

  els.aiPrediction.textContent =
    analysis.prediction;

  els.aiType.textContent =
    analysis.strategy;

  els.analysisConfidence.textContent =
    `${analysis.confidence}%`;

  els.analysisMsg.textContent =
    analysis.reason;

  els.aiCirclePrediction.textContent =
    analysis.prediction;

  els.botSelectedMarket.textContent =
    state.currentMarket;

  els.botScore.textContent =
    analysis.score;

  els.aiPredictionLarge.textContent =
    analysis.prediction;

  els.predictionConfidence.textContent =
    `${analysis.confidence}% confidence`;

  els.marketDirection.textContent =
    analysis.direction;

  els.marketDirectionLarge.textContent =
    analysis.direction;

  els.marketStrength.textContent =
    analysis.strength;

  els.marketMomentum.textContent =
    analysis.momentum;

  els.marketVolatility.textContent =
    analysis.volatility;

  els.marketPOC.textContent =
    analysis.poc;

  els.marketSignal.textContent =
    analysis.signal;

}

/* =========================================================
   MARKET AI
   ========================================================= */

function analyzeMarket(list){

  const windowData =
    list.slice(
      -CONFIG.ANALYSIS_WINDOW
    );

  const digits =
    windowData.map(
      t => t.digit
    );

  const counts =
    Array(10).fill(0);

  digits.forEach(
    d => counts[d]++
  );

  const total =
    digits.length;

  let hottest = 0;

  for(let i=1;i<10;i++){

    if(
      counts[i] >
      counts[hottest]
    ){

      hottest = i;

    }

  }

  const even =
    digits.filter(
      d => d % 2 === 0
    ).length;

  const odd =
    total - even;

  const over =
    digits.filter(
      d => d > 4
    ).length;

  const under =
    total - over;

  const evenPct =
    even / total;

  const oddPct =
    odd / total;

  const overPct =
    over / total;

  const underPct =
    under / total;

  const recent =
    windowData.slice(
      -20
    );

  const old =
    windowData.slice(
      0,
      Math.max(
        1,
        windowData.length - 20
      )
    );

  const recentAvg =
    averagePrice(recent);

  const oldAvg =
    averagePrice(old);

  let direction =
    "NEUTRAL";

  if(
    recentAvg >
    oldAvg * 1.00005
  ){

    direction =
      "BUY BIAS";

  }else if(
    recentAvg <
    oldAvg * 0.99995
  ){

    direction =
      "SELL BIAS";

  }

  const momentumChange =
    oldAvg
      ? Math.abs(
          recentAvg - oldAvg
        ) / oldAvg
      : 0;

  let momentum =
    "LOW";

  if(
    momentumChange > 0.0008
  ){

    momentum = "STRONG";

  }else if(
    momentumChange > 0.0003
  ){

    momentum = "MODERATE";

  }

  const returns =
    [];

  for(
    let i=1;
    i<windowData.length;
    i++
  ){

    returns.push(
      Math.abs(
        windowData[i].price -
        windowData[i-1].price
      )
    );

  }

  const volatilityValue =
    average(
      returns
    );

  let volatility =
    "LOW";

  if(
    volatilityValue >
    Math.abs(recentAvg) * 0.0008
  ){

    volatility =
      "HIGH";

  }else if(
    volatilityValue >
    Math.abs(recentAvg) * 0.0003
  ){

    volatility =
      "MODERATE";

  }

  const poc =
    hottest;

  const digitBias =
    Math.max(
      Math.abs(
        evenPct -
        oddPct
      ),
      Math.abs(
        overPct -
        underPct
      )
    );

  let strategy =
    "EVEN";

  let prediction =
    "EVEN";

  let score =
    50;

  if(
    Math.abs(
      overPct -
      underPct
    ) > 0.12
  ){

    strategy =
      overPct >
      underPct
        ? "OVER"
        : "UNDER";

    prediction =
      strategy;

    score =
      50 +
      Math.round(
        Math.abs(
          overPct -
          underPct
        ) * 100
      );

  }else if(
    Math.abs(
      evenPct -
      oddPct
    ) > 0.12
  ){

    strategy =
      evenPct >
      oddPct
        ? "EVEN"
        : "ODD";

    prediction =
      strategy;

    score =
      50 +
      Math.round(
        Math.abs(
          evenPct -
          oddPct
        ) * 100
      );

  }else{

    strategy =
      "MATCHES";

    prediction =
      String(hottest);

    score =
      45 +
      Math.round(
        (
          counts[hottest] /
          total
        ) * 100
      );

  }

  const trendBonus =
    direction === "NEUTRAL"
      ? 0
      : 5;

  score += trendBonus;

  score =
    clamp(
      score,
      1,
      99
    );

  const confidence =
    clamp(
      score - 3,
      1,
      99
    );

  let strength =
    "WEAK";

  if(
    confidence >= 85
  ){

    strength =
      "BEAST";

  }else if(
    confidence >= 75
  ){

    strength =
      "STRONG";

  }else if(
    confidence >= 60
  ){

    strength =
      "MODERATE";

  }

  let signal =
    "WAIT";

  if(
    confidence >= 75
  ){

    signal =
      direction === "SELL BIAS"
        ? "SELL SETUP"
        : direction === "BUY BIAS"
          ? "BUY SETUP"
          : "STRONG SIGNAL";

  }else if(
    confidence >= 60
  ){

    signal =
      "WATCH";

  }

  const reason =
    `POC digit ${poc} appears ${
      counts[poc]
    }/${total}. ` +
    `Even ${
      Math.round(
        evenPct * 100
      )
    }%, ` +
    `Odd ${
      Math.round(
        oddPct * 100
      )
    }%. ` +
    `Market ${direction.toLowerCase()}, ` +
    `momentum ${momentum.toLowerCase()}.`;

  return {

    counts,

    hottest,

    strategy,

    prediction,

    score,

    confidence,

    direction,

    strength,

    momentum,

    volatility,

    poc,

    signal,

    reason

  };

}

function analyzeCurrent(){

  const list =
    state.ticks[
      state.currentMarket
    ] || [];

  if(
    list.length <
    CONFIG.MIN_ANALYSIS_TICKS
  ){

    return null;

  }

  return analyzeMarket(
    list
  );

}

/* =========================================================
   DIGIT STATS
   ========================================================= */

function renderDigitStats(
  counts,
  total
){

  els.digitStatsGrid.innerHTML =
    "";

  const max =
    Math.max(
      ...counts,
      1
    );

  counts.forEach(
    (count,digit) => {

      const pct =
        total
          ? Math.round(
              count /
              total *
              100
            )
          : 0;

      const cell =
        document.createElement(
          "div"
        );

      cell.className =
        "digit-cell";

      cell.innerHTML = `

        <strong>${digit}</strong>

        <span>
          ${count} · ${pct}%
        </span>

        <div class="digit-bar"
             style="width:${Math.max(
               4,
               count / max * 100
             )}%">
        </div>

      `;

      els.digitStatsGrid.appendChild(
        cell
      );

    }
  );

}

/* =========================================================
   CIRCULAR AI
   ========================================================= */

function startCircularAI(){

  if(
    state.circularRunning
  ){

    return;

  }

  state.circularRunning =
    true;

  els.startAI.textContent =
    "CIRCULAR AI RUNNING";

  els.startCircularTradeBtn.textContent =
    "STOP CIRCULAR TRADING";

  els.circularStatusText.textContent =
    "RUNNING";

  els.engineStatusText.textContent =
    "CIRCULAR AI ACTIVE";

  runCircularPhase();

}

function stopCircularAI(){

  state.circularRunning =
    false;

  if(
    state.circularTimer
  ){

    clearTimeout(
      state.circularTimer
    );

    state.circularTimer =
      null;

  }

  state.circularPhase =
    "IDLE";

  els.aiCircleStatus.textContent =
    "IDLE";

  els.circularStatusText.textContent =
    "READY";

  els.aiCircleLabel.textContent =
    "AI";

  els.aiCircleTimer.textContent =
    "--";

  els.cycleAnalysis.textContent =
    "STOPPED";

  els.cycleTrade.textContent =
    "WAITING";

  els.cycleCooldown.textContent =
    "0";

  els.startAI.textContent =
    "START CIRCULAR AI";

  els.startCircularTradeBtn.textContent =
    "START CIRCULAR TRADING";

  if(
    !state.botRunning
  ){

    els.engineStatusText.textContent =
      "PAPER MODE";

  }

}

function runCircularPhase(){

  if(
    !state.circularRunning
  ){

    return;

  }

  const phases = [

    {
      name:"ANALYZING",
      seconds:
        CONFIG.CIRCULAR_ANALYSIS_SECONDS
    },

    {
      name:"PREDICTING",
      seconds:
        CONFIG.CIRCULAR_PREDICT_SECONDS
    },

    {
      name:"TRADE WINDOW",
      seconds:
        CONFIG.CIRCULAR_TRADE_SECONDS
    },

    {
      name:"COOLDOWN",
      seconds:
        CONFIG.CIRCULAR_COOLDOWN_SECONDS
    }

  ];

  let index = 0;

  function next(){

    if(
      !state.circularRunning
    ){

      return;

    }

    const phase =
      phases[index];

    state.circularPhase =
      phase.name;

    let remaining =
      phase.seconds;

    els.aiCircleStatus.textContent =
      phase.name;

    els.cycleAnalysis.textContent =
      phase.name;

    els.aiCircleTimer.textContent =
      remaining;

    els.cycleTrade.textContent =
      phase.name ===
      "TRADE WINDOW"
        ? "ACTIVE"
        : "WAITING";

    els.cycleCooldown.textContent =
      phase.name ===
      "COOLDOWN"
        ? remaining
        : "0";

    if(
      phase.name ===
      "PREDICTING"
    ){

      updateAnalysis();

    }

    if(
      phase.name ===
      "TRADE WINDOW"
    ){

      executeCircularPaperTrade();

    }

    const tick = () => {

      if(
        !state.circularRunning
      ){

        return;

      }

      remaining--;

      els.aiCircleTimer.textContent =
        Math.max(
          remaining,
          0
        );

      if(
        phase.name ===
        "COOLDOWN"
      ){

        els.cycleCooldown.textContent =
          Math.max(
            remaining,
            0
          );

      }

      if(
        remaining <= 0
      ){

        index =
          (index + 1) %
          phases.length;

        next();

      }else{

        state.circularTimer =
          setTimeout(
            tick,
            1000
          );

      }

    };

    state.circularTimer =
      setTimeout(
        tick,
        1000
      );

  }

  next();

}

function executeCircularPaperTrade(){

  const analysis =
    analyzeCurrent();

  if(!analysis){

    showToast(
      "Circular AI: collecting market data."
    );

    return;

  }

  let strategy =
    state.circularStrategy;

  if(
    strategy === "AUTO"
  ){

    strategy =
      analysis.strategy;

  }

  const target =
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
      ? analysis.hottest
      : null;

  const stake =
    readStake(
      els.circularStakeInput
    );

  if(
    analysis.confidence <
    55
  ){

    showToast(
      "Circular AI skipped: signal too weak."
    );

    return;

  }

  createPaperTrade({

    engine:"CIRCULAR AI",

    market:state.currentMarket,

    strategy,

    target,

    stake

  });

}

/* =========================================================
   AI BOT
   ========================================================= */

function toggleBot(){

  if(
    state.botRunning
  ){

    stopBot();

  }else{

    startBot();

  }

}

function startBot(){

  if(
    state.botRunning
  ){

    return;

  }

  state.botRunning =
    true;

  els.startBotBtn.textContent =
    "STOP AI BOT";

  els.botStatusDash.textContent =
    "RUNNING";

  els.engineStatusText.textContent =
    "AI BOT ACTIVE";

  runBotCycle();

  state.botTimer =
    setInterval(
      runBotCycle,
      CONFIG.BOT_INTERVAL_MS
    );

}

function stopBot(){

  state.botRunning =
    false;

  if(
    state.botTimer
  ){

    clearInterval(
      state.botTimer
    );

    state.botTimer =
      null;

  }

  els.startBotBtn.textContent =
    "START AI BOT";

  els.botStatusDash.textContent =
    "STOPPED";

  if(
    !state.circularRunning
  ){

    els.engineStatusText.textContent =
      "PAPER MODE";

  }

}

function runBotCycle(){

  if(
    !state.botRunning
  ){

    return;

  }

  const analysis =
    analyzeCurrent();

  if(!analysis){

    els.botStatusDash.textContent =
      "COLLECTING DATA";

    return;

  }

  els.botStatusDash.textContent =
    "ANALYZING";

  const selected =
    state.botStrategies;

  const strategy =
    chooseBotStrategy(
      analysis,
      selected
    );

  const target =
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
      ? analysis.hottest
      : null;

  els.botSelectedStrategy.textContent =
    formatStrategyList(
      selected
    );

  els.botStrategyLabel.textContent =
    formatStrategyList(
      selected
    );

  els.botScore.textContent =
    analysis.score;

  els.aiPredictionLarge.textContent =
    target !== null
      ? String(target)
      : strategy;

  els.predictionConfidence.textContent =
    `${analysis.confidence}% confidence`;

  if(
    analysis.confidence <
    CONFIG.BOT_MIN_CONFIDENCE
  ){

    els.botStatusDash.textContent =
      "WAITING FOR SIGNAL";

    return;

  }

  els.botStatusDash.textContent =
    "TRADE SIGNAL";

  const stake =
    readStake(
      els.stakeInput
    );

  createPaperTrade({

    engine:"AI BOT",

    market:state.currentMarket,

    strategy,

    target,

    stake

  });

}

function chooseBotStrategy(
  analysis,
  selected
){

  if(
    selected.includes(
      analysis.strategy
    )
  ){

    return analysis.strategy;

  }

  if(
    selected.includes("MATCHES")
  ){

    return "MATCHES";

  }

  if(
    selected.includes("DIFFERS")
  ){

    return "DIFFERS";

  }

  return selected[0] ||
    "EVEN";

}

function formatStrategyList(
  strategies
){

  if(
    !strategies ||
    !strategies.length
  ){

    return "NONE";

  }

  if(
    strategies.length === 6
  ){

    return "AUTO";

  }

  return strategies.join(
    " + "
  );

}

/* =========================================================
   MANUAL
   ========================================================= */

function placeManualTrade(){

  const strategy =
    state.manualStrategy;

  const market =
    els.manualMarketSelect.value;

  let target = null;

  if(
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
  ){

    target =
      Number(
        els.manualTargetDigitInput.value
      );

    if(
      !Number.isInteger(target) ||
      target < 0 ||
      target > 9
    ){

      showToast(
        "Target digit must be 0-9."
      );

      return;

    }

  }

  const stake =
    readStake(
      els.manualStakeInput
    );

  createPaperTrade({

    engine:"MANUAL",

    market,

    strategy,

    target,

    stake

  });

}

/* =========================================================
   PAPER TRADING
   ========================================================= */

function createPaperTrade({
  engine,
  market,
  strategy,
  target,
  stake
}){

  stake =
    Number(stake);

  if(
    !Number.isFinite(stake) ||
    stake < CONFIG.MIN_STAKE
  ){

    showToast(
      `Minimum paper stake is $${CONFIG.MIN_STAKE.toFixed(2)}.`
    );

    return;

  }

  if(
    state.activeTrades.length >=
    CONFIG.MAX_ACTIVE_TRADES
  ){

    showToast(
      "Maximum active paper trades reached."
    );

    return;

  }

  if(
    state.paperBalance <
    stake
  ){

    showToast(
      "Insufficient paper balance."
    );

    return;

  }

  if(
    !CONFIG.MARKETS.includes(
      market
    )
  ){

    showToast(
      "Invalid market."
    );

    return;

  }

  const list =
    state.ticks[market] ||
    [];

  const latest =
    list[list.length - 1];

  const trade = {

    id:
      ++state.tradeCounter,

    engine,

    market,

    strategy,

    target,

    stake,

    entryDigit:
      latest
        ? latest.digit
        : null,

    entryPrice:
      latest
        ? latest.price
        : null,

    createdAt:
      new Date().toISOString(),

    status:"OPEN"

  };

  state.paperBalance -=
    stake;

  state.activeTrades.push(
    trade
  );

  renderActiveTrades();

  updateBalance();

  updateStatsUI();

  savePaperState();

  showToast(
    `${engine}: ${strategy} paper trade opened.`
  );

}

/* =========================================================
   SETTLEMENT
   ========================================================= */

function settlePaperTrades(
  market,
  tick
){

  const matching =
    state.activeTrades.filter(
      trade =>
        trade.market ===
        market
    );

  if(
    !matching.length
  ){

    return;

  }

  matching.forEach(
    trade => {

      if(
        trade.entryPrice ===
        null
      ){

        trade.entryPrice =
          tick.price;

        trade.entryDigit =
          tick.digit;

        return;

      }

      if(
        trade.entryPrice ===
        tick.price
      ){

        return;

      }

      const win =
        evaluateStrategy(
          trade.strategy,
          trade.target,
          tick.digit
        );

      settleTrade(
        trade,
        tick,
        win
      );

    }
  );

}

function evaluateStrategy(
  strategy,
  target,
  digit
){

  switch(strategy){

    case "MATCHES":
      return digit ===
        Number(target);

    case "DIFFERS":
      return digit !==
        Number(target);

    case "OVER":
      return digit > 4;

    case "UNDER":
      return digit < 5;

    case "EVEN":
      return digit % 2 === 0;

    case "ODD":
      return digit % 2 !== 0;

    default:
      return false;

  }

}

function settleTrade(
  trade,
  tick,
  win
){

  const index =
    state.activeTrades.indexOf(
      trade
    );

  if(index === -1)
    return;

  state.activeTrades.splice(
    index,
    1
  );

  const payoutRate =
    Number(
      CONFIG.PAYOUT[
        trade.strategy
      ] || 0.95
    );

  const amountWon =
    win
      ? trade.stake *
        (1 + payoutRate)
      : 0;

  const profit =
    amountWon -
    trade.stake;

  if(win){

    state.paperBalance +=
      amountWon;

    state.stats.wins++;

    state.stats.won +=
      amountWon;

    state.martingaleLevel =
      0;

  }else{

    state.stats.losses++;

  }

  state.stats.total++;

  state.stats.stake +=
    trade.stake;

  state.stats.profit +=
    profit;

  state.sessionProfit +=
    profit;

  trade.exitDigit =
    tick.digit;

  trade.exitPrice =
    tick.price;

  trade.amountWon =
    amountWon;

  trade.profit =
    profit;

  trade.status =
    win
      ? "WIN"
      : "LOSS";

  trade.closedAt =
    new Date().toISOString();

  state.paperTrades.unshift(
    trade
  );

  savePaperState();

  updateAllUI();

}

/* =========================================================
   STATS
   ========================================================= */

function updateStatsUI(){

  els.paperTotal.textContent =
    state.stats.total;

  els.paperWins.textContent =
    state.stats.wins;

  els.paperLosses.textContent =
    state.stats.losses;

  const accuracy =
    state.stats.total
      ? Math.round(
          state.stats.wins /
          state.stats.total *
          100
        )
      : 0;

  els.paperAccuracy.textContent =
    `${accuracy}%`;

}

function renderActiveTrades(){

  els.activeTradeCount.textContent =
    state.activeTrades.length;

  if(
    !state.activeTrades.length
  ){

    els.activeTradesList.innerHTML =
      `<div class="empty">
        No active paper trades.
      </div>`;

    return;

  }

  els.activeTradesList.innerHTML =
    state.activeTrades
      .map(
        trade => `

        <div class="active-trade">

          <div>

            <strong>
              ${escapeHtml(
                trade.strategy
              )}
            </strong>

            <small>
              ${escapeHtml(
                trade.engine
              )}
              ·
              ${escapeHtml(
                trade.market
              )}
            </small>

          </div>

          <div>

            <strong>
              ${money(
                trade.stake
              )}
            </strong>

            <small>
              #${trade.id}
            </small>

          </div>

        </div>

      `
      )
      .join("");

}

/* =========================================================
   HISTORY
   ========================================================= */

function savePaperState(){

  const data = {

    paperBalance:
      state.paperBalance,

    paperTrades:
      state.paperTrades,

    activeTrades:
      state.activeTrades,

    tradeCounter:
      state.tradeCounter,

    botStrategies:
      state.botStrategies,

    manualStrategy:
      state.manualStrategy,

    circularStrategy:
      state.circularStrategy

  };

  localStorage.setItem(
    "KRISHWAVE_PAPER_STATE",
    JSON.stringify(data)
  );

}

function loadPaperState(){

  try{

    const raw =
      localStorage.getItem(
        "KRISHWAVE_PAPER_STATE"
      );

    if(!raw){

      return;

    }

    const data =
      JSON.parse(raw);

    if(
      Number.isFinite(
        Number(
          data.paperBalance
        )
      )
    ){

      state.paperBalance =
        Number(
          data.paperBalance
        );

    }

    if(
      Array.isArray(
        data.paperTrades
      )
    ){

      state.paperTrades =
        data.paperTrades;

    }

    if(
      Array.isArray(
        data.activeTrades
      )
    ){

      state.activeTrades =
        data.activeTrades;

    }

    if(
      Number.isFinite(
        Number(
          data.tradeCounter
        )
      )
    ){

      state.tradeCounter =
        Number(
          data.tradeCounter
        );

    }

    if(
      Array.isArray(
        data.botStrategies
      ) &&
      data.botStrategies.length
    ){

      state.botStrategies =
        data.botStrategies;

    }

    if(
      data.manualStrategy
    ){

      state.manualStrategy =
        data.manualStrategy;

    }

    if(
      data.circularStrategy
    ){

      state.circularStrategy =
        data.circularStrategy;

    }

    recalculateStats();

  }catch(error){

    console.error(
      "Paper state load error:",
      error
    );

  }

}

function recalculateStats(){

  const completed =
    state.paperTrades.filter(
      trade =>
        trade.status ===
          "WIN" ||
        trade.status ===
          "LOSS"
    );

  state.stats = {

    total:
      completed.length,

    wins:
      completed.filter(
        t =>
          t.status ===
          "WIN"
      ).length,

    losses:
      completed.filter(
        t =>
          t.status ===
          "LOSS"
      ).length,

    stake:
      completed.reduce(
        (sum,t) =>
          sum +
          Number(
            t.stake || 0
          ),
        0
      ),

    won:
      completed.reduce(
        (sum,t) =>
          sum +
          Number(
            t.amountWon || 0
          ),
        0
      ),

    profit:
      completed.reduce(
        (sum,t) =>
          sum +
          Number(
            t.profit || 0
          ),
        0
      )

  };

  state.sessionProfit =
    state.stats.profit;

}

function updateHistoryUI(){

  const totalStake =
    state.paperTrades.reduce(
      (sum,t) =>
        sum +
        Number(
          t.stake || 0
        ),
      0
    );

  const amountWon =
    state.paperTrades.reduce(
      (sum,t) =>
        sum +
        Number(
          t.amountWon || 0
        ),
      0
    );

  const netProfit =
    state.paperTrades.reduce(
      (sum,t) =>
        sum +
        Number(
          t.profit || 0
        ),
      0
    );

  els.historyTotalStake.textContent =
    money(totalStake);

  els.historyAmountWon.textContent =
    money(amountWon);

  els.historyNetProfit.textContent =
    money(netProfit);

  els.totalProfitDisplay.textContent =
    money(netProfit);

  els.sessionProfitDisplay.textContent =
    money(
      state.sessionProfit
    );

  els.sessionProfitDisplay.className =
    state.sessionProfit >= 0
      ? "positive"
      : "negative";

  if(
    !state.paperTrades.length
  ){

    els.historyCardsList.innerHTML =
      `<div class="empty">
        No completed trades yet.
      </div>`;

    return;

  }

  els.historyCardsList.innerHTML =
    state.paperTrades
      .slice(0,100)
      .map(
        trade => {

          const win =
            trade.status ===
            "WIN";

          return `

          <div class="history-card ${
            win
              ? "history-win"
              : "history-loss"
          }">

            <div class="history-top">

              <strong>
                ${escapeHtml(
                  trade.engine
                )}
              </strong>

              <strong class="result">

                ${win
                  ? "WIN"
                  : "LOSS"}

                ${
                  win
                    ? ` +${money(
                        trade.profit
                      )}`
                    : ` ${money(
                        trade.profit
                      )}`
                }

              </strong>

            </div>

            <div class="history-details">

              <div>
                <span>MARKET</span>
                <strong>
                  ${escapeHtml(
                    trade.market
                  )}
                </strong>
              </div>

              <div>
                <span>STRATEGY</span>
                <strong>
                  ${escapeHtml(
                    trade.strategy
                  )}
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
                <span>AMOUNT WON</span>
                <strong>
                  ${money(
                    trade.amountWon
                  )}
                </strong>
              </div>

              <div>
                <span>ENTRY</span>
                <strong>
                  ${
                    trade.entryDigit ??
                    "-"
                  }
                </strong>
              </div>

              <div>
                <span>EXIT</span>
                <strong>
                  ${
                    trade.exitDigit ??
                    "-"
                  }
                </strong>
              </div>

              <div>
                <span>TARGET</span>
                <strong>
                  ${
                    trade.target ??
                    "-"
                  }
                </strong>
              </div>

              <div>
                <span>TIME</span>
                <strong>
                  ${formatTime(
                    trade.closedAt
                  )}
                </strong>
              </div>

            </div>

          </div>

        `;

        }
      )
      .join("");

}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation(){

  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const page =
              button.dataset.page;

            document
              .querySelectorAll(
                ".page"
              )
              .forEach(
                item =>
                  item.classList.remove(
                    "active"
                  )
              );

            const target =
              $(`${page}Page`);

            if(target){

              target.classList.add(
                "active"
              );

            }

            document
              .querySelectorAll(
                ".nav-item"
              )
              .forEach(
                item =>
                  item.classList.remove(
                    "active"
                  )
              );

            button.classList.add(
              "active"
            );

            if(
              page ===
              "analysis"
            ){

              setTimeout(
                drawChart,
                50
              );

            }

          }
        );

      }
    );

}

/* =========================================================
   TABS
   ========================================================= */

function setupTabs(){

  const tabs = [

    [
      els.tabAiBot,
      els.aiBotPanel
    ],

    [
      els.tabCircularAI,
      els.circularPanel
    ],

    [
      els.tabManual,
      els.manualPanel
    ]

  ];

  tabs.forEach(
    ([button,panel]) => {

      button.addEventListener(
        "click",
        () => {

          tabs.forEach(
            ([b,p]) => {

              b.classList.remove(
                "active"
              );

              p.classList.remove(
                "active"
              );

            }
          );

          button.classList.add(
            "active"
          );

          panel.classList.add(
            "active"
          );

        }
      );

    }
  );

}

/* =========================================================
   STRATEGY CONTROLS
   ========================================================= */

function setupStrategyControls(){

  els.manualStrategyTrigger
    .addEventListener(
      "click",
      () => {

        state.strategyTarget =
          "MANUAL";

        openStrategyModal();

      }
    );

  els.circularStrategyTrigger
    .addEventListener(
      "click",
      () => {

        state.strategyTarget =
          "CIRCULAR";

        openStrategyModal();

      }
    );

  els.strategyOptions
    .querySelectorAll(
      "[data-strategy]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const strategy =
              button.dataset.strategy;

            applyIndependentStrategy(
              strategy
            );

            els.strategyModal
              .classList.remove(
                "show"
              );

          }
        );

      }
    );

  els.botStrategyTrigger
    .addEventListener(
      "click",
      openBotStrategyModal
    );

}

function openStrategyModal(){

  els.strategyModal
    .classList.add(
      "show"
    );

}

function openBotStrategyModal(){

  syncBotCheckboxes();

  els.botStrategyModal
    .classList.add(
      "show"
    );

}

function applyIndependentStrategy(
  strategy
){

  if(
    state.strategyTarget ===
    "MANUAL"
  ){

    state.manualStrategy =
      strategy;

    els.manualSelectedStrategyLabel.textContent =
      strategy;

    updateManualTargetUI();

  }

  if(
    state.strategyTarget ===
    "CIRCULAR"
  ){

    state.circularStrategy =
      strategy;

    els.circularStrategyLabel.textContent =
      strategy;

  }

  savePaperState();

}

function updateManualTargetUI(){

  const required =
    state.manualStrategy ===
      "MATCHES" ||
    state.manualStrategy ===
      "DIFFERS";

  els.targetDigitContainer.style.display =
    required
      ? "block"
      : "none";

}

function syncBotCheckboxes(){

  document
    .querySelectorAll(
      ".bot-strategy-check"
    )
    .forEach(
      input => {

        input.checked =
          state.botStrategies.includes(
            input.value
          );

      }
    );

}

/* =========================================================
   BUTTONS
   ========================================================= */

function setupButtons(){

  els.connectDerivBtn
    .addEventListener(
      "click",
      startDerivOAuth
    );

  els.startAI
    .addEventListener(
      "click",
      () => {

        if(
          state.circularRunning
        ){

          stopCircularAI();

        }else{

          startCircularAI();

        }

      }
    );

  els.stopAI
    .addEventListener(
      "click",
      stopCircularAI
    );

  els.startBotBtn
    .addEventListener(
      "click",
      toggleBot
    );

  els.startCircularTradeBtn
    .addEventListener(
      "click",
      () => {

        if(
          state.circularRunning
        ){

          stopCircularAI();

        }else{

          startCircularAI();

          showToast(
            "Circular AI paper trading started."
          );

        }

      }
    );

  els.placeTradeBtn
    .addEventListener(
      "click",
      placeManualTrade
    );

  els.closeStrategyModal
    .addEventListener(
      "click",
      closeAllModals
    );

  els.closeBotStrategyModal
    .addEventListener(
      "click",
      closeAllModals
    );

  els.applyBotStrategies
    .addEventListener(
      "click",
      applyBotStrategies
    );

  els.cancelRealBtn
    .addEventListener(
      "click",
      closeAllModals
    );

  els.confirmRealBtn
    .addEventListener(
      "click",
      () => {

        showToast(
          "Real trading is disabled. PAPER MODE ONLY."
        );

        closeAllModals();

      }
    );

  els.clearLogsBtn
    .addEventListener(
      "click",
      clearHistory
    );

  els.stopTradingBtn
    .addEventListener(
      "click",
      () => {

        stopBot();

        stopCircularAI();

        showToast(
          "All paper trading engines stopped."
        );

      }
    );

  els.analysisMarketSelect
    .addEventListener(
      "change",
      event => {

        subscribeMarket(
          event.target.value
        );

      }
    );

  els.botMarketSelect
    .addEventListener(
      "change",
      event => {

        subscribeMarket(
          event.target.value
        );

      }
    );

  els.circularMarketSelect
    .addEventListener(
      "change",
      event => {

        subscribeMarket(
          event.target.value
        );

      }
    );

  els.manualMarketSelect
    .addEventListener(
      "change",
      event => {

        state.currentMarket =
          event.target.value;

        els.analysisMarketSelect.value =
          event.target.value;

        els.botMarketSelect.value =
          event.target.value;

        els.circularMarketSelect.value =
          event.target.value;

        subscribeMarket(
          event.target.value
        );

      }
    );

}

/* =========================================================
   BOT STRATEGIES
   ========================================================= */

function applyBotStrategies(){

  const checked =
    Array.from(
      document.querySelectorAll(
        ".bot-strategy-check:checked"
      )
    ).map(
      input =>
        input.value
    );

  if(
    !checked.length
  ){

    showToast(
      "Select at least one AI Bot strategy."
    );

    return;

  }

  state.botStrategies =
    checked;

  const display =
    formatStrategyList(
      checked
    );

  els.botStrategyLabel.textContent =
    display;

  els.botSelectedStrategy.textContent =
    display;

  savePaperState();

  els.botStrategyModal
    .classList.remove(
      "show"
    );

  showToast(
    `AI Bot strategies: ${display}`
  );

}

/* =========================================================
   THEME
   ========================================================= */

function setupTheme(){

  const saved =
    localStorage.getItem(
      "krishwave_theme"
    );

  if(
    saved ===
    "light"
  ){

    document.body.classList.add(
      "light"
    );

    state.theme =
      "light";

  }

  els.themeToggle
    .addEventListener(
      "click",
      () => {

        document.body.classList.toggle(
          "light"
        );

        state.theme =
          document.body.classList.contains(
            "light"
          )
            ? "light"
            : "dark";

        localStorage.setItem(
          "krishwave_theme",
          state.theme
        );

        drawChart();

      }
    );

}

/* =========================================================
   CHART
   ========================================================= */

function drawChart(){

  const canvas =
    els.priceChartCanvas;

  if(!canvas)
    return;

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
    rect.width *
    dpr;

  canvas.height =
    rect.height *
    dpr;

  const ctx =
    canvas.getContext(
      "2d"
    );

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

  const prices =
    state.chartPrices;

  if(
    prices.length < 2
  ){

    return;

  }

  const min =
    Math.min(
      ...prices
    );

  const max =
    Math.max(
      ...prices
    );

  const range =
    max - min ||
    1;

  ctx.beginPath();

  prices.forEach(
    (price,index) => {

      const x =
        index /
        (prices.length - 1) *
        width;

      const y =
        height -
        (
          (price - min) /
          range
        ) *
        (height - 20) -
        10;

      if(
        index === 0
      ){

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
    "#00e5ff";

  ctx.lineWidth =
    2;

  ctx.stroke();

}

window.addEventListener(
  "resize",
  drawChart
);

/* =========================================================
   CLEAR HISTORY
   ========================================================= */

function clearHistory(){

  if(
    !confirm(
      "Clear KRISHWAVE paper trading history?"
    )
  ){

    return;

  }

  state.paperTrades =
    [];

  state.activeTrades =
    [];

  state.paperBalance =
    CONFIG.START_PAPER_BALANCE;

  state.tradeCounter =
    0;

  state.sessionProfit =
    0;

  recalculateStats();

  savePaperState();

  updateAllUI();

  showToast(
    "Paper trading history cleared."
  );

}

/* =========================================================
   OAUTH
   ========================================================= */

async function startDerivOAuth(){

  if(
    !CONFIG.CLOUD_API
  ){

    showToast(
      "Cloud connection is unavailable."
    );

    return;

  }

  try{

    const verifier =
      randomString(
        64
      );

    const stateValue =
      randomString(
        32
      );

    const challenge =
      await sha256Base64Url(
        verifier
      );

    sessionStorage.setItem(
      "krishwave_pkce_verifier",
      verifier
    );

    sessionStorage.setItem(
      "krishwave_oauth_state",
      stateValue
    );

    const url =
      new URL(
        "https://auth.deriv.com/oauth2/auth"
      );

    url.searchParams.set(
      "response_type",
      "code"
    );

    url.searchParams.set(
      "client_id",
      CONFIG.CLIENT_ID
    );

    url.searchParams.set(
      "redirect_uri",
      CONFIG.REDIRECT_URI
    );

    url.searchParams.set(
      "scope",
      "trade"
    );

    url.searchParams.set(
      "state",
      stateValue
    );

    url.searchParams.set(
      "code_challenge",
      challenge
    );

    url.searchParams.set(
      "code_challenge_method",
      "S256"
    );

    window.location.href =
      url.toString();

  }catch(error){

    console.error(error);

    showToast(
      "Unable to start Deriv login."
    );

  }

}

async function handleOAuthCallback(){

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

  if(error){

    showToast(
      params.get(
        "error_description"
      ) ||
      error
    );

    cleanUrl();

    return;

  }

  if(!code)
    return;

  const savedState =
    sessionStorage.getItem(
      "krishwave_oauth_state"
    );

  const verifier =
    sessionStorage.getItem(
      "krishwave_pkce_verifier"
    );

  if(
    !savedState ||
    !returnedState ||
    savedState !==
      returnedState
  ){

    showToast(
      "OAuth security check failed."
    );

    cleanUrl();

    return;

  }

  if(!verifier){

    showToast(
      "PKCE verifier missing."
    );

    cleanUrl();

    return;

  }

  try{

    const response =
      await fetch(
        `${CONFIG.CLOUD_API}/api/oauth/exchange`,
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

    const result =
      await response.json();

    if(!response.ok){

      throw new Error(
        result.error ||
        "OAuth exchange failed."
      );

    }

    if(!result.session){

      throw new Error(
        "Cloud session was not created."
      );

    }

    state.sessionToken =
      result.session;

    sessionStorage.setItem(
      "krishwave_cloud_session",
      result.session
    );

    sessionStorage.removeItem(
      "krishwave_pkce_verifier"
    );

    sessionStorage.removeItem(
      "krishwave_oauth_state"
    );

    cleanUrl();

    await restoreCloudSession();

    showToast(
      "Deriv demo account connected."
    );

  }catch(error){

    console.error(error);

    showToast(
      error.message ||
      "Deriv connection failed."
    );

    cleanUrl();

  }

}

async function restoreCloudSession(){

  if(
    !state.sessionToken
  ){

    return;

  }

  try{

    const response =
      await cloudFetch(
        "/api/session"
      );

    if(
      !response.ok
    ){

      throw new Error(
        "Session expired."
      );

    }

    const data =
      await response.json();

    if(data.account){

      state.accountId =
        data.account.account_id;

      state.currency =
        data.account.currency ||
        "USD";

      state.derivBalance =
        Number(
          data.account.balance ||
          0
        );

      els.accountId.textContent =
        state.accountId;

      els.currency.textContent =
        state.currency;

    }

    if(data.wsUrl){

      connectAuthenticatedWs(
        data.wsUrl
      );

    }

    updateBalance();

  }catch(error){

    console.error(error);

    sessionStorage.removeItem(
      "krishwave_cloud_session"
    );

    state.sessionToken =
      null;

    showToast(
      "Cloud session expired."
    );

  }

}

function connectAuthenticatedWs(
  wsUrl
){

  if(state.authWs){

    try{

      state.authWs.close();

    }catch{}

  }

  try{

    state.authWs =
      new WebSocket(
        wsUrl
      );

    state.authWs.onopen =
      () => {

        updateStatus(
          "Deriv DEMO account connection live."
        );

        requestBalance();

      };

    state.authWs.onmessage =
      event => {

        let data;

        try{

          data =
            JSON.parse(
              event.data
            );

        }catch{

          return;

        }

        processAuthenticatedMessage(
          data
        );

      };

    state.authWs.onerror =
      () => {

        updateStatus(
          "Authenticated Deriv connection error."
        );

      };

    state.authWs.onclose =
      () => {

        updateStatus(
          "Authenticated connection closed."
        );

      };

  }catch(error){

    console.error(error);

  }

}

function processAuthenticatedMessage(
  data
){

  if(
    data.msg_type ===
    "balance"
  ){

    if(data.balance){

      state.derivBalance =
        Number(
          data.balance.balance
        );

      state.currency =
        data.balance.currency ||
        state.currency;

      state.accountId =
        data.balance.loginid ||
        state.accountId;

      els.accountId.textContent =
        state.accountId;

      els.currency.textContent =
        state.currency;

    }

  }

  if(data.error){

    updateStatus(
      data.error.message ||
      "Authenticated API error."
    );

  }

}

function sendAuthenticated(
  payload
){

  if(
    state.authWs &&
    state.authWs.readyState ===
      WebSocket.OPEN
  ){

    state.authWs.send(
      JSON.stringify(
        payload
      )
    );

    return true;

  }

  return false;

}

function requestBalance(){

  sendAuthenticated({

    balance:1,

    subscribe:1,

    req_id:501

  });

}

/* =========================================================
   CLOUD FETCH
   ========================================================= */

async function cloudFetch(
  path,
  options={}
){

  const headers =
    new Headers(
      options.headers ||
      {}
    );

  headers.set(
    "X-KRISHWAVE-SESSION",
    state.sessionToken ||
    ""
  );

  return fetch(
    `${CONFIG.CLOUD_API}${path}`,
    {
      ...options,
      headers
    }
  );

}

/* =========================================================
   PKCE
   ========================================================= */

function randomString(
  length
){

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const values =
    new Uint8Array(
      length
    );

  crypto.getRandomValues(
    values
  );

  return Array.from(
    values,
    value =>
      chars[
        value %
        chars.length
      ]
  ).join("");

}

async function sha256Base64Url(
  value
){

  const data =
    new TextEncoder()
      .encode(
        value
      );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return base64Url(
    new Uint8Array(
      hash
    )
  );

}

function base64Url(
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
   UI
   ========================================================= */

function setConnection(
  online,
  text
){

  els.connectionDot.className =
    `dot ${
      online
        ? "online"
        : "offline"
    }`;

  els.connectionText.textContent =
    text;

}

function updateStatus(
  message
){

  els.dataStatus.textContent =
    message;

}

function updateBalance(){

  els.balanceDisplay.textContent =
    `${state.currency} ${
      Number(
        state.paperBalance
      ).toFixed(2)
    }`;

}

function updateAllUI(){

  updateBalance();

  updateStatsUI();

  renderActiveTrades();

  updateHistoryUI();

  updateManualTargetUI();

  els.botStrategyLabel.textContent =
    formatStrategyList(
      state.botStrategies
    );

  els.botSelectedStrategy.textContent =
    formatStrategyList(
      state.botStrategies
    );

  els.manualSelectedStrategyLabel.textContent =
    state.manualStrategy;

  els.circularStrategyLabel.textContent =
    state.circularStrategy;

  syncMarketSelectors();

}

function syncMarketSelectors(){

  const selects = [

    els.analysisMarketSelect,
    els.botMarketSelect,
    els.circularMarketSelect,
    els.manualMarketSelect

  ];

  selects.forEach(
    select => {

      if(select){

        select.value =
          state.currentMarket;

      }

    }
  );

}

function readStake(input){

  const value =
    Number(
      input?.value
    );

  if(
    !Number.isFinite(value)
  ){

    return 1;

  }

  return Math.max(
    CONFIG.MIN_STAKE,
    value
  );

}

function money(value){

  return `$${Number(
    value || 0
  ).toFixed(2)}`;

}

function showToast(
  message
){

  els.toastMessage.textContent =
    message;

  els.toast.classList.add(
    "show"
  );

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(
      () => {

        els.toast.classList.remove(
          "show"
        );

      },
      3000
    );

}

function cleanUrl(){

  window.history.replaceState(
    {},
    document.title,
    CONFIG.REDIRECT_URI
  );

}

function closeAllModals(){

  document
    .querySelectorAll(
      ".modal"
    )
    .forEach(
      modal =>
        modal.classList.remove(
          "show"
        )
    );

}

/* =========================================================
   HELPERS
   ========================================================= */

function averagePrice(
  list
){

  if(
    !list.length
  ){

    return 0;

  }

  return list.reduce(
    (sum,t) =>
      sum +
      Number(
        t.price || 0
      ),
    0
  ) / list.length;

}

function average(
  values
){

  if(
    !values.length
  ){

    return 0;

  }

  return values.reduce(
    (sum,value) =>
      sum +
      Number(value || 0),
    0
  ) / values.length;

}

function clamp(
  value,
  min,
  max
){

  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );

}

function escapeHtml(
  value
){

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

function formatTime(
  value
){

  if(!value)
    return "-";

  const date =
    new Date(
      value
    );

  if(
    Number.isNaN(
      date.getTime()
    )
  ){

    return "-";

  }

  return date.toLocaleTimeString(
    [],
    {
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit"
    }
  );

}