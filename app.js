/* KRISHWAVE AI BEAST V8.0 — DERIV DEMO ENGINE
   DEMO account only. No real-money trading is enabled.
*/
"use strict";

const CONFIG={
  VERSION:"8.0",
  CLIENT_ID:"34nw4IAw4CXiixJLUhBWu",
  REDIRECT_URI:"https://chrispusatale99-dot.github.io/KRISHWAVE/",
  CLOUD_API:"https://krishwave2.chrispusatale99.workers.dev",
  PUBLIC_WS:"wss://api.derivws.com/trading/v1/options/ws/public",
  MARKETS:["R_10","R_25","R_50","R_75","R_100","1HZ10V","1HZ25V","1HZ30V","1HZ50V","1HZ75V","1HZ90V","1HZ100V","1HZ150V","1HZ250V","1HZ1000V"],
  MAX_TICKS:250,MIN_TICKS:20,SCAN_TICKS:80,
  CIRCULAR:[10,5,3,3],BOT_MS:3000,MIN_STAKE:0.35,MAX_ACTIVE:10,
  HISTORY_KEY:"krishwave_demo_history_v8",
  SETTINGS_KEY:"krishwave_demo_settings_v8"
};

const STRATEGIES=["MATCHES","DIFFERS","OVER","UNDER","EVEN","ODD"];

const S={
  sessionToken:sessionStorage.getItem("krishwave_cloud_session")||"",
  accountId:"",
  currency:"USD",
  balance:0,
  publicWs:null,
  authWs:null,
  publicLive:false,
  demoLive:false,
  reconnect:null,
  authReconnect:null,
  currentMarket:"R_100",
  markets:{},
  ticks:[],
  lastDigit:null,
  lastPrice:0,
  analysis:null,
  strongest:"R_100",
  scanner:[],
  strategy:"MATCHES",
  circularStrategy:"AUTO",
  botStrategies:["MATCHES","DIFFERS"],
  bot:false,
  botTimer:null,
  circular:false,
  circularTimer:null,
  phase:"IDLE",
  remaining:0,
  active:new Map(),
  history:[],
  wins:0,
  losses:0,
  stakeTotal:0,
  profit:0,
  sessionProfit:0,
  won:0,
  martingale:1,
  takeProfit:20,
  stopLoss:20,
  tradingStopped:false,
  req:9000,
  pending:{},
  theme:localStorage.getItem("krishwave_theme_v8")||"dark"
};

const E={};

const ids=[
"connectionDot","connectionText","modeBadge","themeToggle",
"accountId","balanceDisplay","currency","connectDerivBtn","dataStatus",
"analysisMarketSelect","currentChartMarket","currentLivePrice",
"priceChartCanvas","digitSampleCount","lastDigit","analysisConfidence",
"aiStatus","aiCircleLabel","aiCirclePrediction","aiPrediction","aiType",
"analysisMsg","aiMarket","digitStatsGrid","aiCircleStatus","cycleAnalysis",
"cycleTrade","aiCircleTimer","cycleCooldown","startAI","stopAI",
"engineStatusText","tabAiBot","tabCircularAI","tabManual",
"aiBotPanel","circularPanel","manualPanel","botStatusDash",
"botSelectedMarket","botScore","aiPredictionLarge","predictionConfidence",
"botMarketSelect","botStrategyTrigger","botStrategyLabel","stakeInput",
"takeProfitInput","stopLossInput","martingaleInput","startBotBtn",
"circularStatusText","circularMarketSelect","circularStrategyTrigger",
"circularStrategyLabel","circularStakeInput","circularTakeProfitInput",
"circularStopLossInput","startCircularTradeBtn","manualStatusText",
"manualMarketSelect","manualStrategyTrigger","manualSelectedStrategyLabel",
"targetDigitContainer","manualTargetDigitInput","manualStakeInput",
"manualTakeProfitInput","manualStopLossInput","placeTradeBtn",
"paperTotal","paperWins","paperLosses","paperAccuracy",
"activeTradeCount","activeTradesList","clearLogsBtn",
"historyTotalStake","historyAmountWon","historyNetProfit",
"tradingStatusLabel","sessionProfitDisplay","totalProfitDisplay",
"stopTradingBtn","strategyModal","closeStrategyModal","strategyOptions",
"botStrategyModal","closeBotStrategyModal","applyBotStrategies",
"realConfirmModal","cancelRealBtn","confirmRealBtn","toast","toastMessage"
];

ids.forEach(id=>E[id]=$(id));

function $(id){
  return document.getElementById(id);
}

function init(){
  document.body.classList.toggle("light",S.theme==="light");

  if(E.themeToggle){
    E.themeToggle.textContent=S.theme==="light"?"🌙":"☀️";
  }

  setupNav();
  setupTabs();
  setupModals();
  setupButtons();
  setupInputs();
  populateMarkets();
  loadSettings();
  loadHistory();
  updateAll();
  drawChart();
  connectPublic();
  handleOAuth();

  if(S.sessionToken) restoreSession();

  window.KRISHWAVE={
    CONFIG,
    S,
    startBot,
    stopBot,
    startCircularAI,
    stopCircularAI,
    connectDemo
  };
}

function setupNav(){
  document.querySelectorAll(".nav-item").forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll(".nav-item")
        .forEach(x=>x.classList.remove("active"));

      b.classList.add("active");

      document.querySelectorAll(".page")
        .forEach(x=>x.classList.remove("active"));

      $(b.dataset.page+"Page")?.classList.add("active");
      window.scrollTo(0,0);
    };
  });
}

function setupTabs(){
  const tabs=[
    [E.tabAiBot,E.aiBotPanel],
    [E.tabCircularAI,E.circularPanel],
    [E.tabManual,E.manualPanel]
  ];

  tabs.forEach(([b,p])=>{
    b?.addEventListener("click",()=>{
      tabs.forEach(([x,y])=>{
        x?.classList.remove("active");
        y?.classList.remove("active");
      });

      b.classList.add("active");
      p.classList.add("active");
    });
  });
}

