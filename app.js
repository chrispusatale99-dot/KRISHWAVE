/* =========================================================
   KRISHWAVE AI BEAST V7.0

   DERIV LIVE MARKET INTELLIGENCE
   DEMO / PAPER TRADING ONLY

   Includes:
   - Deriv OAuth
   - Live public tick data
   - Demo account balance
   - Market scanner
   - Digit analysis
   - AI Bot
   - Circular AI
   - Manual trading
   - Strategy selection
   - Paper trade settlement
   - Amount won
   - Profit/loss
   - Trade history
========================================================= */


/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {

  DERIV_CLIENT_ID: "34khasPjsT0PCRR8X3Z70",

  REDIRECT_URI:
    "https://chrispusatale99-dot.github.io/KRISHWAVE/",

  OAUTH_BACKEND:
    "https://krishwave-oauth.chrispusatale99.workers.dev",

  AUTH_URL:
    "https://auth.deriv.com/oauth2/auth",

  DERIV_API:
    "https://api.derivws.com",

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

  STRATEGIES: [
    "MATCHES",
    "DIFFERS",
    "OVER",
    "UNDER",
    "EVEN",
    "ODD"
  ],

  MAX_TICKS:
    80,

  ANALYSIS_TICKS:
    30

};


/* =========================================================
   STATE
========================================================= */

const state = {

  publicWS: null,
  accountWS: null,

  connected: false,

  accessToken: null,
  accountId: null,
  currency: "USD",

  realDemoBalance: null,

  paperBalance: 1000,

  selectedMarket: "R_100",
  selectedStrategy: "MATCHES",

  engineMode: "ai",

  botStrategyPool: [
    "MATCHES",
    "DIFFERS",
    "OVER",
    "UNDER",
    "EVEN",
    "ODD"
  ],

  markets: {},

  priceHistory: {},

  history: [],

  activeTrades: [],

  totalProfit: 0,
  totalAmountWon: 0,
  totalStake: 0,

  wins: 0,
  losses: 0,

  aiRunning: false,
  circularRunning: false,

  tradingStopped: false,

  aiTimer: null,
  circularTimer: null,

  botStake: 1,
  botMartingale: 1,

  botTakeProfit: 20,
  botStopLoss: 20,

  circularTakeProfit: 20,
  circularStopLoss: 20,

  manualTakeProfit: 20,
  manualStopLoss: 20,

  circularLastAnalysis: null,

  lastAnalysis: null,

  toastTimer: null,

  sessionStarted:
    Date.now()

};


/* =========================================================
   DOM HELPER
========================================================= */

function $(id){
  return document.getElementById(id);
}


/* =========================================================
   SAFE TEXT
========================================================= */

function setText(id, value){

  const el = $(id);

  if(!el) return;

  el.textContent =
    value === undefined ||
    value === null
      ? "—"
      : value;

}


/* =========================================================
   NUMBER FORMAT
========================================================= */

function money(value){

  const n =
    Number(value) || 0;

  return "$" +
    n.toFixed(2);
}


function percent(value){

  const n =
    Number(value) || 0;

  return Math.max(
    0,
    Math.min(100,n)
  ).toFixed(0) + "%";

}


/* =========================================================
   TOAST
========================================================= */

function toast(message){

  const el = $("toast");

  if(!el) return;

  el.textContent = message;

  el.classList.remove("hidden");

  clearTimeout(
    state.toastTimer
  );

  state.toastTimer =
    setTimeout(
      () => el.classList.add("hidden"),
      2600
    );

}


/* =========================================================
   LOCAL STORAGE
========================================================= */

function saveState(){

  try{

    localStorage.setItem(
      "krishwave_history_v7",
      JSON.stringify(state.history)
    );

    localStorage.setItem(
      "krishwave_paper_balance_v7",
      String(state.paperBalance)
    );

  }catch(e){

    console.warn(
      "Storage error",
      e
    );

  }

}


function loadState(){

  try{

    const history =
      localStorage.getItem(
        "krishwave_history_v7"
      );

    if(history){

      state.history =
        JSON.parse(history);

    }

    const balance =
      localStorage.getItem(
        "krishwave_paper_balance_v7"
      );

    if(balance !== null){

      const n =
        Number(balance);

      if(Number.isFinite(n)){

        state.paperBalance = n;

      }

    }

  }catch(e){

    console.warn(
      "Load error",
      e
    );

  }

}


/* =========================================================
   THEME
========================================================= */

function initTheme(){

  const saved =
    localStorage.getItem(
      "krishwave_theme"
    );

  if(saved === "light"){

    document.body.classList.add("light");

  }

  $("themeToggle")?.addEventListener(
    "click",
    () => {

      document.body.classList.toggle(
        "light"
      );

      localStorage.setItem(
        "krishwave_theme",
        document.body.classList.contains("light")
          ? "light"
          : "dark"
      );

    }
  );

}


/* =========================================================
   CONNECTION STATUS
========================================================= */

function setConnection(
  online,
  message
){

  state.connected =
    !!online;

  const dot =
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
    message
  );

}


/* =========================================================
   MARKET SELECTS
========================================================= */

function populateMarkets(){

  const selects = [
    $("circularMarketSelect"),
    $("manualMarketSelect")
  ];

  selects.forEach(select => {

    if(!select) return;

    select.innerHTML = "";

    CONFIG.MARKETS.forEach(symbol => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        symbol;

      option.textContent =
        symbol;

      select.appendChild(
        option
      );

    });

    select.value =
      state.selectedMarket;

  });

}


function initMarketSelects(){

  populateMarkets();

  $("circularMarketSelect")?.addEventListener(
    "change",
    e => {

      state.selectedMarket =
        e.target.value;

      toast(
        "Circular market changed to " +
        state.selectedMarket
      );

    }
  );


  $("manualMarketSelect")?.addEventListener(
    "change",
    e => {

      state.selectedMarket =
        e.target.value;

      toast(
        "Manual market changed to " +
        state.selectedMarket
      );

    }
  );

}


/* =========================================================
   PAGE NAVIGATION
========================================================= */

function showPage(page){

  document.querySelectorAll(
    ".page"
  ).forEach(p => {

    p.classList.remove(
      "active"
    );

  });

  document.querySelectorAll(
    ".nav-btn"
  ).forEach(btn => {

    btn.classList.remove(
      "active"
    );

  });

  if(page === "analysis"){

    $("analysisPage")
      ?.classList.add("active");

    $("navAnalysis")
      ?.classList.add("active");

  }

  if(page === "trading"){

    $("tradingPage")
      ?.classList.add("active");

    $("navTrading")
      ?.classList.add("active");

  }

  if(page === "history"){

    $("historyPage")
      ?.classList.add("active");

    $("navHistory")
      ?.classList.add("active");

  }

}


function initNavigation(){

  $("navAnalysis")?.addEventListener(
    "click",
    () => showPage("analysis")
  );

  $("navTrading")?.addEventListener(
    "click",
    () => showPage("trading")
  );

  $("navHistory")?.addEventListener(
    "click",
    () => showPage("history")
  );

}


/* =========================================================
   ENGINE MODE
========================================================= */

