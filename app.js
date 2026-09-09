/* =========================================================
   KRISHWAVE AI BEAST V7.0
   DERIV DEMO + PAPER INTELLIGENCE ENGINE
   =========================================================
   DEMO CONNECTION:
   OAuth 2.0 + PKCE
   Cloudflare OAuth backend
   Live authenticated demo account
   Public live market data

   IMPORTANT:
   This version does NOT execute real-money trades.
========================================================= */


/* =========================================================
   CONFIG
========================================================= */

const DERIV_CLIENT_ID = "34khasPjsT0PCRR8X3Z70";

const REDIRECT_URI =
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const OAUTH_BACKEND =
  "https://krishwave-oauth.chrispusatale99.workers.dev";

const AUTH_URL =
  "https://auth.deriv.com/oauth2/auth";

const DERIV_API =
  "https://api.derivws.com";

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

const HISTORY_KEY = "krishwave_v7_history";
const BALANCE_KEY = "krishwave_v7_balance";
const THEME_KEY = "krishwave_theme";
const SETTINGS_KEY = "krishwave_v7_settings";
const PKCE_VERIFIER_KEY = "krishwave_pkce_verifier";
const OAUTH_STATE_KEY = "krishwave_oauth_state";


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

  wins:0,

  losses:0,

  aiRunning:false,

  aiCycleToken:0,

  circularRunning:false,

  circularToken:0,

  publicWS:null,

  authWS:null,

  publicReconnectTimer:null,

  botTimer:null,

  circularTimer:null,

  authReconnectTimer:null,

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
   HELPERS
========================================================= */

function $(id){
  return document.getElementById(id);
}

function setText(id,value){
  const el=$(id);
  if(el) el.textContent=value;
}

function clamp(n,min,max){
  return Math.max(min,Math.min(max,n));
}

function money(n){
  return `$${Number(n||0).toFixed(2)}`;
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function randomId(){
  return Math.random().toString(36).slice(2)+Date.now();
}

function showToast(message){

  const toast=$("toast");
  const msg=$("toastMessage");

  if(!toast || !msg) return;

  msg.textContent=message;

  toast.classList.remove("hidden");

  clearTimeout(showToast.timer);

  showToast.timer=setTimeout(()=>{
    toast.classList.add("hidden");
  },3000);
}


/* =========================================================
   STORAGE
========================================================= */

function loadState(){

  try{

    const history=
      JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");

    if(Array.isArray(history)){
      state.history=history;
    }

    const balance=
      Number(localStorage.getItem(BALANCE_KEY));

    if(Number.isFinite(balance)){
      state.paperBalance=balance;
    }

    const settings=
      JSON.parse(
        localStorage.getItem(SETTINGS_KEY)||"{}"
      );

    if(settings.selectedMarket){
      state.selectedMarket=settings.selectedMarket;
    }

    if(settings.selectedStrategy){
      state.selectedStrategy=settings.selectedStrategy;
    }

    if(Array.isArray(settings.botStrategyPool)){
      state.botStrategyPool=
        settings.botStrategyPool;
    }

  }catch(error){

    console.error("Storage load error",error);

  }

  recalculateStats();

}

function saveState(){

  try{

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(state.history)
    );

    localStorage.setItem(
      BALANCE_KEY,
      String(state.paperBalance)
    );

    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        selectedMarket:state.selectedMarket,
        selectedStrategy:state.selectedStrategy,
        botStrategyPool:state.botStrategyPool
      })
    );

  }catch(error){

    console.error("Storage save error",error);

  }

}


/* =========================================================
   THEME
========================================================= */

function initTheme(){

  const saved=
    localStorage.getItem(THEME_KEY);

  if(saved==="light"){
    document.body.classList.add("light");
  }

  $("themeToggle")?.addEventListener("click",()=>{

    document.body.classList.toggle("light");

    localStorage.setItem(
      THEME_KEY,
      document.body.classList.contains("light")
      ? "light"
      : "dark"
    );

    drawChart();

  });

}


/* =========================================================
   NAVIGATION
========================================================= */

function initNavigation(){

  document.querySelectorAll(".nav-btn")
    .forEach(btn=>{

      btn.addEventListener("click",()=>{

        const page=btn.dataset.page;

        document.querySelectorAll(".page")
          .forEach(p=>p.classList.remove("active"));

        const target=
          $(`${page}Page`);

        if(target){
          target.classList.add("active");
        }

        document.querySelectorAll(".nav-btn")
          .forEach(b=>b.classList.remove("active"));

        btn.classList.add("active");

        if(page==="history"){
          renderHistory();
        }

      });

    });

}


/* =========================================================
   MARKET SELECTORS
========================================================= */

function initMarketSelectors(){

  const circular=$("circularMarketSelect");
  const manual=$("manualMarketSelect");

  MARKETS.forEach(symbol=>{

    if(circular){

      const option=document.createElement("option");

      option.value=symbol;
      option.textContent=symbol;

      circular.appendChild(option);

    }

    if(manual){

      const option=document.createElement("option");

      option.value=symbol;
      option.textContent=symbol;

      manual.appendChild(option);

    }

  });

  if(circular){
    circular.value=state.selectedMarket;
  }

  if(manual){
    manual.value=state.selectedMarket;
  }

}


/* =========================================================
   ENGINE SWITCHING
========================================================= */

function selectEngine(mode){

  if(mode==="ai"){

    if(state.circularRunning){
      stopCircular();
    }

    state.engineMode="ai";

  }

  if(mode==="circular"){

    if(state.aiRunning){
      stopAI();
    }

    state.engineMode="circular";

  }

  if(mode==="manual"){

    if(state.aiRunning){
      stopAI();
    }

    if(state.circularRunning){
      stopCircular();
    }

    state.engineMode="manual";

  }

  const ai=$("aiBotPanel");
  const circular=$("circularPanel");
  const manual=$("manualPanel");

  ai?.classList.toggle(
    "hidden",
    mode!=="ai"
  );

  circular?.classList.toggle(
    "hidden",
    mode!=="circular"
  );

  manual?.classList.toggle(
    "hidden",
    mode!=="manual"
  );

  $("tabAiBot")?.classList.toggle(
    "active",
    mode==="ai"
  );

  $("tabCircularAI")?.classList.toggle(
    "active",
    mode==="circular"
  );

  $("tabManual")?.classList.toggle(
    "active",
    mode==="manual"
  );

}

