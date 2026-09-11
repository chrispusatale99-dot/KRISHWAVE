/* =========================================================
   KRISHWAVE AI BEAST V9.0
   COMPLETE PAPER / DEMO INTELLIGENCE ENGINE

   IMPORTANT
   ---------------------------------------------------------
   DEMO / PAPER ONLY
   NO REAL TRADES ARE EXECUTED.

   ENGINES
   ---------------------------------------------------------
   1. AI BOT
      - User selects multiple strategies
      - Example: MATCHES + DIFFERS
      - 3 second analysis cycle
      - strongest selected strategy wins
      - paper trade only

   2. CIRCULAR AI
      EXACT CYCLE:
      10s ANALYSIS
      5s  PREDICTION
      3s  TRADE WINDOW
      3s  COOLDOWN
      repeat

   3. MANUAL
      - User selects market
      - User selects strategy
      - User places paper trade

   MARKET SCANNER
   ---------------------------------------------------------
   15 volatility markets
   Multi-market tick collection
   Beast scoring
   Confidence scoring
   Digit analysis
   Momentum
   Even/Odd
   Over/Under
   Matches/Differs
   Data quality

   PAPER ENGINE
   ---------------------------------------------------------
   Separate paper balance
   Separate Deriv demo balance
   Wins/losses
   Profit
   Take profit
   Stop loss
   Martingale
   Active trades
   History
========================================================= */

"use strict";

