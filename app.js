/* =========================================================
   KRISHWAVE V5.4
   DERIV LIVE MARKET INTELLIGENCE
   PAPER TRADING ONLY
========================================================= */

const $=id=>document.getElementById(id);

const WS_URL="wss://api.derivws.com/trading/v1/options/ws/public";

const markets=[
 {name:"Volatility 10",symbol:"1HZ10V"},
 {name:"Volatility 25",symbol:"1HZ25V"},
 {name:"Volatility 50",symbol:"1HZ50V"},
 {name:"Volatility 75",symbol:"1HZ75V"},
 {name:"Volatility 100",symbol:"1HZ100V"},
 {name:"Volatility 150",symbol:"1HZ150V"},
 {name:"Volatility 200",symbol:"1HZ200V"},
 {name:"Volatility 10 (1s)",symbol:"1HZ10V"},
 {name:"Volatility 25 (1s)",symbol:"1HZ25V"},
 {name:"Volatility 50 (1s)",symbol:"1HZ50V"},
 {name:"Volatility 75 (1s)",symbol:"1HZ75V"},
 {name:"Volatility 100 (1s)",symbol:"1HZ100V"},
 {name:"Volatility 150 (1s)",symbol:"1HZ150V"}
];

const strategies=["MATCHES","DIFFERS","OVER","UNDER","EVEN","ODD"];

const data={};
markets.forEach(m=>{
 data[m.symbol]={
  name:m.name,
  symbol:m.symbol,
  ticks:[],
  last:null,
  score:0,
  hot:null,
  prediction:null,
  confidence:0
 };
});

let ws=null;
let aiTimer=null;
let aiRunning=false;
let phase="ANALYSIS";
let sec=10;
let locked=null;
let selectedSymbol="1HZ10V";
let selectedStrategy="MATCHES";
let paperRunning=false;
let history=JSON.parse(localStorage.getItem("krishwave_history")||"[]");

/* ================= CONNECTION ================= */

function setStatus(text,type=""){
 $("connectionStatus").textContent=text;
 $("statusDot").className="status-dot "+type;
}

function connect(){

 setStatus("CONNECTING...");

 try{
  ws=new WebSocket(WS_URL);

  ws.onopen=()=>{
   setStatus("DERIV ONLINE","online");
   $("dataStatus").textContent="Live ticks connected";
   $("analysisMsg").textContent="Connected to Deriv. Loading market data...";

   ws.send(JSON.stringify({
    active_symbols:"brief",
    product_type:"basic",
    req_id:1
   }));

   markets.forEach((m,i)=>{
    ws.send(JSON.stringify({
     ticks:m.symbol,
     subscribe:1,
     req_id:100+i
    }));

    ws.send(JSON.stringify({
     ticks_history:m.symbol,
     count:60,
     end:"latest",
     style:"ticks",
     req_id:500+i
    }));
   });
  };

  ws.onmessage=e=>{
   let d;
   try{d=JSON.parse(e.data)}catch{return}

   if(d.error){
    console.log("Deriv:",d.error.message);
    return;
   }

   if(d.msg_type==="tick"&&d.tick){
    handleTick(d.tick);
   }

   if(d.msg_type==="history"&&d.history){
    handleHistory(d);
   }
  };

  ws.onerror=()=>{
   setStatus("CONNECTION ERROR","error");
   $("dataStatus").textContent="Connection error";
  };

  ws.onclose=()=>{
   setStatus("RECONNECTING...");
   $("dataStatus").textContent="Waiting for Deriv...";
   setTimeout(connect,4000);
  };

 }catch(e){
  setStatus("ERROR","error");
  setTimeout(connect,4000);
 }
}

/* ================= MARKET DATA ================= */

function digitOf(value){
 const s=String(value);
 const clean=s.replace(/[^0-9]/g,"");
 return Number(clean.slice(-1))||0;
}

function addTick(symbol,quote){
 if(!data[symbol])return;

 const d=data[symbol];

 d.last=quote;
 d.ticks.push({
  quote,
  digit:digitOf(quote),
  time:Date.now()
 });

 if(d.ticks.length>120)d.ticks.shift();

 calculate(d);
 renderMarkets();

 if(symbol===selectedSymbol)renderDigits();
}

