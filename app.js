const C=window.KRISHWAVE_CONFIG||{},APP=C.derivAppId;
const M=[
["R_10","Volatility 10"],["R_10_1S","Volatility 10 (1s)"],["R_15_1S","Volatility 15 (1s)"],
["R_25","Volatility 25"],["R_25_1S","Volatility 25 (1s)"],["R_30_1S","Volatility 30 (1s)"],
["R_50","Volatility 50"],["R_50_1S","Volatility 50 (1s)"],["R_75","Volatility 75"],
["R_75_1S","Volatility 75 (1s)"],["R_90_1S","Volatility 90 (1s)"],["R_100","Volatility 100"],
["R_100_1S","Volatility 100 (1s)"]];
const $=x=>document.getElementById(x),S={};M.forEach(([s,n])=>S[s]={symbol:s,name:n,t:[],q:0,d:null});
let selected=M[0][0],ws=null,strategy="AUTO",timer=null,phase="READY",sec=10,signals=0,running=false;

const pub="wss://api.derivws.com/trading/v1/options/ws/public";
function send(x){if(ws?.readyState===1)ws.send(JSON.stringify(x))}
function dig(q){return +String(q).replace(/\D/g,"").slice(-1)}
function A(x){
 const d=Array(10).fill(0);x.t.forEach(q=>d[dig(q)]++);
 const n=x.t.length||1,p=d.map(v=>v/n*100),even=d.filter((_,i)=>i%2==0).reduce((a,b)=>a+b,0)/n*100;
 const high=d.slice(5).reduce((a,b)=>a+b,0)/n*100,md=d.indexOf(Math.max(...d));
 const mom=x.t.length>20?x.t.at(-1)-x.t.at(-21):0;
 return{d,p,n,even,odd:100-even,high,low:100-high,md,mom};
}
function Z(a){
 if(a.n<30)return{signal:"WAIT",target:"COLLECTING TICKS",conf:0,edge:0};
 let s=strategy,score=50,target="—",signal="WAIT";
 if(s==="AUTO"){
  let q=[
   ["EVEN",Math.abs(a.even-50),a.even>=50,a.even>=50?"0,2,4,6,8":"1,3,5,7,9"],
   ["ODD",Math.abs(a.odd-50),a.odd>a.even,"1,3,5,7,9"],
   ["HIGH",Math.abs(a.high-50),a.high>=50,"5–9"],
   ["LOW",Math.abs(a.low-50),a.low>a.high,"0–4"],
   ["MATCH",a.p[a.md]-10,true,String(a.md)],
   ["DIFFER",100-a.p[a.md],true,"≠ "+a.md],
   ["RISE",Math.abs(a.mom),a.mom>0,"UP"],
   ["FALL",Math.abs(a.mom),a.mom<0,"DOWN"]
  ];
  s=q.filter(v=>v[2]).sort((u,v)=>v[1]-u[1])[0]?.[0]||"EVEN";
 }
 if(s==="EVEN"){signal="EVEN";target="0, 2, 4, 6, 8";score=a.even}
 if(s==="ODD"){signal="ODD";target="1, 3, 5, 7, 9";score=a.odd}
 if(s==="HIGH"){signal="HIGH";target="5–9";score=a.high}
 if(s==="LOW"){signal="LOW";target="0–4";score=a.low}
 if(s==="OVER"){signal="OVER";target="6–9";score=100-a.p.slice(0,6).reduce((a,b)=>a+b,0)}
 if(s==="UNDER"){signal="UNDER";target="0–5";score=a.p.slice(0,6).reduce((a,b)=>a+b,0)}
 if(s==="MATCH"){signal="MATCH";target=String(a.md);score=a.p[a.md]}
 if(s==="DIFFER"){signal="DIFFER";target="≠ "+a.md;score=100-a.p[a.md]}
 if(s==="RISE"){signal="RISE";target="UP";score=a.mom>0?60:45}
 if(s==="FALL"){signal="FALL";target="DOWN";score=a.mom<0?60:45}
 const conf=Math.max(50,Math.min(95,score));
 return{signal,target,conf,edge:conf-50};
}

function strategyCard(){
 let old=$("strategyCard");
 if(!old){
  old=document.createElement("div");old.id="strategyCard";old.className="card";
  const anchor=$("strategySelect")?.parentElement;
  (anchor||$("strategySelect"))?.after(old);
 }
 const a=A(S[selected]),z=Z(a);
 old.innerHTML=`
 <div class="sectionHead"><h2>STRATEGY SIGNAL</h2><span class="badge">${strategy}</span></div>
 <div class="signal">
   <strong>${z.signal}</strong>
   <b>${z.target}</b>
 </div>
 <div class="metrics">
   <div><small>TARGET</small><b>${z.target}</b></div>
   <div><small>CONFIDENCE</small><b>${z.conf?z.conf.toFixed(1)+"%":"—"}</b></div>
   <div><small>LAST DIGIT</small><b>${S[selected].d??"—"}</b></div>
   <div><small>SAMPLE</small><b>${a.n}</b></div>
 </div>
 <p>${a.n<30?"Waiting for more market data...":"AI automatically selected the strongest current statistical bias."}</p>`;
}

