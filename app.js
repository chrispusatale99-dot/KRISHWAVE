/* =========================================================
   KRISHWAVE AI BEAST V6.2
   ---------------------------------------------------------
   DEMO / PAPER MODE
   - Deriv OAuth
   - Demo balance
   - Public live ticks
   - All volatility markets
   - 10s analysis
   - 5s fixed prediction
   - 3s TRADE NOW
   - Paper history
   - Manual number stays manual
   ========================================================= */

"use strict";

/* ================= CONFIG ================= */

const DERIV_CLIENT_ID = "34khasPjsT0PCRR8X3Z70";
const REDIRECT_URI = "https://chrispusatale99-dot.github.io/KRISHWAVE/";
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

/* ================= STATE ================= */

const state = {
  connected:false,
  accessToken:null,
  accountId:null,
  currency:null,

  selectedStrategy:"MATCHES",
  selectedMarket:null,

  markets:{},
  ticks:{},

  aiRunning:false,
  aiPhase:"IDLE",
  phaseToken:0,
  prediction:null,
  predictionConfidence:0,
  predictionMarket:null,

  paperRunning:false,
  activePaperTrade:null,

  history:[],
  paperBalance:null,

  publicWS:null,
  demoWS:null,

  scanRunning:false
};

const $ = id => document.getElementById(id);

function setText(id,value){
  const el=$(id);
  if(el) el.textContent=value;
}

function esc(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

/* ================= INITIALIZE ================= */

document.addEventListener("DOMContentLoaded",()=>{
  loadHistory();
  loadTheme();
  buildInitialMarkets();
  buildInitialTradeMarkets();
  bindNavigation();
  bindControls();
  renderHistory();
  updateStats();
  connectPublicMarket();
  checkOAuthCallback();

  setTimeout(()=>{
    if(!state.connected){
      setText("authStatus","NOT CONNECTED — DEMO MARKET DATA AVAILABLE");
    }
  },1200);
});

/* ================= NAVIGATION ================= */

function bindNavigation(){
  document.querySelectorAll(".nav-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const page=btn.dataset.page;

      document.querySelectorAll(".page").forEach(p=>{
        p.classList.remove("active");
      });

      const target=$(page+"Page");
      if(target) target.classList.add("active");

      document.querySelectorAll(".nav-btn").forEach(b=>{
        b.classList.remove("active");
      });

      btn.classList.add("active");

      if(page==="trade"){
        renderTradeMarkets();
        updateTradeSignal();
      }

      if(page==="history"){
        renderHistory();
        updateStats();
      }

      window.scrollTo({top:0,behavior:"smooth"});
    });
  });
}

/* ================= CONTROLS ================= */

function bindControls(){

  $("themeToggle")?.addEventListener("click",()=>{
    document.body.classList.toggle("light");
    localStorage.setItem(
      "krishwave_theme",
      document.body.classList.contains("light")?"light":"dark"
    );
  });

  $("connectDerivBtn")?.addEventListener("click",startOAuth);

  $("disconnectDerivBtn")?.addEventListener("click",disconnectDeriv);

  $("startAI")?.addEventListener("click",()=>{
    if(!state.aiRunning) startAICycle();
  });

  $("stopAI")?.addEventListener("click",stopAI);

  $("scanMarketsBtn")?.addEventListener("click",scanMarkets);

  $("startTrading")?.addEventListener("click",startPaperTrading);

  $("stopTrading")?.addEventListener("click",stopPaperTrading);

  $("clearHistory")?.addEventListener("click",()=>{
    if(confirm("Clear all paper history?")){
      state.history=[];
      saveHistory();
      renderHistory();
      updateStats();
    }
  });

  document.querySelectorAll(".strategy-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      state.selectedStrategy=normalizeStrategy(btn.dataset.strategy);

      document.querySelectorAll(".strategy-btn")
        .forEach(b=>b.classList.remove("active"));

      btn.classList.add("active");

      const select=$("tradeStrategy");
      if(select) select.value=state.selectedStrategy;

      updateManualVisibility();
      renderMarkets();
      renderTradeMarkets();
      setText(
        "analysisMsg",
        `Strategy selected: ${displayStrategy(state.selectedStrategy)}`
      );
    });
  });

  $("tradeStrategy")?.addEventListener("change",e=>{
    state.selectedStrategy=normalizeStrategy(e.target.value);
    updateManualVisibility();
    renderTradeMarkets();
  });

  updateManualVisibility();
}