function handleTick(t){
 if(!t.symbol)return;
 addTick(t.symbol,Number(t.quote));
}

function handleHistory(msg){

 const symbol=msg.echo_req?.ticks_history;

 if(!symbol||!data[symbol])return;

 const prices=msg.history?.prices||[];

 prices.forEach(q=>{
  if(data[symbol].ticks.length<120){
   data[symbol].ticks.push({
    quote:Number(q),
    digit:digitOf(q),
    time:Date.now()
   });
  }
 });

 calculate(data[symbol]);
 renderMarkets();

 if(symbol===selectedSymbol)renderDigits();
}

/* ================= ANALYSIS ================= */

function calculate(d){

 if(!d.ticks.length){
  d.score=0;
  return;
 }

 const last=d.ticks.slice(-50);
 const counts=Array(10).fill(0);

 last.forEach(x=>counts[x.digit]++);

 let hot=0;

 counts.forEach((v,i)=>{
  if(v>counts[hot])hot=i;
 });

 const total=last.length;
 const frequency=counts[hot]/total;

 let changes=0;

 for(let i=1;i<last.length;i++){
  if(last[i].digit!==last[i-1].digit)changes++;
 }

 const movement=changes/Math.max(1,last.length-1);

 d.hot=hot;

 d.score=Math.min(
  99,
  Math.round(
   35+
   frequency*45+
   movement*20
  )
 );

 d.prediction=hot;
 d.confidence=Math.min(
  98,
  Math.round(50+frequency*45+movement*10)
 );
}

/* ================= BEST MARKET ================= */

function bestMarket(){

 const ready=markets
  .map(m=>data[m.symbol])
  .filter(x=>x.ticks.length>=5);

 if(!ready.length)return data[selectedSymbol];

 return ready.sort((a,b)=>b.score-a.score)[0];
}

/* ================= PREDICTION ================= */

function makePrediction(d,strategy){

 if(!d||!d.ticks.length)return null;

 const counts=Array(10).fill(0);

 d.ticks.slice(-60).forEach(x=>counts[x.digit]++);

 let hot=0;

 for(let i=1;i<10;i++){
  if(counts[i]>counts[hot])hot=i;
 }

 const total=Math.max(1,d.ticks.slice(-60).length);
 const hotRate=counts[hot]/total;

 if(strategy==="MATCHES"){
  return {
   text:"MATCHES "+hot,
   number:hot,
   confidence:Math.round(50+hotRate*50)
  };
 }

 if(strategy==="DIFFERS"){
  let low=0;
  for(let i=1;i<10;i++){
   if(counts[i]<counts[low])low=i;
  }

  return {
   text:"DIFFERS "+low,
   number:low,
   confidence:Math.round(50+(1-counts[low]/total)*35)
  };
 }

 if(strategy==="OVER"){
  let best=9,bestRate=0;
  for(let n=0;n<9;n++){
   const rate=counts.slice(n+1).reduce((a,b)=>a+b,0)/total;
   if(rate>bestRate){
    bestRate=rate;
    best=n;
   }
  }

  return {
   text:"OVER "+best,
   number:best,
   confidence:Math.round(50+bestRate*45)
  };
 }

 if(strategy==="UNDER"){
  let best=1,bestRate=0;

  for(let n=1;n<=9;n++){
   const rate=counts.slice(0,n).reduce((a,b)=>a+b,0)/total;

   if(rate>bestRate){
    bestRate=rate;
    best=n;
   }
  }

  return {
   text:"UNDER "+best,
   number:best,
   confidence:Math.round(50+bestRate*45)
  };
 }

 if(strategy==="EVEN"){
  const even=counts[0]+counts[2]+counts[4]+counts[6]+counts[8];

  return {
   text:"EVEN",
   number:null,
   confidence:Math.round(50+(even/total)*45)
  };
 }

 if(strategy==="ODD"){
  const odd=counts[1]+counts[3]+counts[5]+counts[7]+counts[9];

  return {
   text:"ODD",
   number:null,
   confidence:Math.round(50+(odd/total)*45)
  };
 }

 return null;
}

/* ================= RENDER MARKETS ================= */

