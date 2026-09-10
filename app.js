/* =========================================================
   KRISHWAVE AI BEAST V7.3
   FRONTEND ENGINE
   ---------------------------------------------------------
   DEMO / PAPER TRADING ONLY
   No real trade is executed by this application.
========================================================= */

"use strict";


/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIG = {

  BACKEND:
    "https://YOUR-RAILWAY-DOMAIN.up.railway.app",

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

  START_BALANCE: 10000,

  MIN_STAKE: 0.25,

  HISTORY_KEY:
    "KRISHWAVE_V73_HISTORY",

  BALANCE_KEY:
    "KRISHWAVE_V73_BALANCE",

  SESSION_KEY:
    "KRISHWAVE_V73_SESSION",

  ACCOUNT_KEY:
    "KRISHWAVE_V73_ACCOUNT"

};


/* =========================================================
   STATE
========================================================= */

const state = {

  ws: null,

  connected: false,

  connecting: false,

  market:
    "R_10",

  ticks: [],

  tickCount: 0,

  price:
    0,

  lastDigit:
    null,

  prediction:
    null,

  confidence:
    0,

  circularAI:
    false,

  cycle:
    "READY",

  cycleTimer:
    10,

  cycleInterval:
    null,

  analysisInterval:
    null,

  mode:
    "DEMO",

  sessionId:
    localStorage.getItem(CONFIG.SESSION_KEY),

  account:
    null,

  balance:
    Number(
      localStorage.getItem(CONFIG.BALANCE_KEY)
    ) || CONFIG.START_BALANCE,

  history:
    JSON.parse(
      localStorage.getItem(CONFIG.HISTORY_KEY) || "[]"
    )

};


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = id =>
  document.getElementById(id);


function toast(message) {

  const box = $("toast");

  if (!box) return;

  box.textContent = message;

  box.style.display = "block";

  clearTimeout(toast.timer);

  toast.timer =
    setTimeout(() => {

      box.style.display = "none";

    }, 3000);

}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    initializeDigits();

    initializeNavigation();

    initializeControls();

    loadTheme();

    renderHistory();

    updateBalanceUI();

    setMarket(
      state.market
    );

    checkSavedSession();

    console.log(
      "KRISHWAVE AI BEAST V7.3 READY"
    );

  }
);


/* =========================================================
   DIGIT UI
========================================================= */

function initializeDigits() {

  const container =
    $("digitDistribution");

  if (!container) return;

  container.innerHTML = "";

  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    const item =
      document.createElement("div");

    item.className =
      "digit";

    item.innerHTML = `

      <div class="digit-number">
        ${digit}
      </div>

      <div
        class="digit-percent"
        id="digit-${digit}"
      >
        0.0%
      </div>

    `;

    container.appendChild(item);

  }

}


/* =========================================================
   NAVIGATION
========================================================= */

function initializeNavigation() {

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const page =
            button.dataset.page;

          showPage(page);

        }
      );

    });

}


function showPage(pageId) {

  document
    .querySelectorAll(".page")
    .forEach(page => {

      page.classList.remove("active");

    });


  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.classList.remove("active");

    });


  const page =
    $(pageId);

  if (page) {

    page.classList.add("active");

  }


  const button =
    document.querySelector(
      `.nav-btn[data-page="${pageId}"]`
    );

  if (button) {

    button.classList.add("active");

  }


  if (pageId === "tradePage") {

    syncTradeMarket();

  }

}


/* =========================================================
   CONTROLS
========================================================= */