function setupButtons(){
  E.connectDerivBtn?.addEventListener("click",()=>{
    S.sessionToken?connectDemo():startOAuth();
  });

  E.startBotBtn?.addEventListener("click",()=>{
    S.bot?stopBot():startBot();
  });

  E.startCircularTradeBtn?.addEventListener("click",()=>{
    S.circular?stopCircularAI():startCircularAI();
  });

  E.startAI?.addEventListener("click",startCircularAI);
  E.stopAI?.addEventListener("click",stopCircularAI);
  E.placeTradeBtn?.addEventListener("click",manualTrade);

  E.themeToggle?.addEventListener("click",()=>{
    S.theme=document.body.classList.contains("light")?"dark":"light";
    document.body.classList.toggle("light",S.theme==="light");
    localStorage.setItem("krishwave_theme_v8",S.theme);

    E.themeToggle.textContent=S.theme==="light"?"🌙":"☀️";
    drawChart();
  });

  E.stopTradingBtn?.addEventListener("click",()=>{
    S.tradingStopped=!S.tradingStopped;

    if(S.tradingStopped){
      stopBot();
      stopCircularAI();
      toast("Trading engines stopped");
    }else{
      toast("Trading engines unlocked");
    }

    updateAll();
  });

  E.clearLogsBtn?.addEventListener("click",()=>{
    if(confirm("Clear completed DEMO history?")){
      S.history=[];
      recalc();
      saveHistory();
      updateAll();
      toast("History cleared");
    }
  });

  E.cancelRealBtn?.addEventListener("click",()=>{
    E.realConfirmModal?.classList.remove("show");
  });

  E.confirmRealBtn?.addEventListener("click",()=>{
    E.realConfirmModal?.classList.remove("show");
    toast("REAL trading is disabled. DEMO only.");
  });
}

function setupInputs(){
  E.analysisMarketSelect?.addEventListener("change",e=>{
    selectMarket(e.target.value);
  });

  E.botMarketSelect?.addEventListener("change",e=>{
    if(E.botSelectedMarket){
      E.botSelectedMarket.textContent=e.target.value;
    }
  });

  E.botStrategyTrigger?.addEventListener("click",openBotModal);

  E.circularStrategyTrigger?.addEventListener("click",()=>{
    openStrategy("circular");
  });

  E.manualStrategyTrigger?.addEventListener("click",()=>{
    openStrategy("manual");
  });

  [
    E.takeProfitInput,
    E.circularTakeProfitInput,
    E.manualTakeProfitInput
  ].forEach(x=>{
    x?.addEventListener("change",()=>{
      S.takeProfit=Math.max(0,num(x.value,20));
      saveSettings();
    });
  });

  [
    E.stopLossInput,
    E.circularStopLossInput,
    E.manualStopLossInput
  ].forEach(x=>{
    x?.addEventListener("change",()=>{
      S.stopLoss=Math.max(0,num(x.value,20));
      saveSettings();
    });
  });

  E.martingaleInput?.addEventListener("change",()=>{
    S.martingale=Math.max(1,num(E.martingaleInput.value,1));
    saveSettings();
  });

  [
    E.stakeInput,
    E.circularStakeInput,
    E.manualStakeInput
  ].forEach(x=>{
    x?.addEventListener("change",()=>{
      x.value=stake(x.value);
    });
  });
}

let strategyTarget="manual";

function setupModals(){
  E.closeStrategyModal?.addEventListener("click",()=>{
    close(E.strategyModal);
  });

  E.closeBotStrategyModal?.addEventListener("click",()=>{
    close(E.botStrategyModal);
  });

  E.strategyOptions?.querySelectorAll("button").forEach(b=>{
    b.addEventListener("click",()=>{
      const v=b.dataset.strategy;

      if(strategyTarget==="manual"){
        S.strategy=v;

        if(E.manualSelectedStrategyLabel){
          E.manualSelectedStrategyLabel.textContent=v;
        }
      }else{
        S.circularStrategy=v;

        if(E.circularStrategyLabel){
          E.circularStrategyLabel.textContent=v;
        }
      }

      updateTarget();
      close(E.strategyModal);
    });
  });

  E.applyBotStrategies?.addEventListener("click",()=>{
    const a=[
      ...document.querySelectorAll(".bot-strategy-check:checked")
    ]
    .map(x=>x.value)
    .filter(x=>STRATEGIES.includes(x));

    S.botStrategies=a.length?a:["MATCHES","DIFFERS"];

    if(E.botStrategyLabel){
      E.botStrategyLabel.textContent=
        S.botStrategies.length===6
        ?"ALL STRATEGIES"
        :S.botStrategies.join(" + ");
    }

    saveSettings();
    close(E.botStrategyModal);
  });
}

function openStrategy(t){
  strategyTarget=t;
  E.strategyModal?.classList.add("show");
}

function openBotModal(){
  document.querySelectorAll(".bot-strategy-check").forEach(x=>{
    x.checked=S.botStrategies.includes(x.value);
  });

  E.botStrategyModal?.classList.add("show");
}

function close(x){
  x?.classList.remove("show");
}

function populateMarkets(){
  [
    E.analysisMarketSelect,
    E.botMarketSelect,
    E.circularMarketSelect,
    E.manualMarketSelect
  ].forEach(s=>{
    if(!s)return;

    s.innerHTML="";

    CONFIG.MARKETS.forEach(m=>{
      const o=document.createElement("option");
      o.value=m;
      o.textContent=m;
      o.selected=m===S.currentMarket;
      s.appendChild(o);
    });
  });
}

function selectMarket(m){
  if(!CONFIG.MARKETS.includes(m))return;

  S.currentMarket=m;
  S.ticks=(S.markets[m]?.ticks||[]).slice(-CONFIG.MAX_TICKS);

  syncCurrent();
  analyze();
  drawChart();
}

