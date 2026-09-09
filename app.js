/* =========================================================
   KRISHWAVE — AI BEAST V7.1
   LIVE DERIV MARKET INTELLIGENCE
   ---------------------------------------------------------
   FIXED:
   - Circular AI actually starts
   - 10 second analysis countdown
   - Live tick collection
   - 5 second prediction countdown
   - 3 second trade window
   - 3 second cooldown
   - Circular prediction
   - Confidence
   - Realized accuracy
   - Paper trade creation
   - Paper trade settlement
   - Amount won
   - Profit/loss
   - History
   - AI BOT
   - Manual trading
   - Demo mode dominant
   ---------------------------------------------------------
   IMPORTANT:
   Real-money trading is NOT enabled by this file.
   This version uses public market data + paper trading.
========================================================= */

"use strict";

/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {
    APP_NAME: "KRISHWAVE",
    VERSION: "AI BEAST V7.1",

    DERIV_CLIENT_ID: "34khasPjsT0PCRR8X3Z70",

    REDIRECT_URI:
        "https://chrispusatale99-dot.github.io/KRISHWAVE/",

    PUBLIC_WS:
        "wss://api.derivws.com/trading/v1/options/ws/public",

    STARTING_BALANCE: 1000,

    MAX_TICKS_PER_MARKET: 250,

    MIN_ANALYSIS_TICKS: 20,

    CIRCULAR_ANALYSIS_SECONDS: 10,
    CIRCULAR_PREDICTION_SECONDS: 5,
    CIRCULAR_TRADE_SECONDS: 3,
    CIRCULAR_COOLDOWN_SECONDS: 3,

    BOT_INTERVAL_SECONDS: 3,

    STORAGE_KEY: "KRISHWAVE_V71_STATE",

    MARKETS: [
        "R_10",
        "R_25",
        "R_50",
        "R_75",
        "R_100",
        "1HZ10V",
        "1HZ25V",
        "1HZ30V",
        "1HZ50V",
        "1HZ75V",
        "1HZ90V",
        "1HZ100V",
        "1HZ150V",
        "1HZ250V",
        "1HZ1000V"
    ],

    STRATEGIES: [
        "MATCHES",
        "DIFFERS",
        "OVER",
        "UNDER",
        "EVEN",
        "ODD"
    ],

    PAYOUT_MULTIPLIER: {
        MATCHES: 8.5,
        DIFFERS: 0.09,
        OVER: 0.95,
        UNDER: 0.95,
        EVEN: 0.95,
        ODD: 0.95
    }
};


/* =========================================================
   STATE
========================================================= */

const state = {
    ws: null,
    wsConnected: false,
    reconnectTimer: null,

    requestId: 1,

    accountMode: "DEMO",
    realConfirmed: false,

    currency: "USD",
    demoBalance: CONFIG.STARTING_BALANCE,

    selectedMarket: "1HZ100V",

    ticks: {},
    latestTick: {},

    activeTrades: [],
    history: [],

    stats: {
        total: 0,
        wins: 0,
        losses: 0
    },

    aiBot: {
        running: false,
        timer: null,
        lastTradeTime: 0
    },

    circular: {
        running: false,
        timer: null,

        phase: "STOPPED",

        seconds: 10,

        market: "1HZ100V",
        strategy: "AUTO",

        prediction: null,
        confidence: 0,

        cycle: 0,

        pendingTrade: null,

        analysisSnapshot: null,

        wins: 0,
        losses: 0,
        total: 0
    },

    manual: {
        strategy: "MATCHES"
    },

    bot: {
        strategy: "AUTO"
    },

    risk: {
        takeProfit: 0,
        stopLoss: 0
    },

    chart: {
        values: []
    }
};


/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
    return document.getElementById(id);
}

function text(id, value) {
    const el = $(id);

    if (el) {
        el.textContent = value;
    }
}

function value(id) {
    const el = $(id);

    return el ? el.value : "";
}

function setValue(id, v) {
    const el = $(id);

    if (el) {
        el.value = v;
    }
}

function show(id) {
    const el = $(id);

    if (el) {
        el.style.display = "";
    }
}

function hide(id) {
    const el = $(id);

    if (el) {
        el.style.display = "none";
    }
}


/* =========================================================
   FORMATTERS
========================================================= */

function money(amount) {
    const n = Number(amount) || 0;

    return "$" + n.toFixed(2);
}

function pct(number) {
    const n = Number(number) || 0;

    return n.toFixed(1) + "%";
}

function nowTime() {
    return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function randomId(prefix = "KW") {
    return (
        prefix +
        "_" +
        Date.now() +
        "_" +
        Math.floor(Math.random() * 100000)
    );
}


/* =========================================================
   TOAST
========================================================= */

function toast(message) {
    const el = $("toast");
    const msg = $("toastMessage");

    if (msg) {
        msg.textContent = message;
    }

    if (el) {
        el.classList.add("show");

        clearTimeout(toast._timer);

        toast._timer = setTimeout(() => {
            el.classList.remove("show");
        }, 2800);
    }
}


/* =========================================================
   STORAGE
========================================================= */

function saveState() {
    try {
        const data = {
            demoBalance: state.demoBalance,
            history: state.history.slice(0, 300),
            stats: state.stats,
            accountMode: "DEMO"
        };

        localStorage.setItem(
            CONFIG.STORAGE_KEY,
            JSON.stringify(data)
        );
    } catch (error) {
        console.warn("Storage error:", error);
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);

        if (!raw) {
            return;
        }

        const saved = JSON.parse(raw);

        if (typeof saved.demoBalance === "number") {
            state.demoBalance = saved.demoBalance;
        }

        if (Array.isArray(saved.history)) {
            state.history = saved.history;
        }

        if (saved.stats) {
            state.stats = {
                total: Number(saved.stats.total) || 0,
                wins: Number(saved.stats.wins) || 0,
                losses: Number(saved.stats.losses) || 0
            };
        }
    } catch (error) {
        console.warn("Could not load state:", error);
    }
}


/* =========================================================
   ACCOUNT UI
========================================================= */

function updateAccountUI() {
    text("accountId", "DEMO / PAPER");
    text("currency", state.currency);
    text("balanceDisplay", money(state.demoBalance));

    const modeBadge = document.querySelector(".mode-badge");

    if (modeBadge) {
        modeBadge.textContent = "DEMO";
        modeBadge.classList.remove("real-mode");
        modeBadge.classList.add("demo-mode");
    }
}


/* =========================================================
   DERIV CONNECTION
========================================================= */

function connectDeriv() {
    if (state.ws) {
        try {
            state.ws.close();
        } catch (_) {}
    }

    updateConnectionUI(
        false,
        "CONNECTING..."
    );

    let ws;

    try {
        ws = new WebSocket(CONFIG.PUBLIC_WS);
    } catch (error) {
        console.error(error);

        updateConnectionUI(
            false,
            "CONNECTION ERROR"
        );

        scheduleReconnect();

        return;
    }

    state.ws = ws;

    ws.onopen = () => {
        console.log("KRISHWAVE: Deriv connected");

        state.wsConnected = true;

        updateConnectionUI(
            true,
            "LIVE"
        );

        text(
            "dataStatus",
            "LIVE MARKET DATA"
        );

        requestInitialHistory();

        subscribeAllMarkets();

        /*
         * Important:
         * Circular AI is started automatically after
         * the connection is established.
         */
        startCircularAI();
    };

    ws.onmessage = event => {
        handleDerivMessage(event.data);
    };

    ws.onerror = error => {
        console.warn(
            "Deriv WebSocket error",
            error
        );

        updateConnectionUI(
            false,
            "ERROR"
        );
    };

    ws.onclose = () => {
        console.warn(
            "Deriv WebSocket closed"
        );

        state.wsConnected = false;

        updateConnectionUI(
            false,
            "RECONNECTING..."
        );

        /*
         * Do not stop Circular AI permanently.
         * It will wait for the data stream and resume.
         */

        scheduleReconnect();
    };
}