function initializeControls() {

  $("connectBtn")
    ?.addEventListener(
      "click",
      connectDeriv
    );


  $("marketSelect")
    ?.addEventListener(
      "change",
      event => {

        setMarket(
          event.target.value
        );

      }
    );


  $("tradeMarket")
    ?.addEventListener(
      "change",
      syncTradeMarket
    );


  $("demoBtn")
    ?.addEventListener(
      "click",
      () => {

        state.mode = "DEMO";

        $("demoBtn")
          .classList.add("active");

        $("realBtn")
          .classList.remove("active");

        toast(
          "DEMO mode selected"
        );

      }
    );


  $("realBtn")
    ?.addEventListener(
      "click",
      () => {

        state.mode = "REAL";

        $("realBtn")
          .classList.add("active");

        $("demoBtn")
          .classList.remove("active");

        toast(
          "REAL display selected. Trading remains PAPER ONLY."
        );

      }
    );


  $("themeBtn")
    ?.addEventListener(
      "click",
      toggleTheme
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


  $("paperTrade")
    ?.addEventListener(
      "click",
      executePaperTrade
    );


  $("clearHistory")
    ?.addEventListener(
      "click",
      clearHistory
    );


  $("stake")
    ?.addEventListener(
      "input",
      updateStakePreview
    );

}


/* =========================================================
   THEME
========================================================= */

function loadTheme() {

  const theme =
    localStorage.getItem(
      "KRISHWAVE_THEME"
    );

  if (theme === "light") {

    document.body
      .classList.add("light");

    $("themeBtn").textContent =
      "☀️";

  }

}


function toggleTheme() {

  const light =
    document.body
      .classList.toggle("light");

  localStorage.setItem(
    "KRISHWAVE_THEME",
    light ? "light" : "dark"
  );

  $("themeBtn").textContent =
    light ? "☀️" : "🌙";

}


/* =========================================================
   MARKET
========================================================= */

function setMarket(market) {

  if (
    !CONFIG.MARKETS.includes(
      market
    )
  ) {

    market = "R_10";

  }


  state.market =
    market;

  state.ticks = [];

  state.tickCount = 0;

  state.price = 0;

  state.lastDigit = null;

  state.prediction = null;

  state.confidence = 0;


  if ($("marketSelect")) {

    $("marketSelect").value =
      market;

  }


  if ($("tradeMarket")) {

    $("tradeMarket").value =
      market;

  }


  $("marketName").textContent =
    market;

  $("signalMarket").textContent =
    market;

  $("livePrice").textContent =
    "0.00";

  $("tickCount").textContent =
    "0";

  $("confidence").textContent =
    "0%";

  $("signalConfidence").textContent =
    "0%";

  $("prediction").textContent =
    "—";

  $("cyclePrediction").textContent =
    "—";

  $("marketStatus").textContent =
    "WAITING";

  $("signalMessage").textContent =
    "Waiting for enough live ticks to analyze the market.";


  updateDigits();


  if (state.connected) {

    subscribeToMarket();

  }

}


function syncTradeMarket() {

  const value =
    $("tradeMarket").value;

  if (value) {

    setMarket(value);

  }

}


/* =========================================================
   DERIV PUBLIC WEBSOCKET
========================================================= */

function connectPublicWS() {

  if (state.ws) {

    try {

      state.ws.close();

    } catch {}

  }


  state.connecting =
    true;


  updateConnection(
    "CONNECTING"
  );


  try {

    state.ws =
      new WebSocket(
        CONFIG.PUBLIC_WS
      );


    state.ws.onopen =
      () => {

        state.connecting =
          false;

        state.connected =
          true;

        updateConnection(
          "ONLINE"
        );

        $("derivStatus").textContent =
          "DERIV LIVE";

        subscribeToMarket();

        toast(
          "Deriv market data connected"
        );

      };


    state.ws.onmessage =
      event => {

        handleWSMessage(
          event.data
        );

      };


    state.ws.onerror =
      error => {

        console.error(
          "WebSocket error:",
          error
        );

        updateConnection(
          "ERROR"
        );

      };


    state.ws.onclose =
      () => {

        state.connected =
          false;

        state.connecting =
          false;

        updateConnection(
          "OFFLINE"
        );

        $("derivStatus").textContent =
          "DERIV CONNECTION FAILED";

      };

  } catch (error) {

    console.error(
      error
    );

    state.connected =
      false;

    updateConnection(
      "OFFLINE"
    );

    $("derivStatus").textContent =
      "DERIV CONNECTION FAILED";

  }

}


/* =========================================================
   SUBSCRIBE MARKET
========================================================= */

function subscribeToMarket() {

  if (
    !state.ws ||
    state.ws.readyState !== WebSocket.OPEN
  ) {

    return;

  }


  const request = {

    ticks:
      state.market,

    subscribe:
      1

  };


  try {

    state.ws.send(
      JSON.stringify(
        request
      )
    );

  } catch (error) {

    console.error(
      error
    );

  }

}


/* =========================================================
   WEBSOCKET MESSAGE
========================================================= */

function handleWSMessage(raw) {

  let data;

  try {

    data =
      JSON.parse(raw);

  } catch {

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
   PROCESS TICK
========================================================= */

function processTick(tick) {

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


  state.price =
    quote;


  const priceText =
    String(
      quote
    );


  const clean =
    priceText
      .replace(
        /[^0-9]/g,
        ""
      );


  if (!clean) return;


  const digit =
    Number(
      clean[
        clean.length - 1
      ]
    );


  state.lastDigit =
    digit;


  state.ticks.push(
    {
      price: quote,
      digit,
      time: Date.now()
    }
  );


  if (
    state.ticks.length > 100
  ) {

    state.ticks.shift();

  }


  state.tickCount++;


  $("livePrice").textContent =
    quote.toFixed(
      Math.max(
        2,
        getDecimals(quote)
      )
    );


  $("tickCount").textContent =
    state.tickCount;


  analyzeMarket();

}


/* =========================================================
   DECIMALS
========================================================= */

function getDecimals(number) {

  const string =
    String(number);

  if (
    !string.includes(".")
  ) {

    return 2;

  }

  return Math.min(
    8,
    string.split(".")[1].length
  );

}


/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket() {

  if (
    state.ticks.length < 10
  ) {

    return;

  }


  const counts =
    Array(10).fill(0);


  state.ticks.forEach(
    tick => {

      counts[
        tick.digit
      ]++;

    }
  );


  const total =
    state.ticks.length;


  let highest =
    0;

  let prediction =
    0;


  counts.forEach(
    (count, digit) => {

      if (
        count > highest
      ) {

        highest =
          count;

        prediction =
          digit;

      }

    }
  );


  let confidence =
    Math.round(
      (
        highest /
        total
      ) * 100
    );


  /*
     Prevent the UI from pretending
     that a simple frequency model is
     certain.
  */

  confidence =
    Math.min(
      95,
      confidence
    );


  state.prediction =
    prediction;

  state.confidence =
    confidence;


  $("prediction").textContent =
    prediction;

  $("cyclePrediction").textContent =
    prediction;

  $("confidence").textContent =
    `${confidence}%`;

  $("signalConfidence").textContent =
    `${confidence}%`;


  $("marketStatus").textContent =
    confidence >= 60
      ? "STRONG"
      : confidence >= 45
        ? "MODERATE"
        : "WEAK";


  $("signalMessage").textContent =
    `Digit ${prediction} currently has the highest observed frequency in the recent tick sample.`;


  updateDigits();

}


/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function updateDigits() {

  const counts =
    Array(10).fill(0);


  state.ticks.forEach(
    tick => {

      counts[
        tick.digit
      ]++;

    }
  );


  const total =
    state.ticks.length;


  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    const percentage =
      total
        ? (
            counts[digit] /
            total
          ) * 100
        : 0;


    const element =
      $(
        `digit-${digit}`
      );


    if (element) {

      element.textContent =
        `${percentage.toFixed(1)}%`;

    }

  }

}


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnection(status) {

  const dot =
    $("connectionDot");

  const text =
    $("connectionText");


  dot.classList.remove(
    "online",
    "offline"
  );


  if (
    status === "ONLINE"
  ) {

    dot.classList.add(
      "online"
    );

    text.textContent =
      "ONLINE";

  } else {

    dot.classList.add(
      "offline"
    );

    text.textContent =
      status;

  }

}


/* =========================================================
   RAILWAY BACKEND
========================================================= */

async function backendRequest(
  path,
  options = {}
) {

  const response =
    await fetch(
      CONFIG.BACKEND + path,
      {
        ...options,

        headers: {
          "Content-Type":
            "application/json",

          ...(options.headers || {})
        }
      }
    );


  const data =
    await response.json()
      .catch(
        () => ({})
      );


  if (
    !response.ok
  ) {

    throw new Error(
      data.error ||
      `Backend error ${response.status}`
    );

  }


  return data;

}


/* =========================================================
   CONNECT DERIV
========================================================= */

async function connectDeriv() {

  if (
    CONFIG.BACKEND.includes(
      "YOUR-RAILWAY-DOMAIN"
    )
  ) {

    toast(
      "Set your Railway backend URL in app.js first."
    );

    connectPublicWS();

    return;

  }


  const button =
    $("connectBtn");


  button.disabled =
    true;

  button.textContent =
    "CONNECTING...";


  try {

    /*
       Open the Deriv OAuth authorization
       page.

       The backend does not receive the
       user's password.
    */

    const config =
      await backendRequest(
        "/api/config"
      );


    const verifier =
      generateVerifier();


    const challenge =
      await generateChallenge(
        verifier
      );


    sessionStorage.setItem(
      "KW_PKCE_VERIFIER",
      verifier
    );


    const params =
      new URLSearchParams({

        response_type:
          "code",

        client_id:
          config.client_id,

        redirect_uri:
          config.redirect_uri,

        code_challenge:
          challenge,

        code_challenge_method:
          "S256"

      });


    window.location.href =
      `https://auth.deriv.com/oauth2/auth?${params.toString()}`;

  } catch (error) {

    console.error(
      error
    );

    toast(
      "OAuth connection failed. Starting public market connection."
    );

    connectPublicWS();

  } finally {

    button.disabled =
      false;

    button.textContent =
      "CONNECT DERIV";

  }

}


/* =========================================================
   PKCE
========================================================= */

function generateVerifier() {

  const bytes =
    new Uint8Array(
      32
    );

  crypto
    .getRandomValues(
      bytes
    );


  return base64Url(
    bytes
  );

}


async function generateChallenge(
  verifier
) {

  const data =
    new TextEncoder()
      .encode(
        verifier
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


function base64Url(bytes) {

  let binary =
    "";

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
   OAUTH CALLBACK
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


  if (!code) {

    return false;

  }


  const verifier =
    sessionStorage.getItem(
      "KW_PKCE_VERIFIER"
    );


  if (!verifier) {

    toast(
      "PKCE verifier missing."
    );

    return false;

  }


  try {

    $("derivStatus").textContent =
      "AUTHENTICATING...";


    const result =
      await backendRequest(
        "/api/oauth/exchange",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              code,
              code_verifier:
                verifier
            })
        }
      );


    state.sessionId =
      result.session_id;


    localStorage.setItem(
      CONFIG.SESSION_KEY,
      state.sessionId
    );


    sessionStorage.removeItem(
      "KW_PKCE_VERIFIER"
    );


    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );


    await loadAccounts();


    return true;

  } catch (error) {

    console.error(
      error
    );

    $("derivStatus").textContent =
      "DERIV CONNECTION FAILED";

    toast(
      error.message
    );

    return false;

  }

}


