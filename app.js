/* =========================================================
   KRISHWAVE V5.5
   DERIV LIVE MARKET INTELLIGENCE ENGINE

   FIXES
   ---------------------------------------------------------
   - Current Deriv public API
   - New active_symbols format
   - Automatic Volatility market discovery
   - Live ticks
   - Tick history
   - 13+ volatility markets
   - AI 10s -> 5s -> 3s cycle
   - NO negative countdown
   - Manual number stays manual
   - Separate Analysis / Trade / History
   - Paper trading only
   - Demo / Real UI preserved
========================================================= */

"use strict";

/* =========================================================
   CONFIG
========================================================= */

const DERIV_NEW =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const DERIV_LEGACY =
  "wss://ws.binaryws.com/websockets/v3";

let ws = null;
let usingLegacy = false;
let reconnectTimer = null;
let connectionAttempts = 0;
let requestId = 1;

let aiRunning = false;
let aiTimer = null;
let aiPhase = "idle";
let aiSeconds = 0;

let selectedMarket = "";
let selectedStrategy = "MATCHES";

let accountMode = "DEMO";
let paperRunning = false;

let markets = [];
const marketData = {};

let lastPrediction = null;
let lastSignal = null;

const MAX_MARKETS = 16;
const HISTORY_COUNT = 80;


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = id => document.getElementById(id);

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function show(id, visible = true) {
    const el = $(id);
    if (!el) return;
    el.style.display = visible ? "" : "none";
}

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}


/* =========================================================
   CONNECTION STATUS
========================================================= */

function setConnection(status, online = false) {

    setText("connectionStatus", status);

    const dot = $("statusDot");

    if (dot) {
        dot.classList.toggle("online", online);
        dot.classList.toggle("offline", !online);
    }
}

function connectionMessage(message) {
    setText("analysisMsg", message);
}


/* =========================================================
   CONNECT
========================================================= */

function connect() {

    clearTimeout(reconnectTimer);

    connectionAttempts++;

    setConnection("CONNECTING...", false);
    connectionMessage("Connecting to Deriv live market data...");

    try {

        usingLegacy = false;

        ws = new WebSocket(DERIV_NEW);

        attachSocketHandlers(ws);

    } catch (error) {

        console.error(error);

        fallbackConnection();

    }
}


/* =========================================================
   SOCKET HANDLERS
========================================================= */

function attachSocketHandlers(socket) {

    socket.onopen = () => {

        console.log(
            "KRISHWAVE connected:",
            usingLegacy ? "LEGACY" : "CURRENT DERIV API"
        );

        setConnection("ONLINE", true);

        connectionMessage(
            "Connected to Deriv. Loading live Volatility markets..."
        );

        connectionAttempts = 0;

        requestActiveSymbols();
    };


    socket.onmessage = event => {

        let data;

        try {
            data = JSON.parse(event.data);
        } catch (error) {
            console.warn("Invalid Deriv message", event.data);
            return;
        }

        handleDerivMessage(data);
    };


    socket.onerror = error => {

        console.warn(
            "Deriv WebSocket error:",
            error
        );

        connectionMessage(
            "Deriv connection error. Trying backup market connection..."
        );
    };


    socket.onclose = () => {

        console.warn("Deriv WebSocket closed");

        setConnection("RECONNECTING...", false);

        connectionMessage(
            "Connection closed. Reconnecting to Deriv..."
        );

        clearTimeout(reconnectTimer);

        reconnectTimer = setTimeout(() => {

            if (!usingLegacy) {
                fallbackConnection();
            } else {
                connect();
            }

        }, 2500);
    };
}


/* =========================================================
   FALLBACK CONNECTION
========================================================= */

function fallbackConnection() {

    try {

        if (ws) {
            ws.close();
        }

    } catch (e) {}

    clearTimeout(reconnectTimer);

    usingLegacy = true;

    setConnection("CONNECTING...", false);

    connectionMessage(
        "Trying Deriv backup market-data connection..."
    );

    try {

        ws = new WebSocket(DERIV_LEGACY);

        attachSocketHandlers(ws);

    } catch (error) {

        console.error(error);

        setConnection("OFFLINE", false);

        reconnectTimer = setTimeout(connect, 4000);
    }
}