function renderMarkets(){

 const box=$("markets");

 if(!box)return;

 const list=markets
  .map(m=>data[m.symbol])
  .filter((v,i,a)=>a.findIndex(x=>x.symbol===v.symbol)===i);

 list.sort((a,b)=>b.score-a.score);

 $("scannerCount").textContent=list.filter(x=>x.ticks.length).length+" live";

 box.innerHTML=list.map((m,i)=>`

  <div class="market-card ${i===0&&m.ticks.length?"best":""}"
       onclick="selectMarket('${m.symbol}')">

    <div>
      <div class="market-name">${m.name}</div>
      <div class="market-symbol">${m.symbol}</div>
    </div>

    <div class="market-stat">
      <small>TICKS</small>
      <strong>${m.ticks.length}</strong>
    </div>

    <div class="market-stat">
      <small>HOT</small>
      <strong>${m.hot===null?"—":m.hot}</strong>
    </div>

    <div class="market-stat">
      <small>STRENGTH</small>
      <strong class="score">${m.score||0}%</strong>
    </div>

  </div>
 `).join("");

 const best=bestMarket();

 if(best&&best.ticks.length){
  $("analysisMarket").textContent=best.name;
 }
}

/* ================= SELECT MARKET ================= */

function selectMarket(symbol){

 if(!data[symbol])return;

 selectedSymbol=symbol;

 $("symbol").value=symbol;

 renderDigits();

 const d=data[symbol];

 if(d.ticks.length){
  $("analysisMarket").textContent=d.name;
  $("aiMarket").textContent="Market: "+d.name;
 }

 renderMarkets();
}

/* ================= DIGITS ================= */

function renderDigits(){

 const d=data[selectedSymbol];

 if(!d){
  $("digits").innerHTML="";
  return;
 }

 const counts=Array(10).fill(0);

 d.ticks.slice(-60).forEach(x=>counts[x.digit]++);

 const max=Math.max(...counts,1);

 $("digitMarket").textContent=d.name;

 $("digits").innerHTML=counts.map((v,i)=>`

  <div class="digit">
   <div class="digit-bar" style="height:${Math.max(4,(v/max)*82)}px"></div>
   <span>${i} (${v})</span>
  </div>

 `).join("");
}

/* ================= AI CYCLE ================= */

function setPhase(p,time){

 phase=p;
 sec=time;

 ["cycleAnalysis","cyclePrediction","cycleTrade","cycleCooldown"]
 .forEach(id=>$(id)?.classList.remove("active"));

 if(p==="ANALYSIS"){
  $("cycleAnalysis")?.classList.add("active");
  $("aiCircleLabel").textContent="ANALYSIS";
 }

 if(p==="PREDICTION"){
  $("cyclePrediction")?.classList.add("active");
  $("aiCircleLabel").textContent="LOCKED";
 }

 if(p==="TRADE"){
  $("cycleTrade")?.classList.add("active");
  $("aiCircleLabel").textContent="TRADE NOW";
 }

 if(p==="COOLDOWN"){
  $("cycleCooldown")?.classList.add("active");
  $("aiCircleLabel").textContent="COOLDOWN";
 }

 $("aiCircleTimer").textContent=sec;
}

function runAnalysis(){

 const best=bestMarket();

 if(!best||best.ticks.length<5){

  $("analysisMsg").textContent=
   "Waiting for enough Deriv ticks to analyse the markets.";

  return;
 }

 selectedSymbol=best.symbol;

 const prediction=makePrediction(best,selectedStrategy);

 if(!prediction)return;

 locked={
  market:best,
  prediction,
  created:Date.now()
 };

 $("aiMarket").textContent="Market: "+best.name;
 $("aiPrediction").textContent=prediction.text;
 $("aiCirclePrediction").textContent=
  prediction.number===null
  ?"Predicted: "+(selectedStrategy==="EVEN"?"EVEN":"ODD")
  :"Predicted number: "+prediction.number;

 $("aiType").textContent="Strategy: "+selectedStrategy;
 $("analysisConfidence").textContent=
  "Confidence: "+prediction.confidence+"%";

 $("aiScore").textContent=best.score+"%";
 $("analysisPrediction").textContent=prediction.text;
 $("analysisConfidenceBox").textContent=prediction.confidence+"%";
 $("analysisMarket").textContent=best.name;
 $("analysisStrategy").textContent=selectedStrategy;
 $("reason").textContent=
  "Recent digit frequency, repetition and tick movement.";

 $("analysisText").textContent=
  best.name+
  " currently has the strongest statistical score among the live markets.";

 $("analysisMsg").textContent=
  "Prediction calculated from the latest live tick sample.";
}