function initEngineTabs(){

  $("tabAiBot")?.addEventListener(
    "click",
    ()=>selectEngine("ai")
  );

  $("tabCircularAI")?.addEventListener(
    "click",
    ()=>selectEngine("circular")
  );

  $("tabManual")?.addEventListener(
    "click",
    ()=>selectEngine("manual")
  );

}


/* =========================================================
   PKCE
========================================================= */

function base64Url(buffer){

  return btoa(
    String.fromCharCode(
      ...new Uint8Array(buffer)
    )
  )
  .replace(/\+/g,"-")
  .replace(/\//g,"_")
  .replace(/=+$/,"");

}

function randomString(length=64){

  const chars=
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const bytes=
    crypto.getRandomValues(
      new Uint8Array(length)
    );

  let result="";

  for(let i=0;i<length;i++){

    result +=
      chars[bytes[i] % chars.length];

  }

  return result;

}

async function createPKCE(){

  const verifier=randomString(64);

  const hash=
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier)
    );

  const challenge=
    base64Url(hash);

  const stateValue=
    base64Url(
      crypto.getRandomValues(
        new Uint8Array(16)
      )
    );

  sessionStorage.setItem(
    PKCE_VERIFIER_KEY,
    verifier
  );

  sessionStorage.setItem(
    OAUTH_STATE_KEY,
    stateValue
  );

  return {
    verifier,
    challenge,
    state:stateValue
  };

}


/* =========================================================
   DERIV LOGIN
========================================================= */

async function connectDeriv(){

  try{

    const pkce=
      await createPKCE();

    const params=
      new URLSearchParams({

        response_type:"code",

        client_id:
          DERIV_CLIENT_ID,

        redirect_uri:
          REDIRECT_URI,

        scope:"trade",

        state:
          pkce.state,

        code_challenge:
          pkce.challenge,

        code_challenge_method:"S256"

      });

    window.location.href=
      `${AUTH_URL}?${params.toString()}`;

  }catch(error){

    console.error(error);

    showToast(
      "Unable to start Deriv login."
    );

  }

}


/* =========================================================
   OAUTH CALLBACK
========================================================= */

async function handleOAuthCallback(){

  const params=
    new URLSearchParams(
      window.location.search
    );

  const error=params.get("error");

  if(error){

    showToast(
      params.get("error_description") ||
      "Deriv login cancelled."
    );

    cleanURL();

    return;

  }

  const code=
    params.get("code");

  if(!code){
    return;
  }

  const returnedState=
    params.get("state");

  const savedState=
    sessionStorage.getItem(
      OAUTH_STATE_KEY
    );

  if(
    !returnedState ||
    !savedState ||
    returnedState!==savedState
  ){

    showToast(
      "OAuth security check failed."
    );

    cleanURL();

    return;

  }

  const verifier=
    sessionStorage.getItem(
      PKCE_VERIFIER_KEY
    );

  if(!verifier){

    showToast(
      "PKCE verifier missing."
    );

    cleanURL();

    return;

  }

  setConnection(
    false,
    "AUTHENTICATING..."
  );

  try{

    const response=
      await fetch(
        OAUTH_BACKEND,
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:JSON.stringify({
            code,
            code_verifier:verifier
          })
        }
      );

    const data=
      await response.json();

    if(!response.ok || !data.success){

      throw new Error(
        data.error ||
        "OAuth exchange failed"
      );

    }

    state.accessToken=
      data.access_token;

    sessionStorage.removeItem(
      PKCE_VERIFIER_KEY
    );

    sessionStorage.removeItem(
      OAUTH_STATE_KEY
    );

    cleanURL();

    await loadDerivAccounts();

  }catch(error){

    console.error(
      "OAuth callback error:",
      error
    );

    showToast(
      error.message ||
      "Deriv connection failed."
    );

    setConnection(
      false,
      "CONNECTION FAILED"
    );

  }

}

function cleanURL(){

  window.history.replaceState(
    {},
    document.title,
    REDIRECT_URI
  );

}


/* =========================================================
   DERIV ACCOUNTS
========================================================= */

async function loadDerivAccounts(){

  if(!state.accessToken){

    throw new Error(
      "Missing Deriv access token."
    );

  }

  const response=
    await fetch(
      `${DERIV_API}/trading/v1/options/accounts`,
      {
        headers:{
          Authorization:
            `Bearer ${state.accessToken}`
        }
      }
    );

  const data=
    await response.json();

  if(!response.ok){

    throw new Error(
      data?.errors?.[0]?.message ||
      "Unable to load Deriv accounts."
    );

  }

  const accounts=
    data.data || [];

  if(!accounts.length){

    throw new Error(
      "No Deriv options account was found."
    );

  }

  /*
    Prefer DEMO account.
    The current Deriv API identifies the account
    type in the returned account object.
  */

  let demo=
    accounts.find(account=>{
      const text=
        JSON.stringify(account).toLowerCase();

      return(
        text.includes("demo") ||
        String(account.account_type||"")
          .toLowerCase()==="demo"
      );
    });

  if(!demo){

    demo=
      accounts.find(account=>{
        const id=
          String(
            account.account_id ||
            account.id ||
            ""
          ).toUpperCase();

        return id.startsWith("VRT");
      });

  }

  if(!demo){

    /*
      We deliberately refuse to silently select
      a real-money account.
    */

    throw new Error(
      "No DEMO account was detected. Real account was not selected."
    );

  }

  state.accountId=
    demo.account_id ||
    demo.id;

  state.currency=
    demo.currency ||
    demo.currency_code ||
    "USD";

  setText(
    "accountId",
    state.accountId
  );

  setText(
    "currency",
    state.currency
  );

  setConnection(
    true,
    "DERIV DEMO CONNECTED"
  );

  $("dataStatus").textContent=
    "Authenticated DEMO account connected";

  await connectAuthenticatedDemo();

  showToast(
    `Demo account ${state.accountId} connected`
  );

}