/* =========================================================
   SEND
========================================================= */

function send(payload) {

    if (!ws) {
        console.warn("WebSocket not ready");
        return false;
    }

    if (ws.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket not open");
        return false;
    }

    try {

        payload.req_id = requestId++;

        ws.send(JSON.stringify(payload));

        return true;

    } catch (error) {

        console.error("Send error:", error);

        return false;
    }
}


/* =========================================================
   ACTIVE SYMBOLS
========================================================= */

function requestActiveSymbols() {

    /*
       IMPORTANT:
       Current Deriv API no longer needs product_type.
    */

    send({
        active_symbols: "brief"
    });

}


/* =========================================================
   HANDLE DERIV MESSAGE
========================================================= */

function handleDerivMessage(data) {

    if (data.error) {

        console.warn(
            "Deriv API error:",
            data.error
        );

        connectionMessage(
            "Deriv API: " +
            (data.error.message || "Request error")
        );

        return;
    }


    /* -----------------------------------------------
       ACTIVE SYMBOLS
    ------------------------------------------------ */

    if (data.msg_type === "active_symbols") {

        handleActiveSymbols(
            data.active_symbols || []
        );

        return;
    }


    /* -----------------------------------------------
       TICK
    ------------------------------------------------ */

    if (data.msg_type === "tick") {

        handleTick(data.tick);

        return;
    }


    /* -----------------------------------------------
       HISTORY
    ------------------------------------------------ */

    if (data.msg_type === "history") {

        handleHistory(data.history);

        return;
    }

}


/* =========================================================
   DISCOVER VOLATILITY MARKETS
========================================================= */

function handleActiveSymbols(list) {

    console.log(
        "Active symbols received:",
        list.length
    );

    const found = [];

    list.forEach(item => {

        const symbol =
            item.underlying_symbol ||
            item.symbol;

        const name =
            item.underlying_symbol_name ||
            item.display_name ||
            symbol;

        if (!symbol) return;

        const text =
            `${symbol} ${name}`.toLowerCase();

        /*
           Volatility indices normally contain
           volatility / 1hz volatility identifiers.
        */

        const isVolatility =
            text.includes("volatility") ||
            /^1hz\d+v$/i.test(symbol) ||
            /^r_\d+$/i.test(symbol);

        if (!isVolatility) return;

        if (
            found.some(
                x => x.symbol === symbol
            )
        ) return;

        found.push({
            symbol,
            name
        });

    });


    /* Sort by name */
    found.sort((a, b) =>
        a.name.localeCompare(b.name)
    );


    markets = found.slice(
        0,
        MAX_MARKETS
    );


    /*
       If the new endpoint returned nothing,
       use known current synthetic symbols.
    */

    if (!markets.length) {

        console.warn(
            "No volatility symbols discovered. Using fallback list."
        );

        useFallbackMarkets();

    }


    initialiseMarkets();

}


/* =========================================================
   FALLBACK VOLATILITY MARKETS
========================================================= */

function useFallbackMarkets() {

    const fallback = [
        ["1HZ10V", "Volatility 10 Index"],
        ["1HZ25V", "Volatility 25 Index"],
        ["1HZ50V", "Volatility 50 Index"],
        ["1HZ75V", "Volatility 75 Index"],
        ["1HZ100V", "Volatility 100 Index"],
        ["1HZ150V", "Volatility 150 Index"],
        ["1HZ200V", "Volatility 200 Index"],
        ["R_10", "Volatility 10"],
        ["R_25", "Volatility 25"],
        ["R_50", "Volatility 50"],
        ["R_75", "Volatility 75"],
        ["R_100", "Volatility 100"],
        ["R_150", "Volatility 150"],
        ["R_200", "Volatility 200"]
    ];

    markets = fallback.map(item => ({
        symbol: item[0],
        name: item[1]
    }));

}


/* =========================================================
   INITIALISE MARKETS
========================================================= */

