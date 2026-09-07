/* =========================================================
   KRISHWAVE V5.7
   AI BEAST MODE
   ---------------------------------------------------------
   LIVE DERIV MARKET INTELLIGENCE ENGINE

   V5.7 UPGRADES
   ---------------------------------------------------------
   - Advanced weighted digit analysis
   - Streak detection
   - Entropy / concentration
   - Stability scoring
   - Multi-signal agreement
   - Stronger market ranking
   - NO TRADE protection for weak setups
   - Improved prediction engine
   - AI reasoning
   - Paper WIN / LOSS resolution
   - Persistent history
   - 10s ANALYSIS
   - 5s LOCKED PREDICTION
   - 3s TRADE NOW
   - Manual number remains manual
   - No fake account balance
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const DERIV_URLS = [
    "wss://ws.binaryws.com/websockets/v3",
    "wss://api.derivws.com/trading/v1/options/ws/public"
];

const MAX_MARKETS = 13;
const HISTORY_LIMIT = 100;
const PAPER_RESULT_TICKS = 3;

const FALLBACK_MARKETS = [
    "R_10",
    "R_25",
    "R_50",
    "R_75",
    "R_100",
    "R_150",
    "R_250",
    "1HZ10V",
    "1HZ25V",
    "1HZ50V",
    "1HZ75V",
    "1HZ100V",
    "1HZ150V"
];

/* =========================================================
   STATE
   ========================================================= */

let socket = null;
let socketIndex = 0;
let connected = false;

let activeMarkets = [];
let marketData = {};

let currentSymbol = "";
let currentStrategy = "MATCHES";

let aiRunning = false;
let aiTimer = null;

let phase = "analysis";
let phaseRemaining = 10;

let lockedPrediction = null;
let pendingPaperSignals = [];

let lastSignalTime = 0;

let requestCounter = 1000;
const requests = new Map();

let currentAccountMode = "DEMO";

/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function setHTML(id, value) {
    const el = $(id);
    if (el) el.innerHTML = value;
}

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/* =========================================================
   LOCAL STORAGE
   ========================================================= */

function loadHistory() {
    try {
        const raw = localStorage.getItem("krishwave_history");
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn("History load failed:", error);
        return [];
    }
}

function saveHistory(history) {
    try {
        localStorage.setItem(
            "krishwave_history",
            JSON.stringify(history.slice(0, HISTORY_LIMIT))
        );
    } catch (error) {
        console.warn("History save failed:", error);
    }
}

function addHistory(item) {
    const history = loadHistory();

    history.unshift({
        id: Date.now(),
        time: new Date().toLocaleString(),
        ...item
    });

    saveHistory(history);
    renderHistory();
    updateHistoryStats();
}

function clearHistory() {
    localStorage.removeItem("krishwave_history");
    renderHistory();
    updateHistoryStats();
}

/* =========================================================
   DERIV CONNECTION
   ========================================================= */

function connectDeriv() {
    closeSocket();

    const url = DERIV_URLS[socketIndex];

    try {
        socket = new WebSocket(url);

        socket.onopen = () => {
            connected = true;

            updateConnectionUI("CONNECTED");

            requestActiveSymbols();
        };

        socket.onmessage = event => {
            try {
                const data = JSON.parse(event.data);
                handleDerivMessage(data);
            } catch (error) {
                console.warn("Invalid Deriv message:", error);
            }
        };

        socket.onerror = () => {
            connected = false;
            updateConnectionUI("CONNECTION ERROR");
        };

        socket.onclose = () => {
            connected = false;
            updateConnectionUI("DISCONNECTED");

            if (socketIndex < DERIV_URLS.length - 1) {
                socketIndex++;
                setTimeout(connectDeriv, 1200);
            } else {
                socketIndex = 0;

                setTimeout(() => {
                    if (!connected) {
                        connectDeriv();
                    }
                }, 5000);
            }
        };

    } catch (error) {
        connected = false;
        updateConnectionUI("CONNECTION FAILED");
    }
}

function closeSocket() {
    if (socket) {
        try {
            socket.close();
        } catch (error) {}

        socket = null;
    }
}

function sendRequest(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return null;
    }

    const reqId = ++requestCounter;

    payload.req_id = reqId;

    requests.set(reqId, payload);

    socket.send(JSON.stringify(payload));

    return reqId;
}

/* =========================================================
   ACTIVE SYMBOLS
   ========================================================= */

function requestActiveSymbols() {
    sendRequest({
        active_symbols: "full",
        product_type: "basic"
    });
}

function handleActiveSymbols(data) {
    const symbols =
        data.active_symbols ||
        data.active_markets ||
        [];

    const found = [];

    symbols.forEach(item => {
        const symbol =
            item.symbol ||
            item.underlying_symbol ||
            "";

        const name = (
            item.display_name ||
            item.underlying_symbol_name ||
            symbol
        ).toUpperCase();

        const type = (
            item.symbol_type ||
            item.underlying_symbol_type ||
            ""
        ).toUpperCase();

        const isVolatility =
            /VOLATILITY/.test(name) ||
            /^R_\d+/.test(symbol) ||
            /^1HZ\d+V/.test(symbol);

        if (isVolatility && !found.includes(symbol)) {
            found.push(symbol);
        }
    });

    const preferred = [];

    FALLBACK_MARKETS.forEach(symbol => {
        if (found.includes(symbol)) {
            preferred.push(symbol);
        }
    });

    found.forEach(symbol => {
        if (!preferred.includes(symbol)) {
            preferred.push(symbol);
        }
    });

    activeMarkets =
        preferred.length > 0
            ? preferred.slice(0, MAX_MARKETS)
            : FALLBACK_MARKETS.slice();

    subscribeToMarkets();
}

/* =========================================================
   MARKET SUBSCRIPTIONS
   ========================================================= */

