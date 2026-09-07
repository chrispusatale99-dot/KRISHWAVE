/* =========================================================
   KRISHWAVE
   LIVE DERIV MARKET INTELLIGENCE ENGINE
   ---------------------------------------------------------
   - Live Deriv public market data
   - 13 Volatility Indices
   - Tick history
   - Last digit analysis
   - Matches
   - Differs
   - Even
   - Odd
   - Over
   - Under
   - Manual number input
   - AI statistical analysis
   - Confidence score
   - Automatic reconnect
   - Connection error handling
   - READ ONLY
   - NO REAL TRADES
========================================================= */

const $ = id => document.getElementById(id);

/* ---------------------------------------------------------
   DERIV PUBLIC WEBSOCKET
   Current public endpoint does not require an API token.
--------------------------------------------------------- */

const WS_PRIMARY =
  "wss://api.derivws.com/trading/v1/options/ws/public";

/*
   Legacy endpoint kept as fallback.
*/
const WS_FALLBACK =
  "wss://ws.binaryws.com/websockets/v3";


/* ---------------------------------------------------------
   MARKETS
--------------------------------------------------------- */

const MARKETS = [
  ["R_10", "Volatility 10"],
  ["R_25", "Volatility 25"],
  ["R_50", "Volatility 50"],
  ["R_75", "Volatility 75"],
  ["R_100", "Volatility 100"],

  ["1HZ10V", "Volatility 10 (1s)"],
  ["1HZ25V", "Volatility 25 (1s)"],
  ["1HZ50V", "Volatility 50 (1s)"],
  ["1HZ75V", "Volatility 75 (1s)"],
  ["1HZ100V", "Volatility 100 (1s)"],

  ["1HZ150V", "Volatility 150 (1s)"],
  ["1HZ250V", "Volatility 250 (1s)"],
  ["1HZ1000V", "Volatility 1000 (1s)"]
];


/* ---------------------------------------------------------
   STRATEGIES
--------------------------------------------------------- */

const STRATEGIES = [
  ["matches", "Matches"],
  ["differs", "Differs"],
  ["even", "Even"],
  ["odd", "Odd"],
  ["over", "Over"],
  ["under", "Under"]
];


/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */

let ws = null;

let sym = "R_10";

let hist = [];

let cnt = Array(10).fill(0);

let totalTicks = 0;

let reconnectTimer = null;

let reconnectAttempts = 0;

let endpointMode = "primary";

let selectedStrategy = "matches";

let prediction = null;

let running = false;

let timer = null;

let phase = "analysis";

let secondsLeft = 10;

let wins = 0;

let losses = 0;

let profitLoss = 0;


/* ---------------------------------------------------------
   LAST DIGIT
--------------------------------------------------------- */

function lastDigit(value) {

    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value);

    const match = text.match(/(\d)$/);

    if (!match) {
        return null;
    }

    return Number(match[1]);
}


/* ---------------------------------------------------------
   CONNECTION STATUS
--------------------------------------------------------- */

function setConnection(status, text) {

    const conn = $("conn");

    if (!conn) return;

    conn.textContent = "● " + text;

    conn.classList.remove(
        "live",
        "connecting",
        "offline"
    );

    if (status === "live") {
        conn.classList.add("live");
    }

    if (status === "connecting") {
        conn.classList.add("connecting");
    }

    if (status === "offline") {
        conn.classList.add("offline");
    }
}


/* ---------------------------------------------------------
   ERROR DISPLAY
--------------------------------------------------------- */

function showError(message) {

    if ($("error")) {
        $("error").textContent = message || "";
    }

    console.error("KRISHWAVE:", message);
}


/* ---------------------------------------------------------
   RESET MARKET DATA
--------------------------------------------------------- */

function resetMarketData() {

    hist = [];

    cnt = Array(10).fill(0);

    totalTicks = 0;

    prediction = null;

    if ($("ticks")) {
        $("ticks").textContent = "0";
    }

    if ($("last")) {
        $("last").textContent = "—";
    }

    if ($("hot")) {
        $("hot").textContent = "—";
    }

    if ($("aiHot")) {
        $("aiHot").textContent = "—";
    }

    if ($("prediction")) {
        $("prediction").textContent = "WAITING";
    }

    if ($("score")) {
        $("score").textContent = "—";
    }

    if ($("confidence")) {
        $("confidence").textContent = "—";
    }

    render();
}


