/* =========================================================
   KRISHWAVE AI BEAST V7.2
   DERIV OAUTH BACKEND
   RAILWAY SERVER
   ========================================================= */

"use strict";

const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT =
  process.env.PORT || 8080;

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "34khasPjsT0PCRR8X3Z70";

const REDIRECT_URI =
  process.env.REDIRECT_URI ||
  "https://chrispusatale99-dot.github.io/KRISHWAVE/";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  "https://chrispusatale99-dot.github.io";

const DERIV_TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";

const DERIV_API =
  "https://api.derivws.com/trading/v1/options";

const SESSION_TTL =
  55 * 60 * 1000;

app.use(express.json());

/* =========================================================
   CORS
========================================================= */

app.use(
  (req, res, next) => {

    res.setHeader(
      "Access-Control-Allow-Origin",
      FRONTEND_ORIGIN
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

    if (req.method === "OPTIONS") {
      return res
        .status(204)
        .end();
    }

    next();
  }
);

/* =========================================================
   SESSIONS
========================================================= */

const sessions =
  new Map();

function createSession(
  accessToken,
  expiresIn
) {

  const sessionId =
    crypto
      .randomBytes(32)
      .toString("hex");

  const expiry =
    Math.min(
      Number(expiresIn || 3600) * 1000,
      SESSION_TTL
    );

  const expiresAt =
    Date.now() + expiry;

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

function getSession(
  sessionId
) {

  if (!sessionId) {
    return null;
  }

  const session =
    sessions.get(sessionId);

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
   HEALTH
========================================================= */

app.get(
  "/",
  (req, res) => {

    res.json({
      success: true,
      name:
        "KRISHWAVE AI BEAST OAuth Backend",
      version:
        "7.2.0",
      status:
        "online",
      frontend:
        FRONTEND_ORIGIN,
      oauth:
        true
    });

  }
);

/* =========================================================
   CONFIG
========================================================= */

app.get(
  "/api/config",
  (req, res) => {

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
        "online"
    });

  }
);

/* =========================================================
   OAUTH TOKEN EXCHANGE
========================================================= */

app.post(
  "/api/oauth/exchange",
  async (req, res) => {

    try {

      const {
        code,
        code_verifier
      } = req.body || {};

      if (!code) {

        return res
          .status(400)
          .json({
            success: false,
            error:
              "Missing authorization code"
          });

      }

      if (!code_verifier) {

        return res
          .status(400)
          .json({
            success: false,
            error:
              "Missing PKCE code verifier"
          });

      }

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

      const text =
        await response.text();

      let data;

      try {
        data =
          JSON.parse(text);
      } catch {
        data = {
          error: text
        };
      }

      if (!response.ok) {

        console.error(
          "Deriv OAuth error:",
          response.status,
          data
        );

        return res
          .status(response.status)
          .json({
            success: false,
            error:
              data.error_description ||
              data.error ||
              "Deriv OAuth exchange failed"
          });

      }

      if (!data.access_token) {

        return res
          .status(500)
          .json({
            success: false,
            error:
              "Deriv did not return an access token"
          });

      }

      const session =
        createSession(
          data.access_token,
          data.expires_in
        );

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

      return res
        .status(500)
        .json({
          success: false,
          error:
            "KRISHWAVE OAuth backend error"
        });

    }

  }
);

/* =========================================================
   ACCOUNTS
========================================================= */

app.post(
  "/api/accounts",
  async (req, res) => {

    try {

      const {
        session_id
      } = req.body || {};

      const session =
        getSession(
          session_id
        );

      if (!session) {

        return res
          .status(401)
          .json({
            success: false,
            error:
              "Session expired or invalid"
          });

      }

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

      const text =
        await response.text();

      let data;

      try {
        data =
          JSON.parse(text);
      } catch {
        data = {
          error: text
        };
      }

      if (!response.ok) {

        return res
          .status(response.status)
          .json({
            success: false,
            error:
              data.error?.message ||
              data.error_description ||
              data.error ||
              "Unable to get Deriv accounts"
          });

      }

      return res.json({

        success: true,

        accounts:
          data.accounts ||
          data.data ||
          data

      });

    } catch (error) {

      console.error(
        "Accounts error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            "Unable to retrieve Deriv accounts"
        });

    }

  }
);

/* =========================================================
   OTP / AUTHENTICATED WEBSOCKET
========================================================= */

app.post(
  "/api/otp",
  async (req, res) => {

    try {

      const {
        session_id,
        account_id
      } = req.body || {};

      const session =
        getSession(
          session_id
        );

      if (!session) {

        return res
          .status(401)
          .json({
            success: false,
            error:
              "Session expired or invalid"
          });

      }

      if (!account_id) {

        return res
          .status(400)
          .json({
            success: false,
            error:
              "Missing account ID"
          });

      }

      const endpoint =
        `${DERIV_API}/accounts/` +
        `${encodeURIComponent(account_id)}/otp`;

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

      const text =
        await response.text();

      let data;

      try {
        data =
          JSON.parse(text);
      } catch {
        data = {
          error: text
        };
      }

      if (!response.ok) {

        console.error(
          "OTP error:",
          response.status,
          data
        );

        return res
          .status(response.status)
          .json({
            success: false,
            error:
              data.error?.message ||
              data.error_description ||
              data.error ||
              "Unable to create Deriv WebSocket"
          });

      }

      const websocketUrl =
        data.websocket_url ||
        data.url ||
        data.ws_url;

      if (!websocketUrl) {

        return res
          .status(500)
          .json({
            success: false,
            error:
              "Deriv did not return a WebSocket URL"
          });

      }

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

      return res
        .status(500)
        .json({
          success: false,
          error:
            "KRISHWAVE WebSocket authentication error"
        });

    }

  }
);

/* =========================================================
   LOGOUT
========================================================= */

app.post(
  "/api/logout",
  (req, res) => {

    const {
      session_id
    } = req.body || {};

    if (session_id) {
      sessions.delete(
        session_id
      );
    }

    res.json({
      success: true
    });

  }
);

/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {

    res
      .status(404)
      .json({
        success: false,
        error:
          "KRISHWAVE API route not found"
      });

  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "Server error:",
      error
    );

    res
      .status(500)
      .json({
        success: false,
        error:
          "KRISHWAVE server error"
      });

  }
);

/* =========================================================
   CLEAN EXPIRED SESSIONS
========================================================= */

setInterval(
  () => {

    const current =
      Date.now();

    for (
      const [
        id,
        session
      ] of sessions
    ) {

      if (
        current >=
        session.expiresAt
      ) {
        sessions.delete(id);
      }

    }

  },
  60 * 1000
);

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "KRISHWAVE AI BEAST V7.2 backend running on port " +
      PORT
    );

    console.log(
      "Frontend:",
      FRONTEND_ORIGIN
    );

    console.log(
      "OAuth client:",
      CLIENT_ID
    );

  }
);