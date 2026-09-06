/* =========================================================
KRISHWAVE V4.0
LIVE DERIV MARKET INTELLIGENCE + TRADING CONTROL ENGINE

FEATURES

Live Deriv market data

13 Volatility Indices

Digit analysis

Even / Odd

High / Low

Over / Under

Match / Differ

Rise / Fall

AUTO strategy

AI analysis

10 second AI analysis

7 second entry countdown

TRADE NOW

AI TRADE NOW

Minimum stake 0.25

Take Profit

Stop Loss

Martingale multiplier

Maximum martingale steps

Maximum stake protection

Current stake

Session P/L

Reset martingale

Demo / Real account mode

Authenticated Deriv trading socket support

Proposal -> Buy -> Contract monitoring

Real-account confirmation

No API token stored in source

Existing CSS preserved
========================================================= */


(() => {
"use strict";

/* =======================================================
CONFIG
======================================================= */

const USER_CONFIG = window.KRISHWAVE_CONFIG || {};

const CONFIG = {
WS_URL:
USER_CONFIG.publicWsUrl ||
"wss://api.derivws.com/trading/v1/options/ws/public",

APP_ID:  
  USER_CONFIG.derivAppId ||  
  "34jzkIFHayWQzG6sXikax",  

MAX_HISTORY: 200,  
RECENT_WINDOW: 80,  
MIN_SAMPLE: 30,  

RECONNECT_DELAY: 3000,  
WATCHDOG_MS: 15000,  

ANALYSIS_SECONDS: 10,  
COUNTDOWN_SECONDS: 7,  

MAX_MARKETS: 13,  

STRONG_EDGE: 6,  
MAX_CONFIDENCE: 92,  

MIN_STAKE: 0.25,  

STORAGE_KEY: "KRISHWAVE_RISK_V4",  

TRADING_ENABLED:  
  USER_CONFIG.tradingEnabled === true

};

/* =======================================================
MARKETS
======================================================= */

const MARKETS = [
{
symbol: "R_10",
name: "Volatility 10 Index"
},
{
symbol: "R_10_1S",
name: "Volatility 10 (1s) Index"
},
{
symbol: "R_15_1S",
name: "Volatility 15 (1s) Index"
},
{
symbol: "R_25",
name: "Volatility 25 Index"
},
{
symbol: "R_25_1S",
name: "Volatility 25 (1s) Index"
},
{
symbol: "R_30_1S",
name: "Volatility 30 (1s) Index"
},
{
symbol: "R_50",
name: "Volatility 50 Index"
},
{
symbol: "R_50_1S",
name: "Volatility 50 (1s) Index"
},
{
symbol: "R_75",
name: "Volatility 75 Index"
},
{
symbol: "R_75_1S",
name: "Volatility 75 (1s) Index"
},
{
symbol: "R_90_1S",
name: "Volatility 90 (1s) Index"
},
{
symbol: "R_100",
name: "Volatility 100 Index"
},
{
symbol: "R_100_1S",
name: "Volatility 100 (1s) Index"
}
];

/* =======================================================
STRATEGIES
======================================================= */

const STRATEGIES = {
AUTO: {
name: "AUTO",
icon: "⚡"
},

EVEN: {  
  name: "EVEN",  
  icon: "2️⃣"  
},  

ODD: {  
  name: "ODD",  
  icon: "1️⃣"  
},  

HIGH: {  
  name: "HIGH",  
  icon: "🔺"  
},  

LOW: {  
  name: "LOW",  
  icon: "🔻"  
},  

OVER: {  
  name: "OVER",  
  icon: "📈"  
},  

UNDER: {  
  name: "UNDER",  
  icon: "📉"  
},  

MATCH: {  
  name: "MATCH",  
  icon: "🎯"  
},  

DIFFER: {  
  name: "DIFFER",  
  icon: "≠"  
},  

RISE: {  
  name: "RISE",  
  icon: "🚀"  
},  

FALL: {  
  name: "FALL",  
  icon: "⬇️"  
}

};

/* =======================================================
STATE
======================================================= */

const state = {

/* Public market socket */  
publicWs: null,  
publicConnected: false,  

/* Trading socket */  
tradeWs: null,  
tradeConnected: false,  
tradeAuthenticated: false,  

/* Account */  
accountMode: "demo",  
accountConnected: false,  
accountId: "",  
balance: null,  
currency: "USD",  

/* Market */  
selectedSymbol: "R_100",  
selectedStrategy: "AUTO",  
targetDigit: 5,  

/* Data */  
markets: {},  
liveTicks: {},  
history: {},  

/* Scanner */  
scanResults: [],  
scanning: false,  

/* AI */  
aiRunning: false,  
aiTimer: null,  
countdownTimer: null,  
analysisStartedAt: null,  

/* Trading */  
tradeCount: 0,  
activeContracts: new Map(),  
lastTrade: null,  

/* Risk */  
risk: {  
  baseStake: CONFIG.MIN_STAKE,  
  currentStake: CONFIG.MIN_STAKE,  

  takeProfit: 0,  
  stopLoss: 0,  

  martingaleMultiplier: 2,  
  maxMartingaleSteps: 3,  
  martingaleStep: 0,  

  maxStake: 100,  

  sessionPL: 0,  
  sessionStartBalance: null,  

  sessionStopped: false  
},  

lastAction: "WAITING",  
engineState: "IDLE",  

requestId: 1000,  

initialized: false

};

/* =======================================================
DOM HELPERS
======================================================= */

function $(id) {
return document.getElementById(id);
}

function q(selector) {
return document.querySelector(selector);
}

function qa(selector) {
return Array.from(document.querySelectorAll(selector));
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

function clamp(value, min, max) {
return Math.max(min, Math.min(max, value));
}

function number(value, fallback = 0) {
const n = Number(value);

return Number.isFinite(n) ? n : fallback;

}

function money(value) {
const n = number(value);

return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;

}

function escapeHTML(value) {
return String(value ?? "")
.replaceAll("&", "&")
.replaceAll("<", "<")
.replaceAll(">", ">")
.replaceAll('"', """)
.replaceAll("'", "'");
}

/* =======================================================
STORAGE
======================================================= */

function saveRiskSettings() {
try {
localStorage.setItem(
CONFIG.STORAGE_KEY,
JSON.stringify({
baseStake: state.risk.baseStake,
takeProfit: state.risk.takeProfit,
stopLoss: state.risk.stopLoss,
martingaleMultiplier:
state.risk.martingaleMultiplier,
maxMartingaleSteps:
state.risk.maxMartingaleSteps,
maxStake: state.risk.maxStake
})
);
} catch (_) {}
}

function loadRiskSettings() {
try {
const raw =
localStorage.getItem(CONFIG.STORAGE_KEY);

if (!raw) {  
    return;  
  }  

  const saved = JSON.parse(raw);  

  state.risk.baseStake =  
    Math.max(  
      CONFIG.MIN_STAKE,  
      number(saved.baseStake, CONFIG.MIN_STAKE)  
    );  

  state.risk.takeProfit =  
    Math.max(  
      0,  
      number(saved.takeProfit, 0)  
    );  

  state.risk.stopLoss =  
    Math.max(  
      0,  
      number(saved.stopLoss, 0)  
    );  

  state.risk.martingaleMultiplier =  
    Math.max(  
      1,  
      number(saved.martingaleMultiplier, 2)  
    );  

  state.risk.maxMartingaleSteps =  
    Math.max(  
      0,  
      Math.floor(  
        number(saved.maxMartingaleSteps, 3)  
      )  
    );  

  state.risk.maxStake =  
    Math.max(  
      CONFIG.MIN_STAKE,  
      number(saved.maxStake, 100)  
    );  

  state.risk.currentStake =  
    state.risk.baseStake;  

} catch (_) {}

}

/* =======================================================
DYNAMIC TRADING UI
======================================================= */

function createTradingUI() {

if ($("krishwaveTradingCenter")) {  
  return;  
}  

const notice =  
  q(".notice-card") ||  
  q("footer") ||  
  document.body.lastElementChild;  

const wrapper =  
  document.createElement("section");  

wrapper.id =  
  "krishwaveTradingCenter";  

wrapper.innerHTML = `  
  <div class="kw-trading-shell">  

    <div class="kw-trading-header">  
      <div>  
        <div class="kw-trading-title">  
          TRADING CONTROL CENTER  
        </div>  

        <div class="kw-trading-subtitle">  
          Risk manager • Demo / Real • AI execution  
        </div>  
      </div>  

      <div id="kwTradeConnection"  
           class="kw-trade-status">  
        ANALYSIS ONLY  
      </div>  
    </div>  


    <div class="kw-account-row">  

      <button  
        id="kwDemoMode"  
        class="kw-mode active">  
        DEMO  
      </button>  

      <button  
        id="kwRealMode"  
        class="kw-mode">  
        REAL  
      </button>  

      <button  
        id="kwResetMartingale"  
        class="kw-action">  
        RESET MARTINGALE  
      </button>  

    </div>  


    <div class="kw-risk-grid">  

      <label>  
        <span>Base Stake</span>  
        <input  
          id="kwBaseStake"  
          type="number"  
          min="0.25"  
          step="0.01"  
          value="0.25">  
      </label>  

      <label>  
        <span>Take Profit</span>  
        <input  
          id="kwTakeProfit"  
          type="number"  
          min="0"  
          step="0.01"  
          value="0">  
      </label>  

      <label>  
        <span>Stop Loss</span>  
        <input  
          id="kwStopLoss"  
          type="number"  
          min="0"  
          step="0.01"  
          value="0">  
      </label>  

      <label>  
        <span>Martingale ×</span>  
        <input  
          id="kwMultiplier"  
          type="number"  
          min="1"  
          step="0.1"  
          value="2">  
      </label>  

      <label>  
        <span>Max Steps</span>  
        <input  
          id="kwMaxSteps"  
          type="number"  
          min="0"  
          step="1"  
          value="3">  
      </label>  

      <label>  
        <span>Max Stake</span>  
        <input  
          id="kwMaxStake"  
          type="number"  
          min="0.25"  
          step="0.01"  
          value="100">  
      </label>  

    </div>  


    <div class="kw-metrics">  

      <div class="kw-metric">  
        <small>CURRENT STAKE</small>  
        <strong id="kwCurrentStake">  
          0.25  
        </strong>  
      </div>  

      <div class="kw-metric">  
        <small>MARTINGALE STEP</small>  
        <strong id="kwMartingaleStep">  
          0 / 3  
        </strong>  
      </div>  

      <div class="kw-metric">  
        <small>SESSION P/L</small>  
        <strong id="kwSessionPL">  
          +0.00  
        </strong>  
      </div>  

      <div class="kw-metric">  
        <small>TRADES</small>  
        <strong id="kwTradeCount">  
          0  
        </strong>  
      </div>  

    </div>  


    <div class="kw-execution-grid">  

      <button  
        id="kwTradeNow"  
        class="kw-trade-now">  
        ⚡ TRADE NOW  
      </button>  

      <button  
        id="kwAITradeNow"  
        class="kw-ai-trade">  
        🤖 AI TRADE NOW  
      </button>  

    </div>  


    <div class="kw-session-bar">  

      <span>  
        Engine:  
        <b id="kwEngineState">IDLE</b>  
      </span>  

      <span>  
        Account:  
        <b id="kwAccountMode">DEMO</b>  
      </span>  

      <span>  
        Balance:  
        <b id="kwBalance">—</b>  
      </span>  

    </div>  


    <div class="kw-auth-box">  

      <div class="kw-auth-title">  
        SECURE DERIV TRADING SESSION  
      </div>  

      <div class="kw-auth-description">  
        Paste a secure authenticated WebSocket URL generated  
        through Deriv authentication. Never put your API token  
        inside this GitHub file.  
      </div>  

      <div class="kw-auth-row">  

        <input  
          id="kwTradeWsUrl"  
          type="password"  
          autocomplete="off"  
          placeholder="wss://api.derivws.com/trading/v1/options/ws/demo?otp=...">  

        <button  
          id="kwConnectTrade"  
          class="kw-connect">  
          CONNECT  
        </button>  

        <button  
          id="kwDisconnectTrade"  
          class="kw-disconnect">  
          DISCONNECT  
        </button>  

      </div>  

    </div>  


    <div class="kw-active-box">  

      <div class="kw-active-title">  
        ACTIVE CONTRACTS  
      </div>  

      <div id="kwActiveContracts">  
        No active contracts.  
      </div>  

    </div>  


    <div  
      id="kwTradingMessage"  
      class="kw-message">  
      Analysis mode is active. Trading is locked until a  
      secure authenticated Deriv trading session is connected.  
    </div>  

  </div>  
`;  


if (notice && notice.parentNode) {  
  notice.parentNode.insertBefore(  
    wrapper,  
    notice  
  );  
} else {  
  document.body.appendChild(wrapper);  
}  


injectTradingStyles();  

bindTradingUI();  

loadRiskSettings();  

syncRiskInputs();  

renderRiskUI();

}

/* =======================================================
DYNAMIC CSS
Existing style.css remains untouched.
======================================================= */

function injectTradingStyles() {

if ($("kwTradingStyles")) {  
  return;  
}  

const style =  
  document.createElement("style");  

style.id = "kwTradingStyles";  

style.textContent = `  
  #krishwaveTradingCenter {  
    width: 100%;  
    margin: 24px 0;  
  }  

  .kw-trading-shell {  
    border-radius: 20px;  
    padding: 20px;  
    background:  
      linear-gradient(  
        145deg,  
        rgba(15,23,42,.98),  
        rgba(8,15,30,.98)  
      );  
    border: 1px solid rgba(56,189,248,.20);  
    box-shadow: 0 18px 45px rgba(0,0,0,.25);  
  }  

  .kw-trading-header {  
    display:flex;  
    align-items:center;  
    justify-content:space-between;  
    gap:16px;  
    margin-bottom:18px;  
  }  

  .kw-trading-title {  
    font-size:18px;  
    font-weight:900;  
    letter-spacing:.8px;  
  }  

  .kw-trading-subtitle {  
    margin-top:5px;  
    opacity:.65;  
    font-size:12px;  
  }  

  .kw-trade-status {  
    padding:8px 12px;  
    border-radius:999px;  
    font-size:11px;  
    font-weight:900;  
    background:rgba(245,158,11,.12);  
    border:1px solid rgba(245,158,11,.30);  
  }  

  .kw-account-row,  
  .kw-execution-grid,  
  .kw-auth-row {  
    display:grid;  
    grid-template-columns:repeat(3,1fr);  
    gap:10px;  
    margin-bottom:16px;  
  }  

  .kw-execution-grid {  
    grid-template-columns:1fr 1fr;  
  }  

  .kw-auth-row {  
    grid-template-columns:1fr auto auto;  
  }  

  .kw-mode,  
  .kw-action,  
  .kw-connect,  
  .kw-disconnect {  
    border:0;  
    border-radius:12px;  
    padding:12px;  
    font-weight:900;  
    cursor:pointer;  
  }  

  .kw-mode {  
    background:rgba(148,163,184,.10);  
    color:inherit;  
    border:1px solid rgba(148,163,184,.18);  
  }  

  .kw-mode.active {  
    background:rgba(34,197,94,.15);  
    border-color:rgba(34,197,94,.45);  
  }  

  .kw-action {  
    background:rgba(148,163,184,.08);  
    color:inherit;  
  }  

  .kw-risk-grid {  
    display:grid;  
    grid-template-columns:repeat(6,1fr);  
    gap:10px;  
    margin-bottom:16px;  
  }  

  .kw-risk-grid label {  
    display:flex;  
    flex-direction:column;  
    gap:7px;  
  }  

  .kw-risk-grid span {  
    font-size:10px;  
    font-weight:800;  
    opacity:.65;  
  }  

  .kw-risk-grid input,  
  .kw-auth-row input {  
    width:100%;  
    box-sizing:border-box;  
    padding:11px;  
    border-radius:10px;  
    border:1px solid rgba(148,163,184,.20);  
    background:rgba(2,6,23,.55);  
    color:inherit;  
    outline:none;  
  }  

  .kw-metrics {  
    display:grid;  
    grid-template-columns:repeat(4,1fr);  
    gap:10px;  
    margin-bottom:16px;  
  }  

  .kw-metric {  
    padding:14px;  
    border-radius:14px;  
    background:rgba(148,163,184,.06);  
    border:1px solid rgba(148,163,184,.12);  
  }  

  .kw-metric small {  
    display:block;  
    font-size:9px;  
    opacity:.6;  
    font-weight:900;  
  }  

  .kw-metric strong {  
    display:block;  
    margin-top:5px;  
    font-size:18px;  
  }  

  .kw-trade-now,  
  .kw-ai-trade {  
    border:0;  
    border-radius:14px;  
    padding:15px;  
    color:white;  
    font-size:14px;  
    font-weight:1000;  
    cursor:pointer;  
  }  

  .kw-trade-now {  
    background:linear-gradient(  
      135deg,  
      #16a34a,  
      #22c55e  
    );  
  }  

  .kw-ai-trade {  
    background:linear-gradient(  
      135deg,  
      #2563eb,  
      #7c3aed  
    );  
  }  

  .kw-trade-now:disabled,  
  .kw-ai-trade:disabled {  
    opacity:.45;  
    cursor:not-allowed;  
  }  

  .kw-session-bar {  
    display:flex;  
    flex-wrap:wrap;  
    gap:18px;  
    padding:12px 0;  
    font-size:11px;  
    opacity:.8;  
  }  

  .kw-auth-box,  
  .kw-active-box {  
    margin-top:14px;  
    padding:14px;  
    border-radius:14px;  
    background:rgba(2,6,23,.30);  
    border:1px solid rgba(148,163,184,.12);  
  }  

  .kw-auth-title,  
  .kw-active-title {  
    font-size:11px;  
    font-weight:900;  
    margin-bottom:7px;  
  }  

  .kw-auth-description {  
    font-size:11px;  
    line-height:1.5;  
    opacity:.6;  
    margin-bottom:10px;  
  }  

  .kw-connect {  
    background:#2563eb;  
    color:white;  
  }  

  .kw-disconnect {  
    background:#7f1d1d;  
    color:white;  
  }  

  .kw-message {  
    margin-top:14px;  
    padding:12px;  
    border-radius:12px;  
    font-size:11px;  
    line-height:1.5;  
    background:rgba(245,158,11,.08);  
    border:1px solid rgba(245,158,11,.20);  
  }  

  .kw-contract {  
    display:flex;  
    justify-content:space-between;  
    gap:10px;  
    padding:10px 0;  
    border-bottom:1px solid rgba(148,163,184,.10);  
    font-size:11px;  
  }  

  @media(max-width:900px) {  
    .kw-risk-grid {  
      grid-template-columns:repeat(3,1fr);  
    }  
  }  

  @media(max-width:600px) {  
    .kw-trading-shell {  
      padding:14px;  
    }  

    .kw-trading-header {  
      align-items:flex-start;  
      flex-direction:column;  
    }  

    .kw-account-row,  
    .kw-execution-grid,  
    .kw-auth-row {  
      grid-template-columns:1fr;  
    }  

    .kw-risk-grid {  
      grid-template-columns:repeat(2,1fr);  
    }  

    .kw-metrics {  
      grid-template-columns:repeat(2,1fr);  
    }  
  }  
`;  

document.head.appendChild(style);

}

/* =======================================================
TRADING UI EVENTS
======================================================= */

function bindTradingUI() {

$("kwDemoMode")?.addEventListener(  
  "click",  
  () => setAccountMode("demo")  
);  

$("kwRealMode")?.addEventListener(  
  "click",  
  () => setAccountMode("real")  
);  

$("kwResetMartingale")?.addEventListener(  
  "click",  
  resetMartingale  
);  

$("kwTradeNow")?.addEventListener(  
  "click",  
  () => executeCurrentSignal(false)  
);  

$("kwAITradeNow")?.addEventListener(  
  "click",  
  () => executeCurrentSignal(true)  
);  

$("kwConnectTrade")?.addEventListener(  
  "click",  
  connectTradingSocket  
);  

$("kwDisconnectTrade")?.addEventListener(  
  "click",  
  disconnectTradingSocket  
);  


const inputMap = {  
  kwBaseStake: "baseStake",  
  kwTakeProfit: "takeProfit",  
  kwStopLoss: "stopLoss",  
  kwMultiplier: "martingaleMultiplier",  
  kwMaxSteps: "maxMartingaleSteps",  
  kwMaxStake: "maxStake"  
};  


Object.entries(inputMap).forEach(  
  ([id, key]) => {  

    const input = $(id);  

    if (!input) {  
      return;  
    }  

    input.addEventListener(  
      "change",  
      () => {  

        let value =  
          number(  
            input.value,  
            state.risk[key]  
          );  

        if (  
          key === "baseStake" ||  
          key === "maxStake"  
        ) {  
          value =  
            Math.max(  
              CONFIG.MIN_STAKE,  
              value  
            );  
        }  

        if (  
          key === "takeProfit" ||  
          key === "stopLoss"  
        ) {  
          value =  
            Math.max(0, value);  
        }  

        if (  
          key === "martingaleMultiplier"  
        ) {  
          value =  
            Math.max(1, value);  
        }  

        if (  
          key === "maxMartingaleSteps"  
        ) {  
          value =  
            Math.max(  
              0,  
              Math.floor(value)  
            );  
        }  

        state.risk[key] = value;  

        if (key === "baseStake") {  
          state.risk.currentStake =  
            value;  
        }  

        saveRiskSettings();  

        renderRiskUI();  
      }  
    );  
  }  
);

}

/* =======================================================
ACCOUNT MODE
======================================================= */

function setAccountMode(mode) {

if (  
  mode !== "demo" &&  
  mode !== "real"  
) {  
  return;  
}  

if (mode === "real") {  

  const confirmed =  
    window.confirm(  
      "REAL ACCOUNT MODE\n\n" +  
      "Real trades can lose real money.\n\n" +  
      "Switch KRISHWAVE to REAL mode?"  
    );  

  if (!confirmed) {  
    return;  
  }  
}  

state.accountMode = mode;  

updateAccountModeUI();  

setMessage(  
  mode === "real"  
    ? "REAL mode selected. Every real TRADE NOW action requires confirmation."  
    : "DEMO mode selected."  
);

}

function updateAccountModeUI() {

$("kwDemoMode")?.classList.toggle(  
  "active",  
  state.accountMode === "demo"  
);  

$("kwRealMode")?.classList.toggle(  
  "active",  
  state.accountMode === "real"  
);  

setText(  
  "kwAccountMode",  
  state.accountMode.toUpperCase()  
);  

setText(  
  "accountModeStatus",  
  state.accountMode.toUpperCase()  
);  

setText(  
  "accountMode",  
  state.accountMode.toUpperCase()  
);

}

/* =======================================================
RISK ENGINE
======================================================= */

function syncRiskInputs() {

const values = {  
  kwBaseStake: state.risk.baseStake,  
  kwTakeProfit: state.risk.takeProfit,  
  kwStopLoss: state.risk.stopLoss,  
  kwMultiplier:  
    state.risk.martingaleMultiplier,  
  kwMaxSteps:  
    state.risk.maxMartingaleSteps,  
  kwMaxStake: state.risk.maxStake  
};  

Object.entries(values).forEach(  
  ([id, value]) => {  

    const input = $(id);  

    if (input) {  
      input.value = value;  
    }  
  }  
);

}

function renderRiskUI() {

setText(  
  "kwCurrentStake",  
  state.risk.currentStake.toFixed(2)  
);  

setText(  
  "kwMartingaleStep",  
  `${state.risk.martingaleStep} / ${state.risk.maxMartingaleSteps}`  
);  

setText(  
  "kwSessionPL",  
  money(state.risk.sessionPL)  
);  

setText(  
  "kwTradeCount",  
  String(state.tradeCount)  
);  

setText(  
  "kwEngineState",  
  state.engineState  
);  

setText(  
  "kwBalance",  
  state.balance === null  
    ? "—"  
    : `${state.balance.toFixed(2)} ${state.currency}`  
);  

const pl =  
  $("kwSessionPL");  

if (pl) {  
  pl.style.opacity =  
    state.risk.sessionPL < 0  
      ? "0.9"  
      : "1";  
}  

updateTradingButtons();  

renderActiveContracts();

}

function resetMartingale() {

state.risk.martingaleStep = 0;  

state.risk.currentStake =  
  Math.max(  
    CONFIG.MIN_STAKE,  
    state.risk.baseStake  
  );  

state.risk.sessionStopped = false;  

state.engineState = "READY";  

renderRiskUI();  

setMessage(  
  "Martingale reset. Current stake returned to base stake."  
);

}

function calculateNextStakeAfterLoss() {

if (  
  state.risk.martingaleStep >=  
  state.risk.maxMartingaleSteps  
) {  

  state.risk.currentStake =  
    state.risk.baseStake;  

  return;  
}  

const next =  
  state.risk.currentStake *  
  state.risk.martingaleMultiplier;  

if (  
  next >  
  state.risk.maxStake  
) {  

  state.risk.sessionStopped = true;  

  state.engineState =  
    "MAX STAKE PROTECTION";  

  setMessage(  
    "Trading stopped: next martingale stake would exceed maximum stake."  
  );  

  return;  
}  

state.risk.martingaleStep++;  

state.risk.currentStake =  
  Math.min(  
    next,  
    state.risk.maxStake  
  );

}

function processTradeResult(profit) {

const p = number(profit);  

state.risk.sessionPL += p;  

if (p > 0) {  

  state.risk.martingaleStep = 0;  

  state.risk.currentStake =  
    state.risk.baseStake;  

} else if (p < 0) {  

  calculateNextStakeAfterLoss();  
}  


checkSessionProtection();  

renderRiskUI();  

saveRiskSettings();

}

function checkSessionProtection() {

const pl =  
  state.risk.sessionPL;  


if (  
  state.risk.takeProfit > 0 &&  
  pl >= state.risk.takeProfit  
) {  

  state.risk.sessionStopped = true;  

  state.engineState =  
    "TAKE PROFIT HIT";  

  setMessage(  
    `Take Profit reached: ${pl.toFixed(2)}`  
  );  

  return;  
}  


if (  
  state.risk.stopLoss > 0 &&  
  pl <= -Math.abs(  
    state.risk.stopLoss  
  )  
) {  

  state.risk.sessionStopped = true;  

  state.engineState =  
    "STOP LOSS HIT";  

  setMessage(  
    `Stop Loss reached: ${pl.toFixed(2)}`  
  );  
}

}

/* =======================================================
TRADING VALIDATION
======================================================= */

function canTrade() {

if (!CONFIG.TRADING_ENABLED) {  

  setMessage(  
    "Trading is disabled in KRISHWAVE_CONFIG. " +  
    "Market analysis remains active."  
  );  

  return false;  
}  


if (!state.tradeConnected) {  

  setMessage(  
    "Trading session is not connected. " +  
    "Connect a secure authenticated Deriv trading WebSocket first."  
  );  

  return false;  
}  


if (!state.tradeAuthenticated) {  

  setMessage(  
    "Trading socket is not authenticated."  
  );  

  return false;  
}  


if (state.risk.sessionStopped) {  

  setMessage(  
    "Trading is stopped by the risk manager. Reset the session/martingale after reviewing the result."  
  );  

  return false;  
}  


if (  
  state.risk.currentStake <  
  CONFIG.MIN_STAKE  
) {  

  state.risk.currentStake =  
    CONFIG.MIN_STAKE;  
}  


if (  
  state.risk.currentStake >  
  state.risk.maxStake  
) {  

  setMessage(  
    "Trade blocked: current stake exceeds maximum stake."  
  );  

  return false;  
}  


if (  
  state.balance !== null &&  
  state.risk.currentStake >  
  state.balance  
) {  

  setMessage(  
    "Trade blocked: current stake is greater than available balance."  
  );  

  return false;  
}  


return true;

}

/* =======================================================
PUBLIC MARKET DATA
======================================================= */

function connectPublicSocket() {

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


try {  

  state.publicWs =  
    new WebSocket(  
      CONFIG.WS_URL  
    );  

} catch (error) {  

  console.error(  
    "Public WebSocket error:",  
    error  
  );  

  return;  
}  


state.publicWs.onopen = () => {  

  state.publicConnected = true;  

  updateConnectionUI();  

  subscribeSelectedMarket();  

  subscribeScannerMarkets();  
};  


state.publicWs.onmessage =  
  event => {  

    try {  

      const data =  
        JSON.parse(event.data);  

      handlePublicMessage(data);  

    } catch (error) {  

      console.error(  
        "Public message error:",  
        error  
      );  
    }  
  };  


state.publicWs.onclose = () => {  

  state.publicConnected = false;  

  updateConnectionUI();  

  setTimeout(  
    connectPublicSocket,  
    CONFIG.RECONNECT_DELAY  
  );  
};  


state.publicWs.onerror = error => {  

  console.error(  
    "Public WebSocket error:",  
    error  
  );  
};

}

function sendPublic(data) {

if (  
  !state.publicWs ||  
  state.publicWs.readyState !==  
  WebSocket.OPEN  
) {  
  return false;  
}  

state.publicWs.send(  
  JSON.stringify(data)  
);  

return true;

}

function subscribeSelectedMarket() {

sendPublic({  
  ticks: state.selectedSymbol,  
  subscribe: 1,  
  req_id: nextRequestId()  
});

}

function subscribeScannerMarkets() {

MARKETS.forEach(  
  market => {  

    sendPublic({  
      ticks: market.symbol,  
      subscribe: 1,  
      req_id: nextRequestId()  
    });  

  }  
);

}

function handlePublicMessage(data) {

if (data.error) {  

  console.warn(  
    "Deriv public error:",  
    data.error  
  );  

  return;  
}  


if (  
  data.msg_type === "tick" &&  
  data.tick  
) {  

  handleTick(  
    data.tick  
  );  
}

}

/* =======================================================
TICK ENGINE
======================================================= */

function handleTick(tick) {

const symbol =  
  tick.symbol;  

if (!symbol) {  
  return;  
}  


const quote =  
  number(  
    tick.quote,  
    NaN  
  );  

if (!Number.isFinite(quote)) {  
  return;  
}  


const digit =  
  extractLastDigit(  
    quote,  
    tick.pip_size  
  );  


state.liveTicks[symbol] = {  
  quote,  
  digit,  
  epoch:  
    number(  
      tick.epoch,  
      Date.now() / 1000  
    )  
};  


if (!state.history[symbol]) {  
  state.history[symbol] = [];  
}  


state.history[symbol].push({  
  quote,  
  digit,  
  epoch:  
    number(  
      tick.epoch,  
      Date.now() / 1000  
    )  
});  


if (  
  state.history[symbol].length >  
  CONFIG.MAX_HISTORY  
) {  

  state.history[symbol].splice(  
    0,  
    state.history[symbol].length -  
      CONFIG.MAX_HISTORY  
  );  
}  


if (  
  symbol === state.selectedSymbol  
) {  

  renderSelectedMarket();  

  renderDigitDistribution();  

  renderProbabilities();  

  updateStreamUI();  
}  


updateScannerMarket(  
  symbol  
);

}

function extractLastDigit(
quote,
pipSize
) {

const decimals =  
  Number.isFinite(  
    Number(pipSize)  
  )  
    ? Math.max(  
        0,  
        Math.floor(  
          Number(pipSize)  
        )  
      )  
    : 2;  


const text =  
  Number(quote).toFixed(  
    decimals  
  );  


const digits =  
  text.replace(  
    /\D/g,  
    ""  
  );  


if (!digits) {  
  return 0;  
}  


return Number(  
  digits.charAt(  
    digits.length - 1  
  )  
);

}

/* =======================================================
ANALYSIS
======================================================= */

function getRecent(symbol) {

return (  
  state.history[symbol] ||  
  []  
).slice(  
  -CONFIG.RECENT_WINDOW  
);

}

function analyzeSymbol(symbol) {

const samples =  
  getRecent(symbol);  


if (  
  samples.length <  
  CONFIG.MIN_SAMPLE  
) {  

  return {  
    symbol,  
    sample: samples.length,  
    ready: false,  
    confidence: 0,  
    strategy: "AUTO",  
    targetDigit: 5,  
    edge: 0,  
    reason:  
      "Collecting more tick data."  
  };  
}  


const counts =  
  Array(10).fill(0);  


samples.forEach(  
  item => {  

    counts[  
      clamp(  
        Math.floor(  
          number(  
            item.digit  
          )  
        ),  
        0,  
        9  
      )  
    ]++;  

  }  
);  


const total =  
  samples.length;  


const even =  
  counts.reduce(  
    (sum, count, digit) =>  
      sum +  
      (  
        digit % 2 === 0  
          ? count  
          : 0  
      ),  
    0  
  );  


const odd =  
  total - even;  


const high =  
  counts  
    .slice(5)  
    .reduce(  
      (a, b) => a + b,  
      0  
    );  


const low =  
  total - high;  


let bestDigit = 0;  
let bestCount = counts[0];  


counts.forEach(  
  (count, digit) => {  

    if (count > bestCount) {  

      bestCount = count;  

      bestDigit = digit;  
    }  
  }  
);  


const evenPct =  
  even / total * 100;  

const oddPct =  
  odd / total * 100;  

const highPct =  
  high / total * 100;  

const lowPct =  
  low / total * 100;  

const digitPct =  
  bestCount /  
  total *  
  100;  


const candidates = [  
  {  
    strategy: "EVEN",  
    edge:  
      Math.abs(  
        evenPct - 50  
      ),  
    confidence:  
      Math.max(  
        evenPct,  
        oddPct  
      ),  
    targetDigit: bestDigit,  
    reason:  
      `Even ${evenPct.toFixed(1)}% / Odd ${oddPct.toFixed(1)}%`  
  },  

  {  
    strategy: "HIGH",  
    edge:  
      Math.abs(  
        highPct - 50  
      ),  
    confidence:  
      Math.max(  
        highPct,  
        lowPct  
      ),  
    targetDigit: bestDigit,  
    reason:  
      `High ${highPct.toFixed(1)}% / Low ${lowPct.toFixed(1)}%`  
  },  

  {  
    strategy:  
      bestDigit >= 5  
        ? "OVER"  
        : "UNDER",  

    edge:  
      Math.abs(  
        digitPct - 10  
      ),  

    confidence:  
      clamp(  
        50 +  
          Math.abs(  
            digitPct - 10  
          ),  
        50,  
        CONFIG.MAX_CONFIDENCE  
      ),  

    targetDigit:  
      bestDigit,  

    reason:  
      `Digit ${bestDigit} frequency ${digitPct.toFixed(1)}%`  
  },  

  {  
    strategy:  
      digitPct >= 12  
        ? "MATCH"  
        : "DIFFER",  

    edge:  
      Math.max(  
        0,  
        digitPct - 10  
      ),  

    confidence:  
      clamp(  
        digitPct >= 12  
          ? 50 + digitPct  
          : 90 - digitPct,  
        50,  
        CONFIG.MAX_CONFIDENCE  
      ),  

    targetDigit:  
      bestDigit,  

    reason:  
      `Most frequent digit: ${bestDigit}`  
  }  
];  


candidates.sort(  
  (a, b) =>  
    b.confidence - a.confidence  
);  


const best =  
  candidates[0];  


return {  

  symbol,  

  sample: total,  

  ready: true,  

  confidence:  
    clamp(  
      best.confidence,  
      50,  
      CONFIG.MAX_CONFIDENCE  
    ),  

  strategy:  
    best.strategy,  

  targetDigit:  
    best.targetDigit,  

  edge:  
    best.edge,  

  reason:  
    best.reason,  

  counts,  

  evenPct,  

  oddPct,  

  highPct,  

  lowPct,  

  overPct:  
    100 -  
    (  
      counts  
        .slice(  
          0,  
          bestDigit + 1  
        )  
        .reduce(  
          (a, b) => a + b,  
          0  
        ) /  
      total *  
      100  
    ),  

  underPct:  
    100 -  
    (  
      counts  
        .slice(  
          bestDigit  
        )  
        .reduce(  
          (a, b) => a + b,  
          0  
        ) /  
      total *  
      100  
    ),  

  digitPct  
};

}

/* =======================================================
AI SIGNAL
======================================================= */

function getCurrentAIResult() {

const result =  
  analyzeSymbol(  
    state.selectedSymbol  
  );  


if (  
  state.selectedStrategy !==  
  "AUTO"  
) {  

  result.strategy =  
    state.selectedStrategy;  

  result.targetDigit =  
    state.targetDigit;  

  result.confidence =  
    calculateStrategyConfidence(  
      state.selectedStrategy,  
      result  
    );  
}  


return result;

}

function calculateStrategyConfidence(
strategy,
result
) {

if (!result.ready) {  
  return 0;  
}  


switch (strategy) {  

  case "EVEN":  
    return clamp(  
      result.evenPct,  
      50,  
      CONFIG.MAX_CONFIDENCE  
    );  

  case "ODD":  
    return clamp(  
      result.oddPct,  
      50,  
      CONFIG.MAX_CONFIDENCE  
    );  

  case "HIGH":  
    return clamp(  
      result.highPct,  
      50,  
      CONFIG.MAX_CONFIDENCE  
    );  

  case "LOW":  
    return clamp(  
      result.lowPct,  
      50,  
      CONFIG.MAX_CONFIDENCE  
    );  

  default:  
    return result.confidence;  
}

}

/* =======================================================
AI ENGINE
======================================================= */

function startAIEngine() {

if (state.aiRunning) {  
  return;  
}  


state.aiRunning = true;  

state.engineState =  
  "ANALYZING";  


clearTimeout(  
  state.aiTimer  
);  

clearInterval(  
  state.countdownTimer  
);  


runAIAnalysisCycle();  

updateAIButtons();

}

function stopAIEngine() {

state.aiRunning = false;  

clearTimeout(  
  state.aiTimer  
);  

clearInterval(  
  state.countdownTimer  
);  


state.engineState =  
  "STOPPED";  


setText(  
  "aiCountdown",  
  "OFF"  
);  

setText(  
  "aiCircleStatus",  
  "STOPPED"  
);  

setText(  
  "engineState",  
  "STOPPED"  
);  

updateAIButtons();

}

function runAIAnalysisCycle() {

if (!state.aiRunning) {  
  return;  
}  


state.engineState =  
  "ANALYZING";  


state.analysisStartedAt =  
  Date.now();  


let seconds =  
  CONFIG.ANALYSIS_SECONDS;  


setText(  
  "aiCountdown",  
  seconds  
);  

setText(  
  "aiCircleStatus",  
  "ANALYZING"  
);  


const result =  
  getCurrentAIResult();  


renderAIResult(  
  result  
);  


clearInterval(  
  state.countdownTimer  
);  


state.countdownTimer =  
  setInterval(  
    () => {  

      if (!state.aiRunning) {  
        return;  
      }  


      seconds--;  


      setText(  
        "aiCountdown",  
        seconds  
      );  


      if (  
        seconds <= 0  
      ) {  

        clearInterval(  
          state.countdownTimer  
        );  


        startEntryCountdown(  
          result  
        );  
      }  

    },  
    1000  
  );

}

function startEntryCountdown(
result
) {

if (!state.aiRunning) {  
  return;  
}  


let seconds =  
  CONFIG.COUNTDOWN_SECONDS;  


state.engineState =  
  "ENTRY COUNTDOWN";  


setText(  
  "aiCircleStatus",  
  "ENTRY"  
);  


setText(  
  "aiCountdown",  
  seconds  
);  


clearInterval(  
  state.countdownTimer  
);  


state.countdownTimer =  
  setInterval(  
    () => {  

      if (!state.aiRunning) {  
        return;  
      }  


      seconds--;  


      setText(  
        "aiCountdown",  
        seconds  
      );  


      if (  
        seconds <= 0  
      ) {  

        clearInterval(  
          state.countdownTimer  
        );  


        fireTradeSignal(  
          result  
        );  
      }  

    },  
    1000  
  );

}

function fireTradeSignal(
result
) {

if (!result || !result.ready) {  

  setMessage(  
    "AI signal not ready."  
  );  

  scheduleNextAI();  

  return;  
}  


state.lastTrade = {  
  ...result,  
  createdAt: Date.now()  
};  


state.lastAction =  
  `TRADE NOW: ${result.strategy}`;  


state.engineState =  
  "TRADE SIGNAL";  


renderAIResult(  
  result,  
  true  
);  


setText(  
  "lastAction",  
  state.lastAction  
);  


scheduleNextAI();

}

function scheduleNextAI() {

if (!state.aiRunning) {  
  return;  
}  


state.aiTimer =  
  setTimeout(  
    runAIAnalysisCycle,  
    1200  
  );

}

/* =======================================================
AI RENDER
======================================================= */

function renderAIResult(
result,
tradeSignal = false
) {

const strategy =  
  result.strategy ||  
  "AUTO";  


setText(  
  "aiPrediction",  
  strategy  
);  

setText(  
  "aiConfidence",  
  `${number(  
    result.confidence  
  ).toFixed(1)}%`  
);  

setText(  
  "aiTarget",  
  String(  
    result.targetDigit ?? "-"  
  )  
);  

setText(  
  "aiSample",  
  String(  
    result.sample || 0  
  )  
);  

setText(  
  "aiEdge",  
  `${number(  
    result.edge  
  ).toFixed(1)}`  
);  

setText(  
  "aiReason",  
  result.reason ||  
  "Waiting for more market data."  
);  


setText(  
  "aiPredictionResult",  
  strategy  
);  

setText(  
  "aiResultMain",  
  strategy  
);  

setText(  
  "aiResultConfidence",  
  `${number(  
    result.confidence  
  ).toFixed(1)}%`  
);  

setText(  
  "aiResultStatus",  
  tradeSignal  
    ? "TRADE NOW"  
    : "ANALYSIS"  
);  


setText(  
  "selectedSymbol",  
  result.symbol ||  
  state.selectedSymbol  
);  

setText(  
  "selectedMarketName",  
  marketName(  
    result.symbol ||  
    state.selectedSymbol  
  )  
);  

setText(  
  "selectedSample",  
  String(  
    result.sample || 0  
  )  
);  

setText(  
  "selectedEdge",  
  `${number(  
    result.edge  
  ).toFixed(1)}`  
);  

setText(  
  "selectedQuality",  
  result.confidence >= 70  
    ? "STRONG"  
    : "WATCH"  
);  

setText(  
  "selectedStrategy",  
  strategy  
);

}

/* =======================================================
TRADE NOW
======================================================= */

function executeCurrentSignal(
fromAI
) {

const result =  
  fromAI  
    ? (  
        state.lastTrade ||  
        getCurrentAIResult()  
      )  
    : getCurrentAIResult();  


if (!result || !result.ready) {  

  setMessage(  
    "Not enough market data for a trade signal."  
  );  

  return;  
}  


executeTrade(  
  result,  
  fromAI  
);

}

function executeTrade(
result,
fromAI = false
) {

if (!canTrade()) {  
  return;  
}  


if (  
  state.accountMode ===  
  "real"  
) {  

  const confirmed =  
    window.confirm(  
      "⚠️ REAL ACCOUNT TRADE\n\n" +  
      `Market: ${result.symbol}\n` +  
      `Strategy: ${result.strategy}\n` +  
      `Stake: ${state.risk.currentStake.toFixed(2)} ${state.currency}\n` +  
      `AI confidence: ${number(result.confidence).toFixed(1)}%\n\n` +  
      "This can use REAL MONEY.\n\n" +  
      "Continue with this trade?"  
    );  


  if (!confirmed) {  

    setMessage(  
      "Real trade cancelled."  
    );  

    return;  
  }  
}  


state.engineState =  
  "REQUESTING PROPOSAL";  


setText(  
  "lastAction",  
  fromAI  
    ? "AI TRADE NOW"  
    : "TRADE NOW"  
);  


requestProposal(  
  result  
);

}

/* =======================================================
CONTRACT MAPPING
======================================================= */

function strategyToContract(
result
) {

const strategy =  
  result.strategy;  


switch (strategy) {  

  case "EVEN":  
    return {  
      contract_type:  
        "DIGITEVEN"  
    };  


  case "ODD":  
    return {  
      contract_type:  
        "DIGITODD"  
    };  


  case "HIGH":  
    return {  
      contract_type:  
        "DIGITOVER",  
      barrier: 4  
    };  


  case "LOW":  
    return {  
      contract_type:  
        "DIGITUNDER",  
      barrier: 5  
    };  


  case "OVER":  
    return {  
      contract_type:  
        "DIGITOVER",  
      barrier:  
        clamp(  
          number(  
            result.targetDigit,  
            4  
          ),  
          0,  
          8  
        )  
    };  


  case "UNDER":  
    return {  
      contract_type:  
        "DIGITUNDER",  
      barrier:  
        clamp(  
          number(  
            result.targetDigit,  
            5  
          ),  
          1,  
          9  
        )  
    };  


  case "MATCH":  
    return {  
      contract_type:  
        "DIGITMATCH",  
      barrier:  
        clamp(  
          number(  
            result.targetDigit,  
            5  
          ),  
          0,  
          9  
        )  
    };  


  case "DIFFER":  
    return {  
      contract_type:  
        "DIGITDIFF",  
      barrier:  
        clamp(  
          number(  
            result.targetDigit,  
            5  
          ),  
          0,  
          9  
        )  
    };  


  case "RISE":  
    return {  
      contract_type:  
        "CALL"  
    };  


  case "FALL":  
    return {  
      contract_type:  
        "PUT"  
    };  


  default:  
    return null;  
}

}

/* =======================================================
TRADING SOCKET
======================================================= */

function connectTradingSocket() {

const url =  
  $("kwTradeWsUrl")?.value.trim();  


if (!url) {  

  setMessage(  
    "Enter a secure authenticated Deriv WebSocket URL first."  
  );  

  return;  
}  


if (  
  !url.startsWith(  
    "wss://"  
  )  
) {  

  setMessage(  
    "Invalid trading WebSocket URL."  
  );  

  return;  
}  


disconnectTradingSocket();  


try {  

  state.tradeWs =  
    new WebSocket(url);  

} catch (error) {  

  console.error(error);  

  setMessage(  
    "Could not create trading WebSocket."  
  );  

  return;  
}  


state.engineState =  
  "CONNECTING";  


setText(  
  "kwTradeConnection",  
  "CONNECTING"  
);  


state.tradeWs.onopen =  
  () => {  

    state.tradeConnected = true;  

    state.tradeAuthenticated =  
      true;  

    state.accountConnected =  
      true;  

    state.engineState =  
      "READY";  

    updateTradingConnectionUI();  

    requestBalance();  

    setMessage(  
      "Authenticated Deriv trading session connected."  
    );  
  };  


state.tradeWs.onmessage =  
  event => {  

    try {  

      const data =  
        JSON.parse(  
          event.data  
        );  

      handleTradingMessage(  
        data  
      );  

    } catch (error) {  

      console.error(  
        "Trading message error:",  
        error  
      );  
    }  
  };  


state.tradeWs.onerror =  
  error => {  

    console.error(  
      "Trading socket error:",  
      error  
    );  

    setMessage(  
      "Trading WebSocket error."  
    );  
  };  


state.tradeWs.onclose =  
  () => {  

    state.tradeConnected =  
      false;  

    state.tradeAuthenticated =  
      false;  

    state.accountConnected =  
      false;  

    state.engineState =  
      "TRADING DISCONNECTED";  

    updateTradingConnectionUI();  
  };

}

function disconnectTradingSocket() {

if (state.tradeWs) {  

  try {  
    state.tradeWs.close();  
  } catch (_) {}  
}  


state.tradeWs = null;  

state.tradeConnected =  
  false;  

state.tradeAuthenticated =  
  false;  

state.accountConnected =  
  false;  

state.engineState =  
  "ANALYSIS ONLY";  

updateTradingConnectionUI();

}

function sendTrade(data) {

if (  
  !state.tradeWs ||  
  state.tradeWs.readyState !==  
  WebSocket.OPEN  
) {  

  return false;  
}  


state.tradeWs.send(  
  JSON.stringify(data)  
);  

return true;

}

function requestBalance() {

sendTrade({  
  balance: 1,  
  subscribe: 1,  
  req_id: nextRequestId()  
});

}

/* =======================================================
PROPOSAL
======================================================= */

function requestProposal(
result
) {

const contract =  
  strategyToContract(  
    result  
  );  


if (!contract) {  

  setMessage(  
    `Strategy ${result.strategy} is not supported for execution.`  
  );  

  return;  
}  


const stake =  
  clamp(  
    number(  
      state.risk.currentStake,  
      CONFIG.MIN_STAKE  
    ),  
    CONFIG.MIN_STAKE,  
    state.risk.maxStake  
  );  


const reqId =  
  nextRequestId();  


const proposal = {  
  proposal: 1,  

  amount: stake,  

  basis: "stake",  

  contract_type:  
    contract.contract_type,  

  currency:  
    state.currency ||  
    "USD",  

  duration: 1,  

  duration_unit: "t",  

  underlying_symbol:  
    result.symbol,  

  subscribe: 0,  

  req_id: reqId  
};  


if (  
  contract.barrier !==  
  undefined  
) {  

  proposal.barrier =  
    String(  
      contract.barrier  
    );  
}  


state.engineState =  
  "PROPOSAL REQUESTED";  


setMessage(  
  `Requesting ${result.strategy} proposal for ${result.symbol} at stake ${stake.toFixed(2)}.`  
);  


sendTrade(  
  proposal  
);

}

/* =======================================================
TRADING MESSAGE HANDLER
======================================================= */

function handleTradingMessage(
data
) {

if (data.error) {  

  state.engineState =  
    "TRADE ERROR";  

  setMessage(  
    data.error.message ||  
    "Deriv trading error."  
  );  

  renderRiskUI();  

  return;  
}  


switch (data.msg_type) {  

  case "balance":  

    handleBalance(  
      data  
    );  

    break;  


  case "proposal":  

    handleProposal(  
      data  
    );  

    break;  


  case "buy":  

    handleBuy(  
      data  
    );  

    break;  


  case "proposal_open_contract":  

    handleContractUpdate(  
      data  
    );  

    break;  


  default:  
    break;  
}

}

function handleBalance(
data
) {

const balance =  
  data.balance;  


if (!balance) {  
  return;  
}  


state.balance =  
  number(  
    balance.balance,  
    state.balance  
  );  


state.currency =  
  balance.currency ||  
  state.currency;  


if (  
  state.risk.sessionStartBalance ===  
  null  
) {  

  state.risk.sessionStartBalance =  
    state.balance;  
}  


renderRiskUI();

}

function handleProposal(
data
) {

const proposal =  
  data.proposal;  


if (!proposal) {  

  setMessage(  
    "Proposal response did not contain a proposal."  
  );  

  return;  
}  


const proposalId =  
  proposal.id;  


const askPrice =  
  number(  
    proposal.ask_price,  
    state.risk.currentStake  
  );  


if (!proposalId) {  

  setMessage(  
    "No proposal ID returned."  
  );  

  return;  
}  


state.engineState =  
  "BUYING";  


const sent =  
  sendTrade({  
    buy: proposalId,  
    price: askPrice,  
    req_id:  
      nextRequestId()  
  });  


if (!sent) {  

  setMessage(  
    "Trading socket disconnected before buy."  
  );  
}

}

/* =======================================================
BUY
======================================================= */

function handleBuy(
data
) {

const buy =  
  data.buy;  


if (!buy) {  

  setMessage(  
    "Buy response was empty."  
  );  

  return;  
}  


const contractId =  
  buy.contract_id;  


state.tradeCount++;  


state.lastAction =  
  `BOUGHT ${contractId}`;  


state.engineState =  
  "CONTRACT ACTIVE";  


state.activeContracts.set(  
  String(contractId),  
  {  
    contractId,  
    symbol:  
      buy.underlying_symbol ||  
      state.selectedSymbol,  
    stake:  
      number(  
        buy.buy_price,  
        state.risk.currentStake  
      ),  
    purchaseTime:  
      buy.purchase_time,  
    profit: 0,  
    status: "OPEN"  
  }  
);  


renderRiskUI();  


setMessage(  
  `Contract ${contractId} purchased. Monitoring result...`  
);  


sendTrade({  
  proposal_open_contract: 1,  
  contract_id:  
    contractId,  
  subscribe: 1,  
  req_id:  
    nextRequestId()  
});

}

/* =======================================================
CONTRACT MONITOR
======================================================= */

function handleContractUpdate(
data
) {

const contract =  
  data.proposal_open_contract;  


if (!contract) {  
  return;  
}  


const id =  
  String(  
    contract.contract_id  
  );  


const local =  
  state.activeContracts.get(  
    id  
  );  


if (!local) {  

  state.activeContracts.set(  
    id,  
    {  
      contractId:  
        contract.contract_id,  
      symbol:  
        state.selectedSymbol,  
      stake:  
        number(  
          contract.buy_price,  
          state.risk.currentStake  
        ),  
      profit: 0,  
      status:  
        contract.status ||  
        "OPEN"  
    }  
  );  
}  


const record =  
  state.activeContracts.get(  
    id  
  );  


record.profit =  
  number(  
    contract.profit,  
    record.profit  
  );  


record.status =  
  contract.status ||  
  (  
    contract.is_sold  
      ? "CLOSED"  
      : "OPEN"  
  );  


record.currentSpot =  
  contract.current_spot;  


record.exitSpot =  
  contract.exit_spot;  


renderActiveContracts();  


if (  
  contract.is_sold === true ||  
  record.status === "won" ||  
  record.status === "lost" ||  
  record.status === "sold"  
) {  

  finalizeContract(  
    id,  
    record,  
    contract  
  );  
}

}

function finalizeContract(
id,
record,
contract
) {

if (  
  record.finalized  
) {  
  return;  
}  


record.finalized = true;  


const profit =  
  number(  
    contract.profit,  
    record.profit  
  );  


processTradeResult(  
  profit  
);  


if (profit > 0) {  

  record.result =  
    "WIN";  

} else if (profit < 0) {  

  record.result =  
    "LOSS";  

} else {  

  record.result =  
    "BREAK EVEN";  
}  


record.status =  
  "CLOSED";  


state.lastAction =  
  `${record.result}: ${money(profit)}`;  


state.engineState =  
  record.result;  


setMessage(  
  `${record.result} — P/L ${money(profit)}`  
);  


setTimeout(  
  () => {  

    state.activeContracts.delete(  
      id  
    );  

    renderActiveContracts();  

  },  
  5000  
);  


renderRiskUI();

}

/* =======================================================
ACTIVE CONTRACT DISPLAY
======================================================= */

function renderActiveContracts() {

const container =  
  $("kwActiveContracts");  


if (!container) {  
  return;  
}  


if (  
  state.activeContracts.size ===  
  0  
) {  

  container.innerHTML =  
    "No active contracts.";  

  return;  
}  


container.innerHTML =  
  Array.from(  
    state.activeContracts.values()  
  )  
    .map(  
      contract => `  
        <div class="kw-contract">  

          <span>  
            #${escapeHTML(  
              contract.contractId  
            )}  
            •  
            ${escapeHTML(  
              contract.symbol  
            )}  
          </span>  

          <span>  
            ${escapeHTML(  
              contract.status  
            )}  
            |  
            P/L:  
            ${number(  
              contract.profit  
            ).toFixed(2)}  
          </span>  

        </div>  
      `  
    )  
    .join("");

}

/* =======================================================
SCANNER
======================================================= */

function updateScannerMarket(
symbol
) {

const result =  
  analyzeSymbol(symbol);  


const existing =  
  state.scanResults.find(  
    item =>  
      item.symbol === symbol  
  );  


if (existing) {  

  Object.assign(  
    existing,  
    result  
  );  

} else {  

  state.scanResults.push(  
    result  
  );  
}  


state.scanResults.sort(  
  (a, b) =>  
    number(b.confidence) -  
    number(a.confidence)  
);  


renderScanner();

}

function renderScanner() {

const container =  
  $("marketScannerList");  


if (!container) {  
  return;  
}  


const results =  
  state.scanResults  
    .slice(  
      0,  
      CONFIG.MAX_MARKETS  
    );  


if (!results.length) {  

  container.innerHTML =  
    `<div>No market data yet...</div>`;  

  return;  
}  


container.innerHTML =  
  results  
    .map(  
      result => {  

        const selected =  
          result.symbol ===  
          state.selectedSymbol;  


        return `  
          <button  
            type="button"  
            class="market-card ${  
              selected  
                ? "selected"  
                : ""  
            }"  
            data-symbol="${escapeHTML(  
              result.symbol  
            )}">  

            <div>  
              <strong>  
                ${escapeHTML(  
                  marketName(  
                    result.symbol  
                  )  
                )}  
              </strong>  

              <small>  
                ${escapeHTML(  
                  result.symbol  
                )}  
              </small>  
            </div>  

            <div>  
              <b>  
                ${  
                  result.ready  
                    ? escapeHTML(  
                        result.strategy  
                      )  
                    : "LOADING"  
                }  
              </b>  

              <small>  
                ${  
                  result.ready  
                    ? `${number(  
                        result.confidence  
                      ).toFixed(1)}%`  
                    : `${result.sample}/${CONFIG.MIN_SAMPLE}`  
                }  
              </small>  
            </div>  

          </button>  
        `;  
      }  
    )  
    .join("");  


qa(  
  "#marketScannerList [data-symbol]"  
).forEach(  
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


setText(  
  "marketCount",  
  String(  
    state.scanResults.length  
  )  
);  

setText(  
  "connectedMarkets",  
  String(  
    state.scanResults.length  
  )  
);

}

function selectMarket(
symbol
) {

if (  
  !MARKETS.some(  
    market =>  
      market.symbol === symbol  
  )  
) {  
  return;  
}  


state.selectedSymbol =  
  symbol;  


state.targetDigit =  
  getLatestDigit(  
    symbol  
  );  


subscribeSelectedMarket();  

renderSelectedMarket();  

renderDigitDistribution();  

renderProbabilities();  

updateStreamUI();  

renderScanner();

}

/* =======================================================
SELECTED MARKET
======================================================= */

function renderSelectedMarket() {

const symbol =  
  state.selectedSymbol;  


const live =  
  state.liveTicks[symbol];  


const analysis =  
  analyzeSymbol(  
    symbol  
  );  


setText(  
  "selectedSymbol",  
  symbol  
);  

setText(  
  "selectedMarketName",  
  marketName(symbol)  
);  

setText(  
  "selectedQuote",  
  live  
    ? String(live.quote)  
    : "—"  
);  

setText(  
  "selectedDigit",  
  live  
    ? String(live.digit)  
    : "—"  
);  

setText(  
  "selectedSample",  
  String(  
    analysis.sample  
  )  
);  

setText(  
  "selectedEdge",  
  analysis.ready  
    ? analysis.edge.toFixed(1)  
    : "—"  
);  

setText(  
  "selectedQuality",  
  analysis.ready  
    ? (  
        analysis.confidence >= 70  
          ? "STRONG"  
          : "WATCH"  
      )  
    : "LOADING"  
);

}

function updateStreamUI() {

const live =  
  state.liveTicks[  
    state.selectedSymbol  
  ];  


setText(  
  "liveSymbol",  
  state.selectedSymbol  
);  

setText(  
  "streamQuote",  
  live  
    ? String(live.quote)  
    : "—"  
);  

setText(  
  "streamDigit",  
  live  
    ? String(live.digit)  
    : "—"  
);

}

/* =======================================================
DIGIT DISTRIBUTION
======================================================= */

function renderDigitDistribution() {

const samples =  
  getRecent(  
    state.selectedSymbol  
  );  


const counts =  
  Array(10).fill(0);  


samples.forEach(  
  item => {  

    const digit =  
      clamp(  
        Math.floor(  
          number(  
            item.digit  
          )  
        ),  
        0,  
        9  
      );  

    counts[digit]++;  
  }  
);  


const max =  
  Math.max(  
    1,  
    ...counts  
  );  


counts.forEach(  
  (count, digit) => {  

    const el =  
      $(`digit${digit}`);  


    if (!el) {  
      return;  
    }  


    const percent =  
      samples.length  
        ? count /  
          samples.length *  
          100  
        : 0;  


    const value =  
      el.querySelector(  
        ".digit-value"  
      );  


    if (value) {  

      value.textContent =  
        `${percent.toFixed(1)}%`;  
    }  


    const bar =  
      el.querySelector(  
        ".digit-bar"  
      );  


    if (bar) {  

      bar.style.width =  
        `${count / max * 100}%`;  
    }  


    if (  
      el.tagName ===  
      "INPUT"  
    ) {  
      el.value = count;  
    }  
  }  
);

}

/* =======================================================
PROBABILITIES
======================================================= */

function renderProbabilities() {

const result =  
  analyzeSymbol(  
    state.selectedSymbol  
  );  


setText(  
  "evenPercent",  
  `${number(  
    result.evenPct  
  ).toFixed(1)}%`  
);  

setText(  
  "oddPercent",  
  `${number(  
    result.oddPct  
  ).toFixed(1)}%`  
);  

setText(  
  "highPercent",  
  `${number(  
    result.highPct  
  ).toFixed(1)}%`  
);  

setText(  
  "lowPercent",  
  `${number(  
    result.lowPct  
  ).toFixed(1)}%`  
);  

setText(  
  "overPercent",  
  `${number(  
    result.overPct  
  ).toFixed(1)}%`  
);  

setText(  
  "underPercent",  
  `${number(  
    result.underPct  
  ).toFixed(1)}%`  
);  


const match =  
  result.ready  
    ? result.digitPct  
    : 0;  


const differ =  
  result.ready  
    ? 100 - result.digitPct  
    : 0;  


setText(  
  "matchPercent",  
  `${match.toFixed(1)}%`  
);  

setText(  
  "differPercent",  
  `${differ.toFixed(1)}%`  
);  


const samples =  
  getRecent(  
    state.selectedSymbol  
  );  


if (samples.length >= 2) {  

  const last =  
    samples[  
      samples.length - 1  
    ];  

  const previous =  
    samples[  
      samples.length - 2  
    ];  


  const rise =  
    last.quote >  
    previous.quote  
      ? 100  
      : 0;  


  const fall =  
    100 - rise;  


  setText(  
    "risePercent",  
    `${rise.toFixed(1)}%`  
  );  

  setText(  
    "fallPercent",  
    `${fall.toFixed(1)}%`  
  );  

} else {  

  setText(  
    "risePercent",  
    "—"  
  );  

  setText(  
    "fallPercent",  
    "—"  
  );  
}

}

/* =======================================================
STRATEGY UI
======================================================= */

function bindStrategyUI() {

qa(  
  ".strategy-button[data-strategy]"  
).forEach(  
  button => {  

    button.addEventListener(  
      "click",  
      () => {  

        const strategy =  
          button.dataset.strategy;  

        if (!strategy) {  
          return;  
        }  


        state.selectedStrategy =  
          strategy;  


        state.targetDigit =  
          getLatestDigit(  
            state.selectedSymbol  
          );  


        updateStrategyUI();  

        renderAIResult(  
          getCurrentAIResult()  
        );  
      }  
    );  
  }  
);  


$("strategyCurrentButton")  
  ?.addEventListener(  
    "click",  
    () => {  

      $("strategyMenu")  
        ?.classList.toggle(  
          "open"  
        );  
    }  
  );

}

function updateStrategyUI() {

const strategy =  
  STRATEGIES[  
    state.selectedStrategy  
  ] ||  
  STRATEGIES.AUTO;  


setText(  
  "strategyCurrentIcon",  
  strategy.icon  
);  

setText(  
  "strategyCurrentName",  
  strategy.name  
);  

qa(  
  ".strategy-button[data-strategy]"  
).forEach(  
  button => {  

    button.classList.toggle(  
      "active",  
      button.dataset.strategy ===  
      state.selectedStrategy  
    );  
  }  
);

}

/* =======================================================
ACCOUNT UI
======================================================= */

function bindAccountUI() {

$("accountDemo")  
  ?.addEventListener(  
    "click",  
    () => setAccountMode("demo")  
  );  


$("accountReal")  
  ?.addEventListener(  
    "click",  
    () => setAccountMode("real")  
  );  


$("connectAccount")  
  ?.addEventListener(  
    "click",  
    () => {  

      setMessage(  
        "For trading, use the secure trading-session connector in the Trading Control Center."  
      );  
    }  
  );  


$("disconnectAccount")  
  ?.addEventListener(  
    "click",  
    disconnectTradingSocket  
  );

}

/* =======================================================
UI CONNECTION
======================================================= */

function updateConnectionUI() {

const connected =  
  state.publicConnected;  


const pill =  
  q(".connection-pill");  


if (pill) {  

  pill.textContent =  
    connected  
      ? "LIVE DATA"  
      : "CONNECTING";  

  pill.classList.toggle(  
    "connected",  
    connected  
  );  
}  


setText(  
  "accountStatus",  
  state.accountConnected  
    ? "CONNECTED"  
    : "ANALYSIS"  
);  


setText(  
  "accountMode",  
  state.accountMode.toUpperCase()  
);  


setText(  
  "accountTypeLabel",  
  state.accountMode.toUpperCase()  
);  


setText(  
  "accountId",  
  state.accountId ||  
  "Not connected"  
);  


setText(  
  "accountBalance",  
  state.balance === null  
    ? "—"  
    : state.balance.toFixed(2)  
);  


setText(  
  "accountCurrency",  
  state.currency  
);

}

function updateTradingConnectionUI() {

const connected =  
  state.tradeConnected &&  
  state.tradeAuthenticated;  


setText(  
  "kwTradeConnection",  
  connected  
    ? "TRADING CONNECTED"  
    : "ANALYSIS ONLY"  
);  


setText(  
  "accountStatus",  
  connected  
    ? "CONNECTED"  
    : "ANALYSIS"  
);  


setText(  
  "accountId",  
  state.accountId ||  
  (  
    connected  
      ? "AUTHENTICATED"  
      : "Not connected"  
  )  
);  


setText(  
  "accountBalance",  
  state.balance === null  
    ? "—"  
    : state.balance.toFixed(2)  
);  


setText(  
  "accountCurrency",  
  state.currency  
);  


updateConnectionUI();  

renderRiskUI();

}

/* =======================================================
BUTTON STATE
======================================================= */

function updateTradingButtons() {

const allowed =  
  CONFIG.TRADING_ENABLED &&  
  state.tradeConnected &&  
  state.tradeAuthenticated &&  
  !state.risk.sessionStopped;  


if ($("kwTradeNow")) {  
  $("kwTradeNow").disabled =  
    !allowed;  
}  


if ($("kwAITradeNow")) {  
  $("kwAITradeNow").disabled =  
    !allowed;  
}

}

function updateAIButtons() {

const start =  
  $("startAiEngine");  

const stop =  
  $("stopAiEngine");  


if (start) {  
  start.disabled =  
    state.aiRunning;  
}  


if (stop) {  
  stop.disabled =  
    !state.aiRunning;  
}

}

/* =======================================================
UTILITIES
======================================================= */

function nextRequestId() {

state.requestId++;  

return state.requestId;

}

function marketName(symbol) {

const market =  
  MARKETS.find(  
    item =>  
      item.symbol === symbol  
  );  


return market  
  ? market.name  
  : symbol;

}

function getLatestDigit(symbol) {

return (  
  state.liveTicks[symbol]  
    ?.digit ??  
  5  
);

}

function setMessage(
message
) {

setText(  
  "kwTradingMessage",  
  message  
);

}

/* =======================================================
SCAN BUTTON
======================================================= */

function bindScannerUI() {

$("scanAll")  
  ?.addEventListener(  
    "click",  
    scanAllMarkets  
  );

}

function scanAllMarkets() {

state.scanning = true;  

state.scanResults = [];  


MARKETS.forEach(  
  market => {  

    const result =  
      analyzeSymbol(  
        market.symbol  
      );  

    state.scanResults.push(  
      result  
    );  
  }  
);  


state.scanResults.sort(  
  (a, b) =>  
    number(b.confidence) -  
    number(a.confidence)  
);  


renderScanner();  

state.scanning = false;

}

/* =======================================================
THEME
======================================================= */

function bindTheme() {

const themeButton =  
  q(  
    "#themeToggle, #themeButton, [data-theme-toggle]"  
  );  


if (!themeButton) {  
  return;  
}  


themeButton.addEventListener(  
  "click",  
  () => {  

    document.body.classList.toggle(  
      "light-mode"  
    );  

    const light =  
      document.body.classList.contains(  
        "light-mode"  
      );  

    localStorage.setItem(  
      "KRISHWAVE_THEME",  
      light  
        ? "light"  
        : "dark"  
    );  
  }  
);  


const saved =  
  localStorage.getItem(  
    "KRISHWAVE_THEME"  
  );  


if (  
  saved === "light"  
) {  

  document.body.classList.add(  
    "light-mode"  
  );  
}

}

/* =======================================================
INIT
======================================================= */

function init() {

if (state.initialized) {  
  return;  
}  


state.initialized = true;  


loadRiskSettings();  

createTradingUI();  

bindStrategyUI();  

bindAccountUI();  

bindScannerUI();  

bindTheme();  


updateAccountModeUI();  

updateStrategyUI();  

updateConnectionUI();  

updateTradingConnectionUI();  

updateAIButtons();  

renderRiskUI();  


/* AI buttons */  

$("startAiEngine")  
  ?.addEventListener(  
    "click",  
    startAIEngine  
  );  


$("stopAiEngine")  
  ?.addEventListener(  
    "click",  
    stopAIEngine  
  );  


/* Initial public market data */  

connectPublicSocket();  


/* Scanner refresh */  

setInterval(  
  () => {  

    scanAllMarkets();  

    renderSelectedMarket();  

    renderDigitDistribution();  

    renderProbabilities();  

    if (state.aiRunning) {  

      renderAIResult(  
        getCurrentAIResult()  
      );  
    }  

  },  
  2000  
);  


/* Watchdog */  

setInterval(  
  () => {  

    if (  
      !state.publicConnected  
    ) {  
      connectPublicSocket();  
    }  

  },  
  CONFIG.WATCHDOG_MS  
);  


/* Initial scan */  

setTimeout(  
  scanAllMarkets,  
  1000  
);  


console.log(  
  "%cKRISHWAVE V4.0 READY",  
  "font-size:18px;font-weight:bold;"  
);  

console.log(  
  "Public market analysis:",  
  CONFIG.WS_URL  
);  

console.log(  
  "Trading enabled:",  
  CONFIG.TRADING_ENABLED  
);

}

/* =======================================================
START
======================================================= */

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

/* =======================================================
PUBLIC API
Useful for debugging from browser console.
======================================================= */

window.KRISHWAVE = {

state,  

startAI:  
  startAIEngine,  

stopAI:  
  stopAIEngine,  

scan:  
  scanAllMarkets,  

tradeNow:  
  () => executeCurrentSignal(false),  

aiTradeNow:  
  () => executeCurrentSignal(true),  

resetMartingale,  

connectTrading:  
  connectTradingSocket,  

disconnectTrading:  
  disconnectTradingSocket,  

selectMarket,  

analyze:  
  () =>  
    analyzeSymbol(  
      state.selectedSymbol  
    )

};

})();