function setEngineMode(mode){

  state.engineMode =
    mode;

  const ai =
    $("aiBotPanel");

  const circular =
    $("circularPanel");

  const manual =
    $("manualPanel");

  ai?.classList.toggle(
    "hidden",
    mode !== "ai"
  );

  circular?.classList.toggle(
    "hidden",
    mode !== "circular"
  );

  manual?.classList.toggle(
    "hidden",
    mode !== "manual"
  );


  $("tabAiBot")
    ?.classList.toggle(
      "active",
      mode === "ai"
    );

  $("tabCircularAI")
    ?.classList.toggle(
      "active",
      mode === "circular"
    );

  $("tabManual")
    ?.classList.toggle(
      "active",
      mode === "manual"
    );


  if(mode === "ai"){

    stopCircular();

  }

  if(mode === "circular"){

    stopAI();

  }

  if(mode === "manual"){

    stopAI();
    stopCircular();

  }

}


function initEngineSelector(){

  $("tabAiBot")?.addEventListener(
    "click",
    () => setEngineMode("ai")
  );

  $("tabCircularAI")?.addEventListener(
    "click",
    () => setEngineMode("circular")
  );

  $("tabManual")?.addEventListener(
    "click",
    () => setEngineMode("manual")
  );

}


/* =========================================================
   PKCE
========================================================= */

function randomString(length = 64){

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  let result = "";

  const array =
    new Uint32Array(length);

  crypto.getRandomValues(array);

  for(let i=0;i<length;i++){

    result +=
      chars[
        array[i] % chars.length
      ];

  }

  return result;

}


async function sha256(value){

  const data =
    new TextEncoder()
      .encode(value);

  return crypto.subtle.digest(
    "SHA-256",
    data
  );

}


function base64url(buffer){

  return btoa(
    String.fromCharCode(
      ...new Uint8Array(buffer)
    )
  )
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=/g,"");

}


async function createPKCE(){

  const verifier =
    randomString(64);

  const digest =
    await sha256(verifier);

  const challenge =
    base64url(digest);

  const oauthState =
    randomString(32);

  localStorage.setItem(
    "krishwave_pkce_verifier",
    verifier
  );

  localStorage.setItem(
    "krishwave_oauth_state",
    oauthState
  );

  return {
    verifier,
    challenge,
    oauthState
  };

}


/* =========================================================
   DERIV CONNECT
========================================================= */

async function connectDeriv(){

  try{

    const {
      challenge,
      oauthState
    } =
      await createPKCE();

    const url =
      new URL(
        CONFIG.AUTH_URL
      );

    url.searchParams.set(
      "app_id",
      CONFIG.DERIV_CLIENT_ID
    );

    url.searchParams.set(
      "redirect_uri",
      CONFIG.REDIRECT_URI
    );

    url.searchParams.set(
      "response_type",
      "code"
    );

    url.searchParams.set(
      "scope",
      "trade_read"
    );

    url.searchParams.set(
      "code_challenge",
      challenge
    );

    url.searchParams.set(
      "code_challenge_method",
      "S256"
    );

    url.searchParams.set(
      "state",
      oauthState
    );


    window.location.href =
      url.toString();

  }catch(error){

    console.error(error);

    toast(
      "Could not start Deriv connection."
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

  const savedState =
    localStorage.getItem(
      "krishwave_oauth_state"
    );

  if(!code) return;


  if(
    returnedState &&
    savedState &&
    returnedState !== savedState
  ){

    toast(
      "OAuth security state mismatch."
    );

    return;

  }


  try{

    setConnection(
      false,
      "Connecting to Deriv..."
    );


    const verifier =
      localStorage.getItem(
        "krishwave_pkce_verifier"
      );


    const response =
      await fetch(
        CONFIG.OAUTH_BACKEND,
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:JSON.stringify({

            code,
            code_verifier:verifier,
            redirect_uri:
              CONFIG.REDIRECT_URI

          })

        }
      );


    if(!response.ok){

      throw new Error(
        "OAuth backend returned " +
        response.status
      );

    }


    const data =
      await response.json();


    const token =
      data.access_token ||
      data.token;


    if(!token){

      throw new Error(
        "No access token returned."
      );

    }


    state.accessToken =
      token;


    localStorage.setItem(
      "krishwave_access_token",
      token
    );


    cleanURL();


    await loadDerivAccounts();


  }catch(error){

    console.error(
      "OAuth error:",
      error
    );

    setConnection(
      false,
      "Deriv connection failed"
    );

    toast(
      "Deriv connection failed. Check OAuth backend."
    );

  }

}


/* =========================================================
   CLEAN URL
========================================================= */

function cleanURL(){

  try{

    const clean =
      window.location.origin +
      window.location.pathname;

    window.history.replaceState(
      {},
      document.title,
      clean
    );

  }catch(e){}

}


/* =========================================================
   LOAD SAVED TOKEN
========================================================= */

function loadSavedToken(){

  const token =
    localStorage.getItem(
      "krishwave_access_token"
    );

  if(token){

    state.accessToken =
      token;

  }

}


/* =========================================================
   DERIV ACCOUNT API
========================================================= */

async function loadDerivAccounts(){

  if(!state.accessToken){

    throw new Error(
      "No access token."
    );

  }


  setConnection(
    false,
    "Loading Deriv demo account..."
  );


  const response =
    await fetch(
      CONFIG.DERIV_API +
      "/trading/v1/options/accounts",
      {
        headers:{
          Authorization:
            "Bearer " +
            state.accessToken
        }
      }
    );


  if(!response.ok){

    throw new Error(
      "Account API " +
      response.status
    );

  }


  const data =
    await response.json();


  const accounts =
    data.accounts ||
    data.data ||
    [];


  if(!Array.isArray(accounts) ||
     accounts.length === 0){

    throw new Error(
      "No Deriv accounts found."
    );

  }


  let demo =
    accounts.find(
      a => {

        const text =
          JSON.stringify(a)
            .toLowerCase();

        return (
          text.includes("demo") ||
          text.includes("virtual") ||
          String(
            a.id ||
            a.loginid ||
            ""
          ).startsWith("VRT")
        );

      }
    );


  if(!demo){

    demo =
      accounts[0];

  }


  state.accountId =
    demo.id ||
    demo.loginid ||
    demo.account_id;


  state.currency =
    demo.currency ||
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
    "Deriv connected"
  );


  toast(
    "Deriv connected successfully."
  );


  connectAuthenticatedAccount();


}


/* =========================================================
   AUTHENTICATED DERIV WS
========================================================= */

async function connectAuthenticatedAccount(){

  if(
    !state.accessToken ||
    !state.accountId
  ) return;


  try{

    const response =
      await fetch(
        CONFIG.DERIV_API +
        "/trading/v1/options/accounts/" +
        encodeURIComponent(
          state.accountId
        ) +
        "/otp",
        {
          headers:{
            Authorization:
              "Bearer " +
              state.accessToken
          }
        }
      );


    if(!response.ok){

      throw new Error(
        "OTP API " +
        response.status
      );

    }


    const data =
      await response.json();


    const otp =
      data.otp ||
      data.token ||
      data.url;


    if(!otp){

      console.warn(
        "OTP response:",
        data
      );

      return;

    }


    let wsURL =
      otp;


    if(
      !String(otp)
        .startsWith("ws")
    ){

      wsURL =
        CONFIG.PUBLIC_WS +
        "?otp=" +
        encodeURIComponent(
          otp
        );

    }


    state.accountWS =
      new WebSocket(
        wsURL
      );


    state.accountWS.onopen =
      () => {

        console.log(
          "Authenticated Deriv socket connected."
        );


        state.accountWS.send(
          JSON.stringify({
            balance:1,
            subscribe:1
          })
        );

      };


    state.accountWS.onmessage =
      event => {

        try{

          const message =
            JSON.parse(
              event.data
            );

          handleAccountMessage(
            message
          );

        }catch(error){

          console.warn(
            "Account WS parse error",
            error
          );

        }

      };


    state.accountWS.onerror =
      error => {

        console.warn(
          "Account socket error",
          error
        );

      };


    state.accountWS.onclose =
      () => {

        console.log(
          "Account socket closed."
        );

      };

  }catch(error){

    console.warn(
      "Authenticated socket error:",
      error
    );

  }

}


