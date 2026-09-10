/* =========================================================
   KRISHWAVE AI BEAST V7.2
   DERIV OAUTH BACKEND
   RAILWAY SERVER

   ---------------------------------------------------------
   FEATURES
   - Deriv OAuth 2.0 + PKCE
   - Secure server-side token storage
   - Account retrieval
   - Demo / Real account support
   - Authenticated WebSocket OTP
   - Session management
   - CORS for KRISHWAVE GitHub Pages
   - Railway PORT support
   - Health check
   - Session validation
   - Current Deriv OTP response support
========================================================= */

"use strict";

const express = require("express");
const crypto = require("crypto");

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT =
  Number(process.env.PORT) || 8080;

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "";

const REDIRECT_URI =
  process.env.REDIRECT_URI ||
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  "https://chrispusatale99-dot.github.io";

const DERIV_AUTH_URL =
  "https://auth.deriv.com/oauth2/auth";

const DERIV_TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";

const DERIV_API =
  "https://api.derivws.com/trading/v1/options";

/*
   Maximum lifetime of our internal session.

   The Deriv access token NEVER goes to the browser.
*/

const SESSION_TTL =
  55 * 60 * 1000;


/* =========================================================
   EXPRESS
========================================================= */

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "100kb"
  })
);


/* =========================================================
   CORS
========================================================= */

app.use((req, res, next) => {

  const origin =
    req.headers.origin;

  if (
    !origin ||
    origin === FRONTEND_ORIGIN
  ) {

    res.setHeader(
      "Access-Control-Allow-Origin",
      FRONTEND_ORIGIN
    );
  }

  res.setHeader(
    "Vary",
    "Origin"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );

  res.setHeader(
    "Access-Control-Max-Age",
    "86400"
  );

  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(204)
      .end();
  }

  next();
});


/* =========================================================
   INTERNAL SESSION STORE
========================================================= */

const sessions =
  new Map();


/* =========================================================
   CONFIGURATION VALIDATION
========================================================= */

function requireClientConfig() {

  if (!CLIENT_ID) {

    throw new Error(
      "DERIV_CLIENT_ID is not configured on Railway"
    );
  }
}


/* =========================================================
   CREATE INTERNAL SESSION
========================================================= */

function createSession(
  accessToken,
  expiresIn
) {

  const sessionId =
    crypto
      .randomBytes(32)
      .toString("hex");

  const requestedLifetime =
    Number(expiresIn || 3600) *
    1000;

  const lifetime =
    Math.min(
      requestedLifetime,
      SESSION_TTL
    );

  const expiresAt =
    Date.now() +
    lifetime;

  sessions.set(
    sessionId,
    {
      accessToken,
      expiresAt
    }
  );

  return {
    sessionId,
    expiresAt
  };
}


/* =========================================================
   GET INTERNAL SESSION
========================================================= */

function getSession(
  sessionId
) {

  if (!sessionId) {
    return null;
  }

  const session =
    sessions.get(
      sessionId
    );

  if (!session) {
    return null;
  }

  if (
    Date.now() >=
    session.expiresAt
  ) {

    sessions.delete(
      sessionId
    );

    return null;
  }

  return session;
}


/* =========================================================
   CLEAN EXPIRED SESSIONS
========================================================= */

const sessionCleanup =
  setInterval(() => {

    const now =
      Date.now();

    for (
      const [
        sessionId,
        session
      ]
      of sessions.entries()
    ) {

      if (
        now >=
        session.expiresAt
      ) {

        sessions.delete(
          sessionId
        );
      }
    }

  }, 5 * 60 * 1000);


if (
  sessionCleanup &&
  typeof sessionCleanup.unref ===
    "function"
) {

  sessionCleanup.unref();
}


/* =========================================================
   SAFE JSON RESPONSE
========================================================= */

async function readJsonResponse(
  response
) {

  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {

    return JSON.parse(
      text
    );

  } catch {

    return {
      raw: text
    };
  }
}


