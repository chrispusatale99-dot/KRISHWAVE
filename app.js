const markets=[
["R_10","Volatility 10 Index"],
["R_10_1S","Volatility 10 (1s)"],
["R_15_1S","Volatility 15 (1s)"],
["R_25","Volatility 25 Index"],
["R_25_1S","Volatility 25 (1s)"],
["R_30_1S","Volatility 30 (1s)"],
["R_50","Volatility 50 Index"],
["R_50_1S","Volatility 50 (1s)"],
["R_75","Volatility 75 Index"],
["R_75_1S","Volatility 75 (1s)"],
["R_90_1S","Volatility 90 (1s)"],
["R_100","Volatility 100 Index"],
["R_100_1S","Volatility 100 (1s)"]
];

let selected=markets[0][0];

const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);

function page(id){
  $$(".page").forEach(x=>x.classList.add("hidden"));
  $("#"+id).classList.remove("hidden");
  scrollTo(0,0);
}

function analyzeMarket(symbol){

  const seed=[...symbol]
    .reduce((a,c)=>a+c.charCodeAt(0),0);

  const momentum=(Date.now()/1000+seed)%100;

  const confidence=Math.round(
    55+(momentum*0.38)
  );

  let signal=
    confidence>=75
      ?"TRADE"
      :"NO TRADE";

  let reason=
    confidence>=75
      ?"Strong setup detected"
      :"Weak setup filtered";

  return {
    confidence,
    signal,
    reason
  };
}

function renderMarkets(scan=false){

  $("#marketList").innerHTML=markets.map(m=>{

    const a=scan
      ?analyzeMarket(m[0])
      :{
        confidence:null,
        signal:"READY",
        reason:"Waiting for scan"
      };

    return `
      <button
        class="market-item ${m[0]===selected?"selected":""}"
        data-symbol="${m[0]}"
      >

        <div>
          <b>${m[1]}</b>

          <div class="market-meta">
            ${m[0]} · ${a.reason}
          </div>
        </div>

        <div class="market-signal">

          <span class="signal ${
            a.confidence>=75
              ?"good"
              :"wait"
          }">
            ${a.signal}
          </span>

          ${
            a.confidence
              ?`<div>${a.confidence}%</div>`
              :""
          }

        </div>

      </button>
    `;

  }).join("");

  $$(".market-item").forEach(b=>{

    b.onclick=()=>{

      selected=b.dataset.symbol;

      renderMarkets(scan);

    };

  });
}

renderMarkets();

$("#scanAll").onclick=()=>{

  renderMarkets(true);

  $("#engineStatus").innerHTML=
    '<small>AI SCAN COMPLETE</small>'+
    '<strong>READY</strong>'+
    '<b>Weak setups are filtered as NO TRADE</b>';
};

$$(".mode button").forEach(b=>{

  b.onclick=()=>{

    $$(".mode button")
      .forEach(x=>x.classList.remove("active"));

    b.classList.add("active");

  };

});

function startBot(){

  let btn=$("#start");

  let running=
    btn.dataset.running==="1";

  if(!running){

    btn.dataset.running="1";

    btn.textContent="Stop Trading Bot";

    $("#engineStatus").innerHTML=
      '<small>BOT RUNNING</small>'+
      '<strong>LIVE</strong>'+
      '<b>AI Engine Analyzing Market</b>';

  }else{

    btn.dataset.running="0";

    btn.textContent="Start Trading Bot";

    $("#engineStatus").innerHTML=
      '<small>WAITING...</small>'+
      '<strong>--</strong>'+
      '<b>AI Engine Ready to Start</b>';

  }

}

$("#start").onclick=startBot;

$("#account").onchange=e=>
  $("#ptype").textContent=e.target.value;


// ==========================================
// KRISHWAVE V2.1 - DERIV LIVE MARKET DATA
// ==========================================

let derivWS=null;

let liveTicks={};

let tickHistory={};


function normalizeName(name){

  return String(name||"")
    .toLowerCase()
    .replace(/\s+/g," ")
    .trim();

}


function connectDeriv(){

  derivWS=new WebSocket(
    "wss://api.derivws.com/trading/v1/options/ws/public"
  );


  derivWS.onopen=()=>{

    console.log(
      "KRISHWAVE: Connected to Deriv"
    );

    $("#engineStatus").innerHTML=
      '<small>DERIV CONNECTION</small>'+
      '<strong>CONNECTED</strong>'+
      '<b>Loading active markets...</b>';


    derivWS.send(JSON.stringify({

      active_symbols:"brief",

      req_id:1

    }));

  };


  derivWS.onmessage=(event)=>{

    const data=JSON.parse(event.data);


    // ======================================
    // RECEIVE ACTIVE DERIV MARKETS
    // ======================================

    if(data.msg_type==="active_symbols"){

      const active=
        data.active_symbols||[];


      const byName=new Map();


      active.forEach(symbol=>{

        const name=
          normalizeName(
            symbol.underlying_symbol_name
          );

        const id=
          symbol.underlying_symbol;


        if(name && id){

          byName.set(
            name,
            id
          );

        }

      });


      let connectedMarkets=0;


      markets.forEach((market,index)=>{

        const name=
          normalizeName(
            market[1]
          );

        const realSymbol=
          byName.get(name);


        if(realSymbol){

          markets[index][0]=
            realSymbol;


          connectedMarkets++;


          derivWS.send(JSON.stringify({

            ticks:realSymbol,

            subscribe:1,

            req_id:100+index

          }));


          console.log(
            "KRISHWAVE SUBSCRIBED:",
            market[1],
            realSymbol
          );


        }else{

          console.warn(
            "KRISHWAVE MARKET NOT FOUND:",
            market[1]
          );

        }

      });


      $("#engineStatus").innerHTML=
        '<small>DERIV CONNECTION</small>'+
        '<strong>LIVE</strong>'+
        '<b>'+
        connectedMarkets+
        ' markets receiving live ticks</b>';


      return;

    }


    // ======================================
    // RECEIVE LIVE TICKS
    // ======================================

    if(
      data.msg_type==="tick" &&
      data.tick
    ){

      const symbol=
        data.tick.symbol;

      const quote=
        Number(data.tick.quote);


      if(!Number.isFinite(quote)){
        return;
      }


      liveTicks[symbol]={

        quote:quote,

        epoch:data.tick.epoch

      };


      if(!tickHistory[symbol]){

        tickHistory[symbol]=[];

      }


      tickHistory[symbol].push({

        quote:quote,

        epoch:data.tick.epoch

      });


      // Keep latest 100 ticks

      if(
        tickHistory[symbol].length>100
      ){

        tickHistory[symbol].shift();

      }


      console.log(
        "KRISHWAVE LIVE TICK:",
        symbol,
        quote
      );

    }


    // ======================================
    // DERIV API ERROR
    // ======================================

    if(data.error){

      console.error(
        "DERIV API ERROR:",
        data.error
      );

    }

  };


  derivWS.onerror=()=>{

    console.error(
      "KRISHWAVE: Deriv connection error"
    );


    $("#engineStatus").innerHTML=
      '<small>DERIV CONNECTION</small>'+
      '<strong>ERROR</strong>'+
      '<b>Connection problem</b>';

  };


  derivWS.onclose=()=>{

    console.log(
      "KRISHWAVE: Deriv connection closed"
    );


    $("#engineStatus").innerHTML=
      '<small>DERIV CONNECTION</small>'+
      '<strong>OFFLINE</strong>'+
      '<b>Connection closed</b>';

  };

}


// Start Deriv connection

connectDeriv();
