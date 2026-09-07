/* =========================================================
   KRISHWAVE V5.0
   AI MARKET ANALYSIS + TRADE + HISTORY ENGINE

   FEATURES
   ---------------------------------------------------------
   • 13 Volatility Indices
   • Live Deriv public market data
   • Tick history
   • Digit distribution
   • Hot / cold digits
   • Odd / Even analysis
   • Over / Under analysis
   • Matches / Differs analysis
   • Circular AI engine
   • 10 second analysis
   • 5 second prediction countdown
   • TRADE NOW signal
   • 3 second cooldown
   • Automatic cycle
   • Manual contract number
   • Trade page support
   • History page support
   • Paper trading
   • Win / Loss tracking
   • Profit / Loss tracking
   • Stop Trading button
   • Local history storage
   • Automatic reconnect
   • NO REAL TRADES
========================================================= */

const $ = id => document.getElementById(id);

/* =========================================================
   DERIV CONNECTION
========================================================= */

const WS_PRIMARY =
    "wss://api.derivws.com/trading/v1/options/ws/public";

const WS_FALLBACK =
    "wss://ws.binaryws.com/websockets/v3";

/* =========================================================
   MARKETS
========================================================= */

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

/* =========================================================
   STRATEGIES
========================================================= */

const STRATEGIES = [
    ["matches", "Matches"],
    ["differs", "Differs"],
    ["even", "Even"],
    ["odd", "Odd"],
    ["over", "Over"],
    ["under", "Under"]
];

/* =========================================================
   GLOBAL STATE
========================================================= */

let ws = null;

let sym = "R_10";

let endpointMode = "primary";

let reconnectTimer = null;

let reconnectAttempts = 0;

let receivedData = false;

/* Tick history */

let hist = [];

let cnt = Array(10).fill(0);

let totalTicks = 0;

/* Strategy */

let selectedStrategy = "matches";

/* AI */

let aiPrediction = null;

let aiConfidence = 0;

let aiReason = "";

let predictionLocked = false;

/* Cycle */

let cycleRunning = false;

let cycleTimer = null;

let cyclePhase = "idle";

let secondsLeft = 0;

/* Paper trading */

let paperTrading = false;

let wins = 0;

let losses = 0;

let profitLoss = 0;

let totalTrades = 0;

/* =========================================================
   HISTORY STORAGE
========================================================= */

const HISTORY_KEY = "KRISHWAVE_HISTORY_V5";

let tradeHistory = [];

function loadHistory() {

    try {

        const saved =
            localStorage.getItem(HISTORY_KEY);

        if (saved) {

            tradeHistory =
                JSON.parse(saved);

        }

    } catch (error) {

        tradeHistory = [];

    }

    calculateStats();

    renderHistory();

}

function saveHistory() {

    try {

        localStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(tradeHistory)
        );

    } catch (error) {

        console.warn(
            "Could not save KRISHWAVE history."
        );

    }

}

function calculateStats() {

    totalTrades =
        tradeHistory.length;

    wins =
        tradeHistory.filter(
            t => t.result === "WIN"
        ).length;

    losses =
        tradeHistory.filter(
            t => t.result === "LOSS"
        ).length;

    profitLoss =
        tradeHistory.reduce(
            (sum, t) =>
                sum + Number(t.pnl || 0),
            0
        );

    updateStatsUI();

}

function updateStatsUI() {

    if ($("win"))
        $("win").textContent = wins;

    if ($("loss"))
        $("loss").textContent = losses;

    if ($("pl"))
        $("pl").textContent =
            "$" + profitLoss.toFixed(2);

    if ($("totalTrades"))
        $("totalTrades").textContent =
            totalTrades;

    const winRate =
        totalTrades > 0
            ? (wins / totalTrades) * 100
            : 0;

    if ($("winRate"))
        $("winRate").textContent =
            winRate.toFixed(1) + "%";

}

function addHistory(result) {

    tradeHistory.unshift(result);

    if (tradeHistory.length > 500) {

        tradeHistory =
            tradeHistory.slice(0, 500);

    }

    saveHistory();

    calculateStats();

    renderHistory();

}