/* ================= THEME ================= */

function loadTheme(){
  if(localStorage.getItem("krishwave_theme")==="light"){
    document.body.classList.add("light");
  }
}

/* ================= STRATEGY ================= */

function normalizeStrategy(s){
  s=String(s||"").toUpperCase();

  if(s==="MATCH") return "MATCHES";
  if(s==="DIFFER") return "DIFFERS";

  return s;
}

function displayStrategy(s){
  if(s==="MATCHES") return "MATCHES";
  if(s==="DIFFERS") return "DIFFERS";
  return s;
}

function updateManualVisibility(){
  const group=$("manualNumberGroup");
  if(!group) return;

  const s=state.selectedStrategy;

  group.style.display=
    ["MATCHES","DIFFERS","OVER","UNDER"].includes(s)
      ? "block"
      : "none";
}

/* ================= INITIAL MARKETS ================= */

function buildInitialMarkets(){
  MARKETS.forEach(symbol=>{
    state.markets[symbol]={
      price:null,
      lastDigit:null,
      digits:Array(10).fill(0),
      ticks:[],
      updated:0
    };
  });

  renderMarkets();
  renderDigits();
}

function buildInitialTradeMarkets(){
  renderTradeMarkets();
}

/* ================= PUBLIC DERIV DATA ================= */

function connectPublicMarket(){

  setText("dataStatus","CONNECTING...");
  setText("connectionText","MARKET DATA");

  try{
    state.publicWS=new WebSocket(PUBLIC_WS);
  }catch(e){
    setText("dataStatus","OFFLINE");
    return;
  }

  state.publicWS.onopen=()=>{
    setText("dataStatus","DERIV LIVE");
    $("connectionDot")?.classList.add("connected");
    setText("connectionText","DERIV LIVE");

    MARKETS.forEach(symbol=>{
      state.publicWS.send(JSON.stringify({
        ticks:symbol,
        subscribe:1
      }));
    });
  };

  state.publicWS.onmessage=e=>{
    try{
      const msg=JSON.parse(e.data);

      if(msg.tick){
        processTick(msg.tick);
      }

      if(msg.error){
        console.warn("Deriv public error",msg.error);
      }
    }catch(err){}
  };

  state.publicWS.onerror=()=>{
    setText("dataStatus","DATA ERROR");
    $("connectionDot")?.classList.add("error");
  };

  state.publicWS.onclose=()=>{
    setText("dataStatus","RECONNECTING...");
    $("connectionDot")?.classList.remove("connected");

    setTimeout(()=>{
      if(!state.publicWS ||
         state.publicWS.readyState===WebSocket.CLOSED){
        connectPublicMarket();
      }
    },3000);
  };
}

function processTick(tick){

  const symbol=tick.symbol;
  if(!state.markets[symbol]) return;

  const price=Number(tick.quote);

  if(!Number.isFinite(price)) return;

  const str=String(price);
  const clean=str.replace(".","");
  const digit=Number(clean.slice(-1));

  const m=state.markets[symbol];

  m.price=price;
  m.lastDigit=digit;
  m.digits[digit]++;
  m.ticks.push(digit);

  if(m.ticks.length>120){
    m.ticks.shift();
  }

  m.updated=Date.now();

  state.ticks[symbol]=digit;

  renderMarkets();
  renderDigits();
  renderTradeMarkets();

  if(state.activePaperTrade){
    evaluatePaperTradeTick(symbol,digit);
  }
}

/* ================= MARKET UI ================= */

