/* =========================================================
   KRISHWAVE V5.6
   LIVE DERIV MARKET INTELLIGENCE

   AI CYCLE

   10 seconds = ANALYSIS
        ↓
   prediction LOCKED
        ↓
   5 seconds = ENTRY WINDOW
        ↓
   TRADE NOW
        ↓
   3 seconds = TRADE NOW DISPLAY
        ↓
   new 10 seconds = ANALYSIS

   PAPER TRADING ONLY
========================================================= */

"use strict";


/* =========================================================
   DERIV CONNECTION
========================================================= */

const DERIV_WS =
    "wss://ws.binaryws.com/websockets/v3";

let ws = null;

let reconnectTimer = null;

let reqId = 1;


/* =========================================================
   MARKET STATE
========================================================= */

const markets = {};

let marketList = [];

const MAX_MARKETS = 13;

const HISTORY_COUNT = 100;

let selectedSymbol = "";

let selectedStrategy = "MATCHES";


/* =========================================================
   AI STATE
========================================================= */

let aiRunning = false;

let aiPhase = "IDLE";

let aiRemaining = 10;

let aiTimer = null;

let lockedSignal = null;


/* =========================================================
   PAPER STATE
========================================================= */

let paperTrading = false;

let accountMode = "DEMO";


/* =========================================================
   HELPERS
========================================================= */

function $(id) {
    return document.getElementById(id);
}


function setText(id, value) {

    const el = $(id);

    if (el) {
        el.textContent = value;
    }
}