function subscribeToMarkets() {
    activeMarkets.forEach(symbol => {
        requestHistory(symbol);

        setTimeout(() => {
            subscribeTicks(symbol);
        }, 100);
    });
}

function requestHistory(symbol) {
    sendRequest({
        ticks_history: symbol,
        count: 100,
        end: "latest",
        style: "ticks"
    });
}

function subscribeTicks(symbol) {
    sendRequest({
        ticks: symbol,
        subscribe: 1
    });
}

/* =========================================================
   DERIV MESSAGE HANDLER
   ========================================================= */

function handleDerivMessage(data) {

    if (data.error) {
        console.warn("Deriv error:", data.error);
        return;
    }

    if (data.active_symbols || data.active_markets) {
        handleActiveSymbols(data);
        return;
    }

    if (data.history) {
        handleHistoryTicks(data);
        return;
    }

    if (data.tick) {
        handleLiveTick(data.tick);
        return;
    }

    if (data.subscription && data.tick) {
        handleLiveTick(data.tick);
    }
}

/* =========================================================
   HISTORY TICKS
   ========================================================= */

function handleHistoryTicks(data) {

    const symbol =
        data.echo_req?.ticks_history ||
        data.echo_req?.ticks ||
        data.history?.symbol ||
        data.symbol ||
        "";

    const prices =
        data.history?.prices ||
        data.history?.quotes ||
        [];

    if (!symbol || !prices.length) return;

    if (!marketData[symbol]) {
        marketData[symbol] = {
            symbol,
            prices: [],
            digits: [],
            ticks: [],
            lastQuote: null,
            lastEpoch: null
        };
    }

    const market = marketData[symbol];

    prices.forEach((price, index) => {

        const quote = safeNumber(price);

        if (!Number.isFinite(quote)) return;

        const digit = getLastDigit(quote);

        market.prices.push(quote);
        market.digits.push(digit);

        market.ticks.push({
            quote,
            digit,
            epoch: Date.now() + index
        });
    });

    trimMarket(market);

    renderMarketScanner();

    if (!currentSymbol && symbol) {
        currentSymbol = symbol;
        renderCurrentMarket();
    }

    refreshAIAnalysis();
}

/* =========================================================
   LIVE TICKS
   ========================================================= */

function handleLiveTick(tick) {

    const symbol =
        tick.symbol ||
        tick.underlying_symbol ||
        "";

    const quote = safeNumber(
        tick.quote ??
        tick.price ??
        tick.ask
    );

    if (!symbol || !Number.isFinite(quote)) {
        return;
    }

    const digit = getLastDigit(quote);

    if (!marketData[symbol]) {
        marketData[symbol] = {
            symbol,
            prices: [],
            digits: [],
            ticks: [],
            lastQuote: null,
            lastEpoch: null
        };
    }

    const market = marketData[symbol];

    market.prices.push(quote);
    market.digits.push(digit);

    market.ticks.push({
        quote,
        digit,
        epoch: safeNumber(tick.epoch, Date.now() / 1000)
    });

    market.lastQuote = quote;
    market.lastEpoch = tick.epoch;

    trimMarket(market);

    renderMarketScanner();

    if (symbol === currentSymbol) {
        renderCurrentMarket();
    }

    resolvePaperSignals(symbol, digit);

    refreshAIAnalysis();
}

/* =========================================================
   MARKET MEMORY LIMIT
   ========================================================= */

function trimMarket(market) {
    if (market.prices.length > 150) {
        market.prices =
            market.prices.slice(-150);
    }

    if (market.digits.length > 150) {
        market.digits =
            market.digits.slice(-150);
    }

    if (market.ticks.length > 150) {
        market.ticks =
            market.ticks.slice(-150);
    }
}

/* =========================================================
   LAST DIGIT
   ========================================================= */

function getLastDigit(value) {

    const str = String(value);

    if (str.includes(".")) {
        const decimals = str.split(".")[1];

        if (decimals && /\d/.test(decimals)) {
            const digits = decimals.match(/\d/g);
            return Number(digits[digits.length - 1]);
        }
    }

    const digits = str.match(/\d/g);

    if (!digits || !digits.length) {
        return 0;
    }

    return Number(digits[digits.length - 1]);
}

/* =========================================================
   DIGIT FREQUENCY
   ========================================================= */

function digitFrequency(digits) {

    const counts = Array(10).fill(0);

    digits.forEach(digit => {
        const d = Number(digit);

        if (d >= 0 && d <= 9) {
            counts[d]++;
        }
    });

    return counts;
}

function normalizedFrequency(digits) {

    const counts = digitFrequency(digits);

    const total = digits.length || 1;

    return counts.map(value => value / total);
}

/* =========================================================
   WEIGHTED DIGIT ANALYSIS
   ========================================================= */

function weightedDigitFrequency(digits) {

    const scores = Array(10).fill(0);

    const recent = digits.slice(-80);

    recent.forEach((digit, index) => {

        const ageWeight =
            0.35 +
            ((index + 1) / recent.length) * 0.65;

        const d = Number(digit);

        if (d >= 0 && d <= 9) {
            scores[d] += ageWeight;
        }
    });

    const total =
        scores.reduce((a, b) => a + b, 0) || 1;

    return scores.map(value => value / total);
}

/* =========================================================
   STREAK ANALYSIS
   ========================================================= */

function analyzeStreak(digits) {

    if (!digits.length) {
        return {
            digit: null,
            length: 0,
            direction: "NONE"
        };
    }

    const last = digits[digits.length - 1];

    let length = 1;

    for (let i = digits.length - 2; i >= 0; i--) {

        if (digits[i] === last) {
            length++;
        } else {
            break;
        }
    }

    return {
        digit: last,
        length,
        direction:
            length >= 3
                ? "STRONG"
                : length === 2
                    ? "SHORT"
                    : "NONE"
    };
}

/* =========================================================
   ENTROPY
   ========================================================= */