function scoreMarket(symbol){

  const m=state.markets[symbol];

  if(!m || !m.ticks.length){
    return {score:0,confidence:0,label:"WAITING"};
  }

  const ticks=m.ticks.slice(-60);

  const counts=Array(10).fill(0);

  ticks.forEach(d=>{
    counts[d]++;
  });

  const max=Math.max(...counts);
  const concentration=max/ticks.length;

  const even=ticks.filter(d=>d%2===0).length/ticks.length;
  const odd=1-even;

  const over=ticks.filter(d=>d>=5).length/ticks.length;
  const under=1-over;

  let confidence=50;

  switch(state.selectedStrategy){
    case "MATCHES":
      confidence=50+concentration*35;
      break;

    case "DIFFERS":
      confidence=50+(1-concentration)*25;
      break;

    case "OVER":
      confidence=50+Math.abs(over-.5)*70;
      break;

    case "UNDER":
      confidence=50+Math.abs(under-.5)*70;
      break;

    case "EVEN":
      confidence=50+Math.abs(even-.5)*70;
      break;

    case "ODD":
      confidence=50+Math.abs(odd-.5)*70;
      break;
  }

  confidence=Math.min(94,Math.max(50,confidence));

  return {
    score:Math.round(confidence),
    confidence:Math.round(confidence),
    label:confidence>=70?"GOOD":confidence>=60?"WATCH":"WEAK"
  };
}

function renderMarkets(){

  const box=$("markets");
  if(!box) return;

  box.innerHTML=MARKETS.map(symbol=>{
    const m=state.markets[symbol];
    const result=scoreMarket(symbol);

    return `
      <div class="market ${result.label==="GOOD"?"good":""}">
        <div class="market-head">
          <b>${esc(symbol)}</b>
          <span class="market-badge">${esc(result.label)}</span>
        </div>
        <div class="market-price">
          ${m.price===null?"—":esc(m.price)}
        </div>
        <small>
          ${m.lastDigit===null?"LAST DIGIT —":"LAST DIGIT "+m.lastDigit}
        </small>
        <small>
          ${displayStrategy(state.selectedStrategy)} ${result.score}%
        </small>
      </div>
    `;
  }).join("");
}

function renderDigits(){

  const box=$("digits");
  if(!box) return;

  const market=
    state.predictionMarket ||
    state.selectedMarket ||
    MARKETS.find(x=>state.markets[x].ticks.length) ||
    MARKETS[0];

  const m=state.markets[market];

  if(!m){
    box.innerHTML="";
    return;
  }

  const total=m.digits.reduce((a,b)=>a+b,0);

  box.innerHTML=m.digits.map((count,d)=>{
    const pct=total?Math.round(count/total*100):0;

    return `
      <div class="digit">
        <b>${d}</b>
        <span>${count}</span>
        <small>${pct}%</small>
      </div>
    `;
  }).join("");
}

/* ================= TRADE MARKET SCANNER ================= */

function renderTradeMarkets(){

  const box=$("tradeMarkets");
  if(!box) return;

  box.innerHTML=MARKETS.map(symbol=>{
    const result=scoreMarket(symbol);
    const m=state.markets[symbol];

    return `
      <button
        type="button"
        class="trade-market ${result.label==="GOOD"?"good":""}"
        data-market="${esc(symbol)}"
      >
        <b>${esc(symbol)}</b>
        <small>
          ${m.price===null?"Waiting":"Price "+esc(m.price)}
        </small>
        <small>
          ${displayStrategy(state.selectedStrategy)}:
          ${result.score}%
        </small>
        <small>${result.label}</small>
      </button>
    `;
  }).join("");

  box.querySelectorAll("[data-market]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      selectMarket(btn.dataset.market);
    });
  });
}

function selectMarket(symbol){

  state.selectedMarket=symbol;

  setText("symbol",symbol);
  setText("tradeMarket",symbol);

  document.querySelectorAll(".trade-market")
    .forEach(b=>{
      b.style.borderColor=
        b.dataset.market===symbol
          ? "var(--accent)"
          : "";
    });
}