function initialiseMarkets() {

    markets.forEach(market => {

        if (!marketData[market.symbol]) {

            marketData[market.symbol] = {
                symbol: market.symbol,
                name: market.name,
                prices: [],
                digits: [],
                ticks: 0,
                lastQuote: null,
                lastEpoch: null,
                score: 0,
                strength: "WAITING"
            };

        }

        /*
           Historical data
        */

        send({
            ticks_history: market.symbol,
            count: HISTORY_COUNT,
            end: "latest",
            style: "ticks",
            subscribe: 0
        });


        /*
           Live tick stream
        */

        send({
            ticks: market.symbol,
            subscribe: 1
        });

    });


    renderMarkets();

    setText(
        "scannerCount",
        `${markets.length} markets`
    );

    connectionMessage(
        `${markets.length} Volatility markets connected. Waiting for live ticks...`
    );

}


/* =========================================================
   HISTORY
========================================================= */

function handleHistory(history) {

    if (!history) return;

    const prices =
        history.prices || [];

    const times =
        history.times || [];

    /*
       New API does not guarantee echo_req.
       So identify by price stream request using
       the order-independent fallback below.
    */

    if (!prices.length) return;


    /*
       If a matching symbol can be identified
       from active subscription responses, use it.
       Otherwise distribute based on pending histories.
    */

    const symbol =
        history.symbol ||
        findSymbolFromHistory(prices);

    if (!symbol) return;

    const data =
        marketData[symbol];

    if (!data) return;


    data.prices = prices
        .map(Number)
        .filter(Number.isFinite);


    data.digits =
        data.prices.map(extractLastDigit);


    data.ticks =
        data.prices.length;


    calculateMarket(data);

    renderDigits();

    renderMarkets();

    if (!selectedMarket) {

        const best = bestMarket();

        if (best) {
            selectMarket(best.symbol);
        }

    }

}


/* =========================================================
   HISTORY SYMBOL MATCHING
========================================================= */

function findSymbolFromHistory(prices) {

    /*
       Try exact quote matching first.
    */

    const first = Number(prices[0]);

    if (!Number.isFinite(first)) {
        return null;
    }

    for (const market of markets) {

        const data =
            marketData[market.symbol];

        if (!data) continue;

        if (
            data.prices &&
            data.prices.length
        ) {

            const oldFirst =
                Number(data.prices[0]);

            if (
                Number.isFinite(oldFirst) &&
                oldFirst === first
            ) {
                return market.symbol;
            }

        }

    }


    /*
       Pending history queue.
       The first market that has little/no history
       gets assigned.
    */

    for (const market of markets) {

        const data =
            marketData[market.symbol];

        if (
            data &&
            data.prices.length === 0
        ) {
            return market.symbol;
        }

    }

    return null;
}


/* =========================================================
   TICK
========================================================= */

function handleTick(tick) {

    if (!tick) return;

    const symbol =
        tick.symbol;

    if (!symbol) return;

    if (!marketData[symbol]) {

        const market =
            markets.find(
                m => m.symbol === symbol
            );

        if (!market) return;

        marketData[symbol] = {
            symbol,
            name: market.name,
            prices: [],
            digits: [],
            ticks: 0,
            lastQuote: null,
            lastEpoch: null,
            score: 0,
            strength: "WAITING"
        };

    }


    const data =
        marketData[symbol];


    const quote =
        Number(tick.quote);


    if (!Number.isFinite(quote)) {
        return;
    }


    data.lastQuote = quote;

    data.lastEpoch =
        tick.epoch || Date.now() / 1000;


    data.prices.push(quote);

    data.digits.push(
        extractLastDigit(quote)
    );


    /*
       Keep last 120 ticks
    */

    if (data.prices.length > 120) {
        data.prices.shift();
    }

    if (data.digits.length > 120) {
        data.digits.shift();
    }


    data.ticks =
        data.prices.length;


    calculateMarket(data);


    /*
       Select strongest market automatically
    */

    if (!selectedMarket) {

        const best =
            bestMarket();

        if (best) {
            selectMarket(best.symbol);
        }

    }


    renderMarkets();
    renderDigits();


    /*
       Update AI only while analysis is running
    */

    if (
        aiRunning &&
        aiPhase === "analysis"
    ) {

        updateLiveAI();
    }

}


/* =========================================================
   LAST DIGIT
========================================================= */

function extractLastDigit(value) {

    const text =
        String(value);

    const cleaned =
        text.replace(
            /[^0-9]/g,
            ""
        );

    if (!cleaned) return 0;

    return Number(
        cleaned.charAt(
            cleaned.length - 1
        )
    );
}