/* =========================================================
   LOAD ACCOUNTS
========================================================= */

async function loadAccounts() {

  if (
    !state.sessionId
  ) {

    return;

  }


  try {

    const result =
      await backendRequest(
        "/api/accounts",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              session_id:
                state.sessionId
            })
        }
      );


    const accounts =
      result.accounts || [];


    const account =
      Array.isArray(accounts)
        ? accounts[0]
        : accounts;


    if (account) {

      state.account =
        account;


      localStorage.setItem(
        CONFIG.ACCOUNT_KEY,
        JSON.stringify(
          account
        )
      );


      updateAccountUI(
        account
      );

    }


    $("derivStatus").textContent =
      "DERIV CONNECTED";


    updateConnection(
      "ONLINE"
    );


    connectPublicWS();


  } catch (error) {

    console.error(
      error
    );

    $("derivStatus").textContent =
      "DERIV CONNECTION FAILED";


    updateConnection(
      "OFFLINE"
    );


    /*
       Even if authenticated account
       retrieval fails, public market data
       can still be used.
    */

    connectPublicWS();

  }

}


/* =========================================================
   ACCOUNT UI
========================================================= */

function updateAccountUI(account) {

  const loginid =
    account.loginid ||
    account.account_id ||
    account.id ||
    "CONNECTED";


  const currency =
    account.currency ||
    "USD";


  const balance =
    Number(
      account.balance
    );


  $("accountId").textContent =
    loginid;


  $("currency").textContent =
    currency;


  if (
    Number.isFinite(
      balance
    )
  ) {

    $("balance").textContent =
      `$${balance.toFixed(2)}`;

  }

}