/* =========================================================
   ACCOUNT MESSAGE
========================================================= */

function handleAccountMessage(message){

  if(
    message.balance &&
    message.balance.balance !== undefined
  ){

    const balance =
      Number(
        message.balance.balance
      );

    if(Number.isFinite(balance)){

      state.realDemoBalance =
        balance;

      setText(
        "balanceDisplay",
        money(balance)
      );

    }

  }

}


/* =========================================================
   PUBLIC DERIV WS
========================================================= */

function connectPublicWS(){

  if(
    state.publicWS &&
    state.publicWS.readyState ===
      WebSocket.OPEN
  ){

    return;

  }


  setText(
    "dataStatus",
    "Connecting to live Deriv market data..."
  );


  try{

    state.publicWS =
      new WebSocket(
        CONFIG.PUBLIC_WS
      );


    state.publicWS.onopen =
      () => {

        console.log(
          "Public Deriv WS connected."
        );


        setText(
          "dataStatus",
          "Live Deriv market data connected."
        );


        subscribeMarkets();

      };


    state.publicWS.onmessage =
      event => {

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
            "Market message error",
            error
          );

        }

      };


    state.publicWS.onerror =
      error => {

        console.warn(
          "Public WS error",
          error
        );

        setText(
          "dataStatus",
          "Market data connection error."
        );

      };


    state.publicWS.onclose =
      () => {

        console.log(
          "Public Deriv WS closed."
        );

        setText(
          "dataStatus",
          "Market data disconnected. Reconnecting..."
        );


        setTimeout(
          connectPublicWS,
          3000
        );

      };

  }catch(error){

    console.error(error);

  }

}


/* =========================================================
   SUBSCRIBE MARKETS
========================================================= */

function subscribeMarkets(){

  if(
    !state.publicWS ||
    state.publicWS.readyState !==
      WebSocket.OPEN
  ) return;


  CONFIG.MARKETS.forEach(
    symbol => {

      state.publicWS.send(
        JSON.stringify({

          ticks:
            symbol,

          subscribe:1

        })
      );

    }
  );

}


/* =========================================================
   PUBLIC MESSAGE
========================================================= */

function handlePublicMessage(message){

  if(!message) return;


  const tick =
    message.tick;

  if(!tick) return;


  const symbol =
    tick.symbol ||
    message.echo_req?.ticks;


  if(!symbol) return;


  const quote =
    Number(
      tick.quote
    );


  if(!Number.isFinite(quote))
    return;


  const pipSize =
    Number(
      tick.pip_size
    );


  const digit =
    getLastDigitFromTick(
      tick
    );


  if(
    !state.priceHistory[symbol]
  ){

    state.priceHistory[symbol] =
      [];

  }


  state.priceHistory[symbol]
    .push({

      quote,
      digit,
      epoch:
        Number(tick.epoch) ||
        Date.now()/1000

    });


  if(
    state.priceHistory[symbol]
      .length >
    CONFIG.MAX_TICKS
  ){

    state.priceHistory[symbol]
      .splice(
        0,
        state.priceHistory[symbol]
          .length -
        CONFIG.MAX_TICKS
      );

  }


  state.markets[symbol] = {

    quote,
    digit,

    epoch:
      Number(tick.epoch) ||
      Date.now()/1000,

    pipSize

  };


  settleTradesForMarket(
    symbol,
    digit,
    quote
  );


  updateLiveDisplay(
    symbol,
    quote
  );


  updateDigitDisplay(
    symbol
  );


  maybeRefreshAnalysis();

}


/* =========================================================
   LAST DIGIT
========================================================= */

function getLastDigitFromTick(tick){

  const quote =
    Number(
      tick.quote
    );


  let pip =
    Number(
      tick.pip_size
    );


  if(
    !Number.isFinite(pip) ||
    pip <= 0
  ){

    pip = 2;

  }


  const decimals =
    Math.max(
      0,
      Math.round(
        -Math.log10(pip)
      )
    );


  const scaled =
    Math.round(
      quote *
      Math.pow(
        10,
        decimals
      )
    );


  return Math.abs(
    scaled
  ) % 10;

}


/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket(symbol){

  const history =
    state.priceHistory[symbol] ||
    [];


  const ticks =
    history.slice(
      -CONFIG.ANALYSIS_TICKS
    );


  if(
    ticks.length < 10
  ){

    return {

      symbol,

      ready:false,

      sample:ticks.length,

      score:0,

      confidence:0,

      strength:0,

      stability:0,

      concentration:0,

      agreement:0,

      streak:0,

      hottest:0,

      coldest:0,

      lastDigit:
        ticks.length
          ? ticks[ticks.length-1].digit
          : null,

      counts:
        Array(10).fill(0)

    };

  }


  const counts =
    Array(10).fill(0);


  ticks.forEach(
    t => {

      const d =
        Number(t.digit);

      if(
        d >= 0 &&
        d <= 9
      ){

        counts[d]++;

      }

    }
  );


  const total =
    ticks.length;


  let hottest = 0;
  let coldest = 0;


  for(let d=1;d<10;d++){

    if(
      counts[d] >
      counts[hottest]
    ){

      hottest = d;

    }

    if(
      counts[d] <
      counts[coldest]
    ){

      coldest = d;

    }

  }


  const lastDigit =
    ticks[total-1].digit;


  let streak = 1;


  for(
    let i=total-2;
    i>=0;
    i--
  ){

    if(
      ticks[i].digit ===
      lastDigit
    ){

      streak++;

    }else{

      break;

    }

  }


  const maxCount =
    Math.max(...counts);


  const concentration =
    maxCount /
    total *
    100;


  const evenCount =
    ticks.filter(
      t => t.digit % 2 === 0
    ).length;


  const oddCount =
    total -
    evenCount;


  const evenRate =
    evenCount /
    total *
    100;


  const over5 =
    ticks.filter(
      t => t.digit > 5
    ).length;


  const under5 =
    ticks.filter(
      t => t.digit < 5
    ).length;


  const overRate =
    over5 /
    total *
    100;


  const underRate =
    under5 /
    total *
    100;


  const recent =
    ticks.slice(
      -10
    );


  const recentCounts =
    Array(10).fill(0);


  recent.forEach(
    t => {

      recentCounts[t.digit]++;

    }
  );


  const recentMax =
    Math.max(
      ...recentCounts
    );


  const stability =
    recentMax /
    recent.length *
    100;


  const directionAgreement =
    Math.abs(
      evenRate -
      oddCount / total * 100
    );


  const digitAgreement =
    Math.abs(
      concentration -
      10
    );


  const agreement =
    Math.min(
      100,
      35 +
      digitAgreement +
      directionAgreement * .5
    );


  const entropy =
    counts.reduce(
      (sum,count) => {

        if(!count)
          return sum;

        const p =
          count /
          total;

        return sum -
          p *
          Math.log2(p);

      },
      0
    );


  const stabilityScore =
    Math.max(
      0,
      100 -
      (entropy / 3.322 * 100)
    );


  const strength =
    Math.min(
      100,
      concentration *
      5 +
      Math.abs(
        evenRate -
        50
      ) *
      .7 +
      streak *
      3
    );


  const score =
    Math.round(
      (
        strength * .30 +
        stabilityScore * .25 +
        agreement * .25 +
        Math.min(
          100,
          concentration * 8
        ) * .20
      )
    );


  const confidence =
    Math.round(
      Math.min(
        95,
        45 +
        score * .45 +
        Math.min(
          10,
          streak * 2
        )
      )
    );


  return {

    symbol,

    ready:true,

    sample:total,

    counts,

    hottest,

    coldest,

    lastDigit,

    streak,

    concentration,

    stability:
      Math.round(
        stabilityScore
      ),

    strength:
      Math.round(
        strength
      ),

    agreement:
      Math.round(
        agreement
      ),

    score:
      Math.round(
        score
      ),

    confidence,

    evenRate,

    oddRate:
      100 - evenRate,

    overRate,

    underRate,

    entropy

  };

}