function escapeHTML(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function clamp(value, min, max) {

    return Math.max(
        min,
        Math.min(max, value)
    );

}


/* =========================================================
   CONNECTION
========================================================= */

function connectDeriv() {

    clearTimeout(reconnectTimer);

    setConnection(
        "CONNECTING...",
        false
    );

    try {

        ws = new WebSocket(
            DERIV_WS
        );

    } catch (error) {

        console.error(error);

        reconnectDeriv();

        return;
    }


    ws.onopen = () => {

        console.log(
            "KRISHWAVE connected to Deriv"
        );

        setConnection(
            "ONLINE",
            true
        );

        setText(
            "analysisMsg",
            "Connected to Deriv. Loading Volatility markets..."
        );


        requestActiveSymbols();

    };


    ws.onmessage = event => {

        let data;

        try {

            data =
                JSON.parse(
                    event.data
                );

        } catch (error) {

            console.warn(
                "Invalid WebSocket message"
            );

            return;
        }


        handleMessage(data);

    };


    ws.onerror = error => {

        console.warn(
            "Deriv WebSocket error",
            error
        );

        setConnection(
            "ERROR",
            false
        );

    };


    ws.onclose = () => {

        setConnection(
            "RECONNECTING...",
            false
        );

        setText(
            "analysisMsg",
            "Deriv connection closed. Reconnecting..."
        );

        reconnectDeriv();

    };

}


function reconnectDeriv() {

    clearTimeout(
        reconnectTimer
    );

    reconnectTimer =
        setTimeout(
            connectDeriv,
            3000
        );

}


/* =========================================================
   CONNECTION UI
========================================================= */

function setConnection(
    text,
    online
) {

    setText(
        "connectionStatus",
        text
    );


    const dot =
        $("statusDot");


    if (dot) {

        dot.classList.toggle(
            "online",
            online
        );

        dot.classList.toggle(
            "offline",
            !online
        );

    }

}


/* =========================================================
   SEND
========================================================= */

function send(payload) {

    if (
        !ws ||
        ws.readyState !== WebSocket.OPEN
    ) {

        return false;

    }


    payload.req_id =
        reqId++;


    try {

        ws.send(
            JSON.stringify(
                payload
            )
        );

        return true;

    } catch (error) {

        console.error(
            error
        );

        return false;
    }

}


/* =========================================================
   ACTIVE SYMBOLS
========================================================= */

function requestActiveSymbols() {

    send({
        active_symbols: "brief",
        product_type: "basic"
    });

}


/* =========================================================
   HANDLE MESSAGE
========================================================= */

function handleMessage(data) {

    if (data.error) {

        console.warn(
            "Deriv error:",
            data.error
        );

        setText(
            "analysisMsg",
            "Deriv: " +
            (
                data.error.message ||
                "API error"
            )
        );

        return;
    }


    if (
        data.msg_type ===
        "active_symbols"
    ) {

        processActiveSymbols(
            data.active_symbols || []
        );

        return;
    }


    if (
        data.msg_type ===
        "history"
    ) {

        processHistory(
            data
        );

        return;
    }


    if (
        data.msg_type ===
        "tick"
    ) {

        processTick(
            data.tick
        );

        return;
    }

}


/* =========================================================
   PROCESS ACTIVE SYMBOLS
========================================================= */

function processActiveSymbols(
    symbols
) {

    console.log(
        "Active symbols:",
        symbols.length
    );


    const found = [];


    symbols.forEach(item => {

        const symbol =
            item.symbol ||
            item.underlying_symbol;


        const name =
            item.display_name ||
            item.underlying_symbol_name ||
            symbol;


        if (!symbol) {
            return;
        }


        const text =
            (
                symbol +
                " " +
                name
            ).toLowerCase();


        const isVolatility =
            text.includes(
                "volatility"
            ) ||
            /^1hz\d+v$/i.test(
                symbol
            ) ||
            /^r_\d+$/i.test(
                symbol
            );


        if (!isVolatility) {
            return;
        }


        if (
            found.some(
                x =>
                    x.symbol ===
                    symbol
            )
        ) {
            return;
        }


        found.push({
            symbol,
            name
        });

    });


    /*
       Prefer the well-known
       Volatility markets.
    */

    found.sort(
        (a, b) => {

            const aNum =
                parseInt(
                    a.symbol
                        .replace(/\D/g, "")
                ) || 0;

            const bNum =
                parseInt(
                    b.symbol
                        .replace(/\D/g, "")
                ) || 0;

            return aNum - bNum;

        }
    );


    marketList =
        found.slice(
            0,
            MAX_MARKETS
        );


    /*
       Safety fallback if filtering
       produces no results.
    */

    if (
        marketList.length === 0
    ) {

        marketList = [

            {
                symbol: "1HZ10V",
                name: "Volatility 10 Index"
            },

            {
                symbol: "1HZ25V",
                name: "Volatility 25 Index"
            },

            {
                symbol: "1HZ50V",
                name: "Volatility 50 Index"
            },

            {
                symbol: "1HZ75V",
                name: "Volatility 75 Index"
            },

            {
                symbol: "1HZ100V",
                name: "Volatility 100 Index"
            },

            {
                symbol: "1HZ150V",
                name: "Volatility 150 Index"
            },

            {
                symbol: "1HZ200V",
                name: "Volatility 200 Index"
            }

        ];

    }


    marketList.forEach(
        setupMarket
    );


    renderMarkets();

    updateMarketSelect();

    updateBestMarket();


    setText(
        "scannerCount",
        `${marketList.length} markets`
    );


    setText(
        "analysisMsg",
        `${marketList.length} Volatility markets connected. Waiting for ticks...`
    );

}


/* =========================================================
   SETUP MARKET
========================================================= */

function setupMarket(
    market
) {

    if (
        !markets[
            market.symbol
        ]
    ) {

        markets[
            market.symbol
        ] = {

            symbol:
                market.symbol,

            name:
                market.name,

            prices: [],

            digits: [],

            counts:
                Array(10).fill(0),

            score: 0,

            strength:
                "WAITING",

            lastQuote:
                null,

            lastEpoch:
                null

        };

    }


    /*
       Historical data
    */

    send({

        ticks_history:
            market.symbol,

        count:
            HISTORY_COUNT,

        end:
            "latest",

        style:
            "ticks",

        subscribe:
            0

    });


    /*
       Live ticks
    */

    send({

        ticks:
            market.symbol,

        subscribe:
            1

    });

}


/* =========================================================
   PROCESS HISTORY
========================================================= */

function processHistory(
    response
) {

    const history =
        response.history;


    if (
        !history ||
        !history.prices ||
        !history.prices.length
    ) {

        return;

    }


    /*
       The legacy API normally returns
       echo_req, so identify the symbol.
    */

    const symbol =
        response.echo_req &&
        response.echo_req.ticks_history;


    if (!symbol) {

        return;

    }


    const data =
        markets[symbol];


    if (!data) {

        return;

    }


    data.prices =
        history.prices
            .map(Number)
            .filter(
                Number.isFinite
            );


    data.digits =
        data.prices.map(
            extractDigit
        );


    data.counts =
        countDigits(
            data.digits
        );


    calculateMarket(
        data
    );


    renderMarkets();

    renderDigits();

    updateBestMarket();

}


/* =========================================================
   PROCESS TICK
========================================================= */

function processTick(
    tick
) {

    if (!tick) {
        return;
    }


    const symbol =
        tick.symbol;


    if (
        !symbol ||
        !markets[symbol]
    ) {

        return;

    }


    const quote =
        Number(
            tick.quote
        );


    if (
        !Number.isFinite(
            quote
        )
    ) {

        return;

    }


    const data =
        markets[symbol];


    data.lastQuote =
        quote;


    data.lastEpoch =
        tick.epoch ||
        Date.now() / 1000;


    data.prices.push(
        quote
    );


    data.digits.push(
        extractDigit(
            quote
        )
    );


    /*
       Keep enough recent data
       for statistics.
    */

    if (
        data.prices.length >
        150
    ) {

        data.prices.shift();

    }


    if (
        data.digits.length >
        150
    ) {

        data.digits.shift();

    }


    data.counts =
        countDigits(
            data.digits
        );


    calculateMarket(
        data
    );


    renderMarkets();

    renderDigits();

    updateBestMarket();


    /*
       During the 10-second
       analysis period only,
       the signal can update.

       Once the 5-second lock
       starts, this function
       NEVER changes lockedSignal.
    */

    if (
        aiRunning &&
        aiPhase === "ANALYSIS"
    ) {

        updateLiveAnalysis();

    }

}


/* =========================================================
   DIGIT
========================================================= */

function extractDigit(
    value
) {

    const text =
        String(value);


    const clean =
        text.replace(
            /[^0-9]/g,
            ""
        );


    if (!clean) {
        return 0;
    }


    return Number(
        clean[
            clean.length - 1
        ]
    );

}


/* =========================================================
   COUNT DIGITS
========================================================= */

function countDigits(
    digits
) {

    const counts =
        Array(10).fill(0);


    digits.forEach(
        digit => {

            if (
                digit >= 0 &&
                digit <= 9
            ) {

                counts[digit]++;

            }

        }
    );


    return counts;

}


/* =========================================================
   MARKET STATISTICS
========================================================= */

function calculateMarket(
    data
) {

    const digits =
        data.digits;


    if (
        digits.length < 10
    ) {

        data.score = 0;

        data.strength =
            "WAITING";

        return;

    }


    const total =
        digits.length;


    const counts =
        data.counts;


    let strongest =
        0;


    for (
        let i = 1;
        i < 10;
        i++
    ) {

        if (
            counts[i] >
            counts[strongest]
        ) {

            strongest = i;

        }

    }


    const concentration =
        counts[strongest] /
        total;


    /*
       Recent movement
    */

    let changes = 0;


    for (
        let i = 1;
        i < data.prices.length;
        i++
    ) {

        if (
            data.prices[i] !==
            data.prices[i - 1]
        ) {

            changes++;

        }

    }


    const movement =
        data.prices.length > 1
            ? changes /
              (
                  data.prices.length -
                  1
              )
            : 0;


    /*
       Recency weighting
    */

    const recent =
        digits.slice(
            -30
        );


    const recentCounts =
        countDigits(
            recent
        );


    let recentStrong =
        0;


    for (
        let i = 1;
        i < 10;
        i++
    ) {

        if (
            recentCounts[i] >
            recentCounts[recentStrong]
        ) {

            recentStrong = i;

        }

    }


    const recentRate =
        recent.length
            ? recentCounts[
                recentStrong
            ] /
            recent.length
            : 0;


    const score =
        clamp(
            Math.round(
                concentration * 35 +
                recentRate * 45 +
                movement * 20
            ),
            0,
            99
        );


    data.score =
        score;


    if (score >= 70) {

        data.strength =
            "STRONG";

    } else if (
        score >= 50
    ) {

        data.strength =
            "MEDIUM";

    } else {

        data.strength =
            "WEAK";

    }


    data.dominant =
        recentStrong;

}


/* =========================================================
   BEST MARKET
========================================================= */

function getBestMarket() {

    const available =
        marketList
            .map(
                market =>
                    markets[
                        market.symbol
                    ]
            )
            .filter(
                data =>
                    data &&
                    data.digits.length >= 10
            );


    if (
        !available.length
    ) {

        return null;

    }


    available.sort(
        (a, b) =>
            b.score -
            a.score
    );


    return available[0];

}


function updateBestMarket() {

    const best =
        getBestMarket();


    if (!best) {

        return;

    }


    if (!selectedSymbol) {

        selectedSymbol =
            best.symbol;

    }


    if (
        !aiRunning ||
        aiPhase === "ANALYSIS"
    ) {

        updateLiveAnalysis();

    }

}


/* =========================================================
   PREDICTION
========================================================= */

function createPrediction(
    data,
    strategy
) {

    if (
        !data ||
        data.digits.length < 10
    ) {

        return {

            number: "—",

            confidence: 0,

            reason:
                "Waiting for more live ticks."

        };

    }


    const digits =
        data.digits;


    const counts =
        data.counts;


    let strongest =
        0;


    for (
        let i = 1;
        i < 10;
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


    let number =
        strongest;


    let confidence =
        50;


    if (
        strategy ===
        "MATCHES"
    ) {

        confidence =
            (
                counts[strongest] /
                total
            ) * 100;

    }


    if (
        strategy ===
        "DIFFERS"
    ) {

        confidence =
            100 -
            (
                counts[strongest] /
                total
            ) * 100;

    }


    if (
        strategy ===
        "OVER"
    ) {

        const over =
            digits.filter(
                d => d > 4
            ).length;


        confidence =
            (
                over /
                total
            ) * 100;

    }


    if (
        strategy ===
        "UNDER"
    ) {

        const under =
            digits.filter(
                d => d < 5
            ).length;


        confidence =
            (
                under /
                total
            ) * 100;

    }


    if (
        strategy ===
        "EVEN"
    ) {

        number =
            "EVEN";


        const even =
            digits.filter(
                d =>
                    d % 2 === 0
            ).length;


        confidence =
            (
                even /
                total
            ) * 100;

    }


    if (
        strategy ===
        "ODD"
    ) {

        number =
            "ODD";


        const odd =
            digits.filter(
                d =>
                    d % 2 !== 0
            ).length;


        confidence =
            (
                odd /
                total
            ) * 100;

    }


    confidence =
        clamp(
            Math.round(
                confidence
            ),
            1,
            99
        );


    return {

        number,

        confidence,

        reason:
            `${data.name} has ` +
            `${total} recent ticks. ` +
            `Dominant digit: ` +
            `${strongest}. ` +
            `Statistical strength: ` +
            `${data.strength}.`

    };

}


/* =========================================================
   LIVE ANALYSIS
========================================================= */

function updateLiveAnalysis() {

    if (
        aiPhase !== "ANALYSIS"
    ) {

        return;

    }


    const best =
        getBestMarket();


    if (!best) {

        setText(
            "aiMarket",
            "Waiting for ticks"
        );

        setText(
            "analysisMsg",
            "Waiting for enough live tick data..."
        );

        return;

    }


    selectedSymbol =
        best.symbol;


    const prediction =
        createPrediction(
            best,
            selectedStrategy
        );


    /*
       This is LIVE analysis.

       It is allowed to change
       during the 10 seconds.
    */

    setText(
        "aiMarket",
        best.name
    );

    setText(
        "aiMarketSignal",
        best.name
    );

    setText(
        "aiType",
        selectedStrategy
    );

    setText(
        "aiPrediction",
        prediction.number
    );

    setText(
        "aiConfidence",
        `${prediction.confidence}%`
    );

    setText(
        "analysisPrediction",
        prediction.number
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
        "reason",
        prediction.reason
    );

    setText(
        "aiScore",
        best.score
    );


    setText(
        "liveSignal",
        "ANALYSING"
    );


    setText(
        "analysisMsg",
        `Analysing ${best.name}. Prediction will lock when the 10 seconds ends.`
    );


    updateTradePage();

}


/* =========================================================
   LOCK PREDICTION
========================================================= */

function lockPrediction() {

    const best =
        getBestMarket();


    if (!best) {

        return false;

    }


    const prediction =
        createPrediction(
            best,
            selectedStrategy
        );


    /*
       IMPORTANT:

       This object is frozen in the
       AI cycle until TRADE NOW
       finishes.

       Live ticks cannot change it.
    */

    lockedSignal = {

        symbol:
            best.symbol,

        market:
            best.name,

        strategy:
            selectedStrategy,

        number:
            prediction.number,

        confidence:
            prediction.confidence,

        reason:
            prediction.reason,

        createdAt:
            Date.now()

    };


    setText(
        "aiMarket",
        lockedSignal.market
    );

    setText(
        "aiMarketSignal",
        lockedSignal.market
    );

    setText(
        "aiType",
        lockedSignal.strategy
    );

    setText(
        "aiPrediction",
        lockedSignal.number
    );

    setText(
        "aiConfidence",
        `${lockedSignal.confidence}%`
    );

    setText(
        "analysisPrediction",
        lockedSignal.number
    );

    setText(
        "analysisConfidenceBox",
        `${lockedSignal.confidence}%`
    );

    setText(
        "analysisMarket",
        lockedSignal.market
    );

    setText(
        "analysisStrategy",
        lockedSignal.strategy
    );

    setText(
        "reason",
        lockedSignal.reason
    );

    setText(
        "aiScore",
        best.score
    );


    setText(
        "liveSignal",
        "PREDICTION LOCKED"
    );


    updateTradePage();


    return true;

}


/* =========================================================
   AI PHASE DISPLAY
========================================================= */

function setAIPhase(
    phase,
    seconds
) {

    aiPhase =
        phase;


    aiRemaining =
        seconds;


    setText(
        "aiCircleTimer",
        seconds
    );


    const label =
        $("aiCircleLabel");


    if (label) {

        if (
            phase ===
            "ANALYSIS"
        ) {

            label.textContent =
                "ANALYSIS";

        } else if (
            phase ===
            "ENTRY"
        ) {

            label.textContent =
                "ENTRY";

        } else if (
            phase ===
            "TRADE"
        ) {

            label.textContent =
                "TRADE NOW";

        }

    }


    setText(
        "aiCircleStatus",
        aiRunning
            ? "AI RUNNING"
            : "AI STOPPED"
    );


    /*
       During ENTRY the number
       remains the locked number.
    */

    if (
        phase ===
        "ENTRY" &&
        lockedSignal
    ) {

        setText(
            "aiPrediction",
            lockedSignal.number
        );

        setText(
            "analysisPrediction",
            lockedSignal.number
        );

    }

}


/* =========================================================
   AI TICK
========================================================= */

function aiTick() {

    if (!aiRunning) {

        return;

    }


    /*
       ANALYSIS
       10 -> 9 -> 8 ... -> 1
    */

    if (
        aiPhase ===
        "ANALYSIS"
    ) {

        if (
            aiRemaining > 1
        ) {

            aiRemaining--;

            setText(
                "aiCircleTimer",
                aiRemaining
            );


            aiTimer =
                setTimeout(
                    aiTick,
                    1000
                );


            return;

        }


        /*
           EXACTLY at the end
           of the 10th second:

           freeze prediction
           and begin 5-second entry.
        */

        const locked =
            lockPrediction();


        if (!locked) {

            setText(
                "aiCircleTimer",
                "10"
            );


            aiTimer =
                setTimeout(
                    aiTick,
                    1000
                );


            return;

        }


        setAIPhase(
            "ENTRY",
            5
        );


        aiTimer =
            setTimeout(
                aiTick,
                1000
            );


        return;

    }


    /*
       ENTRY
       5 -> 4 -> 3 -> 2 -> 1
    */

    if (
        aiPhase ===
        "ENTRY"
    ) {

        if (
            aiRemaining > 1
        ) {

            aiRemaining--;

            setText(
                "aiCircleTimer",
                aiRemaining
            );


            setText(
                "analysisMsg",
                `ENTRY WINDOW: ${aiRemaining}s remaining. Prediction locked at ${lockedSignal.number}.`
            );


            aiTimer =
                setTimeout(
                    aiTick,
                    1000
                );


            return;

        }


        /*
           Exactly after 5 seconds:

           TRADE NOW
        */

        triggerTradeNow();


        setAIPhase(
            "TRADE",
            3
        );


        aiTimer =
            setTimeout(
                aiTick,
                1000
            );


        return;

    }


    /*
       TRADE NOW
       3 -> 2 -> 1
    */

    if (
        aiPhase ===
        "TRADE"
    ) {

        if (
            aiRemaining > 1
        ) {

            aiRemaining--;

            setText(
                "aiCircleTimer",
                aiRemaining
            );


            setText(
                "analysisMsg",
                `TRADE NOW • ${aiRemaining}s`
            );


            aiTimer =
                setTimeout(
                    aiTick,
                    1000
                );


            return;

        }


        /*
           Exactly after 3 seconds:

           START NEW 10 SECOND ANALYSIS
        */

        lockedSignal =
            null;


        setAIPhase(
            "ANALYSIS",
            10
        );


        setText(
            "liveSignal",
            "ANALYSING"
        );


        setText(
            "analysisMsg",
            "New 10-second market analysis started."
        );


        updateLiveAnalysis();


        aiTimer =
            setTimeout(
                aiTick,
                1000
            );

    }

}


/* =========================================================
   START AI
========================================================= */

function startAI() {

    if (aiRunning) {

        return;

    }


    if (
        !getBestMarket()
    ) {

        setText(
            "analysisMsg",
            "AI cannot start yet. Waiting for live ticks..."
        );

        return;

    }


    aiRunning =
        true;


    lockedSignal =
        null;


    clearTimeout(
        aiTimer
    );


    setAIPhase(
        "ANALYSIS",
        10
    );


    setText(
        "analysisMsg",
        "KRISH AI started. Analysing market for 10 seconds..."
    );


    updateLiveAnalysis();


    /*
       The first second begins now.
    */

    aiTimer =
        setTimeout(
            aiTick,
            1000
        );

}


/* =========================================================
   STOP AI
========================================================= */

function stopAI() {

    aiRunning =
        false;


    clearTimeout(
        aiTimer
    );


    aiTimer =
        null;


    aiPhase =
        "IDLE";


    lockedSignal =
        null;


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
        "liveSignal",
        "STOPPED"
    );


    setText(
        "analysisMsg",
        "AI stopped. Press START AI to begin a new 10-second analysis."
    );

}


/* =========================================================
   TRADE NOW
========================================================= */

function triggerTradeNow() {

    if (!lockedSignal) {

        return;

    }


    setText(
        "aiCircleTimer",
        "GO"
    );


    setText(
        "aiCircleLabel",
        "TRADE NOW"
    );


    setText(
        "aiCircleStatus",
        "SIGNAL ACTIVE"
    );


    setText(
        "liveSignal",
        "TRADE NOW"
    );


    setText(
        "analysisMsg",
        `TRADE NOW • ${lockedSignal.market} • ${lockedSignal.strategy} • ${lockedSignal.number}`
    );


    /*
       Update Trade page with
       the frozen signal.
    */

    updateTradePage();


    /*
       Save a paper signal so
       History is never empty
       once AI produces signals.
    */

    savePaperSignal(
        lockedSignal
    );


    renderHistory();

}


/* =========================================================
   MARKET SELECT
========================================================= */

function selectMarket(
    symbol
) {

    if (
        !markets[symbol]
    ) {

        return;

    }


    selectedSymbol =
        symbol;


    const data =
        markets[symbol];


    setText(
        "digitMarket",
        data.name
    );


    updateTradePage();

    renderDigits();

}


/* =========================================================
   RENDER MARKETS
========================================================= */

function renderMarkets() {

    const container =
        $("markets");


    if (!container) {
        return;
    }


    const list =
        marketList
            .map(
                market =>
                    markets[
                        market.symbol
                    ]
            )
            .filter(Boolean)
            .sort(
                (a, b) =>
                    b.score -
                    a.score
            );


    if (!list.length) {

        container.innerHTML =
            `<div class="empty-state">
                Waiting for live markets...
             </div>`;

        return;

    }


    container.innerHTML =
        "";


    list.forEach(
        data => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "market-card";


            if (
                data.symbol ===
                selectedSymbol
            ) {

                card.style.borderColor =
                    "var(--blue)";

            }


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


            card.onclick =
                () => {

                    selectMarket(
                        data.symbol
                    );

                    renderMarkets();

                };


            container.appendChild(
                card
            );

        }
    );


    setText(
        "scannerCount",
        `${list.length} markets`
    );

}