function scheduleReconnect() {
    clearTimeout(state.reconnectTimer);

    state.reconnectTimer = setTimeout(() => {
        connectDeriv();
    }, 3000);
}

function updateConnectionUI(connected, label) {
    text("connectionText", label);

    const dot = $("connectionDot");

    if (dot) {
        dot.classList.toggle(
            "connected",
            connected
        );
    }
}


/* =========================================================
   DERIV SUBSCRIPTIONS
========================================================= */

function subscribeAllMarkets() {
    if (!state.wsConnected || !state.ws) {
        return;
    }

    for (const market of CONFIG.MARKETS) {
        subscribeMarket(market);
    }
}

function subscribeMarket(market) {
    if (!state.wsConnected || !state.ws) {
        return;
    }

    try {
        state.ws.send(
            JSON.stringify({
                ticks: market,
                subscribe: 1,
                req_id: state.requestId++
            })
        );
    } catch (error) {
        console.warn(
            "Subscription failed:",
            market,
            error
        );
    }
}

function requestInitialHistory() {
    if (!state.wsConnected || !state.ws) {
        return;
    }

    /*
     * History gives Circular AI enough digits
     * immediately instead of waiting 20+ seconds.
     */

    for (const market of CONFIG.MARKETS) {
        try {
            state.ws.send(
                JSON.stringify({
                    ticks_history: market,
                    count: 100,
                    end: "latest",
                    style: "ticks",
                    req_id: state.requestId++
                })
            );
        } catch (_) {}
    }
}


/* =========================================================
   DERIV MESSAGE HANDLER
========================================================= */

function handleDerivMessage(raw) {
    let data;

    try {
        data =
            typeof raw === "string"
                ? JSON.parse(raw)
                : raw;
    } catch (error) {
        return;
    }

    if (!data) {
        return;
    }

    if (data.error) {
        console.warn(
            "Deriv API error:",
            data.error
        );

        return;
    }

    /*
     * Current Deriv API tick response.
     */
    if (
        data.msg_type === "tick" &&
        data.tick
    ) {
        processTick(data.tick);
    }

    /*
     * Historical ticks.
     */
    if (
        data.msg_type === "history" &&
        data.history
    ) {
        processHistory(data);
    }
}


/* =========================================================
   HISTORY PROCESSING
========================================================= */

function processHistory(data) {
    const symbol =
        data.echo_req?.ticks_history ||
        data.echo_req?.ticks ||
        data.history?.symbol ||
        data.echo_req?.symbol;

    if (!symbol) {
        return;
    }

    const prices =
        Array.isArray(data.history.prices)
            ? data.history.prices
            : [];

    const times =
        Array.isArray(data.history.times)
            ? data.history.times
            : [];

    if (!state.ticks[symbol]) {
        state.ticks[symbol] = [];
    }

    for (let i = 0; i < prices.length; i++) {
        const quote = Number(prices[i]);

        if (!Number.isFinite(quote)) {
            continue;
        }

        state.ticks[symbol].push({
            quote,
            epoch:
                Number(times[i]) ||
                Date.now() / 1000,
            digit: extractLastDigit(quote)
        });
    }

    trimTicks(symbol);

    /*
     * Immediately update the currently selected market.
     */
    if (symbol === state.selectedMarket) {
        updateAnalysisUI(symbol);
    }

    /*
     * Circular AI can begin analyzing immediately
     * once enough historical data is available.
     */
    if (
        state.circular.running &&
        symbol === state.circular.market
    ) {
        updateCircularDataStatus();
    }
}


/* =========================================================
   TICK PROCESSING
========================================================= */

function processTick(tick) {
    const symbol = tick.symbol;

    if (!symbol) {
        return;
    }

    const quote = Number(tick.quote);

    if (!Number.isFinite(quote)) {
        return;
    }

    if (!state.ticks[symbol]) {
        state.ticks[symbol] = [];
    }

    const item = {
        quote,
        epoch:
            Number(tick.epoch) ||
            Date.now() / 1000,

        digit: extractLastDigit(
            quote,
            tick.pip_size
        )
    };

    state.latestTick[symbol] = item;

    state.ticks[symbol].push(item);

    trimTicks(symbol);

    if (symbol === state.selectedMarket) {
        updateAnalysisUI(symbol);
    }

    settleTradesForMarket(
        symbol,
        item
    );

    /*
     * This is the critical part:
     * Circular AI continuously sees fresh ticks.
     */
    if (
        state.circular.running &&
        symbol === state.circular.market
    ) {
        updateCircularLiveDisplay();
    }
}

function trimTicks(symbol) {
    if (!state.ticks[symbol]) {
        return;
    }

    if (
        state.ticks[symbol].length >
        CONFIG.MAX_TICKS_PER_MARKET
    ) {
        state.ticks[symbol] =
            state.ticks[symbol].slice(
                -CONFIG.MAX_TICKS_PER_MARKET
            );
    }
}


/* =========================================================
   DIGIT EXTRACTION
========================================================= */

function extractLastDigit(
    quote,
    pipSize
) {
    /*
     * Deriv tick quotes can have different decimal
     * precision. Use pip_size when available.
     */

    const q = Number(quote);

    if (!Number.isFinite(q)) {
        return 0;
    }

    if (
        Number.isFinite(Number(pipSize))
    ) {
        const decimals = Number(pipSize);

        const scaled =
            Math.round(
                q * Math.pow(10, decimals)
            );

        return Math.abs(scaled % 10);
    }

    /*
     * Fallback:
     * convert to string and take final numeric digit.
     */
    const fixed = q.toFixed(8);

    const digits =
        fixed.replace(/\D/g, "");

    if (!digits.length) {
        return 0;
    }

    return Number(
        digits.charAt(
            digits.length - 1
        )
    );
}


/* =========================================================
   DIGIT ANALYSIS
========================================================= */

function getMarketTicks(market) {
    return state.ticks[market] || [];
}

function calculateDigitStats(market) {
    const ticks =
        getMarketTicks(market);

    const counts =
        Array(10).fill(0);

    for (const tick of ticks) {
        const digit = Number(tick.digit);

        if (
            Number.isInteger(digit) &&
            digit >= 0 &&
            digit <= 9
        ) {
            counts[digit]++;
        }
    }

    const total =
        counts.reduce(
            (a, b) => a + b,
            0
        );

    const percentages =
        counts.map(c =>
            total
                ? (c / total) * 100
                : 0
        );

    return {
        counts,
        percentages,
        total
    };
}

function analyzeMarket(market) {
    const ticks =
        getMarketTicks(market);

    if (
        ticks.length <
        CONFIG.MIN_ANALYSIS_TICKS
    ) {
        return {
            ready: false,
            market,
            reason:
                "Waiting for more live tick data",
            ticks: ticks.length
        };
    }

    const stats =
        calculateDigitStats(market);

    const latest =
        ticks[ticks.length - 1];

    const digits =
        ticks.map(t => t.digit);

    const evenCount =
        digits.filter(
            d => d % 2 === 0
        ).length;

    const oddCount =
        digits.length -
        evenCount;

    const highCount =
        digits.filter(
            d => d >= 5
        ).length;

    const lowCount =
        digits.length -
        highCount;

    const evenRate =
        (evenCount / digits.length) *
        100;

    const oddRate =
        (oddCount / digits.length) *
        100;

    const highRate =
        (highCount / digits.length) *
        100;

    const lowRate =
        (lowCount / digits.length) *
        100;

    let hottestDigit = 0;
    let coldestDigit = 0;

    for (let i = 0; i < 10; i++) {
        if (
            stats.counts[i] >
            stats.counts[hottestDigit]
        ) {
            hottestDigit = i;
        }

        if (
            stats.counts[i] <
            stats.counts[coldestDigit]
        ) {
            coldestDigit = i;
        }
    }

    /*
     * Recent-window statistics give the AI
     * more weight than old ticks.
     */

    const recent =
        ticks.slice(-30);

    const recentDigits =
        recent.map(t => t.digit);

    const recentEven =
        recentDigits.filter(
            d => d % 2 === 0
        ).length;

    const recentHigh =
        recentDigits.filter(
            d => d >= 5
        ).length;

    const recentEvenRate =
        recent.length
            ? (recentEven / recent.length) *
              100
            : 50;

    const recentHighRate =
        recent.length
            ? (recentHigh / recent.length) *
              100
            : 50;

    return {
        ready: true,

        market,

        ticks: ticks.length,

        latestDigit:
            latest?.digit ?? null,

        latestPrice:
            latest?.quote ?? null,

        counts: stats.counts,

        percentages:
            stats.percentages,

        evenRate,

        oddRate,

        highRate,

        lowRate,

        recentEvenRate,

        recentHighRate,

        hottestDigit,

        coldestDigit
    };
}