/* =========================================================
   BEST MARKET
========================================================= */

function findBestMarket(){

  let best =
    null;


  CONFIG.MARKETS.forEach(
    symbol => {

      const analysis =
        analyzeMarket(
          symbol
        );


      if(
        !analysis.ready
      ) return;


      const value =
        analysis.score +
        analysis.agreement *
        .25 +
        analysis.confidence *
        .25;


      if(
        !best ||
        value >
        best.value
      ){

        best = {

          symbol,

          analysis,

          value

        };

      }

    }
  );


  return best;

}


/* =========================================================
   STRATEGY ANALYSIS
========================================================= */

function evaluateStrategy(
  analysis,
  strategy
){

  if(
    !analysis ||
    !analysis.ready
  ){

    return {

      strategy,

      score:0,

      confidence:0,

      target:analysis?.lastDigit ?? 0,

      reason:
        "Waiting for enough tick data."

    };

  }


  const counts =
    analysis.counts;


  const total =
    analysis.sample;


  const hottest =
    analysis.hottest;


  const coldest =
    analysis.coldest;


  let target =
    hottest;


  let confidence =
    analysis.confidence;


  let score =
    analysis.score;


  let reason =
    "";


  if(strategy === "MATCHES"){

    target =
      hottest;

    const rate =
      counts[target] /
      total *
      100;

    score +=
      rate * 1.2;

    confidence =
      Math.min(
        95,
        confidence +
        rate * .7
      );

    reason =
      "The most frequent digit is " +
      target +
      " with " +
      rate.toFixed(0) +
      "% concentration.";

  }


  if(strategy === "DIFFERS"){

    target =
      hottest;

    const rate =
      counts[target] /
      total *
      100;

    score +=
      Math.max(
        0,
        100 - rate
      ) * .5;

    confidence =
      Math.min(
        95,
        confidence +
        Math.max(
          0,
          50-rate
        ) * .5
      );

    reason =
      "Differs is evaluated against the dominant digit " +
      target +
      ". Current concentration is " +
      rate.toFixed(0) +
      "%.";

  }


  if(strategy === "OVER"){

    target = 5;

    const rate =
      analysis.overRate;

    score +=
      Math.abs(
        rate - 50
      );

    confidence =
      Math.min(
        95,
        confidence +
        Math.abs(
          rate - 50
        ) * .4
      );

    reason =
      "Digits above 5 currently represent approximately " +
      rate.toFixed(0) +
      "% of the sample.";

  }


  if(strategy === "UNDER"){

    target = 5;

    const rate =
      analysis.underRate;

    score +=
      Math.abs(
        rate - 50
      );

    confidence =
      Math.min(
        95,
        confidence +
        Math.abs(
          rate - 50
        ) * .4
      );

    reason =
      "Digits below 5 currently represent approximately " +
      rate.toFixed(0) +
      "% of the sample.";

  }


  if(strategy === "EVEN"){

    target = 0;

    score +=
      Math.abs(
        analysis.evenRate -
        50
      );

    confidence =
      Math.min(
        95,
        confidence +
        Math.abs(
          analysis.evenRate -
          50
        ) * .5
      );

    reason =
      "Even digits are currently " +
      analysis.evenRate.toFixed(0) +
      "% of the sample.";

  }


  if(strategy === "ODD"){

    target = 1;

    score +=
      Math.abs(
        analysis.oddRate -
        50
      );

    confidence =
      Math.min(
        95,
        confidence +
        Math.abs(
          analysis.oddRate -
          50
        ) * .5
      );

    reason =
      "Odd digits are currently " +
      analysis.oddRate.toFixed(0) +
      "% of the sample.";

  }


  return {

    strategy,

    target,

    score:
      Math.round(
        score
      ),

    confidence:
      Math.round(
        confidence
      ),

    reason

  };

}


/* =========================================================
   BEST STRATEGY
========================================================= */

function chooseBestStrategy(
  analysis,
  pool = CONFIG.STRATEGIES
){

  const strategies =
    pool.length
      ? pool
      : CONFIG.STRATEGIES;


  let best =
    null;


  strategies.forEach(
    strategy => {

      const result =
        evaluateStrategy(
          analysis,
          strategy
        );


      if(
        !best ||
        result.score >
        best.score
      ){

        best = result;

      }

    }
  );


  return best;

}


/* =========================================================
   PREDICTION
========================================================= */

function createPrediction(
  analysis,
  strategy
){

  const result =
    evaluateStrategy(
      analysis,
      strategy
    );


  return {

    strategy,

    target:
      result.target,

    confidence:
      result.confidence,

    score:
      result.score,

    reason:
      result.reason

  };

}


/* =========================================================
   MAIN ANALYSIS DISPLAY
========================================================= */

function displayAIAnalysis(){

  const best =
    findBestMarket();


  if(!best){

    setText(
      "aiStatus",
      "SCANNING"
    );

    setText(
      "aiMarket",
      "Scanning..."
    );

    setText(
      "analysisMsg",
      "Collecting more live Deriv ticks..."
    );

    return;

  }


  const analysis =
    best.analysis;


  const strategy =
    chooseBestStrategy(
      analysis,
      state.botStrategyPool
    );


  const prediction =
    createPrediction(
      analysis,
      strategy.strategy
    );


  state.lastAnalysis = {

    market:
      best.symbol,

    analysis,

    strategy:
      strategy.strategy,

    prediction

  };


  setText(
    "aiStatus",
    "LIVE ANALYSIS"
  );

  setText(
    "aiMarket",
    best.symbol
  );

  setText(
    "analysisConfidence",
    percent(
      prediction.confidence
    )
  );

  setText(
    "aiPrediction",
    prediction.target
  );

  setText(
    "aiType",
    strategy.strategy
  );

  setText(
    "reportStrength",
    percent(
      analysis.strength
    )
  );

  setText(
    "reportStability",
    percent(
      analysis.stability
    )
  );

  setText(
    "reportConcentration",
    percent(
      analysis.concentration
    )
  );

  setText(
    "reportStreak",
    analysis.streak
  );

  setText(
    "reportAgreement",
    percent(
      analysis.agreement
    )
  );

  setText(
    "reportScore",
    analysis.score
  );

  setText(
    "strategyChosenValue",
    strategy.strategy
  );

  setText(
    "analysisEngine",
    "AI BOT"
  );

  setText(
    "analysisDigitCount",
    analysis.sample
  );

  setText(
    "analysisMsg",
    prediction.reason +
    " AI score: " +
    analysis.score +
    "/100."
  );


  setText(
    "botSelectedMarket",
    best.symbol
  );

  setText(
    "botSelectedStrategy",
    strategy.strategy
  );

  setText(
    "botScore",
    strategy.score
  );

  setText(
    "botConfidence",
    percent(
      strategy.confidence
    )
  );

  setText(
    "aiPredictionLarge",
    prediction.target
  );

  setText(
    "predictionConfidence",
    percent(
      prediction.confidence
    ) +
    " confidence • " +
    strategy.strategy
  );

}