function renderHistory() {

    const table =
        $("historyList");

    if (!table)
        return;

    if (!tradeHistory.length) {

        table.innerHTML = `
            <div class="history-empty">
                No paper trades yet.
            </div>
        `;

        return;
    }

    table.innerHTML =
        tradeHistory.map(
            trade => {

                const cls =
                    trade.result === "WIN"
                        ? "win"
                        : "loss";

                return `
                    <div class="history-row ${cls}">

                        <span>
                            ${trade.time}
                        </span>

                        <span>
                            ${trade.market}
                        </span>

                        <span>
                            ${trade.strategy}
                        </span>

                        <span>
                            ${trade.number}
                        </span>

                        <span>
                            ${trade.result}
                        </span>

                        <span>
                            ${Number(trade.pnl).toFixed(2)}
                        </span>

                    </div>
                `;

            }
        ).join("");

}

/* =========================================================
   CLEAR HISTORY
========================================================= */

function clearHistory() {

    if (
        !confirm(
            "Delete all KRISHWAVE paper trading history?"
        )
    ) return;

    tradeHistory = [];

    saveHistory();

    calculateStats();

    renderHistory();

}

/* =========================================================
   DIGIT
========================================================= */

function lastDigit(value) {

    if (
        value === undefined ||
        value === null
    )
        return null;

    const text =
        String(value);

    const match =
        text.match(/(\d)$/);

    if (!match)
        return null;

    return Number(match[1]);

}

/* =========================================================
   CONNECTION UI
========================================================= */

function setConnection(
    status,
    text
) {

    const conn =
        $("conn");

    if (!conn)
        return;

    conn.textContent =
        "● " + text;

    conn.classList.remove(
        "live",
        "connecting",
        "offline"
    );

    conn.classList.add(status);

}

function showError(message) {

    if ($("error"))
        $("error").textContent =
            message || "";

    console.log(
        "KRISHWAVE:",
        message
    );

}

/* =========================================================
   MARKET RESET
========================================================= */

function resetMarketData() {

    hist = [];

    cnt =
        Array(10).fill(0);

    totalTicks = 0;

    aiPrediction = null;

    aiConfidence = 0;

    aiReason = "";

    predictionLocked = false;

    updateTickUI();

    renderDigits();

    updateAIUI();

}

/* =========================================================
   ADD TICK
========================================================= */

function addTick(quote) {

    const digit =
        lastDigit(quote);

    if (digit === null)
        return;

    hist.push(digit);

    cnt[digit]++;

    totalTicks++;

    if (hist.length > 500) {

        const removed =
            hist.shift();

        cnt[removed]--;

    }

    updateTickUI();

    renderDigits();

    /*
       Don't change the prediction while
       the prediction window is locked.
    */

    if (!predictionLocked) {

        analyzeMarket();

    }

}

/* =========================================================
   TICK UI
========================================================= */

function updateTickUI() {

    const latest =
        hist.length
            ? hist[hist.length - 1]
            : "—";

    if ($("last"))
        $("last").textContent =
            latest;

    if ($("ticks"))
        $("ticks").textContent =
            hist.length;

    if ($("totalTicks"))
        $("totalTicks").textContent =
            hist.length;

}

/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigits() {

    const container =
        $("digits");

    if (!container)
        return;

    const total =
        hist.length;

    let html = "";

    for (
        let digit = 0;
        digit <= 9;
        digit++
    ) {

        const percentage =
            total > 0
                ? Math.round(
                    (cnt[digit] / total) *
                    100
                )
                : 0;

        html += `

            <div class="digit">

                <b>${digit}</b>

                <span>
                    ${percentage}%
                </span>

                <div class="bar">

                    <i
                        style="
                            width:${percentage}%
                        "
                    ></i>

                </div>

            </div>

        `;

    }

    container.innerHTML =
        html;

    const hot =
        getHotDigit();

    if ($("hot"))
        $("hot").textContent =
            hot === null
                ? "—"
                : hot;

}

/* =========================================================
   HOT DIGIT
========================================================= */

function getHotDigit() {

    if (!hist.length)
        return null;

    let digit = 0;

    let highest = -1;

    for (
        let i = 0;
        i < 10;
        i++
    ) {

        if (cnt[i] > highest) {

            highest =
                cnt[i];

            digit = i;

        }

    }

    return digit;

}

/* =========================================================
   AI ENGINE
========================================================= */