/* =========================================================
   STRATEGY ENGINE
========================================================= */

function chooseStrategy(analysis) {
    if (!analysis || !analysis.ready) {
        return {
            strategy: "EVEN",
            prediction: "EVEN",
            confidence: 50
        };
    }

    const candidates = [];

    /*
     * EVEN / ODD
     */

    if (
        analysis.recentEvenRate >= 58
    ) {
        candidates.push({
            strategy: "EVEN",
            prediction: "EVEN",
            confidence:
                analysis.recentEvenRate
        });
    }

    if (
        analysis.recentEvenRate <= 42
    ) {
        candidates.push({
            strategy: "ODD",
            prediction: "ODD",
            confidence:
                100 -
                analysis.recentEvenRate
        });
    }

    /*
     * OVER / UNDER
     */

    if (
        analysis.recentHighRate >= 58
    ) {
        candidates.push({
            strategy: "OVER",
            prediction: "OVER 4",
            confidence:
                analysis.recentHighRate
        });
    }

    if (
        analysis.recentHighRate <= 42
    ) {
        candidates.push({
            strategy: "UNDER",
            prediction: "UNDER 5",
            confidence:
                100 -
                analysis.recentHighRate
        });
    }

    /*
     * MATCHES / DIFFERS
     */

    if (
        analysis.percentages[
            analysis.hottestDigit
        ] >= 14
    ) {
        candidates.push({
            strategy: "MATCHES",
            prediction:
                "DIGIT " +
                analysis.hottestDigit,
            targetDigit:
                analysis.hottestDigit,
            confidence:
                analysis.percentages[
                    analysis.hottestDigit
                ] + 55
        });
    }

    if (
        analysis.percentages[
            analysis.hottestDigit
        ] >= 12
    ) {
        candidates.push({
            strategy: "DIFFERS",
            prediction:
                "NOT " +
                analysis.hottestDigit,
            targetDigit:
                analysis.hottestDigit,
            confidence:
                88 -
                analysis.percentages[
                    analysis.hottestDigit
                ]
        });
    }

    if (!candidates.length) {
        return {
            strategy:
                analysis.evenRate >= 50
                    ? "EVEN"
                    : "ODD",

            prediction:
                analysis.evenRate >= 50
                    ? "EVEN"
                    : "ODD",

            confidence:
                Math.max(
                    analysis.recentEvenRate,
                    100 -
                        analysis.recentEvenRate,
                    analysis.recentHighRate,
                    100 -
                        analysis.recentHighRate
                )
        };
    }

    candidates.sort(
        (a, b) =>
            b.confidence -
            a.confidence
    );

    const best =
        candidates[0];

    best.confidence =
        clamp(
            best.confidence,
            51,
            96
        );

    return best;
}


/* =========================================================
   PREDICTION RESULT
========================================================= */

function generatePrediction(
    market,
    forcedStrategy = "AUTO"
) {
    const analysis =
        analyzeMarket(market);

    if (!analysis.ready) {
        return {
            ready: false,
            market,
            strategy: "WAIT",
            prediction: "WAITING",
            confidence: 0,
            analysis
        };
    }

    let result;

    if (
        forcedStrategy &&
        forcedStrategy !== "AUTO"
    ) {
        result =
            buildForcedPrediction(
                analysis,
                forcedStrategy
            );
    } else {
        result =
            chooseStrategy(analysis);
    }

    return {
        ready: true,

        market,

        strategy:
            result.strategy,

        prediction:
            result.prediction,

        confidence:
            clamp(
                Number(result.confidence) || 50,
                50,
                96
            ),

        targetDigit:
            result.targetDigit ?? null,

        analysis
    };
}

function buildForcedPrediction(
    analysis,
    strategy
) {
    switch (strategy) {
        case "MATCHES":
            return {
                strategy,
                prediction:
                    "DIGIT " +
                    analysis.hottestDigit,
                targetDigit:
                    analysis.hottestDigit,
                confidence:
                    clamp(
                        analysis.percentages[
                            analysis.hottestDigit
                        ] + 50,
                        50,
                        95
                    )
            };

        case "DIFFERS":
            return {
                strategy,
                prediction:
                    "NOT " +
                    analysis.hottestDigit,
                targetDigit:
                    analysis.hottestDigit,
                confidence:
                    clamp(
                        90 -
                            analysis.percentages[
                                analysis.hottestDigit
                            ],
                        50,
                        95
                    )
            };

        case "OVER":
            return {
                strategy,
                prediction: "OVER 4",
                confidence:
                    clamp(
                        analysis.recentHighRate,
                        50,
                        95
                    )
            };

        case "UNDER":
            return {
                strategy,
                prediction: "UNDER 5",
                confidence:
                    clamp(
                        100 -
                            analysis.recentHighRate,
                        50,
                        95
                    )
            };

        case "EVEN":
            return {
                strategy,
                prediction: "EVEN",
                confidence:
                    clamp(
                        analysis.recentEvenRate,
                        50,
                        95
                    )
            };

        case "ODD":
            return {
                strategy,
                prediction: "ODD",
                confidence:
                    clamp(
                        100 -
                            analysis.recentEvenRate,
                        50,
                        95
                    )
            };

        default:
            return chooseStrategy(
                analysis
            );
    }
}


/* =========================================================
   ANALYSIS PAGE
========================================================= */

function updateAnalysisUI(market) {
    const analysis =
        analyzeMarket(market);

    text(
        "currentChartMarket",
        market
    );

    if (!analysis.ready) {
        text(
            "currentLivePrice",
            "WAITING"
        );

        text(
            "aiStatus",
            "COLLECTING DATA"
        );

        text(
            "analysisConfidence",
            "—"
        );

        text(
            "aiMarket",
            market
        );

        text(
            "aiPrediction",
            "WAITING"
        );

        text(
            "aiType",
            "—"
        );

        text(
            "analysisMsg",
            analysis.reason
        );

        text(
            "digitSampleCount",
            analysis.ticks
        );

        return;
    }

    text(
        "currentLivePrice",
        analysis.latestPrice !== null
            ? Number(
                  analysis.latestPrice
              ).toFixed(5)
            : "—"
    );

    const prediction =
        generatePrediction(
            market,
            "AUTO"
        );

    text(
        "aiStatus",
        "ANALYZING"
    );

    text(
        "analysisConfidence",
        pct(prediction.confidence)
    );

    text(
        "aiMarket",
        market
    );

    text(
        "aiPrediction",
        prediction.prediction
    );

    text(
        "aiType",
        prediction.strategy
    );

    text(
        "analysisMsg",
        buildAnalysisMessage(
            prediction
        )
    );

    text(
        "digitSampleCount",
        analysis.ticks
    );

    renderDigitStats(
        analysis
    );

    updateAICircleDisplay(
        prediction
    );
}