/* =========================================================
   SAVED SESSION
========================================================= */

async function checkSavedSession() {

  const callbackHandled =
    await handleOAuthCallback();


  if (
    callbackHandled
  ) {

    return;

  }


  const savedAccount =
    localStorage.getItem(
      CONFIG.ACCOUNT_KEY
    );


  if (savedAccount) {

    try {

      const account =
        JSON.parse(
          savedAccount
        );

      updateAccountUI(
        account
      );

    } catch {}

  }


  /*
     Always start public market data.
  */

  connectPublicWS();


  if (
    state.sessionId
  ) {

    try {

      const result =
        await backendRequest(
          "/api/session",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                session_id:
                  state.sessionId
              })
          }
        );


      if (
        result.valid
      ) {

        await loadAccounts();

      }

    } catch {

      localStorage.removeItem(
        CONFIG.SESSION_KEY
      );

      state.sessionId =
        null;

    }

  }

}


/* =========================================================
   CIRCULAR AI
========================================================= */

function startCircularAI() {

  if (
    state.circularAI
  ) {

    toast(
      "Circular AI is already running."
    );

    return;

  }


  state.circularAI =
    true;


  state.cycle =
    "ANALYZING";


  $("aiState").textContent =
    "RUNNING";


  $("aiState").style.color =
    "var(--green)";


  runCycle();


  state.cycleInterval =
    setInterval(
      runCycle,
      18000
    );


  toast(
    "Circular AI started"
  );

}


