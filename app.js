/* =========================================================
   KRISHWAVE V7
   LIVE DERIV MARKET INTELLIGENCE + AI ANALYSIS ENGINE

   app.js
   ---------------------------------------------------------
   FEATURES
   - Deriv WebSocket public tick connection
   - Volatility Index market selection
   - Live last-digit analysis
   - Even / Odd
   - High / Low
   - Over / Under
   - Matches / Differ
   - Rise / Fall
   - Manual / AI BOT / CIRCULAR AI modes
   - Circular AI prediction engine
   - Confidence calculation
   - Strategy selection
   - Manual contract-number input
   - Trade amount tracking
   - Win amount tracking
   - Trade history
   - Demo / Paper balance
   - Real account connection framework
   - Auto market scanning
   - 10-second analysis cycle
   - 7-second entry countdown
   - Dark / Light theme
========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
========================================================= */

const KRISHWAVE_CONFIG = {

    appName: "KRISHWAVE",

    version: "V7.0",

    deriv: {
        websocket: "wss://ws.derivws.com/websockets/v3",
        appId: "34jzkIFHayWQzG6sXikax"
    },

    analysis: {
        historySize: 120,
        recentDigits: 30,
        minimumTicks: 12,
        confidenceMinimum: 55,
        scanInterval: 10000,
        countdownSeconds: 7
    },

    demo: {
        startingBalance: 1000
    },

    storage: {
        history: "krishwave_trade_history_v7",
        settings: "krishwave_settings_v7",
        balance: "krishwave_demo_balance_v7"
    },

    markets: [
        {
            symbol: "R_10",
            name: "Volatility 10 Index"
        },
        {
            symbol: "R_25",
            name: "Volatility 25 Index"
        },
        {
            symbol: "R_50",
            name: "Volatility 50 Index"
        },
        {
            symbol: "R_75",
            name: "Volatility 75 Index"
        },
        {
            symbol: "R_100",
            name: "Volatility 100 Index"
        },
        {
            symbol: "1HZ10V",
            name: "Volatility 10 (1s)"
        },
        {
            symbol: "1HZ15V",
            name: "Volatility 15 (1s)"
        },
        {
            symbol: "1HZ25V",
            name: "Volatility 25 (1s)"
        },
        {
            symbol: "1HZ30V",
            name: "Volatility 30 (1s)"
        },
        {
            symbol: "1HZ50V",
            name: "Volatility 50 (1s)"
        },
        {
            symbol: "1HZ75V",
            name: "Volatility 75 (1s)"
        },
        {
            symbol: "1HZ90V",
            name: "Volatility 90 (1s)"
        },
        {
            symbol: "1HZ100V",
            name: "Volatility 100 (1s)"
        }
    ]

};


/* =========================================================
   GLOBAL STATE
========================================================= */

const state = {

    socket: null,

    connected: false,

    connecting: false,

    currentSymbol: "R_10",

    currentMarketName: "Volatility 10 Index",

    selectedStrategy: "AUTO",

    selectedMode: "CIRCULAR",

    selectedContract: "EVEN",

    manualNumber: null,

    stake: 1,

    payout: 0,

    balance: 1000,

    ticks: [],

    digits: [],

    prices: [],

    subscriptions: {},

    analysis: null,

    circularAI: null,

    lastTick: null,

    lastDigit: null,

    lastQuote: null,

    tickCount: 0,

    analysisCount: 0,

    tradeHistory: [],

    pendingTrade: null,

    countdownTimer: null,

    scanTimer: null,

    analysisTimer: null,

    reconnectTimer: null,

    darkMode: true,

    accountMode: "DEMO",

    connectedAccount: false,

    realBalance: 0,

    lastTradeTime: null

};


/* =========================================================
   DOM HELPERS
========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function setText(selector, value) {

    const element = $(selector);

    if (element) {
        element.textContent = value;
    }
}

function setHTML(selector, value) {

    const element = $(selector);

    if (element) {
        element.innerHTML = value;
    }
}

function show(selector) {

    const element = $(selector);

    if (element) {
        element.style.display = "";
    }
}

function hide(selector) {

    const element = $(selector);

    if (element) {
        element.style.display = "none";
    }
}

function addClass(selector, className) {

    const element = $(selector);

    if (element) {
        element.classList.add(className);
    }
}

function removeClass(selector, className) {

    const element = $(selector);

    if (element) {
        element.classList.remove(className);
    }
}


/* =========================================================
   STORAGE
========================================================= */

function loadStorage() {

    try {

        const savedHistory =
            localStorage.getItem(
                KRISHWAVE_CONFIG.storage.history
            );

        if (savedHistory) {

            state.tradeHistory =
                JSON.parse(savedHistory);

        }

    } catch (error) {

        console.warn(
            "History load failed:",
            error
        );

        state.tradeHistory = [];

    }


    try {

        const savedBalance =
            localStorage.getItem(
                KRISHWAVE_CONFIG.storage.balance
            );

        if (savedBalance !== null) {

            const balance =
                Number(savedBalance);

            if (Number.isFinite(balance)) {

                state.balance = balance;

            }

        }

    } catch (error) {

        console.warn(
            "Balance load failed:",
            error
        );

    }


    try {

        const savedSettings =
            localStorage.getItem(
                KRISHWAVE_CONFIG.storage.settings
            );

        if (savedSettings) {

            const settings =
                JSON.parse(savedSettings);

            if (settings.mode) {
                state.selectedMode =
                    settings.mode;
            }

            if (settings.strategy) {
                state.selectedStrategy =
                    settings.strategy;
            }

            if (settings.contract) {
                state.selectedContract =
                    settings.contract;
            }

            if (settings.market) {
                state.currentSymbol =
                    settings.market;
            }

            if (settings.darkMode !== undefined) {
                state.darkMode =
                    settings.darkMode;
            }

        }

    } catch (error) {

        console.warn(
            "Settings load failed:",
            error
        );

    }

}

function saveStorage() {

    try {

        localStorage.setItem(
            KRISHWAVE_CONFIG.storage.history,
            JSON.stringify(
                state.tradeHistory
            )
        );

        localStorage.setItem(
            KRISHWAVE_CONFIG.storage.balance,
            String(state.balance)
        );

        localStorage.setItem(
            KRISHWAVE_CONFIG.storage.settings,
            JSON.stringify({

                mode: state.selectedMode,

                strategy:
                    state.selectedStrategy,

                contract:
                    state.selectedContract,

                market:
                    state.currentSymbol,

                darkMode:
                    state.darkMode

            })
        );

    } catch (error) {

        console.warn(
            "Storage save failed:",
            error
        );

    }

}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initializeKRISHWAVE
);

function initializeKRISHWAVE() {

    loadStorage();

    bindUI();

    applyTheme();

    populateMarkets();

    populateInitialValues();

    renderHistory();

    updateBalanceUI();

    updateConnectionUI(false);

    connectDeriv();

    startAnalysisLoop();

    startMarketScanner();

}


/* =========================================================
   UI BINDINGS
========================================================= */