function buildAnalysisMessage(
    prediction
) {
    const a =
        prediction.analysis;

    if (!a) {
        return "Waiting for analysis.";
    }

    return (
        `${prediction.strategy} selected from ` +
        `${a.ticks} live ticks. ` +
        `Latest digit: ${a.latestDigit}.`
    );
}

function renderDigitStats(
    analysis
) {
    const grid =
        $("digitStatsGrid");

    if (!grid) {
        return;
    }

    grid.innerHTML = "";

    for (let i = 0; i < 10; i++) {
        const item =
            document.createElement("div");

        item.className =
            "digit-stat";

        item.innerHTML = `
            <div>${i}</div>
            <strong>
                ${analysis.percentages[
                    i
                ].toFixed(1)}%
            </strong>
        `;

        grid.appendChild(item);
    }
}


/* =========================================================
   AI CIRCLE DISPLAY
========================================================= */

function updateAICircleDisplay(
    prediction
) {
    if (!prediction) {
        return;
    }

    text(
        "aiCircleStatus",
        "READY"
    );

    text(
        "aiCircleLabel",
        prediction.strategy
    );

    text(
        "aiCirclePrediction",
        prediction.prediction
    );

    text(
        "aiCircleTimer",
        "LIVE"
    );
}


/* =========================================================
   CIRCULAR AI
   ---------------------------------------------------------
   CORE FIX
========================================================= */

function startCircularAI() {
    if (state.circular.running) {
        return;
    }

    state.circular.running = true;

    state.circular.phase =
        "ANALYZING";

    state.circular.seconds =
        CONFIG.CIRCULAR_ANALYSIS_SECONDS;

    state.circular.cycle++;

    /*
     * Always choose the current market.
     */
    const selected =
        value(
            "circularMarketSelect"
        );

    if (
        selected &&
        CONFIG.MARKETS.includes(
            selected
        )
    ) {
        state.circular.market =
            selected;
    }

    updateCircularStatusUI();

    /*
     * Run immediately.
     * Do NOT wait 1 second before
     * displaying the first countdown.
     */
    runCircularSecond();
}

function stopCircularAI() {
    state.circular.running = false;

    clearTimeout(
        state.circular.timer
    );

    state.circular.timer = null;

    state.circular.phase =
        "STOPPED";

    state.circular.seconds = 10;

    state.circular.pendingTrade =
        null;

    updateCircularStatusUI();
}

function runCircularSecond() {
    if (!state.circular.running) {
        return;
    }

    updateCircularStatusUI();

    state.circular.timer =
        setTimeout(() => {
            circularTick();
        }, 1000);
}

function circularTick() {
    if (!state.circular.running) {
        return;
    }

    /*
     * ANALYSIS
     */
    if (
        state.circular.phase ===
        "ANALYZING"
    ) {
        const market =
            getCircularMarket();

        state.circular.market =
            market;

        const analysis =
            analyzeMarket(market);

        /*
         * Keep counting even while
         * waiting for data.
         */
        if (
            state.circular.seconds > 0
        ) {
            state.circular.seconds--;
        }

        /*
         * At zero, create prediction.
         */
        if (
            state.circular.seconds <= 0
        ) {
            if (!analysis.ready) {
                /*
                 * Not enough data:
                 * restart another analysis
                 * cycle instead of becoming stuck.
                 */
                state.circular.seconds =
                    CONFIG.CIRCULAR_ANALYSIS_SECONDS;

                state.circular.cycle++;

                state.circular.prediction =
                    "WAITING FOR DATA";

                state.circular.confidence =
                    0;

                updateCircularStatusUI();

                runCircularSecond();

                return;
            }

            const prediction =
                generatePrediction(
                    market,
                    getCircularStrategy()
                );

            state.circular.prediction =
                prediction;

            state.circular.analysisSnapshot =
                prediction.analysis;

            state.circular.confidence =
                prediction.confidence;

            state.circular.phase =
                "PREDICTING";

            state.circular.seconds =
                CONFIG.CIRCULAR_PREDICTION_SECONDS;

            updateCircularStatusUI();

            runCircularSecond();

            return;
        }

        updateCircularStatusUI();

        runCircularSecond();

        return;
    }


    /*
     * PREDICTION
     */
    if (
        state.circular.phase ===
        "PREDICTING"
    ) {
        if (
            state.circular.seconds > 0
        ) {
            state.circular.seconds--;
        }

        if (
            state.circular.seconds <= 0
        ) {
            state.circular.phase =
                "TRADE WINDOW";

            state.circular.seconds =
                CONFIG.CIRCULAR_TRADE_SECONDS;

            /*
             * Create the paper trade
             * at the beginning of the
             * trade window.
             */
            createCircularPaperTrade();

            updateCircularStatusUI();

            runCircularSecond();

            return;
        }

        updateCircularStatusUI();

        runCircularSecond();

        return;
    }


    /*
     * TRADE WINDOW
     */
    if (
        state.circular.phase ===
        "TRADE WINDOW"
    ) {
        if (
            state.circular.seconds > 0
        ) {
            state.circular.seconds--;
        }

        if (
            state.circular.seconds <= 0
        ) {
            state.circular.phase =
                "COOLDOWN";

            state.circular.seconds =
                CONFIG.CIRCULAR_COOLDOWN_SECONDS;

            updateCircularStatusUI();

            runCircularSecond();

            return;
        }

        updateCircularStatusUI();

        runCircularSecond();

        return;
    }


    /*
     * COOLDOWN
     */
    if (
        state.circular.phase ===
        "COOLDOWN"
    ) {
        if (
            state.circular.seconds > 0
        ) {
            state.circular.seconds--;
        }

        if (
            state.circular.seconds <= 0
        ) {
            state.circular.phase =
                "ANALYZING";

            state.circular.seconds =
                CONFIG.CIRCULAR_ANALYSIS_SECONDS;

            state.circular.pendingTrade =
                null;

            state.circular.cycle++;

            updateCircularStatusUI();

            runCircularSecond();

            return;
        }

        updateCircularStatusUI();

        runCircularSecond();

        return;
    }
}


/* =========================================================
   CIRCULAR MARKET / STRATEGY
========================================================= */

function getCircularMarket() {
    const selected =
        value(
            "circularMarketSelect"
        );

    if (
        selected &&
        CONFIG.MARKETS.includes(
            selected
        )
    ) {
        return selected;
    }

    return (
        state.circular.market ||
        state.selectedMarket ||
        "1HZ100V"
    );
}

function getCircularStrategy() {
    const selected =
        state.circular.strategy;

    if (
        selected &&
        selected !== "AUTO" &&
        CONFIG.STRATEGIES.includes(
            selected
        )
    ) {
        return selected;
    }

    return "AUTO";
}


/* =========================================================
   CIRCULAR UI
========================================================= */

function updateCircularStatusUI() {
    const c =
        state.circular;

    const phase =
        c.running
            ? c.phase
            : "STOPPED";

    text(
        "circularStatusText",
        phase
    );

    text(
        "aiCircleStatus",
        phase
    );

    text(
        "aiCircleTimer",
        c.running
            ? String(c.seconds)
            : "10"
    );

    text(
        "cycleAnalysis",
        c.running
            ? `${c.phase}`
            : "STOPPED"
    );

    text(
        "cycleTrade",
        c.pendingTrade
            ? "PAPER TRADE ACTIVE"
            : "NO PAPER TRADE"
    );

    text(
        "cycleCooldown",
        c.phase === "COOLDOWN"
            ? String(c.seconds)
            : "—"
    );

    const prediction =
        c.prediction;

    if (
        prediction &&
        typeof prediction ===
            "object"
    ) {
        text(
            "aiCirclePrediction",
            prediction.prediction
        );

        text(
            "analysisConfidence",
            pct(
                prediction.confidence
            )
        );

        text(
            "aiPrediction",
            prediction.prediction
        );

        text(
            "aiType",
            prediction.strategy
        );

        text(
            "aiMarket",
            prediction.market
        );
    } else {
        text(
            "aiCirclePrediction",
            c.prediction ||
                "WAITING"
        );
    }

    updateCircularButtonUI();

    updateCircularStats();
}