/* =========================================================
   CIRCULAR AI ANALYSIS
========================================================= */

function displayCircularAnalysis(
  market,
  analysis,
  strategy
){

  const prediction =
    createPrediction(
      analysis,
      strategy.strategy
    );


  state.circularLastAnalysis = {

    market,

    analysis,

    strategy:
      strategy.strategy,

    prediction

  };


  setText(
    "circularAnalysisStatus",
    "LIVE"
  );

  setText(
    "circularAnalysisMarket",
    market
  );

  setText(
    "circularStrategyChosen",
    strategy.strategy
  );

  setText(
    "circularAnalysisPrediction",
    prediction.target
  );

  setText(
    "circularAnalysisConfidence",
    percent(
      prediction.confidence
    )
  );

  setText(
    "circularAnalysisScore",
    prediction.score
  );

  setText(
    "circularAnalysisAgreement",
    percent(
      analysis.agreement
    )
  );

  setText(
    "circularAnalysisReason",
    prediction.reason +
    " Circular AI selected " +
    strategy.strategy +
    " from the available strategy pool."
  );


  setText(
    "circularSelectedMarket",
    market
  );

  setText(
    "circularSelectedStrategy",
    strategy.strategy
  );

  setText(
    "circularConfidence",
    percent(
      prediction.confidence
    )
  );

  setText(
    "circularScore",
    prediction.score
  );


  setText(
    "aiCircleLabel",
    strategy.strategy
  );

  setText(
    "aiCirclePrediction",
    prediction.target
  );

}


/* =========================================================
   LIVE DISPLAY
========================================================= */

function updateLiveDisplay(
  symbol,
  quote
){

  if(
    symbol !==
    state.selectedMarket
  ) return;


  setText(
    "currentChartMarket",
    symbol
  );

  setText(
    "currentLivePrice",
    quote
  );


  drawChart(
    symbol
  );

}


/* =========================================================
   DIGIT DISPLAY
========================================================= */

function updateDigitDisplay(
  symbol
){

  if(
    symbol !==
    state.selectedMarket
  ) return;


  const analysis =
    analyzeMarket(
      symbol
    );


  const grid =
    $("digitStatsGrid");


  if(!grid) return;


  grid.innerHTML = "";


  const counts =
    analysis.counts ||
    Array(10).fill(0);


  counts.forEach(
    (count,digit) => {

      const cell =
        document.createElement(
          "div"
        );

      cell.className =
        "digit-cell";


      const b =
        document.createElement(
          "b"
        );

      b.textContent =
        digit;


      const span =
        document.createElement(
          "span"
        );

      span.textContent =
        count +
        " • " +
        (
          analysis.sample
            ? (
                count /
                analysis.sample *
                100
              ).toFixed(0)
            : 0
        ) +
        "%";


      cell.appendChild(b);

      cell.appendChild(span);

      grid.appendChild(cell);

    }
  );


  setText(
    "digitSampleCount",
    analysis.sample +
    " ticks"
  );

}


/* =========================================================
   CHART
========================================================= */