async function scanMarkets(){

  if(state.scanRunning) return;

  state.scanRunning=true;

  const status=$("marketScanStatus");

  if(status) status.textContent=
    `SCANNING ${MARKETS.length} VOLATILITY MARKETS...`;

  await sleep(350);

  const results=MARKETS.map(symbol=>({
    symbol,
    ...scoreMarket(symbol)
  })).sort((a,b)=>b.score-a.score);

  renderTradeMarkets();

  const best=results[0];

  if(best){
    selectMarket(best.symbol);

    if(status){
      status.textContent=
        `BEST CURRENT MARKET: ${best.symbol} • ${displayStrategy(state.selectedStrategy)} • ${best.score}%`;
    }
  }

  state.scanRunning=false;
}

/* ================= AI ENGINE ================= */

async function startAICycle(){

  if(state.aiRunning) return;

  state.aiRunning=true;
  state.phaseToken++;

  const token=state.phaseToken;

  while(state.aiRunning && token===state.phaseToken){

    await analysisPhase(token);
    if(!state.aiRunning || token!==state.phaseToken) break;

    await predictionPhase(token);
    if(!state.aiRunning || token!==state.phaseToken) break;

    await tradeNowPhase(token);
  }

  resetCycleUI();
}

function stopAI(){

  state.aiRunning=false;
  state.phaseToken++;

  stopPaperTrading();

  setText("aiStatus","STOPPED");
  setText("aiCircleLabel","AI READY");
  setText("aiCircleStatus","WAITING");
  setText("aiCircleTimer","--");

  $("aiCircle")?.classList.remove("active","trade-now");
}

function waitPhase(seconds,token,callback){

  return new Promise(resolve=>{

    const start=performance.now();
    const end=start+(seconds*1000);

    const timer=setInterval(()=>{

      if(!state.aiRunning || token!==state.phaseToken){
        clearInterval(timer);
        resolve(false);
        return;
      }

      const remaining=Math.max(0,end-performance.now());
      const whole=Math.ceil(remaining/1000);

      callback(whole);

      if(remaining<=0){
        clearInterval(timer);
        resolve(true);
      }

    },50);
  });
}

async function analysisPhase(token){

  state.aiPhase="ANALYSIS";

  activateCycle("cycleAnalysis");

  setText("aiStatus","ANALYZING");
  setText("aiCircleLabel","ANALYZING");
  setText("aiCircleStatus","SCANNING MARKETS");

  $("aiCircle")?.classList.add("active");
  $("aiCircle")?.classList.remove("trade-now");

  chooseBestMarket();

  setText(
    "analysisMsg",
    `Analyzing ${MARKETS.length} volatility markets for ${displayStrategy(state.selectedStrategy)}...`
  );

  return waitPhase(10,token,remaining=>{
    setText("aiCircleTimer",remaining+"s");
    setText("cycleAnalysis",remaining===0?"DONE":"10s • "+remaining);
  });
}

function chooseBestMarket(){

  const results=MARKETS.map(symbol=>({
    symbol,
    ...scoreMarket(symbol)
  })).sort((a,b)=>b.score-a.score);

  const best=results[0];

  if(best){
    state.predictionMarket=best.symbol;
    state.selectedMarket=best.symbol;

    setText("aiMarket",best.symbol);
    setText("reportMarket",best.symbol);
    setText("reportScore",best.score);
    setText("reportStrength",best.score>=75?"STRONG":best.score>=60?"MODERATE":"WEAK");
    setText("reportStability",best.score>=65?"STABLE":"MIXED");
    setText("reportConcentration",best.score+"%");
    setText("reportAgreement",best.score>=65?"HIGH":"MEDIUM");

    selectMarket(best.symbol);
  }
}