/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {
    VERSION: "9.0",

    CLIENT_ID: "34khasPjsT0PCRR8X3Z70",

    REDIRECT_URI:
        "https://chrispusatale99-dot.github.io/KRISHWAVE/",

    CLOUD_API:
        "https://krishwave2.chrispusatale99.workers.dev",

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

    MAX_TICKS: 250,
    MIN_ANALYSIS_TICKS: 20,
    SCAN_TICKS: 60,

    CIRCULAR_ANALYSIS: 10,
    CIRCULAR_PREDICTION: 5,
    CIRCULAR_TRADE: 3,
    CIRCULAR_COOLDOWN: 3,

    BOT_INTERVAL_MS: 3000,

    START_PAPER_BALANCE: 1000,

    MIN_STAKE: 0.25,
    MAX_ACTIVE_TRADES: 10,

    BOT_MIN_CONFIDENCE: 60,
    STRONG_SIGNAL: 75,
    BEAST_SIGNAL: 85,

    PAYOUTS: {
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

    sessionToken:
        sessionStorage.getItem(
            "krishwave_cloud_session"
        ) || "",

    accountId: "",
    currency: "USD",
    derivBalance: 0,

    connectedToDeriv: false,

    publicWs: null,
    authWs: null,

    currentMarket: "R_100",

    ticks: {},

    tickSequence: {},

    lastProcessedTick: {},

    chartPrices: [],

    currentAnalysis: null,

    marketScanner: [],

    strongestMarket: null,

    /*
       MANUAL AND CIRCULAR AI NOW HAVE
       COMPLETELY SEPARATE STRATEGY CARDS.
    */
    manualStrategy: "MATCHES",

    /*
       AUTO preserves the original Circular AI
       automatic strategy behavior.
    */
    circularStrategy: "AUTO",

    /*
       Used only to know which strategy card
       opened the shared strategy modal.
    */
    activeStrategySelector: null,

    /*
       AI BOT HAS ITS OWN STRATEGY LIST.
       It can contain:
       MATCHES + DIFFERS
       or any other combination.
    */
    botStrategies: [
        "MATCHES",
        "DIFFERS",
        "OVER",
        "UNDER",
        "EVEN",
        "ODD"
    ],

    botRunning: false,

    circularRunning: false,

    circularPhase: "IDLE",

    circularTimer: 0,

    circularInterval: null,

    botInterval: null,

    reconnectTimer: null,

    tradeCounter: 0,

    paperBalance:
        Number(
            localStorage.getItem(
                "krishwave_paper_balance"
            )
        ) || CONFIG.START_PAPER_BALANCE,

    paperTrades: [],

    activeTrades: [],

    stats: {
        total: 0,
        wins: 0,
        losses: 0,
        stake: 0,
        won: 0,
        profit: 0
    },

    sessionProfit: 0,

    takeProfit: 20,

    stopLoss: 20,

    realMode: false,

    botLastTickSequence: {},

    circularLastTradeSequence: {},

    botNextStake: null,

    circularNextStake: null,

    initialized: false,

    theme: localStorage.getItem(
        "krishwave_theme"
    ) || "dark"
};


/* =========================================================
   DOM
========================================================= */

const DOM = {};

function get(id) {
    return document.getElementById(id);
}

function cacheDOM() {

    const ids = [

        "connectionDot",
        "connectionText",
        "modeBadge",
        "themeToggle",

        "accountId",
        "balanceDisplay",
        "currency",
        "connectDerivBtn",

        "dataStatus",

        "analysisPage",
        "analysisMarketSelect",
        "currentChartMarket",
        "currentLivePrice",
        "priceChartCanvas",

        "digitSampleCount",
        "lastDigit",
        "analysisConfidence",

        "aiStatus",
        "aiCircle",
        "aiCircleLabel",
        "aiCirclePrediction",
        "aiPrediction",
        "aiType",
        "analysisMsg",

        "aiMarket",
        "digitStatsGrid",

        "aiCircleStatus",
        "cycleAnalysis",
        "cycleTrade",
        "aiCircleTimer",
        "cycleCooldown",
        "startAI",
        "stopAI",

        "tradePage",

        "tabAiBot",
        "tabCircularAI",
        "tabManual",

        "aiBotPanel",
        "circularPanel",
        "manualPanel",

        "botStatusDash",
        "botSelectedMarket",
        "botScore",
        "aiPredictionLarge",
        "predictionConfidence",
        "botMarketSelect",
        "botStrategyTrigger",
        "botStrategyLabel",
        "stakeInput",
        "takeProfitInput",
        "stopLossInput",
        "martingaleInput",
        "startBotBtn",

        "circularStatusText",
        "circularMarketSelect",
        "circularStrategyTrigger",
        "circularStrategyLabel",
        "circularStakeInput",
        "circularTakeProfitInput",
        "circularStopLossInput",
        "startCircularTradeBtn",

        "manualStatusText",
        "manualMarketSelect",
        "manualStrategyTrigger",
        "manualSelectedStrategyLabel",
        "targetDigitContainer",
        "manualTargetDigitInput",
        "manualStakeInput",
        "manualTakeProfitInput",
        "manualStopLossInput",
        "placeTradeBtn",

        "paperTotal",
        "paperWins",
        "paperLosses",
        "paperAccuracy",

        "activeTradeCount",
        "activeTradesList",

        "historyPage",
        "clearLogsBtn",
        "historyTotalStake",
        "historyAmountWon",
        "historyNetProfit",
        "tradingStatusLabel",
        "sessionProfitDisplay",
        "totalProfitDisplay",
        "stopTradingBtn",
        "historyCardsList",

        "strategyModal",
        "closeStrategyModal",
        "strategyOptions",

        "botStrategyModal",
        "closeBotStrategyModal",
        "applyBotStrategies",

        "realConfirmModal",
        "cancelRealBtn",
        "confirmRealBtn",

        "toast",
        "toastMessage"
    ];

    ids.forEach(id => {
        DOM[id] = get(id);
    });
}


/* =========================================================
   INITIALIZATION
========================================================= */

function initializeApp() {

    cacheDOM();

    setupTheme();

    setupNavigation();

    setupTabs();

    setupStrategyControls();

    setupButtons();

    setupMarketSelectors();

    setupBotStrategyControls();

    setupRiskInputs();

    populateMarketSelectors();

    loadHistory();

    updateAllUI();

    connectPublicMarket();

    drawChart();

    handleOAuthCallback();

    state.initialized = true;

    window.KRISHWAVE = {
        state,
        analyzeMarket,
        scanAllMarkets,
        startBot,
        stopBot,
        startCircularAI,
        stopCircularAI,
        placeManualTrade
    };

    console.log(
        `KRISHWAVE AI BEAST V${CONFIG.VERSION} READY`
    );
}


/* =========================================================
   MARKET SELECTORS
========================================================= */

function populateMarketSelectors() {

    const selectors = [
        DOM.analysisMarketSelect,
        DOM.botMarketSelect,
        DOM.circularMarketSelect,
        DOM.manualMarketSelect
    ];

    selectors.forEach(select => {

        if (!select) return;

        select.innerHTML = "";

        CONFIG.MARKETS.forEach(symbol => {

            const option =
                document.createElement("option");

            option.value = symbol;
            option.textContent = symbol;

            if (symbol === state.currentMarket) {
                option.selected = true;
            }

            select.appendChild(option);
        });
    });
}


function setupMarketSelectors() {

    if (DOM.analysisMarketSelect) {

        DOM.analysisMarketSelect.addEventListener(
            "change",
            () => {

                state.currentMarket =
                    DOM.analysisMarketSelect.value;

                updateCurrentMarketUI();
                analyzeCurrentMarket();
            }
        );
    }

    if (DOM.botMarketSelect) {

        DOM.botMarketSelect.addEventListener(
            "change",
            () => {

                state.currentMarket =
                    DOM.botMarketSelect.value;

                updateCurrentMarketUI();
                analyzeCurrentMarket();
            }
        );
    }

    if (DOM.circularMarketSelect) {

        DOM.circularMarketSelect.addEventListener(
            "change",
            () => {

                state.currentMarket =
                    DOM.circularMarketSelect.value;

                updateCurrentMarketUI();
                analyzeCurrentMarket();
            }
        );
    }

    if (DOM.manualMarketSelect) {

        DOM.manualMarketSelect.addEventListener(
            "change",
            () => {

                state.currentMarket =
                    DOM.manualMarketSelect.value;

                updateCurrentMarketUI();
                analyzeCurrentMarket();
            }
        );
    }
}


/* =========================================================
   PUBLIC DERIV MARKET CONNECTION
========================================================= */

function connectPublicMarket() {

    setConnectionStatus(
        "connecting",
        "Connecting market..."
    );

    try {

        if (state.publicWs) {
            try {
                state.publicWs.close();
            } catch (_) {}
        }

        state.publicWs =
            new WebSocket(CONFIG.PUBLIC_WS);

        state.publicWs.onopen = () => {

            console.log(
                "Public Deriv market connected"
            );

            setConnectionStatus(
                "online",
                "MARKET LIVE"
            );

            subscribeAllMarkets();

            showToast(
                "Live market data connected"
            );
        };

        state.publicWs.onmessage = event => {

            try {

                const message =
                    JSON.parse(event.data);

                processPublicMessage(message);

            } catch (error) {

                console.error(
                    "Market message error",
                    error
                );
            }
        };

        state.publicWs.onerror = error => {

            console.error(
                "Public WS error",
                error
            );

            setConnectionStatus(
                "error",
                "Market error"
            );
        };

        state.publicWs.onclose = () => {

            setConnectionStatus(
                "warning",
                "Reconnecting..."
            );

            schedulePublicReconnect();
        };

    } catch (error) {

        console.error(error);

        setConnectionStatus(
            "error",
            "Connection failed"
        );
    }
}


function schedulePublicReconnect() {

    if (state.reconnectTimer) {
        clearTimeout(
            state.reconnectTimer
        );
    }

    state.reconnectTimer =
        setTimeout(
            connectPublicMarket,
            5000
        );
}


function subscribeAllMarkets() {

    if (
        !state.publicWs ||
        state.publicWs.readyState !== WebSocket.OPEN
    ) {
        return;
    }

    CONFIG.MARKETS.forEach(
        (symbol, index) => {

            setTimeout(() => {

                if (
                    state.publicWs &&
                    state.publicWs.readyState ===
                    WebSocket.OPEN
                ) {

                    requestMarketHistory(
                        symbol,
                        index
                    );

                    subscribeMarketTicks(
                        symbol,
                        index
                    );
                }

            }, index * 120);

        }
    );
}


function requestMarketHistory(
    symbol,
    index
) {

    try {

        state.publicWs.send(
            JSON.stringify({
                ticks_history: symbol,
                count: CONFIG.MAX_TICKS,
                end: "latest",
                style: "ticks",
                req_id: 1000 + index
            })
        );

    } catch (error) {

        console.error(
            "History request failed",
            symbol,
            error
        );
    }
}


function subscribeMarketTicks(
    symbol,
    index
) {

    try {

        state.publicWs.send(
            JSON.stringify({
                ticks: symbol,
                subscribe: 1,
                req_id: 2000 + index
            })
        );

    } catch (error) {

        console.error(
            "Tick subscription failed",
            symbol,
            error
        );
    }
}


/* =========================================================
   PUBLIC MESSAGE PROCESSOR
========================================================= */

function processPublicMessage(message) {

    if (message.error) {

        console.error(
            "Deriv error:",
            message.error
        );

        return;
    }

    if (message.history) {

        processHistory(message);

        return;
    }

    if (message.tick) {

        processTickMessage(message);

        return;
    }
}


function processHistory(message) {

    const history =
        message.history;

    if (!history) return;

    const prices =
        history.prices || [];

    const times =
        history.times || [];

    const symbol =
        message.echo_req?.ticks_history ||
        message.echo_req?.symbol ||
        message.symbol;

    if (!symbol) return;

    if (!state.ticks[symbol]) {
        state.ticks[symbol] = [];
    }

    state.ticks[symbol] = [];

    for (
        let i = 0;
        i < prices.length;
        i++
    ) {

        const price =
            Number(prices[i]);

        const epoch =
            Number(times[i] || Date.now() / 1000);

        if (!Number.isFinite(price)) {
            continue;
        }

        const digit =
            getLastDigit(price);

        const seq =
            ++state.tickSequence[symbol] ||
            (state.tickSequence[symbol] = 1);

        state.ticks[symbol].push({
            price,
            epoch,
            digit,
            seq
        });
    }

    if (
        state.ticks[symbol].length >
        CONFIG.MAX_TICKS
    ) {

        state.ticks[symbol] =
            state.ticks[symbol].slice(
                -CONFIG.MAX_TICKS
            );
    }

    if (
        symbol === state.currentMarket
    ) {

        refreshCurrentMarket();
    }

    updateScanner();

    updateDataStatus();
}


/* =========================================================
   LIVE TICKS
========================================================= */

function processTickMessage(message) {

    const tick =
        message.tick;

    if (!tick) return;

    const symbol =
        tick.symbol ||
        message.echo_req?.ticks;

    if (!symbol) return;

    const price =
        Number(
            tick.quote
        );

    const epoch =
        Number(
            tick.epoch ||
            Date.now() / 1000
        );

    if (!Number.isFinite(price)) {
        return;
    }

    addTick(
        symbol,
        price,
        epoch
    );
}


function addTick(
    symbol,
    price,
    epoch
) {

    const digit =
        getLastDigit(price);

    const key =
        `${symbol}|${epoch}|${price}`;

    if (
        state.lastProcessedTick[symbol] === key
    ) {
        return;
    }

    state.lastProcessedTick[symbol] = key;

    if (!state.ticks[symbol]) {
        state.ticks[symbol] = [];
    }

    if (!state.tickSequence[symbol]) {
        state.tickSequence[symbol] = 0;
    }

    const seq =
        ++state.tickSequence[symbol];

    const item = {
        price,
        epoch,
        digit,
        seq
    };

    state.ticks[symbol].push(item);

    if (
        state.ticks[symbol].length >
        CONFIG.MAX_TICKS
    ) {

        state.ticks[symbol].shift();
    }

    settlePaperTrades(
        symbol,
        item
    );

    if (
        symbol === state.currentMarket
    ) {

        refreshCurrentMarket();
    }

    updateScanner();
}


/* =========================================================
   DIGIT
========================================================= */

function getLastDigit(price) {

    const value =
        Number(price);

    if (!Number.isFinite(value)) {
        return 0;
    }

    const fixed =
        value.toFixed(5);

    const digits =
        fixed.replace(/\D/g, "");

    return Number(
        digits.charAt(
            digits.length - 1
        )
    );
}


/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket(
    symbol
) {

    const source =
        state.ticks[symbol] || [];

    const ticks =
        source.slice(
            -CONFIG.SCAN_TICKS
        );

    if (
        ticks.length <
        CONFIG.MIN_ANALYSIS_TICKS
    ) {

        return {
            market: symbol,
            ready: false,
            score: 0,
            beastScore: 0,
            confidence: 0,
            signal: "WAIT",
            strategy: null,
            predictedDigit: null,
            hottest: null,
            coldest: null,
            reason:
                "Waiting for enough market data.",
            sampleCount: ticks.length
        };
    }

    const digits =
        ticks.map(t => t.digit);

    const counts =
        Array(10).fill(0);

    digits.forEach(
        digit => counts[digit]++
    );

    let hottest = 0;
    let coldest = 0;

    for (
        let i = 1;
        i < 10;
        i++
    ) {

        if (
            counts[i] >
            counts[hottest]
        ) {
            hottest = i;
        }

        if (
            counts[i] <
            counts[coldest]
        ) {
            coldest = i;
        }
    }

    const total =
        digits.length;

    const evenCount =
        digits.filter(
            d => d % 2 === 0
        ).length;

    const oddCount =
        total - evenCount;

    const overCount =
        digits.filter(
            d => d >= 5
        ).length;

    const underCount =
        total - overCount;

    const evenRate =
        evenCount / total * 100;

    const oddRate =
        oddCount / total * 100;

    const overRate =
        overCount / total * 100;

    const underRate =
        underCount / total * 100;

    const hotRate =
        counts[hottest] /
        total *
        100;

    const recent =
        digits.slice(-20);

    const recentEvenRate =
        recent.filter(
            d => d % 2 === 0
        ).length /
        recent.length *
        100;

    const recentOverRate =
        recent.filter(
            d => d >= 5
        ).length /
        recent.length *
        100;

    const firstHalf =
        digits.slice(
            0,
            Math.floor(total / 2)
        );

    const secondHalf =
        digits.slice(
            Math.floor(total / 2)
        );

    const firstAverage =
        average(firstHalf);

    const secondAverage =
        average(secondHalf);

    const momentum =
        clamp(
            50 +
            (
                secondAverage -
                firstAverage
            ) * 10,
            0,
            100
        );

    const prices =
        ticks.map(
            t => t.price
        );

    const minPrice =
        Math.min(...prices);

    const maxPrice =
        Math.max(...prices);

    const lastPrice =
        prices[prices.length - 1];

    const volatility =
        normalizeVolatility(
            minPrice,
            maxPrice,
            lastPrice
        );

    const candidates = [

        {
            strategy: "EVEN",
            strength:
                Math.abs(
                    evenRate - 50
                ),
            prediction:
                evenRate >= 50
                    ? "EVEN"
                    : "ODD"
        },

        {
            strategy: "ODD",
            strength:
                Math.abs(
                    oddRate - 50
                ),
            prediction:
                oddRate >= 50
                    ? "ODD"
                    : "EVEN"
        },

        {
            strategy: "OVER",
            strength:
                Math.abs(
                    overRate - 50
                ),
            prediction:
                overRate >= 50
                    ? "OVER 5"
                    : "UNDER 5"
        },

        {
            strategy: "UNDER",
            strength:
                Math.abs(
                    underRate - 50
                ),
            prediction:
                underRate >= 50
                    ? "UNDER 5"
                    : "OVER 5"
        },

        {
            strategy: "MATCHES",
            strength:
                Math.max(
                    0,
                    hotRate - 10
                ),
            prediction:
                hottest
        },

        {
            strategy: "DIFFERS",
            strength:
                Math.max(
                    0,
                    100 - hotRate - 10
                ),
            prediction:
                coldest
        }
    ];

    const best =
        candidates.reduce(
            (a, b) =>
                a.strength >
                b.strength
                    ? a
                    : b
        );

    const parityAgreement =
        Math.abs(
            recentEvenRate -
            evenRate
        );

    const overAgreement =
        Math.abs(
            recentOverRate -
            overRate
        );

    const agreement =
        clamp(
            100 -
            (
                parityAgreement +
                overAgreement
            ),
            0,
            100
        );

    const dataQuality =
        clamp(
            (
                total /
                CONFIG.SCAN_TICKS
            ) * 100,
            0,
            100
        );

    const pressure =
        clamp(
            Math.abs(
                (
                    evenRate +
                    overRate
                ) / 2 -
                50
            ) * 2,
            0,
            100
        );

    const beastScore =
        clamp(
            40 +
            Math.min(
                25,
                best.strength * 0.70
            ) +
            agreement * 0.22 +
            Math.abs(
                momentum - 50
            ) * 0.12 +
            volatility * 0.08 +
            dataQuality * 0.05,
            0,
            100
        );

    const confidence =
        clamp(
            (
                beastScore * 0.65
            ) +
            (
                agreement * 0.20
            ) +
            (
                pressure * 0.10
            ) +
            (
                dataQuality * 0.05
            ),
            0,
            100
        );

    let signal = "WEAK";

    if (
        beastScore >=
        CONFIG.BEAST_SIGNAL
    ) {

        signal = "BEAST";

    } else if (
        beastScore >=
        CONFIG.STRONG_SIGNAL
    ) {

        signal = "STRONG";

    } else if (
        beastScore >= 60
    ) {

        signal = "MODERATE";
    }

    if (
        confidence <
        CONFIG.BOT_MIN_CONFIDENCE
    ) {

        signal = "WAIT";
    }

    const reason =
        buildAnalysisReason({
            best,
            confidence,
            agreement,
            hotRate,
            momentum,
            volatility
        });

    return {

        market: symbol,

        ready: true,

        score: beastScore,

        beastScore,

        confidence,

        signal,

        strategy: best.strategy,

        predictedDigit:
            typeof best.prediction ===
            "number"
                ? best.prediction
                : null,

        prediction:
            best.prediction,

        hottest,

        coldest,

        counts,

        evenRate,

        oddRate,

        overRate,

        underRate,

        hotRate,

        momentum,

        volatility,

        agreement,

        dataQuality,

        pressure,

        sampleCount: total,

        reason,

        timestamp: Date.now()
    };
}


function buildAnalysisReason(data) {

    return [
        `${data.best.strategy} strongest`,
        `confidence ${Math.round(data.confidence)}%`,
        `agreement ${Math.round(data.agreement)}%`,
        `hot digit ${Math.round(data.hotRate)}%`,
        `momentum ${Math.round(data.momentum)}`
    ].join(" • ");
}


/* =========================================================
   SCAN ALL MARKETS
========================================================= */

function scanAllMarkets() {

    const results = [];

    CONFIG.MARKETS.forEach(
        symbol => {

            const analysis =
                analyzeMarket(symbol);

            if (analysis.ready) {
                results.push(analysis);
            }
        }
    );

    results.sort(
        (a, b) =>
            b.beastScore -
            a.beastScore
    );

    state.marketScanner =
        results;

    state.strongestMarket =
        results.length
            ? results[0]
            : null;

    return results;
}


function updateScanner() {

    const results =
        scanAllMarkets();

    if (
        state.currentAnalysis &&
        state.currentAnalysis.market ===
        state.currentMarket
    ) {

        updateAnalysisUI(
            state.currentAnalysis
        );
    }

    renderDigitStats();

    updateDataStatus();

    updatePaperUI();
}


/* =========================================================
   CURRENT MARKET ANALYSIS
========================================================= */

function analyzeCurrentMarket() {

    const analysis =
        analyzeMarket(
            state.currentMarket
        );

    state.currentAnalysis =
        analysis;

    updateAnalysisUI(
        analysis
    );
}


function refreshCurrentMarket() {

    state.currentAnalysis =
        analyzeMarket(
            state.currentMarket
        );

    updateCurrentMarketUI();

    updateAnalysisUI(
        state.currentAnalysis
    );

    drawChart();

    renderDigitStats();
}


function updateCurrentMarketUI() {

    const market =
        state.currentMarket;

    if (DOM.currentChartMarket) {
        DOM.currentChartMarket.textContent =
            market;
    }

    if (DOM.aiMarket) {
        DOM.aiMarket.textContent =
            market;
    }

    if (DOM.botSelectedMarket) {
        DOM.botSelectedMarket.textContent =
            market;
    }

    [
        DOM.analysisMarketSelect,
        DOM.botMarketSelect,
        DOM.circularMarketSelect,
        DOM.manualMarketSelect
    ].forEach(select => {

        if (
            select &&
            select.value !== market
        ) {
            select.value = market;
        }
    });

    const ticks =
        state.ticks[market] || [];

    const latest =
        ticks[ticks.length - 1];

    if (
        latest &&
        DOM.currentLivePrice
    ) {

        DOM.currentLivePrice.textContent =
            Number(latest.price)
                .toFixed(5);
    }
}


/* =========================================================
   ANALYSIS UI
========================================================= */

function updateAnalysisUI(
    analysis
) {

    if (!analysis) return;

    if (DOM.digitSampleCount) {

        DOM.digitSampleCount.textContent =
            analysis.sampleCount || 0;
    }

    if (DOM.lastDigit) {

        DOM.lastDigit.textContent =
            analysis.predictedDigit ??
            "-";
    }

    if (DOM.analysisConfidence) {

        DOM.analysisConfidence.textContent =
            `${Math.round(
                analysis.confidence || 0
            )}%`;
    }

    if (DOM.aiStatus) {

        DOM.aiStatus.textContent =
            analysis.signal || "WAIT";
    }

    if (DOM.aiType) {

        DOM.aiType.textContent =
            analysis.strategy ||
            "WAIT";
    }

    if (DOM.aiPrediction) {

        DOM.aiPrediction.textContent =
            formatPrediction(
                analysis
            );
    }

    if (DOM.aiCirclePrediction) {

        DOM.aiCirclePrediction.textContent =
            formatPrediction(
                analysis
            );
    }

    if (DOM.aiPredictionLarge) {

        DOM.aiPredictionLarge.textContent =
            formatPrediction(
                analysis
            );
    }

    if (DOM.predictionConfidence) {

        DOM.predictionConfidence.textContent =
            `${Math.round(
                analysis.confidence || 0
            )}%`;
    }

    if (DOM.analysisMsg) {

        DOM.analysisMsg.textContent =
            analysis.reason ||
            "Waiting for enough market data.";
    }

    if (DOM.botScore) {

        DOM.botScore.textContent =
            Math.round(
                analysis.beastScore || 0
            );
    }

    if (DOM.aiCircleLabel) {

        DOM.aiCircleLabel.textContent =
            analysis.signal ||
            "WAIT";
    }

    updateSignalClasses(
        analysis.signal
    );
}


function formatPrediction(
    analysis
) {

    if (!analysis) {
        return "--";
    }

    if (
        analysis.strategy ===
        "MATCHES"
    ) {

        return `MATCH ${analysis.hottest}`;
    }

    if (
        analysis.strategy ===
        "DIFFERS"
    ) {

        return `DIFFER ${analysis.hottest}`;
    }

    return analysis.prediction || "--";
}


function updateSignalClasses(
    signal
) {

    const elements = [
        DOM.aiStatus,
        DOM.aiCircleLabel,
        DOM.botStatusDash
    ];

    elements.forEach(el => {

        if (!el) return;

        el.classList.remove(
            "beast-strong",
            "beast-good",
            "beast-moderate",
            "beast-weak",
            "signal-strong",
            "signal-moderate",
            "signal-weak"
        );

        if (signal === "BEAST") {

            el.classList.add(
                "beast-strong"
            );

        } else if (
            signal === "STRONG"
        ) {

            el.classList.add(
                "signal-strong"
            );

        } else if (
            signal === "MODERATE"
        ) {

            el.classList.add(
                "signal-moderate"
            );

        } else {

            el.classList.add(
                "signal-weak"
            );
        }
    });
}


/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function renderDigitStats() {

    if (!DOM.digitStatsGrid) {
        return;
    }

    const analysis =
        state.currentAnalysis;

    if (
        !analysis ||
        !analysis.counts
    ) {

        DOM.digitStatsGrid.innerHTML =
            "<div>Waiting for data...</div>";

        return;
    }

    const max =
        Math.max(
            ...analysis.counts,
            1
        );

    DOM.digitStatsGrid.innerHTML =
        analysis.counts
            .map(
                (count, digit) => {

                    const percent =
                        (
                            count /
                            analysis.sampleCount
                        ) * 100;

                    const width =
                        (
                            count /
                            max
                        ) * 100;

                    return `
                        <div class="digit-stat">
                            <div class="digit-number">
                                ${digit}
                            </div>

                            <div class="digit-bar">
                                <span
                                    style="width:${width}%"
                                ></span>
                            </div>

                            <div class="digit-percent">
                                ${percent.toFixed(1)}%
                            </div>
                        </div>
                    `;
                }
            )
            .join("");
}


/* =========================================================
   CIRCULAR AI
========================================================= */

function startCircularAI() {

    if (state.circularRunning) {
        return;
    }

    state.circularRunning = true;

    setCircularStatus(
        "STARTING"
    );

    runCircularPhase(
        "ANALYZING"
    );

    showToast(
        "Circular AI started"
    );
}


function stopCircularAI() {

    state.circularRunning = false;

    if (state.circularInterval) {

        clearInterval(
            state.circularInterval
        );

        state.circularInterval = null;
    }

    state.circularPhase =
        "IDLE";

    state.circularTimer = 0;

    if (DOM.aiCircleStatus) {
        DOM.aiCircleStatus.textContent =
            "IDLE";
    }

    if (DOM.cycleAnalysis) {
        DOM.cycleAnalysis.textContent =
            "ANALYSIS";
    }

    if (DOM.cycleTrade) {
        DOM.cycleTrade.textContent =
            "WAITING";
    }

    if (DOM.aiCircleTimer) {
        DOM.aiCircleTimer.textContent =
            "--";
    }

    if (DOM.cycleCooldown) {
        DOM.cycleCooldown.textContent =
            "0";
    }

    if (DOM.startAI) {
        DOM.startAI.textContent =
            "START CIRCULAR AI";
    }

    showToast(
        "Circular AI stopped"
    );
}


function runCircularPhase(
    phase
) {

    if (!state.circularRunning) {
        return;
    }

    state.circularPhase =
        phase;

    let seconds = 0;

    if (
        phase === "ANALYZING"
    ) {

        seconds =
            CONFIG.CIRCULAR_ANALYSIS;

        circularAnalysisPhase();

    } else if (
        phase === "PREDICTING"
    ) {

        seconds =
            CONFIG.CIRCULAR_PREDICTION;

        circularPredictionPhase();

    } else if (
        phase === "TRADE"
    ) {

        seconds =
            CONFIG.CIRCULAR_TRADE;

        circularTradePhase();

    } else if (
        phase === "COOLDOWN"
    ) {

        seconds =
            CONFIG.CIRCULAR_COOLDOWN;

        circularCooldownPhase();
    }

    state.circularTimer =
        seconds;

    updateCircularTimer();

    if (state.circularInterval) {
        clearInterval(
            state.circularInterval
        );
    }

    state.circularInterval =
        setInterval(() => {

            if (
                !state.circularRunning
            ) {

                clearInterval(
                    state.circularInterval
                );

                return;
            }

            seconds--;

            state.circularTimer =
                seconds;

            updateCircularTimer();

            if (seconds <= 0) {

                clearInterval(
                    state.circularInterval
                );

                const next =
                    getNextCircularPhase(
                        phase
                    );

                runCircularPhase(
                    next
                );
            }

        }, 1000);
}


function getNextCircularPhase(
    phase
) {

    if (
        phase === "ANALYZING"
    ) {
        return "PREDICTING";
    }

    if (
        phase === "PREDICTING"
    ) {
        return "TRADE";
    }

    if (
        phase === "TRADE"
    ) {
        return "COOLDOWN";
    }

    return "ANALYZING";
}


function circularAnalysisPhase() {

    setCircularStatus(
        "ANALYZING"
    );

    if (DOM.cycleAnalysis) {
        DOM.cycleAnalysis.textContent =
            "ANALYZING";
    }

    if (DOM.cycleTrade) {
        DOM.cycleTrade.textContent =
            "SCANNING";
    }

    const results =
        scanAllMarkets();

    if (!results.length) {

        state.currentAnalysis =
            analyzeMarket(
                state.currentMarket
            );

        return;
    }

    const best =
        results[0];

    state.currentMarket =
        best.market;

    state.currentAnalysis =
        best;

    updateCurrentMarketUI();

    updateAnalysisUI(
        best
    );
}


function circularPredictionPhase() {

    setCircularStatus(
        "PREDICTION"
    );

    if (DOM.cycleAnalysis) {
        DOM.cycleAnalysis.textContent =
            "COMPLETE";
    }

    const analysis =
        analyzeMarket(
            state.currentMarket
        );

    state.currentAnalysis =
        analysis;

    updateAnalysisUI(
        analysis
    );

    if (DOM.cycleTrade) {

        DOM.cycleTrade.textContent =
            analysis.signal === "WAIT"
                ? "WAIT — WEAK SIGNAL"
                : "PREDICTION READY";
    }
}


function circularTradePhase() {

    setCircularStatus(
        "TRADE WINDOW"
    );

    const analysis =
        analyzeMarket(
            state.currentMarket
        );

    state.currentAnalysis =
        analysis;

    if (
        analysis.signal === "WAIT" ||
        analysis.confidence <
        CONFIG.BOT_MIN_CONFIDENCE ||
        analysis.beastScore <
        60
    ) {

        setCircularDecision(
            "WAIT — WEAK SIGNAL"
        );

        return;
    }

    setCircularDecision(
        "TRADE NOW"
    );

    executeCircularPaperTrade(
        analysis
    );
}


function circularCooldownPhase() {

    setCircularStatus(
        "COOLDOWN"
    );

    if (DOM.cycleAnalysis) {
        DOM.cycleAnalysis.textContent =
            "SETTLING";
    }

    if (DOM.cycleTrade) {
        DOM.cycleTrade.textContent =
            "COOLDOWN";
    }

    if (DOM.cycleCooldown) {
        DOM.cycleCooldown.textContent =
            state.circularTimer;
    }
}


function executeCircularPaperTrade(
    analysis
) {

    if (!analysis) return;

    const symbol =
        analysis.market;

    const ticks =
        state.ticks[symbol] || [];

    const latest =
        ticks[ticks.length - 1];

    if (!latest) {

        setCircularDecision(
            "WAIT — NO TICK"
        );

        return;
    }

    const lastSeq =
        state.circularLastTradeSequence[
            symbol
        ];

    if (
        lastSeq === latest.seq
    ) {

        setCircularDecision(
            "WAIT — SAME TICK"
        );

        return;
    }

    state.circularLastTradeSequence[
        symbol
    ] = latest.seq;

    /*
       CIRCULAR AI CARD IS INDEPENDENT
       FROM THE MANUAL STRATEGY CARD.

       AUTO means Circular AI uses the
       strategy selected by its analysis.
    */
    const selectedCircularStrategy =
        state.circularStrategy ||
        DOM.circularStrategyLabel?.dataset
            ?.strategy ||
        "AUTO";

    const strategy =
        selectedCircularStrategy === "AUTO"
            ? (
                analysis.strategy ||
                "MATCHES"
            )
            : selectedCircularStrategy;

    const stake =
        getCircularStake();

    const target =
        getTargetForStrategy(
            strategy,
            analysis,
            latest
        );

    const trade =
        createPaperTrade({
            engine: "CIRCULAR AI",
            market: symbol,
            strategy,
            stake,
            target,
            entry: latest
        });

    if (trade) {

        setCircularDecision(
            "PAPER TRADE OPEN"
        );
    }
}


/* =========================================================
   AI BOT
========================================================= */

function startBot() {

    if (state.botRunning) {
        return;
    }

    if (
        !state.botStrategies.length
    ) {

        showToast(
            "Select at least one AI Bot strategy"
        );

        return;
    }

    syncRiskSettings();

    state.botRunning = true;

    if (DOM.startBotBtn) {
        DOM.startBotBtn.textContent =
            "STOP AI BOT";
    }

    setBotStatus(
        "AI BOT RUNNING"
    );

    runBotCycle();

    state.botInterval =
        setInterval(
            runBotCycle,
            CONFIG.BOT_INTERVAL_MS
        );

    showToast(
        "AI Bot started"
    );
}


function stopBot() {

    state.botRunning = false;

    if (state.botInterval) {

        clearInterval(
            state.botInterval
        );

        state.botInterval = null;
    }

    if (DOM.startBotBtn) {
        DOM.startBotBtn.textContent =
            "START AI BOT";
    }

    setBotStatus(
        "AI BOT STOPPED"
    );
}


function runBotCycle() {

    if (!state.botRunning) {
        return;
    }

    if (
        state.activeTrades.length >=
        CONFIG.MAX_ACTIVE_TRADES
    ) {

        setBotStatus(
            "MAX ACTIVE TRADES"
        );

        return;
    }

    const results =
        scanAllMarkets();

    if (!results.length) {

        setBotStatus(
            "WAITING FOR MARKET DATA"
        );

        return;
    }

    /*
       IMPORTANT:
       Filter by the strategies selected
       by the user.

       Example:
       MATCHES + DIFFERS

       Only those two are allowed.
    */

    const validSignals =
        [];

    results.forEach(
        analysis => {

            if (
                !state.botStrategies
                    .includes(
                        analysis.strategy
                    )
            ) {

                return;
            }

            if (
                analysis.signal ===
                "WAIT"
            ) {

                return;
            }

            if (
                analysis.confidence <
                CONFIG.BOT_MIN_CONFIDENCE
            ) {

                return;
            }

            validSignals.push(
                analysis
            );
        }
    );

    if (!validSignals.length) {

        setBotStatus(
            "WAIT — NO STRONG SELECTED SIGNAL"
        );

        return;
    }

    validSignals.sort(
        (a, b) =>
            b.beastScore -
            a.beastScore
    );

    const best =
        validSignals[0];

    state.currentMarket =
        best.market;

    state.currentAnalysis =
        best;

    updateCurrentMarketUI();

    updateAnalysisUI(
        best
    );

    const ticks =
        state.ticks[
            best.market
        ] || [];

    const latest =
        ticks[ticks.length - 1];

    if (!latest) {
        return;
    }

    const previousSeq =
        state.botLastTickSequence[
            best.market
        ];

    /*
       Prevent the 3-second bot loop from
       opening repeated trades from the
       exact same tick.
    */

    if (
        previousSeq ===
        latest.seq
    ) {

        setBotStatus(
            "SCANNING — WAITING FOR NEW TICK"
        );

        return;
    }

    state.botLastTickSequence[
        best.market
    ] = latest.seq;

    const strategy =
        best.strategy;

    const stake =
        getBotStake();

    const target =
        getTargetForStrategy(
            strategy,
            best,
            latest
        );

    const trade =
        createPaperTrade({
            engine: "AI BOT",
            market: best.market,
            strategy,
            stake,
            target,
            entry: latest
        });

    if (trade) {

        setBotStatus(
            `PAPER TRADE • ${strategy}`
        );

        /*
           IMPORTANT:
           Keep the AI Bot strategy card
           showing the user's selected set.
           Do NOT replace it with
           ACTIVE: MATCHES.
        */
        if (DOM.botStrategyLabel) {

            DOM.botStrategyLabel.textContent =
                state.botStrategies.join(
                    " + "
                );
        }
    }
}


/* =========================================================
   AI BOT STRATEGY SELECTION
========================================================= */

function setupBotStrategyControls() {

    /*
       Make the checkbox state match the
       saved AI Bot strategy state.
    */
    syncBotStrategyChecks();

    if (DOM.botStrategyTrigger) {

        DOM.botStrategyTrigger.addEventListener(
            "click",
            () => {

                syncBotStrategyChecks();

                if (
                    DOM.botStrategyModal
                ) {

                    DOM.botStrategyModal
                        .classList.add(
                            "active"
                        );
                }
            }
        );
    }

    if (DOM.closeBotStrategyModal) {

        DOM.closeBotStrategyModal
            .addEventListener(
                "click",
                () => {

                    /*
                       If the user closes without
                       pressing APPLY, restore the
                       previous selected state.
                    */
                    syncBotStrategyChecks();

                    DOM.botStrategyModal
                        ?.classList.remove(
                            "active"
                        );
                }
            );
    }

    const checks =
        document.querySelectorAll(
            ".bot-strategy-check"
        );

    checks.forEach(
        checkbox => {

            /*
               Checkbox changes are temporary
               until APPLY is pressed.
            */
            checkbox.addEventListener(
                "change",
                () => {}
            );
        }
    );

    if (DOM.applyBotStrategies) {

        DOM.applyBotStrategies
            .addEventListener(
                "click",
                applyBotStrategies
            );
    }

    updateBotStrategyCard();
}


function syncBotStrategyChecks() {

    const selected =
        new Set(
            state.botStrategies
        );

    document
        .querySelectorAll(
            ".bot-strategy-check"
        )
        .forEach(
            checkbox => {

                checkbox.checked =
                    selected.has(
                        checkbox.value
                    );
            }
        );
}


function updateBotStrategyCard() {

    if (!DOM.botStrategyLabel) {
        return;
    }

    DOM.botStrategyLabel.textContent =
        state.botStrategies.length
            ? state.botStrategies.join(
                " + "
            )
            : "SELECT STRATEGIES";
}


function applyBotStrategies() {

    const selected =
        Array.from(
            document.querySelectorAll(
                ".bot-strategy-check:checked"
            )
        ).map(
            checkbox =>
                checkbox.value
        );

    if (!selected.length) {

        showToast(
            "Choose at least one strategy"
        );

        syncBotStrategyChecks();

        return;
    }

    /*
       THIS IS THE IMPORTANT PART.

       The AI Bot now remembers exactly
       what the user selected.
    */

    state.botStrategies =
        selected;

    updateBotStrategyCard();

    DOM.botStrategyModal
        ?.classList.remove(
            "active"
        );

    showToast(
        `AI Bot strategies: ${selected.join(
            " + "
        )}`
    );
}


/* =========================================================
   STRATEGY HELPERS
========================================================= */

function getTargetForStrategy(
    strategy,
    analysis,
    latest
) {

    if (
        strategy === "MATCHES"
    ) {

        return analysis.hottest;
    }

    if (
        strategy === "DIFFERS"
    ) {

        return analysis.hottest;
    }

    if (
        strategy === "OVER"
    ) {

        return 5;
    }

    if (
        strategy === "UNDER"
    ) {

        return 5;
    }

    if (
        strategy === "EVEN"
    ) {

        return "EVEN";
    }

    if (
        strategy === "ODD"
    ) {

        return "ODD";
    }

    return analysis.hottest;
}


/* =========================================================
   PAPER TRADE CREATION
========================================================= */

function createPaperTrade({
    engine,
    market,
    strategy,
    stake,
    target,
    entry
}) {

    if (!entry) {
        return null;
    }

    if (
        state.activeTrades.length >=
        CONFIG.MAX_ACTIVE_TRADES
    ) {

        showToast(
            "Maximum active trades reached"
        );

        return null;
    }

    let amount =
        Number(stake);

    if (
        !Number.isFinite(amount) ||
        amount < CONFIG.MIN_STAKE
    ) {

        amount =
            CONFIG.MIN_STAKE;
    }

    amount =
        Math.round(
            amount * 100
        ) / 100;

    if (
        amount >
        state.paperBalance
    ) {

        showToast(
            "Insufficient paper balance"
        );

        return null;
    }

    const trade = {

        id:
            `KW-${Date.now()}-${++state.tradeCounter}`,

        engine,

        market,

        strategy,

        target,

        stake: amount,

        entryPrice:
            entry.price,

        entryDigit:
            entry.digit,

        entrySeq:
            entry.seq,

        entryTime:
            Date.now(),

        status: "ACTIVE"
    };

    state.paperBalance -=
        amount;

    state.activeTrades.push(
        trade
    );

    state.paperTrades.push(
        trade
    );

    state.stats.total++;

    state.stats.stake +=
        amount;

    savePaperBalance();

    updateAllUI();

    return trade;
}


/* =========================================================
   PAPER SETTLEMENT
========================================================= */

function settlePaperTrades(
    symbol,
    tick
) {

    if (
        !state.activeTrades.length
    ) {
        return;
    }

    const trades =
        state.activeTrades.filter(
            trade =>
                trade.market === symbol &&
                tick.seq >
                trade.entrySeq
        );

    trades.forEach(
        trade => {

            settleTrade(
                trade,
                tick
            );
        }
    );
}


function settleTrade(
    trade,
    tick
) {

    const payoutMultiplier =
        CONFIG.PAYOUTS[
            trade.strategy
        ] ?? 0.95;

    let won = false;

    if (
        trade.strategy ===
        "MATCHES"
    ) {

        won =
            tick.digit ===
            Number(trade.target);

    } else if (
        trade.strategy ===
        "DIFFERS"
    ) {

        won =
            tick.digit !==
            Number(trade.target);

    } else if (
        trade.strategy ===
        "OVER"
    ) {

        won =
            tick.digit >= 5;

    } else if (
        trade.strategy ===
        "UNDER"
    ) {

        won =
            tick.digit < 5;

    } else if (
        trade.strategy ===
        "EVEN"
    ) {

        won =
            tick.digit % 2 === 0;

    } else if (
        trade.strategy ===
        "ODD"
    ) {

        won =
            tick.digit % 2 !== 0;
    }

    trade.exitPrice =
        tick.price;

    trade.exitDigit =
        tick.digit;

    trade.exitTime =
        Date.now();

    trade.won =
        won;

    trade.status =
        won ? "WIN" : "LOSS";

    if (won) {

        const payout =
            trade.stake *
            (
                1 +
                payoutMultiplier
            );

        const profit =
            payout -
            trade.stake;

        state.paperBalance +=
            payout;

        state.stats.wins++;

        state.stats.won +=
            payout;

        state.stats.profit +=
            profit;

        state.sessionProfit +=
            profit;

        /*
           Martingale resets after WIN.
        */

        if (
            trade.engine ===
            "AI BOT"
        ) {

            state.botNextStake =
                null;
        }

        if (
            trade.engine ===
            "CIRCULAR AI"
        ) {

            state.circularNextStake =
                null;
        }

    } else {

        const loss =
            trade.stake;

        state.stats.losses++;

        state.stats.profit -=
            loss;

        state.sessionProfit -=
            loss;

        /*
           Martingale after LOSS.
        */

        const multiplier =
            getMartingaleMultiplier(
                trade.engine
            );

        const next =
            trade.stake *
            multiplier;

        if (
            trade.engine ===
            "AI BOT"
        ) {

            state.botNextStake =
                next;
        }

        if (
            trade.engine ===
            "CIRCULAR AI"
        ) {

            state.circularNextStake =
                next;
        }
    }

    state.activeTrades =
        state.activeTrades.filter(
            active =>
                active.id !==
                trade.id
        );

    savePaperBalance();

    saveHistory();

    updateAllUI();

    checkRiskLimits();

    showToast(
        `${trade.engine}: ${
            won ? "WIN" : "LOSS"
        } • ${
            trade.strategy
        }`
    );
}


/* =========================================================
   STAKES + MARTINGALE
========================================================= */

function getBotStake() {

    if (
        state.botNextStake &&
        state.botNextStake >=
        CONFIG.MIN_STAKE
    ) {

        return Math.min(
            state.botNextStake,
            state.paperBalance
        );
    }

    return Math.min(
        readNumber(
            DOM.stakeInput,
            CONFIG.MIN_STAKE
        ),
        state.paperBalance
    );
}


function getCircularStake() {

    if (
        state.circularNextStake &&
        state.circularNextStake >=
        CONFIG.MIN_STAKE
    ) {

        return Math.min(
            state.circularNextStake,
            state.paperBalance
        );
    }

    return Math.min(
        readNumber(
            DOM.circularStakeInput,
            CONFIG.MIN_STAKE
        ),
        state.paperBalance
    );
}


function getMartingaleMultiplier(
    engine
) {

    if (
        engine === "AI BOT"
    ) {

        return Math.max(
            1,
            readNumber(
                DOM.martingaleInput,
                2
            )
        );
    }

    return 2;
}


/* =========================================================
   MANUAL TRADING
========================================================= */

function placeManualTrade() {

    const market =
        DOM.manualMarketSelect?.value ||
        state.currentMarket;

    /*
       MANUAL NOW USES ONLY ITS OWN
       STRATEGY CARD.
    */
    const strategy =
        state.manualStrategy ||
        DOM.manualSelectedStrategyLabel
            ?.dataset
            ?.strategy ||
        "MATCHES";

    const ticks =
        state.ticks[market] || [];

    const entry =
        ticks[ticks.length - 1];

    if (!entry) {

        showToast(
            "Waiting for market tick"
        );

        return;
    }

    let target =
        getTargetForStrategy(
            strategy,
            analyzeMarket(market),
            entry
        );

    if (
        strategy === "MATCHES" ||
        strategy === "DIFFERS"
    ) {

        target =
            Number(
                DOM.manualTargetDigitInput
                    ?.value
            );

        if (
            !Number.isInteger(target) ||
            target < 0 ||
            target > 9
        ) {

            showToast(
                "Enter a target digit 0-9"
            );

            return;
        }
    }

    const stake =
        readNumber(
            DOM.manualStakeInput,
            CONFIG.MIN_STAKE
        );

    createPaperTrade({

        engine: "MANUAL",

        market,

        strategy,

        stake,

        target,

        entry
    });
}


/* =========================================================
   RISK
========================================================= */

function setupRiskInputs() {

    [
        DOM.takeProfitInput,
        DOM.circularTakeProfitInput,
        DOM.manualTakeProfitInput
    ].forEach(input => {

        input?.addEventListener(
            "change",
            syncRiskSettings
        );
    });

    [
        DOM.stopLossInput,
        DOM.circularStopLossInput,
        DOM.manualStopLossInput
    ].forEach(input => {

        input?.addEventListener(
            "change",
            syncRiskSettings
        );
    });
}


function syncRiskSettings() {

    state.takeProfit =
        Math.max(
            0,
            readNumber(
                DOM.takeProfitInput,
                20
            )
        );

    state.stopLoss =
        Math.max(
            0,
            readNumber(
                DOM.stopLossInput,
                20
            )
        );
}


function checkRiskLimits() {

    syncRiskSettings();

    if (
        state.takeProfit > 0 &&
        state.sessionProfit >=
        state.takeProfit
    ) {

        stopBot();
        stopCircularAI();

        setTradingStatus(
            "TAKE PROFIT REACHED"
        );

        showToast(
            "Take profit reached"
        );

        return;
    }

    if (
        state.stopLoss > 0 &&
        state.sessionProfit <=
        -state.stopLoss
    ) {

        stopBot();
        stopCircularAI();

        setTradingStatus(
            "STOP LOSS REACHED"
        );

        showToast(
            "Stop loss reached"
        );
    }
}


/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {

    const navItems =
        document.querySelectorAll(
            ".nav-item"
        );

    navItems.forEach(item => {

        item.addEventListener(
            "click",
            event => {

                event.preventDefault();

                const page =
                    item.dataset.page;

                if (page) {
                    showPage(page);
                }
            }
        );
    });

    showPage(
        "analysis"
    );
}


function showPage(page) {

    const pages =
        document.querySelectorAll(
            ".page"
        );

    pages.forEach(
        section => {
            section.classList.remove(
                "active"
            );
        }
    );

    const target =
        document.getElementById(
            `${page}Page`
        );

    if (target) {

        target.classList.add(
            "active"
        );
    }

    const navItems =
        document.querySelectorAll(
            ".nav-item"
        );

    navItems.forEach(item => {

        item.classList.toggle(
            "active",
            item.dataset.page === page
        );
    });

    if (
        page === "analysis"
    ) {

        refreshCurrentMarket();

    } else if (
        page === "trade"
    ) {

        updatePaperUI();

    } else if (
        page === "history"
    ) {

        renderHistory();
    }
}


/* =========================================================
   TRADE TABS
========================================================= */

function setupTabs() {

    const tabs = [

        {
            button: DOM.tabAiBot,
            panel: DOM.aiBotPanel
        },

        {
            button: DOM.tabCircularAI,
            panel: DOM.circularPanel
        },

        {
            button: DOM.tabManual,
            panel: DOM.manualPanel
        }
    ];

    tabs.forEach(
        ({button, panel}) => {

            button?.addEventListener(
                "click",
                () => {

                    tabs.forEach(
                        item => {

                            item.button
                                ?.classList
                                .remove(
                                    "active"
                                );

                            item.panel
                                ?.classList
                                .remove(
                                    "active"
                                );
                        }
                    );

                    button.classList.add(
                        "active"
                    );

                    panel.classList.add(
                        "active"
                    );
                }
            );
        }
    );
}


/* =========================================================
   STRATEGY CARDS
   ONLY THIS SECTION CONTROLS
   MANUAL + CIRCULAR AI STRATEGY CARDS.
========================================================= */

function setupStrategyControls() {

    DOM.strategyOptions
        ?.querySelectorAll(
            "[data-strategy]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const strategy =
                        button.dataset.strategy;

                    /*
                       MANUAL CARD
                    */
                    if (
                        state.activeStrategySelector ===
                        "manual"
                    ) {

                        state.manualStrategy =
                            strategy;

                        if (
                            DOM.manualSelectedStrategyLabel
                        ) {

                            DOM.manualSelectedStrategyLabel
                                .textContent =
                                strategy;

                            DOM.manualSelectedStrategyLabel
                                .dataset.strategy =
                                strategy;
                        }

                        updateManualTargetVisibility();
                    }

                    /*
                       CIRCULAR AI CARD
                    */
                    else if (
                        state.activeStrategySelector ===
                        "circular"
                    ) {

                        state.circularStrategy =
                            strategy;

                        if (
                            DOM.circularStrategyLabel
                        ) {

                            DOM.circularStrategyLabel
                                .textContent =
                                strategy;

                            DOM.circularStrategyLabel
                                .dataset.strategy =
                                strategy;
                        }
                    }

                    DOM.strategyModal
                        ?.classList.remove(
                            "active"
                        );

                    state.activeStrategySelector =
                        null;
                }
            );
        });

    /*
       Manual strategy card
    */
    DOM.manualStrategyTrigger
        ?.addEventListener(
            "click",
            () => {

                state.activeStrategySelector =
                    "manual";

                openStrategyModal();
            }
        );

    /*
       Circular AI strategy card
    */
    DOM.circularStrategyTrigger
        ?.addEventListener(
            "click",
            () => {

                state.activeStrategySelector =
                    "circular";

                openStrategyModal();
            }
        );

    DOM.closeStrategyModal
        ?.addEventListener(
            "click",
            () => {

                DOM.strategyModal
                    ?.classList.remove(
                        "active"
                    );

                state.activeStrategySelector =
                    null;
            }
        );

    /*
       Initialize Manual card
    */
    if (
        DOM.manualSelectedStrategyLabel
    ) {

        DOM.manualSelectedStrategyLabel
            .textContent =
            state.manualStrategy;

        DOM.manualSelectedStrategyLabel
            .dataset.strategy =
            state.manualStrategy;
    }

    /*
       Initialize Circular AI card.
       AUTO is kept as the default.
    */
    if (
        DOM.circularStrategyLabel
    ) {

        DOM.circularStrategyLabel
            .textContent =
            state.circularStrategy;

        DOM.circularStrategyLabel
            .dataset.strategy =
            state.circularStrategy;
    }

    updateManualTargetVisibility();
}


