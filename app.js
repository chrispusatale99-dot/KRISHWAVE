/* =========================================================
   KRISHWAVE AI BEAST V5.9
   DERIV DEMO OAUTH + LIVE MARKET INTELLIGENCE

   FRONTEND
   ---------------------------------------------------------
   GitHub Pages:
   https://chrispusatale99-dot.github.io/KRISHWAVE/

   CLOUDFLARE BACKEND
   ---------------------------------------------------------
   https://krishwave-oauth.chrispusatale99.workers.dev

   FEATURES
   ---------------------------------------------------------
   - Deriv OAuth 2.0 + PKCE
   - Cloudflare Worker token exchange
   - Demo account discovery
   - Demo account authenticated WebSocket
   - Live balance
   - Live Deriv market data
   - Volatility market scanner
   - Digit analysis
   - Even / Odd
   - High / Low
   - Over / Under
   - Matches / Differs
   - Manual number entry remains MANUAL
   - AI market selector
   - 10 second analysis
   - 5 second fixed prediction
   - 3 second TRADE NOW signal
   - Paper signal tracking
   - History
   - Dark / Light mode
   - Mobile friendly
========================================================= */


/* =========================================================
   CONFIGURATION
========================================================= */

const DERIV_CLIENT_ID =
  "019f9f77-0282-7ee4-8c64-c0ac3e80dfad";

const REDIRECT_URI =
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const OAUTH_BACKEND =
  "https://krishwave-oauth.chrispusatale99.workers.dev";

const DERIV_API =
  "https://api.derivws.com";

const PUBLIC_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";


/* =========================================================
   MARKETS
========================================================= */

const MARKETS = [
  {
    symbol: "R_10",
    name: "Volatility 10",
    category: "Volatility"
  },
  {
    symbol: "R_25",
    name: "Volatility 25",
    category: "Volatility"
  },
  {
    symbol: "R_50",
    name: "Volatility 50",
    category: "Volatility"
  },
  {
    symbol: "R_75",
    name: "Volatility 75",
    category: "Volatility"
  },
  {
    symbol: "R_100",
    name: "Volatility 100",
    category: "Volatility"
  },

  {
    symbol: "1HZ10V",
    name: "Volatility 10 (1s)",
    category: "1 Second"
  },
  {
    symbol: "1HZ25V",
    name: "Volatility 25 (1s)",
    category: "1 Second"
  },
  {
    symbol: "1HZ30V",
    name: "Volatility 30 (1s)",
    category: "1 Second"
  },
  {
    symbol: "1HZ50V",
    name: "Volatility 50 (1s)",
    category: "1 Second"
  },
  {
    symbol: "1HZ75V",
    name: "Volatility 75 (1s)",
    category: "1 Second"
  },
  {
    symbol: "1HZ90V",
    name: "Volatility 90 (1s)",
    category: "1 Second"
  },
  {
    symbol: "1HZ100V",
    name: "Volatility 100 (1s)",
    category: "1 Second"
  },
  {
    symbol: "1HZ150V",
    name: "Volatility 150 (1s)",
    category: "1 Second"
  },
  {
    symbol: "1HZ250V",
    name: "Volatility 250 (1s)",
    category: "1 Second"
  },
  {
    symbol: "1HZ1000V",
    name: "Volatility 1000 (1s)",
    category: "1 Second"
  }
];


/* =========================================================
   STATE
========================================================= */

let publicWS = null;
let demoWS = null;

let derivAccessToken = null;
let derivAccountId = null;
let derivCurrency = "USD";

let authenticated = false;
let aiRunning = false;

let currentMarket =
  localStorage.getItem("krishwave_market") ||
  MARKETS[0].symbol;

let currentStrategy =
  localStorage.getItem("krishwave_strategy") ||
  "MATCHES";

let currentPrediction = null;

let marketData = {};

let analysisTimer = null;
let predictionTimer = null;
let tradeTimer = null;

let analysisRemaining = 10;
let predictionRemaining = 5;
let tradeRemaining = 3;

let cycleNumber = 0;

let paperSignals = [];

let history =
  JSON.parse(
    localStorage.getItem("krishwave_history") || "[]"
  );


/* =========================================================
   ELEMENT HELPER
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}

function setHTML(id, value) {
  const el = $(id);

  if (el) {
    el.innerHTML = value;
  }
}


/* =========================================================
   SAFE DOM CLASS HELPERS
========================================================= */

function addClass(id, className) {
  const el = $(id);

  if (el) {
    el.classList.add(className);
  }
}

function removeClass(id, className) {
  const el = $(id);

  if (el) {
    el.classList.remove(className);
  }
}


/* =========================================================
   STATUS
========================================================= */

function setConnectionStatus(
  connected,
  text = null
) {

  setText(
    "connectionText",
    text ||
      (connected
        ? "CONNECTED"
        : "DISCONNECTED")
  );

  const dot = $("connectionDot");

  if (dot) {

    dot.classList.toggle(
      "connected",
      connected
    );

    dot.classList.toggle(
      "offline",
      !connected
    );
  }

  setText(
    "heroLiveText",
    connected
      ? "DERIV LIVE"
      : "WAITING"
  );

  const heroDot = $("heroLiveDot");

  if (heroDot) {

    heroDot.classList.toggle(
      "connected",
      connected
    );
  }
}


/* =========================================================
   ACCOUNT STATUS
========================================================= */

