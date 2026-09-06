const C=window.KRISHWAVE_CONFIG||{},APP=C.derivAppId;
const MARKETS=[
["R_10","Volatility 10 Index"],["R_10_1S","Volatility 10 (1s) Index"],
["R_15_1S","Volatility 15 (1s) Index"],["R_25","Volatility 25 Index"],
["R_25_1S","Volatility 25 (1s) Index"],["R_30_1S","Volatility 30 (1s) Index"],
["R_50","Volatility 50 Index"],["R_50_1S","Volatility 50 (1s) Index"],
["R_75","Volatility 75 Index"],["R_75_1S","Volatility 75 (1s) Index"],
["R_90_1S","Volatility 90 (1s) Index"],["R_100","Volatility 100 Index"],
["R_100_1S","Volatility 100 (1s) Index"]];
const $=id=>document.getElementById(id),state={};
MARKETS.forEach(([s,n])=>state[s]={symbol:s,name:n,t:[],q:0,d:null});
let selected=MARKETS[0][0],ws=null,engine=null,seconds=10,strategy="AUTO",signals=0;
let auth={mode:"DEMO",pat:null,accounts:[],id:null,ws:null,balance:null,currency:""};

const pub="wss://api.derivws.com/trading/v1/options/ws/public";
function send(x){if(ws?.readyState===1)ws.send(JSON.stringify(x))}
function digit(q){let s=String(q);return +s.replace(/\D/g,"").slice(-1)}
function analyse(x){
 let t=x.t,d=Array(10).fill(0);t.forEach(v=>d[digit(v)]++);
 let n=t.length||1,p=d.map(v=>v/n*100),e=(d[0]+d[2]+d[4]+d[6]+d[8])/n*100;
 let hi=(d[5]+d[6]+d[7]+d[8]+d[9])/n*100;
 let mx=Math.max(...d),md=d.indexOf(mx),mom=t.length>20?((t.at(-1)-t.at(-21))):0;
 let parity=t.length?digit(t.at(-1))%2?"ODD":"EVEN":"—";
 let streak=0;if(t.length){let z=digit(t.at(-1))%2;for(let i=t.length-1;i>=0;i--){if(digit(t[i])%2===z)streak++;else break}}
 let edge=Math.max(...p)-10,quality=n<30?"WAIT":edge>=8?"HIGH":edge>=4?"GOOD":"LOW";
 return{x,d,p,n,e,hi,mx,md,mom,parity,streak,edge,quality};
}
function signal(a){
 if(!a||a.n<30)return{signal:"WAIT",target:"Need 30+ ticks",confidence:0,edge:0,reason:"Collecting more data"};
 let s=strategy,b=a.d.reduce((i,v,k)=>v>a.d[i]?k:i,0),even=a.e,high=a.hi;
 let out="WAIT",target="—",score=50;
 if(s==="AUTO"){let opts=[
  ["EVEN",Math.abs(even-50),even>=50],
  ["ODD",Math.abs(even-50),even<50],
  ["HIGH",Math.abs(high-50),high>=50],
  ["LOW",Math.abs(high-50),high<50],
  ["MATCH",a.p[a.md]-10,true],
  ["DIFFER",a.p[a.md]-10,false],
  ["RISE",a.mom, a.mom>0],["FALL",Math.abs(a.mom),a.mom<0]];
  let z=opts.filter(v=>v[2]).sort((u,v)=>v[1]-u[1])[0];s=z?.[0]||"WAIT"}
 if(s==="EVEN"){out="EVEN";target="0,2,4,6,8";score=even}
 if(s==="ODD"){out="ODD";target="1,3,5,7,9";score=100-even}
 if(s==="HIGH"){out="HIGH";target="5–9";score=high}
 if(s==="LOW"){out="LOW";target="0–4";score=100-high}
 if(s==="OVER"){out="OVER";target="6–9";score=100-(a.p[0]+a.p[1]+a.p[2]+a.p[3]+a.p[4]+a.p[5])}
 if(s==="UNDER"){out="UNDER";target="0–5";score=a.p.slice(0,6).reduce((u,v)=>u+v,0)}
 if(s==="MATCH"){out="MATCH";target="Digit "+a.md;score=a.p[a.md]}
 if(s==="DIFFER"){out="DIFFER";target="≠ "+a.md;score=100-a.p[a.md]}
 if(s==="RISE"){out="RISE";target="UP";score=a.mom>0?Math.min(90,55+a.mom):45}
 if(s==="FALL"){out="FALL";target="DOWN";score=a.mom<0?Math.min(90,55+Math.abs(a.mom)):45}
 let conf=Math.max(50,Math.min(95,score+(a.streak>3?3:0)));
 return{signal:out,target,confidence:conf,edge:conf-50,reason:`${out} selected from ${a.n} recent ticks. Statistical bias only.`,a,s};
}
function update(){
 let x=state[selected],a=analyse(x);
 $("liveMarketName").textContent=x.name;$("liveMarketSymbol").textContent=x.symbol;
 $("liveQuote").textContent=x.q||"—";$("liveLastDigit").textContent=x.d??"—";$("liveTicks").textContent=x.t.length;
 $("selectedMarketName").textContent=x.name;$("selectedSymbol").textContent=x.symbol;
 $("selectedQuote").textContent=x.q||"—";$("selectedLastDigit").textContent=x.d??"—";
 $("selectedQuality").textContent=a.quality;$("selectedQualityText").textContent=`Sample ${a.n} • Edge ${a.edge.toFixed(1)}% • Even ${a.e.toFixed(1)}% • High ${a.hi.toFixed(1)}%`;
 $("aiSample").textContent=a.n;
 $("reasonDigit").textContent=a.n?`${a.md} ${a.p[a.md].toFixed(1)}%`:"—";
 $("reasonMomentum").textContent=a.mom>0?"UP":a.mom<0?"DOWN":"FLAT";
 $("reasonStreak").textContent=a.streak;$("reasonState").textContent=a.quality;
 $("digitDistribution").innerHTML=a.p.map((v,i)=>`<div class="digit"><b>${i}</b><small>${v.toFixed(0)}%</small></div>`).join("");
 $("probabilityGrid").innerHTML=[["EVEN",a.e],["ODD",100-a.e],["HIGH",a.hi],["LOW",100-a.hi],["TOP DIGIT",a.p[a.md]||0]].map(v=>`<div><small>${v[0]}</small><b>${v[1].toFixed(1)}%</b></div>`).join("");
 let z=signal(a);$("aiSignal").textContent=z.signal;$("aiTarget").textContent=z.target;
 $("aiConfidence").textContent=z.confidence?z.confidence.toFixed(1)+"%":"—";$("aiEdge").textContent=z.edge.toFixed(1)+"%";
 $("aiReason").textContent=z.reason;$("aiQuality").textContent=a.quality;
 return a;
}
function scanner(){
 $("marketScanner").innerHTML=MARKETS.map(([s,n],i)=>{
  let a=analyse(state[s]),z=signal(a);
  return `<div class="market ${s===selected?"sel":""}" data-s="${s}"><h3>${i+1}. ${n}</h3><p>Ticks: ${a.n}</p><p>Digit: <strong>${a.n?a.md:"—"}</strong></p><p>Signal: <strong>${z.signal}</strong></p><p>Confidence: ${z.confidence?z.confidence.toFixed(0)+"%":"—"}</p></div>`
 }).join("");
 document.querySelectorAll(".market").forEach(e=>e.onclick=()=>{selected=e.dataset.s;subscribe();scanner();update()});
}
function subscribe(){
 send({ticks_history:selected,end:"latest",count:120,style:"ticks",req_id:2});
 send({ticks:selected,subscribe:1,req_id:3});
}
function openPublic(){
 ws=new WebSocket(pub);
 ws.onopen=()=>{ $("connectionText").textContent="PUBLIC DATA LIVE";$("statusAccount").textContent=auth.id?"CONNECTED":"PUBLIC";send({active_symbols:"brief",req_id:1});MARKETS.forEach((m,i)=>send({ticks_history:m[0],end:"latest",count:120,style:"ticks",req_id:100+i}));subscribe()};
 ws.onmessage=e=>{
  let m=JSON.parse(e.data);
  if(m.history){let s=m.echo_req?.ticks_history||m.echo_req?.symbol;if(state[s])state[s].t=(m.history.prices||[]).map(Number).slice(-150),state[s].q=state[s].t.at(-1)||0,state[s].d=digit(state[s].q)}
  if(m.tick){let s=m.tick.symbol;if(state[s]){state[s].q=+m.tick.quote;state[s].d=digit(m.tick.quote);state[s].t.push(+m.tick.quote);state[s].t=state[s].t.slice(-150)}}
  update();scanner()
 };
 ws.onerror=()=>{$("connectionText").textContent="DATA ERROR"};
 ws.onclose=()=>{$("connectionText").textContent="PUBLIC DATA OFFLINE"};
}
async function api(url,opt={}){
 let r=await fetch(url,{...opt,headers:{"Deriv-App-ID":APP,Authorization:"Bearer "+auth.pat,Accept:"application/json",...(opt.headers||{})}});
 let j=await r.json();if(!r.ok)throw Error(j?.errors?.[0]?.message||"Deriv request failed");return j;
}
function accountType(a){
 let v=String(a.type||a.account_type||a.environment||"").toLowerCase();
 return a.is_demo===true||v.includes("demo")||String(a.account_id||a.id||"").startsWith("VR")?"demo":"real";
}
async function connect(){
 let pat=$("derivPat").value.trim();if(!pat)return alert("Enter your Deriv PAT.");
 auth.pat=pat;auth.mode=$("accountMode").value.toUpperCase();
 $("authStatus").textContent="CONNECTING...";
 try{
  let j=await api("https://api.derivws.com/trading/v1/options/accounts");
  let list=j.data?.accounts||j.accounts||j.data||[];if(!Array.isArray(list))list=[];
  auth.accounts=list.filter(a=>accountType(a)===auth.mode.toLowerCase());
  if(!auth.accounts.length)throw Error("No "+auth.mode+" account found.");
  let a=auth.accounts[0],id=a.account_id||a.accountId||a.loginid||a.login_id||a.id;
  if(!id)throw Error("Account ID not found.");
  auth.id=id;auth.currency=a.currency||a.currency_code||"";
  $("accountType").textContent=auth.mode;$("accountId").textContent=id;$("balanceCurrency").textContent=auth.currency||"—";
  let o=await api(`https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(id)}/otp`,{method:"POST"});
  let url=o.data?.url||o.data?.websocket_url||o.url||o.websocket_url;if(!url)throw Error("No WebSocket URL returned.");
  auth.ws=new WebSocket(url);
  auth.ws.onopen=()=>{auth.ws.send(JSON.stringify({balance:1,subscribe:1,req_id:9001}));$("authStatus").textContent="CONNECTED";$("authBadge").textContent=auth.mode;$("disconnectDerivBtn").classList.remove("hidden");$("connectDerivBtn").classList.add("hidden");$("connectionText").textContent=auth.mode+" ACCOUNT + LIVE DATA"};
  auth.ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.balance){let b=m.balance.balance??m.balance;auth.balance=+b;$("liveBalance").textContent=auth.balance.toFixed(2);$("balanceCurrency").textContent=m.balance.currency||auth.currency||"—"}};
  auth.ws.onclose=()=>{$("authStatus").textContent="AUTH SOCKET CLOSED"};
 }catch(e){auth.pat=null;$("authStatus").textContent=e.message}
}
function disconnect(){
 try{auth.ws?.close()}catch{}auth={mode:"DEMO",pat:null,accounts:[],id:null,ws:null,balance:null,currency:""};
 $("accountType").textContent="PUBLIC";$("accountId").textContent="—";$("liveBalance").textContent="—";$("balanceCurrency").textContent="—";$("authStatus").textContent="PUBLIC DATA";$("authBadge").textContent="PUBLIC";
 $("disconnectDerivBtn").classList.add("hidden");$("connectDerivBtn").classList.remove("hidden");$("derivPat").value="";$("connectionText").textContent="PUBLIC DATA LIVE";
}
function risk(win){
 let stake=+$("currentStake").textContent,pl=+$("sessionPL").textContent||0;
 if(win){pl+=stake;$("winLoss").textContent=(+(($("winLoss").textContent||"0 / 0").split("/")[0])+1)+" / "+(($("winLoss").textContent||"0 / 0").split("/")[1]||0);$("lossStreak").textContent=0;$("currentStake").textContent=(+$("baseStake").value).toFixed(2)}
 else{pl-=stake;let q=$("winLoss").textContent.split("/"),w=+q[0],l=+q[1]+1;$("winLoss").textContent=`${w} / ${l}`;let st=+$("lossStreak").textContent+1;$("lossStreak").textContent=st;$("currentStake").textContent=Math.min(100,stake*(+$("martingale").value||2)).toFixed(2)}
 $("sessionPL").textContent=pl.toFixed(2);$("riskStateBadge").textContent=pl>=+$("takeProfit").value?"TAKE PROFIT":pl<=-+$("stopLoss").value?"STOP LOSS":"ACTIVE";
}
function engineStart(){
 clearInterval(engine);seconds=10;$("aiPhase").textContent="ANALYSING";$("tradeSignalBox").textContent="AI analysis running — no real contract will be placed.";
 engine=setInterval(()=>{seconds--;$("aiSeconds").textContent=seconds;if(seconds<=0){seconds=7;let z=signal(update());signals++;$("statusSignals").textContent=signals;$("aiPhase").textContent="ENTRY COUNTDOWN";$("tradeSignalBox").textContent=`PAPER SIGNAL: ${z.signal} ${z.target} • ${z.confidence.toFixed(1)}% confidence`;if(signals%2===0){} }},1000)
}
function engineStop(){clearInterval(engine);$("aiPhase").textContent="STOPPED";$("aiSeconds").textContent=10}
document.querySelectorAll(".strategies button").forEach(b=>b.onclick=()=>{strategy=b.dataset.strategy;document.querySelectorAll(".strategies button").forEach(x=>x.classList.toggle("active",x===b));$("strategySelect").value=strategy;update()});
$("strategySelect").onchange=e=>{strategy=e.target.value;document.querySelectorAll(".strategies button").forEach(b=>b.classList.toggle("active",b.dataset.strategy===strategy));update()};
$("connectDerivBtn").onclick=connect;$("disconnectDerivBtn").onclick=disconnect;$("scanAllBtn").onclick=()=>{MARKETS.forEach((m,i)=>send({ticks_history:m[0],end:"latest",count:120,style:"ticks",req_id:300+i}));};
$("startEngineBtn").onclick=engineStart;$("stopEngineBtn").onclick=engineStop;$("simWinBtn").onclick=()=>risk(true);$("simLossBtn").onclick=()=>risk(false);
$("resetRiskBtn").onclick=()=>{$("currentStake").textContent=(+$("baseStake").value).toFixed(2);$("sessionPL").textContent="0.00";$("winLoss").textContent="0 / 0";$("lossStreak").textContent="0";$("riskStateBadge").textContent="READY"};
$("themeToggle").onclick=()=>document.body.classList.toggle("light");
$("baseStake").onchange=()=>{if(+$("baseStake").value<C.minStake)$("baseStake").value=C.minStake;$("currentStake").textContent=(+$("baseStake").value).toFixed(2)};
scanner();openPublic();update();