/* ---------------------------------------------------------
   ADD TICK
--------------------------------------------------------- */

function addTick(quote) {

    const digit = lastDigit(quote);

    if (digit === null) {
        return;
    }

    hist.push(digit);

    cnt[digit]++;

    totalTicks++;

    /*
       Keep the analysis window manageable.
    */
    if (hist.length > 300) {

        const removed = hist.shift();

        cnt[removed]--;

    }

    render();

    analyze();

}


/* ---------------------------------------------------------
   RENDER DIGIT DISTRIBUTION
--------------------------------------------------------- */

function render() {

    const total = hist.length;

    let html = "";

    for (let i = 0; i < 10; i++) {

        const percentage =
            total > 0
                ? Math.round((cnt[i] / total) * 100)
                : 0;

        html += `
            <div class="digit">
                <b>${i}</b>
                <span>${percentage}%</span>
                <div class="bar">
                    <i style="width:${percentage}%"></i>
                </div>
            </div>
        `;
    }

    if ($("digits")) {
        $("digits").innerHTML = html;
    }

    const latest =
        hist.length
            ? hist[hist.length - 1]
            : "—";

    if ($("last")) {
        $("last").textContent = latest;
    }

    if ($("ticks")) {
        $("ticks").textContent = total;
    }

    if (total > 0) {

        const hot =
            cnt.indexOf(Math.max(...cnt));

        if ($("hot")) {
            $("hot").textContent = hot;
        }

        if ($("aiHot")) {
            $("aiHot").textContent = hot;
        }
    }

    /*
       Recent digit history.
    */

    if ($("history")) {

        $("history").innerHTML =
            hist
                .slice(-50)
                .map(d => `<span>${d}</span>`)
                .join("");
    }

}


/* ---------------------------------------------------------
   AI / STATISTICAL ANALYSIS
--------------------------------------------------------- */

function analyze() {

    if (hist.length < 10) {

        if ($("prediction")) {
            $("prediction").textContent =
                "COLLECTING DATA";
        }

        if ($("score")) {
            $("score").textContent = "—";
        }

        if ($("confidence")) {
            $("confidence").textContent = "—";
        }

        if ($("reason")) {
            $("reason").textContent =
                "KRISHWAVE is collecting live tick data.";
        }

        return;
    }


    const recent =
        hist.slice(-50);

    const length =
        recent.length;


    /* ---------------------------------------------
       EVEN / ODD
    --------------------------------------------- */

    const even =
        recent.filter(
            d => d % 2 === 0
        ).length;

    const odd =
        length - even;


    /* ---------------------------------------------
       OVER / UNDER
    --------------------------------------------- */

    const over =
        recent.filter(
            d => d >= 5
        ).length;

    const under =
        length - over;


    /* ---------------------------------------------
       HOT DIGIT
    --------------------------------------------- */

    let hotDigit = 0;

    let highestCount = -1;

    for (let i = 0; i < 10; i++) {

        if (cnt[i] > highestCount) {

            highestCount = cnt[i];

            hotDigit = i;
        }
    }


    /* ---------------------------------------------
       MATCH / DIFFER
    --------------------------------------------- */

    const matches =
        recent.filter(
            d => d === hotDigit
        ).length;

    const differs =
        length - matches;


    /* ---------------------------------------------
       SELECT PREDICTION
    --------------------------------------------- */

    let pred;

    let rawStrength = 0;

    let reason = "";


    if (selectedStrategy === "even") {

        pred = "EVEN";

        rawStrength =
            Math.abs(even - odd) / length;

        reason =
            `Last ${length} ticks: ${even} EVEN and ${odd} ODD.`;

    }


    else if (selectedStrategy === "odd") {

        pred = "ODD";

        rawStrength =
            Math.abs(odd - even) / length;

        reason =
            `Last ${length} ticks: ${odd} ODD and ${even} EVEN.`;

    }


    else if (selectedStrategy === "over") {

        pred = "OVER 4";

        rawStrength =
            Math.abs(over - under) / length;

        reason =
            `Last ${length} ticks: ${over} OVER 4 and ${under} UNDER 5.`;

    }


    else if (selectedStrategy === "under") {

        pred = "UNDER 5";

        rawStrength =
            Math.abs(under - over) / length;

        reason =
            `Last ${length} ticks: ${under} UNDER 5 and ${over} OVER 4.`;

    }


    else if (selectedStrategy === "differs") {

        pred = hotDigit;

        rawStrength =
            differs / length;

        reason =
            `Hot digit is ${hotDigit}. ${differs} of the last ${length} ticks differed from that digit.`;

    }


    else {

        pred = hotDigit;

        rawStrength =
            matches / length;

        reason =
            `Digit ${hotDigit} is currently the hottest digit with ${matches} matches in the recent sample.`;

    }


    /*
       Convert statistical strength into an
       analysis score.

       This is NOT a guaranteed probability.
    */

    let score =
        Math.round(
            50 + Math.min(45, rawStrength * 100)
        );


    /*
       Keep score inside safe UI range.
    */

    score =
        Math.max(
            50,
            Math.min(95, score)
        );


    prediction = pred;


    /* ---------------------------------------------
       UPDATE UI
    --------------------------------------------- */

    if ($("prediction")) {
        $("prediction").textContent =
            pred;
    }

    if ($("score")) {
        $("score").textContent =
            score + "%";
    }

    if ($("confidence")) {
        $("confidence").textContent =
            score + "%";
    }

    if ($("reason")) {

        $("reason").textContent =
            `${reason} This is statistical analysis, not a guarantee of the next tick.`;
    }

    if ($("analysis")) {

        $("analysis").textContent =
            `${reason} Sample size: ${length} ticks.`;
    }

}