function openStrategyModal() {

    DOM.strategyModal
        ?.classList.add(
            "active"
        );
}


function updateManualTargetVisibility() {

    const strategy =
        state.manualStrategy ||
        DOM.manualSelectedStrategyLabel
            ?.dataset
            ?.strategy ||
        "MATCHES";

    if (
        DOM.targetDigitContainer
    ) {

        const show =
            strategy === "MATCHES" ||
            strategy === "DIFFERS";

        DOM.targetDigitContainer
            .style.display =
            show
                ? ""
                : "none";
    }
}


/* =========================================================
   BUTTONS
========================================================= */

function setupButtons() {

    DOM.startAI?.addEventListener(
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

    DOM.stopAI?.addEventListener(
        "click",
        stopCircularAI
    );

    DOM.startBotBtn?.addEventListener(
        "click",
        () => {

            if (state.botRunning) {
                stopBot();
            } else {
                startBot();
            }
        }
    );

    DOM.startCircularTradeBtn
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

    DOM.placeTradeBtn
        ?.addEventListener(
            "click",
            placeManualTrade
        );

    DOM.connectDerivBtn
        ?.addEventListener(
            "click",
            startDerivOAuth
        );

    DOM.stopTradingBtn
        ?.addEventListener(
            "click",
            () => {

                stopBot();
                stopCircularAI();

                setTradingStatus(
                    "TRADING STOPPED"
                );
            }
        );

    DOM.clearLogsBtn
        ?.addEventListener(
            "click",
            clearHistory
        );
}


/* =========================================================
   CIRCULAR UI
========================================================= */

function setCircularStatus(
    status
) {

    if (DOM.aiCircleStatus) {
        DOM.aiCircleStatus.textContent =
            status;
    }

    if (DOM.circularStatusText) {
        DOM.circularStatusText.textContent =
            status;
    }
}


function setCircularDecision(
    text
) {

    if (DOM.cycleTrade) {
        DOM.cycleTrade.textContent =
            text;
    }

    if (DOM.circularStatusText) {
        DOM.circularStatusText.textContent =
            text;
    }
}


function updateCircularTimer() {

    if (DOM.aiCircleTimer) {

        DOM.aiCircleTimer.textContent =
            state.circularTimer;
    }

    if (
        DOM.cycleCooldown &&
        state.circularPhase ===
        "COOLDOWN"
    ) {

        DOM.cycleCooldown.textContent =
            state.circularTimer;
    }
}


/* =========================================================
   BOT UI
========================================================= */

function setBotStatus(
    text
) {

    if (DOM.botStatusDash) {
        DOM.botStatusDash.textContent =
            text;
    }
}


/* =========================================================
   PAPER UI
========================================================= */

function updatePaperUI() {

    if (DOM.paperTotal) {
        DOM.paperTotal.textContent =
            state.stats.total;
    }

    if (DOM.paperWins) {
        DOM.paperWins.textContent =
            state.stats.wins;
    }

    if (DOM.paperLosses) {
        DOM.paperLosses.textContent =
            state.stats.losses;
    }

    const accuracy =
        state.stats.total
            ? (
                state.stats.wins /
                state.stats.total *
                100
            )
            : 0;

    if (DOM.paperAccuracy) {

        DOM.paperAccuracy.textContent =
            `${accuracy.toFixed(1)}%`;
    }

    if (DOM.activeTradeCount) {

        DOM.activeTradeCount.textContent =
            state.activeTrades.length;
    }

    if (DOM.tradingStatusLabel) {

        DOM.tradingStatusLabel.textContent =
            `PAPER BALANCE $${state.paperBalance.toFixed(
                2
            )}`;
    }

    if (DOM.sessionProfitDisplay) {

        DOM.sessionProfitDisplay.textContent =
            formatMoney(
                state.sessionProfit
            );
    }

    if (DOM.totalProfitDisplay) {

        DOM.totalProfitDisplay.textContent =
            formatMoney(
                state.stats.profit
            );
    }

    if (DOM.historyTotalStake) {

        DOM.historyTotalStake.textContent =
            formatMoney(
                state.stats.stake
            );
    }

    if (DOM.historyAmountWon) {

        DOM.historyAmountWon.textContent =
            formatMoney(
                state.stats.won
            );
    }

    if (DOM.historyNetProfit) {

        DOM.historyNetProfit.textContent =
            formatMoney(
                state.stats.profit
            );
    }

    renderActiveTrades();
}


/* =========================================================
   ACTIVE TRADES
========================================================= */

function renderActiveTrades() {

    if (!DOM.activeTradesList) {
        return;
    }

    if (!state.activeTrades.length) {

        DOM.activeTradesList.innerHTML =
            "<div>No active paper trades.</div>";

        return;
    }

    DOM.activeTradesList.innerHTML =
        state.activeTrades
            .map(
                trade => `
                    <div class="active-trade-card">
                        <strong>
                            ${escapeHtml(
                                trade.engine
                            )}
                        </strong>

                        <div>
                            ${escapeHtml(
                                trade.market
                            )}
                        </div>

                        <div>
                            ${escapeHtml(
                                trade.strategy
                            )}
                        </div>

                        <div>
                            Stake:
                            $${trade.stake.toFixed(2)}
                        </div>

                        <div>
                            Entry digit:
                            ${trade.entryDigit}
                        </div>

                        <div>
                            ACTIVE
                        </div>
                    </div>
                `
            )
            .join("");
}


/* =========================================================
   HISTORY
========================================================= */

function saveHistory() {

    try {

        localStorage.setItem(
            "krishwave_paper_history",
            JSON.stringify(
                state.paperTrades
            )
        );

    } catch (error) {

        console.error(
            "History save error",
            error
        );
    }
}


function loadHistory() {

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(
                    "krishwave_paper_history"
                ) || "[]"
            );

        if (Array.isArray(saved)) {

            state.paperTrades =
                saved;

            recalculateStats();
        }

    } catch (error) {

        console.error(
            "History load error",
            error
        );
    }
}