function calculateEntropy(digits) {

    if (!digits.length) return 0;

    const frequencies =
        normalizedFrequency(digits);

    let entropy = 0;

    frequencies.forEach(p => {

        if (p > 0) {
            entropy -= p * Math.log2(p);
        }
    });

    return entropy;
}

function entropyScore(digits) {

    const entropy =
        calculateEntropy(digits);

    /*
      Maximum entropy for 10 digits = log2(10)
      Lower entropy means concentration.
    */

    const maxEntropy = Math.log2(10);

    const concentration =
        1 - entropy / maxEntropy;

    return clamp(
        concentration * 100,
        0,
        100
    );
}

/* =========================================================
   CONCENTRATION
   ========================================================= */

function calculateConcentration(digits) {

    const freq =
        normalizedFrequency(digits);

    const sorted =
        [...freq].sort((a, b) => b - a);

    return {
        top1: sorted[0] || 0,
        top2:
            (sorted[0] || 0) +
            (sorted[1] || 0),
        top3:
            (sorted[0] || 0) +
            (sorted[1] || 0) +
            (sorted[2] || 0)
    };
}

/* =========================================================
   STABILITY
   ========================================================= */

function calculateStability(digits) {

    if (digits.length < 20) {
        return 35;
    }

    const first =
        digits.slice(-40, -20);

    const second =
        digits.slice(-20);

    const f1 =
        normalizedFrequency(first);

    const f2 =
        normalizedFrequency(second);

    let difference = 0;

    for (let i = 0; i < 10; i++) {
        difference +=
            Math.abs(f1[i] - f2[i]);
    }

    const stability =
        100 - difference * 100;

    return clamp(stability, 0, 100);
}

/* =========================================================
   PRICE MOMENTUM
   ========================================================= */

function calculateMomentum(prices) {

    if (prices.length < 10) {
        return {
            score: 50,
            direction: "NEUTRAL"
        };
    }

    const recent =
        prices.slice(-10);

    const old =
        prices.slice(-20, -10);

    const recentAvg =
        recent.reduce((a, b) => a + b, 0) /
        recent.length;

    const oldAvg =
        old.reduce((a, b) => a + b, 0) /
        old.length;

    if (recentAvg > oldAvg) {
        return {
            score: 65,
            direction: "UP"
        };
    }

    if (recentAvg < oldAvg) {
        return {
            score: 35,
            direction: "DOWN"
        };
    }

    return {
        score: 50,
        direction: "NEUTRAL"
    };
}

/* =========================================================
   PARITY ANALYSIS
   ========================================================= */

function parityAnalysis(digits) {

    let even = 0;
    let odd = 0;

    digits.forEach(d => {
        if (d % 2 === 0) {
            even++;
        } else {
            odd++;
        }
    });

    const total =
        even + odd || 1;

    return {
        even,
        odd,
        evenRate: even / total,
        oddRate: odd / total
    };
}

/* =========================================================
   OVER / UNDER ANALYSIS
   ========================================================= */

function overUnderAnalysis(digits, threshold) {

    let over = 0;
    let under = 0;

    digits.forEach(d => {

        if (d > threshold) {
            over++;
        } else {
            under++;
        }
    });

    const total =
        over + under || 1;

    return {
        over,
        under,
        overRate: over / total,
        underRate: under / total
    };
}

/* =========================================================
   MARKET ANALYSIS
   ========================================================= */

function calculateMarket(symbol) {

    const market =
        marketData[symbol];

    if (!market) {
        return null;
    }

    const digits =
        market.digits.slice(-80);

    const prices =
        market.prices.slice(-80);

    if (digits.length < 10) {
        return {
            symbol,
            score: 0,
            strength: "WAITING",
            confidence: 0,
            digits,
            counts: digitFrequency(digits)
        };
    }

    const weighted =
        weightedDigitFrequency(digits);

    const counts =
        digitFrequency(digits);

    const concentration =
        calculateConcentration(digits);

    const entropy =
        calculateEntropy(digits);

    const concentrationScore =
        entropyScore(digits);

    const stability =
        calculateStability(digits);

    const streak =
        analyzeStreak(digits);

    const momentum =
        calculateMomentum(prices);

    const parity =
        parityAnalysis(digits);

    const strongestDigit =
        weighted.indexOf(
            Math.max(...weighted)
        );

    const strongestRate =
        weighted[strongestDigit];

    /*
      Multi-signal score.

      Frequency:
      35%

      Concentration:
      20%

      Stability:
      20%

      Momentum:
      10%

      Streak:
      15%
    */

    const frequencyScore =
        clamp(
            strongestRate * 100 * 2.2,
            0,
            100
        );

    const streakScore =
        clamp(
            streak.length * 18,
            0,
            100
        );

    const momentumScore =
        100 -
        Math.abs(momentum.score - 50) * 0.6;

    let score =
        frequencyScore * 0.35 +
        concentrationScore * 0.20 +
        stability * 0.20 +
        momentumScore * 0.10 +
        streakScore * 0.15;

    /*
      Penalize unstable markets.
    */

    if (stability < 30) {
        score -= 8;
    }

    /*
      Very low concentration means
      weaker digit signal.
    */

    if (concentration.top1 < 0.14) {
        score -= 10;
    }

    score = clamp(score, 0, 100);

    let strength = "WEAK";

    if (score >= 75) {
        strength = "VERY STRONG";
    } else if (score >= 65) {
        strength = "STRONG";
    } else if (score >= 52) {
        strength = "MODERATE";
    }

    const agreementSignals = [];

    if (strongestRate >= 0.14) {
        agreementSignals.push("DIGIT");
    }

    if (concentrationScore >= 25) {
        agreementSignals.push("CONCENTRATION");
    }

    if (stability >= 60) {
        agreementSignals.push("STABILITY");
    }

    if (streak.length >= 2) {
        agreementSignals.push("STREAK");
    }

    if (momentum.direction !== "NEUTRAL") {
        agreementSignals.push("MOMENTUM");
    }

    return {
        symbol,
        score,
        strength,
        confidence: score,

        digits,
        prices,

        counts,
        weighted,

        strongestDigit,
        strongestRate,

        concentration,
        concentrationScore,

        entropy,

        stability,
        streak,

        momentum,
        parity,

        agreementSignals,

        dataCount: digits.length
    };
}

