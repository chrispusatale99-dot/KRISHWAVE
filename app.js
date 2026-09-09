/* =========================================================
   KRISHWAVE AI BEAST V7.0
   DEMO / PAPER TRADING ENGINE
   ---------------------------------------------------------
   - Public Deriv tick data
   - AI autonomous market selection
   - AI autonomous strategy selection
   - AI BOT = 3-second analysis
   - Circular AI = 10 -> 5 -> 3
   - Manual engine
   - Paper trades only
   - History
   - Take Profit / Stop Loss
   - Martingale simulation
   ========================================================= */

const DERIV_CLIENT_ID = "34khasPjsT0PCRR8X3Z70";

const REDIRECT_URI =
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const OAUTH_BACKEND =
  "https://krishwave-oauth.chrispusatale99.workers.dev";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";


const MARKETS = [
  "R_10","R_25","R_50","R_75","R_100",
  "1HZ10V","1HZ25V","1HZ30V","1HZ50V",
  "1HZ75V","1HZ90V","1HZ100V",
  "1HZ150V","1HZ250V","1HZ1000V"
];

const STRATEGIES = [
  "MATCHES",
  "DIFFERS",
  "OVER",
  "UNDER",
  "EVEN",
  "ODD"
];

const STRATEGY_LABELS = {
  MATCHES:"Matches",
  DIFFERS:"Differs",
  OVER:"Over",
  UNDER:"Under",
  EVEN:"Even",
  ODD:"Odd"
};

const HISTORY_KEY = "krishwave_v7_history";
const BALANCE_KEY = "krishwave_v7_balance";
const THEME_KEY = "krishwave_theme";
const SETTINGS_KEY = "krishwave_v7_settings";


const state = {

  connected:false,
  accessToken:null,
  accountId:null,
  currency:"USD",

  paperBalance:1000,

  engineMode:"ai",

  selectedMarket:"R_10",
  selectedStrategy:"MATCHES",

  botStrategyPool:[
    "MATCHES",
    "DIFFERS"
  ],

  markets:{},

  priceHistory:[],

  history:[],
  activeTrades:[],

  totalProfit:0,
  totalAmountWon:0,
  totalStake:0,

  wins:0,
  losses:0,

  aiRunning:false,
  aiCycleToken:0,

  circularRunning:false,
  circularToken:0,

  publicWS:null,
  publicReconnectTimer:null,

  botTimer:null,
  circularTimer:null,

  lastBotDecision:null,
  lastCircularPrediction:null,

  botBaseStake:10,
  botCurrentStake:10,
  botMartingaleLevel:0,

  botTakeProfit:50,
  botStopLoss:100,
  botSessionStartProfit:0,

  circularTakeProfit:50,
  circularStopLoss:100,
  circularSessionStartProfit:0,

  tradingStopped:false,
  sessionStartProfit:0
};


/* =========================================================
   DOM
   ========================================================= */

const $ = id => document.getElementById(id);

function setText(id,value){

  const el = $(id);

  if(el){
    el.textContent =
      value === undefined || value === null
        ? "—"
        : value;
  }
}


/* =========================================================
   STORAGE
   ========================================================= */

function loadState(){

  try{

    const history =
      JSON.parse(
        localStorage.getItem(HISTORY_KEY) || "[]"
      );

    if(Array.isArray(history))
      state.history = history;

    const balance =
      Number(
        localStorage.getItem(BALANCE_KEY)
      );

    if(Number.isFinite(balance))
      state.paperBalance = balance;

    const settings =
      JSON.parse(
        localStorage.getItem(SETTINGS_KEY) || "{}"
      );

    if(settings.selectedMarket)
      state.selectedMarket =
        settings.selectedMarket;

    if(settings.selectedStrategy)
      state.selectedStrategy =
        settings.selectedStrategy;

    if(Array.isArray(settings.botStrategyPool))
      state.botStrategyPool =
        settings.botStrategyPool;

  }catch(error){

    console.warn(
      "Storage load error",
      error
    );

  }

  calculateTotals();
}


function saveState(){

  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(
      state.history.slice(0,500)
    )
  );

  localStorage.setItem(
    BALANCE_KEY,
    state.paperBalance.toFixed(2)
  );

  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      selectedMarket:state.selectedMarket,
      selectedStrategy:state.selectedStrategy,
      botStrategyPool:state.botStrategyPool
    })
  );
}


/* =========================================================
   THEME
   ========================================================= */

function loadTheme(){

  const theme =
    localStorage.getItem(THEME_KEY);

  if(theme === "light")
    document.body.classList.add("light");
}


function toggleTheme(){

  document.body.classList.toggle("light");

  localStorage.setItem(
    THEME_KEY,
    document.body.classList.contains("light")
      ? "light"
      : "dark"
  );
}


/* =========================================================
   TOAST
   ========================================================= */

function toast(message){

  setText(
    "toastMessage",
    message
  );

  const box = $("toast");

  if(!box) return;

  box.classList.add("show");

  setTimeout(
    ()=>box.classList.remove("show"),
    2500
  );
}


/* =========================================================
   SELECTS
   ========================================================= */