/* =========================================================
   DERIV ERROR MESSAGE
========================================================= */

function getDerivError(
  data,
  fallback
) {

  return (
    data?.errors?.[0]?.message ||
    data?.error?.message ||
    data?.error_description ||
    data?.error ||
    fallback
  );
}


/* =========================================================
   ROOT
========================================================= */

app.get(
  "/",
  (req, res) => {

    res.json({

      success: true,

      name:
        "KRISHWAVE OAuth Backend",

      version:
        "7.2.0",

      status:
        "online",

      backend:
        "railway",

      frontend:
        FRONTEND_ORIGIN,

      oauth:
        true,

      timestamp:
        new Date().toISOString()
    });
  }
);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.json({

      success: true,

      status:
        "healthy",

      service:
        "KRISHWAVE AI BEAST V7.2",

      backend:
        "railway",

      timestamp:
        new Date().toISOString()
    });
  }
);


/* =========================================================
   FRONTEND CONFIGURATION
========================================================= */

app.get(
  "/api/config",
  (req, res) => {

    if (!CLIENT_ID) {

      return res.status(500).json({

        success: false,

        error:
          "DERIV_CLIENT_ID is missing on Railway"
      });
    }

    res.json({

      success: true,

      client_id:
        CLIENT_ID,

      redirect_uri:
        REDIRECT_URI,

      frontend_origin:
        FRONTEND_ORIGIN,

      backend:
        "railway",

      status:
        "online",

      version:
        "7.2.0"
    });
  }
);


/* =========================================================
   OAUTH INFORMATION
========================================================= */

app.get(
  "/api/oauth/info",
  (req, res) => {

    if (!CLIENT_ID) {

      return res.status(500).json({

        success: false,

        error:
          "DERIV_CLIENT_ID is missing on Railway"
      });
    }

    res.json({

      success: true,

      authorization_url:
        DERIV_AUTH_URL,

      token_url:
        DERIV_TOKEN_URL,

      client_id:
        CLIENT_ID,

      redirect_uri:
        REDIRECT_URI,

      pkce:
        true
    });
  }
);


/* =========================================================
   OAUTH CODE EXCHANGE
========================================================= */

app.post(
  "/api/oauth/exchange",
  async (req, res) => {

    try {

      requireClientConfig();

      const {
        code,
        code_verifier
      } =
        req.body || {};


      /* ---------------------------------------------------
         VALIDATE AUTHORIZATION CODE
      --------------------------------------------------- */

      if (
        typeof code !== "string" ||
        !code.trim()
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Missing authorization code"
        });
      }


      /* ---------------------------------------------------
         VALIDATE PKCE VERIFIER
      --------------------------------------------------- */

      if (
        typeof code_verifier !== "string" ||
        !code_verifier.trim()
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Missing PKCE code verifier"
        });
      }


      /* ---------------------------------------------------
         BUILD TOKEN REQUEST
      --------------------------------------------------- */

      const params =
        new URLSearchParams();

      params.set(
        "grant_type",
        "authorization_code"
      );

      params.set(
        "client_id",
        CLIENT_ID
      );

      params.set(
        "code",
        code
      );

      params.set(
        "code_verifier",
        code_verifier
      );

      params.set(
        "redirect_uri",
        REDIRECT_URI
      );


      /* ---------------------------------------------------
         CALL DERIV TOKEN ENDPOINT
      --------------------------------------------------- */

      const response =
        await fetch(
          DERIV_TOKEN_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",

              "Accept":
                "application/json"
            },

            body:
              params.toString()
          }
        );


      const data =
        await readJsonResponse(
          response
        );


      /* ---------------------------------------------------
         HANDLE DERIV ERROR
      --------------------------------------------------- */

      if (
        !response.ok
      ) {

        console.error(
          "Deriv OAuth exchange error:",
          response.status,
          data
        );

        return res.status(
          response.status
        ).json({

          success: false,

          error:
            getDerivError(
              data,
              "Deriv OAuth exchange failed"
            )
        });
      }


      /* ---------------------------------------------------
         CHECK ACCESS TOKEN
      --------------------------------------------------- */

      if (
        typeof data.access_token !==
        "string"
      ) {

        console.error(
          "Deriv returned no access token:",
          data
        );

        return res.status(500).json({

          success: false,

          error:
            "Deriv did not return an access token"
        });
      }


      /* ---------------------------------------------------
         CREATE SERVER SESSION
      --------------------------------------------------- */

      const session =
        createSession(
          data.access_token,
          data.expires_in
        );


      /*
         IMPORTANT:

         The access token is deliberately
         NOT returned to the browser.
      */

      return res.json({

        success: true,

        session_id:
          session.sessionId,

        expires_in:
          Math.floor(
            (
              session.expiresAt -
              Date.now()
            ) / 1000
          )
      });

    } catch (error) {

      console.error(
        "OAuth exchange error:",
        error
      );

      return res.status(500).json({

        success: false,

        error:
          error.message ||
          "KRISHWAVE OAuth backend error"
      });
    }
  }
);