function connectPublic(){
  try{
    S.publicWs?.close();
  }catch(_){}

  setConn(false,"CONNECTING");

  S.publicWs=new WebSocket(CONFIG.PUBLIC_WS);

  S.publicWs.onopen=()=>{
    S.publicLive=true;
    setConn(true,"LIVE");
    setStatus("LIVE MARKET DATA CONNECTED");

    CONFIG.MARKETS.forEach((m,i)=>{
      sendPublic({
        ticks_history:m,
        count:CONFIG.MAX_TICKS,
        end:"latest",
        style:"ticks",
        req_id:100+i
      });

      sendPublic({
        ticks:m,
        subscribe:1,
        req_id:200+i
      });
    });
  };

  S.publicWs.onmessage=e=>{
    let m;

    try{
      m=JSON.parse(e.data);
    }catch(_){
      return;
    }

    publicMessage(m);
  };

  S.publicWs.onerror=()=>{
    S.publicLive=false;
    setConn(false,"ERROR");
  };

  S.publicWs.onclose=()=>{
    S.publicLive=false;
    setConn(false,"OFFLINE");

    clearTimeout(S.reconnect);

    S.reconnect=setTimeout(connectPublic,4000);
  };
}

function sendPublic(x){
  if(S.publicWs?.readyState===1){
    S.publicWs.send(JSON.stringify(x));
  }
}

function publicMessage(m){
  if(m.msg_type==="history"&&m.history){
    let sym=m.echo_req?.ticks_history||m.echo_req?.symbol;

    if(!sym){
      sym=CONFIG.MARKETS.find(x=>
        JSON.stringify(m.echo_req||{}).includes(x)
      );
    }

    if(sym){
      (m.history.prices||[]).forEach((p,i)=>{
        addTick(sym,p,m.history.times?.[i]);
      });

      syncCurrent();
      analyze();
      scanner();
      drawChart();
    }

  }else if(m.msg_type==="tick"&&m.tick){
    addTick(
      m.tick.symbol,
      m.tick.quote,
      m.tick.epoch
    );

    if(m.tick.symbol===S.currentMarket){
      syncCurrent();
      analyze();
      drawChart();
    }

    scanner();
  }
}

function addTick(sym,p,t){
  if(!CONFIG.MARKETS.includes(sym))return;

  p=Number(p);

  if(!Number.isFinite(p))return;

  const b=S.markets[sym]||(S.markets[sym]={
    ticks:[],
    key:""
  });

  const key=`${t}|${p}`;

  if(b.key===key)return;

  b.key=key;
  b.ticks.push({
    price:p,
    epoch:t||Date.now()/1000
  });

  if(b.ticks.length>CONFIG.MAX_TICKS){
    b.ticks=b.ticks.slice(-CONFIG.MAX_TICKS);
  }
}

function syncCurrent(){
  const a=S.markets[S.currentMarket]?.ticks||[];

  S.ticks=a.slice(-CONFIG.MAX_TICKS);

  const last=S.ticks.at(-1);

  if(last){
    S.lastPrice=last.price;
    S.lastDigit=lastDigit(last.price);
  }

  if(E.currentChartMarket){
    E.currentChartMarket.textContent=S.currentMarket;
  }

  if(E.currentLivePrice){
    E.currentLivePrice.textContent=formatPrice(S.lastPrice);
  }

  if(E.digitSampleCount){
    E.digitSampleCount.textContent=S.ticks.length;
  }

  if(E.lastDigit){
    E.lastDigit.textContent=
      S.lastDigit==null?"-":S.lastDigit;
  }
}

function digitCounts(arr){
  const c=Array(10).fill(0);

  arr.forEach(t=>{
    const d=lastDigit(t.price);
    if(d>=0&&d<=9)c[d]++;
  });

  return c;
}

function analyze(){
  const a=S.ticks.slice(-CONFIG.MAX_TICKS);

  if(a.length<CONFIG.MIN_TICKS){
    S.analysis=null;

    if(E.analysisMsg){
      E.analysisMsg.textContent=
        "Waiting for enough live ticks...";
    }

    return;
  }

  const digits=digitCounts(a);
  const total=digits.reduce((x,y)=>x+y,0);

  const recent=a.slice(-40);
  const recentDigits=digitCounts(recent);
  const recentTotal=recentDigits.reduce((x,y)=>x+y,0);

  const scores=[];

  for(let d=0;d<10;d++){
    const freq=total?digits[d]/total:0;
    const rf=recentTotal?recentDigits[d]/recentTotal:0;

    scores.push({
      digit:d,
      freq,
      recent:rf,
      score:Math.abs(0.1-freq)+Math.abs(0.1-rf)
    });
  }

  const rare=[...scores].sort((a,b)=>b.score-a.score)[0];
  const common=[...scores].sort((a,b)=>b.freq-a.freq)[0];

  const candidates=[
    {
      strategy:"MATCHES",
      digit:common.digit,
      confidence:clamp(
        50+(common.freq-0.1)*300+
        Math.abs(common.recent-0.1)*100,
        1,99
      ),
      prediction:String(common.digit)
    },
    {
      strategy:"DIFFERS",
      digit:common.digit,
      confidence:clamp(
        65-(common.freq-0.1)*250,
        1,99
      ),
      prediction:`≠${common.digit}`
    },
    {
      strategy:"OVER",
      digit:5,
      confidence:clamp(
        50+
        (digits.slice(6).reduce((x,y)=>x+y,0)/total-0.4)*100,
        1,99
      ),
      prediction:"OVER 5"
    },
    {
      strategy:"UNDER",
      digit:4,
      confidence:clamp(
        50+
        (digits.slice(0,5).reduce((x,y)=>x+y,0)/total-0.5)*100,
        1,99
      ),
      prediction:"UNDER 5"
    },
    {
      strategy:"EVEN",
      digit:0,
      confidence:clamp(
        50+
        (digits.filter((_,i)=>i%2===0)
          .reduce((x,y)=>x+y,0)/total-0.5)*100,
        1,99
      ),
      prediction:"EVEN"
    },
    {
      strategy:"ODD",
      digit:1,
      confidence:clamp(
        50+
        (digits.filter((_,i)=>i%2===1)
          .reduce((x,y)=>x+y,0)/total-0.5)*100,
        1,99
      ),
      prediction:"ODD"
    }
  ];

  const best=[...candidates].sort(
    (a,b)=>b.confidence-a.confidence
  )[0];

  S.analysis={
    counts:digits,
    candidates,
    best,
    rare,
    common
  };

  renderAnalysis();
}