function update(){
 const x=S[selected],a=A(x),z=Z(a);
 $("liveMarketName").textContent=x.name;$("liveMarketSymbol").textContent=x.symbol;
 $("liveQuote").textContent=x.q||"—";$("liveLastDigit").textContent=x.d??"—";$("liveTicks").textContent=x.t.length;
 $("selectedMarketName").textContent=x.name;$("selectedSymbol").textContent=x.symbol;
 $("selectedQuote").textContent=x.q||"—";$("selectedLastDigit").textContent=x.d??"—";
 $("selectedQuality").textContent=a.n<30?"WAIT":a.p[a.md]>=20?"HIGH":"GOOD";
 $("selectedQualityText").textContent=`Sample ${a.n} • Top digit ${a.md} • ${a.p[a.md].toFixed(1)}%`;
 $("aiSample").textContent=a.n;$("reasonDigit").textContent=a.n?`${a.md} ${a.p[a.md].toFixed(1)}%`:"—";
 $("reasonMomentum").textContent=a.mom>0?"UP":a.mom<0?"DOWN":"FLAT";
 $("reasonState").textContent=a.n<30?"COLLECTING":"ACTIVE";
 $("reasonStreak").textContent="—";
 $("digitDistribution").innerHTML=a.p.map((v,i)=>`<div class="digit"><b>${i}</b><small>${v.toFixed(0)}%</small></div>`).join("");
 $("probabilityGrid").innerHTML=[
 ["EVEN",a.even],["ODD",a.odd],["HIGH",a.high],["LOW",a.low],["TOP "+a.md,a.p[a.md]||0]
 ].map(v=>`<div><small>${v[0]}</small><b>${v[1].toFixed(1)}%</b></div>`).join("");
 $("aiSignal").textContent=z.signal;$("aiTarget").textContent=z.target;
 $("aiConfidence").textContent=z.conf?z.conf.toFixed(1)+"%":"—";$("aiEdge").textContent=z.edge.toFixed(1)+"%";
 strategyCard();scanner();
}

function scanner(){
 $("marketScanner").innerHTML=M.map(([s,n],i)=>{
  const a=A(S[s]),z=Z(a);
  return `<div class="market ${s===selected?"sel":""}" data-s="${s}">
   <h3>${i+1}. ${n}</h3><p>Ticks: ${a.n}</p>
   <p>Top digit: <strong>${a.n?a.md:"—"}</strong></p>
   <p>Signal: <strong>${z.signal}</strong></p>
   <p>Confidence: ${z.conf?z.conf.toFixed(0)+"%":"—"}</p>
  </div>`
 }).join("");
 document.querySelectorAll(".market").forEach(e=>e.onclick=()=>{
  selected=e.dataset.s;subscribe();update()
 });
}

function subscribe(){
 send({ticks_history:selected,end:"latest",count:120,style:"ticks"});
 send({ticks:selected,subscribe:1});
}

function publicWS(){
 ws=new WebSocket(pub);
 ws.onopen=()=>{
  $("connectionText").textContent="PUBLIC DATA LIVE";
  M.forEach(([s],i)=>send({ticks_history:s,end:"latest",count:120,style:"ticks",req_id:100+i}));
  subscribe();
 };
 ws.onmessage=e=>{
  const m=JSON.parse(e.data);
  if(m.history){
   const s=m.echo_req?.ticks_history;
   if(S[s]){S[s].t=(m.history.prices||[]).map(Number).slice(-150);S[s].q=S[s].t.at(-1)||0;S[s].d=dig(S[s].q)}
  }
  if(m.tick){
   const s=m.tick.symbol;
   if(S[s]){
    S[s].q=+m.tick.quote;S[s].d=dig(m.tick.quote);
    S[s].t.push(+m.tick.quote);S[s].t=S[s].t.slice(-150);
   }
  }
  update();
 };
 ws.onclose=()=>$("connectionText").textContent="PUBLIC DATA OFFLINE";
 ws.onerror=()=>$("connectionText").textContent="DATA ERROR";
}

