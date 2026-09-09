/* =========================================================
   KRISHWAVE AI BEAST V7.0
   ---------------------------------------------------------
   DEMO / PAPER INTELLIGENCE ENGINE

   V7 FEATURES
   ---------------------------------------------------------
   • AI BOT autonomous market selection
   • AI BOT autonomous strategy selection
   • Strategy pool
   • Circular AI 10 → 5 → 3 cycle
   • Manual engine
   • Multi-market tick scanner
   • Improved digit extraction using pip precision
   • Statistical market scoring
   • Confidence scoring
   • Streak analysis
   • Concentration analysis
   • Paper trade engine
   • Multiple active paper trades
   • Take profit
   • Stop loss
   • Martingale progression
   • Full trade history
   • Amount won
   • Payout
   • Profit / loss
   • Local storage
   • Dark / light mode
   ---------------------------------------------------------
   NO REAL TRADES ARE EXECUTED.
========================================================= */

"use strict";


/* =========================================================
   CONFIG
========================================================= */

const DERIV_CLIENT_ID =
  "34khasPjsT0PCRR8X3Z70";

const REDIRECT_URI =
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const OAUTH_BACKEND =
  "https://krishwave-oauth.chrispusatale99.workers.dev";

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


/* =========================================================
   STATE
========================================================= */

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

  aiRunning:false,

  aiCycleToken:0,

  circularRunning:false,

  circularToken:0,

  publicWS:null,

  demoWS:null,

  botTimer:null,

  circularTimer:null,

  lastBotDecision:null,

  lastCircularPrediction:null

};


/* =========================================================
   HELPERS
========================================================= */

const $ = id =>
  document.getElementById(id);


function setText(id,value){

  const el = $(id);

  if(el){
    el.textContent = value;
  }

}


function esc(value){

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");

}


function sleep(ms){

  return new Promise(resolve =>
    setTimeout(resolve,ms)
  );

}


function clamp(value,min,max){

  return Math.max(
    min,
    Math.min(max,value)
  );

}


function money(value){

  return `$${Number(value || 0).toFixed(2)}`;

}


function formatMarketName(symbol){

  if(symbol.startsWith("R_")){

    return (
      "Volatility " +
      symbol.replace("R_","") +
      " Index"
    );

  }

  if(symbol.startsWith("1HZ")){

    return (
      "Volatility " +
      symbol.replace("1HZ","") +
      " Index"
    );

  }

  return symbol;

}


function strategyLabel(strategy){

  return (
    STRATEGY_LABELS[strategy] ||
    strategy
  );

}


/* =========================================================
   INITIALIZE MARKETS
========================================================= */

function buildInitialMarkets(){

  MARKETS.forEach(symbol => {

    state.markets[symbol] = {

      symbol,

      price:null,

      lastDigit:null,

      pipSize:null,

      digits:Array(10).fill(0),

      ticks:[],

      prices:[],

      updated:0,

      received:0

    };

  });

}


/* =========================================================
   DOM READY
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadTheme();

    loadHistory();

    buildInitialMarkets();

    populateMarketSelectors();

    bindNavigation();

    bindTheme();

    bindEngineTabs();

    bindBotControls();

    bindManualControls();

    bindCircularControls();

    bindStrategyModal();

    bindBotStrategyModal();

    bindClearHistory();

    connectPublicMarket();

    checkOAuthCallback();

    renderHistory();

    renderActiveTrades();

    updateStats();

    updateBalance();

    updateConnectionUI();

    updateTargetDigitVisibility();

  }
);


/* =========================================================
   NAVIGATION
========================================================= */

function bindNavigation(){

  document.querySelectorAll(".nav-btn")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => {

          const page =
            btn.dataset.page;

          document.querySelectorAll(".page")
            .forEach(p =>
              p.classList.remove("active")
            );

          const target =
            $(page + "Page");

          if(target){
            target.classList.add("active");
          }

          document.querySelectorAll(".nav-btn")
            .forEach(b =>
              b.classList.remove("active")
            );

          btn.classList.add("active");

          if(page === "trade"){

            updateChart();

            renderDigitStats();

            renderActiveTrades();

          }

          if(page === "history"){

            renderHistory();

            updateStats();

          }

          if(page === "analysis"){

            updateCircularUI();

          }

          window.scrollTo({
            top:0,
            behavior:"smooth"
          });

        }
      );

    });

}


/* =========================================================
   THEME
========================================================= */

function bindTheme(){

  $("themeToggle")?.addEventListener(
    "click",
    () => {

      document.body.classList.toggle("light");

      localStorage.setItem(
        "krishwave_theme",
        document.body.classList.contains("light")
          ? "light"
          : "dark"
      );

      updateChart();

    }
  );

}


function loadTheme(){

  if(
    localStorage.getItem(
      "krishwave_theme"
    ) === "light"
  ){

    document.body.classList.add("light");

  }

}


/* =========================================================
   ENGINE TABS
========================================================= */