function renderAnalysis(){
  if(!S.analysis)return;

  const b=S.analysis.best;

  if(E.analysisConfidence){
    E.analysisConfidence.textContent=
      `${Math.round(b.confidence)}%`;
  }

  if(E.aiPrediction){
    E.aiPrediction.textContent=shortPred(b);
  }

  if(E.aiPredictionLarge){
    E.aiPredictionLarge.textContent=shortPred(b);
  }

  if(E.predictionConfidence){
    E.predictionConfidence.textContent=
      `${Math.round(b.confidence)}%`;
  }

  if(E.aiType){
    E.aiType.textContent=b.strategy;
  }

  if(E.aiMarket){
    E.aiMarket.textContent=S.currentMarket;
  }

  if(E.aiStatus){
    E.aiStatus.textContent=
      b.confidence>=70?"STRONG":
      b.confidence>=55?"GOOD":"WAIT";
  }

  if(E.aiCirclePrediction){
    E.aiCirclePrediction.textContent=shortPred(b);
  }

  if(E.aiCircleLabel){
    E.aiCircleLabel.textContent=b.strategy;
  }

  if(E.botScore){
    E.botScore.textContent=Math.round(b.confidence);
  }

  if(E.analysisMsg){
    E.analysisMsg.textContent=
      `${b.strategy} probability model · ${Math.round(b.confidence)}% confidence`;
  }

  if(E.digitStatsGrid){
    E.digitStatsGrid.innerHTML=S.analysis.counts.map((n,d)=>{
      const pct=S.ticks.length?n/S.ticks.length*100:0;

      return `
        <div class="digit-stat">
          <strong>${d}</strong>
          <span>${n}</span>
          <small>${pct.toFixed(1)}%</small>
        </div>
      `;
    }).join("");
  }
}

function scanner(){
  const list=[];

  CONFIG.MARKETS.forEach(m=>{
    const a=(S.markets[m]?.ticks||[]).slice(-CONFIG.SCAN_TICKS);

    if(a.length<10)return;

    const c=digitCounts(a);
    const total=c.reduce((x,y)=>x+y,0);

    const max=Math.max(...c);
    const min=Math.min(...c);

    const imbalance=total?
      (max-min)/total:
      0;

    const score=clamp(
      50+imbalance*160+
      Math.min(a.length/80,1)*15,
      1,99
    );

    list.push({
      market:m,
      score
    });
  });

  S.scanner=list.sort((a,b)=>b.score-a.score);

  if(S.scanner[0]){
    S.strongest=S.scanner[0].market;
  }
}

function startOAuth(){
  const verifier=random(64);

  sessionStorage.setItem(
    "krishwave_pkce_verifier",
    verifier
  );

  challenge(verifier).then(ch=>{
    const url=
      "https://oauth.deriv.com/oauth2/authorize"+
      `?app_id=${encodeURIComponent(CONFIG.CLIENT_ID)}`+
      `&response_type=code`+
      `&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}`+
      `&code_challenge=${encodeURIComponent(ch)}`+
      `&code_challenge_method=S256`;

    location.href=url;
  }).catch(()=>{
    toast("Unable to start DEMO login");
  });
}

async function handleOAuth(){
  const p=new URLSearchParams(location.search);
  const code=p.get("code");

  if(!code)return;

  const verifier=sessionStorage.getItem(
    "krishwave_pkce_verifier"
  );

  if(!verifier){
    toast("Login session expired");
    return;
  }

  try{
    const r=await fetch(
      `${CONFIG.CLOUD_API}/api/oauth/exchange`,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          code,
          code_verifier:verifier,
          redirect_uri:CONFIG.REDIRECT_URI,
          client_id:CONFIG.CLIENT_ID
        })
      }
    );

    const data=await r.json();

    if(!r.ok){
      throw new Error(data.error||"OAuth exchange failed");
    }

    S.sessionToken=
      data.session||
      data.token||
      data.access_token||
      "";

    if(!S.sessionToken){
      throw new Error("No session returned");
    }

    sessionStorage.setItem(
      "krishwave_cloud_session",
      S.sessionToken
    );

    history.replaceState(
      {},
      document.title,
      CONFIG.REDIRECT_URI
    );

    await restoreSession();

  }catch(err){
    console.error(err);
    toast(err.message||"DEMO login failed");
  }
}

async function restoreSession(){
  try{
    const r=await fetch(
      `${CONFIG.CLOUD_API}/api/session`,
      {
        headers:{
          Authorization:`Bearer ${S.sessionToken}`
        }
      }
    );

    const data=await r.json();

    if(!r.ok){
      throw new Error(data.error||"Session failed");
    }

    const account=
      data.account||
      data.data?.account||
      data;

    S.accountId=
      account.accountId||
      account.account_id||
      account.id||
      "";

    S.currency=
      account.currency||
      "USD";

    if(S.accountId){
      await connectDemo();
    }

  }catch(err){
    console.error(err);
    toast("DEMO session could not be restored");
  }
}