function bindUI() {

    /* ---------------------------------------------
       MARKET SELECT
    --------------------------------------------- */

    const marketSelect =
        $("#marketSelect");

    if (marketSelect) {

        marketSelect.addEventListener(
            "change",
            function () {

                const symbol =
                    this.value;

                switchMarket(symbol);

            }
        );

    }


    /* ---------------------------------------------
       STRATEGY SELECT
    --------------------------------------------- */

    const strategySelect =
        $("#strategySelect");

    if (strategySelect) {

        strategySelect.addEventListener(
            "change",
            function () {

                state.selectedStrategy =
                    this.value;

                saveStorage();

                updateStrategyUI();

            }
        );

    }


    /* ---------------------------------------------
       CONTRACT SELECT
    --------------------------------------------- */

    const contractSelect =
        $("#contractType");

    if (contractSelect) {

        contractSelect.addEventListener(
            "change",
            function () {

                state.selectedContract =
                    this.value;

                saveStorage();

                updateContractNumberVisibility();

                runAnalysis();

            }
        );

    }


    /* ---------------------------------------------
       MODE BUTTONS
    --------------------------------------------- */

    $all(
        "[data-ai-mode]"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                function () {

                    const mode =
                        this.dataset.aiMode;

                    setAIMode(mode);

                }
            );

        }
    );


    /* ---------------------------------------------
       STRATEGY BUTTONS
    --------------------------------------------- */

    $all(
        "[data-strategy]"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                function () {

                    const strategy =
                        this.dataset.strategy;

                    state.selectedStrategy =
                        strategy;

                    updateStrategyButtons();

                    saveStorage();

                    runAnalysis();

                }
            );

        }
    );


    /* ---------------------------------------------
       CONTRACT BUTTONS
    --------------------------------------------- */

    $all(
        "[data-contract]"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                function () {

                    const contract =
                        this.dataset.contract;

                    state.selectedContract =
                        contract;

                    updateContractButtons();

                    updateContractNumberVisibility();

                    saveStorage();

                    runAnalysis();

                }
            );

        }
    );


    /* ---------------------------------------------
       NUMBER INPUT
    --------------------------------------------- */

    const numberInput =
        $("#contractNumber");

    if (numberInput) {

        numberInput.addEventListener(
            "input",
            function () {

                const value =
                    this.value.trim();

                if (
                    value === "" ||
                    !Number.isFinite(
                        Number(value)
                    )
                ) {

                    state.manualNumber =
                        null;

                } else {

                    const number =
                        Number(value);

                    if (
                        Number.isInteger(number) &&
                        number >= 0 &&
                        number <= 9
                    ) {

                        state.manualNumber =
                            number;

                    } else {

                        state.manualNumber =
                            null;

                    }

                }

                runAnalysis();

            }
        );

    }


    /* ---------------------------------------------
       STAKE INPUT
    --------------------------------------------- */

    const stakeInput =
        $("#stakeAmount");

    if (stakeInput) {

        stakeInput.addEventListener(
            "input",
            function () {

                const value =
                    Number(this.value);

                if (
                    Number.isFinite(value) &&
                    value > 0
                ) {

                    state.stake = value;

                }

            }
        );

    }


    /* ---------------------------------------------
       ANALYZE BUTTON
    --------------------------------------------- */

    const analyzeButton =
        $("#analyzeButton");

    if (analyzeButton) {

        analyzeButton.addEventListener(
            "click",
            function () {

                runAnalysis();

            }
        );

    }


    /* ---------------------------------------------
       TRADE NOW BUTTON
    --------------------------------------------- */

    const tradeButton =
        $("#tradeNowButton");

    if (tradeButton) {

        tradeButton.addEventListener(
            "click",
            function () {

                prepareTrade();

            }
        );

    }


    /* ---------------------------------------------
       RESET DEMO
    --------------------------------------------- */

    const resetButton =
        $("#resetDemoButton");

    if (resetButton) {

        resetButton.addEventListener(
            "click",
            resetDemoAccount
        );

    }


    /* ---------------------------------------------
       CLEAR HISTORY
    --------------------------------------------- */

    const clearHistory =
        $("#clearHistoryButton");

    if (clearHistory) {

        clearHistory.addEventListener(
            "click",
            clearTradeHistory
        );

    }


    /* ---------------------------------------------
       THEME
    --------------------------------------------- */

    const themeButton =
        $("#themeToggle");

    if (themeButton) {

        themeButton.addEventListener(
            "click",
            toggleTheme
        );

    }


    /* ---------------------------------------------
       RECONNECT
    --------------------------------------------- */

    const reconnectButton =
        $("#reconnectButton");

    if (reconnectButton) {

        reconnectButton.addEventListener(
            "click",
            function () {

                connectDeriv(true);

            }
        );

    }

}


/* =========================================================
   POPULATE MARKETS
========================================================= */

function populateMarkets() {

    const select =
        $("#marketSelect");

    if (!select) {
        return;
    }

    select.innerHTML = "";

    KRISHWAVE_CONFIG.markets
        .forEach(
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
                    state.currentSymbol
                ) {

                    option.selected = true;

                }

                select.appendChild(option);

            }
        );

    const current =
        KRISHWAVE_CONFIG.markets.find(
            market =>
                market.symbol ===
                state.currentSymbol
        );

    if (current) {

        state.currentMarketName =
            current.name;

    }

}

function populateInitialValues() {

    const strategySelect =
        $("#strategySelect");

    if (strategySelect) {

        strategySelect.value =
            state.selectedStrategy;

    }

    const contractSelect =
        $("#contractType");

    if (contractSelect) {

        contractSelect.value =
            state.selectedContract;

    }

    const stakeInput =
        $("#stakeAmount");

    if (stakeInput) {

        stakeInput.value =
            state.stake;

    }

    updateAIModeButtons();

    updateStrategyButtons();

    updateContractButtons();

    updateContractNumberVisibility();

}


/* =========================================================
   DERIV CONNECTION
========================================================= */

function connectDeriv(force = false) {

    if (
        state.connecting &&
        !force
    ) {
        return;
    }

    if (
        state.socket &&
        state.connected &&
        !force
    ) {
        return;
    }

    state.connecting = true;

    updateConnectionUI(
        false,
        "CONNECTING"
    );

    try {

        if (state.socket) {

            try {

                state.socket.close();

            } catch (error) {}

        }

        const url =
            KRISHWAVE_CONFIG.deriv.websocket +
            "?app_id=" +
            encodeURIComponent(
                KRISHWAVE_CONFIG.deriv.appId
            );

        state.socket =
            new WebSocket(url);

        state.socket.onopen =
            onDerivOpen;

        state.socket.onmessage =
            onDerivMessage;

        state.socket.onerror =
            onDerivError;

        state.socket.onclose =
            onDerivClose;

    } catch (error) {

        console.error(
            "Deriv connection error:",
            error
        );

        state.connecting = false;

        updateConnectionUI(
            false,
            "ERROR"
        );

        scheduleReconnect();

    }

}

function onDerivOpen() {

    state.connected = true;

    state.connecting = false;

    updateConnectionUI(
        true,
        "LIVE"
    );

    requestActiveSymbol();

    subscribeToTicks(
        state.currentSymbol
    );

}

function onDerivError(error) {

    console.warn(
        "Deriv WebSocket error:",
        error
    );

    updateConnectionUI(
        false,
        "ERROR"
    );

}

function onDerivClose() {

    state.connected = false;

    state.connecting = false;

    updateConnectionUI(
        false,
        "OFFLINE"
    );

    scheduleReconnect();

}

function scheduleReconnect() {

    if (state.reconnectTimer) {
        return;
    }

    state.reconnectTimer =
        setTimeout(
            function () {

                state.reconnectTimer =
                    null;

                connectDeriv();

            },
            4000
        );

}


/* =========================================================
   DERIV REQUEST
========================================================= */

function sendDeriv(payload) {

    if (
        !state.socket ||
        state.socket.readyState !==
        WebSocket.OPEN
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
            "Deriv send error:",
            error
        );

        return false;

    }

}


/* =========================================================
   ACTIVE SYMBOL
========================================================= */

function requestActiveSymbol() {

    sendDeriv({

        active_symbols: "brief",
        product_type: "basic"

    });

}


/* =========================================================
   TICK SUBSCRIPTION
========================================================= */