async function predictionPhase(token){

  state.aiPhase="PREDICTION";

  activateCycle("cyclePrediction");

  const market=state.predictionMarket || MARKETS[0];
  const m=state.markets[market];

  const prediction=makePrediction(m);

  /* FIXED PREDICTION:
     Once generated here, it does not change for 5 seconds. */

  state.prediction=prediction.digit;
  state.predictionConfidence=prediction.confidence;

  setText("aiPrediction",String(prediction.digit));
  setText("aiPredictionLarge",String(prediction.digit));
  setText("aiType",displayStrategy(state.selectedStrategy));
  setText("analysisConfidence",prediction.confidence+"%");
  setText("predictionConfidence","CONFIDENCE: "+prediction.confidence+"%");
  setText("tradePrediction",String(prediction.digit));
  setText("tradeConfidence",prediction.confidence+"%");

  setText("aiCircleLabel","PREDICTION");
  setText("aiCirclePrediction",String(prediction.digit));
  setText("aiCircleStatus","FIXED");

  setText("entryStatus","PREDICTION READY");
  setText("tradeStatus","PREDICTION READY");

  $("aiCircle")?.classList.remove("active");

  if(state.paperRunning){
    preparePaperTrade();
  }

  return waitPhase(5,token,remaining=>{
    setText("aiCircleTimer",remaining+"s");
  });
}

function makePrediction(m){

  const ticks=m?.ticks?.slice(-60)||[];

  if(!ticks.length){
    return {
      digit:Math.floor(Math.random()*10),
      confidence:50
    };
  }

  const counts=Array(10).fill(0);

  ticks.forEach(d=>counts[d]++);

  const max=Math.max(...counts);

  let digit=counts.indexOf(max);

  const strategy=state.selectedStrategy;

  if(strategy==="DIFFERS"){
    const sorted=[...counts]
      .map((count,d)=>({count,d}))
      .sort((a,b)=>a.count-b.count);

    digit=sorted[0].d;
  }

  if(strategy==="OVER"){
    const candidates=[5,6,7,8,9];
    digit=candidates
      .sort((a,b)=>counts[b]-counts[a])[0];
  }

  if(strategy==="UNDER"){
    const candidates=[0,1,2,3,4];
    digit=candidates
      .sort((a,b)=>counts[b]-counts[a])[0];
  }

  if(strategy==="EVEN"){
    const candidates=[0,2,4,6,8];
    digit=candidates
      .sort((a,b)=>counts[b]-counts[a])[0];
  }

  if(strategy==="ODD"){
    const candidates=[1,3,5,7,9];
    digit=candidates
      .sort((a,b)=>counts[b]-counts[a])[0];
  }

  const total=ticks.length;
  const concentration=total?max/total:0;

  const confidence=Math.round(
    Math.min(94,Math.max(52,50+concentration*80))
  );

  return {digit,confidence};
}

async function tradeNowPhase(token){

  state.aiPhase="TRADE_NOW";

  activateCycle("cycleTrade");

  setText("aiStatus","TRADE NOW");
  setText("entryStatus","TRADE NOW");
  setText("tradeStatus","TRADE NOW");

  $("aiCircle")?.classList.add("trade-now");

  setText("aiCircleLabel","TRADE NOW");
  setText("aiCircleStatus","FIXED SIGNAL");

  if(state.paperRunning && !state.activePaperTrade){
    createPaperTrade();
  }

  return waitPhase(3,token,remaining=>{
    setText("aiCircleTimer",remaining+"s");
  });
}

function activateCycle(id){

  document.querySelectorAll(".cycle-step")
    .forEach(x=>x.classList.remove("active"));

  $(id)?.classList.add("active");
}

/* ================= TRADE SIGNAL ================= */

function updateTradeSignal(){

  if(state.predictionMarket){
    setText("tradeMarket",state.predictionMarket);
  }

  if(state.prediction!==null){
    setText("tradePrediction",state.prediction);
    setText("tradeConfidence",state.predictionConfidence+"%");
  }
}

/* ================= PAPER TRADING ================= */

function startPaperTrading(){

  const symbol=$("symbol")?.value || state.selectedMarket;

  if(!symbol){
    alert("Select a market first.");
    return;
  }

  const stake=Number($("stake")?.value||1);

  if(!Number.isFinite(stake) || stake<=0){
    alert("Enter a valid stake.");
    return;
  }

  state.selectedMarket=symbol;
  state.paperRunning=true;

  setText("tradeStatus","PAPER RUNNING");

  if(state.prediction!==null){
    preparePaperTrade();
  }
}