/* ---------------------------------------------------------
   BUILD STRATEGY BUTTONS
--------------------------------------------------------- */

function buildStrategies() {

    const container =
        $("strategies");

    if (!container) {
        return;
    }

    container.innerHTML = "";


    STRATEGIES.forEach(strategy => {

        const key = strategy[0];

        const label = strategy[1];

        const button =
            document.createElement("button");

        button.textContent = label;

        button.dataset.k = key;

        if (key === selectedStrategy) {
            button.classList.add("on");
        }

        button.onclick = () => {

            chooseStrategy(key);

        };

        container.appendChild(button);

    });


    /*
       Strategy select.
    */

    const select =
        $("strategy");

    if (select) {

        /*
           Avoid duplicating options.
        */

        select.innerHTML = "";

        STRATEGIES.forEach(strategy => {

            const option =
                document.createElement("option");

            option.value = strategy[0];

            option.textContent = strategy[1];

            select.appendChild(option);

        });

        select.value =
            selectedStrategy;

        select.onchange =
            event =>
                chooseStrategy(
                    event.target.value
                );
    }

}


/* ---------------------------------------------------------
   CHOOSE STRATEGY
--------------------------------------------------------- */

function chooseStrategy(key) {

    selectedStrategy = key;


    /*
       Highlight buttons.
    */

    document
        .querySelectorAll("#strategies button")
        .forEach(button => {

            button.classList.toggle(
                "on",
                button.dataset.k === key
            );

        });


    /*
       Update manual number section.
    */

    const manualStrategies = [
        "matches",
        "differs",
        "over",
        "under"
    ];

    const needsManual =
        manualStrategies.includes(key);


    if ($("manual")) {

        $("manual").classList.toggle(
            "hide",
            !needsManual
        );

    }


    if ($("manualTitle")) {

        if (key === "matches") {

            $("manualTitle").textContent =
                "MATCH DIGIT";

        }

        else if (key === "differs") {

            $("manualTitle").textContent =
                "DIFFER DIGIT";

        }

        else if (key === "over") {

            $("manualTitle").textContent =
                "OVER NUMBER";

        }

        else if (key === "under") {

            $("manualTitle").textContent =
                "UNDER NUMBER";

        }

    }


    analyze();

}


/* ---------------------------------------------------------
   BUILD MARKET LIST
--------------------------------------------------------- */