async function connectDemo(){
  if(!S.sessionToken){
    startOAuth();
    return;
  }

  try{
    setStatus("CONNECTING DEMO ACCOUNT...");

    let r=await fetch(
      `${CONFIG.CLOUD_API}/api/session`,
      {
        headers:{
          Authorization:`Bearer ${S.sessionToken}`
        }
      }
    );

    let data=await r.json();

    if(!r.ok){
      throw new Error(data.error||"Session request failed");
    }

    const account=
      data.account||
      data.data?.account||
      data;

    S.accountId=
      account.accountId||
      account.account_id||
      account.id||
      S.accountId;

    S.currency=
      account.currency||
      S.currency||
      "USD";

    if(!S.accountId){
      throw new Error("No DEMO account found");
    }

    const otpResponse=await fetch(
      `${CONFIG.CLOUD_API}/api/otp?accountId=${encodeURIComponent(S.accountId)}`,
      {
        headers:{
          Authorization:`Bearer ${S.sessionToken}`
        }
      }
    );

    const otpData=await otpResponse.json();

    if(!otpResponse.ok){
      throw new Error(
        otpData.error||"Could not obtain DEMO WebSocket"
      );
    }

    const wsUrl=
      otpData.url||
      otpData.wsUrl||
      otpData.data?.url;

    if(!wsUrl){
      throw new Error("DEMO WebSocket URL missing");
    }

    openAuthWs(wsUrl);

  }catch(err){
    console.error(err);
    S.demoLive=false;
    updateAll();
    toast(err.message||"DEMO connection failed");
  }
}

function openAuthWs(url){
  try{
    S.authWs?.close();
  }catch(_){}

  S.authWs=new WebSocket(url);

  S.authWs.onopen=()=>{
    S.demoLive=true;
    setStatus("DERIV DEMO CONNECTED");
    updateAll();

    sendAuth({
      balance:1,
      subscribe:1,
      req_id:req()
    });
  };

  S.authWs.onmessage=e=>{
    let m;

    try{
      m=JSON.parse(e.data);
    }catch(_){
      return;
    }

    authMessage(m);
  };

  S.authWs.onerror=()=>{
    S.demoLive=false;
    updateAll();
  };

  S.authWs.onclose=()=>{
    S.demoLive=false;
    updateAll();

    clearTimeout(S.authReconnect);

    if(S.sessionToken){
      S.authReconnect=setTimeout(()=>{
        connectDemo();
      },5000);
    }
  };
}

function sendAuth(x){
  if(S.authWs?.readyState===1){
    S.authWs.send(JSON.stringify(x));
  }
}

function authMessage(m){
  if(m.msg_type==="balance"&&m.balance){
    S.balance=Number(m.balance.balance||0);
    S.currency=m.balance.currency||S.currency;
    updateAccount();
    return;
  }

  if(m.msg_type==="proposal"){
    handleProposal(m);
    return;
  }

  if(m.msg_type==="buy"){
    handleBuy(m);
    return;
  }

  if(m.msg_type==="proposal_open_contract"){
    handleContract(m);
    return;
  }

  if(m.error){
    console.error("DERIV ERROR",m.error);

    const id=m.echo_req?.req_id;

    if(id&&S.pending[id]){
      const p=S.pending[id];
      delete S.pending[id];

      if(p.onError)p.onError(m.error);
    }

    toast(m.error.message||"Deriv request failed");
  }
}

function executeTrade(source,market,strategy,amount,target){
  if(!S.demoLive){
    toast("Connect DEMO first");
    return;
  }

  if(S.tradingStopped){
    toast("Trading is stopped");
    return;
  }

  if(S.active.size>=CONFIG.MAX_ACTIVE){
    toast("Maximum active trades reached");
    return;
  }

  market=market||S.currentMarket;
  amount=stake(amount);

  const contractType={
    MATCHES:"DIGITMATCH",
    DIFFERS:"DIGITDIFF",
    OVER:"DIGITOVER",
    UNDER:"DIGITUNDER",
    EVEN:"DIGITEVEN",
    ODD:"DIGITODD"
  }[strategy];

  if(!contractType){
    toast("Invalid strategy");
    return;
  }

  const proposalReq=req();

  const request={
    proposal:1,
    amount,
    basis:"stake",
    contract_type:contractType,
    currency:S.currency||"USD",
    duration:1,
    duration_unit:"t",
    underlying_symbol:market,
    subscribe:1,
    req_id:proposalReq
  };

  if(
    strategy==="MATCHES"||
    strategy==="DIFFERS"
  ){
    request.barrier=String(clamp(Number(target??5),0,9));
  }else if(
    strategy==="OVER"
  ){
    request.barrier="5";
  }else if(
    strategy==="UNDER"
  ){
    request.barrier="5";
  }

  S.pending[proposalReq]={
    source,
    market,
    strategy,
    amount,
    target,
    onError:()=>{
      toast("DEMO proposal failed");
    }
  };

  sendAuth(request);
}

function handleProposal(m){
  const id=m.echo_req?.req_id;

  const p=S.pending[id];

  if(!p)return;

  const proposalId=
    m.proposal?.id||
    m.proposal?.proposal_id;

  const askPrice=
    Number(
      m.proposal?.ask_price||
      m.proposal?.display_value||
      p.amount
    );

  if(!proposalId){
    delete S.pending[id];
    toast("No proposal ID returned");
    return;
  }

  const buyReq=req();

  S.pending[buyReq]={
    ...p,
    proposalId
  };

  delete S.pending[id];

  sendAuth({
    buy:proposalId,
    price:askPrice,
    req_id:buyReq
  });
}