function stopPaperTrading(){

  state.paperRunning=false;
  state.activePaperTrade=null;

  if($("tradeStatus")){
    $("tradeStatus").textContent=
      state.aiRunning?"WAITING":"PAPER STOPPED";
  }
}

function preparePaperTrade(){

  if(!state.paperRunning) return;
  if(state.activePaperTrade) return;
  if(state.prediction===null) return;

  createPaperTrade();
}

function createPaperTrade(){

  if(state.activePaperTrade) return;

  const symbol=
    state.selectedMarket ||
    state.predictionMarket ||
    MARKETS[0];

  const strategy=
    state.selectedStrategy;

  const manual=$("manualNumber")?.value;

  const trade={
    id:Date.now()+Math.random(),
    time:new Date().toLocaleTimeString(),
    market:symbol,
    strategy,
    prediction:state.prediction,
    manual:
      manual===""?null:Number(manual),
    result:null,
    status:"PENDING",
    startedAt:Date.now()
  };

  state.activePaperTrade=trade;

  state.history.unshift(trade);

  if(state.history.length>200){
    state.history.pop();
  }

  saveHistory();
  renderHistory();
  updateStats();
}

function evaluatePaperTradeTick(symbol,digit){

  const trade=state.activePaperTrade;

  if(!trade) return;
  if(trade.market!==symbol) return;

  /* Give the paper trade a short observation window. */
  if(Date.now()-trade.startedAt<800) return;

  const strategy=trade.strategy;
  const target=
    trade.manual!==null
      ? trade.manual
      : trade.prediction;

  let win=false;

  if(strategy==="MATCHES"){
    win=digit===target;
  }else if(strategy==="DIFFERS"){
    win=digit!==target;
  }else if(strategy==="OVER"){
    win=digit>=5;
  }else if(strategy==="UNDER"){
    win=digit<=4;
  }else if(strategy==="EVEN"){
    win=digit%2===0;
  }else if(strategy==="ODD"){
    win=digit%2!==0;
  }

  finishPaperTrade(win,digit);
}

function finishPaperTrade(win,resultDigit){

  const trade=state.activePaperTrade;

  if(!trade) return;

  trade.result=resultDigit;
  trade.status=win?"WIN":"LOSS";
  trade.finishedAt=Date.now();

  state.activePaperTrade=null;

  saveHistory();
  renderHistory();
  updateStats();

  setText(
    "analysisMsg",
    `${trade.market} • ${displayStrategy(trade.strategy)} • ${trade.status}`
  );
}

/* ================= HISTORY ================= */

function loadHistory(){

  try{
    const raw=localStorage.getItem("krishwave_history");

    if(raw){
      const parsed=JSON.parse(raw);

      if(Array.isArray(parsed)){
        state.history=parsed;
      }
    }
  }catch(e){
    state.history=[];
  }
}

function saveHistory(){

  try{
    localStorage.setItem(
      "krishwave_history",
      JSON.stringify(state.history)
    );
  }catch(e){}
}

function renderHistory(){

  const box=$("historyList");

  if(!box) return;

  if(!state.history.length){
    box.innerHTML=`
      <tr>
        <td colspan="6" class="empty-history">
          No paper trades yet.
        </td>
      </tr>
    `;
    return;
  }

  box.innerHTML=state.history.map(trade=>{

    const cls=
      trade.status==="WIN"
        ?"win"
        :trade.status==="LOSS"
          ?"loss"
          :"pending";

    return `
      <tr>
        <td>${esc(trade.time)}</td>
        <td>${esc(trade.market)}</td>
        <td>${esc(displayStrategy(trade.strategy))}</td>
        <td>${esc(trade.prediction)}</td>
        <td>${trade.result===null?"—":esc(trade.result)}</td>
        <td class="${cls}">${esc(trade.status)}</td>
      </tr>
    `;
  }).join("");
}