function buildMarkets() {

    const container =
        $("markets");

    if (!container) {
        return;
    }

    container.innerHTML = "";


    MARKETS.forEach(market => {

        const symbol = market[0];

        const name = market[1];


        const item =
            document.createElement("div");

        item.className =
            "market" +
            (symbol === sym ? " sel" : "");


        item.dataset.s =
            symbol;


        item.innerHTML = `
            <b>${name}</b>
            <small>${symbol}</small>
            <strong class="live">LIVE</strong>
        `;


        item.onclick = () => {

            selectMarket(symbol);

        };


        container.appendChild(item);

    });

}


/* ---------------------------------------------------------
   SELECT MARKET
--------------------------------------------------------- */

function selectMarket(symbol) {

    sym = symbol;

    resetMarketData();

    buildMarkets();

    updateMarketLabels();

    connect();

}


/* ---------------------------------------------------------
   MARKET LABELS
--------------------------------------------------------- */

function updateMarketLabels() {

    const market =
        MARKETS.find(
            m => m[0] === sym
        );

    if (!market) {
        return;
    }

    if ($("mname")) {
        $("mname").textContent =
            market[1];
    }

    if ($("sym")) {
        $("sym").textContent =
            sym;
    }

    if ($("market")) {

        $("market").textContent =
            "CONNECTING TO DERIV…";
    }

}


/* ---------------------------------------------------------
   SEND REQUEST
--------------------------------------------------------- */

function send(request) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {

        try {

            ws.send(
                JSON.stringify(request)
            );

            return true;

        } catch (error) {

            console.error(error);

        }

    }

    return false;

}


/* ---------------------------------------------------------
   SUBSCRIBE TO MARKET
--------------------------------------------------------- */

function subscribeMarket() {

    /*
       Historical data first.
    */

    send({
        ticks_history: sym,
        count: 200,
        end: "latest",
        style: "ticks",
        req_id: 100
    });


    /*
       Then live ticks.
    */

    send({
        ticks: sym,
        subscribe: 1,
        req_id: 101
    });


    /*
       Ping keeps the connection testable.
    */

    send({
        ping: 1,
        req_id: 102
    });

}


/* ---------------------------------------------------------
   CONNECT
--------------------------------------------------------- */

function connect() {

    /*
       Cancel pending reconnect.
    */

    if (reconnectTimer) {

        clearTimeout(
            reconnectTimer
        );

        reconnectTimer = null;

    }


    /*
       Close previous socket.
    */

    if (ws) {

        try {
            ws.close();
        } catch (e) {}

        ws = null;

    }


    setConnection(
        "connecting",
        "CONNECTING"
    );


    if ($("market")) {

        $("market").textContent =
            "CONNECTING TO DERIV…";

    }


    showError("");


    /*
       Choose endpoint.
    */

    const url =
        endpointMode === "primary"
            ? WS_PRIMARY
            : WS_FALLBACK;


    try {

        ws =
            new WebSocket(url);

    } catch (error) {

        showError(
            "Browser could not open the Deriv WebSocket."
        );

        fallbackEndpoint();

        return;

    }


    let receivedData = false;


    /* ---------------------------------------------
       OPEN
    --------------------------------------------- */

    ws.onopen = () => {

        reconnectAttempts = 0;

        setConnection(
            "live",
            "LIVE"
        );


        if ($("market")) {

            $("market").textContent =
                "LIVE • " + sym;

        }


        showError("");


        subscribeMarket();


        /*
           If primary connects but does not return
           data, switch to fallback.
        */

        setTimeout(() => {

            if (
                ws &&
                ws.readyState === WebSocket.OPEN &&
                !receivedData &&
                endpointMode === "primary"
            ) {

                console.warn(
                    "Primary endpoint connected but no data received. Trying fallback."
                );

                fallbackEndpoint();

            }

        }, 8000);

    };


    /* ---------------------------------------------
       MESSAGE
    --------------------------------------------- */

    ws.onmessage = event => {

        let data;

        try {

            data =
                JSON.parse(
                    event.data
                );

        } catch (error) {

            console.warn(
                "Invalid Deriv message",
                event.data
            );

            return;

        }


        /*
           API error.
        */

        if (data.error) {

            showError(
                data.error.message ||
                "Deriv returned an error."
            );

            return;

        }


        /*
           Historical ticks.
        */

        if (
            data.msg_type === "history" &&
            data.history
        ) {

            receivedData = true;

            hist = [];

            cnt =
                Array(10).fill(0);

            totalTicks = 0;


            const prices =
                data.history.prices || [];


            prices.forEach(
                price => addTick(price)
            );


            if ($("market")) {

                $("market").textContent =
                    "LIVE • " + sym;

            }

            return;

        }


        /*
           Live tick.
        */

        if (
            data.msg_type === "tick" &&
            data.tick
        ) {

            receivedData = true;

            addTick(
                data.tick.quote
            );


            if ($("market")) {

                $("market").textContent =
                    "LIVE • " + sym;

            }

        }

    };


    /* ---------------------------------------------
       ERROR
    --------------------------------------------- */

    ws.onerror = () => {

        showError(
            "Deriv WebSocket connection error."
        );

    };


    /* ---------------------------------------------
       CLOSE
    --------------------------------------------- */

    ws.onclose = () => {

        setConnection(
            "offline",
            "OFFLINE"
        );


        /*
           Try fallback immediately if
           primary failed.
        */

        if (
            endpointMode === "primary" &&
            !receivedData
        ) {

            fallbackEndpoint();

            return;

        }


        /*
           Automatic reconnect.
        */

        scheduleReconnect();

    };

}