/* =========================================================
   MARKET STATISTICS
========================================================= */

function calculateMarket(data) {

    const digits =
        data.digits || [];

    const prices =
        data.prices || [];


    if (digits.length < 5) {

        data.score = 0;
        data.strength = "WAITING";

        return;
    }


    const counts =
        Array(10).fill(0);


    digits.forEach(d => {

        if (
            Number.isInteger(d) &&
            d >= 0 &&
            d <= 9
        ) {
            counts[d]++;
        }

    });


    const total =
        digits.length;


    const maxCount =
        Math.max(...counts);


    const dominantDigit =
        counts.indexOf(maxCount);


    const concentration =
        maxCount / total;


    /*
       Recent movement
    */

    let movement = 0;

    for (
        let i = 1;
        i < prices.length;
        i++
    ) {

        if (
            prices[i] !==
            prices[i - 1]
        ) {
            movement++;
        }

    }


    const movementRate =
        prices.length > 1
            ? movement / (prices.length - 1)
            : 0;


    /*
       Statistical score.
       This is a ranking score, not a guarantee.
    */

    const score =
        Math.min(
            100,
            Math.round(
                concentration * 70 +
                movementRate * 30
            )
        );


    data.score = score;

    if (score >= 70) {
        data.strength = "STRONG";
    } else if (score >= 50) {
        data.strength = "MEDIUM";
    } else {
        data.strength = "WEAK";
    }


    data.dominantDigit =
        dominantDigit;

    data.counts =
        counts;

}


/* =========================================================
   BEST MARKET
========================================================= */

function bestMarket() {

    const available =
        markets
            .map(
                m => marketData[m.symbol]
            )
            .filter(
                d =>
                    d &&
                    d.prices &&
                    d.prices.length >= 10
            );


    if (!available.length) {
        return null;
    }


    available.sort(
        (a, b) =>
            b.score - a.score
    );


    return available[0];
}


/* =========================================================
   PREDICTION ENGINE
========================================================= */

function makePrediction(
    data,
    strategy
) {

    if (
        !data ||
        !data.digits ||
        data.digits.length < 5
    ) {

        return {
            prediction: "—",
            confidence: 0,
            reason: "Waiting for more tick data."
        };

    }


    const digits =
        data.digits;


    const counts =
        Array(10).fill(0);


    digits.forEach(d => {

        if (
            d >= 0 &&
            d <= 9
        ) {
            counts[d]++;
        }

    });


    let strongest =
        0;

    for (
        let i = 1;
        i < counts.length;
        i++
    ) {

        if (
            counts[i] >
            counts[strongest]
        ) {
            strongest = i;
        }

    }


    const total =
        digits.length;


    const probability =
        counts[strongest] /
        total;


    let prediction;
    let confidence;


    switch (strategy) {

        case "MATCHES":

            prediction =
                strongest;

            confidence =
                Math.round(
                    probability * 100
                );

            break;


        case "DIFFERS":

            prediction =
                strongest;

            confidence =
                Math.round(
                    100 -
                    probability * 100
                );

            break;


        case "OVER":

            prediction =
                4;

            confidence =
                Math.round(
                    digits.filter(
                        d => d > 4
                    ).length /
                    total *
                    100
                );

            break;


        case "UNDER":

            prediction =
                5;

            confidence =
                Math.round(
                    digits.filter(
                        d => d < 5
                    ).length /
                    total *
                    100
                );

            break;


        case "EVEN":

            prediction =
                "EVEN";

            confidence =
                Math.round(
                    digits.filter(
                        d => d % 2 === 0
                    ).length /
                    total *
                    100
                );

            break;


        case "ODD":

            prediction =
                "ODD";

            confidence =
                Math.round(
                    digits.filter(
                        d => d % 2 !== 0
                    ).length /
                    total *
                    100
                );

            break;


        default:

            prediction =
                strongest;

            confidence =
                Math.round(
                    probability * 100
                );
    }


    confidence =
        Math.max(
            1,
            Math.min(
                99,
                confidence
            )
        );


    return {

        prediction,

        confidence,

        reason:
            `${data.name} has ${total} recent ticks. ` +
            `Dominant digit is ${strongest}. ` +
            `Market strength: ${data.strength}.`

    };

}