function updateAccountUI() {

  if (authenticated) {

    setText(
      "authStatus",
      "DEMO CONNECTED"
    );

    setText(
      "derivAuthConnection",
      "CONNECTED"
    );

    setText(
      "derivAccountId",
      derivAccountId || "DEMO"
    );

    setText(
      "derivCurrency",
      derivCurrency || "USD"
    );

    setText(
      "accountMode",
      "DEMO"
    );

    setText(
      "demoModeBtn",
      "DEMO ACTIVE"
    );

  } else {

    setText(
      "authStatus",
      "NOT CONNECTED"
    );

    setText(
      "derivAuthConnection",
      "NOT CONNECTED"
    );

    setText(
      "derivAccountId",
      "—"
    );

    setText(
      "derivCurrency",
      "USD"
    );

    setText(
      "accountMode",
      "DEMO"
    );
  }
}


/* =========================================================
   OAUTH PKCE
========================================================= */

function randomString(length = 64) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  let result = "";

  const values =
    new Uint8Array(length);

  crypto.getRandomValues(values);

  for (let i = 0; i < length; i++) {

    result +=
      chars[
        values[i] % chars.length
      ];
  }

  return result;
}


function base64UrlEncode(buffer) {

  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


async function createCodeChallenge(
  verifier
) {

  const data =
    new TextEncoder().encode(
      verifier
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return base64UrlEncode(
    digest
  );
}


/* =========================================================
   CONNECT DERIV
========================================================= */

async function connectDeriv() {

  try {

    setConnectionStatus(
      false,
      "OPENING DERIV LOGIN..."
    );

    const codeVerifier =
      randomString(64);

    const state =
      randomString(32);

    const codeChallenge =
      await createCodeChallenge(
        codeVerifier
      );

    sessionStorage.setItem(
      "krishwave_code_verifier",
      codeVerifier
    );

    sessionStorage.setItem(
      "krishwave_oauth_state",
      state
    );

    const params =
      new URLSearchParams({

        response_type: "code",

        client_id:
          DERIV_CLIENT_ID,

        redirect_uri:
          REDIRECT_URI,

        scope: "trade",

        state: state,

        code_challenge:
          codeChallenge,

        code_challenge_method:
          "S256"
      });

    const authURL =
      "https://auth.deriv.com/oauth2/auth?" +
      params.toString();

    window.location.href =
      authURL;

  } catch (error) {

    console.error(
      "OAuth start error:",
      error
    );

    setConnectionStatus(
      false,
      "OAUTH ERROR"
    );
  }
}


/* =========================================================
   HANDLE OAUTH CALLBACK
========================================================= */

async function handleOAuthCallback() {

  const url =
    new URL(
      window.location.href
    );

  const code =
    url.searchParams.get(
      "code"
    );

  const state =
    url.searchParams.get(
      "state"
    );

  const error =
    url.searchParams.get(
      "error"
    );

  if (error) {

    console.error(
      "Deriv OAuth error:",
      error
    );

    setConnectionStatus(
      false,
      "LOGIN CANCELLED"
    );

    cleanOAuthURL();

    return;
  }

  if (!code) {
    return;
  }

  const savedState =
    sessionStorage.getItem(
      "krishwave_oauth_state"
    );

  const codeVerifier =
    sessionStorage.getItem(
      "krishwave_code_verifier"
    );

  if (!savedState || !codeVerifier) {

    setConnectionStatus(
      false,
      "PKCE DATA MISSING"
    );

    return;
  }

  if (state !== savedState) {

    setConnectionStatus(
      false,
      "STATE ERROR"
    );

    console.error(
      "OAuth state mismatch"
    );

    return;
  }

  try {

    setConnectionStatus(
      false,
      "AUTHORIZING..."
    );

    const response =
      await fetch(
        OAUTH_BACKEND,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              code: code,
              code_verifier:
                codeVerifier
            })
        }
      );

    const data =
      await response.json();

    if (!response.ok ||
        !data.success ||
        !data.access_token) {

      throw new Error(
        data.error ||
        "Token exchange failed"
      );
    }

    derivAccessToken =
      data.access_token;

    sessionStorage.setItem(
      "krishwave_access_token",
      derivAccessToken
    );

    sessionStorage.setItem(
      "krishwave_token_expiry",
      String(
        Date.now() +
        ((data.expires_in || 3600) * 1000)
      )
    );

    cleanOAuthURL();

    await loadDerivAccounts();

  } catch (error) {

    console.error(
      "OAuth callback error:",
      error
    );

    setConnectionStatus(
      false,
      "OAUTH FAILED"
    );
  }
}


/* =========================================================
   CLEAN CALLBACK URL
========================================================= */

function cleanOAuthURL() {

  const cleanURL =
    window.location.origin +
    window.location.pathname;

  window.history.replaceState(
    {},
    document.title,
    cleanURL
  );

  sessionStorage.removeItem(
    "krishwave_oauth_state"
  );

  sessionStorage.removeItem(
    "krishwave_code_verifier"
  );
}


/* =========================================================
   REST REQUEST HELPER
========================================================= */

async function derivFetch(
  path,
  options = {}
) {

  if (!derivAccessToken) {

    throw new Error(
      "Not authenticated"
    );
  }

  const headers = {

    ...(options.headers || {}),

    Authorization:
      `Bearer ${derivAccessToken}`,

    Accept:
      "application/json"
  };

  return fetch(
    DERIV_API + path,
    {
      ...options,
      headers
    }
  );
}


/* =========================================================
   LOAD OPTIONS ACCOUNTS
========================================================= */