/* ---------------------------------------------------------
   FALLBACK ENDPOINT
--------------------------------------------------------- */

function fallbackEndpoint() {

    if (ws) {

        try {
            ws.close();
        } catch (e) {}

    }


    endpointMode =
        endpointMode === "primary"
            ? "fallback"
            : "primary";


    clearTimeout(
        reconnectTimer
    );


    reconnectTimer =
        setTimeout(
            connect,
            500
        );

}


/* ---------------------------------------------------------
   AUTOMATIC RECONNECT
--------------------------------------------------------- */

function scheduleReconnect() {

    clearTimeout(
        reconnectTimer
    );


    reconnectAttempts++;


    const delay =
        Math.min(
            1000 *
            Math.pow(
                2,
                Math.min(
                    reconnectAttempts,
                    5
                )
            ),
            30000
        );


    reconnectTimer =
        setTimeout(
            connect,
            delay
        );

}


/* ---------------------------------------------------------
   MANUAL RECONNECT
--------------------------------------------------------- */

function manualReconnect() {

    reconnectAttempts = 0;

    endpointMode = "primary";

    resetMarketData();

    connect();

}


/* ---------------------------------------------------------
   NUMBER INPUT
--------------------------------------------------------- */

if ($("number")) {

    $("number").oninput =
        event => {

            if ($("manualPreview")) {

                $("manualPreview").textContent =
                    event.target.value;

            }

        };

}


/* ---------------------------------------------------------
   PAPER RESULT
--------------------------------------------------------- */

function paperResult() {

    if (!running) {
        return;
    }


    const numberInput =
        $("number");


    if (!numberInput) {
        return;
    }


    const entered =
        numberInput.value;


    if (entered === "") {
        return;
    }


    const enteredNumber =
        Number(entered);


    let success = false;


    /*
       Paper evaluation only.
       NO REAL TRADE.
    */

    if (
        selectedStrategy === "matches"
    ) {

        success =
            Number(prediction) ===
            enteredNumber;

    }

    else if (
        selectedStrategy === "differs"
    ) {

        success =
            Number(prediction) !==
            enteredNumber;

    }

    else if (
        selectedStrategy === "over"
    ) {

        success =
            enteredNumber >= 5;

    }

    else if (
        selectedStrategy === "under"
    ) {

        success =
            enteredNumber < 5;

    }

    else if (
        selectedStrategy === "even"
    ) {

        success =
            enteredNumber % 2 === 0;

    }

    else if (
        selectedStrategy === "odd"
    ) {

        success =
            enteredNumber % 2 !== 0;

    }


    if (success) {

        wins++;

    } else {

        losses++;

    }


    const stakeElement =
        $("stake");


    const stake =
        stakeElement
            ? Number(stakeElement.value || 0)
            : 0;


    profitLoss +=
        success
            ? stake
            : -stake;


    if ($("win")) {
        $("win").textContent =
            wins;
    }

    if ($("loss")) {
        $("loss").textContent =
            losses;
    }

    if ($("pl")) {

        $("pl").textContent =
            "$" +
            profitLoss.toFixed(2);

    }

}