function populateMarkets(){

  [
    $("circularMarketSelect"),
    $("manualMarketSelect")
  ].forEach(select=>{

    if(!select) return;

    select.innerHTML = "";

    MARKETS.forEach(symbol=>{

      const option =
        document.createElement("option");

      option.value = symbol;
      option.textContent = symbol;

      if(symbol === state.selectedMarket)
        option.selected = true;

      select.appendChild(option);
    });

  });
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation(){

  document.querySelectorAll(".nav-btn")
    .forEach(button=>{

      button.addEventListener(
        "click",
        ()=>{

          const page =
            button.dataset.page;

          document.querySelectorAll(".page")
            .forEach(p=>
              p.classList.remove("active")
            );

          const target =
            $(
              page === "analysis"
                ? "analysisPage"
                : page === "trade"
                ? "tradePage"
                : "historyPage"
            );

          if(target)
            target.classList.add("active");

          document.querySelectorAll(".nav-btn")
            .forEach(b=>
              b.classList.remove("active")
            );

          button.classList.add("active");

          if(page === "history")
            renderHistory();
        }
      );

    });
}


/* =========================================================
   ENGINE SELECTION
   ========================================================= */

function selectEngine(mode){

  if(mode === "ai"){

    stopCircular(false);

    state.engineMode = "ai";

    $("aiBotPanel")?.classList.remove("hidden");
    $("circularPanel")?.classList.add("hidden");
    $("manualPanel")?.classList.add("hidden");

    $("tabAiBot")?.classList.add("active");
    $("tabCircularAI")?.classList.remove("active");
    $("tabManual")?.classList.remove("active");

    setText(
      "tradingStatusLabel",
      state.aiRunning ? "RUNNING" : "READY"
    );

  }

  if(mode === "circular"){

    stopAI(false);

    state.engineMode = "circular";

    $("aiBotPanel")?.classList.add("hidden");
    $("circularPanel")?.classList.remove("hidden");
    $("manualPanel")?.classList.add("hidden");

    $("tabAiBot")?.classList.remove("active");
    $("tabCircularAI")?.classList.add("active");
    $("tabManual")?.classList.remove("active");

    setText(
      "tradingStatusLabel",
      state.circularRunning
        ? "RUNNING"
        : "READY"
    );

  }

  if(mode === "manual"){

    stopAI(false);
    stopCircular(false);

    state.engineMode = "manual";

    $("aiBotPanel")?.classList.add("hidden");
    $("circularPanel")?.classList.add("hidden");
    $("manualPanel")?.classList.remove("hidden");

    $("tabAiBot")?.classList.remove("active");
    $("tabCircularAI")?.classList.remove("active");
    $("tabManual")?.classList.add("active");

    setText(
      "tradingStatusLabel",
      "MANUAL"
    );
  }

  updateAnalysisEngine();
}


function updateAnalysisEngine(){

  if(state.engineMode === "ai"){

    setText("aiCircleLabel","AI BOT");
    setText(
      "aiCircleStatus",
      state.aiRunning
        ? "ANALYZING"
        : "STANDBY"
    );

  }

  if(state.engineMode === "circular"){

    setText(
      "aiCircleLabel",
      state.circularRunning
        ? "RUNNING"
        : "CIRCULAR AI"
    );

    setText(
      "aiCircleStatus",
      state.circularRunning
        ? "ACTIVE"
        : "STANDBY"
    );

  }

  if(state.engineMode === "manual"){

    setText(
      "aiCircleLabel",
      "MANUAL"
    );

    setText(
      "aiCircleStatus",
      "MANUAL CONTROL"
    );
  }
}


/* =========================================================
   WEBSOCKET
   ========================================================= */

function connectPublicWS(){

  if(state.publicWS){

    try{
      state.publicWS.close();
    }catch{}
  }

  setText(
    "connectionText",
    "CONNECTING"
  );

  $("connectionDot")
    ?.classList.remove(
      "connected",
      "offline"
    );

  const ws =
    new WebSocket(PUBLIC_WS);

  state.publicWS = ws;

  ws.onopen = ()=>{

    state.connected = true;

    $("connectionDot")
      ?.classList.add("connected");

    setText(
      "connectionText",
      "LIVE"
    );

    setText(
      "dataStatus",
      "Deriv public market data connected."
    );

    MARKETS.forEach(symbol=>{

      try{

        ws.send(
          JSON.stringify({
            ticks:symbol,
            subscribe:1
          })
        );

      }catch{}

    });
  };


  ws.onmessage = event=>{

    try{

      const msg =
        JSON.parse(event.data);

      if(msg.tick)
        processTick(msg.tick);

    }catch(error){

      console.warn(
        "Tick error",
        error
      );
    }
  };


  ws.onerror = ()=>{

    state.connected = false;

    $("connectionDot")
      ?.classList.add("offline");

    setText(
      "connectionText",
      "OFFLINE"
    );
  };


  ws.onclose = ()=>{

    state.connected = false;

    $("connectionDot")
      ?.classList.remove("connected");

    $("connectionDot")
      ?.classList.add("offline");

    setText(
      "connectionText",
      "RECONNECTING"
    );

    clearTimeout(
      state.publicReconnectTimer
    );

    state.publicReconnectTimer =
      setTimeout(
        connectPublicWS,
        3000
      );
  };
}


/* =========================================================
   DIGIT
   ========================================================= */

function getLastDigitFromTick(tick){

  const quote =
    Number(tick.quote);

  if(!Number.isFinite(quote))
    return null;

  let pipSize =
    Number(tick.pip_size);

  if(
    !Number.isFinite(pipSize) ||
    pipSize <= 0
  ){

    const quoteString =
      String(tick.quote);

    const decimals =
      quoteString.includes(".")
        ? quoteString.split(".")[1].length
        : 0;

    pipSize =
      Math.pow(
        10,
        -decimals
      );
  }

  const scaled =
    Math.round(
      quote / pipSize
    );

  return Math.abs(scaled) % 10;
}


/* =========================================================
   PROCESS TICK
   ========================================================= */

function processTick(tick){

  const symbol =
    tick.symbol;

  if(!symbol)
    return;

  const digit =
    getLastDigitFromTick(tick);

  if(digit === null)
    return;

  if(!state.markets[symbol]){

    state.markets[symbol] = {
      ticks:[],
      prices:[]
    };
  }

  const market =
    state.markets[symbol];

  market.ticks.push(digit);

  market.prices.push(
    Number(tick.quote)
  );

  if(market.ticks.length > 100)
    market.ticks.shift();

  if(market.prices.length > 100)
    market.prices.shift();

  if(symbol === state.selectedMarket){

    state.priceHistory =
      market.prices.slice(-40);

    setText(
      "currentChartMarket",
      symbol
    );

    setText(
      "currentLivePrice",
      Number(tick.quote).toFixed(5)
    );

    renderDigitStats(symbol);
    drawChart();
  }

  settlePendingTrades(
    symbol,
    digit
  );

  updateAnalysis();

}


/* =========================================================
   ENTROPY
   ========================================================= */

function calculateEntropy(
  counts,
  total
){

  if(!total)
    return 0;

  let entropy = 0;

  Object.values(counts)
    .forEach(count=>{

      if(count <= 0)
        return;

      const p =
        count / total;

      entropy -=
        p * Math.log2(p);
    });

  return entropy /
    Math.log2(10);
}


/* =========================================================
   MARKET ANALYSIS
   ========================================================= */

function analyzeMarket(symbol){

  const market =
    state.markets[symbol];

  if(
    !market ||
    market.ticks.length < 20
  )
    return null;

  const ticks =
    market.ticks.slice(-30);

  const counts =
    Array(10).fill(0);

  ticks.forEach(d=>{
    counts[d]++;
  });

  const total =
    ticks.length;

  const percentages =
    counts.map(
      n => n / total
    );

  let hottest = 0;
  let coldest = 0;

  for(let i=1;i<10;i++){

    if(counts[i] > counts[hottest])
      hottest = i;

    if(counts[i] < counts[coldest])
      coldest = i;
  }

  const lastDigit =
    ticks[ticks.length-1];

  let streak = 1;

  for(
    let i=ticks.length-2;
    i>=0;
    i--
  ){

    if(ticks[i] === lastDigit)
      streak++;
    else
      break;
  }

  const evenRate =
    ticks.filter(
      d=>d % 2 === 0
    ).length / total;

  const overRate =
    ticks.filter(
      d=>d > 5
    ).length / total;

  const underRate =
    ticks.filter(
      d=>d < 5
    ).length / total;

  const concentration =
    Math.max(...percentages);

  const entropy =
    calculateEntropy(
      Object.fromEntries(
        counts.map(
          (v,i)=>[i,v]
        )
      ),
      total
    );

  const stability =
    Math.max(
      0,
      Math.min(
        100,
        100 - entropy * 100
      )
    );

  let score = 50;

  score +=
    Math.abs(
      evenRate - .5
    ) * 30;

  score +=
    Math.abs(
      overRate - .5
    ) * 25;

  score +=
    Math.min(
      streak * 2,
      12
    );

  score +=
    Math.abs(
      concentration - .10
    ) * 30;

  score =
    Math.max(
      0,
      Math.min(
        100,
        score
      )
    );

  let strength =
    "WEAK";

  if(score >= 75)
    strength = "STRONG";
  else if(score >= 62)
    strength = "GOOD";
  else if(score >= 52)
    strength = "MODERATE";


  const recent =
    ticks.slice(-12);

  const recentEven =
    recent.filter(
      d=>d % 2 === 0
    ).length;

  const directional =
    Math.max(
      recent.filter(d=>d>5).length,
      recent.filter(d=>d<5).length
    );

  const agreement =
    (
      (
        Math.abs(
          recentEven / recent.length - .5
        ) +
        Math.abs(
          directional / recent.length - .5
        )
      ) / 1
    ) * 100;


  return {
    symbol,
    ticks,
    counts,
    percentages,
    total,
    hottest,
    coldest,
    lastDigit,
    streak,
    evenRate,
    overRate,
    underRate,
    concentration,
    entropy,
    stability,
    score,
    strength,
    agreement
  };
}


/* =========================================================
   BEST MARKET
   ========================================================= */

function chooseBestMarket(){

  const results =
    MARKETS
      .map(analyzeMarket)
      .filter(Boolean);

  if(!results.length)
    return null;

  results.sort(
    (a,b)=>
      (
        b.score +
        b.agreement * .20
      ) -
      (
        a.score +
        a.agreement * .20
      )
  );

  return results[0];
}


/* =========================================================
   STRATEGY SELECTION
   ========================================================= */

function chooseBotStrategy(
  analysis
){

  const pool =
    state.botStrategyPool.length
      ? state.botStrategyPool
      : ["MATCHES","DIFFERS"];

  let best =
    pool[0];

  let bestScore =
    -Infinity;

  pool.forEach(strategy=>{

    let score =
      analysis.agreement;

    if(strategy === "MATCHES")
      score +=
        analysis.concentration * 100;

    if(strategy === "DIFFERS")
      score +=
        (1-analysis.concentration)*100;

    if(strategy === "EVEN")
      score +=
        Math.abs(
          analysis.evenRate-.5
        ) * 100;

    if(strategy === "ODD")
      score +=
        Math.abs(
          analysis.evenRate-.5
        ) * 100;

    if(strategy === "OVER")
      score +=
        Math.abs(
          analysis.overRate-.5
        ) * 100;

    if(strategy === "UNDER")
      score +=
        Math.abs(
          analysis.underRate-.5
        ) * 100;

    if(score > bestScore){

      bestScore =
        score;

      best =
        strategy;
    }
  });

  return best;
}


/* =========================================================
   PREDICTION
   ========================================================= */

function createPrediction(
  analysis,
  strategy
){

  let prediction;

  if(
    strategy === "MATCHES" ||
    strategy === "DIFFERS"
  ){

    prediction =
      analysis.hottest;
  }

  if(strategy === "OVER"){

    prediction =
      analysis.hottest > 5
        ? analysis.hottest
        : 6;
  }

  if(strategy === "UNDER"){

    prediction =
      analysis.hottest < 5
        ? analysis.hottest
        : 4;
  }

  if(strategy === "EVEN"){

    const evenDigits =
      [0,2,4,6,8];

    prediction =
      evenDigits.reduce(
        (best,d)=>
          analysis.counts[d] >
          analysis.counts[best]
            ? d
            : best,
        0
      );
  }

  if(strategy === "ODD"){

    const oddDigits =
      [1,3,5,7,9];

    prediction =
      oddDigits.reduce(
        (best,d)=>
          analysis.counts[d] >
          analysis.counts[best]
            ? d
            : best,
        1
      );
  }

  const confidence =
    Math.max(
      50,
      Math.min(
        95,
        50 +
        analysis.concentration * 150 +
        analysis.score * .25 +
        Math.min(
          analysis.streak * 2,
          10
        )
      )
    );

  return {
    strategy,
    prediction,
    confidence:
      Number(
        confidence.toFixed(1)
      )
  };
}


/* =========================================================
   UPDATE ANALYSIS
   ========================================================= */

function updateAnalysis(){

  const analysis =
    analyzeMarket(
      state.selectedMarket
    );

  if(!analysis){

    setText(
      "analysisMsg",
      "Collecting tick data..."
    );

    return;
  }

  setText(
    "aiMarket",
    analysis.symbol
  );

  setText(
    "botSelectedMarket",
    analysis.symbol
  );

  setText(
    "reportMarket",
    analysis.symbol
  );

  setText(
    "reportScore",
    analysis.score.toFixed(1)
  );

  setText(
    "reportStrength",
    analysis.strength
  );

  setText(
    "reportStability",
    analysis.stability.toFixed(1)+"%"
  );

  setText(
    "reportConcentration",
    (analysis.concentration*100)
      .toFixed(1)+"%"
  );

  setText(
    "reportStreak",
    analysis.streak
  );

  setText(
    "reportAgreement",
    analysis.agreement.toFixed(1)+"%"
  );

  const strategy =
    chooseBotStrategy(
      analysis
    );

  const prediction =
    createPrediction(
      analysis,
      strategy
    );

  setText(
    "aiType",
    STRATEGY_LABELS[strategy]
  );

  setText(
    "aiPrediction",
    prediction.prediction
  );

  setText(
    "analysisConfidence",
    prediction.confidence+"%"
  );

  setText(
    "botSelectedStrategy",
    STRATEGY_LABELS[strategy]
  );

  setText(
    "botScore",
    analysis.score.toFixed(1)
  );

  setText(
    "botConfidence",
    prediction.confidence+"%"
  );

  setText(
    "botStrategyLabel",
    state.botStrategyPool
      .map(s=>STRATEGY_LABELS[s])
      .join(", ")
  );

  setText(
    "analysisMsg",
    "AI continuously evaluates market score, digit concentration, streak, stability and agreement."
  );

  if(state.engineMode === "ai"){

    setText(
      "aiCircleLabel",
      state.aiRunning
        ? "AI BOT"
        : "READY"
    );
  }
}


/* =========================================================
   DIGIT DISPLAY
   ========================================================= */

function renderDigitStats(symbol){

  const market =
    state.markets[symbol];

  if(!market)
    return;

  const ticks =
    market.ticks.slice(-30);

  const counts =
    Array(10).fill(0);

  ticks.forEach(
    d=>counts[d]++
  );

  setText(
    "digitSampleCount",
    ticks.length+" ticks"
  );

  const grid =
    $("digitStatsGrid");

  if(!grid)
    return;

  grid.innerHTML = "";

  counts.forEach(
    (count,d)=>{

      const box =
        document.createElement("div");

      box.className =
        "digit";

      const pct =
        ticks.length
          ? (
              count /
              ticks.length *
              100
            ).toFixed(0)
          : 0;

      box.innerHTML =
        `<b>${d}</b>
         <small>${pct}%</small>`;

      grid.appendChild(box);
    }
  );
}


/* =========================================================
   CHART
   ========================================================= */

function drawChart(){

  const canvas =
    $("priceChartCanvas");

  if(!canvas)
    return;

  const ctx =
    canvas.getContext("2d");

  const rect =
    canvas.getBoundingClientRect();

  const ratio =
    window.devicePixelRatio || 1;

  canvas.width =
    rect.width * ratio;

  canvas.height =
    110 * ratio;

  ctx.scale(
    ratio,
    ratio
  );

  const data =
    state.priceHistory;

  if(data.length < 2)
    return;

  const min =
    Math.min(...data);

  const max =
    Math.max(...data);

  const range =
    max-min || 1;

  ctx.beginPath();

  data.forEach(
    (value,i)=>{

      const x =
        i /
        (data.length-1) *
        rect.width;

      const y =
        100 -
        (
          (value-min) /
          range *
          90
        );

      if(i === 0)
        ctx.moveTo(x,y);
      else
        ctx.lineTo(x,y);
    }
  );

  ctx.strokeStyle =
    "#00e5ff";

  ctx.lineWidth =
    2;

  ctx.stroke();
}


/* =========================================================
   PAPER TRADE
   ========================================================= */

function createPaperTrade({
  engine,
  market,
  strategy,
  prediction,
  stake,
  takeProfit=0,
  stopLoss=0,
  martingaleLevel=0
}){

  if(state.tradingStopped){

    toast(
      "Trading is stopped."
    );

    return null;
  }

  stake =
    Number(stake);

  if(
    !Number.isFinite(stake) ||
    stake < .35
  ){

    toast(
      "Minimum paper stake is 0.35."
    );

    return null;
  }

  if(stake > state.paperBalance){

    toast(
      "Insufficient paper balance."
    );

    return null;
  }

  state.paperBalance -= stake;

  const trade = {

    id:
      Date.now()+"_"+Math.random(),

    timestamp:
      Date.now(),

    time:
      new Date().toLocaleTimeString(),

    engine,
    market,
    strategy,
    prediction,
    stake,

    takeProfit,
    stopLoss,

    martingaleLevel,

    result:null,
    resultDigit:null,

    status:"PENDING",

    amountWon:0,
    payout:0,
    profit:0
  };

  state.activeTrades.push(
    trade
  );

  saveState();

  renderBalance();
  renderActiveTrades();

  return trade;
}


/* =========================================================
   TRADE EVALUATION
   ========================================================= */

function evaluateTrade(
  trade,
  digit
){

  switch(trade.strategy){

    case "MATCHES":
      return digit ===
        Number(trade.prediction);

    case "DIFFERS":
      return digit !==
        Number(trade.prediction);

    case "EVEN":
      return digit % 2 === 0;

    case "ODD":
      return digit % 2 !== 0;

    case "OVER":
      return digit >
        Number(trade.prediction);

    case "UNDER":
      return digit <
        Number(trade.prediction);

    default:
      return false;
  }
}


/* =========================================================
   PAPER SETTLEMENT
   ========================================================= */

function settleTrade(
  trade,
  digit
){

  const win =
    evaluateTrade(
      trade,
      digit
    );

  const multipliers = {

    MATCHES:8.5,
    DIFFERS:.09,
    EVEN:.95,
    ODD:.95,
    OVER:.95,
    UNDER:.95
  };

  trade.resultDigit =
    digit;

  trade.result =
    win
      ? "WIN"
      : "LOSS";

  trade.status =
    win
      ? "WON"
      : "LOST";

  if(win){

    const payout =
      trade.stake *
      multipliers[trade.strategy];

    trade.payout =
      payout;

    trade.amountWon =
      payout;

    trade.profit =
      payout -
      trade.stake;

    state.paperBalance +=
      payout;

    state.wins++;

  }else{

    trade.payout =
      0;

    trade.amountWon =
      0;

    trade.profit =
      -trade.stake;

    state.losses++;
  }

  state.totalProfit +=
    trade.profit;

  state.totalAmountWon +=
    trade.amountWon;

  state.totalStake +=
    trade.stake;

  state.history.unshift(
    trade
  );

  state.activeTrades =
    state.activeTrades.filter(
      t=>t.id !== trade.id
    );

  saveState();

  renderBalance();
  renderStats();
  renderHistory();
  renderActiveTrades();

  if(
    trade.engine === "AI BOT"
  ){

    if(win){

      state.botCurrentStake =
        state.botBaseStake;

      state.botMartingaleLevel =
        0;

    }else{

      state.botMartingaleLevel++;

      const factor =
        Number(
          $("martingaleInput")?.value || 2.1
        );

      state.botCurrentStake =
        Math.min(
          state.botBaseStake *
          Math.pow(
            factor,
            state.botMartingaleLevel
          ),
          state.botBaseStake * 32,
          Math.max(
            .35,
            state.paperBalance
          )
        );
    }

    checkBotLimits();
  }

  if(
    trade.engine === "CIRCULAR AI"
  ){

    checkCircularLimits();
  }
}


/* =========================================================
   SETTLE ACTIVE
   ========================================================= */

function settlePendingTrades(
  symbol,
  digit
){

  const pending =
    state.activeTrades.filter(
      trade=>
        trade.market === symbol
    );

  pending.forEach(
    trade=>
      settleTrade(
        trade,
        digit
      )
  );
}


/* =========================================================
   TOTALS
   ========================================================= */

function calculateTotals(){

  state.totalProfit =
    state.history.reduce(
      (sum,t)=>
        sum + Number(t.profit||0),
      0
    );

  state.totalAmountWon =
    state.history.reduce(
      (sum,t)=>
        sum + Number(t.amountWon||0),
      0
    );

  state.totalStake =
    state.history.reduce(
      (sum,t)=>
        sum + Number(t.stake||0),
      0
    );

  state.wins =
    state.history.filter(
      t=>t.result === "WIN"
    ).length;

  state.losses =
    state.history.filter(
      t=>t.result === "LOSS"
    ).length;
}


/* =========================================================
   BALANCE
   ========================================================= */

function renderBalance(){

  setText(
    "balanceDisplay",
    "$"+
    state.paperBalance.toFixed(2)
  );
}


/* =========================================================
   RESULTS
   ========================================================= */

function renderStats(){

  const total =
    state.wins +
    state.losses;

  const accuracy =
    total
      ? (
          state.wins /
          total *
          100
        ).toFixed(1)
      : "0.0";

  setText(
    "paperTotal",
    total
  );

  setText(
    "paperWins",
    state.wins
  );

  setText(
    "paperLosses",
    state.losses
  );

  setText(
    "paperAccuracy",
    accuracy+"%"
  );

  setText(
    "totalProfitDisplay",
    "$"+
    state.totalProfit.toFixed(2)
  );

  setText(
    "historyTotalStake",
    "$"+
    state.totalStake.toFixed(2)
  );

  setText(
    "historyAmountWon",
    "$"+
    state.totalAmountWon.toFixed(2)
  );

  setText(
    "historyNetProfit",
    "$"+
    state.totalProfit.toFixed(2)
  );

  setText(
    "sessionProfitDisplay",
    "$"+
    (
      state.totalProfit -
      state.sessionStartProfit
    ).toFixed(2)
  );
}


/* =========================================================
   ACTIVE TRADES
   ========================================================= */

function renderActiveTrades(){

  setText(
    "activeTradeCount",
    state.activeTrades.length
  );

  const box =
    $("activeTradesList");

  if(!box)
    return;

  box.innerHTML = "";

  if(!state.activeTrades.length){

    box.innerHTML =
      `<div class="message">
        No active paper trades.
      </div>`;

    return;
  }

  state.activeTrades
    .forEach(trade=>{

      const item =
        document.createElement("div");

      item.className =
        "trade-item";

      item.innerHTML = `
        <div class="top">
          <b>${trade.market}</b>
          <span class="pending">
            ${trade.status}
          </span>
        </div>

        <div class="info-row">
          <span>${STRATEGY_LABELS[trade.strategy]}</span>
          <b>${trade.prediction}</b>
        </div>

        <div class="info-row">
          <span>Stake</span>
          <b>$${Number(trade.stake).toFixed(2)}</b>
        </div>
      `;

      box.appendChild(item);
    });
}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory(){

  const box =
    $("historyCardsList");

  if(!box)
    return;

  box.innerHTML = "";

  if(!state.history.length){

    box.innerHTML =
      `<div class="message">
        No paper trades yet.
      </div>`;

    return;
  }

  state.history
    .slice(0,100)
    .forEach(trade=>{

      const item =
        document.createElement("div");

      item.className =
        "history-item";

      const resultClass =
        trade.result === "WIN"
          ? "win"
          : "loss";

      item.innerHTML = `

        <div class="top">

          <div>
            <b>${trade.market}</b>
            <div>
              <small>
                ${trade.engine}
              </small>
            </div>
          </div>

          <b class="${resultClass}">
            ${trade.result}
          </b>

        </div>

        <div class="info-row">
          <span>Strategy</span>
          <b>${STRATEGY_LABELS[trade.strategy]}</b>
        </div>

        <div class="info-row">
          <span>Prediction</span>
          <b>${trade.prediction}</b>
        </div>

        <div class="info-row">
          <span>Result Digit</span>
          <b>${trade.resultDigit}</b>
        </div>

        <div class="info-row">
          <span>Stake</span>
          <b>$${Number(trade.stake).toFixed(2)}</b>
        </div>

        <div class="info-row">
          <span>Amount Won</span>
          <b class="${resultClass}">
            $${Number(trade.amountWon).toFixed(2)}
          </b>
        </div>

        <div class="info-row">
          <span>Profit / Loss</span>
          <b class="${resultClass}">
            $${Number(trade.profit).toFixed(2)}
          </b>
        </div>

        <small>${trade.time}</small>
      `;

      box.appendChild(item);
    });

  renderStats();
}


/* =========================================================
   AI BOT
   ========================================================= */

async function startAI(){

  if(state.aiRunning)
    return;

  if(state.tradingStopped){

    toast(
      "Trading is stopped. Reset the page/session to restart."
    );

    return;
  }

  stopCircular(false);

  state.engineMode =
    "ai";

  state.aiRunning =
    true;

  state.aiCycleToken++;

  state.botBaseStake =
    Number(
      $("stakeInput")?.value || 10
    );

  state.botCurrentStake =
    state.botBaseStake;

  state.botMartingaleLevel =
    0;

  state.botTakeProfit =
    Number(
      $("takeProfitInput")?.value || 50
    );

  state.botStopLoss =
    Number(
      $("stopLossInput")?.value || 100
    );

  state.botSessionStartProfit =
    state.totalProfit;

  selectEngine("ai");

  setText(
    "botStatusDash",
    "RUNNING"
  );

  setText(
    "engineStatusText",
    "ANALYZING..."
  );

  setText(
    "aiStatus",
    "AI ACTIVE"
  );

  botLoop(
    state.aiCycleToken
  );
}


function stopAI(
  show=true
){

  state.aiRunning =
    false;

  state.aiCycleToken++;

  clearTimeout(
    state.botTimer
  );

  setText(
    "botStatusDash",
    "STANDBY"
  );

  setText(
    "engineStatusText",
    "READY"
  );

  if(show)
    toast("AI BOT stopped.");

  updateAnalysisEngine();
}


async function botLoop(token){

  if(
    !state.aiRunning ||
    token !== state.aiCycleToken ||
    state.tradingStopped
  )
    return;

  setText(
    "engineStatusText",
    "ANALYZING 3s..."
  );

  setText(
    "aiStatus",
    "ANALYZING"
  );

  for(
    let n=3;
    n>0;
    n--
  ){

    if(
      !state.aiRunning ||
      token !== state.aiCycleToken
    )
      return;

    setText(
      "engineStatusText",
      `ANALYZING ${n}s...`
    );

    setText(
      "aiCircleTimer",
      n+"s"
    );

    await wait(1000);
  }

  const analysis =
    chooseBestMarket();

  if(!analysis){

    setText(
      "engineStatusText",
      "COLLECTING DATA"
    );

    state.botTimer =
      setTimeout(
        ()=>botLoop(token),
        1500
      );

    return;
  }

  state.selectedMarket =
    analysis.symbol;

  const strategy =
    chooseBotStrategy(
      analysis
    );

  const prediction =
    createPrediction(
      analysis,
      strategy
    );

  state.lastBotDecision = {
    analysis,
    strategy,
    prediction
  };

  setText(
    "aiMarket",
    analysis.symbol
  );

  setText(
    "botSelectedMarket",
    analysis.symbol
  );

  setText(
    "aiType",
    STRATEGY_LABELS[strategy]
  );

  setText(
    "botSelectedStrategy",
    STRATEGY_LABELS[strategy]
  );

  setText(
    "botStrategyLabel",
    STRATEGY_LABELS[strategy]
  );

  setText(
    "aiPrediction",
    prediction.prediction
  );

  setText(
    "botConfidence",
    prediction.confidence+"%"
  );

  setText(
    "analysisConfidence",
    prediction.confidence+"%"
  );

  setText(
    "engineStatusText",
    "TRADE NOW"
  );

  createPaperTrade({

    engine:"AI BOT",

    market:analysis.symbol,

    strategy,

    prediction:
      prediction.prediction,

    stake:
      Math.min(
        state.botCurrentStake,
        state.paperBalance
      ),

    takeProfit:
      state.botTakeProfit,

    stopLoss:
      state.botStopLoss,

    martingaleLevel:
      state.botMartingaleLevel
  });

  state.botTimer =
    setTimeout(
      ()=>botLoop(token),
      1200
    );
}


/* =========================================================
   BOT LIMITS
   ========================================================= */

function checkBotLimits(){

  const sessionProfit =
    state.totalProfit -
    state.botSessionStartProfit;

  if(
    state.botTakeProfit > 0 &&
    sessionProfit >=
      state.botTakeProfit
  ){

    stopAI(false);

    toast(
      "AI BOT TAKE PROFIT reached."
    );

    setText(
      "tradingStatusLabel",
      "TAKE PROFIT"
    );

    return;
  }

  if(
    state.botStopLoss > 0 &&
    sessionProfit <=
      -state.botStopLoss
  ){

    stopAI(false);

    toast(
      "AI BOT STOP LOSS reached."
    );

    setText(
      "tradingStatusLabel",
      "STOP LOSS"
    );
  }
}


/* =========================================================
   CIRCULAR AI
   ========================================================= */

function startCircular(){

  if(state.circularRunning)
    return;

  if(state.tradingStopped){

    toast(
      "Trading is stopped."
    );

    return;
  }

  stopAI(false);

  state.engineMode =
    "circular";

  state.circularRunning =
    true;

  state.circularToken++;

  state.circularTakeProfit =
    Number(
      $("circularTakeProfitInput")
        ?.value || 50
    );

  state.circularStopLoss =
    Number(
      $("circularStopLossInput")
        ?.value || 100
    );

  state.circularSessionStartProfit =
    state.totalProfit;

  selectEngine("circular");

  circularCycle(
    state.circularToken
  );
}


function stopCircular(
  show=true
){

  state.circularRunning =
    false;

  state.circularToken++;

  clearTimeout(
    state.circularTimer
  );

  setText(
    "circularStatusText",
    "STANDBY"
  );

  if(show)
    toast(
      "Circular AI stopped."
    );

  updateAnalysisEngine();
}


async function circularCycle(token){

  if(
    !state.circularRunning ||
    token !== state.circularToken ||
    state.tradingStopped
  )
    return;

  setText(
    "circularStatusText",
    "ANALYSIS 10s"
  );

  setText(
    "cycleAnalysis",
    "ANALYZING"
  );

  for(
    let n=10;
    n>0;
    n--
  ){

    if(
      !state.circularRunning ||
      token !== state.circularToken
    )
      return;

    setText(
      "aiCircleTimer",
      n+"s"
    );

    await wait(1000);
  }

  const market =
    analyzeMarket(
      $("circularMarketSelect")?.value ||
      state.selectedMarket
    );

  if(!market){

    toast(
      "Circular AI needs more tick data."
    );

    state.circularTimer =
      setTimeout(
        ()=>circularCycle(token),
        1000
      );

    return;
  }

  const strategy =
    state.selectedStrategy;

  const prediction =
    createPrediction(
      market,
      strategy
    );

  state.lastCircularPrediction =
    prediction;

  setText(
    "cycleAnalysis",
    STRATEGY_LABELS[strategy]
  );

  setText(
    "aiCirclePrediction",
    prediction.prediction
  );

  setText(
    "aiCircleStatus",
    "PREDICTION"
  );

  setText(
    "cyclePrediction",
    "PREDICTION READY"
  );

  setText(
    "aiCircleTimer",
    "5s"
  );

  for(
    let n=5;
    n>0;
    n--
  ){

    if(
      !state.circularRunning ||
      token !== state.circularToken
    )
      return;

    setText(
      "aiCircleTimer",
      n+"s"
    );

    await wait(1000);
  }

  setText(
    "cycleTrade",
    "TRADE NOW"
  );

  setText(
    "aiCircleTimer",
    "3s"
  );

  for(
    let n=3;
    n>0;
    n--
  ){

    if(
      !state.circularRunning ||
      token !== state.circularToken
    )
      return;

    setText(
      "aiCircleTimer",
      n+"s"
    );

    await wait(1000);
  }

  createPaperTrade({

    engine:"CIRCULAR AI",

    market:market.symbol,

    strategy,

    prediction:
      prediction.prediction,

    stake:
      Number(
        $("circularStakeInput")
          ?.value || 10
      ),

    takeProfit:
      state.circularTakeProfit,

    stopLoss:
      state.circularStopLoss
  });

  setText(
    "cycleTrade",
    "TRADE PLACED"
  );

  await wait(1000);

  setText(
    "cycleTrade",
    "COOLDOWN"
  );

  setText(
    "aiCircleTimer",
    "—"
  );

  state.circularTimer =
    setTimeout(
      ()=>circularCycle(token),
      1500
    );
}


/* =========================================================
   CIRCULAR LIMITS
   ========================================================= */

function checkCircularLimits(){

  const profit =
    state.totalProfit -
    state.circularSessionStartProfit;

  if(
    state.circularTakeProfit > 0 &&
    profit >=
      state.circularTakeProfit
  ){

    stopCircular(false);

    toast(
      "Circular AI TAKE PROFIT reached."
    );

    return;
  }

  if(
    state.circularStopLoss > 0 &&
    profit <=
      -state.circularStopLoss
  ){

    stopCircular(false);

    toast(
      "Circular AI STOP LOSS reached."
    );
  }
}


/* =========================================================
   MANUAL TRADE
   ========================================================= */

function executeManualTrade(){

  if(state.tradingStopped){

    toast(
      "Trading is stopped."
    );

    return;
  }

  const market =
    $("manualMarketSelect")?.value ||
    state.selectedMarket;

  const strategy =
    state.selectedStrategy;

  let prediction;

  if(
    strategy === "MATCHES" ||
    strategy === "DIFFERS" ||
    strategy === "OVER" ||
    strategy === "UNDER"
  ){

    const value =
      Number(
        $("manualTargetDigitInput")
          ?.value
      );

    if(
      !Number.isInteger(value) ||
      value < 0 ||
      value > 9
    ){

      toast(
        "Enter a target number from 0 to 9."
      );

      return;
    }

    prediction =
      value;

  }else{

    const analysis =
      analyzeMarket(market);

    if(!analysis){

      toast(
        "Collecting market data."
      );

      return;
    }

    prediction =
      createPrediction(
        analysis,
        strategy
      ).prediction;
  }

  createPaperTrade({

    engine:"MANUAL",

    market,

    strategy,

    prediction,

    stake:
      Number(
        $("manualStakeInput")
          ?.value || 10
      ),

    takeProfit:
      Number(
        $("manualTakeProfitInput")
          ?.value || 50
      ),

    stopLoss:
      Number(
        $("manualStopLossInput")
          ?.value || 100
      )
  });

  toast(
    "Manual paper trade placed."
  );
}


/* =========================================================
   STOP TRADING
   ========================================================= */

function stopAllTrading(){

  state.tradingStopped =
    true;

  stopAI(false);
  stopCircular(false);

  setText(
    "tradingStatusLabel",
    "STOPPED"
  );

  toast(
    "⛔ ALL TRADING STOPPED"
  );

  /*
    Existing pending paper trades are NOT
    silently converted into wins/losses.
    They remain pending until their market
    tick settles them.
  */

  renderActiveTrades();
}


/* =========================================================
   STRATEGY MODAL
   ========================================================= */

function openStrategyModal(){

  $("strategyModal")
    ?.classList.remove("hidden");
}


function closeStrategyModal(){

  $("strategyModal")
    ?.classList.add("hidden");
}


function chooseStrategy(strategy){

  state.selectedStrategy =
    strategy;

  setText(
    "manualSelectedStrategyLabel",
    STRATEGY_LABELS[strategy]
  );

  setText(
    "circularStrategyLabel",
    STRATEGY_LABELS[strategy]
  );

  saveState();

  updateTargetDigitVisibility();

  closeStrategyModal();
}


function updateTargetDigitVisibility(){

  const strategy =
    state.selectedStrategy;

  const needsDigit =
    [
      "MATCHES",
      "DIFFERS",
      "OVER",
      "UNDER"
    ].includes(strategy);

  $("targetDigitContainer")
    ?.classList.toggle(
      "hidden",
      !needsDigit
    );
}


/* =========================================================
   BOT STRATEGY MODAL
   ========================================================= */

function openBotStrategyModal(){

  document.querySelectorAll(
    ".bot-strategy-check"
  ).forEach(check=>{

    check.checked =
      state.botStrategyPool
        .includes(check.value);
  });

  $("botStrategyModal")
    ?.classList.remove("hidden");
}


function closeBotStrategyModal(){

  $("botStrategyModal")
    ?.classList.add("hidden");
}


function applyBotStrategies(){

  const selected =
    Array.from(
      document.querySelectorAll(
        ".bot-strategy-check:checked"
      )
    )
    .map(
      check=>check.value
    );

  if(!selected.length){

    toast(
      "Select at least one strategy."
    );

    return;
  }

  state.botStrategyPool =
    selected;

  setText(
    "botStrategyLabel",
    selected
      .map(
        s=>STRATEGY_LABELS[s]
      )
      .join(", ")
  );

  saveState();

  closeBotStrategyModal();
}


/* =========================================================
   WAIT
   ========================================================= */

function wait(ms){

  return new Promise(
    resolve=>
      setTimeout(
        resolve,
        ms
      )
  );
}


/* =========================================================
   CLEAR HISTORY
   ========================================================= */

function clearHistory(){

  if(
    !confirm(
      "Clear all paper trade history?"
    )
  )
    return;

  state.history = [];

  calculateTotals();

  saveState();

  renderHistory();

  toast(
    "History cleared."
  );
}


/* =========================================================
   DEMO CONNECT
   ========================================================= */

function connectDeriv(){

  /*
    The public market WebSocket is already
    connected independently.

    OAuth credentials are never stored in
    localStorage and this V7 interface remains
    paper/demo only.
  */

  toast(
    "Deriv market data is connected. Demo/Paper mode active."
  );

  setText(
    "accountId",
    "DEMO / PAPER"
  );
}


/* =========================================================
   EVENT SETUP
   ========================================================= */

function setupEvents(){

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


  $("tabAiBot")
    ?.addEventListener(
      "click",
      ()=>selectEngine("ai")
    );

  $("tabCircularAI")
    ?.addEventListener(
      "click",
      ()=>selectEngine("circular")
    );

  $("tabManual")
    ?.addEventListener(
      "click",
      ()=>selectEngine("manual")
    );


  $("startBotBtn")
    ?.addEventListener(
      "click",
      startAI
    );

  $("startCircularTradeBtn")
    ?.addEventListener(
      "click",
      startCircular
    );

  $("placeTradeBtn")
    ?.addEventListener(
      "click",
      executeManualTrade
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


  $("manualStrategyTrigger")
    ?.addEventListener(
      "click",
      openStrategyModal
    );

  $("circularStrategyTrigger")
    ?.addEventListener(
      "click",
      openStrategyModal
    );

  $("closeStrategyModal")
    ?.addEventListener(
      "click",
      closeStrategyModal
    );


  document.querySelectorAll(
    ".strategy-option"
  ).forEach(button=>{

    button.addEventListener(
      "click",
      ()=>{
        chooseStrategy(
          button.dataset.strategy
        );
      }
    );
  });


  $("manualMarketSelect")
    ?.addEventListener(
      "change",
      event=>{
        state.selectedMarket =
          event.target.value;

        saveState();

        updateAnalysis();
      }
    );


  $("circularMarketSelect")
    ?.addEventListener(
      "change",
      event=>{
        state.selectedMarket =
          event.target.value;

        saveState();

        updateAnalysis();
      }
    );


  $("stopTradingBtn")
    ?.addEventListener(
      "click",
      stopAllTrading
    );


  $("clearLogsBtn")
    ?.addEventListener(
      "click",
      clearHistory
    );
}


/* =========================================================
   INIT
   ========================================================= */

function init(){

  loadTheme();

  loadState();

  populateMarkets();

  setupNavigation();

  setupEvents();

  updateTargetDigitVisibility();

  renderBalance();

  renderStats();

  renderHistory();

  renderActiveTrades();

  setText(
    "botStrategyLabel",
    state.botStrategyPool
      .map(
        s=>STRATEGY_LABELS[s]
      )
      .join(", ")
  );

  setText(
    "manualSelectedStrategyLabel",
    STRATEGY_LABELS[
      state.selectedStrategy
    ]
  );

  setText(
    "circularStrategyLabel",
    STRATEGY_LABELS[
      state.selectedStrategy
    ]
  );

  selectEngine("ai");

  connectPublicWS();

  setInterval(
    updateAnalysis,
    1000
  );

  window.addEventListener(
    "resize",
    drawChart
  );
}


init();