async function loadDerivAccounts() {

  try {

    setConnectionStatus(
      false,
      "LOADING DEMO ACCOUNT..."
    );

    const response =
      await derivFetch(
        "/trading/v1/options/accounts"
      );

    const result =
      await response.json();

    if (!response.ok) {

      throw new Error(
        extractDerivError(
          result
        )
      );
    }

    const raw =
      result.data;

    const accounts =
      Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.accounts)
          ? raw.accounts
          : raw
            ? [raw]
            : [];

    const demo =
      accounts.find(
        account =>
          String(
            account.account_type ||
            account.type ||
            ""
          ).toLowerCase() ===
          "demo"
      );

    if (!demo) {

      throw new Error(
        "No Options demo account found"
      );
    }

    derivAccountId =
      demo.account_id ||
      demo.id;

    derivCurrency =
      demo.currency ||
      "USD";

    authenticated = true;

    updateAccountUI();

    await requestDemoOTP();

  } catch (error) {

    console.error(
      "Account loading error:",
      error
    );

    authenticated = false;

    updateAccountUI();

    setConnectionStatus(
      false,
      "ACCOUNT ERROR"
    );
  }
}


/* =========================================================
   ERROR EXTRACTION
========================================================= */

function extractDerivError(
  result
) {

  if (!result) {
    return "Unknown Deriv error";
  }

  if (result.error) {
    return String(
      result.error.message ||
      result.error
    );
  }

  if (Array.isArray(result.errors)) {

    return result.errors
      .map(
        item =>
          item.message ||
          item.code ||
          "Error"
      )
      .join(", ");
  }

  return (
    result.message ||
    "Deriv request failed"
  );
}


/* =========================================================
   REQUEST DEMO OTP
========================================================= */

async function requestDemoOTP() {

  if (!derivAccountId) {

    throw new Error(
      "Missing demo account ID"
    );
  }

  try {

    setConnectionStatus(
      false,
      "AUTHENTICATING DEMO..."
    );

    const response =
      await derivFetch(
        `/trading/v1/options/accounts/${encodeURIComponent(
          derivAccountId
        )}/otp`,
        {
          method: "POST"
        }
      );

    const result =
      await response.json();

    if (!response.ok) {

      throw new Error(
        extractDerivError(
          result
        )
      );
    }

    const wsURL =
      result?.data?.url;

    if (!wsURL) {

      throw new Error(
        "Deriv did not return a WebSocket URL"
      );
    }

    connectDemoWebSocket(
      wsURL
    );

  } catch (error) {

    console.error(
      "OTP error:",
      error
    );

    setConnectionStatus(
      false,
      "DEMO AUTH FAILED"
    );
  }
}


/* =========================================================
   CONNECT AUTHENTICATED DEMO WEBSOCKET
========================================================= */

function connectDemoWebSocket(
  wsURL
) {

  if (demoWS) {

    try {
      demoWS.close();
    } catch {}
  }

  demoWS =
    new WebSocket(
      wsURL
    );

  demoWS.onopen =
    function () {

      authenticated = true;

      setConnectionStatus(
        true,
        "DEMO CONNECTED"
      );

      updateAccountUI();

      requestDemoBalance();

      console.log(
        "KRISHWAVE authenticated Demo WebSocket connected."
      );
    };

  demoWS.onmessage =
    function (event) {

      try {

        const message =
          JSON.parse(
            event.data
          );

        handleDemoMessage(
          message
        );

      } catch (error) {

        console.error(
          "Demo message error:",
          error
        );
      }
    };

  demoWS.onerror =
    function (error) {

      console.error(
        "Demo WebSocket error:",
        error
      );

      setConnectionStatus(
        false,
        "DEMO SOCKET ERROR"
      );
    };

  demoWS.onclose =
    function () {

      console.log(
        "Demo WebSocket closed"
      );

      setConnectionStatus(
        false,
        "DEMO DISCONNECTED"
      );
    };
}


/* =========================================================
   DEMO BALANCE
========================================================= */

function requestDemoBalance() {

  if (
    !demoWS ||
    demoWS.readyState !==
      WebSocket.OPEN
  ) {

    return;
  }

  demoWS.send(
    JSON.stringify({
      balance: 1,
      subscribe: 1
    })
  );
}


/* =========================================================
   DEMO MESSAGE HANDLER
========================================================= */

function handleDemoMessage(
  message
) {

  if (message.error) {

    console.error(
      "Deriv account error:",
      message.error
    );

    return;
  }

  if (message.msg_type === "balance") {

    const balance =
      message.balance;

    if (!balance) {
      return;
    }

    const amount =
      Number(
        balance.balance
      );

    const currency =
      balance.currency ||
      derivCurrency ||
      "USD";

    derivCurrency =
      currency;

    if (
      Number.isFinite(amount)
    ) {

      setText(
        "balance",
        `${amount.toFixed(2)} ${currency}`
      );

      setText(
        "accountBalance",
        `${amount.toFixed(2)} ${currency}`
      );
    }

    setText(
      "derivCurrency",
      currency
    );
  }
}


/* =========================================================
   DISCONNECT DERIV
========================================================= */

function disconnectDeriv() {

  if (demoWS) {

    try {
      demoWS.close();
    } catch {}

    demoWS = null;
  }

  derivAccessToken =
    null;

  derivAccountId =
    null;

  authenticated =
    false;

  sessionStorage.removeItem(
    "krishwave_access_token"
  );

  sessionStorage.removeItem(
    "krishwave_token_expiry"
  );

  updateAccountUI();

  setConnectionStatus(
    false,
    "DISCONNECTED"
  );
}


/* =========================================================
   RESTORE SESSION
========================================================= */

async function restoreSession() {

  const token =
    sessionStorage.getItem(
      "krishwave_access_token"
    );

  const expiry =
    Number(
      sessionStorage.getItem(
        "krishwave_token_expiry"
      ) || 0
    );

  if (
    token &&
    expiry &&
    Date.now() < expiry
  ) {

    derivAccessToken =
      token;

    try {

      await loadDerivAccounts();

      return true;

    } catch {
      disconnectDeriv();
    }
  }

  return false;
}


/* =========================================================
   PUBLIC MARKET DATA
========================================================= */