function updateStats(){

  const total=state.history.length;

  const wins=
    state.history.filter(x=>x.status==="WIN").length;

  const losses=
    state.history.filter(x=>x.status==="LOSS").length;

  const pending=
    state.history.filter(x=>x.status==="PENDING").length;

  const finished=wins+losses;

  const accuracy=
    finished
      ? Math.round(wins/finished*100)
      : 0;

  setText("historyTotal",total);
  setText("historyWins",wins);
  setText("historyLosses",losses);
  setText("historyPending",pending);
  setText("historyAccuracy",accuracy+"%");

  setText("tradeTotal",finished);
  setText("tradeWins",wins);
  setText("tradeLosses",losses);
  setText("tradeAccuracy",accuracy+"%");
}

/* ================= OAUTH ================= */

async function startOAuth(){

  const verifier=randomString(64);
  const stateValue=randomString(32);

  sessionStorage.setItem("krishwave_pkce_verifier",verifier);
  sessionStorage.setItem("krishwave_oauth_state",stateValue);

  const challenge=await sha256Base64Url(verifier);

  const params=new URLSearchParams({
    response_type:"code",
    client_id:DERIV_CLIENT_ID,
    redirect_uri:REDIRECT_URI,
    scope:"trade",
    state:stateValue,
    code_challenge:challenge,
    code_challenge_method:"S256"
  });

  window.location.href=
    "https://auth.deriv.com/oauth2/auth?"+params.toString();
}

function randomString(length){

  const chars=
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const array=new Uint8Array(length);

  crypto.getRandomValues(array);

  return Array.from(array)
    .map(x=>chars[x%chars.length])
    .join("");
}

async function sha256Base64Url(value){

  const data=new TextEncoder().encode(value);

  const hash=
    await crypto.subtle.digest("SHA-256",data);

  const bytes=new Uint8Array(hash);

  let binary="";

  bytes.forEach(b=>{
    binary+=String.fromCharCode(b);
  });

  return btoa(binary)
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/,"");
}

async function checkOAuthCallback(){

  const params=new URLSearchParams(
    window.location.search
  );

  const code=params.get("code");
  const returnedState=params.get("state");
  const error=params.get("error");

  if(error){
    setText("authStatus","OAUTH ERROR: "+error);
    return;
  }

  if(!code) return;

  const savedState=
    sessionStorage.getItem("krishwave_oauth_state");

  const verifier=
    sessionStorage.getItem("krishwave_pkce_verifier");

  if(!savedState || !verifier){
    setText("authStatus","OAUTH SESSION EXPIRED");
    return;
  }

  if(returnedState!==savedState){
    setText("authStatus","OAUTH STATE ERROR");
    return;
  }

  setText("authStatus","CONNECTING DERIV...");

  try{

    const response=await fetch(OAUTH_BACKEND,{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        code,
        code_verifier:verifier
      })
    });

    const data=await response.json();

    if(!data.success || !data.access_token){
      throw new Error(
        data.error || "Token exchange failed"
      );
    }

    state.accessToken=data.access_token;

    sessionStorage.setItem(
      "krishwave_access_token",
      data.access_token
    );

    await connectAuthenticated();

    window.history.replaceState(
      {},
      document.title,
      REDIRECT_URI
    );

  }catch(err){

    console.error(err);

    setText(
      "authStatus",
      "DERIV CONNECTION FAILED"
    );
  }
}

/* ================= AUTHENTICATED DEMO ================= */