/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigits() {

    const container =
        $("digits");


    if (!container) {
        return;
    }


    let data =
        markets[
            selectedSymbol
        ];


    if (!data) {

        data =
            getBestMarket();

    }


    if (!data) {

        container.innerHTML =
            `<div class="empty-state">
                Waiting for ticks...
             </div>`;

        return;

    }


    setText(
        "digitMarket",
        data.name
    );


    container.innerHTML =
        "";


    const max =
        Math.max(
            1,
            ...data.counts
        );


    data.counts.forEach(
        (count, digit) => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "digit-item";


            const width =
                Math.round(
                    (
                        count /
                        max
                    ) *
                    100
                );


            row.innerHTML = `

                <span>
                    ${digit}
                </span>

                <div class="digit-bar">
                    <i style="width:${width}%"></i>
                </div>

                <b>
                    ${count}
                </b>

            `;


            container.appendChild(
                row
            );

        }
    );

}


/* =========================================================
   TRADE SELECT
========================================================= */

function updateMarketSelect() {

    const select =
        $("symbol");


    if (!select) {
        return;
    }


    select.innerHTML =
        "";


    marketList.forEach(
        market => {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                market.symbol;


            option.textContent =
                market.name;


            if (
                market.symbol ===
                selectedSymbol
            ) {

                option.selected =
                    true;

            }


            select.appendChild(
                option
            );

        }
    );

}