function drawChart(symbol){

  const canvas =
    $("priceChartCanvas");


  if(!canvas) return;


  const history =
    state.priceHistory[symbol] ||
    [];


  const values =
    history
      .slice(-40)
      .map(
        x => x.quote
      );


  if(values.length < 2)
    return;


  const rect =
    canvas.getBoundingClientRect();


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


  const min =
    Math.min(...values);


  const max =
    Math.max(...values);


  const range =
    max - min ||
    1;


  ctx.beginPath();


  values.forEach(
    (value,index) => {

      const x =
        index /
        (values.length-1) *
        width;


      const y =
        height -
        (
          (value-min) /
          range
        ) *
        (
          height - 15
        ) -
        7;


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
   ANALYSIS REFRESH
========================================================= */

let lastAnalysisRefresh =
  0;


function maybeRefreshAnalysis(){

  const now =
    Date.now();


  if(
    now -
    lastAnalysisRefresh <
    1000
  ){

    return;

  }


  lastAnalysisRefresh =
    now;


  displayAIAnalysis();


  const selected =
    state.selectedMarket;


  if(
    state.priceHistory[selected]
  ){

    updateDigitDisplay(
      selected
    );

  }

}


/* =========================================================
   PAPER TRADE CREATION
========================================================= */

function createPaperTrade({

  market,
  strategy,
  stake,
  target,
  engine,
  confidence,
  reason

}){

  if(state.tradingStopped){

    toast(
      "Trading is stopped."
    );

    return null;

  }


  const amount =
    Number(stake);


  if(
    !Number.isFinite(amount) ||
    amount <= 0
  ){

    toast(
      "Enter a valid stake."
    );

    return null;

  }


  if(
    amount >
    state.paperBalance
  ){

    toast(
      "Insufficient paper balance."
    );

    return null;

  }


  state.paperBalance -=
    amount;


  state.totalStake +=
    amount;


  const trade = {

    id:
      "KW-" +
      Date.now() +
      "-" +
      Math.floor(
        Math.random()*1000
      ),

    market,

    strategy,

    stake:
      amount,

    target:
      target === undefined
        ? null
        : Number(target),

    engine,

    confidence:
      Number(confidence) || 0,

    reason:
      reason || "",

    openedAt:
      Date.now(),

    status:
      "PENDING",

    resultDigit:
      null,

    amountWon:
      0,

    profit:
      0

  };


  state.activeTrades.push(
    trade
  );


  renderAll();

  saveState();


  toast(
    "Paper trade opened: " +
    strategy
  );


  return trade;

}


/* =========================================================
   PAYOUT
========================================================= */

function getPayoutMultiplier(
  strategy
){

  switch(strategy){

    case "MATCHES":
      return 8.5;

    case "DIFFERS":
      return 1.09;

    case "OVER":
    case "UNDER":
    case "EVEN":
    case "ODD":
      return 1.95;

    default:
      return 1;

  }

}


/* =========================================================
   TRADE SETTLEMENT
========================================================= */

function settleTradesForMarket(
  market,
  resultDigit,
  quote
){

  const pending =
    state.activeTrades.filter(
      trade =>
        trade.market === market &&
        trade.status === "PENDING"
    );


  pending.forEach(
    trade => {

      let win =
        false;


      if(
        trade.strategy ===
        "MATCHES"
      ){

        win =
          resultDigit ===
          trade.target;

      }


      if(
        trade.strategy ===
        "DIFFERS"
      ){

        win =
          resultDigit !==
          trade.target;

      }


      if(
        trade.strategy ===
        "EVEN"
      ){

        win =
          resultDigit % 2 === 0;

      }


      if(
        trade.strategy ===
        "ODD"
      ){

        win =
          resultDigit % 2 === 1;

      }


      if(
        trade.strategy ===
        "OVER"
      ){

        win =
          resultDigit >
          trade.target;

      }


      if(
        trade.strategy ===
        "UNDER"
      ){

        win =
          resultDigit <
          trade.target;

      }


      const multiplier =
        getPayoutMultiplier(
          trade.strategy
        );


      let amountWon =
        0;


      let profit =
        -trade.stake;


      if(win){

        amountWon =
          trade.stake *
          multiplier;

        profit =
          amountWon -
          trade.stake;

        state.paperBalance +=
          amountWon;

        state.wins++;

      }else{

        state.losses++;

      }


      trade.status =
        win
          ? "WON"
          : "LOST";

      trade.resultDigit =
        resultDigit;

      trade.resultQuote =
        quote;

      trade.amountWon =
        amountWon;

      trade.profit =
        profit;

      trade.closedAt =
        Date.now();


      state.totalProfit +=
        profit;

      state.totalAmountWon +=
        amountWon;


      state.history.unshift(
        {
          ...trade
        }
      );


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


      handleEngineSettlement(
        trade,
        win
      );


      toast(
        trade.strategy +
        " " +
        (
          win
            ? "WON"
            : "LOST"
        ) +
        " • " +
        money(profit)
      );

    }
  );


  state.activeTrades =
    state.activeTrades.filter(
      trade =>
        trade.status ===
        "PENDING"
    );


  saveState();

  renderAll();

}


/* =========================================================
   ENGINE SETTLEMENT
========================================================= */

function handleEngineSettlement(
  trade,
  win
){

  if(
    trade.engine ===
    "AI BOT"
  ){

    if(win){

      state.botStake =
        Number(
          $("stakeInput")?.value ||
          1
        );

    }else{

      const base =
        Number(
          $("stakeInput")?.value ||
          1
        );

      const multiplier =
        Number(
          $("martingaleInput")?.value ||
          1
        );


      state.botStake =
        Math.max(
          0.35,
          base *
          Math.max(
            1,
            multiplier
          )
        );

    }

  }

}


/* =========================================================
   AI BOT
========================================================= */

function startAI(){

  if(state.aiRunning){

    toast(
      "AI Bot is already running."
    );

    return;

  }


  if(state.tradingStopped){

    toast(
      "Trading is stopped. Start it again first."
    );

    return;

  }


  state.aiRunning =
    true;


  state.engineMode =
    "ai";


  state.botStake =
    Number(
      $("stakeInput")?.value ||
      1
    );


  state.botMartingale =
    Number(
      $("martingaleInput")?.value ||
      1
    );


  state.botTakeProfit =
    Number(
      $("takeProfitInput")?.value ||
      20
    );


  state.botStopLoss =
    Number(
      $("stopLossInput")?.value ||
      20
    );


  runAICycle();

}


function runAICycle(){

  if(!state.aiRunning)
    return;


  const best =
    findBestMarket();


  if(!best){

    setText(
      "engineStatusText",
      "COLLECTING DATA"
    );


    state.aiTimer =
      setTimeout(
        runAICycle,
        1000
      );


    return;

  }


  const strategy =
    chooseBestStrategy(
      best.analysis,
      state.botStrategyPool
    );


  const prediction =
    createPrediction(
      best.analysis,
      strategy.strategy
    );


  displayAIAnalysis();


  setText(
    "engineStatusText",
    "ANALYZING"
  );


  let countdown =
    3;


  setText(
    "predictionConfidence",
    "Analysis " +
    countdown +
    "s • " +
    percent(
      prediction.confidence
    )
  );


  clearTimeout(
    state.aiTimer
  );


  const timer =
    setInterval(
      () => {

        countdown--;

        if(
          countdown <= 0
        ){

          clearInterval(
            timer
          );


          if(
            !state.aiRunning
          ) return;


          executeAIPaperTrade(
            best,
            strategy,
            prediction
          );


          state.aiTimer =
            setTimeout(
              runAICycle,
              1500
            );


          return;

        }


        setText(
          "predictionConfidence",
          "Entry in " +
          countdown +
          "s • " +
          percent(
            prediction.confidence
          )
        );

      },
      1000
    );

}


function executeAIPaperTrade(
  best,
  strategy,
  prediction
){

  const stake =
    state.botStake ||
    Number(
      $("stakeInput")?.value ||
      1
    );


  createPaperTrade({

    market:
      best.symbol,

    strategy:
      strategy.strategy,

    stake,

    target:
      prediction.target,

    engine:
      "AI BOT",

    confidence:
      prediction.confidence,

    reason:
      prediction.reason

  });

}


/* =========================================================
   STOP AI
========================================================= */

function stopAI(){

  state.aiRunning =
    false;


  clearTimeout(
    state.aiTimer
  );


  setText(
    "engineStatusText",
    "STOPPED"
  );

}


/* =========================================================
   CIRCULAR AI
========================================================= */

function startCircular(){

  if(state.circularRunning){

    toast(
      "Circular AI is already running."
    );

    return;

  }


  if(state.tradingStopped){

    toast(
      "Trading is stopped."
    );

    return;

  }


  state.circularRunning =
    true;


  state.engineMode =
    "circular";


  state.circularTakeProfit =
    Number(
      $("circularTakeProfitInput")
        ?.value ||
      20
    );


  state.circularStopLoss =
    Number(
      $("circularStopLossInput")
        ?.value ||
      20
    );


  runCircularCycle();

}


function runCircularCycle(){

  if(
    !state.circularRunning
  ) return;


  setText(
    "circularStatusText",
    "ANALYZING"
  );

  setText(
    "cycleAnalysis",
    "RUNNING"
  );

  setText(
    "cyclePrediction",
    "WAIT"
  );

  setText(
    "cycleTrade",
    "WAIT"
  );

  setText(
    "cycleCooldown",
    "WAIT"
  );


  const best =
    findBestMarket();


  if(!best){

    setText(
      "circularAnalysisStatus",
      "COLLECTING"
    );

    setText(
      "circularAnalysisReason",
      "Circular AI needs more live ticks before selecting a market."
    );


    state.circularTimer =
      setTimeout(
        runCircularCycle,
        1000
      );

    return;

  }


  /*
     IMPORTANT:
     Circular AI independently chooses
     the best strategy.
  */

  const strategy =
    chooseBestStrategy(
      best.analysis,
      CONFIG.STRATEGIES
    );


  const prediction =
    createPrediction(
      best.analysis,
      strategy.strategy
    );


  displayCircularAnalysis(
    best.symbol,
    best.analysis,
    strategy
  );


  let countdown =
    10;


  setText(
    "aiCircleLabel",
    "ANALYSIS"
  );


  setText(
    "aiCircleTimer",
    countdown
  );


  const analysisTimer =
    setInterval(
      () => {

        countdown--;

        setText(
          "aiCircleTimer",
          countdown
        );


        if(
          countdown <= 0
        ){

          clearInterval(
            analysisTimer
          );


          if(
            !state.circularRunning
          ) return;


          circularPredictionPhase(
            best,
            strategy,
            prediction
          );

        }

      },
      1000
    );

}


function circularPredictionPhase(
  best,
  strategy,
  prediction
){

  setText(
    "cycleAnalysis",
    "DONE"
  );

  setText(
    "cyclePrediction",
    "READY"
  );

  setText(
    "circularStatusText",
    "PREDICTING"
  );

  setText(
    "aiCircleLabel",
    "PREDICT"
  );


  let countdown =
    5;


  setText(
    "aiCircleTimer",
    countdown
  );


  const timer =
    setInterval(
      () => {

        countdown--;

        setText(
          "aiCircleTimer",
          countdown
        );


        if(
          countdown <= 0
        ){

          clearInterval(
            timer
          );


          if(
            !state.circularRunning
          ) return;


          circularTradePhase(
            best,
            strategy,
            prediction
          );

        }

      },
      1000
    );

}


function circularTradePhase(
  best,
  strategy,
  prediction
){

  setText(
    "cyclePrediction",
    prediction.target
  );

  setText(
    "cycleTrade",
    "READY"
  );

  setText(
    "circularStatusText",
    "TRADING"
  );

  setText(
    "aiCircleLabel",
    "TRADE"
  );


  let countdown =
    3;


  setText(
    "aiCircleTimer",
    countdown
  );


  const timer =
    setInterval(
      () => {

        countdown--;

        setText(
          "aiCircleTimer",
          countdown
        );


        if(
          countdown <= 0
        ){

          clearInterval(
            timer
          );


          if(
            !state.circularRunning
          ) return;


          /*
             Circular AI prediction is used
             as its paper-trade target.
          */

          const stake =
            Number(
              $("circularStakeInput")
                ?.value ||
              1
            );


          createPaperTrade({

            market:
              best.symbol,

            strategy:
              strategy.strategy,

            stake,

            target:
              prediction.target,

            engine:
              "CIRCULAR AI",

            confidence:
              prediction.confidence,

            reason:
              prediction.reason

          });


          setText(
            "cycleTrade",
            "DONE"
          );


          circularCooldown();

        }

      },
      1000
    );

}


function circularCooldown(){

  setText(
    "circularStatusText",
    "COOLDOWN"
  );

  setText(
    "aiCircleLabel",
    "WAIT"
  );


  let countdown =
    3;


  setText(
    "aiCircleTimer",
    countdown
  );


  const timer =
    setInterval(
      () => {

        countdown--;

        setText(
          "aiCircleTimer",
          countdown
        );


        if(
          countdown <= 0
        ){

          clearInterval(
            timer
          );


          if(
            state.circularRunning
          ){

            runCircularCycle();

          }

        }

      },
      1000
    );

}


/* =========================================================
   STOP CIRCULAR
========================================================= */

function stopCircular(){

  state.circularRunning =
    false;


  clearTimeout(
    state.circularTimer
  );


  setText(
    "circularStatusText",
    "STOPPED"
  );

  setText(
    "circularAnalysisStatus",
    "STANDBY"
  );

}


/* =========================================================
   MANUAL TARGET UI
========================================================= */

function updateManualTargetUI(){

  const strategy =
    state.selectedStrategy;


  const container =
    $("targetDigitContainer");


  if(!container)
    return;


  const needsTarget =
    [
      "MATCHES",
      "DIFFERS",
      "OVER",
      "UNDER"
    ].includes(
      strategy
    );


  container.classList.toggle(
    "hidden",
    !needsTarget
  );


  if(strategy === "MATCHES"){

    setText(
      "targetDigitLabel",
      "MATCH DIGIT"
    );

  }

  if(strategy === "DIFFERS"){

    setText(
      "targetDigitLabel",
      "DIFFER FROM DIGIT"
    );

  }

  if(strategy === "OVER"){

    setText(
      "targetDigitLabel",
      "OVER NUMBER"
    );

  }

  if(strategy === "UNDER"){

    setText(
      "targetDigitLabel",
      "UNDER NUMBER"
    );

  }

}


/* =========================================================
   MANUAL STRATEGY
========================================================= */

function setManualStrategy(
  strategy
){

  if(
    !CONFIG.STRATEGIES.includes(
      strategy
    )
  ) return;


  state.selectedStrategy =
    strategy;


  setText(
    "manualSelectedStrategyLabel",
    "Strategy: " +
    strategy
  );


  updateManualTargetUI();

}


/* =========================================================
   MANUAL TRADE
========================================================= */

function placeManualTrade(){

  if(state.tradingStopped){

    toast(
      "Trading is stopped."
    );

    return;

  }


  const market =
    $("manualMarketSelect")
      ?.value ||
    state.selectedMarket;


  const strategy =
    state.selectedStrategy;


  const stake =
    Number(
      $("manualStakeInput")
        ?.value ||
      1
    );


  let target =
    null;


  if(
    [
      "MATCHES",
      "DIFFERS",
      "OVER",
      "UNDER"
    ].includes(
      strategy
    )
  ){

    const input =
      $("manualTargetDigitInput");


    target =
      Number(
        input?.value
      );


    if(
      !Number.isInteger(target) ||
      target < 0 ||
      target > 9
    ){

      toast(
        "Enter a target digit from 0 to 9."
      );

      return;

    }

  }


  if(strategy === "EVEN")
    target = 0;


  if(strategy === "ODD")
    target = 1;


  createPaperTrade({

    market,

    strategy,

    stake,

    target,

    engine:
      "MANUAL",

    confidence:0,

    reason:
      "Manual paper trade."

  });

}


/* =========================================================
   STRATEGY MODAL
========================================================= */

function openStrategyModal(){

  $("strategyModal")
    ?.classList.remove(
      "hidden"
    );

}


function closeStrategyModal(){

  $("strategyModal")
    ?.classList.add(
      "hidden"
    );

}


function initStrategyModal(){

  $("manualStrategyTrigger")
    ?.addEventListener(
      "click",
      openStrategyModal
    );


  $("closeStrategyModal")
    ?.addEventListener(
      "click",
      closeStrategyModal
    );


  document
    .querySelectorAll(
      ".strategy-option"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            setManualStrategy(
              button.dataset.strategy
            );

            closeStrategyModal();

          }
        );

      }
    );


  $("strategyModal")
    ?.addEventListener(
      "click",
      e => {

        if(
          e.target ===
          $("strategyModal")
        ){

          closeStrategyModal();

        }

      }
    );

}


