/* KRISHWAVE V5.2
   AI SCANNER • PAPER MODE • NO REAL TRADES */

const $=id=>document.getElementById(id);
const T=(id,v)=>{const e=$(id);if(e)e.textContent=v};

const MARKETS=[
["R_10","Volatility 10 Index"],["R_25","Volatility 25 Index"],
["R_50","Volatility 50 Index"],["R_75","Volatility 75 Index"],
["R_100","Volatility 100 Index"],["R_150","Volatility 150 Index"],
["R_250","Volatility 250 Index"],["1HZ10V","Volatility 10 (1s)"],
["1HZ25V","Volatility 25 (1s)"],["1HZ50V","Volatility 50 (1s)"],
["1HZ75V","Volatility 75 (1s)"],["1HZ100V","Volatility 100 (1s)"],
["1HZ150V","Volatility 150 (1s)"]
];

const STRATS=["Matches","Differs","Over","Under","Even","Odd"];
const KEY="KRISHWAVE_HISTORY_V5_2";

let ws=null,sym="R_10",strategy="Matches",running=false,timer=null;
let phase="STOPPED",sec=0,locked=false,paper=false,waiting=false;
let ticks=[],counts=Array(10).fill(0),prediction=null,confidence=0;
let wins=0,losses=0,pl=0,history=[];


/* ================= NAVIGATION ================= */

document.querySelectorAll(".nav-btn").forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll(".nav-btn").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".page").forEach(x=>x.classList.remove("active-page"));
    b.classList.add("active");
    $(b.dataset.page)?.classList.add("active-page");
  };
});


/* ================= THEME ================= */

$("themeToggle")?.addEventListener("click",()=>{
  document.body.classList.toggle("light-mode");
  $("themeToggle").textContent=document.body.classList.contains("light-mode")
    ?"☀️ LIGHT":"🌙 DARK";
});


/* ================= STRATEGIES ================= */

function buildStrategies(){
  const box=$("strategies");if(!box)return;
  box.innerHTML="";
  STRATS.forEach(s=>{
    const b=document.createElement("button");
    b.className="strategy-btn"+(s===strategy?" active":"");
    b.textContent=s;b.onclick=()=>setStrategy(s);
    box.appendChild(b);
  });
  if($("tradeStrategy"))$("tradeStrategy").value=strategy;
}

function setStrategy(s){
  strategy=s;
  T("strategy",s);T("analysisStrategy",s);
  if($("tradeStrategy"))$("tradeStrategy").value=s;
  document.querySelectorAll(".strategy-btn").forEach(b=>b.classList.toggle("active",b.textContent===s));
  manualUI();analyze();display();
}

$("tradeStrategy")?.addEventListener("change",e=>setStrategy(e.target.value));

function manualUI(){
  const input=$("number"),group=$("manualNumberGroup");
  if(!input||!group)return;
  const no=["Even","Odd"].includes(strategy);
  input.disabled=no;
  group.style.opacity=no?".55":"1";
  input.value=no?"":input.value;
  T("manualTitle",no?"NUMBER NOT REQUIRED":
    ["Over","Under"].includes(strategy)?"MANUAL THRESHOLD":"MANUAL NUMBER");
  T("manual",no?"Even/Odd uses the signal automatically.":"AI will never fill this number.");
}


/* ================= MARKETS ================= */

function buildMarkets(){
  const box=$("markets");if(!box)return;
  box.innerHTML="";
  MARKETS.forEach(m=>{
    const b=document.createElement("button");
    b.className="market-card"+(m[0]===sym?" active":"");
    b.innerHTML=`<strong>${m[1]}</strong><span>${m[0]}</span>`;
    b.onclick=()=>selectMarket(m[0]);
    box.appendChild(b);
  });
}

function selectMarket(s){
  sym=s;
  const m=MARKETS.find(x=>x[0]===s);
  if(m){T("mname",m[1]);T("sym",s);T("analysisMarket",m[1]);}
  if($("symbol"))$("symbol").value=s;
  document.querySelectorAll(".market-card").forEach(b=>b.classList.toggle("active",b.textContent.includes(s)));
  ticks=[];counts=Array(10).fill(0);analyze();display();
}

$("symbol")?.addEventListener("change",e=>selectMarket(e.target.value));


/* ================= DIGITS ================= */

function digit(q){
  const s=String(q).replace(/\D/g,"");
  return s?s[s.length-1]:null;
}

function renderDigits(){
  const box=$("digits");if(!box)return;
  const total=counts.reduce((a,b)=>a+b,0);
  box.innerHTML=counts.map((n,d)=>`
    <div class="digit-card"><strong>${d}</strong>
    <span>${total?(n/total*100).toFixed(1):0}%</span>
    <small>${n}</small></div>`).join("");
  if(total){
    const hot=counts.indexOf(Math.max(...counts));T("hot",hot);
  }
}