function analyzeMarket() {

    if (hist.length < 20) {

        aiPrediction = null;

        aiConfidence = 0;

        aiReason =
            "Collecting enough live tick data.";

        updateAIUI();

        return;

    }

    const recent =
        hist.slice(-50);

    const short =
        hist.slice(-20);

    const medium =
        hist.slice(-100);

    /*
       ----------------------------------------------------
       DIGIT SCORE
       ----------------------------------------------------
    */

    const digitScores =
        Array(10).fill(0);

    for (
        let digit = 0;
        digit <= 9;
        digit++
    ) {

        const recentCount =
            recent.filter(
                d => d === digit
            ).length;

        const shortCount =
            short.filter(
                d => d === digit
            ).length;

        const mediumCount =
            medium.filter(
                d => d === digit
            ).length;

        /*
           Weighted score:
           recent > short > medium
        */

        digitScores[digit] =
            recentCount * 0.50 +
            shortCount * 0.30 +
            mediumCount * 0.20;

    }

    /*
       ----------------------------------------------------
       RECENCY MOMENTUM
       ----------------------------------------------------
    */

    const lastTen =
        hist.slice(-10);

    const previousTen =
        hist.slice(-20, -10);

    for (
        let digit = 0;
        digit <= 9;
        digit++
    ) {

        const now =
            lastTen.filter(
                d => d === digit
            ).length;

        const before =
            previousTen.filter(
                d => d === digit
            ).length;

        const momentum =
            now - before;

        digitScores[digit] +=
            momentum * 0.35;

    }

    /*
       ----------------------------------------------------
       CHOOSE STRATEGY
       ----------------------------------------------------
    */

    let prediction;

    let confidence;

    let reason;

    if (
        selectedStrategy === "matches"
    ) {

        prediction =
            strongestDigit(
                digitScores
            );

        const share =
            countDigit(
                recent,
                prediction
            ) / recent.length;

        confidence =
            calculateConfidence(
                share,
                0.50
            );

        reason =
            `Digit ${prediction} has the strongest weighted frequency and recent momentum.`;

    }

    else if (
        selectedStrategy === "differs"
    ) {

        prediction =
            weakestDigit(
                digitScores
            );

        const matchRate =
            countDigit(
                recent,
                prediction
            ) / recent.length;

        confidence =
            calculateConfidence(
                1 - matchRate,
                0.50
            );

        reason =
            `Digit ${prediction} has the weakest weighted presence in the recent sample.`;

    }

    else {

        const stats =
            getBinaryStats(
                recent
            );

        if (
            selectedStrategy === "even"
        ) {

            prediction =
                strongestParity(
                    stats.even,
                    stats.odd
                );

            const ratio =
                stats.even /
                recent.length;

            confidence =
                calculateConfidence(
                    prediction === "EVEN"
                        ? ratio
                        : 1 - ratio,
                    0.50
                );

            reason =
                `Recent sample contains ${stats.even} EVEN and ${stats.odd} ODD digits.`;

        }

        else if (
            selectedStrategy === "odd"
        ) {

            prediction =
                strongestParity(
                    stats.odd,
                    stats.even,
                    true
                );

            const ratio =
                stats.odd /
                recent.length;

            confidence =
                calculateConfidence(
                    prediction === "ODD"
                        ? ratio
                        : 1 - ratio,
                    0.50
                );

            reason =
                `Recent sample contains ${stats.odd} ODD and ${stats.even} EVEN digits.`;

        }

        else if (
            selectedStrategy === "over"
        ) {

            prediction =
                strongestOverUnder(
                    stats.over,
                    stats.under,
                    "OVER 4"
                );

            const ratio =
                stats.over /
                recent.length;

            confidence =
                calculateConfidence(
                    prediction === "OVER 4"
                        ? ratio
                        : 1 - ratio,
                    0.50
                );

            reason =
                `Recent sample contains ${stats.over} digits 5–9 and ${stats.under} digits 0–4.`;

        }

        else if (
            selectedStrategy === "under"
        ) {

            prediction =
                strongestOverUnder(
                    stats.under,
                    stats.over,
                    "UNDER 5"
                );

            const ratio =
                stats.under /
                recent.length;

            confidence =
                calculateConfidence(
                    prediction === "UNDER 5"
                        ? ratio
                        : 1 - ratio,
                    0.50
                );

            reason =
                `Recent sample contains ${stats.under} digits 0–4 and ${stats.over} digits 5–9.`;

        }

    }

    aiPrediction =
        prediction;

    aiConfidence =
        confidence;

    aiReason =
        reason;

    updateAIUI();

}