function connectPublicMarket() {

  if (publicWS) {

    try {
      publicWS.close();
    } catch {}
  }

  publicWS =
    new WebSocket(
      PUBLIC_WS
    );

  publicWS.onopen =
    function () {

      console.log(
        "KRISHWAVE public market WebSocket connected."
      );

      setText(
        "dataStatus",
        "DERIV LIVE"
      );

      subscribeMarkets();
    };

  publicWS.onmessage =
    function (event) {

      try {

        const message =
          JSON.parse(
            event.data
          );

        handlePublicMessage(
          message
        );

      } catch (error) {

        console.error(
          "Public message error:",
          error
        );
      }
    };

  publicWS.onerror =
    function (error) {

      console.error(
        "Public market error:",
        error
      );

      setText(
        "dataStatus",
        "DATA ERROR"
      );
    };

  publicWS.onclose =
    function () {

      console.log(
        "Public market WebSocket closed."
      );

      setText(
        "dataStatus",
        "RECONNECTING..."
      );

      setTimeout(
        connectPublicMarket,
        3000
      );
    };
}


/* =========================================================
   SUBSCRIBE MARKETS
========================================================= */

function subscribeMarkets() {

  if (
    !publicWS ||
    publicWS.readyState !==
      WebSocket.OPEN
  ) {

    return;
  }

  MARKETS.forEach(
    market => {

      publicWS.send(
        JSON.stringify({
          ticks: market.symbol,
          subscribe: 1
        })
      );

    }
  );
}


/* =========================================================
   HANDLE PUBLIC TICK
========================================================= */

function handlePublicMessage(
  message
) {

  if (message.error) {

    console.warn(
      "Market error:",
      message.error
    );

    return;
  }

  if (
    message.msg_type !==
    "tick"
  ) {

    return;
  }

  const tick =
    message.tick;

  if (!tick) {
    return;
  }

  const symbol =
    tick.symbol;

  if (!symbol) {
    return;
  }

  const quote =
    Number(
      tick.quote
    );

  const epoch =
    Number(
      tick.epoch
    );

  if (
    !Number.isFinite(quote)
  ) {

    return;
  }

  if (!marketData[symbol]) {

    marketData[symbol] = {

      symbol,

      ticks: [],

      lastQuote: null,

      lastEpoch: null,

      digitCounts:
        Array(10).fill(0),

      totalTicks: 0
    };
  }

  const data =
    marketData[symbol];

  data.lastQuote =
    quote;

  data.lastEpoch =
    epoch;

  const digit =
    getLastDigit(
      quote
    );

  data.ticks.push({
    quote,
    epoch,
    digit
  });

  data.digitCounts[digit]++;

  data.totalTicks++;

  if (
    data.ticks.length > 300
  ) {

    const removed =
      data.ticks.shift();

    data.digitCounts[
      removed.digit
    ]--;

    data.totalTicks--;
  }

  renderMarketTicker(
    symbol
  );

  renderDigits(
    symbol
  );
}


/* =========================================================
   LAST DIGIT
========================================================= */

function getLastDigit(
  quote
) {

  const text =
    Number(
      quote
    ).toFixed(2);

  const digits =
    text.replace(
      /\D/g,
      ""
    );

  return Number(
    digits.slice(-1)
  );
}


/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket(
  symbol
) {

  const data =
    marketData[symbol];

  if (
    !data ||
    data.ticks.length < 10
  ) {

    return {
      ready: false,
      score: 0,
      confidence: 0,
      prediction: 0,
      strategy: currentStrategy
    };
  }

  const ticks =
    data.ticks;

  const counts =
    data.digitCounts;

  const total =
    ticks.length;

  let maxDigit = 0;
  let minDigit = 0;

  for (
    let d = 1;
    d < 10;
    d++
  ) {

    if (
      counts[d] >
      counts[maxDigit]
    ) {

      maxDigit = d;
    }

    if (
      counts[d] <
      counts[minDigit]
    ) {

      minDigit = d;
    }
  }

  const highest =
    Math.max(
      ...counts
    );

  const lowest =
    Math.min(
      ...counts
    );

  const concentration =
    total > 0
      ? highest / total
      : 0;

  const average =
    counts.reduce(
      (
        sum,
        value
      ) =>
        sum + value,
      0
    ) / 10;

  const deviation =
    counts.reduce(
      (
        sum,
        value
      ) =>
        sum +
        Math.pow(
          value -
          average,
          2
        ),
      0
    ) / 10;

  const stability =
    Math.max(
      0,
      Math.min(
        100,
        100 -
        Math.sqrt(
          deviation
        ) * 5
      )
    );

  let streak =
    1;

  const lastDigit =
    ticks[
      ticks.length - 1
    ].digit;

  for (
    let i =
      ticks.length - 2;
    i >= 0;
    i--
  ) {

    if (
      ticks[i].digit ===
      lastDigit
    ) {

      streak++;

    } else {

      break;
    }
  }

  let even = 0;
  let odd = 0;

  let over = 0;
  let under = 0;

  for (
    const tick of ticks
  ) {

    if (
      tick.digit % 2 === 0
    ) {

      even++;

    } else {

      odd++;
    }

    if (
      tick.digit >= 5
    ) {

      over++;

    } else {

      under++;
    }
  }

  const evenRate =
    even / total;

  const oddRate =
    odd / total;

  const overRate =
    over / total;

  const underRate =
    under / total;

  const parityEdge =
    Math.max(
      evenRate,
      oddRate
    );

  const overUnderEdge =
    Math.max(
      overRate,
      underRate
    );

  let prediction =
    maxDigit;

  let strategy =
    currentStrategy;

  switch (
    String(
      currentStrategy
    ).toUpperCase()
  ) {

    case "MATCHES":

      prediction =
        maxDigit;

      break;

    case "DIFFERS":

      prediction =
        minDigit;

      break;

    case "EVEN":

      prediction =
        evenRate >=
        oddRate
          ? 2
          : 3;

      break;

    case "ODD":

      prediction =
        oddRate >=
        evenRate
          ? 3
          : 2;

      break;

    case "OVER":

      prediction =
        Math.max(
          6,
          maxDigit
        );

      break;

    case "UNDER":

      prediction =
        Math.min(
          4,
          minDigit
        );

      break;

    default:

      prediction =
        maxDigit;
  }

  const frequencyScore =
    concentration * 100;

  const score =
    Math.min(
      100,
      Math.round(
        frequencyScore * 0.45 +
        stability * 0.25 +
        parityEdge * 100 * 0.15 +
        overUnderEdge * 100 * 0.15
      )
    );

  const confidence =
    Math.min(
      99,
      Math.max(
        50,
        Math.round(
          score
        )
      )
    );

  return {

    ready: true,

    score,

    confidence,

    prediction,

    strategy,

    concentration:
      Math.round(
        concentration * 100
      ),

    stability:
      Math.round(
        stability
      ),

    streak,

    evenRate:
      Math.round(
        evenRate * 100
      ),

    oddRate:
      Math.round(
        oddRate * 100
      ),

    overRate:
      Math.round(
        overRate * 100
      ),

    underRate:
      Math.round(
        underRate * 100
      ),

    maxDigit,

    minDigit
  };
}