/* =========================================================
   AI UPDATE
========================================================= */

function updateLiveAI() {

    const best =
        bestMarket();

    if (!best) return;


    const prediction =
        makePrediction(
            best,
            selectedStrategy
        );


    lastPrediction =
        prediction;


    setText(
        "aiMarket",
        best.name
    );


    setText(
        "aiPrediction",
        prediction.prediction
    );


    setText(
        "aiType",
        selectedStrategy
    );


    setText(
        "aiCirclePrediction",
        prediction.prediction
    );


    setText(
        "analysisPrediction",
        prediction.prediction
    );


    setText(
        "analysisConfidence",
        `${prediction.confidence}%`
    );


    setText(
        "analysisConfidenceBox",
        `${prediction.confidence}%`
    );


    setText(
        "analysisMarket",
        best.name
    );


    setText(
        "analysisStrategy",
        selectedStrategy
    );


    setText(
        "analysisText",
        prediction.reason
    );


    setText(
        "reason",
        prediction.reason
    );


    setText(
        "aiScore",
        best.score
    );


    setText(
        "tradePrediction",
        prediction.prediction
    );


    setText(
        "tradeType",
        selectedStrategy
    );


    setText(
        "tradeConfidence",
        `${prediction.confidence}%`
    );


    setText(
        "tradeStatus",
        "AI SIGNAL READY"
    );

}


/* =========================================================
   AI PHASE
========================================================= */

function setPhase(
    phase,
    seconds
) {

    aiPhase =
        phase;

    aiSeconds =
        seconds;


    setText(
        "aiCircleTimer",
        seconds
    );


    const label =
        $("aiCircleLabel");

    if (label) {

        if (phase === "analysis") {

            label.textContent =
                "ANALYSIS";

        } else if (
            phase === "prediction"
        ) {

            label.textContent =
                "LOCK";

        } else if (
            phase === "trade"
        ) {

            label.textContent =
                "TRADE NOW";

        } else if (
            phase === "cooldown"
        ) {

            label.textContent =
                "COOLDOWN";

        }

    }


    setText(
        "aiCircleStatus",
        aiRunning
            ? "AI RUNNING"
            : "AI STOPPED"
    );


    /*
       Also update visible cycle cards
    */

    setText(
        "cycleAnalysis",
        phase === "analysis"
            ? `${seconds}s`
            : "10s"
    );


    setText(
        "cyclePrediction",
        phase === "prediction"
            ? `${seconds}s`
            : "5s"
    );


    setText(
        "cycleTrade",
        phase === "trade"
            ? "NOW"
            : "TRADE NOW"
    );


    setText(
        "cycleCooldown",
        phase === "cooldown"
            ? `${seconds}s`
            : "3s"
    );

}


/* =========================================================
   AI TIMER
========================================================= */

function runAIPhase() {

    if (!aiRunning) return;


    if (aiPhase === "analysis") {

        updateLiveAI();

    }


    aiSeconds--;

    if (aiSeconds <= 0) {

        if (aiPhase === "analysis") {

            /*
               10 -> 5
            */

            updateLiveAI();

            setPhase(
                "prediction",
                5
            );


        } else if (
            aiPhase === "prediction"
        ) {

            /*
               Prediction locked.
               5 -> TRADE NOW
            */

            showTradeNow();

            setPhase(
                "trade",
                0
            );


            setTimeout(() => {

                if (!aiRunning) return;

                setPhase(
                    "cooldown",
                    3
                );

            }, 700);


        } else if (
            aiPhase === "cooldown"
        ) {

            /*
               3 -> 10
            */

            setPhase(
                "analysis",
                10
            );

            updateLiveAI();

        }

        return;
    }


    setText(
        "aiCircleTimer",
        aiSeconds
    );


    setTimeout(
        runAIPhase,
        1000
    );

}


/* =========================================================
   START AI
========================================================= */