function recalculateStats() {

    state.stats = {

        total:
            state.paperTrades.length,

        wins:
            state.paperTrades.filter(
                t => t.status === "WIN"
            ).length,

        losses:
            state.paperTrades.filter(
                t => t.status === "LOSS"
            ).length,

        stake:
            state.paperTrades.reduce(
                (sum, t) =>
                    sum +
                    Number(t.stake || 0),
                0
            ),

        won:
            state.paperTrades
                .filter(
                    t =>
                        t.status ===
                        "WIN"
                )
                .reduce(
                    (sum, t) =>
                        sum +
                        Number(
                            t.stake *
                            (
                                1 +
                                (
                                    CONFIG
                                        .PAYOUTS[
                                            t.strategy
                                        ] ||
                                    0.95
                                )
                            )
                        ),
                    0
                ),

        profit:
            state.paperTrades
                .reduce(
                    (sum, t) => {

                        if (
                            t.status ===
                            "WIN"
                        ) {

                            const multiplier =
                                CONFIG.PAYOUTS[
                                    t.strategy
                                ] ??
                                0.95;

                            return sum +
                                t.stake *
                                multiplier;

                        }

                        if (
                            t.status ===
                            "LOSS"
                        ) {

                            return sum -
                                t.stake;
                        }

                        return sum;
                    },
                    0
                )
    };
}