/* =========================================================
   SCAN MARKETS
========================================================= */

function scanMarkets() {

  const results =
    MARKETS.map(
      market => {

        const analysis =
          analyzeMarket(
            market.symbol
          );

        return {

          ...market,

          ...analysis
        };
      }
    );

  results.sort(
    (
      a,
      b
    ) =>
      b.score -
      a.score
  );

  renderMarketScanner(
    results
  );

  const ready =
    results.filter(
      result =>
        result.ready
    ).length;

  setText(
    "marketScanStatus",
    `${ready}/${MARKETS.length} MARKETS READY`
  );

  return results;
}


/* =========================================================
   RENDER MARKET SCANNER
========================================================= */

function renderMarketScanner(
  results
) {

  const container =
    $("tradeMarkets");

  if (!container) {
    return;
  }

  container.innerHTML =
    results
      .map(
        result => {

          const good =
            result.ready &&
            result.score >= 65;

          const selected =
            result.symbol ===
            currentMarket;

          return `

            <button
              class="trade-market-card ${
                selected
                  ? "selected"
                  : ""
              }"
              data-symbol="${
                result.symbol
              }"
              type="button"
            >

              <div class="trade-market-name">
                ${
                  result.name
                }
              </div>

              <div class="trade-market-score">
                ${
                  result.ready
                    ? result.score + "%"
                    : "WAIT"
                }
              </div>

              <div class="trade-market-status">
                ${
                  !result.ready
                    ? "COLLECTING DATA"
                    : good
                      ? "AI FAVORED"
                      : "WATCH"
                }
              </div>

            </button>

          `;
        }
      )
      .join("");

  container
    .querySelectorAll(
      "[data-symbol]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            selectMarket(
              button.dataset.symbol
            );

          }
        );

      }
    );
}


/* =========================================================
   SELECT MARKET
========================================================= */

function selectMarket(
  symbol
) {

  if (
    !MARKETS.some(
      market =>
        market.symbol ===
        symbol
    )
  ) {

    return;
  }

  currentMarket =
    symbol;

  localStorage.setItem(
    "krishwave_market",
    symbol
  );

  setText(
    "symbol",
    symbol
  );

  setText(
    "tradeMarket",
    symbol
  );

  renderMarkets();

  renderDigits(
    symbol
  );

  updateReport(
    symbol
  );
}


/* =========================================================
   RENDER MARKET LIST
========================================================= */