function startAI() {

    if (aiRunning) return;


    const best =
        bestMarket();


    if (!best) {

        connectionMessage(
            "AI is waiting for live tick data."
        );

        setText(
            "aiCircleStatus",
            "WAITING FOR TICKS"
        );

        return;
    }


    aiRunning = true;


    setText(
        "aiCircleStatus",
        "AI RUNNING"
    );


    connectionMessage(
        "KRISH AI is analysing live market statistics."
    );


    setPhase(
        "analysis",
        10
    );


    updateLiveAI();


    clearTimeout(aiTimer);

    runAIPhase();

}


/* =========================================================
   TRADE NOW
========================================================= */

function showTradeNow() {

    const best =
        bestMarket();

    if (!best) return;


    const prediction =
        makePrediction(
            best,
            selectedStrategy
        );


    lastPrediction =
        prediction;


    lastSignal = {

        market: best.name,

        symbol: best.symbol,

        strategy:
            selectedStrategy,

        prediction:
            prediction.prediction,

        confidence:
            prediction.confidence,

        time:
            new Date().toLocaleTimeString()

    };


    setText(
        "aiCircleTimer",
        "GO"
    );


    setText(
        "aiCircleLabel",
        "TRADE NOW"
    );


    setText(
        "tradeStatus",
        "SIGNAL READY"
    );


    setText(
        "analysisMsg",
        `TRADE NOW: ${best.name} • ${selectedStrategy} • ${prediction.prediction}`
    );

}


/* =========================================================
   STOP AI
========================================================= */

function stopAI() {

    aiRunning = false;

    clearTimeout(aiTimer);

    aiPhase =
        "idle";


    setText(
        "aiCircleStatus",
        "AI STOPPED"
    );


    setText(
        "aiCircleTimer",
        "10"
    );


    setText(
        "aiCircleLabel",
        "ANALYSIS"
    );


    setText(
        "analysisMsg",
        "AI stopped. Start AI to begin a new 10 → 5 → 3 cycle."
    );

}


/* =========================================================
   RENDER MARKETS
========================================================= */

function renderMarkets() {

    const container =
        $("markets");

    if (!container) return;


    container.innerHTML = "";


    const sorted =
        markets
            .map(
                m =>
                    marketData[m.symbol]
            )
            .filter(Boolean)
            .sort(
                (a, b) =>
                    b.score - a.score
            );


    sorted.forEach(data => {

        const card =
            document.createElement("div");


        card.className =
            "market-card";


        card.innerHTML = `

            <div class="market-name">
                ${escapeHTML(data.name)}
            </div>

            <div class="market-symbol">
                ${escapeHTML(data.symbol)}
            </div>

            <div class="market-strength">
                ${data.strength}
            </div>

            <div class="market-score">
                ${data.score}
            </div>

        `;


        card.addEventListener(
            "click",
            () => selectMarket(data.symbol)
        );


        container.appendChild(card);

    });


    setText(
        "scannerCount",
        `${sorted.length} markets`
    );

}


/* =========================================================
   SELECT MARKET
========================================================= */

function selectMarket(symbol) {

    const data =
        marketData[symbol];

    if (!data) return;


    selectedMarket =
        symbol;


    setText(
        "analysisMarket",
        data.name
    );


    setText(
        "tradeStatus",
        "MARKET SELECTED"
    );


    setText(
        "analysisMsg",
        `${data.name} selected for AI analysis.`
    );


    updateLiveAI();

}


/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigits() {

    const container =
        $("digits");

    if (!container) return;


    let data =
        selectedMarket
            ? marketData[selectedMarket]
            : null;


    if (!data) {

        const best =
            bestMarket();

        if (best) {
            data = best;
        }

    }


    if (!data) {

        container.innerHTML =
            "<div>Waiting for ticks...</div>";

        return;
    }


    const counts =
        data.counts ||
        Array(10).fill(0);


    const max =
        Math.max(
            1,
            ...counts
        );


    container.innerHTML = "";


    counts.forEach(
        (count, digit) => {

            const item =
                document.createElement("div");


            item.className =
                "digit-item";


            const width =
                Math.round(
                    count / max * 100
                );


            item.innerHTML = `

                <span>${digit}</span>

                <div class="digit-bar">
                    <i style="width:${width}%"></i>
                </div>

                <b>${count}</b>

            `;


            container.appendChild(item);

        }
    );


    setText(
        "digitMarket",
        data.name
    );

}


/* =========================================================
   STRATEGY
========================================================= */

