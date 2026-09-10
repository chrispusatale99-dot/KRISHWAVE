/* =========================================================
KRISHWAVE AI BEAST V7.2

LIVE DERIV MARKET INTELLIGENCE
OAUTH + PKCE
AI SCANNER
CIRCULAR AI
MANUAL PAPER ENGINE
AI BOT PAPER ENGINE
TRADE HISTORY
TAKE PROFIT / STOP LOSS
MARTINGALE
DARK / LIGHT MODE

IMPORTANT:

Real trades are NOT executed.

REAL mode is display/account-selection only.

All trading engines use PAPER execution.
========================================================= */

"use strict";

/* =========================================================
CONFIG
========================================================= */

const BACKEND_URL =
"https://krishwave-production.up.railway.app";

const PUBLIC_WS =
"wss://api.derivws.com/trading/v1/options/ws/public";

const DERIV_AUTH_URL =
"https://auth.deriv.com/oauth2/auth";

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

const DEFAULT_BOT_POOL = [
"MATCHES",
"DIFFERS"
];

const MIN_STAKE = 0.25;
const STARTING_BALANCE = 1000;

const STORAGE = {
history: "krishwave_v72_history",
balance: "krishwave_v72_balance",
theme: "krishwave_v72_theme",
settings: "krishwave_v72_settings"
};

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

backendConfig: null,

sessionId:
sessionStorage.getItem("kw_session_id") || null,

accountInfo: null,

publicWs: null,
authenticatedWs: null,

publicConnected: false,
authenticatedConnected: false,

connectionState: "OFFLINE",

selectedMarket: "R_10",
selectedStrategy: "MATCHES",

botStrategyPool: [...DEFAULT_BOT_POOL],

currentPage: "analysis",
currentEngine: "bot",

accountMode: "demo",

theme:
localStorage.getItem(STORAGE.theme) || "dark",

paperBalance:
Number(
localStorage.getItem(STORAGE.balance)
) || STARTING_BALANCE,

history: [],

activeTrades: [],

marketData: new Map(),

tickSequence: 0,

latestSignal: null,

circular: {
running: false,
stage: "ANALYZING",
deadline: 0,
timer: null,
market: "R_10",
strategy: "MATCHES",
prediction: null
},

bot: {
running: false,
timer: null,
lastTradeAt: 0,
baseStake: 0.25,
currentStake: 0.25,
takeProfit: 10,
stopLoss: 10,
martingale: 2
},

session: {
startBalance: STARTING_BALANCE,
profit: 0
},

manual: {
strategy: "MATCHES"
},

oauth: {
processing: false
},

publicReconnectTimer: null,
toastTimer: null
};

/* =========================================================
DOM HELPERS
========================================================= */

function $(id) {
return document.getElementById(id);
}

function qs(selector) {
return document.querySelector(selector);
}

function qsa(selector) {
return Array.from(document.querySelectorAll(selector));
}

function setText(id, value) {
const el = $(id);
if (el) {
el.textContent = value;
}
}

function setValue(id, value) {
const el = $(id);
if (el) {
el.value = value;
}
}

function show(el) {
if (el) {
el.classList.add("show");
}
}

function hide(el) {
if (el) {
el.classList.remove("show");
}
}

function showToast(message) {
let toast = $("toast");
if (!toast) {
toast = document.createElement("div");
toast.id = "toast";
toast.className = "toast";
document.body.appendChild(toast);
}
toast.textContent = message;
toast.classList.add("show");

if (state.toastTimer) {
clearTimeout(state.toastTimer);
}
state.toastTimer = setTimeout(() => {
toast.classList.remove("show");
}, 3000);
}

function formatMoney(amount) {
return "$" + Number(amount).toFixed(2);
}

/* =========================================================
INITIALIZATION
========================================================= */

document.addEventListener(
"DOMContentLoaded",
init
);

async function init() {

loadStorage();

applyTheme();

initializeMarkets();

initializeStrategies();

initializeNavigation();

initializeEngineTabs();

initializeButtons();

initializeModals();

initializeForms();

updateAllUI();

await handleOAuthCallback();

await loadBackendConfig();

connectPublicWebSocket();

updateConnectionUI(
"CONNECTING",
"LIVE DATA CONNECTING..."
);
}

/* =========================================================
STORAGE
========================================================= */

function loadStorage() {

try {

const history =  
  localStorage.getItem(  
    STORAGE.history  
  );  

if (history) {  
  const parsed = JSON.parse(history);  

  if (Array.isArray(parsed)) {  
    state.history = parsed;  
  }  
}

} catch (error) {

console.warn(  
  "History storage error",  
  error  
);  

state.history = [];

}

try {

const balance =  
  localStorage.getItem(  
    STORAGE.balance  
  );  

if (balance !== null) {  

  const value =  
    Number(balance);  

  if (  
    Number.isFinite(value) &&  
    value >= 0  
  ) {  
    state.paperBalance = value;  
  }  
}

} catch (error) {
console.warn(
"Balance storage error",
error
);
}

state.session.startBalance =
state.paperBalance;

state.session.profit = 0;
}

function saveHistory() {

try {

localStorage.setItem(  
  STORAGE.history,  
  JSON.stringify(state.history)  
);

} catch (error) {

console.warn(  
  "Unable to save history",  
  error  
);

}
}

function saveBalance() {

try {

localStorage.setItem(  
  STORAGE.balance,  
  String(state.paperBalance)  
);

} catch (error) {

console.warn(  
  "Unable to save balance",  
  error  
);

}
}

/* =========================================================
THEME
========================================================= */

function applyTheme() {

document.body.classList.toggle(
"light-theme",
state.theme === "light"
);

const button = $("themeToggle");

if (button) {

button.textContent =  
  state.theme === "light"  
    ? "🌙"  
    : "☀";

}
}