function bindEngineTabs(){

  const tabs = {

    ai:
      $("tabAiBot"),

    circular:
      $("tabCircularAI"),

    manual:
      $("tabManual")

  };


  const contents = {

    ai:
      $("aiBotContent"),

    circular:
      $("circularAIContent"),

    manual:
      $("manualContent")

  };


  Object.entries(tabs)
    .forEach(([mode,tab]) => {

      tab?.addEventListener(
        "click",
        () => {

          state.engineMode = mode;

          Object.values(tabs)
            .forEach(t =>
              t?.classList.remove("active")
            );

          Object.values(contents)
            .forEach(c => {

              if(c){
                c.style.display = "none";
              }

            });

          tab.classList.add("active");

          if(contents[mode]){
            contents[mode].style.display =
              "block";
          }

        }
      );

    });

}


/* =========================================================
   MARKET SELECTORS
========================================================= */

function populateMarketSelectors(){

  const selectors = [

    $("manualMarketSelect"),
    $("circularMarketSelect")

  ];


  selectors.forEach(select => {

    if(!select) return;

    select.innerHTML =
      MARKETS.map(symbol =>
        `<option value="${symbol}">
          ${esc(formatMarketName(symbol))}
        </option>`
      ).join("");

  });


  if($("manualMarketSelect")){
    $("manualMarketSelect").value =
      state.selectedMarket;
  }


  if($("circularMarketSelect")){
    $("circularMarketSelect").value =
      state.selectedMarket;
  }

}


/* =========================================================
   PUBLIC MARKET CONNECTION
========================================================= */

function connectPublicMarket(){

  setText(
    "connectionText",
    "CONNECTING..."
  );

  setText(
    "dataStatus",
    "CONNECTING..."
  );


  try{

    state.publicWS =
      new WebSocket(PUBLIC_WS);

  }catch(error){

    handlePublicConnectionError();

    return;

  }


  state.publicWS.onopen = () => {

    setConnectionState(
      "connected"
    );

    MARKETS.forEach(symbol => {

      try{

        state.publicWS.send(
          JSON.stringify({

            ticks:symbol,

            subscribe:1

          })
        );

      }catch(error){}

    });

  };


  state.publicWS.onmessage = event => {

    try{

      const msg =
        JSON.parse(event.data);

      if(msg.tick){

        processTick(msg.tick);

      }

    }catch(error){}

  };


  state.publicWS.onerror = () => {

    setConnectionState(
      "error"
    );

  };


  state.publicWS.onclose = () => {

    setConnectionState(
      "error"
    );

    setText(
      "dataStatus",
      "RECONNECTING..."
    );

    setTimeout(
      () => {

        if(
          !state.publicWS ||
          state.publicWS.readyState ===
            WebSocket.CLOSED
        ){

          connectPublicMarket();

        }

      },
      3000
    );

  };

}


function handlePublicConnectionError(){

  setConnectionState(
    "error"
  );

  setText(
    "dataStatus",
    "OFFLINE"
  );

}


function setConnectionState(status){

  const dot =
    $("connectionDot");

  if(dot){

    dot.classList.remove(
      "connected",
      "error"
    );

    if(status === "connected"){

      dot.classList.add(
        "connected"
      );

    }

    if(status === "error"){

      dot.classList.add(
        "error"
      );

    }

  }


  if(status === "connected"){

    setText(
      "connectionText",
      "LIVE"
    );

    setText(
      "dataStatus",
      "DERIV LIVE"
    );

  }else{

    setText(
      "connectionText",
      "OFFLINE"
    );

    setText(
      "dataStatus",
      "OFFLINE"
    );

  }

}


/* =========================================================
   DIGIT EXTRACTION
========================================================= */

function getLastDigitFromTick(tick){

  const quote =
    Number(tick.quote);

  if(!Number.isFinite(quote)){
    return null;
  }


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
      Math.pow(10,-decimals);

  }


  const scaled =
    Math.round(
      quote / pipSize
    );


  return (
    Math.abs(scaled) % 10
  );

}


/* =========================================================
   PROCESS TICK
========================================================= */

function processTick(tick){

  const symbol =
    tick.symbol;

  if(!state.markets[symbol]){
    return;
  }


  const price =
    Number(tick.quote);

  if(!Number.isFinite(price)){
    return;
  }


  const digit =
    getLastDigitFromTick(tick);

  if(digit === null){
    return;
  }


  const market =
    state.markets[symbol];


  market.price =
    price;

  market.lastDigit =
    digit;

  market.pipSize =
    Number(tick.pip_size) ||
    market.pipSize;

  market.digits[digit]++;

  market.ticks.push(digit);

  market.prices.push(price);

  market.received++;

  market.updated =
    Date.now();


  if(market.ticks.length > 200){
    market.ticks.shift();
  }

  if(market.prices.length > 100){
    market.prices.shift();
  }


  if(symbol === state.selectedMarket){

    state.priceHistory.push(
      price
    );

    if(
      state.priceHistory.length >
      60
    ){

      state.priceHistory.shift();

    }


    setText(
      "currentChartMarket",
      formatMarketName(symbol)
    );

    setText(
      "currentLivePrice",
      price.toFixed(
        getPriceDecimals(market)
      )
    );


    updateChart();

    renderDigitStats();

  }


  evaluateActiveTrades(
    symbol,
    digit
  );


  if(state.aiRunning){

    updateBotDisplayFromDecision();

  }


  renderActiveTrades();

}


