/* =========================================================
   KRISHWAVE AI BEAST V7.0
   LIVE DERIV MARKET INTELLIGENCE + TRADING ENGINE

   FEATURES
   ---------------------------------------------------------
   • Live Deriv tick data
   • Market scanner
   • Digit distribution
   • Even / Odd
   • Matches / Differs
   • Over / Under
   • AI BOT
   • Circular AI
   • Manual trading
   • Demo / Paper dominant mode
   • Explicit REAL-MONEY confirmation gate
   • Accuracy engine
   • Trade history
   • Amount won / loss
   • Take Profit
   • Stop Loss
   • Active trades
   • Session statistics
   • Dark / Light mode
========================================================= */

"use strict";

/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {
    APP_NAME: "KRISHWAVE",
    VERSION: "AI BEAST V7.0",

    DERIV_CLIENT_ID: "34khasPjsT0PCRR8X3Z70",

    REDIRECT_URI:
        "https://chrispusatale99-dot.github.io/KRISHWAVE/",

    PUBLIC_WS:
        "wss://api.derivws.com/trading/v1/options/ws/public",

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

    MARKET_NAMES: {
        R_10: "Volatility 10 Index",
        R_25: "Volatility 25 Index",
        R_50: "Volatility 50 Index",
        R_75: "Volatility 75 Index",
        R_100: "Volatility 100 Index",

        "1HZ10V": "Volatility 10 (1s)",
        "1HZ25V": "Volatility 25 (1s)",
        "1HZ30V": "Volatility 30 (1s)",
        "1HZ50V": "Volatility 50 (1s)",
        "1HZ75V": "Volatility 75 (1s)",
        "1HZ90V": "Volatility 90 (1s)",
        "1HZ100V": "Volatility 100 (1s)",
        "1HZ150V": "Volatility 150 (1s)",
        "1HZ250V": "Volatility 250 (1s)",
        "1HZ1000V": "Volatility 1000 (1s)"
    },

    STRATEGIES: {
        MATCHES: "Matches",
        DIFFERS: "Differs",
        OVER: "Over",
        UNDER: "Under",
        EVEN: "Even",
        ODD: "Odd"
    },

    STARTING_BALANCE: 1000,

    MAX_TICKS: 250,

    AI_INTERVAL: 3000,

    CIRCULAR_ANALYSIS_TIME: 10,
    CIRCULAR_PREDICTION_TIME: 5,
    CIRCULAR_TRADE_TIME: 3,
    CIRCULAR_COOLDOWN_TIME: 3,

    DEFAULT_STAKE: 1,

    STORAGE_KEY: "KRISHWAVE_V7_STATE"
};


/* =========================================================
   STATE
========================================================= */

const state = {

    /* Connection */
    socket: null,
    connected: false,
    reconnectTimer: null,
    reconnectAttempts: 0,

    /* Account */
    accountMode: "DEMO",
    realConfirmed: false,
    accountId: "DEMO ACCOUNT",
    currency: "USD",
    balance: CONFIG.STARTING_BALANCE,

    /* Market */
    selectedMarket: "R_100",
    currentPrice: 0,

    marketData: {},

    /* Engine */
    activeEngine: "AI BOT",

    botRunning: false,
    circularRunning: false,
    manualReady: true,

    botTimer: null,
    circularTimer: null,

    /* Strategy */
    botStrategies: [
        "MATCHES",
        "DIFFERS",
        "OVER",
        "UNDER",
        "EVEN",
        "ODD"
    ],

    botStrategy: "AUTO",

    circularStrategy: "AUTO",

    manualStrategy: "EVEN",

    /* Circular */
    circularPhase: "IDLE",
    circularCountdown: 0,

    /* Trades */
    activeTrades: [],
    history: [],

    tradeCounter: 0,

    /* Statistics */
    totalTrades: 0,
    wins: 0,
    losses: 0,

    totalStake: 0,
    totalWon: 0,
    totalLost: 0,
    netProfit: 0,

    /* AI accuracy */
    aiPredictions: 0,
    aiCorrect: 0,
    aiAccuracy: 0,

    /* Previous prediction */
    lastPrediction: null,

    /* Chart */
    chartPrices: [],

    /* Digit */
    latestDigit: null,

    /* Settings */
    stake: CONFIG.DEFAULT_STAKE,
    takeProfit: 0,
    stopLoss: 0,
    martingale: 1
};


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = id => document.getElementById(id);

function qs(selector) {
    return document.querySelector(selector);
}

function qsa(selector) {
    return [...document.querySelectorAll(selector)];
}

function safeText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function safeValue(id, value) {
    const el = $(id);
    if (el) el.value = value;
}

function show(el) {
    if (el) el.style.display = "";
}

function hide(el) {
    if (el) el.style.display = "none";
}


/* =========================================================
   FORMATTERS
========================================================= */

function money(value) {
    const number = Number(value) || 0;

    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: state.currency || "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(number);
}

function number(value, decimals = 5) {
    const n = Number(value);

    if (!Number.isFinite(n)) return "0";

    return n.toFixed(decimals);
}

function percent(value) {
    const n = Number(value) || 0;
    return `${Math.max(0, Math.min(100, n)).toFixed(1)}%`;
}

function now() {
    return new Date();
}