function toggleTheme() {

state.theme =
state.theme === "light"
? "dark"
: "light";

localStorage.setItem(
STORAGE.theme,
state.theme
);

applyTheme();

showToast(
state.theme === "light"
? "Light theme enabled"
: "Dark theme enabled"
);
}

/* =========================================================
MARKET INITIALIZATION
========================================================= */

function initializeMarkets() {

const selects = [
$("circularMarketSelect"),
$("manualMarketSelect")
];

selects.forEach(select => {

if (!select) return;  

select.innerHTML = "";  

MARKETS.forEach(market => {  

  const option =  
    document.createElement("option");  

  option.value = market;  
  option.textContent = market;  

  select.appendChild(option);  
});  

select.value =  
  state.selectedMarket;

});

MARKETS.forEach(market => {

if (!state.marketData.has(market)) {  

  state.marketData.set(  
    market,  
    createMarketState(market)  
  );  
}

});
}

function createMarketState(symbol) {

return {
symbol,

price: null,  

previousPrice: null,  

quote: null,  

pipSize: null,  

decimals: null,  

ticks: [],  

digits: [],  

digitCounts:  
  Array(10).fill(0),  

lastDigit: null,  

lastTickAt: 0,  

sequence: 0,  

score: 0,  

confidence: 0,  

strategy: "MATCHES",  

prediction: null

};
}

/* =========================================================
STRATEGY INITIALIZATION
========================================================= */

function initializeStrategies() {

renderStrategyOptions();

updateStrategyLabels();

updateTargetDigitVisibility();
}

function renderStrategyOptions() {

const container =
$("strategyOptions");

if (!container) return;

container.innerHTML = "";

STRATEGIES.forEach(strategy => {

const button =  
  document.createElement("button");  

button.type = "button";  

button.className =  
  "strategy-option";  

if (  
  strategy ===  
  state.manual.strategy  
) {  
  button.classList.add("active");  
}  

button.dataset.strategy =  
  strategy;  

button.innerHTML = `  
  <strong>${strategy}</strong>  
  <small>${strategyDescription(strategy)}</small>  
`;  

button.addEventListener(  
  "click",  
  () => selectManualStrategy(strategy)  
);  

container.appendChild(button);

});
}

function strategyDescription(strategy) {

switch (strategy) {

case "MATCHES":  
  return "Next digit equals target.";  

case "DIFFERS":  
  return "Next digit differs from target.";  

case "OVER":  
  return "Next digit is above threshold.";  

case "UNDER":  
  return "Next digit is below threshold.";  

case "EVEN":  
  return "Next digit is even.";  

case "ODD":  
  return "Next digit is odd.";  

default:  
  return "";

}
}

function selectManualStrategy(strategy) {

state.manual.strategy =
strategy;

state.selectedStrategy =
strategy;

setText(
"manualSelectedStrategyLabel",
strategy
);

hide($("strategyModal"));

updateTargetDigitVisibility();

renderStrategyOptions();

showToast(
`Manual strategy: ${strategy}`
);
}

function updateTargetDigitVisibility() {

const container =
$("targetDigitContainer");

if (!container) return;

const strategy =
state.manual.strategy;

const needsDigit =
strategy === "MATCHES" ||
strategy === "DIFFERS" ||
strategy === "OVER" ||
strategy === "UNDER";

container.style.display =
needsDigit ? "block" : "none";

const input =
$("manualTargetDigitInput");

if (input) {

input.required =  
  needsDigit;  

if (  
  strategy === "OVER" &&  
  !input.value  
) {  
  input.value = "4";  
}  

if (  
  strategy === "UNDER" &&  
  !input.value  
) {  
  input.value = "5";  
}

}
}

function updateStrategyLabels() {

setText(
"botStrategyLabel",
state.botStrategyPool.join(" + ")
);

setText(
"botSelectedStrategy",
state.botStrategyPool[0] || "MATCHES"
);

setText(
"circularStrategyLabel",
state.circular.strategy
);

setText(
"manualSelectedStrategyLabel",
state.manual.strategy
);
}

/* =========================================================
NAVIGATION
========================================================= */

function initializeNavigation() {

qsa(".nav-btn").forEach(button => {

button.addEventListener(  
  "click",  
  () => {  

    const page =  
      button.dataset.page;  

    if (page) {  
      navigateTo(page);  
    }  
  }  
);

});
}

function navigateTo(page) {

state.currentPage =
page;

qsa(".page").forEach(section => {

section.classList.toggle(  
  "active",  
  section.id ===  
  `${page}Page`  
);

});

qsa(".nav-btn").forEach(button => {

button.classList.toggle(  
  "active",  
  button.dataset.page === page  
);

});

window.scrollTo({
top: 0,
behavior: "smooth"
});

if (page === "analysis") {
renderAnalysis();
}

if (page === "trade") {
renderTradeUI();
}

if (page === "history") {
renderHistory();
}
}

/* =========================================================
ENGINE TABS
========================================================= */

function initializeEngineTabs() {

qsa(".engine-tab").forEach(button => {

button.addEventListener(  
  "click",  
  () => {  

    const engine =  
      button.dataset.engine;  

    if (engine) {  
      switchEngine(engine);  
    }  
  }  
);

});
}

function switchEngine(engine) {

state.currentEngine =
engine;

qsa(".engine-tab").forEach(button => {

button.classList.toggle(  
  "active",  
  button.dataset.engine === engine  
);

});

qsa(".engine-panel").forEach(panel => {

panel.classList.remove("active");

});

const panel =
$(`${engine}Panel`);

if (panel) {
panel.classList.add("active");
}
}

/* =========================================================
BUTTONS
========================================================= */