function renderHistory() {

    if (!DOM.historyCardsList) {
        return;
    }

    const history =
        state.paperTrades
            .slice()
            .reverse();

    if (!history.length) {

        DOM.historyCardsList.innerHTML =
            "<div>No paper trading history.</div>";

        return;
    }

    DOM.historyCardsList.innerHTML =
        history
            .map(
                trade => {

                    const result =
                        trade.status ||
                        "ACTIVE";

                    return `
                        <div class="history-card">

                            <div>
                                <strong>
                                    ${escapeHtml(
                                        trade.engine
                                    )}
                                </strong>
                            </div>

                            <div>
                                ${escapeHtml(
                                    trade.market
                                )}
                            </div>

                            <div>
                                ${escapeHtml(
                                    trade.strategy
                                )}
                            </div>

                            <div>
                                Stake:
                                $${Number(
                                    trade.stake
                                ).toFixed(2)}
                            </div>

                            <div>
                                Entry:
                                ${trade.entryDigit}
                            </div>

                            ${
                                trade.exitDigit !==
                                undefined
                                    ? `
                                    <div>
                                        Exit:
                                        ${trade.exitDigit}
                                    </div>
                                    `
                                    : ""
                            }

                            <div>
                                Result:
                                ${result}
                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


function clearHistory() {

    const confirmed =
        confirm(
            "Clear all paper trading history and reset balance?"
        );

    if (!confirmed) {
        return;
    }

    state.paperTrades = [];

    state.activeTrades = [];

    state.paperBalance =
        CONFIG.START_PAPER_BALANCE;

    state.sessionProfit = 0;

    state.botNextStake = null;

    state.circularNextStake = null;

    recalculateStats();

    savePaperBalance();

    saveHistory();

    updateAllUI();

    renderHistory();

    showToast(
        "Paper history cleared"
    );
}


/* =========================================================
   PAPER BALANCE
========================================================= */

function savePaperBalance() {

    localStorage.setItem(
        "krishwave_paper_balance",
        String(
            state.paperBalance
        )
    );
}


/* =========================================================
   DERIV OAUTH
========================================================= */

async function startDerivOAuth() {

    try {

        const verifier =
            generateRandomString(64);

        const stateValue =
            generateRandomString(32);

        const challenge =
            await pkceChallenge(
                verifier
            );

        sessionStorage.setItem(
            "krishwave_pkce_verifier",
            verifier
        );

        sessionStorage.setItem(
            "krishwave_oauth_state",
            stateValue
        );

        const params =
            new URLSearchParams({

                app_id:
                    CONFIG.CLIENT_ID,

                redirect_uri:
                    CONFIG.REDIRECT_URI,

                response_type:
                    "code",

                scope:
                    "trade",

                state:
                    stateValue,

                code_challenge:
                    challenge,

                code_challenge_method:
                    "S256"
            });

        window.location.href =
            `https://auth.deriv.com/oauth2/authorize?${params}`;

    } catch (error) {

        console.error(
            "OAuth error",
            error
        );

        showToast(
            "Could not start Deriv connection"
        );
    }
}


async function handleOAuthCallback() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const code =
        params.get("code");

    const returnedState =
        params.get("state");

    if (!code) {
        restoreCloudSession();
        return;
    }

    const savedState =
        sessionStorage.getItem(
            "krishwave_oauth_state"
        );

    const verifier =
        sessionStorage.getItem(
            "krishwave_pkce_verifier"
        );

    if (
        !savedState ||
        savedState !== returnedState ||
        !verifier
    ) {

        showToast(
            "OAuth security check failed"
        );

        return;
    }

    try {

        const response =
            await fetch(
                `${CONFIG.CLOUD_API}/api/oauth/exchange`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        code,
                        verifier,
                        redirect_uri:
                            CONFIG.REDIRECT_URI
                    })
                }
            );

        const data =
            await response.json();

        if (
            !data.success ||
            !data.session
        ) {

            throw new Error(
                data.error ||
                "OAuth exchange failed"
            );
        }

        state.sessionToken =
            data.session;

        sessionStorage.setItem(
            "krishwave_cloud_session",
            data.session
        );

        sessionStorage.removeItem(
            "krishwave_pkce_verifier"
        );

        sessionStorage.removeItem(
            "krishwave_oauth_state"
        );

        window.history.replaceState(
            {},
            document.title,
            CONFIG.REDIRECT_URI
        );

        await restoreCloudSession();

    } catch (error) {

        console.error(
            "OAuth callback error",
            error
        );

        showToast(
            "Deriv connection failed"
        );
    }
}