/* ================= AI ================= */

function analyze(){
  if(ticks.length<10){
    prediction=null;confidence=0;return;
  }

  const sets=[ticks.slice(-20),ticks.slice(-50),ticks.slice(-100)];
  const score=Array(10).fill(0);

  sets.forEach((a,i)=>{
    const weight=[.5,.3,.2][i];
    a.forEach(d=>score[d]+=weight);
  });

  prediction=score.indexOf(Math.max(...score));
  const total=score.reduce((a,b)=>a+b,0);
  confidence=total?Math.min(96,Math.round(score[prediction]/total*100+10)):0;

  let even=ticks.slice(-50).filter(d=>d%2===0).length;
  let high=ticks.slice(-50).filter(d=>d>4).length;

  if(strategy==="Matches")T("aiType","MATCH");
  if(strategy==="Differs")T("aiType","DIFFER");
  if(strategy==="Over")T("aiType",high>=25?"OVER 4":"UNDER 5");
  if(strategy==="Under")T("aiType",high<25?"UNDER 5":"OVER 4");
  if(strategy==="Even")T("aiType",even>=25?"EVEN":"ODD");
  if(strategy==="Odd")T("aiType",even<25?"ODD":"EVEN");

  T("aiScore",confidence);T("score",confidence);
  T("reason",`Digit ${prediction} has the strongest weighted recent frequency.`);
}


/* ================= DISPLAY ================= */

function display(){
  T("aiPrediction",prediction??"—");
  T("analysisPrediction",prediction??"—");
  T("tradePrediction",prediction??"—");
  T("analysisConfidence",prediction===null?"—":confidence+"%");
  T("analysisConfidenceBox",prediction===null?"—":confidence+"%");
  T("tradeConfidence",prediction===null?"—":confidence+"%");
  T("tradeType",prediction===null?"—":$("aiType")?.textContent||"—");
  T("analysisText",prediction===null?
    "Collecting market data...":
    `AI analysed ${ticks.length} recent ticks. Statistical confidence: ${confidence}%.`);
}


/* ================= AUTO MARKET SCANNER ================= */

function scanBestMarket(){
  if(ticks.length<10)return;

  let best={symbol:sym,confidence:confidence};

  /*
    In live mode each market will have its own
    tick history. The scanner compares those
    histories and chooses the strongest signal.
  */

  const candidates=MARKETS.map(m=>{
    const local=marketHistory[m[0]]||[];
    if(local.length<10)return {...m,confidence:0};

    const c=Array(10).fill(0);
    local.slice(-50).forEach(d=>c[d]++);
    const max=Math.max(...c);
    return {...m,confidence:Math.round(max/local.slice(-50).length*100)};
  });

  candidates.forEach(m=>{
    if(m.confidence>best.confidence)
      best={symbol:m[0],confidence:m.confidence};
  });

  if(best.symbol!==sym)selectMarket(best.symbol);
}


/* ================= MARKET DATA STORAGE ================= */

const marketHistory={};

function addTick(symbol,d){
  if(!marketHistory[symbol])marketHistory[symbol]=[];
  marketHistory[symbol].push(Number(d));
  if(marketHistory[symbol].length>300)
    marketHistory[symbol].shift();
}


/* ================= CIRCULAR AI ================= */

function cycle(){
  if(!running)return;

  sec--;

  if(sec<=0){
    if(phase==="ANALYSIS"){
      scanBestMarket();
      phase="PREDICTION";sec=5;locked=true;
    }else if(phase==="PREDICTION"){
      phase="TRADE";sec=0;waiting=paper;
      T("aiCirclePrediction","⚡ TRADE NOW");
    }else if(phase==="COOLDOWN"){
      phase="ANALYSIS";sec=10;locked=false;
    }
  }

  T("phase",phase);
  T("aiCircleTimer",sec);

  const total=phase==="ANALYSIS"?10:phase==="PREDICTION"?5:3;
  const progress=phase==="TRADE"?100:Math.max(0,100-(sec/total*100));

  $("aiCircle")?.style.setProperty("--progress",progress+"%");
  T("aiCircleStatus",phase);
  T("analysisMsg",
    phase==="ANALYSIS"?`🔎 Scanning markets... ${sec}s`:
    phase==="PREDICTION"?`🔒 Prediction locked... ${sec}s`:
    phase==="TRADE"?"⚡ TRADE NOW":
    `⏸ Cooldown... ${sec}s`);
}


/* ================= START / STOP AI ================= */

function startAI(){
  if(running)return;
  running=true;phase="ANALYSIS";sec=10;locked=false;
  T("aiCirclePrediction","AI analysing all markets...");
  cycle();
  timer=setInterval(cycle,1000);
}