/* =========================================================
   BOT STRATEGY MODAL
========================================================= */

function openBotStrategyModal(){

  $("botStrategyModal")
    ?.classList.remove(
      "hidden"
    );

}


function closeBotStrategyModal(){

  $("botStrategyModal")
    ?.classList.add(
      "hidden"
    );

}


function updateBotStrategyLabel(){

  const label =
    $("botStrategyTrigger");


  if(!label)
    return;


  if(
    state.botStrategyPool.length ===
    CONFIG.STRATEGIES.length
  ){

    label.textContent =
      "STRATEGIES: AUTO";

    return;

  }


  label.textContent =
    "STRATEGIES: " +
    state.botStrategyPool.join(
      ", "
    );

}


function initBotStrategyModal(){

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


  $("applyBotStrategyBtn")
    ?.addEventListener(
      "click",
      () => {

        const checked =
          Array.from(
            document.querySelectorAll(
              "#botStrategyModal input[type='checkbox']:checked"
            )
          )
          .map(
            input =>
              input.value
          );


        if(!checked.length){

          toast(
            "Select at least one strategy."
          );

          return;

        }


        state.botStrategyPool =
          checked;


        updateBotStrategyLabel();

        closeBotStrategyModal();

        toast(
          "AI Bot strategies updated."
        );

      }
    );

}


/* =========================================================
   STOP ALL TRADING
========================================================= */

function stopAllTrading(){

  state.tradingStopped =
    true;

  stopAI();

  stopCircular();


  setText(
    "manualStatusText",
    "STOPPED"
  );


  toast(
    "All trading engines stopped."
  );

}


/* =========================================================
   CLEAR HISTORY
========================================================= */

function clearHistory(){

  if(
    !confirm(
      "Clear all KRISHWAVE paper trade history?"
    )
  ){

    return;

  }


  state.history = [];

  state.totalProfit = 0;

  state.totalAmountWon = 0;

  state.totalStake = 0;

  state.wins = 0;

  state.losses = 0;


  saveState();

  renderAll();


  toast(
    "History cleared."
  );

}


/* =========================================================
   RENDER BALANCE
========================================================= */