/* ---------------------------------------------------------
   ANALYSIS TIMER
--------------------------------------------------------- */

function updateTimerUI() {

    if ($("timer")) {

        $("timer").textContent =
            secondsLeft;

    }


    if (
        phase === "analysis" &&
        $("a10")
    ) {

        $("a10").textContent =
            secondsLeft + "s";

    }


    if (
        phase === "prediction" &&
        $("a5")
    ) {

        $("a5").textContent =
            secondsLeft + "s";

    }


    if (
        phase === "trade" &&
        $("a3")
    ) {

        $("a3").textContent =
            secondsLeft + "s";

    }

}


/* ---------------------------------------------------------
   START AI CYCLE
--------------------------------------------------------- */

function startCycle() {

    clearInterval(timer);


    phase =
        "analysis";


    secondsLeft =
        10;


    updateTimerUI();


    if ($("phase")) {

        $("phase").textContent =
            "AI ANALYSIS";

    }


    if ($("msg")) {

        $("msg").textContent =
            "KRISHWAVE is analyzing live market data.";

    }


    timer =
        setInterval(() => {

            secondsLeft--;

            updateTimerUI();


            if (secondsLeft <= 0) {

                if (
                    phase === "analysis"
                ) {

                    analyze();


                    phase =
                        "prediction";

                    secondsLeft =
                        5;


                    if ($("phase")) {

                        $("phase").textContent =
                            "PREDICTION";

                    }


                    if ($("msg")) {

                        $("msg").textContent =
                            prediction !== null
                                ? "AI prediction: " +
                                  prediction
                                : "Collecting more data…";

                    }

                }


                else if (
                    phase === "prediction"
                ) {

                    phase =
                        "trade";

                    secondsLeft =
                        3;


                    if ($("phase")) {

                        $("phase").textContent =
                            "TRADE NOW";

                    }


                    if ($("msg")) {

                        $("msg").textContent =
                            "3 second paper-analysis window.";

                    }

                }


                else {

                    paperResult();


                    phase =
                        "analysis";

                    secondsLeft =
                        10;


                    if ($("phase")) {

                        $("phase").textContent =
                            "AI ANALYSIS";

                    }


                    if ($("msg")) {

                        $("msg").textContent =
                            "Analyzing market again…";

                    }

                }

            }

        }, 1000);

}


/* ---------------------------------------------------------
   START / STOP BUTTON
--------------------------------------------------------- */

if ($("toggle")) {

    $("toggle").onclick =
        () => {

            running =
                !running;


            if (running) {

                $("toggle").textContent =
                    "STOP ANALYSIS";

                startCycle();

            }

            else {

                $("toggle").textContent =
                    "START ANALYSIS";

                clearInterval(timer);

            }

        };

}


/* ---------------------------------------------------------
   RESET
--------------------------------------------------------- */

if ($("reset")) {

    $("reset").onclick =
        () => {

            wins = 0;

            losses = 0;

            profitLoss = 0;


            if ($("win")) {
                $("win").textContent = "0";
            }

            if ($("loss")) {
                $("loss").textContent = "0";
            }

            if ($("pl")) {
                $("pl").textContent = "$0.00";
            }


            resetMarketData();

        };

}


/* ---------------------------------------------------------
   SCAN BUTTON
--------------------------------------------------------- */

if ($("scan")) {

    $("scan").onclick =
        () => {

            buildMarkets();

            connect();

        };

}


/* ---------------------------------------------------------
   RECONNECT BUTTON
--------------------------------------------------------- */

if ($("reconnect")) {

    $("reconnect").onclick =
        manualReconnect;

}


/* ---------------------------------------------------------
   SYMBOL SELECT
--------------------------------------------------------- */

if ($("symbol")) {

    $("symbol").onchange =
        event => {

            selectMarket(
                event.target.value
            );

        };

}


/* ---------------------------------------------------------
   INITIALIZE
--------------------------------------------------------- */

buildStrategies();

buildMarkets();

updateMarketLabels();

render();

connect();


/* =========================================================
   KRISHWAVE READY
========================================================= */