function stopAI(){
  running=false;locked=false;waiting=false;
  clearInterval(timer);timer=null;
  phase="STOPPED";sec=0;
  T("phase","STOPPED");T("aiCircleStatus","STOPPED");
  T("aiCircleTimer","0");
  T("aiCirclePrediction","AI is stopped");
  T("analysisMsg","Press START AI to begin.");
}

$("startAI")?.addEventListener("click",startAI);
$("stopAI")?.addEventListener("click",stopAI);


/* ================= PAPER TRADING ================= */

function tradeResult(d){
  if(!paper||!waiting)return;
  waiting=false;

  let n=["Even","Odd"].includes(strategy)?null:Number($("number")?.value);
  if(n===null&&!["Even","Odd"].includes(strategy)){
    T("tradeStatus","NUMBER REQUIRED");return;
  }

  let win=
    strategy==="Matches"?d===n:
    strategy==="Differs"?d!==n:
    strategy==="Over"?d>n:
    strategy==="Under"?d<n:
    strategy==="Even"?d%2===0:
    d%2!==0;

  const stake=Number($("stake")?.value)||1;
  const result=win?"WIN":"LOSS";
  const amount=win?stake:-stake;

  const m=MARKETS.find(x=>x[0]===sym);

  history.unshift({
    time:new Date().toLocaleTimeString(),
    market:m?m[1]:sym,
    strategy,
    number:n??(strategy==="Even"?"EVEN":"ODD"),
    result,pl:amount
  });

  localStorage.setItem(KEY,JSON.stringify(history));
  updateStats();renderHistory();
  T("tradeStatus",result);
}


/* ================= TRADING CONTROLS ================= */

function startTrading(){
  paper=true;
  T("tradeStatus","TRADING");
  if(!running)startAI();
}

function stopTrading(){
  paper=false;waiting=false;
  T("tradeStatus","STOPPED");
}

$("startTrading")?.addEventListener("click",startTrading);
$("stopTrading")?.addEventListener("click",stopTrading);


/* ================= HISTORY ================= */

function updateStats(){
  wins=history.filter(x=>x.result==="WIN").length;
  losses=history.filter(x=>x.result==="LOSS").length;
  pl=history.reduce((a,x)=>a+Number(x.pl||0),0);
  const total=history.length;
  const rate=total?(wins/total*100).toFixed(1):"0.0";

  [["tradeTotal",total],["tradeWins",wins],["tradeLosses",losses],
   ["tradeWinRate",rate+"%"],["tradePL",pl.toFixed(2)],
   ["historyTotal",total],["historyWins",wins],
   ["historyLosses",losses],["historyWinRate",rate+"%"],
   ["historyPL",pl.toFixed(2)]].forEach(x=>T(x[0],x[1]));
}

function renderHistory(){
  const box=$("historyList");if(!box)return;
  if(!history.length){
    box.innerHTML=`<tr><td colspan="6" class="empty-history">No paper trades yet.</td></tr>`;
    return;
  }
  box.innerHTML=history.map(x=>`
    <tr><td>${x.time}</td><td>${x.market}</td>
    <td>${x.strategy}</td><td>${x.number}</td>
    <td class="${x.result==="WIN"?"win":"loss"}">${x.result}</td>
    <td>${Number(x.pl).toFixed(2)}</td></tr>`).join("");
}

$("clearHistory")?.addEventListener("click",()=>{
  if(confirm("Clear all paper trading history?")){
    history=[];localStorage.removeItem(KEY);
    updateStats();renderHistory();
  }
});


/* ================= WEBSOCKET ================= */

function connect(){
  try{
    ws=new WebSocket("wss://ws.binaryws.com/websockets/v3");
    ws.onopen=()=>{
      T("conn","ONLINE");
      if($("connDot"))$("connDot").classList.add("online");
      send({ticks:sym,subscribe:1});
    };
    ws.onmessage=e=>{
      try{
        const x=JSON.parse(e.data);
        if(x.tick)processTick(x.tick);
      }catch(err){}
    };
    ws.onclose=()=>{
      T("conn","OFFLINE");
      setTimeout(connect,5000);
    };
  }catch(e){
    T("conn","OFFLINE");
  }
}

function send(x){
  if(ws?.readyState===1)ws.send(JSON.stringify(x));
}

function processTick(t){
  const d=digit(t.quote);
  if(d===null)return;

  ticks.push(Number(d));
  if(ticks.length>300)ticks.shift();

  counts[d]++;
  addTick(sym,d);

  T("last",t.quote);
  T("ticks",ticks.length);

  analyze();
  renderDigits();
  display();

  if(waiting)tradeResult(Number(d));
}


/* ================= INIT ================= */

try{
  history=JSON.parse(localStorage.getItem(KEY)||"[]");
}catch(e){history=[]}

buildStrategies();
buildMarkets();
manualUI();
updateStats();
renderHistory();
display();

T("conn","OFFLINE");
T("phase","STOPPED");