function updateTradePage() {

    const data =
        lockedSignal
            ? markets[
                lockedSignal.symbol
              ]
            : markets[
                selectedSymbol
              ] ||
              getBestMarket();


    if (!data) {
        return;
    }


    const strategy =
        lockedSignal
            ? lockedSignal.strategy
            : selectedStrategy;


    const prediction =
        lockedSignal
            ? lockedSignal
            : createPrediction(
                data,
                strategy
            );


    setText(
        "tradePrediction",
        prediction.number
    );


    setText(
        "tradeType",
        strategy
    );


    setText(
        "tradeConfidence",
        `${prediction.confidence}%`
    );


    const select =
        $("symbol");


    if (
        select &&
        data.symbol
    ) {

        select.value =
            data.symbol;

    }


    const strategySelect =
        $("tradeStrategy");


    if (strategySelect) {

        strategySelect.value =
            strategy;

    }

}


/* =========================================================
   STRATEGY
========================================================= */

function setStrategy(
    strategy
) {

    selectedStrategy =
        strategy;


    document
        .querySelectorAll(
            "[data-strategy]"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.strategy ===
                    strategy
                );

            }
        );


    const manualGroup =
        $("manualNumberGroup");


    if (manualGroup) {

        const requiresNumber =
            [
                "MATCHES",
                "DIFFERS",
                "OVER",
                "UNDER"
            ].includes(
                strategy
            );


        manualGroup.style.display =
            requiresNumber
                ? ""
                : "none";

    }


    const title =
        $("manualTitle");


    if (title) {

        const titles = {

            MATCHES:
                "MATCH NUMBER",

            DIFFERS:
                "DIFFER NUMBER",

            OVER:
                "OVER NUMBER",

            UNDER:
                "UNDER NUMBER"

        };


        title.textContent =
            titles[strategy] ||
            "MANUAL NUMBER";

    }


    /*
       IMPORTANT:

       We deliberately DO NOT
       modify #number.

       The user enters it manually.
    */


    if (
        aiRunning &&
        aiPhase ===
        "ANALYSIS"
    ) {

        updateLiveAnalysis();

    }


    updateTradePage();

}