/* =========================================================
   GET DERIV ACCOUNTS
========================================================= */

app.post(
  "/api/accounts",
  async (req, res) => {

    try {

      const {
        session_id
      } =
        req.body || {};


      const session =
        getSession(
          session_id
        );


      if (!session) {

        return res.status(401).json({

          success: false,

          error:
            "Session expired or invalid"
        });
      }


      /* ---------------------------------------------------
         REQUEST DERIV ACCOUNTS
      --------------------------------------------------- */

      const response =
        await fetch(
          `${DERIV_API}/accounts`,
          {
            method: "GET",

            headers: {

              Authorization:
                `Bearer ${session.accessToken}`,

              Accept:
                "application/json"
            }
          }
        );


      const data =
        await readJsonResponse(
          response
        );


      /* ---------------------------------------------------
         HANDLE DERIV ERROR
      --------------------------------------------------- */

      if (
        !response.ok
      ) {

        console.error(
          "Deriv accounts error:",
          response.status,
          data
        );

        return res.status(
          response.status
        ).json({

          success: false,

          error:
            getDerivError(
              data,
              "Unable to get Deriv accounts"
            )
        });
      }


      /* ---------------------------------------------------
         ACCOUNT DATA
      --------------------------------------------------- */

      const accounts =
        data.accounts ||
        data.data ||
        data;


      return res.json({

        success: true,

        accounts
      });

    } catch (error) {

      console.error(
        "Accounts error:",
        error
      );

      return res.status(500).json({

        success: false,

        error:
          "Unable to retrieve Deriv accounts"
      });
    }
  }
);


/* =========================================================
   CREATE AUTHENTICATED WEBSOCKET OTP
========================================================= */