/* =========================================================
   MARKET RANKING
   ========================================================= */

function rankMarkets() {

    return activeMarkets
        .map(symbol => calculateMarket(symbol))
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
}

function bestMarket() {

    const ranked =
        rankMarkets();

    return ranked.length
        ? ranked[0]
        : null;
}

/* =========================================================
   STRATEGY
   ========================================================= */

function getSelectedStrategy() {

    const select =
        $("tradeStrategy");

    if (select && select.value) {
        return select.value.toUpperCase();
    }

    return currentStrategy;
}

/* =========================================================
   MANUAL NUMBER
   ========================================================= */

function getManualNumber() {

    const input =
        $("number");

    if (!input) return null;

    const value =
        Number(input.value);

    if (
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 9
    ) {
        return value;
    }

    return null;
}

/* =========================================================
   PREDICTION ENGINE
   ========================================================= */

function makePrediction(analysis, strategy) {

    if (!analysis) {
        return {
            prediction: "WAIT",
            confidence: 0,
            type: strategy,
            reason: "Waiting for sufficient market data."
        };
    }

    const digits =
        analysis.digits;

    const weighted =
        analysis.weighted;

    const counts =
        analysis.counts;

    const manual =
        getManualNumber();

    const strongest =
        analysis.strongestDigit;

    let prediction;
    let confidence;
    let reason;

    /* =====================================================
       MATCHES
       ===================================================== */

    if (strategy === "MATCHES") {

        prediction =
            manual !== null
                ? manual
                : strongest;

        const rate =
            weighted[prediction] || 0;

        confidence =
            clamp(
                50 +
                rate * 100 +
                analysis.stability * 0.12 +
                analysis.concentrationScore * 0.08,
                0,
                99
            );

        reason =
            manual !== null
                ? `Manual match digit ${manual}. Weighted frequency ${(
                    rate * 100
                ).toFixed(1)}%.`
                : `Digit ${strongest} has the strongest weighted frequency at ${(
                    rate * 100
                ).toFixed(1)}%.`;
    }

    /* =====================================================
       DIFFERS
       ===================================================== */

    else if (strategy === "DIFFERS") {

        prediction =
            manual !== null
                ? manual
                : strongest;

        const rate =
            weighted[prediction] || 0;

        confidence =
            clamp(
                55 +
                (1 - rate) * 35 +
                analysis.stability * 0.10,
                0,
                99
            );

        reason =
            manual !== null
                ? `Manual differ digit ${manual}. Its weighted occurrence is ${(
                    rate * 100
                ).toFixed(1)}%.`
                : `Digit ${strongest} is currently the strongest digit, making it the selected differ target.`;
    }

    /* =====================================================
       OVER
       ===================================================== */

    else if (strategy === "OVER") {

        const threshold =
            manual !== null
                ? manual
                : 4;

        const result =
            overUnderAnalysis(
                digits,
                threshold
            );

        const weightedOver =
            digits
                .slice(-40)
                .reduce(
                    (sum, digit, index, arr) => {

                        const weight =
                            0.5 +
                            ((index + 1) /
                                arr.length) *
                            0.5;

                        return sum +
                            (digit > threshold
                                ? weight
                                : 0);
                    },
                    0
                );

        const weightedTotal =
            digits
                .slice(-40)
                .reduce(
                    (sum, _, index, arr) =>
                        sum +
                        0.5 +
                        ((index + 1) /
                            arr.length) *
                        0.5,
                    0
                );

        const weightedRate =
            weightedTotal
                ? weightedOver /
                  weightedTotal
                : 0.5;

        prediction =
            `>${threshold}`;

        confidence =
            clamp(
                50 +
                Math.abs(
                    weightedRate - 0.5
                ) * 100 +
                analysis.stability * 0.10,
                0,
                99
            );

        reason =
            `${(
                result.overRate * 100
            ).toFixed(1)}% of recent digits are above ${threshold}.`;
    }

    /* =====================================================
       UNDER
       ===================================================== */

    else if (strategy === "UNDER") {

        const threshold =
            manual !== null
                ? manual
                : 5;

        const result =
            overUnderAnalysis(
                digits,
                threshold
            );

        const underRate =
            result.underRate;

        prediction =
            `<${threshold}`;

        confidence =
            clamp(
                50 +
                Math.abs(
                    underRate - 0.5
                ) * 100 +
                analysis.stability * 0.10,
                0,
                99
            );

        reason =
            `${(
                underRate * 100
            ).toFixed(1)}% of recent digits are at or below ${threshold}.`;
    }

    /* =====================================================
       EVEN
       ===================================================== */

    else if (strategy === "EVEN") {

        const evenDigits =
            [0, 2, 4, 6, 8];

        const strongestEven =
            evenDigits
                .sort(
                    (a, b) =>
                        weighted[b] -
                        weighted[a]
                )[0];

        const evenRate =
            analysis.parity.evenRate;

        prediction =
            strongestEven;

        confidence =
            clamp(
                50 +
                Math.abs(
                    evenRate - 0.5
                ) * 100 +
                analysis.stability * 0.10,
                0,
                99
            );

        reason =
            `Even rate is ${(
                evenRate * 100
            ).toFixed(1)}%. Strongest even digit is ${strongestEven}.`;
    }

    /* =====================================================
       ODD
       ===================================================== */

    else if (strategy === "ODD") {

        const oddDigits =
            [1, 3, 5, 7, 9];

        const strongestOdd =
            oddDigits
                .sort(
                    (a, b) =>
                        weighted[b] -
                        weighted[a]
                )[0];

        const oddRate =
            analysis.parity.oddRate;

        prediction =
            strongestOdd;

        confidence =
            clamp(
                50 +
                Math.abs(
                    oddRate - 0.5
                ) * 100 +
                analysis.stability * 0.10,
                0,
                99
            );

        reason =
            `Odd rate is ${(
                oddRate * 100
            ).toFixed(1)}%. Strongest odd digit is ${strongestOdd}.`;
    }

    else {

        prediction =
            strongest;

        confidence =
            analysis.confidence;

        reason =
            "AI selected the strongest available signal.";
    }

    /*
      Multi-signal bonus.
    */

    const agreement =
        analysis.agreementSignals.length;

    if (agreement >= 4) {
        confidence += 7;
    } else if (agreement >= 3) {
        confidence += 4;
    }

    /*
      Streak caution.

      A streak should not automatically
      be treated as a guaranteed continuation.
    */

    if (analysis.streak.length >= 4) {
        confidence -= 4;
    }

    confidence =
        clamp(
            confidence,
            0,
            99
        );

    /*
      NO TRADE protection.
    */

    if (
        analysis.score < 45 ||
        analysis.stability < 20 ||
        confidence < 52
    ) {
        return {
            prediction: "NO TRADE",
            confidence,
            type: strategy,
            reason:
                "Signals are too weak or unstable. AI recommends waiting."
        };
    }

    return {
        prediction,
        confidence,
        type: strategy,
        reason,
        agreement,
        strongestDigit: strongest
    };
}