/* =========================================================
   AI HELPERS
========================================================= */

function countDigit(
    array,
    digit
) {

    return array.filter(
        d => d === digit
    ).length;

}

function strongestDigit(
    scores
) {

    let index = 0;

    for (
        let i = 1;
        i < scores.length;
        i++
    ) {

        if (
            scores[i] >
            scores[index]
        ) {

            index = i;

        }

    }

    return index;

}

function weakestDigit(
    scores
) {

    let index = 0;

    for (
        let i = 1;
        i < scores.length;
        i++
    ) {

        if (
            scores[i] <
            scores[index]
        ) {

            index = i;

        }

    }

    return index;

}

function getBinaryStats(
    array
) {

    let even = 0;

    let odd = 0;

    let over = 0;

    let under = 0;

    array.forEach(
        digit => {

            if (
                digit % 2 === 0
            )
                even++;
            else
                odd++;

            if (
                digit >= 5
            )
                over++;
            else
                under++;

        }
    );

    return {
        even,
        odd,
        over,
        under
    };

}

function strongestParity(
    a,
    b,
    oddMode = false
) {

    if (a >= b)
        return oddMode
            ? "ODD"
            : "EVEN";

    return oddMode
        ? "EVEN"
        : "ODD";

}

function strongestOverUnder(
    a,
    b,
    primary
) {

    return a >= b
        ? primary
        : primary === "OVER 4"
            ? "UNDER 5"
            : "OVER 4";

}

function calculateConfidence(
    probability,
    baseline
) {

    const edge =
        Math.abs(
            probability -
            baseline
        );

    /*
       Confidence is deliberately capped.
       It is not a guarantee.
    */

    let score =
        50 +
        edge * 100;

    score =
        Math.max(
            50,
            Math.min(
                95,
                score
            )
        );

    return Math.round(score);

}

/* =========================================================
   AI UI
========================================================= */

function updateAIUI() {

    const predictionText =
        aiPrediction === null
            ? "WAITING"
            : aiPrediction;

    if ($("prediction"))
        $("prediction").textContent =
            predictionText;

    if ($("aiPrediction"))
        $("aiPrediction").textContent =
            predictionText;

    if ($("score"))
        $("score").textContent =
            aiConfidence
                ? aiConfidence + "%"
                : "—";

    if ($("confidence"))
        $("confidence").textContent =
            aiConfidence
                ? aiConfidence + "%"
                : "—";

    if ($("aiScore"))
        $("aiScore").textContent =
            aiConfidence
                ? aiConfidence + "%"
                : "—";

    if ($("reason"))
        $("reason").textContent =
            aiReason ||
            "Waiting for enough data.";

    if ($("analysis"))
        $("analysis").textContent =
            aiReason ||
            "Collecting live ticks…";

    /*
       Odd / Even classification
    */

    let digit = null;

    if (
        typeof aiPrediction ===
        "number"
    ) {

        digit =
            aiPrediction;

    }

    if (
        digit !== null
    ) {

        const type =
            digit % 2 === 0
                ? "EVEN"
                : "ODD";

        if ($("aiType"))
            $("aiType").textContent =
                type;

        if ($("predictionType"))
            $("predictionType").textContent =
                type;

    }

}

/* =========================================================
   CIRCULAR AI
========================================================= */

function updateCircularAI() {

    const circle =
        $("aiCircle");

    const timer =
        $("aiCircleTimer");

    const status =
        $("aiCircleStatus");

    const prediction =
        $("aiCirclePrediction");

    const confidence =
        $("aiCircleConfidence");

    if (timer)
        timer.textContent =
            secondsLeft > 0
                ? secondsLeft
                : "—";

    if (status)
        status.textContent =
            cyclePhase
                .toUpperCase();

    if (prediction)
        prediction.textContent =
            aiPrediction === null
                ? "—"
                : aiPrediction;

    if (confidence)
        confidence.textContent =
            aiConfidence
                ? aiConfidence + "%"
                : "—";

    if (circle) {

        let percent = 0;

        if (
            cyclePhase ===
            "analysis"
        ) {

            percent =
                ((10 -
                    secondsLeft) /
                    10) *
                100;

        }

        else if (
            cyclePhase ===
            "prediction"
        ) {

            percent =
                100 -
                (secondsLeft /
                    5) *
                100;

        }

        else if (
            cyclePhase ===
            "trade"
        ) {

            percent = 100;

        }

        else if (
            cyclePhase ===
            "cooldown"
        ) {

            percent = 0;

        }

        circle.style.setProperty(
            "--progress",
            percent + "%"
        );

    }

}