function getPriceDecimals(market){

  if(
    market &&
    Number.isFinite(
      market.pipSize
    )
  ){

    const str =
      String(market.pipSize);

    if(str.includes("e-")){

      return Number(
        str.split("e-")[1]
      );

    }

    if(str.includes(".")){

      return str.split(".")[1]
        .replace(/0+$/,"")
        .length;

    }

  }

  return 2;

}


/* =========================================================
   CHART
========================================================= */

function updateChart(){

  const canvas =
    $("priceChartCanvas");

  if(
    !canvas ||
    !state.priceHistory.length
  ){

    return;

  }


  const rect =
    canvas.getBoundingClientRect();


  const width =
    Math.max(
      300,
      Math.floor(rect.width)
    );

  const height =
    Math.max(
      150,
      Math.floor(rect.height)
    );


  const ratio =
    window.devicePixelRatio ||
    1;


  canvas.width =
    width * ratio;

  canvas.height =
    height * ratio;


  const ctx =
    canvas.getContext("2d");


  ctx.setTransform(
    ratio,
    0,
    0,
    ratio,
    0,
    0
  );


  ctx.clearRect(
    0,
    0,
    width,
    height
  );


  const prices =
    state.priceHistory;


  if(prices.length < 2){
    return;
  }


  const min =
    Math.min(...prices);

  const max =
    Math.max(...prices);

  const range =
    max - min || 1;


  const light =
    document.body.classList.contains(
      "light"
    );


  const lineColor =
    light
      ? "#4f46e5"
      : "#00e5ff";


  ctx.strokeStyle =
    lineColor;

  ctx.lineWidth = 2.5;

  ctx.lineJoin =
    "round";

  ctx.lineCap =
    "round";


  ctx.beginPath();


  prices.forEach(
    (price,index) => {

      const x =
        (index /
          (prices.length - 1)) *
        width;


      const y =
        height -
        ((price - min) /
          range) *
        (height - 25) -
        12;


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


  ctx.stroke();

}


/* =========================================================
   DIGIT STATS
========================================================= */

function renderDigitStats(){

  const box =
    $("digitStatsGrid");

  const market =
    state.markets[
      state.selectedMarket
    ];


  if(
    !box ||
    !market
  ){

    return;

  }


  const total =
    market.digits.reduce(
      (a,b) => a + b,
      0
    );


  setText(
    "digitSampleCount",
    `${total} TICKS`
  );


  if(!total){

    box.innerHTML =
      Array.from(
        {length:10},
        (_,d) =>
          `
          <div class="digit-stat-circle">
            <span class="digit-num">${d}</span>
            <span class="digit-pct">0.0%</span>
          </div>
          `
      ).join("");

    return;

  }


  const percentages =
    market.digits.map(
      count =>
        (count / total) * 100
    );


  const maxPct =
    Math.max(...percentages);

  const minPct =
    Math.min(...percentages);


  box.innerHTML =
    market.digits
      .map((count,d) => {

        const pct =
          percentages[d];


        let statusClass = "";


        if(
          total >= 20 &&
          pct === maxPct
        ){

          statusClass =
            "highest";

        }


        if(
          total >= 20 &&
          pct === minPct
        ){

          statusClass =
            "lowest";

        }


        return `
          <div class="digit-stat-circle ${statusClass}">
            <span class="digit-num">${d}</span>
            <span class="digit-pct">${pct.toFixed(1)}%</span>
          </div>
        `;

      })
      .join("");

}


/* =========================================================
   MARKET INTELLIGENCE
========================================================= */

function analyzeMarket(symbol){

  const market =
    state.markets[symbol];


  if(
    !market ||
    market.ticks.length < 20
  ){

    return null;

  }


  const ticks =
    market.ticks;

  const recent =
    ticks.slice(-30);


  const counts =
    Array(10).fill(0);


  recent.forEach(
    digit =>
      counts[digit]++
  );


  const total =
    recent.length;


  const percentages =
    counts.map(
      count =>
        count / total
    );


  let hottestDigit =
    percentages.indexOf(
      Math.max(...percentages)
    );


  let coldestDigit =
    percentages.indexOf(
      Math.min(...percentages)
    );


  const last =
    recent[recent.length - 1];


  let streak = 1;


  for(
    let i =
      recent.length - 2;
    i >= 0;
    i--
  ){

    if(
      recent[i] === last
    ){

      streak++;

    }else{

      break;

    }

  }


  const recentEven =
    recent.filter(
      d => d % 2 === 0
    ).length;


  const evenRate =
    recentEven / total;


  const overFive =
    recent.filter(
      d => d > 5
    ).length;


  const overRate =
    overFive / total;


  const underFive =
    recent.filter(
      d => d < 5
    ).length;


  const underRate =
    underFive / total;


  const concentration =
    Math.max(...percentages);


  const entropy =
    calculateEntropy(
      percentages
    );


  const stability =
    clamp(
      entropy * 100,
      0,
      100
    );


  /*
    This is a statistical score,
    NOT a guarantee of future outcome.
  */

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
    clamp(
      score,
      0,
      100
    );


  const strength =
    score >= 75
      ? "STRONG"
      : score >= 62
        ? "GOOD"
        : score >= 52
          ? "MODERATE"
          : "WEAK";


  const agreement =
    calculateAgreement(
      recent
    );


  return {

    symbol,

    score,

    strength,

    stability,

    concentration:
      concentration * 100,

    streak,

    agreement,

    hottestDigit,

    coldestDigit,

    evenRate,

    overRate,

    underRate,

    lastDigit:last,

    sampleSize:total

  };

}


function calculateEntropy(probabilities){

  let entropy = 0;


  probabilities.forEach(
    p => {

      if(p > 0){

        entropy -=
          p *
          Math.log2(p);

      }

    }
  );


  /*
    Maximum entropy for
    ten digits is log2(10).
  */

  return entropy /
    Math.log2(10);

}


function calculateAgreement(ticks){

  if(ticks.length < 8){
    return 0;
  }


  const recent =
    ticks.slice(-12);


  const even =
    recent.filter(
      d => d % 2 === 0
    ).length;


  const over =
    recent.filter(
      d => d > 5
    ).length;


  const under =
    recent.filter(
      d => d < 5
    ).length;


  const evenBias =
    Math.abs(
      even / recent.length - .5
    );


  const directionBias =
    Math.max(
      over,
      under
    ) /
    recent.length;


  return clamp(
    (
      evenBias * 100 +
      directionBias * 100
    ) / 2,
    0,
    100
  );

}


/* =========================================================
   AI BOT MARKET SELECTION
========================================================= */

function chooseBestMarket(){

  const candidates = [];


  MARKETS.forEach(
    symbol => {

      const analysis =
        analyzeMarket(symbol);


      if(!analysis){
        return;
      }


      candidates.push(
        analysis
      );

    }
  );


  if(!candidates.length){

    return null;

  }


  candidates.sort(
    (a,b) =>
      b.score - a.score
  );


  /*
    Small randomization among
    the strongest markets prevents
    the bot from permanently
    locking onto one market.
  */

  const top =
    candidates.slice(
      0,
      Math.min(
        3,
        candidates.length
      )
    );


  return top[
    Math.floor(
      Math.random() * top.length
    )
  ];

}


/* =========================================================
   AI BOT STRATEGY SELECTION
========================================================= */

function chooseBotStrategy(
  analysis
){

  const pool =
    state.botStrategyPool
      .filter(
        strategy =>
          STRATEGIES.includes(
            strategy
          )
      );


  if(!pool.length){

    return "MATCHES";

  }


  const candidates =
    [];


  pool.forEach(
    strategy => {

      let score = 50;


      switch(strategy){

        case "MATCHES":

          /*
            Matches becomes more
            interesting when a digit
            is unusually concentrated.
          */

          score +=
            analysis.concentration *
            1.5;

          break;


        case "DIFFERS":

          /*
            Differs is favored when
            concentration is weak.
          */

          score +=
            (20 -
              analysis.concentration) *
            1.2;

          break;


        case "EVEN":

          score +=
            Math.abs(
              analysis.evenRate -
              .5
            ) *
            100;

          break;


        case "ODD":

          score +=
            Math.abs(
              analysis.evenRate -
              .5
            ) *
            100;

          break;


        case "OVER":

          score +=
            Math.abs(
              analysis.overRate -
              .5
            ) *
            100;

          break;


        case "UNDER":

          score +=
            Math.abs(
              analysis.underRate -
              .5
            ) *
            100;

          break;

      }


      /*
        Slight random factor gives
        the bot flexibility.
      */

      score +=
        Math.random() * 10;


      candidates.push({
        strategy,
        score
      });

    }
  );


  candidates.sort(
    (a,b) =>
      b.score - a.score
  );


  return candidates[0].strategy;

}


/* =========================================================
   CREATE PREDICTION
========================================================= */

function createPrediction(
  analysis,
  strategy
){

  if(!analysis){
    return null;
  }


  let prediction =
    analysis.hottestDigit;


  switch(strategy){

    case "MATCHES":

      prediction =
        analysis.hottestDigit;

      break;


    case "DIFFERS":

      prediction =
        analysis.hottestDigit;

      break;


    case "OVER":

      prediction =
        analysis.hottestDigit > 5
          ? analysis.hottestDigit
          : 6;

      break;


    case "UNDER":

      prediction =
        analysis.hottestDigit < 5
          ? analysis.hottestDigit
          : 4;

      break;


    case "EVEN":

      prediction =
        findBestParityDigit(
          analysis,
          true
        );

      break;


    case "ODD":

      prediction =
        findBestParityDigit(
          analysis,
          false
        );

      break;

  }


  let confidence =
    50;


  confidence +=
    Math.abs(
      analysis.concentration -
      10
    ) *
    1.5;


  confidence +=
    analysis.score *
    .25;


  confidence +=
    Math.min(
      analysis.streak * 2,
      10
    );


  confidence =
    clamp(
      confidence,
      50,
      95
    );


  return {

    market:
      analysis.symbol,

    strategy,

    prediction,

    confidence:

      Math.round(
        confidence
      ),

    analysis

  };

}


function findBestParityDigit(
  analysis,
  even
){

  const market =
    state.markets[
      analysis.symbol
    ];


  if(!market){
    return even ? 4 : 5;
  }


  const allowed =
    [0,1,2,3,4,5,6,7,8,9]
      .filter(
        d =>
          (d % 2 === 0) === even
      );


  let best =
    allowed[0];


  let bestCount = -1;


  allowed.forEach(
    d => {

      if(
        market.digits[d] >
        bestCount
      ){

        best =
          d;

        bestCount =
          market.digits[d];

      }

    }
  );


  return best;

}


/* =========================================================
   AI BOT CONTROL
========================================================= */

function bindBotControls(){

  $("startBotBtn")?.addEventListener(
    "click",
    () => {

      if(state.aiRunning){

        stopAIBot();

      }else{

        startAIBot();

      }

    }
  );


  $("botStrategyTrigger")?.addEventListener(
    "click",
    () => {

      const modal =
        $("botStrategyModal");

      if(modal){
        modal.style.display =
          "flex";
      }

    }
  );

}


/* =========================================================
   START AI BOT
========================================================= */

function startAIBot(){

  if(state.aiRunning){
    return;
  }


  state.aiRunning = true;

  state.aiCycleToken++;


  setText(
    "startBotBtn",
    "■ Stop Trading Bot"
  );


  setText(
    "engineStatusText",
    "AI Bot scanning markets..."
  );


  setText(
    "botStatusDash",
    "SCANNING"
  );


  runAIBotLoop(
    state.aiCycleToken
  );

}


/* =========================================================
   AI BOT LOOP
========================================================= */

async function runAIBotLoop(token){

  while(
    state.aiRunning &&
    token === state.aiCycleToken
  ){

    const decision =
      chooseBotDecision();


    if(!decision){

      setText(
        "engineStatusText",
        "Collecting more tick data..."
      );

      setText(
        "botStatusDash",
        "WAIT"
      );

      await sleep(3000);

      continue;

    }


    state.lastBotDecision =
      decision;


    updateBotDisplay(
      decision
    );


    const stake =
      Number(
        $("stakeInput")?.value ||
        .35
      );


    if(
      Number.isFinite(stake) &&
      stake >= .35
    ){

      createPaperTrade({

        engine:"AI BOT",

        market:
          decision.market,

        strategy:
          decision.strategy,

        prediction:
          decision.prediction,

        stake,

        takeProfit:
          Number(
            $("takeProfitInput")?.value ||
            50
          ),

        stopLoss:
          Number(
            $("stopLossInput")?.value ||
            100
          )

      });

    }


    /*
      The AI Bot operates independently.
      It does NOT run the Circular AI cycle.
    */

    await sleep(5000);

  }

}


function chooseBotDecision(){

  const analysis =
    chooseBestMarket();


  if(!analysis){
    return null;
  }


  const strategy =
    chooseBotStrategy(
      analysis
    );


  const prediction =
    createPrediction(
      analysis,
      strategy
    );


  if(!prediction){
    return null;
  }


  return prediction;

}


/* =========================================================
   BOT DISPLAY
========================================================= */

function updateBotDisplay(
  decision
){

  setText(
    "botStatusDash",
    "TRADING"
  );

  setText(
    "engineStatusText",
    `AI selected ${formatMarketName(decision.market)}`
  );

  setText(
    "botSelectedMarket",
    formatMarketName(
      decision.market
    )
  );

  setText(
    "botSelectedStrategy",
    strategyLabel(
      decision.strategy
    )
  );

  setText(
    "botScore",
    `${decision.analysis.score.toFixed(0)}/100`
  );

  setText(
    "botConfidence",
    `${decision.confidence}%`
  );

}


function updateBotDisplayFromDecision(){

  if(
    state.lastBotDecision
  ){

    updateBotDisplay(
      state.lastBotDecision
    );

  }

}


/* =========================================================
   STOP AI BOT
========================================================= */

function stopAIBot(){

  state.aiRunning = false;

  state.aiCycleToken++;


  setText(
    "startBotBtn",
    "Start Trading Bot"
  );

  setText(
    "engineStatusText",
    "AI Bot Ready"
  );

  setText(
    "botStatusDash",
    "READY"
  );

}


/* =========================================================
   CIRCULAR AI
========================================================= */

function bindCircularControls(){

  $("startAI")?.addEventListener(
    "click",
    startCircularAI
  );


  $("stopAI")?.addEventListener(
    "click",
    stopCircularAI
  );


  $("startCircularTradeBtn")
    ?.addEventListener(
      "click",
      () => {

        if(state.circularRunning){

          stopCircularAI();

        }else{

          startCircularAI();

        }

      }
    );


  $("circularMarketSelect")
    ?.addEventListener(
      "change",
      e => {

        state.selectedMarket =
          e.target.value;

        resetSelectedMarketView();

      }
    );

}


async function startCircularAI(){

  if(state.circularRunning){
    return;
  }


  state.circularRunning =
    true;

  state.circularToken++;


  setText(
    "startAI",
    "■ STOP CIRCULAR AI"
  );

  setText(
    "startCircularTradeBtn",
    "Stop Circular AI"
  );


  circularCycle(
    state.circularToken
  );

}


function stopCircularAI(){

  state.circularRunning =
    false;

  state.circularToken++;


  setText(
    "startAI",
    "▶ START CIRCULAR AI"
  );

  setText(
    "startCircularTradeBtn",
    "Start Circular AI Trading"
  );

  setText(
    "circularStatusText",
    "Circular AI Ready"
  );

  resetCycleUI();

  const circle =
    $("aiCircle");

  circle?.classList.remove(
    "active",
    "trade-now"
  );

}


async function circularCycle(token){

  while(
    state.circularRunning &&
    token === state.circularToken
  ){

    const market =
      $("circularMarketSelect")?.value ||
      state.selectedMarket;


    const analysis =
      analyzeMarket(market);


    /*
      PHASE 1
      10 second analysis
    */

    activateCycle(
      "cycleAnalysis"
    );


    setText(
      "aiStatus",
      "ANALYZING"
    );

    setText(
      "aiMarket",
      formatMarketName(market)
    );

    setText(
      "aiType",
      "CIRCULAR AI"
    );

    setText(
      "analysisMsg",
      "Circular AI is analyzing recent market structure..."
    );


    updateCircularCircle(
      "ANALYZING",
      "--",
      "10"
    );


    await countdown(
      10,
      token,
      value => {

        updateCircularCircle(
          "ANALYZING",
          "--",
          value
        );

      }
    );


    if(
      !state.circularRunning ||
      token !== state.circularToken
    ){
      break;
    }


    /*
      PHASE 2
      Prediction
    */

    activateCycle(
      "cyclePrediction"
    );


    const freshAnalysis =
      analyzeMarket(market);


    if(!freshAnalysis){

      setText(
        "analysisMsg",
        "Waiting for at least 20 ticks..."
      );

      await sleep(2000);

      continue;

    }


    const strategy =
      state.selectedStrategy;


    const prediction =
      createPrediction(
        freshAnalysis,
        strategy
      );


    state.lastCircularPrediction =
      prediction;


    updateCircularReport(
      prediction
    );


    setText(
      "aiStatus",
      "PREDICTION READY"
    );


    setText(
      "aiPrediction",
      prediction.prediction
    );


    setText(
      "aiType",
      strategyLabel(strategy)
    );


    setText(
      "analysisConfidence",
      `${prediction.confidence}%`
    );


    setText(
      "aiPredictionLarge",
      prediction.prediction
    );


    setText(
      "predictionConfidence",
      `CONFIDENCE: ${prediction.confidence}%`
    );


    updateCircularCircle(
      "PREDICTION",
      prediction.prediction,
      "5"
    );


    await countdown(
      5,
      token,
      value => {

        updateCircularCircle(
          "PREDICTION",
          prediction.prediction,
          value
        );

      }
    );


    if(
      !state.circularRunning ||
      token !== state.circularToken
    ){
      break;
    }


    /*
      PHASE 3
      Trade Now
    */

    activateCycle(
      "cycleTrade"
    );


    setText(
      "entryStatus",
      "TRADE NOW"
    );


    setText(
      "aiStatus",
      "TRADE NOW"
    );


    updateCircularCircle(
      "TRADE NOW",
      prediction.prediction,
      "3"
    );


    $("aiCircle")
      ?.classList.add(
        "trade-now"
      );


    const stake =
      Number(
        $("circularStakeInput")
          ?.value ||
        .35
      );


    createPaperTrade({

      engine:"CIRCULAR AI",

      market,

      strategy,

      prediction:
        prediction.prediction,

      stake,

      takeProfit:
        Number(
          $("circularTakeProfitInput")
            ?.value ||
          50
        ),

      stopLoss:
        Number(
          $("circularStopLossInput")
            ?.value ||
          100
        )

    });


    await countdown(
      3,
      token,
      value => {

        updateCircularCircle(
          "TRADE NOW",
          prediction.prediction,
          value
        );

      }
    );


    $("aiCircle")
      ?.classList.remove(
        "trade-now"
      );


    /*
      PHASE 4
      Repeat
    */

    activateCycle(
      "cycleCooldown"
    );


    setText(
      "entryStatus",
      "WAITING"
    );


    await sleep(1000);

  }

}


async function countdown(
  seconds,
  token,
  callback
){

  for(
    let i = seconds;
    i >= 1;
    i--
  ){

    if(
      !state.circularRunning ||
      token !== state.circularToken
    ){

      return false;

    }


    callback(i);

    await sleep(1000);

  }


  return true;

}


/* =========================================================
   CIRCULAR REPORT
========================================================= */

function updateCircularReport(
  prediction
){

  const a =
    prediction.analysis;


  setText(
    "reportMarket",
    formatMarketName(
      prediction.market
    )
  );


  setText(
    "reportScore",
    `${a.score.toFixed(0)}/100`
  );


  setText(
    "reportStrength",
    a.strength
  );


  setText(
    "reportStability",
    `${a.stability.toFixed(0)}%`
  );


  setText(
    "reportConcentration",
    `${a.concentration.toFixed(1)}%`
  );


  setText(
    "reportStreak",
    `${a.streak} ticks`
  );


  setText(
    "reportAgreement",
    `${a.agreement.toFixed(0)}%`
  );


  setText(
    "analysisMsg",
    `${strategyLabel(prediction.strategy)} selected. Statistical confidence: ${prediction.confidence}%.`
  );

}


function updateCircularCircle(
  label,
  prediction,
  timer
){

  setText(
    "aiCircleLabel",
    label
  );

  setText(
    "aiCirclePrediction",
    prediction
  );

  setText(
    "aiCircleTimer",
    timer
  );

  setText(
    "aiCircleStatus",
    state.circularRunning
      ? "RUNNING"
      : "READY"
  );

}


function updateCircularUI(){

  if(
    state.lastCircularPrediction
  ){

    updateCircularReport(
      state.lastCircularPrediction
    );

  }

}


function activateCycle(id){

  document.querySelectorAll(
    ".cycle-step"
  ).forEach(
    el =>
      el.classList.remove(
        "active"
      )
  );


  $(id)?.classList.add(
    "active"
  );

}


function resetCycleUI(){

  document.querySelectorAll(
    ".cycle-step"
  ).forEach(
    el =>
      el.classList.remove(
        "active"
      )
  );

}


/* =========================================================
   MANUAL
========================================================= */

function bindManualControls(){

  $("placeTradeBtn")
    ?.addEventListener(
      "click",
      executeManualTrade
    );


  $("manualMarketSelect")
    ?.addEventListener(
      "change",
      e => {

        state.selectedMarket =
          e.target.value;

        resetSelectedMarketView();

      }
    );

}


function executeManualTrade(){

  const market =
    $("manualMarketSelect")
      ?.value ||
    state.selectedMarket;


  const strategy =
    state.selectedStrategy;


  let prediction =
    Number(
      $("manualTargetDigitInput")
        ?.value
    );


  if(
    !Number.isInteger(prediction) ||
    prediction < 0 ||
    prediction > 9
  ){

    prediction = 4;

  }


  const stake =
    Number(
      $("manualStakeInput")
        ?.value ||
      .35
    );


  if(
    !Number.isFinite(stake) ||
    stake < .35
  ){

    setText(
      "manualStatusText",
      "Minimum stake is $0.35"
    );

    return;

  }


  createPaperTrade({

    engine:"MANUAL",

    market,

    strategy,

    prediction,

    stake,

    takeProfit:
      Number(
        $("manualTakeProfitInput")
          ?.value ||
        50
      ),

    stopLoss:
      Number(
        $("manualStopLossInput")
          ?.value ||
        100
      )

  });


  setText(
    "manualStatusText",
    `${strategyLabel(strategy)} trade placed on ${formatMarketName(market)}`
  );

}


/* =========================================================
   STRATEGY MODAL
========================================================= */

function bindStrategyModal(){

  const modal =
    $("strategyModal");


  document.querySelectorAll(
    "#strategyModal .strategy-option"
  ).forEach(option => {

    option.addEventListener(
      "click",
      () => {

        const strategy =
          option.dataset.strategy;


        state.selectedStrategy =
          strategy;


        document.querySelectorAll(
          "#strategyModal .strategy-option"
        ).forEach(
          item =>
            item.classList.remove(
              "selected"
            )
        );


        option.classList.add(
          "selected"
        );


        setText(
          "manualSelectedStrategyLabel",
          strategyLabel(strategy)
        );


        setText(
          "circularStrategyLabel",
          strategyLabel(strategy)
        );


        updateTargetDigitVisibility();


        if(modal){

          modal.style.display =
            "none";

        }

      }
    );

  });


  $("manualStrategyTrigger")
    ?.addEventListener(
      "click",
      () => {

        if(modal){
          modal.style.display =
            "flex";
        }

      }
    );


  $("circularStrategyTrigger")
    ?.addEventListener(
      "click",
      () => {

        if(modal){
          modal.style.display =
            "flex";
        }

      }
    );


  $("closeStrategyModal")
    ?.addEventListener(
      "click",
      () => {

        if(modal){
          modal.style.display =
            "none";
        }

      }
    );


  modal?.addEventListener(
    "click",
    event => {

      if(event.target === modal){

        modal.style.display =
          "none";

      }

    }
  );

}


/* =========================================================
   BOT STRATEGY POOL
========================================================= */

function bindBotStrategyModal(){

  const modal =
    $("botStrategyModal");


  $("closeBotStrategyModal")
    ?.addEventListener(
      "click",
      () => {

        modal.style.display =
          "none";

      }
    );


  $("applyBotStrategies")
    ?.addEventListener(
      "click",
      applyBotStrategyPool
    );


  modal?.addEventListener(
    "click",
    event => {

      if(event.target === modal){

        modal.style.display =
          "none";

      }

    }
  );


  updateBotStrategyLabel();

}


function applyBotStrategyPool(){

  const checked =
    Array.from(
      document.querySelectorAll(
        ".bot-strategy-check:checked"
      )
    ).map(
      input =>
        input.value
    );


  if(!checked.length){

    setText(
      "botStrategyLabel",
      "Select at least 1"
    );

    return;

  }


  state.botStrategyPool =
    checked;


  updateBotStrategyLabel();


  const modal =
    $("botStrategyModal");


  if(modal){

    modal.style.display =
      "none";

  }

}


function updateBotStrategyLabel(){

  setText(
    "botStrategyLabel",

    state.botStrategyPool
      .map(
        strategyLabel
      )
      .join(" / ")

  );

}


/* =========================================================
   TARGET DIGIT VISIBILITY
========================================================= */

function updateTargetDigitVisibility(){

  const container =
    $("targetDigitContainer");


  if(!container){
    return;
  }


  if(
    state.selectedStrategy ===
      "EVEN" ||
    state.selectedStrategy ===
      "ODD"
  ){

    container.style.display =
      "none";

  }else{

    container.style.display =
      "flex";

  }

}


/* =========================================================
   PAPER TRADE ENGINE
========================================================= */

function createPaperTrade(config){

  const stake =
    Number(config.stake);


  if(
    !Number.isFinite(stake) ||
    stake < .35
  ){

    return null;

  }


  /*
    Demo balance accounting:
    reserve the stake immediately.
  */

  if(
    state.paperBalance <
    stake
  ){

    setText(
      "engineStatusText",
      "Insufficient paper balance"
    );

    return null;

  }


  state.paperBalance -=
    stake;


  const trade = {

    id:
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2,8)}`,

    time:
      new Date()
        .toLocaleTimeString(),

    timestamp:
      Date.now(),

    engine:
      config.engine ||
      "MANUAL",

    market:
      config.market,

    strategy:
      config.strategy,

    prediction:
      Number.isInteger(
        config.prediction
      )
        ? config.prediction
        : 5,

    stake,

    takeProfit:
      Number(
        config.takeProfit ||
        50
      ),

    stopLoss:
      Number(
        config.stopLoss ||
        100
      ),

    result:null,

    status:"PENDING",

    amountWon:0,

    payout:0,

    profit:0,

    martingaleLevel:
      0

  };


  state.activeTrades.push(
    trade
  );


  renderActiveTrades();

  updateBalance();


  return trade;

}


/* =========================================================
   EVALUATE ACTIVE TRADES
========================================================= */

function evaluateActiveTrades(
  symbol,
  digit
){

  const trades =
    state.activeTrades
      .filter(
        trade =>
          trade.market === symbol &&
          trade.status === "PENDING"
      );


  trades.forEach(
    trade => {

      const result =
        evaluateStrategy(
          trade.strategy,
          digit,
          trade.prediction
        );


      settlePaperTrade(
        trade,
        result,
        digit
      );

    }
  );

}


/* =========================================================
   STRATEGY RESULT
========================================================= */

function evaluateStrategy(
  strategy,
  digit,
  prediction
){

  switch(strategy){

    case "MATCHES":

      return digit === prediction;


    case "DIFFERS":

      return digit !== prediction;


    case "EVEN":

      return digit % 2 === 0;


    case "ODD":

      return digit % 2 !== 0;


    case "OVER":

      return digit > prediction;


    case "UNDER":

      return digit < prediction;


    default:

      return digit === prediction;

  }

}


/* =========================================================
   PAYOUT MODEL
========================================================= */

function getPayoutMultiplier(
  strategy
){

  switch(strategy){

    case "MATCHES":
      return 8.5;

    case "DIFFERS":
      return .09;

    case "EVEN":
      return .95;

    case "ODD":
      return .95;

    case "OVER":
      return .95;

    case "UNDER":
      return .95;

    default:
      return .95;

  }

}


/* =========================================================
   SETTLE PAPER TRADE
========================================================= */

function settlePaperTrade(
  trade,
  win,
  digit
){

  if(
    trade.status !== "PENDING"
  ){

    return;

  }


  trade.result =
    digit;


  const multiplier =
    getPayoutMultiplier(
      trade.strategy
    );


  if(win){

    /*
      Payout includes stake
      plus profit