/* =========================================================
   CLOUD SESSION
========================================================= */

async function restoreCloudSession() {

    if (!state.sessionToken) {

        updateAccountUI();

        return;
    }

    try {

        const response =
            await cloudFetch(
                "/api/session"
            );

        const data =
            await response.json();

        if (
            !data.success
        ) {

            throw new Error(
                data.error ||
                "Session invalid"
            );
        }

        const account =
            data.account || {};

        state.accountId =
            account.accountId ||
            account.loginid ||
            "";

        state.currency =
            account.currency ||
            "USD";

        state.derivBalance =
            Number(
                account.balance || 0
            );

        state.connectedToDeriv =
            true;

        updateAccountUI();

        setConnectionStatus(
            "online",
            "DERIV DEMO CONNECTED"
        );

        requestAuthenticatedWs();

    } catch (error) {

        console.error(
            "Cloud session error",
            error
        );

        state.connectedToDeriv =
            false;

        updateAccountUI();
    }
}


async function requestAuthenticatedWs() {

    if (!state.accountId) {
        return;
    }

    try {

        const response =
            await cloudFetch(
                `/api/otp?accountId=${encodeURIComponent(
                    state.accountId
                )}`
            );

        const data =
            await response.json();

        if (
            !data.success ||
            !data.ws
        ) {

            return;
        }

        connectAuthenticatedWs(
            data.ws
        );

    } catch (error) {

        console.error(
            "Authenticated WS error",
            error
        );
    }
}


