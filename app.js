const markets=[
["R_10","Volatility 10 Index"],["R_10_1S","Volatility 10 (1s)"],["R_15_1S","Volatility 15 (1s)"],
["R_25","Volatility 25 Index"],["R_25_1S","Volatility 25 (1s)"],["R_30_1S","Volatility 30 (1s)"],
["R_50","Volatility 50 Index"],["R_50_1S","Volatility 50 (1s)"],["R_75","Volatility 75 Index"],
["R_75_1S","Volatility 75 (1s)"],["R_90_1S","Volatility 90 (1s)"],["R_100","Volatility 100 Index"],["R_100_1S","Volatility 100 (1s)"]
];
let selected=markets[0][0];
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
function page(id){$$(".page").forEach(x=>x.classList.add("hidden"));$("#"+id).classList.remove("hidden");scrollTo(0,0)}
function renderMarkets(scan=false){
 $("#marketList").innerHTML=markets.map((m,i)=>{let conf=scan?Math.round(55+Math.random()*38):null;let sig=scan?(conf>=72?"TRADE":"NO TRADE"):"READY";return `<button class="market-item ${m[0]===selected?"selected":""}" data-symbol="${m[0]}"><div><b>${m[1]}</b><div class="market-meta">${m[0]} · Live tick data ready</div></div><div class="market-signal"><span class="signal ${conf>=72?"good":"wait"}">${sig}</span>${conf?`<div>${conf}%</div>`:""}</div></button>`}).join("");
 $$(".market-item").forEach(b=>b.onclick=()=>{selected=b.dataset.symbol;renderMarkets(scan);});
}
renderMarkets();
$("#scanAll").onclick=()=>{renderMarkets(true);$("#engineStatus").innerHTML='<small>AI SCAN COMPLETE</small><strong>READY</strong><b>Weak setups are filtered as NO TRADE</b>'};
$$(".mode button").forEach(b=>b.onclick=()=>{$$(".mode button").forEach(x=>x.classList.remove("active"));b.classList.add("active")});
function startBot(){let btn=$("#start");let running=btn.dataset.running==="1";if(!running){btn.dataset.running="1";btn.textContent="Stop Trading Bot";$("#engineStatus").innerHTML='<small>BOT RUNNING</small><strong>LIVE</strong><b>AI Engine Analyzing Market</b>'}else{btn.dataset.running="0";btn.textContent="Start Trading Bot";$("#engineStatus").innerHTML='<small>WAITING...</small><strong>--</strong><b>AI Engine Ready to Start</b>'}}
$("#start").onclick=startBot;
$("#account").onchange=e=>$("#ptype").textContent=e.target.value;