/* =========================================================
   AUTHENTICATED DEMO WEBSOCKET
========================================================= */

async function connectAuthenticatedDemo(){

  if(!state.accessToken){
    throw new Error(
      "No authorization token."
    );
  }

  if(!state.accountId){
    throw new Error(
      "No demo account selected."
    );
  }

  /*
    Get short-lived OTP URL.
  */

  const response=
    await fetch(
      `${DERIV_API}/trading/v1/options/accounts/${encodeURIComponent(state.accountId)}/otp`,
      {
        method:"POST",

        headers:{
          Authorization:
            `Bearer ${state.accessToken}`
        }
      }
    );

  const data=
    await response.json();

  if(!response.ok){

    throw new Error(
      data?.errors?.[0]?.message ||
      "Unable to obtain demo WebSocket."
    );

  }

  const wsURL=
    data?.data?.url;

  if(!wsURL){

    throw new Error(
      "Deriv did not return a WebSocket URL."
    );

  }

  if(state.authWS){

    try{
      state.authWS.close();
    }catch{}

  }

  state.authWS=
    new WebSocket(wsURL);

  state.authWS.onopen=()=>{

    console.log(
      "Authenticated DEMO WebSocket connected"
    );

    setConnection(
      true,
      "DEMO LIVE"
    );

    subscribeAuthenticatedData();

  };

  state.authWS.onmessage=(event)=>{

    try{

      const msg=
        JSON.parse(event.data);

      handleAuthenticatedMessage(msg);

    }catch(error){

      console.error(
        "Auth WS parse error",
        error
      );

    }

  };

  state.authWS.onerror=error=>{

    console.error(
      "Authenticated WS error",
      error
    );

    $("dataStatus").textContent=
      "Demo connection error";

  };

  state.authWS.onclose=()=>{

    console.log(
      "Authenticated DEMO WebSocket closed"
    );

    if(state.accessToken && state.accountId){

      $("dataStatus").textContent=
        "Demo connection closed";

    }

  };

}


/* =========================================================
   AUTH WS SUBSCRIPTIONS
========================================================= */

function authSend(payload){

  if(
    state.authWS &&
    state.authWS.readyState===WebSocket.OPEN
  ){

    state.authWS.send(
      JSON.stringify(payload)
    );

  }

}

function subscribeAuthenticatedData(){

  /*
    Account balance.
  */

  authSend({
    balance:1,
    subscribe:1
  });

}


/* =========================================================
   AUTH WS MESSAGE
========================================================= */

function handleAuthenticatedMessage(msg){

  if(msg.balance){

    const balance=
      Number(msg.balance.balance);

    if(Number.isFinite(balance)){

      setText(
        "balanceDisplay",
        `${msg.balance.currency || state.currency} ${balance.toFixed(2)}`
      );

    }

  }

}


/* =========================================================
   CONNECTION STATUS
========================================================= */

function setConnection(online,text){

  state.connected=online;

  const dot=
    $("connectionDot");

  if(dot){

    dot.classList.toggle(
      "online",
      online
    );

    dot.classList.toggle(
      "offline",
      !online
    );

  }

  setText(
    "connectionText",
    text
  );

}


/* =========================================================
   PUBLIC MARKET WEBSOCKET
========================================================= */

function connectPublicWS(){

  if(state.publicWS){

    try{
      state.publicWS.close();
    }catch{}

  }

  state.publicWS=
    new WebSocket(PUBLIC_WS);

  state.publicWS.onopen=()=>{

    console.log(
      "Public Deriv WebSocket connected"
    );

    MARKETS.forEach(symbol=>{

      state.publicWS.send(
        JSON.stringify({
          ticks:symbol,
          subscribe:1
        })
      );

    });

    $("dataStatus").textContent=
      state.connected
      ? "DEMO account + live market data"
      : "Live public market data";

  };

  state.publicWS.onmessage=(event)=>{

    try{

      const msg=
        JSON.parse(event.data);

      if(msg.tick){

        processTick(msg.tick);

      }

    }catch(error){

      console.error(
        "Public tick error",
        error
      );

    }

  };

  state.publicWS.onerror=error=>{

    console.error(
      "Public WS error",
      error
    );

  };

  state.publicWS.onclose=()=>{

    clearTimeout(
      state.publicReconnectTimer
    );

    state.publicReconnectTimer=
      setTimeout(
        connectPublicWS,
        3000
      );

  };

}


/* =========================================================
   TICK PROCESSING
========================================================= */

function getLastDigitFromTick(tick){

  const quote=
    Number(tick.quote);

  if(!Number.isFinite(quote)){
    return null;
  }

  let pipSize=
    Number(tick.pip_size);

  if(
    !Number.isFinite(pipSize) ||
    pipSize<=0
  ){

    const quoteString=
      String(tick.quote);

    const decimals=
      quoteString.includes(".")
      ? quoteString.split(".")[1].length
      : 0;

    pipSize=
      Math.pow(10,-decimals);

  }

  const scaled=
    Math.round(
      quote / pipSize
    );

  return Math.abs(scaled)%10;

}

function processTick(tick){

  const symbol=
    tick.symbol ||
    tick.display_name;

  if(!symbol){
    return;
  }

  const digit=
    getLastDigitFromTick(tick);

  if(digit===null){
    return;
  }

  if(!state.markets[symbol]){

    state.markets[symbol]={
      ticks:[],
      prices:[]
    };

  }

  const market=
    state.markets[symbol];

  market.ticks.push(digit);

  market.prices.push(
    Number(tick.quote)
  );

  if(market.ticks.length>300){
    market.ticks.shift();
  }

  if(market.prices.length>300){
    market.prices.shift();
  }

  if(symbol===state.selectedMarket){

    state.priceHistory=
      market.prices.slice(-80);

    setText(
      "currentLivePrice",
      Number(tick.quote).toFixed(5)
    );

    setText(
      "currentChartMarket",
      symbol
    );

    renderDigitStats(symbol);

    drawChart();

  }

  evaluateActiveTrades(
    symbol,
    digit
  );

}