function handleBuy(m){
  const id=m.echo_req?.req_id;
  const p=S.pending[id];

  if(!p)return;

  const contractId=
    m.buy?.contract_id||
    m.buy?.id;

  if(!contractId){
    delete S.pending[id];
    toast("DEMO contract ID missing");
    return;
  }

  const trade={
    contractId,
    source:p.source,
    market:p.market,
    strategy:p.strategy,
    target:p.target,
    stake:p.amount,
    profit:0,
    payout:0,
    status:"OPEN",
    opened:Date.now()
  };

  S.active.set(String(contractId),trade);
  delete S.pending[id];

  sendAuth({
    proposal_open_contract:1,
    contract_id:contractId,
    subscribe:1,
    req_id:req()
  });

  renderActive();
  updateAll();
}

function handleContract(m){
  const c=m.proposal_open_contract;

  if(!c)return;

  const id=String(c.contract_id);
  const t=S.active.get(id);

  if(!t)return;

  t.profit=Number(
    c.profit||
    0
  );

  t.payout=Number(
    c.payout||
    0
  );

  if(c.is_sold||c.status==="sold"){
    finishTrade(t,c);
  }else{
    t.status="OPEN";
    renderActive();
  }
}

function finishTrade(t,c){
  const profit=Number(c.profit||0);

  t.profit=profit;
  t.payout=Number(c.payout||0);
  t.closed=Date.now();

  if(profit>=0){
    t.status="WIN";
    S.wins++;
    S.won+=t.payout;
    S.nextStake=stake(E.stakeInput?.value||t.stake);
  }else{
    t.status="LOSS";
    S.losses++;

    S.nextStake=stake(
      t.stake*Math.max(1,S.martingale)
    );
  }

  S.sessionProfit+=profit;

  S.history.unshift({
    ...t
  });

  S.history=S.history.slice(0,300);

  S.active.delete(String(t.contractId));

  recalc();
  saveHistory();
  renderActive();
  renderHistory();
  updateAll();
  risk();
}

function startBot(){
  if(!S.demoLive){
    toast("Connect DEMO first");
    return;
  }

  if(S.bot)return;

  S.bot=true;

  if(E.startBotBtn){
    E.startBotBtn.textContent="STOP AI BOT";
  }

  if(E.botStatusDash){
    E.botStatusDash.textContent="RUNNING";
  }

  runBot();

  S.botTimer=setInterval(
    runBot,
    CONFIG.BOT_MS
  );
}

function stopBot(){
  S.bot=false;

  clearInterval(S.botTimer);
  S.botTimer=null;

  if(E.startBotBtn){
    E.startBotBtn.textContent="START AI BOT";
  }

  if(E.botStatusDash){
    E.botStatusDash.textContent="STOPPED";
  }
}

function runBot(){
  if(
    !S.bot||
    !S.analysis||
    S.active.size>=CONFIG.MAX_ACTIVE||
    S.tradingStopped
  )return;

  const cs=S.analysis.candidates
    .filter(x=>S.botStrategies.includes(x.strategy))
    .sort((a,b)=>b.confidence-a.confidence);

  const b=cs[0];

  if(!b||b.confidence<60)return;

  const market=
    E.botMarketSelect?.value||
    S.strongest||
    S.currentMarket;

  const target=b.digit??5;

  const amount=
    S.nextStake||
    stake(E.stakeInput?.value||1);

  if(E.botSelectedMarket){
    E.botSelectedMarket.textContent=market;
  }

  if(E.botScore){
    E.botScore.textContent=Math.round(b.confidence);
  }

  if(E.aiPredictionLarge){
    E.aiPredictionLarge.textContent=b.prediction;
  }

  executeTrade(
    "AI BOT",
    market,
    b.strategy,
    amount,
    target
  );
}

function startCircularAI(){
  if(S.circular)return;

  if(!S.demoLive){
    toast("Connect DEMO first");
    return;
  }

  S.circular=true;
  S.phase="ANALYZING";
  S.remaining=10;

  clearInterval(S.circularTimer);

  S.circularTimer=setInterval(
    circularTick,
    1000
  );

  circularUI();
}

function stopCircularAI(){
  S.circular=false;

  clearInterval(S.circularTimer);
  S.circularTimer=null;

  S.phase="IDLE";
  S.remaining=0;

  circularUI();
}

function circularTick(){
  if(!S.circular)return;

  if(S.remaining>0){
    S.remaining--;
    circularUI();
    return;
  }

  if(S.phase==="ANALYZING"){
    analyze();
    S.phase="PREDICTING";
    S.remaining=5;

  }else if(S.phase==="PREDICTING"){
    S.phase="TRADE";
    S.remaining=3;

  }else if(S.phase==="TRADE"){
    circularTrade();
    S.phase="COOLDOWN";
    S.remaining=3;

  }else{
    S.phase="ANALYZING";
    S.remaining=10;
  }

  circularUI();
}

function circularTrade(){
  if(!S.analysis)return;

  const label=
    E.circularStrategyLabel?.textContent||
    "AUTO";

  const b=
    label!=="AUTO"
    ?S.analysis.candidates.find(
      x=>x.strategy===label
    )
    :S.analysis.best;

  if(!b||b.confidence<55)return;

  executeTrade(
    "CIRCULAR AI",
    E.circularMarketSelect?.value||
      S.currentMarket,
    b.strategy,
    S.nextCircular||
      stake(E.circularStakeInput?.value||1),
    b.digit??5
  );
}

function circularUI(){
  if(E.aiCircleStatus){
    E.aiCircleStatus.textContent=S.phase;
  }

  if(E.circularStatusText){
    E.circularStatusText.textContent=S.phase;
  }

  if(E.aiCircleTimer){
    E.aiCircleTimer.textContent=
      S.circular?`${S.remaining}s`:"--";
  }

  if(E.cycleAnalysis){
    E.cycleAnalysis.textContent=
      S.phase==="ANALYZING"
      ?"ANALYZING"
      :"READY";
  }

  if(E.cycleTrade){
    E.cycleTrade.textContent=
      S.phase==="TRADE"
      ?"TRADE NOW"
      :"WAITING";
  }

  if(E.cycleCooldown){
    E.cycleCooldown.textContent=
      S.phase==="COOLDOWN"
      ?S.remaining
      :0;
  }

  if(E.startAI){
    E.startAI.textContent=
      S.circular
      ?"CIRCULAR AI RUNNING"
      :"START CIRCULAR AI";
  }

  if(E.startCircularTradeBtn){
    E.startCircularTradeBtn.textContent=
      S.circular
      ?"STOP CIRCULAR TRADING"
      :"START CIRCULAR TRADING";
  }
}