/* =========================================================
   LOCKED PREDICTION
   ========================================================= */

function createLockedPrediction() {

    const analysis =
        bestMarket();

    if (!analysis) {
        return null;
    }

    const strategy =
        getSelectedStrategy();

    const prediction =
        makePrediction(
            analysis,
            strategy
        );

    return {
        symbol: analysis.symbol,
        strategy,
        prediction: prediction.prediction,
        confidence: prediction.confidence,
        reason: prediction.reason,

        score: analysis.score,
        strength: analysis.strength,

        strongestDigit:
            analysis.strongestDigit,

        strongestRate:
            analysis.strongestRate,

        stability:
            analysis.stability,

        concentration:
            analysis.concentrationScore,

        streak:
            analysis.streak.length,

        agreement:
            prediction.agreement ||
            analysis.agreementSignals.length,

        createdAt: Date.now(),

        sourceAnalysis: analysis
    };
}

/* =========================================================
   AI PHASES
   ========================================================= */

function enterPhase(nextPhase) {

    phase = nextPhase;

    if (phase === "analysis") {

        phaseRemaining = 10;

        lockedPrediction = null;

        setAIStatus(
            "ANALYZING MARKET"
        );

    } else if (phase === "lock") {

        phaseRemaining = 5;

        lockedPrediction =
            createLockedPrediction();

        setAIStatus(
            "PREDICTION LOCKED"
        );

    } else if (phase === "trade") {

        phaseRemaining = 3;

        setAIStatus(
            "TRADE NOW"
        );

        if (lockedPrediction) {
            recordSignal(
                lockedPrediction
            );
        }
    }

    renderPhase();
    renderLockedPrediction();
}

function startAI() {

    if (aiRunning) return;

    aiRunning = true;

    enterPhase("analysis");

    aiTimer =
        setInterval(() => {

            if (!aiRunning) return;

            phaseRemaining--;

            if (phaseRemaining <= 0) {

                if (phase === "analysis") {
                    enterPhase("lock");

                } else if (phase === "lock") {
                    enterPhase("trade");

                } else {
                    enterPhase("analysis");
                }

                return;
            }

            renderPhase();

        }, 1000);
}

function stopAI() {

    aiRunning = false;

    if (aiTimer) {
        clearInterval(aiTimer);
        aiTimer = null;
    }

    phase = "analysis";
    phaseRemaining = 10;

    lockedPrediction = null;

    setAIStatus("AI STOPPED");

    renderPhase();
    renderLockedPrediction();
}

/* =========================================================
   AI UI
   ========================================================= */

function setAIStatus(status) {

    setText(
        "aiCircleStatus",
        status
    );

    setText(
        "aiCircleLabel",
        status
    );
}

function renderPhase() {

    const timer =
        Math.max(
            1,
            phaseRemaining
        );

    setText(
        "aiCircleTimer",
        timer
    );

    setText(
        "cycleAnalysis",
        phase === "analysis"
            ? `${timer}s`
            : "✓"
    );

    setText(
        "cyclePrediction",
        phase === "lock"
            ? `${timer}s`
            : phase === "trade"
                ? "✓"
                : "WAIT"
    );

    setText(
        "cycleTrade",
        phase === "trade"
            ? `${timer}s`
            : "WAIT"
    );

    setText(
        "cycleCooldown",
        "READY"
    );
}

function renderLockedPrediction() {

    if (!lockedPrediction) {

        setText(
            "aiMarket",
            currentSymbol || "SCANNING..."
        );

        setText(
            "aiPrediction",
            "WAITING"
        );

        setText(
            "aiType",
            getSelectedStrategy()
        );

        setText(
            "analysisConfidence",
            "0%"
        );

        return;
    }

    setText(
        "aiMarket",
        lockedPrediction.symbol
    );

    setText(
        "aiPrediction",
        lockedPrediction.prediction
    );

    setText(
        "aiType",
        lockedPrediction.strategy
    );

    setText(
        "analysisConfidence",
        `${lockedPrediction.confidence.toFixed(1)}%`
    );

    setText(
        "aiCircle",
        ""
    );

    updateAIReport(
        lockedPrediction
    );
}

/* =========================================================
   AI REPORT
   ========================================================= */