app.post(
  "/api/otp",
  async (req, res) => {

    try {

      const {
        session_id,
        account_id
      } =
        req.body || {};


      /* ---------------------------------------------------
         VALIDATE SESSION
      --------------------------------------------------- */

      const session =
        getSession(
          session_id
        );


      if (!session) {

        return res.status(401).json({

          success: false,

          error:
            "Session expired or invalid"
        });
      }


      /* ---------------------------------------------------
         VALIDATE ACCOUNT
      --------------------------------------------------- */

      if (
        typeof account_id !== "string" ||
        !account_id.trim()
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Missing account ID"
        });
      }


      /* ---------------------------------------------------
         BUILD OTP ENDPOINT
      --------------------------------------------------- */

      const endpoint =
        `${DERIV_API}/accounts/` +
        `${encodeURIComponent(account_id)}` +
        `/otp`;


      /* ---------------------------------------------------
         REQUEST OTP FROM DERIV
      --------------------------------------------------- */

      const response =
        await fetch(
          endpoint,
          {
            method: "POST",

            headers: {

              Authorization:
                `Bearer ${session.accessToken}`,

              Accept:
                "application/json"
            }
          }
        );


      const data =
        await readJsonResponse(
          response
        );


      /* ---------------------------------------------------
         HANDLE DERIV ERROR
      --------------------------------------------------- */

      if (
        !response.ok
      ) {

        console.error(
          "Deriv OTP error:",
          response.status,
          data
        );

        return res.status(
          response.status
        ).json({

          success: false,

          error:
            getDerivError(
              data,
              "Unable to create Deriv WebSocket"
            )
        });
      }


      /* ---------------------------------------------------
         FIND WEBSOCKET URL
         
         CURRENT DERIV RESPONSE:
         data.data.url

         BACKWARD COMPATIBILITY:
         data.websocket_url
         data.url
         data.ws_url
      --------------------------------------------------- */

      const websocketUrl =
        data?.data?.url ||
        data?.websocket_url ||
        data?.url ||
        data?.ws_url;


      /* ---------------------------------------------------
         CHECK WEBSOCKET URL
      --------------------------------------------------- */

      if (
        typeof websocketUrl !== "string" ||
        !websocketUrl.trim()
      ) {

        console.error(
          "No WebSocket URL returned by Deriv:",
          data
        );

        return res.status(500).json({

          success: false,

          error:
            "Deriv did not return a WebSocket URL"
        });
      }


      /* ---------------------------------------------------
         RETURN WEBSOCKET URL
      --------------------------------------------------- */

      return res.json({

        success: true,

        websocket_url:
          websocketUrl,

        expires_in:
          120
      });

    } catch (error) {

      console.error(
        "OTP error:",
        error
      );

      return res.status(500).json({

        success: false,

        error:
          "KRISHWAVE WebSocket authentication error"
      });
    }
  }
);


/* =========================================================
   SESSION CHECK
========================================================= */

app.post(
  "/api/session",
  (req, res) => {

    const {
      session_id
    } =
      req.body || {};


    const session =
      getSession(
        session_id
      );


    if (!session) {

      return res.status(401).json({

        success: false,

        valid: false,

        error:
          "Session expired or invalid"
      });
    }


    return res.json({

      success: true,

      valid: true,

      expires_at:
        session.expiresAt
    });
  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.post(
  "/api/logout",
  (req, res) => {

    try {

      const {
        session_id
      } =
        req.body || {};


      if (
        typeof session_id ===
        "string"
      ) {

        sessions.delete(
          session_id
        );
      }


      return res.json({

        success: true
      });

    } catch (error) {

      console.error(
        "Logout error:",
        error
      );

      return res.status(500).json({

        success: false,

        error:
          "Logout failed"
      });
    }
  }
);


/* =========================================================
   404 HANDLER
========================================================= */

app.use(
  (req, res) => {

    res.status(404).json({

      success: false,

      error:
        "KRISHWAVE API route not found",

      path:
        req.path
    });
  }
);


/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "KRISHWAVE server error:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "KRISHWAVE server error"
    });
  }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================================="
    );

    console.log(
      "KRISHWAVE AI BEAST V7.2"
    );

    console.log(
      "RAILWAY BACKEND ONLINE"
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Client ID configured: ${
        CLIENT_ID ? "YES" : "NO"
      }`
    );

    console.log(
      `Redirect URI: ${REDIRECT_URI}`
    );

    console.log(
      `Frontend: ${FRONTEND_ORIGIN}`
    );

    console.log(
      "OAuth: ENABLED"
    );

    console.log(
      "PKCE: ENABLED"
    );

    console.log(
      "Server-side token storage: ENABLED"
    );

    console.log(
      "Authenticated WebSocket OTP: ENABLED"
    );

    console.log(
      "================================================="
    );
  }
); 