async function connectAuthenticated(){

  if(!state.accessToken){
    state.accessToken=
      sessionStorage.getItem(
        "krishwave_access_token"
      );
  }

  if(!state.accessToken){
    setText("authStatus","NOT CONNECTED");
    return;
  }

  setText("authStatus","AUTHENTICATING...");
  setText("derivAuthConnection","CONNECTING");

  try{

    const accountsResponse=
      await fetch(
        "https://api.derivws.com/trading/v1/options/accounts",
        {
          headers:{
            Authorization:
              "Bearer "+state.accessToken
          }
        }
      );

    if(!accountsResponse.ok){
      throw new Error("Account request failed");
    }

    const accountData=
      await accountsResponse.json();

    const accounts=
      accountData.data ||
      accountData.accounts ||
      [];

    const demo=
      accounts.find(a=>
        String(a.account_type||"")
          .toLowerCase()
          .includes("demo")
      ) ||
      accounts.find(a=>
        String(a.loginid||"")
          .startsWith("VRTC")
      ) ||
      accounts[0];

    if(!demo){
      throw new Error("No demo account found");
    }

    state.accountId=
      demo.account_id ||
      demo.loginid ||
      demo.id;

    state.currency=
      demo.currency ||
      "USD";

    setText("derivAccountId",state.accountId);
    setText("derivCurrency",state.currency);
    setText("authStatus","DERIV DEMO CONNECTED");
    setText("derivAuthConnection","DEMO LIVE");

    $("disconnectDerivBtn")?.classList.remove("hidden");
    $("connectDerivBtn")?.classList.add("hidden");

    setText("connectionText","DERIV DEMO");
    $("connectionDot")?.classList.add("connected");

    await connectDemoWebSocket();

  }catch(err){

    console.error(err);

    setText(
      "authStatus",
      "AUTHENTICATION FAILED"
    );

    setText("derivAuthConnection","ERROR");
  }
}

async function connectDemoWebSocket(){

  if(!state.accountId) return;

  try{

    const response=
      await fetch(
        `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(state.accountId)}/otp`,
        {
          method:"POST",
          headers:{
            Authorization:
              "Bearer "+state.accessToken,
            "Content-Type":"application/json"
          }
        }
      );

    if(!response.ok){
      throw new Error("OTP request failed");
    }

    const data=await response.json();

    const otp=
      data.data?.otp ||
      data.otp;

    if(!otp){
      throw new Error("No OTP received");
    }

    const wsUrl=
      data.data?.ws_url ||
      data.data?.websocket_url ||
      `wss://api.derivws.com/trading/v1/options/ws/demo?otp=${encodeURIComponent(otp)}`;

    state.demoWS=new WebSocket(wsUrl);

    state.demoWS.onopen=()=>{
      setText("derivAuthConnection","DEMO LIVE");

      state.demoWS.send(
        JSON.stringify({
          balance:1,
          subscribe:1
        })
      );
    };

    state.demoWS.onmessage=e=>{
      try{

        const msg=JSON.parse(e.data);

        if(msg.balance){

          const bal=
            msg.balance.balance ??
            msg.balance.amount;

          if(bal!==undefined){

            state.paperBalance=Number(bal);

            setText(
              "balance",
              Number(bal).toFixed(2)+" "+state.currency
            );
          }
        }

        if(msg.error){
          console.warn("Demo WS",msg.error);
        }

      }catch(err){}
    };

    state.demoWS.onerror=()=>{
      setText("derivAuthConnection","DEMO ERROR");
    };

    state.demoWS.onclose=()=>{
      if(state.connected){
        setText("derivAuthConnection","DEMO DISCONNECTED");
      }
    };

    state.connected=true;

  }catch(err){

    console.error(err);

    setText(
      "derivAuthConnection",
      "DEMO CONNECTION FAILED"
    );
  }
}

/* ================= DISCONNECT ================= */

function disconnectDeriv(){

  state.connected=false;
  state.accessToken=null;
  state.accountId=null;
  state.currency=null;

  try{
    state.demoWS?.close();
    state.publicWS?.close();
  }catch(e){}

  sessionStorage.removeItem(
    "krishwave_access_token"
  );

  sessionStorage.removeItem(
    "krishwave_pkce_verifier"
  );

  sessionStorage.removeItem(
    "krishwave_oauth_state"
  );

  setText("authStatus","NOT CONNECTED");
  setText("derivAccountId","—");
  setText("derivCurrency","—");
  setText("derivAuthConnection","OFFLINE");
  setText("balance","—");

  $("disconnectDerivBtn")?.classList.add("hidden");
  $("connectDerivBtn")?.classList.remove("hidden");
}

/* ================= AUTO SESSION RESTORE ================= */

(async function restoreSession(){

  const token=
    sessionStorage.getItem(
      "krishwave_access_token"
    );

  if(!token) return;

  state.accessToken=token;

  await sleep(400);

  connectAuthenticated();
})();