function subscribeToTicks(symbol) {

    if (!state.connected) {
        return;
    }

    Object.keys(
        state.subscriptions
    ).forEach(
        key => {

            const subscriptionId =
                state.subscriptions[key];

            if (subscriptionId) {

                sendDeriv({

                    forget: subscriptionId

                });

            }

        }
    );

    state.subscriptions = {};

    state.ticks = [];

    state.digits = [];

    state.prices = [];

    sendDeriv({

        ticks: symbol,
        subscribe: 1

    });

}


/* =========================================================
   DERIV MESSAGE HANDLER
========================================================= */

function onDerivMessage(event) {

    let data;

    try {

        data =
            JSON.parse(event.data);

    } catch (error) {

        return;

    }

    if (data.error) {

        console.warn(
            "Deriv API:",
            data.error
        );

        return;

    }


    /* ---------------------------------------------
       TICK
    --------------------------------------------- */

    if (data.tick) {

        processTick(
            data.tick
        );

    }


    /* ---------------------------------------------
       SUBSCRIPTION
    --------------------------------------------- */

    if (
        data.subscription &&
        data.subscription.id
    ) {

        state.subscriptions[
            state.currentSymbol
        ] =
            data.subscription.id;

    }


    /* ---------------------------------------------
       AUTHORIZE
    --------------------------------------------- */

    if (data.authorize) {

        state.connectedAccount = true;

        state.realBalance =
            Number(
                data.authorize.balance || 0
            );

        updateAccountUI();

    }


    /* ---------------------------------------------
       BALANCE
    --------------------------------------------- */

    if (data.balance) {

        state.realBalance =
            Number(
                data.balance.balance || 0
            );

        updateAccountUI();

    }

}


/* =========================================================
   PROCESS TICK
========================================================= */

function processTick(tick) {

    const quote =
        Number(tick.quote);

    if (!Number.isFinite(quote)) {
        return;
    }

    const digit =
        extractLastDigit(
            quote,
            tick.pip_size
        );

    const item = {

        quote,

        digit,

        epoch:
            Number(tick.epoch) ||
            Math.floor(
                Date.now() / 1000
            ),

        symbol:
            tick.symbol ||
            state.currentSymbol

    };

    state.lastTick = item;

    state.lastQuote = quote;

    state.lastDigit = digit;

    state.tickCount++;

    state.ticks.push(item);

    state.digits.push(digit);

    state.prices.push(quote);


    while (
        state.ticks.length >
        KRISHWAVE_CONFIG.analysis.historySize
    ) {

        state.ticks.shift();

    }

    while (
        state.digits.length >
        KRISHWAVE_CONFIG.analysis.historySize
    ) {

        state.digits.shift();

    }

    while (
        state.prices.length >
        KRISHWAVE_CONFIG.analysis.historySize
    ) {

        state.prices.shift();

    }

    updateLiveTickUI();

    updateDigitDistribution();

    if (
        state.digits.length >=
        KRISHWAVE_CONFIG.analysis.minimumTicks
    ) {

        runAnalysis();

    }

}


/* =========================================================
   LAST DIGIT EXTRACTION
========================================================= */

function extractLastDigit(
    quote,
    pipSize
) {

    const decimals =
        Number.isFinite(
            Number(pipSize)
        )
            ? Number(pipSize)
            : detectDecimals(quote);

    const factor =
        Math.pow(
            10,
            decimals
        );

    const integer =
        Math.round(
            quote * factor
        );

    return Math.abs(
        integer % 10
    );

}

function detectDecimals(number) {

    const text =
        String(number);

    if (
        text.indexOf(".") === -1
    ) {

        return 0;

    }

    return text.split(".")[1].length;

}


/* =========================================================
   MARKET SWITCH
========================================================= */

function switchMarket(symbol) {

    const market =
        KRISHWAVE_CONFIG.markets.find(
            item =>
                item.symbol === symbol
        );

    if (!market) {
        return;
    }

    state.currentSymbol =
        market.symbol;

    state.currentMarketName =
        market.name;

    state.ticks = [];

    state.digits = [];

    state.prices = [];

    state.analysis = null;

    state.circularAI = null;

    setText(
        "#currentMarket",
        market.name
    );

    saveStorage();

    if (state.connected) {

        subscribeToTicks(
            symbol
        );

    }

    runAnalysis();

}


/* =========================================================
   ANALYSIS LOOP
========================================================= */

function startAnalysisLoop() {

    if (state.analysisTimer) {

        clearInterval(
            state.analysisTimer
        );

    }

    state.analysisTimer =
        setInterval(
            function () {

                runAnalysis();

            },
            KRISHWAVE_CONFIG.analysis.scanInterval
        );

}

function startMarketScanner() {

    if (state.scanTimer) {

        clearInterval(
            state.scanTimer
        );

    }

    state.scanTimer =
        setInterval(
            scanMarkets,
            30000
        );

}


/* =========================================================
   MAIN ANALYSIS
========================================================= */

function runAnalysis() {

    if (
        state.digits.length <
        KRISHWAVE_CONFIG.analysis.minimumTicks
    ) {

        updateAnalysisWaiting();

        return;

    }

    const analysis =
        calculateMarketAnalysis(
            state.digits,
            state.prices
        );

    state.analysis =
        analysis;

    const circular =
        runCircularAI(
            analysis
        );

    state.circularAI =
        circular;

    const selected =
        chooseStrategy(
            analysis,
            circular
        );

    state.analysis.selected =
        selected;

    state.analysisCount++;

    renderAnalysis(
        analysis,
        circular,
        selected
    );

}


/* =========================================================
   MARKET ANALYSIS
========================================================= */