function renderMarkets() {

  const container =
    $("markets");

  if (!container) {
    return;
  }

  const ranked =
    MARKETS
      .map(
        market => ({
          ...market,
          ...analyzeMarket(
            market.symbol
          )
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      );

  container.innerHTML =
    ranked
      .map(
        market => {

          return `

            <div
              class="market-card"
              data-market="${
                market.symbol
              }"
            >

              <div class="market-header">

                <strong>
                  ${
                    market.name
                  }
                </strong>

                <span>
                  ${
                    market.ready
                      ? market.score +
                        "%"
                      : "WAIT"
                  }
                </span>

              </div>

              <div class="market-meta">

                ${
                  market.ready
                    ? `AI ${
                        market.score >= 65
                          ? "FAVORED"
                          : "WATCH"
                      }`
                    : "COLLECTING TICKS"
                }

              </div>

            </div>

          `;
        }
      )
      .join("");
}


/* =========================================================
   RENDER MARKET TICKER
========================================================= */

function renderMarketTicker(
  symbol
) {

  if (
    symbol !==
    currentMarket
  ) {

    return;
  }

  const data =
    marketData[symbol];

  if (!data) {
    return;
  }

  setText(
    "aiMarket",
    symbol
  );

  setText(
    "tradeMarket",
    symbol
  );

  setText(
    "symbol",
    symbol
  );

  if (
    data.lastQuote !==
    null
  ) {

    setText(
      "lastQuote",
      data.lastQuote
    );
  }
}


/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigits(
  symbol
) {

  const container =
    $("digits");

  if (!container) {
    return;
  }

  const data =
    marketData[symbol];

  if (!data) {

    container.innerHTML =
      "";

    return;
  }

  const total =
    data.totalTicks ||
    1;

  container.innerHTML =
    data.digitCounts
      .map(
        (
          count,
          digit
        ) => {

          const percent =
            Math.round(
              (
                count /
                total
              ) * 100
            );

          return `

            <div class="digit-row">

              <span>
                ${digit}
              </span>

              <div
                class="digit-bar"
                style="
                  width:${percent}%
                "
              ></div>

              <b>
                ${percent}%
              </b>

            </div>

          `;
        }
      )
      .join("");
}


/* =========================================================
   AI CYCLE
========================================================= */

function startAI() {

  if (aiRunning) {
    return;
  }

  aiRunning =
    true;

  setText(
    "aiStatus",
    "ANALYZING"
  );

  setText(
    "entryStatus",
    "ANALYZING"
  );

  runAnalysisCycle();
}


function stopAI() {

  aiRunning =
    false;

  clearCycleTimers();

  setText(
    "aiStatus",
    "STOPPED"
  );

  setText(
    "entryStatus",
    "AI STOPPED"
  );

  setText(
    "cycleAnalysis",
    "STOPPED"
  );

  setText(
    "cyclePrediction",
    "WAITING"
  );

  setText(
    "cycleTrade",
    "WAITING"
  );

  setText(
    "cycleCooldown",
    "WAITING"
  );

  removeClass(
    "aiCircle",
    "prediction-active"
  );

  removeClass(
    "aiCircle",
    "trade-now"
  );
}


function clearCycleTimers() {

  if (analysisTimer) {
    clearInterval(
      analysisTimer
    );
  }

  if (predictionTimer) {
    clearInterval(
      predictionTimer
    );
  }

  if (tradeTimer) {
    clearInterval(
      tradeTimer
    );
  }

  analysisTimer =
    null;

  predictionTimer =
    null;

  tradeTimer =
    null;
}


/* =========================================================
   RUN 10 → 5 → 3 CYCLE
========================================================= */

function runAnalysisCycle() {

  if (!aiRunning) {
    return;
  }

  clearCycleTimers();

  cycleNumber++;

  analysisRemaining =
    10;

  predictionRemaining =
    5;

  tradeRemaining =
    3;

  currentPrediction =
    null;

  setText(
    "cycleAnalysis",
    "ANALYZING 10s"
  );

  setText(
    "cyclePrediction",
    "WAITING"
  );

  setText(
    "cycleTrade",
    "WAITING"
  );

  setText(
    "cycleCooldown",
    "WAITING"
  );

  removeClass(
    "aiCircle",
    "prediction-active"
  );

  removeClass(
    "aiCircle",
    "trade-now"
  );

  updateAIAnalysisDisplay();

  analysisTimer =
    setInterval(
      () => {

        analysisRemaining--;

        updateAIAnalysisDisplay();

        if (
          analysisRemaining <= 0
        ) {

          clearInterval(
            analysisTimer
          );

          analysisTimer =
            null;

          producePrediction();
        }

      },
      1000
    );
}


/* =========================================================
   PRODUCE ONE FIXED PREDICTION
========================================================= */

function producePrediction() {

  if (!aiRunning) {
    return;
  }

  const results =
    scanMarkets();

  const selected =
    results.find(
      result =>
        result.symbol ===
        currentMarket
    );

  const best =
    selected &&
    selected.ready
      ? selected
      : results.find(
          result =>
            result.ready
        );

  if (!best) {

    setText(
      "analysisMsg",
      "Waiting for more live ticks..."
    );

    setTimeout(
      runAnalysisCycle,
      1000
    );

    return;
  }

  if (
    best.symbol !==
    currentMarket
  ) {

    currentMarket =
      best.symbol;

    localStorage.setItem(
      "krishwave_market",
      currentMarket
    );

    setText(
      "symbol",
      currentMarket
    );

    setText(
      "tradeMarket",
      currentMarket
    );
  }

  currentPrediction = {

    market:
      best.symbol,

    strategy:
      currentStrategy,

    digit:
      best.prediction,

    confidence:
      best.confidence,

    score:
      best.score,

    timestamp:
      Date.now()
  };

  renderPrediction();

  startPredictionTimer();
}


/* =========================================================
   5 SECOND FIXED PREDICTION
========================================================= */

function startPredictionTimer() {

  if (!aiRunning) {
    return;
  }

  predictionRemaining =
    5;

  addClass(
    "aiCircle",
    "prediction-active"
  );

  setText(
    "cycleAnalysis",
    "COMPLETE"
  );

  setText(
    "cyclePrediction",
    "PREDICTION 5s"
  );

  predictionTimer =
    setInterval(
      () => {

        predictionRemaining--;

        setText(
          "aiCircleTimer",
          `${predictionRemaining}s`
        );

        if (
          predictionRemaining <= 0
        ) {

          clearInterval(
            predictionTimer
          );

          predictionTimer =
            null;

          startTradeNow();
        }

      },
      1000
    );

  setText(
    "aiCircleTimer",
    "5s"
  );
}


/* =========================================================
   TRADE NOW 3 SECONDS
========================================================= */

function startTradeNow() {

  if (!aiRunning) {
    return;
  }

  tradeRemaining =
    3;

  addClass(
    "aiCircle",
    "trade-now"
  );

  setText(
    "entryStatus",
    "TRADE NOW"
  );

  setText(
    "cyclePrediction",
    "LOCKED"
  );

  setText(
    "cycleTrade",
    "TRADE NOW 3s"
  );

  recordPaperSignal(
    currentPrediction
  );

  tradeTimer =
    setInterval(
      () => {

        tradeRemaining--;

        setText(
          "aiCircleTimer",
          `${tradeRemaining}s`
        );

        if (
          tradeRemaining <= 0
        ) {

          clearInterval(
            tradeTimer
          );

          tradeTimer =
            null;

          finishTradeWindow();
        }

      },
      1000
    );

  setText(
    "aiCircleTimer",
    "3s"
  );
}


/* =========================================================
   FINISH TRADE WINDOW
========================================================= */

function finishTradeWindow() {

  removeClass(
    "aiCircle",
    "trade-now"
  );

  removeClass(
    "aiCircle",
    "prediction-active"
  );

  setText(
    "entryStatus",
    "ANALYZING AGAIN"
  );

  setText(
    "cycleTrade",
    "COMPLETE"
  );

  setText(
    "cycleCooldown",
    "NEW CYCLE"
  );

  if (aiRunning) {

    setTimeout(
      runAnalysisCycle,
      100
    );
  }
}


/* =========================================================
   UPDATE AI DISPLAY
========================================================= */

function updateAIAnalysisDisplay() {

  setText(
    "aiCircleLabel",
    "AI ANALYSIS"
  );

  setText(
    "aiCircleTimer",
    `${analysisRemaining}s`
  );

  setText(
    "aiCircleStatus",
    "SCANNING"
  );

  setText(
    "aiStatus",
    "ANALYZING"
  );

  setText(
    "cycleAnalysis",
    `ANALYZING ${analysisRemaining}s`
  );

  setText(
    "aiMarket",
    currentMarket
  );
}


/* =========================================================
   RENDER PREDICTION
========================================================= */

function renderPrediction() {

  if (!currentPrediction) {
    return;
  }

  const digit =
    currentPrediction.digit;

  const confidence =
    currentPrediction.confidence;

  setText(
    "aiPrediction",
    digit
  );

  setText(
    "aiPredictionLarge",
    digit
  );

  setText(
    "aiCirclePrediction",
    digit
  );

  setText(
    "predictionConfidence",
    `${confidence}%`
  );

  setText(
    "analysisConfidence",
    `${confidence}%`
  );

  setText(
    "aiType",
    currentPrediction.strategy
  );

  setText(
    "tradePrediction",
    digit
  );

  setText(
    "tradeConfidence",
    `${confidence}%`
  );

  setText(
    "entryStatus",
    "PREDICTION READY"
  );

  setText(
    "analysisMsg",
    `AI selected ${digit} on ${currentPrediction.market}`
  );

  updateReport(
    currentPrediction.market
  );
}


/* =========================================================
   REPORT
========================================================= */

function updateReport(
  symbol
) {

  const analysis =
    analyzeMarket(
      symbol
    );

  if (!analysis.ready) {

    setText(
      "reportMarket",
      symbol
    );

    setText(
      "reportScore",
      "WAIT"
    );

    return;
  }

  setText(
    "reportMarket",
    symbol
  );

  setText(
    "reportScore",
    `${analysis.score}%`
  );

  setText(
    "reportStrength",
    `${analysis.confidence}%`
  );

  setText(
    "reportStability",
    `${analysis.stability}%`
  );

  setText(
    "reportConcentration",
    `${analysis.concentration}%`
  );

  setText(
    "reportStreak",
    `${analysis.streak}`
  );

  setText(
    "reportAgreement",
    `${Math.round(
      (
        analysis.evenRate +
        analysis.oddRate +
        analysis.overRate +
        analysis.underRate
      ) / 4
    )}%`
  );
}


/* =========================================================
   PAPER SIGNALS
========================================================= */

function recordPaperSignal(
  prediction
) {

  if (!prediction) {
    return;
  }

  const signal = {

    id:
      Date.now(),

    market:
      prediction.market,

    strategy:
      prediction.strategy,

    prediction:
      prediction.digit,

    confidence:
      prediction.confidence,

    timestamp:
      new Date().toISOString(),

    status:
      "PENDING"
  };

  paperSignals.unshift(
    signal
  );

  if (
    paperSignals.length >
    100
  ) {

    paperSignals.pop();
  }

  renderHistoryStats();

  renderHistory();
}


/* =========================================================
   HISTORY
========================================================= */

function renderHistoryStats() {

  const total =
    history.length;

  const wins =
    history.filter(
      item =>
        item.result ===
        "WIN"
    ).length;

  const losses =
    history.filter(
      item =>
        item.result ===
        "LOSS"
    ).length;

  const pending =
    total -
    wins -
    losses;

  const accuracy =
    wins + losses > 0
      ? Math.round(
          (
            wins /
            (
              wins +
              losses
            )
          ) * 100
        )
      : 0;

  setText(
    "historyTotal",
    total
  );

  setText(
    "historyWins",
    wins
  );

  setText(
    "historyLosses",
    losses
  );

  setText(
    "historyPending",
    pending
  );

  setText(
    "historyAccuracy",
    `${accuracy}%`
  );

  setText(
    "tradeTotal",
    total
  );

  setText(
    "tradeWins",
    wins
  );

  setText(
    "tradeLosses",
    losses
  );

  setText(
    "tradeAccuracy",
    `${accuracy}%`
  );
}


function renderHistory() {

  const container =
    $("historyList");

  if (!container) {
    return;
  }

  if (!history.length) {

    container.innerHTML =
      `<div class="empty-history">
        No completed signals yet.
      </div>`;

    return;
  }

  container.innerHTML =
    history
      .slice(0, 50)
      .map(
        item => {

          return `

            <div class="history-item">

              <div>
                <strong>
                  ${
                    item.market ||
                    "—"
                  }
                </strong>

                <small>
                  ${
                    item.strategy ||
                    "—"
                  }
                </small>
              </div>

              <div>
                ${
                  item.prediction ??
                  "—"
                }
              </div>

              <div>
                ${
                  item.result ||
                  "PENDING"
                }
              </div>

            </div>

          `;
        }
      )
      .join("");
}


function clearHistory() {

  history = [];

  localStorage.removeItem(
    "krishwave_history"
  );

  renderHistoryStats();

  renderHistory();
}


/* =========================================================
   STRATEGY
========================================================= */

function setStrategy(
  strategy
) {

  if (!strategy) {
    return;
  }

  currentStrategy =
    String(
      strategy
    ).toUpperCase();

  localStorage.setItem(
    "krishwave_strategy",
    currentStrategy
  );

  document
    .querySelectorAll(
      "[data-strategy]"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          String(
            button.dataset.strategy
          ).toUpperCase() ===
          currentStrategy
        );
      }
    );

  setText(
    "aiType",
    currentStrategy
  );

  setText(
    "tradeStrategy",
    currentStrategy
  );

  scanMarkets();
}