function initializeButtons() {

$("themeToggle")?.addEventListener(
"click",
toggleTheme
);

$("connectDerivBtn")?.addEventListener(
"click",
connectDeriv
);

$("demoModeBtn")?.addEventListener(
"click",
() => selectAccountMode("demo")
);

$("realModeBtn")?.addEventListener(
"click",
requestRealMode
);

$("startAI")?.addEventListener(
"click",
startCircularFromAnalysis
);

$("stopAI")?.addEventListener(
"click",
stopCircularAI
);

$("startBotBtn")?.addEventListener(
"click",
startAIBot
);

$("startCircularTradeBtn")?.addEventListener(
"click",
startCircularTradingEngine
);

$("placeTradeBtn")?.addEventListener(
"click",
placeManualTrade
);

$("stopTradingBtn")?.addEventListener(
"click",
stopAllTrading
);

$("clearLogsBtn")?.addEventListener(
"click",
clearHistory
);

$("botStrategyTrigger")?.addEventListener(
"click",
() => show($("botStrategyModal"))
);

$("circularStrategyTrigger")?.addEventListener(
"click",
() => openCircularStrategyModal()
);

$("manualStrategyTrigger")?.addEventListener(
"click",
() => show($("strategyModal"))
);
}

/* =========================================================
FORMS
========================================================= */

function initializeForms() {

$("circularMarketSelect")
?.addEventListener(
"change",
event => {

state.circular.market =  
      event.target.value;  
  }  
);

$("manualMarketSelect")
?.addEventListener(
"change",
event => {

state.selectedMarket =  
      event.target.value;  

    updateSelectedMarketUI();  
  }  
);

$("manualTargetDigitInput")
?.addEventListener(
"input",
event => {

let value =  
      Number(event.target.value);  

    if (!Number.isFinite(value)) {  
      return;  
    }  

    value =  
      Math.max(  
        0,  
        Math.min(9, Math.round(value))  
      );  

    event.target.value =  
      String(value);  
  }  
);

}

/* =========================================================
MODALS
========================================================= */

function initializeModals() {

$("closeStrategyModal")
?.addEventListener(
"click",
() => hide($("strategyModal"))
);

$("closeBotStrategyModal")
?.addEventListener(
"click",
() => hide($("botStrategyModal"))
);

$("applyBotStrategies")
?.addEventListener(
"click",
applyBotStrategies
);

$("cancelRealBtn")
?.addEventListener(
"click",
() => hide($("realConfirmModal"))
);

$("confirmRealBtn")
?.addEventListener(
"click",
confirmRealMode
);

qsa(".modal").forEach(modal => {

modal.addEventListener(  
  "click",  
  event => {  

    if (event.target === modal) {  
      hide(modal);  
    }  
  }  
);

});
}

function openCircularStrategyModal() {

renderStrategyOptions();

show($("strategyModal"));
}

function applyBotStrategies() {

const checked =
qsa(".bot-strategy-check:checked")
.map(input => input.value);

if (!checked.length) {

showToast(  
  "Select at least one bot strategy"  
);  

return;

}

state.botStrategyPool =
checked;

updateStrategyLabels();

hide($("botStrategyModal"));

showToast(
`Bot pool: ${checked.join(" + ")}`
);
}

/* =========================================================
ACCOUNT MODE
========================================================= */

function selectAccountMode(mode) {

if (mode === "real") {
requestRealMode();
return;
}

state.accountMode =
"demo";

document.body.classList.remove(
"real-mode"
);

document.body.classList.add(
"demo-mode"
);

$("demoModeBtn")
?.classList.add("active");

$("realModeBtn")
?.classList.remove("active");

setText(
"tradingStatusLabel",
"PAPER MODE"
);

showToast(
"DEMO account mode selected"
);
}

function requestRealMode() {

show($("realConfirmModal"));
}

function confirmRealMode() {

state.accountMode =
"real";

document.body.classList.remove(
"demo-mode"
);

document.body.classList.add(
"real-mode"
);

$("realModeBtn")
?.classList.add("active");

$("demoModeBtn")
?.classList.remove("active");

setText(
"tradingStatusLabel",
"REAL SELECTED • PAPER"
);

hide($("realConfirmModal"));

showToast(
"REAL selected — paper execution only"
);
}

/* =========================================================
BACKEND CONFIG
========================================================= */

async function loadBackendConfig() {

try {

const response =  
  await fetch(  
    `${BACKEND_URL}/api/config`,  
    {  
      method: "GET",  
      cache: "no-store"  
    }  
  );  

if (!response.ok) {  
  throw new Error(  
    `Backend HTTP ${response.status}`  
  );  
}  

const data =  
  await response.json();  

state.backendConfig =  
  data;  

console.log(  
  "KRISHWAVE backend config:",  
  data  
);  

setText(  
  "dataStatus",  
  "Railway backend online • Live market data available"  
);

} catch (error) {

console.error(  
  "Backend config error:",  
  error  
);  

setText(  
  "dataStatus",  
  "Live market data is starting..."  
);

}
}

/* =========================================================
DERIV OAUTH CONNECT
========================================================= */