function updateCircularButtonUI() {
    const button =
        $("startCircularTradeBtn");

    if (!button) {
        return;
    }

    if (state.circular.running) {
        button.textContent =
            "STOP CIRCULAR AI";

        button.dataset.running =
            "true";
    } else {
        button.textContent =
            "START CIRCULAR AI";

        button.dataset.running =
            "false";
    }
}

function updateCircularDataStatus() {
    const analysis =
        analyzeMarket(
            state.circular.market
        );

    if (
        analysis.ready
    ) {
        text(
            "circularStatusText",
            state.circular.phase
        );
    } else {
        text(
            "circularStatusText",
            "COLLECTING DATA"
        );
    }
}

function updateCircularLiveDisplay() {
    if (
        !state.circular.running
    ) {
        return;
    }

    const market =
        state.circular.market;

    const latest =
        state.latestTick[
            market
        ];

    if (latest) {
        text(
            "currentLivePrice",
            Number(
                latest.quote
            ).toFixed(5)
        );
    }

    /*
     * During analysis, continuously
     * refresh the prediction preview.
     */
    if (
        state.circular.phase ===
        "ANALYZING"
    ) {
        const prediction =
            generatePrediction(
                market,
                getCircularStrategy()
            );

        if (prediction.ready) {
            text(
                "aiCirclePrediction",
                prediction.prediction
            );

            text(
                "aiCircleLabel",
                prediction.strategy
            );

            text(
                "analysisConfidence",
                pct(
                    prediction.confidence
                )
            );
        }
    }
}


/* =========================================================
   CIRCULAR PAPER TRADE
========================================================= */

function createCircularPaperTrade() {
    if (
        !state.circular.running
    ) {
        return;
    }

    const prediction =
        state.circular.prediction;

    if (
        !prediction ||
        typeof prediction !==
            "object" ||
        !prediction.ready
    ) {
        return;
    }

    const market =
        state.circular.market;

    const stake =
        readStake(
            "circularStakeInput",
            1
        );

    if (stake <= 0) {
        return;
    }

    if (
        state.demoBalance < stake
    ) {
        toast(
            "Demo balance is too low."
        );

        return;
    }

    /*
     * Risk controls.
     */
    if (
        riskLimitReached()
    ) {
        stopAllTrading(
            "Risk limit reached"
        );

        return;
    }

    const latest =
        state.latestTick[
            market
        ];

    const entryDigit =
        latest
            ? latest.digit
            : null;

    const trade = {
        id:
            randomId("CIRC"),

        engine:
            "CIRCULAR AI",

        market,

        strategy:
            prediction.strategy,

        prediction:
            prediction.prediction,

        targetDigit:
            prediction.targetDigit,

        confidence:
            prediction.confidence,

        stake,

        entryDigit,

        entryPrice:
            latest?.quote ?? null,

        openedAt:
            Date.now(),

        status: "ACTIVE",

        demo: true
    };

    /*
     * Deduct demo stake.
     */
    state.demoBalance -= stake;

    state.activeTrades.push(
        trade
    );

    state.circular.pendingTrade =
        trade;

    updateAccountUI();

    renderActiveTrades();

    updateHistoryUI();

    saveState();

    toast(
        `Circular AI trade: ${prediction.prediction}`
    );
}


/* =========================================================
   STAKE
========================================================= */

function readStake(
    id,
    fallback
) {
    const n =
        Number(value(id));

    if (
        !Number.isFinite(n) ||
        n <= 0
    ) {
        return fallback;
    }

    return Math.min(
        n,
        100000
    );
}


/* =========================================================
   TRADE SETTLEMENT
========================================================= */

function settleTradesForMarket(
    market,
    tick
) {
    const active =
        state.activeTrades.filter(
            trade =>
                trade.market ===
                market &&
                trade.status ===
                    "ACTIVE"
        );

    if (!active.length) {
        return;
    }

    for (const trade of active) {
        /*
         * Give the trade at least
         * one tick after entry.
         */
        if (
            tick.epoch <=
            (trade.openedAt / 1000)
        ) {
            continue;
        }

        /*
         * A paper option settles
         * on the next tick.
         */
        settlePaperTrade(
            trade,
            tick
        );
    }
}

function settlePaperTrade(
    trade,
    exitTick
) {
    if (
        trade.status !== "ACTIVE"
    ) {
        return;
    }

    const exitDigit =
        Number(exitTick.digit);

    const won =
        evaluateTrade(
            trade,
            exitDigit
        );

    trade.exitDigit =
        exitDigit;

    trade.exitPrice =
        exitTick.quote;

    trade.closedAt =
        Date.now();

    trade.status =
        won
            ? "WIN"
            : "LOSS";

    let amountWon = 0;
    let profit = 0;

    if (won) {
        const multiplier =
            CONFIG.PAYOUT_MULTIPLIER[
                trade.strategy
            ] ?? 0.95;

        amountWon =
            trade.stake *
            (1 + multiplier);

        profit =
            amountWon -
            trade.stake;

        state.demoBalance +=
            amountWon;

        state.stats.wins++;

        if (
            trade.engine ===
            "CIRCULAR AI"
        ) {
            state.circular.wins++;
        }
    } else {
        amountWon = 0;

        profit =
            -trade.stake;

        state.stats.losses++;

        if (
            trade.engine ===
            "CIRCULAR AI"
        ) {
            state.circular.losses++;
        }
    }

    state.stats.total++;

    if (
        trade.engine ===
        "CIRCULAR AI"
    ) {
        state.circular.total++;
    }

    trade.amountWon =
        amountWon;

    trade.profit =
        profit;

    state.history.unshift(
        trade
    );

    state.activeTrades =
        state.activeTrades.filter(
            t =>
                t.id !== trade.id
        );

    if (
        state.circular.pendingTrade &&
        state.circular.pendingTrade.id ===
            trade.id
    ) {
        state.circular.pendingTrade =
            null;
    }

    updateAccountUI();

    renderHistory();

    renderActiveTrades();

    updateStatsUI();

    updateCircularStats();

    saveState();

    toast(
        won
            ? `WIN +${money(profit)}`
            : `LOSS -${money(trade.stake)}`
    );

    checkRiskLimits();
}


/* =========================================================
   TRADE EVALUATION
========================================================= */

function evaluateTrade(
    trade,
    exitDigit
) {
    switch (trade.strategy) {
        case "MATCHES":
            return (
                exitDigit ===
                Number(
                    trade.targetDigit
                )
            );

        case "DIFFERS":
            return (
                exitDigit !==
                Number(
                    trade.targetDigit
                )
            );

        case "OVER":
            return exitDigit >= 5;

        case "UNDER":
            return exitDigit <= 4;

        case "EVEN":
            return (
                exitDigit % 2 ===
                0
            );

        case "ODD":
            return (
                exitDigit % 2 ===
                1
            );

        default:
            return false;
    }
}


/* =========================================================
   AI BOT
========================================================= */

function startAIBot() {
    if (
        state.aiBot.running
    ) {
        return;
    }

    state.aiBot.running = true;

    text(
        "botStatusDash",
        "RUNNING"
    );

    toast(
        "AI BOT started"
    );

    runBotCycle();
}

function stopAIBot() {
    state.aiBot.running = false;

    clearTimeout(
        state.aiBot.timer
    );

    state.aiBot.timer = null;

    text(
        "botStatusDash",
        "STOPPED"
    );
}