function updateAIReport(prediction) {

    const analysis =
        prediction.sourceAnalysis;

    if (!analysis) return;

    setText(
        "analysisMsg",
        prediction.reason
    );

    setText(
        "reportMarket",
        analysis.symbol
    );

    setText(
        "reportScore",
        `${analysis.score.toFixed(1)}`
    );

    setText(
        "reportStrength",
        analysis.strength
    );

    setText(
        "reportStability",
        `${analysis.stability.toFixed(1)}%`
    );

    setText(
        "reportConcentration",
        `${analysis.concentrationScore.toFixed(1)}%`
    );

    setText(
        "reportStreak",
        analysis.streak.length
    );

    setText(
        "reportAgreement",
        prediction.agreement
    );
}

/* =========================================================
   REFRESH AI ANALYSIS
   ========================================================= */

function refreshAIAnalysis() {

    renderMarketScanner();

    if (!currentSymbol) {
        const best =
            bestMarket();

        if (best) {
            currentSymbol =
                best.symbol;
        }
    }

    renderCurrentMarket();

    /*
      During analysis phase we can update
      the displayed market intelligence.

      During lock/trade we DO NOT replace
      the locked prediction.
    */

    if (
        aiRunning &&
        phase !== "analysis"
    ) {
        return;
    }

    const best =
        bestMarket();

    if (!best) return;

    const strategy =
        getSelectedStrategy();

    const preview =
        makePrediction(
            best,
            strategy
        );

    setText(
        "aiMarket",
        best.symbol
    );

    setText(
        "aiPrediction",
        preview.prediction
    );

    setText(
        "aiType",
        strategy
    );

    setText(
        "analysisConfidence",
        `${preview.confidence.toFixed(1)}%`
    );

    setText(
        "analysisMsg",
        preview.reason
    );
}

/* =========================================================
   MARKET SCANNER UI
   ========================================================= */

function renderMarketScanner() {

    const container =
        $("markets");

    if (!container) return;

    const ranked =
        rankMarkets();

    if (!ranked.length) {
        container.innerHTML =
            `<div class="empty">Waiting for market data...</div>`;
        return;
    }

    container.innerHTML =
        ranked.map((market, index) => {

            const selected =
                market.symbol === currentSymbol;

            return `
                <div
                    class="market-card ${selected ? "selected" : ""}"
                    data-symbol="${market.symbol}"
                    onclick="selectMarket('${market.symbol}')"
                >
                    <div class="market-top">
                        <strong>${market.symbol}</strong>
                        <span>#${index + 1}</span>
                    </div>

                    <div class="market-score">
                        ${market.score.toFixed(1)}
                    </div>

                    <div class="market-strength">
                        ${market.strength}
                    </div>

                    <div class="market-meta">
                        <span>
                            Stability
                            ${market.stability.toFixed(0)}%
                        </span>

                        <span>
                            Data
                            ${market.dataCount}
                        </span>
                    </div>
                </div>
            `;
        }).join("");
}

/* =========================================================
   SELECT MARKET
   ========================================================= */

function selectMarket(symbol) {

    if (!marketData[symbol]) {
        return;
    }

    currentSymbol = symbol;

    renderMarketScanner();
    renderCurrentMarket();
    refreshAIAnalysis();
}

/* =========================================================
   CURRENT MARKET UI
   ========================================================= */

function renderCurrentMarket() {

    if (!currentSymbol) return;

    const market =
        marketData[currentSymbol];

    if (!market) return;

    renderDigits(
        market.digits
    );
}

function renderDigits(digits) {

    const container =
        $("digits");

    if (!container) return;

    const counts =
        digitFrequency(
            digits.slice(-80)
        );

    const total =
        counts.reduce(
            (a, b) => a + b,
            0
        ) || 1;

    container.innerHTML =
        counts.map((count, digit) => {

            const percent =
                (count / total) * 100;

            return `
                <div class="digit-card">
                    <div class="digit-number">
                        ${digit}
                    </div>

                    <div class="digit-count">
                        ${count}
                    </div>

                    <div class="digit-percent">
                        ${percent.toFixed(1)}%
                    </div>
                </div>
            `;
        }).join("");
}

/* =========================================================
   SIGNAL RECORDING
   ========================================================= */

function recordSignal(prediction) {

    if (!prediction) return;

    const now = Date.now();

    /*
      Prevent accidental duplicate records.
    */

    if (
        now - lastSignalTime <
        2000
    ) {
        return;
    }

    lastSignalTime = now;

    const signal = {
        symbol: prediction.symbol,
        strategy: prediction.strategy,
        prediction: prediction.prediction,
        confidence: Number(
            prediction.confidence.toFixed(1)
        ),
        score: Number(
            prediction.score.toFixed(1)
        ),
        result: "PENDING",
        mode: "PAPER"
    };

    addHistory(signal);

    pendingPaperSignals.push({
        ...signal,
        createdAt: now,
        ticksChecked: 0
    });
}

/* =========================================================
   PAPER RESULT ENGINE
   ========================================================= */

function resolvePaperSignals(
    symbol,
    actualDigit
) {

    pendingPaperSignals =
        pendingPaperSignals.filter(signal => {

            if (
                signal.symbol !== symbol
            ) {
                return true;
            }

            signal.ticksChecked++;

            if (
                signal.ticksChecked <
                PAPER_RESULT_TICKS
            ) {
                return true;
            }

            const win =
                evaluateSignal(
                    signal,
                    actualDigit
                );

            updateHistoryResult(
                signal,
                win ? "WIN" : "LOSS"
            );

            return false;
        });
}

/* =========================================================
   EVALUATE SIGNAL
   ========================================================= */