/* =========================================================
   STRATEGIES
========================================================= */

function buildStrategies() {

    const container =
        $("strategies");

    if (container) {

        container.innerHTML = "";

        STRATEGIES.forEach(
            strategy => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.textContent =
                    strategy[1];

                button.dataset.k =
                    strategy[0];

                if (
                    strategy[0] ===
                    selectedStrategy
                ) {

                    button.classList.add(
                        "on"
                    );

                }

                button.onclick =
                    () =>
                        chooseStrategy(
                            strategy[0]
                        );

                container.appendChild(
                    button
                );

            }
        );

    }

    const select =
        $("strategy");

    if (select) {

        select.innerHTML = "";

        STRATEGIES.forEach(
            strategy => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    strategy[0];

                option.textContent =
                    strategy[1];

                select.appendChild(
                    option
                );

            }
        );

        select.value =
            selectedStrategy;

        select.onchange =
            event =>
                chooseStrategy(
                    event.target.value
                );

    }

}

/* =========================================================
   CHOOSE STRATEGY
========================================================= */

function chooseStrategy(
    strategy
) {

    selectedStrategy =
        strategy;

    document
        .querySelectorAll(
            "#strategies button"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "on",
                    button.dataset.k ===
                    strategy
                );

            }
        );

    const select =
        $("strategy");

    if (select)
        select.value =
            strategy;

    const manualStrategies = [
        "matches",
        "differs",
        "over",
        "under"
    ];

    const needsManual =
        manualStrategies.includes(
            strategy
        );

    if ($("manual")) {

        $("manual").classList.toggle(
            "hide",
            !needsManual
        );

    }

    if ($("manualTitle")) {

        const names = {
            matches: "MATCH DIGIT",
            differs: "DIFFER DIGIT",
            over: "OVER NUMBER",
            under: "UNDER NUMBER"
        };

        $("manualTitle").textContent =
            names[strategy] ||
            "MANUAL ENTRY";

    }

    /*
       Don't alter a locked prediction.
    */

    if (!predictionLocked)
        analyzeMarket();

}

/* =========================================================
   MARKETS
========================================================= */

function buildMarkets() {

    const container =
        $("markets");

    if (!container)
        return;

    container.innerHTML = "";

    MARKETS.forEach(
        market => {

            const symbol =
                market[0];

            const name =
                market[1];

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "market" +
                (
                    symbol === sym
                        ? " sel"
                        : ""
                );

            item.dataset.s =
                symbol;

            item.innerHTML = `

                <b>
                    ${name}
                </b>

                <small>
                    ${symbol}
                </small>

                <strong class="live">
                    LIVE
                </strong>

            `;

            item.onclick =
                () =>
                    selectMarket(
                        symbol
                    );

            container.appendChild(
                item
            );

        }
    );

}

/* =========================================================
   SELECT MARKET
========================================================= */

function selectMarket(
    symbol
) {

    sym =
        symbol;

    resetMarketData();

    buildMarkets();

    updateMarketLabels();

    connect();

}

/* =========================================================
   MARKET LABELS
========================================================= */

function updateMarketLabels() {

    const market =
        MARKETS.find(
            m => m[0] === sym
        );

    if (!market)
        return;

    if ($("mname"))
        $("mname").textContent =
            market[1];

    if ($("sym"))
        $("sym").textContent =
            sym;

    if ($("market"))
        $("market").textContent =
            "CONNECTING TO DERIV…";

}

/* =========================================================
   WEBSOCKET SEND
========================================================= */

function send(
    request
) {

    if (
        ws &&
        ws.readyState ===
        WebSocket.OPEN
    ) {

        try {

            ws.send(
                JSON.stringify(
                    request
                )
            );

            return true;

        } catch (error) {

            console.error(
                error
            );

        }

    }

    return false;

}

/* =========================================================
   SUBSCRIBE
========================================================= */

function subscribeMarket() {

    send({
        ticks_history: sym,
        count: 200,
        end: "latest",
        style: "ticks",
        req_id: 100
    });

    send({
        ticks: sym,
        subscribe: 1,
        req_id: 101
    });

    send({
        ping: 1,
        req_id: 102
    });

}