/* =========================================================
   PAPER TRADING
========================================================= */

function startTrading() {

    paperTrading =
        true;


    setText(
        "tradeStatus",
        "PAPER TRADING ACTIVE"
    );


    setText(
        "analysisMsg",
        "Paper trading is active. No real Deriv trade is being placed."
    );

}


function stopTrading() {

    paperTrading =
        false;


    setText(
        "tradeStatus",
        "PAPER TRADING STOPPED"
    );

}


/* =========================================================
   HISTORY STORAGE
========================================================= */

function getHistory() {

    try {

        return JSON.parse(
            localStorage.getItem(
                "KRISHWAVE_HISTORY"
            ) ||
            "[]"
        );

    } catch (
        error
    ) {

        return [];

    }

}


function savePaperSignal(
    signal
) {

    const history =
        getHistory();


    const duplicate =
        history.some(
            item =>
                item.signalTime ===
                signal.createdAt
        );


    if (duplicate) {
        return;
    }


    history.unshift({

        signalTime:
            signal.createdAt,

        time:
            new Date(
                signal.createdAt
            ).toLocaleTimeString(),

        market:
            signal.market,

        symbol:
            signal.symbol,

        strategy:
            signal.strategy,

        number:
            signal.number,

        confidence:
            signal.confidence,

        result:
            "SIGNAL",

        pl:
            0

    });


    localStorage.setItem(
        "KRISHWAVE_HISTORY",
        JSON.stringify(
            history.slice(
                0,
                200
            )
        )
    );


    updateStats();

}