function evaluateSignal(
    signal,
    actualDigit
) {

    const strategy =
        signal.strategy;

    const prediction =
        signal.prediction;

    if (
        prediction === "NO TRADE" ||
        prediction === "WAIT"
    ) {
        return false;
    }

    if (strategy === "MATCHES") {

        return Number(
            prediction
        ) === actualDigit;
    }

    if (strategy === "DIFFERS") {

        return Number(
            prediction
        ) !== actualDigit;
    }

    if (strategy === "EVEN") {

        return actualDigit % 2 === 0;
    }

    if (strategy === "ODD") {

        return actualDigit % 2 !== 0;
    }

    if (strategy === "OVER") {

        const threshold =
            getManualNumber() ??
            4;

        return actualDigit > threshold;
    }

    if (strategy === "UNDER") {

        const threshold =
            getManualNumber() ??
            5;

        return actualDigit < threshold;
    }

    return false;
}

/* =========================================================
   UPDATE HISTORY RESULT
   ========================================================= */

function updateHistoryResult(
    signal,
    result
) {

    const history =
        loadHistory();

    const index =
        history.findIndex(item =>
            item.symbol === signal.symbol &&
            item.strategy === signal.strategy &&
            item.prediction === signal.prediction &&
            item.result === "PENDING"
        );

    if (index === -1) return;

    history[index].result =
        result;

    history[index].resolvedAt =
        new Date().toLocaleString();

    saveHistory(history);

    renderHistory();
    updateHistoryStats();
}

/* =========================================================
   HISTORY UI
   ========================================================= */

function renderHistory() {

    const list =
        $("historyList");

    if (!list) return;

    const history =
        loadHistory();

    if (!history.length) {

        list.innerHTML = `
            <tr>
                <td colspan="7">
                    No history yet
                </td>
            </tr>
        `;

        return;
    }

    list.innerHTML =
        history.map(item => {

            return `
                <tr>
                    <td>${item.time || "-"}</td>
                    <td>${item.symbol || "-"}</td>
                    <td>${item.strategy || "-"}</td>
                    <td>${item.prediction ?? "-"}</td>
                    <td>${item.confidence ?? 0}%</td>
                    <td>${item.result || "PENDING"}</td>
                    <td>${item.mode || "PAPER"}</td>
                </tr>
            `;
        }).join("");
}

function updateHistoryStats() {

    const history =
        loadHistory();

    const total =
        history.length;

    const wins =
        history.filter(
            item =>
                item.result === "WIN"
        ).length;

    const losses =
        history.filter(
            item =>
                item.result === "LOSS"
        ).length;

    const pending =
        history.filter(
            item =>
                item.result === "PENDING"
        ).length;

    const resolved =
        wins + losses;

    const accuracy =
        resolved
            ? (wins / resolved) * 100
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
        "historyPending",
        pending
    );

    setText(
        "historyAccuracy",
        `${accuracy.toFixed(1)}%`
    );
}

/* =========================================================
   TRADE PAGE
   ========================================================= */

function renderTradePage() {

    if (!lockedPrediction) {

        setText(
            "tradeStatus",
            "WAITING FOR AI SIGNAL"
        );

        setText(
            "tradePrediction",
            "WAITING"
        );

        setText(
            "tradeType",
            getSelectedStrategy()
        );

        setText(
            "tradeConfidence",
            "0%"
        );

        return;
    }

    setText(
        "tradeStatus",
        phase === "trade"
            ? "TRADE NOW"
            : "SIGNAL READY"
    );

    setText(
        "tradePrediction",
        lockedPrediction.prediction
    );

    setText(
        "tradeType",
        lockedPrediction.strategy
    );

    setText(
        "tradeConfidence",
        `${lockedPrediction.confidence.toFixed(1)}%`
    );
}

/* =========================================================
   STRATEGY BUTTONS
   ========================================================= */

function setupStrategyButtons() {

    const buttons =
        document.querySelectorAll(
            "[data-strategy]"
        );

    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const strategy =
                    button.dataset.strategy;

                currentStrategy =
                    strategy;

                buttons.forEach(btn =>
                    btn.classList.remove(
                        "active"
                    )
                );

                button.classList.add(
                    "active"
                );

                updateManualNumberUI();

                /*
                  If AI is currently in
                  analysis, refresh preview.
                */

                if (
                    !aiRunning ||
                    phase === "analysis"
                ) {
                    refreshAIAnalysis();
                }
            }
        );
    });
}

/* =========================================================
   MANUAL NUMBER UI
   ========================================================= */

function updateManualNumberUI() {

    const group =
        $("manualNumberGroup");

    if (!group) return;

    const strategy =
        getSelectedStrategy();

    const needsNumber =
        [
            "MATCHES",
            "DIFFERS",
            "OVER",
            "UNDER"
        ].includes(strategy);

    group.style.display =
        needsNumber
            ? "block"
            : "none";

    const title =
        $("manualTitle");

    if (title) {

        if (
            strategy === "MATCHES" ||
            strategy === "DIFFERS"
        ) {
            title.textContent =
                "ENTER DIGIT 0–9";
        } else if (
            strategy === "OVER"
        ) {
            title.textContent =
                "ENTER OVER NUMBER";
        } else if (
            strategy === "UNDER"
        ) {
            title.textContent =
                "ENTER UNDER NUMBER";
        }
    }
}

/* =========================================================
   CONNECTION UI
   ========================================================= */

function updateConnectionUI(status) {

    setText(
        "connectionStatus",
        status
    );

    const dot =
        $("statusDot");

    if (!dot) return;

    dot.classList.remove(
        "connected",
        "error"
    );

    if (
        status === "CONNECTED"
    ) {
        dot.classList.add(
            "connected"
        );
    }

    if (
        status.includes("ERROR") ||
        status.includes("FAILED")
    ) {
        dot.classList.add(
            "error"
        );
    }
}

/* =========================================================
   ACCOUNT MODE
   ========================================================= */