function connectAuthenticatedWs(
    wsUrl
) {

    try {

        if (state.authWs) {

            try {
                state.authWs.close();
            } catch (_) {}
        }

        state.authWs =
            new WebSocket(wsUrl);

        state.authWs.onopen =
            () => {

                state.authWs.send(
                    JSON.stringify({
                        balance: 1,
                        subscribe: 1
                    })
                );
            };

        state.authWs.onmessage =
            event => {

                try {

                    const data =
                        JSON.parse(
                            event.data
                        );

                    if (
                        data.balance
                    ) {

                        state.derivBalance =
                            Number(
                                data.balance.balance ||
                                0
                            );

                        updateAccountUI();
                    }

                    /*
                       Public WS is the primary
                       paper market feed.

                       We intentionally do not
                       duplicate ticks here.
                    */
                } catch (_) {}
            };

        state.authWs.onclose =
            () => {

                console.log(
                    "Authenticated WS closed"
                );
            };

    } catch (error) {

        console.error(
            "Auth WS connection error",
            error
        );
    }
}


async function cloudFetch(
    path,
    options = {}
) {

    const headers = {
        ...(options.headers || {})
    };

    if (state.sessionToken) {

        headers[
            "X-KRISHWAVE-SESSION"
        ] =
            state.sessionToken;
    }

    return fetch(
        `${CONFIG.CLOUD_API}${path}`,
        {
            ...options,
            headers
        }
    );
}