function runBotCycle() {
    if (
        !state.aiBot.running
    ) {
        return;
    }

    const market =
        value(
            "botSelectedMarket"
        ) ||
        state.selectedMarket;

    const selectedStrategy =
        state.bot.strategy ||
        "AUTO";

    const prediction =
        generatePrediction(
            market,
            selectedStrategy
        );

    if (prediction.ready) {
        text(
            "botSelectedMarket",
            market
        );

        text(
            "botScore",
            pct(
                prediction.confidence
            )
        );

        text(
            "botConfidence",
            pct(
                prediction.confidence
            )
        );

        text(
            "aiPredictionLarge",
            prediction.prediction
        );

        text(
            "predictionConfidence",
            pct(
                prediction.confidence
            )
        );

        createBotPaperTrade(
            prediction
        );
    }

    state.aiBot.timer =
        setTimeout(
            runBotCycle,
            CONFIG.BOT_INTERVAL_SECONDS *
                1000
        );
}

function createBotPaperTrade(
    prediction
) {
    const stake =
        readStake(
            "stakeInput",
            1
        );

    if (
        state.demoBalance <
        stake
    ) {
        return;
    }

    if (
        riskLimitReached()
    ) {
        stopAIBot();

        return;
    }

    const market =
        prediction.market;

    const latest =
        state.latestTick[
            market
        ];

    const trade = {
        id:
            randomId("BOT"),

        engine:
            "AI BOT",

        market,

        strategy:
            prediction.strategy,

        prediction:
            prediction.prediction,

        targetDigit:
            prediction.targetDigit,

        confidence:
            prediction.confidence,

        stake,

        entryDigit:
            latest?.digit ?? null,

        entryPrice:
            latest?.quote ?? null,

        openedAt:
            Date.now(),

        status: "ACTIVE",

        demo: true
    };

    state.demoBalance -=
        stake;

    state.activeTrades.push(
        trade
    );

    updateAccountUI();

    renderActiveTrades();

    saveState();
}


/* =========================================================
   MANUAL TRADE
========================================================= */

function placeManualTrade() {
    const market =
        value(
            "manualMarketSelect"
        ) ||
        state.selectedMarket;

    const strategy =
        state.manual.strategy ||
        "MATCHES";

    const stake =
        readStake(
            "manualStakeInput",
            1
        );

    if (
        state.demoBalance <
        stake
    ) {
        toast(
            "Insufficient demo balance."
        );

        return;
    }

    let targetDigit =
        Number(
            value(
                "manualTargetDigitInput"
            )
        );

    if (
        (
            strategy === "MATCHES" ||
            strategy === "DIFFERS"
        ) &&
        (
            !Number.isInteger(
                targetDigit
            ) ||
            targetDigit < 0 ||
            targetDigit > 9
        )
    ) {
        toast(
            "Enter a target digit from 0 to 9."
        );

        return;
    }

    if (
        riskLimitReached()
    ) {
        return;
    }

    const latest =
        state.latestTick[
            market
        ];

    const trade = {
        id:
            randomId("MANUAL"),

        engine:
            "MANUAL",

        market,

        strategy,

        prediction:
            manualPredictionText(
                strategy,
                targetDigit
            ),

        targetDigit:
            strategy === "MATCHES" ||
            strategy === "DIFFERS"
                ? targetDigit
                : null,

        confidence: 0,

        stake,

        entryDigit:
            latest?.digit ?? null,

        entryPrice:
            latest?.quote ?? null,

        openedAt:
            Date.now(),

        status: "ACTIVE",

        demo: true
    };

    state.demoBalance -=
        stake;

    state.activeTrades.push(
        trade
    );

    updateAccountUI();

    renderActiveTrades();

    saveState();

    toast(
        "Manual paper trade placed."
    );
}

function manualPredictionText(
    strategy,
    digit
) {
    if (
        strategy === "MATCHES"
    ) {
        return (
            "DIGIT " +
            digit
        );
    }

    if (
        strategy === "DIFFERS"
    ) {
        return (
            "NOT " +
            digit
        );
    }

    return strategy;
}


/* =========================================================
   STATS
========================================================= */

function updateStatsUI() {
    text(
        "paperTotal",
        state.stats.total
    );

    text(
        "paperWins",
        state.stats.wins
    );

    text(
        "paperLosses",
        state.stats.losses
    );

    const accuracy =
        state.stats.total
            ? (
                  state.stats.wins /
                  state.stats.total
              ) * 100
            : 0;

    text(
        "paperAccuracy",
        pct(accuracy)
    );
}

function updateCircularStats() {
    const total =
        state.circular.total;

    const accuracy =
        total
            ? (
                  state.circular.wins /
                  total
              ) * 100
            : 0;

    text(
        "analysisConfidence",
        state.circular.confidence
            ? pct(
                  state.circular.confidence
              )
            : "—"
    );

    /*
     * The existing HTML has no dedicated
     * circular accuracy ID in some versions.
     * If it exists, update it.
     */
    const circularAccuracy =
        document.querySelector(
            "[data-circular-accuracy]"
        );

    if (circularAccuracy) {
        circularAccuracy.textContent =
            pct(accuracy);
    }

    const possibleIds = [
        "circularAccuracy",
        "aiCircleAccuracy",
        "cycleAccuracy"
    ];

    for (const id of possibleIds) {
        text(
            id,
            pct(accuracy)
        );
    }
}


/* =========================================================
   ACTIVE TRADES
========================================================= */

function renderActiveTrades() {
    const container =
        $("activeTradesList");

    text(
        "activeTradeCount",
        state.activeTrades.length
    );

    if (!container) {
        return;
    }

    if (
        !state.activeTrades.length
    ) {
        container.innerHTML =
            `<div class="empty-state">
                No active paper trades.
             </div>`;

        return;
    }

    container.innerHTML =
        state.activeTrades
            .map(trade => `
                <div class="active-trade-card">
                    <div>
                        <strong>
                            ${escapeHTML(
                                trade.engine
                            )}
                        </strong>

                        <small>
                            ${escapeHTML(
                                trade.market
                            )}
                        </small>
                    </div>

                    <div>
                        <strong>
                            ${escapeHTML(
                                trade.prediction
                            )}
                        </strong>

                        <small>
                            ${money(
                                trade.stake
                            )}
                        </small>
                    </div>
                </div>
            `)
            .join("");
}