/* =========================================================
   NAVIGATION
========================================================= */

function showPage(
  page
) {

  document
    .querySelectorAll(
      ".page"
    )
    .forEach(
      section => {

        section.classList.toggle(
          "active",
          section.id ===
          page
        );
      }
    );

  document
    .querySelectorAll(
      "[data-page]"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.page ===
          page
        );
      }
    );
}


/* =========================================================
   THEME
========================================================= */

function initTheme() {

  const saved =
    localStorage.getItem(
      "krishwave_theme"
    );

  if (
    saved === "light"
  ) {

    document.body.classList.add(
      "light"
    );
  }
}


function toggleTheme() {

  document.body.classList.toggle(
    "light"
  );

  const light =
    document.body.classList.contains(
      "light"
    );

  localStorage.setItem(
    "krishwave_theme",
    light
      ? "light"
      : "dark"
  );
}


/* =========================================================
   MANUAL NUMBER
   IMPORTANT:
   AI DOES NOT AUTO-FILL THIS FIELD.
========================================================= */

function setupManualNumber() {

  const input =
    $("manualNumber");

  if (!input) {
    return;
  }

  input.value = "";

  input.addEventListener(
    "input",
    () => {

      let value =
        input.value
          .replace(
            /\D/g,
            ""
          );

      if (
        value.length > 1
      ) {

        value =
          value.slice(
            0,
            1
          );
      }

      input.value =
        value;
    }
  );
}