/* =========================================================
   CONNECT
========================================================= */

function connect() {

    clearTimeout(
        reconnectTimer
    );

    if (ws) {

        try {
            ws.close();
        } catch (e) {}

        ws = null;

    }

    receivedData = false;

    setConnection(
        "connecting",
        "CONNECTING"
    );

    if ($("market"))
        $("market").textContent =
            "CONNECTING TO DERIV…";

    showError("");

    const endpoint =
        endpointMode === "primary"
            ? WS_PRIMARY
            : WS_FALLBACK;

    try {

        ws =
            new WebSocket(
                endpoint
            );

    } catch (error) {

        showError(
            "WebSocket could not be opened."
        );

        fallbackEndpoint();

        return;

    }

    ws.onopen = () => {

        reconnectAttempts = 0;

        setConnection(
            "live",
            "LIVE"
        );

        showError("");

        if ($("market"))
            $("market").textContent =
                "LIVE • " + sym;

        subscribeMarket();

        /*
           If primary connects but doesn't
           deliver data, try fallback.
        */

        setTimeout(
            () => {

                if (
                    ws &&
                    ws.readyState ===
                    WebSocket.OPEN &&
                    !receivedData &&
                    endpointMode ===
                    "primary"
                ) {

                    fallbackEndpoint();

                }

            },
            8000
        );

    };

    ws.onmessage =
        event => {

            let data;

            try {

                data =
                    JSON.parse(
                        event.data
                    );

            } catch (error) {

                return;

            }

            if (data.error) {

                showError(
                    data.error.message ||
                    "Deriv returned an error."
                );

                return;

            }

            /*
               HISTORY
            */

            if (
                data.msg_type ===
                    "history" &&
                data.history
            ) {

                receivedData = true;

                hist = [];

                cnt =
                    Array(10).fill(0);

                const prices =
                    data.history.prices ||
                    [];

                prices.forEach(
                    price =>
                        addTick(price)
                );

                return;

            }

            /*
               LIVE TICK
            */

            if (
                data.msg_type ===
                    "tick" &&
                data.tick
            ) {

                receivedData = true;

                addTick(
                    data.tick.quote
                );

            }

        };

    ws.onerror =
        () => {

            showError(
                "Deriv WebSocket connection error."
            );

        };

    ws.onclose =
        () => {

            setConnection(
                "offline",
                "OFFLINE"
            );

            if (
                !receivedData &&
                endpointMode ===
                "primary"
            ) {

                fallbackEndpoint();

                return;

            }

            scheduleReconnect();

        };

}

/* =========================================================
   FALLBACK
========================================================= */

function fallbackEndpoint() {

    clearTimeout(
        reconnectTimer
    );

    if (ws) {

        try {
            ws.close();
        } catch (e) {}

    }

    endpointMode =
        endpointMode === "primary"
            ? "fallback"
            : "primary";

    reconnectTimer =
        setTimeout(
            connect,
            500
        );

}

/* =========================================================
   RECONNECT
========================================================= */

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

/* =========================================================
   PAPER TRADE VALIDATION
========================================================= */

function evaluatePaperTrade(
    actualDigit
) {

    if (
        actualDigit === null
    )
        return;

    const stakeElement =
        $("stake");

    const stake =
        stakeElement
            ? Number(
                stakeElement.value || 0
            )
            : 10;

    let target =
        getManualNumber();

    let success = false;

    /*
       MATCHES
    */

    if (
        selectedStrategy ===
        "matches"
    ) {

        success =
            actualDigit === target;

    }

    /*
       DIFFERS
    */

    else if (
        selectedStrategy ===
        "differs"
    ) {

        success =
            actualDigit !== target;

    }

    /*
       EVEN
    */

    else if (
        selectedStrategy ===
        "even"
    ) {

        success =
            actualDigit % 2 === 0;

    }

    /*
       ODD
    */

    else if (
        selectedStrategy ===
        "odd"
    ) {

        success =
            actualDigit % 2 !== 0;

    }

    /*
       OVER
    */

    else if (
        selectedStrategy ===
        "over"
    ) {

        success =
            actualDigit >=
            target;

    }

    /*
       UNDER
    */

    else if (
        selectedStrategy ===
        "under"
    ) {

        success =
            actualDigit <
            target;

    }

    /*
       Simple paper P/L.

       This is only a simulation and
       does not represent Deriv payout.
    */

    const pnl =
        success
            ? stake
            : -stake;

    const now =
        new Date();

    const record = {

        time:
            now.toLocaleTimeString(),

        timestamp:
            now.toISOString(),

        market:
            sym,

        strategy:
            selectedStrategy,

        prediction:
            aiPrediction,

        number:
            target,

        actual:
            actualDigit,

        result:
            success
                ? "WIN"
                : "LOSS",

        pnl:
            pnl,

        confidence:
            aiConfidence

    };

    addHistory(
        record
    );

}