function manualTrade(){
  executeTrade(
    "MANUAL",
    E.manualMarketSelect?.value||
      S.currentMarket,
    S.strategy,
    stake(E.manualStakeInput?.value||1),
    clamp(
      Number(E.manualTargetDigitInput?.value||5),
      0,
      9
    )
  );
}

function updateTarget(){
  if(E.targetDigitContainer){
    E.targetDigitContainer.style.display=
      (
        S.strategy==="MATCHES"||
        S.strategy==="DIFFERS"
      )?"":"none";
  }
}

function risk(){
  if(
    S.takeProfit>0&&
    S.sessionProfit>=S.takeProfit
  ){
    stopBot();
    stopCircularAI();
    toast("TAKE PROFIT reached");
  }

  if(
    S.stopLoss>0&&
    S.sessionProfit<=-Math.abs(S.stopLoss)
  ){
    stopBot();
    stopCircularAI();
    toast("STOP LOSS reached");
  }
}

function loadHistory(){
  try{
    S.history=JSON.parse(
      localStorage.getItem(CONFIG.HISTORY_KEY)||"[]"
    );

    if(!Array.isArray(S.history)){
      S.history=[];
    }
  }catch(_){
    S.history=[];
  }

  recalc();
}

function saveHistory(){
  localStorage.setItem(
    CONFIG.HISTORY_KEY,
    JSON.stringify(S.history.slice(0,300))
  );
}

function recalc(){
  S.wins=S.history.filter(
    x=>x.status==="WIN"
  ).length;

  S.losses=S.history.filter(
    x=>x.status==="LOSS"
  ).length;

  S.stakeTotal=S.history.reduce(
    (a,x)=>a+Number(x.stake||0),
    0
  );

  S.profit=S.history.reduce(
    (a,x)=>a+Number(x.profit||0),
    0
  );

  S.won=S.history
    .filter(x=>x.status==="WIN")
    .reduce(
      (a,x)=>a+Number(x.payout||0),
      0
    );
}

function loadSettings(){
  try{
    const x=JSON.parse(
      localStorage.getItem(CONFIG.SETTINGS_KEY)||"{}"
    );

    if(Array.isArray(x.botStrategies)){
      S.botStrategies=x.botStrategies;
    }

    if(x.martingale){
      S.martingale=Math.max(
        1,
        Number(x.martingale)
      );
    }

    if(x.takeProfit!=null){
      S.takeProfit=Number(x.takeProfit);
    }

    if(x.stopLoss!=null){
      S.stopLoss=Number(x.stopLoss);
    }
  }catch(_){}

  if(E.takeProfitInput){
    E.takeProfitInput.value=S.takeProfit;
  }

  if(E.stopLossInput){
    E.stopLossInput.value=S.stopLoss;
  }

  if(E.martingaleInput){
    E.martingaleInput.value=S.martingale;
  }
}

function saveSettings(){
  localStorage.setItem(
    CONFIG.SETTINGS_KEY,
    JSON.stringify({
      botStrategies:S.botStrategies,
      martingale:S.martingale,
      takeProfit:S.takeProfit,
      stopLoss:S.stopLoss
    })
  );
}

function renderActive(){
  if(E.activeTradeCount){
    E.activeTradeCount.textContent=S.active.size;
  }

  if(E.activeTradesList){
    E.activeTradesList.innerHTML=
      S.active.size
      ?[...S.active.values()].map(t=>`
        <div class="active-trade">
          <div>
            <strong>
              ${esc(t.market)} · ${esc(t.strategy)}
            </strong>
            <small>
              ${esc(t.source)} · ${money(t.stake)}
            </small>
          </div>
          <div>
            <strong>
              ${t.profit>=0?"+":""}${money(t.profit)}
            </strong>
            <small>${esc(t.status)}</small>
          </div>
        </div>
      `).join("")
      :"<div style='padding:12px;color:var(--muted);font-size:10px'>No active demo contracts.</div>";
  }
}

function renderHistory(){
  if(E.historyCardsList){
    E.historyCardsList.innerHTML=
      S.history.length
      ?S.history.slice(0,100).map(t=>`
        <div class="history-card ${
          t.status==="WIN"
          ?"history-win"
          :"history-loss"
        }">
          <div class="history-top">
            <strong>
              ${esc(t.market)} · ${esc(t.strategy)}
            </strong>

            <strong class="result">
              ${t.status}
              ${t.profit>=0?"+":""}${money(t.profit)}
            </strong>
          </div>

          <div class="history-details">
            <div>
              <span>STAKE</span>
              <strong>${money(t.stake)}</strong>
            </div>

            <div>
              <span>SOURCE</span>
              <strong>${esc(t.source)}</strong>
            </div>

            <div>
              <span>CONTRACT</span>
              <strong>${esc(t.contractId)}</strong>
            </div>

            <div>
              <span>TIME</span>
              <strong>
                ${new Date(
                  t.closed||Date.now()
                ).toLocaleTimeString()}
              </strong>
            </div>
          </div>
        </div>
      `).join("")
      :"<div style='padding:12px;color:var(--muted);font-size:10px'>No completed demo trades yet.</div>";
  }

  if(E.historyTotalStake){
    E.historyTotalStake.textContent=
      money(S.stakeTotal);
  }

  if(E.historyAmountWon){
    E.historyAmountWon.textContent=
      money(S.won);
  }

  if(E.historyNetProfit){
    E.historyNetProfit.textContent=
      money(S.profit);
  }

  if(E.sessionProfitDisplay){
    E.sessionProfitDisplay.textContent=
      money(S.sessionProfit);
  }

  if(E.totalProfitDisplay){
    E.totalProfitDisplay.textContent=
      money(S.profit);
  }
}