function startAI(){

 if(aiRunning)return;

 aiRunning=true;
 $("aiCircleStatus").textContent="AI RUNNING";

 clearInterval(aiTimer);

 setPhase("ANALYSIS",10);

 runAnalysis();

 aiTimer=setInterval(()=>{

  if(!aiRunning)return;

  sec--;

  if(sec<0){

   if(phase==="ANALYSIS"){

    runAnalysis();
    setPhase("PREDICTION",5);

   }else if(phase==="PREDICTION"){

    showTradeNow();
    setPhase("TRADE",1);

   }else if(phase==="TRADE"){

    setPhase("COOLDOWN",3);

   }else if(phase==="COOLDOWN"){

    runAnalysis();
    setPhase("ANALYSIS",10);

   }

   return;
  }

  $("aiCircleTimer").textContent=sec;

 },1000);
}

function showTradeNow(){

 $("aiCircleStatus").textContent="PREDICTION LOCKED";

 if(locked){

  const p=locked.prediction;

  $("aiPrediction").textContent=p.text;

  $("aiCirclePrediction").textContent=
   p.number===null
   ?"Predicted: "+(selectedStrategy==="EVEN"?"EVEN":"ODD")
   :"Predicted number: "+p.number;

  $("tradePrediction").textContent=p.text;
  $("tradeType").textContent=selectedStrategy;
  $("tradeConfidence").textContent=p.confidence+"%";

  $("aiCircle").classList.add("trade-now");

  $("analysisMsg").textContent=
   "TRADE NOW — prediction locked until the next cycle.";
 }
}

function stopAI(){

 aiRunning=false;
 clearInterval(aiTimer);

 $("aiCircleStatus").textContent="AI STOPPED";
 $("aiCircleLabel").textContent="ANALYSIS";
 $("aiCircleTimer").textContent="10";
 $("aiCircle").classList.remove("trade-now");

 setPhase("ANALYSIS",10);
}

/* ================= STRATEGY ================= */

document.querySelectorAll(".strategy").forEach(btn=>{

 btn.addEventListener("click",()=>{

  document.querySelectorAll(".strategy")
   .forEach(x=>x.classList.remove("active"));

  btn.classList.add("active");

  selectedStrategy=btn.dataset.strategy;

  $("strategy").value=selectedStrategy;

  $("tradeStrategy").value=selectedStrategy;

  updateManualField();

  if(aiRunning)runAnalysis();
 });
});

$("tradeStrategy").addEventListener("change",e=>{
 selectedStrategy=e.target.value;
 $("strategy").value=selectedStrategy;
 updateManualField();
});

function updateManualField(){

 const needsNumber=
 ["MATCHES","DIFFERS","OVER","UNDER"]
 .includes(selectedStrategy);

 $("manualNumberGroup").style.display=
  needsNumber?"block":"none";

 $("manualTitle").textContent=
  selectedStrategy==="OVER"||selectedStrategy==="UNDER"
  ?"MANUAL NUMBER"
  :"MANUAL NUMBER";
}

/* ================= NAVIGATION ================= */

document.querySelectorAll(".nav-btn").forEach(btn=>{

 btn.addEventListener("click",()=>{

  document.querySelectorAll(".nav-btn")
   .forEach(x=>x.classList.remove("active"));

  btn.classList.add("active");

  document.querySelectorAll(".page")
   .forEach(p=>p.classList.remove("active"));

  $(btn.dataset.page).classList.add("active");
 });
});

/* ================= THEME ================= */

$("themeToggle").onclick=()=>{

 document.body.classList.toggle("light-mode");

 $("themeToggle").textContent=
  document.body.classList.contains("light-mode")
  ?"☀️"
  :"🌙";

 localStorage.setItem(
  "krishwave_theme",
  document.body.classList.contains("light-mode")
  ?"light":"dark"
);

};