function stopCircularAI() {

  state.circularAI =
    false;


  clearInterval(
    state.cycleInterval
  );


  clearInterval(
    state.analysisInterval
  );


  state.cycleInterval =
    null;

  state.analysisInterval =
    null;


  state.cycle =
    "READY";


  state.cycleTimer =
    10;


  $("aiState").textContent =
    "STOPPED";


  $("aiState").style.color =
    "var(--red)";


  $("cycleStatus").textContent =
    "READY";

  $("cycleTimer").textContent =
    "10";


  toast(
    "Circular AI stopped"
  );

}


function runCycle() {

  if (
    !state.circularAI
  ) {

    return;

  }


  /*
     Phase 1
     10 seconds analysis
  */

  countdown(
    10,
    "ANALYZING",
    () => {

      /*
         Phase 2
         5 second trade window
      */

      if (
        !state.circularAI
      ) return;


      countdown(
        5,
        "TRADE WINDOW",
        () => {

          if (
            !state.circularAI
          ) return;


          /*
             Phase 3
             3 second TRADE NOW signal
          */

          countdown(
            3,
            "TRADE NOW",
            () => {

              if (
                !state.circularAI
              ) return;


              $("cycleStatus")
                .textContent =
                "NEXT CYCLE";

            }
          );

        }
      );

    }
  );

}


function countdown(
  seconds,
  status,
  finished
) {

  clearInterval(
    state.analysisInterval
  );


  state.cycle =
    status;

  state.cycleTimer =
    seconds;


  $("cycleStatus").textContent =
    status;


  $("cycleTimer").textContent =
    seconds;


  if (
    status ===
    "TRADE NOW"
  ) {

    $("cyclePrediction").textContent =
      state.prediction ?? "—";

  }


  state.analysisInterval =
    setInterval(
      () => {

        if (
          !state.circularAI
        ) {

          clearInterval(
            state.analysisInterval
          );

          return;

        }


        seconds--;

        state.cycleTimer =
          seconds;


        $("cycleTimer").textContent =
          seconds;


        if (
          seconds <= 0
        ) {

          clearInterval(
            state.analysisInterval
          );

          finished();

        }

      },
      1000
    );

}


/* =========================================================
   PAPER TRADING
========================================================= */

function executePaperTrade() {

  let stake =
    Number(
      $("stake").value
    );


  if (
    !Number.isFinite(
      stake
    ) ||
    stake < CONFIG.MIN_STAKE
  ) {

    stake =
      CONFIG.MIN_STAKE;

    $("stake").value =
      stake;

  }


  if (
    stake > state.balance
  ) {

    toast(
      "Insufficient paper balance."
    );

    return;

  }


  const market =
    $("tradeMarket").value;


  const strategy =
    $("strategy").value;


  let digit =
    Number(
      $("tradeDigit").value
    );


  if (
    !Number.isInteger(
      digit
    ) ||
    digit < 0 ||
    digit > 9
  ) {

    digit =
      state.prediction ??
      5;

  }


  /*
     Simulate outcome.

     This is deliberately PAPER ONLY.
  */

  const result =
    simulateTrade(
      strategy,
      digit
    );


  const multiplier =
    getMultiplier(
      strategy
    );


  const profit =
    result.win
      ? stake * multiplier
      : -stake;


  state.balance +=
    profit;


  const trade = {

    id:
      Date.now(),

    time:
      new Date().toISOString(),

    market,

    strategy,

    digit,

    stake,

    result:
      result.win
        ? "WIN"
        : "LOSS",

    profit

  };


  state.history.unshift(
    trade
  );


  saveState();


  renderHistory();

  updateBalanceUI();


  $("tradeMessage").textContent =
    result.win
      ? `PAPER WIN: +$${profit.toFixed(2)}`
      : `PAPER LOSS: -$${stake.toFixed(2)}`;


  toast(
    result.win
      ? "Paper trade WIN"
      : "Paper trade LOSS"
  );

}