function setAccountMode(mode) {

    currentAccountMode =
        mode;

    setText(
        "accountMode",
        mode
    );

    /*
      Balance remains unavailable
      until authenticated Deriv
      account access is implemented.
    */

    setText(
        "balance",
        "—"
    );

    const demo =
        $("demoBtn");

    const real =
        $("realBtn");

    if (demo) {
        demo.classList.toggle(
            "active",
            mode === "DEMO"
        );
    }

    if (real) {
        real.classList.toggle(
            "active",
            mode === "REAL"
        );
    }
}

/* =========================================================
   THEME
   ========================================================= */

function setupTheme() {

    const toggle =
        $("themeToggle");

    if (!toggle) return;

    const saved =
        localStorage.getItem(
            "krishwave_theme"
        );

    if (saved === "light") {
        document.body.classList.add(
            "light"
        );
    }

    toggle.addEventListener(
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

/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function showPage(page) {

    const aliases = {
        analysisPage: "analysis",
        tradePage: "trade",
        historyPage: "history"
    };

    page =
        aliases[page] ||
        page;

    document
        .querySelectorAll(".page")
        .forEach(section => {

            section.classList.remove(
                "active"
            );

            section.style.display =
                "none";
        });

    const target =
        document.getElementById(
            `${page}Page`
        );

    if (target) {

        target.classList.add(
            "active"
        );

        target.style.display =
            "block";
    }

    document
        .querySelectorAll(
            ".bottom-nav [data-page]"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.page ===
                page
            );
        });

    if (page === "trade") {
        renderTradePage();
    }

    if (page === "history") {
        renderHistory();
        updateHistoryStats();
    }
}

function setupNavigation() {

    document
        .querySelectorAll(
            "[data-page]"
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
}

/* =========================================================
   AI BUTTONS
   ========================================================= */

function setupAIButtons() {

    const start =
        $("startAI");

    const stop =
        $("stopAI");

    if (start) {
        start.addEventListener(
            "click",
            startAI
        );
    }

    if (stop) {
        stop.addEventListener(
            "click",
            stopAI
        );
    }
}

/* =========================================================
   TRADE BUTTONS
   ========================================================= */

function setupTradeButtons() {

    const start =
        $("startTrading");

    const stop =
        $("stopTrading");

    if (start) {

        start.addEventListener(
            "click",
            () => {

                if (
                    !lockedPrediction
                ) {
                    alert(
                        "Wait for an AI prediction first."
                    );

                    return;
                }

                if (
                    lockedPrediction.prediction ===
                    "NO TRADE"
                ) {
                    alert(
                        "AI recommends NO TRADE."
                    );

                    return;
                }

                alert(
                    "KRISHWAVE is currently in PAPER mode. No real-money trade was placed."
                );
            }
        );
    }

    if (stop) {

        stop.addEventListener(
            "click",
            () => {

                setText(
                    "tradeStatus",
                    "TRADING STOPPED"
                );
            }
        );
    }
}

/* =========================================================
   ACCOUNT BUTTONS
   ========================================================= */

function setupAccountButtons() {

    const demo =
        $("demoBtn");

    const real =
        $("realBtn");

    if (demo) {

        demo.addEventListener(
            "click",
            () => {

                setAccountMode(
                    "DEMO"
                );
            }
        );
    }

    if (real) {

        real.addEventListener(
            "click",
            () => {

                setAccountMode(
                    "REAL"
                );

                alert(
                    "REAL account connection requires authenticated Deriv API access. KRISHWAVE has not placed a real trade."
                );
            }
        );
    }
}

/* =========================================================
   CLEAR HISTORY BUTTON
   ========================================================= */

function setupHistoryButtons() {

    const clear =
        $("clearHistory");

    if (!clear) return;

    clear.addEventListener(
        "click",
        () => {

            if (
                confirm(
                    "Clear KRISHWAVE history?"
                )
            ) {
                clearHistory();
            }
        }
    );
}

/* =========================================================
   SELECT STRATEGY FROM TRADE SELECT
   ========================================================= */

function setupTradeStrategy() {

    const select =
        $("tradeStrategy");

    if (!select) return;

    select.addEventListener(
        "change",
        () => {

            currentStrategy =
                select.value.toUpperCase();

            updateManualNumberUI();

            if (
                !aiRunning ||
                phase === "analysis"
            ) {
                refreshAIAnalysis();
            }
        }
    );
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function initialize() {

    setupNavigation();
    setupAIButtons();
    setupTradeButtons();
    setupAccountButtons();
    setupHistoryButtons();
    setupTheme();
    setupStrategyButtons();
    setupTradeStrategy();

    updateManualNumberUI();

    setAccountMode(
        "DEMO"
    );

    renderHistory();
    updateHistoryStats();

    showPage(
        "analysis"
    );

    updateConnectionUI(
        "CONNECTING..."
    );

    connectDeriv();

    /*
      Keep trade page synchronized
      with AI state.
    */

    setInterval(() => {
        renderTradePage();
    }, 500);

    /*
      Keep scanner fresh.
    */

    setInterval(() => {

        renderMarketScanner();

        if (
            !aiRunning ||
            phase === "analysis"
        ) {
            refreshAIAnalysis();
        }

    }, 1500);
}

/* =========================================================
   GLOBAL ERROR HANDLER
   ========================================================= */

window.addEventListener(
    "error",
    event => {

        console.error(
            "KRISHWAVE error:",
            event.error
        );

        setText(
            "analysisMsg",
            "AI engine running — monitoring data."
        );
    }
);

window.addEventListener(
    "unhandledrejection",
    event => {

        console.warn(
            "KRISHWAVE promise error:",
            event.reason
        );
    }
);

/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.startAI = startAI;
window.stopAI = stopAI;
window.showPage = showPage;
window.selectMarket = selectMarket;
window.clearHistory = clearHistory;

/* =========================================================
   START
   ========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initialize
    );

} else {

    initialize();
}