function timeString(date = now()) {
    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function dateString(date = now()) {
    return date.toLocaleDateString([], {
        year: "numeric",
        month: "short",
        day: "2-digit"
    });
}


/* =========================================================
   STORAGE
========================================================= */

function saveState() {
    try {
        const data = {
            accountMode: state.accountMode,
            balance: state.balance,
            history: state.history,
            totalTrades: state.totalTrades,
            wins: state.wins,
            losses: state.losses,
            totalStake: state.totalStake,
            totalWon: state.totalWon,
            totalLost: state.totalLost,
            netProfit: state.netProfit,
            aiPredictions: state.aiPredictions,
            aiCorrect: state.aiCorrect,
            selectedMarket: state.selectedMarket
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

        if (!raw) return;

        const data = JSON.parse(raw);

        if (data.accountMode === "DEMO") {
            state.accountMode = "DEMO";
        }

        if (Number.isFinite(data.balance)) {
            state.balance = data.balance;
        }

        if (Array.isArray(data.history)) {
            state.history = data.history;
        }

        state.totalTrades = Number(data.totalTrades) || 0;
        state.wins = Number(data.wins) || 0;
        state.losses = Number(data.losses) || 0;

        state.totalStake = Number(data.totalStake) || 0;
        state.totalWon = Number(data.totalWon) || 0;
        state.totalLost = Number(data.totalLost) || 0;
        state.netProfit = Number(data.netProfit) || 0;

        state.aiPredictions = Number(data.aiPredictions) || 0;
        state.aiCorrect = Number(data.aiCorrect) || 0;

        if (data.selectedMarket) {
            state.selectedMarket = data.selectedMarket;
        }

        calculateAccuracy();

    } catch (error) {
        console.warn("Could not restore state:", error);
    }
}


/* =========================================================
   INITIALIZE MARKET DATA
========================================================= */

function createMarketState() {
    const result = {};

    CONFIG.MARKETS.forEach(symbol => {
        result[symbol] = {
            ticks: [],
            digits: Array(10).fill(0),
            lastPrice: 0,
            lastDigit: null,
            updated: null,
            connected: false
        };
    });

    return result;
}

state.marketData = createMarketState();


/* =========================================================
   DIGIT EXTRACTION
========================================================= */

function getLastDigit(price) {
    const str = String(price);

    const cleaned = str.replace(/[^0-9]/g, "");

    if (!cleaned.length) return 0;

    return Number(cleaned.slice(-1));
}

function getDigitData(symbol) {
    return state.marketData[symbol] || {
        ticks: [],
        digits: Array(10).fill(0),
        lastPrice: 0,
        lastDigit: null
    };
}


/* =========================================================
   DERIV CONNECTION
========================================================= */

function connectDeriv() {

    if (state.socket) {
        try {
            state.socket.close();
        } catch (_) {}
    }

    updateConnectionUI(
        false,
        "CONNECTING..."
    );

    try {

        state.socket = new WebSocket(CONFIG.PUBLIC_WS);

        state.socket.addEventListener(
            "open",
            onSocketOpen
        );

        state.socket.addEventListener(
            "message",
            onSocketMessage
        );

        state.socket.addEventListener(
            "error",
            onSocketError
        );

        state.socket.addEventListener(
            "close",
            onSocketClose
        );

    } catch (error) {

        console.error(error);

        updateConnectionUI(
            false,
            "CONNECTION ERROR"
        );

        scheduleReconnect();
    }
}

function onSocketOpen() {

    state.connected = true;
    state.reconnectAttempts = 0;

    updateConnectionUI(
        true,
        "LIVE"
    );

    subscribeMarkets();

    toast(
        "Connected to Deriv live market data."
    );
}

function onSocketError(error) {

    console.warn(
        "Deriv socket error:",
        error
    );

    updateConnectionUI(
        false,
        "CONNECTION ERROR"
    );
}

function onSocketClose() {

    state.connected = false;

    updateConnectionUI(
        false,
        "RECONNECTING..."
    );

    scheduleReconnect();
}

function scheduleReconnect() {

    if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
    }

    const delay = Math.min(
        30000,
        2000 * Math.max(1, state.reconnectAttempts)
    );

    state.reconnectAttempts++;

    state.reconnectTimer = setTimeout(
        connectDeriv,
        delay
    );
}

function sendSocket(payload) {

    if (
        !state.socket ||
        state.socket.readyState !== WebSocket.OPEN
    ) {
        return false;
    }

    try {

        state.socket.send(
            JSON.stringify(payload)
        );

        return true;

    } catch (error) {

        console.error(
            "Socket send failed:",
            error
        );

        return false;
    }
}

function subscribeMarkets() {

    CONFIG.MARKETS.forEach(symbol => {

        sendSocket({
            ticks: symbol,
            subscribe: 1
        });

    });

    safeText(
        "dataStatus",
        "LIVE DATA"
    );
}


/* =========================================================
   SOCKET MESSAGE
========================================================= */

function onSocketMessage(event) {

    let data;

    try {
        data = JSON.parse(event.data);
    } catch (_) {
        return;
    }

    if (!data) return;

    if (data.error) {

        console.warn(
            "Deriv error:",
            data.error.message
        );

        return;
    }

    if (
        data.msg_type === "tick" &&
        data.tick
    ) {
        processTick(data.tick);
    }
}


/* =========================================================
   PROCESS TICK
========================================================= */

function processTick(tick) {

    const symbol = tick.symbol;

    if (!symbol) return;

    if (!state.marketData[symbol]) {
        state.marketData[symbol] = {
            ticks: [],
            digits: Array(10).fill(0),
            lastPrice: 0,
            lastDigit: null,
            updated: null,
            connected: true
        };
    }

    const market = state.marketData[symbol];

    const price = Number(tick.quote);

    if (!Number.isFinite(price)) {
        return;
    }

    const digit = getLastDigit(
        price
    );

    market.ticks.push({
        price,
        digit,
        epoch: tick.epoch || Date.now() / 1000
    });

    if (market.ticks.length > CONFIG.MAX_TICKS) {
        market.ticks.shift();
    }

    market.digits[digit]++;

    market.lastPrice = price;
    market.lastDigit = digit;
    market.updated = Date.now();
    market.connected = true;

    if (symbol === state.selectedMarket) {

        state.currentPrice = price;
        state.latestDigit = digit;

        updateAnalysisUI(symbol);

        updatePriceChart(price);
    }

    settleActiveTrades(
        symbol,
        digit,
        price
    );

    if (
        state.activeEngine === "AI BOT" &&
        state.botRunning
    ) {
        runBotCycle();
    }
}


/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket(symbol) {

    const market = getDigitData(symbol);

    const ticks = market.ticks;

    if (!ticks || ticks.length < 10) {

        return {
            ready: false,
            confidence: 0,
            prediction: "WAIT",
            strategy: "AUTO",
            message: "Collecting market data..."
        };
    }

    const recent =
        ticks.slice(-50);

    const counts =
        Array(10).fill(0);

    recent.forEach(t => {
        counts[t.digit]++;
    });

    const total =
        recent.length;

    const rates =
        counts.map(
            c => c / total
        );

    const evenCount =
        counts[0] +
        counts[2] +
        counts[4] +
        counts[6] +
        counts[8];

    const oddCount =
        counts[1] +
        counts[3] +
        counts[5] +
        counts[7] +
        counts[9];

    const evenRate =
        evenCount / total;

    const oddRate =
        oddCount / total;

    const highestDigit =
        counts.indexOf(
            Math.max(...counts)
        );

    const lowestDigit =
        counts.indexOf(
            Math.min(...counts)
        );

    const highCount =
        counts[5] +
        counts[6] +
        counts[7] +
        counts[8] +
        counts[9];

    const lowCount =
        counts[0] +
        counts[1] +
        counts[2] +
        counts[3] +
        counts[4];

    const highRate =
        highCount / total;

    const lowRate =
        lowCount / total;

    const recentDigits =
        recent.slice(-12)
            .map(t => t.digit);

    const lastDigit =
        recentDigits.at(-1);

    const previousDigit =
        recentDigits.at(-2);

    const trendHigh =
        recentDigits.filter(
            d => d >= 5
        ).length / recentDigits.length;

    const trendLow =
        1 - trendHigh;

    /* ---------------------------------------------
       Candidate strategies
    --------------------------------------------- */

    const candidates = [];

    const evenStrength =
        Math.abs(evenRate - 0.5);

    if (evenStrength > 0.08) {

        candidates.push({
            strategy:
                evenRate >= 0.5
                    ? "EVEN"
                    : "ODD",

            confidence:
                50 + evenStrength * 100
        });
    }

    const highStrength =
        Math.abs(highRate - 0.5);

    if (highStrength > 0.08) {

        candidates.push({
            strategy:
                highRate >= 0.5
                    ? "OVER"
                    : "UNDER",

            confidence:
                50 + highStrength * 100
        });
    }

    const dominantRate =
        Math.max(...rates);

    if (dominantRate > 0.14) {

        candidates.push({
            strategy: "MATCHES",
            confidence:
                45 + dominantRate * 100
        });

        candidates.push({
            strategy: "DIFFERS",
            confidence:
                55 + (1 - dominantRate) * 20
        });
    }

    /* ---------------------------------------------
       Trend adjustment
    --------------------------------------------- */

    candidates.forEach(c => {

        if (
            c.strategy === "OVER" &&
            trendHigh > 0.60
        ) {
            c.confidence += 5;
        }

        if (
            c.strategy === "UNDER" &&
            trendLow > 0.60
        ) {
            c.confidence += 5;
        }

        if (
            c.strategy === "EVEN" &&
            evenRate > 0.57
        ) {
            c.confidence += 5;
        }

        if (
            c.strategy === "ODD" &&
            oddRate > 0.57
        ) {
            c.confidence += 5;
        }

    });

    candidates.sort(
        (a, b) =>
            b.confidence -
            a.confidence
    );

    let best =
        candidates[0];

    if (!best) {

        best = {
            strategy: "DIFFERS",
            confidence: 55
        };
    }

    const confidence =
        Math.min(
            94,
            Math.max(
                51,
                best.confidence
            )
        );

    let prediction =
        strategyPrediction(
            best.strategy,
            counts,
            rates,
            highestDigit,
            lowestDigit
        );

    return {

        ready: true,

        strategy:
            best.strategy,

        confidence,

        prediction,

        highestDigit,

        lowestDigit,

        evenRate,

        oddRate,

        highRate,

        lowRate,

        lastDigit,

        previousDigit,

        counts,

        total,

        message:
            buildAnalysisMessage(
                best.strategy,
                confidence,
                highestDigit,
                lowestDigit
            )
    };
}


/* =========================================================
   STRATEGY PREDICTION
========================================================= */

function strategyPrediction(
    strategy,
    counts,
    rates,
    highestDigit,
    lowestDigit
) {

    switch (strategy) {

        case "MATCHES":
            return `DIGIT ${highestDigit}`;

        case "DIFFERS":
            return `NOT ${highestDigit}`;

        case "OVER":
            return "6–9";

        case "UNDER":
            return "0–4";

        case "EVEN":
            return "EVEN";

        case "ODD":
            return "ODD";

        default:
            return "WAIT";
    }
}


/* =========================================================
   ANALYSIS MESSAGE
========================================================= */

function buildAnalysisMessage(
    strategy,
    confidence,
    highestDigit,
    lowestDigit
) {

    const name =
        CONFIG.STRATEGIES[strategy] ||
        strategy;

    return `${name} selected from recent digit distribution. Dominant digit: ${highestDigit}. Lowest frequency digit: ${lowestDigit}. Confidence ${confidence.toFixed(1)}%.`;
}


/* =========================================================
   ACCURACY ENGINE
========================================================= */

function calculateAccuracy() {

    if (state.aiPredictions <= 0) {

        state.aiAccuracy = 0;

        return 0;
    }

    state.aiAccuracy =
        (
            state.aiCorrect /
            state.aiPredictions
        ) * 100;

    return state.aiAccuracy;
}

function recordPredictionResult(correct) {

    state.aiPredictions++;

    if (correct) {
        state.aiCorrect++;
    }

    calculateAccuracy();

    updateStatisticsUI();

    saveState();
}


/* =========================================================
   PREDICTION CHECK
========================================================= */

function predictionCorrect(
    strategy,
    predicted,
    digit
) {

    switch (strategy) {

        case "MATCHES":

            return digit ===
                Number(
                    String(predicted)
                        .replace(/\D/g, "")
                );

        case "DIFFERS":

            return digit !==
                Number(
                    String(predicted)
                        .replace(/\D/g, "")
                );

        case "OVER":
            return digit >= 6;

        case "UNDER":
            return digit <= 4;

        case "EVEN":
            return digit % 2 === 0;

        case "ODD":
            return digit % 2 !== 0;

        default:
            return false;
    }
}


/* =========================================================
   AI BOT
========================================================= */

function runBotCycle() {

    if (!state.botRunning) return;

    const result =
        analyzeMarket(
            state.selectedMarket
        );

    if (!result.ready) return;

    let strategy =
        result.strategy;

    if (
        state.botStrategy !== "AUTO"
    ) {
        strategy =
            state.botStrategy;
    }

    const prediction =
        strategyPrediction(
            strategy,
            result.counts,
            result.rates,
            result.highestDigit,
            result.lowestDigit
        );

    state.lastPrediction = {
        market:
            state.selectedMarket,

        strategy,

        prediction,

        confidence:
            result.confidence,

        created:
            Date.now()
    };

    updateBotUI(
        result,
        strategy,
        prediction
    );

    /*
       Only create a paper trade once
       per analysis interval.
    */

    const currentSecond =
        Math.floor(Date.now() / 1000);

    if (
        !state._lastBotTradeSecond ||
        currentSecond -
        state._lastBotTradeSecond >= 3
    ) {

        state._lastBotTradeSecond =
            currentSecond;

        createTrade({
            engine: "AI BOT",
            market:
                state.selectedMarket,
            strategy,
            prediction,
            confidence:
                result.confidence,
            stake:
                getInputNumber(
                    "stakeInput",
                    state.stake
                )
        });
    }
}

function startBot() {

    if (state.botRunning) return;

    state.botRunning = true;
    state.activeEngine = "AI BOT";

    safeText(
        "botStatusDash",
        "AI BOT RUNNING"
    );

    safeText(
        "engineStatusText",
        "AI BOT ACTIVE"
    );

    toast(
        "AI BOT started."
    );

    runBotCycle();

    if (state.botTimer) {
        clearInterval(
            state.botTimer
        );
    }

    state.botTimer =
        setInterval(
            runBotCycle,
            CONFIG.AI_INTERVAL
        );
}

function stopBot() {

    state.botRunning = false;

    if (state.botTimer) {

        clearInterval(
            state.botTimer
        );

        state.botTimer = null;
    }

    safeText(
        "botStatusDash",
        "AI BOT STOPPED"
    );

    safeText(
        "engineStatusText",
        "ENGINE READY"
    );

    toast(
        "AI BOT stopped."
    );
}


/* =========================================================
   CIRCULAR AI
========================================================= */

function startCircularAI() {

    if (state.circularRunning) {
        return;
    }

    state.circularRunning = true;
    state.activeEngine = "CIRCULAR AI";

    circularCycle();

    toast(
        "Circular AI started."
    );
}

function stopCircularAI() {

    state.circularRunning = false;

    if (state.circularTimer) {

        clearTimeout(
            state.circularTimer
        );

        state.circularTimer = null;
    }

    state.circularPhase =
        "IDLE";

    state.circularCountdown = 0;

    updateCircularUI(
        "STOPPED",
        0
    );

    toast(
        "Circular AI stopped."
    );
}

function circularCycle() {

    if (!state.circularRunning) {
        return;
    }

    state.circularPhase =
        "ANALYSIS";

    state.circularCountdown =
        CONFIG.CIRCULAR_ANALYSIS_TIME;

    updateCircularUI(
        "ANALYSING",
        state.circularCountdown
    );

    circularCountdown(
        CONFIG.CIRCULAR_ANALYSIS_TIME,
        () => {

            if (!state.circularRunning) {
                return;
            }

            const result =
                analyzeMarket(
                    getSelectValue(
                        "circularMarketSelect",
                        state.selectedMarket
                    )
                );

            if (!result.ready) {

                toast(
                    "Circular AI is collecting more ticks."
                );

                state.circularTimer =
                    setTimeout(
                        circularCycle,
                        1000
                    );

                return;
            }

            const market =
                getSelectValue(
                    "circularMarketSelect",
                    state.selectedMarket
                );

            state.selectedMarket =
                market;

            let strategy =
                result.strategy;

            if (
                state.circularStrategy !== "AUTO"
            ) {
                strategy =
                    state.circularStrategy;
            }

            const prediction =
                strategyPrediction(
                    strategy,
                    result.counts,
                    result.rates,
                    result.highestDigit,
                    result.lowestDigit
                );

            state.lastPrediction = {
                market,
                strategy,
                prediction,
                confidence:
                    result.confidence,
                created:
                    Date.now()
            };

            updateCircularPrediction(
                result,
                strategy,
                prediction
            );

            state.circularPhase =
                "PREDICTION";

            state.circularCountdown =
                CONFIG.CIRCULAR_PREDICTION_TIME;

            updateCircularUI(
                "PREDICTION",
                state.circularCountdown
            );

            circularCountdown(
                CONFIG.CIRCULAR_PREDICTION_TIME,
                () => {

                    if (!state.circularRunning) {
                        return;
                    }

                    state.circularPhase =
                        "TRADE";

                    state.circularCountdown =
                        CONFIG.CIRCULAR_TRADE_TIME;

                    updateCircularUI(
                        "TRADE WINDOW",
                        state.circularCountdown
                    );

                    circularCountdown(
                        CONFIG.CIRCULAR_TRADE_TIME,
                        () => {

                            if (
                                !state.circularRunning
                            ) {
                                return;
                            }

                            createTrade({
                                engine:
                                    "CIRCULAR AI",

                                market,

                                strategy,

                                prediction,

                                confidence:
                                    result.confidence,

                                stake:
                                    getInputNumber(
                                        "circularStakeInput",
                                        state.stake
                                    )
                            });

                            state.circularPhase =
                                "COOLDOWN";

                            state.circularCountdown =
                                CONFIG.CIRCULAR_COOLDOWN_TIME;

                            updateCircularUI(
                                "COOLDOWN",
                                state.circularCountdown
                            );

                            circularCountdown(
                                CONFIG.CIRCULAR_COOLDOWN_TIME,
                                () => {

                                    if (
                                        !state.circularRunning
                                    ) {
                                        return;
                                    }

                                    circularCycle();
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}

function circularCountdown(
    seconds,
    callback
) {

    let remaining = seconds;

    state.circularCountdown =
        remaining;

    updateCircularUI(
        state.circularPhase,
        remaining
    );

    const timer =
        setInterval(() => {

            if (!state.circularRunning) {

                clearInterval(timer);

                return;
            }

            remaining--;

            state.circularCountdown =
                Math.max(
                    0,
                    remaining
                );

            updateCircularUI(
                state.circularPhase,
                state.circularCountdown
            );

            if (remaining <= 0) {

                clearInterval(timer);

                callback();
            }

        }, 1000);
}


/* =========================================================
   MANUAL TRADING
========================================================= */

function placeManualTrade() {

    const market =
        getSelectValue(
            "manualMarketSelect",
            state.selectedMarket
        );

    const strategy =
        state.manualStrategy;

    let prediction;

    const analysis =
        analyzeMarket(market);

    if (
        strategy === "MATCHES" ||
        strategy === "DIFFERS"
    ) {

        const target =
            parseInt(
                $("manualTargetDigitInput")?.value,
                10
            );

        if (
            !Number.isInteger(target) ||
            target < 0 ||
            target > 9
        ) {

            toast(
                "Enter a target digit from 0 to 9."
            );

            return;
        }

        prediction =
            strategy === "MATCHES"
                ? `DIGIT ${target}`
                : `NOT ${target}`;

    } else {

        prediction =
            strategyPrediction(
                strategy,
                analysis.counts,
                analysis.rates,
                analysis.highestDigit,
                analysis.lowestDigit
            );
    }

    createTrade({
        engine: "MANUAL",
        market,
        strategy,
        prediction,
        confidence:
            analysis.ready
                ? analysis.confidence
                : 50,

        stake:
            getInputNumber(
                "manualStakeInput",
                state.stake
            ),

        manualTarget:
            parseInt(
                $("manualTargetDigitInput")?.value,
                10
            )
    });
}


/* =========================================================
   TRADE CREATION
========================================================= */

function createTrade(options) {

    const stake =
        Math.max(
            0.01,
            Number(options.stake) || 0
        );

    if (!stake) {
        toast("Enter a valid stake.");
        return null;
    }

    if (
        state.accountMode === "DEMO" &&
        state.balance < stake
    ) {

        toast(
            "Insufficient demo balance."
        );

        return null;
    }

    /*
       Real mode remains locked until the
       explicit confirmation flag is enabled.
    */

    if (
        state.accountMode === "REAL" &&
        !state.realConfirmed
    ) {

        toast(
            "Real trading requires confirmation."
        );

        requestRealConfirmation();

        return null;
    }

    const id =
        `KW-${Date.now()}-${++state.tradeCounter}`;

    const trade = {

        id,

        engine:
            options.engine || "MANUAL",

        market:
            options.market ||
            state.selectedMarket,

        strategy:
            options.strategy ||
            "EVEN",

        prediction:
            options.prediction ||
            "WAIT",

        confidence:
            Number(options.confidence) || 50,

        stake,

        amountWon: 0,

        profit: 0,

        status: "OPEN",

        createdAt:
            Date.now(),

        createdTime:
            timeString(),

        entryDigit:
            getDigitData(
                options.market ||
                state.selectedMarket
            ).lastDigit,

        entryPrice:
            getDigitData(
                options.market ||
                state.selectedMarket
            ).lastPrice,

        manualTarget:
            options.manualTarget
    };

    state.activeTrades.push(
        trade
    );

    state.totalStake += stake;

    if (state.accountMode === "DEMO") {
        state.balance -= stake;
    }

    updateAllUI();

    toast(
        `${trade.engine}: ${trade.strategy} trade placed.`
    );

    saveState();

    return trade;
}


/* =========================================================
   TRADE SETTLEMENT
========================================================= */

function settleActiveTrades(
    symbol,
    digit,
    price
) {

    const trades =
        state.activeTrades.filter(
            trade =>
                trade.market === symbol
        );

    if (!trades.length) return;

    trades.forEach(trade => {

        /*
           One subsequent tick is treated as
           the simulated contract result.
        */

        const won =
            evaluateTrade(
                trade,
                digit
            );

        settleTrade(
            trade,
            won,
            digit,
            price
        );
    });
}

function evaluateTrade(
    trade,
    digit
) {

    switch (trade.strategy) {

        case "MATCHES":

            return digit ===
                Number.isInteger(
                    trade.manualTarget
                )
                    ? trade.manualTarget
                    : extractPredictionDigit(
                        trade.prediction
                    );

        case "DIFFERS":

            return digit !==
                Number.isInteger(
                    trade.manualTarget
                )
                    ? trade.manualTarget
                    : extractPredictionDigit(
                        trade.prediction
                    );

        case "OVER":
            return digit >= 6;

        case "UNDER":
            return digit <= 4;

        case "EVEN":
            return digit % 2 === 0;

        case "ODD":
            return digit % 2 !== 0;

        default:
            return false;
    }
}

function extractPredictionDigit(
    prediction
) {

    const match =
        String(prediction || "")
            .match(/\d/);

    return match
        ? Number(match[0])
        : -1;
}


/* =========================================================
   PAPER PAYOUT MODEL
========================================================= */

function calculatePaperResult(
    trade,
    won
) {

    /*
       This is a SIMULATION ONLY.

       Profit is calculated as:

       WIN:
       stake × simulated return multiplier
       minus original stake

       LOSS:
       -stake

       Multipliers are intentionally kept
       conservative and clearly simulated.
    */

    const simulatedReturn = {

        MATCHES: 8.5,

        DIFFERS: 0.09,

        OVER: 0.95,

        UNDER: 0.95,

        EVEN: 0.95,

        ODD: 0.95
    };

    if (!won) {

        return {
            amountWon: 0,
            profit: -trade.stake
        };
    }

    const multiplier =
        simulatedReturn[
            trade.strategy
        ] || 0.95;

    const payout =
        trade.stake *
        (1 + multiplier);

    return {

        amountWon:
            payout,

        profit:
            payout -
            trade.stake
    };
}


/* =========================================================
   SETTLE TRADE
========================================================= */

function settleTrade(
    trade,
    won,
    exitDigit,
    exitPrice
) {

    const index =
        state.activeTrades.indexOf(
            trade
        );

    if (index === -1) {
        return;
    }

    const result =
        calculatePaperResult(
            trade,
            won
        );

    trade.status =
        won
            ? "WIN"
            : "LOSS";

    trade.exitDigit =
        exitDigit;

    trade.exitPrice =
        exitPrice;

    trade.amountWon =
        result.amountWon;

    trade.profit =
        result.profit;

    trade.closedAt =
        Date.now();

    trade.closedTime =
        timeString();

    state.activeTrades.splice(
        index,
        1
    );

    state.totalTrades++;

    if (won) {

        state.wins++;

        state.totalWon +=
            result.amountWon;

        if (
            state.accountMode === "DEMO"
        ) {

            state.balance +=
                result.amountWon;
        }

    } else {

        state.losses++;

        state.totalLost +=
            trade.stake;
    }

    state.netProfit =
        state.totalWon -
        state.totalStake;

    /*
       AI accuracy is measured against
       actual result.
    */

    if (
        trade.engine === "AI BOT" ||
        trade.engine === "CIRCULAR AI"
    ) {

        recordPredictionResult(
            won
        );
    }

    state.history.unshift({
        ...trade
    });

    if (state.history.length > 200) {
        state.history =
            state.history.slice(0, 200);
    }

    updateAllUI();

    saveState();

    toast(
        `${trade.status}: ${money(result.profit)}`
    );

    checkRiskLimits();
}


/* =========================================================
   RISK LIMITS
========================================================= */

function checkRiskLimits() {

    const takeProfit =
        getInputNumber(
            "takeProfitInput",
            0
        );

    const stopLoss =
        getInputNumber(
            "stopLossInput",
            0
        );

    if (
        takeProfit > 0 &&
        state.netProfit >= takeProfit
    ) {

        stopAllTrading();

        toast(
            "Take-profit reached. Trading stopped."
        );

        return;
    }

    if (
        stopLoss > 0 &&
        state.netProfit <= -Math.abs(stopLoss)
    ) {

        stopAllTrading();

        toast(
            "Stop-loss reached. Trading stopped."
        );
    }
}


/* =========================================================
   STOP ALL TRADING
========================================================= */

function stopAllTrading() {

    stopBot();
    stopCircularAI();

    state.botRunning = false;
    state.circularRunning = false;

    safeText(
        "tradingStatusLabel",
        "TRADING STOPPED"
    );

    toast(
        "All automated trading stopped."
    );

    updateAllUI();
}


/* =========================================================
   UI — CONNECTION
========================================================= */

function updateConnectionUI(
    connected,
    text
) {

    const dot =
        $("connectionDot");

    if (dot) {

        dot.classList.toggle(
            "online",
            connected
        );

        dot.classList.toggle(
            "offline",
            !connected
        );
    }

    safeText(
        "connectionText",
        text
    );

    safeText(
        "dataStatus",
        connected
            ? "LIVE DATA"
            : "OFFLINE"
    );
}


/* =========================================================
   UI — ANALYSIS
========================================================= */

function updateAnalysisUI(symbol) {

    const result =
        analyzeMarket(symbol);

    const market =
        getDigitData(symbol);

    safeText(
        "currentChartMarket",
        CONFIG.MARKET_NAMES[symbol] ||
        symbol
    );

    safeText(
        "currentLivePrice",
        number(
            market.lastPrice,
            5
        )
    );

    safeText(
        "digitSampleCount",
        `${market.ticks.length} TICKS`
    );

    if (!result.ready) {

        safeText(
            "aiStatus",
            "COLLECTING DATA"
        );

        safeText(
            "analysisConfidence",
            "--"
        );

        safeText(
            "aiMarket",
            CONFIG.MARKET_NAMES[symbol] ||
            symbol
        );

        safeText(
            "aiPrediction",
            "WAIT"
        );

        safeText(
            "aiType",
            "ANALYSIS"
        );

        safeText(
            "analysisMsg",
            result.message
        );

        return;
    }

    safeText(
        "aiStatus",
        "AI READY"
    );

    safeText(
        "analysisConfidence",
        percent(
            result.confidence
        )
    );

    safeText(
        "aiMarket",
        CONFIG.MARKET_NAMES[symbol] ||
        symbol
    );

    safeText(
        "aiPrediction",
        result.prediction
    );

    safeText(
        "aiType",
        CONFIG.STRATEGIES[
            result.strategy
        ] || result.strategy
    );

    safeText(
        "analysisMsg",
        result.message
    );

    renderDigitGrid(
        result.counts,
        result.total
    );
}


/* =========================================================
   DIGIT GRID
========================================================= */

function renderDigitGrid(
    counts,
    total
) {

    const container =
        $("digitStatsGrid");

    if (!container) return;

    container.innerHTML = "";

    counts.forEach(
        (count, digit) => {

            const rate =
                total > 0
                    ? (count / total) * 100
                    : 0;

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "digit-stat";

            item.innerHTML = `
                <div class="digit-number">
                    ${digit}
                </div>

                <div class="digit-count">
                    ${count}
                </div>

                <div class="digit-rate">
                    ${rate.toFixed(1)}%
                </div>
            `;

            container.appendChild(
                item
            );
        }
    );
}


/* =========================================================
   BOT UI
========================================================= */

function updateBotUI(
    result,
    strategy,
    prediction
) {

    safeText(
        "botStatusDash",
        "AI BOT ACTIVE"
    );

    safeText(
        "botSelectedMarket",
        CONFIG.MARKET_NAMES[
            state.selectedMarket
        ] ||
        state.selectedMarket
    );

    safeText(
        "botSelectedStrategy",
        CONFIG.STRATEGIES[
            strategy
        ] || strategy
    );

    safeText(
        "botScore",
        `${result.confidence.toFixed(1)} / 100`
    );

    safeText(
        "botConfidence",
        percent(
            result.confidence
        )
    );

    safeText(
        "aiPredictionLarge",
        prediction
    );

    safeText(
        "predictionConfidence",
        `${result.confidence.toFixed(1)}% CONFIDENCE`
    );

    safeText(
        "botStrategyLabel",
        CONFIG.STRATEGIES[
            strategy
        ] || strategy
    );
}


/* =========================================================
   CIRCULAR UI
========================================================= */

function updateCircularUI(
    phase,
    countdown
) {

    safeText(
        "circularStatusText",
        phase
    );

    safeText(
        "aiCircleTimer",
        String(
            Math.max(
                0,
                countdown
            )
        )
    );

    safeText(
        "cycleAnalysis",
        phase === "ANALYSIS"
            ? "Scanning market..."
            : "Analysis complete"
    );

    safeText(
        "cycleTrade",
        phase === "TRADE"
            ? "TRADE WINDOW ACTIVE"
            : phase
    );

    safeText(
        "cycleCooldown",
        phase === "COOLDOWN"
            ? "Cooling down..."
            : ""
    );

    safeText(
        "aiCircleStatus",
        phase
    );

    const circle =
        $("aiCircle");

    if (circle) {

        circle.textContent =
            countdown > 0
                ? countdown
                : "AI";
    }
}

function updateCircularPrediction(
    result,
    strategy,
    prediction
) {

    safeText(
        "aiCircleLabel",
        CONFIG.STRATEGIES[
            strategy
        ] || strategy
    );

    safeText(
        "aiCirclePrediction",
        prediction
    );

    safeText(
        "circularStrategyLabel",
        CONFIG.STRATEGIES[
            strategy
        ] || strategy
    );
}


/* =========================================================
   STATISTICS UI
========================================================= */

function updateStatisticsUI() {

    const accuracy =
        state.totalTrades > 0
            ? (
                state.wins /
                state.totalTrades
            ) * 100
            : 0;

    safeText(
        "paperTotal",
        String(
            state.totalTrades
        )
    );

    safeText(
        "paperWins",
        String(
            state.wins
        )
    );

    safeText(
        "paperLosses",
        String(
            state.losses
        )
    );

    safeText(
        "paperAccuracy",
        percent(
            accuracy
        )
    );

    safeText(
        "historyTotalStake",
        money(
            state.totalStake
        )
    );

    safeText(
        "historyAmountWon",
        money(
            state.totalWon
        )
    );

    safeText(
        "historyNetProfit",
        money(
            state.netProfit
        )
    );

    safeText(
        "totalProfitDisplay",
        money(
            state.netProfit
        )
    );

    safeText(
        "sessionProfitDisplay",
        money(
            state.netProfit
        )
    );

    safeText(
        "activeTradeCount",
        String(
            state.activeTrades.length
        )
    );

    safeText(
        "balanceDisplay",
        money(
            state.balance
        )
    );

    safeText(
        "accountId",
        state.accountId
    );

    safeText(
        "currency",
        state.currency
    );
}


/* =========================================================
   ACTIVE TRADES UI
========================================================= */

function renderActiveTrades() {

    const container =
        $("activeTradesList");

    if (!container) return;

    container.innerHTML = "";

    if (!state.activeTrades.length) {

        container.innerHTML = `
            <div class="empty-state">
                No active trades
            </div>
        `;

        return;
    }

    state.activeTrades.forEach(
        trade => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "trade-row";

            item.innerHTML = `
                <div>
                    <strong>
                        ${trade.strategy}
                    </strong>

                    <small>
                        ${trade.market}
                    </small>
                </div>

                <div>
                    <strong>
                        ${trade.prediction}
                    </strong>

                    <small>
                        ${money(trade.stake)}
                    </small>
                </div>

                <div class="status-open">
                    OPEN
                </div>
            `;

            container.appendChild(
                item
            );
        }
    );
}


/* =========================================================
   HISTORY UI
========================================================= */

function renderHistory() {

    const container =
        $("historyCardsList");

    if (!container) return;

    container.innerHTML = "";

    if (!state.history.length) {

        container.innerHTML = `
            <div class="empty-state">
                No completed trades yet.
            </div>
        `;

        return;
    }

    state.history.forEach(
        trade => {

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                `history-card ${
                    trade.status === "WIN"
                        ? "history-win"
                        : "history-loss"
                }`;

            const profitClass =
                trade.profit >= 0
                    ? "positive"
                    : "negative";

            card.innerHTML = `

                <div class="history-top">

                    <strong>
                        ${trade.engine}
                    </strong>

                    <span class="${
                        trade.status === "WIN"
                            ? "win"
                            : "loss"
                    }">
                        ${trade.status}
                    </span>

                </div>

                <div class="history-main">

                    <div>
                        <span>Market</span>
                        <strong>
                            ${trade.market}
                        </strong>
                    </div>

                    <div>
                        <span>Strategy</span>
                        <strong>
                            ${trade.strategy}
                        </strong>
                    </div>

                    <div>
                        <span>Prediction</span>
                        <strong>
                            ${trade.prediction}
                        </strong>
                    </div>

                    <div>
                        <span>Stake</span>
                        <strong>
                            ${money(trade.stake)}
                        </strong>
                    </div>

                    <div>
                        <span>Amount Won</span>
                        <strong>
                            ${money(trade.amountWon)}
                        </strong>
                    </div>

                    <div>
                        <span>Profit / Loss</span>
                        <strong class="${profitClass}">
                            ${money(trade.profit)}
                        </strong>
                    </div>

                </div>

                <div class="history-bottom">

                    <span>
                        ${trade.createdTime || ""}
                    </span>

                    <span>
                        Entry ${trade.entryDigit ?? "-"}
                        →
                        Exit ${trade.exitDigit ?? "-"}
                    </span>

                </div>
            `;

            container.appendChild(
                card
            );
        }
    );
}


/* =========================================================
   PRICE CHART
========================================================= */

function updatePriceChart(price) {

    state.chartPrices.push(
        Number(price)
    );

    if (state.chartPrices.length > 80) {
        state.chartPrices.shift();
    }

    drawPriceChart();
}

function drawPriceChart() {

    const canvas =
        $("priceChartCanvas");

    if (!canvas) return;

    const ctx =
        canvas.getContext("2d");

    if (!ctx) return;

    const rect =
        canvas.getBoundingClientRect();

    const dpr =
        window.devicePixelRatio || 1;

    canvas.width =
        rect.width * dpr;

    canvas.height =
        rect.height * dpr;

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    const width =
        rect.width;

    const height =
        rect.height;

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    const values =
        state.chartPrices;

    if (values.length < 2) return;

    const min =
        Math.min(...values);

    const max =
        Math.max(...values);

    const range =
        max - min || 1;

    ctx.beginPath();

    values.forEach(
        (value, index) => {

            const x =
                (index /
                (values.length - 1)) *
                width;

            const y =
                height -
                (
                    (value - min) /
                    range
                ) *
                (height - 10) -
                5;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
    );

    ctx.strokeStyle =
        getComputedStyle(
            document.body
        ).getPropertyValue(
            "--accent"
        ) || "#00e5ff";

    ctx.lineWidth = 2;

    ctx.stroke();
}


/* =========================================================
   SELECT HELPERS
========================================================= */

function getSelectValue(
    id,
    fallback
) {

    const el = $(id);

    if (!el) return fallback;

    return el.value || fallback;
}

function getInputNumber(
    id,
    fallback
) {

    const el = $(id);

    if (!el) {
        return Number(fallback) || 0;
    }

    const value =
        Number(el.value);

    return Number.isFinite(value)
        ? value
        : Number(fallback) || 0;
}


/* =========================================================
   MARKET SELECTS
========================================================= */

function populateMarketSelects() {

    [
        "circularMarketSelect",
        "manualMarketSelect"
    ].forEach(id => {

        const select = $(id);

        if (!select) return;

        select.innerHTML = "";

        CONFIG.MARKETS.forEach(
            symbol => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    symbol;

                option.textContent =
                    CONFIG.MARKET_NAMES[
                        symbol
                    ] || symbol;

                if (
                    symbol ===
                    state.selectedMarket
                ) {
                    option.selected =
                        true;
                }

                select.appendChild(
                    option
                );
            }
        );
    });
}


/* =========================================================
   STRATEGY MODAL
========================================================= */

function openStrategyModal(
    type = "MANUAL"
) {

    const modal =
        $("strategyModal");

    if (!modal) return;

    modal.dataset.type =
        type;

    modal.classList.add(
        "show"
    );
}

function closeStrategyModal() {

    const modal =
        $("strategyModal");

    if (!modal) return;

    modal.classList.remove(
        "show"
    );
}


/* =========================================================
   BOT STRATEGY MODAL
========================================================= */

function openBotStrategyModal() {

    const modal =
        $("botStrategyModal");

    if (!modal) return;

    qsa(
        ".bot-strategy-check"
    ).forEach(
        checkbox => {

            checkbox.checked =
                state.botStrategies.includes(
                    checkbox.value
                );
        }
    );

    modal.classList.add(
        "show"
    );
}

function closeBotStrategyModal() {

    const modal =
        $("botStrategyModal");

    if (!modal) return;

    modal.classList.remove(
        "show"
    );
}

function applyBotStrategies() {

    const selected =
        qsa(
            ".bot-strategy-check:checked"
        ).map(
            el => el.value
        );

    if (!selected.length) {

        toast(
            "Select at least one strategy."
        );

        return;
    }

    state.botStrategies =
        selected;

    closeBotStrategyModal();

    toast(
        `${selected.length} AI strategies selected.`
    );
}


/* =========================================================
   STRATEGY LABELS
========================================================= */

function setManualStrategy(strategy) {

    state.manualStrategy =
        strategy;

    safeText(
        "manualSelectedStrategyLabel",
        CONFIG.STRATEGIES[
            strategy
        ] || strategy
    );

    safeText(
        "manualStrategyTrigger",
        CONFIG.STRATEGIES[
            strategy
        ] || strategy
    );

    const target =
        $("targetDigitContainer");

    if (target) {

        target.style.display =
            strategy === "MATCHES" ||
            strategy === "DIFFERS"
                ? ""
                : "none";
    }
}

function setCircularStrategy(strategy) {

    state.circularStrategy =
        strategy;

    safeText(
        "circularStrategyLabel",
        CONFIG.STRATEGIES[
            strategy
        ] || strategy
    );

    safeText(
        "circularStrategyTrigger",
        CONFIG.STRATEGIES[
            strategy
        ] || strategy
    );
}


/* =========================================================
   ENGINE TABS
========================================================= */

function setEngine(engine) {

    state.activeEngine =
        engine;

    qsa(
        ".engine-panel"
    ).forEach(
        panel => {

            panel.classList.remove(
                "active"
            );
        }
    );

    qsa(
        ".engine-tab"
    ).forEach(
        tab => {

            tab.classList.remove(
                "active"
            );
        }
    );

    const panel =
        $(
            engine === "AI BOT"
                ? "aiBotPanel"
                : engine === "CIRCULAR AI"
                    ? "circularAIPanel"
                    : "manualPanel"
        );

    if (panel) {
        panel.classList.add(
            "active"
        );
    }

    const tab =
        $(
            engine === "AI BOT"
                ? "tabAiBot"
                : engine === "CIRCULAR AI"
                    ? "tabCircularAI"
                    : "tabManual"
        );

    if (tab) {
        tab.classList.add(
            "active"
        );
    }

    safeText(
        "engineStatusText",
        `${engine} READY`
    );
}


/* =========================================================
   REAL / DEMO MODE
========================================================= */

function requestRealConfirmation() {

    /*
       If the new index contains a dedicated
       real confirmation modal, use it.
    */

    const modal =
        $("realConfirmModal");

    if (modal) {

        modal.classList.add(
            "show"
        );

        return;
    }

    /*
       Fallback confirmation.
    */

    const confirmed =
        window.confirm(
            "REAL MONEY MODE\n\n" +
            "You are requesting to switch from " +
            "DEMO/PAPER to REAL trading.\n\n" +
            "Real money can be lost. " +
            "Do you want to continue?"
        );

    if (confirmed) {

        state.realConfirmed =
            true;

        state.accountMode =
            "REAL";

        applyAccountMode();

        toast(
            "REAL mode confirmed."
        );
    }
}

function enableRealMode() {

    const confirmed =
        window.confirm(
            "Confirm REAL MONEY MODE?\n\n" +
            "KRISHWAVE will clearly show REAL mode " +
            "after confirmation. Never share your " +
            "Deriv password or API secret."
        );

    if (!confirmed) {
        return;
    }

    state.realConfirmed =
        true;

    state.accountMode =
        "REAL";

    applyAccountMode();

    toast(
        "REAL mode enabled after confirmation."
    );
}

function useDemoMode() {

    state.accountMode =
        "DEMO";

    state.realConfirmed =
        false;

    /*
       Demo balance is independent and
       remains the dominant testing mode.
    */

    if (
        !Number.isFinite(state.balance) ||
        state.balance <= 0
    ) {
        state.balance =
            CONFIG.STARTING_BALANCE;
    }

    applyAccountMode();

    toast(
        "DEMO / PAPER mode enabled."
    );

    saveState();
}

function applyAccountMode() {

    const badge =
        qs(
            ".mode-badge"
        );

    if (badge) {

        badge.textContent =
            state.accountMode === "REAL"
                ? "REAL"
                : "DEMO / PAPER";

        badge.classList.toggle(
            "real-mode",
            state.accountMode === "REAL"
        );

        badge.classList.toggle(
            "demo-mode",
            state.accountMode !== "REAL"
        );
    }

    safeText(
        "accountId",
        state.accountMode === "REAL"
            ? (
                state.accountId ===
                "DEMO ACCOUNT"
                    ? "REAL ACCOUNT"
                    : state.accountId
            )
            : "DEMO ACCOUNT"
    );

    updateStatisticsUI();
}


/* =========================================================
   CLEAR HISTORY
========================================================= */

function clearHistory() {

    const confirmed =
        window.confirm(
            "Clear all trade history and session statistics?"
        );

    if (!confirmed) return;

    state.history = [];

    state.totalTrades = 0;
    state.wins = 0;
    state.losses = 0;

    state.totalStake = 0;
    state.totalWon = 0;
    state.totalLost = 0;
    state.netProfit = 0;

    state.aiPredictions = 0;
    state.aiCorrect = 0;

    calculateAccuracy();

    renderHistory();
    updateStatisticsUI();

    saveState();

    toast(
        "History cleared."
    );
}


/* =========================================================
   THEME
========================================================= */

function toggleTheme() {

    document.body.classList.toggle(
        "light"
    );

    const light =
        document.body.classList.contains(
            "light"
        );

    localStorage.setItem(
        "KRISHWAVE_THEME",
        light
            ? "light"
            : "dark"
    );

    setTimeout(
        drawPriceChart,
        50
    );
}

function loadTheme() {

    const theme =
        localStorage.getItem(
            "KRISHWAVE_THEME"
        );

    if (theme === "light") {

        document.body.classList.add(
            "light"
        );
    }
}


/* =========================================================
   PAGE NAVIGATION
========================================================= */

function showPage(page) {

    qsa(
        ".page"
    ).forEach(
        el => {

            el.classList.remove(
                "active"
            );
        }
    );

    const target =
        $(
            page === "analysis"
                ? "analysisPage"
                : page === "trade"
                    ? "tradePage"
                    : "historyPage"
        );

    if (target) {
        target.classList.add(
            "active"
        );
    }

    qsa(
        ".bottom-nav button"
    ).forEach(
        button => {

            button.classList.toggle(
                "active",
                button.dataset.page === page
            );
        }
    );

    if (page === "history") {
        renderHistory();
    }
}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function toast(message) {

    const toastEl =
        $("toast");

    const messageEl =
        $("toastMessage");

    if (!toastEl || !messageEl) {
        return;
    }

    messageEl.textContent =
        message;

    toastEl.classList.add(
        "show"
    );

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer =
        setTimeout(() => {

            toastEl.classList.remove(
                "show"
            );

        }, 3000);
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function bindEvents() {

    /* ---------------------------------------------
       Connection
    --------------------------------------------- */

    $("connectDerivBtn")
        ?.addEventListener(
            "click",
            connectDeriv
        );


    /* ---------------------------------------------
       Theme
    --------------------------------------------- */

    $("themeToggle")
        ?.addEventListener(
            "click",
            toggleTheme
        );


    /* ---------------------------------------------
       Bottom navigation
    --------------------------------------------- */

    qsa(
        ".bottom-nav button"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    showPage(
                        button.dataset.page
                    );
                }
            );
        }
    );


    /* ---------------------------------------------
       AI BOT
    --------------------------------------------- */

    $("startBotBtn")
        ?.addEventListener(
            "click",
            () => {

                if (
                    state.botRunning
                ) {
                    stopBot();
                } else {
                    startBot();
                }
            }
        );


    $("botStrategyTrigger")
        ?.addEventListener(
            "click",
            openBotStrategyModal
        );


    $("closeBotStrategyModal")
        ?.addEventListener(
            "click",
            closeBotStrategyModal
        );


    $("applyBotStrategies")
        ?.addEventListener(
            "click",
            applyBotStrategies
        );


    /* ---------------------------------------------
       Circular AI
    --------------------------------------------- */

    $("startCircularTradeBtn")
        ?.addEventListener(
            "click",
            () => {

                if (
                    state.circularRunning
                ) {
                    stopCircularAI();
                } else {
                    startCircularAI();
                }
            }
        );


    /*
       Legacy circular buttons
       are also supported.
    */

    $("startAI")
        ?.addEventListener(
            "click",
            startCircularAI
        );


    $("stopAI")
        ?.addEventListener(
            "click",
            stopCircularAI
        );


    $("circularMarketSelect")
        ?.addEventListener(
            "change",
            event => {

                state.selectedMarket =
                    event.target.value;

                updateAnalysisUI(
                    state.selectedMarket
                );
            }
        );


    $("circularStrategyTrigger")
        ?.addEventListener(
            "click",
            () => {

                openStrategyModal(
                    "CIRCULAR AI"
                );
            }
        );


    /* ---------------------------------------------
       Manual
    --------------------------------------------- */

    $("manualMarketSelect")
        ?.addEventListener(
            "change",
            event => {

                state.selectedMarket =
                    event.target.value;

                updateAnalysisUI(
                    state.selectedMarket
                );
            }
        );


    $("manualStrategyTrigger")
        ?.addEventListener(
            "click",
            () => {

                openStrategyModal(
                    "MANUAL"
                );
            }
        );


    $("placeTradeBtn")
        ?.addEventListener(
            "click",
            placeManualTrade
        );


    /* ---------------------------------------------
       Strategy modal
    --------------------------------------------- */

    $("closeStrategyModal")
        ?.addEventListener(
            "click",
            closeStrategyModal
        );


    qsa(
        "[data-strategy]"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const strategy =
                        button.dataset.strategy;

                    const modal =
                        $("strategyModal");

                    const type =
                        modal?.dataset.type ||
                        "MANUAL";

                    if (
                        type ===
                        "CIRCULAR AI"
                    ) {

                        setCircularStrategy(
                            strategy
                        );

                    } else {

                        setManualStrategy(
                            strategy
                        );
                    }

                    closeStrategyModal();
                }
            );
        }
    );


    /* ---------------------------------------------
       History
    --------------------------------------------- */

    $("clearLogsBtn")
        ?.addEventListener(
            "click",
            clearHistory
        );


    $("stopTradingBtn")
        ?.addEventListener(
            "click",
            stopAllTrading
        );


    /* ---------------------------------------------
       Real confirmation modal
    --------------------------------------------- */

    $("confirmRealBtn")
        ?.addEventListener(
            "click",
            () => {

                state.realConfirmed =
                    true;

                state.accountMode =
                    "REAL";

                $("realConfirmModal")
                    ?.classList.remove(
                        "show"
                    );

                applyAccountMode();

                toast(
                    "REAL mode confirmed."
                );
            }
        );


    $("cancelRealBtn")
        ?.addEventListener(
            "click",
            () => {

                $("realConfirmModal")
                    ?.classList.remove(
                        "show"
                    );

                useDemoMode();
            }
        );


    $("demoModeBtn")
        ?.addEventListener(
            "click",
            useDemoMode
        );


    $("realModeBtn")
        ?.addEventListener(
            "click",
            requestRealConfirmation
        );


    /* ---------------------------------------------
       Input values
    --------------------------------------------- */

    [
        "stakeInput",
        "manualStakeInput",
        "circularStakeInput"
    ].forEach(
        id => {

            $(id)?.addEventListener(
                "input",
                event => {

                    const value =
                        Number(
                            event.target.value
                        );

                    if (
                        Number.isFinite(value) &&
                        value > 0
                    ) {
                        state.stake =
                            value;
                    }
                }
            );
        }
    );


    /* ---------------------------------------------
       Resize chart
    --------------------------------------------- */

    window.addEventListener(
        "resize",
        drawPriceChart
    );


    /* ---------------------------------------------
       Close modals on background click
    --------------------------------------------- */

    qsa(
        ".modal"
    ).forEach(
        modal => {

            modal.addEventListener(
                "click",
                event => {

                    if (
                        event.target ===
                        modal
                    ) {
                        modal.classList.remove(
                            "show"
                        );
                    }
                }
            );
        }
    );
}


/* =========================================================
   SYNC MARKET
========================================================= */

function syncMarketSelectors() {

    [
        "circularMarketSelect",
        "manualMarketSelect"
    ].forEach(id => {

        const select = $(id);

        if (!select) return;

        select.value =
            state.selectedMarket;
    });
}


/* =========================================================
   UPDATE ALL UI
========================================================= */

function updateAllUI() {

    updateStatisticsUI();

    renderActiveTrades();

    renderHistory();

    applyAccountMode();

    syncMarketSelectors();

    updateAnalysisUI(
        state.selectedMarket
    );
}


/* =========================================================
   INITIALIZATION
========================================================= */

function init() {

    console.log(
        `${CONFIG.APP_NAME} ${CONFIG.VERSION} initializing...`
    );

    loadTheme();

    loadState();

    /*
       DEMO remains the dominant mode.
       Stored REAL mode is never automatically
       trusted after page reload.
    */

    state.accountMode =
        "DEMO";

    state.realConfirmed =
        false;

    if (
        !Number.isFinite(state.balance) ||
        state.balance <= 0
    ) {
        state.balance =
            CONFIG.STARTING_BALANCE;
    }

    populateMarketSelects();

    bindEvents();

    setManualStrategy(
        state.manualStrategy
    );

    setCircularStrategy(
        state.circularStrategy
    );

    setEngine(
        "AI BOT"
    );

    updateAllUI();

    showPage(
        "analysis"
    );

    connectDeriv();

    /*
       Initial UI refresh.
    */

    setInterval(
        () => {

            updateStatisticsUI();
            renderActiveTrades();

        },
        1000
    );

    console.log(
        "KRISHWAVE ready."
    );
}


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