function renderHistory() {

    const list =
        $("historyList");


    if (!list) {
        return;
    }


    const history =
        getHistory();


    if (!history.length) {

        list.innerHTML =
            `<div class="empty-state">
                No AI signals yet.
                Start AI and wait for TRADE NOW.
             </div>`;

        updateStats();

        return;

    }


    list.innerHTML =
        "";


    history.forEach(
        item => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "history-row";


            row.innerHTML = `

                <div>
                    ${escapeHTML(item.time)}
                </div>

                <div>
                    ${escapeHTML(item.market)}
                </div>

                <div>
                    ${escapeHTML(item.strategy)}
                </div>

                <div>
                    ${escapeHTML(
                        String(
                            item.number
                        )
                    )}
                </div>

                <div>
                    ${escapeHTML(item.result)}
                </div>

                <div>
                    ${Number(
                        item.pl || 0
                    ).toFixed(2)}
                </div>

            `;


            list.appendChild(
                row
            );

        }
    );


    updateStats();

}


function updateStats() {

    const history =
        getHistory();


    const total =
        history.length;


    const wins =
        history.filter(
            item =>
                item.result ===
                "WIN"
        ).length;


    const losses =
        history.filter(
            item =>
                item.result ===
                "LOSS"
        ).length;


    const pl =
        history.reduce(
            (
                sum,
                item
            ) =>
                sum +
                Number(
                    item.pl || 0
                ),
            0
        );


    const winRate =
        total
            ? Math.round(
                (
                    wins /
                    total
                ) *
                100
            )
            : 0;


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
        `${winRate}%`
    );


    setText(
        "historyPL",
        pl.toFixed(2)
    );


    setText(
        "tradeTotal",
        total
    );


    setText(
        "tradeWins",
        wins
    );


    setText(
        "tradeLosses",
        losses
    );


    setText(
        "tradeWinRate",
        `${winRate}%`
    );


    setText(
        "tradePL",
        pl.toFixed(2)
    );

}