/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {
    const container =
        $("historyCardsList");

    if (!container) {
        return;
    }

    if (
        !state.history.length
    ) {
        container.innerHTML =
            `<div class="empty-state">
                No completed trades yet.
             </div>`;

        updateHistorySummary();

        return;
    }

    container.innerHTML =
        state.history
            .slice(0, 100)
            .map(trade => {
                const win =
                    trade.status ===
                    "WIN";

                return `
                    <div class="history-card ${
                        win
                            ? "history-win"
                            : "history-loss"
                    }">

                        <div class="history-card-top">
                            <strong>
                                ${escapeHTML(
                                    trade.engine
                                )}
                            </strong>

                            <span>
                                ${win
                                    ? "WIN"
                                    : "LOSS"}
                            </span>
                        </div>

                        <div class="history-card-main">
                            <div>
                                <small>
                                    MARKET
                                </small>

                                <strong>
                                    ${escapeHTML(
                                        trade.market
                                    )}
                                </strong>
                            </div>

                            <div>
                                <small>
                                    STRATEGY
                                </small>

                                <strong>
                                    ${escapeHTML(
                                        trade.strategy
                                    )}
                                </strong>
                            </div>

                            <div>
                                <small>
                                    PREDICTION
                                </small>

                                <strong>
                                    ${escapeHTML(
                                        trade.prediction
                                    )}
                                </strong>
                            </div>

                            <div>
                                <small>
                                    STAKE
                                </small>

                                <strong>
                                    ${money(
                                        trade.stake
                                    )}
                                </strong>
                            </div>

                            <div>
                                <small>
                                    AMOUNT WON
                                </small>

                                <strong>
                                    ${money(
                                        trade.amountWon
                                    )}
                                </strong>
                            </div>

                            <div>
                                <small>
                                    PROFIT
                                </small>

                                <strong class="${
                                    Number(
                                        trade.profit
                                    ) >= 0
                                        ? "positive"
                                        : "negative"
                                }">
                                    ${
                                        Number(
                                            trade.profit
                                        ) >= 0
                                            ? "+"
                                            : ""
                                    }${money(
                                        trade.profit
                                    )}
                                </strong>
                            </div>

                            <div>
                                <small>
                                    DIGIT
                                </small>

                                <strong>
                                    ${
                                        trade.entryDigit ??
                                        "—"
                                    }
                                    →
                                    ${
                                        trade.exitDigit ??
                                        "—"
                                    }
                                </strong>
                            </div>

                            <div>
                                <small>
                                    TIME
                                </small>

                                <strong>
                                    ${new Date(
                                        trade.closedAt ||
                                            trade.openedAt
                                    ).toLocaleTimeString()}
                                </strong>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join("");

    updateHistorySummary();
}

function updateHistorySummary() {
    let totalStake = 0;
    let amountWon = 0;
    let netProfit = 0;

    for (const trade of state.history) {
        totalStake +=
            Number(trade.stake) || 0;

        amountWon +=
            Number(
                trade.amountWon
            ) || 0;

        netProfit +=
            Number(
                trade.profit
            ) || 0;
    }

    text(
        "historyTotalStake",
        money(totalStake)
    );

    text(
        "historyAmountWon",
        money(amountWon)
    );

    text(
        "historyNetProfit",
        money(netProfit)
    );

    text(
        "totalProfitDisplay",
        money(netProfit)
    );

    text(
        "sessionProfitDisplay",
        money(netProfit)
    );
}


/* =========================================================
   RISK MANAGEMENT
========================================================= */

function readRiskSettings() {
    state.risk.takeProfit =
        Number(
            value(
                "takeProfitInput"
            )
        ) || 0;

    state.risk.stopLoss =
        Number(
            value(
                "stopLossInput"
            )
        ) || 0;
}

function currentNetProfit() {
    return state.history.reduce(
        (sum, trade) =>
            sum +
            (
                Number(
                    trade.profit
                ) || 0
            ),
        0
    );
}

function riskLimitReached() {
    readRiskSettings();

    const profit =
        currentNetProfit();

    if (
        state.risk.takeProfit > 0 &&
        profit >=
            state.risk.takeProfit
    ) {
        stopAllTrading(
            "Take profit reached."
        );

        return true;
    }

    if (
        state.risk.stopLoss > 0 &&
        profit <=
            -state.risk.stopLoss
    ) {
        stopAllTrading(
            "Stop loss reached."
        );

        return true;
    }

    return false;
}

function checkRiskLimits() {
    riskLimitReached();
}

function stopAllTrading(
    reason = "Trading stopped"
) {
    stopAIBot();

    stopCircularAI();

    text(
        "tradingStatusLabel",
        "STOPPED"
    );

    toast(reason);
}


/* =========================================================
   STRATEGY UI
========================================================= */

function setupStrategyUI() {
    /*
     * Circular strategy.
     */
    const circularTrigger =
        $("circularStrategyTrigger");

    if (circularTrigger) {
        circularTrigger.addEventListener(
            "click",
            () => {
                openStrategyModal(
                    "circular"
                );
            }
        );
    }

    /*
     * Manual strategy.
     */
    const manualTrigger =
        $("manualStrategyTrigger");

    if (manualTrigger) {
        manualTrigger.addEventListener(
            "click",
            () => {
                openStrategyModal(
                    "manual"
                );
            }
        );
    }

    /*
     * Bot strategy.
     */
    const botTrigger =
        $("botStrategyTrigger");

    if (botTrigger) {
        botTrigger.addEventListener(
            "click",
            () => {
                const modal =
                    $("botStrategyModal");

                if (modal) {
                    modal.classList.add(
                        "show"
                    );
                }
            }
        );
    }

    const closeBot =
        $("closeBotStrategyModal");

    if (closeBot) {
        closeBot.addEventListener(
            "click",
            () => {
                const modal =
                    $("botStrategyModal");

                if (modal) {
                    modal.classList.remove(
                        "show"
                    );
                }
            }
        );
    }

    const applyBot =
        $("applyBotStrategies");

    if (applyBot) {
        applyBot.addEventListener(
            "click",
            () => {
                const checks =
                    document.querySelectorAll(
                        ".bot-strategy-check:checked"
                    );

                if (!checks.length) {
                    state.bot.strategy =
                        "AUTO";
                } else {
                    state.bot.strategy =
                        checks[0].value;
                }

                text(
                    "botStrategyLabel",
                    state.bot.strategy
                );

                const modal =
                    $("botStrategyModal");

                if (modal) {
                    modal.classList.remove(
                        "show"
                    );
                }
            }
        );
    }
}

function openStrategyModal(
    target
) {
    const modal =
        $("strategyModal");

    const options =
        $("strategyOptions");

    if (!modal || !options) {
        return;
    }

    options.innerHTML = "";

    const list =
        ["AUTO", ...CONFIG.STRATEGIES];

    for (const strategy of list) {
        const button =
            document.createElement(
                "button"
            );

        button.className =
            "strategy-option";

        button.textContent =
            strategy;

        button.addEventListener(
            "click",
            () => {
                if (
                    target ===
                    "circular"
                ) {
                    state.circular.strategy =
                        strategy;

                    text(
                        "circularStrategyLabel",
                        strategy
                    );
                }

                if (
                    target ===
                    "manual"
                ) {
                    state.manual.strategy =
                        strategy;

                    text(
                        "manualSelectedStrategyLabel",
                        strategy
                    );

                    updateTargetDigitVisibility();
                }

                modal.classList.remove(
                    "show"
                );
            }
        );

        options.appendChild(
            button
        );
    }

    modal.classList.add(
        "show"
    );
}

function updateTargetDigitVisibility() {
    const container =
        $("targetDigitContainer");

    if (!container) {
        return;
    }

    const needsDigit =
        state.manual.strategy ===
            "MATCHES" ||
        state.manual.strategy ===
            "DIFFERS";

    container.style.display =
        needsDigit
            ? ""
            : "none";
}


/* =========================================================
   EVENT SETUP
========================================================= */

function setupEvents() {
    /*
     * Start/stop circular.
     */
    const circularButton =
        $("startCircularTradeBtn");

    if (circularButton) {
        circularButton.addEventListener(
            "click",
            () => {
                if (
                    state.circular.running
                ) {
                    stopCircularAI();
                    toast(
                        "Circular AI stopped."
                    );
                } else {
                    startCircularAI();

                    toast(
                        "Circular AI started."
                    );
                }
            }
        );
    }

    /*
     * Dedicated start AI button.
     */
    const startAI =
        $("startAI");

    if (startAI) {
        startAI.addEventListener(
            "click",
            () => {
                startCircularAI();

                toast(
                    "AI analysis started."
                );
            }
        );
    }

    /*
     * Stop AI button.
     */
    const stopAI =
        $("stopAI");

    if (stopAI) {
        stopAI.addEventListener(
            "click",
            () => {
                stopCircularAI();

                toast(
                    "AI analysis stopped."
                );
            }
        );
    }

    /*
     * AI bot.
     */
    const botButton =
        $("startBotBtn");

    if (botButton) {
        botButton.addEventListener(
            "click",
            () => {
                if (
                    state.aiBot.running
                ) {
                    stopAIBot();

                    botButton.textContent =
                        "START AI BOT";
                } else {
                    startAIBot();

                    botButton.textContent =
                        "STOP AI BOT";
                }
            }
        );
    }

    /*
     * Manual trade.
     */
    const manualButton =
        $("placeTradeBtn");

    if (manualButton) {
        manualButton.addEventListener(
            "click",
            placeManualTrade
        );
    }

    /*
     * Global stop.
     */
    const stopTrading =
        $("stopTradingBtn");

    if (stopTrading) {
        stopTrading.addEventListener(
            "click",
            () => {
                stopAllTrading(
                    "All automated trading stopped."
                );
            }
        );
    }

    /*
     * Connect button.
     */
    const connectButton =
        $("connectDerivBtn");

    if (connectButton) {
        connectButton.addEventListener(
            "click",
            () => {
                connectDeriv();
            }
        );
    }

    /*
     * Clear history.
     */
    const clearLogs =
        $("clearLogsBtn");

    if (clearLogs) {
        clearLogs.addEventListener(
            "click",
            () => {
                if (
                    !confirm(
                        "Clear trading history?"
                    )
                ) {
                    return;
                }

                state.history = [];

                state.stats = {
                    total: 0,
                    wins: 0,
                    losses: 0
                };

                state.circular.wins =
                    0;

                state.circular.losses =
                    0;

                state.circular.total =
                    0;

                renderHistory();

                updateStatsUI();

                updateCircularStats();

                saveState();

                toast(
                    "History cleared."
                );
            }
        );
    }

    /*
     * Circular market.
     */
    const circularMarket =
        $("circularMarketSelect");

    if (circularMarket) {
        circularMarket.addEventListener(
            "change",
            () => {
                state.circular.market =
                    circularMarket.value;

                /*
                 * Make sure this market
                 * has a live subscription.
                 */
                subscribeMarket(
                    state.circular.market
                );

                updateCircularDataStatus();
            }
        );
    }

    /*
     * Manual market.
     */
    const manualMarket =
        $("manualMarketSelect");

    if (manualMarket) {
        manualMarket.addEventListener(
            "change",
            () => {
                state.selectedMarket =
                    manualMarket.value;

                subscribeMarket(
                    state.selectedMarket
                );

                updateAnalysisUI(
                    state.selectedMarket
                );
            }
        );
    }

    /*
     * Bot market.
     */
    const botMarket =
        $("botSelectedMarket");

    if (botMarket) {
        botMarket.addEventListener(
            "change",
            () => {
                state.selectedMarket =
                    botMarket.value;

                subscribeMarket(
                    state.selectedMarket
                );
            }
        );
    }

    /*
     * Close strategy modal.
     */
    const closeStrategy =
        $("closeStrategyModal");

    if (closeStrategy) {
        closeStrategy.addEventListener(
            "click",
            () => {
                const modal =
                    $("strategyModal");

                if (modal) {
                    modal.classList.remove(
                        "show"
                    );
                }
            }
        );
    }

    /*
     * Navigation.
     */
    document
        .querySelectorAll(
            "[data-page]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    const page =
                        button.dataset.page;

                    switchPage(page);
                }
            );
        });

    /*
     * Theme toggle.
     */
    const theme =
        $("themeToggle");

    if (theme) {
        theme.addEventListener(
            "click",
            () => {
                document.body.classList.toggle(
                    "light-mode"
                );
            }
        );
    }

    /*
     * Demo mode button.
     */
    const demoButton =
        $("demoModeBtn");

    if (demoButton) {
        demoButton.addEventListener(
            "click",
            () => {
                state.accountMode =
                    "DEMO";

                state.realConfirmed =
                    false;

                updateAccountUI();

                toast(
                    "Demo / Paper mode active."
                );
            }
        );
    }

    /*
     * Real mode button.
     * Confirmation only. No real trade execution
     * is performed by this version.
     */
    const realButton =
        $("realModeBtn");

    if (realButton) {
        realButton.addEventListener(
            "click",
            requestRealConfirmation
        );
    }

    const confirmReal =
        $("confirmRealBtn");

    if (confirmReal) {
        confirmReal.addEventListener(
            "click",
            () => {
                state.realConfirmed =
                    true;

                /*
                 * Keep paper execution for safety.
                 */
                state.accountMode =
                    "DEMO";

                const modal =
                    $("realConfirmModal");

                if (modal) {
                    modal.classList.remove(
                        "show"
                    );
                }

                toast(
                    "Real mode confirmed, but this build remains paper-only."
                );
            }
        );
    }

    const cancelReal =
        $("cancelRealBtn");

    if (cancelReal) {
        cancelReal.addEventListener(
            "click",
            () => {
                const modal =
                    $("realConfirmModal");

                if (modal) {
                    modal.classList.remove(
                        "show"
                    );
                }
            }
        );
    }
}

function requestRealConfirmation() {
    const modal =
        $("realConfirmModal");

    if (modal) {
        modal.classList.add(
            "show"
        );

        return;
    }

    const accepted =
        confirm(
            "Real-money trading requires authenticated Deriv account access. Continue?"
        );

    if (accepted) {
        toast(
            "Real mode requires authenticated Deriv trading. This build remains paper-only."
        );
    }
}


/* =========================================================
   NAVIGATION
========================================================= */

function switchPage(page) {
    const pages = [
        "analysis",
        "trade",
        "history"
    ];

    for (const name of pages) {
        const el =
            $(
                name +
                    "Page"
            );

        if (el) {
            el.style.display =
                name === page
                    ? ""
                    : "none";
        }
    }

    document
        .querySelectorAll(
            "[data-page]"
        )
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.page ===
                    page
            );
        });

    if (
        page === "analysis"
    ) {
        updateAnalysisUI(
            state.selectedMarket
        );
    }

    if (
        page === "history"
    ) {
        renderHistory();
    }
}


/* =========================================================
   MARKET SELECTORS
========================================================= */

function populateMarketSelectors() {
    const ids = [
        "circularMarketSelect",
        "manualMarketSelect",
        "botSelectedMarket"
    ];

    for (const id of ids) {
        const select = $(id);

        if (!select) {
            continue;
        }

        select.innerHTML = "";

        for (
            const market of
            CONFIG.MARKETS
        ) {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                market;

            option.textContent =
                market;

            select.appendChild(
                option
            );
        }

        select.value =
            state.selectedMarket;
    }

    state.circular.market =
        state.selectedMarket;
}


/* =========================================================
   TARGET DIGIT
========================================================= */

function setupTargetDigit() {
    updateTargetDigitVisibility();

    const input =
        $("manualTargetDigitInput");

    if (!input) {
        return;
    }

    input.addEventListener(
        "input",
        () => {
            let n =
                Number(input.value);

            if (
                !Number.isInteger(n) ||
                n < 0 ||
                n > 9
            ) {
                input.value = "";
            }
        }
    );
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   INITIALIZE
========================================================= */

function init() {
    console.log(
        `${CONFIG.APP_NAME} ${CONFIG.VERSION} starting...`
    );

    /*
     * Demo is dominant.
     */
    state.accountMode =
        "DEMO";

    state.realConfirmed =
        false;

    loadState();

    /*
     * Force demo mode after loading.
     */
    state.accountMode =
        "DEMO";

    state.realConfirmed =
        false;

    populateMarketSelectors();

    setupEvents();

    setupStrategyUI();

    setupTargetDigit();

    updateAccountUI();

    updateStatsUI();

    renderHistory();

    renderActiveTrades();

    updateCircularStats();

    updateCircularStatusUI();

    switchPage(
        "analysis"
    );

    /*
     * Connect to live Deriv public
     * market data.
     */
    connectDeriv();

    /*
     * Safety fallback:
     * if the WebSocket takes time,
     * Circular AI still starts and
     * displays its countdown.
     */
    setTimeout(() => {
        if (
            !state.circular.running
        ) {
            startCircularAI();
        }
    }, 1500);
}


/* =========================================================
   GLOBAL ERROR HANDLING
========================================================= */

window.addEventListener(
    "error",
    event => {
        console.error(
            "KRISHWAVE error:",
            event.error ||
                event.message
        );
    }
);

window.addEventListener(
    "unhandledrejection",
    event => {
        console.error(
            "KRISHWAVE promise error:",
            event.reason
        );
    }
);


/* =========================================================
   START
========================================================= */

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        init
    );
} else {
    init();
}