async function connectDeriv() {

if (state.oauth.processing) {
return;
}

state.oauth.processing =
true;

updateConnectionUI(
"CONNECTING",
"OPENING DERIV LOGIN..."
);

try {

if (!state.backendConfig) {  

  await loadBackendConfig();  
}  

const config =  
  state.backendConfig;  

if (  
  !config ||  
  !config.client_id ||  
  !config.redirect_uri  
) {  

  throw new Error(  
    "KRISHWAVE backend configuration unavailable"  
  );  
}  


const verifier =  
  generateCodeVerifier();  

const challenge =  
  await generateCodeChallenge(  
    verifier  
  );  

const oauthState =  
  generateRandomString(32);  


sessionStorage.setItem(  
  "kw_code_verifier",  
  verifier  
);  

sessionStorage.setItem(  
  "kw_oauth_state",  
  oauthState  
);  


const params =  
  new URLSearchParams();  

params.set(  
  "response_type",  
  "code"  
);  

params.set(  
  "client_id",  
  config.client_id  
);  

params.set(  
  "redirect_uri",  
  config.redirect_uri  
);  

params.set(  
  "scope",  
  "trade account_manage application_read"  
);  

params.set(  
  "state",  
  oauthState  
);  

params.set(  
  "code_challenge",  
  challenge  
);  

params.set(  
  "code_challenge_method",  
  "S256"  
);  


window.location.href =  
  `${DERIV_AUTH_URL}?${params.toString()}`;

} catch (error) {

console.error(  
  "Deriv connect error:",  
  error  
);  

state.oauth.processing =  
  false;  

updateConnectionUI(  
  "OFFLINE",  
  "CONNECT FAILED"  
);  

showToast(  
  error.message ||  
  "Unable to start Deriv login"  
);

}
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
params.get("code");

const returnedState =
params.get("state");

const oauthError =
params.get("error");

if (oauthError) {

console.error(  
  "OAuth returned error:",  
  oauthError  
);  

cleanOAuthUrl();  

showToast(  
  `Deriv login cancelled: ${oauthError}`  
);  

return;

}

if (!code) {
return;
}

state.oauth.processing =
true;

updateConnectionUI(
"CONNECTING",
"FINISHING DERIV CONNECTION..."
);

try {

const savedState =  
  sessionStorage.getItem(  
    "kw_oauth_state"  
  );  

const verifier =  
  sessionStorage.getItem(  
    "kw_code_verifier"  
  );  


if (  
  !savedState ||  
  !returnedState ||  
  savedState !== returnedState  
) {  

  throw new Error(  
    "OAuth security state check failed"  
  );  
}  

if (!verifier) {  

  throw new Error(  
    "OAuth PKCE verifier missing"  
  );  
}  


if (!state.backendConfig) {  
  await loadBackendConfig();  
}  


const response =  
  await fetch(  
    `${BACKEND_URL}/api/oauth/exchange`,  
    {  
      method: "POST",  

      headers: {  
        "Content-Type":  
          "application/json"  
      },  

      body: JSON.stringify({  
        code,  
        code_verifier: verifier  
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
  "kw_session_id",  
  state.sessionId  
);  


sessionStorage.removeItem(  
  "kw_oauth_state"  
);  

sessionStorage.removeItem(  
  "kw_code_verifier"  
);  


cleanOAuthUrl();  

await loadAccounts();

} catch (error) {

console.error(  
  "OAuth callback error:",  
  error  
);  

sessionStorage.removeItem(  
  "kw_oauth_state"  
);  

sessionStorage.removeItem(  
  "kw_code_verifier"  
);  

cleanOAuthUrl();  

state.sessionId =  
  null;  

sessionStorage.removeItem(  
  "kw_session_id"  
);  

updateConnectionUI(  
  "OFFLINE",  
  "DERIV CONNECTION FAILED"  
);  

showToast(  
  error.message ||  
  "Deriv connection failed"  
);

} finally {

state.oauth.processing =  
  false;

}
}

function cleanOAuthUrl() {

try {

const cleanUrl =  
  window.location.origin +  
  window.location.pathname;  

window.history.replaceState(  
  {},  
  document.title,  
  cleanUrl  
);

} catch (error) {
console.warn(
"Unable to clean OAuth URL",
error
);
}
}

/* =========================================================
PKCE HELPERS
========================================================= */

function generateRandomString(length) {

const bytes =
new Uint8Array(length);

crypto.getRandomValues(bytes);

return Array.from(
bytes,
byte =>
("0" + byte.toString(16))
.slice(-2)
).join("");
}

function generateCodeVerifier() {

const bytes =
new Uint8Array(64);

crypto.getRandomValues(bytes);

return base64UrlEncode(bytes);
}

async function generateCodeChallenge(
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
new Uint8Array(digest)
);
}

function base64UrlEncode(bytes) {

let binary = "";

bytes.forEach(
byte => {
binary += String.fromCharCode(
byte
);
}
);

return btoa(binary)
.replace(/\+/g, "-")
.replace(/\//g, "_")
.replace(/=+$/g, "");
}

/* =========================================================
ACCOUNT LOAD
========================================================= */

async function loadAccounts() {

if (!state.sessionId) {
throw new Error(
"Deriv session is missing"
);
}

try {

const response =  
  await fetch(  
    `${BACKEND_URL}/api/accounts`,  
    {  
      method: "POST",  

      headers: {  
        "Content-Type":  
          "application/json"  
      },  

      body: JSON.stringify({  
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
    "Unable to load Deriv accounts"  
  );  
}  


const accounts =  
  normalizeAccounts(  
    data.accounts  
  );  


if (!accounts.length) {  

  throw new Error(  
    "No Deriv accounts returned"  
  );  
}  


const demo =  
  accounts.find(  
    account =>  
      isDemoAccount(account)  
  );  


const selected =  
  demo || accounts[0];  


state.accountInfo =  
  selected;  


setText(  
  "accountId",  
  selected.loginid ||  
  selected.account_id ||  
  "Connected"  
);  


setText(  
  "currency",  
  selected.currency ||  
  "USD"  
);  


if (  
  selected.balance !== undefined  
) {  

  const realBalance =  
    Number(selected.balance);  

  if (  
    Number.isFinite(realBalance)  
  ) {  

    setText(  
      "balanceDisplay",  
      formatMoney(realBalance)  
    );  
  }  
}  


updateConnectionUI(  
  "ONLINE",  
  "DERIV ACCOUNT CONNECTED"  
);  


showToast(  
  `Connected: ${  
    selected.loginid ||  
    selected.account_id ||  
    "Deriv account"  
  }`  
);  


if (  
  selected.loginid ||  
  selected.account_id  
) {  

  await connectAuthenticatedWebSocket(  
    selected  
  );  
}

} catch (error) {

console.error(  
  "Account load error:",  
  error  
);  

updateConnectionUI(  
  "OFFLINE",  
  "ACCOUNT CONNECTION FAILED"  
);  

showToast(  
  error.message ||  
  "Unable to load Deriv account"  
);

}
}

function normalizeAccounts(accounts) {

if (Array.isArray(accounts)) {
return accounts;
}

if (
accounts &&
Array.isArray(accounts.accounts)
) {
return accounts.accounts;
}

if (
accounts &&
typeof accounts === "object"
) {

return Object.values(accounts)  
  .filter(  
    value =>  
      value &&  
      typeof value === "object"  
  );

}

return [];
}

function isDemoAccount(account) {

const text =
JSON.stringify(account)
.toLowerCase();

return (
text.includes("demo") ||
text.includes("virtual") ||
text.includes("vrtc")
);
}

/* =========================================================
AUTHENTICATED WEBSOCKET
========================================================= */

async function connectAuthenticatedWebSocket(
account
) {

const accountId =
account.loginid ||
account.account_id;

if (!accountId) {
return;
}

try {

const response =  
  await fetch(  
    `${BACKEND_URL}/api/otp`,  
    {  
      method: "POST",  

      headers: {  
        "Content-Type":  
          "application/json"  
      },  

      body: JSON.stringify({  
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
    "Unable to obtain Deriv WebSocket"  
  );  
}  


if (  
  state.authenticatedWs  
) {  

  try {  
    state.authenticatedWs.close();  
  } catch {}  
}  


const ws =  
  new WebSocket(  
    data.websocket_url  
  );  

state.authenticatedWs =  
  ws;  


ws.addEventListener(  
  "open",  
  () => {  

    state.authenticatedConnected =  
      true;  

    console.log(  
      "Authenticated Deriv WebSocket connected"  
    );  
  }  
);  


ws.addEventListener(  
  "close",  
  () => {  

    state.authenticatedConnected =  
      false;  
  }  
);  


ws.addEventListener(  
  "error",  
  error => {  

    console.warn(  
      "Authenticated WS error",  
      error  
    );  
  }  
);

} catch (error) {

console.error(  
  "Authenticated WebSocket error:",  
  error  
);  

showToast(  
  "Account connected, live account channel unavailable"  
);

}
}

/* =========================================================
PUBLIC DERIV WEBSOCKET
========================================================= */

function connectPublicWebSocket() {

if (
state.publicWs &&
(
state.publicWs.readyState ===
WebSocket.OPEN ||
state.publicWs.readyState ===
WebSocket.CONNECTING
)
) {
return;
}

updateConnectionUI(
"CONNECTING",
"CONNECTING TO LIVE MARKETS..."
);

let ws;

try {

ws =  
  new WebSocket(  
    PUBLIC_WS  
  );

} catch (error) {

console.error(  
  "WebSocket creation failed:",  
  error  
);  

updateConnectionUI(  
  "OFFLINE",  
  "LIVE DATA OFFLINE"  
);  

retryPublicConnection();  

return;

}

state.publicWs =
ws;

ws.addEventListener(
"open",
handlePublicOpen
);

ws.addEventListener(
"message",
handlePublicMessage
);

ws.addEventListener(
"error",
handlePublicError
);

ws.addEventListener(
"close",
handlePublicClose
);
}

function handlePublicOpen() {

console.log(
"KRISHWAVE public WebSocket connected"
);

state.publicConnected =
true;

updateConnectionUI(
"ONLINE",
"LIVE DERIV DATA CONNECTED"
);

subscribeToAllMarkets();

showToast(
"Live Deriv market data connected"
);
}

function handlePublicError(error) {

console.warn(
"Public WebSocket error:",
error
);

state.publicConnected =
false;

updateConnectionUI(
"CONNECTING",
"RECONNECTING LIVE DATA..."
);
}

function handlePublicClose() {

console.warn(
"Public WebSocket closed"
);

state.publicConnected =
false;

updateConnectionUI(
"CONNECTING",
"LIVE DATA RECONNECTING..."
);

retryPublicConnection();
}

function retryPublicConnection() {

window.clearTimeout(
state.publicReconnectTimer
);

state.publicReconnectTimer =
window.setTimeout(
() => {

connectPublicWebSocket();  

  },  
  3000  
);

}

/* =========================================================
MARKET SUBSCRIPTIONS
========================================================= */

function subscribeToAllMarkets() {

const ws =
state.publicWs;

if (
!ws ||
ws.readyState !== WebSocket.OPEN
) {
return;
}

MARKETS.forEach(
market => {

const request = {  
    ticks_history: market,  
    count: 120,  
    end: "latest",  
    style: "ticks",  
    subscribe: 1  
  };  

  try {  

    ws.send(  
      JSON.stringify(request)  
    );  

  } catch (error) {  

    console.warn(  
      `Subscription failed: ${market}`,  
      error  
    );  
  }  
}

);
}

/* =========================================================
PUBLIC MESSAGE HANDLER
========================================================= */

function handlePublicMessage(event) {

let data;

try {

data =  
  JSON.parse(event.data);

} catch (error) {

return;

}

if (
data.error
) {

console.warn(  
  "Deriv public API error:",  
  data.error  
);  

return;

}

if (
data.history
) {

handleTickHistory(  
  data  
);  

return;

}

if (
data.tick
) {

handleLiveTick(  
  data.tick  
);  

return;

}
}

/* =========================================================
TICK HISTORY
========================================================= */

function handleTickHistory(data) {

const symbol =
data.echo_req?.ticks_history ||
data.echo_req?.symbol ||
data.history?.symbol;

if (!symbol) {
return;
}

const market =
getMarket(symbol);

if (!market) {
return;
}

const prices =
Array.isArray(data.history?.prices)
? data.history.prices
: [];

const times =
Array.isArray(data.history?.times)
? data.history.times
: [];

market.ticks = [];
market.digits = [];
market.digitCounts =
Array(10).fill(0);

prices.forEach(
(price, index) => {

const timestamp =  
    times[index]  
      ? Number(times[index]) * 1000  
      : Date.now();  

  processMarketTick(  
    market,  
    price,  
    timestamp,  
    false  
  );  
}

);

if (prices.length) {

market.price =  
  Number(prices[prices.length - 1]);  

market.previousPrice =  
  prices.length > 1  
    ? Number(  
        prices[prices.length - 2]  
      )  
    : null;

}

renderAnalysis();
}

/* =========================================================
LIVE TICK
========================================================= */

function handleLiveTick(tick) {

const symbol =
tick.symbol;

if (!symbol) {
return;
}

const market =
getMarket(symbol);

if (!market) {
return;
}

const quote =
Number(tick.quote);

if (
!Number.isFinite(quote)
) {
return;
}

const timestamp =
tick.epoch
? Number(tick.epoch) * 1000
: Date.now();

processMarketTick(
market,
quote,
timestamp,
true
);

updateCurrentMarketIfNeeded(
market
);

settleTradesForMarket(
market
);

renderActiveTrades();

renderTradingStats();

renderHistorySummary();

updateAIAnalysis();

drawChart();

checkAutoEngines();

checkSessionLimits();
}

function getMarket(symbol) {

if (!state.marketData.has(symbol)) {

state.marketData.set(  
  symbol,  
  createMarketState(symbol)  
);

}

return state.marketData.get(
symbol
);
}

/* =========================================================
PROCESS MARKET TICK
========================================================= */

function processMarketTick(
market,
price,
timestamp,
isLive
) {

const numericPrice =
Number(price);

if (
!Number.isFinite(numericPrice)
) {
return;
}

market.previousPrice =
market.price;

market.price =
numericPrice;

market.quote =
numericPrice;

market.lastTickAt =
timestamp;

if (
market.decimals === null
) {

market.decimals =  
  inferDecimalsFromPrice(  
    numericPrice  
  );

}

const digit =
extractLastDigit(
numericPrice,
market.decimals
);

market.lastDigit =
digit;

market.ticks.push({
price: numericPrice,
time: timestamp,
digit
});

market.digits.push(
digit
);

market.digitCounts[digit]++;

if (market.ticks.length > 150) {
market.ticks.shift();
}

if (market.digits.length > 150) {
market.digits.shift();
}

market.sequence =
++state.tickSequence;

if (isLive) {

market.lastLiveSequence =  
  market.sequence;

}

calculateMarketScore(
market
);
}

/* =========================================================
DIGIT EXTRACTION & ALGORITHMS
========================================================= */

function inferDecimalsFromPrice(price) {

const text =
String(price);

if (
text.includes("e-")
) {

const parts =  
  text.split("e-");  

return Number(parts[1]) || 2;

}

const decimalIndex =
text.indexOf(".");

if (decimalIndex === -1) {
return 0;
}

return Math.min(
8,
text.length - decimalIndex - 1
);
}

function extractLastDigit(
price,
decimals
) {

let fixed;

try {

fixed =  
  Number(price)  
    .toFixed(  
      Math.max(  
        0,  
        decimals  
      )  
    );

} catch {

fixed =  
  String(price);

}

const clean = fixed.replace(".", "");
return Number(clean.slice(-1)) || 0;
}

function calculateMarketScore(market) {
if (market.digits.length < 10) {
market.score = 50;
market.confidence = 50;
market.prediction = 5;
return;
}

const recent = market.digits.slice(-20);
const counts = Array(10).fill(0);
recent.forEach(d => counts[d]++);

let maxDigit = 0;
let maxCount = -1;
let minDigit = 0;
let minCount = 999;

counts.forEach((c, d) => {
if (c > maxCount) {
maxCount = c;
maxDigit = d;
}
if (c < minCount) {
minCount = c;
minDigit = d;
}
});

const evens = recent.filter(d => d % 2 === 0).length;
const odds = recent.length - evens;

if (market.strategy === "EVEN" || market.strategy === "ODD") {
market.prediction = evens >= odds ? "EVEN" : "ODD";
market.confidence = Math.round((Math.max(evens, odds) / recent.length) * 100);
} else if (market.strategy === "MATCHES" || market.strategy === "DIFFERS") {
market.prediction = maxDigit;
market.confidence = Math.min(95, Math.round((maxCount / recent.length) * 100 * 3));
} else if (market.strategy === "OVER") {
market.prediction = 4;
const overCount = recent.filter(d => d > 4).length;
market.confidence = Math.round((overCount / recent.length) * 100);
} else if (market.strategy === "UNDER") {
market.prediction = 5;
const underCount = recent.filter(d => d < 5).length;
market.confidence = Math.round((underCount / recent.length) * 100);
} else {
market.prediction = maxDigit;
market.confidence = 75;
}

market.score = market.confidence;
}

/* =========================================================
UI UPDATE ENGINE
========================================================= */

function updateConnectionUI(status, label) {
state.connectionState = status;
setText("connectionStatus", label);

const dot = $("connectionDot");
if (dot) {
dot.className = "dot " + status.toLowerCase();
}
}

function updateSelectedMarketUI() {
const market = getMarket(state.selectedMarket);
setText("selectedMarketLabel", market.symbol);
setText("livePriceDisplay", market.price !== null ? market.price.toFixed(market.decimals || 2) : "---");
setText("lastDigitDisplay", market.lastDigit !== null ? String(market.lastDigit) : "-");
}

function updateCurrentMarketIfNeeded(market) {
if (market.symbol === state.selectedMarket) {
updateSelectedMarketUI();
}
}

function updateAllUI() {
setText("balanceDisplay", formatMoney(state.paperBalance));
updateSelectedMarketUI();
renderAnalysis();
renderActiveTrades();
renderHistory();
renderTradingStats();
renderHistorySummary();
}

function renderAnalysis() {

const grid = $("scannerGrid");
if (!grid) return;

grid.innerHTML = "";

let topMarket = null;
let topScore = -1;

MARKETS.forEach(symbol => {
const m = getMarket(symbol);
if (m.score > topScore) {
topScore = m.score;
topMarket = m;
}

const card = document.createElement("div");
card.className = "market-card" + (symbol === state.selectedMarket ? " active" : "");
card.onclick = () => {
state.selectedMarket = symbol;
setValue("manualMarketSelect", symbol);
updateSelectedMarketUI();
renderAnalysis();
drawChart();
};

card.innerHTML = `
  <div class="market-head">
    <strong>${m.symbol}</strong>
    <span class="score">${m.score}%</span>
  </div>
  <div class="market-body">
    <div>Price: <span>${m.price !== null ? m.price.toFixed(m.decimals || 2) : "---"}</span></div>
    <div>Last Digit: <strong>${m.lastDigit !== null ? m.lastDigit : "-"}</strong></div>
    <div>Target: <strong>${m.prediction !== null ? m.prediction : "-"}</strong></div>
  </div>
`;

grid.appendChild(card);
});

if (topMarket) {
state.latestSignal = topMarket;
setText("topSignalMarket", topMarket.symbol);
setText("topSignalConfidence", topMarket.confidence + "%");
setText("topSignalStrategy", topMarket.strategy);
setText("topSignalPrediction", String(topMarket.prediction));
}
}

function updateAIAnalysis() {
if (state.currentPage === "analysis") {
renderAnalysis();
}
}

/* =========================================================
CHART ENGINE
========================================================= */

function drawChart() {
const canvas = $("tickChart");
if (!canvas) return;
const ctx = canvas.getContext("2d");
if (!ctx) return;

const market = getMarket(state.selectedMarket);
const ticks = market.ticks;

ctx.clearRect(0, 0, canvas.width, canvas.height);

if (ticks.length < 2) {
ctx.fillStyle = "#888";
ctx.font = "12px sans-serif";
ctx.fillText("Waiting for tick data...", 20, canvas.height / 2);
return;
}

const prices = ticks.map(t => t.price);
const min = Math.min(...prices);
const max = Math.max(...prices);
const range = (max - min) || 1;

const padding = 20;
const width = canvas.width - padding * 2;
const height = canvas.height - padding * 2;

ctx.beginPath();
ctx.strokeStyle = state.theme === "light" ? "#0066cc" : "#00f0ff";
ctx.lineWidth = 2;

ticks.forEach((t, i) => {
const x = padding + (i / (ticks.length - 1)) * width;
const y = canvas.height - padding - ((t.price - min) / range) * height;

if (i === 0) {
ctx.moveTo(x, y);
} else {
ctx.lineTo(x, y);
}
});

ctx.stroke();

// Draw last tick dot
const lastTick = ticks[ticks.length - 1];
const lx = canvas.width - padding;
const ly = canvas.height - padding - ((lastTick.price - min) / range) * height;

ctx.beginPath();
ctx.fillStyle = "#ff0055";
ctx.arc(lx, ly, 4, 0, Math.PI * 2);
ctx.fill();
}

/* =========================================================
PAPER EXECUTION ENGINE
========================================================= */

function placeTrade(marketSymbol, strategy, targetDigit, stake, durationTicks = 1) {
if (state.paperBalance < stake) {
showToast("Insufficient balance for trade");
return null;
}

if (stake < MIN_STAKE) {
showToast(`Minimum stake is ${formatMoney(MIN_STAKE)}`);
return null;
}

const market = getMarket(marketSymbol);
if (!market || market.price === null) {
showToast("Market data unavailable");
return null;
}

state.paperBalance -= stake;
saveBalance();
setText("balanceDisplay", formatMoney(state.paperBalance));

const trade = {
id: "TRD_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
market: marketSymbol,
strategy,
targetDigit,
stake,
payoutMultiplier: PAYOUT[strategy] || 0.95,
entryPrice: market.price,
entryDigit: market.lastDigit,
startSequence: market.sequence,
targetSequence: market.sequence + durationTicks,
status: "OPEN",
timestamp: Date.now(),
exitPrice: null,
exitDigit: null,
profit: 0
};

state.activeTrades.push(trade);
renderActiveTrades();
showToast(`Order placed: ${strategy} on ${marketSymbol}`);
return trade;
}

function settleTradesForMarket(market) {
const remaining = [];

state.activeTrades.forEach(trade => {
if (trade.market !== market.symbol) {
remaining.push(trade);
return;
}

if (market.sequence >= trade.targetSequence) {
trade.exitPrice = market.price;
trade.exitDigit = market.lastDigit;
trade.status = "CLOSED";

let won = false;

switch (trade.strategy) {
case "MATCHES":
won = trade.exitDigit === Number(trade.targetDigit);
break;
case "DIFFERS":
won = trade.exitDigit !== Number(trade.targetDigit);
break;
case "EVEN":
won = trade.exitDigit % 2 === 0;
break;
case "ODD":
won = trade.exitDigit % 2 !== 0;
break;
case "OVER":
won = trade.exitDigit > Number(trade.targetDigit);
break;
case "UNDER":
won = trade.exitDigit < Number(trade.targetDigit);
break;
}

if (won) {
const returnAmount = trade.stake + (trade.stake * trade.payoutMultiplier);
trade.profit = trade.stake * trade.payoutMultiplier;
state.paperBalance += returnAmount;
state.session.profit += trade.profit;
trade.result = "WIN";
} else {
trade.profit = -trade.stake;
state.session.profit += trade.profit;
trade.result = "LOSS";
}

saveBalance();
state.history.unshift(trade);
saveHistory();

showToast(`Trade ${trade.result}: ${formatMoney(trade.profit)}`);
} else {
remaining.push(trade);
}
});

state.activeTrades = remaining;
}

function placeManualTrade() {
const market = state.selectedMarket;
const strategy = state.manual.strategy;
const stakeInput = $("manualStakeInput");
const digitInput = $("manualTargetDigitInput");

const stake = stakeInput ? Number(stakeInput.value) : 1;
const targetDigit = digitInput ? Number(digitInput.value) : 0;

placeTrade(market, strategy, targetDigit, stake, 1);
}

/* =========================================================
AUTOMATED ENGINES (CIRCULAR & BOT)
========================================================= */

function startCircularFromAnalysis() {
if (state.latestSignal) {
state.circular.market = state.latestSignal.symbol;
state.circular.strategy = state.latestSignal.strategy;
state.circular.prediction = state.latestSignal.prediction;
}
navigateTo("trade");
switchEngine("circular");
startCircularTradingEngine();
}

function startCircularTradingEngine() {
if (state.circular.running) return;

state.circular.running = true;
state.circular.stage = "RUNNING";
setText("circularStatus", "CIRCULAR ENGINE ACTIVE");
showToast("Circular AI Started");
}

function stopCircularAI() {
state.circular.running = false;
state.circular.stage = "STOPPED";
setText("circularStatus", "CIRCULAR ENGINE STOPPED");
showToast("Circular AI Stopped");
}

function startAIBot() {
if (state.bot.running) return;

const stakeInput = $("botStakeInput");
const tpInput = $("botTakeProfitInput");
const slInput = $("botStopLossInput");
const martInput = $("botMartingaleInput");

state.bot.baseStake = stakeInput ? Number(stakeInput.value) : 0.25;
state.bot.currentStake = state.bot.baseStake;
state.bot.takeProfit = tpInput ? Number(tpInput.value) : 10;
state.bot.stopLoss = slInput ? Number(slInput.value) : 10;
state.bot.martingale = martInput ? Number(martInput.value) : 2;

state.bot.running = true;
setText("botStatus", "BOT RUNNING");
showToast("AI Bot Engine Started");
}

function stopAllTrading() {
state.circular.running = false;
state.bot.running = false;
setText("circularStatus", "STOPPED");
setText("botStatus", "STOPPED");
showToast("All trading engines stopped");
}

function checkAutoEngines() {
const now = Date.now();

// Circular AI Trigger
if (state.circular.running && state.activeTrades.length === 0) {
const m = getMarket(state.circular.market);
if (m && m.confidence >= 70) {
placeTrade(
state.circular.market,
state.circular.strategy,
m.prediction !== null ? m.prediction : 5,
state.bot.baseStake,
1
);
}
}

// Bot Engine Trigger
if (state.bot.running && state.activeTrades.length === 0 && (now - state.bot.lastTradeAt > 2000)) {
state.bot.lastTradeAt = now;

let stake = state.bot.baseStake;

// Check last trade for Martingale adjustment
if (state.history.length > 0) {
const last = state.history[0];
if (last.result === "LOSS") {
state.bot.currentStake = state.bot.currentStake * state.bot.martingale;
stake = state.bot.currentStake;
} else {
state.bot.currentStake = state.bot.baseStake;
stake = state.bot.baseStake;
}
}

const strategy = state.botStrategyPool[Math.floor(Math.random() * state.botStrategyPool.length)] || "MATCHES";
const m = getMarket(state.selectedMarket);

placeTrade(
state.selectedMarket,
strategy,
m ? m.prediction || 5 : 5,
stake,
1
);
}
}

function checkSessionLimits() {
if (state.session.profit >= state.bot.takeProfit && state.bot.takeProfit > 0) {
stopAllTrading();
showToast(`Take Profit reached! (+${formatMoney(state.session.profit)})`);
}

if (state.session.profit <= -state.bot.stopLoss && state.bot.stopLoss > 0) {
stopAllTrading();
showToast(`Stop Loss reached! (${formatMoney(state.session.profit)})`);
}
}

/* =========================================================
UI RENDER HELPERS
========================================================= */

function renderTradeUI() {
updateSelectedMarketUI();
renderActiveTrades();
drawChart();
}

function renderActiveTrades() {
const container = $("activeTradesContainer");
if (!container) return;

if (state.activeTrades.length === 0) {
container.innerHTML = '<div class="empty-state">No open trades</div>';
return;
}

container.innerHTML = state.activeTrades.map(trade => `
  <div class="trade-card open">
    <div class="trade-head">
      <strong>${trade.market} - ${trade.strategy}</strong>
      <span class="badge open">OPEN</span>
    </div>
    <div class="trade-body">
      <div>Stake: ${formatMoney(trade.stake)}</div>
      <div>Target Digit: ${trade.targetDigit}</div>
      <div>Entry Price: ${trade.entryPrice}</div>
    </div>
  </div>
`).join("");
}

function renderHistory() {
const container = $("historyTableBody");
if (!container) return;

if (state.history.length === 0) {
container.innerHTML = '<tr><td colspan="7" class="text-center">No trade history available</td></tr>';
return;
}

container.innerHTML = state.history.map(t => `
  <tr class="${t.result ? t.result.toLowerCase() : ""}">
    <td>${new Date(t.timestamp).toLocaleTimeString()}</td>
    <td>${t.market}</td>
    <td>${t.strategy}</td>
    <td>${formatMoney(t.stake)}</td>
    <td>${t.exitDigit !== null ? t.exitDigit : "-"}</td>
    <td><strong class="${t.profit >= 0 ? "text-green" : "text-red"}">${t.result}</strong></td>
    <td class="${t.profit >= 0 ? "text-green" : "text-red"}">${formatMoney(t.profit)}</td>
  </tr>
`).join("");
}

function renderTradingStats() {
setText("sessionProfitDisplay", formatMoney(state.session.profit));
setText("activeTradeCount", String(state.activeTrades.length));
}

function renderHistorySummary() {
const wins = state.history.filter(h => h.result === "WIN").length;
const total = state.history.length;
const winrate = total > 0 ? Math.round((wins / total) * 100) : 0;

setText("totalTradesDisplay", String(total));
setText("winRateDisplay", winrate + "%");
}

function clearHistory() {
state.history = [];
saveHistory();
renderHistory();
renderHistorySummary();
showToast("Trade history cleared");
}