/* =========================================================
   CLEAR HISTORY
========================================================= */

function clearHistory() {

    if (
        !confirm(
            "Clear all KRISHWAVE history?"
        )
    ) {

        return;

    }


    localStorage.removeItem(
        "KRISHWAVE_HISTORY"
    );


    renderHistory();

}


/* =========================================================
   NAVIGATION
========================================================= */

function showPage(
    page
) {

    const pages = {

        analysis:
            $("analysisPage"),

        trade:
            $("tradePage"),

        history:
            $("historyPage")

    };


    Object.values(
        pages
    ).forEach(
        element => {

            if (element) {

                element.style.display =
                    "none";

            }

        }
    );


    if (
        pages[page]
    ) {

        pages[page].style.display =
            "";

    }


    document
        .querySelectorAll(
            ".bottom-nav [data-page]"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.page ===
                    page
                );

            }
        );


    if (
        page ===
        "trade"
    ) {

        updateTradePage();

        updateStats();

    }


    if (
        page ===
        "history"
    ) {

        renderHistory();

    }

}


/* =========================================================
   ACCOUNT BUTTONS
========================================================= */

function setAccountMode(
    mode
) {

    accountMode =
        mode;


    document
        .querySelectorAll(
            ".account-btn"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    (
                        mode ===
                        "DEMO" &&
                        button.id ===
                        "demoBtn"
                    ) ||
                    (
                        mode ===
                        "REAL" &&
                        button.id ===
                        "realBtn"
                    )
                );

            }
        );


    setText(
        "accountMode",
        mode
    );


    /*
       Public Deriv connection
       cannot read account balance.

       Keep the balance field
       safe until authenticated
       account connection is added.
    */

    setText(
        "optionsBalance",
        "—"
    );


    setText(
        "analysisMsg",
        `${mode} selected. Account balance connection requires authenticated Deriv access.`
    );

}