/* ================= AI 10 → 5 → 3 CYCLE ================= */
function setPhase(p,n){
 phase=p;sec=n;$("aiSeconds").textContent=n;$("aiPhase").textContent=p;
}
function cycle(){
 if(!running)return;
 if(phase==="ANALYZING"){
  setPhase("ANALYZING",10);
  $("tradeSignalBox").textContent="AI is scanning the selected market...";
  timer=setInterval(()=>{
   if(!running)return;
   sec--;$("aiSeconds").textContent=sec;
   if(sec<=0){
    clearInterval(timer);
    const a=A(S[selected]),z=Z(a);
    $("aiSignal").textContent=z.signal;
    $("aiTarget").textContent=z.target;
    $("aiConfidence").textContent=z.conf?z.conf.toFixed(1)+"%":"—";
    $("tradeSignalBox").textContent=`PREDICTION READY: ${z.signal} ${z.target}`;
    setPhase("PREDICTION",5);
    cycle();
   }
  },1000);
 }
 else if(phase==="PREDICTION"){
  timer=setInterval(()=>{
   if(!running)return;
   sec--;$("aiSeconds").textContent=sec;
   if(sec<=0){
    clearInterval(timer);
    const z=Z(A(S[selected]));
    signals++;$("statusSignals").textContent=signals;
    $("tradeSignalBox").textContent=`TRADE NOW — ${z.signal} ${z.target}`;
    setPhase("TRADE NOW",3);
    cycle();
   }
  },1000);
 }
 else if(phase==="TRADE NOW"){
  timer=setInterval(()=>{
   if(!running)return;
   sec--;$("aiSeconds").textContent=sec;
   if(sec<=0){
    clearInterval(timer);
    setPhase("ANALYZING",10);
    cycle();
   }
  },1000);
 }
}
function start(){
 if(running)return;
 running=true;
 $("startEngineBtn").textContent="RUNNING";
 $("startTradingBtn")?.classList.add("active");
 setPhase("ANALYZING",10);cycle();
}
function stop(){
 running=false;clearInterval(timer);timer=null;
 setPhase("STOPPED",10);
 $("startEngineBtn").textContent="START";
 $("startTradingBtn")?.classList.remove("active");
 $("tradeSignalBox").textContent="Engine stopped. No real contract was placed.";
}

/* ================= STRATEGIES ================= */
document.querySelectorAll(".strategies button").forEach(b=>b.onclick=()=>{
 strategy=b.dataset.strategy;
 document.querySelectorAll(".strategies button").forEach(x=>x.classList.toggle("active",x===b));
 $("strategySelect").value=strategy;
 strategyCard();update();
});
$("strategySelect").onchange=e=>{
 strategy=e.target.value;
 document.querySelectorAll(".strategies button").forEach(b=>b.classList.toggle("active",b.dataset.strategy===strategy));
 strategyCard();update();
};

/* ================= TRADING CONTROL ================= */
function tradingButtons(){
 if($("startTradingBtn"))return;
 const box=document.createElement("div");
 box.className="buttons";
 box.innerHTML=`
 <button id="startTradingBtn" class="primary">▶ START TRADING</button>
 <button id="stopTradingBtn" class="danger">■ STOP TRADING</button>`;
 const paper=$("simWinBtn")?.parentElement;
 paper?.before(box);
 $("startTradingBtn").onclick=start;
 $("stopTradingBtn").onclick=stop;
}
tradingButtons();

/* ================= PAPER RISK ================= */
function risk(win){
 let st=+$("currentStake").textContent,pl=+$("sessionPL").textContent||0,q=$("winLoss").textContent.split("/");
 if(win){
  pl+=st;$("winLoss").textContent=`${+q[0]+1} / ${+q[1]}`;
  $("lossStreak").textContent=0;$("currentStake").textContent=(+$("baseStake").value).toFixed(2);
 }else{
  pl-=st;$("winLoss").textContent=`${+q[0]} / ${+q[1]+1}`;
  $("lossStreak").textContent=+$("lossStreak").textContent+1;
  $("currentStake").textContent=Math.min(100,st*(+$("martingale").value||2)).toFixed(2);
 }
 $("sessionPL").textContent=pl.toFixed(2);
 $("riskStateBadge").textContent=pl>=+$("takeProfit").value?"TAKE PROFIT":pl<=-+$("stopLoss").value?"STOP LOSS":"ACTIVE";
}
$("simWinBtn").onclick=()=>risk(true);
$("simLossBtn").onclick=()=>risk(false);
$("resetRiskBtn").onclick=()=>{
 $("currentStake").textContent=(+$("baseStake").value).toFixed(2);
 $("sessionPL").textContent="0.00";$("winLoss").textContent="0 / 0";
 $("lossStreak").textContent="0";$("riskStateBadge").textContent="READY";
};

/* ================= BASIC CONTROLS ================= */
$("startEngineBtn").onclick=start;
$("stopEngineBtn").onclick=stop;
$("scanAllBtn").onclick=()=>M.forEach(([s],i)=>send({ticks_history:s,end:"latest",count:120,style:"ticks",req_id:500+i}));
$("themeToggle").onclick=()=>document.body.classList.toggle("light");

scanner();tradingButtons();publicWS();update();