/* =========================================================
   MANUAL NUMBER
========================================================= */

function getManualNumber() {

    const input =
        $("number");

    if (!input)
        return 5;

    const value =
        Number(input.value);

    if (
        Number.isFinite(value)
    ) {

        return Math.max(
            0,
            Math.min(
                9,
                value
            )
        );

    }

    /*
       AI prediction is NOT copied
       into the manual field.

       Default simulation number
       is 5 only if no manual value
       exists.
    */

    return 5;

}

/* =========================================================
   10s ANALYSIS
========================================================= */

function startAnalysisPhase() {

    cyclePhase =
        "analysis";

    secondsLeft =
        10;

    predictionLocked =
        false;

    if ($("phase"))
        $("phase").textContent =
            "AI ANALYSIS";

    if ($("msg"))
        $("msg").textContent =
            "Analyzing live market data…";

    analyzeMarket();

    updateCycleUI();

}

/* =========================================================
   5s PREDICTION
========================================================= */

function startPredictionPhase() {

    cyclePhase =
        "prediction";

    secondsLeft =
        5;

    /*
       LOCK prediction.

       New ticks will continue arriving,
       but the AI signal won't change.
    */

    predictionLocked =
        true;

    analyzeMarket();

    if ($("phase"))
        $("phase").textContent =
            "PREDICTION";

    if ($("msg"))
        $("msg").textContent =
            "Prediction locked for the next 5 seconds.";

    updateCycleUI();

}

/* =========================================================
   TRADE NOW
========================================================= */

function startTradePhase() {

    cyclePhase =
        "trade";

    secondsLeft =
        0;

    if ($("phase"))
        $("phase").textContent =
            "TRADE NOW";

    if ($("msg"))
        $("msg").textContent =
            "TRADE NOW — paper trading signal.";

    /*
       Flash the signal.
    */

    document.body.classList.add(
        "trade-now"
    );

    setTimeout(
        () => {

            document.body.classList.remove(
                "trade-now"
            );

        },
        1000
    );

    updateCycleUI();

    /*
       If paper trading is enabled,
       evaluate the next available
       live digit.
    */

    if (
        paperTrading &&
        hist.length
    ) {

        const actual =
            hist[hist.length - 1];

        evaluatePaperTrade(
            actual
        );

    }

}

/* =========================================================
   3s COOLDOWN
========================================================= */

function startCooldownPhase() {

    cyclePhase =
        "cooldown";

    secondsLeft =
        3;

    predictionLocked =
        false;

    if ($("phase"))
        $("phase").textContent =
            "COOLDOWN";

    if ($("msg"))
        $("msg").textContent =
            "Waiting 3 seconds before the next analysis.";

    updateCycleUI();

}

/* =========================================================
   CYCLE
========================================================= */

function runCycleTick() {

    if (!cycleRunning)
        return;

    secondsLeft--;

    if (
        cyclePhase ===
            "analysis" &&
        secondsLeft <= 0
    ) {

        startPredictionPhase();

    }

    else if (
        cyclePhase ===
            "prediction" &&
        secondsLeft <= 0
    ) {

        startTradePhase();

        /*
           Immediately begin
           cooldown.
        */

        setTimeout(
            () => {

                if (
                    cycleRunning
                )
                    startCooldownPhase();

            },
            1000
        );

    }

    else if (
        cyclePhase ===
            "cooldown" &&
        secondsLeft <= 0
    ) {

        startAnalysisPhase();

    }

    updateCycleUI();

}

/* =========================================================
   CYCLE UI
========================================================= */