function calculateMarketAnalysis(
    digits,
    prices
) {

    const recent =
        digits.slice(
            -KRISHWAVE_CONFIG.analysis.recentDigits
        );

    const counts =
        Array(10).fill(0);

    recent.forEach(
        digit => {

            if (
                digit >= 0 &&
                digit <= 9
            ) {

                counts[digit]++;

            }

        }
    );


    const total =
        recent.length;

    const percentages =
        counts.map(
            count =>
                total > 0
                    ? (
                        count /
                        total
                    ) * 100
                    : 0
        );


    let highestDigit = 0;

    let lowestDigit = 0;

    for (
        let i = 1;
        i < 10;
        i++
    ) {

        if (
            counts[i] >
            counts[highestDigit]
        ) {

            highestDigit = i;

        }

        if (
            counts[i] <
            counts[lowestDigit]
        ) {

            lowestDigit = i;

        }

    }


    const evenCount =
        recent.filter(
            digit =>
                digit % 2 === 0
        ).length;

    const oddCount =
        total -
        evenCount;


    const highCount =
        recent.filter(
            digit =>
                digit >= 5
        ).length;

    const lowCount =
        total -
        highCount;


    const uniqueDigits =
        new Set(recent).size;


    const repeatCount =
        total -
        uniqueDigits;


    const runs =
        calculateRuns(
            recent
        );


    const momentum =
        calculateMomentum(
            prices
        );


    const volatility =
        calculateDigitVolatility(
            recent
        );


    const digitEntropy =
        calculateEntropy(
            percentages
        );


    const hotDigits =
        counts
            .map(
                (
                    count,
                    digit
                ) => ({
                    digit,
                    count,
                    percentage:
                        percentages[digit]
                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    b.count -
                    a.count
            );


    const coldDigits =
        counts
            .map(
                (
                    count,
                    digit
                ) => ({
                    digit,
                    count,
                    percentage:
                        percentages[digit]
                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.count -
                    b.count
            );


    const parityBias =
        total > 0
            ? (
                (
                    evenCount -
                    oddCount
                ) /
                total
            ) * 100
            : 0;


    const highLowBias =
        total > 0
            ? (
                (
                    highCount -
                    lowCount
                ) /
                total
            ) * 100
            : 0;


    return {

        total,

        counts,

        percentages,

        highestDigit,

        lowestDigit,

        hotDigits,

        coldDigits,

        evenCount,

        oddCount,

        highCount,

        lowCount,

        parityBias,

        highLowBias,

        uniqueDigits,

        repeatCount,

        runs,

        momentum,

        volatility,

        entropy: digitEntropy,

        recent,

        latest:
            recent[recent.length - 1]

    };

}


/* =========================================================
   CIRCULAR AI ENGINE
========================================================= */

function runCircularAI(analysis) {

    const scores = {

        0: 0,
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0,
        8: 0,
        9: 0

    };


    /* ---------------------------------------------
       FREQUENCY WEIGHT
    --------------------------------------------- */

    analysis.percentages
        .forEach(
            (
                percentage,
                digit
            ) => {

                scores[digit] +=
                    percentage * 1.6;

            }
        );


    /* ---------------------------------------------
       RECENCY WEIGHT
    --------------------------------------------- */

    const recent =
        analysis.recent;

    const start =
        Math.max(
            0,
            recent.length - 12
        );

    for (
        let i = start;
        i < recent.length;
        i++
    ) {

        const digit =
            recent[i];

        const positionWeight =
            (
                i - start + 1
            ) * 0.8;

        scores[digit] +=
            positionWeight;

    }


    /* ---------------------------------------------
       REPEAT PATTERN
    --------------------------------------------- */

    if (
        analysis.runs.lastDigitRun >= 2
    ) {

        const repeated =
            analysis.latest;

        scores[repeated] +=
            analysis.runs.lastDigitRun *
            2;

    }


    /* ---------------------------------------------
       COLD DIGIT BALANCE
    --------------------------------------------- */

    analysis.coldDigits
        .slice(
            0,
            3
        )
        .forEach(
            item => {

                scores[item.digit] +=
                    1.5;

            }
        );


    /* ---------------------------------------------
       MOMENTUM
    --------------------------------------------- */

    if (
        analysis.momentum > 0
    ) {

        for (
            let digit = 5;
            digit <= 9;
            digit++
        ) {

            scores[digit] +=
                analysis.momentum *
                0.4;

        }

    }

    if (
        analysis.momentum < 0
    ) {

        for (
            let digit = 0;
            digit <= 4;
            digit++
        ) {

            scores[digit] +=
                Math.abs(
                    analysis.momentum
                ) * 0.4;

        }

    }


    /* ---------------------------------------------
       PARITY
    --------------------------------------------- */

    if (
        analysis.parityBias > 10
    ) {

        for (
            let digit = 0;
            digit <= 8;
            digit += 2
        ) {

            scores[digit] +=
                2;

        }

    }

    if (
        analysis.parityBias < -10
    ) {

        for (
            let digit = 1;
            digit <= 9;
            digit += 2
        ) {

            scores[digit] +=
                2;

        }

    }


    /* ---------------------------------------------
       NORMALIZE
    --------------------------------------------- */

    const ranked =
        Object.entries(scores)
            .map(
                (
                    [
                        digit,
                        score
                    ]
                ) => ({

                    digit:
                        Number(digit),

                    score

                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    b.score -
                    a.score
            );


    const winner =
        ranked[0];

    const second =
        ranked[1];


    const rawDifference =
        winner.score -
        second.score;


    const baseConfidence =
        45 +
        (
            rawDifference /
            Math.max(
                winner.score,
                1
            )
        ) * 100;


    const dataQuality =
        Math.min(
            analysis.total /
            30,
            1
        );


    const confidence =
        clamp(
            baseConfidence *
            (
                0.65 +
                dataQuality * 0.35
            ),
            50,
            95
        );


    const prediction =
        winner.digit;


    const direction =
        prediction >= 5
            ? "HIGH"
            : "LOW";


    const parity =
        prediction % 2 === 0
            ? "EVEN"
            : "ODD";


    return {

        prediction,

        confidence:
            round(
                confidence,
                1
            ),

        direction,

        parity,

        score:
            winner.score,

        secondScore:
            second.score,

        ranked,

        engine:
            "CIRCULAR AI",

        status:
            confidence >=
            KRISHWAVE_CONFIG.analysis.confidenceMinimum
                ? "FAVORABLE"
                : "WAIT",

        reason:
            buildCircularReason(
                analysis,
                prediction,
                confidence
            )

    };

}


/* =========================================================
   CIRCULAR AI REASON
========================================================= */

function buildCircularReason(
    analysis,
    prediction,
    confidence
) {

    const reasons = [];

    const frequency =
        analysis.percentages[
            prediction
        ] || 0;

    if (
        frequency >= 15
    ) {

        reasons.push(
            "digit frequency is strong"
        );

    }

    if (
        analysis.runs.lastDigitRun >= 2
    ) {

        reasons.push(
            "recent repetition detected"
        );

    }

    if (
        Math.abs(
            analysis.parityBias
        ) >= 10
    ) {

        reasons.push(
            "parity bias detected"
        );

    }

    if (
        Math.abs(
            analysis.highLowBias
        ) >= 10
    ) {

        reasons.push(
            "high/low pressure detected"
        );

    }

    if (
        Math.abs(
            analysis.momentum
        ) > 0.2
    ) {

        reasons.push(
            "price momentum detected"
        );

    }

    if (
        reasons.length === 0
    ) {

        reasons.push(
            "mixed digit distribution"
        );

    }

    return (
        `AI predicts ${prediction} with ` +
        `${confidence.toFixed(1)}% confidence; ` +
        reasons.join(", ") +
        "."
    );

}


/* =========================================================
   STRATEGY ENGINE
========================================================= */

function chooseStrategy(
    analysis,
    circular
) {

    if (
        state.selectedStrategy &&
        state.selectedStrategy !== "AUTO"
    ) {

        return buildStrategy(
            state.selectedStrategy,
            analysis,
            circular
        );

    }


    /* ---------------------------------------------
       AUTO STRATEGY
    --------------------------------------------- */

    let strategy =
        "EVEN";

    let confidence =
        50;


    const parityStrength =
        Math.abs(
            analysis.parityBias
        );

    const highLowStrength =
        Math.abs(
            analysis.highLowBias
        );


    if (
        parityStrength >= 15 &&
        parityStrength >=
        highLowStrength
    ) {

        strategy =
            analysis.parityBias >= 0
                ? "EVEN"
                : "ODD";

        confidence =
            55 +
            parityStrength;

    } else if (
        highLowStrength >= 15
    ) {

        strategy =
            analysis.highLowBias >= 0
                ? "HIGH"
                : "LOW";

        confidence =
            55 +
            highLowStrength;

    } else {

        strategy =
            "DIGIT";

        confidence =
            circular.confidence;

    }


    return {

        name:
            strategy,

        confidence:
            round(
                clamp(
                    confidence,
                    50,
                    95
                ),
                1
            ),

        prediction:
            circular.prediction,

        reason:
            `AUTO selected ${strategy} using ` +
            `current digit distribution, parity, ` +
            `high/low pressure and Circular AI.`

    };

}

function buildStrategy(
    strategy,
    analysis,
    circular
) {

    let prediction =
        circular.prediction;

    let confidence =
        circular.confidence;

    let reason =
        "Strategy selected manually.";


    switch (strategy) {

        case "EVEN":

            prediction =
                nearestEven(
                    circular.prediction
                );

            confidence =
                50 +
                Math.abs(
                    analysis.parityBias
                );

            reason =
                "Even digit probability analysis.";

            break;


        case "ODD":

            prediction =
                nearestOdd(
                    circular.prediction
                );

            confidence =
                50 +
                Math.abs(
                    analysis.parityBias
                );

            reason =
                "Odd digit probability analysis.";

            break;


        case "HIGH":

            prediction =
                Math.max(
                    5,
                    circular.prediction
                );

            confidence =
                50 +
                Math.abs(
                    analysis.highLowBias
                );

            reason =
                "High digit pressure analysis.";

            break;


        case "LOW":

            prediction =
                Math.min(
                    4,
                    circular.prediction
                );

            confidence =
                50 +
                Math.abs(
                    analysis.highLowBias
                );

            reason =
                "Low digit pressure analysis.";

            break;


        case "OVER":

            prediction =
                circular.prediction;

            confidence =
                50 +
                Math.abs(
                    analysis.highLowBias
                );

            reason =
                "Over contract selected; enter threshold manually.";

            break;


        case "UNDER":

            prediction =
                circular.prediction;

            confidence =
                50 +
                Math.abs(
                    analysis.highLowBias
                );

            reason =
                "Under contract selected; enter threshold manually.";

            break;


        case "MATCH":

            prediction =
                circular.prediction;

            confidence =
                circular.confidence;

            reason =
                "Matches contract uses Circular AI digit prediction.";

            break;


        case "DIFFER":

            prediction =
                circular.prediction;

            confidence =
                circular.confidence;

            reason =
                "Differ contract uses Circular AI exclusion prediction.";

            break;


        case "RISE":

            prediction =
                circular.prediction;

            confidence =
                50 +
                Math.abs(
                    analysis.momentum
                ) * 20;

            reason =
                "Rise strategy based on price momentum.";

            break;


        case "FALL":

            prediction =
                circular.prediction;

            confidence =
                50 +
                Math.abs(
                    analysis.momentum
                ) * 20;

            reason =
                "Fall strategy based on price momentum.";

            break;


        case "DIGIT":

            prediction =
                circular.prediction;

            confidence =
                circular.confidence;

            reason =
                "Direct Circular AI digit prediction.";

            break;

    }


    return {

        name:
            strategy,

        confidence:
            round(
                clamp(
                    confidence,
                    50,
                    95
                ),
                1
            ),

        prediction,

        reason

    };

}


/* =========================================================
   CONTRACT MODE
========================================================= */

function setAIMode(mode) {

    const normalized =
        String(mode)
            .toUpperCase();

    if (
        ![
            "MANUAL",
            "AI",
            "CIRCULAR"
        ].includes(normalized)
    ) {

        return;

    }

    state.selectedMode =
        normalized;

    updateAIModeButtons();

    saveStorage();

    runAnalysis();

}

function updateAIModeButtons() {

    $all(
        "[data-ai-mode]"
    ).forEach(
        button => {

            const mode =
                String(
                    button.dataset.aiMode
                ).toUpperCase();

            button.classList.toggle(
                "active",
                mode ===
                state.selectedMode
            );

        }
    );

    setText(
        "#selectedAIMode",
        state.selectedMode
    );

}


/* =========================================================
   STRATEGY BUTTONS
========================================================= */

function updateStrategyButtons() {

    $all(
        "[data-strategy]"
    ).forEach(
        button => {

            button.classList.toggle(
                "active",
                button.dataset.strategy ===
                state.selectedStrategy
            );

        }
    );

    setText(
        "#chosenStrategy",
        state.selectedStrategy
    );

}

function updateStrategyUI() {

    updateStrategyButtons();

    const select =
        $("#strategySelect");

    if (select) {

        select.value =
            state.selectedStrategy;

    }

}


/* =========================================================
   CONTRACT BUTTONS
========================================================= */

function updateContractButtons() {

    $all(
        "[data-contract]"
    ).forEach(
        button => {

            button.classList.toggle(
                "active",
                button.dataset.contract ===
                state.selectedContract
            );

        }
    );

}

function updateContractNumberVisibility() {

    const contractsRequiringNumber = [

        "OVER",
        "UNDER",
        "MATCH",
        "DIFFER"

    ];

    const shouldShow =
        contractsRequiringNumber.includes(
            state.selectedContract
        );

    const wrapper =
        $("#contractNumberBox");

    if (wrapper) {

        wrapper.style.display =
            shouldShow
                ? ""
                : "none";

    }

}


/* =========================================================
   RENDER ANALYSIS
========================================================= */

function renderAnalysis(
    analysis,
    circular,
    selected
) {

    /* ---------------------------------------------
       CIRCULAR AI
    --------------------------------------------- */

    setText(
        "#circularPrediction",
        circular.prediction
    );

    setText(
        "#circularConfidence",
        `${circular.confidence}%`
    );

    setText(
        "#circularDirection",
        circular.direction
    );

    setText(
        "#circularParity",
        circular.parity
    );

    setText(
        "#circularReason",
        circular.reason
    );

    setText(
        "#circularStatus",
        circular.status
    );


    /* ---------------------------------------------
       CHOSEN STRATEGY
    --------------------------------------------- */

    setText(
        "#chosenStrategy",
        selected.name
    );

    setText(
        "#strategyPrediction",
        selected.prediction
    );

    setText(
        "#strategyConfidence",
        `${selected.confidence}%`
    );

    setText(
        "#strategyReason",
        selected.reason
    );


    /* ---------------------------------------------
       DIGIT
    --------------------------------------------- */

    setText(
        "#latestDigit",
        analysis.latest
    );

    setText(
        "#hotDigit",
        analysis.highestDigit
    );

    setText(
        "#coldDigit",
        analysis.lowestDigit
    );


    /* ---------------------------------------------
       EVEN / ODD
    --------------------------------------------- */

    setText(
        "#evenPercentage",
        `${percentage(
            analysis.evenCount,
            analysis.total
        )}%`
    );

    setText(
        "#oddPercentage",
        `${percentage(
            analysis.oddCount,
            analysis.total
        )}%`
    );


    /* ---------------------------------------------
       HIGH / LOW
    --------------------------------------------- */

    setText(
        "#highPercentage",
        `${percentage(
            analysis.highCount,
            analysis.total
        )}%`
    );

    setText(
        "#lowPercentage",
        `${percentage(
            analysis.lowCount,
            analysis.total
        )}%`
    );


    /* ---------------------------------------------
       MARKET METRICS
    --------------------------------------------- */

    setText(
        "#marketMomentum",
        formatSigned(
            analysis.momentum
        )
    );

    setText(
        "#digitVolatility",
        analysis.volatility.toFixed(2)
    );

    setText(
        "#digitEntropy",
        analysis.entropy.toFixed(2)
    );

    setText(
        "#tickCount",
        analysis.total
    );


    /* ---------------------------------------------
       MAIN SIGNAL
    --------------------------------------------- */

    renderMainSignal(
        analysis,
        circular,
        selected
    );

    updateDigitDistribution();

}


/* =========================================================
   MAIN SIGNAL
========================================================= */

function renderMainSignal(
    analysis,
    circular,
    selected
) {

    let prediction =
        circular.prediction;

    let confidence =
        circular.confidence;

    let label =
        "WAIT";

    let reason =
        circular.reason;


    if (
        state.selectedMode ===
        "MANUAL"
    ) {

        label =
            state.selectedContract;

        confidence =
            0;

        reason =
            "Manual mode selected. AI does not automatically choose the trade.";

    } else if (
        state.selectedMode ===
        "AI"
    ) {

        prediction =
            selected.prediction;

        confidence =
            selected.confidence;

        label =
            selected.name;

        reason =
            selected.reason;

    } else {

        label =
            `${circular.prediction}`;

    }


    if (
        state.selectedMode !==
        "MANUAL" &&
        confidence >=
        KRISHWAVE_CONFIG.analysis.confidenceMinimum
    ) {

        label =
            state.selectedMode ===
            "CIRCULAR"
                ? `DIGIT ${circular.prediction}`
                : label;

    }


    setText(
        "#mainPrediction",
        prediction
    );

    setText(
        "#mainSignal",
        label
    );

    setText(
        "#mainConfidence",
        confidence
            ? `${confidence}%`
            : "MANUAL"
    );

    setText(
        "#mainReason",
        reason
    );

}


/* =========================================================
   WAITING STATE
========================================================= */

function updateAnalysisWaiting() {

    setText(
        "#mainSignal",
        "WAITING"
    );

    setText(
        "#mainPrediction",
        "--"
    );

    setText(
        "#mainConfidence",
        "WAIT"
    );

    setText(
        "#circularPrediction",
        "--"
    );

    setText(
        "#circularConfidence",
        "--"
    );

    setText(
        "#circularStatus",
        "COLLECTING DATA"
    );

    setText(
        "#circularReason",
        "Collecting live Deriv ticks for analysis..."
    );

}


/* =========================================================
   DIGIT DISTRIBUTION
========================================================= */

function updateDigitDistribution() {

    const container =
        $("#digitDistribution");

    if (!container) {
        return;
    }

    const counts =
        Array(10).fill(0);

    state.digits.forEach(
        digit => {

            if (
                digit >= 0 &&
                digit <= 9
            ) {

                counts[digit]++;

            }

        }
    );

    const max =
        Math.max(
            ...counts,
            1
        );

    container.innerHTML = "";

    counts.forEach(
        (
            count,
            digit
        ) => {

            const percentage =
                (
                    count /
                    Math.max(
                        state.digits.length,
                        1
                    )
                ) * 100;

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "digit-bar-row";

            row.innerHTML = `

                <span class="digit-label">
                    ${digit}
                </span>

                <div class="digit-bar-track">

                    <div
                        class="digit-bar-fill"
                        style="width:${(
                            count / max
                        ) * 100}%"
                    ></div>

                </div>

                <span class="digit-value">
                    ${count}
                    (${percentage.toFixed(0)}%)
                </span>

            `;

            container.appendChild(row);

        }
    );

}


/* =========================================================
   LIVE TICK UI
========================================================= */

function updateLiveTickUI() {

    setText(
        "#liveQuote",
        state.lastQuote !== null
            ? formatQuote(
                state.lastQuote
            )
            : "--"
    );

    setText(
        "#liveDigit",
        state.lastDigit !== null
            ? state.lastDigit
            : "--"
    );

    setText(
        "#tickCounter",
        state.tickCount
    );

    setText(
        "#currentMarket",
        state.currentMarketName
    );

    setText(
        "#lastTickTime",
        state.lastTick
            ? formatTime(
                state.lastTick.epoch
            )
            : "--"
    );

}


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnectionUI(
    connected,
    status
) {

    const dot =
        $("#connectionDot");

    const text =
        $("#connectionStatus");

    if (dot) {

        dot.classList.toggle(
            "connected",
            connected
        );

        dot.classList.toggle(
            "disconnected",
            !connected
        );

    }

    if (text) {

        text.textContent =
            status ||
            (
                connected
                    ? "LIVE"
                    : "OFFLINE"
            );

    }

}


/* =========================================================
   ACCOUNT UI
========================================================= */

function updateBalanceUI() {

    const balance =
        state.accountMode === "REAL"
            ? state.realBalance
            : state.balance;

    setText(
        "#balanceValue",
        formatMoney(balance)
    );

    setText(
        "#accountMode",
        state.accountMode
    );

}

function updateAccountUI() {

    updateBalanceUI();

}


/* =========================================================
   TRADE PREPARATION
========================================================= */

function prepareTrade() {

    if (
        !state.analysis ||
        !state.circularAI
    ) {

        alert(
            "KRISHWAVE is still collecting market data."
        );

        return;

    }


    const stake =
        Number(
            $("#stakeAmount")?.value ||
            state.stake
        );


    if (
        !Number.isFinite(stake) ||
        stake <= 0
    ) {

        alert(
            "Enter a valid trade amount."
        );

        return;

    }


    state.stake =
        stake;


    if (
        state.selectedMode ===
        "MANUAL"
    ) {

        createPaperTrade(
            state.selectedContract,
            null,
            stake,
            "MANUAL"
        );

        return;

    }


    if (
        [
            "OVER",
            "UNDER",
            "MATCH",
            "DIFFER"
        ].includes(
            state.selectedContract
        )
    ) {

        if (
            state.manualNumber === null
        ) {

            alert(
                "Enter your contract number from 0 to 9 before trading."
            );

            return;

        }

    }


    let prediction =
        state.circularAI.prediction;

    let strategy =
        state.selectedStrategy;


    if (
        state.selectedMode ===
        "AI"
    ) {

        prediction =
            state.analysis.selected
                .prediction;

        strategy =
            state.analysis.selected
                .name;

    }


    createPaperTrade(
        strategy ||
        state.selectedContract,
        prediction,
        stake,
        state.selectedMode
    );

}


/* =========================================================
   PAPER TRADE
========================================================= */

function createPaperTrade(
    contract,
    prediction,
    amount,
    mode
) {

    if (
        amount >
        state.balance &&
        state.accountMode === "DEMO"
    ) {

        alert(
            "Insufficient demo balance."
        );

        return;

    }


    const id =
        "KW-" +
        Date.now().toString(36)
            .toUpperCase();


    const trade = {

        id,

        time:
            new Date().toISOString(),

        market:
            state.currentMarketName,

        symbol:
            state.currentSymbol,

        strategy:
            contract,

        mode,

        prediction,

        manualNumber:
            state.manualNumber,

        amount,

        winAmount: 0,

        profit: 0,

        result: "PENDING",

        circularPrediction:
            state.circularAI
                ? state.circularAI.prediction
                : null,

        circularConfidence:
            state.circularAI
                ? state.circularAI.confidence
                : 0,

        chosenStrategy:
            state.analysis &&
            state.analysis.selected
                ? state.analysis.selected.name
                : contract

    };


    if (
        state.accountMode ===
        "DEMO"
    ) {

        state.balance -=
            amount;

        state.balance =
            Math.max(
                0,
                state.balance
            );

    }


    state.tradeHistory.unshift(
        trade
    );

    if (
        state.tradeHistory.length >
        100
    ) {

        state.tradeHistory =
            state.tradeHistory.slice(
                0,
                100
            );

    }


    state.lastTradeTime =
        Date.now();

    state.pendingTrade =
        trade;


    saveStorage();

    updateBalanceUI();

    renderHistory();

    startTradeResolution(
        trade
    );

}


/* =========================================================
   PAPER TRADE RESOLUTION
=========================================================

   This is a DEMO/PAPER result simulator.

   It does NOT place a real Deriv contract.
   It uses the next live ticks to determine
   whether the selected prediction would have
   won according to the selected contract.
========================================================= */

function startTradeResolution(trade) {

    let resolved =
        false;

    const startTickCount =
        state.tickCount;


    const checker =
        setInterval(
            function () {

                if (
                    resolved
                ) {

                    clearInterval(
                        checker
                    );

                    return;

                }


                if (
                    state.tickCount <=
                    startTickCount
                ) {

                    return;

                }


                if (
                    !state.lastTick
                ) {

                    return;

                }


                resolved = true;

                clearInterval(
                    checker
                );


                resolvePaperTrade(
                    trade
                );

            },
            500
        );


    setTimeout(
        function () {

            if (!resolved) {

                resolved = true;

                clearInterval(
                    checker
                );

                resolvePaperTrade(
                    trade
                );

            }

        },
        15000
    );

}


/* =========================================================
   RESOLVE PAPER TRADE
========================================================= */

function resolvePaperTrade(trade) {

    const digit =
        state.lastDigit;


    if (
        digit === null ||
        digit === undefined
    ) {

        return;

    }


    let won = false;


    switch (
        String(
            trade.strategy
        ).toUpperCase()
    ) {

        case "EVEN":

            won =
                digit % 2 === 0;

            break;


        case "ODD":

            won =
                digit % 2 !== 0;

            break;


        case "HIGH":

            won =
                digit >= 5;

            break;


        case "LOW":

            won =
                digit <= 4;

            break;


        case "OVER":

            won =
                trade.manualNumber !== null &&
                digit >
                trade.manualNumber;

            break;


        case "UNDER":

            won =
                trade.manualNumber !== null &&
                digit <
                trade.manualNumber;

            break;


        case "MATCH":

        case "MATCHES":

            won =
                trade.manualNumber !== null &&
                digit ===
                trade.manualNumber;

            break;


        case "DIFFER":

            won =
                trade.manualNumber !== null &&
                digit !==
                trade.manualNumber;

            break;


        case "RISE":

            won =
                state.analysis &&
                state.analysis.momentum > 0;

            break;


        case "FALL":

            won =
                state.analysis &&
                state.analysis.momentum < 0;

            break;


        case "DIGIT":

            won =
                trade.prediction !== null &&
                digit ===
                trade.prediction;

            break;


        default:

            won =
                trade.prediction !== null &&
                digit ===
                trade.prediction;

            break;

    }


    const payoutMultiplier =
        getPayoutMultiplier(
            trade.strategy
        );


    const winAmount =
        won
            ? trade.amount *
              payoutMultiplier
            : 0;


    const profit =
        won
            ? winAmount -
              trade.amount
            : -trade.amount;


    if (won) {

        if (
            state.accountMode ===
            "DEMO"
        ) {

            state.balance +=
                winAmount;

        }

        trade.result =
            "WIN";

    } else {

        trade.result =
            "LOSS";

    }


    trade.winAmount =
        round(
            winAmount,
            2
        );

    trade.profit =
        round(
            profit,
            2
        );

    trade.resultDigit =
        digit;

    trade.resolvedAt =
        new Date().toISOString();


    state.pendingTrade =
        null;


    saveStorage();

    updateBalanceUI();

    renderHistory();

    showTradeResult(
        trade
    );

}


/* =========================================================
   PAYOUT MODEL
========================================================= */

function getPayoutMultiplier(
    strategy
) {

    const type =
        String(
            strategy
        ).toUpperCase();


    switch (type) {

        case "MATCH":
        case "MATCHES":

            return 8.5;

        case "DIFFER":

            return 1.1;

        case "OVER":
        case "UNDER":

            return 1.8;

        case "EVEN":
        case "ODD":
        case "HIGH":
        case "LOW":

            return 1.9;

        case "RISE":
        case "FALL":

            return 1.9;

        case "DIGIT":

            return 8.5;

        default:

            return 1.9;

    }

}


/* =========================================================
   TRADE RESULT UI
========================================================= */

function showTradeResult(
    trade
) {

    const result =
        trade.result === "WIN"
            ? `WIN +${formatMoney(
                trade.profit
            )}`
            : `LOSS ${formatMoney(
                trade.profit
            )}`;


    setText(
        "#lastTradeResult",
        result
    );

    setText(
        "#lastTradeAmount",
        formatMoney(
            trade.amount
        )
    );

    setText(
        "#lastWinAmount",
        formatMoney(
            trade.winAmount
        )
    );

}


/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

    const tbody =
        $("#tradeHistoryBody");

    if (!tbody) {
        return;
    }

    tbody.innerHTML = "";


    if (
        state.tradeHistory.length === 0
    ) {

        const row =
            document.createElement(
                "tr"
            );

        row.innerHTML = `

            <td colspan="10">
                No trades yet
            </td>

        `;

        tbody.appendChild(row);

        return;

    }


    state.tradeHistory
        .forEach(
            trade => {

                const row =
                    document.createElement(
                        "tr"
                    );


                const resultClass =
                    trade.result === "WIN"
                        ? "win"
                        : trade.result === "LOSS"
                            ? "loss"
                            : "pending";


                row.innerHTML = `

                    <td>
                        ${formatDate(
                            trade.time
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            trade.market
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            trade.strategy
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            trade.mode
                        )}
                    </td>

                    <td>
                        ${
                            trade.prediction ??
                            "--"
                        }
                    </td>

                    <td>
                        ${
                            trade.manualNumber ??
                            "--"
                        }
                    </td>

                    <td>
                        ${formatMoney(
                            trade.amount
                        )}
                    </td>

                    <td>
                        ${formatMoney(
                            trade.winAmount
                        )}
                    </td>

                    <td>
                        ${formatMoney(
                            trade.profit
                        )}
                    </td>

                    <td class="${resultClass}">
                        ${trade.result}
                    </td>

                `;

                tbody.appendChild(row);

            }
        );


    /* ---------------------------------------------
       HISTORY SUMMARY
    --------------------------------------------- */

    const wins =
        state.tradeHistory.filter(
            trade =>
                trade.result === "WIN"
        ).length;

    const losses =
        state.tradeHistory.filter(
            trade =>
                trade.result === "LOSS"
        ).length;

    const totalAmount =
        state.tradeHistory.reduce(
            (
                total,
                trade
            ) =>
                total +
                Number(
                    trade.amount || 0
                ),
            0
        );

    const totalWinAmount =
        state.tradeHistory.reduce(
            (
                total,
                trade
            ) =>
                total +
                Number(
                    trade.winAmount || 0
                ),
            0
        );

    const totalProfit =
        state.tradeHistory.reduce(
            (
                total,
                trade
            ) =>
                total +
                Number(
                    trade.profit || 0
                ),
            0
        );


    setText(
        "#historyWins",
        wins
    );

    setText(
        "#historyLosses",
        losses
    );

    setText(
        "#historyAmount",
        formatMoney(
            totalAmount
        )
    );

    setText(
        "#historyWinAmount",
        formatMoney(
            totalWinAmount
        )
    );

    setText(
        "#historyProfit",
        formatMoney(
            totalProfit
        )
    );

}


/* =========================================================
   CLEAR HISTORY
========================================================= */

function clearTradeHistory() {

    const confirmed =
        window.confirm(
            "Clear all KRISHWAVE trade history?"
        );

    if (!confirmed) {
        return;
    }

    state.tradeHistory = [];

    saveStorage();

    renderHistory();

}


/* =========================================================
   RESET DEMO ACCOUNT
========================================================= */

function resetDemoAccount() {

    const confirmed =
        window.confirm(
            "Reset demo balance to $1,000 and clear pending demo state?"
        );

    if (!confirmed) {
        return;
    }

    state.balance =
        KRISHWAVE_CONFIG.demo.startingBalance;

    saveStorage();

    updateBalanceUI();

}


/* =========================================================
   MARKET SCANNER
========================================================= */

async function scanMarkets() {

    if (
        !state.connected
    ) {

        return;

    }


    /*
       The scanner subscribes to the current market
       for live data.

       A full multi-symbol scanner can be enabled
       later with separate subscriptions. The current
       implementation avoids opening unnecessary
       WebSocket subscriptions on mobile devices.
    */

    const status =
        state.circularAI
            ? state.circularAI.status
            : "SCANNING";


    setText(
        "#scannerStatus",
        status
    );

    setText(
        "#scannerMarket",
        state.currentMarketName
    );


    if (
        state.circularAI
    ) {

        setText(
            "#scannerConfidence",
            `${state.circularAI.confidence}%`
        );

    }

}


/* =========================================================
   COUNTDOWN
========================================================= */

function startEntryCountdown(
    callback
) {

    if (
        state.countdownTimer
    ) {

        clearInterval(
            state.countdownTimer
        );

    }


    let seconds =
        KRISHWAVE_CONFIG
            .analysis
            .countdownSeconds;


    setText(
        "#entryCountdown",
        seconds
    );


    state.countdownTimer =
        setInterval(
            function () {

                seconds--;

                setText(
                    "#entryCountdown",
                    seconds
                );


                if (
                    seconds <= 0
                ) {

                    clearInterval(
                        state.countdownTimer
                    );

                    state.countdownTimer =
                        null;

                    if (
                        typeof callback ===
                        "function"
                    ) {

                        callback();

                    }

                }

            },
            1000
        );

}


/* =========================================================
   THEME
========================================================= */

function toggleTheme() {

    state.darkMode =
        !state.darkMode;

    applyTheme();

    saveStorage();

}

function applyTheme() {

    document.body.classList.toggle(
        "light-mode",
        !state.darkMode
    );

    setText(
        "#themeToggle",
        state.darkMode
            ? "☀️"
            : "🌙"
    );

}


/* =========================================================
   ANALYSIS HELPERS
========================================================= */

function calculateRuns(
    digits
) {

    if (
        digits.length === 0
    ) {

        return {

            lastDigitRun: 0,

            lastDigit:
                null,

            parityRun: 0,

            highLowRun: 0

        };

    }


    const last =
        digits[
            digits.length - 1
        ];


    let lastDigitRun = 0;


    for (
        let i =
            digits.length - 1;
        i >= 0;
        i--
    ) {

        if (
            digits[i] === last
        ) {

            lastDigitRun++;

        } else {

            break;

        }

    }


    const lastParity =
        last % 2;


    let parityRun = 0;


    for (
        let i =
            digits.length - 1;
        i >= 0;
        i--
    ) {

        if (
            digits[i] % 2 ===
            lastParity
        ) {

            parityRun++;

        } else {

            break;

        }

    }


    const lastHighLow =
        last >= 5
            ? "HIGH"
            : "LOW";


    let highLowRun = 0;


    for (
        let i =
            digits.length - 1;
        i >= 0;
        i--
    ) {

        const value =
            digits[i] >= 5
                ? "HIGH"
                : "LOW";


        if (
            value ===
            lastHighLow
        ) {

            highLowRun++;

        } else {

            break;

        }

    }


    return {

        lastDigitRun,

        lastDigit:
            last,

        parityRun,

        highLowRun

    };

}

function calculateMomentum(
    prices
) {

    if (
        prices.length < 5
    ) {

        return 0;

    }


    const recent =
        prices.slice(-5);

    const previous =
        prices.slice(
            -10,
            -5
        );


    if (
        previous.length === 0
    ) {

        return 0;

    }


    const recentAverage =
        average(
            recent
        );

    const previousAverage =
        average(
            previous
        );


    if (
        previousAverage === 0
    ) {

        return 0;

    }


    return (
        (
            recentAverage -
            previousAverage
        ) /
        Math.abs(
            previousAverage
        )
    ) * 100;

}

function calculateDigitVolatility(
    digits
) {

    if (
        digits.length < 2
    ) {

        return 0;

    }


    const mean =
        average(
            digits
        );


    const variance =
        average(
            digits.map(
                digit =>
                    Math.pow(
                        digit -
                        mean,
                        2
                    )
            )
        );


    return Math.sqrt(
        variance
    );

}

function calculateEntropy(
    percentages
) {

    let entropy = 0;

    percentages.forEach(
        percentage => {

            if (
                percentage <= 0
            ) {

                return;

            }

            const p =
                percentage /
                100;

            entropy -=
                p *
                Math.log2(p);

        }
    );

    return entropy;

}


/* =========================================================
   GENERAL HELPERS
========================================================= */

function average(
    values
) {

    if (
        !values ||
        values.length === 0
    ) {

        return 0;

    }

    return values.reduce(
        (
            total,
            value
        ) =>
            total +
            Number(value),
        0
    ) / values.length;

}

function percentage(
    value,
    total
) {

    if (
        !total
    ) {

        return 0;

    }

    return (
        value /
        total
    ) * 100;

}

function clamp(
    value,
    min,
    max
) {

    return Math.min(
        Math.max(
            value,
            min
        ),
        max
    );

}

function round(
    value,
    decimals = 2
) {

    const factor =
        Math.pow(
            10,
            decimals
        );

    return (
        Math.round(
            value *
            factor
        ) /
        factor
    );

}

function nearestEven(
    digit
) {

    return digit % 2 === 0
        ? digit
        : Math.max(
            0,
            digit - 1
        );

}

function nearestOdd(
    digit
) {

    return digit % 2 !== 0
        ? digit
        : Math.min(
            9,
            digit + 1
        );

}

function formatMoney(
    amount
) {

    const number =
        Number(amount);

    if (
        !Number.isFinite(number)
    ) {

        return "$0.00";

    }

    return (
        "$" +
        number.toFixed(2)
    );

}

function formatQuote(
    quote
) {

    if (
        !Number.isFinite(
            Number(quote)
        )
    ) {

        return "--";

    }

    return Number(
        quote
    ).toFixed(
        Math.min(
            detectDecimals(
                quote
            ),
            8
        )
    );

}

function formatSigned(
    value
) {

    const number =
        Number(value);

    if (
        !Number.isFinite(number)
    ) {

        return "0.00";

    }

    return (
        number >= 0
            ? "+"
            : ""
    ) +
    number.toFixed(2);

}

function formatTime(
    epoch
) {

    const date =
        new Date(
            Number(epoch) * 1000
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "--";

    }

    return date.toLocaleTimeString();

}

function formatDate(
    value
) {

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "--";

    }

    return (
        date.toLocaleDateString() +
        " " +
        date.toLocaleTimeString()
    );

}

function escapeHTML(
    value
) {

    return String(value ?? "")
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
   PUBLIC DEBUG API
========================================================= */

window.KRISHWAVE = {

    state,

    config:
        KRISHWAVE_CONFIG,

    analyze:
        runAnalysis,

    connect:
        connectDeriv,

    switchMarket,

    setAIMode,

    setStrategy:
        function(strategy) {

            state.selectedStrategy =
                String(strategy)
                    .toUpperCase();

            updateStrategyUI();

            saveStorage();

            runAnalysis();

        },

    setContract:
        function(contract) {

            state.selectedContract =
                String(contract)
                    .toUpperCase();

            updateContractButtons();

            updateContractNumberVisibility();

            saveStorage();

            runAnalysis();

        },

    setManualNumber:
        function(number) {

            const value =
                Number(number);

            if (
                Number.isInteger(value) &&
                value >= 0 &&
                value <= 9
            ) {

                state.manualNumber =
                    value;

                const input =
                    $("#contractNumber");

                if (input) {

                    input.value =
                        value;

                }

                runAnalysis();

            }

        },

    trade:
        prepareTrade,

    resetDemo:
        resetDemoAccount,

    clearHistory:
        clearTradeHistory

};


/* =========================================================
   STARTUP LOG
========================================================= */

console.log(
    `%cKRISHWAVE ${KRISHWAVE_CONFIG.version} loaded`,
    "font-weight:bold"
);

console.log(
    "Mode:",
    state.selectedMode
);

console.log(
    "Strategy:",
    state.selectedStrategy
);

console.log(
    "Market:",
    state.currentSymbol
);

console.log(
    "Circular AI: READY"
);