function updateAll(){
  updateConnection();
  updateAccount();

  const n=S.wins+S.losses;

  if(E.paperTotal){
    E.paperTotal.textContent=n;
  }

  if(E.paperWins){
    E.paperWins.textContent=S.wins;
  }

  if(E.paperLosses){
    E.paperLosses.textContent=S.losses;
  }

  if(E.paperAccuracy){
    E.paperAccuracy.textContent=
      `${n?(S.wins/n*100).toFixed(1):"0.0"}%`;
  }

  if(E.engineStatusText){
    E.engineStatusText.textContent=
      S.demoLive
      ?"DERIV DEMO"
      :"DEMO NOT CONNECTED";
  }

  if(E.manualStatusText){
    E.manualStatusText.textContent=
      S.demoLive
      ?"DEMO READY"
      :"CONNECT DEMO";
  }

  if(E.botStrategyLabel){
    E.botStrategyLabel.textContent=
      S.botStrategies.length===6
      ?"ALL STRATEGIES"
      :S.botStrategies.join(" + ");
  }

  renderActive();
  renderHistory();
  updateTarget();
  circularUI();
}

function updateConnection(){
  if(E.connectionDot){
    E.connectionDot.className=
      `dot ${
        S.publicLive||S.demoLive
        ?"online"
        :"offline"
      }`;
  }

  if(E.connectionText){
    E.connectionText.textContent=
      S.demoLive
      ?"DEMO LIVE"
      :S.publicLive
      ?"LIVE"
      :"OFFLINE";
  }

  if(E.modeBadge){
    E.modeBadge.textContent="DEMO";
    E.modeBadge.className=
      "mode-badge demo-mode";
  }
}

function updateAccount(){
  if(E.accountId){
    E.accountId.textContent=
      S.accountId||"Not connected";
  }

  if(E.balanceDisplay){
    E.balanceDisplay.textContent=
      money(S.balance);
  }

  if(E.currency){
    E.currency.textContent=S.currency;
  }
}

function setConn(on,t){
  if(E.connectionDot){
    E.connectionDot.className=
      `dot ${on?"online":"offline"}`;
  }

  if(E.connectionText){
    E.connectionText.textContent=t;
  }
}

function setStatus(t){
  if(E.dataStatus){
    E.dataStatus.textContent=t;
  }
}

let toastTimer;

function toast(t){
  if(!E.toast)return;

  E.toastMessage.textContent=t;
  E.toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer=setTimeout(()=>{
    E.toast.classList.remove("show");
  },2800);
}

function drawChart(){
  const c=E.priceChartCanvas;

  if(!c)return;

  const r=c.getBoundingClientRect();
  const w=Math.max(280,r.width||500);
  const h=180;
  const d=devicePixelRatio||1;

  c.width=w*d;
  c.height=h*d;

  const x=c.getContext("2d");

  x.setTransform(d,0,0,d,0,0);
  x.clearRect(0,0,w,h);

  const a=S.ticks.slice(-80);

  if(a.length<2)return;

  const v=a.map(z=>z.price);
  const mn=Math.min(...v);
  const mx=Math.max(...v);
  const range=mx-mn||1;

  x.strokeStyle=
    getComputedStyle(document.body)
      .getPropertyValue("--accent")||
    "#00e5ff";

  x.lineWidth=2;
  x.beginPath();

  v.forEach((p,i)=>{
    const xx=
      6+i*(w-12)/(v.length-1);

    const yy=
      h-8-(p-mn)/range*(h-16);

    i?x.lineTo(xx,yy):x.moveTo(xx,yy);
  });

  x.stroke();
}

function lastDigit(v){
  const s=String(v).replace(/[^0-9]/g,"");
  return s?Number(s.at(-1)):0;
}

function formatPrice(v){
  v=Number(v);

  if(!Number.isFinite(v)){
    return "0.00000";
  }

  if(v>=1000)return v.toFixed(2);
  if(v>=100)return v.toFixed(3);
  if(v>=10)return v.toFixed(4);

  return v.toFixed(5);
}

function money(v){
  v=Number(v);

  return `${
    v<0?"-":""
  }$${
    Math.abs(
      Number.isFinite(v)?v:0
    ).toFixed(2)
  }`;
}

function avg(a){
  return a.length
    ?a.reduce((x,y)=>x+y,0)/a.length
    :0;
}

function clamp(v,a,b){
  return Math.min(
    b,
    Math.max(a,v)
  );
}

function num(v,f){
  v=Number(v);
  return Number.isFinite(v)?v:f;
}

function stake(v){
  return clamp(
    Math.round(
      num(v,CONFIG.MIN_STAKE)*100
    )/100,
    CONFIG.MIN_STAKE,
    1000
  );
}

function req(){
  return ++S.req;
}

function shortPred(b){
  return b.strategy==="MATCHES"
    ?String(b.digit)
    :b.strategy==="DIFFERS"
    ?`≠${b.digit}`
    :b.prediction;
}

function random(n){
  const chars=
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const a=new Uint8Array(n);

  crypto.getRandomValues(a);

  return [...a]
    .map(x=>chars[x%chars.length])
    .join("");
}

async function challenge(v){
  const h=await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(v)
  );

  const s=btoa(
    String.fromCharCode(
      ...new Uint8Array(h)
    )
  );

  return s
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/,"");
}

function esc(v){
  return String(v??"").replace(
    /[&<>"']/g,
    m=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;",
      "'":"&#039;"
    }[m])
  );
}

window.addEventListener(
  "resize",
  drawChart
);

document.addEventListener(
  "DOMContentLoaded",
  init
);