/* =========================================================
   ACCOUNT UI
========================================================= */

function updateAccountUI() {

    if (DOM.accountId) {

        DOM.accountId.textContent =
            state.connectedToDeriv
                ? state.accountId
                : "Not connected";
    }

    if (DOM.balanceDisplay) {

        DOM.balanceDisplay.textContent =
            `$${state.derivBalance.toFixed(
                2
            )}`;
    }

    if (DOM.currency) {

        DOM.currency.textContent =
            state.currency;
    }

    if (DOM.connectDerivBtn) {

        DOM.connectDerivBtn.textContent =
            state.connectedToDeriv
                ? "DERIV CONNECTED"
                : "CONNECT DERIV";
    }

    if (DOM.modeBadge) {

        DOM.modeBadge.textContent =
            "DEMO";
    }
}


/* =========================================================
   CONNECTION STATUS
========================================================= */

function setConnectionStatus(
    type,
    text
) {

    if (DOM.connectionText) {
        DOM.connectionText.textContent =
            text;
    }

    if (DOM.connectionDot) {

        DOM.connectionDot.classList.remove(
            "connecting"
        );

        if (
            type === "connecting"
        ) {

            DOM.connectionDot.classList.add(
                "connecting"
            );
        }
    }
}


/* =========================================================
   DATA STATUS
========================================================= */

function updateDataStatus() {

    if (!DOM.dataStatus) {
        return;
    }

    const ready =
        CONFIG.MARKETS.filter(
            market =>
                (
                    state.ticks[
                        market
                    ] || []
                ).length >=
                CONFIG.MIN_ANALYSIS_TICKS
        ).length;

    DOM.dataStatus.textContent =
        `${ready}/${CONFIG.MARKETS.length} MARKETS READY`;
}


/* =========================================================
   TRADING STATUS
========================================================= */

function setTradingStatus(
    text
) {

    if (DOM.tradingStatusLabel) {
        DOM.tradingStatusLabel.textContent =
            text;
    }
}


/* =========================================================
   THEME
========================================================= */

function setupTheme() {

    applyTheme(
        state.theme
    );

    DOM.themeToggle
        ?.addEventListener(
            "click",
            () => {

                state.theme =
                    state.theme ===
                    "light"
                        ? "dark"
                        : "light";

                localStorage.setItem(
                    "krishwave_theme",
                    state.theme
                );

                applyTheme(
                    state.theme
                );
            }
        );
}


function applyTheme(
    theme
) {

    document.body.classList.toggle(
        "light",
        theme === "light"
    );

    if (DOM.themeToggle) {

        DOM.themeToggle.textContent =
            theme === "light"
                ? "☀️"
                : "🌙";
    }
}


/* =========================================================
   CHART
========================================================= */

function drawChart() {

    const canvas =
        DOM.priceChartCanvas;

    if (!canvas) {
        return;
    }

    const ctx =
        canvas.getContext("2d");

    const rect =
        canvas.getBoundingClientRect();

    const width =
        Math.max(
            300,
            rect.width
        );

    const height =
        Math.max(
            180,
            rect.height
        );

    const ratio =
        window.devicePixelRatio ||
        1;

    canvas.width =
        width * ratio;

    canvas.height =
        height * ratio;

    ctx.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
    );

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    const ticks =
        state.ticks[
            state.currentMarket
        ] || [];

    const prices =
        ticks
            .slice(-60)
            .map(
                t => Number(t.price)
            );

    if (prices.length < 2) {
        return;
    }

    const min =
        Math.min(...prices);

    const max =
        Math.max(...prices);

    const range =
        max - min || 1;

    const padding = 20;

    const style =
        getComputedStyle(
            document.body
        );

    const lineColor =
        style.getPropertyValue(
            "--accent"
        ) ||
        "#00ff9d";

    ctx.beginPath();

    prices.forEach(
        (price, index) => {

            const x =
                padding +
                (
                    index /
                    (prices.length - 1)
                ) *
                (
                    width -
                    padding * 2
                );

            const y =
                height -
                padding -
                (
                    (
                        price - min
                    ) /
                    range
                ) *
                (
                    height -
                    padding * 2
                );

            if (index === 0) {

                ctx.moveTo(
                    x,
                    y
                );

            } else {

                ctx.lineTo(
                    x,
                    y
                );
            }
        }
    );

    ctx.strokeStyle =
        lineColor;

    ctx.lineWidth = 2;

    ctx.stroke();
}


/* =========================================================
   GENERAL UI UPDATE
========================================================= */

function updateAllUI() {

    updateAccountUI();

    updateCurrentMarketUI();

    updatePaperUI();

    renderDigitStats();

    renderHistory();

    updateDataStatus();

    /*
       Keep strategy cards displaying
       their independent selections.
    */
    updateBotStrategyCard();

    if (
        DOM.manualSelectedStrategyLabel
    ) {

        DOM.manualSelectedStrategyLabel
            .textContent =
            state.manualStrategy;

        DOM.manualSelectedStrategyLabel
            .dataset.strategy =
            state.manualStrategy;
    }

    if (
        DOM.circularStrategyLabel
    ) {

        DOM.circularStrategyLabel
            .textContent =
            state.circularStrategy;

        DOM.circularStrategyLabel
            .dataset.strategy =
            state.circularStrategy;
    }

    if (state.currentAnalysis) {

        updateAnalysisUI(
            state.currentAnalysis
        );
    }
}


/* =========================================================
   UTILITIES
========================================================= */

function average(
    values
) {

    if (!values.length) {
        return 0;
    }

    return values.reduce(
        (sum, value) =>
            sum + Number(value),
        0
    ) / values.length;
}


function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


function normalizeVolatility(
    min,
    max,
    last
) {

    if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        !Number.isFinite(last) ||
        last === 0
    ) {

        return 0;
    }

    const range =
        Math.abs(
            max - min
        );

    const normalized =
        (
            range /
            Math.abs(last)
        ) *
        100000;

    return clamp(
        normalized,
        0,
        100
    );
}


function readNumber(
    element,
    fallback
) {

    if (!element) {
        return fallback;
    }

    const value =
        Number(
            element.value
        );

    return Number.isFinite(value)
        ? value
        : fallback;
}


function formatMoney(
    value
) {

    const number =
        Number(value) || 0;

    return `$${number.toFixed(2)}`;
}


function escapeHtml(
    value
) {

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


function showToast(
    message
) {

    if (!DOM.toast) {
        return;
    }

    if (DOM.toastMessage) {

        DOM.toastMessage.textContent =
            message;
    }

    DOM.toast.classList.add(
        "show"
    );

    setTimeout(
        () => {

            DOM.toast.classList.remove(
                "show"
            );

        },
        2500
    );
}


/* =========================================================
   PKCE
========================================================= */

function generateRandomString(
    length
) {

    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

    let result = "";

    const array =
        new Uint8Array(length);

    crypto.getRandomValues(
        array
    );

    array.forEach(
        value => {

            result +=
                chars[
                    value %
                    chars.length
                ];
        }
    );

    return result;
}


async function pkceChallenge(
    verifier
) {

    const data =
        new TextEncoder().encode(
            verifier
        );

    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );

    const bytes =
        new Uint8Array(
            digest
        );

    let binary = "";

    bytes.forEach(
        byte => {
            binary += String.fromCharCode(
                byte
            );
        }
    );

    return btoa(binary)
        .replace(
            /\+/g,
            "-"
        )
        .replace(
            /\//g,
            "_"
        )
        .replace(
            /=+$/,
            ""
        );
}


/* =========================================================
   START APP
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeApp
    );

} else {

    initializeApp();
}


/* =========================================================
   RESIZE
========================================================= */

window.addEventListener(
    "resize",
    () => {

        drawChart();
    }
);