function simulateTrade(
  strategy,
  prediction
) {

  const randomDigit =
    Math.floor(
      Math.random() * 10
    );


  let win;


  switch (
    strategy
  ) {

    case "MATCHES":

      win =
        randomDigit === prediction;

      break;


    case "DIFFERS":

      win =
        randomDigit !== prediction;

      break;


    case "OVER":

      win =
        randomDigit > prediction;

      break;


    case "UNDER":

      win =
        randomDigit < prediction;

      break;


    case "EVEN":

      win =
        randomDigit % 2 === 0;

      break;


    case "ODD":

      win =
        randomDigit % 2 !== 0;

      break;


    default:

      win = false;

  }


  return {

    win,

    actual:
      randomDigit

  };

}


function getMultiplier(
  strategy
) {

  switch (
    strategy
  ) {

    case "MATCHES":
      return 8.5;

    case "DIFFERS":
      return 0.09;

    case "OVER":
    case "UNDER":
    case "EVEN":
    case "ODD":
      return 0.95;

    default:
      return 0.95;

  }

}


/* =========================================================
   BALANCE
========================================================= */

function updateBalanceUI() {

  localStorage.setItem(
    CONFIG.BALANCE_KEY,
    state.balance
  );


  const formatted =
    `$${state.balance.toFixed(2)}`;


  $("tradeBalance").textContent =
    formatted;


  if (
    !state.account
  ) {

    $("balance").textContent =
      formatted;

  }

}


/* =========================================================
   STAKE PREVIEW
========================================================= */

function updateStakePreview() {

  let stake =
    Number(
      $("stake").value
    );


  if (
    !Number.isFinite(
      stake
    )
  ) {

    stake =
      CONFIG.MIN_STAKE;

  }


  $("tradeStake").textContent =
    `$${stake.toFixed(2)}`;

}


/* =========================================================
   HISTORY
========================================================= */

function saveState() {

  localStorage.setItem(
    CONFIG.HISTORY_KEY,
    JSON.stringify(
      state.history
    )
  );


  localStorage.setItem(
    CONFIG.BALANCE_KEY,
    state.balance
  );

}


function renderHistory() {

  const list =
    $("historyList");


  if (!list) return;


  const history =
    state.history;


  const total =
    history.length;


  const wins =
    history.filter(
      trade =>
        trade.result === "WIN"
    ).length;


  const losses =
    history.filter(
      trade =>
        trade.result === "LOSS"
    ).length;


  const pnl =
    history.reduce(
      (
        total,
        trade
      ) =>
        total +
        Number(
          trade.profit || 0
        ),
      0
    );


  $("totalTrades").textContent =
    total;


  $("wins").textContent =
    wins;


  $("losses").textContent =
    losses;


  $("profitLoss").textContent =
    `$${pnl.toFixed(2)}`;


  if (
    !history.length
  ) {

    list.innerHTML = `

      <div class="empty-history">
        No paper trades yet.
      </div>

    `;

    return;

  }


  list.innerHTML =
    history
      .slice(
        0,
        100
      )
      .map(
        trade => {

          const date =
            new Date(
              trade.time
            ).toLocaleString();


          const resultClass =
            trade.result === "WIN"
              ? "win"
              : "loss";


          const sign =
            Number(
              trade.profit
            ) >= 0
              ? "+"
              : "";


          return `

            <div class="history-item">

              <div>

                <strong>
                  ${escapeHTML(
                    trade.market
                  )}
                  ·
                  ${escapeHTML(
                    trade.strategy
                  )}
                </strong>

                <small>
                  Digit ${trade.digit}
                  ·
                  Stake $${Number(
                    trade.stake
                  ).toFixed(2)}
                  ·
                  ${date}
                </small>

              </div>

              <div class="${resultClass}">

                <strong>
                  ${trade.result}
                </strong>

                <small>
                  ${sign}$${Math.abs(
                    Number(
                      trade.profit
                    )
                  ).toFixed(2)}
                </small>

              </div>

            </div>

          `;

        }
      )
      .join("");

}


function clearHistory() {

  if (
    !confirm(
      "Clear all paper trading history?"
    )
  ) {

    return;

  }


  state.history =
    [];

  saveState();

  renderHistory();

  toast(
    "History cleared"
  );

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(
  value
) {

  return String(
    value
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
   STARTUP
========================================================= */

updateStakePreview();

console.log(
  "KRISHWAVE V7.3 frontend loaded"
);