/* =========================================================
   MARKET ANALYSIS
========================================================= */

function calculateEntropy(counts,total){

  if(!total){
    return 1;
  }

  let entropy=0;

  counts.forEach(count=>{

    if(count<=0) return;

    const p=
      count/total;

    entropy -=
      p*Math.log2(p);

  });

  return entropy/Math.log2(10);

}

function calculateAgreement(ticks){

  const recent=
    ticks.slice(-12);

  if(recent.length<6){
    return 50;
  }

  const even=
    recent.filter(
      d=>d%2===0
    ).length /
    recent.length;

  const over=
    recent.filter(
      d=>d>5
    ).length /
    recent.length;

  const under=
    recent.filter(
      d=>d<5
    ).length /
    recent.length;

  const parityBias=
    Math.abs(even-.5);

  const directionBias=
    Math.max(
      over,
      under
    );

  return clamp(
    50+
    parityBias*50+
    Math.abs(directionBias-.5)*50,
    50,
    95
  );

}

function analyzeMarket(symbol){

  const market=
    state.markets[symbol];

  if(
    !market ||
    market.ticks.length<20
  ){

    return null;

  }

  const ticks=
    market.ticks.slice(-30);

  const counts=
    Array(10).fill(0);

  ticks.forEach(
    d=>counts[d]++
  );

  const total=
    ticks.length;

  const percentages=
    counts.map(
      c=>c/total*100
    );

  let hottest=0;
  let coldest=0;

  for(let i=1;i<10;i++){

    if(
      counts[i] >
      counts[hottest]
    ){
      hottest=i;
    }

    if(
      counts[i] <
      counts[coldest]
    ){
      coldest=i;
    }

  }

  const lastDigit=
    ticks[ticks.length-1];

  let streak=1;

  for(
    let i=ticks.length-2;
    i>=0;
    i--
  ){

    if(
      ticks[i]===lastDigit
    ){
      streak++;
    }else{
      break;
    }

  }

  const evenRate=
    ticks.filter(
      d=>d%2===0
    ).length /
    total;

  const overRate=
    ticks.filter(
      d=>d>5
    ).length /
    total;

  const underRate=
    ticks.filter(
      d=>d<5
    ).length /
    total;

  const concentration=
    Math.max(
      ...counts
    )/total;

  const entropy=
    calculateEntropy(
      counts,
      total
    );

  const stability=
    clamp(
      (1-entropy)*100,
      0,
      100
    );

  let score=50;

  score +=
    Math.abs(
      evenRate-.5
    )*30;

  score +=
    Math.abs(
      overRate-.5
    )*25;

  score +=
    Math.min(
      streak*2,
      12
    );

  score +=
    Math.abs(
      concentration-.10
    )*30;

  score=
    clamp(
      score,
      0,
      100
    );

  let strength="WEAK";

  if(score>=75){
    strength="STRONG";
  }else if(score>=62){
    strength="GOOD";
  }else if(score>=52){
    strength="MODERATE";
  }

  return{

    symbol,

    ticks,

    counts,

    percentages,

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

    agreement:
      calculateAgreement(ticks)

  };

}


/* =========================================================
   MARKET SELECTION
========================================================= */

function chooseBestMarket(){

  const analyses=
    MARKETS
      .map(analyzeMarket)
      .filter(Boolean);

  if(!analyses.length){
    return null;
  }

  analyses.sort(
    (a,b)=>
      (b.score+b.agreement*.25) -
      (a.score+a.agreement*.25)
  );

  return analyses[0];

}


/* =========================================================
   STRATEGY SELECTION
========================================================= */