/* =========================================================
   THEME
========================================================= */

function initTheme() {

    const saved =
        localStorage.getItem(
            "KRISHWAVE_THEME"
        );


    if (
        saved ===
        "light"
    ) {

        document.body.classList.add(
            "light"
        );

    }


    const button =
        $("themeToggle");


    if (!button) {
        return;
    }


    button.onclick =
        () => {

            document.body.classList.toggle(
                "light"
            );


            localStorage.setItem(
                "KRISHWAVE_THEME",
                document.body.classList.contains(
                    "light"
                )
                    ? "light"
                    : "dark"
            );

        };

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

    /*
       AI
    */

    $("startAI").onclick =
        startAI;


    $("stopAI").onclick =
        stopAI;


    /*
       Trading
    */

    $("startTrading").onclick =
        startTrading;


    $("stopTrading").onclick =
        stopTrading;


    /*
       History
    */

    $("clearHistory").onclick =
        clearHistory;


    /*
       Bottom navigation
    */

    document
        .querySelectorAll(
            ".bottom-nav [data-page]"
        )
        .forEach(
            button => {

                button.onclick =
                    () => {

                        showPage(
                            button.dataset.page
                        );

                    };

            }
        );


    /*
       Strategy buttons
    */

    document
        .querySelectorAll(
            "[data-strategy]"
        )
        .forEach(
            button => {

                button.onclick =
                    () => {

                        setStrategy(
                            button.dataset.strategy
                        );

                    };

            }
        );


    /*
       Trade market
    */

    $("symbol").onchange =
        event => {

            selectMarket(
                event.target.value
            );

            renderMarkets();

        };


    /*
       Trade strategy
    */

    $("tradeStrategy").onchange =
        event => {

            setStrategy(
                event.target.value
            );

        };


    /*
       Account
    */

    $("demoBtn").onclick =
        () => {

            setAccountMode(
                "DEMO"
            );

        };


    $("realBtn").onclick =
        () => {

            setAccountMode(
                "REAL"
            );

        };

}


/* =========================================================
   INITIALISE
========================================================= */

function initialise() {

    /*
       Start on Analysis.
    */

    showPage(
        "analysis"
    );


    /*
       Initial strategy.
    */

    setStrategy(
        "MATCHES"
    );


    /*
       Initial values.
    */

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
        "liveSignal",
        "WAITING"
    );


    setText(
        "optionsBalance",
        "—"
    );


    setText(
        "accountMode",
        "DEMO"
    );


    setText(
        "scannerCount",
        "0 markets"
    );


    updateStats();

    renderHistory();

    initTheme();

    setupEvents();


    /*
       Connect to Deriv.
    */

    connectDeriv();

}


/* =========================================================
   START
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initialise
);