function setStrategy(strategy) {

    selectedStrategy =
        strategy;


    document
        .querySelectorAll(
            "[data-strategy]"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.strategy === strategy
            );

        });


    const manualRequired =
        [
            "MATCHES",
            "DIFFERS",
            "OVER",
            "UNDER"
        ].includes(strategy);


    const group =
        $("manualNumberGroup");


    if (group) {

        group.style.display =
            manualRequired
                ? ""
                : "none";

    }


    const title =
        $("manualTitle");

    if (title) {

        title.textContent =
            strategy === "MATCHES"
                ? "MATCH NUMBER"
                : strategy === "DIFFERS"
                    ? "DIFFER NUMBER"
                    : strategy === "OVER"
                        ? "OVER NUMBER"
                        : strategy === "UNDER"
                            ? "UNDER NUMBER"
                            : "";

    }


    setText(
        "analysisStrategy",
        strategy
    );


    updateLiveAI();

}


/* =========================================================
   NAVIGATION
========================================================= */

function showPage(page) {

    const pages = [
        "analysisPage",
        "tradePage",
        "historyPage"
    ];


    pages.forEach(id => {

        const el = $(id);

        if (!el) return;

        el.style.display =
            "none";

    });


    const selected =
        $(
            page === "analysis"
                ? "analysisPage"
                : page === "trade"
                    ? "tradePage"
                    : "historyPage"
        );


    if (selected) {

        selected.style.display =
            "";

    }


    document
        .querySelectorAll(
            ".bottom-nav [data-page]"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.page === page
            );

        });


    if (page === "history") {

        renderHistory();

    }


    if (page === "trade") {

        updateTradePanel();

    }

}


/* =========================================================
   TRADE PANEL
========================================================= */

function updateTradePanel() {

    const data =
        selectedMarket
            ? marketData[selectedMarket]
            : bestMarket();


    if (!data) return;


    const prediction =
        makePrediction(
            data,
            selectedStrategy
        );


    setText(
        "tradePrediction",
        prediction.prediction
    );


    setText(
        "tradeType",
        selectedStrategy
    );


    setText(
        "tradeConfidence",
        `${prediction.confidence}%`
    );


    setText(
        "symbol",
        data.symbol
    );

}


/* =========================================================
   PAPER TRADING
========================================================= */

function startTrading() {

    paperRunning = true;

    setText(
        "tradeStatus",
        "PAPER TRADING ACTIVE"
    );


    connectionMessage(
        "Paper trading started. No real Deriv trade is being placed."
    );

}


function stopTrading() {

    paperRunning = false;

    setText(
        "tradeStatus",
        "PAPER TRADING STOPPED"
    );

}


/* =========================================================
   HISTORY
========================================================= */

function getHistory() {

    try {

        return JSON.parse(
            localStorage.getItem(
                "krishwave_history"
            ) || "[]"
        );

    } catch (e) {

        return [];

    }

}


function saveHistory(item) {

    const history =
        getHistory();


    history.unshift(item);


    localStorage.setItem(
        "krishwave_history",
        JSON.stringify(
            history.slice(0, 200)
        )
    );

}


function renderHistory() {

    const list =
        $("historyList");

    if (!list) return;


    const history =
        getHistory();


    let wins = 0;
    let losses = 0;
    let pl = 0;


    list.innerHTML = "";


    if (!history.length) {

        list.innerHTML =
            "<div>No paper trades yet.</div>";

    }


    history.forEach(item => {

        if (item.result === "WIN") wins++;

        if (item.result === "LOSS") losses++;

        pl += safeNumber(item.pl);


        const row =
            document.createElement("div");


        row.className =
            "history-row";


        row.innerHTML = `

            <div>
                ${escapeHTML(item.time || "")}
            </div>

            <div>
                ${escapeHTML(item.market || "")}
            </div>

            <div>
                ${escapeHTML(item.strategy || "")}
            </div>

            <div>
                ${escapeHTML(
                    String(
                        item.number ?? "-"
                    )
                )}
            </div>

            <div>
                ${escapeHTML(item.result || "-")}
            </div>

            <div>
                ${safeNumber(item.pl).toFixed(2)}
            </div>

        `;


        list.appendChild(row);

    });


    const total =
        history.length;


    setText(
        "historyTotal",
        total
    );


    setText(
        "historyWins",
        wins
    );


    setText(
        "historyLosses",
        losses
    );


    setText(
        "historyWinRate",
        total
            ? `${Math.round(
                wins / total * 100
            )}%`
            : "0%"
    );


    setText(
        "historyPL",
        pl.toFixed(2)
    );

}