if(localStorage.getItem("krishwave_theme")==="light"){
 document.body.classList.add("light-mode");
 $("themeToggle").textContent="☀️";
}

/* ================= MARKET SELECT ================= */

markets.forEach(m=>{

 const o=document.createElement("option");
 o.value=m.symbol;
 o.textContent=m.name;

 $("symbol").appendChild(o);

});

$("symbol").addEventListener("change",e=>{
 selectMarket(e.target.value);
});

/* ================= SCAN ================= */

$("scan").onclick=()=>{

 const best=bestMarket();

 if(best&&best.ticks.length){
  selectMarket(best.symbol);
  runAnalysis();

  $("analysisMsg").textContent=
   "Scanner selected "+best.name+
   " with a "+best.score+"% statistical strength.";
 }else{
  $("analysisMsg").textContent=
   "No live tick sample yet. Waiting for Deriv.";
 }
};

/* ================= PAPER TRADING ================= */

function updateStats(){

 const total=history.length;
 const wins=history.filter(x=>x.result==="WIN").length;
 const losses=total-wins;
 const pl=history.reduce((a,b)=>a+Number(b.pl||0),0);
 const rate=total?((wins/total)*100).toFixed(1):"0.0";

 ["tradeTotal","historyTotal"].forEach(id=>{
  if($(id))$(id).textContent=total;
 });

 ["tradeWins","historyWins"].forEach(id=>{
  if($(id))$(id).textContent=wins;
 });

 ["tradeLosses","historyLosses"].forEach(id=>{
  if($(id))$(id).textContent=losses;
 });

 ["tradeWinRate","historyWinRate"].forEach(id=>{
  if($(id))$(id).textContent=rate+"%";
 });

 ["tradePL","historyPL"].forEach(id=>{
  if($(id))$(id).textContent=pl.toFixed(2);
 });
}

function renderHistory(){

 const list=$("historyList");

 if(!history.length){
  list.innerHTML=
   `<div class="history-row">
    <div colspan="6">No paper trades yet.</div>
   </div>`;
  updateStats();
  return;
 }

 list.innerHTML=history.slice().reverse().map(x=>`

  <div class="history-row">

   <div>${x.time}</div>
   <div>${x.market}</div>
   <div>${x.strategy}</div>
   <div>${x.number??"—"}</div>
   <div class="${x.result==="WIN"?"win":"loss"}">${x.result}</div>
   <div class="${x.pl>=0?"win":"loss"}">${Number(x.pl).toFixed(2)}</div>

  </div>

 `).join("");

 updateStats();
}

$("clearHistory").onclick=()=>{
 if(confirm("Clear all paper-trading history?")){
  history=[];
  localStorage.removeItem("krishwave_history");
  renderHistory();
 }
};

$("startTrading").onclick=()=>{
 paperRunning=true;
 $("tradeStatus").textContent="RUNNING";
};

$("stopTrading").onclick=()=>{
 paperRunning=false;
 $("tradeStatus").textContent="STOPPED";
};

/* ================= ACCOUNT BUTTONS ================= */

$("demoBtn").onclick=()=>{
 $("demoBtn").classList.add("active");
 $("realBtn").classList.remove("active");
 $("accountType").textContent="DEMO";
 $("demoBalance").textContent="Connect account";
 $("aiMode").textContent="DEMO / PAPER";
};

$("realBtn").onclick=()=>{
 $("realBtn").classList.add("active");
 $("demoBtn").classList.remove("active");
 $("accountType").textContent="REAL";
 $("demoBalance").textContent="AUTH REQUIRED";
 $("aiMode").textContent="REAL BALANCE / PAPER";
};

/* ================= INIT ================= */

function initDigits(){
 $("digits").innerHTML=
  Array.from({length:10},(_,i)=>`
   <div class="digit">
    <div class="digit-bar" style="height:4px"></div>
    <span>${i} (0)</span>
   </div>
  `).join("");
}

function init(){

 initDigits();
 updateManualField();
 renderHistory();

 $("symbol").value=selectedSymbol;

 setPhase("ANALYSIS",10);

 connect();
}

init();