function updateCycleUI() {

    if ($("timer")) {

        $("timer").textContent =
            secondsLeft;

    }

    if ($("a10")) {

        $("a10").textContent =
            cyclePhase ===
            "analysis"
                ? secondsLeft + "s"
                : "—";

    }

    if ($("a5")) {

        $("a5").textContent =
            cyclePhase ===
            "prediction"
                ? secondsLeft + "s"
                : "—";

    }

    if ($("tradeTimer")) {

        $("tradeTimer").textContent =
            cyclePhase ===
            "trade"
                ? "TRADE NOW"
                : "—";

    }

    if ($("cooldown")) {

        $("cooldown").textContent =
            cyclePhase ===
            "cooldown"
                ? secondsLeft + "s"
                : "—";

    }

    updateCircularAI();

}

/* =========================================================
   START AI CYCLE
========================================================= */

function startAICycle() {

    clearInterval(
        cycleTimer
    );

    cycleRunning =
        true;

    startAnalysisPhase();

    cycleTimer =
        setInterval(
            runCycleTick,
            1000
        );

}

/* =========================================================
   STOP AI CYCLE
========================================================= */

function stopAICycle() {

    cycleRunning =
        false;

    clearInterval(
        cycleTimer
    );

    cycleTimer =
        null;

    predictionLocked =
        false;

    cyclePhase =
        "stopped";

    secondsLeft =
        0;

    if ($("phase"))
        $("phase").textContent =
            "STOPPED";

    if ($("msg"))
        $("msg").textContent =
            "Trading/analysis stopped.";

    updateCycleUI();

}

/* =========================================================
   START TRADING BUTTON
========================================================= */

function startTrading() {

    paperTrading =
        true;

    startAICycle();

    if ($("toggle"))
        $("toggle").textContent =
            "STOP TRADING";

}

/* =========================================================
   STOP TRADING BUTTON
========================================================= */

function stopTrading() {

    paperTrading =
        false;

    stopAICycle();

    if ($("toggle"))
        $("toggle").textContent =
            "START TRADING";

}

/* =========================================================
   MANUAL INPUT
========================================================= */

if ($("number")) {

    $("number").oninput =
        event => {

            let value =
                event.target.value;

            if (
                value !== ""
            ) {

                value =
                    Math.max(
                        0,
                        Math.min(
                            9,
                            Number(value)
                        )
                    );

                event.target.value =
                    value;

            }

            if ($("manualPreview"))
                $("manualPreview").textContent =
                    value;

        };

}

/* =========================================================
   START / STOP BUTTON
========================================================= */

if ($("toggle")) {

    $("toggle").onclick =
        () => {

            if (
                cycleRunning
            ) {

                stopTrading();

            } else {

                startTrading();

            }

        };

}

/* =========================================================
   EXPLICIT STOP BUTTON
========================================================= */

if ($("stopTrading")) {

    $("stopTrading").onclick =
        stopTrading;

}

/* =========================================================
   EXPLICIT START BUTTON
========================================================= */

if ($("startTrading")) {

    $("startTrading").onclick =
        startTrading;

}

/* =========================================================
   RESET PAPER
========================================================= */

if ($("reset")) {

    $("reset").onclick =
        () => {

            stopTrading();

            clearHistory();

        };

}

/* =========================================================
   CLEAR HISTORY BUTTON
========================================================= */

if ($("clearHistory")) {

    $("clearHistory").onclick =
        clearHistory;

}

/* =========================================================
   RECONNECT
========================================================= */

if ($("reconnect")) {

    $("reconnect").onclick =
        () => {

            reconnectAttempts =
                0;

            endpointMode =
                "primary";

            resetMarketData();

            connect();

        };

}

/* =========================================================
   SCAN
========================================================= */

if ($("scan")) {

    $("scan").onclick =
        () => {

            buildMarkets();

            connect();

        };

}

/* =========================================================
   SYMBOL SELECT
========================================================= */

if ($("symbol")) {

    $("symbol").onchange =
        event => {

            selectMarket(
                event.target.value
            );

        };

}

/* =========================================================
   INITIALIZE
========================================================= */

buildStrategies();

buildMarkets();

updateMarketLabels();

loadHistory();

renderDigits();

updateAIUI();

updateCycleUI();

connect();

/* =========================================================
   SAFETY
========================================================= */

/*
   KRISHWAVE V5 is PAPER TRADING ONLY.

   No:
   • API token
   • account password
   • buy request
   • sell request
   • real-money order

   is included in this file.
========================================================= */