/* =========================================================
   TRADE FORM
========================================================= */

function setupTradeForm() {

  const strategy =
    $("tradeStrategy");

  if (strategy) {

    strategy.value =
      currentStrategy;

    strategy.addEventListener(
      "change",
      () => {

        setStrategy(
          strategy.value
        );
      }
    );
  }

  const symbol =
    $("symbol");

  if (symbol) {

    symbol.value =
      currentMarket;
  }
}


/* =========================================================
   BUTTON EVENTS
========================================================= */

function setupButtons() {

  const start =
    $("startAI");

  if (start) {

    start.addEventListener(
      "click",
      startAI
    );
  }

  const stop =
    $("stopAI");

  if (stop) {

    stop.addEventListener(
      "click",
      stopAI
    );
  }

  const connect =
    $("connectDerivBtn");

  if (connect) {

    connect.addEventListener(
      "click",
      connectDeriv
    );
  }

  const disconnect =
    $("disconnectDerivBtn");

  if (disconnect) {

    disconnect.addEventListener(
      "click",
      disconnectDeriv
    );
  }

  const scan =
    $("scanMarketsBtn");

  if (scan) {

    scan.addEventListener(
      "click",
      scanMarkets
    );
  }

  const clear =
    $("clearHistory");

  if (clear) {

    clear.addEventListener(
      "click",
      clearHistory
    );
  }

  document
    .querySelectorAll(
      "[data-strategy]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            setStrategy(
              button.dataset.strategy
            );

          }
        );
      }
    );

  document
    .querySelectorAll(
      "[data-page]"
    )
    .forEach(
      button => {

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

  const theme =
    $("themeToggle");

  if (theme) {

    theme.addEventListener(
      "click",
      toggleTheme
    );
  }

  const demo =
    $("demoModeBtn");

  if (demo) {

    demo.addEventListener(
      "click",
      () => {

        setText(
          "accountMode",
          "DEMO"
        );

      }
    );
  }
}


/* =========================================================
   INITIAL UI
========================================================= */

function initializeUI() {

  setText(
    "symbol",
    currentMarket
  );

  setText(
    "tradeMarket",
    currentMarket
  );

  setText(
    "aiMarket",
    currentMarket
  );

  setText(
    "aiStatus",
    "READY"
  );

  setText(
    "entryStatus",
    "WAITING"
  );

  setText(
    "aiCircleTimer",
    "10s"
  );

  setText(
    "aiCircleStatus",
    "READY"
  );

  setText(
    "accountMode",
    "DEMO"
  );

  setStrategy(
    currentStrategy
  );

  renderMarkets();

  renderHistoryStats();

  renderHistory();

  setupManualNumber();

  setupTradeForm();

  updateAccountUI();
}


/* =========================================================
   STARTUP
========================================================= */

async function boot() {

  console.log(
    "===================================="
  );

  console.log(
    "KRISHWAVE AI BEAST V5.9"
  );

  console.log(
    "Cloudflare OAuth backend ready"
  );

  console.log(
    "===================================="
  );

  initTheme();

  initializeUI();

  setupButtons();

  connectPublicMarket();

  await handleOAuthCallback();

  await restoreSession();

  setTimeout(
    scanMarkets,
    3000
  );
}


/* =========================================================
   GLOBAL FUNCTIONS
========================================================= */

window.connectDeriv =
  connectDeriv;

window.disconnectDeriv =
  disconnectDeriv;

window.startAI =
  startAI;

window.stopAI =
  stopAI;

window.scanMarkets =
  scanMarkets;

window.selectMarket =
  selectMarket;

window.setStrategy =
  setStrategy;

window.toggleTheme =
  toggleTheme;

window.clearHistory =
  clearHistory;


/* =========================================================
   RUN
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    boot
  );

} else {

  boot();
}