/* =========================================================
   CLEAR HISTORY
========================================================= */

function clearHistory() {

    if (
        !confirm(
            "Clear KRISHWAVE paper trading history?"
        )
    ) return;


    localStorage.removeItem(
        "krishwave_history"
    );


    renderHistory();

}


/* =========================================================
   ACCOUNT BUTTONS
========================================================= */

function setAccountMode(mode) {

    accountMode =
        mode;


    document
        .querySelectorAll(
            "[data-account]"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.account === mode
            );

        });


    /*
       Public market-data connection cannot
       access account balance.

       Authenticated Deriv connection is required
       for balance.
    */

    setText(
        "tradeStatus",
        `${mode} ACCOUNT SELECTED`
    );


    setText(
        "analysisMsg",
        `${mode} mode selected. Account balance requires Deriv authentication.`
    );


    setText(
        "connectionStatus",
        "ONLINE"
    );

}


/* =========================================================
   THEME
========================================================= */

function initTheme() {

    const saved =
        localStorage.getItem(
            "krishwave_theme"
        );


    if (saved === "light") {

        document.body.classList.add(
            "light"
        );

    }


    const button =
        $("themeToggle");


    if (button) {

        button.addEventListener(
            "click",
            () => {

                document.body.classList.toggle(
                    "light"
                );


                localStorage.setItem(
                    "krishwave_theme",
                    document.body.classList.contains(
                        "light"
                    )
                        ? "light"
                        : "dark"
                );

            }
        );

    }

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   EVENT SETUP
========================================================= */

function setupEvents() {


    /* AI */

    const start =
        $("startAI");

    if (start) {

        start.addEventListener(
            "click",
            startAI
        );

    }


    const stop =
        $("stopAI");

    if (stop) {

        stop.addEventListener(
            "click",
            stopAI
        );

    }


    /* Trading */

    const startTrade =
        $("startTrading");

    if (startTrade) {

        startTrade.addEventListener(
            "click",
            startTrading
        );

    }


    const stopTrade =
        $("stopTrading");

    if (stopTrade) {

        stopTrade.addEventListener(
            "click",
            stopTrading
        );

    }


    /* History */

    const clear =
        $("clearHistory");

    if (clear) {

        clear.addEventListener(
            "click",
            clearHistory
        );

    }


    /* Navigation */

    document
        .querySelectorAll(
            ".bottom-nav [data-page]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    showPage(
                        button.dataset.page
                    );

                }
            );

        });


    /* Strategies */

    document
        .querySelectorAll(
            "[data-strategy]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    setStrategy(
                        button.dataset.strategy
                    );

                }
            );

        });


    /* Account */

    const demo =
        $("demoBtn");

    if (demo) {

        demo.addEventListener(
            "click",
            () => setAccountMode("DEMO")
        );

    }


    const real =
        $("realBtn");

    if (real) {

        real.addEventListener(
            "click",
            () => setAccountMode("REAL")
        );

    }

}


/* =========================================================
   INITIAL STATE
========================================================= */

function initialiseUI() {

    showPage("analysis");

    setStrategy("MATCHES");

    setText(
        "aiCircleTimer",
        "10"
    );

    setText(
        "aiCircleLabel",
        "ANALYSIS"
    );

    setText(
        "aiCircleStatus",
        "AI STOPPED"
    );

    setText(
        "connectionStatus",
        "CONNECTING..."
    );

    setText(
        "scannerCount",
        "0 markets"
    );

    setText(
        "digitMarket",
        "—"
    );

    setText(
        "tradeStatus",
        "PAPER TRADING STOPPED"
    );

    initTheme();

    setupEvents();

    renderHistory();

}


/* =========================================================
   START ENGINE
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initialiseUI();

        /*
           Give the browser a moment to finish
           loading the page before opening WS.
        */

        setTimeout(
            connect,
            300
        );

    }
);