function chooseBotStrategy(analysis){

  const pool=
    state.botStrategyPool
      .filter(s=>STRATEGIES.includes(s));

  if(!pool.length){
    return "MATCHES";
  }

  let best=pool[0];
  let bestScore=-Infinity;

  pool.forEach(strategy=>{

    let score=
      analysis.agreement;

    if(strategy==="MATCHES"){

      score +=
        analysis.concentration*100;

    }

    if(strategy==="DIFFERS"){

      score +=
        (1-analysis.concentration)*100;

    }

    if(strategy==="EVEN"){

      score +=
        Math.abs(
          analysis.evenRate-.5
        )*100;

    }

    if(strategy==="ODD"){

      score +=
        Math.abs(
          analysis.evenRate-.5
        )*100;

    }

    if(strategy==="OVER"){

      score +=
        Math.abs(
          analysis.overRate-.5
        )*100;

    }

    if(strategy==="UNDER"){

      score +=
        Math.abs(
          analysis.underRate-.5
        )*100;

    }

    if(score>bestScore){

      bestScore=score;
      best=strategy;

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

  let prediction=
    analysis.hottest;

  if(strategy==="MATCHES"){

    prediction=
      analysis.hottest;

  }

  if(strategy==="DIFFERS"){

    prediction=
      analysis.hottest;

  }

  if(strategy==="OVER"){

    prediction=
      analysis.hottest>5
      ? analysis.hottest
      : 6;

  }

  if(strategy==="UNDER"){

    prediction=
      analysis.hottest<5
      ? analysis.hottest
      : 4;

  }

  if(strategy==="EVEN"){

    const evenDigits=
      [...Array(10).keys()]
        .filter(d=>d%2===0);

    prediction=
      evenDigits
        .sort(
          (a,b)=>
            analysis.counts[b]-
            analysis.counts[a]
        )[0];

  }

  if(strategy==="ODD"){

    const oddDigits=
      [...Array(10).keys()]
        .filter(d=>d%2!==0);

    prediction=
      oddDigits
        .sort(
          (a,b)=>
            analysis.counts[b]-
            analysis.counts[a]
        )[0];

  }

  const confidence=
    clamp(
      50+
      (analysis.concentration-.10)*150+
      analysis.score*.25+
      Math.min(
        analysis.streak*2,
        10
      ),
      50,
      95
    );

  return{
    prediction,
    confidence
  };

}


/* =========================================================
   AI DISPLAY
========================================================= */

function displayAIAnalysis(
  analysis,
  strategy,
  prediction
){

  setText(
    "aiMarket",
    analysis.symbol
  );

  setText(
    "aiPrediction",
    `${STRATEGY_LABELS[strategy]} ${prediction}`
  );

  setText(
    "aiType",
    strategy
  );

  setText(
    "analysisConfidence",
    `${prediction.confidence.toFixed(0)}%`
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
    `${analysis.stability.toFixed(0)}%`
  );

  setText(
    "reportConcentration",
    `${(analysis.concentration*100).toFixed(1)}%`
  );

  setText(
    "reportStreak",
    String(analysis.streak)
  );

  setText(
    "reportAgreement",
    `${analysis.agreement.toFixed(0)}%`
  );

  setText(
    "botSelectedMarket",
    analysis.symbol
  );

  setText(
    "botSelectedStrategy",
    strategy
  );

  setText(
    "botScore",
    analysis.score.toFixed(1)
  );

  setText(
    "botConfidence",
    `${prediction.confidence.toFixed(0)}%`
  );

  setText(
    "aiPredictionLarge",
    `${strategy} ${prediction.prediction}`
  );

  setText(
    "predictionConfidence",
    `${prediction.confidence.toFixed(0)}%`
  );

  setText(
    "analysisMsg",
    `AI selected ${analysis.symbol} using ${strategy}. Statistical analysis only — no guaranteed outcome.`
  );

}


/* =========================================================
   AI BOT
   3 SECOND ANALYSIS
========================================================= */

async function startAI(){

  if(state.aiRunning){
    return;
  }

  if(state.tradingStopped){

    state.tradingStopped=false;

  }

  state.aiRunning=true;

  state.aiCycleToken++;

  const token=
    state.aiCycleToken;

  state.botBaseStake=
    Math.max(
      .35,
      Number(
        $("stakeInput")?.value || 10
      )
    );

  state.botCurrentStake=
    state.botBaseStake;

  state.botMartingaleLevel=0;

  state.botTakeProfit=
    Math.max(
      0,
      Number(
        $("takeProfitInput")?.value || 50
      )
    );

  state.botStopLoss=
    Math.max(
      0,
      Number(
        $("stopLossInput")?.value || 100
      )
    );

  state.botSessionStartProfit=
    state.totalProfit;

  state.sessionStartProfit=
    state.totalProfit;

  setText(
    "engineStatusText",
    "ANALYZING..."
  );

  setText(
    "aiStatus",
    "AI BOT RUNNING"
  );

  setText(
    "tradingStatusLabel",
    "AI BOT ACTIVE"
  );

  while(
    state.aiRunning &&
    token===state.aiCycleToken &&
    !state.tradingStopped
  ){

    const stopped=
      checkBotLimits();

    if(stopped){
      break;
    }

    /*
      EXACTLY 3 SECOND ANALYSIS
    */

    for(
      let second=3;
      second>=1;
      second--
    ){

      if(
        !state.aiRunning ||
        token!==state.aiCycleToken
      ){
        return;
      }

      setText(
        "engineStatusText",
        `ANALYZING ${second}`
      );

      setText(
        "aiStatus",
        `ANALYZING ${second}s`
      );

      await sleep(1000);

    }

    const analysis=
      chooseBestMarket();

    if(!analysis){

      setText(
        "engineStatusText",
        "COLLECTING DATA"
      );

      setText(
        "analysisMsg",
        "AI needs more live ticks before selecting a market."
      );

      await sleep(1000);

      continue;

    }

    const strategy=
      chooseBotStrategy(
        analysis
      );

    const prediction=
      createPrediction(
        analysis,
        strategy
      );

    state.selectedMarket=
      analysis.symbol;

    state.selectedStrategy=
      strategy;

    state.lastBotDecision={
      analysis,
      strategy,
      prediction
    };

    displayAIAnalysis(
      analysis,
      strategy,
      prediction
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
        state.botCurrentStake,

      takeProfit:
        state.botTakeProfit,

      stopLoss:
        state.botStopLoss,

      martingaleLevel:
        state.botMartingaleLevel

    });

    await sleep(700);

  }

}


/* =========================================================
   AI STOP
========================================================= */

function stopAI(){

  state.aiRunning=false;

  state.aiCycleToken++;

  clearTimeout(
    state.botTimer
  );

  setText(
    "engineStatusText",
    "STOPPED"
  );

  setText(
    "aiStatus",
    "STOPPED"
  );

  if(state.engineMode==="ai"){

    setText(
      "tradingStatusLabel",
      "STANDBY"
    );

  }

}


/* =========================================================
   BOT LIMITS
========================================================= */

function checkBotLimits(){

  const profit=
    state.totalProfit-
    state.botSessionStartProfit;

  if(
    state.botTakeProfit>0 &&
    profit>=state.botTakeProfit
  ){

    stopAI();

    showToast(
      `AI Bot Take Profit reached: ${money(profit)}`
    );

    return true;

  }

  if(
    state.botStopLoss>0 &&
    profit<=-state.botStopLoss
  ){

    stopAI();

    showToast(
      `AI Bot Stop Loss reached: ${money(profit)}`
    );

    return true;

  }

  return false;

}


/* =========================================================
   CIRCULAR AI
========================================================= */

async function startCircular(){

  if(state.circularRunning){
    return;
  }

  if(state.tradingStopped){
    state.tradingStopped=false;
  }

  if(state.aiRunning){
    stopAI();
  }

  state.circularRunning=true;

  state.circularToken++;

  const token=
    state.circularToken;

  state.circularTakeProfit=
    Math.max(
      0,
      Number(
        $("circularTakeProfitInput")?.value || 50
      )
    );

  state.circularStopLoss=
    Math.max(
      0,
      Number(
        $("circularStopLossInput")?.value || 100
      )
    );

  state.circularSessionStartProfit=
    state.totalProfit;

  while(
    state.circularRunning &&
    token===state.circularToken &&
    !state.tradingStopped
  ){

    if(checkCircularLimits()){
      break;
    }

    /*
      PHASE 1 — 10 seconds
    */

    for(
      let t=10;
      t>=1;
      t--
    ){

      if(!state.circularRunning){
        return;
      }

      setText(
        "circularStatusText",
        "ANALYZING"
      );

      setText(
        "aiCircleLabel",
        "ANALYSIS"
      );

      setText(
        "aiCircleTimer",
        `${t}s`
      );

      setText(
        "cycleAnalysis",
        `${t}s`
      );

      await sleep(1000);

    }

    const market=
      $("circularMarketSelect")?.value ||
      state.selectedMarket;

    const analysis=
      analyzeMarket(market);

    if(!analysis){

      showToast(
        "Circular AI needs more ticks."
      );

      await sleep(1000);

      continue;

    }

    const strategy=
      state.selectedStrategy ||
      "MATCHES";

    const prediction=
      createPrediction(
        analysis,
        strategy
      );

    /*
      PHASE 2 — 5 seconds
    */

    for(
      let t=5;
      t>=1;
      t--
    ){

      if(!state.circularRunning){
        return;
      }

      setText(
        "circularStatusText",
        "PREDICTING"
      );

      setText(
        "aiCircleLabel",
        strategy
      );

      setText(
        "aiCirclePrediction",
        String(
          prediction.prediction
        )
      );

      setText(
        "aiCircleTimer",
        `${t}s`
      );

      setText(
        "cyclePrediction",
        `${t}s`
      );

      await sleep(1000);

    }

    /*
      PHASE 3 — 3 seconds
    */

    for(
      let t=3;
      t>=1;
      t--
    ){

      if(!state.circularRunning){
        return;
      }

      setText(
        "circularStatusText",
        "TRADE NOW"
      );

      setText(
        "aiCircleLabel",
        "TRADE"
      );

      setText(
        "aiCircleTimer",
        `${t}s`
      );

      setText(
        "cycleTrade",
        `${t}s`
      );

      await sleep(1000);

    }

    const stake=
      Math.max(
        .35,
        Number(
          $("circularStakeInput")?.value || 10
        )
      );

    createPaperTrade({

      engine:"CIRCULAR AI",

      market,

      strategy,

      prediction:
        prediction.prediction,

      stake,

      takeProfit:
        state.circularTakeProfit,

      stopLoss:
        state.circularStopLoss,

      martingaleLevel:0

    });

    /*
      COOLDOWN
    */

    for(
      let t=3;
      t>=1;
      t--
    ){

      if(!state.circularRunning){
        return;
      }

      setText(
        "circularStatusText",
        "COOLDOWN"
      );

      setText(
        "cycleCooldown",
        `${t}s`
      );

      await sleep(1000);

    }

  }

}

function stopCircular(){

  state.circularRunning=false;

  state.circularToken++;

  clearTimeout(
    state.circularTimer
  );

  setText(
    "circularStatusText",
    "STOPPED"
  );

  if(state.engineMode==="circular"){

    setText(
      "tradingStatusLabel",
      "STANDBY"
    );

  }

}

function checkCircularLimits(){

  const profit=
    state.totalProfit-
    state.circularSessionStartProfit;

  if(
    state.circularTakeProfit>0 &&
    profit>=state.circularTakeProfit
  ){

    stopCircular();

    showToast(
      `Circular AI Take Profit: ${money(profit)}`
    );

    return true;

  }

  if(
    state.circularStopLoss>0 &&
    profit<=-state.circularStopLoss
  ){

    stopCircular();

    showToast(
      `Circular AI Stop Loss: ${money(profit)}`
    );

    return true;

  }

  return false;

}


/* =========================================================
   MANUAL TRADE
========================================================= */

function executeManualTrade(){

  if(state.tradingStopped){
    showToast(
      "Trading is stopped."
    );
    return;
  }

  const market=
    $("manualMarketSelect")?.value ||
    state.selectedMarket;

  const strategy=
    state.selectedStrategy;

  const stake=
    Math.max(
      .35,
      Number(
        $("manualStakeInput")?.value || 10
      )
    );

  let prediction=
    0;

  if(
    ["MATCHES","DIFFERS","OVER","UNDER"]
      .includes(strategy)
  ){

    prediction=
      clamp(
        Number(
          $("manualTargetDigitInput")?.value || 0
        ),
        0,
        9
      );

  }else{

    prediction=
      strategy==="EVEN"
      ? 0
      : 1;

  }

  createPaperTrade({

    engine:"MANUAL",

    market,

    strategy,

    prediction,

    stake,

    takeProfit:
      Number(
        $("manualTakeProfitInput")?.value || 50
      ),

    stopLoss:
      Number(
        $("manualStopLossInput")?.value || 100
      ),

    martingaleLevel:0

  });

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

  takeProfit,

  stopLoss,

  martingaleLevel

}){

  if(state.tradingStopped){

    showToast(
      "Trading is stopped."
    );

    return null;

  }

  stake=
    Math.max(
      .35,
      Number(stake)||0
    );

  if(stake>state.paperBalance){

    showToast(
      "Insufficient paper balance."
    );

    if(engine==="AI BOT"){
      stopAI();
    }

    return null;

  }

  state.paperBalance -=
    stake;

  const trade={

    id:randomId(),

    timestamp:Date.now(),

    time:new Date()
      .toLocaleTimeString(),

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

function tradeWins(
  trade,
  digit
){

  switch(trade.strategy){

    case "MATCHES":
      return digit===Number(trade.prediction);

    case "DIFFERS":
      return digit!==Number(trade.prediction);

    case "EVEN":
      return digit%2===0;

    case "ODD":
      return digit%2!==0;

    case "OVER":
      return digit>Number(trade.prediction);

    case "UNDER":
      return digit<Number(trade.prediction);

    default:
      return false;

  }

}

function evaluateActiveTrades(
  market,
  digit
){

  const trades=
    state.activeTrades
      .filter(
        t=>
          t.market===market &&
          t.status==="PENDING"
      );

  trades.forEach(
    trade=>
      settlePaperTrade(
        trade,
        digit
      )
  );

}


/* =========================================================
   SETTLEMENT
========================================================= */

function settlePaperTrade(
  trade,
  digit
){

  if(trade.status!=="PENDING"){
    return;
  }

  const won=
    tradeWins(
      trade,
      digit
    );

  trade.resultDigit=
    digit;

  trade.status=
    won
    ? "WON"
    : "LOST";

  let multiplier=0;

  if(trade.strategy==="MATCHES"){
    multiplier=8.5;
  }

  if(trade.strategy==="DIFFERS"){
    multiplier=.09;
  }

  if(
    ["EVEN","ODD","OVER","UNDER"]
      .includes(trade.strategy)
  ){
    multiplier=.95;
  }

  if(won){

    trade.payout=
      trade.stake*
      multiplier;

    trade.amountWon=
      trade.payout;

    trade.profit=
      trade.payout-
      trade.stake;

    state.paperBalance +=
      trade.payout;

    state.totalAmountWon +=
      trade.amountWon;

    state.wins++;

  }else{

    trade.payout=0;

    trade.amountWon=0;

    trade.profit=
      -trade.stake;

    state.losses++;

  }

  state.totalProfit +=
    trade.profit;

  state.totalStake +=
    trade.stake;

  /*
    Move into history.
  */

  state.history.unshift({
    ...trade
  });

  state.activeTrades=
    state.activeTrades.filter(
      t=>t.id!==trade.id
    );

  /*
    AI BOT martingale.
  */

  if(trade.engine==="AI BOT"){

    if(won){

      state.botCurrentStake=
        state.botBaseStake;

      state.botMartingaleLevel=0;

    }else{

      const factor=
        Math.max(
          1,
          Number(
            $("martingaleInput")?.value || 2.1
          )
        );

      state.botMartingaleLevel++;

      state.botCurrentStake=
        Math.min(
          state.botBaseStake*
          Math.pow(
            factor,
            state.botMartingaleLevel
          ),
          Math.max(
            .35,
            state.paperBalance
          )
        );

    }

  }

  saveState();

  renderAll();

  if(
    trade.engine==="AI BOT" &&
    checkBotLimits()
  ){
    return;
  }

}


/* =========================================================
   STOP ALL TRADING
========================================================= */

function stopAllTrading(){

  state.tradingStopped=true;

  stopAI();
  stopCircular();

  /*
    We do NOT delete pending trades.
    They remain visible and settle naturally
    on incoming ticks.
  */

  setText(
    "tradingStatusLabel",
    "STOPPED"
  );

  showToast(
    "All new trading activity stopped."
  );

}


/* =========================================================
   BALANCE / STATS
========================================================= */

function recalculateStats(){

  state.totalProfit=0;
  state.totalAmountWon=0;
  state.totalStake=0;
  state.wins=0;
  state.losses=0;

  state.history.forEach(trade=>{

    state.totalProfit +=
      Number(trade.profit)||0;

    state.totalAmountWon +=
      Number(trade.amountWon)||0;

    state.totalStake +=
      Number(trade.stake)||0;

    if(trade.result==="WON"){
      state.wins++;
    }

    if(trade.result==="LOST"){
      state.losses++;
    }

  });

}

function renderBalance(){

  if(!state.accountId){

    setText(
      "balanceDisplay",
      money(state.paperBalance)
    );

  }

}

function renderResults(){

  const total=
    state.wins+
    state.losses;

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
    total
      ? `${((state.wins/total)*100).toFixed(1)}%`
      : "0%"
  );

}

function renderHistoryStats(){

  setText(
    "historyTotalStake",
    money(state.totalStake)
  );

  setText(
    "historyAmountWon",
    money(state.totalAmountWon)
  );

  setText(
    "historyNetProfit",
    money(state.totalProfit)
  );

  const session=
    state.totalProfit-
    state.sessionStartProfit;

  setText(
    "sessionProfitDisplay",
    money(session)
  );

}


/* =========================================================
   ACTIVE TRADES
========================================================= */

function renderActiveTrades(){

  const container=
    $("activeTradesList");

  if(!container) return;

  setText(
    "activeTradeCount",
    state.activeTrades.length
  );

  if(!state.activeTrades.length){

    container.innerHTML=
      `<div class="muted">No active paper trades.</div>`;

    return;

  }

  container.innerHTML=
    state.activeTrades
      .map(trade=>`

        <div class="active-trade">

          <div class="trade-top">

            <strong>
              ${trade.engine}
            </strong>

            <strong class="pending">
              PENDING
            </strong>

          </div>

          <div class="trade-meta">

            ${trade.market}
            • ${trade.strategy}
            • Prediction: ${trade.prediction}
            • Stake: ${money(trade.stake)}

          </div>

        </div>

      `)
      .join("");

}


/* =========================================================
   HISTORY
========================================================= */

function renderHistory(){

  renderHistoryStats();

  const container=
    $("historyCardsList");

  if(!container) return;

  if(!state.history.length){

    container.innerHTML=
      `<div class="muted">
        No completed paper trades yet.
      </div>`;

    return;

  }

  container.innerHTML=
    state.history
      .slice(0,100)
      .map(trade=>`

        <div class="history-card">

          <div class="history-top">

            <strong>
              ${trade.engine}
            </strong>

            <strong class="${
              trade.status==="WON"
              ? "win"
              : "loss"
            }">
              ${trade.status}
            </strong>

          </div>

          <div class="history-meta">

            <b>${trade.market}</b>
            • ${trade.strategy}
            • Prediction: ${trade.prediction}
            • Result digit: ${trade.resultDigit}

            <br>

            Stake:
            ${money(trade.stake)}

            • Amount Won:
            ${money(trade.amountWon)}

            • Profit:
            <span class="${
              trade.profit>=0
              ? "win"
              : "loss"
            }">
              ${money(trade.profit)}
            </span>

            <br>

            ${trade.time}

          </div>

        </div>

      `)
      .join("");

}


/* =========================================================
   DIGIT STATS
========================================================= */

function renderDigitStats(symbol){

  const container=
    $("digitStatsGrid");

  if(!container) return;

  const market=
    state.markets[symbol];

  if(!market){

    container.innerHTML="";

    return;

  }

  const ticks=
    market.ticks.slice(-30);

  setText(
    "digitSampleCount",
    `${ticks.length} ticks`
  );

  const counts=
    Array(10).fill(0);

  ticks.forEach(
    d=>counts[d]++
  );

  container.innerHTML=
    counts.map(
      (count,digit)=>`

        <div class="digit-cell">

          <b>${digit}</b>

          <span>
            ${count}
            ${
              ticks.length
              ? `(${((count/ticks.length)*100).toFixed(0)}%)`
              : ""
            }
          </span>

        </div>

      `
    )
    .join("");

}


/* =========================================================
   CHART
========================================================= */

function drawChart(){

  const canvas=
    $("priceChartCanvas");

  if(!canvas){
    return;
  }

  const ctx=
    canvas.getContext("2d");

  const rect=
    canvas.getBoundingClientRect();

  const ratio=
    window.devicePixelRatio||1;

  canvas.width=
    rect.width*ratio;

  canvas.height=
    150*ratio;

  ctx.scale(
    ratio,
    ratio
  );

  ctx.clearRect(
    0,
    0,
    rect.width,
    150
  );

  const values=
    state.priceHistory;

  if(values.length<2){
    return;
  }

  let min=
    Math.min(...values);

  let max=
    Math.max(...values);

  if(min===max){
    max=min+1;
  }

  ctx.beginPath();

  values.forEach(
    (value,index)=>{

      const x=
        index/
        (values.length-1)*
        rect.width;

      const y=
        140-
        (
          (value-min)/
          (max-min)
        )*120;

      if(index===0){
        ctx.moveTo(x,y);
      }else{
        ctx.lineTo(x,y);
      }

    }
  );

  ctx.strokeStyle=
    getComputedStyle(document.body)
      .getPropertyValue("--accent");

  ctx.lineWidth=2;

  ctx.stroke();

}


/* =========================================================
   STRATEGY MODAL
========================================================= */

let strategyTarget=
  "manual";

function openStrategyModal(target){

  strategyTarget=
    target;

  $("strategyModal")
    ?.classList.remove("hidden");

}

function closeStrategyModal(){

  $("strategyModal")
    ?.classList.add("hidden");

}

function initStrategyModal(){

  document.querySelectorAll(
    ".strategy-option"
  ).forEach(button=>{

    button.addEventListener(
      "click",
      ()=>{

        const strategy=
          button.dataset.strategy;

        state.selectedStrategy=
          strategy;

        if(
          strategyTarget==="manual"
        ){

          setText(
            "manualSelectedStrategyLabel",
            strategy
          );

          updateTargetDigitVisibility();

        }

        if(
          strategyTarget==="circular"
        ){

          setText(
            "circularStrategyLabel",
            strategy
          );

        }

        saveState();

        closeStrategyModal();

      }
    );

  });

  $("closeStrategyModal")
    ?.addEventListener(
      "click",
      closeStrategyModal
    );

}


/* =========================================================
   BOT STRATEGY MODAL
========================================================= */

function openBotStrategyModal(){

  document.querySelectorAll(
    ".bot-strategy-check"
  ).forEach(check=>{

    check.checked=
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

  const selected=
    [...document.querySelectorAll(
      ".bot-strategy-check:checked"
    )]
    .map(
      check=>check.value
    );

  if(!selected.length){

    showToast(
      "Select at least one strategy."
    );

    return;

  }

  state.botStrategyPool=
    selected;

  setText(
    "botStrategyLabel",
    selected.join(", ")
  );

  saveState();

  closeBotStrategyModal();

}


/* =========================================================
   TARGET DIGIT
========================================================= */

function updateTargetDigitVisibility(){

  const strategy=
    state.selectedStrategy;

  const needed=
    [
      "MATCHES",
      "DIFFERS",
      "OVER",
      "UNDER"
    ].includes(strategy);

  $("targetDigitContainer")
    ?.classList.toggle(
      "hidden",
      !needed
    );

}


/* =========================================================
   CLEAR HISTORY
========================================================= */

function clearHistory(){

  if(!confirm(
    "Clear completed paper trade history?"
  )){
    return;
  }

  state.history=[];

  recalculateStats();

  saveState();

  renderAll();

  showToast(
    "History cleared."
  );

}


/* =========================================================
   RENDER ALL
========================================================= */

function renderAll(){

  renderBalance();

  renderResults();

  renderActiveTrades();

  renderHistoryStats();

  renderHistory();

}


/* =========================================================
   INIT
========================================================= */

async function init(){

  loadState();

  initTheme();

  initNavigation();

  initMarketSelectors();

  initEngineTabs();

  initStrategyModal();

  selectEngine("ai");

  setText(
    "botStrategyLabel",
    state.botStrategyPool.join(", ")
  );

  setText(
    "manualSelectedStrategyLabel",
    state.selectedStrategy
  );

  setText(
    "circularStrategyLabel",
    state.selectedStrategy
  );

  if($("circularMarketSelect")){
    $("circularMarketSelect").value=
      state.selectedMarket;
  }

  if($("manualMarketSelect")){
    $("manualMarketSelect").value=
      state.selectedMarket;
  }

  updateTargetDigitVisibility();

  /*
    Buttons
  */

  $("connectDerivBtn")
    ?.addEventListener(
      "click",
      connectDeriv
    );

  $("startBotBtn")
    ?.addEventListener(
      "click",
      startAI
    );

  $("stopAI")
    ?.addEventListener(
      "click",
      stopAI
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
      ()=>{
        strategyTarget="manual";
        openStrategyModal("manual");
      }
    );

  $("circularStrategyTrigger")
    ?.addEventListener(
      "click",
      ()=>{
        strategyTarget="circular";
        openStrategyModal("circular");
      }
    );

  $("manualMarketSelect")
    ?.addEventListener(
      "change",
      event=>{
        state.selectedMarket=
          event.target.value;
        saveState();
      }
    );

  $("circularMarketSelect")
    ?.addEventListener(
      "change",
      event=>{
        state.selectedMarket=
          event.target.value;
        saveState();
      }
    );

  /*
    Start public market data.
  */

  connectPublicWS();

  /*
    Handle OAuth callback if present.
  */

  await handleOAuthCallback();

  renderAll();

  drawChart();

}


/* =========================================================
   START
========================================================= */

window.addEventListener(
  "resize",
  drawChart
);

document.addEventListener(
  "DOMContentLoaded",
  init
);