function renderBalance(){

  /*
     Paper balance is the trading balance.
     Demo Deriv balance is displayed when
     the authenticated account socket provides it.
  */

  if(
    state.realDemoBalance === null
  ){

    setText(
      "balanceDisplay",
      money(
        state.paperBalance
      )
    );

  }

}


/* =========================================================
   RENDER RESULTS
========================================================= */

function renderResults(){

  const total =
    state.wins +
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


  const accuracy =
    total
      ? state.wins /
        total *
        100
      : 0;


  setText(
    "paperAccuracy",
    percent(
      accuracy
    )
  );

}


/* =========================================================
   RENDER HISTORY
========================================================= */

function renderHistory(){

  const list =
    $("historyCardsList");


  if(!list)
    return;


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
          trade.amountWon || 0
        ),
      0
    );


  const netProfit =
    state.history.reduce(
      (sum,trade) =>
        sum +
        Number(
          trade.profit || 0
        ),
      0
    );


  setText(
    "historyTotalStake",
    money(
      totalStake
    )
  );


  setText(
    "historyAmountWon",
    money(
      amountWon
    )
  );


  setText(
    "historyNetProfit",
    money(
      netProfit
    )
  );


  setText(
    "sessionProfitDisplay",
    money(
      netProfit
    )
  );


  if(
    !state.history.length
  ){

    list.innerHTML =
      '<div class="muted">No completed trades yet.</div>';

    return;

  }


  list.innerHTML = "";


  state.history
    .forEach(
      trade => {

        const card =
          document.createElement(
            "div"
          );


        card.className =
          "history-card";


        const top =
          document.createElement(
            "div"
          );


        top.className =
          "history-top";


        const title =
          document.createElement(
            "strong"
          );


        title.textContent =
          trade.market +
          " • " +
          trade.strategy;


        const result =
          document.createElement(
            "strong"
          );


        result.className =
          trade.status === "WON"
            ? "win"
            : "loss";


        result.textContent =
          trade.status;


        top.appendChild(
          title
        );

        top.appendChild(
          result
        );


        const meta =
          document.createElement(
            "div"
          );


        meta.className =
          "history-meta";


        const targetText =
          trade.target === null ||
          trade.target === undefined
            ? "—"
            : trade.target;


        meta.innerHTML =
          "Engine: " +
          escapeHTML(
            trade.engine
          ) +
          "<br>" +
          "Target: " +
          escapeHTML(
            targetText
          ) +
          " • Result digit: " +
          escapeHTML(
            trade.resultDigit
          ) +
          "<br>" +
          "Stake: " +
          money(
            trade.stake
          );


        const profit =
          document.createElement(
            "div"
          );


        profit.className =
          "history-profit";


        const amount =
          document.createElement(
            "span"
          );


        amount.className =
          "amount-won";


        amount.textContent =
          "Amount Won: " +
          money(
            trade.amountWon
          );


        const pnl =
          document.createElement(
            "span"
          );


        pnl.className =
          Number(trade.profit) >= 0
            ? "win"
            : "loss";


        pnl.textContent =
          " • Profit/Loss: " +
          money(
            trade.profit
          );


        profit.appendChild(
          amount
        );

        profit.appendChild(
          pnl
        );


        card.appendChild(
          top
        );

        card.appendChild(
          meta
        );

        card.appendChild(
          profit
        );


        list.appendChild(
          card
        );

      }
    );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value){

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


/* =========================================================
   RENDER ACTIVE TRADES
========================================================= */

function renderActiveTrades(){

  const list =
    $("activeTradesList");


  if(!list)
    return;


  setText(
    "activeTradeCount",
    state.activeTrades.length
  );


  if(
    !state.activeTrades.length
  ){

    list.innerHTML =
      '<div class="muted">No active trades.</div>';

    return;

  }


  list.innerHTML = "";


  state.activeTrades
    .forEach(
      trade => {

        const card =
          document.createElement(
            "div"
          );


        card.className =
          "active-trade";


        const top =
          document.createElement(
            "div"
          );


        top.className =
          "trade-top";


        const title =
          document.createElement(
            "strong"
          );


        title.textContent =
          trade.market +
          " • " +
          trade.strategy;


        const status =
          document.createElement(
            "strong"
          );


        status.className =
          "pending";


        status.textContent =
          "PENDING";


        top.appendChild(
          title
        );

        top.appendChild(
          status
        );


        const meta =
          document.createElement(
            "div"
          );


        meta.className =
          "trade-meta";


        meta.innerHTML =
          "Engine: " +
          escapeHTML(
            trade.engine
          ) +
          "<br>" +
          "Stake: " +
          money(
            trade.stake
          ) +
          " • Target: " +
          escapeHTML(
            trade.target
          ) +
          "<br>" +
          "Confidence: " +
          percent(
            trade.confidence
          );


        card.appendChild(
          top
        );

        card.appendChild(
          meta
        );


        list.appendChild(
          card
        );

      }
    );

}


/* =========================================================
   RENDER ALL
========================================================= */

function renderAll(){

  renderBalance();

  renderResults();

  renderActiveTrades();

  renderHistory();

}


/* =========================================================
   INPUT SETTINGS
========================================================= */

function initInputs(){

  $("stakeInput")
    ?.addEventListener(
      "change",
      e => {

        state.botStake =
          Number(
            e.target.value
          ) || 1;

      }
    );


  $("martingaleInput")
    ?.addEventListener(
      "change",
      e => {

        state.botMartingale =
          Number(
            e.target.value
          ) || 1;

      }
    );

}


/* =========================================================
   BUTTON EVENTS
========================================================= */

function initButtons(){

  $("connectDerivBtn")
    ?.addEventListener(
      "click",
      connectDeriv
    );


  $("startBotBtn")
    ?.addEventListener(
      "click",
      () => {

        state.tradingStopped =
          false;

        startAI();

      }
    );


  $("stopAI")
    ?.addEventListener(
      "click",
      stopAI
    );


  $("startCircularTradeBtn")
    ?.addEventListener(
      "click",
      () => {

        state.tradingStopped =
          false;

        startCircular();

      }
    );


  $("placeTradeBtn")
    ?.addEventListener(
      "click",
      () => {

        state.tradingStopped =
          false;

        placeManualTrade();

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
   CIRCULAR SELECTED MARKET
========================================================= */

function syncCircularMarket(){

  const select =
    $("circularMarketSelect");


  if(select){

    select.value =
      state.selectedMarket;

  }

}


/* =========================================================
   WINDOW RESIZE
========================================================= */

window.addEventListener(
  "resize",
  () => {

    drawChart(
      state.selectedMarket
    );

  }
);


/* =========================================================
   INIT
========================================================= */

async function init(){

  loadState();

  initTheme();

  initNavigation();

  initEngineSelector();

  initMarketSelects();

  initStrategyModal();

  initBotStrategyModal();

  initButtons();

  initInputs();

  setManualStrategy(
    state.selectedStrategy
  );

  updateBotStrategyLabel();

  syncCircularMarket();

  renderAll();


  setConnection(
    false,
    "Connecting to live market data..."
  );


  /*
     Public market data does not require
     a logged-in account.
  */

  connectPublicWS();


  /*
     Restore existing OAuth session
     if available.
  */

  loadSavedToken();


  await handleOAuthCallback();


  if(
    state.accessToken &&
    !state.accountId
  ){

    try{

      await loadDerivAccounts();

    }catch(error){

      console.warn(
        "Saved Deriv session could not be restored.",
        error
      );

      setConnection(
        false,
        "Connect Deriv"
      );

    }

  }


  setText(
    "dataStatus",
    "Waiting for live Deriv ticks..."
  );

}


/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);